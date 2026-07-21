import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { genericOAuth, type GenericOAuthConfig } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
	OIDC_PROVIDER_ID,
	OIDC_SCOPES,
	isOidcCallbackContext,
	validateApplicationOrigin,
	withoutProviderTokens
} from '$lib/oidc-policy';
import { db } from './db';
import * as schema from './db/schema';
import {
	exchangeOidcCode,
	getOidcDiscovery,
	getOidcUserInfo,
	oidcClientId,
	oidcClientSecret,
	oidcDiscoveryEndpoint,
	oidcIssuer
} from './oidc';

function requiredEnvironment(name: string, buildPlaceholder: string): string {
	const value = env[name];
	if (value) return value;
	if (building) return buildPlaceholder;
	throw new Error(`${name} ist nicht gesetzt.`);
}

const secret = requiredEnvironment(
	'BETTER_AUTH_SECRET',
	'build-time-placeholder-secret-not-used-at-runtime'
);
export const authBaseURL = validateApplicationOrigin(
	requiredEnvironment('ORIGIN', 'http://localhost:5173')
);
const pendingIdTokenHints = new WeakMap<object, string>();

function stripProviderTokens(
	data: Record<string, unknown>,
	context: { path?: string; params?: Record<string, string | undefined> } | null
) {
	if (isOidcCallbackContext(context)) {
		if (typeof data.idToken !== 'string' || data.idToken.length === 0) {
			throw new APIError('BAD_REQUEST', {
				message: 'OIDC token response did not include an ID token'
			});
		}
		pendingIdTokenHints.set(context, data.idToken);
	}

	return { data: withoutProviderTokens(data) };
}

const oidcProviderConfig: GenericOAuthConfig = {
	providerId: OIDC_PROVIDER_ID,
	discoveryUrl: oidcDiscoveryEndpoint,
	issuer: oidcIssuer,
	clientId: oidcClientId,
	clientSecret: oidcClientSecret,
	authentication: 'post',
	responseType: 'code',
	responseMode: 'query',
	pkce: true,
	scopes: [...OIDC_SCOPES],
	authorizationUrlParams: (context) => {
		const nonce = context.body?.additionalData?.nonce;
		if (typeof nonce !== 'string' || nonce.length === 0) {
			throw new APIError('BAD_REQUEST', { message: 'OIDC login nonce is missing' });
		}
		return { nonce };
	},
	getToken: exchangeOidcCode,
	getUserInfo: getOidcUserInfo
};

/** Pin this process to the validated discovery endpoints before either OIDC request leg. */
export async function prepareOidcProvider(): Promise<void> {
	if (!oidcProviderConfig.discoveryUrl) return;
	const discovery = await getOidcDiscovery();
	oidcProviderConfig.authorizationUrl = discovery.authorizationEndpoint;
	oidcProviderConfig.tokenUrl = discovery.tokenEndpoint;
	oidcProviderConfig.userInfoUrl = discovery.userInfoEndpoint;
	delete oidcProviderConfig.discoveryUrl;
}

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
	session: {
		expiresIn: 7 * 24 * 60 * 60,
		disableSessionRefresh: true,
		cookieCache: { enabled: false },
		additionalFields: {
			lastActiveAt: {
				type: 'date',
				fieldName: 'last_active_at',
				required: false,
				input: false,
				returned: false
			},
			idTokenHint: {
				type: 'string',
				fieldName: 'id_token_hint',
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
			create: {
				before: async (account, context) => stripProviderTokens(account, context)
			},
			update: {
				before: async (account, context) => stripProviderTokens(account, context)
			}
		},
		session: {
			create: {
				before: async (session, context) => {
					const idTokenHint = context ? pendingIdTokenHints.get(context) : undefined;
					if (context) pendingIdTokenHints.delete(context);
					if (isOidcCallbackContext(context) && !idTokenHint) {
						throw new APIError('BAD_REQUEST', { message: 'OIDC login state expired' });
					}

					return {
						data: {
							...session,
							lastActiveAt: new Date(),
							idTokenHint: idTokenHint ?? null
						}
					};
				}
			}
		}
	},
	onAPIError: { errorURL: `${authBaseURL}/login` },
	plugins: [
		genericOAuth({
			config: [oidcProviderConfig]
		}),
		sveltekitCookies(getRequestEvent)
	]
});

export type AuthSession = typeof auth.$Infer.Session;
