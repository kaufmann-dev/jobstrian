export interface ProfileQuery {
	/** Role keywords to search for, e.g. ["Barista", "Kellner"]. */
	keywords: string[];
	/** Location term, e.g. "Wien". */
	location: string;
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
