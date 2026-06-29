# LLM e-mail drafts sometimes lacked paragraph breaks or used unnatural distance wording

## Fix timestamp

2026-06-29 18:34:34 CEST (+0200)

## Current commit

6ea345490000fea7fa5766820f2161cbc5136a46

## Symptom

Some generated German application e-mail drafts were usable, but others came back as
one long paragraph, mentioned exact meter distances such as "112 Meter", or added
extra text after "Mit freundlichen Grüßen" even though the sender name should be the
last line.

## Root cause

The draft prompt asked for a short German e-mail but did not define the required
paragraph structure or a strict terminal signoff. The user prompt also exposed exact
meter distances and the applicant's exact home address, so the model could reuse those
details verbatim in the final draft.

## Fix

`src/lib/server/llm/draft-email.ts` now gives the model an explicit body structure:
anrede, blank line, one concise application paragraph, blank line, then exactly
"Mit freundlichen Grüßen" and the configured sender name as the final line. It also
forbids text after the sender name and tells the model to avoid exact distance values
or the applicant's exact address.

The draft prompt now removes the applicant's exact home-address line from the profile
context and replaces raw meter distance with a coarse proximity label. The draft prompt
version was bumped to regenerate existing saved drafts through the existing fingerprint
flow.

`src/lib/server/llm/draft-email.spec.ts` covers the new prompt contract, the removal
of exact private address and meter distance from the prompt, and the version bump.
