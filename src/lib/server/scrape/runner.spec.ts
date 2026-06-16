import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { returningMock } = vi.hoisted(() => ({ returningMock: vi.fn() }));
vi.mock('../db', () => ({
	db: {
		insert: () => ({ values: () => ({ returning: returningMock }) })
	}
}));

import {
	buildProfileQuery,
	jobSearchLocations,
	listingReconcileWhere,
	listingSearchScopes,
	startRefresh
} from './runner';

const dialect = new PgDialect();

describe('refresh search profile', () => {
	it('uses explicit job search locations before the address-derived city', () => {
		const profile = buildProfileQuery({
			jobSearchKeywords: ['Pflegeassistenz'],
			jobSearchLocations: ['Linz'],
			homeLocationProvider: null,
			homeLocationId: null,
			homeCity: 'Graz',
			homeLat: null,
			homeLon: null
		});

		expect(profile).toEqual({ keywords: ['Pflegeassistenz'], locations: ['Linz'] });
	});

	it('uses the address-derived city when explicit cities are empty', () => {
		expect(
			jobSearchLocations({
				jobSearchLocations: [],
				homeLocationProvider: 'geoapify',
				homeLocationId: 'place',
				homeCity: 'Graz',
				homeLat: 47.07,
				homeLon: 15.44
			})
		).toEqual(['Graz']);
	});

	it('skips portal scraping when no city can be determined', () => {
		const profile = buildProfileQuery({
			jobSearchKeywords: ['Verkauf'],
			jobSearchLocations: [],
			homeLocationProvider: null,
			homeLocationId: null,
			homeCity: 'Graz',
			homeLat: 47.07,
			homeLon: 15.44
		});

		expect(profile).toBeNull();
	});
});

describe('listing reconciliation scope', () => {
	it('closes vanished listings only for searched source and city combinations', () => {
		const scopes = listingSearchScopes(['ams', 'willhaben'], ['Graz']);
		const query = dialect.sqlToQuery(listingReconcileWhere(7, scopes)!);

		expect(query.sql).toContain('"listing"."source" = $');
		expect(query.sql).toContain('"listing"."discovery_city" = $');
		expect(query.params).toContain('ams');
		expect(query.params).toContain('willhaben');
		expect(query.params).toContain('Graz');
		expect(query.params).not.toContain('Linz');
	});

	it('excludes sources that did not complete from the reconcile scope', () => {
		// The runner builds scopes only from sources that finished without a
		// swallowed failure; here only willhaben completed, so ams listings must
		// not be closed.
		const scopes = listingSearchScopes(['willhaben'], ['Graz']);
		const query = dialect.sqlToQuery(listingReconcileWhere(7, scopes)!);

		expect(query.params).toContain('willhaben');
		expect(query.params).not.toContain('ams');
	});

	it('closes nothing when no source completed', () => {
		const scopes = listingSearchScopes([], ['Graz']);
		expect(listingReconcileWhere(7, scopes)).toBeUndefined();
	});
});

describe('startRefresh concurrency guard', () => {
	beforeEach(() => {
		returningMock.mockReset();
	});

	it('does not start a second run while one is still starting', async () => {
		// Hold the first run's insert pending so it is mid-start (slot claimed,
		// activeRun not yet assigned) when the second request arrives.
		returningMock.mockReturnValue(new Promise<never>(() => {}));

		const first = startRefresh();
		const second = await startRefresh();

		expect(second).toBeNull();
		expect(returningMock).toHaveBeenCalledTimes(1);

		void first; // intentionally floating: this run never completes in the unit test
	});
});
