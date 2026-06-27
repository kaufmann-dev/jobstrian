import { json } from '@sveltejs/kit';
import { geoSuggestions, type GeoLookupErrorCode } from '$lib/server/geo/geoapify';
import type { GeoSuggestionKind } from '$lib/geo';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const rawKind = url.searchParams.get('kind');
	if (rawKind !== 'address' && rawKind !== 'city') {
		return json({ code: 'invalid_query', message: 'Ungültige Geo-Suche.' }, { status: 400 });
	}

	try {
		return json({ suggestions: await geoSuggestions(q, rawKind as GeoSuggestionKind) });
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			typeof error.code === 'string' &&
			'status' in error &&
			typeof error.status === 'number'
		) {
			return json(
				{ code: error.code as GeoLookupErrorCode, message: error.message },
				{ status: error.status }
			);
		}
		console.error('Geo-Vorschlagsendpunkt fehlgeschlagen', error);
		return json(
			{ code: 'upstream_unavailable', message: 'Geo-Suche ist vorübergehend nicht verfügbar.' },
			{ status: 502 }
		);
	}
};
