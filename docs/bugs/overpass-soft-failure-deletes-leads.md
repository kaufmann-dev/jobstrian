# Overpass soft-failure caused valid leads to be permanently deleted

## Symptom

Un-engaged leads (not starred, status `new`, no manual edits) could be hard-deleted
during a refresh even though the businesses still existed, losing their discovered
contact data (including website-scraped emails).

## Root cause

`reconcileLeads` (`src/lib/server/geo/leads.ts`) hard-`DELETE`s leads not seen in the
current run; its own comment requires it be called "only after a successful, complete
sync". The HTTP-error path was already safe — `postOverpass`
(`src/lib/server/geo/overpass.ts`) throws `OverpassUnavailableError` on retryable/non-OK
responses, and `runRefresh` catches it and skips `reconcileLeads`.

The gap was Overpass **soft failures**: when a query exceeds its time/memory budget,
Overpass answers **HTTP 200** with a `remark` (e.g. `"runtime error: Query timed out"`)
and an empty/partial `elements` array. `postOverpass` only checked `response.ok`, so this
counted as success: `findNearbyBusinesses` returned fewer/zero places, `syncLeads`
"completed", and `reconcileLeads` then deleted the leads that were missing from the
incomplete result.

## Fix

In `src/lib/server/geo/overpass.ts`, parse and validate the body inside the retry loop
(`postOverpass` → `fetchOverpass`, returning `{ elements }`):

- `isCompleteOverpassBody` rejects a 200 whose body lacks an `elements` array, or carries
  a `remark` matching `/(runtime error|timed out|out of memory|please be fair)/i`.
- Such a response is treated as a retryable failure; after the retries are exhausted it
  throws `OverpassUnavailableError`, which the runner already catches to **skip**
  `reconcileLeads` — so an incomplete sync can no longer delete leads.
- An empty `elements: []` with **no** error remark is still valid ("no businesses nearby")
  and returns normally.

## Tests

`overpass.spec.ts`: a 200 with an error `remark` is retried and then throws
`OverpassUnavailableError`; a genuinely empty 200 (no remark) returns `[]`.

## Note

The soft-failure body shape (HTTP 200 + `remark` + empty `elements`) is Overpass's
documented over-budget behaviour; it was reasoned from the API contract and covered by a
unit test rather than reproduced against the live endpoint.
