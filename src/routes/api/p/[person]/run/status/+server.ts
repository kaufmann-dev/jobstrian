import { desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { scrapeRun } from '#lib/server/db/schema.js';
import { hasActiveRun, markInterruptedRun } from '#lib/server/scrape/runner.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const person = await requirePerson(params);
	const latestRun = () =>
		db
			.select()
			.from(scrapeRun)
			.where(eq(scrapeRun.personId, person.id))
			.orderBy(desc(scrapeRun.id))
			.limit(1);
	let [latest] = await latestRun();
	if (
		latest &&
		(latest.status === 'running' || latest.status === 'canceling') &&
		!hasActiveRun(latest.id)
	) {
		await markInterruptedRun(latest.id);
		[latest] = await latestRun();
	}
	return Response.json({ run: latest ?? null });
};
