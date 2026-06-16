import { withPage } from '../browser';
import type { ProfileQuery, RawListing, ScrapeResult, SourceAdapter } from '../types';
import { htmlToText } from '../../util/html';
import { normalizeLocation } from './location';

/**
 * AMS eJob-Room (jobs.ams.at) is an Angular SPA whose `/api/search` endpoint
 * requires an auth token its HTTP interceptor adds per request (a direct fetch
 * returns 401). So we drive the search form in a real browser and capture the
 * `/api/search` response the SPA itself makes.
 */

interface AmsAddress {
	federalState?: string;
	town?: string;
	municipality?: string;
	zipCode?: string;
	street?: string;
}
interface AmsResult {
	id?: number | string;
	uuid?: string;
	title?: string;
	lastUpdatedAt?: string;
	summary?: string;
	company?: { name?: string; address?: AmsAddress };
}

function matchingAddressCity(
	addr: AmsAddress | undefined,
	cities: readonly string[]
): string | null {
	const fields = [addr?.town, addr?.municipality].filter(Boolean) as string[];
	for (const field of fields) {
		const normalized = normalizeLocation(field);
		const city = cities.find((candidate) => {
			const normalizedCity = normalizeLocation(candidate);
			return normalizedCity.length > 0 && normalized.includes(normalizedCity);
		});
		if (city) return city;
	}
	return null;
}

function toListing(r: AmsResult, cities: readonly string[], keyword: string): RawListing | null {
	// The public detail route /public/emps/jobs/{uuid} only resolves the uuid;
	// the numeric `id` yields an error page, so the uuid is the job's identity.
	const uuid = r.uuid;
	if (!uuid || !r.title) return null;
	const addr = r.company?.address;
	const discoveryCity = matchingAddressCity(addr, cities);
	if (!discoveryCity) return null;
	const location = [addr?.town ?? addr?.municipality, addr?.federalState]
		.filter(Boolean)
		.join(', ');
	return {
		externalId: uuid,
		url: `https://jobs.ams.at/public/emps/jobs/${uuid}`,
		title: r.title,
		company: r.company?.name,
		location: location || undefined,
		description: r.summary ? htmlToText(r.summary) : undefined,
		postedAt: r.lastUpdatedAt ? new Date(r.lastUpdatedAt) : undefined,
		discoveryKeyword: keyword,
		discoveryCity
	};
}

async function searchKeyword(
	keyword: string,
	cities: readonly string[],
	signal?: AbortSignal
): Promise<RawListing[]> {
	return withPage(async (page) => {
		const captured: AmsResult[] = [];
		page.on('response', async (res) => {
			if (!/\/public\/emps\/api\/search/.test(res.url())) return;
			try {
				const json = (await res.json()) as { results?: AmsResult[] };
				if (Array.isArray(json.results)) captured.push(...json.results);
			} catch {
				// non-JSON or body already consumed
			}
		});

		await page.goto('https://jobs.ams.at/public/emps/', {
			waitUntil: 'networkidle',
			timeout: 30_000
		});
		// The search field is the inner <input> of an <ams-autocomplete> element.
		const box = await page.$('input[type=text], input[type=search], input:not([type])');
		if (box) {
			await box.fill(keyword);
			await box.press('Enter');
		}
		await page
			.waitForResponse((r) => /\/public\/emps\/api\/search/.test(r.url()), { timeout: 15_000 })
			.catch(() => {});
		await page.waitForTimeout(1200);

		const byId = new Map<string, RawListing>();
		for (const result of captured) {
			const listing = toListing(result, cities, keyword);
			if (listing) byId.set(listing.externalId, listing);
		}
		return [...byId.values()];
	}, signal);
}

export const ams: SourceAdapter = {
	id: 'ams',
	label: 'AMS eJob-Room',
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<ScrapeResult> {
		const byId = new Map<string, RawListing>();
		let complete = true;
		for (const keyword of profile.keywords) {
			if (signal?.aborted) throw signal.reason;
			try {
				for (const listing of await searchKeyword(keyword, profile.locations, signal)) {
					byId.set(listing.externalId, listing);
				}
			} catch (err) {
				complete = false;
				console.error(`[ams] "${keyword}" failed:`, err);
			}
		}
		return { listings: [...byId.values()], complete };
	}
};
