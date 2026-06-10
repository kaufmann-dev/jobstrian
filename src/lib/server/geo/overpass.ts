import { USER_AGENT } from '../util/http';

export interface OverpassPlace {
	osmId: string; // e.g. "node/123"
	name: string;
	category: string;
	lat: number;
	lon: number;
	address?: string;
	website?: string;
	phone?: string;
	email?: string;
}

interface OverpassElement {
	type: string;
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

// Gastronomy amenities we treat as potential employers.
const AMENITIES = 'cafe|restaurant|bar|pub|fast_food|biergarten|ice_cream|food_court';

function buildAddress(tags: Record<string, string>): string | undefined {
	const street = tags['addr:street'];
	const num = tags['addr:housenumber'];
	const postcode = tags['addr:postcode'];
	const city = tags['addr:city'];
	const line1 = [street, num].filter(Boolean).join(' ');
	const line2 = [postcode, city].filter(Boolean).join(' ');
	const full = [line1, line2].filter(Boolean).join(', ');
	return full || undefined;
}

/** Query gastronomy POIs within `radius` metres of (lat, lon). */
export async function findNearbyGastronomy(
	lat: number,
	lon: number,
	radius: number,
	signal?: AbortSignal
): Promise<OverpassPlace[]> {
	const query = `[out:json][timeout:60];
(
  node["amenity"~"${AMENITIES}"](around:${radius},${lat},${lon});
  way["amenity"~"${AMENITIES}"](around:${radius},${lat},${lon});
);
out center tags;`;

	const response = await fetch(OVERPASS_ENDPOINT, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			'user-agent': USER_AGENT
		},
		body: 'data=' + encodeURIComponent(query),
		signal
	});
	if (!response.ok) throw new Error(`Overpass -> ${response.status}`);
	const data = (await response.json()) as { elements: OverpassElement[] };

	const places: OverpassPlace[] = [];
	for (const el of data.elements) {
		const tags = el.tags ?? {};
		const name = tags.name;
		if (!name) continue;
		const coord = el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : el.center;
		if (!coord) continue;
		places.push({
			osmId: `${el.type}/${el.id}`,
			name,
			category: tags.amenity ?? 'gastronomy',
			lat: coord.lat,
			lon: coord.lon,
			address: buildAddress(tags),
			website: tags.website ?? tags['contact:website'],
			phone: tags.phone ?? tags['contact:phone'],
			email: tags.email ?? tags['contact:email']
		});
	}
	return places;
}
