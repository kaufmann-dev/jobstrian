import type { Settings } from './db/schema';

export function hasSavedHomeLocation(
	settings: Pick<
		Settings,
		'homeAddress' | 'homeLocationProvider' | 'homeLocationId' | 'homeCity' | 'homeLat' | 'homeLon'
	>
): boolean {
	return Boolean(
		settings.homeLocationProvider &&
			settings.homeLocationId &&
			settings.homeCity.trim() &&
			settings.homeLat != null &&
			settings.homeLon != null
	);
}
