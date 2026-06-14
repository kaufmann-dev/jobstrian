import { fetchJson } from '../util/http';

export interface GeoPoint {
	lat: number;
	lon: number;
	city: string | null;
}

export interface AustrianGeoSuggestion extends GeoPoint {
	label: string;
	city: string | null;
	postcode: string | null;
	placeId: number | null;
}

interface NominatimAddress {
	country_code?: string;
	city?: string;
	town?: string;
	village?: string;
	municipality?: string;
	county?: string;
	postcode?: string;
}

interface NominatimResult {
	place_id?: number;
	display_name?: string;
	lat: string;
	lon: string;
	address?: NominatimAddress;
}

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const AUSTRIA_COUNTRY_CODE = 'at';

function cityOrMunicipality(address: NominatimAddress | undefined): string | null {
	const value =
		address?.city ??
		address?.town ??
		address?.village ??
		address?.municipality ??
		address?.county ??
		null;
	return value?.trim() || null;
}

function normalizeResult(result: NominatimResult): AustrianGeoSuggestion | null {
	if (result.address?.country_code?.toLowerCase() !== AUSTRIA_COUNTRY_CODE) return null;

	const lat = Number(result.lat);
	const lon = Number(result.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

	const label = result.display_name?.trim();
	if (!label) return null;

	return {
		label,
		lat,
		lon,
		city: cityOrMunicipality(result.address),
		postcode: result.address?.postcode?.trim() || null,
		placeId: result.place_id ?? null
	};
}

async function searchAustria(query: string, limit: number): Promise<AustrianGeoSuggestion[]> {
	const trimmed = query.trim();
	if (trimmed.length < 3) return [];

	const params = new URLSearchParams({
		format: 'json',
		limit: String(limit),
		addressdetails: '1',
		countrycodes: AUSTRIA_COUNTRY_CODE,
		q: trimmed
	});
	const results = await fetchJson<NominatimResult[]>(`${NOMINATIM_SEARCH_URL}?${params}`, {
		timeoutMs: 15_000
	});
	return results.flatMap((result) => {
		const normalized = normalizeResult(result);
		return normalized ? [normalized] : [];
	});
}

function dedupeByLabel(suggestions: AustrianGeoSuggestion[]): AustrianGeoSuggestion[] {
	const seen = new Set<string>();
	const deduped: AustrianGeoSuggestion[] = [];
	for (const suggestion of suggestions) {
		const key = suggestion.label.toLocaleLowerCase('de-AT');
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(suggestion);
	}
	return deduped;
}

export async function searchAustrianAddresses(
	query: string,
	limit = 5
): Promise<AustrianGeoSuggestion[]> {
	return dedupeByLabel(await searchAustria(query, limit));
}

export async function validateAustrianAddress(
	address: string
): Promise<AustrianGeoSuggestion | null> {
	return (await searchAustrianAddresses(address, 1))[0] ?? null;
}

export async function searchAustrianCities(
	query: string,
	limit = 5
): Promise<AustrianGeoSuggestion[]> {
	const byCity = new Map<string, AustrianGeoSuggestion>();
	for (const suggestion of await searchAustria(query, limit * 3)) {
		if (!suggestion.city) continue;
		const key = suggestion.city.toLocaleLowerCase('de-AT');
		if (byCity.has(key)) continue;
		byCity.set(key, {
			...suggestion,
			label: suggestion.postcode ? `${suggestion.city} (${suggestion.postcode})` : suggestion.city
		});
		if (byCity.size >= limit) break;
	}
	return [...byCity.values()];
}

/** Geocode a free-form Austrian address via OpenStreetMap Nominatim. */
export async function geocode(address: string): Promise<GeoPoint | null> {
	const result = await validateAustrianAddress(address);
	return result ? { lat: result.lat, lon: result.lon, city: result.city } : null;
}
