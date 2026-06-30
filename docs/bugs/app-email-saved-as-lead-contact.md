# App-owned e-mail saved as Betrieb contact

## Fix timestamp

2026-06-30 20:17:47 CEST (+0200)

## Git commit

3d7c427cfcb50d0634a544afbccf2ea3bf60623e

## Symptom

Some automatically discovered Betriebe showed the app user's own login/applicant e-mail as
the Betrieb contact address.

## Confirmed root cause

Automatic lead contact discovery accepted the first e-mail found in OSM contact tags or
website HTML. The shared HTTP `User-Agent` also contained a personal contact e-mail. If a
business website echoed request metadata into its page body, the website extractor could
read that app-owned address and persist it as a Betrieb e-mail.

The lead ranking and cold e-mail draft prompts did not include `lead.email`; the bad data
entered earlier during deterministic lead enrichment.

## Changes made

- Removed the personal address from the default scraper `User-Agent`.
- Added an app-owned e-mail denylist for automatic lead e-mail enrichment using login
  e-mails, applicant e-mail, reply-to e-mail and configured sender e-mail.
- Applied the denylist to OSM-sourced and website-scraped lead e-mails.
- Preserved manual Betrieb contact edits and existing saved rows.
- Added regression tests for blocked automatic e-mail extraction and for keeping lead
  contact e-mails out of LLM prompts.
