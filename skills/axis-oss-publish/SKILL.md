---
name: axis-oss-publish
description: Use when an Axis v0.1 local outbox package must be validated, redacted locally, dry-run checked, or uploaded to the controlled Aliyun OSS prefix. / 用于校验、脱敏、本地预演或上传 Axis v0.1 outbox 包到受控阿里云 OSS 前缀。
---

# OSS Publish

Use this skill after `axis-coding-capture` or `axis-test-report` has created a package under `.axis/outbox/`. The publisher validates the package, preserves `release.channel` and `release.gate`, uploads package files, and uploads `manifest.json` last.

## Boundary

- `axis oss-publish` publishes an existing local package; it does not create a new report package.
- If the publish action itself needs a durable report, first create one with `axis coding-capture` or `axis test-report`.
- Credentials must come from environment variables named in `.axis/config.yml`; never write credential values to config, reports, logs, or comments.
- `release.channel: public` is allowed only when `release.gate: passed`; otherwise keep `private_beta`.
- The controlled prefix is the configured OSS prefix, for example `axis/v0.1/private-beta/packages`.

## Workflow

1. Validate the project config:

```bash
axis validate-config --repo <repo>
```

2. Locate the package run under `.axis/outbox/v0.1/<project>/<run_id>/`.
3. Run a dry-run before real upload:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
```

4. For redaction and local manifest refresh without upload, run:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --local-only
```

5. Upload only after dry-run passes and the release boundary is correct:

```bash
axis oss-publish --repo <repo> --run-id <run_id>
```

The upload order must place `manifest.json` last so readers never treat a partial package as complete.

## Validation

- Confirm local package files match `manifest.files`.
- Confirm `metadata.public_safety.reviewed` is true and validation status is `passed`.
- Confirm `release.channel` and `release.gate` match `.axis/config.yml`.
- Confirm stdout and stderr do not contain OSS endpoint values, access key IDs, access key secrets, bearer tokens, or private URLs.
- Confirm `publish.status` is `local_ready` after `--dry-run` or `--local-only`, and `published` only after a successful upload.

## Failure Handling

- If a remote object exists with a different checksum, stop and report the conflict; do not overwrite silently.
- If redaction occurs, inspect the updated package before upload.
- If upload fails, keep the package local and rerun after fixing credentials, prefix, or remote object conflict.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update this skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
