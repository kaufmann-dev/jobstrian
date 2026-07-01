import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchText, politeFetch } from '../../util/http';
import { hokify } from './hokify';

vi.mock('../../util/http', () => ({
	fetchText: vi.fn(),
	politeFetch: vi.fn()
}));

const fetchTextMock = vi.mocked(fetchText);
const politeFetchMock = vi.mocked(politeFetch);

const resultHtml = `
	<ul>
		<li>
			<a class="inline text-start" href="/job/27309889?source=search">Service- &amp; Buffet Mitarbeiter/in</a>
			<a data-cy="companyName" href="/c/gigerl">GIGERL – DER STADTHEURIGE</a>
			<a href="/Wien-Jobs">Wien</a>
		</li>
		<li>
			<a class="inline text-start" href="/job/27309889">Duplicate result</a>
		</li>
		<li>
			<a class="inline text-start" href="/job/28974126">Bar Assistant / Barback</a>
			<a data-cy="companyName" href="/c/topgolf">Topgolf Wien</a>
			<a href="/Brunn-am-Gebirge-Jobs">Brunn am Gebirge</a>
		</li>
		<li><a class="inline text-start" href="/job/invalid id">Malformed ID</a></li>
		<li><a class="inline text-start" href="/job/123"></a></li>
	</ul>
`;

describe('hokify scraper', () => {
	beforeEach(() => {
		fetchTextMock.mockReset();
		politeFetchMock.mockReset();
	});

	it('uses the current search route and parses server-rendered job cards', async () => {
		fetchTextMock.mockResolvedValue(resultHtml);

		const { listings, complete } = await hokify.search({
			keywords: ['Service Hilfskraft'],
			locations: ['Wien']
		});

		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://hokify.at/jobs?branch=service-hilfskraft&city=wien',
			expect.objectContaining({
				timeoutMs: 20_000,
				headers: { 'accept-language': 'de-AT,de;q=0.9' }
			})
		);
		expect(complete).toBe(true);
		// "Brunn am Gebirge" is dropped: it does not match the configured city.
		expect(listings).toEqual([
			{
				externalId: '27309889',
				url: 'https://hokify.at/job/27309889',
				title: 'Service- & Buffet Mitarbeiter/in',
				company: 'GIGERL – DER STADTHEURIGE',
				location: 'Wien',
				discoveryKeyword: 'Service Hilfskraft',
				discoveryCity: 'Wien'
			}
		]);
	});

	it('deduplicates results across keywords', async () => {
		fetchTextMock.mockResolvedValue(resultHtml);

		const { listings } = await hokify.search({
			keywords: ['Barista', 'Kellner'],
			locations: ['Wien']
		});

		expect(fetchTextMock).toHaveBeenCalledTimes(2);
		// Only the Wien result survives the city filter.
		expect(listings).toHaveLength(1);
	});

	it('searches every configured city for every keyword', async () => {
		fetchTextMock.mockResolvedValue(resultHtml);

		await hokify.search({
			keywords: ['Barista', 'Kellner'],
			locations: ['Wien', 'Graz']
		});

		expect(fetchTextMock).toHaveBeenCalledTimes(4);
		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://hokify.at/jobs?branch=barista&city=graz',
			expect.any(Object)
		);
	});

	it('reports complete: false when any city/keyword fetch fails', async () => {
		fetchTextMock.mockResolvedValueOnce(resultHtml).mockRejectedValueOnce(new Error('timeout'));

		const { listings, complete } = await hokify.search({
			keywords: ['Barista', 'Kellner'],
			locations: ['Wien']
		});

		// The successful first fetch still yields its Wien listing...
		expect(listings).toHaveLength(1);
		// ...but the failed second fetch marks the run incomplete.
		expect(complete).toBe(false);
	});

	it('rethrows abort errors instead of returning an incomplete result', async () => {
		const abort = new DOMException('The operation was aborted.', 'AbortError');
		fetchTextMock.mockRejectedValue(abort);

		await expect(hokify.search({ keywords: ['Barista'], locations: ['Wien'] })).rejects.toBe(abort);
	});

	it('extracts the detail-page description from the microdata container', async () => {
		fetchTextMock.mockResolvedValue(
			`<main><div itemprop="description"><h2>Aufgaben</h2><p>Sehr gute Deutschkenntnisse&nbsp;(B2) erforderlich.</p></div></main>`
		);

		const description = await hokify.fetchDescription!('https://hokify.at/job/27309889');

		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://hokify.at/job/27309889',
			expect.objectContaining({ headers: { 'accept-language': 'de-AT,de;q=0.9' } })
		);
		expect(description).toBe('Aufgaben Sehr gute Deutschkenntnisse (B2) erforderlich.');
	});

	it('returns null when the detail page has no description container', async () => {
		fetchTextMock.mockResolvedValue('<main><p>kein Beschreibungstext</p></main>');

		expect(await hokify.fetchDescription!('https://hokify.at/job/123')).toBeNull();
	});

	it('closes a listing only when the detail page is confirmed gone', async () => {
		politeFetchMock.mockResolvedValue({
			status: 404,
			ok: false,
			redirected: false,
			url: 'https://hokify.at/job/1',
			body: null
		} as Response);
		await expect(hokify.isListingGone!('https://hokify.at/job/1')).resolves.toBe(true);

		politeFetchMock.mockResolvedValue({
			status: 200,
			ok: true,
			redirected: false,
			url: 'https://hokify.at/job/1',
			body: null
		} as Response);
		await expect(hokify.isListingGone!('https://hokify.at/job/1')).resolves.toBe(false);

		politeFetchMock.mockResolvedValue({
			status: 200,
			ok: true,
			redirected: true,
			url: 'https://hokify.at/jobs',
			body: null
		} as Response);
		await expect(hokify.isListingGone!('https://hokify.at/job/1')).resolves.toBe(true);
	});
});
