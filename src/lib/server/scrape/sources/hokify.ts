import * as cheerio from 'cheerio';
import { fetchText } from '../../util/http';
import type { ProfileQuery, RawListing, SourceAdapter } from '../types';

function slug(value: string): string {
	return value
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
	const byId = new Map<string, RawListing>();

	$('li').each((_, element) => {
		const card = $(element);
		const link = card.find('h2 a[href^="/job/"]').first();
		const href = link.attr('href')?.split('?')[0];
		const idMatch = href?.match(/^\/job\/([A-Za-z0-9_-]+)$/);
		const title = link.text().trim();
		if (!href || !idMatch || !title || byId.has(idMatch[1])) return;

		const company = card.find('[data-cy="companyName"]').first().text().trim();
		const location = card.find('a[href$="-Jobs"]').first().text().trim();
		byId.set(idMatch[1], {
			externalId: idMatch[1],
			url: `https://hokify.at${href}`,
			title,
			company: company || undefined,
			location: location || undefined
		});
	});

	return [...byId.values()];
}

export const hokify: SourceAdapter = {
	id: 'hokify',
	label: 'hokify',
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<RawListing[]> {
		const byId = new Map<string, RawListing>();
		for (const locationName of profile.locations) {
			const location = slug(locationName);
			if (!location) continue;
			for (const keyword of profile.keywords) {
				if (signal?.aborted) throw signal.reason;
				try {
					const url = `https://hokify.at/jobs/m/${slug(keyword)}/${location}`;
					const html = await fetchText(url, {
						timeoutMs: 20_000,
						headers: { 'accept-language': 'de-AT,de;q=0.9' },
						signal
					});
					for (const listing of parse(html)) {
						byId.set(listing.externalId, {
							...listing,
							discoveryKeyword: keyword,
							discoveryCity: locationName
						});
					}
				} catch (err) {
					console.error(`[hokify] "${keyword}" in "${locationName}" failed:`, err);
				}
			}
		}
		return [...byId.values()];
	}
};
