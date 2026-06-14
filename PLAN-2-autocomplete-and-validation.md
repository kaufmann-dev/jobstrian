# Plan 2: Address, City, and OSM Autocomplete With Validation

## Summary

Make manual configuration safer. Add Austria-only address autocomplete and validation, city autocomplete for job search locations, and OSM tag autocomplete for business categories. This plan builds on Plan 1 and does not add AI generation yet.

## Key Changes

- Extend the existing Nominatim utility to support Austria-only search:
  - use `countrycodes=at`
  - request `addressdetails=1`
  - return normalized display label, latitude, longitude, city or municipality, postcode, and source place id when available.
- Add server endpoints:
  - `GET /api/geo/address-suggestions?q=...`
  - `POST /api/geo/validate-address`
  - `GET /api/geo/city-suggestions?q=...`
  - `GET /api/osm-tag-suggestions?q=...`
- Keep all Nominatim calls server-side.
- Add debounce and abort handling on the client so stale autocomplete responses cannot overwrite newer input.
- Update the address input in `ProfileEditor`:
  - show Austrian suggestions as the user types.
  - store `homeAddress`, `homeLat`, and `homeLon` only after a selected or validated address resolves.
  - show an inline validation error when the address cannot be resolved in Austria.
- Update `SearchConfigEditor`:
  - city field autocompletes Austrian cities and municipalities.
  - OSM tag field autocompletes from the local catalog.
  - selected OSM tags are displayed as removable chips using their human labels and raw `key=value`.
- Server-side save still validates everything independently:
  - home address must resolve in Austria before coordinates are accepted.
  - job search cities must be non-empty normalized strings.
  - OSM tags must exist in the local catalog.
- If a user manually types an address without selecting a suggestion, validation runs on save and either stores normalized coordinates or returns a form error.
- If a user manually types OSM tags, accept only `key=value` pairs that exist in the catalog.

## Test Plan

- Unit test Nominatim normalization:
  - Austrian address with city.
  - Austrian municipality without city.
  - no results.
  - non-Austrian result is rejected.
- Unit test API endpoints:
  - missing or too-short `q` returns an empty suggestion list.
  - valid suggestions are normalized.
  - upstream failure returns a controlled error.
- Unit test settings save:
  - unresolved address fails.
  - resolved address clears stale coordinates and stores new coordinates.
  - invalid OSM tag fails.
  - valid manually typed OSM tag succeeds.
- Component test the autocomplete flow where practical:
  - suggestions render.
  - selecting a suggestion updates the bound value.
  - removing an OSM tag updates the bound list.
- Run `pnpm check`, `pnpm test`, and `pnpm build`.

## Assumptions

- Autocomplete is a convenience; server-side validation is the source of truth.
- Nominatim is used only for geocoding/autocomplete, not business discovery.
- Address validation is limited to Austria.
- The OSM tag catalog remains local and does not fetch live OSM documentation at runtime.
