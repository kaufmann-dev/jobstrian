import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { isAuthApiRequest, safeReturnTo } from '#lib/oidc-policy.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { isSessionExpired, shouldTouchSession } from '#lib/session-policy.js';
import { auth, authBaseURL } from '#lib/server/auth.js';
import {
	clearSessionCookies,
	deleteStoredSession,
	getStoredSession,
	touchStoredSession
} from '#lib/server/auth-session.js';
import { runMigrations } from '#lib/server/db/migrate.js';

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
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		)
	);

/** Populate locals with the current session/user and guard protected routes. */
const handleAuth: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isAuthApi = pathname.startsWith('/api/auth');
	const isWebhook = pathname === '/api/webhooks/resend';
	if (isAuthApi) {
		if (!isAuthApiRequest(event.request.method, pathname)) {
			return new Response('Nicht gefunden', { status: 404 });
		}
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
		const returnTo = `${pathname}${event.url.search}`;
		redirect(302, returnTo === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`);
	}
	if (event.locals.user && pathname === '/login') {
		redirect(302, safeReturnTo(event.url.searchParams.get('returnTo')));
	}

	return resolve(event);
};

export const handle: Handle = sequence(handleParaglide, handleAuth);
