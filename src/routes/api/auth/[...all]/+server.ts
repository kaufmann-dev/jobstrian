import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => auth.handler(request);

// hooks.server.ts admits only the OIDC GET callback. Keep POST fail-closed if
// this catch-all route is ever resolved without that hook.
export const POST: RequestHandler = () => new Response('Nicht gefunden', { status: 404 });
