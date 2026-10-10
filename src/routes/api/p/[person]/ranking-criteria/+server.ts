import {
	applyRankingCriteriaPatch,
	isRankingCriteriaAiError
} from '#lib/server/ranking-criteria-ai.js';
import { requirePerson } from '#lib/server/request-person.js';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const person = await requirePerson(params);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ message: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	try {
		await applyRankingCriteriaPatch(person.id, body);
		return Response.json({ ok: true });
	} catch (error) {
		if (isRankingCriteriaAiError(error)) {
			return Response.json({ message: error.message }, { status: error.status });
		}
		console.error('Aktualisierung der Bewertungskriterien fehlgeschlagen', error);
		return Response.json(
			{ message: 'Die Bewertungskriterien konnten nicht aktualisiert werden.' },
			{ status: 500 }
		);
	}
};
