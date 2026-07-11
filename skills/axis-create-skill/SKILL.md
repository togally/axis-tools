---
name: axis-create-skill
description: Use when the user asks to scan the conversation for reusable skill opportunities or decide whether a public Axis/Codex skill should be created. / 用于扫描对话中的可复用技能机会并判断是否应创建公开安全的 Axis/Codex 技能。
---

# Axis Create Skill

Use this skill to decide whether the current conversation contains a reusable, public-safe skill candidate. Its primary job is scanning and judgment; creation/deposit is delegated to the helper script only after a stable candidate is confirmed.

## Orbit Skill Ownership Boundary

`axis-create-skill` owns only public, cross-project Axis capabilities: engineering, architecture, testing, API performance, database/schema, deployment, and reusable platform operations.

- Do not create personal AI information-matrix, content lifecycle, article-title, publishing, or resource-delivery skills in `axis-tools`.
- Route those candidates to `orbit-skill-creator` in the separate Orbit repository; its skills must use `orbit-xxx` names.
- Do not recreate `axis-pulse-*` or `axis-article-title` compatibility aliases. Their retained presence would make one request trigger competing workflows.
- Keep private product workflows, account strategy, credentials, customer data, and closed-repository details out of both public repositories; retain them only as private assets or local notes.

## Workflow

1. Scan the current conversation for reusable behavior, not one-off task details. Good candidates mention repeated workflows, verification rules, dashboard formats, release procedures, or phrases like `沉淀`, `复用`, `以后每次`, or `skill`.
2. Route Orbit-owned content and personal-information-matrix candidates to `orbit-skill-creator`; reject candidates that are product-private, customer-specific, credential-bearing, or only useful inside one closed-source repository. Keep those as private memory/notes, not public `axis-tools` skills.
3. If there is no reusable public workflow, say that no skill should be created.
4. For non-trivial skill content, use the writing-skills process: write a failing validation or concrete acceptance check first.
5. Classify the candidate before creation. Coding, architecture, API performance, bugfix, testing, database, schema, and design-document skills must include the three-step work contract: co-create the requirement with the user, execute the agreed result, then verify and report the result.
6. Coding/design-type skills must include a light adversarial review rule capped at no more than 30% of the interaction: verify claims against evidence, surface hidden assumptions, name risk/correctness trade-offs, and challenge unsafe shortcuts while still respecting the user's explicit business wording.
7. Write the skill frontmatter `description` in bilingual English and Chinese. It must still start with `Use when`, then include a concise Chinese explanation in the same line.
8. If the candidate is stable and public-safe, create the local skill with the helper script:

```bash
node scripts/axis-create-skill.mjs \
  --repo <axis-tools> \
  --source-root ~/.codex/skills \
  --name axis-example-skill \
  --description "Use when ... / 用于..." \
  --body-file /tmp/axis-example-skill.md \
  --deposit --commit --push --branch main
```

The helper injects an `After Use Deposition` section into generated skills so each skill reminds future agents to update, validate, and push its own reusable improvements when permissions allow. For coding/design-type skills, it also injects `Three-Step Work Contract` and `Light Adversarial Review` so the generated skill does not become a passive transcription or implementation shortcut.

When passing prompts that contain a `$skill-name`, wrap that argument in single quotes so the shell does not expand `$skill` as an environment variable. For example, use `--default-prompt 'Use $axis-example-skill to ...'`, or omit `--default-prompt` and let the helper generate the default.

9. Keep the skill bundle complete. At minimum include `SKILL.md` and `agents/openai.yaml`; include `references/`, `scripts/`, or `assets/` when the workflow needs them.
10. Install or refresh local packaged skills after pushing when the user expects immediate local use:

```bash
node scripts/axis-update-skills.mjs --repo <axis-tools> --agent codex --json
```

## Candidate Scan

For a quick candidate scan from a saved conversation transcript:

```bash
node scripts/axis-create-skill.mjs --scan-conversation <conversation.txt> --json
```

Only create a skill when the candidate has a stable trigger, a repeatable workflow, clear validation steps, and no private product-specific content.

## Bilingual Description Rule

Every public Axis skill description must be bilingual:

```text
description: Use when <English trigger>. / 用于<中文触发场景或用途>。
```

Rules:

- The line must start with `Use when` so Codex trigger semantics remain predictable.
- The same line must contain Chinese text; do not put the Chinese explanation only in the body.
- For packaged skills maintained in `axis-tools`, keep `agents/openai.yaml` `short_description` bilingual too.
- For packaged skills, `agents/openai.yaml` `display_name` must equal the skill name, such as `axis-example-skill`; do not use a marketing label or custom title there.
- Keep both languages concise and public-safe.
- The create and deposit helper scripts reject skills whose description is English-only or Chinese-only.

## Three-Step Work Contract for Coding and Design Skills

For coding/design-type skill candidates, encode the workflow as three steps:

1. Co-create with the user.
   Clarify what the user wants, preserve their literal business wording, agree on acceptance criteria, and gather the code, schema, logs, docs, credentials, endpoints, environment details, or decisions needed to execute.
2. Execute the result.
   Implement the code change, write the design, or produce the artifact within the agreed boundary and using the existing repo style.
3. Verify the result.
   Run focused tests, validators, benchmarks, document checks, or review passes, then report exact results and any unverified risk.

This structure should guide the skill without making every tiny task feel bureaucratic. If the next step is already fully specified, keep step 1 brief and move into execution.

## Light Adversarial Review for Coding and Design Skills

For coding/design-type skill candidates, add a constructive review stance to the skill body. The point is not to be obstructive; it is to prevent reusable skills from encoding unverified assumptions.

The generated or updated skill should tell future agents to:

- verify the user's goal against code, schema, logs, benchmarks, official docs, or other task evidence;
- call out missing preconditions, boundary leaks, unclear ownership, consistency risks, scalability risks, and rollback gaps;
- challenge unsafe shortcuts such as skipping tests, hiding external failures, putting private business rules in public shared modules, or documenting an old implementation as the final design;
- preserve literal business semantics once the user has corrected or clarified them;
- become decisive after enough evidence exists and execute rather than staying in endless critique.

Keep this light adversarial behavior to no more than 30% of the interaction. Use more of it when the task is risky or underspecified, and less when the user has already supplied enough information to execute safely.

## After Use Deposition

After using this skill, check whether this scan found a reusable improvement to the skill-creation process itself. If yes, update `axis-create-skill`, validate it, refresh the local install, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.

## Checks

- Skill frontmatter must include `name` and a `description` beginning with `Use when`.
- Skill `description` must be bilingual English and Chinese.
- The generated `agents/openai.yaml` should include a `$skill-name` default prompt.
- The generated `agents/openai.yaml` `display_name` must equal the exact skill name.
- The generated `agents/openai.yaml` `short_description` must be bilingual English and Chinese.
- Coding/design-type skills should include `Three-Step Work Contract`.
- Coding/design-type skills should include `Light Adversarial Review`.
- Validate with `quick_validate.py` unless running a fake-home unit test.
- After deposit, run the repo's available test suite when present (for example `npm test`) and update any packaged-skill manifest or explicit skill-list tests that must include the new skill.
- Commit and push only the skill bundle, manifest, docs, and tests related to the skill change.
- Public `axis-tools` skills must not be named for a private product or contain private hostnames, credentials, customer names, or closed-repo-only workflows.
- Content lifecycle, article-title, publishing, resource-delivery, and personal-information-matrix candidates belong to `orbit-skill-creator`, not `axis-tools`.
