# AMS "Stelle anzeigen" link opens an error page

## Symptom

Clicking "Stelle anzeigen" for an AMS job opened
`https://jobs.ams.at/public/emps/jobs/22247667` and showed the AMS error page
"Leider ist ein Fehler aufgetreten – Ihre Anfrage konnte nicht verarbeitet
werden."

## Root cause

Each result from the AMS `/public/emps/api/search` response carries **two**
identifiers: a numeric `id` (e.g. `22182585`) and a `uuid` (e.g.
`a5ba55e4-d305-39fa-9651-7636becc406d`). The public detail route
`/public/emps/jobs/{…}` only resolves the **uuid**; passing the numeric `id`
returns the error page.

`toListing` in `src/lib/server/scrape/sources/ams.ts` built the URL from
`const id = r.id ?? r.uuid`, which prefers the numeric `id`, so every stored AMS
listing got a broken detail URL.

The unit test stayed green because its fixture only provided `id` (no `uuid`) —
it encoded the same wrong assumption as the code. Confirmed the real shape by
driving jobs.ams.at in a browser: the result links and the working detail pages
both use the uuid; the numeric id route errors.

## Fix

In `src/lib/server/scrape/sources/ams.ts`, use the `uuid` as the job's identity:
require it (`if (!uuid || !r.title) return null`), set `externalId` to the uuid,
and build the URL as `https://jobs.ams.at/public/emps/jobs/${uuid}`.

Updated `ams.spec.ts` to include `uuid` in the fixtures (matching the real
response) and to assert both the `externalId` and the resulting detail `url` use
the uuid.
