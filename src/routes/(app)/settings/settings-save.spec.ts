import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '$lib/server/db/schema';

const { validateAustrianAddress } = vi.hoisted(() => ({ validateAustrianAddress: vi.fn() }));

vi.mock('$lib/server/geo/nominatim', () => ({
	validateAustrianAddress
}));

vi.mock('$lib/server/settings', () => ({
	ALL_SOURCES: ['hokify', 'willhaben', 'karriere', 'ams'],
	getSettings: vi.fn(),
	updateSettings: vi.fn()
}));

vi.mock('$lib/server/cv', () => ({
	getCvMeta: vi.fn()
}));

import { resolveHomeAddressSave } from './settings-save';

function settings(overrides: Partial<Settings> = {}): Settings {
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
		homeCity: '',
		homeLat: null,
		homeLon: null,
		jobSearchKeywords: [],
		jobSearchLocations: [],
		businessOsmTags: [],
		businessRadiusMeters: 5000,
		enabledSources: [],
		llmBaseUrl: '',
		llmModel: '',
		llmApiKey: '',
		llmRequestsPerMinute: 300,
		llmMaxConcurrent: 50,
		updatedAt: new Date(0),
		...overrides
	};
}

describe('settings address save validation', () => {
	it('fails unresolved addresses', async () => {
		validateAustrianAddress.mockResolvedValue(null);

		await expect(resolveHomeAddressSave(settings(), 'Not Real')).resolves.toEqual({
			ok: false,
			message: 'Adresse konnte in Österreich nicht eindeutig gefunden werden.'
		});
	});

	it('stores normalized coordinates for resolved changed addresses', async () => {
		validateAustrianAddress.mockResolvedValue({
			label: 'Herrengasse 14, 1010 Wien, Österreich',
			lat: 48.2101,
			lon: 16.3652,
			city: 'Wien',
			postcode: '1010',
			placeId: 123
		});

		await expect(
			resolveHomeAddressSave(
				settings({ homeAddress: 'Alte Adresse', homeLat: 47, homeLon: 13 }),
				'Herrengasse 14 Wien'
			)
		).resolves.toEqual({
			ok: true,
			homeAddress: 'Herrengasse 14, 1010 Wien, Österreich',
			homeCity: 'Wien',
			homeLat: 48.2101,
			homeLon: 16.3652
		});
	});

	it('clears stale coordinates when the address is removed', async () => {
		await expect(
			resolveHomeAddressSave(
				settings({ homeAddress: 'Herrengasse 14, 1010 Wien', homeLat: 48.2, homeLon: 16.3 }),
				''
			)
		).resolves.toEqual({
			ok: true,
			homeAddress: '',
			homeCity: '',
			homeLat: null,
			homeLon: null
		});
	});
});
