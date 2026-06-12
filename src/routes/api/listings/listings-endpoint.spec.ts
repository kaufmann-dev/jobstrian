import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getListingPage } = vi.hoisted(() => ({ getListingPage: vi.fn() }));
vi.mock('$lib/server/list-pages', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/list-pages')>();
	return { ...actual, getListingPage };
});

import { GET } from './+server';

describe('GET /api/listings', () => {
	beforeEach(() => {
		getListingPage.mockReset();
	});

	it('passes a cursor through without triggering the former boolean-comparison 500', async () => {
		getListingPage.mockResolvedValue({ items: [], nextCursor: null, matchingTotal: 0, total: 0 });
		const url = new URL('http://localhost/api/listings?cursor=valid&sort=recommended');
		const response = await GET({ url } as never);
		expect(response.status).toBe(200);
		expect(getListingPage).toHaveBeenCalledWith(
			expect.objectContaining({ sort: 'recommended' }),
			'valid'
		);
	});

	it('logs server failures and returns a clear JSON error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		getListingPage.mockRejectedValue(new Error('database failed'));
		const response = await GET({ url: new URL('http://localhost/api/listings') } as never);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ message: 'Stellen konnten nicht geladen werden.' });
		expect(console.error).toHaveBeenCalled();
	});
});
