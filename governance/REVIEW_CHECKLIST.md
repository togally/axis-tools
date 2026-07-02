# Review Checklist

Use this checklist for public-safe skill and asset changes.

## Required Checks

- [ ] The change uses mock, redacted, or public-reference data only.
- [ ] `SKILL.md` keeps Codex-compatible frontmatter with `name` and `description`.
- [ ] Governance metadata lives in `skill.meta.yaml` or `asset.meta.yaml`.
- [ ] Catalog entries point to existing paths and do not duplicate full content.
- [ ] Schema files are valid JSON.
- [ ] Templates remain generic and reusable.
- [ ] No credentials, raw logs, screenshots, personal data, or platform identifiers are present.
- [ ] Validation output is included in the pull request.

## Approval Boundaries

Changes under `schemas/`, `catalog/`, `templates/`, or `governance/` affect repository policy and should be reviewed as governance changes, not ordinary content edits.
