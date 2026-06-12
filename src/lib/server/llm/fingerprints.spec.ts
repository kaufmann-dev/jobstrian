import { describe, expect, it } from 'vitest';
import type { Lead, Listing, Settings } from '../db/schema';
import type { LlmConfig } from './client';
import {
	draftContextHash,
	leadContentHash,
	listingContentHash,
	rankingContextHash,
	shouldDraftLead,
	shouldRankLead,
	shouldRankListing
} from './fingerprints';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		profileText: 'Servicekraft mit Barista-Erfahrung',
		roleKeywords: ['Barista'],
		languages: ['Deutsch (B1)', 'Englisch (C1)'],
		germanLevel: 'B1',
		experienceYears: 2,
		educationStatus: 'Studium laufend',
		workPermit: true,
		availability: 'ab sofort',
		rankingNotes: 'Kurze Anfahrt bevorzugen',
		homeAddress: 'Wien',
		homeLat: 48.2,
		homeLon: 16.37,
		radiusMeters: 2000,
		enabledSources: ['willhaben'],
		llmBaseUrl: 'https://llm.example.test/v1',
		llmApiKey: 'secret',
		llmModel: 'model-a',
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
		status: 'active',
		firstSeenAt: new Date('2026-01-02T00:00:00Z'),
		lastSeenRunId: 1,
		contentHash: null,
		rankScore: 80,
		rankVerdict: 'strong',
		rankReason: 'Passt gut.',
		rankedAt: new Date('2026-01-02T00:00:00Z'),
		rankContentHash: null,
		rankContextHash: null,
		...patch
	};
}

function leadRow(patch: Partial<Lead> = {}): Lead {
	return {
		id: 1,
		osmId: 'node/1',
		name: 'Cafe Test',
		category: 'cafe',
		lat: 48.2,
		lon: 16.37,
		distanceMeters: 350,
		address: 'Testgasse 1, Wien',
		website: 'https://cafe.example.test',
		phone: null,
		email: 'jobs@cafe.example.test',
		emailSource: 'website',
		hasActivePosting: false,
		rankScore: 70,
		rankReason: 'Nah und passend.',
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

	it('reranks when ranking profile or model changes', () => {
		expect.hasAssertions();
		const oldContext = rankingContextHash(settings(), cfg);
		const newContext = rankingContextHash(
			settings({ rankingNotes: 'Nur Vormittagsschichten' }),
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
});
