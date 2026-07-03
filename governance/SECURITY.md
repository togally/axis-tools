# Public Safety Policy

`axis-tools` is treated as public-facing. Every committed byte should be safe to read without extra access context.

## Never Commit

- Credentials, cookies, signing keys, or environment files.
- Raw logs, screenshots, copied incident text, or unredacted transcripts.
- Non-public hostnames, repository remotes, package registries, or storage locations.
- Personal data or organization-specific identifiers.
- Real issue, pull request, ticket, or support-case content.

## Allowed Examples

- Mock data created for the template.
- Redacted examples where the source cannot be reconstructed.
- Public documentation links.
- Generic command examples that do not depend on hidden infrastructure.

## Scanner Intent

Repository scanners are for public-safety checks: schema validity, secret detection, blocked host patterns, link health, and stale review dates. They do not deploy software or publish runtime assets.

## If Unsafe Data Is Found

1. Stop adding new changes on top of the unsafe content.
2. Remove or redact the content.
3. Rotate any exposed credential if applicable.
4. Decide whether history cleanup is required before continuing public work.
