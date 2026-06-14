import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	searchAustrianAddresses,
	searchAustrianCities,
	validateAustrianAddress
} from './nominatim';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('Austria-only Nominatim normalization', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('normalizes an Austrian address with city', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse([
				{
					place_id: 123,
					display_name: 'Herrengasse 14, 1010 Wien, Österreich',
					lat: '48.2101',
					lon: '16.3652',
					address: {
						country_code: 'at',
						road: 'Herrengasse',
						house_number: '14',
						city: 'Wien',
						postcode: '1010'
					}
				}
			])
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(validateAustrianAddress('Herrengasse 14 Wien')).resolves.toEqual({
			label: 'Herrengasse 14, 1010 Wien',
			lat: 48.2101,
			lon: 16.3652,
			city: 'Wien',
			postcode: '1010',
			placeId: 123
		});
		expect(fetchMock.mock.calls[0]?.[0]).toContain('countrycodes=at');
		expect(fetchMock.mock.calls[0]?.[0]).toContain('addressdetails=1');
	});

	it('normalizes an Austrian municipality without city', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				jsonResponse([
					{
						place_id: 456,
						display_name: 'Hallstatt, Bezirk Gmunden, Österreich',
						lat: '47.5622',
						lon: '13.6493',
						address: { country_code: 'at', municipality: 'Hallstatt', postcode: '4830' }
					}
				])
			)
		);

		await expect(searchAustrianCities('Hallstatt')).resolves.toEqual([
			{
				label: 'Hallstatt (4830)',
				lat: 47.5622,
				lon: 13.6493,
				city: 'Hallstatt',
				postcode: '4830',
				placeId: 456
			}
		]);
	});

	it('returns null when there are no results', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])));

		await expect(validateAustrianAddress('missing')).resolves.toBeNull();
	});

	it('rejects a non-Austrian result', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				jsonResponse([
					{
						place_id: 789,
						display_name: 'Berlin, Deutschland',
						lat: '52.52',
						lon: '13.405',
						address: { country_code: 'de', city: 'Berlin' }
					}
				])
			)
		);

		await expect(searchAustrianAddresses('Berlin')).resolves.toEqual([]);
	});
});
