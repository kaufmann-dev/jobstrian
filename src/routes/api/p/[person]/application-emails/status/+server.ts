import { desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { applicationEmailRun } from '#lib/server/db/schema.js';
import {
	hasActiveApplicationEmailRun,
	recoverInterruptedApplicationEmailRun
} from '#lib/server/application-email/runner.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const person = await requirePerson(params);
	const latestRun = () =>
		db
			.select()
			.from(applicationEmailRun)
			.where(eq(applicationEmailRun.personId, person.id))
			.orderBy(desc(applicationEmailRun.id))
			.limit(1);
	let [latest] = await latestRun();
	if (
		latest &&
		(latest.status === 'running' || latest.status === 'canceling') &&
		!hasActiveApplicationEmailRun(latest.id)
	) {
		await recoverInterruptedApplicationEmailRun(latest.id);
		[latest] = await latestRun();
	}
	return Response.json({ run: latest ?? null });
};
