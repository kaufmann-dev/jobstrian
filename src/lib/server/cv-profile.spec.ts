import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Person } from './db/schema';
import { LlmNotConfiguredError } from './llm/client';
import { DEFAULT_BUSINESS_OSM_TAGS } from '#lib/search-config.js';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '#lib/ranking-criteria.js';

const { getCvData, getPerson, getLlmConfig } = vi.hoisted(() => ({
	getCvData: vi.fn(),
	getPerson: vi.fn(),
	getLlmConfig: vi.fn()
}));
vi.mock('./cv', () => ({ getCvData }));
vi.mock('./people', () => ({ getPerson, updatePerson: vi.fn() }));
vi.mock('./llm/connections', () => ({
	getLlmConfig,
	getLlmLimiter: () => ({ run: async (task: () => unknown) => task() })
}));

import {
	createProfilePreview,
	extractPdfText,
	normalizeProfilePreview,
	selectedProfilePatch
} from './cv-profile';

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
		profileText: 'Bestehend',
		languages: ['Deutsch (B1)'],
		skills: ['Service'],
		workExperience: [],
		educationHistory: [],
		certifications: [],
		germanLevel: 'B1',
		experienceYears: 2,
		educationStatus: '',
		availability: '',
		listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
		leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA,
		homeAddress: 'Alte Adresse',
		homeLocationProvider: 'geoapify',
		homeLocationId: 'old-place',
		homePostcode: '1010',
		homeCity: 'Wien',
		homeLat: 48.2,
		homeLon: 16.3,
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

describe('selectedProfilePatch', () => {
	it('updates selected fields while leaving absent and deselected fields unchanged', () => {
		const patch = selectedProfilePatch(settings(), {
			selected: ['skills'],
			profile: {
				skills: ['Latte Art'],
				profileText: 'Nicht übernehmen'
			}
		});

		expect(patch).toEqual({ skills: ['Latte Art'] });
	});

	it('clears coordinates only when an imported address changes', () => {
		expect(
			selectedProfilePatch(settings(), {
				selected: ['homeAddress'],
				profile: { homeAddress: 'Neue Adresse' }
			})
		).toEqual({
			homeAddress: 'Neue Adresse',
			homeLocationProvider: null,
			homeLocationId: null,
			homePostcode: '',
			homeCity: '',
			homeLat: null,
			homeLon: null
		});
	});
});

describe('normalizeProfilePreview', () => {
	it('drops null fields and fills omitted nested entry properties', () => {
		expect(
			normalizeProfilePreview({
				profileText: null,
				experienceYears: '3',
				skills: [' Service ', null, 'Service', 'Latte Art'],
				workExperience: [{ position: 'Barista', employer: 'Cafe Test' }]
			})
		).toEqual({
			experienceYears: 3,
			skills: ['Service', 'Latte Art'],
			workExperience: [
				{
					position: 'Barista',
					employer: 'Cafe Test',
					location: '',
					startDate: '',
					endDate: '',
					description: ''
				}
			]
		});
	});

	it('unwraps a profile object and ignores unsupported fields', () => {
		expect(
			normalizeProfilePreview({
				profile: { languages: ['Deutsch (B1)'], rankingNotes: 'nicht importieren' }
			})
		).toEqual({ languages: ['Deutsch (B1)'] });
	});
});

describe('createProfilePreview', () => {
	beforeEach(() => {
		getCvData.mockReset();
		getPerson.mockReset();
		getLlmConfig.mockReset();
	});

	it('rejects a missing stored CV', async () => {
		getCvData.mockResolvedValue(null);
		getPerson.mockResolvedValue(settings());
		getLlmConfig.mockResolvedValue({
			apiType: 'openai-compatible' as const,
			baseUrl: 'https://llm.test/v1',
			apiKey: '',
			model: 'test'
		});

		await expect(createProfilePreview(1)).rejects.toThrow('Kein Lebenslauf hinterlegt.');
	});

	it('rejects a missing LLM configuration before parsing the PDF', async () => {
		getCvData.mockResolvedValue({ mimeType: 'application/pdf', data: Buffer.from('not parsed') });
		getPerson.mockResolvedValue(settings());
		getLlmConfig.mockRejectedValue(new LlmNotConfiguredError());

		await expect(createProfilePreview(1)).rejects.toThrow(
			'Die KI-Konfiguration ist unvollständig.'
		);
	});
});

describe('extractPdfText', () => {
	it('rejects invalid PDFs with a clear error', async () => {
		await expect(extractPdfText(Buffer.from('not a pdf'))).rejects.toThrow(
			'Die gespeicherte Datei ist kein gültiges PDF.'
		);
	});
});
