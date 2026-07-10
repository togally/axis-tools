# Deprecation Policy

Deprecation keeps public assets discoverable without letting stale guidance look current.

Axis v0.1 is expired for normal CLI operations. It may be parsed only as migration input; users must inspect, confirm the mapped v0.2 fields, satisfy the environment-name gate, and apply the transaction before capture or publish.

Every new protocol version must include an adjacent mapping from its immediate predecessor. Cross-version migration chains are executed one adjacent mapping at a time until the latest version is reached.

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
