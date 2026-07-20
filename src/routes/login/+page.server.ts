import { fail, redirect } from '@sveltejs/kit';
import {
	OIDC_CALLBACK_PATH,
	OIDC_NONCE_COOKIE_NAME,
	OIDC_NONCE_MAX_AGE_SECONDS,
	OIDC_PROVIDER_ID
} from '$lib/oidc-policy';
import { auth, authBaseURL, prepareOidcProvider } from '$lib/server/auth';
import { createOidcNonce } from '$lib/server/oidc';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	providerError: url.searchParams.has('error')
});

export const actions: Actions = {
	oidc: async ({ request, cookies }) => {
		let authorizationUrl: string;
		try {
			await prepareOidcProvider();
			const nonce = createOidcNonce();
			const result = await auth.api.signInWithOAuth2({
				headers: request.headers,
				body: {
					providerId: OIDC_PROVIDER_ID,
					callbackURL: '/',
					errorCallbackURL: '/login',
					additionalData: { nonce }
				}
			});
			cookies.set(OIDC_NONCE_COOKIE_NAME, nonce, {
				httpOnly: true,
				secure: new URL(authBaseURL).protocol === 'https:',
				sameSite: 'lax',
				path: OIDC_CALLBACK_PATH,
				maxAge: OIDC_NONCE_MAX_AGE_SECONDS
			});
			authorizationUrl = result.url;
		} catch (error) {
			console.error('OIDC-Anmeldung konnte nicht gestartet werden', error);
			return fail(503, {
				error: 'Der Anmeldedienst ist gerade nicht erreichbar. Bitte versuche es erneut.'
			});
		}

		redirect(303, authorizationUrl);
	}
};
