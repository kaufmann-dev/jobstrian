import { describe, expect, it } from 'vitest';
import { toSettingsDbPatch } from '$lib/server/settings-patch';
import type { Settings } from '$lib/server/db/schema';

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
});
