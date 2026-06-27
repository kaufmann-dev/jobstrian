import {
	OSM_TAG_CATALOG,
	isValidOsmBusinessTag,
	normalizeOsmBusinessTags,
	normalizeStringList,
	osmBusinessTagLabel,
	osmBusinessTagRaw,
	parseOsmBusinessTag,
	searchConfigPatchSchema,
	searchConfigPreviewSchema,
	type OsmBusinessTag,
	type OsmBusinessTagKey,
	type SearchConfigPatch,
	type SearchConfigPreview
} from '$lib/search-config';
import type { Settings } from './db/schema';
import { chatJson, getLlmConfig, LlmHttpError } from './llm/client';
import { LlmLimiter } from './llm/limiter';
import { getSettings, updateSettings } from './settings';

export class SearchConfigAiError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
		this.name = 'SearchConfigAiError';
	}
}

export function isSearchConfigAiError(error: unknown): error is SearchConfigAiError {
	return (
		error instanceof SearchConfigAiError ||
		(error instanceof Error &&
			error.name === 'SearchConfigAiError' &&
			'status' in error &&
			typeof error.status === 'number')
	);
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function normalizeOsmTag(value: unknown): OsmBusinessTag | null {
	if (typeof value === 'string') return parseOsmBusinessTag(value);
	const source = record(value);
	if (!source) return null;
	const key = typeof source.key === 'string' ? source.key.trim() : '';
	const rawValue = typeof source.value === 'string' ? source.value.trim() : '';
	const tag = { key, value: rawValue };
	return isValidOsmBusinessTag(tag) ? tag : null;
}

function hasUnsupportedOsmTag(value: unknown): boolean {
	if (!Array.isArray(value)) return false;
	return value.some((item) => {
		if (typeof item === 'string') return parseOsmBusinessTag(item) === null;
		const source = record(item);
		if (!source) return true;
		const key = typeof source.key === 'string' ? source.key.trim() : '';
		const rawValue = typeof source.value === 'string' ? source.value.trim() : '';
		return !isValidOsmBusinessTag({ key, value: rawValue });
	});
}

function normalizedStrings(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const strings = normalizeStringList(
		value.filter((item): item is string => typeof item === 'string')
	);
	return strings.length ? strings : undefined;
}

function normalizedOsmTags(value: unknown): OsmBusinessTag[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const tags = normalizeOsmBusinessTags(value.flatMap((item) => normalizeOsmTag(item) ?? []));
	return tags.length ? tags : undefined;
}

/**
 * Normalize conservative variations commonly returned by JSON-capable models:
 * unwrap { searchConfig: ... }, drop nulls, accept OSM tags as objects or raw
 * key=value strings, and keep invalid tags visible to schema validation.
 */
export function normalizeSearchConfigPreview(raw: unknown): unknown {
	const outer = record(raw);
	if (!outer) return raw;
	const source = record(outer.searchConfig) ?? outer;
	const normalized: Record<string, unknown> = {};

	const keywords = normalizedStrings(source.jobSearchKeywords);
	if (keywords?.length) normalized.jobSearchKeywords = keywords;

	const locations = normalizedStrings(source.jobSearchLocations);
	if (locations?.length) normalized.jobSearchLocations = locations;

	if (hasUnsupportedOsmTag(source.businessOsmTags)) {
		normalized.businessOsmTags = source.businessOsmTags;
	} else {
		const tags = normalizedOsmTags(source.businessOsmTags);
		if (tags?.length) normalized.businessOsmTags = tags;
	}

	return normalized;
}

function catalogPrompt(): string {
	return Object.entries(OSM_TAG_CATALOG)
		.flatMap(([key, values]) =>
			values.map((value) => {
				const tag = { key: key as OsmBusinessTagKey, value };
				return `- ${osmBusinessTagRaw(tag)} (${osmBusinessTagLabel(tag)})`;
			})
		)
		.join('\n');
}

const SEARCH_CONFIG_SYSTEM = `Du erstellst eine Suchkonfiguration für Jobsuche in Österreich.
Antworte ausschließlich mit einem JSON-Objekt. Erlaubte Felder:
jobSearchKeywords, businessOsmTags, jobSearchLocations.

Regeln:
- Erzeuge praktische Portal-Suchbegriffe auf Deutsch und Englisch, wenn das die Treffer verbessert.
- Nutze gängige österreichische Jobmarkt-Synonyme und Rollenbezeichnungen.
- Bevorzuge breite Trefferabdeckung statt zu enger Keywords.
- businessOsmTags darf ausschließlich key/value-Paare aus dem bereitgestellten OSM-Katalog enthalten.
- Erfinde niemals OSM keys oder values außerhalb des Katalogs.
- jobSearchLocations nur vorschlagen, wenn der Nutzer konkrete Städte oder Orte ausdrücklich erwähnt.
- Lasse leere oder nicht ableitbare Felder vollständig weg.
- Gib OSM-Tags als Objekte mit key und value zurück.`;

export async function createSearchConfigPreview(intent: string): Promise<SearchConfigPreview> {
	const trimmedIntent = intent.trim();
	if (!trimmedIntent) {
		throw new SearchConfigAiError('Beschreibe kurz, welche Stellen und Betriebe gefunden werden sollen.');
	}
	if (trimmedIntent.length > 3000) {
		throw new SearchConfigAiError('Die Beschreibung ist zu lang.', 413);
	}

	const settings = await getSettings();
	const cfg = await getLlmConfig(settings).catch(() => {
		throw new SearchConfigAiError('Die KI-Konfiguration ist unvollständig.', 409);
	});
	const limiter = new LlmLimiter({
		requestsPerMinute: settings.llmRequestsPerMinute,
		maxConcurrent: settings.llmMaxConcurrent
	});

	let raw: unknown;
	try {
		raw = await chatJson<unknown>(
			cfg,
			[
				{ role: 'system', content: SEARCH_CONFIG_SYSTEM },
				{
					role: 'user',
					content: `NUTZERWUNSCH:\n${trimmedIntent}\n\nERLAUBTER OSM-KATALOG:\n${catalogPrompt()}`
				}
			],
			{ limiter, temperature: 0.1 }
		);
	} catch (error) {
		if (error instanceof LlmHttpError && (error.status === 401 || error.status === 403)) {
			throw new SearchConfigAiError(
				'KI-Anmeldung fehlgeschlagen. Prüfe den gespeicherten API-Key.',
				502
			);
		}
		throw error;
	}

	const parsed = searchConfigPreviewSchema.safeParse(normalizeSearchConfigPreview(raw));
	if (!parsed.success) {
		console.error('Ungültige LLM-Antwort für Suchkonfiguration', parsed.error.issues);
		throw new SearchConfigAiError('Die KI-Antwort enthält keine gültige Suchkonfiguration.', 502);
	}
	if (Object.keys(parsed.data).length === 0) {
		throw new SearchConfigAiError('Die KI hat keine unterstützte Suchkonfiguration erzeugt.', 422);
	}
	return parsed.data;
}

export function selectedSearchConfigPatch(input: SearchConfigPatch): Partial<Settings> {
	const patch: Partial<Settings> = {};
	for (const field of input.selected) {
		const value = input.searchConfig[field];
		if (value !== undefined) Object.assign(patch, { [field]: value });
	}
	return patch;
}

export async function applySearchConfigPatch(input: unknown): Promise<Settings> {
	const parsed = searchConfigPatchSchema.safeParse(input);
	if (!parsed.success) {
		throw new SearchConfigAiError('Die ausgewählte Suchkonfiguration ist ungültig.');
	}
	await getSettings();
	return updateSettings(selectedSearchConfigPatch(parsed.data));
}
