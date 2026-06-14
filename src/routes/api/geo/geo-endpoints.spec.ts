import { beforeEach, describe, expect, it, vi } from 'vitest';

const { geoSuggestions } = vi.hoisted(() => ({ geoSuggestions: vi.fn() }));
vi.mock('$lib/server/geo/geoapify', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/geo/geoapify')>()),
	geoSuggestions
}));

import { GET } from './suggestions/+server';

describe('GET /api/geo/suggestions', () => {
	beforeEach(() => geoSuggestions.mockReset());

	it('requires a supported kind', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/geo/suggestions?kind=country&q=Wien')
		} as never);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: 'invalid_query' });
	});

	it('returns normalized suggestions', async () => {
		geoSuggestions.mockResolvedValue([{ id: '1', label: 'Wien' }]);
		const response = await GET({
			url: new URL('http://localhost/api/geo/suggestions?kind=city&q=Wien')
		} as never);
		expect(await response.json()).toEqual({ suggestions: [{ id: '1', label: 'Wien' }] });
		expect(geoSuggestions).toHaveBeenCalledWith('Wien', 'city');
	});
});
