# Plan 3: AI Generation for Search Keywords and OSM Categories

## Summary

Add an AI-assisted workflow that asks the user what jobs they want to find, generates Stellen-Keywords and OSM categories, and opens a selectable review dialog before saving. Reuse the existing preview/apply pattern from CV profile import instead of duplicating review logic.

## Key Changes

- Define search-config schemas:
  - `searchConfigPreviewSchema` for AI-generated `jobSearchKeywords`, `businessOsmTags`, and optionally `jobSearchLocations`.
  - `searchConfigPatchSchema` with `selected` fields and a preview payload, matching the profile-import patch pattern.
- Add server logic similar to `cv-profile.ts`, but for search configuration:
  - normalize model output.
  - deduplicate keywords and OSM tags.
  - validate OSM tags against the local catalog.
  - reject empty or unsupported AI output with a clear error.
- Add endpoints:
  - `POST /api/search-config/preview`
  - `PATCH /api/search-config`
- Add a button in `Suchkonfiguration`:
  - label: `Suchkonfiguration mit KI erstellen`
  - disabled when Base URL and model are missing.
  - disabled while settings autosave has unsaved changes.
- Add a dialog that first asks the user what they want to find:
  - free text textarea, for example: `Welche Jobs moechtest du finden?`
  - optional hint text explaining that examples can include role, industry, seniority, working hours, and exclusions.
- After the prompt is submitted, call `/api/search-config/preview`.
- Open the same selectable review pattern used by profile import:
  - `SearchConfigEditor` receives only the AI-returned fields.
  - all returned fields are selected by default.
  - user can deselect bad changes before applying.
- Reuse shared preview/apply mechanics:
  - extract common dialog state and apply helpers where useful.
  - do not create a second independent checkbox/editor pattern.
- AI prompt behavior:
  - generate practical portal search terms in German and English when useful.
  - include common Austrian job-market synonyms.
  - prefer broad retrieval over overly narrow keywords.
  - select OSM tags only from the provided local catalog.
  - never invent OSM keys or values outside the catalog.
  - optionally propose job search cities only when the user explicitly mentions cities.
- Applying the preview updates only selected fields and leaves deselected fields unchanged.

## Test Plan

- Unit test output normalization:
  - handles `{ searchConfig: ... }` wrapper.
  - drops null fields.
  - trims and deduplicates keywords.
  - rejects OSM tags outside the catalog.
- Unit test patch behavior:
  - selected fields update.
  - deselected fields do not update.
  - missing selected field fails.
  - duplicate selected field fails.
- Unit test preview error handling:
  - missing LLM config returns a controlled message.
  - unsupported AI output returns a controlled message.
  - LLM auth failure returns a useful message.
- Component test the workflow where practical:
  - entering intent opens a generated preview.
  - deselecting a field excludes it from the PATCH payload.
  - applying invalid preview is blocked by server validation.
- Run `pnpm check`, `pnpm test`, and `pnpm build`.

## Assumptions

- AI generation updates only search configuration, not profile fields.
- The user intent prompt is not stored in v1.
- The AI receives the OSM catalog labels and allowed `key=value` pairs in the prompt.
- Search profiles remain out of scope.
