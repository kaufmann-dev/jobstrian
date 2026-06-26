import { json } from '@sveltejs/kit';
import { startApplicationEmailRun } from '$lib/server/application-email/runner';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		const runId = await startApplicationEmailRun();
		if (runId === null) {
			return json(
				{
					started: false,
					reason: 'already-running',
					message: 'Ein Bewerbungsversand läuft bereits.'
				},
				{ status: 409 }
			);
		}
		return json({ started: true, runId });
	} catch (err) {
		console.error('[api/application-emails/start] failed:', err);
		return json(
			{
				started: false,
				reason: 'start-failed',
				message:
					err instanceof Error ? err.message : 'Bewerbungsversand konnte nicht gestartet werden.'
			},
			{ status: 400 }
		);
	}
};
