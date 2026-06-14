import { env } from '$env/dynamic/private';
import type { GeoSuggestion, GeoSuggestionKind } from '$lib/geo';

const ENDPOINT = 'https://api.geoapify.com/v1/geocode/autocomplete';
const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 200;
const REQUESTS_PER_SECOND = 4;

interface GeoapifyResult {
	place_id?: string;
	formatted?: string;
	address_line1?: string;
	address_line2?: string;
	city?: string;
	town?: string;
	village?: string;
	municipality?: string;
	postcode?: string;
	country_code?: string;
	lat?: number;
	lon?: number;
	result_type?: string;
	street?: string;
	house_number?: string;
}

interface GeoapifyResponse {
	results?: GeoapifyResult[];
}

export type GeoLookupErrorCode =
	| 'not_configured'
	| 'invalid_query'
	| 'provider_auth_failed'
	| 'rate_limited'
	| 'upstream_unavailable';

export class GeoLookupError extends Error {
	constructor(
		readonly code: GeoLookupErrorCode,
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'GeoLookupError';
	}
}

export function isGeoLookupError(error: unknown): error is GeoLookupError {
	return (
		error instanceof Error &&
		error.name === 'GeoLookupError' &&
		'code' in error &&
		typeof error.code === 'string' &&
		'status' in error &&
		typeof error.status === 'number'
	);
}

type CacheEntry = { expiresAt: number; suggestions: GeoSuggestion[] };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<GeoSuggestion[]>>();
const requestStarts: number[] = [];

function locality(result: GeoapifyResult): string {
	return (result.city ?? result.town ?? result.village ?? result.municipality ?? '').trim();
}

export function normalizeGeoapifyResult(
	result: GeoapifyResult,
	kind: GeoSuggestionKind
): GeoSuggestion | null {
	const countryCode = result.country_code?.trim().toLowerCase() ?? '';
	const label = result.formatted?.trim() ?? '';
	const city = locality(result);
	const postcode = result.postcode?.trim() ?? '';
	const lat = Number(result.lat);
	const lon = Number(result.lon);
	const id = result.place_id?.trim() ?? '';
	if (countryCode !== 'at' || !id || !label || !Number.isFinite(lat) || !Number.isFinite(lon)) {
		return null;
	}

	const completeAddress =
		kind === 'address' &&
		Boolean(result.street?.trim()) &&
		Boolean(result.house_number?.trim()) &&
		Boolean(city) &&
		Boolean(postcode);

	return {
		id,
		label,
		secondaryLabel: result.address_line2?.trim() ?? [postcode, city].filter(Boolean).join(' '),
		city,
		postcode,
		lat,
		lon,
		countryCode,
		kind,
		verifiable: completeAddress
	};
}

async function throttle(): Promise<void> {
	while (true) {
		const now = Date.now();
		while (requestStarts[0] != null && requestStarts[0] <= now - 1000) requestStarts.shift();
		if (requestStarts.length < REQUESTS_PER_SECOND) {
			requestStarts.push(now);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, Math.max(1, requestStarts[0] + 1000 - now)));
	}
}

function cached(key: string): GeoSuggestion[] | null {
	const entry = cache.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		cache.delete(key);
		return null;
	}
	cache.delete(key);
	cache.set(key, entry);
	return entry.suggestions;
}

function putCache(key: string, suggestions: GeoSuggestion[]): void {
	cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, suggestions });
	while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

async function fetchSuggestions(
	query: string,
	kind: GeoSuggestionKind,
	apiKey: string
): Promise<GeoSuggestion[]> {
	await throttle();
	const params = new URLSearchParams({
		text: query,
		filter: 'countrycode:at',
		lang: 'de',
		format: 'json',
		limit: '8',
		apiKey
	});
	if (kind === 'city') params.set('type', 'city');

	const started = Date.now();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal });
		const durationMs = Date.now() - started;
		if (!response.ok) {
			console.error('Geoapify lookup failed', { status: response.status, durationMs, kind });
			if (response.status === 401 || response.status === 403) {
				throw new GeoLookupError(
					'provider_auth_failed',
					'Der Geoapify API-Key wurde abgelehnt.',
					502
				);
			}
			if (response.status === 429) {
				throw new GeoLookupError('rate_limited', 'Das Geoapify-Anfragelimit wurde erreicht.', 503);
			}
			throw new GeoLookupError('upstream_unavailable', 'Geo lookup is unavailable.', 502);
		}
		console.info('Geoapify lookup completed', { status: response.status, durationMs, kind });
		const body = (await response.json()) as GeoapifyResponse;
		const seen = new Set<string>();
		return (body.results ?? []).flatMap((result) => {
			const suggestion = normalizeGeoapifyResult(result, kind);
			if (!suggestion || seen.has(suggestion.id)) return [];
			seen.add(suggestion.id);
			return [suggestion];
		});
	} catch (error) {
		if (isGeoLookupError(error)) throw error;
		console.error('Geoapify lookup failed', {
			status: 'network_error',
			durationMs: Date.now() - started,
			kind
		});
		throw new GeoLookupError('upstream_unavailable', 'Geo lookup is unavailable.', 502);
	} finally {
		clearTimeout(timeout);
	}
}

export async function geoSuggestions(
	query: string,
	kind: GeoSuggestionKind,
	apiKey = env.GEOAPIFY_API_KEY
): Promise<GeoSuggestion[]> {
	const trimmed = query.trim();
	const trimmedApiKey = apiKey?.trim();
	const minLength = kind === 'address' ? 3 : 2;
	if (trimmed.length < minLength || trimmed.length > 200) {
		throw new GeoLookupError('invalid_query', 'Invalid geo lookup query.', 400);
	}
	if (!trimmedApiKey) {
		throw new GeoLookupError(
			'not_configured',
			'GEOAPIFY_API_KEY ist in der Deployment-Umgebung nicht konfiguriert.',
			503
		);
	}

	const key = `${kind}:${trimmed.toLocaleLowerCase('de-AT')}`;
	const hit = cached(key);
	if (hit) return hit;
	const pending = inFlight.get(key);
	if (pending) return pending;

	const request = fetchSuggestions(trimmed, kind, trimmedApiKey)
		.then((suggestions) => {
			putCache(key, suggestions);
			return suggestions;
		})
		.finally(() => inFlight.delete(key));
	inFlight.set(key, request);
	return request;
}

export function resetGeoapifyStateForTests(): void {
	cache.clear();
	inFlight.clear();
	requestStarts.length = 0;
}
