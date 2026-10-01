import { auth } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

// hooks.server.ts admits only the OIDC sign-in, callback, and sign-out endpoints.
export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);
