---
name: axis-create-skill
description: Use when the user asks to scan the current conversation for reusable skill opportunities or decide whether a public Axis/Codex skill should be created.
---

# Axis Create Skill

Use this skill to decide whether the current conversation contains a reusable, public-safe skill candidate. Its primary job is scanning and judgment; creation/deposit is delegated to the helper script only after a stable candidate is confirmed.

## Workflow

1. Scan the current conversation for reusable behavior, not one-off task details. Good candidates mention repeated workflows, verification rules, dashboard formats, release procedures, or phrases like `沉淀`, `复用`, `以后每次`, or `skill`.
2. Reject candidates that are product-private, customer-specific, credential-bearing, or only useful inside one closed-source repository. Keep those as private memory/notes, not public `axis-tools` skills.
3. If there is no reusable public workflow, say that no skill should be created.
4. For non-trivial skill content, use the writing-skills process: write a failing validation or concrete acceptance check first.
5. If the candidate is stable and public-safe, create the local skill with the helper script:

```bash
node scripts/axis-create-skill.mjs \
  --repo <axis-tools> \
  --source-root ~/.codex/skills \
  --name axis-example-skill \
  --description "Use when ..." \
  --body-file /tmp/axis-example-skill.md \
  --deposit --commit --push --branch main
```

The helper injects an `After Use Deposition` section into generated skills so each skill reminds future agents to update, validate, and push its own reusable improvements when permissions allow.

When passing prompts that contain a `$skill-name`, wrap that argument in single quotes so the shell does not expand `$skill` as an environment variable. For example, use `--default-prompt 'Use $axis-example-skill to ...'`, or omit `--default-prompt` and let the helper generate the default.

6. Keep the skill bundle complete. At minimum include `SKILL.md` and `agents/openai.yaml`; include `references/`, `scripts/`, or `assets/` when the workflow needs them.
7. Install or refresh local packaged skills after pushing when the user expects immediate local use:

```bash
node scripts/axis-update-skills.mjs --repo <axis-tools> --agent codex --json
```

## Candidate Scan

For a quick candidate scan from a saved conversation transcript:

```bash
node scripts/axis-create-skill.mjs --scan-conversation <conversation.txt> --json
```

Only create a skill when the candidate has a stable trigger, a repeatable workflow, clear validation steps, and no private product-specific content.

## After Use Deposition

After using this skill, check whether this scan found a reusable improvement to the skill-creation process itself. If yes, update `axis-create-skill`, validate it, refresh the local install, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.

## Checks

- Skill frontmatter must include `name` and a `description` beginning with `Use when`.
- The generated `agents/openai.yaml` should include a `$skill-name` default prompt.
- Validate with `quick_validate.py` unless running a fake-home unit test.
- After deposit, run the repo's available test suite when present (for example `npm test`) and update any packaged-skill manifest or explicit skill-list tests that must include the new skill.
- Commit and push only the skill bundle, manifest, docs, and tests related to the skill change.
- Public `axis-tools` skills must not be named for a private product or contain private hostnames, credentials, customer names, or closed-repo-only workflows.
