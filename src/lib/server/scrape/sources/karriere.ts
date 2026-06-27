import * as cheerio from 'cheerio';
import { fetchText } from '../../util/http';
import { htmlToText } from '../../util/html';
import { rethrowIfAbort } from '../abort';
import type { ProfileQuery, RawListing, ScrapeResult, SourceAdapter } from '../types';
import { matchLocation } from './location';

/** Find a JobPosting object inside a JSON-LD value (object, array, or @graph). */
function findJobPosting(node: unknown): { description?: string } | null {
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findJobPosting(item);
			if (found) return found;
		}
		return null;
	}
	if (node && typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		if (obj['@type'] === 'JobPosting') return obj as { description?: string };
		if (Array.isArray(obj['@graph'])) return findJobPosting(obj['@graph']);
	}
	return null;
}

interface ParsedItem {
	externalId: string;
	url: string;
	title: string;
	company?: string;
	locationParts: string[];
}

function slugify(keyword: string): string {
	return keyword
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function parse(html: string): ParsedItem[] {
	const $ = cheerio.load(html);
	const out: ParsedItem[] = [];
	$('.m-jobsListItem').each((_, el) => {
		const item = $(el);
		const link = item.find('a.m-jobsListItem__titleLink').first();
		const href = link.attr('href');
		if (!href) return;
		const idMatch = href.match(/\/jobs\/(\d+)/);
		if (!idMatch) return;
		const title = link.text().trim();
		if (!title) return;
		const company = item.find('.m-jobsListItem__companyName').first().text().trim();
		const locationParts = item
			.find('.m-jobsListItem__location')
			.map((_, l) => $(l).text().trim())
			.get()
			.filter(Boolean);
		out.push({
			externalId: idMatch[1],
			url: href.startsWith('http') ? href : `https://www.karriere.at${href}`,
			title,
			company: company || undefined,
			locationParts
		});
	});
	return out;
}

export const karriere: SourceAdapter = {
	id: 'karriere',
	label: 'karriere.at',
	async fetchDescription(url: string, signal?: AbortSignal): Promise<string | null> {
		const html = await fetchText(url, {
			timeoutMs: 20_000,
			headers: { 'accept-language': 'de-AT,de;q=0.9' },
			signal
		});
		const $ = cheerio.load(html);
		for (const el of $('script[type="application/ld+json"]').toArray()) {
			let parsed: unknown;
			try {
				parsed = JSON.parse($(el).text());
			} catch {
				continue;
			}
			const posting = findJobPosting(parsed);
			if (posting?.description) return htmlToText(posting.description);
		}
		return null;
	},
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<ScrapeResult> {
		const byId = new Map<string, RawListing>();
		let complete = true;
		for (const locationName of profile.locations) {
			const loc = slugify(locationName);
			if (!loc) continue;
			for (const keyword of profile.keywords) {
				if (signal?.aborted) throw signal.reason;
				try {
					const url = `https://www.karriere.at/jobs/${slugify(keyword)}/${loc}`;
					const html = await fetchText(url, {
						timeoutMs: 20_000,
						headers: { 'accept-language': 'de-AT,de;q=0.9' },
						signal
					});
					for (const { locationParts, ...item } of parse(html)) {
						const match = matchLocation(locationParts, profile.locations, ', ');
						if (!match) continue;
						byId.set(item.externalId, {
							...item,
							location: match.location,
							discoveryKeyword: keyword,
							discoveryCity: match.city
						});
					}
				} catch (err) {
					rethrowIfAbort(err, signal);
					complete = false;
					console.error(`[karriere] "${keyword}" in "${locationName}" failed:`, err);
				}
			}
		}
		return { listings: [...byId.values()], complete };
	}
};
