# hokify scraper silently returns zero listings

## Symptom

A refresh run produced no hokify jobs at all (other sources worked). No error —
hokify just contributed 0 added listings every run.

## Root cause

hokify redesigned its site (Nuxt). Two breakages in
`src/lib/server/scrape/sources/hokify.ts`:

1. **URL**: `https://hokify.at/jobs/m/{branch}/{city}` now returns only a tiny
   HTML meta-refresh stub (~130 bytes) that redirects to
   `https://hokify.at/jobs?branch=…&city=…`. `fetchText` does a plain fetch and
   does not follow a `<meta http-equiv="refresh">`, so it parsed the stub and
   found nothing.
2. **Title selector**: the old `parse()` looked for `h2 a[href^="/job/"]`. The new
   markup has no `<h2>` wrapper — the title link is a bare `a[href^="/job/"]`
   inside the `<li>` card. So even on a correct page it matched 0 cards.

Verified against the live page (2026-06-16): the new results URL renders 26
`a[href^="/job/"]` cards; `[data-cy="companyName"]` (company) and
`a[href$="-Jobs"]` (location) selectors still work unchanged.

## Fix

In `src/lib/server/scrape/sources/hokify.ts`:

- Build the search URL as
  `https://hokify.at/jobs?branch=${slug(keyword)}&city=${slug(location)}`.
- In `parse()`, select the title link as `a[href^="/job/"]` (drop the `h2`
  wrapper); company/location selectors are unchanged.

Updated `hokify.spec.ts` fixtures to the new card markup (no `<h2>`) and the new
search URL. (Done alongside adding `fetchDescription`, which reads the detail
page's `[itemprop="description"]` — see
`listings-ranked-without-description.md`.)
