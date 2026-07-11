---
name: axis-project-init
description: Use when a repository needs conversational Axis v0.2 configuration, migration from an older protocol, or confirmation of organization and OSS profile settings. / 用于通过对话式流程为项目配置 Axis v0.2、迁移旧协议并确认组织和 OSS profile。
---

# Project Init

Use this skill to configure a target repository for the active Axis v0.2 contract. The workflow is conversational and confirmation-driven; the CLI is deterministic and only applies the exact answers file that the user confirmed.

## Boundary

- First ask the user for the target repository path. Do not infer a path from the current working directory when the target is not explicit.
- Ask for project-facing values only when inspection cannot recommend them: project display name, project slug, organization choice, registry path, OSS profile choice, release channel, and release gate.
- Never ask the user to provide a credential, endpoint value, access key value, token, password, or secret. Only discuss environment variable names.
- v0.1 is expired for normal operations. Historical v0.1 files may be read by inspection and migrated through the adjacent mapping chain.

## Conversational Workflow

1. Ask for the repository path and run:

```bash
axis project-init --repo <repo> --inspect --json
```

2. Read the inspection JSON. Show every `fields[]` entry in order, one at a time. For stored values, show the redacted value and ask whether to keep it. For mapped values, show the source version, mapped value, and provenance, then ask whether to accept the mapping. For removal fields, show only the redacted marker and removal reason. Never print a sensitive value.
3. Show organization and OSS profile selectors separately. If the user changes a selector, rerun inspection with `--registry-path`, `--organization-id`, or `--oss-profile` and show the newly bound stored fields again. Do not silently carry values from the previous selector.
4. When a field is missing, recommend a deterministic lowercase name. Ask the user to confirm the recommendation or provide a replacement. Recommendations must be names, never secret values.
5. For each required environment variable, report only `{field, name, present: true|false}`. If a name is missing from the shell, print a command the user can run locally, for example:

```bash
export ALIYUN_OSS_ENDPOINT='<your-endpoint>'
export ALIYUN_OSS_REGION='<your-region>'
export ALIYUN_OSS_ACCESS_KEY_ID='<your-access-key-id>'
export ALIYUN_OSS_ACCESS_KEY_SECRET='<your-access-key-secret>'
```

Do not ask the user to paste the values into chat. Ask the user to set them in their own shell, then rerun the presence check and confirm again. If a desktop-agent subprocess still reports them absent, explain that an `export` only affects the terminal process that received it; offer a user-managed persistent shell environment file such as `~/.zshenv` (with restrictive permissions) and a Codex restart, then rerun the name-only presence check. Never read or print the values from that file.
6. Assemble an answers file with the exact inspection `repo`, `selectors`, `files`, ordered `decisions`, `latest_contract_version: "0.2"`, and `final_confirmation: true`. Use `keep`, `accept_mapping`, or `accept_recommendation` only when the answer exactly matches the inspected value.
7. Apply only after the user confirms the complete field list and environment-name presence:

```bash
axis project-init --repo <repo> --answers-file <answers-file> --apply
```

8. Reread `.axis/config.yml`, `.axis/config.local.yml` when present, the selected organization registry, and `.gitignore`. Run `axis validate-config --repo <repo>` and report the generated v0.2 paths. If a journal remains, stop and run:

```bash
axis project-init --repo <repo> --recover
```

Then inspect again before retrying.

After configuration, hand the confirmed run id to `axis-oss-publish` only after `axis-coding-capture` or `axis-test-report` has created a v0.2 package.

## Migration Rules

- New protocol versions must ship a mapping from the immediate predecessor.
- Migrate old data one adjacent version at a time until the latest version. Accumulate provenance and unresolved prompts across the chain.
- Present mapped legacy values for user confirmation at the latest version. Do not auto-apply an old value merely because a mapping exists.
- Keep safe environment-name mappings. Redact and confirm removal for unsupported inline credentials or target values.

## Validation

- Main config has `contract_version: "0.2"`, `organization.id`, `organization.registry`, and `oss.profile`.
- Default `release.channel` is `private_beta` and default `release.gate` is `not_requested`; `public` requires `passed`.
- The selected registry has `schema: axis.organization_registry` and `schema_version: "0.2"`.
- `.axis/config.local.yml` and `.axis/outbox/` are ignored.
- No credential value appears in inspection output, answers, shell command output, config, registry, or reports.
- The generated package path is `.axis/outbox/v0.2/<organization_id>/<project_slug>/<run_id>/`.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
