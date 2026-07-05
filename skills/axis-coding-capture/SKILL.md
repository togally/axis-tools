---
name: axis-coding-capture
description: Use when coding, refactor, bugfix, or architecture work needs a public-safe Axis v0.1 execution report and reusable experience card in the local outbox. / 用于将编码、重构、缺陷修复或架构工作采集为公开安全的 Axis v0.1 执行报告和经验卡片。
---

# Coding Capture

Use this skill after implementation work to turn the result into a standard Axis v0.1 local package. The package is written under `.axis/outbox/` and can later be published with `axis oss-publish`.

## Boundary

- Use the existing CLI for deterministic packaging; do not hand-write `manifest.json`.
- The generated package contains `manifest.json`, `metadata.json`, `report.md`, and `experience.md`.
- `manifest.json` and `metadata.json` must include `release.channel` and `release.gate`; by default they remain `private_beta` and `not_requested`.
- Summarize private code, logs, URLs, and identifiers. Do not paste secrets, customer data, internal issue URLs, or raw unredacted logs.

## Report Sections

Write `report.md` with these sections when the user has not provided a stronger template:

```markdown
# Coding Capture

## 需求理解摘要
<what was requested and the accepted scope>

## 实现摘要
<what changed and why>

## 文件改动摘要
<files or modules changed; keep private paths generalized when needed>

## API/数据模型变化
<API, schema, config, permission, or compatibility changes; say none if none>

## 验证命令
<build, lint, test, benchmark, or manual checks and results>

## 风险和后续事项
<known risk, rollback notes, uncovered tests, follow-up owners>

## 可复用经验卡片
<public-safe reusable lesson candidate>
```

Write `experience.md` as the reusable card. Keep it generic enough to help another project without leaking local facts.

## Workflow

1. Confirm `.axis/config.yml` exists. If not, use `axis-project-init` first.
2. Prepare public-safe `report.md` and `experience.md` files.
3. Write the local package:

```bash
axis coding-capture \
  --repo <repo> \
  --title "Demo Project Coding Capture" \
  --summary "Public-safe coding capture for the demo-project change." \
  --status informational \
  --tag coding-capture \
  --report-file /tmp/coding-report.md \
  --experience-file /tmp/coding-experience.md
```

4. Inspect the returned `.axis/outbox/.../<run_id>/` package.
5. Publish or validate through `axis-oss-publish`:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
axis oss-publish --repo <repo> --run-id <run_id> --local-only
```

## Validation

- Confirm package files are exactly `experience.md`, `manifest.json`, `metadata.json`, and `report.md`.
- Confirm `producer.skill` is `axis-coding-capture`.
- Confirm `release.channel` is `private_beta` unless a passed gate explicitly allows `public`.
- Confirm public-safety validation status is `passed` and no secret values appear in stdout, stderr, or package files.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
