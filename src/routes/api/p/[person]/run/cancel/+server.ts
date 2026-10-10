import { requirePerson } from '#lib/server/request-person.js';
import { db } from '#lib/server/db/index.js';
import { scrapeRun } from '#lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const person = await requirePerson(params);
	let runId: number | undefined;
	try {
		const body = (await request.json()) as { runId?: unknown };
		if (typeof body.runId === 'number' && Number.isInteger(body.runId)) runId = body.runId;
	} catch {
		// Missing JSON is treated as an idempotent no-op.
	}

	if (runId == null) return Response.json({ canceled: false, active: false });

	const [owned] = await db
		.select({ id: scrapeRun.id })
		.from(scrapeRun)
		.where(and(eq(scrapeRun.id, runId), eq(scrapeRun.personId, person.id)))
		.limit(1);
	if (!owned) return Response.json({ canceled: false, active: false });

	const { cancelRefresh } = await import('#lib/server/scrape/runner.js');
	const result = await cancelRefresh(runId);
	return Response.json({ canceled: true, active: result.active });
};
