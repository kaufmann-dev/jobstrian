import { json } from '@sveltejs/kit';
import { createSearchConfigPreview, isSearchConfigAiError } from '$lib/server/search-config-ai';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	const intent =
		body !== null && typeof body === 'object' && 'intent' in body && typeof body.intent === 'string'
			? body.intent
			: '';

	try {
		return json({ searchConfig: await createSearchConfigPreview(intent) });
	} catch (error) {
		if (isSearchConfigAiError(error)) {
			return json({ message: error.message }, { status: error.status });
		}
		console.error('Search config preview failed', error);
		return json({ message: 'Die Suchkonfiguration konnte nicht erzeugt werden.' }, { status: 500 });
	}
};
