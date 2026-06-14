import { describe, expect, it } from 'vitest';
import { hasSavedHomeLocation } from './settings-status';

const base = {
	homeAddress: '',
	homeLocationProvider: null,
	homeLocationId: null,
	homeCity: '',
	homeLat: null,
	homeLon: null
};

describe('settings status', () => {
	it('does not count an empty home address as saved', () => {
		expect(hasSavedHomeLocation(base)).toBe(false);
	});

	it('counts saved address text as a home location for overview readiness', () => {
		expect(
			hasSavedHomeLocation({
				...base,
				homeAddress: 'Fuhrmannsgasse 18a, 1080 Wien, Österreich'
			})
		).toBe(true);
	});

	it('counts verified provider metadata even when the address text is empty', () => {
		expect(
			hasSavedHomeLocation({
				...base,
				homeLocationProvider: 'geoapify',
				homeLocationId: 'place-1',
				homeCity: 'Wien',
				homeLat: 48.2,
				homeLon: 16.3
			})
		).toBe(true);
	});
});
