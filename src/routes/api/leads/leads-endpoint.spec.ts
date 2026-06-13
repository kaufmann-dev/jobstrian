import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getLeadPage } = vi.hoisted(() => ({ getLeadPage: vi.fn() }));
vi.mock('$lib/server/list-pages', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/list-pages')>();
	return { ...actual, getLeadPage };
});

import { GET } from './+server';

describe('GET /api/leads', () => {
	beforeEach(() => {
		getLeadPage.mockReset();
	});

	it('passes search and sort to the list query', async () => {
		getLeadPage.mockResolvedValue({ items: [], nextCursor: null, matchingTotal: 0, total: 0 });
		const url = new URL('http://localhost/api/leads?search=cafe&sort=name-asc');
		const response = await GET({ url } as never);
		expect(response.status).toBe(200);
		expect(getLeadPage).toHaveBeenCalledWith(
			expect.objectContaining({ search: 'cafe', sort: 'name-asc' }),
			null
		);
	});

	it('treats an empty search as an unfiltered request', async () => {
		getLeadPage.mockResolvedValue({ items: [], nextCursor: null, matchingTotal: 0, total: 0 });
		const response = await GET({
			url: new URL('http://localhost/api/leads?search=&sort=recommended')
		} as never);

		expect(response.status).toBe(200);
		expect(getLeadPage).toHaveBeenCalledWith(expect.objectContaining({ search: '' }), null);
	});

	it('returns a clear JSON error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		getLeadPage.mockRejectedValue(new Error('database failed'));
		const response = await GET({ url: new URL('http://localhost/api/leads') } as never);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ message: 'Betriebe konnten nicht geladen werden.' });
	});
});
