# Deprecation Policy

Deprecation keeps public assets discoverable without letting stale guidance look current.

## Status Values

- `draft`: Not ready for broad reuse.
- `active`: Current and reusable.
- `stale`: Needs review before reuse.
- `deprecated`: Kept for traceability; prefer a replacement.
- `archived`: Retained for history only.

## Rules

- Set `review_after` on every public skill metadata file and document asset metadata file.
- When marking an item `deprecated`, add a replacement when one exists.
- Do not delete a public catalog entry unless the content is unsafe or clearly obsolete.
- For unsafe content, prioritize redaction and history cleanup over normal deprecation.

## Review Cadence

Review active public assets at least once per quarter or when their validation command no longer reflects the repository.
