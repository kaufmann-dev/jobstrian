import { shouldTouchSession } from '$lib/session-policy';
import { authBaseURL } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// hooks.server.ts performs the authenticated update. Rechecking the same
// request policy here keeps the endpoint fail-closed if hook composition changes.
export const POST: RequestHandler = ({ request, url }) =>
	new Response(null, {
		status: shouldTouchSession(request, url.pathname, authBaseURL) ? 204 : 403
	});
