import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchText } from '../../util/http';
import { willhaben } from './willhaben';

vi.mock('../../util/http', () => ({
	fetchText: vi.fn()
}));

const fetchTextMock = vi.mocked(fetchText);

function page(entries: unknown[]): string {
	return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
		props: { pageProps: { jobsSearchResultRoot: { data: { entries } } } }
	})}</script>`;
}

describe('willhaben scraper', () => {
	beforeEach(() => {
		fetchTextMock.mockReset();
	});

	it('searches by keyword without Vienna area id and filters parsed cities', async () => {
		fetchTextMock.mockResolvedValue(
			page([
				{
					id: 1,
					title: 'Verkauf',
					slugTitle: 'verkauf',
					company: { title: 'Shop Graz' },
					jobLocations: [{ name: 'Graz' }]
				},
				{
					id: 2,
					title: 'Verkauf',
					slugTitle: 'verkauf',
					company: { title: 'Shop Wien' },
					jobLocations: [{ name: 'Wien' }]
				}
			])
		);

		const { listings, complete } = await willhaben.search({
			keywords: ['Verkauf'],
			locations: ['Graz']
		});

		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://www.willhaben.at/jobs/suche?keyword=Verkauf',
			expect.any(Object)
		);
		expect(fetchTextMock.mock.calls[0]?.[0]).not.toContain('areaId=900');
		expect(complete).toBe(true);
		expect(listings.map((listing) => listing.externalId)).toEqual(['1']);
		expect(listings[0]).toMatchObject({ discoveryKeyword: 'Verkauf', discoveryCity: 'Graz' });
	});

	it('reports complete: false when a keyword fetch fails', async () => {
		fetchTextMock.mockRejectedValue(new Error('network down'));

		const { listings, complete } = await willhaben.search({
			keywords: ['Verkauf'],
			locations: ['Graz']
		});

		expect(complete).toBe(false);
		expect(listings).toEqual([]);
	});

	it('maps the list-level description when present (sponsored top job)', async () => {
		fetchTextMock.mockResolvedValue(
			page([
				{
					id: 1,
					title: 'Verkauf',
					slugTitle: 'verkauf',
					company: { title: 'Shop Graz' },
					jobLocations: [{ name: 'Graz' }],
					description: 'Ihr Profil\n* Gute  Deutschkenntnisse'
				}
			])
		);

		const { listings } = await willhaben.search({ keywords: ['Verkauf'], locations: ['Graz'] });

		expect(listings[0]?.description).toBe('Ihr Profil * Gute Deutschkenntnisse');
	});

	it('fetches the detail-page description from __NEXT_DATA__', async () => {
		fetchTextMock.mockResolvedValue(
			`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
				props: {
					pageProps: {
						jobAdvertDetailsRoot: { data: { description: '<p>Aufgaben</p><p>Deutsch B2</p>' } }
					}
				}
			})}</script>`
		);

		const description = await willhaben.fetchDescription!(
			'https://www.willhaben.at/jobs/job/verkauf/1'
		);

		expect(description).toBe('Aufgaben Deutsch B2');
	});
});
