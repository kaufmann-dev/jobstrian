import { describe, expect, it } from 'vitest';
import {
	isAuthApiRequest,
	oidcDiscoveryUrl,
	safeReturnTo,
	validateApplicationOrigin,
	validateOidcIssuer,
	withoutProviderTokens
} from './oidc-policy.js';

const issuer = 'https://identity.example.com/realms/admins';

describe('OIDC discovery policy', () => {
	it('exposes only the OIDC sign-in, callback, and sign-out auth endpoints', () => {
		expect(isAuthApiRequest('POST', '/api/auth/sign-in/social')).toBe(true);
		expect(isAuthApiRequest('GET', '/api/auth/callback/oidc')).toBe(true);
		expect(isAuthApiRequest('POST', '/api/auth/sign-out')).toBe(true);
		expect(isAuthApiRequest('POST', '/api/auth/callback/oidc')).toBe(false);
		expect(isAuthApiRequest('GET', '/api/auth/callback/other')).toBe(false);
		expect(isAuthApiRequest('POST', '/api/auth/sign-up/email')).toBe(false);
		expect(isAuthApiRequest('GET', '/api/auth/get-session')).toBe(false);
	});

	it('keeps only same-origin return destinations outside the auth flow', () => {
		expect(safeReturnTo('/jobs?page=2#top')).toBe('/jobs?page=2#top');
		expect(safeReturnTo(null)).toBe('/');
		expect(safeReturnTo('https://evil.example.com/')).toBe('/');
		expect(safeReturnTo('//evil.example.com/')).toBe('/');
		expect(safeReturnTo('/\\evil.example.com/')).toBe('/');
		expect(safeReturnTo('/login?returnTo=/jobs')).toBe('/');
		expect(safeReturnTo('/api/auth/sign-out')).toBe('/');
	});

	it('builds the discovery URL from issuers with or without a trailing slash', () => {
		expect(oidcDiscoveryUrl(issuer)).toBe(
			'https://identity.example.com/realms/admins/.well-known/openid-configuration'
		);
		expect(oidcDiscoveryUrl(`${issuer}/`)).toBe(
			'https://identity.example.com/realms/admins/.well-known/openid-configuration'
		);
	});

	it('requires HTTPS except for loopback development URLs', () => {
		expect(validateApplicationOrigin('https://jobstrian.example.com')).toBe(
			'https://jobstrian.example.com'
		);
		expect(validateApplicationOrigin('http://localhost:5173')).toBe('http://localhost:5173');
		expect(validateOidcIssuer('http://127.0.0.1:8080/realms/admins')).toBe(
			'http://127.0.0.1:8080/realms/admins'
		);
		expect(() => validateApplicationOrigin('http://jobstrian.example.com')).toThrow('HTTPS');
		expect(() => validateOidcIssuer('http://identity.example.com/realms/admins')).toThrow('HTTPS');
		expect(() => validateApplicationOrigin('https://jobstrian.example.com/app')).toThrow(
			'only a scheme'
		);
		expect(() => validateOidcIssuer('https://identity.example.com/realms/admins?tenant=1')).toThrow(
			'query string'
		);
		expect(() => validateApplicationOrigin('https:\\jobstrian.example.com')).toThrow('backslashes');
		expect(() => validateApplicationOrigin('https://@jobstrian.example.com')).toThrow('@ sign');
		expect(() => validateOidcIssuer('https:\\identity.example.com/realms/admins')).toThrow(
			'backslashes'
		);
		expect(() => validateOidcIssuer('https://@identity.example.com/realms/admins')).toThrow(
			'@ sign'
		);
	});

	it('removes provider access tokens but keeps the ID token for RP-initiated logout', () => {
		expect(
			withoutProviderTokens({
				providerId: 'oidc',
				accountId: 'subject-1',
				accessToken: 'access',
				refreshToken: 'refresh',
				idToken: 'id-token',
				accessTokenExpiresAt: new Date(),
				refreshTokenExpiresAt: new Date(),
				scope: 'openid profile email',
				raw: { access_token: 'access', id_token: 'id-token', refresh_token: 'refresh' }
			})
		).toMatchObject({
			providerId: 'oidc',
			accountId: 'subject-1',
			accessToken: null,
			refreshToken: null,
			idToken: 'id-token',
			accessTokenExpiresAt: null,
			refreshTokenExpiresAt: null,
			scope: null
		});
		expect(
			withoutProviderTokens({ raw: { access_token: 'access' }, providerId: 'oidc' })
		).not.toHaveProperty('raw');
	});
});
