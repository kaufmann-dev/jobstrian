import { z } from 'zod';

export const DEFAULT_JOB_SEARCH_KEYWORDS: string[] = [];

export const OSM_TAG_CATALOG = {
	amenity: [
		'bank',
		'bar',
		'biergarten',
		'cafe',
		'cinema',
		'clinic',
		'college',
		'community_centre',
		'dentist',
		'doctors',
		'fast_food',
		'food_court',
		'fuel',
		'ice_cream',
		'kindergarten',
		'library',
		'marketplace',
		'pharmacy',
		'post_office',
		'pub',
		'restaurant',
		'school',
		'theatre',
		'university',
		'veterinary'
	],
	shop: [
		'bakery',
		'beauty',
		'books',
		'butcher',
		'car',
		'car_repair',
		'chemist',
		'clothes',
		'convenience',
		'department_store',
		'electronics',
		'florist',
		'furniture',
		'hairdresser',
		'hardware',
		'jewelry',
		'kiosk',
		'mall',
		'mobile_phone',
		'optician',
		'shoes',
		'sports',
		'supermarket'
	],
	craft: [
		'bakery',
		'brewery',
		'carpenter',
		'electrician',
		'gardener',
		'hairdresser',
		'hvac',
		'metal_construction',
		'painter',
		'photographer',
		'plumber',
		'printer',
		'shoemaker',
		'tailor'
	],
	office: [
		'company',
		'employment_agency',
		'estate_agent',
		'financial',
		'government',
		'insurance',
		'it',
		'lawyer',
		'logistics',
		'newspaper',
		'tax_advisor',
		'travel_agent'
	],
	tourism: [
		'apartment',
		'attraction',
		'gallery',
		'guest_house',
		'hostel',
		'hotel',
		'information',
		'motel',
		'museum'
	],
	healthcare: [
		'clinic',
		'dentist',
		'doctor',
		'hospital',
		'laboratory',
		'nurse',
		'optometrist',
		'pharmacy',
		'physiotherapist',
		'psychotherapist',
		'rehabilitation'
	],
	leisure: [
		'amusement_arcade',
		'bowling_alley',
		'dance',
		'fitness_centre',
		'park',
		'sports_centre',
		'stadium',
		'swimming_pool',
		'water_park'
	],
	education: [
		'college',
		'driving_school',
		'kindergarten',
		'language_school',
		'music_school',
		'school',
		'training',
		'university'
	]
} as const;

export type OsmBusinessTagKey = keyof typeof OSM_TAG_CATALOG;
export type OsmBusinessTag = { key: OsmBusinessTagKey; value: string };
export type OsmBusinessTagSuggestion = OsmBusinessTag & {
	label: string;
	raw: string;
};
export type SearchConfigField =
	| 'jobSearchKeywords'
	| 'jobSearchLocations'
	| 'businessOsmTags'
	| 'businessRadiusMeters';
export type SearchConfig = {
	jobSearchKeywords: string[];
	jobSearchLocations: string[];
	businessOsmTags: OsmBusinessTag[];
	businessRadiusMeters: number;
};

export const DEFAULT_BUSINESS_OSM_TAGS: OsmBusinessTag[] = [];

const OSM_KEYS = Object.keys(OSM_TAG_CATALOG) as OsmBusinessTagKey[];

