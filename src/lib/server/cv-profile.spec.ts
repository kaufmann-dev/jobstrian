import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from './db/schema';
import { DEFAULT_BUSINESS_OSM_TAGS } from '$lib/search-config';

const { getCvData, getSettings } = vi.hoisted(() => ({
	getCvData: vi.fn(),
	getSettings: vi.fn()
}));
vi.mock('./cv', () => ({ getCvData }));
vi.mock('./settings', () => ({ getSettings, updateSettings: vi.fn() }));

import {
	createProfilePreview,
	extractPdfText,
	normalizeProfilePreview,
	selectedProfilePatch
} from './cv-profile';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
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
		rankingNotes: '',
		homeAddress: 'Alte Adresse',
		homeCity: 'Wien',
		homeLat: 48.2,
		homeLon: 16.3,
		jobSearchKeywords: ['Barista'],
		jobSearchLocations: ['Wien'],
		businessOsmTags: DEFAULT_BUSINESS_OSM_TAGS,
		businessRadiusMeters: 5000,
		enabledSources: [],
		llmBaseUrl: '',
		llmApiKey: '',
		llmModel: '',
		llmRequestsPerMinute: 300,
		llmMaxConcurrent: 50,
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
		).toEqual({ homeAddress: 'Neue Adresse', homeCity: '', homeLat: null, homeLon: null });
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
		getSettings.mockReset();
	});

	it('rejects a missing stored CV', async () => {
		getCvData.mockResolvedValue(null);
		getSettings.mockResolvedValue(
			settings({ llmBaseUrl: 'https://llm.test/v1', llmModel: 'test' })
		);

		await expect(createProfilePreview()).rejects.toThrow('Kein Lebenslauf hinterlegt.');
	});

	it('rejects a missing LLM configuration before parsing the PDF', async () => {
		getCvData.mockResolvedValue({ mimeType: 'application/pdf', data: Buffer.from('not parsed') });
		getSettings.mockResolvedValue(settings());

		await expect(createProfilePreview()).rejects.toThrow('Die KI-Konfiguration ist unvollständig.');
	});
});

describe('extractPdfText', () => {
	it('rejects invalid PDFs with a clear error', async () => {
		await expect(extractPdfText(Buffer.from('not a pdf'))).rejects.toThrow(
			'Die gespeicherte Datei ist kein gültiges PDF.'
		);
	});
});
