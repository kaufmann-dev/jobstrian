import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../db/schema';
import type { OverpassPlace } from './overpass';

const {
	fetchText,
	findNearbyBusinesses,
	select,
	from,
	insert,
	values,
	onConflictDoUpdate,
	returning
} = vi.hoisted(() => ({
	fetchText: vi.fn(),
	findNearbyBusinesses: vi.fn(),
	select: vi.fn(),
	from: vi.fn(),
	insert: vi.fn(),
	values: vi.fn(),
	onConflictDoUpdate: vi.fn(),
	returning: vi.fn()
}));

vi.mock('../util/http', () => ({
	fetchText
}));

vi.mock('./overpass', () => ({
	findNearbyBusinesses
}));

vi.mock('../db', () => ({
	db: { select, insert }
}));

import { extractEmailFromWebsite, syncLeads } from './leads';

function settings(patch: Partial<Settings> = {}): Settings {
	return {
		id: 1,
		fullName: '',
		phone: '',
		email: 'applicant@example.com',
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
		listingRankingCriteria: [],
		leadRankingCriteria: [],
		homeAddress: '',
		homeLocationProvider: null,
		homeLocationId: null,
		homePostcode: '',
		homeCity: '',
		homeLat: 47.07,
		homeLon: 15.44,
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
		resendApiKey: '',
		resendDomain: 'mail.example.com',
		resendDomainId: null,
		resendDomainStatus: 'not_started',
		resendDnsRecords: [],
		resendDnsVerifiedAt: null,
		resendFromLocalPart: 'bewerbung',
		resendFromName: '',
		resendReplyTo: 'reply@example.com',
		resendWebhookSecret: '',
		applicationEmailEnabled: false,
		applicationEmailDailyLimit: 90,
		updatedAt: new Date(0),
		...patch
	};
}

function place(patch: Partial<OverpassPlace> = {}): OverpassPlace {
	return {
		osmId: 'node/1',
		name: 'Cafe Test',
		category: 'cafe',
		lat: 47.071,
		lon: 15.441,
		matchedOsmTags: [],
		website: 'https://betrieb.example',
		...patch
	};
}

describe('extractEmailFromWebsite', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('skips blocked mailto addresses and uses the next valid contact address', async () => {
		fetchText.mockResolvedValue(`
			<body>
				<a href="mailto:applicant@example.com">Private Adresse</a>
				<a href="mailto:kontakt@betrieb.example?subject=Hallo">Kontakt</a>
			</body>
		`);

		await expect(
			extractEmailFromWebsite('https://betrieb.example', {
				blockedEmails: new Set(['applicant@example.com'])
			})
		).resolves.toBe('kontakt@betrieb.example');
	});

	it('skips blocked body-text addresses that look like echoed request metadata', async () => {
		fetchText.mockResolvedValue(`
			<body>
				Request user-agent: JobstrianBot contact applicant@example.com
				Kontakt: office@betrieb.example
			</body>
		`);

		await expect(
			extractEmailFromWebsite('https://betrieb.example', {
				blockedEmails: new Set(['applicant@example.com'])
			})
		).resolves.toBe('office@betrieb.example');
	});

	it('returns undefined when every discovered address is blocked', async () => {
		fetchText.mockResolvedValue('<body>applicant@example.com reply@example.com</body>');

		await expect(
			extractEmailFromWebsite('https://betrieb.example', {
				blockedEmails: new Set(['applicant@example.com', 'reply@example.com'])
			})
		).resolves.toBeUndefined();
	});

	it('still accepts normal business email addresses', async () => {
		fetchText.mockResolvedValue('<body>Kontakt: hallo@betrieb.example</body>');

		await expect(extractEmailFromWebsite('https://betrieb.example')).resolves.toBe(
			'hallo@betrieb.example'
		);
	});
});

describe('syncLeads', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		select.mockReturnValue({ from });
		from.mockResolvedValue([{ email: 'login@example.com' }]);
		insert.mockReturnValue({ values });
		values.mockReturnValue({ onConflictDoUpdate });
		onConflictDoUpdate.mockReturnValue({ returning });
		returning.mockResolvedValue([{ inserted: true }]);
	});

	it('does not persist app-owned OSM email addresses as lead contact emails', async () => {
		findNearbyBusinesses.mockResolvedValue([
			place({ email: 'LOGIN@EXAMPLE.COM', website: undefined })
		]);

		await syncLeads(settings(), 12);

		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({ email: undefined, emailSource: null })
		);
	});

	it('uses a website email when the OSM email is app-owned and the website has a real contact', async () => {
		findNearbyBusinesses.mockResolvedValue([place({ email: 'login@example.com' })]);
		fetchText.mockResolvedValue('<body>office@betrieb.example</body>');

		await syncLeads(settings(), 12);

		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'office@betrieb.example', emailSource: 'website' })
		);
	});

	it('blocks applicant, reply-to, sender, and login addresses during automatic discovery', async () => {
		findNearbyBusinesses.mockResolvedValue([
			place({ email: 'bewerbung@mail.example.com', website: 'https://betrieb.example' })
		]);
		fetchText.mockResolvedValue(
			'<body>applicant@example.com reply@example.com login@example.com kontakt@betrieb.example</body>'
		);

		await syncLeads(settings(), 12);

		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'kontakt@betrieb.example', emailSource: 'website' })
		);
	});
});
