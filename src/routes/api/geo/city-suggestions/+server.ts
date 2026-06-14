import { json } from '@sveltejs/kit';
import { searchAustrianCities } from '$lib/server/geo/nominatim';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json({ suggestions: [] });

	try {
		return json({ suggestions: await searchAustrianCities(q) });
	} catch (error) {
		console.error('City suggestion lookup failed', error);
		return json({ message: 'Ortsvorschläge konnten nicht geladen werden.' }, { status: 502 });
	}
};
