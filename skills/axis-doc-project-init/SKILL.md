---
name: axis-doc-project-init
description: Use when a repository needs conversational Axis v0.2 project configuration, migration from an older contract, or one consolidated confirmation of organization, project, OSS profile, release, directory, language, and environment-name settings. / 用于通过一次汇总确认配置 Axis v0.2 项目、迁移旧协议，并统一确认组织、项目、OSS、发布、目录、语言及环境变量名称。
---

# Project Init

Configure a target repository for Axis v0.2. Inspect first, recommend deterministic values, present one complete configuration bundle, and apply only after one consolidated user confirmation.

## Boundary

- Ask for the repository path only when the target is not already explicit. Treat it as target selection, not a configuration-field confirmation.
- Configure v0.2 with both `organization.id` and `project.slug`; do not create a project outside an organization.
- Inspect existing `.axis/config.yml`, `.axis/organizations.yml`, repository name, package metadata, Git remote, and writing conventions before recommending values.
- Never ask for credential, endpoint, access key, token, password, or secret values. Confirm environment variable names and presence only.
- Treat v0.1 as legacy migration input, not the default target contract.
- Do not write files before the user confirms the complete bundle.

## Batch Configuration Confirmation Gate

Use a `confirmation_bundle` and a `single_confirmation` decision. Do not ask one field at a time.

Normal configuration uses:

```yaml
confirmation_policy:
  mode: single_confirmation
  max_confirmation_rounds: 1
  final_confirmation: false
```

Build the complete bundle before asking the confirmation question:

```yaml
confirmation_bundle:
  contract_version: "0.2"
  repository: /path/to/repository
  organization.id: org_example
  organization.registry: .axis/organizations.yml
  project.slug: example-project
  project.display_name: 示例项目
  oss.profile: private_beta_main
  release.channel: private_beta
  release.gate: not_requested
  package.outbox_dir: .axis/outbox
  document_language: zh-CN
  required_env:
    - field: endpoint
      name: ALIYUN_OSS_ENDPOINT
      present: true|false
  source_summary: {}
  warnings: []
  changes: []
  final_confirmation: false
```

The dotted keys above name required configuration decisions; the applied YAML remains nested.

### Collection rules

1. Resolve stored values and deterministic recommendations without asking.
2. If several values cannot be resolved safely, ask for all of them in one compact batch. Do not open separate turns for organization, project, profile, release, directory, or language.
3. Recompute dependent values after receiving the batch answer.
4. Present one final summary table containing every field, proposed value, source, change type, and warning.
5. Ask one question: `是否按以上完整配置写入并执行校验？如需修改，请一次列出所有修改项。`
6. Apply only when the user confirms. Persist `final_confirmation: true` in the execution record or temporary answers artifact; do not fabricate confirmation.

If the user rejects or changes values, collect all corrections from that reply, rebuild the entire bundle, and show one replacement summary. Do not reconfirm unchanged fields individually. The `max_confirmation_rounds: 1` rule describes the normal path; a replacement round is allowed only because the user changed the proposed bundle.

### One-summary presentation

Use a compact table:

| Group | Field | Proposed value | Source | Change |
| --- | --- | --- | --- | --- |
| Contract | `contract_version` | `0.2` | protocol target | migrate/keep |
| Organization | `organization.id` | `org_example` | registry/recommendation | keep/add/change |
| Organization | `organization.registry` | `.axis/organizations.yml` | repository convention | keep/add/change |
| Project | `project.slug` | `example-project` | repository evidence | keep/add/change |
| Project | `project.display_name` | `示例项目` | package/README evidence | keep/add/change |
| OSS | `oss.profile` | `private_beta_main` | selected organization | keep/add/change |
| Release | `release.channel` | `private_beta` | safe default | keep/add/change |
| Release | `release.gate` | `not_requested` | safe default | keep/add/change |
| Storage | `package.outbox_dir` | `.axis/outbox` | Axis convention | keep/add/change |
| Documents | `document_language` | `zh-CN` | default/user preference | keep/add/change |

Follow the table with one environment-name presence summary and one consolidated warning list. Do not interleave questions between rows.

## Environment Variable Handling

Include all `required_env` entries in the same confirmation bundle using only:

```yaml
- field: endpoint
  name: ALIYUN_OSS_ENDPOINT
  present: true|false
```

If variables are absent, show one grouped shell block that the user can run locally:

```bash
export ALIYUN_OSS_ENDPOINT='<your-endpoint>'
export ALIYUN_OSS_REGION='<your-region>'
export ALIYUN_OSS_ACCESS_KEY_ID='<your-access-key-id>'
export ALIYUN_OSS_ACCESS_KEY_SECRET='<your-access-key-secret>'
```

Do not ask the user to paste values into chat. Missing environment values may block publish validation, but they do not require separate confirmation of every configuration field. After the user sets them, rerun only the name-and-presence check.

## Apply Workflow

1. Inspect the repository and existing Axis files read-only.
2. Resolve the organization registry and verify the selected `organization.id`, `project.slug`, and `oss.profile` exist or are included as explicit additions in the bundle.
3. Build the complete `confirmation_bundle` with migration provenance, recommendations, warnings, required environment names, and all planned file changes.
4. Ask one consolidated confirmation.
5. After confirmation, set `final_confirmation: true` and apply all approved file changes together:
   - `.axis/config.yml`;
   - selected organization registry;
   - `.gitignore` entries for `.axis/config.local.yml` and `.axis/outbox/`;
   - optional repository-local language convention when the bundle includes it.
6. Do not use the legacy `axis project-init --project-slug ...` v0.1 form for a v0.2 target. If a compatible batch apply command is available, pass the confirmed bundle to `axis project-init`; otherwise make deterministic file edits from the confirmed bundle.
7. Run:

```bash
axis validate-config --repo <repo>
```

8. Reread every changed file and report applied values, validation results, generated paths, and any remaining environment-name absence.

After a v0.2 capture command creates an outbox run, use `$axis-ops-oss-publish` for dry-run or authorized synchronization. Project initialization itself is not publish completion.

## Migration Rules

- Migrate adjacent contract versions in order and preserve provenance in the bundle.
- Show old, mapped, recommended, and removed fields together in the same summary.
- Accept mapped values only as part of the consolidated confirmation.
- Redact unsupported inline credentials and identify their removal without showing values.
- If an organization or OSS profile change alters dependent fields, recompute and show the whole replacement bundle.

## Validation

- `.axis/config.yml` contains `contract_version: "0.2"`, `organization.id`, `organization.registry`, `project.slug`, `project.display_name`, `oss.profile`, `package.outbox_dir`, `release.channel`, and `release.gate`.
- The organization registry contains the selected organization, OSS profile, and project.
- Default release is `private_beta` with `not_requested`; `public` requires `passed`.
- Default `document_language` is `zh-CN` unless the user explicitly selected another supported language.
- `.axis/config.local.yml` and `.axis/outbox/` are ignored.
- The conversation contains one complete confirmation summary and explicit approval before writes.
- No secret value appears in the confirmation bundle, files, command output, or report.
- Generated local package paths contain `.axis/outbox/v0.2/{organization_id}/{project_slug}/{run_id}/`.
- Generated OSS targets contain `{prefix}/orgs/{organization_id}/projects/{project_slug}/`.

## After Use Deposition

After using this skill, check whether the session produced reusable inspection, recommendation, migration, batch-confirmation, or validation behavior. If yes, update public-safe skill material, validate it, refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
