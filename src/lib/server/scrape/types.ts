export interface ProfileQuery {
	/** Job keywords to search for, e.g. ["Pflegeassistenz", "Verkauf"]. */
	keywords: string[];
	/** Austrian city names to search/filter by, e.g. ["Wien", "Graz"]. */
	locations: string[];
}

export interface RawListing {
	externalId: string;
	url: string;
	title: string;
	company?: string;
	location?: string;
	description?: string;
	salary?: string;
	postedAt?: Date;
	discoveryKeyword?: string;
	discoveryCity?: string;
}

export interface ScrapeResult {
	listings: RawListing[];
	/**
	 * false when any fetch was caught/swallowed this run, so the results may be
	 * incomplete. The runner only reconciles (closes vanished listings for) a
	 * source that reported `complete: true`.
	 */
	complete: boolean;
}

export interface SourceAdapter {
	id: string;
	label: string;
	/**
	 * Search the portal for matching listings. Must never throw — catch
	 * internally, log, set `complete = false`, and return whatever was gathered.
	 * Re-throw only on abort.
	 */
	search(profile: ProfileQuery, signal?: AbortSignal): Promise<ScrapeResult>;
	/**
	 * Fetch the full job-ad body text for a single listing's detail page.
	 * Returns normalized plain text, or null when no description is available.
	 * Only implemented by sources whose search results lack the body; omit it
	 * when the description already comes from `search` (e.g. AMS).
	 */
	fetchDescription?(url: string, signal?: AbortSignal): Promise<string | null>;
}
