import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

export async function hasAnyUser(): Promise<boolean> {
	const existing = await db.select({ id: user.id }).from(user).limit(1);
	return existing.length > 0;
}
