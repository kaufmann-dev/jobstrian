export type GeoSuggestionKind = 'address' | 'city';

export interface GeoSuggestion {
	id: string;
	label: string;
	secondaryLabel: string;
	city: string;
	postcode: string;
	lat: number;
	lon: number;
	countryCode: string;
	kind: GeoSuggestionKind;
	verifiable: boolean;
}
