---
name: axis-code-capture
description: Use when the user explicitly asks to package completed coding work as an Axis v0.2 execution report and reusable experience card. / 用于用户明确要求将已完成的编码工作打包为 Axis v0.2 执行报告和可复用经验卡片。
---

# Coding Capture

Create one public-safe `coding_capture` package from verified implementation evidence. This skill records completed work; it does not diagnose, implement, test, or publish that work.

## When to Use

- The user explicitly asks to capture, archive, or package completed coding, refactor, bugfix, or architecture work.
- An Axis v0.2 execution report and `experience.md` are the requested outputs.

## Do Not Use

- Do not trigger automatically after ordinary coding work.
- Use the relevant `axis-code-*` skill to diagnose or implement the change.
- Use `$axis-test-report` when the requested artifact is a validation-only report package.
- Use `$axis-doc-drift-capture` for task/version records and document-drift classification.
- Do not create all capture types unless the user explicitly asks for each one.

## Inputs

- Repository with a validated Axis v0.2 project configuration.
- Completed change summary, changed modules or files, API/data/config impact, and verification evidence.
- Public-safe title, summary, status, tags, report content, and optional reusable experience.
- Known gaps, failed or skipped checks, and release or publication intent.

## Workflow

1. Run `axis validate-config --repo <repo>` and confirm `contract_version: "0.2"` plus the organization and project identity. If migration is required, use `$axis-doc-project-init` and complete its confirmation flow.
2. Prepare a concise public-safe report and experience card. Mark missing evidence instead of inventing it.
3. Create the package with the deterministic CLI:

```bash
axis coding-capture \
  --repo <repo> \
  --title "Public-safe coding capture" \
  --summary "Verified implementation evidence." \
  --status informational \
  --tag coding-capture \
  --report-file /tmp/coding-report.md \
  --experience-file /tmp/coding-experience.md
```

4. Inspect the returned `.axis/outbox/v0.2/<organization_id>/<project_slug>/<run_id>/` package.
5. Use `$axis-ops-oss-publish` only for local validation or after a separate explicit upload decision.

## Outputs

- One package containing `manifest.json`, `metadata.json`, `report.md`, and `experience.md`.
- Returned run id and package-relative location.
- Report sections covering requirement, implementation, changed scope, API/data/config impact, verification, risk, and reusable lessons.
- Clear status for failed, skipped, blocked, or unverified evidence.

## Safety and Boundaries

- Use the CLI; never hand-write package manifests or metadata.
- Never include credentials, tokens, private URLs, customer data, internal issue links, raw unredacted logs, or private absolute paths.
- Local capture does not authorize OSS upload. Dry-run or `--local-only` validation may proceed locally; external upload requires explicit current-run user confirmation.
- Keep `release.channel: private_beta` by default. A public release requires `release.gate: passed` and separate release authority.
- Do not claim implementation or verification that is absent from the supplied evidence.

## Checks

- Schema, metadata, protocol declarations, organization, project, release, checksum, and public-safety snapshots are valid Axis v0.2 values.
- `manifest.files` matches the four package files and checksums.
- Package status matches the evidence; failed or skipped checks remain visible.
- No secret value or private endpoint appears in stdout, stderr, or package files.
- No OSS upload occurred without explicit confirmation.

## After Use Deposition

If capture produced a reusable report rule, redaction check, validation command, or edge case, update this skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise report that no skill update is needed.
