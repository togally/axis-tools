---
name: axis-ops-oss-publish
description: Use when an Axis v0.2 local outbox package must be validated, redacted, dry-run checked, synchronized as project documents, or uploaded as an immutable project package to Aliyun OSS. / 用于校验、脱敏、预演或发布 Axis v0.2 outbox；支持项目文档同步和项目内不可变包上传。
---

# OSS Publish

Use this skill after an Axis capture command creates a package under the organization-and-project-scoped outbox. Validate the package, preserve the release boundary, upload content, and upload the applicable manifest last.

## Boundary

- `axis oss-publish` publishes an existing local package; it does not create a report or project document.
- Every v0.2 publish target requires both `organization.id` and `project.slug` from the resolved organization registry and project config.
- If a repository still uses v0.1, treat it as legacy compatibility and direct new publishing configuration to `$axis-doc-project-init` v0.2 migration.
- Credentials must come from environment variables named by the selected organization OSS profile. Never ask the user to paste values or write them to config, documents, reports, logs, or comments.
- `release.channel: public` is allowed only when `release.gate: passed`; otherwise preserve `private_beta`.

## Canonical v0.2 OSS Layout

Always organize OSS objects as organization then project:

```text
{prefix}/orgs/{organization_id}/projects/{project_slug}/
```

Project knowledge uses fixed-path synchronization:

```text
{prefix}/orgs/{organization_id}/projects/{project_slug}/
|-- metadata.yaml
|-- architecture/
|-- business/
|-- gaps/
`-- _sync/
    |-- metadata.json
    `-- manifest.json
```

Project document archives remain outside the current-document tree so Dashboard history never pollutes normal browsing:

```text
{prefix}/_archive/orgs/{organization_id}/projects/{project_slug}/
`-- {canonical_path}.history/{archive_id}/
    |-- metadata.json
    `-- document.{ext}
```

The local snapshot may contain a `documents/` wrapper. Remove only that wrapper from OSS object keys: `documents/architecture/business.md` becomes `architecture/business.md`. Map local `metadata.json` and `manifest.json` to `_sync/metadata.json` and `_sync/manifest.json`.

Other v0.2 captures remain immutable packages within the same project:

```text
{prefix}/orgs/{organization_id}/projects/{project_slug}/packages/{run_id}/
```

Do not use the old `orgs/{organization_id}/packages/{project_slug}` layout for new v0.2 uploads.

## Workflow

1. Validate the project config:

```bash
axis validate-config --repo <repo>
```

2. Locate the package under `.axis/outbox/v0.2/{organization_id}/{project_slug}/{run_id}/`.
3. Run a dry-run:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
```

4. For local redaction and manifest refresh without upload:

```bash
axis oss-publish --repo <repo> --run-id <run_id> --local-only
```

5. Upload only after dry-run passes and the user has authorized the external write:

```bash
axis oss-publish --repo <repo> --run-id <run_id>
```

For `project_knowledge_snapshot`, update changed current project documents and `_archive` objects, then upload `_sync/manifest.json` last. For other assets, upload `manifest.json` last within `packages/{run_id}`.

## Synchronization and Conflict Rules

- Project knowledge is a current project-document mirror. A different remote checksum is an intentional update, not an immutable-package conflict.
- The published `_sync/manifest.json` is the authoritative current-object set. Objects left behind by an earlier document layout are retained unless cleanup is explicitly authorized, but Dashboard must not present paths absent from the latest published manifest as current documents.
- Keep local outbox snapshots immutable by `run_id`; use `_sync/metadata.json` to identify which run produced the current remote project documents.
- Do not delete old remote `packages` paths or unrelated project objects unless the user explicitly authorizes cleanup.
- General report/capture packages are immutable. If a remote object under `packages/{run_id}` exists with a different checksum, stop and report the conflict.
- If project synchronization fails before `_sync/manifest.json`, the prior manifest remains the completion marker. Rerun after fixing the failure.

## Validation

- Local files match `manifest.files`, and organization/project/profile snapshots match resolved config.
- Every v0.2 target contains both `orgs/{organization_id}` and `projects/{project_slug}`.
- Project knowledge paths do not contain the local `documents/` wrapper or a remote `run_id` directory.
- Project archive paths resolve under `{prefix}/_archive/orgs/{organization_id}/projects/{project_slug}/` and remain outside the current project-document list.
- General package paths contain `projects/{project_slug}/packages/{run_id}`.
- Public-safety validation is `passed` and release channel/gate match config.
- `publish.status` is `local_ready` after dry-run or local-only and `published` only after a successful upload.
- Stdout and stderr do not expose OSS endpoints, credentials, bearer tokens, or private URLs.

## Failure Handling

- If redaction occurs, inspect the updated package before upload.
- If a general immutable package conflicts, stop; do not overwrite it.
- If project document synchronization fails, retain the local snapshot and previous remote `_sync/manifest.json`, fix the cause, and rerun.

## After Use Deposition

After using this skill, check whether the session produced reusable path, installer, validation, synchronization, or conflict behavior. If yes, update public-safe skill material, validate it, refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
