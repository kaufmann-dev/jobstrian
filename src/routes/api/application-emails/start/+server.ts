import { startApplicationEmailRun } from '#lib/server/application-email/runner.js';
import type { RequestHandler } from './$types';

function startFailureMessage(err: unknown): string {
	const message = err instanceof Error ? err.message : '';
	if (message.startsWith('Bewerbungsversand ist noch nicht bereit.')) return message;
	return 'Bewerbungsversand konnte nicht gestartet werden.';
}

export const POST: RequestHandler = async () => {
	try {
		const runId = await startApplicationEmailRun();
		if (runId === null) {
			return Response.json(
				{
					started: false,
					reason: 'already-running',
					message: 'Ein Bewerbungsversand läuft bereits.'
				},
				{ status: 409 }
			);
		}
		return Response.json({ started: true, runId });
	} catch (err) {
		console.error('[api/application-emails/start] Start fehlgeschlagen:', err);
		return Response.json(
			{
				started: false,
				reason: 'start-failed',
				message: startFailureMessage(err)
			},
			{ status: 400 }
		);
	}
};
