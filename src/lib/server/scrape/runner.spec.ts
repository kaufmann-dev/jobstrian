import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
	buildProfileQuery,
	jobSearchLocations,
	listingReconcileWhere,
	listingSearchScopes
} from './runner';

const dialect = new PgDialect();

describe('refresh search profile', () => {
	it('uses explicit job search locations before the address-derived city', () => {
		const profile = buildProfileQuery({
			jobSearchKeywords: ['Pflegeassistenz'],
			jobSearchLocations: ['Linz'],
			homeCity: 'Graz'
		});

		expect(profile).toEqual({ keywords: ['Pflegeassistenz'], locations: ['Linz'] });
	});

	it('uses the address-derived city when explicit cities are empty', () => {
		expect(
			jobSearchLocations({
				jobSearchLocations: [],
				homeCity: 'Graz'
			})
		).toEqual(['Graz']);
	});

	it('skips portal scraping when no city can be determined', () => {
		const profile = buildProfileQuery({
			jobSearchKeywords: ['Verkauf'],
			jobSearchLocations: [],
			homeCity: ''
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
});
