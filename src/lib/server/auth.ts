import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { genericOAuth, jwt } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { getRequestEvent } from '$app/server';
import { building } from '$app/env';
import {
	BETTER_AUTH_SECRET,
	OIDC_CLIENT_ID,
	OIDC_CLIENT_SECRET,
	OIDC_ISSUER,
	ORIGIN
} from '$app/env/private';
import {
	OIDC_PROVIDER_ID,
	OIDC_SCOPES,
	oidcDiscoveryUrl,
	validateApplicationOrigin,
	validateOidcIssuer,
	withoutProviderTokens
} from '#lib/oidc-policy.js';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { MCP_SCOPES } from './mcp/scopes.js';
import { withInferredApplicationType } from './oauth-registration.js';

function requiredEnvironment(name: string, value: string | undefined, buildPlaceholder: string) {
	if (value) return value;
	if (building) return buildPlaceholder;
	throw new Error(`${name} ist nicht gesetzt.`);
}

const secret = requiredEnvironment(
	'BETTER_AUTH_SECRET',
	BETTER_AUTH_SECRET,
	'build-time-placeholder-secret-not-used-at-runtime'
);
export const authBaseURL = validateApplicationOrigin(
	requiredEnvironment('ORIGIN', ORIGIN, 'http://localhost:5173')
);
const oidcIssuer = validateOidcIssuer(
	requiredEnvironment('OIDC_ISSUER', OIDC_ISSUER, 'https://oidc.invalid')
);

/** The MCP endpoint's protected resource identifier (RFC 8707 / RFC 9728); tokens carry it as `aud`. */
export const MCP_RESOURCE = `${authBaseURL}/mcp`;

/** Scopes MCP clients may request: identity, refresh tokens (`offline_access`) and tool access. */
export const OAUTH_SCOPES = [
	'openid',
	'profile',
	'email',
	'offline_access',
	...Object.keys(MCP_SCOPES)
];

function createAuth() {
	return betterAuth({
		secret,
		baseURL: authBaseURL,
		database: drizzleAdapter(db, { provider: 'pg', schema }),
		trustedOrigins: [authBaseURL],
		advanced: { useSecureCookies: new URL(authBaseURL).protocol === 'https:' },
		emailAndPassword: { enabled: false },
		session: {
			expiresIn: 7 * 24 * 60 * 60,
			disableSessionRefresh: true,
			cookieCache: { enabled: false },
			additionalFields: {
				lastActiveAt: {
					type: 'date',
					required: false,
					input: false,
					returned: false
				}
			}
		},
		account: {
			updateAccountOnSignIn: true,
			accountLinking: {
				enabled: false,
				disableImplicitLinking: true
			}
		},
		databaseHooks: {
			account: {
				create: { before: async (account) => ({ data: withoutProviderTokens(account) }) },
				update: { before: async (account) => ({ data: withoutProviderTokens(account) }) }
			},
			session: {
				create: {
					before: async (session) => ({ data: { ...session, lastActiveAt: new Date() } })
				}
			}
		},
		onAPIError: { errorURL: `${authBaseURL}/login` },
		// The OAuth provider issues tokens at /oauth2/token; the JWT plugin's session-token route is unused.
		disabledPaths: ['/token'],
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== '/oauth2/register' || !ctx.body) return;
				return { context: { body: withInferredApplicationType(ctx.body) } };
			})
		},
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: OIDC_PROVIDER_ID,
						discoveryUrl: oidcDiscoveryUrl(oidcIssuer),
						requireIdTokenVerification: true,
						clientId: requiredEnvironment('OIDC_CLIENT_ID', OIDC_CLIENT_ID, 'build-client'),
						clientSecret: requiredEnvironment(
							'OIDC_CLIENT_SECRET',
							OIDC_CLIENT_SECRET,
							'build-secret'
						),
						scopes: [...OIDC_SCOPES]
					}
				]
			}),
			jwt(),
			// OAuth 2.1 authorization server for MCP clients: authorization code with PKCE, rotating
			// refresh tokens, audience-bound JWT access tokens, and RFC 8414 / RFC 9728 discovery.
			mcp({
				loginPage: '/login',
				consentPage: '/consent',
				resource: MCP_RESOURCE,
				scopes: OAUTH_SCOPES,
				clientRegistrationDefaultScopes: OAUTH_SCOPES,
				// Access tokens are stateless JWTs; a short lifetime bounds access after a revoke.
				accessTokenExpiresIn: 15 * 60,
				// Dynamic Client Registration for clients that predate Client ID Metadata Documents.
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true
			}),
			cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
			// Must stay last.
			sveltekitCookies(getRequestEvent)
		]
	});
}

type Auth = ReturnType<typeof createAuth>;

/**
 * Better Auth initializes eagerly (provider discovery, OAuth resource seeding in the database), so
 * it is created by `initAuth` from the server `init` hook, after migrations have run, never at
 * import time (which also happens during `vite build`, without runtime configuration).
 */
export let auth: Auth;

export async function initAuth(): Promise<void> {
	auth = createAuth();
	// The OIDC discovery document is read once. Refuse to start rather than serve a login that
	// can never work, so the platform restarts the app until the identity provider is reachable.
	const context = await auth.$context;
	if (!context.socialProviders.some((provider) => provider.id === OIDC_PROVIDER_ID)) {
		throw new Error('OIDC-Discovery fehlgeschlagen; prüfe OIDC_ISSUER und die Erreichbarkeit.');
	}
}

export type AuthSession = Auth['$Infer']['Session'];
