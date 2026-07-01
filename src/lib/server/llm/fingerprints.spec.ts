import { describe, expect, it } from 'vitest';
import type { Lead, Listing, Settings } from '../db/schema';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '$lib/ranking-criteria';
import type { OsmBusinessTag, OsmBusinessTagSuggestion } from '$lib/search-config';
import type { LlmConfig } from './client';
import {
	draftContextHash,
	leadContentHash,
	listingContentHash,
	planLeadLlmWork,
	rankingContextHash,
	shouldDraftLead,
	shouldRankLead,
	shouldRankListing
} from './fingerprints';

const businessTags: OsmBusinessTag[] = [{ key: 'amenity', value: 'pharmacy' }];
const matchedTags: OsmBusinessTagSuggestion[] = [
	{ key: 'amenity', value: 'pharmacy', raw: 'amenity=pharmacy', label: 'Amenity: Pharmacy' }
];

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		fullName: '',
		phone: '',
		email: '',
		profileText: 'Servicekraft mit Barista-Erfahrung',
		languages: ['Deutsch (B1)', 'Englisch (C1)'],
		skills: [],
		workExperience: [],
		educationHistory: [],
		certifications: [],
		germanLevel: 'B1',
		experienceYears: 2,
		educationStatus: 'Studium laufend',
		availability: 'ab sofort',
		listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
		leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA,
		homeAddress: 'Wien',
		homeLocationProvider: 'geoapify',
		homeLocationId: 'place',
		homePostcode: '1010',
		homeCity: 'Wien',
		homeLat: 48.2,
		homeLon: 16.37,
		jobSearchKeywords: ['Barista'],
		jobSearchLocations: ['Wien'],
		businessOsmTags: businessTags,
		businessRadiusMeters: 5000,
		enabledSources: ['willhaben'],
		llmBaseUrl: 'https://llm.example.test/v1',
		llmApiKey: 'secret',
		llmModel: 'model-a',
		llmRequestsPerMinute: 300,
		llmMaxConcurrent: 50,
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
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		...patch
	};
}

const cfg: LlmConfig = {
	baseUrl: 'https://llm.example.test/v1',
	apiKey: 'secret',
	model: 'model-a'
};

function listingRow(patch: Partial<Listing> = {}): Listing {
	return {
		id: 1,
		source: 'willhaben',
		externalId: 'abc',
		url: 'https://example.test/job/abc',
		title: 'Barista',
		company: 'Cafe Test',
		location: 'Wien',
		description: 'Espresso und Service',
		salary: '2000 EUR',
		postedAt: new Date('2026-01-02T00:00:00Z'),
		discoveryKeyword: 'Barista',
		discoveryCity: 'Wien',
		status: 'active',
		firstSeenAt: new Date('2026-01-02T00:00:00Z'),
		lastSeenRunId: 1,
		contentHash: null,
		rankScore: 80,
		rankVerdict: 'strong',
		rankReason: 'Passt gut.',
		rankFactors: null,
		rankedAt: new Date('2026-01-02T00:00:00Z'),
		rankContentHash: null,
		rankContextHash: null,
		starred: false,
		...patch
	};
}

function leadRow(patch: Partial<Lead> = {}): Lead {
	return {
		id: 1,
		osmId: 'node/1',
		name: 'Cafe Test',
		category: 'cafe',
		matchedOsmTags: matchedTags,
		lat: 48.2,
		lon: 16.37,
		distanceMeters: 350,
		address: 'Testgasse 1, Wien',
		website: 'https://cafe.example.test',
		websiteManual: false,
		phone: null,
		phoneManual: false,
		email: 'jobs@cafe.example.test',
		emailManual: false,
		emailSource: 'website',
		emailQualityStatus: 'accepted',
		emailQualityReason: null,
		emailQualityCheckedAt: null,
		hasActivePosting: false,
		rankScore: 70,
		rankReason: 'Nah und passend.',
		rankFactors: null,
		draftSubject: 'Initiativbewerbung',
		draftBody: 'Guten Tag...',
		status: 'new',
		firstSeenAt: new Date('2026-01-02T00:00:00Z'),
		lastSeenRunId: 1,
		contentHash: null,
		rankContentHash: null,
		rankContextHash: null,
		draftContentHash: null,
		draftContextHash: null,
		starred: false,
		...patch
	};
}

