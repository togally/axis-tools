---
name: axis-tools-skill-update
description: Use when the user asks to update, refresh, reinstall, migrate, or repair local Axis/Codex packaged skills from axis-tools. / 用于从 axis-tools 更新、刷新、重装、迁移或修复本地 Axis/Codex 打包技能。
---

# Axis Tools Skill Update

Refresh complete packaged Skill bundles from the `axis-tools` source into local agent Skill directories with inventory, backup, validation, and rollback evidence.

## When to Use

- Update all or selected packaged Axis Skills for Codex, Claude Code, or both.
- Repair a missing/stale local bundle or verify source-to-install hash parity.
- Migrate retired pre-taxonomy aliases to their canonical owners with backup and rollback.

## Do Not Use

- Do not install arbitrary curated/GitHub Skills, application dependencies, or product-repository files.
- Do not hand-copy partial bundles or overwrite a locally modified target without explicit replacement intent.
- Do not use a dirty source checkout for a remote-refresh claim; a focused development install is local evidence only.

## Inputs

- Verified `axis-tools` repository, target agent, selected Skill names or all-Skill scope, and pull/no-pull mode.
- Inventory hashes/actions, source cleanliness, validator availability, and any retired-alias mapping.
- For replacement/retirement: dry-run result, explicit `--force` intent, backup directory, and rollback expectations.

## Outputs

- Per-Skill source/target path, hash, action, and installed/identical/replaced/retired status.
- Validation results, backup manifest/directory when state changed, and rollback result when requested.
- Explicit residual drift, blocked local customization, dirty-source failure, or unknown-name failure.

## Safety and Boundaries

- Run inventory/dry-run first. `--force` may replace local customization or retire an alias and requires explicit user intent for the shown targets.
- Back up every changed/retired target before mutation; rollback restores old entries and removes newly copied replacements atomically.
- Validate intentionally changed source bundles before a focused install from a dirty development checkout.
- Leave unselected Skills, unrelated repositories, credentials, and product data untouched.
- Old names are migration inputs, never callable compatibility aliases.

## Workflow

For a clean repository, prefer:

```bash
node scripts/axis-skill-update.mjs --repo <axis-tools> --agent codex --json
```

For intentional uncommitted bundle development, validate selected bundles, preview, then install only those bundles:

```bash
node dist/cli.js install --agent codex --dry-run --skill <skill-name> --force
node dist/cli.js install --agent codex --skill <skill-name> --force
```

Repeat `--skill` for one atomic multi-bundle backup session. Use `--agent all` only when both agent installations are requested. Reserve `--no-pull` for tests, offline work, or explicit no-remote-refresh requests; reserve `--no-validate` for fake-home tests.

The inventory may report pre-taxonomy aliases such as old generic Axis names and the former dashboard/skill-tool names. Without `--force`, removal is blocked. With explicit force, the installer backs them up, retires them, installs their canonical owners, and keeps rollback evidence. Consult inventory rather than duplicating the full alias map here.

## Checks

- Full bundles include declared `SKILL.md`, `agents/`, `references/`, `scripts/`, and `assets/` files.
- Focused install rejects unknown/retired requested names and leaves every unselected target unchanged.
- Dirty remote-refresh sources fail before install; focused dirty-development sources are explicitly scoped and validated first.
- Modified target or retired alias blocks without force; forced migration records a backup and removes every retired directory.
- Rollback restores previous directories/symlinks/files and removes newly installed replacements.
- Final inventory proves source/target hash parity for each requested canonical Skill.

## After Use Deposition

Check whether the update exposed a reusable inventory, validation, alias-migration, backup, or rollback correction. If yes, update this bundle, validate it, refresh the local copy, and push only when authorized. Otherwise report that no skill update is needed.
