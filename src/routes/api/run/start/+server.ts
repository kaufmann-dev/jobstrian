import { json } from '@sveltejs/kit';
import { startRefresh } from '$lib/server/scrape/runner';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	const runId = await startRefresh();
	if (runId === null) return json({ started: false, reason: 'already-running' }, { status: 409 });
	return json({ started: true, runId });
};
