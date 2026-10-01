import { createSearchConfigPreview, isSearchConfigAiError } from '#lib/server/search-config-ai.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ message: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	const intent =
		body !== null && typeof body === 'object' && 'intent' in body && typeof body.intent === 'string'
			? body.intent
			: '';

	try {
		return Response.json({ searchConfig: await createSearchConfigPreview(intent) });
	} catch (error) {
		if (isSearchConfigAiError(error)) {
			return Response.json({ message: error.message }, { status: error.status });
		}
		console.error('Vorschau der Suchkonfiguration fehlgeschlagen', error);
		return Response.json(
			{ message: 'Die Suchkonfiguration konnte nicht erzeugt werden.' },
			{ status: 500 }
		);
	}
};
