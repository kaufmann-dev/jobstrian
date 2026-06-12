import { withPage } from '../browser';
import type { ProfileQuery, RawListing, SourceAdapter } from '../types';

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
	company?: { name?: string; address?: AmsAddress };
}

function isVienna(addr?: AmsAddress): boolean {
	const fields = [addr?.federalState, addr?.town, addr?.municipality, addr?.zipCode].filter(
		Boolean
	) as string[];
	return fields.some((f) => /wien|vienna/i.test(f) || /^1\d{3}$/.test(f));
}

function toListing(r: AmsResult): RawListing | null {
	const id = r.id ?? r.uuid;
	if (id == null || !r.title) return null;
	const addr = r.company?.address;
	if (!isVienna(addr)) return null; // keep Vienna-area postings only
	const location = [addr?.town ?? addr?.municipality, addr?.federalState]
		.filter(Boolean)
		.join(', ');
	return {
		externalId: String(id),
		url: `https://jobs.ams.at/public/emps/jobs/${id}`,
		title: r.title,
		company: r.company?.name,
		location: location || undefined,
		postedAt: r.lastUpdatedAt ? new Date(r.lastUpdatedAt) : undefined
	};
}

async function searchKeyword(keyword: string, signal?: AbortSignal): Promise<RawListing[]> {
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
			const listing = toListing(result);
			if (listing) byId.set(listing.externalId, listing);
		}
		return [...byId.values()];
	}, signal);
}

export const ams: SourceAdapter = {
	id: 'ams',
	label: 'AMS eJob-Room',
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<RawListing[]> {
		const byId = new Map<string, RawListing>();
		for (const keyword of profile.keywords) {
			if (signal?.aborted) throw signal.reason;
			try {
				for (const listing of await searchKeyword(keyword, signal)) {
					byId.set(listing.externalId, listing);
				}
			} catch (err) {
				console.error(`[ams] "${keyword}" failed:`, err);
			}
		}
		return [...byId.values()];
	}
};
