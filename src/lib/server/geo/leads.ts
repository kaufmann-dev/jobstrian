import * as cheerio from 'cheerio';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { lead, type Settings } from '../db/schema';
import { fetchText } from '../util/http';
import { haversineMeters } from '../util/distance';
import { mapLimit } from '../util/concurrency';
import { leadContentHash } from '../llm/fingerprints';
import { findNearbyBusinesses, type OverpassPlace } from './overpass';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BAD_EMAIL_SUFFIX = /\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i;

function pickEmail(candidates: Iterable<string>): string | undefined {
	for (const raw of candidates) {
		const email = raw
			.trim()
			.toLowerCase()
			.replace(/^mailto:/, '')
			.split('?')[0];
		if (!email || BAD_EMAIL_SUFFIX.test(email)) continue;
		if (/^(example|test|your|name|email)@/.test(email)) continue;
		return email;
	}
	return undefined;
}

function extractFromHtml(html: string): string | undefined {
	const $ = cheerio.load(html);
	const mailtos = $('a[href^="mailto:"]')
		.map((_, el) => $(el).attr('href') ?? '')
		.get();
	const fromMailto = pickEmail(mailtos);
	if (fromMailto) return fromMailto;
	const text = $('body').text();
	return pickEmail(text.match(EMAIL_RE) ?? []);
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason;
}

/** Try to find a contact email by scanning the homepage + imprint/contact pages. */
export async function extractEmailFromWebsite(
	website: string,
	signal?: AbortSignal
): Promise<string | undefined> {
	let origin: string;
	try {
		origin = new URL(website).origin;
	} catch {
		return undefined;
	}
	const tryPage = async (path: string): Promise<string | undefined> => {
		try {
			throwIfAborted(signal);
			const html = await fetchText(origin + path, { timeoutMs: 7000, signal });
			return extractFromHtml(html);
		} catch (err) {
			if (signal?.aborted) throw err;
			return undefined;
		}
	};
	// Homepage first; if nothing, check imprint/contact pages in parallel.
	const home = await tryPage('');
	if (home) return home;
	const rest = await Promise.all(['/impressum', '/kontakt'].map(tryPage));
	return rest.find(Boolean);
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
		throw new Error('Home coordinates not set — cannot search nearby businesses.');
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
	// Enrich + upsert with bounded concurrency so large radii stay tractable.
	const inserted = await mapLimit(
		places,
		8,
		async (place) => {
			throwIfAborted(signal);
			const distance = Math.round(haversineMeters(homeLat, homeLon, place.lat, place.lon));
			let email = place.email;
			let emailSource: 'osm' | 'website' | null = email ? 'osm' : null;
			if (!email && place.website) {
				const found = await extractEmailFromWebsite(place.website, signal);
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

async function upsertLead(
	place: OverpassPlace,
	distance: number,
	email: string | undefined,
	emailSource: 'osm' | 'website' | null,
	runId: number
): Promise<boolean> {
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
				email: sql`case when ${lead.emailManual} then ${lead.email} else coalesce(${lead.email}, ${email ?? null}) end`,
				emailSource: sql`case when ${lead.emailManual} then ${lead.emailSource} else coalesce(${lead.emailSource}, ${emailSource}) end`,
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