export function normalizeStringList(items: readonly string[]): string[] {
	return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function isValidOsmBusinessTag(tag: { key: string; value: string }): tag is OsmBusinessTag {
	if (!OSM_KEYS.includes(tag.key as OsmBusinessTagKey)) return false;
	return (OSM_TAG_CATALOG[tag.key as OsmBusinessTagKey] as readonly string[]).includes(tag.value);
}

function humanizeToken(token: string): string {
	return token
		.split('_')
		.map((part) => part.charAt(0).toLocaleUpperCase('de-AT') + part.slice(1))
		.join(' ');
}

export function osmBusinessTagLabel(tag: OsmBusinessTag): string {
	return `${humanizeToken(tag.key)}: ${humanizeToken(tag.value)}`;
}

export function osmBusinessTagRaw(tag: OsmBusinessTag): string {
	return `${tag.key}=${tag.value}`;
}

export function parseOsmBusinessTag(raw: string): OsmBusinessTag | null {
	const [key, ...valueParts] = raw.trim().split('=');
	const value = valueParts.join('=');
	const tag = { key: key?.trim() ?? '', value: value.trim() };
	return isValidOsmBusinessTag(tag) ? tag : null;
}

export function osmBusinessTagSuggestions(query: string, limit = 10): OsmBusinessTagSuggestion[] {
	const normalizedQuery = query.trim().toLocaleLowerCase('de-AT');
	const suggestions: OsmBusinessTagSuggestion[] = [];

	for (const key of OSM_KEYS) {
		for (const value of OSM_TAG_CATALOG[key]) {
			const tag = { key, value };
			const raw = osmBusinessTagRaw(tag);
			const label = osmBusinessTagLabel(tag);
			const haystack = `${raw} ${label}`.toLocaleLowerCase('de-AT');
			if (normalizedQuery && !haystack.includes(normalizedQuery)) continue;
			suggestions.push({ ...tag, raw, label });
			if (suggestions.length >= limit) return suggestions;
		}
	}

	return suggestions;
}

export function normalizeOsmBusinessTags(tags: readonly OsmBusinessTag[]): OsmBusinessTag[] {
	const seen = new Set<string>();
	const normalized: OsmBusinessTag[] = [];
	for (const tag of tags) {
		const key = tag.key.trim() as OsmBusinessTagKey;
		const value = tag.value.trim();
		if (!isValidOsmBusinessTag({ key, value })) continue;
		const id = osmBusinessTagRaw({ key, value });
		if (seen.has(id)) continue;
		seen.add(id);
		normalized.push({ key, value });
	}
	return normalized;
}

export const stringListSchema = z
	.array(z.string().max(200))
	.max(100)
	.transform((items) => normalizeStringList(items));

export const osmBusinessTagSchema = z
	.object({
		key: z.string().max(50),
		value: z.string().max(100)
	})
	.transform((tag, ctx): OsmBusinessTag => {
		const normalized = { key: tag.key.trim(), value: tag.value.trim() };
		if (!isValidOsmBusinessTag(normalized)) {
			ctx.addIssue({
				code: 'custom',
				message: 'OSM-Kategorie ist nicht im Katalog enthalten.'
			});
			return z.NEVER;
		}
		return normalized;
	});

export const businessOsmTagsSchema = z
	.array(osmBusinessTagSchema)
	.max(100)
	.transform((tags) => normalizeOsmBusinessTags(tags));

export const generatedSearchConfigFields = {
	jobSearchKeywords: stringListSchema,
	businessOsmTags: businessOsmTagsSchema,
	jobSearchLocations: stringListSchema
} as const;

export const searchConfigPreviewSchema = z.object(generatedSearchConfigFields).partial();
export type SearchConfigPreview = z.infer<typeof searchConfigPreviewSchema>;
export type GeneratedSearchConfigField = keyof SearchConfigPreview;

const generatedSearchConfigFieldSchema = z.enum(
	Object.keys(generatedSearchConfigFields) as [
		GeneratedSearchConfigField,
		...GeneratedSearchConfigField[]
	]
);

export const searchConfigPatchSchema = z
	.object({
		selected: z
			.array(generatedSearchConfigFieldSchema)
			.max(Object.keys(generatedSearchConfigFields).length),
		searchConfig: searchConfigPreviewSchema
	})
	.superRefine(({ selected, searchConfig }, ctx) => {
		if (new Set(selected).size !== selected.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['selected'],
				message: 'Ausgewählte Felder dürfen nicht doppelt vorkommen.'
			});
		}
		for (const field of selected) {
			if (searchConfig[field] === undefined) {
				ctx.addIssue({
					code: 'custom',
					path: ['selected'],
					message: `Ausgewähltes Feld fehlt: ${field}`
				});
			}
		}
	});

export type SearchConfigPatch = z.infer<typeof searchConfigPatchSchema>;
