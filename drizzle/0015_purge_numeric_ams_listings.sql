-- Remove pre-fix AMS listings keyed by the numeric job id. Their detail URL
-- (/public/emps/jobs/<number>) opens the AMS error page; the uuid is the real
-- identity. The numeric id cannot be mapped to a uuid in place, so delete these
-- rows and let the next scrape re-add the jobs with correct uuid keys/URLs.
-- UUID-keyed rows contain hyphens, so `^[0-9]+$` matches only the stale rows.
DELETE FROM "listing"
WHERE "source" = 'ams'
  AND "external_id" ~ '^[0-9]+$';
