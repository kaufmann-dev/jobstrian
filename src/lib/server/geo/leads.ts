import * as cheerio from 'cheerio';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { lead, user, type Settings } from '../db/schema';
import { fetchText } from '../util/http';
import { haversineMeters } from '../util/distance';
import { mapLimit } from '../util/concurrency';
import { leadContentHash } from '../llm/fingerprints';
import { deterministicLeadEmailReview } from '../llm/email-quality';
import { findNearbyBusinesses, type OverpassPlace } from './overpass';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BAD_EMAIL_SUFFIX = /\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i;
const MAX_FETCHED_EMAIL_PAGES = 5;
const MAX_DISCOVERED_EMAIL_PAGES = 8;
const CONTACT_PATHS = [
	'/',
	'/impressum',
	'/kontakt',
	'/contact',
	'/karriere',
	'/jobs',
	'/bewerbung',
	'/team',
	'/ueber-uns',
	'/uber-uns'
];
const CONTACT_LINK_RE =
	/(kontakt|contact|impressum|imprint|karriere|career|jobs?|bewerb|team|ueber|uber|about|personal|recruit)/i;
const CORE_CONTACT_PATH_RE = /^\/(?:kontakt|contact|impressum)\/?$/i;

interface ScoredEmailCandidate {
	email: string;
	score: number;
}

