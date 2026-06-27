---
name: axis-create-skill
description: Use when the user asks to scan the current conversation for reusable skill opportunities, create a new Axis/Codex skill, install it locally, or push it to the axis-tools skill repository.
---

# Axis Create Skill

Use this skill when a repeated Axis workflow should become a reusable local skill and packaged skill bundle.

## Workflow

1. Scan the current conversation for reusable behavior, not one-off task details. Good candidates mention repeated workflows, verification rules, repository conventions, dashboard formats, release procedures, or phrases like `沉淀`, `复用`, `以后每次`, or `skill`.
2. If there is no reusable workflow, say that no skill should be created yet.
3. For non-trivial skill content, use the writing-skills process: write a failing validation or concrete acceptance check first, then create the skill.
4. Create the local skill with the helper script:

```bash
node scripts/axis-create-skill.mjs \
  --repo <axis-tools> \
  --source-root ~/.codex/skills \
  --name axis-example-skill \
  --description "Use when ..." \
  --body-file /tmp/axis-example-skill.md \
  --deposit --commit --push --branch main
```

5. Keep the skill bundle complete. At minimum include `SKILL.md` and `agents/openai.yaml`; include `references/`, `scripts/`, or `assets/` when the workflow needs them.
6. Install or refresh local packaged skills after pushing when the user expects immediate local use:

```bash
node scripts/axis-update-skills.mjs --repo <axis-tools> --agent codex --json
```

## Candidate Scan

For a quick candidate scan from a saved conversation transcript:

```bash
node scripts/axis-create-skill.mjs --scan-conversation <conversation.txt> --json
```

Only create a skill when the candidate has a stable trigger, a repeatable workflow, and clear validation steps.

## Checks

- Skill frontmatter must include `name` and a `description` beginning with `Use when`.
- The generated `agents/openai.yaml` should include a `$skill-name` default prompt.
- Validate with `quick_validate.py` unless running a fake-home unit test.
- Commit and push only the skill bundle, manifest, docs, and tests related to the skill change.
