import type { Listing } from '$lib/server/db/schema';

export const LIST_BATCH_SIZE = 50;

export interface CursorPage<T> {
	items: T[];
	nextCursor: string | null;
	matchingTotal: number;
	total: number;
}

export const LISTING_SORTS = [
	'recommended',
	'score-asc',
	'score-desc',
	'title-asc',
	'title-desc',
	'company-asc',
	'company-desc',
	'location-asc',
	'location-desc',
	'source-asc',
	'source-desc',
	'posted-asc',
	'posted-desc'
] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const LEAD_SORTS = [
	'recommended',
	'score-asc',
	'score-desc',
	'name-asc',
	'name-desc',
	'distance-asc',
	'distance-desc',
	'status-asc',
	'status-desc'
] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export interface ListingFilters {
	source: string | null;
	verdict: Listing['rankVerdict'] | null;
	showClosed: boolean;
	search: string;
	sort: ListingSort;
}

export interface LeadFilters {
	onlyWithEmail: boolean;
	onlyOpen: boolean;
	hideIgnored: boolean;
	search: string;
	sort: LeadSort;
}

export const DEFAULT_LISTING_FILTERS: ListingFilters = {
	source: null,
	verdict: null,
	showClosed: false,
	search: '',
	sort: 'recommended'
};

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
	onlyWithEmail: false,
	onlyOpen: true,
	hideIgnored: true,
	search: '',
	sort: 'recommended'
};
