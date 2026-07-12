---
name: axis-code-capture
description: Use when coding, refactor, bugfix, or architecture work needs a public-safe Axis v0.2 execution report and reusable experience card in the local outbox. / 用于将编码、重构、缺陷修复或架构工作采集为公开安全的 Axis v0.2 执行报告和经验卡片。
---

# Coding Capture

Use this skill after implementation work to create a public-safe Axis v0.2 package. The package is written under the organization-scoped local outbox and can later be validated or published.

## Boundary

- Require a valid v0.2 project configuration before capture. If the config is missing or still v0.1, invoke `axis-doc-project-init` and complete its conversational confirmation flow.
- Use the deterministic CLI; never hand-write `manifest.json` or `metadata.json`.
- The package contains `manifest.json`, `metadata.json`, `report.md`, and `experience.md`.
- Do not paste credentials, private URLs, customer data, internal ticket links, or raw unredacted logs.

## Workflow

1. Run `axis validate-config --repo <repo>` and confirm `contract_version: "0.2"` plus the organization-scoped OSS profile.
2. Prepare public-safe `report.md` and `experience.md`.
3. Write the package:

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

4. Inspect the returned `.axis/outbox/v0.2/<organization_id>/<project_slug>/<run_id>/` package.
5. Validate or publish it with `axis-ops-oss-publish`.

## Report Sections

Use these sections unless the user provides an approved template:

```markdown
## 需求理解摘要
## 实现摘要
## 文件改动摘要
## API/数据模型变化
## 验证命令
## 风险和后续事项
## 可复用经验卡片
```

Keep request summary, implementation summary, changed modules, API/data-model/config impact, verification commands and results, risks and follow-ups, and a reusable public-safe lesson in those sections.

## Validation

- `manifest.schema_version`, `metadata.schema_version`, and all four protocol declarations are `0.2`.
- Organization, project, OSS profile, release, checksum, and public-safety snapshots are present.
- `release.channel` is `private_beta` by default and `release.gate` must be `passed` before public release.
- Package files match the manifest and public-safety validation is `passed`.
- No secret value appears in stdout, stderr, or package files.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
