import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { applicationEmailRun } from '$lib/server/db/schema';
import {
	hasActiveApplicationEmailRun,
	recoverInterruptedApplicationEmailRun
} from '$lib/server/application-email/runner';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let [latest] = await db
		.select()
		.from(applicationEmailRun)
		.orderBy(desc(applicationEmailRun.id))
		.limit(1);
	if (
		latest &&
		(latest.status === 'running' || latest.status === 'canceling') &&
		!hasActiveApplicationEmailRun(latest.id)
	) {
		await recoverInterruptedApplicationEmailRun(latest.id);
		[latest] = await db
			.select()
			.from(applicationEmailRun)
			.orderBy(desc(applicationEmailRun.id))
			.limit(1);
	}
	return json({ run: latest ?? null });
};
