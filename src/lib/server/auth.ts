import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
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

export const auth = betterAuth({
	secret,
	baseURL: authBaseURL,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification
		}
	}),
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
		sveltekitCookies(getRequestEvent)
	]
});

export type AuthSession = typeof auth.$Infer.Session;
