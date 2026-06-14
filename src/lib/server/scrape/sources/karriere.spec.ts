import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchText } from '../../util/http';
import { karriere } from './karriere';

vi.mock('../../util/http', () => ({
	fetchText: vi.fn()
}));

const fetchTextMock = vi.mocked(fetchText);

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
	});

	it('searches every configured city for every keyword', async () => {
		fetchTextMock.mockResolvedValue(resultHtml);

		const listings = await karriere.search({
			keywords: ['Office Assistenz', 'Verkauf'],
			locations: ['Wien', 'Graz']
		});

		expect(fetchTextMock).toHaveBeenCalledTimes(4);
		expect(fetchTextMock).toHaveBeenCalledWith(
			'https://www.karriere.at/jobs/office-assistenz/graz',
			expect.any(Object)
		);
		expect(listings).toHaveLength(1);
		expect(listings[0]).toMatchObject({
			discoveryKeyword: 'Verkauf',
			discoveryCity: 'Graz'
		});
	});
});
