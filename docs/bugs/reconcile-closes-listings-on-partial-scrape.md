# Valid job listings marked "closed" after a transient scrape failure

## Symptom

After a refresh run in which one enabled source had a network hiccup (timeout, 5xx,
or a parse error for some keyword/city), still-open jobs from that source disappeared
from the jobs list. The jobs page hides `status='closed'` listings by default
(`src/routes/api/listings/+server.ts`), so the jobs simply vanished until the next
fully clean run re-activated them.

## Root cause

The reconcile step in `runRefresh` (`src/lib/server/scrape/runner.ts`) marked every
active listing it had **not** re-seen this run (`lastSeenRunId != runId`) as
`status='closed'`, building the scopes from **all** enabled adapters
(`adapters.map((a) => a.id)`) × all configured cities.

But every adapter catches fetch errors **inside** its per-keyword loop and continues,
returning partial or empty results on failure (`willhaben.ts`, `ams.ts`, `karriere.ts`,
`hokify.ts`); only `signal.aborted` is re-thrown. So when a source failed for a run, it
re-stamped none/fewer of its listings, and reconciliation closed the un-restamped ones —
even though they were still open. The reconcile ran unconditionally, with no notion of
which sources had actually succeeded.

## Fix

Per-source gating of reconciliation:

- Added `ScrapeResult { listings: RawListing[]; complete: boolean }` to
  `src/lib/server/scrape/types.ts` and changed `SourceAdapter.search` to return it.
- Each adapter now sets `complete = false` in the catch block that swallows a fetch
  failure, and returns `{ listings, complete }`. Abort still throws and never returns an
  incomplete result.
- `runRefresh` collects `completeSources` (adapters that returned `complete: true`) during
  the scrape loop and builds the reconcile scopes from only those sources. When no source
  completed, `listingSearchScopes` returns `[]` and `listingReconcileWhere` returns
  `undefined`, so nothing is closed. The reconcile phase detail notes how many incomplete
  sources were skipped.

A partially-failed source therefore never closes its own listings; stale listings from
such a source simply linger as `active` until a fully clean run of that source reconciles
them.

## Tests

- Adapter specs assert `complete: true` on success and `complete: false` when a fetch
  rejects (`hokify.spec.ts`, `willhaben.spec.ts`).
- `runner.spec.ts` asserts the reconcile scope excludes a non-completed source and that an
  empty complete-set closes nothing.
