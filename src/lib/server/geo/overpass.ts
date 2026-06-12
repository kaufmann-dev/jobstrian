import { USER_AGENT } from '../util/http';

export interface OverpassPlace {
	osmId: string; // e.g. "node/123"
	name: string;
	category: string;
	lat: number;
	lon: number;
	address?: string;
	website?: string;
	phone?: string;
	email?: string;
}

interface OverpassElement {
	type: string;
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_ATTEMPTS = 3;
const OVERPASS_ATTEMPT_TIMEOUT_MS = 70_000;
const OVERPASS_RETRY_BASE_MS = 250;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// Gastronomy amenities we treat as potential employers.
const AMENITIES = 'cafe|restaurant|bar|pub|fast_food|biergarten|ice_cream|food_court';

export class OverpassUnavailableError extends Error {
	constructor(
		message: string,
		readonly attempts: number,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'OverpassUnavailableError';
	}
}

function buildAddress(tags: Record<string, string>): string | undefined {
	const street = tags['addr:street'];
	const num = tags['addr:housenumber'];
	const postcode = tags['addr:postcode'];
	const city = tags['addr:city'];
	const line1 = [street, num].filter(Boolean).join(' ');
	const line2 = [postcode, city].filter(Boolean).join(' ');
	const full = [line1, line2].filter(Boolean).join(', ');
	return full || undefined;
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortReason(signal);
}

function combineWithTimeout(
	signal: AbortSignal | undefined,
	timeoutMs: number
): {
	signal: AbortSignal;
	cleanup: () => void;
} {
	const ctrl = new AbortController();
	let callerAbort: (() => void) | undefined;
	const timeout = setTimeout(() => {
		ctrl.abort(new DOMException('Overpass request timed out.', 'TimeoutError'));
	}, timeoutMs);

	if (signal) {
		callerAbort = () => ctrl.abort(abortReason(signal));
		signal.addEventListener('abort', callerAbort, { once: true });
	}

	return {
		signal: ctrl.signal,
		cleanup: () => {
			clearTimeout(timeout);
			if (signal && callerAbort) signal.removeEventListener('abort', callerAbort);
		}
	};
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
	throwIfAborted(signal);
	let onAbort: (() => void) | undefined;
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(resolve, ms);
		if (signal) {
			onAbort = () => {
				clearTimeout(timeout);
				reject(abortReason(signal));
			};
			signal.addEventListener('abort', onAbort, { once: true });
		}
	}).finally(() => {
		if (onAbort) signal?.removeEventListener('abort', onAbort);
	});
	throwIfAborted(signal);
}

function overpassFetchFailureMessage(err: unknown): string {
	if (err instanceof Error && err.message) return `Overpass request failed: ${err.message}`;
	return 'Overpass request failed';
}

async function postOverpass(query: string, signal?: AbortSignal): Promise<Response> {
	let lastRetryable: { message: string; cause?: unknown } | undefined;

	for (let attempt = 1; attempt <= OVERPASS_ATTEMPTS; attempt++) {
		throwIfAborted(signal);
		const attemptSignal = combineWithTimeout(signal, OVERPASS_ATTEMPT_TIMEOUT_MS);
		try {
			const response = await fetch(OVERPASS_ENDPOINT, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					'user-agent': USER_AGENT
				},
				body: 'data=' + encodeURIComponent(query),
				signal: attemptSignal.signal
			});

			if (response.ok) return response;
			if (!RETRYABLE_STATUSES.has(response.status)) {
				throw new Error(`Overpass -> ${response.status}`);
			}

			lastRetryable = { message: `Overpass -> ${response.status}` };
		} catch (err) {
			if (signal?.aborted) throw abortReason(signal);
			if (err instanceof Error && err.message.startsWith('Overpass -> ')) throw err;
			lastRetryable = { message: overpassFetchFailureMessage(err), cause: err };
		} finally {
			attemptSignal.cleanup();
		}

		if (attempt < OVERPASS_ATTEMPTS) {
			await sleepWithAbort(OVERPASS_RETRY_BASE_MS * 2 ** (attempt - 1), signal);
		}
	}

	throw new OverpassUnavailableError(
		lastRetryable?.message ?? 'Overpass unavailable',
		OVERPASS_ATTEMPTS,
		{ cause: lastRetryable?.cause }
	);
}

/** Query gastronomy POIs within `radius` metres of (lat, lon). */
export async function findNearbyGastronomy(
	lat: number,
	lon: number,
	radius: number,
	signal?: AbortSignal
): Promise<OverpassPlace[]> {
	const query = `[out:json][timeout:60];
(
  node["amenity"~"${AMENITIES}"](around:${radius},${lat},${lon});
  way["amenity"~"${AMENITIES}"](around:${radius},${lat},${lon});
);
out center tags;`;

	const response = await postOverpass(query, signal);
	const data = (await response.json()) as { elements: OverpassElement[] };

	const places: OverpassPlace[] = [];
	for (const el of data.elements) {
		const tags = el.tags ?? {};
		const name = tags.name;
		if (!name) continue;
		const coord = el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : el.center;
		if (!coord) continue;
		places.push({
			osmId: `${el.type}/${el.id}`,
			name,
			category: tags.amenity ?? 'gastronomy',
			lat: coord.lat,
			lon: coord.lon,
			address: buildAddress(tags),
			website: tags.website ?? tags['contact:website'],
			phone: tags.phone ?? tags['contact:phone'],
			email: tags.email ?? tags['contact:email']
		});
	}
	return places;
}
