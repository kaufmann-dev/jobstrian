import { json } from '@sveltejs/kit';
import { searchAustrianAddresses } from '$lib/server/geo/nominatim';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 3) return json({ suggestions: [] });

	try {
		return json({ suggestions: await searchAustrianAddresses(q) });
	} catch (error) {
		console.error('Address suggestion lookup failed', error);
		return json({ message: 'Adressvorschläge konnten nicht geladen werden.' }, { status: 502 });
	}
};
