export const OIDC_PROVIDER_ID = 'oidc';
export const OIDC_CALLBACK_PATH = `/api/auth/callback/${OIDC_PROVIDER_ID}`;
export const OIDC_SCOPES = ['openid', 'profile', 'email'] as const;

/** Better Auth endpoints the app exposes: OIDC sign-in start, provider callback, and sign-out. */
const AUTH_API_ROUTES = new Set([
	'POST /api/auth/sign-in/social',
	`GET ${OIDC_CALLBACK_PATH}`,
	'POST /api/auth/sign-out'
]);

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

export function isAuthApiRequest(method: string, pathname: string): boolean {
	return AUTH_API_ROUTES.has(`${method} ${pathname}`);
}

export function oidcDiscoveryUrl(issuer: string): string {
	return `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
}

/** Same-origin app path to resume after login; anything else falls back to the start page. */
export function safeReturnTo(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
		return '/';
	}
	const url = new URL(value, 'http://return-to.invalid');
	if (url.origin !== 'http://return-to.invalid') return '/';
	if (url.pathname === '/login' || url.pathname.startsWith('/api/auth')) return '/';
	return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Strip provider access and refresh tokens before persisting an account. The ID token is kept
 * because Better Auth sends it as `id_token_hint` during RP-initiated logout.
 */
export function withoutProviderTokens<T extends Record<string, unknown>>(account: T) {
	const sanitized: Record<string, unknown> = { ...account };
	delete sanitized.raw;

	return {
		...sanitized,
		accessToken: null,
		refreshToken: null,
		accessTokenExpiresAt: null,
		refreshTokenExpiresAt: null,
		scope: null
	};
}
