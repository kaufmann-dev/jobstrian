import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * One-time bootstrap of the single application user. Self-disables once any
 * user exists, so it is safe to leave in place. Credentials come from
 * BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD / BOOTSTRAP_NAME.
 */
export const POST: RequestHandler = async () => {
	const existing = await db.select({ id: user.id }).from(user).limit(1);
	if (existing.length > 0) {
		error(403, 'Already bootstrapped');
	}

	const email = env.BOOTSTRAP_EMAIL;
	const password = env.BOOTSTRAP_PASSWORD;
	const name = env.BOOTSTRAP_NAME || 'Admin';
	if (!email || !password) {
		error(400, 'BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD must be set');
	}

	await auth.api.signUpEmail({ body: { email, password, name } });
	return json({ ok: true, email });
};
