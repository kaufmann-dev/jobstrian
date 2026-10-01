import { desc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { scrapeRun } from '#lib/server/db/schema.js';
import { hasActiveRun, markInterruptedRun } from '#lib/server/scrape/runner.js';
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
	return Response.json({ run: latest ?? null });
};
