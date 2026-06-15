import { beforeEach, describe, expect, it, vi } from 'vitest';

const { geoSuggestions } = vi.hoisted(() => ({ geoSuggestions: vi.fn() }));
vi.mock('$lib/server/geo/geoapify', () => ({ geoSuggestions }));

import { toSettingsDbPatch, verifyTypedHomeLocation } from '$lib/server/settings-patch';
import type { Settings } from '$lib/server/db/schema';
import { DEFAULT_LISTING_RANKING_CRITERIA } from '$lib/ranking-criteria';

const current = {
	enabledSources: ['ams'],
	homeAddress: 'Old',
	homeLocationProvider: 'geoapify',
	homeLocationId: 'old',
	homePostcode: '1010',
	homeCity: 'Wien',
	homeLat: 48.2,
	homeLon: 16.3
} as Settings;

describe('settings patch persistence', () => {
	beforeEach(() => geoSuggestions.mockReset());

	it('atomically clears all derived location data when address text changes', () => {
		expect(
			toSettingsDbPatch({ patch: {}, homeLocation: { address: 'Typed exactly', verified: false } })
		).toEqual({
			homeAddress: 'Typed exactly',
			homeLocationProvider: null,
			homeLocationId: null,
			homePostcode: '',
			homeCity: '',
			homeLat: null,
			homeLon: null
		});
	});

	it('atomically stores a selected verified suggestion', () => {
		expect(
			toSettingsDbPatch({
				patch: {},
				homeLocation: {
					address: 'Herrengasse 14, 1010 Wien',
					verified: true,
					provider: 'geoapify',
					id: 'place-1',
					postcode: '1010',
					city: 'Wien',
					lat: 48.2,
					lon: 16.3
				}
			})
		).toMatchObject({
			homeLocationProvider: 'geoapify',
			homeLocationId: 'place-1',
			homePostcode: '1010',
			homeCity: 'Wien',
			homeLat: 48.2,
			homeLon: 16.3
		});
	});

	it('does not overwrite unrelated fields', () => {
		expect(toSettingsDbPatch({ patch: { fullName: 'Ada' } }, current)).toEqual({ fullName: 'Ada' });
	});

	it('validates and stores ranking criteria patches', () => {
		expect(
			toSettingsDbPatch({
				patch: { listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA }
			})
		).toEqual({ listingRankingCriteria: DEFAULT_LISTING_RANKING_CRITERIA });
	});

	it('promotes exact typed address text to a verified provider location', async () => {
		geoSuggestions.mockResolvedValue([
			{
				id: 'fuhrmannsgasse-18a',
				label: 'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
				secondaryLabel: '1080 Wien, Österreich',
				city: 'Wien',
				postcode: '1080',
				lat: 48.21234,
				lon: 16.34567,
				countryCode: 'at',
				kind: 'address',
				verifiable: true
			}
		]);

		await expect(
			verifyTypedHomeLocation({
				address: 'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
				verified: false
			})
		).resolves.toMatchObject({
			address: 'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
			verified: true,
			provider: 'geoapify',
			id: 'fuhrmannsgasse-18a',
			city: 'Wien',
			postcode: '1080',
			lat: 48.21234,
			lon: 16.34567
		});
	});

	it('promotes a unique street and house-number prefix to a verified provider location', async () => {
		geoSuggestions.mockResolvedValue([
			{
				id: 'fuhrmannsgasse-18a',
				label: 'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
				secondaryLabel: '1080 Wien, Österreich',
				city: 'Wien',
				postcode: '1080',
				lat: 48.21234,
				lon: 16.34567,
				countryCode: 'at',
				kind: 'address',
				verifiable: true
			}
		]);

		await expect(
			verifyTypedHomeLocation({ address: 'Fuhrmannsgasse 18a', verified: false })
		).resolves.toMatchObject({
			address: 'Fuhrmannsgasse 18a, 1080 Wien, Österreich',
			verified: true,
			id: 'fuhrmannsgasse-18a'
		});
	});

	it('keeps broad manual text unverified when it has no unique house-number match', async () => {
		geoSuggestions.mockResolvedValue([
			{
				id: 'one',
				label: 'Hauptstraße 1, 1010 Wien, Österreich',
				secondaryLabel: '1010 Wien, Österreich',
				city: 'Wien',
				postcode: '1010',
				lat: 48.2,
				lon: 16.3,
				countryCode: 'at',
				kind: 'address',
				verifiable: true
			},
			{
				id: 'two',
				label: 'Hauptstraße 1, 8010 Graz, Österreich',
				secondaryLabel: '8010 Graz, Österreich',
				city: 'Graz',
				postcode: '8010',
				lat: 47.1,
				lon: 15.4,
				countryCode: 'at',
				kind: 'address',
				verifiable: true
			}
		]);

		await expect(
			verifyTypedHomeLocation({ address: 'Hauptstraße 1', verified: false })
		).resolves.toEqual({ address: 'Hauptstraße 1', verified: false });
	});
});
