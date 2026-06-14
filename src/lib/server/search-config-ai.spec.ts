import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from './db/schema';
import { DEFAULT_BUSINESS_OSM_TAGS } from '$lib/search-config';

const { chatJson, getSettings, updateSettings } = vi.hoisted(() => ({
	chatJson: vi.fn(),
	getSettings: vi.fn(),
	updateSettings: vi.fn()
}));

vi.mock('./llm/client', async (importOriginal) => {
	const original = await importOriginal<typeof import('./llm/client')>();
	return { ...original, chatJson };
});
vi.mock('./settings', () => ({ getSettings, updateSettings }));

import { searchConfigPatchSchema, searchConfigPreviewSchema } from '$lib/search-config';
import { LlmHttpError } from './llm/client';
import {
	applySearchConfigPatch,
	createSearchConfigPreview,
	normalizeSearchConfigPreview,
	selectedSearchConfigPatch
} from './search-config-ai';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		fullName: '',
		phone: '',
		email: '',
		profileText: '',
		languages: [],
		skills: [],
		workExperience: [],
		educationHistory: [],
		certifications: [],
		germanLevel: '',
		experienceYears: null,
		educationStatus: '',
		availability: '',
		rankingNotes: '',
		homeAddress: '',
		homeLocationProvider: null,
		homeLocationId: null,
		homePostcode: '',
		homeCity: '',
		homeLat: null,
		homeLon: null,
		jobSearchKeywords: ['Barista'],
		jobSearchLocations: ['Wien'],
		businessOsmTags: DEFAULT_BUSINESS_OSM_TAGS,
		businessRadiusMeters: 5000,
		enabledSources: [],
		llmBaseUrl: 'https://llm.test/v1',
		llmApiKey: 'secret',
		llmModel: 'test-model',
		llmRequestsPerMinute: 300,
		llmMaxConcurrent: 50,
		updatedAt: new Date(),
		...patch
	};
}

describe('normalizeSearchConfigPreview', () => {
	it('unwraps searchConfig, drops null fields, and trims and deduplicates keywords', () => {
		expect(
			normalizeSearchConfigPreview({
				searchConfig: {
					jobSearchKeywords: [' Pflege ', 'Pflege', '', 'Nurse'],
					jobSearchLocations: null
				}
			})
		).toEqual({
			jobSearchKeywords: ['Pflege', 'Nurse']
		});
	});

	it('deduplicates OSM tags and accepts raw key=value strings', () => {
		expect(
			normalizeSearchConfigPreview({
				businessOsmTags: [
					{ key: 'amenity', value: 'clinic' },
					'amenity=clinic',
					{ key: 'healthcare', value: 'nurse' }
				]
			})
		).toEqual({
			businessOsmTags: [
				{ key: 'amenity', value: 'clinic' },
				{ key: 'healthcare', value: 'nurse' }
			]
		});
	});

	it('keeps unsupported OSM tags invalid for schema validation', () => {
		const normalized = normalizeSearchConfigPreview({
			businessOsmTags: [{ key: 'amenity', value: 'not_in_catalog' }]
		});

		expect(searchConfigPreviewSchema.safeParse(normalized).success).toBe(false);
	});
});

describe('searchConfigPatchSchema', () => {
	it('allows selected fields that exist in the preview payload', () => {
		expect(
			searchConfigPatchSchema.safeParse({
				selected: ['jobSearchKeywords'],
				searchConfig: { jobSearchKeywords: ['Pflege'] }
			}).success
		).toBe(true);
	});

	it('rejects a missing selected field', () => {
		const result = searchConfigPatchSchema.safeParse({
			selected: ['jobSearchKeywords'],
			searchConfig: { businessOsmTags: [{ key: 'amenity', value: 'clinic' }] }
		});

		expect(result.success).toBe(false);
	});

	it('rejects duplicate selected fields', () => {
		const result = searchConfigPatchSchema.safeParse({
			selected: ['jobSearchKeywords', 'jobSearchKeywords'],
			searchConfig: { jobSearchKeywords: ['Pflege'] }
		});

		expect(result.success).toBe(false);
	});
});

describe('selectedSearchConfigPatch', () => {
	it('updates selected fields and leaves deselected fields unchanged', () => {
		const patch = selectedSearchConfigPatch({
			selected: ['jobSearchKeywords'],
			searchConfig: {
				jobSearchKeywords: ['Pflege'],
				jobSearchLocations: ['Graz'],
				businessOsmTags: [{ key: 'amenity', value: 'clinic' }]
			}
		});

		expect(patch).toEqual({ jobSearchKeywords: ['Pflege'] });
	});
});

describe('createSearchConfigPreview', () => {
	beforeEach(() => {
		chatJson.mockReset();
		getSettings.mockReset();
		updateSettings.mockReset();
	});

	it('returns a controlled error when LLM config is missing', async () => {
		getSettings.mockResolvedValue(settings({ llmBaseUrl: '', llmModel: '' }));

		await expect(createSearchConfigPreview('Pflegejobs')).rejects.toThrow(
			'Die KI-Konfiguration ist unvollständig.'
		);
	});

	it('returns a controlled error for unsupported AI output', async () => {
		getSettings.mockResolvedValue(settings());
		chatJson.mockResolvedValue({ businessOsmTags: [{ key: 'amenity', value: 'not_in_catalog' }] });

		await expect(createSearchConfigPreview('Pflegejobs')).rejects.toThrow(
			'Die KI-Antwort enthält keine gültige Suchkonfiguration.'
		);
	});

	it('returns a useful message for LLM auth failure', async () => {
		getSettings.mockResolvedValue(settings());
		chatJson.mockRejectedValue(new LlmHttpError(401, 'Unauthorized'));

		await expect(createSearchConfigPreview('Pflegejobs')).rejects.toThrow(
			'KI-Anmeldung fehlgeschlagen. Prüfe den gespeicherten API-Key.'
		);
	});
});

describe('applySearchConfigPatch', () => {
	beforeEach(() => {
		getSettings.mockReset();
		updateSettings.mockReset();
	});

	it('validates and applies selected fields', async () => {
		const updated = settings({ jobSearchKeywords: ['Pflege'] });
		getSettings.mockResolvedValue(settings());
		updateSettings.mockResolvedValue(updated);

		await expect(
			applySearchConfigPatch({
				selected: ['jobSearchKeywords'],
				searchConfig: { jobSearchKeywords: ['Pflege'], jobSearchLocations: ['Graz'] }
			})
		).resolves.toBe(updated);

		expect(updateSettings).toHaveBeenCalledWith({ jobSearchKeywords: ['Pflege'] });
	});
});
