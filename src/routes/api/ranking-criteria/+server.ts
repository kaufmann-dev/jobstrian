import { json } from '@sveltejs/kit';
import {
	applyRankingCriteriaPatch,
	isRankingCriteriaAiError
} from '$lib/server/ranking-criteria-ai';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	try {
		await applyRankingCriteriaPatch(body);
		return json({ ok: true });
	} catch (error) {
		if (isRankingCriteriaAiError(error)) {
			return json({ message: error.message }, { status: error.status });
		}
		console.error('Ranking criteria update failed', error);
		return json(
			{ message: 'Die Bewertungskriterien konnten nicht aktualisiert werden.' },
			{ status: 500 }
		);
	}
};