function normalizeEmailCandidate(raw: string): string | undefined {
	let value = raw
		.trim()
		.replace(/^mailto:/i, '')
		.split('?')[0];
	try {
		value = decodeURIComponent(value);
	} catch {
		// Keep the original value if the page contains malformed escaping.
	}
	const email = value
		.trim()
		.toLowerCase()
		.replace(/^[<("'[\s]+/, '')
		.replace(/[>),"'\].;:\s]+$/, '');
	if (!email || BAD_EMAIL_SUFFIX.test(email)) return undefined;
	if (/^(example|test|your|name|email)@/.test(email)) return undefined;
	return email;
}

function emailDomain(email: string): string {
	return email.slice(email.lastIndexOf('@') + 1);
}

function hostWithoutWww(value: string): string {
	return value.toLowerCase().replace(/^www\./, '');
}

function domainsMatch(email: string, pageUrl: string): boolean {
	try {
		const host = hostWithoutWww(new URL(pageUrl).hostname);
		const domain = hostWithoutWww(emailDomain(email));
		return domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
	} catch {
		return false;
	}
}

function scoreEmail(
	email: string,
	pageUrl: string,
	source: 'mailto' | 'text' | 'obfuscated'
): number {
	const local = email.slice(0, email.lastIndexOf('@'));
	const path = (() => {
		try {
			return new URL(pageUrl).pathname;
		} catch {
			return '';
		}
	})();
	let score = 0;
	if (/^(jobs?|karriere|career|bewerbung|hr|personal|recruiting|talent)/i.test(local)) {
		score += 90;
	} else if (/^(kontakt|contact|office|info|hello|hallo)$/i.test(local)) {
		score += 65;
	} else if (/^(service|support)$/i.test(local)) {
		score += 20;
	} else {
		score += 35;
	}
	if (domainsMatch(email, pageUrl)) score += 25;
	if (source === 'mailto') score += 10;
	if (source === 'obfuscated') score += 5;
	if (/(karriere|career|jobs?|bewerb|personal|recruit)/i.test(path)) score += 25;
	else if (/(kontakt|contact|impressum|imprint)/i.test(path)) score += 15;
	return score;
}

function pickEmail(
	candidates: Iterable<ScoredEmailCandidate | string>,
	blockedEmails = new Set<string>()
): string | undefined {
	const scored: ScoredEmailCandidate[] = [];
	for (const raw of candidates) {
		const candidate =
			typeof raw === 'string'
				? { email: normalizeEmailCandidate(raw), score: 0 }
				: { email: raw.email, score: raw.score };
		const email = candidate.email ? normalizeEmailCandidate(candidate.email) : undefined;
		if (!email || blockedEmails.has(email)) continue;
		if (deterministicLeadEmailReview(email)) continue;
		scored.push({ email, score: candidate.score });
	}
	return scored.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))[0]?.email;
}

function obfuscatedEmails(text: string): string[] {
	const found: string[] = [];
	const pattern =
		/([a-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\bat\b)\s*([a-z0-9-]+(?:\s*(?:\.|\[dot\]|\(dot\)|\bdot\b)\s*[a-z0-9-]+)+)/gi;
	for (const match of text.matchAll(pattern)) {
		const domain = match[2].replace(/\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*/gi, '.').replace(/\s+/g, '');
		found.push(`${match[1]}@${domain}`);
	}
	return found;
}

function collectEmailCandidates(
	html: string,
	pageUrl: string,
	blockedEmails = new Set<string>()
): ScoredEmailCandidate[] {
	const $ = cheerio.load(html);
	$('script, style, noscript, svg').remove();
	const mailtos = $('a[href^="mailto:"]')
		.map((_, el) => $(el).attr('href') ?? '')
		.get();
	const candidates = new Map<string, ScoredEmailCandidate>();
	const add = (raw: string, source: 'mailto' | 'text' | 'obfuscated') => {
		const email = normalizeEmailCandidate(raw);
		if (!email || blockedEmails.has(email) || deterministicLeadEmailReview(email)) return;
		const score = scoreEmail(email, pageUrl, source);
		const existing = candidates.get(email);
		if (!existing || score > existing.score) candidates.set(email, { email, score });
	};
	for (const mailto of mailtos) add(mailto, 'mailto');
	const text = $('body').text();
	for (const email of text.match(EMAIL_RE) ?? []) add(email, 'text');
	for (const email of obfuscatedEmails(text)) add(email, 'obfuscated');
	return [...candidates.values()];
}

function normalizeWebsiteUrl(website: string): URL | null {
	const trimmed = website.trim();
	if (!trimmed) return null;
	for (const candidate of [trimmed, `https://${trimmed}`]) {
		try {
			const url = new URL(candidate);
			if (url.protocol === 'http:' || url.protocol === 'https:') return url;
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

function linkScore(url: URL, text = '', linked = false): number {
	const haystack = `${url.pathname} ${text}`;
	let score = CONTACT_LINK_RE.test(haystack) ? 20 : 0;
	if (/(kontakt|contact|impressum|imprint)/i.test(haystack)) score += 35;
	if (/(karriere|career|jobs?|bewerb|personal|recruit)/i.test(haystack)) score += 30;
	if (CORE_CONTACT_PATH_RE.test(url.pathname)) score += 80;
	else if (linked) score += 45;
	if (url.pathname === '/' || url.pathname === '') score += 5;
	return score;
}

function discoverContactUrls(html: string, baseUrl: URL): string[] {
	const $ = cheerio.load(html);
	const urls = new Map<string, number>();
	const add = (url: URL, score: number) => {
		if (url.origin !== baseUrl.origin) return;
		url.hash = '';
		const normalized = url.toString();
		urls.set(normalized, Math.max(urls.get(normalized) ?? 0, score));
	};
	for (const path of CONTACT_PATHS) {
		add(new URL(path, baseUrl.origin), linkScore(new URL(path, baseUrl.origin)));
	}
	$('a[href]').each((_, el) => {
		const href = $(el).attr('href');
		if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
		try {
			const url = new URL(href, baseUrl);
			const score = linkScore(url, $(el).text(), true);
			if (score > 0) add(url, score);
		} catch {
			// Ignore malformed links.
		}
	});
	return [...urls.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, MAX_DISCOVERED_EMAIL_PAGES)
		.map(([url]) => url);
}

function normalizeDomain(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/\/.*$/, '');
}

function configuredSenderEmail(settings: Settings): string | undefined {
	const domain = normalizeDomain(settings.resendDomain);
	if (!domain) return undefined;
	const localPart = settings.resendFromLocalPart.trim().toLowerCase() || 'bewerbung';
	return normalizeEmailCandidate(`${localPart}@${domain}`);
}

async function appOwnedEmails(settings: Settings): Promise<Set<string>> {
	const rows = await db.select({ email: user.email }).from(user);
	const emails = new Set<string>();
	for (const raw of [
		settings.email,
		settings.resendReplyTo,
		configuredSenderEmail(settings),
		...rows.map((row) => row.email)
	]) {
		if (!raw) continue;
		const email = normalizeEmailCandidate(raw);
		if (email) emails.add(email);
	}
	return emails;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason;
}

interface ExtractEmailOptions {
	blockedEmails?: Set<string>;
	signal?: AbortSignal;
}

/** Try to find a contact email by scanning the homepage + imprint/contact pages. */
export async function extractEmailFromWebsite(
	website: string,
	options: ExtractEmailOptions = {}
): Promise<string | undefined> {
	const { blockedEmails = new Set<string>(), signal } = options;
	const startUrl = normalizeWebsiteUrl(website);
	if (!startUrl) return undefined;
	const candidates: ScoredEmailCandidate[] = [];
	const seenPages = new Set<string>();
	const fetchPage = async (pageUrl: string): Promise<string | undefined> => {
		try {
			throwIfAborted(signal);
			return await fetchText(pageUrl, { timeoutMs: 7000, signal });
		} catch (err) {
			if (signal?.aborted) throw err;
			return undefined;
		}
	};
	const collect = (html: string, pageUrl: string) => {
		seenPages.add(pageUrl);
		candidates.push(...collectEmailCandidates(html, pageUrl, blockedEmails));
	};

	const homeUrl = startUrl.toString();
	const homeHtml = await fetchPage(homeUrl);
	if (!homeHtml) return undefined;
	collect(homeHtml, homeUrl);

	const discovered = discoverContactUrls(homeHtml, startUrl)
		.filter((url) => !seenPages.has(url))
		.slice(0, MAX_FETCHED_EMAIL_PAGES - 1);
	const rest = await Promise.all(
		discovered.map((url) => fetchPage(url).then((html) => ({ url, html })))
	);
	for (const page of rest) {
		if (page.html) collect(page.html, page.url);
	}
	return pickEmail(candidates, blockedEmails);
}

export interface LeadSyncResult {
	total: number;
	newOsmIds: string[];
}

/**
 * Discover nearby configured businesses, enrich missing emails from their
 * websites, and upsert them as leads. Returns ids of newly inserted leads.
 */
export async function syncLeads(
	settings: Settings,
	runId: number,
	signal?: AbortSignal
): Promise<LeadSyncResult> {
	if (settings.homeLat == null || settings.homeLon == null) {
		throw new Error(
			'Wohnort-Koordinaten fehlen. Betriebe in der Nähe können nicht gesucht werden.'
		);
	}
	const places = await findNearbyBusinesses(
		settings.homeLat,
		settings.homeLon,
		settings.businessRadiusMeters,
		settings.businessOsmTags,
		signal
	);

	const homeLat = settings.homeLat;
	const homeLon = settings.homeLon;
	const blockedEmails = await appOwnedEmails(settings);
	// Enrich + upsert with bounded concurrency so large radii stay tractable.
	const inserted = await mapLimit(
		places,
		8,
		async (place) => {
			throwIfAborted(signal);
			const distance = Math.round(haversineMeters(homeLat, homeLon, place.lat, place.lon));
			let email = pickEmail(place.email ? [place.email] : [], blockedEmails);
			let emailSource: 'osm' | 'website' | null = email ? 'osm' : null;
			if (!email && place.website) {
				const found = await extractEmailFromWebsite(place.website, { blockedEmails, signal });
				if (found) {
					email = found;
					emailSource = 'website';
				}
			}
			const isNew = await upsertLead(place, distance, email, emailSource, runId);
			return isNew ? place.osmId : null;
		},
		signal
	);

	return { total: places.length, newOsmIds: inserted.filter((x): x is string => x !== null) };
}

/**
 * Remove leads that were not seen in the given run, except leads the user has
 * engaged with (starred, contacted/ignored, or manually edited). Returns the
 * number of removed leads. Call only after a successful, complete sync.
 */
export async function reconcileLeads(runId: number): Promise<number> {
	const removed = await db
		.delete(lead)
		.where(
			and(
				or(isNull(lead.lastSeenRunId), ne(lead.lastSeenRunId, runId)),
				eq(lead.starred, false),
				eq(lead.status, 'new'),
				eq(lead.emailManual, false),
				eq(lead.websiteManual, false),
				eq(lead.phoneManual, false)
			)
		)
		.returning({ id: lead.id });
	return removed.length;
}

async function upsertLead(
	place: OverpassPlace,
	distance: number,
	email: string | undefined,
	emailSource: 'osm' | 'website' | null,
	runId: number
): Promise<boolean> {
	const nextEmail = email ?? null;
	const nextEmailSource = emailSource;
	// For automatic (non-manual) leads, adopt a freshly discovered address whenever one
	// is present. Only a genuinely different address resets the quality review — an
	// unchanged address keeps its existing verdict so a rejected address is not
	// re-reviewed every run. Cast the bound parameter to text so Postgres can determine
	// its type and prepare the statement (see the email-null typing fix in the upsert).
	const isNewAutomaticEmail = sql`${lead.emailManual} = false and ${nextEmail}::text is not null and ${nextEmail}::text is distinct from ${lead.email}`;
	const result = await db
		.insert(lead)
		.values({
			osmId: place.osmId,
			name: place.name,
			category: place.category,
			lat: place.lat,
			lon: place.lon,
			distanceMeters: distance,
			address: place.address,
			matchedOsmTags: place.matchedOsmTags,
			website: place.website,
			websiteManual: false,
			phone: place.phone,
			phoneManual: false,
			email,
			emailManual: false,
			emailSource,
			emailQualityStatus: 'unchecked',
			emailQualityReason: null,
			emailQualityCheckedAt: null,
			contentHash: leadContentHash({
				name: place.name,
				category: place.category,
				address: place.address ?? null,
				matchedOsmTags: place.matchedOsmTags,
				distanceMeters: distance,
				website: place.website ?? null,
				email: email ?? null
			}),
			lastSeenRunId: runId
		})
		.onConflictDoUpdate({
			target: lead.osmId,
			set: {
				name: place.name,
				category: place.category,
				distanceMeters: distance,
				address: place.address,
				matchedOsmTags: place.matchedOsmTags,
				website: sql`case when ${lead.websiteManual} then ${lead.website} else ${place.website ?? null} end`,
				phone: sql`case when ${lead.phoneManual} then ${lead.phone} else ${place.phone ?? null} end`,
				email: sql`case when ${lead.emailManual} then ${lead.email} when ${nextEmail}::text is not null then ${nextEmail} else ${lead.email} end`,
				emailSource: sql`case when ${lead.emailManual} then ${lead.emailSource} when ${nextEmail}::text is not null then ${nextEmailSource} else ${lead.emailSource} end`,
				emailQualityStatus: sql`case when ${isNewAutomaticEmail} then 'unchecked' else ${lead.emailQualityStatus} end`,
				emailQualityReason: sql`case when ${isNewAutomaticEmail} then null else ${lead.emailQualityReason} end`,
				emailQualityCheckedAt: sql`case when ${isNewAutomaticEmail} then null else ${lead.emailQualityCheckedAt} end`,
				// Recompute from the persisted row in the LLM phase so manual overrides
				// and newly discovered contact data are reflected correctly.
				contentHash: null,
				lastSeenRunId: runId
			}
		})
		// xmax = 0 => the row was inserted (not updated) by this upsert.
		.returning({ id: lead.id, inserted: sql<boolean>`(xmax = 0)` });

	return result.length > 0 && result[0].inserted === true;
}
