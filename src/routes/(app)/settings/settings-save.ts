import { validateAustrianAddress } from '$lib/server/geo/nominatim';
import type { Settings } from '$lib/server/db/schema';

export async function resolveHomeAddressSave(
	current: Settings,
	homeAddress: string
): Promise<
	| {
			ok: true;
			homeAddress: string;
			homeCity?: string;
			homeLat?: number | null;
			homeLon?: number | null;
	  }
	| { ok: false; message: string }
> {
	const trimmedAddress = homeAddress.trim();
	if (!trimmedAddress) {
		return { ok: true, homeAddress: '', homeCity: '', homeLat: null, homeLon: null };
	}

	const mustValidate =
		trimmedAddress !== current.homeAddress.trim() ||
		!current.homeCity.trim() ||
		current.homeLat == null ||
		current.homeLon == null;
	if (!mustValidate) return { ok: true, homeAddress };

	const resolvedAddress = await validateAustrianAddress(trimmedAddress).catch((error) => {
		console.error('Address validation during settings save failed', error);
		return null;
	});
	if (!resolvedAddress) {
		return {
			ok: false,
			message: 'Adresse konnte in Österreich nicht eindeutig gefunden werden.'
		};
	}

	return {
		ok: true,
		homeAddress: resolvedAddress.label,
		homeCity: resolvedAddress.city ?? '',
		homeLat: resolvedAddress.lat,
		homeLon: resolvedAddress.lon
	};
}
