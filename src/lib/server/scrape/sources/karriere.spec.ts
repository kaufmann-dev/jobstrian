import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchText, politeFetch } from '../../util/http';
import { karriere } from './karriere';

vi.mock('../../util/http', () => ({
	fetchText: vi.fn(),
	politeFetch: vi.fn()
}));

const fetchTextMock = vi.mocked(fetchText);
const politeFetchMock = vi.mocked(politeFetch);

const resultHtml = `
	<div class="m-jobsListItem">
		<a class="m-jobsListItem__titleLink" href="/jobs/123456">Office Assistenz</a>
		<div class="m-jobsListItem__companyName">Test GmbH</div>
		<div class="m-jobsListItem__location">Graz</div>
	</div>
`;

describe('karriere scraper', () => {
	beforeEach(() => {
		fetchTextMock.mockReset();
		politeFetchMock.mockReset();
	});

	it('searches every configured city for every keyword', async () => {
		fetchTextMock.mockResolvedValue(resultHtml);

		const { listings, complete } = await karriere.search({
			keywords: ['Office Assistenz', 'Verkauf'],
			locations: ['Wien', 'Graz']
		});

		expect(fetchTextMock).toHaveBeenCalledTimes(4);
		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://www.karriere.at/jobs/office-assistenz/graz',
			expect.any(Object)
		);
		expect(complete).toBe(true);
		expect(listings).toHaveLength(1);
		expect(listings[0]).toMatchObject({
			discoveryKeyword: 'Verkauf',
			discoveryCity: 'Graz'
		});
	});

	it('reports complete: false when any city/keyword fetch fails', async () => {
		fetchTextMock.mockResolvedValueOnce(resultHtml).mockRejectedValueOnce(new Error('timeout'));

		const { listings, complete } = await karriere.search({
			keywords: ['Office Assistenz', 'Verkauf'],
			locations: ['Graz']
		});

		expect(listings).toHaveLength(1);
		expect(complete).toBe(false);
	});

	it('rethrows abort errors instead of returning an incomplete result', async () => {
		const abort = new DOMException('signal is aborted', 'AbortError');
		fetchTextMock.mockRejectedValue(abort);

		await expect(
			karriere.search({ keywords: ['Office Assistenz'], locations: ['Graz'] })
		).rejects.toBe(abort);
	});

	it('extracts the detail description from JSON-LD JobPosting', async () => {
		fetchTextMock.mockResolvedValue(`
			<script type="application/ld+json">${JSON.stringify({
				'@graph': [
					{ '@type': 'WebPage', name: 'irrelevant' },
					{ '@type': 'JobPosting', description: '<p>Aufgaben</p><ul><li>Deutsch B2</li></ul>' }
				]
			})}</script>
		`);

		const description = await karriere.fetchDescription!('https://www.karriere.at/jobs/123456');

		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://www.karriere.at/jobs/123456',
			expect.objectContaining({ headers: { 'accept-language': 'de-AT,de;q=0.9' } })
		);
		expect(description).toBe('Aufgaben Deutsch B2');
	});

	it('returns null when no JSON-LD JobPosting is present', async () => {
		fetchTextMock.mockResolvedValue(
			'<script type="application/ld+json">{"@type":"WebPage"}</script>'
		);

		expect(await karriere.fetchDescription!('https://www.karriere.at/jobs/1')).toBeNull();
	});

	it('closes a listing only when the detail page is confirmed gone', async () => {
		politeFetchMock.mockResolvedValue({
			status: 404,
			ok: false,
			redirected: false,
			url: 'https://www.karriere.at/jobs/123',
			body: null
		} as Response);
		await expect(karriere.isListingGone!('https://www.karriere.at/jobs/123')).resolves.toBe(true);

		politeFetchMock.mockResolvedValue({
			status: 200,
			ok: true,
			redirected: false,
			url: 'https://www.karriere.at/jobs/123',
			body: null
		} as Response);
		await expect(karriere.isListingGone!('https://www.karriere.at/jobs/123')).resolves.toBe(false);

		politeFetchMock.mockResolvedValue({
			status: 200,
			ok: true,
			redirected: true,
			url: 'https://www.karriere.at/jobs/koch/wien',
			body: null
		} as Response);
		await expect(karriere.isListingGone!('https://www.karriere.at/jobs/123')).resolves.toBe(true);
	});
});
