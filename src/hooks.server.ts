import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { isOidcCallbackRequest } from '$lib/oidc-policy';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { isSessionExpired, shouldTouchSession } from '$lib/session-policy';
import { auth, authBaseURL, prepareOidcProvider } from '$lib/server/auth';
import {
	clearSessionCookies,
	deleteStoredSession,
	getStoredSession,
	touchStoredSession
} from '$lib/server/auth-session';
import { runMigrations } from '$lib/server/db/migrate';

/** Apply pending database migrations once, before the server handles requests. */
export async function init() {
	try {
		await runMigrations();
	} catch (error) {
		console.error('Datenbankmigration beim Start fehlgeschlagen', error);
		throw error;
	}
}

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

/** Populate locals with the current session/user and guard protected routes. */
const handleAuth: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isAuthApi = pathname.startsWith('/api/auth');
	const isWebhook = pathname === '/api/webhooks/resend';
	if (isAuthApi) {
		if (!isOidcCallbackRequest(event.request.method, pathname)) {
			return new Response('Nicht gefunden', { status: 404 });
		}
		await prepareOidcProvider();
		return svelteKitHandler({ event, resolve, auth, building });
	}
	if (isWebhook) return resolve(event);

	const current = await auth.api.getSession({
		headers: event.request.headers,
		query: { disableRefresh: true }
	});
	event.locals.session = null;
	event.locals.user = null;

	if (current) {
		const stored = await getStoredSession(current.session.id);
		if (!stored || isSessionExpired(stored)) {
			if (stored) await deleteStoredSession(stored.id);
			clearSessionCookies(event.cookies);
		} else {
			event.locals.session = current.session;
			event.locals.user = current.user;
			if (shouldTouchSession(event.request, pathname, authBaseURL)) {
				await touchStoredSession(stored.id, new Date());
			}
		}
	}

	const isPublic = pathname === '/login';
	if (!event.locals.user && !isPublic) {
		redirect(302, '/login');
	}
	if (event.locals.user && pathname === '/login') {
		redirect(302, '/');
	}

	return resolve(event);
};

export const handle: Handle = sequence(handleParaglide, handleAuth);
