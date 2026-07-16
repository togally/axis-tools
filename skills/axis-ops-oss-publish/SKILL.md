---
name: axis-ops-oss-publish
description: Use when an existing Axis v0.2 outbox package must be validated, redacted, dry-run checked, synchronized, or explicitly uploaded to Aliyun OSS. / 用于校验、脱敏、预演、同步或经明确授权后上传已有 Axis v0.2 outbox 包。
---

# Axis Operations OSS Publish

Publish an existing Axis v0.2 package. This skill does not create project knowledge, reports, or other source documents.

## When to Use

- Validate, locally redact, or dry-run an existing `.axis/outbox/v0.2/.../{run_id}` package.
- Synchronize a project-knowledge snapshot or publish an immutable capture package after explicit authorization.
- Verify the resulting OSS object layout, manifest completion marker, and publish status.

## Do Not Use

- Do not use before a capture command has produced a concrete v0.2 `run_id`.
- Do not use to generate or repair the documents inside a package.
- Do not upload a v0.1 package. Return `migration_required` and tell the user that `axis-doc-project-init` can migrate the repository; do not invoke it automatically or create a reverse handoff.

## Inputs

- Repository path, exact `run_id`, capture kind, and resolved `organization.id` plus `project.slug`.
- Resolved OSS profile, required credential-variable names, release channel/gate, local manifest, and dry-run result.
- Exact computed `target_prefix` and the current-task upload decision for that same `run_id + target_prefix`.

## Outputs

- Validation/redaction/dry-run result with file count, redaction count, checksums, and exact target prefix.
- For an authorized write, upload result and `publish.status=published`; otherwise a local `publish.status=local_ready` result.
- Conflict, residual permission risk, or partial synchronization evidence without hidden retries or widened permissions.

## Safety and Boundaries

- Credentials come only from environment variables named by the resolved organization profile. Never request, print, persist, or echo credential values, endpoints, bearer tokens, or private URLs.
- A real upload requires explicit approval for the exact current `run_id` and `target_prefix`. Approval for another run/prefix, silence, timeout, or ambiguous wording is not consent.
- Establish readiness with config validation, credential-name presence, public-safety checks, and `--dry-run` before asking. Ask and wait; do not upload in the same turn that requests approval.
- `release.channel: public` requires `release.gate: passed`; otherwise preserve `private_beta`.
- Do not delete stale or unrelated remote objects, overwrite conflicting immutable packages, broaden IAM permissions, or probe write access before approval.

## Three-Step Work Contract

1. Co-create the publish boundary: identify the exact run, target, capture type, requested mode, release gate, and whether external upload is in scope.
2. Execute the safe preflight: validate config/package, run redaction or local-only processing when requested, run dry-run, and present readiness evidence.
3. Verify the result: after exact approval, upload once, confirm the completion manifest and status, or preserve the local package and report the precise failure.

## Layout and Synchronization Contract

- Every v0.2 target starts with `{prefix}/orgs/{organization_id}/projects/{project_slug}/`.
- Project knowledge synchronizes current documents at stable paths and stores completion metadata under `_sync/`; local `documents/` is not part of remote object keys.
- Project archives stay under `{prefix}/_archive/orgs/{organization_id}/projects/{project_slug}/`, outside the current document list.
- Other captures use `projects/{project_slug}/packages/{run_id}/` and are immutable by run ID.
- A project-knowledge checksum change is an intentional current-document update. A checksum conflict inside an immutable package is a stop condition.
- Upload content first and upload the applicable `manifest.json` last. A failed pre-manifest synchronization leaves the previous manifest authoritative.

## Workflow

```bash
axis validate-config --repo <repo>
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
axis oss-publish --repo <repo> --run-id <run_id> --local-only
```

Only after exact authorization:

```bash
axis oss-publish --repo <repo> --run-id <run_id>
```

Treat `--local-only` output as a new validated publish state: inspect any redaction/manifest refresh and record its resulting checksums. It does not authorize or imply an upload.

## Checks

- Local files, manifest entries, config snapshots, organization, project, profile, run ID, and computed target prefix agree.
- Project-knowledge paths omit `documents/` and remote run directories; archives remain outside the current-document manifest.
- General packages use `projects/{project_slug}/packages/{run_id}` and reject checksum conflicts.
- Public-safety validation passes and release channel/gate remain consistent.
- Dry-run/local-only reports `local_ready`; only a verified remote upload reports `published`.
- Stdout/stderr and handoff text expose no credentials, OSS endpoints, tokens, or private URLs.

## Light Adversarial Review

Keep challenge and critique to no more than 30% of the interaction. Verify run/prefix identity, release gates, redaction, conflict semantics, and authorization freshness; never let convenience turn a dry-run into an implicit external write.

## After Use Deposition

Check whether the run exposed a reusable path, redaction, authorization, synchronization, or conflict rule. If yes, update public-safe bundle material, validate it, refresh the local copy, and push only when authorized. Otherwise report that no skill update is needed.
