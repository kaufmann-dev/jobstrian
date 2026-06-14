import { beforeEach, describe, expect, it, vi } from 'vitest';

const { withPage } = vi.hoisted(() => ({ withPage: vi.fn() }));
vi.mock('../browser', () => ({ withPage }));

import { ams } from './ams';

describe('AMS scraper', () => {
	beforeEach(() => {
		withPage.mockReset();
	});

	it('keeps configured Austrian cities outside Vienna', async () => {
		withPage.mockImplementation(async (callback) => {
			let responseHandler:
				| ((response: { url(): string; json(): Promise<unknown> }) => void)
				| undefined;
			const page = {
				on: vi.fn((_event: string, handler) => {
					responseHandler = handler;
				}),
				goto: vi.fn(),
				$: vi.fn().mockResolvedValue({ fill: vi.fn(), press: vi.fn() }),
				waitForResponse: vi.fn(async () => {
					await responseHandler?.({
						url: () => 'https://jobs.ams.at/public/emps/api/search',
						json: async () => ({
							results: [
								{
									id: 1,
									title: 'Office Assistenz',
									company: {
										name: 'Graz GmbH',
										address: { town: 'Graz', federalState: 'Steiermark' }
									}
								},
								{
									id: 2,
									title: 'Office Assistenz',
									company: { name: 'Wien GmbH', address: { town: 'Wien', federalState: 'Wien' } }
								}
							]
						})
					});
				}),
				waitForTimeout: vi.fn()
			};
			return callback(page);
		});

		const listings = await ams.search({ keywords: ['Office'], locations: ['Graz'] });

		expect(listings.map((listing) => listing.externalId)).toEqual(['1']);
		expect(listings[0]?.location).toBe('Graz, Steiermark');
		expect(listings[0]).toMatchObject({ discoveryKeyword: 'Office', discoveryCity: 'Graz' });
	});
});
