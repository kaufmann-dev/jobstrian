import { json } from '@sveltejs/kit';
import {
	createRankingCriteriaPreview,
	isRankingCriteriaAiError
} from '$lib/server/ranking-criteria-ai';
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
		return json({ rankingCriteria: await createRankingCriteriaPreview(intent) });
	} catch (error) {
		if (isRankingCriteriaAiError(error)) {
			return json({ message: error.message }, { status: error.status });
		}
		console.error('Vorschau der Bewertungskriterien fehlgeschlagen', error);
		return json(
			{ message: 'Die Bewertungskriterien konnten nicht erzeugt werden.' },
			{ status: 500 }
		);
	}
};
