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
			location: 'Wien'
		});

		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://hokify.at/jobs/m/service-hilfskraft/wien',
			expect.objectContaining({
				timeoutMs: 20_000,
				headers: { 'accept-language': 'de-AT,de;q=0.9' }
			})
		);
		expect(listings).toEqual([
			{
				externalId: '27309889',
				url: 'https://hokify.at/job/27309889',
				title: 'Service- & Buffet Mitarbeiter/in',
				company: 'GIGERL – DER STADTHEURIGE',
				location: 'Wien'
			},
			{
				externalId: '28974126',
				url: 'https://hokify.at/job/28974126',
				title: 'Bar Assistant / Barback',
				company: 'Topgolf Wien',
				location: 'Brunn am Gebirge'
			}
		]);
	});

	it('deduplicates results across keywords', async () => {
		fetchTextMock.mockResolvedValue(resultHtml);

		const listings = await hokify.search({
			keywords: ['Barista', 'Kellner'],
			location: 'Wien'
		});

		expect(fetchTextMock).toHaveBeenCalledTimes(2);
		expect(listings).toHaveLength(2);
	});
});
