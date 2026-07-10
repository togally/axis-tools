---
name: axis-oss-publish
description: Use when an Axis v0.2 local outbox package must be validated, redacted locally, dry-run checked, or uploaded to the configured Aliyun OSS profile. / 用于校验、脱敏、本地预演或上传 Axis v0.2 outbox 包到配置的阿里云 OSS profile。
---

# OSS Publish

Use this skill after `axis-coding-capture` or `axis-test-report` creates a package under the v0.2 organization-scoped outbox. The publisher validates the package, redacts public-safety findings locally, uploads content, and uploads `manifest.json` last.

## Boundary

- `axis oss-publish` publishes an existing local v0.2 package; it does not create a report.
- If the repository config is v0.1, stop with the expired migration message and invoke `axis-project-init` before publishing.
- Credentials must come from environment variables named by the selected organization registry profile. Never ask the user to paste credential values or write them to config, reports, logs, or comments.
- `release.channel: public` is allowed only when `release.gate: passed`.

## Workflow

1. Validate the project config:

```bash
axis validate-config --repo <repo>
```

2. Locate the package under `.axis/outbox/v0.2/<organization_id>/<project_slug>/<run_id>/`.
3. Run a dry-run:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
```

4. For local redaction and manifest refresh without upload:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --local-only
```

5. Upload only after dry-run passes and the release boundary is correct:

```bash
axis oss-publish --repo <repo> --run-id <run_id>
```

The upload order places `manifest.json` last so readers never treat a partial package as complete.

## Validation

- Local files match `manifest.files` and the organization/project/profile snapshot matches the resolved config.
- Public-safety validation is `passed`.
- `release.channel` remains `private_beta` unless `release.gate` is `passed`.
- `publish.status` is `local_ready` after dry-run or local-only and `published` only after a successful upload.
- Stdout and stderr do not contain OSS endpoint values, access key IDs, access key secrets, bearer tokens, or private URLs.

## Failure Handling

- If a remote object exists with a different checksum, stop and report the conflict; do not overwrite silently.
- If redaction occurs, inspect the updated package before upload.
- If upload fails, keep the package local and rerun after fixing environment variables, profile selection, or the remote object conflict.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
