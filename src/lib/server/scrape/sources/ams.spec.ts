import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response as BrowserResponse } from 'playwright';

const { withPage } = vi.hoisted(() => ({ withPage: vi.fn() }));
vi.mock('../browser', () => ({ withPage }));

import { ams } from './ams';

describe('AMS scraper', () => {
	beforeEach(() => {
		withPage.mockReset();
	});
	afterEach(() => vi.useRealTimers());

	it('keeps configured Austrian cities outside Vienna', async () => {
		withPage.mockImplementation(async (callback) => {
			let responseHandler:
				| ((response: { url(): string; ok(): boolean; json(): Promise<unknown> }) => void)
				| undefined;
			const page = {
				on: vi.fn((_event: string, handler) => {
					responseHandler = handler;
				}),
				goto: vi.fn(),
				$: vi.fn().mockResolvedValue({ fill: vi.fn(), press: vi.fn() }),
				waitForResponse: vi.fn(async () => {
					await responseHandler?.({
						ok: () => true,
						url: () => 'https://jobs.ams.at/public/emps/api/search',
						json: async () => ({
							results: [
								{
									id: 1,
									uuid: 'a5ba55e4-d305-39fa-9651-7636becc406d',
									title: 'Office Assistenz',
									summary: '<p>Sehr gute Deutschkenntnisse erforderlich.</p>',
									company: {
										name: 'Graz GmbH',
										address: { town: 'Graz', federalState: 'Steiermark' }
									}
								},
								{
									id: 2,
									uuid: 'cc2a034f-4a4a-30c1-a5f2-e3b0c2420bf1',
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

		const { listings, complete } = await ams.search({ keywords: ['Office'], locations: ['Graz'] });

		expect(complete).toBe(true);
		expect(listings.map((listing) => listing.externalId)).toEqual([
			'a5ba55e4-d305-39fa-9651-7636becc406d'
		]);
		expect(listings[0]?.url).toBe(
			'https://jobs.ams.at/public/emps/jobs/a5ba55e4-d305-39fa-9651-7636becc406d'
		);
		expect(listings[0]?.location).toBe('Graz, Steiermark');
		expect(listings[0]?.description).toBe('Sehr gute Deutschkenntnisse erforderlich.');
		expect(listings[0]).toMatchObject({ discoveryKeyword: 'Office', discoveryCity: 'Graz' });
	});

	it('reports complete: false when browser search fails', async () => {
		withPage.mockRejectedValue(new Error('browser failed'));

		const { listings, complete } = await ams.search({ keywords: ['Office'], locations: ['Graz'] });

		expect(listings).toEqual([]);
		expect(complete).toBe(false);
	});

	it('reports complete: false when the search input is not found', async () => {
		withPage.mockImplementation(async (callback) => {
			const page = {
				on: vi.fn(),
				goto: vi.fn(),
				$: vi.fn().mockResolvedValue(null),
				waitForResponse: vi.fn().mockResolvedValue(undefined),
				waitForTimeout: vi.fn()
			};
			return callback(page);
		});

		const { listings, complete } = await ams.search({ keywords: ['Office'], locations: ['Graz'] });

		expect(listings).toEqual([]);
		expect(complete).toBe(false);
	});

	it('reports complete: false when no /api/search response is observed', async () => {
		withPage.mockImplementation(async (callback) => {
			const page = {
				on: vi.fn(),
				goto: vi.fn(),
				$: vi.fn().mockResolvedValue({ fill: vi.fn(), press: vi.fn() }),
				// Resolve without ever invoking the response handler (timeout case).
				waitForResponse: vi.fn().mockResolvedValue(undefined),
				waitForTimeout: vi.fn()
			};
			return callback(page);
		});

		const { listings, complete } = await ams.search({ keywords: ['Office'], locations: ['Graz'] });

		expect(listings).toEqual([]);
		expect(complete).toBe(false);
	});

	it('reports complete: true for a successful search with zero results', async () => {
		withPage.mockImplementation(async (callback) => {
			let responseHandler:
				| ((response: { url(): string; ok(): boolean; json(): Promise<unknown> }) => void)
				| undefined;
			const page = {
				on: vi.fn((_event: string, handler) => {
					responseHandler = handler;
				}),
				goto: vi.fn(),
				$: vi.fn().mockResolvedValue({ fill: vi.fn(), press: vi.fn() }),
				waitForResponse: vi.fn(async () => {
					await responseHandler?.({
						ok: () => true,
						url: () => 'https://jobs.ams.at/public/emps/api/search',
						json: async () => ({ results: [] })
					});
				}),
				waitForTimeout: vi.fn()
			};
			return callback(page);
		});

		const { listings, complete } = await ams.search({ keywords: ['Office'], locations: ['Graz'] });

		expect(listings).toEqual([]);
		expect(complete).toBe(true);
	});

	it('rethrows abort errors instead of returning an incomplete result', async () => {
		const abort = new Error('browser context aborted');
		withPage.mockRejectedValue(abort);

		await expect(ams.search({ keywords: ['Office'], locations: ['Graz'] })).rejects.toBe(abort);
	});

	it.each(['rate-limit', 'invalid-json'])(
		'recovers from a %s API response without retaining a warning',
		async (failure) => {
			vi.useFakeTimers();
			let attempt = 0;
			withPage.mockImplementation(async (callback) => {
				const first = ++attempt === 1;
				let responseHandler!: (response: BrowserResponse) => void;
				return callback({
					on: (_event: string, handler: typeof responseHandler) => {
						responseHandler = handler;
					},
					goto: vi.fn(),
					$: async () => ({ fill: vi.fn(), press: vi.fn() }),
					waitForResponse: async () =>
						responseHandler({
							url: () => 'https://jobs.ams.at/public/emps/api/search',
							ok: () => !(first && failure === 'rate-limit'),
							status: () => 429,
							headers: () => ({ 'retry-after': '2' }),
							json: async () => (first && failure === 'invalid-json' ? {} : { results: [] })
						} as unknown as BrowserResponse),
					waitForTimeout: vi.fn()
				});
			});
			const pending = ams.search({ keywords: ['Office'], locations: ['Graz'] });
			await vi.advanceTimersByTimeAsync(2500);
			expect(await pending).toEqual({ listings: [], complete: true, failureReasons: [] });
			expect(attempt).toBe(2);
		}
	);
});
