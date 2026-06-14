import { describe, expect, it } from 'vitest';
import { parseOsmBusinessTag } from '$lib/search-config';
import { GET } from './+server';

describe('GET /api/osm-tag-suggestions', () => {
	it('returns empty suggestions for too-short queries', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/osm-tag-suggestions?q=c')
		} as never);

		expect(await response.json()).toEqual({ suggestions: [] });
	});

	it('returns matching local catalog tags', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/osm-tag-suggestions?q=amenity%3Dcafe')
		} as never);

		expect(await response.json()).toEqual({
			suggestions: [
				{
					key: 'amenity',
					value: 'cafe',
					raw: 'amenity=cafe',
					label: 'Amenity: Cafe'
				}
			]
		});
	});
});

describe('parseOsmBusinessTag', () => {
	it('accepts valid manually typed key=value tags from the catalog', () => {
		expect(parseOsmBusinessTag(' amenity=cafe ')).toEqual({ key: 'amenity', value: 'cafe' });
	});

	it('rejects invalid manually typed key=value tags', () => {
		expect(parseOsmBusinessTag('amenity=not_in_catalog')).toBeNull();
	});
});
