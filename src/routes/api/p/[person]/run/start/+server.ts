import { requirePerson } from '#lib/server/request-person.js';
import { findPerson } from '#lib/server/people.js';
import type { RequestHandler } from './$types';

function startFailureMessage(err: unknown): string {
	const message = err instanceof Error ? err.message : String(err);
	if (
		message.includes('DATABASE_URL is not set') ||
		message.includes('DATABASE_URL ist nicht gesetzt')
	) {
		return 'Aktualisierung konnte nicht gestartet werden: DATABASE_URL ist nicht gesetzt.';
	}
	if (message.includes('ECONNREFUSED')) {
		return 'Aktualisierung konnte nicht gestartet werden: Die PostgreSQL-Datenbank ist nicht erreichbar.';
	}
	if (message.includes('password authentication failed')) {
		return 'Aktualisierung konnte nicht gestartet werden: Die PostgreSQL-Zugangsdaten wurden abgelehnt.';
	}
	if (message.includes('does not exist')) {
		return 'Aktualisierung konnte nicht gestartet werden: Eine benötigte Datenbanktabelle fehlt. Bitte Migrationen ausführen.';
	}
	return 'Aktualisierung konnte nicht gestartet werden.';
}

export const POST: RequestHandler = async ({ request, params }) => {
	const person = await requirePerson(params);
	try {
		const body = (await request.json().catch(() => null)) as { full?: boolean } | null;
		const force = body?.full === true;
		const { startRefresh, activeRunPersonId } = await import('#lib/server/scrape/runner.js');
		const runId = await startRefresh(person.id, force);
		if (runId === null) {
			const activeId = activeRunPersonId();
			const active = activeId != null && activeId !== person.id ? await findPerson(activeId) : null;
			return Response.json(
				{
					started: false,
					reason: 'already-running',
					message: active
						? `Eine Aktualisierung läuft gerade für ${active.name}.`
						: 'Eine Aktualisierung läuft bereits.'
				},
				{ status: 409 }
			);
		}
		return Response.json({ started: true, runId });
	} catch (err) {
		console.error('[api/run/start] Aktualisierung konnte nicht gestartet werden:', err);
		return Response.json(
			{
				started: false,
				reason: 'start-failed',
				message: startFailureMessage(err)
			},
			{ status: 500 }
		);
	}
};
