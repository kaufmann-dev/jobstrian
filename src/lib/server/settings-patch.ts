import { z } from 'zod';
import type { Settings } from './db/schema';
import type { GeoSuggestion } from '$lib/geo';
import { geoSuggestions } from './geo/geoapify';
import { ALL_SOURCES, getSettings, updateSettings } from './settings';
import { settingsSchema } from '$lib/../routes/(app)/settings/schema';

const PATCHABLE_FIELDS = [
	'fullName',
	'phone',
	'email',
	'profileText',
	'languages',
	'skills',
	'workExperience',
	'educationHistory',
	'certifications',
	'germanLevel',
	'experienceYears',
	'educationStatus',
	'availability',
	'listingRankingCriteria',
	'leadRankingCriteria',
	'jobSearchKeywords',
	'jobSearchLocations',
	'businessOsmTags',
	'businessRadiusMeters',
	'sourceHokify',
	'sourceWillhaben',
	'sourceKarriere',
	'sourceAms',
	'llmBaseUrl',
	'llmModel',
	'llmRequestsPerMinute',
	'llmMaxConcurrent',
	'applicationEmailDailyLimit',
	'applicationEmailSendOnWeekends'
] as const;
type PatchableField = (typeof PATCHABLE_FIELDS)[number];
const patchableFieldSet = new Set<string>(PATCHABLE_FIELDS);

const typedHomeLocationSchema = z.object({
	address: z.string().max(500),
	verified: z.literal(false)
});

const verifiedHomeLocationSchema = z.object({
	address: z.string().max(500),
	verified: z.literal(true),
	provider: z.literal('geoapify'),
	id: z.string().min(1).max(500),
	postcode: z.string().min(1).max(50),
	city: z.string().min(1).max(200),
	lat: z.number().finite().min(-90).max(90),
	lon: z.number().finite().min(-180).max(180)
});

export const settingsPatchSchema = z
	.object({
		patch: z.record(z.string(), z.unknown()).default({}),
		homeLocation: z
			.discriminatedUnion('verified', [typedHomeLocationSchema, verifiedHomeLocationSchema])
			.optional()
	})
	.strict()
	.refine((value) => Object.keys(value.patch).every((field) => patchableFieldSet.has(field)), {
		message: 'Die Änderung enthält nicht unterstützte Felder.'
	})
	.refine((value) => Object.keys(value.patch).length > 0 || value.homeLocation, {
		message: 'Die Änderung ist leer.'
	});

export type SettingsPatch = Omit<z.infer<typeof settingsPatchSchema>, 'patch'> & {
	patch: Partial<Record<PatchableField, unknown>>;
};

function locationPatch(
	homeLocation: NonNullable<SettingsPatch['homeLocation']>
): Partial<Settings> {
	if (!homeLocation.verified) {
		return {
			homeAddress: homeLocation.address,
			homeLocationProvider: null,
			homeLocationId: null,
			homePostcode: '',
			homeCity: '',
			homeLat: null,
			homeLon: null
		};
	}
	return {
		homeAddress: homeLocation.address,
		homeLocationProvider: homeLocation.provider,
		homeLocationId: homeLocation.id,
		homePostcode: homeLocation.postcode,
		homeCity: homeLocation.city,
		homeLat: homeLocation.lat,
		homeLon: homeLocation.lon
	};
}

function normalizedAddressText(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-AT');
}

function verifiedHomeLocationFromSuggestion(
	suggestion: GeoSuggestion
): NonNullable<SettingsPatch['homeLocation']> {
	return {
		address: suggestion.label,
		verified: true,
		provider: 'geoapify',
		id: suggestion.id,
		postcode: suggestion.postcode,
		city: suggestion.city,
		lat: suggestion.lat,
		lon: suggestion.lon
	};
}

