import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { auth } from '$lib/server/auth';
import { runMigrations } from '$lib/server/db/migrate';
import { hasAnyUser } from '$lib/server/users';

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
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;

	const { pathname } = event.url;
	const hasUser = await hasAnyUser();
	// Single-user tool: after setup, the Better Auth sign-up endpoint must not
	// allow anyone to self-register a second account.
	if (hasUser && pathname.startsWith('/api/auth/sign-up')) {
		return new Response(JSON.stringify({ message: 'Die Registrierung ist deaktiviert.' }), {
			status: 403,
			headers: { 'content-type': 'application/json' }
		});
	}
	const isAuthApi = pathname.startsWith('/api/auth');
	const isWebhook = pathname === '/api/webhooks/resend';
	const isPublic = pathname === '/login' || pathname === '/setup' || isAuthApi || isWebhook;
	if (!hasUser && pathname !== '/setup' && !isAuthApi && !isWebhook) {
		redirect(302, '/setup');
	}
	if (hasUser && pathname === '/setup') {
		redirect(302, event.locals.user ? '/' : '/login');
	}
	if (!event.locals.user && !isPublic) {
		redirect(302, '/login');
	}
	if (event.locals.user && pathname === '/login') {
		redirect(302, '/');
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(handleParaglide, handleAuth);
