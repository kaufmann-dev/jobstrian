import type { Lead, Listing } from '$lib/server/db/schema';

export const LIST_BATCH_SIZE = 50;

export interface CursorPage<T> {
	items: T[];
	nextCursor: string | null;
	matchingTotal: number;
	total: number;
}

export interface ListingFilters {
	source: string | null;
	verdict: Listing['rankVerdict'] | null;
	showClosed: boolean;
}

export interface LeadFilters {
	onlyWithEmail: boolean;
	onlyOpen: boolean;
	hideIgnored: boolean;
}

export const DEFAULT_LISTING_FILTERS: ListingFilters = {
	source: null,
	verdict: null,
	showClosed: false
};

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
	onlyWithEmail: false,
	onlyOpen: true,
	hideIgnored: true
};
