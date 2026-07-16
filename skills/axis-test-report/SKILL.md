---
name: axis-test-report
description: Use when the user explicitly asks to package existing build, lint, test, benchmark, or verification evidence as an Axis v0.2 test report. / 用于用户明确要求将已有构建、lint、测试、压测或验证证据打包为 Axis v0.2 测试报告。
---

# Test Report

Create one public-safe `test_report` package from evidence that already exists. This skill packages validation results; it does not execute the underlying test, benchmark, or implementation.

## When to Use

- The user explicitly asks to capture, archive, or package completed validation evidence.
- Build, lint, test, benchmark, pressure-test, review, or manual-check results already exist.

## Do Not Use

- Do not trigger automatically after ordinary testing or coding.
- Use `$axis-test-benchmark` to execute a benchmark and `$axis-test-side-effects` to execute a real state-changing test.
- Use `$axis-code-capture` for an implementation report and reusable coding experience.
- Do not create multiple package types unless the user explicitly asks for each one.

## Inputs

- Repository with a validated Axis v0.2 project configuration.
- Exact commands, target environment and revision, timestamps, results, failures, skipped checks, and artifact references.
- Public-safe title, summary, status, tags, report content, and optional testing experience.
- Publication intent, if any, kept separate from local package creation.

## Workflow

1. Run `axis validate-config --repo <repo>`. If v0.2 configuration is missing, use `$axis-doc-project-init` and complete its confirmation flow.
2. Reconcile the requested status with the evidence. Preserve failures and skipped checks instead of rewriting them as success.
3. Create the deterministic package:

```bash
axis test-report \
  --repo <repo> \
  --title "Public-safe test report" \
  --summary "Verified validation evidence." \
  --status passed \
  --tag test-report \
  --report-file /tmp/test-report.md \
  --experience-file /tmp/test-experience.md
```

4. Inspect `.axis/outbox/v0.2/<organization_id>/<project_slug>/<run_id>/` and verify the returned run id.
5. Use `$axis-ops-oss-publish` only for local validation or after a separate explicit upload decision.

## Outputs

- One package containing the Axis v0.2 manifest, metadata, report, and optional experience content.
- Returned run id and package-relative location.
- Public-safe summary of commands, workload or inputs, results, failures, skipped checks, retest guidance, and reusable lessons.
- Artifact status of `passed`, `failed`, `partial`, or `informational` matching the evidence.

## Safety and Boundaries

- Use `axis test-report`; never hand-write package metadata.
- Keep raw logs local unless explicitly redacted and public-safe. Exclude credentials, tokens, private endpoints, customer names, internal links, and private absolute paths.
- Local capture does not authorize OSS upload. Dry-run or `--local-only` validation may proceed; external upload requires explicit current-run user confirmation.
- Keep `release.channel: private_beta` and `release.gate: not_requested` unless an explicit passed gate exists.
- Do not omit failed checks, inflate coverage, or claim a target/revision that the evidence did not test.

## Checks

- `manifest.schema_version`, `metadata.schema_version`, and protocol declarations are `0.2`.
- Artifact status matches the exact build, lint, test, benchmark, or verification evidence.
- Manifest files, checksums, organization, project, release, and public-safety snapshots are valid.
- Stdout, stderr, report, and experience files expose no secret values or private endpoints.
- No OSS upload occurred without explicit confirmation.

## After Use Deposition

If packaging produced a reusable report structure, redaction rule, validation command, or edge case, update this skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise report that no skill update is needed.
