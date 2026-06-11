import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => auth.handler(request);

export const POST: RequestHandler = ({ request }) => {
	if (new URL(request.url).pathname === '/api/auth/sign-up/email') {
		return new Response('Not found', { status: 404 });
	}

	return auth.handler(request);
};