describe('LLM fingerprints', () => {
	it('skips unchanged listing ranking with unchanged profile and model', () => {
		expect.hasAssertions();
		const s = settings();
		const contextHash = rankingContextHash(s, cfg);
		const row = listingRow();
		const contentHash = listingContentHash(row);

		expect(
			shouldRankListing(
				listingRow({ contentHash, rankContentHash: contentHash, rankContextHash: contextHash }),
				contextHash
			)
		).toBe(false);
	});

	it('reranks when listing content changes', () => {
		expect.hasAssertions();
		const contextHash = rankingContextHash(settings(), cfg);
		const oldRow = listingRow();
		const oldHash = listingContentHash(oldRow);
		const changed = listingRow({ title: 'Senior Barista' });
		const changedHash = listingContentHash(changed);

		expect(
			shouldRankListing(
				listingRow({
					title: 'Senior Barista',
					contentHash: changedHash,
					rankContentHash: oldHash,
					rankContextHash: contextHash
				}),
				contextHash
			)
		).toBe(true);
	});

	it('reranks when listing discovery context changes', () => {
		const contextHash = rankingContextHash(settings(), cfg);
		const oldRow = listingRow({ discoveryCity: 'Wien' });
		const oldHash = listingContentHash(oldRow);
		const changed = listingRow({ discoveryCity: 'Graz' });
		const changedHash = listingContentHash(changed);

		expect(changedHash).not.toBe(oldHash);
		expect(
			shouldRankListing(
				listingRow({
					discoveryCity: 'Graz',
					contentHash: changedHash,
					rankContentHash: oldHash,
					rankContextHash: contextHash
				}),
				contextHash
			)
		).toBe(true);
	});

	it('reranks when ranking profile or model changes', () => {
		expect.hasAssertions();
		const oldContext = rankingContextHash(settings(), cfg);
		const newContext = rankingContextHash(
			settings({
				listingRankingCriteria: [
					...DEFAULT_LISTING_RANKING_CRITERIA,
					{
						id: 'morning-shifts',
						label: 'Vormittag',
						description: 'Vormittagsschichten bevorzugen.',
						weight: 2
					}
				]
			}),
			cfg
		);
		const row = listingRow();
		const contentHash = listingContentHash(row);

		expect(
			shouldRankListing(
				listingRow({ contentHash, rankContentHash: contentHash, rankContextHash: oldContext }),
				newContext
			)
		).toBe(true);
	});

	it('reranks when structured CV data changes', () => {
		const oldContext = rankingContextHash(settings(), cfg);
		const newContext = rankingContextHash(settings({ skills: ['Latte Art'] }), cfg);

		expect(newContext).not.toBe(oldContext);
	});

	it('skips unchanged lead draft and ranking work', () => {
		expect.hasAssertions();
		const s = settings();
		const rankContext = rankingContextHash(s, cfg);
		const emailContext = draftContextHash(s, cfg);
		const row = leadRow();
		const contentHash = leadContentHash(row);
		const unchanged = leadRow({
			contentHash,
			rankContentHash: contentHash,
			rankContextHash: rankContext,
			draftContentHash: contentHash,
			draftContextHash: emailContext
		});

		expect(shouldRankLead(unchanged, rankContext)).toBe(false);
		expect(shouldDraftLead(unchanged, emailContext)).toBe(false);
	});

	it('reranks leads when matched OSM tags change', () => {
		const rankContext = rankingContextHash(settings(), cfg);
		const oldRow = leadRow({ matchedOsmTags: matchedTags });
		const oldHash = leadContentHash(oldRow);
		const nextMatchedTags: OsmBusinessTagSuggestion[] = [
			{ key: 'shop', value: 'bakery', raw: 'shop=bakery', label: 'Shop: Bakery' }
		];
		const changed = leadRow({ matchedOsmTags: nextMatchedTags });
		const changedHash = leadContentHash(changed);

		expect(changedHash).not.toBe(oldHash);
		expect(
			shouldRankLead(
				leadRow({
					matchedOsmTags: nextMatchedTags,
					contentHash: changedHash,
					rankContentHash: oldHash,
					rankContextHash: rankContext
				}),
				rankContext
			)
		).toBe(true);
	});

	it('drafts every lead but only ranks leads without active postings', () => {
		const rankContext = rankingContextHash(settings(), cfg);
		const emailContext = draftContextHash(settings(), cfg);

		expect(
			planLeadLlmWork(
				leadRow({
					email: null,
					emailSource: null,
					hasActivePosting: true,
					draftSubject: null,
					draftBody: null
				}),
				rankContext,
				emailContext
			)
		).toMatchObject({ rank: false, draft: true });
		expect(
			planLeadLlmWork(
				leadRow({ email: null, emailSource: null, draftSubject: null, draftBody: null }),
				rankContext,
				emailContext
			)
		).toMatchObject({ rank: true, draft: true });
	});
});
