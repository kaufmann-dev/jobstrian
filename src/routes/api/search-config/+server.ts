import { applySearchConfigPatch, isSearchConfigAiError } from '#lib/server/search-config-ai.js';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ message: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	try {
		await applySearchConfigPatch(body);
		return Response.json({ ok: true });
	} catch (error) {
		if (isSearchConfigAiError(error)) {
			return Response.json({ message: error.message }, { status: error.status });
		}
		console.error('Aktualisierung der Suchkonfiguration fehlgeschlagen', error);
		return Response.json(
			{ message: 'Die Suchkonfiguration konnte nicht aktualisiert werden.' },
			{ status: 500 }
		);
	}
};
