import {
	createRankingCriteriaPreview,
	isRankingCriteriaAiError
} from '#lib/server/ranking-criteria-ai.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const person = await requirePerson(params);
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
		return Response.json({
			rankingCriteria: await createRankingCriteriaPreview(person.id, intent)
		});
	} catch (error) {
		if (isRankingCriteriaAiError(error)) {
			return Response.json({ message: error.message }, { status: error.status });
		}
		console.error('Vorschau der Bewertungskriterien fehlgeschlagen', error);
		return Response.json(
			{ message: 'Die Bewertungskriterien konnten nicht erzeugt werden.' },
			{ status: 500 }
		);
	}
};
