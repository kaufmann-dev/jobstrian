import { validateAustrianAddress } from '$lib/server/geo/nominatim';
import type { Settings } from '$lib/server/db/schema';

export async function resolveHomeAddressSave(
	current: Settings,
	homeAddress: string
): Promise<{
	ok: true;
	homeAddress: string;
	homeCity?: string;
	homeLat?: number | null;
	homeLon?: number | null;
}> {
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
	// Keep exactly what the user typed; only enrich geo fields when the address resolves.
	if (!resolvedAddress) return { ok: true, homeAddress };

	return {
		ok: true,
		homeAddress,
		homeCity: resolvedAddress.city ?? '',
		homeLat: resolvedAddress.lat,
		homeLon: resolvedAddress.lon
	};
}
