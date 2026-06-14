import { fetchText } from '../../util/http';
import type { ProfileQuery, RawListing, SourceAdapter } from '../types';

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

function toListing(e: WhEntry): RawListing | null {
	if (!e.id || !e.title || e.isExpired) return null;
	const slug = e.slugTitle ?? 'job';
	return {
		externalId: String(e.id),
		url: `https://www.willhaben.at/jobs/job/${slug}/${e.id}`,
		title: e.title,
		company: e.company?.title,
		location: (e.jobLocations ?? [])
			.map((l) => l.name)
			.filter(Boolean)
			.join(' · '),
		salary: e.salary ? `${e.salary}${e.salaryTimeFrame ? ' ' + e.salaryTimeFrame : ''}` : undefined,
		postedAt: e.creationDate ? new Date(e.creationDate) : undefined
	};
}

function normalizeLocation(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function matchingConfiguredCity(
	location: string | undefined,
	cities: readonly string[]
): string | null {
	if (!location) return null;
	const normalized = normalizeLocation(location);
	return (
		cities.find((city) => {
			const normalizedCity = normalizeLocation(city);
			return normalizedCity.length > 0 && normalized.includes(normalizedCity);
		}) ?? null
	);
}

function listingWithDiscovery(
	listing: RawListing,
	keyword: string,
	cities: readonly string[]
): RawListing | null {
	const city = matchingConfiguredCity(listing.location, cities);
	if (!city) return null;
	return { ...listing, discoveryKeyword: keyword, discoveryCity: city };
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
					const listing = toListing(entry);
					const discovered = listing
						? listingWithDiscovery(listing, keyword, profile.locations)
						: null;
					if (discovered) byId.set(discovered.externalId, discovered);
				}
			} catch (err) {
				console.error(`[willhaben] "${keyword}" failed:`, err);
			}
		}
		return [...byId.values()];
	}
};
