import { describe, expect, it } from 'vitest';
import type { Lead, Settings } from '../db/schema';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '$lib/ranking-criteria';
import {
	buildLeadRankingPrompt,
	buildListingRankingPrompt,
	LEAD_SYSTEM,
	LISTING_SYSTEM,
	profileBlock
} from './rank';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		fullName: '',
		phone: '',
		email: '',
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
		listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
		leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA,
		homeAddress: '',
		homeLocationProvider: null,
		homeLocationId: null,
		homePostcode: '',
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
		rankFactors: null,
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
			listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
			leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA
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

	it('includes criteria ids, weights, descriptions, and the full 0-5 scale', () => {
		const prompt = buildLeadRankingPrompt(
			settings({
				leadRankingCriteria: [
					{
						id: 'nearby-fit',
						label: 'Nähe',
						description: 'Kurze und realistische Anfahrt bevorzugen.',
						weight: 4
					},
					{
						id: 'role-market',
						label: 'Rollenmarkt',
						description: 'Betrieb muss Zielrollen plausibel beschäftigen.',
						weight: 5
					}
				]
			}),
			lead()
		);

		expect(prompt).toContain('Kriterium-ID: nearby-fit');
		expect(prompt).toContain('Gewicht: 4');
		expect(prompt).toContain('Kurze und realistische Anfahrt bevorzugen.');
		expect(LEAD_SYSTEM).toContain('Nutze die gesamte Skala von 0 bis 5');
		expect(LEAD_SYSTEM).toContain(
			'0 = kein ausdrücklicher Beleg für eine Passung oder ausdrücklicher Widerspruch'
		);
		expect(LEAD_SYSTEM).toContain('5 = ausgezeichnete Passung');
		expect(LEAD_SYSTEM).not.toContain('Use the full');
	});
});

describe('listing ranking prompt', () => {
	it('includes criteria ids, weights, descriptions, and the full 0-5 scale', () => {
		const prompt = buildListingRankingPrompt(
			settings({
				listingRankingCriteria: [
					{
						id: 'language-fit',
						label: 'Sprache',
						description: 'Deutschpflicht gegen Profil abgleichen.',
						weight: 3
					},
					{
						id: 'role-fit',
						label: 'Rolle',
						description: 'Zielrolle und Aufgaben müssen direkt passen.',
						weight: 5
					}
				]
			}),
			{
				id: 1,
				source: 'test',
				externalId: 'job-1',
				url: 'https://example.test/job',
				title: 'Büroassistenz',
				company: 'Test GmbH',
				location: 'Graz',
				description: 'Deutsch B1, Office',
				salary: null,
				postedAt: null,
				discoveryKeyword: 'Office',
				discoveryCity: 'Graz',
				status: 'active',
				firstSeenAt: new Date(0),
				lastSeenRunId: null,
				contentHash: null,
				rankScore: null,
				rankVerdict: null,
				rankReason: null,
				rankFactors: null,
				rankedAt: null,
				rankContentHash: null,
				rankContextHash: null,
				starred: false
			}
		);

		expect(prompt).toContain('Kriterium-ID: language-fit');
		expect(prompt).toContain('Gewicht: 3');
		expect(prompt).toContain('Deutschpflicht gegen Profil abgleichen.');
		expect(LISTING_SYSTEM).toContain('Nutze die gesamte Skala von 0 bis 5');
		expect(LISTING_SYSTEM).toContain(
			'0 = kein ausdrücklicher Beleg für eine Passung oder ausdrücklicher Widerspruch'
		);
		expect(LISTING_SYSTEM).toContain('5 = ausgezeichnete Passung');
		expect(LISTING_SYSTEM).not.toContain('Use the full');
	});
});
