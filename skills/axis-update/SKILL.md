---
name: axis-update
description: Use when the user asks to update, refresh, reinstall, or repair local Axis/Codex packaged skills from axis-tools. / 用于从 axis-tools 更新、刷新、重装或修复本地 Axis/Codex 打包技能。
---

# Axis Skill Update

Use this skill to refresh local Axis packaged skills from the `axis-tools` repository into the user's local agent skill directories.

## Workflow

1. Confirm the target repository is the `axis-tools` checkout, not a product repository.
2. Prefer the helper script instead of hand-copying files:

```bash
node scripts/axis-update-skills.mjs --repo <axis-tools> --agent codex --json
```

3. Use `--agent all` when the user wants both Codex and Claude Code skill directories updated.
4. Use `--no-pull` only for tests, offline work, or when the user explicitly does not want a remote refresh.
5. Use `--no-validate` only in tests with fake homes. Normal updates should run `quick_validate.py` against the installed skill bundles.
6. Read the JSON result and report the installed skill names, target directories, and any validation failure.

## Checks

- The update must install the full skill bundle, including `agents/`, `references/`, and `scripts/`.
- The command should leave unrelated product repos untouched.
- If `git pull --ff-only` fails because of local changes, stop and report the dirty checkout instead of overwriting it.

## After Use Deposition

After using this skill, check whether the update exposed reusable installer, validation, or refresh behavior that should be captured. If yes, update this skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
