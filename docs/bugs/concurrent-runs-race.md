# Two refresh runs could start concurrently and corrupt each other

## Symptom

Two near-simultaneous `POST /api/run/start` requests (e.g. a double-click on
"Aktualisieren" or two open tabs) could both start a refresh. Effects: duplicated DB
writes and doubled LLM spend, the shared headless browser being torn down mid-scrape of
the other run (so its AMS scrape failed), and one `scrapeRun` row left orphaned as
`running` (the in-memory `activeRun` tracked only the last starter).

## Root cause

`startRefresh` (`src/lib/server/scrape/runner.ts`) guarded against concurrent runs with
`if (activeRun) return null`, but then `await`ed the `scrapeRun` insert **before**
assigning `activeRun`. That `await` is a TOCTOU window: a second request could pass the
`activeRun === null` check while the first was still inserting, so both proceeded and
called `runRefresh`. The browser is a module-level singleton (`browser.ts`) closed in
`runRefresh`'s `finally`, so the first run to finish closed the browser the other was
still using.

## Fix

Claim the single-run slot **synchronously**, before the first `await`. Added a
module-level `let starting = false`; `startRefresh` now returns `null` when
`activeRun || starting`, sets `starting = true` immediately, and clears it in a `finally`.
Because the flag is set before any `await`, a second concurrent call observes it and bails
out. `/api/run/start` already maps `null` → 409 `already-running`, so no endpoint change
was needed.

## Tests

`runner.spec.ts`: with the first run's insert held pending (mocked `db`), a second
`startRefresh()` resolves to `null` and the insert runs only once.
