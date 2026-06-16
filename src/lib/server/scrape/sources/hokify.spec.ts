import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchText } from '../../util/http';
import { hokify } from './hokify';

vi.mock('../../util/http', () => ({
	fetchText: vi.fn()
}));

const fetchTextMock = vi.mocked(fetchText);

const resultHtml = `
	<ul>
		<li>
			<h2><a href="/job/27309889?source=search">Service- &amp; Buffet Mitarbeiter/in</a></h2>
			<a data-cy="companyName" href="/c/gigerl">GIGERL – DER STADTHEURIGE</a>
			<a href="/Wien-Jobs">Wien</a>
		</li>
		<li>
			<h2><a href="/job/27309889">Duplicate result</a></h2>
		</li>
		<li>
			<h2><a href="/job/28974126">Bar Assistant / Barback</a></h2>
			<a data-cy="companyName" href="/c/topgolf">Topgolf Wien</a>
			<a href="/Brunn-am-Gebirge-Jobs">Brunn am Gebirge</a>
		</li>
		<li><h2><a href="/job/invalid id">Malformed ID</a></h2></li>
		<li><h2><a href="/job/123"></a></h2></li>
	</ul>
`;

describe('hokify scraper', () => {
	beforeEach(() => {
		fetchTextMock.mockReset();
	});

	it('uses the current search route and parses server-rendered job cards', async () => {
		fetchTextMock.mockResolvedValue(resultHtml);

		const listings = await hokify.search({
			keywords: ['Service Hilfskraft'],
			locations: ['Wien']
		});

		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://hokify.at/jobs/m/service-hilfskraft/wien',
			expect.objectContaining({
				timeoutMs: 20_000,
				headers: { 'accept-language': 'de-AT,de;q=0.9' }
			})
		);
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

		const listings = await hokify.search({
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
			'https://hokify.at/jobs/m/barista/graz',
			expect.any(Object)
		);
	});
});
