import { fetchText } from '../../util/http';
import { htmlToText } from '../../util/html';
import type { ProfileQuery, RawListing, ScrapeResult, SourceAdapter } from '../types';
import { matchLocation } from './location';

interface WhEntry {
	id: number;
	title: string;
	slugTitle?: string;
	company?: { title?: string };
	jobLocations?: { name?: string }[];
	salary?: string;
	salaryTimeFrame?: string;
	creationDate?: string;
	description?: string;
	isExpired?: boolean;
}

function extractNextData(html: string): unknown {
	const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
	if (!m) return null;
	try {
		return JSON.parse(m[1]);
	} catch {
		return null;
	}
}

function parseNextData(html: string): WhEntry[] {
	const json = extractNextData(html) as
		| { props?: { pageProps?: { jobsSearchResultRoot?: { data?: { entries?: WhEntry[] } } } } }
		| null;
	const entries = json?.props?.pageProps?.jobsSearchResultRoot?.data?.entries;
	return Array.isArray(entries) ? entries : [];
}

function toListing(e: WhEntry, keyword: string, cities: readonly string[]): RawListing | null {
	if (!e.id || !e.title || e.isExpired) return null;
	const parts = (e.jobLocations ?? []).map((l) => l.name).filter(Boolean) as string[];
	const match = matchLocation(parts, cities);
	if (!match) return null;
	const slug = e.slugTitle ?? 'job';
	return {
		externalId: String(e.id),
		url: `https://www.willhaben.at/jobs/job/${slug}/${e.id}`,
		title: e.title,
		company: e.company?.title,
		location: match.location,
		description: e.description ? htmlToText(e.description) : undefined,
		salary: e.salary ? `${e.salary}${e.salaryTimeFrame ? ' ' + e.salaryTimeFrame : ''}` : undefined,
		postedAt: e.creationDate ? new Date(e.creationDate) : undefined,
		discoveryKeyword: keyword,
		discoveryCity: match.city
	};
}

export const willhaben: SourceAdapter = {
	id: 'willhaben',
	label: 'willhaben Jobs',
	async fetchDescription(url: string, signal?: AbortSignal): Promise<string | null> {
		const html = await fetchText(url, { timeoutMs: 20_000, signal });
		const json = extractNextData(html) as
			| { props?: { pageProps?: { jobAdvertDetailsRoot?: { data?: { description?: string } } } } }
			| null;
		const description = json?.props?.pageProps?.jobAdvertDetailsRoot?.data?.description;
		return description ? htmlToText(description) : null;
	},
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<ScrapeResult> {
		const byId = new Map<string, RawListing>();
		let complete = true;
		for (const keyword of profile.keywords) {
			if (signal?.aborted) throw signal.reason;
			try {
				const url = 'https://www.willhaben.at/jobs/suche?keyword=' + encodeURIComponent(keyword);
				const html = await fetchText(url, { timeoutMs: 20_000, signal });
				for (const entry of parseNextData(html)) {
					const listing = toListing(entry, keyword, profile.locations);
					if (listing) byId.set(listing.externalId, listing);
				}
			} catch (err) {
				complete = false;
				console.error(`[willhaben] "${keyword}" failed:`, err);
			}
		}
		return { listings: [...byId.values()], complete };
	}
};
