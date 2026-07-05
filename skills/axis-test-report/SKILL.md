---
name: axis-test-report
description: Use when build, lint, test, benchmark, pressure-test, or verification work needs a public-safe Axis v0.1 test report package in the local outbox. / 用于将构建、lint、测试、压测或验证结果采集为公开安全的 Axis v0.1 测试报告包。
---

# Test Report

Use this skill to capture validation evidence as an Axis v0.1 local package. The package is written under `.axis/outbox/`, carries stable manifest metadata, and can be published with `axis oss-publish`.

## Boundary

- Use `axis test-report` for package creation; do not hand-write package metadata.
- Keep raw logs local unless they are redacted and public-safe. In v0.1 the upload package has exactly four files, so raw log attachment handling is represented by a redacted excerpt or local path reference inside `report.md`.
- `manifest.json` and `metadata.json` must include `release.channel` and `release.gate`; the default channel stays `private_beta`.
- Do not include credentials, private URLs, customer names, internal ticket links, bearer tokens, or unredacted stack traces with private paths.

## Report Sections

Write `report.md` with these sections unless a project-specific public-safe template is already approved:

```markdown
# Test Report

## Summary
<what was validated>

## build/lint/test 命令摘要
<commands, exit status, and short result>

## 压测输入和结果摘要
<benchmark or pressure-test inputs, environment, p95/p99/QPS, and caveats>

## 原始日志附件
<redacted excerpt or local-only raw log path; do not upload unsafe raw logs>

## 失败原因分析
<root cause, failure scope, or "not applicable">

## 复测建议
<next validation command, data setup, or owner>

## Public Safety
<redaction and release channel check>
```

Use `experience.md` for reusable testing lessons, for example a stable command matrix, benchmark scope rule, or retry condition.

## Workflow

1. Confirm `.axis/config.yml` exists and validates.
2. Run the requested build/lint/test/benchmark commands and save public-safe notes.
3. Write the local report package:

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

4. Validate or publish through `axis-oss-publish`:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
axis oss-publish --repo <repo> --run-id <run_id> --local-only
```

## Validation

- Confirm package files are exactly `experience.md`, `manifest.json`, `metadata.json`, and `report.md`.
- Confirm `producer.skill` is `axis-test-report`.
- Confirm `artifact.status` matches the evidence: `passed`, `failed`, `partial`, or `informational`.
- Confirm `release.channel` remains `private_beta` unless `release.gate` is `passed`.
- Confirm stdout, stderr, and package files do not expose secrets or private endpoints.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update this skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
