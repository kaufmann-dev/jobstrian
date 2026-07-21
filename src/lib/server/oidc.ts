import { randomBytes } from 'node:crypto';
import { getRequestEvent } from '$app/server';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
	validateAuthorizationCode,
	validateToken,
	type OAuth2Tokens,
	type OAuth2UserInfo
} from 'better-auth/oauth2';
import { z } from 'zod';
import {
	OIDC_CALLBACK_PATH,
	OIDC_NONCE_COOKIE_NAME,
	oidcDiscoveryUrl,
	parseOidcDiscovery,
	validateOidcIssuer,
	validatedOidcSubject,
	type OidcDiscovery
} from '$lib/oidc-policy';

const oidcUserInfoSchema = z.object({
	sub: z.string().min(1),
	email: z.email(),
	email_verified: z.boolean().optional(),
	name: z.string().min(1).optional(),
	preferred_username: z.string().min(1).optional(),
	picture: z.string().min(1).optional()
});

function requiredEnvironment(name: string, buildPlaceholder: string): string {
	const value = env[name];
	if (value) return value;
	if (building) return buildPlaceholder;
	throw new Error(`${name} ist nicht gesetzt.`);
}

export const oidcIssuer = validateOidcIssuer(
	requiredEnvironment('OIDC_ISSUER', 'https://oidc.invalid')
);
export const oidcClientId = requiredEnvironment('OIDC_CLIENT_ID', 'build-client');
export const oidcClientSecret = requiredEnvironment('OIDC_CLIENT_SECRET', 'build-secret');
export const oidcDiscoveryEndpoint = oidcDiscoveryUrl(oidcIssuer);

let cachedDiscovery: OidcDiscovery | undefined;
const verifiedIdTokenSubjects = new WeakMap<OAuth2Tokens, string>();

export function createOidcNonce(): string {
	return randomBytes(32).toString('base64url');
}

export async function getOidcDiscovery(): Promise<OidcDiscovery> {
	if (cachedDiscovery) return cachedDiscovery;

	const response = await fetch(oidcDiscoveryEndpoint, {
		headers: { accept: 'application/json' },
		cache: 'no-store',
		signal: AbortSignal.timeout(5_000)
	});
	if (!response.ok) {
		throw new Error(`OIDC discovery failed with HTTP ${response.status}.`);
	}

	cachedDiscovery = parseOidcDiscovery(await response.json(), oidcIssuer);
	return cachedDiscovery;
}

interface OidcCodeExchange {
	code: string;
	redirectURI: string;
	codeVerifier?: string;
}

export async function exchangeOidcCode({
	code,
	redirectURI,
	codeVerifier
}: OidcCodeExchange): Promise<OAuth2Tokens> {
	const { cookies } = getRequestEvent();
	const nonce = cookies.get(OIDC_NONCE_COOKIE_NAME);
	cookies.delete(OIDC_NONCE_COOKIE_NAME, { path: OIDC_CALLBACK_PATH });
	if (!nonce) throw new Error('OIDC login nonce is missing or expired.');

	const discovery = await getOidcDiscovery();
	const tokens = await validateAuthorizationCode({
		code,
		codeVerifier,
		redirectURI,
		options: { clientId: oidcClientId, clientSecret: oidcClientSecret },
		tokenEndpoint: discovery.tokenEndpoint,
		authentication: 'post'
	});
	if (!tokens.idToken) throw new Error('OIDC token response did not include an ID token.');

	const { payload } = await validateToken(tokens.idToken, discovery.jwksUri, {
		audience: oidcClientId,
		issuer: oidcIssuer
	});
	verifiedIdTokenSubjects.set(tokens, validatedOidcSubject(payload, nonce, oidcClientId));
	return tokens;
}

export async function getOidcUserInfo(tokens: OAuth2Tokens): Promise<OAuth2UserInfo | null> {
	if (!tokens.accessToken) return null;
	const idTokenSubject = verifiedIdTokenSubjects.get(tokens);
	verifiedIdTokenSubjects.delete(tokens);
	if (!idTokenSubject) return null;

	const discovery = await getOidcDiscovery();
	const response = await fetch(discovery.userInfoEndpoint, {
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${tokens.accessToken}`
		},
		cache: 'no-store',
		signal: AbortSignal.timeout(5_000)
	});
	if (!response.ok) return null;

	const parsed = oidcUserInfoSchema.safeParse(await response.json());
	if (!parsed.success) return null;
	const profile = parsed.data;
	if (profile.sub !== idTokenSubject) return null;

	return {
		id: profile.sub,
		name: profile.name ?? profile.preferred_username ?? profile.email,
		email: profile.email,
		emailVerified: profile.email_verified ?? false,
		image: profile.picture
	};
}
