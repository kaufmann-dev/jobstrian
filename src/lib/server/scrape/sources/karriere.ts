import * as cheerio from 'cheerio';
import { fetchText } from '../../util/http';
import type { ProfileQuery, RawListing, SourceAdapter } from '../types';

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

function parse(html: string): RawListing[] {
	const $ = cheerio.load(html);
	const out: RawListing[] = [];
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
		const location = item
			.find('.m-jobsListItem__location')
			.map((_, l) => $(l).text().trim())
			.get()
			.filter(Boolean)
			.join(', ');
		out.push({
			externalId: idMatch[1],
			url: href.startsWith('http') ? href : `https://www.karriere.at${href}`,
			title,
			company: company || undefined,
			location: location || undefined
		});
	});
	return out;
}

export const karriere: SourceAdapter = {
	id: 'karriere',
	label: 'karriere.at',
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<RawListing[]> {
		const byId = new Map<string, RawListing>();
		const loc = slugify(profile.location);
		for (const keyword of profile.keywords) {
			if (signal?.aborted) throw signal.reason;
			try {
				const url = `https://www.karriere.at/jobs/${slugify(keyword)}/${loc}`;
				const html = await fetchText(url, {
					timeoutMs: 20_000,
					headers: { 'accept-language': 'de-AT,de;q=0.9' },
					signal
				});
				for (const listing of parse(html)) byId.set(listing.externalId, listing);
			} catch (err) {
				console.error(`[karriere] "${keyword}" failed:`, err);
			}
		}
		return [...byId.values()];
	}
};
