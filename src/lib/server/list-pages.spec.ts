import { describe, expect, it } from 'vitest';
import type { Lead, Listing } from './db/schema';
import {
	decodeLeadCursor,
	decodeListingCursor,
	encodeLeadCursor,
	encodeListingCursor
} from './list-pages';

const listing = {
	id: 7,
	starred: true,
	rankScore: null,
	firstSeenAt: new Date('2026-06-12T10:00:00Z')
} as Listing;

const lead = { id: 9, rankScore: null, distanceMeters: 350 } as Lead;

describe('list cursors', () => {
	it('round-trips listing cursor ordering values including a null score', () => {
		expect(decodeListingCursor(encodeListingCursor(listing))).toEqual({
			starred: true,
			score: null,
			firstSeenAt: '2026-06-12T10:00:00.000Z',
			id: 7
		});
	});

	it('round-trips lead cursor ordering values including a null score', () => {
		expect(decodeLeadCursor(encodeLeadCursor(lead))).toEqual({
			score: null,
			distanceMeters: 350,
			id: 9
		});
	});

	it('rejects malformed cursors', () => {
		expect(decodeListingCursor('not-a-cursor')).toBeNull();
		expect(decodeLeadCursor('not-a-cursor')).toBeNull();
	});
});
