import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function startFailureMessage(err: unknown): string {
	const message = err instanceof Error ? err.message : String(err);
	if (message.includes('DATABASE_URL is not set')) {
		return 'Aktualisierung konnte nicht gestartet werden: DATABASE_URL ist nicht gesetzt.';
	}
	if (message.includes('ECONNREFUSED')) {
		return 'Aktualisierung konnte nicht gestartet werden: Die PostgreSQL-Datenbank ist nicht erreichbar.';
	}
	if (message.includes('password authentication failed')) {
		return 'Aktualisierung konnte nicht gestartet werden: Die PostgreSQL-Zugangsdaten wurden abgelehnt.';
	}
	if (message.includes('does not exist')) {
		return `Aktualisierung konnte nicht gestartet werden: ${message}`;
	}
	return `Aktualisierung konnte nicht gestartet werden: ${message}`;
}

export const POST: RequestHandler = async () => {
	try {
		const { startRefresh } = await import('$lib/server/scrape/runner');
		const runId = await startRefresh();
		if (runId === null) {
			return json(
				{
					started: false,
					reason: 'already-running',
					message: 'Eine Aktualisierung läuft bereits.'
				},
				{ status: 409 }
			);
		}
		return json({ started: true, runId });
	} catch (err) {
		console.error('[api/run/start] failed to start refresh:', err);
		return json(
			{
				started: false,
				reason: 'start-failed',
				message: startFailureMessage(err)
			},
			{ status: 500 }
		);
	}
};
