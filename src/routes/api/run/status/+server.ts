import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scrapeRun } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const [latest] = await db.select().from(scrapeRun).orderBy(desc(scrapeRun.id)).limit(1);
	return json({ run: latest ?? null });
};
