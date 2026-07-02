# Contributing Public-Safe Assets

This repository accepts reusable Axis skills and AI document assets that are safe to publish. Keep contributions generic, validated, and easy to review.

## Contribution Flow

1. Start from `templates/skill/` or `templates/doc-asset/`.
2. Fill the required metadata sidecar.
3. Add or update the relevant catalog entry.
4. Run the focused validation for public governance.
5. Include validation evidence in the pull request.

## Public-Safe Rules

- Use mock, redacted, or public-reference data only.
- Do not include credentials, raw logs, screenshots, personal data, non-public hostnames, or platform identifiers.
- Do not copy real task transcripts into examples.
- Do not add project-specific facts that cannot be reused outside the original context.
- Keep runnable skill instructions in `SKILL.md`; keep governance metadata in `skill.meta.yaml`.

## Review Expectations

Schema, catalog, template, and governance changes should receive architecture or repository-owner review before merge. CI in this repository is a quality gate for files and metadata; it is not a deployment path.
