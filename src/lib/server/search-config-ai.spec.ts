import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person } from './db/schema';
import { DEFAULT_BUSINESS_OSM_TAGS } from '#lib/search-config.js';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '#lib/ranking-criteria.js';

const { chatJson, getPerson, updatePerson, getLlmConfig } = vi.hoisted(() => ({
	chatJson: vi.fn(),
	getPerson: vi.fn(),
	updatePerson: vi.fn(),
	getLlmConfig: vi.fn()
}));

vi.mock('./llm/client', async (importOriginal) => {
	const original = await importOriginal<typeof import('./llm/client')>();
	return { ...original, chatJson };
});
vi.mock('./people', () => ({ getPerson, updatePerson }));
vi.mock('./llm/connections', () => ({
	getLlmConfig,
	getLlmLimiter: () => ({ run: async (task: () => unknown) => task() })
}));

import { searchConfigPatchSchema, searchConfigPreviewSchema } from '#lib/search-config.js';
import { LlmHttpError, LlmNotConfiguredError } from './llm/client';
import {
	applySearchConfigPatch,
	createSearchConfigPreview,
	normalizeSearchConfigPreview,
	selectedSearchConfigPatch
} from './search-config-ai';

function settings(patch: Partial<Person> = {}): Person {
	return {
		id: 1,
		name: 'Test',
		slug: 'test',
		color: 'amber',
		createdAt: new Date(),
		llmModelId: null,
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
		listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
		leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA,
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
		resendApiKey: '',
		resendDomain: '',
		resendDomainId: null,
		resendDomainStatus: 'not_started',
		resendDnsRecords: [],
		resendDnsVerifiedAt: null,
		resendFromLocalPart: 'bewerbung',
		resendFromName: '',
		resendReplyTo: '',
		resendWebhookSecret: '',
		applicationEmailEnabled: false,
		applicationEmailDailyLimit: 90,
		applicationEmailSendOnWeekends: false,
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
		getPerson.mockReset();
		updatePerson.mockReset();
		getLlmConfig.mockReset();
		getLlmConfig.mockResolvedValue({
			baseUrl: 'https://llm.test/v1',
			apiKey: 'secret',
			model: 'm'
		});
	});

	it('returns a controlled error when LLM config is missing', async () => {
		getPerson.mockResolvedValue(settings());
		getLlmConfig.mockRejectedValue(new LlmNotConfiguredError());

		await expect(createSearchConfigPreview(1, 'Pflegejobs')).rejects.toThrow(
			'Die KI-Konfiguration ist unvollständig.'
		);
	});

	it('returns a controlled error for unsupported AI output', async () => {
		getPerson.mockResolvedValue(settings());
		chatJson.mockResolvedValue({ businessOsmTags: [{ key: 'amenity', value: 'not_in_catalog' }] });

		await expect(createSearchConfigPreview(1, 'Pflegejobs')).rejects.toThrow(
			'Die KI-Antwort enthält keine gültige Suchkonfiguration.'
		);
	});

	it('returns a useful message for LLM auth failure', async () => {
		getPerson.mockResolvedValue(settings());
		chatJson.mockRejectedValue(new LlmHttpError(401, 'Unauthorized'));

		await expect(createSearchConfigPreview(1, 'Pflegejobs')).rejects.toThrow(
			'KI-Anmeldung fehlgeschlagen. Prüfe den gespeicherten API-Key.'
		);
	});
});

describe('applySearchConfigPatch', () => {
	beforeEach(() => {
		getPerson.mockReset();
		updatePerson.mockReset();
	});

	it('validates and applies selected fields', async () => {
		const updated = settings({ jobSearchKeywords: ['Pflege'] });
		getPerson.mockResolvedValue(settings());
		updatePerson.mockResolvedValue(updated);

		await expect(
			applySearchConfigPatch(1, {
				selected: ['jobSearchKeywords'],
				searchConfig: { jobSearchKeywords: ['Pflege'], jobSearchLocations: ['Graz'] }
			})
		).resolves.toBe(updated);

		expect(updatePerson).toHaveBeenCalledWith(1, { jobSearchKeywords: ['Pflege'] });
	});
});
