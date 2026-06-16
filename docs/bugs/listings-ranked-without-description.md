# Job listings were ranked without their ad body (language/qualification scored too leniently)

## Symptom

The configured **"Sprache"** ranking criterion (and likewise
"Anforderungen/Qualifikation", "Erfahrung") was scored far too leniently. Jobs
that clearly require strong German still scored "strong", because the LLM never
saw a language requirement to judge against.

## Root cause

Not a bug in the scoring code. The whole description path was already wired —
`listing.description` exists (`schema.ts`), `upsertListing` persists it, the
content hash (`fingerprints.ts:listingContentHash`) includes it, and
`shouldRankListing` re-ranks when it changes — **but no scraper ever populated
`description`**. All four sources only read the search-result cards (title,
company, location, salary); the runner did no detail enrichment.

With `description` always empty, the listing-ranking prompt had no requirement
text. Combined with the prompt rule *"Wenn die Stellenbeschreibung keine
Anforderung nennt, nimm an, dass sie erfüllbar ist (nicht bestrafen)"*, the LLM
assumed German (and other requirements) were met for essentially every job and
handed out high sub-scores.

Confirmed against real live responses (2026-06-16) where each source's body
actually lives:

- **AMS**: the `/public/emps/api/search` response already carries the full body
  in a `summary` field (HTML) on every result — verified via Playwright since the
  endpoint is token-gated (direct fetch → 401).
- **willhaben**: the search `__NEXT_DATA__` includes `description` only for the
  sponsored `topJob`; regular results have `description: ""`. The full body is on
  the detail page at `props.pageProps.jobAdvertDetailsRoot.data.description`.
- **karriere.at**: list cards have no body; the detail page exposes JSON-LD
  (`@type: "JobPosting"` → `description`).
- **hokify**: list cards have no body; the detail page exposes the body via
  microdata `[itemprop="description"]`.

## Fix

Two paths, depending on whether the search response already carries the body:

1. **Inline while scraping** (no extra request): AMS maps `summary` → `description`
   and willhaben maps the list-level `description` (sponsored top job), both
   through a new `htmlToText` helper (`src/lib/server/util/html.ts`) that replaces
   tags with spaces — so block boundaries never merge adjacent words like
   "Deutsch B2"/"Erfahrung" — then decodes entities and collapses whitespace.
2. **New runner enrichment phase** (`enrich`) in `src/lib/server/scrape/runner.ts`:
   for active listings with `description IS NULL` whose source implements the new
   optional `SourceAdapter.fetchDescription`, it fetches each detail page once
   (bounded by `mapLimit`, concurrency 5), fills `description`, and recomputes the
   content hash so `rank-listings` re-evaluates the listing with real text.
   willhaben/karriere/hokify implement `fetchDescription`; AMS does not (its body
   already comes from `summary`). Already-filled descriptions are never
   re-selected, so each detail page is fetched at most once across runs.

No prompt, scoring math, or `RANK_PROMPT_VERSION` change: listings that gain a
description get a new content hash and are re-ranked automatically.

The `enrich` phase id was added to `RunPhaseId` (`schema.ts`), to
`createProgress()` (`runner.ts`), and to `phaseLabels`/fallback progress in the
dashboard (`src/routes/(app)/+page.svelte`, label "Beschreibungen").
