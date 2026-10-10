import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { isAuthApiRequest, safeReturnTo } from '#lib/oidc-policy.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { isSessionExpired, shouldTouchSession } from '#lib/session-policy.js';
import { auth, authBaseURL, initAuth } from '#lib/server/auth.js';
import {
	clearSessionCookies,
	deleteStoredSession,
	getStoredSession,
	touchStoredSession
} from '#lib/server/auth-session.js';
import { isForbiddenCrossSiteForm } from '#lib/server/csrf.js';
import { runMigrations } from '#lib/server/db/migrate.js';

/**
 * Apply pending database migrations once, then start Better Auth (which reads the OIDC
 * discovery document and seeds the OAuth resource), before the server handles requests.
 */
export async function init() {
	try {
		await runMigrations();
	} catch (error) {
		console.error('Datenbankmigration beim Start fehlgeschlagen', error);
		throw error;
	}
	await initAuth();
}

/**
 * SvelteKit's own CSRF check is disabled in vite.config.ts because it rejects the OAuth token
 * requests of MCP clients (form posts without an Origin header). This is the same check minus
 * Better Auth's routes, which apply their own origin checks.
 */
const handleCsrf: Handle = ({ event, resolve }) => {
	if (isForbiddenCrossSiteForm(event.request, event.url)) {
		return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
	}
	return resolve(event);
};

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
	const isWebhook = pathname.startsWith('/api/webhooks/resend/');
	// OAuth discovery (RFC 8414, RFC 9728, OpenID) lives at the origin root, outside /api/auth.
	if (pathname.startsWith('/.well-known/') && !building) return auth.handler(event.request);
	// The MCP endpoint verifies its own OAuth access tokens.
	if (pathname === '/mcp') return resolve(event);
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
	// A signed query means an MCP client's authorization sent the user here; sign-in resumes it.
	if (event.locals.user && pathname === '/login' && !event.url.searchParams.has('sig')) {
		redirect(302, safeReturnTo(event.url.searchParams.get('returnTo')));
	}

	return resolve(event);
};

export const handle: Handle = sequence(handleCsrf, handleParaglide, handleAuth);
