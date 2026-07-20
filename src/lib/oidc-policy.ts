export const OIDC_PROVIDER_ID = 'oidc';
export const OIDC_CALLBACK_PATH = `/api/auth/oauth2/callback/${OIDC_PROVIDER_ID}`;
export const OIDC_CALLBACK_ROUTE = '/oauth2/callback/:providerId';
export const OIDC_NONCE_COOKIE_NAME = 'jobstrian.oidc_nonce';
export const OIDC_NONCE_MAX_AGE_SECONDS = 10 * 60;
export const OIDC_SCOPES = ['openid', 'profile', 'email'] as const;

interface AuthEndpointContext {
	path?: string;
	params?: Record<string, string | undefined>;
}

function isLoopbackHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/\.$/, '');
	return (
		normalized === 'localhost' ||
		normalized.endsWith('.localhost') ||
		normalized === '[::1]' ||
		normalized === '::1' ||
		/^127(?:\.\d{1,3}){3}$/.test(normalized)
	);
}

function secureHttpUrl(value: string, label: string): URL {
	if (value !== value.trim()) {
		throw new Error(`${label} must not contain leading or trailing whitespace.`);
	}
	if (value.includes('\\')) {
		throw new Error(`${label} must not contain backslashes.`);
	}
	if (!/^https?:\/\//i.test(value)) {
		throw new Error(`${label} must be an absolute HTTP(S) URL.`);
	}
	const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0];
	if (authority.includes('@')) {
		throw new Error(`${label} must not contain an @ sign in its authority.`);
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be an absolute HTTP(S) URL.`);
	}

	if (url.username || url.password) {
		throw new Error(`${label} must not contain credentials.`);
	}
	if (url.protocol === 'https:') return url;
	if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) return url;
	throw new Error(`${label} must use HTTPS outside loopback development.`);
}

export function validateApplicationOrigin(value: string): string {
	const url = secureHttpUrl(value, 'ORIGIN');
	if (url.pathname !== '/' || url.search || url.hash) {
		throw new Error('ORIGIN must contain only a scheme, host, and optional port.');
	}
	return url.origin;
}

export function validateOidcIssuer(value: string): string {
	const url = secureHttpUrl(value, 'OIDC_ISSUER');
	if (url.search || url.hash) {
		throw new Error('OIDC_ISSUER must not contain a query string or fragment.');
	}
	return value;
}

export function isOidcCallbackContext(
	context: AuthEndpointContext | null
): context is AuthEndpointContext {
	return context?.path === OIDC_CALLBACK_ROUTE && context.params?.providerId === OIDC_PROVIDER_ID;
}

export function isOidcCallbackRequest(method: string, pathname: string): boolean {
	return method === 'GET' && pathname === OIDC_CALLBACK_PATH;
}

export interface OidcDiscovery {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	userInfoEndpoint: string;
	jwksUri: string;
	endSessionEndpoint: string;
}

export function oidcDiscoveryUrl(issuer: string): string {
	return `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
}

function requiredString(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`OIDC discovery is missing ${key}.`);
	}

	secureHttpUrl(value, `OIDC discovery ${key}`);
	return value;
}

export function parseOidcDiscovery(value: unknown, expectedIssuer: string): OidcDiscovery {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('OIDC discovery returned an invalid document.');
	}

	const record = value as Record<string, unknown>;
	const issuer = requiredString(record, 'issuer');
	if (issuer !== expectedIssuer) {
		throw new Error('OIDC discovery issuer does not match OIDC_ISSUER.');
	}

	return {
		issuer,
		authorizationEndpoint: requiredString(record, 'authorization_endpoint'),
		tokenEndpoint: requiredString(record, 'token_endpoint'),
		userInfoEndpoint: requiredString(record, 'userinfo_endpoint'),
		jwksUri: requiredString(record, 'jwks_uri'),
		endSessionEndpoint: requiredString(record, 'end_session_endpoint')
	};
}

interface OidcIdTokenClaims {
	sub?: unknown;
	iat?: unknown;
	exp?: unknown;
	nonce?: unknown;
	aud?: unknown;
	azp?: unknown;
}

export function validatedOidcSubject(
	payload: OidcIdTokenClaims,
	expectedNonce: string,
	clientId: string
): string {
	if (
		typeof payload.sub !== 'string' ||
		payload.sub.length === 0 ||
		typeof payload.iat !== 'number' ||
		typeof payload.exp !== 'number' ||
		payload.nonce !== expectedNonce
	) {
		throw new Error('OIDC ID token claims are invalid.');
	}
	if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) {
		throw new Error('OIDC ID token authorized party is invalid.');
	}

	return payload.sub;
}

export function withoutProviderTokens<T extends Record<string, unknown>>(account: T) {
	const sanitized: Record<string, unknown> = { ...account };
	delete sanitized.raw;

	return {
		...sanitized,
		accessToken: null,
		refreshToken: null,
		idToken: null,
		accessTokenExpiresAt: null,
		refreshTokenExpiresAt: null,
		scope: null
	};
}
