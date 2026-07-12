---
name: axis-skill-create
description: Use when the user asks to scan, create, review, or refactor a reusable Axis or Orbit/Codex skill. / 用于扫描、创建、审查或重构可复用的 Axis 或 Orbit/Codex 技能。
---

# Axis Create Skill

Use this skill as the single entrypoint for reusable-skill discovery, creation, review, and refactoring. It scans the current work for repeatable behavior and decides whether a workflow is stable enough to become a skill, selects its namespace and target repository, then creates and validates the package.

## Unified Skill Creation

Use one creation standard for both repositories; do not configure or invoke a separate Orbit skill creator.

- Cross-project engineering, architecture, testing, API performance, database/schema, deployment, and platform operations belong in `axis-tools` and use `axis-{category}-xxx` names.
- Personal AI information-matrix, content lifecycle, article-title, publishing, and resource-delivery skills belong in the Orbit repository and use `orbit-xxx` names.
- Private, customer-specific, credential-bearing, or closed-repository workflows stay private/local; do not publish them to either repository.
- Do not recreate `axis-pulse-*` or `axis-article-title` compatibility aliases. Their retained presence would make one request trigger competing workflows.

## Naming Taxonomy

New public Axis skills must use `axis-{category}-{action}`. Choose the category by the primary outcome, not by incidental keywords:

| Category | Name pattern | Use for |
| --- | --- | --- |
| Document | `axis-doc-xxx` | Architecture, design, data/database design, project initialization/migration, knowledge bootstrap, document dashboards, document generation, document drift and traceability. |
| Code | `axis-code-xxx` | Implementation, bugfix, refactor, performance tuning, and coding-result capture. |
| Test | `axis-test-xxx` | TDD, real-side-effect testing, benchmarks, and test-result capture. |
| Skill | `axis-skill-xxx` | Skill creation, refactoring, packaging, installation, and updates. |
| Operations | `axis-ops-xxx` | Publishing, observability dashboards, delivery, and operational controls. |
| Integration | `axis-integration-xxx` | Named third-party platform, repository, or service integrations. |

Examples: `axis-doc-project-init`, `axis-doc-project-knowledge-bootstrap`, `axis-doc-feature-detailed-design`, `axis-doc-dashbord`, `axis-code-bugfix`, `axis-test-benchmark`, `axis-ops-oss-publish`, and `axis-integration-source-control`.

Every public Axis skill must use this taxonomy; the creation and deposit helpers reject the old generic `axis-xxx` shape. Do not invent a category for an ambiguous workflow: ask the user whether its primary outcome is document, code, test, skill, operations, or integration.

## Workflow

1. Scan the current conversation for reusable behavior, not one-off task details. Good candidates mention repeated workflows, verification rules, dashboard formats, release procedures, or phrases like `沉淀`, `复用`, `以后每次`, or `skill`.
2. Classify the stable candidate: choose one Axis naming-taxonomy category and use `axis-{category}-{action}` in `axis-tools`, use `orbit-xxx` in the Orbit repository for personal information-matrix/content capabilities, or use a private/local skill for non-public workflows. Reject public candidates that are product-private, customer-specific, credential-bearing, or only useful inside one closed-source repository. When evidence cannot determine the category, ask the user instead of guessing.
3. If there is no reusable public workflow, say that no skill should be created.
4. For non-trivial skill content, use the writing-skills process: write a failing validation or concrete acceptance check first.
5. Classify the candidate before creation. Coding, architecture, API performance, bugfix, testing, database, schema, and design-document skills must include the three-step work contract: co-create the requirement with the user, execute the agreed result, then verify and report the result.
6. Coding/design-type skills must include a light adversarial review rule capped at no more than 30% of the interaction: verify claims against evidence, surface hidden assumptions, name risk/correctness trade-offs, and challenge unsafe shortcuts while still respecting the user's explicit business wording.
7. Write the skill frontmatter `description` in bilingual English and Chinese. It must still start with `Use when`, then include a concise Chinese explanation in the same line.
8. If the candidate is stable and public-safe, create it with the same helper. For Axis skills, create and deposit into `axis-tools`:

