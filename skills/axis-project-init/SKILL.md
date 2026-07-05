---
name: axis-project-init
description: Use when starting an Axis v0.1 project that needs .axis/config.yml, .axis/outbox/ ignore rules, and private_beta release metadata before capture or OSS publish. / 用于初始化 Axis v0.1 项目的配置、outbox 忽略规则和 private_beta 发布元数据。
---

# Project Init

Use this skill to initialize the local Axis v0.1 package contract for a repo before coding capture, test report capture, or OSS publish. Keep all examples public-safe: use mock slugs, redacted names, and environment variable names only.

## Boundary

- `axis project-init` writes `.axis/config.yml` and ensures `.axis/config.local.yml` plus `.axis/outbox/` are ignored.
- Do not write credentials, private URLs, customer names, internal ticket links, or raw logs into committed config.
- The default release fields are `release.channel: private_beta` and `release.gate: not_requested`; `public` requires an explicit passed release gate.
- Local outbox packages live under `.axis/outbox/v0.1/<project>/<run_id>/` and are publishable by `axis oss-publish`.

## Workflow

1. Confirm the public-safe project slug and display name. The slug must be lowercase and match the CLI validation rule.
2. Initialize and validate config:

```bash
axis project-init --repo <repo> --project-slug demo-project --display-name "Demo Project"
axis validate-config --repo <repo>
```

3. If the init work needs a durable run record, write a local outbox capture with `axis coding-capture`:

```bash
axis coding-capture \
  --repo <repo> \
  --title "Demo Project Init Capture" \
  --summary "Public-safe Axis v0.1 init capture for demo-project." \
  --status informational \
  --tag project-init \
  --report-file /tmp/project-init-report.md \
  --experience-file /tmp/project-init-experience.md
```

4. Publish or dry-run the generated package through `axis oss-publish`:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
axis oss-publish --repo <repo> --run-id <run_id> --local-only
```

Use the returned `package_dir` to identify the `run_id`.

## Validation

- Confirm `.axis/config.yml` contains `contract_version: "0.1"`.
- Confirm `.axis/config.yml` contains the v0.1 skill names: `axis-project-init`, `axis-coding-capture`, `axis-test-report`, and `axis-oss-publish`.
- Confirm `.axis/config.local.yml` and `.axis/outbox/` are ignored, not committed.
- Confirm any generated `manifest.json` and `metadata.json` keep `release.channel` and `release.gate` copied from config.

## Common Mistakes

- Putting real OSS endpoint values, access keys, or local override values into `.axis/config.yml`.
- Switching to `release.channel: public` without `release.gate: passed`.
- Treating project init as publish completion. Init prepares the repo; capture writes `.axis/outbox/`; `axis-oss-publish` publishes the package.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
