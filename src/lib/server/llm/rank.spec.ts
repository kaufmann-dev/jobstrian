import { describe, expect, it } from 'vitest';
import type { Lead, Settings } from '../db/schema';
import { buildLeadRankingPrompt, profileBlock } from './rank';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		skills: [],
		workExperience: [],
		educationHistory: [],
		certifications: [],
		languages: [],
		profileText: '',
		germanLevel: '',
		experienceYears: null,
		educationStatus: '',
		availability: '',
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
		llmApiKey: '',
		llmModel: '',
		llmRequestsPerMinute: 300,
		llmMaxConcurrent: 50,
		rankingNotes: '',
		updatedAt: new Date(0),
		...patch
	};
}

function lead(patch: Partial<Lead> = {}): Lead {
	return {
		id: 1,
		osmId: 'node/1',
		name: 'Stadt Apotheke',
		category: 'pharmacy',
		matchedOsmTags: [
			{ key: 'amenity', value: 'pharmacy', raw: 'amenity=pharmacy', label: 'Amenity: Pharmacy' }
		],
		lat: 47.07,
		lon: 15.44,
		distanceMeters: 600,
		address: 'Hauptplatz 1, 8010 Graz',
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

it('includes skills and detailed CV history in the ranking profile', () => {
	const profile = profileBlock(
		settings({
			skills: ['Latte Art'],
			workExperience: [
				{
					position: 'Barista',
					employer: 'Cafe Test',
					location: 'Wien',
					startDate: '2024',
					endDate: '2025',
					description: 'Espresso und Service'
				}
			],
			educationHistory: [],
			certifications: [{ name: 'HACCP', issuer: 'Test', date: '2025', description: '' }],
			languages: [],
			profileText: '',
			germanLevel: '',
			experienceYears: null,
			educationStatus: '',
			availability: '',
			homeAddress: '',
			jobSearchKeywords: [],
			jobSearchLocations: [],
			businessOsmTags: [],
			businessRadiusMeters: 5000,
			rankingNotes: ''
		})
	);

	expect(profile).toContain('Kenntnisse: Latte Art');
	expect(profile).toContain('Barista | Cafe Test | Wien | 2024 bis 2025');
	expect(profile).toContain('Zertifikate:');
});

describe('lead ranking prompt', () => {
	it('uses configured keywords, OSM labels, and address-derived city without service/barista fallback', () => {
		const prompt = buildLeadRankingPrompt(
			settings({
				jobSearchKeywords: ['Apothekenhilfe', 'Büroassistenz'],
				homeAddress: 'Hauptplatz 1, 8010 Graz, Österreich',
				homeCity: 'Graz',
				businessOsmTags: [{ key: 'amenity', value: 'pharmacy' }]
			}),
			lead()
		);

		expect(prompt).toContain('Apothekenhilfe, Büroassistenz');
		expect(prompt).toContain('Amenity: Pharmacy');
		expect(prompt).toContain('Abgeleiteter Job-Suchort: Graz');
		expect(prompt).not.toMatch(/Service-?\/?Barista|Servicekraft|Barista/);
	});
});
