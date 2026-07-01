import { politeFetch } from '../../util/http';

const GONE_STATUSES = new Set([404, 410, 422]);

/**
 * Check a listing's own detail page and report whether the ad is definitely
 * gone. Search results only cover the first page of each portal, so a listing
 * missing from a run's results may still be online — only the detail page can
 * confirm the difference.
 *
 * Returns true when the portal confirms the ad no longer exists (4xx "gone"
 * status or a redirect away from the detail route), false when the ad is still
 * reachable. Throws on network errors and indeterminate statuses (403, 5xx,
 * rate limits) so the caller keeps the listing active and re-checks next run.
 */
export async function detailPageGone(
	url: string,
	isDetailUrl: (finalUrl: URL) => boolean,
	signal?: AbortSignal
): Promise<boolean> {
	const res = await politeFetch(url, {
		timeoutMs: 20_000,
		headers: { 'accept-language': 'de-AT,de;q=0.9' },
		signal
	});
	await res.body?.cancel().catch(() => {});
	if (GONE_STATUSES.has(res.status)) return true;
	if (res.ok) return res.redirected && !isDetailUrl(new URL(res.url));
	throw new Error(`Verfügbarkeitsprüfung fehlgeschlagen: ${url} -> ${res.status}`);
}
