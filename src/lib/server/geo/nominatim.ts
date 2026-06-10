import { fetchJson } from '../util/http';

export interface GeoPoint {
	lat: number;
	lon: number;
}

interface NominatimResult {
	lat: string;
	lon: string;
}

/** Geocode a free-form address via OpenStreetMap Nominatim. */
export async function geocode(address: string): Promise<GeoPoint | null> {
	const url =
		'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
		encodeURIComponent(address);
	const results = await fetchJson<NominatimResult[]>(url, { timeoutMs: 15_000 });
	if (!results.length) return null;
	return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
}