function matchingVerifiableSuggestion(
	address: string,
	suggestions: GeoSuggestion[]
): GeoSuggestion | null {
	const query = normalizedAddressText(address);
	const verifiable = suggestions.filter((suggestion) => suggestion.verifiable);
	const exact = verifiable.find((suggestion) => normalizedAddressText(suggestion.label) === query);
	if (exact) return exact;
	if (!/\d/.test(query)) return null;

	const prefixed = verifiable.filter((suggestion) => {
		const label = normalizedAddressText(suggestion.label);
		return label === query || label.startsWith(`${query},`);
	});
	return prefixed.length === 1 ? prefixed[0] : null;
}

export async function verifyTypedHomeLocation(
	homeLocation: NonNullable<SettingsPatch['homeLocation']>
): Promise<NonNullable<SettingsPatch['homeLocation']>> {
	if (homeLocation.verified) return homeLocation;
	const address = homeLocation.address.trim();
	if (address.length < 3) return homeLocation;
	try {
		const match = matchingVerifiableSuggestion(address, await geoSuggestions(address, 'address'));
		return match ? verifiedHomeLocationFromSuggestion(match) : homeLocation;
	} catch {
		return homeLocation;
	}
}

export function toSettingsDbPatch(input: SettingsPatch, current?: Settings): Partial<Settings> {
	const { sourceHokify, sourceWillhaben, sourceKarriere, sourceAms, ...ordinary } = input.patch;
	const hasSourcePatch =
		sourceHokify !== undefined ||
		sourceWillhaben !== undefined ||
		sourceKarriere !== undefined ||
		sourceAms !== undefined;
	const patch: Partial<Settings> = {};
	for (const [field, value] of Object.entries(ordinary)) {
		const parsed = settingsSchema.shape[field as keyof typeof settingsSchema.shape].parse(value);
		Object.assign(patch, { [field]: parsed });
	}
	if (hasSourcePatch) {
		const enabled = new Set(current?.enabledSources ?? []);
		const sourceValues = {
			hokify:
				sourceHokify === undefined
					? undefined
					: settingsSchema.shape.sourceHokify.parse(sourceHokify),
			willhaben:
				sourceWillhaben === undefined
					? undefined
					: settingsSchema.shape.sourceWillhaben.parse(sourceWillhaben),
			karriere:
				sourceKarriere === undefined
					? undefined
					: settingsSchema.shape.sourceKarriere.parse(sourceKarriere),
			ams: sourceAms === undefined ? undefined : settingsSchema.shape.sourceAms.parse(sourceAms)
		};
		patch.enabledSources = ALL_SOURCES.filter((source) => {
			if (source === 'hokify')
				return sourceValues.hokify === undefined ? enabled.has(source) : sourceValues.hokify;
			if (source === 'willhaben')
				return sourceValues.willhaben === undefined ? enabled.has(source) : sourceValues.willhaben;
			if (source === 'karriere')
				return sourceValues.karriere === undefined ? enabled.has(source) : sourceValues.karriere;
			return sourceValues.ams === undefined ? enabled.has(source) : sourceValues.ams;
		});
	}
	if (input.homeLocation) Object.assign(patch, locationPatch(input.homeLocation));
	const baseUrlChanged = patch.llmBaseUrl !== undefined && patch.llmBaseUrl !== current?.llmBaseUrl;
	const modelChanged = patch.llmModel !== undefined && patch.llmModel !== current?.llmModel;
	if (baseUrlChanged || modelChanged) {
		patch.llmVerified = false;
		patch.llmVerifiedAt = null;
	}
	return patch;
}

export async function applySettingsPatch(input: unknown): Promise<Settings> {
	const parsed = settingsPatchSchema.safeParse(input);
	if (!parsed.success) throw parsed.error;
	const data = parsed.data as SettingsPatch;
	if (data.homeLocation) data.homeLocation = await verifyTypedHomeLocation(data.homeLocation);
	const current = await getSettings();
	return updateSettings(toSettingsDbPatch(data, current));
}
