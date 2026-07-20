import { describe, expect, it } from 'vitest';
import {
	OIDC_CALLBACK_ROUTE,
	isOidcCallbackContext,
	isOidcCallbackRequest,
	oidcDiscoveryUrl,
	parseOidcDiscovery,
	validateApplicationOrigin,
	validateOidcIssuer,
	validatedOidcSubject,
	withoutProviderTokens
} from './oidc-policy';

const issuer = 'https://identity.example.com/realms/admins';

describe('OIDC discovery policy', () => {
	it('recognizes only the configured provider callback context', () => {
		expect(
			isOidcCallbackContext({
				path: OIDC_CALLBACK_ROUTE,
				params: { providerId: 'oidc' }
			})
		).toBe(true);
		expect(
			isOidcCallbackContext({
				path: OIDC_CALLBACK_ROUTE,
				params: { providerId: 'other' }
			})
		).toBe(false);
		expect(
			isOidcCallbackContext({
				path: '/api/auth/oauth2/callback/oidc',
				params: { providerId: 'oidc' }
			})
		).toBe(false);
		expect(isOidcCallbackRequest('GET', '/api/auth/oauth2/callback/oidc')).toBe(true);
		expect(isOidcCallbackRequest('POST', '/api/auth/oauth2/callback/oidc')).toBe(false);
		expect(isOidcCallbackRequest('GET', '/api/auth/get-session')).toBe(false);
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

	it('accepts a complete discovery document with the exact configured issuer', () => {
		expect(
			parseOidcDiscovery(
				{
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					userinfo_endpoint: `${issuer}/userinfo`,
					jwks_uri: `${issuer}/jwks`,
					end_session_endpoint: `${issuer}/logout`
				},
				issuer
			)
		).toEqual({
			issuer,
			authorizationEndpoint: `${issuer}/authorize`,
			tokenEndpoint: `${issuer}/token`,
			userInfoEndpoint: `${issuer}/userinfo`,
			jwksUri: `${issuer}/jwks`,
			endSessionEndpoint: `${issuer}/logout`
		});
	});

	it('rejects issuer substitution and discovery without RP logout', () => {
		expect(() =>
			parseOidcDiscovery(
				{
					issuer: 'https://attacker.example.com',
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					userinfo_endpoint: `${issuer}/userinfo`,
					jwks_uri: `${issuer}/jwks`,
					end_session_endpoint: `${issuer}/logout`
				},
				issuer
			)
		).toThrow('does not match');

		expect(() =>
			parseOidcDiscovery(
				{
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					userinfo_endpoint: `${issuer}/userinfo`,
					jwks_uri: `${issuer}/jwks`
				},
				issuer
			)
		).toThrow('end_session_endpoint');

		expect(() =>
			parseOidcDiscovery(
				{
					issuer,
					authorization_endpoint: 'http://identity.example.com/authorize',
					token_endpoint: `${issuer}/token`,
					userinfo_endpoint: `${issuer}/userinfo`,
					jwks_uri: `${issuer}/jwks`,
					end_session_endpoint: `${issuer}/logout`
				},
				issuer
			)
		).toThrow('HTTPS');
	});

	it('requires a complete nonce-bound ID token claim set', () => {
		const claims = {
			sub: 'subject-1',
			iat: 1_700_000_000,
			exp: 1_700_000_600,
			nonce: 'expected',
			aud: ['jobstrian', 'another-audience'],
			azp: 'jobstrian'
		};
		expect(validatedOidcSubject(claims, 'expected', 'jobstrian')).toBe('subject-1');
		expect(() =>
			validatedOidcSubject({ ...claims, nonce: 'other' }, 'expected', 'jobstrian')
		).toThrow('claims are invalid');
		expect(() =>
			validatedOidcSubject({ ...claims, azp: 'another-client' }, 'expected', 'jobstrian')
		).toThrow('authorized party');
	});

	it('removes every provider token while preserving account identity', () => {
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
			idToken: null,
			accessTokenExpiresAt: null,
			refreshTokenExpiresAt: null,
			scope: null
		});
		expect(
			withoutProviderTokens({ raw: { access_token: 'access' }, providerId: 'oidc' })
		).not.toHaveProperty('raw');
	});
});
