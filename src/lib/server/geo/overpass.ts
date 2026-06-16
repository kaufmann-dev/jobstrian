import { USER_AGENT } from '../util/http';
import {
	isValidOsmBusinessTag,
	osmBusinessTagLabel,
	osmBusinessTagRaw,
	type OsmBusinessTag,
	type OsmBusinessTagKey,
	type OsmBusinessTagSuggestion
} from '$lib/search-config';

export interface OverpassPlace {
	osmId: string; // e.g. "node/123"
	name: string;
	category: string;
	lat: number;
	lon: number;
	matchedOsmTags: OsmBusinessTagSuggestion[];
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

const OSM_QUERY_CHUNK_SIZE = 12;

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

interface OverpassResponse {
	elements?: OverpassElement[];
	remark?: string;
}

/**
 * Overpass answers HTTP 200 even when a query exceeds its time/memory budget,
 * signalling the failure only through a `remark` (and empty/partial `elements`).
 * Accepting such a body as success would let an incomplete result reach lead
 * reconciliation, which then deletes still-valid leads — so it is retried.
 */
const OVERPASS_ERROR_REMARK = /(runtime error|timed out|out of memory|please be fair)/i;

function isCompleteOverpassBody(data: OverpassResponse): data is { elements: OverpassElement[] } {
	if (!Array.isArray(data.elements)) return false;
	return !(data.remark != null && OVERPASS_ERROR_REMARK.test(data.remark));
}

async function fetchOverpass(
	query: string,
	signal?: AbortSignal
): Promise<{ elements: OverpassElement[] }> {
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

			if (response.ok) {
				const data = (await response.json()) as OverpassResponse;
				if (isCompleteOverpassBody(data)) return data;
				lastRetryable = { message: `Overpass remark: ${data.remark ?? 'missing elements'}` };
			} else if (!RETRYABLE_STATUSES.has(response.status)) {
				throw new Error(`Overpass -> ${response.status}`);
			} else {
				lastRetryable = { message: `Overpass -> ${response.status}` };
			}
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

function escapeOverpassRegex(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function chunkTags(tags: readonly OsmBusinessTag[]): OsmBusinessTag[][] {
	const chunks: OsmBusinessTag[][] = [];
	for (let index = 0; index < tags.length; index += OSM_QUERY_CHUNK_SIZE) {
		chunks.push(tags.slice(index, index + OSM_QUERY_CHUNK_SIZE));
	}
	return chunks;
}

export function compileBusinessOverpassQueries(
	lat: number,
	lon: number,
	radius: number,
	tags: readonly OsmBusinessTag[]
): string[] {
	for (const tag of tags) {
		const valid = isValidOsmBusinessTag({ key: tag.key, value: tag.value });
		if (!valid) {
			throw new Error(`Invalid OSM business tag: ${tag.key}=${tag.value}`);
		}
	}

	return chunkTags(tags).map((chunk) => {
		const grouped = new Map<OsmBusinessTagKey, string[]>();
		for (const tag of chunk) {
			grouped.set(tag.key, [...(grouped.get(tag.key) ?? []), tag.value]);
		}

		const blocks = [...grouped.entries()].flatMap(([key, values]) => {
			const regex = values.map(escapeOverpassRegex).join('|');
			return [
				`  node["${key}"~"^(${regex})$"](around:${radius},${lat},${lon});`,
				`  way["${key}"~"^(${regex})$"](around:${radius},${lat},${lon});`
			];
		});

		return `[out:json][timeout:60];
(
${blocks.join('\n')}
);
out center tags;`;
	});
}

function matchedConfiguredTags(
	tags: Record<string, string>,
	configuredTags: readonly OsmBusinessTag[]
): OsmBusinessTagSuggestion[] {
	const matched: OsmBusinessTagSuggestion[] = [];
	for (const tag of configuredTags) {
		if (tags[tag.key] !== tag.value) continue;
		matched.push({
			...tag,
			raw: osmBusinessTagRaw(tag),
			label: osmBusinessTagLabel(tag)
		});
	}
	return matched;
}

function categoryFor(
	tags: Record<string, string>,
	matchedTags: readonly OsmBusinessTagSuggestion[]
): string {
	if (matchedTags[0]) return matchedTags[0].value;
	return tags.amenity ?? tags.shop ?? tags.craft ?? tags.office ?? tags.tourism ?? 'business';
}

/** Query configured business POIs within `radius` metres of (lat, lon). */
export async function findNearbyBusinesses(
	lat: number,
	lon: number,
	radius: number,
	tags: readonly OsmBusinessTag[],
	signal?: AbortSignal
): Promise<OverpassPlace[]> {
	const queries = compileBusinessOverpassQueries(lat, lon, radius, tags);
	const byOsmId = new Map<string, OverpassPlace>();

	for (const query of queries) {
		const { elements } = await fetchOverpass(query, signal);
		for (const el of elements) {
			const elementTags = el.tags ?? {};
			const name = elementTags.name;
			if (!name) continue;
			const coord = el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : el.center;
			if (!coord) continue;
			const osmId = `${el.type}/${el.id}`;
			const matchedOsmTags = matchedConfiguredTags(elementTags, tags);
			const existing = byOsmId.get(osmId);
			const mergedTags = existing
				? [
						...existing.matchedOsmTags,
						...matchedOsmTags.filter(
							(tag) => !existing.matchedOsmTags.some((existingTag) => existingTag.raw === tag.raw)
						)
					]
				: matchedOsmTags;
			byOsmId.set(osmId, {
				...existing,
				osmId,
				name,
				category: categoryFor(elementTags, mergedTags),
				lat: coord.lat,
				lon: coord.lon,
				matchedOsmTags: mergedTags,
				address: buildAddress(elementTags),
				website: elementTags.website ?? elementTags['contact:website'],
				phone: elementTags.phone ?? elementTags['contact:phone'],
				email: elementTags.email ?? elementTags['contact:email']
			});
		}
	}
	return [...byOsmId.values()];
}
