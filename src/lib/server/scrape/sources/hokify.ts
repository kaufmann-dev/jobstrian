import { bumpFailure, toFailureReasons } from '../../run-failures';
import type { RunPhaseFailureReason } from '../../db/schema';
import { type RetryObserver } from '../../util/retry';
import * as cheerio from 'cheerio';
import { fetchText } from '../../util/http';
import { htmlToText } from '../../util/html';
import { rethrowIfAbort } from '../abort';
import type { ProfileQuery, RawListing, ScrapeResult, SourceAdapter } from '../types';
import { detailPageGone } from './liveness';
import { matchLocation } from './location';

interface ParsedItem {
	externalId: string;
	url: string;
	title: string;
	company?: string;
	locationParts: string[];
}

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

function parse(html: string): ParsedItem[] {
	const $ = cheerio.load(html);
	const byId = new Map<string, ParsedItem>();

	$('li').each((_, element) => {
		const card = $(element);
		const link = card.find('a[href^="/job/"]').first();
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
			locationParts: location ? [location] : []
		});
	});

	return [...byId.values()];
}

export const hokify: SourceAdapter = {
	id: 'hokify',
	label: 'hokify',
	async fetchDescription(
		url: string,
		signal?: AbortSignal,
		onRetry?: RetryObserver
	): Promise<string | null> {
		const html = await fetchText(url, {
			timeoutMs: 20_000,
			headers: { 'accept-language': 'de-AT,de;q=0.9' },
			signal,
			onRetry
		});
		const $ = cheerio.load(html);
		const inner = $('[itemprop="description"]').first().html();
		return inner ? htmlToText(inner) : null;
	},
	// Removed hokify jobs answer 404/422 on their /job/<id> detail route.
	async isListingGone(
		url: string,
		signal?: AbortSignal,
		onRetry?: RetryObserver
	): Promise<boolean> {
		return detailPageGone(
			url,
			(finalUrl) => finalUrl.pathname.startsWith('/job/'),
			signal,
			onRetry
		);
	},
	async search(
		profile: ProfileQuery,
		signal?: AbortSignal,
		onRetry?: RetryObserver
	): Promise<ScrapeResult> {
		const byId = new Map<string, RawListing>();
		let complete = true;
		const reasons = new Map<string, RunPhaseFailureReason>();
		for (const locationName of profile.locations) {
			const location = slug(locationName);
			if (!location) continue;
			for (const keyword of profile.keywords) {
				if (signal?.aborted) throw signal.reason;
				try {
					const url = `https://hokify.at/jobs?branch=${slug(keyword)}&city=${location}`;
					const html = await fetchText(url, {
						timeoutMs: 20_000,
						headers: { 'accept-language': 'de-AT,de;q=0.9' },
						signal,
						onRetry
					});
					for (const { locationParts, ...item } of parse(html)) {
						const match = matchLocation(locationParts, profile.locations);
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
					bumpFailure(reasons, err);
					console.error(`[hokify] "${keyword}" in "${locationName}" fehlgeschlagen:`, err);
				}
			}
		}
		return { listings: [...byId.values()], complete, failureReasons: toFailureReasons(reasons) };
	}
};
