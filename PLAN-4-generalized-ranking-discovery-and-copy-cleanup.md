# Plan 4: Generalized Ranking, Discovery Quality, and Copy Cleanup

## Summary

Remove the remaining gastronomy/Vienna assumptions after the manual and AI search configuration work exists. Improve ranking, drafting, and discovery metadata so the app behaves like a general Austrian job and business discovery tool.

## Key Changes

- Rename internal concepts where useful, but avoid large UI churn:
  - `lead` can remain the table name for now if changing it would create unnecessary migration risk.
  - user-facing copy should describe `Betriebe` or `potenzielle Arbeitgeber`, not gastronomy-specific leads.
- Add discovery metadata:
  - store which configured OSM tags matched a business.
  - store which keyword and city discovered a listing when source data makes that possible.
  - include these fields in content hashes so changed discovery context can trigger reranking.
- Generalize lead ranking:
  - prompt should evaluate whether a speculative application fits the configured search keywords, business category, distance, and profile.
  - remove hardcoded `Service-/Barista-Kraft`.
  - include selected OSM tag labels in the lead ranking context.
- Generalize email drafting:
  - remove hardcoded gastronomy wording.
  - mention the relevant target role from configured search keywords.
  - use neutral wording when no exact target role is obvious.
- Improve Austria city behavior:
  - if explicit job search locations exist, use them.
  - otherwise derive the city or municipality from the validated home address.
  - if no city can be derived, skip portal scraping with a clear progress message instead of silently falling back to Vienna.
- Improve reconciliation:
  - closing vanished listings should only affect sources and city-keyword combinations searched in the current run.
  - do not close listings from a city that was not part of the current configuration.
- Update dashboard and empty-state copy:
  - remove `Wien` references.
  - make setup guidance say address and search configuration are required.
  - describe businesses as nearby potential employers from selected categories.
- Update README and relevant tests to reflect general Austrian search.

## Test Plan

- Unit test ranking prompt construction:
  - no Service/Barista fallback remains.
  - configured keywords and OSM tag labels are included.
  - address-derived city is included when available.
- Unit test email prompt construction:
  - no gastronomy-specific system text remains.
  - configured keywords shape the suggested role.
- Unit test refresh behavior:
  - explicit cities override address-derived city.
  - address-derived city is used when explicit cities are empty.
  - scraping is skipped when no city can be determined.
  - reconciliation only closes listings for searched source/city scope.
- Unit test lead content/ranking fingerprints:
  - changing OSM tag configuration triggers reranking.
  - unchanged businesses are skipped as before.
- Update UI tests or component tests that assert Vienna-specific text.
- Run `pnpm check`, `pnpm test`, and `pnpm build`.

## Assumptions

- Table renaming from `lead` to `business_candidate` is not required for this phase.
- The product boundary is Austria.
- Search relevance is still decided by retrieval plus LLM ranking, not exact local keyword matching.
- The app remains single-user/single-settings until a later search-profile project.
