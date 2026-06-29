import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead, Settings } from '../db/schema';
import {
	DEFAULT_LEAD_RANKING_CRITERIA,
	DEFAULT_LISTING_RANKING_CRITERIA
} from '$lib/ranking-criteria';
import type { LlmLimiter } from './limiter';
import { buildColdEmailPrompt, draftColdEmail } from './draft-email';

const chatJson = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ chatJson }));

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
		listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA,
		leadRankingCriteria: DEFAULT_LEAD_RANKING_CRITERIA,
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

describe('cold email prompt', () => {
	it('uses configured keywords as the target role without gastronomy wording', () => {
		const prompt = buildColdEmailPrompt(settings(), lead());

		expect(prompt).toContain('Zielrolle aus Stellen-Keywords: Ordinationsassistenz, Empfang');
		expect(prompt).toContain('Amenity: Doctors');
		expect(prompt).toContain('Absender (mit diesem Namen unterschreiben): Anna Beispiel');
		expect(prompt).not.toMatch(/Gastro|Gastronomie|Servicekraft|Barista|Kellner/);
	});
});

describe('draftColdEmail', () => {
	const cfg = { baseUrl: 'http://llm', apiKey: '', model: 'm' };
	const limiter = {} as LlmLimiter;

	beforeEach(() => {
		chatJson.mockReset();
	});

	it('returns the parsed subject and trimmed body', async () => {
		chatJson.mockResolvedValue({ subject: '  Bewerbung  ', body: '  Guten Tag...  ' });

		const draft = await draftColdEmail(cfg, settings(), lead(), limiter);

		expect(draft).toEqual({ subject: 'Bewerbung', body: 'Guten Tag...' });
	});

	it('throws instead of manufacturing an empty body when the model omits it', async () => {
		chatJson.mockResolvedValue({ subject: 'Bewerbung' });

		await expect(draftColdEmail(cfg, settings(), lead(), limiter)).rejects.toThrow(/E-Mail-Text/);
	});

	it('throws when the model returns a blank body', async () => {
		chatJson.mockResolvedValue({ subject: 'Bewerbung', body: '   \n  ' });

		await expect(draftColdEmail(cfg, settings(), lead(), limiter)).rejects.toThrow(/E-Mail-Text/);
	});

	it('falls back to a default subject when the model omits it', async () => {
		chatJson.mockResolvedValue({ body: 'Guten Tag...' });

		const draft = await draftColdEmail(cfg, settings(), lead(), limiter);

		expect(draft.subject).toBe('Initiativbewerbung');
	});
});
