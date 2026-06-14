# Plan 1: Manual Search Configuration and Austria Location Foundation

## Summary

Add a new Settings section for search-specific configuration: Stellen-Keywords, OSM business tags, business radius, and job search cities. Remove these concerns from the profile editor, remove Austrian work-permit handling, and make scraping use configured Austrian cities instead of hardcoded Vienna. Do not add search profiles yet.

## Key Changes

- Add settings fields for `jobSearchKeywords`, `jobSearchLocations`, `businessOsmTags`, and `businessRadiusMeters`.
- Migrate existing `roleKeywords` into `jobSearchKeywords`.
- Migrate existing `radiusMeters` into `businessRadiusMeters`.
- Replace `businessRadiusMeters` validation with min `250`, max `20000`, default `5000`.
- Add a new Settings card titled `Suchkonfiguration` containing:
  - Stellen-Keywords
  - Job-Suchorte
  - OSM-Kategorien fuer Betriebe
  - Maximale Entfernung fuer Betriebe
- Keep the address field in `Profil` for now; address autocomplete and validation are handled in Plan 2.
- Remove `workPermit` from:
  - database schema and migration
  - settings schema
  - profile import schema
  - profile editor UI
  - ranking profile text
  - tests and fixtures
- Add a reusable `SearchConfigEditor.svelte` with the same editing and selected-field behavior as `ProfileEditor`.
- Add a local OSM tag catalog module with broad employer-relevant keys:
  - `amenity`
  - `shop`
  - `craft`
  - `office`
  - `tourism`
  - `healthcare`
  - `leisure`
  - `education`
- Validate every `{ key, value }` OSM pair against this catalog before saving.
- Replace `findNearbyGastronomy` with a generic business search that compiles selected validated OSM tags into Overpass queries.
- Chunk large OSM tag selections before calling Overpass so the generated query stays bounded.
- Change scraping from a single hardcoded `location: "Wien"` to `locations: settings.jobSearchLocations`.
- Update adapters:
  - Hokify and karriere.at search each keyword-city pair.
  - willhaben removes hardcoded `areaId=900`; search by keyword and filter parsed locations by configured Austrian city names.
  - AMS removes the Vienna-only filter and filters Austrian returned addresses by configured city names.
- Generalize ranking and cold-email prompts so they use configured search keywords and business category, not Service/Barista or gastronomy-specific wording.
- Update README text that currently describes the product as Vienna/gastronomy-specific.

## Test Plan

- Generate and apply the Drizzle migration.
- Unit test settings validation:
  - radius below `250` fails.
  - radius above `20000` fails.
  - invalid OSM tags fail.
  - duplicate keywords, cities, and OSM tags are handled consistently.
- Unit test Overpass query compilation:
  - the current gastronomy defaults produce equivalent amenity searches.
  - multiple keys compile into valid node/way query blocks.
  - invalid tags cannot reach query generation.
- Unit test scraper behavior:
  - Hokify and karriere receive each configured city.
  - willhaben no longer uses the Vienna area ID.
  - AMS no longer rejects non-Vienna Austrian listings.
- Update existing profile/import/ranking tests to remove `workPermit` and `roleKeywords` profile assumptions.
- Run `pnpm check`, `pnpm test`, and `pnpm build`.

## Assumptions

- No multi-profile system is introduced.
- The first implementation supports manual city entry.
- Explicit `jobSearchLocations` control job portal search cities.
- If `jobSearchLocations` is empty, derive one city from the configured address during refresh when possible.
- The OSM catalog is broad but still application-owned and validated.
- Existing `role_keywords` and `radius_meters` data are migrated before old columns are dropped.
