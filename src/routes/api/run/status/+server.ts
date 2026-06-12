import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scrapeRun } from '$lib/server/db/schema';
import { hasActiveRun, markInterruptedRun } from '$lib/server/scrape/runner';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let [latest] = await db.select().from(scrapeRun).orderBy(desc(scrapeRun.id)).limit(1);
	if (
		latest &&
		(latest.status === 'running' || latest.status === 'canceling') &&
		!hasActiveRun(latest.id)
	) {
		await markInterruptedRun(latest.id);
		[latest] = await db.select().from(scrapeRun).orderBy(desc(scrapeRun.id)).limit(1);
	}
	return json({ run: latest ?? null });
};
