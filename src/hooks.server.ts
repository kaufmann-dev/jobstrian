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
		console.error('Database migration failed during startup', error);
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
	const isAuthApi = pathname.startsWith('/api/auth');
	const isPublic = pathname === '/login' || pathname === '/setup' || isAuthApi;
	if (!hasUser && pathname !== '/setup' && !isAuthApi) {
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
