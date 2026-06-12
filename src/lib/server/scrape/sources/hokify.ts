import { withPage } from '../browser';
import type { ProfileQuery, RawListing, SourceAdapter } from '../types';

function slug(keyword: string): string {
	return keyword
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

async function searchKeyword(keyword: string, signal?: AbortSignal): Promise<RawListing[]> {
	const url = `https://www.hokify.at/jobs/${slug(keyword)}/wien`;
	return withPage(async (page) => {
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
		// Job cards are rendered client-side; wait for the anchors to appear.
		await page.waitForSelector('a[href*="/job/"]', { timeout: 15_000 }).catch(() => {});

		const raw = await page.$$eval('a[href*="/job/"]', (anchors) => {
			const seen = new Set<string>();
			const results: { href: string; title: string; company: string; location: string }[] = [];
			for (const a of anchors as HTMLAnchorElement[]) {
				const href = a.href.split('?')[0];
				if (!/\/job\/[A-Za-z0-9]/.test(href) || seen.has(href)) continue;
				const card = a.closest('article, li, [class*="card"], [class*="Card"]') ?? a;
				const heading = card.querySelector('h2, h3, [class*="title"], [class*="Title"]');
				const title = (heading?.textContent ?? a.textContent ?? '').trim();
				if (!title) continue;
				seen.add(href);
				const company =
					card.querySelector('[class*="company"], [class*="Company"]')?.textContent?.trim() ?? '';
				const location =
					card.querySelector('[class*="location"], [class*="Location"]')?.textContent?.trim() ?? '';
				results.push({ href, title, company, location });
			}
			return results;
		});

		return raw
			.map((r): RawListing | null => {
				const idMatch = r.href.match(/\/job\/([A-Za-z0-9_-]+)/);
				if (!idMatch) return null;
				return {
					externalId: idMatch[1],
					url: r.href,
					title: r.title,
					company: r.company || undefined,
					location: r.location || undefined
				};
			})
			.filter((x): x is RawListing => x !== null);
	}, signal);
}

export const hokify: SourceAdapter = {
	id: 'hokify',
	label: 'hokify',
	async search(profile: ProfileQuery, signal?: AbortSignal): Promise<RawListing[]> {
		const byId = new Map<string, RawListing>();
		for (const keyword of profile.keywords) {
			if (signal?.aborted) throw signal.reason;
			try {
				for (const listing of await searchKeyword(keyword, signal)) {
					byId.set(listing.externalId, listing);
				}
			} catch (err) {
				console.error(`[hokify] "${keyword}" failed:`, err);
			}
		}
		return [...byId.values()];
	}
};
