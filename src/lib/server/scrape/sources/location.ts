/** Normalize a location string for diacritic- and punctuation-insensitive comparison. */
export function normalizeLocation(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export interface LocationMatch {
	/** The configured city that matched. */
	city: string;
	/** Display location with the matched part moved to the front. */
	location: string;
}

/**
 * Keep a listing only if one of its location parts contains a configured city.
 * A portal may list several cities for one job (e.g. "Villach", "Wien", "Linz");
 * the job is kept when any part matches, and the matched part is moved to the
 * front of the display string so the listing reads as the city the user searched
 * for. Returns null when no part matches.
 */
export function matchLocation(
	parts: readonly string[],
	cities: readonly string[],
	separator = ' · '
): LocationMatch | null {
	const cleaned = parts.map((part) => part.replace(/,+\s*$/, '').trim()).filter(Boolean);
	for (let i = 0; i < cleaned.length; i++) {
		const normalized = normalizeLocation(cleaned[i]);
		const city = cities.find((candidate) => {
			const normalizedCity = normalizeLocation(candidate);
			return normalizedCity.length > 0 && normalized.includes(normalizedCity);
		});
		if (city) {
			const reordered = [cleaned[i], ...cleaned.slice(0, i), ...cleaned.slice(i + 1)];
			return { city, location: reordered.join(separator) };
		}
	}
	return null;
}
