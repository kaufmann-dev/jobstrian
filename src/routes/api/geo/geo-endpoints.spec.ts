import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchAustrianAddresses, searchAustrianCities, validateAustrianAddress } = vi.hoisted(
	() => ({
		searchAustrianAddresses: vi.fn(),
		searchAustrianCities: vi.fn(),
		validateAustrianAddress: vi.fn()
	})
);

vi.mock('$lib/server/geo/nominatim', () => ({
	searchAustrianAddresses,
	searchAustrianCities,
	validateAustrianAddress
}));

import { GET as addressSuggestions } from './address-suggestions/+server';
import { GET as citySuggestions } from './city-suggestions/+server';
import { POST as validateAddress } from './validate-address/+server';

const suggestion = {
	label: 'Herrengasse 14, 1010 Wien, Österreich',
	lat: 48.2101,
	lon: 16.3652,
	city: 'Wien',
	postcode: '1010',
	placeId: 123
};

describe('geo suggestion endpoints', () => {
	beforeEach(() => {
		searchAustrianAddresses.mockReset();
		searchAustrianCities.mockReset();
		validateAustrianAddress.mockReset();
	});

	it('returns empty address suggestions for a missing or too-short query', async () => {
		const response = await addressSuggestions({
			url: new URL('http://localhost/api/geo/address-suggestions?q=wi')
		} as never);

		expect(await response.json()).toEqual({ suggestions: [] });
		expect(searchAustrianAddresses).not.toHaveBeenCalled();
	});

	it('returns normalized address suggestions', async () => {
		searchAustrianAddresses.mockResolvedValue([suggestion]);

		const response = await addressSuggestions({
			url: new URL('http://localhost/api/geo/address-suggestions?q=wien')
		} as never);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ suggestions: [suggestion] });
	});

	it('returns empty city suggestions for a too-short query', async () => {
		const response = await citySuggestions({
			url: new URL('http://localhost/api/geo/city-suggestions?q=w')
		} as never);

		expect(await response.json()).toEqual({ suggestions: [] });
		expect(searchAustrianCities).not.toHaveBeenCalled();
	});

	it('returns a controlled error when Nominatim fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		searchAustrianAddresses.mockRejectedValue(new Error('upstream failed'));

		const response = await addressSuggestions({
			url: new URL('http://localhost/api/geo/address-suggestions?q=wien')
		} as never);

		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			message: 'Adressvorschläge konnten nicht geladen werden.'
		});
	});

	it('validates a resolved Austrian address', async () => {
		validateAustrianAddress.mockResolvedValue(suggestion);
		const response = await validateAddress({
			request: new Request('http://localhost/api/geo/validate-address', {
				method: 'POST',
				body: JSON.stringify({ address: 'Herrengasse 14 Wien' })
			})
		} as never);

		expect(await response.json()).toEqual({ valid: true, suggestion });
	});
});
