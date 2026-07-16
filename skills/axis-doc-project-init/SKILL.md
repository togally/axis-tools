---
name: axis-doc-project-init
description: Use when a repository needs inspected and confirmed Axis v0.2 project configuration or migration from an older contract. / 用于仓库需要检查并一次确认 Axis v0.2 项目配置或从旧协议迁移时。
---

# Axis Project Initialization

Inspect first, recommend deterministic public-safe values, present one complete configuration bundle, and write only after one consolidated user confirmation.

## When to Use

- Initialize Axis v0.2 organization and project configuration in a repository.
- Migrate adjacent legacy Axis configuration into the v0.2 contract with provenance.
- Consolidate organization, project, OSS profile, release, outbox, language, and required environment-variable-name decisions.

## Do Not Use

- Do not generate or reconcile project knowledge; use `$axis-doc-project-knowledge` only when the user also requests that outcome.
- Do not create snapshots, upload content, or treat configuration as publish completion.
- Do not ask for or store credential values.

## Inputs

- explicit target repository, or the current repository when unambiguous;
- existing `.axis/config.yml`, `.axis/organizations.yml`, package metadata, repository name, Git remote, and writing conventions;
- current OS user only for a neutral profile-name recommendation such as `default_<current-user>`;
- required environment-variable names and presence booleans;
- one batch of user corrections or approval.

## Outputs

- one complete `confirmation_bundle` with proposed values, sources, changes, warnings, and environment-name presence;
- after approval, updated Axis config/registry and required `.gitignore` entries;
- validation result, changed paths, applied public-safe values, and unresolved environment-name absence.

Read [confirmation-bundle.md](references/confirmation-bundle.md) for the retained schema and presentation contract.

## Safety and Boundaries

- Inspect read-only before asking for confirmation. Do not write any file until the complete bundle is explicitly approved.
- Configure v0.2 with both `organization.id` and `project.slug`; never create a project outside an organization.
- Never request, read back, print, log, or persist access keys, secrets, passwords, tokens, credential endpoints, or credential values. Confirm names and presence only.
- Do not hard-code personal bucket, prefix, account, organization, or customer identifiers in this public skill. Resolve them from an existing public-safe registry or include them as unresolved/confirmed bundle fields.
- Treat v0.1 as migration input, not the default target.

## Three-Step Work Contract

1. Assess. Resolve the repository, inspect current Axis and repository evidence, and build one complete bundle with deterministic recommendations and explicit unresolved fields.
2. Confirm and execute. Present one summary and ask one consolidated question; apply only the approved bundle and all approved corrections together.
3. Verify. Validate configuration, reread changed files, and report exact values, provenance, paths, warnings, and remaining environment-name absence.

## Confirmation Workflow

1. Resolve stored values and safe recommendations without asking.
2. When multiple values are unresolved, ask for them in one compact batch rather than one field per turn.
3. Recompute dependent values and present the complete table defined in [confirmation-bundle.md](references/confirmation-bundle.md).
4. Ask exactly once on the normal path: `是否按以上完整配置写入并执行校验？如需修改，请一次列出所有修改项。`
5. On corrections, rebuild the entire bundle and show one replacement summary; do not reconfirm unchanged fields individually.
6. Persist `final_confirmation: true` only after explicit approval.

Missing environment variables are shown as one grouped local shell template with placeholder values. Ask the user to set them locally, never paste them into chat. Rerun only the name-and-presence check afterward.

After confirmation, apply together:

- `.axis/config.yml`;
- the selected organization registry;
- `.gitignore` entries for `.axis/config.local.yml` and `.axis/outbox/`;
- an optional repository-local document-language convention when approved.

Use a compatible batch `axis project-init` command when available; never use the legacy v0.1 `--project-slug` form for a v0.2 target. Then run:

```bash
axis validate-config --repo <repo>
```

If the user later requests knowledge generation, hand off to `$axis-doc-project-knowledge`. A future outbox run may use `$axis-ops-oss-publish`, but only under its own exact-run confirmation gate.

## Light Adversarial Review

Spend no more than 30% of the interaction checking for a wrong repository, guessed identity, unsupported migration mapping, hidden credential value, incomplete dependent field, or write before confirmation. Once the bundle is complete and approved, apply and verify decisively.

## Checks

- The bundle and applied config contain contract `0.2`, organization ID/registry, project slug/display name, OSS profile, outbox, release channel/gate, and document language.
- The selected organization, profile and project exist in the registry or are explicit approved additions.
- New bucket/prefix/account values come from repository evidence or explicit confirmation, never a public-skill constant.
- Default release is `private_beta` with `not_requested`; a public release requires its defined passed gate.
- `.axis/config.local.yml` and `.axis/outbox/` are ignored.
- One complete summary and explicit approval precede writes.
- No secret value appears in the bundle, files, command output, or report.
- `axis validate-config --repo <repo>` passes, or the exact blocker is reported without claiming initialization complete.

## After Use Deposition

Check whether the run produced a reusable inspection, recommendation, migration, batch-confirmation, or validation correction. If yes, update public-safe bundle material, validate it, refresh the local install, and push when authorized. Otherwise report that no skill update is needed.
