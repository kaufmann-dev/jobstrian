import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LEAD_FILTERS,
	DEFAULT_LISTING_FILTERS,
	LEAD_SORTS,
	LISTING_SORTS
} from '$lib/list-pages';
import type { Lead, Listing } from './db/schema';
import {
	decodeLeadCursor,
	decodeListingCursor,
	encodeLeadCursor,
	encodeListingCursor,
	leadAfter,
	leadFiltersSchema,
	listingAfter,
	listingFiltersSchema
} from './list-pages';

const listing = {
	id: 7,
	starred: true,
	rankScore: null,
	firstSeenAt: new Date('2026-06-12T10:00:00Z')
} as Listing;

const lead = { id: 9, name: 'Café Central', rankScore: null, distanceMeters: 350 } as Lead;
const dialect = new PgDialect();

describe('listing cursors', () => {
	it.each(LISTING_SORTS)('round-trips %s ordering values', (sort) => {
		expect(decodeListingCursor(encodeListingCursor(listing, sort))).toMatchObject({
			sort,
			starred: true,
			id: 7
		});
	});

	it.each(LISTING_SORTS)(
		'uses explicit starred branches for %s without boolean comparisons',
		(sort) => {
			const cursor = decodeListingCursor(encodeListingCursor(listing, sort));
			const query = dialect.sqlToQuery(listingAfter(cursor, sort)!);
			expect(query.sql).not.toMatch(/"listing"\."starred"\s*</);
			expect(query.sql).toMatch(/"listing"\."starred" = \$\d/);
			expect(query.params).toContain(false);
			expect(query.params).toContain(true);
		}
	);

	it.each(['recommended', 'newest'] as const)(
		'serializes timestamp parameters through the column encoder for %s',
		(sort) => {
			const cursor = decodeListingCursor(encodeListingCursor(listing, sort));
			const query = dialect.sqlToQuery(listingAfter(cursor, sort)!);
			expect(query.params.some((param) => param instanceof Date)).toBe(false);
			expect(query.params).toContain(listing.firstSeenAt.toISOString());
		}
	);

	it('handles an unstarred cursor and null score', () => {
		const cursor = decodeListingCursor(
			encodeListingCursor({ ...listing, starred: false, rankScore: null } as Listing, 'recommended')
		);
		const query = dialect.sqlToQuery(listingAfter(cursor, 'recommended')!);
		expect(query.sql).toContain('"listing"."rank_score" is null');
		expect(query.sql).toMatch(/"listing"\."starred" = \$\d/);
		expect(query.params).toContain(false);
		expect(query.params).not.toContain(true);
	});
});

describe('lead cursors', () => {
	it.each(LEAD_SORTS)('round-trips %s ordering values', (sort) => {
		expect(decodeLeadCursor(encodeLeadCursor(lead, sort))).toMatchObject({ sort, id: 9 });
	});

	it.each(LEAD_SORTS)('builds a cursor predicate for %s', (sort) => {
		const cursor = decodeLeadCursor(encodeLeadCursor(lead, sort));
		expect(dialect.sqlToQuery(leadAfter(cursor, sort)!).sql).toContain('"lead"');
	});
});

describe('list filter parsing', () => {
	it('accepts search and every listing sort preset', () => {
		for (const sort of LISTING_SORTS) {
			expect(listingFiltersSchema.parse({ search: 'Wien', sort })).toMatchObject({
				search: 'Wien',
				sort
			});
		}
	});

	it('accepts search and every lead sort preset', () => {
		for (const sort of LEAD_SORTS) {
			expect(leadFiltersSchema.parse({ search: 'café', sort })).toMatchObject({
				search: 'café',
				sort
			});
		}
	});

	it('rejects malformed cursors and ignores cursors from another sort', () => {
		expect(decodeListingCursor('not-a-cursor')).toBeNull();
		expect(decodeLeadCursor('not-a-cursor')).toBeNull();
		const cursor = decodeListingCursor(encodeListingCursor(listing, 'newest'));
		expect(listingAfter(cursor, 'score')).toBeUndefined();
	});

	it('keeps the intended default filters', () => {
		expect(listingFiltersSchema.parse({})).toMatchObject(DEFAULT_LISTING_FILTERS);
		expect(leadFiltersSchema.parse({})).toMatchObject(DEFAULT_LEAD_FILTERS);
	});
});
