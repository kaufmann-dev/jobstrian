import type { Cookies } from '@sveltejs/kit';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { getCookies } from 'better-auth/cookies';
import { SESSION_TOUCH_INTERVAL_MS } from '$lib/session-policy';
import { auth } from './auth';
import { db } from './db';
import { session } from './db/schema';

export async function getStoredSession(id: string) {
	return db.query.session.findFirst({ where: eq(session.id, id) });
}

export async function touchStoredSession(id: string, now: Date): Promise<void> {
	await db
		.update(session)
		.set({ lastActiveAt: now })
		.where(
			and(
				eq(session.id, id),
				or(
					isNull(session.lastActiveAt),
					lt(session.lastActiveAt, new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS))
				)
			)
		);
}

export async function deleteStoredSession(id: string): Promise<void> {
	await db.delete(session).where(eq(session.id, id));
}

export function clearSessionCookies(cookies: Cookies): void {
	const authCookies = getCookies(auth.options);
	for (const cookie of [
		authCookies.sessionToken,
		authCookies.sessionData,
		authCookies.dontRememberToken
	]) {
		cookies.delete(cookie.name, { path: cookie.attributes.path });
	}
}
