import { redirect } from '@sveltejs/kit';
import {
	clearSessionCookies,
	deleteStoredSession,
	getStoredSession
} from '$lib/server/auth-session';
import { authBaseURL } from '$lib/server/auth';
import { getOidcDiscovery } from '$lib/server/oidc';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.session) redirect(303, '/login');

	const stored = await getStoredSession(locals.session.id);
	await deleteStoredSession(locals.session.id);
	clearSessionCookies(cookies);

	let providerLogoutUrl: string;
	try {
		const discovery = await getOidcDiscovery();
		const logoutUrl = new URL(discovery.endSessionEndpoint);
		if (stored?.idTokenHint) logoutUrl.searchParams.set('id_token_hint', stored.idTokenHint);
		logoutUrl.searchParams.set(
			'post_logout_redirect_uri',
			new URL('/login', authBaseURL).toString()
		);
		providerLogoutUrl = logoutUrl.toString();
	} catch (error) {
		console.error('OIDC-Abmeldung konnte nicht abgeschlossen werden', error);
		redirect(303, '/login');
	}

	redirect(303, providerLogoutUrl);
};
