---
name: axis-test-report
description: Use when build, lint, test, benchmark, pressure-test, or verification work needs a public-safe Axis v0.2 test report package in the local outbox. / 用于将构建、lint、测试、压测或验证结果采集为公开安全的 Axis v0.2 测试报告包。
---

# Test Report

Use this skill to capture validation evidence as an Axis v0.2 local package. The package is organization-scoped, carries stable manifest metadata, and can be validated or published with `axis-ops-oss-publish`.

## Boundary

- Require `axis validate-config --repo <repo>` to resolve v0.2 before creating a package. If it reports expired v0.1, use `axis-doc-project-init` and confirm the migration first.
- Use `axis test-report` for package creation; do not hand-write package metadata.
- Keep raw logs local unless they are redacted and public-safe. Never include credentials, private URLs, customer names, bearer tokens, or unredacted private paths.

## Workflow

1. Run the requested build, lint, test, benchmark, or pressure-test commands and record public-safe evidence.
2. Write the local report package:

```bash
axis test-report \
  --repo <repo> \
  --title "Demo Project Test Report" \
  --summary "Public-safe validation report for demo-project." \
  --status passed \
  --tag test-report \
  --report-file /tmp/test-report.md \
  --experience-file /tmp/test-experience.md
```

3. Inspect `.axis/outbox/v0.2/<organization_id>/<project_slug>/<run_id>/` and verify the returned run id.
4. Run a dry-run or local redaction check through `axis-ops-oss-publish`.

## Report Sections

Include these sections unless a project-specific public-safe template is already approved: `Summary`, `build/lint/test` command results, `压测输入和结果摘要`, `原始日志附件`, `失败原因分析`, `复测建议`, and `Public Safety`. Use `experience.md` for reusable testing lessons.

## Validation

- `manifest.schema_version`, `metadata.schema_version`, and protocol declarations are `0.2`.
- `artifact.status` matches the evidence: `passed`, `failed`, `partial`, or `informational`.
- `release.channel` remains `private_beta` and `release.gate` remains `not_requested` unless an explicit passed gate exists.
- Release channel remains `private_beta` unless the gate is explicitly `passed`.
- Stdout, stderr, and package files do not expose secret values or private endpoints.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update this skill bundle, validate it, refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