```bash
node scripts/axis-skill-create.mjs \
  --repo <axis-tools> \
  --source-root ~/.codex/skills \
  --name axis-code-example-skill \
  --description "Use when ... / 用于..." \
  --body-file /tmp/axis-skill-example.md \
  --deposit --commit --push --branch main
```

The helper injects an `After Use Deposition` section into generated skills so each skill reminds future agents to update, validate, and push its own reusable improvements when permissions allow. For coding/design-type skills, it also injects `Three-Step Work Contract` and `Light Adversarial Review` so the generated skill does not become a passive transcription or implementation shortcut.

When passing prompts that contain a `$skill-name`, wrap that argument in single quotes so the shell does not expand `$skill` as an environment variable. For example, use `--default-prompt 'Use $axis-code-example-skill to ...'`, or omit `--default-prompt` and let the helper generate the default.

9. Keep the skill bundle complete. At minimum include `SKILL.md` and `agents/openai.yaml`; include `references/`, `scripts/`, or `assets/` when the workflow needs them.
10. Install or refresh local packaged skills after pushing when the user expects immediate local use:

```bash
node scripts/axis-skill-update.mjs --repo <axis-tools> --agent codex --json
```

For Orbit skills, use the same helper but write directly into the Orbit repository's `skills/` directory, then run that repository's validator. Do not pass `--deposit`, `--commit`, or `--push` to the Axis helper for Orbit; Orbit owns its own repository history.

```bash
node <axis-tools>/scripts/axis-skill-create.mjs \
  --source-root <orbit-repo>/skills \
  --name orbit-example-skill \
  --description "Use when ... / 用于..." \
  --body-file /tmp/orbit-example-skill.md
```

## Candidate Scan

For a quick candidate scan from a saved conversation transcript:

```bash
node scripts/axis-skill-create.mjs --scan-conversation <conversation.txt> --json
```

Only create a skill when the candidate has a stable trigger, a repeatable workflow, clear validation steps, and no private product-specific content.

## Package, Reasoning, and Experience Rules

Keep `SKILL.md` concise: put only triggers, workflow, boundaries, and validation in it. Add `scripts/` only for deterministic repeated operations, `references/` for detailed material that should load on demand, and `assets/` for output resources. Do not create auxiliary README, installation, or changelog files inside a skill bundle.

Every generated Codex skill must have `SKILL.md` and `agents/openai.yaml`, clear use/non-use boundaries, inputs, outputs, safety rules, validation, and `After Use Deposition`. For Orbit content skills, also include `Mandatory Before-Use Experience Application`, `Mandatory After-Use Deposition`, and a `Model Reasoning Level` section.

Choose the default reasoning level by actual task difficulty: `light -> low`, `standard -> medium`, `complex -> high`, and `critical -> max`. Let simple, low-risk, easily verified tasks downgrade; require explicit safety, stopping, and verification rules before upgrading.

Before creating or refactoring a skill, apply relevant `stable` experience directly, treat `candidate` experience as a constraint to test, and keep `raw` experience as reference only. Report `Experience used: none`, `Experience used: <path>`, or `Experience used: skipped <reason>`. After use, report `Deposition: none`, `Deposition: updated <path>`, or `Deposition: proposed <change>`.

## Bilingual Description Rule

Every public Axis or Orbit skill description must be bilingual:

```text
description: Use when <English trigger>. / 用于<中文触发场景或用途>。
```

Rules:

- The line must start with `Use when` so Codex trigger semantics remain predictable.
- The same line must contain Chinese text; do not put the Chinese explanation only in the body.
- Keep `agents/openai.yaml` `short_description` bilingual too.
- For packaged skills, `agents/openai.yaml` `display_name` must equal the skill name, such as `axis-skill-example`; do not use a marketing label or custom title there.
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

After using this skill, check whether this scan found a reusable improvement to the skill-creation process itself. If yes, update `axis-skill-create`, validate it, refresh the local install, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.

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
- Public skills must not be named for a private product or contain private hostnames, credentials, customer names, or closed-repo-only workflows.
- Select the target repository and prefix before creating a skill: `axis-{category}-xxx` for new Axis skills, `orbit-xxx` for Orbit, never `axis-pulse-*` compatibility aliases. Use only `doc`, `code`, `test`, `skill`, `ops`, or `integration` as the Axis category. Project initialization, migration, knowledge bootstrap, and document dashboards belong to `doc`.
