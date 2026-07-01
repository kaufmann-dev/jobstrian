import { beforeEach, describe, expect, it, vi } from 'vitest';
import { politeFetch } from '../../util/http';
import { detailPageGone } from './liveness';

vi.mock('../../util/http', () => ({
	politeFetch: vi.fn()
}));

const politeFetchMock = vi.mocked(politeFetch);

function response(input: { status: number; url: string; redirected?: boolean }): Response {
	return {
		status: input.status,
		ok: input.status >= 200 && input.status < 300,
		redirected: input.redirected ?? false,
		url: input.url,
		body: null
	} as Response;
}

const isDetail = (finalUrl: URL) => finalUrl.pathname.startsWith('/job/');

describe('detailPageGone', () => {
	beforeEach(() => {
		politeFetchMock.mockReset();
	});

	it.each([404, 410, 422])('reports gone on status %i', async (status) => {
		politeFetchMock.mockResolvedValue(response({ status, url: 'https://portal.at/job/1' }));
		await expect(detailPageGone('https://portal.at/job/1', isDetail)).resolves.toBe(true);
	});

	it('reports still online for a plain 200 on the detail page', async () => {
		politeFetchMock.mockResolvedValue(response({ status: 200, url: 'https://portal.at/job/1' }));
		await expect(detailPageGone('https://portal.at/job/1', isDetail)).resolves.toBe(false);
	});

	it('reports gone when redirected away from the detail route', async () => {
		politeFetchMock.mockResolvedValue(
			response({ status: 200, url: 'https://portal.at/suche?expired=true', redirected: true })
		);
		await expect(detailPageGone('https://portal.at/job/1', isDetail)).resolves.toBe(true);
	});

	it('reports still online when redirected to a canonical detail URL', async () => {
		politeFetchMock.mockResolvedValue(
			response({ status: 200, url: 'https://portal.at/job/1-canonical', redirected: true })
		);
		await expect(detailPageGone('https://portal.at/job/1', isDetail)).resolves.toBe(false);
	});

	it.each([403, 429, 500, 503])('throws on indeterminate status %i', async (status) => {
		politeFetchMock.mockResolvedValue(response({ status, url: 'https://portal.at/job/1' }));
		await expect(detailPageGone('https://portal.at/job/1', isDetail)).rejects.toThrow(
			`Verfügbarkeitsprüfung fehlgeschlagen: https://portal.at/job/1 -> ${status}`
		);
	});

	it('cancels the response body to release the connection', async () => {
		const cancel = vi.fn().mockResolvedValue(undefined);
		politeFetchMock.mockResolvedValue({
			status: 200,
			ok: true,
			redirected: false,
			url: 'https://portal.at/job/1',
			body: { cancel }
		} as unknown as Response);
		await detailPageGone('https://portal.at/job/1', isDetail);
		expect(cancel).toHaveBeenCalledOnce();
	});
});
