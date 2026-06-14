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

export interface SourceAdapter {
	id: string;
	label: string;
	/**
	 * Search the portal for matching listings. Must never throw — catch
	 * internally, log, and return whatever was gathered.
	 */
	search(profile: ProfileQuery, signal?: AbortSignal): Promise<RawListing[]>;
}
