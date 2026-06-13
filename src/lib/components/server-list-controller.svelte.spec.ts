import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerListController } from './server-list-controller.svelte.js';

function response(items: number[], nextCursor: string | null = null): Response {
	return new Response(JSON.stringify({ items, nextCursor, matchingTotal: 75, total: 100 }));
}

describe('ServerListController', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('resets rows and cursor when filters, search, or sort change', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(response([10, 11], 'second'))
			.mockResolvedValueOnce(response([20], null));
		const controller = new ServerListController('/api/items', {
			items: [1, 2],
			nextCursor: 'old',
			matchingTotal: 75,
			total: 100
		});

		await controller.reset({ search: 'Wien', sort: 'posted-desc', source: 'ams' });
		expect(controller.items).toEqual([10, 11]);
		expect(controller.nextCursor).toBe('second');
		await controller.reset({ search: 'Graz' });
		expect(controller.items).toEqual([20]);
		expect(controller.nextCursor).toBeNull();
		expect(fetchMock.mock.calls[0]?.[0]).toContain('search=Wien');
		expect(fetchMock.mock.calls[0]?.[0]).toContain('sort=posted-desc');
	});

	it('removes the search parameter and restores unfiltered rows when search is cleared', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([1, 2], null));
		const controller = new ServerListController(
			'/api/items',
			{ items: [9], nextCursor: null, matchingTotal: 1, total: 100 },
			{ search: 'Wien', sort: 'recommended' }
		);

		await controller.reset({ search: '' });

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/items?sort=recommended');
		expect(controller.items).toEqual([1, 2]);
		expect(controller.error).toBe('');
	});

	it('only fetches subsequent rows when loadMore is called', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([3], null));
		const controller = new ServerListController('/api/items', {
			items: [1, 2],
			nextCursor: 'next',
			matchingTotal: 3,
			total: 3
		});

		expect(fetchMock).not.toHaveBeenCalled();
		await controller.loadMore();
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock.mock.calls[0]?.[0]).toContain('cursor=next');
		expect(controller.items).toEqual([1, 2, 3]);
	});
});
