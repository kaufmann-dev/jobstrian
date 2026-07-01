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
		llmVerified: false,
		llmVerifiedAt: null,
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

	it('normalizes websites without an explicit scheme', async () => {
		fetchText.mockResolvedValue('<body>Kontakt: hallo@betrieb.example</body>');

		await expect(extractEmailFromWebsite('betrieb.example')).resolves.toBe('hallo@betrieb.example');
		expect(fetchText.mock.calls[0][0]).toBe('https://betrieb.example/');
	});

	it('discovers same-origin contact links from the homepage', async () => {
		fetchText.mockImplementation(async (url: string) =>
			url.endsWith('/kontakt')
				? '<body>Bewerbungen: jobs@betrieb.example</body>'
				: '<body><a href="/kontakt">Kontakt</a></body>'
		);

		await expect(extractEmailFromWebsite('https://betrieb.example')).resolves.toBe(
			'jobs@betrieb.example'
		);
	});

	it('fetches English-only contact pages within the default page budget', async () => {
		fetchText.mockImplementation(async (url: string) =>
			url.endsWith('/contact')
				? '<body>Applications: careers@betrieb.example</body>'
				: '<body>No email here</body>'
		);

		await expect(extractEmailFromWebsite('https://betrieb.example')).resolves.toBe(
			'careers@betrieb.example'
		);
		expect(fetchText.mock.calls.map((call) => call[0])).toContain(
			'https://betrieb.example/contact'
		);
	});

	it('fetches German contact pages within the default page budget', async () => {
		fetchText.mockImplementation(async (url: string) =>
			url.endsWith('/kontakt')
				? '<body>Bewerbungen: jobs@betrieb.example</body>'
				: '<body>No email here</body>'
		);

		await expect(extractEmailFromWebsite('https://betrieb.example')).resolves.toBe(
			'jobs@betrieb.example'
		);
		expect(fetchText.mock.calls.map((call) => call[0])).toContain(
			'https://betrieb.example/kontakt'
		);
	});

	it('attempts German, English, and imprint pages before lower-priority pages', async () => {
		fetchText.mockImplementation(async (url: string) =>
			url === 'https://betrieb.example/'
				? `<body>
					<a href="/team">Team</a>
					<a href="/jobs">Jobs</a>
					<a href="/ueber-uns">Über uns</a>
				</body>`
				: '<body>No email here</body>'
		);

		await expect(extractEmailFromWebsite('https://betrieb.example')).resolves.toBeUndefined();

		const urls = fetchText.mock.calls.map((call) => call[0]);
		expect(urls.slice(0, 5)).toEqual([
			'https://betrieb.example/',
			'https://betrieb.example/contact',
			'https://betrieb.example/impressum',
			'https://betrieb.example/kontakt',
			'https://betrieb.example/jobs'
		]);
		expect(urls).not.toContain('https://betrieb.example/team');
	});

	it('extracts common obfuscated email addresses', async () => {
		fetchText.mockResolvedValue('<body>Kontakt: office [at] betrieb [dot] example</body>');

		await expect(extractEmailFromWebsite('https://betrieb.example')).resolves.toBe(
			'office@betrieb.example'
		);
	});

	it('ignores technical emails inside scripts and keeps visible contacts', async () => {
		fetchText.mockResolvedValue(`
			<body>
				<script>var dsn = "605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com";</script>
				Kontakt: office@betrieb.example
			</body>
		`);

		await expect(extractEmailFromWebsite('https://betrieb.example')).resolves.toBe(
			'office@betrieb.example'
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
