-- Remove listings scraped before city filtering existed. These rows have a NULL
-- discovery_city, so they were never matched against the configured search
-- cities (e.g. Villach/Klagenfurt jobs leaked in under a "Wien" search) and the
-- reconcile step can never close them (it matches on discovery_city). Every
-- listing produced by the current adapters sets a non-empty discovery_city, so
-- this only clears the stale backlog; the next run repopulates city-matched jobs.
DELETE FROM "listing"
WHERE "discovery_city" IS NULL OR "discovery_city" = '';
