import { fetchText } from '../../util/http';
import type { ProfileQuery, RawListing, SourceAdapter } from '../types';
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
	isExpired?: boolean;
}

function parseNextData(html: string): WhEntry[] {
	const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
	if (!m) return [];
	try {
		const json = JSON.parse(m[1]);
		const entries = json?.props?.pageProps?.jobsSearchResultRoot?.data?.entries;
		return Array.isArray(entries) ? entries : [];
	} catch {
		return [];
	}
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
		salary: e.salary ? `${e.salary}${e.salaryTimeFrame ? ' ' + e.salaryTimeFrame : ''}` : undefined,
		postedAt: e.creationDate ? new Date(e.creationDate) : undefined,
		discoveryKeyword: keyword,
		discoveryCity: match.city
	};
}

export const willhaben: SourceAdapter = {
	id: 'willhaben',
	label: 'willhaben Jobs',
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<RawListing[]> {
		const byId = new Map<string, RawListing>();
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
				console.error(`[willhaben] "${keyword}" failed:`, err);
			}
		}
		return [...byId.values()];
	}
};
