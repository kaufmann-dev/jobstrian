import { describe, expect, it } from 'vitest';
import type { Lead, Settings } from '../db/schema';
import { buildColdEmailPrompt } from './draft-email';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		fullName: 'Anna Beispiel',
		phone: '',
		email: '',
		profileText: 'Erfahrung in Empfang und Administration',
		languages: [],
		skills: [],
		workExperience: [],
		educationHistory: [],
		certifications: [],
		germanLevel: 'B2',
		experienceYears: 2,
		educationStatus: '',
		availability: '',
		rankingNotes: '',
		homeAddress: 'Hauptplatz 1, 8010 Graz, Österreich',
		homeLocationProvider: 'geoapify',
		homeLocationId: 'place',
		homePostcode: '8010',
		homeCity: 'Graz',
		homeLat: 47.07,
		homeLon: 15.44,
		jobSearchKeywords: ['Ordinationsassistenz', 'Empfang'],
		jobSearchLocations: [],
		businessOsmTags: [{ key: 'amenity', value: 'doctors' }],
		businessRadiusMeters: 5000,
		enabledSources: [],
		llmBaseUrl: '',
		llmApiKey: '',
		llmModel: '',
		llmRequestsPerMinute: 300,
		llmMaxConcurrent: 50,
		updatedAt: new Date(0),
		...patch
	};
}

function lead(patch: Partial<Lead> = {}): Lead {
	return {
		id: 1,
		osmId: 'node/1',
		name: 'Ordination Test',
		category: 'doctors',
		matchedOsmTags: [
			{ key: 'amenity', value: 'doctors', raw: 'amenity=doctors', label: 'Amenity: Doctors' }
		],
		lat: 47.071,
		lon: 15.441,
		distanceMeters: 450,
		address: 'Testgasse 2, 8010 Graz',
		website: null,
		websiteManual: false,
		phone: null,
		phoneManual: false,
		email: null,
		emailManual: false,
		emailSource: null,
		hasActivePosting: false,
		rankScore: null,
		rankReason: null,
		draftSubject: null,
		draftBody: null,
		status: 'new',
		firstSeenAt: new Date(0),
		lastSeenRunId: null,
		contentHash: null,
		rankContentHash: null,
		rankContextHash: null,
		draftContentHash: null,
		draftContextHash: null,
		starred: false,
		...patch
	};
}

describe('cold email prompt', () => {
	it('uses configured keywords as the target role without gastronomy wording', () => {
		const prompt = buildColdEmailPrompt(settings(), lead());

		expect(prompt).toContain('Zielrolle aus Stellen-Keywords: Ordinationsassistenz, Empfang');
		expect(prompt).toContain('Amenity: Doctors');
		expect(prompt).toContain('Absender (mit diesem Namen unterschreiben): Anna Beispiel');
		expect(prompt).not.toMatch(/Gastro|Gastronomie|Servicekraft|Barista|Kellner/);
	});
});
