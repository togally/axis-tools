---
name: axis-tools-skill-update
description: Use when the user asks to update, refresh, reinstall, or repair local Axis/Codex packaged skills from axis-tools. / 用于从 axis-tools 更新、刷新、重装或修复本地 Axis/Codex 打包技能。
---

# Axis Tools Skill Update

Use this skill to refresh local Axis packaged skills from the `axis-tools` repository into the user's local agent skill directories.

## Workflow

1. Confirm the target repository is the `axis-tools` checkout, not a product repository.
2. Prefer the helper script instead of hand-copying files:

```bash
node scripts/axis-skill-update.mjs --repo <axis-tools> --agent codex --json
```

When developing uncommitted skill changes in the current `axis-tools` checkout, the helper correctly refuses the dirty repository. Refresh only the intentionally changed bundles through the CLI, which creates backups before forced replacement:

```bash
node dist/cli.js install --agent codex --skill <skill-name> --force
```

Repeat `--skill <skill-name>` to update multiple named bundles in one atomic backup session. Run `--dry-run` first. Do not force-install every skill merely to refresh a few changed bundles, because unrelated local skill customizations may differ.

When the inventory finds retired `axis-create-skill`, `axis-skill-create`, or `axis-skill-update` directories, it blocks removal by default. Preview the named replacements with `--dry-run --force`, then use `--force` to back up and retire the old directories atomically. Request `axis-tools-skill-create` or `axis-tools-skill-update` explicitly; old names are rejected instead of acting as callable aliases.

3. Use `--agent all` when the user wants both Codex and Claude Code skill directories updated.
4. Use `--no-pull` only for tests, offline work, or when the user explicitly does not want a remote refresh. The helper still refuses a dirty git `--repo` before install when `--no-pull` is set.
5. Use `--no-validate` only in tests with fake homes. Normal updates should run `quick_validate.py` against the installed skill bundles.
6. Read the JSON result and report the installed skill names, target directories, and any validation failure.

## Checks

- The update must install the full skill bundle, including `agents/`, `references/`, and `scripts/`.
- A focused `--skill` update must reject unknown names and leave every unselected installed skill untouched.
- The command should leave unrelated product repos untouched.
- Dirty git source repos must be rejected before install, including `--repo <dirty> --no-pull --no-validate --json`.
- A rename migration must leave no retired tool-skill directory installed, and rollback must restore the old directories while removing newly copied replacements.
- If `git pull --ff-only` fails because of local changes, stop and report the dirty checkout instead of overwriting it.

## After Use Deposition

After using this skill, check whether the update exposed reusable installer, validation, or refresh behavior that should be captured. If yes, update this skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
