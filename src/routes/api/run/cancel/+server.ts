import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	let runId: number | undefined;
	try {
		const body = (await request.json()) as { runId?: unknown };
		if (typeof body.runId === 'number' && Number.isInteger(body.runId)) runId = body.runId;
	} catch {
		// Missing JSON is treated as an idempotent no-op.
	}

	if (runId == null) return Response.json({ canceled: false, active: false });

	const { cancelRefresh } = await import('#lib/server/scrape/runner.js');
	const result = await cancelRefresh(runId);
	return Response.json({ canceled: true, active: result.active });
};
