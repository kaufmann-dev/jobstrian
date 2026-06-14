import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BUSINESS_OSM_TAGS, type OsmBusinessTag } from '$lib/search-config';
import {
	compileBusinessOverpassQueries,
	findNearbyBusinesses,
	OverpassUnavailableError
} from './overpass';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function overpassBody() {
	return {
		elements: [
			{
				type: 'node',
				id: 123,
				lat: 48.2082,
				lon: 16.3738,
				tags: {
					name: 'Cafe Central',
					amenity: 'cafe',
					'addr:street': 'Herrengasse',
					'addr:housenumber': '14',
					'addr:postcode': '1010',
					'addr:city': 'Wien',
					website: 'https://example.test',
					phone: '+431234',
					email: 'jobs@example.test'
				}
			},
			{
				type: 'way',
				id: 456,
				center: { lat: 48.21, lon: 16.37 },
				tags: {
					name: 'Way Bar',
					amenity: 'bar',
					'contact:website': 'https://way.example.test',
					'contact:phone': '+435678',
					'contact:email': 'hello@way.example.test'
				}
			},
			{
				type: 'node',
				id: 789,
				lat: 48.2,
				lon: 16.3,
				tags: { amenity: 'restaurant' }
			}
		]
	};
}

describe('business Overpass queries', () => {
	it('compiles the gastronomy defaults into amenity searches', () => {
		const [query] = compileBusinessOverpassQueries(
			48.2082,
			16.3738,
			500,
			DEFAULT_BUSINESS_OSM_TAGS
		);

		expect(query).toContain(
			'node["amenity"~"^(cafe|restaurant|bar|pub|fast_food|biergarten|ice_cream|food_court)$"]'
		);
		expect(query).toContain(
			'way["amenity"~"^(cafe|restaurant|bar|pub|fast_food|biergarten|ice_cream|food_court)$"]'
		);
	});

	it('compiles multiple OSM keys into node and way blocks', () => {
		const tags: OsmBusinessTag[] = [
			{ key: 'amenity', value: 'cafe' },
			{ key: 'shop', value: 'bakery' }
		];

		const [query] = compileBusinessOverpassQueries(48.2082, 16.3738, 500, tags);

		expect(query).toContain('node["amenity"~"^(cafe)$"]');
		expect(query).toContain('way["amenity"~"^(cafe)$"]');
		expect(query).toContain('node["shop"~"^(bakery)$"]');
		expect(query).toContain('way["shop"~"^(bakery)$"]');
	});

	it('rejects invalid tags before query generation', () => {
		expect(() =>
			compileBusinessOverpassQueries(48.2082, 16.3738, 500, [
				{ key: 'amenity', value: 'not_in_catalog' } as OsmBusinessTag
			])
		).toThrow('Invalid OSM business tag: amenity=not_in_catalog');
	});
});

describe('findNearbyBusinesses', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('parses Overpass nodes and ways into places', async () => {
		expect.assertions(2);
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(overpassBody()));
		vi.stubGlobal('fetch', fetchMock);

		const places = await findNearbyBusinesses(48.2082, 16.3738, 500, DEFAULT_BUSINESS_OSM_TAGS);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(places).toEqual([
			{
				osmId: 'node/123',
				name: 'Cafe Central',
				category: 'cafe',
				lat: 48.2082,
				lon: 16.3738,
				address: 'Herrengasse 14, 1010 Wien',
				website: 'https://example.test',
				phone: '+431234',
				email: 'jobs@example.test'
			},
			{
				osmId: 'way/456',
				name: 'Way Bar',
				category: 'bar',
				lat: 48.21,
				lon: 16.37,
				address: undefined,
				website: 'https://way.example.test',
				phone: '+435678',
				email: 'hello@way.example.test'
			}
		]);
	});

	it('retries a retryable Overpass response and returns places after success', async () => {
		expect.assertions(2);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('', { status: 504 }))
			.mockResolvedValueOnce(jsonResponse(overpassBody()));
		vi.stubGlobal('fetch', fetchMock);

		const places = await findNearbyBusinesses(48.2082, 16.3738, 500, DEFAULT_BUSINESS_OSM_TAGS);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(places.map((place) => place.osmId)).toEqual(['node/123', 'way/456']);
	});

	it('throws OverpassUnavailableError after repeated retryable responses', async () => {
		expect.assertions(2);
		const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 504 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			findNearbyBusinesses(48.2082, 16.3738, 500, DEFAULT_BUSINESS_OSM_TAGS)
		).rejects.toMatchObject({
			name: 'OverpassUnavailableError',
			message: 'Overpass -> 504',
			attempts: 3
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('throws non-retryable HTTP errors immediately', async () => {
		expect.assertions(4);
		const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 400 }));
		vi.stubGlobal('fetch', fetchMock);

		let error: unknown;
		try {
			await findNearbyBusinesses(48.2082, 16.3738, 500, DEFAULT_BUSINESS_OSM_TAGS);
		} catch (err) {
			error = err;
		}

		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(OverpassUnavailableError);
		expect((error as Error).message).toBe('Overpass -> 400');
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
