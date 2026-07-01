export function normalizeWebsiteUrl(website: string): URL | null {
	const trimmed = website.trim();
	if (!trimmed) return null;
	const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
	if (schemeMatch) {
		const scheme = schemeMatch[1].toLowerCase();
		if (scheme !== 'http' && scheme !== 'https') return null;
	}
	for (const candidate of [trimmed, `https://${trimmed}`]) {
		try {
			const url = new URL(candidate);
			if (
				(url.protocol === 'http:' || url.protocol === 'https:') &&
				(url.hostname.includes('.') || url.hostname === 'localhost')
			)
				return url;
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}
