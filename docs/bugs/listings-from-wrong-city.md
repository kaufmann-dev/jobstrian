# Job listings from cities other than the configured search city

## Symptom

With only "Wien" configured as the job search location (`job_search_locations`
empty → fallback to `home_city` = "Wien"), the jobs list showed listings located
in Villach, Klagenfurt am Wörthersee and "Österreich" from willhaben and
karriere.at.

## Root cause

Two independent problems, both confirmed by inspecting the `listing` table.

1. **Stale pre-filter data.** Every active listing in the DB (218 rows) had a
   NULL `discovery_city`. The current city-aware adapters always stamp a
   non-empty `discovery_city`, so none of these rows came from the current code —
   they were scraped by older adapters that did not filter by city at all. They
   also could never be reconciled away: `listingReconcileWhere`
   (`src/lib/server/scrape/runner.ts`) matches on `discovery_city = scope.city`,
   which never matches NULL, so the rows lingered as `active` forever.

2. **Inconsistent filtering across sources.** `willhaben.ts` and `ams.ts` verified
   each result's location against the configured cities, but `karriere.ts` and
   `hokify.ts` only built a per-city search URL (`/jobs/{keyword}/{city}`) and then
   tagged **every** returned result with that city without checking its actual
   location. Portals return multi-city jobs (e.g. "Villach, …, Wien, …") and
   nationwide "Österreich" listings under a city search, so non-matching jobs were
   stored and — because the displayed location is the first entry — showed up
   labelled as a foreign city even when Wien was somewhere in the list.

## Fix

- Added a shared matcher `src/lib/server/scrape/sources/location.ts`
  (`normalizeLocation`, `matchLocation`). `matchLocation` keeps a listing only if
  one of its location parts contains a configured city, and returns a display
  string with the matched part moved to the front (matched-city-first display).
- `willhaben.ts`, `karriere.ts`, `hokify.ts` now run every parsed result through
  `matchLocation` and drop non-matching listings. `ams.ts` reuses the shared
  `normalizeLocation` (its address-field matcher was already correct).
- Updated `hokify.spec.ts` for the new filtering (a "Brunn am Gebirge" result is
  now dropped under a "Wien" search).
- Migration `drizzle/0016_purge_listings_without_discovery_city.sql` deletes the
  stale rows (`discovery_city IS NULL OR ''`). Idempotent; the next run
  repopulates only city-matched listings.

## Known limitation

City matching uses substring containment (kept consistent with the existing
willhaben/ams behaviour), so "Wiener Neustadt" still matches a configured "Wien".
This was not part of the reported symptom and was left unchanged.
