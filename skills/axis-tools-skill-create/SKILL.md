---
name: axis-tools-skill-create
description: Use when the user asks to scan, create, review, or refactor a reusable Axis or Orbit/Codex skill. / 用于扫描、创建、审查或重构可复用的 Axis 或 Orbit/Codex 技能。
---

# Axis Tools Skill Create

Use this skill as the single creation entrypoint for reusable Axis/Orbit skill discovery, trigger-overlap review, packaging, validation, and deposition.

## When to Use

- Scan current work and decide whether a repeated public-safe workflow should become a Skill.
- Create, review, consolidate, or refactor an Axis or Orbit Skill bundle.
- Correct naming, triggers, package contents, validation, installation, or deposition behavior in an existing bundle.

## Do Not Use

- Do not create a top-level Skill for a document chapter, internal mode, one-off fix, private customer rule, credential-bearing workflow, or behavior already owned by another front door.
- Do not use this Skill as the prompt laboratory; use `$axis-tools-prompt-create` for non-trivial prompt R&D.
- Do not publish private product data or treat local editing permission as commit/push authorization.

## Inputs

- Conversation/task evidence, candidate workflow, trigger wording, expected output, and repeatability evidence.
- Existing manifest, packaged Skill list, descriptions, handoff/routing evidence, and target repository.
- Public/private classification, user acceptance criteria, relevant stable/candidate/raw experience, and allowed external actions.
- For prompt-dependent workflows, the selected prompt and passing evidence returned by `$axis-tools-prompt-create`.

## Outputs

- A retain, merge, refactor, private-only, or no-skill decision with trigger/output/evidence reasoning.
- A complete bundle containing `SKILL.md`, `agents/openai.yaml`, and only necessary `references/`, `scripts/`, or `assets/`.
- Updated package metadata/tests when in scope, validation evidence, local-install status, and exact unverified risk.
- Commit/push results only when those actions were explicitly authorized.

## Safety and Boundaries

- Public bundles exclude credentials, private hosts, account/customer identifiers, closed-repository-only rules, and project-specific secrets.
- Preserve literal user semantics, but challenge unsafe shortcuts, circular handoffs, duplicate triggers, hidden side effects, and unsupported claims.
- Deposit, commit, push, publish, and destructive alias retirement are separate actions. Do not infer remote-write authorization from a request to draft or refactor a Skill.
- Keep generated reports and temporary model output outside Git; intentionally authored Skill source, public-safe tests, and references may be versioned.

## Unified Skill Creation

- Cross-project engineering, documentation, testing, operations, integration, meta-tooling, and public-safe trade governance belong in `axis-tools`.
- Personal information-matrix/content lifecycle work belongs in the Orbit repository and uses `orbit-xxx` names.
- Private or credential-bearing workflows stay private/local.
- Do not recreate `axis-pulse-*`, `axis-article-title`, or retired pre-taxonomy aliases that compete with canonical owners.

## Naming Taxonomy

Choose by primary outcome:

| Category | Pattern | Outcome |
| --- | --- | --- |
| Document | `axis-doc-xxx` | Architecture, development docs, project initialization/knowledge, document dashboard and drift. |
| Code | `axis-code-xxx` | Implementation, bugfix, refactor, optimization and code capture. |
| Test | `axis-test-xxx` | TDD, side-effect testing, benchmark and test capture. |
| Tools | `axis-tools-xxx` | Skill/prompt lifecycle, packaging, installation and updates. |
| Operations | `axis-ops-xxx` | Publishing, observability and operational controls. |
| Integration | `axis-integration-xxx` | Named third-party platform integration. |
| Trade | `axis-trade-xxx` | Public-safe investment-system governance, never personal holdings or accounts. |

Examples include `axis-doc-project-init`, `axis-code-bugfix`, `axis-test-benchmark`, `axis-tools-prompt-create`, and `axis-ops-oss-publish`. Ask instead of inventing an ambiguous category.

## Prompt Creation Handoff

This creator explicitly depends on `$axis-tools-prompt-create` whenever a reusable Skill contains a non-trivial generative prompt or correctness varies across source kinds/model IDs. Invoke it after overlap audit and before freezing the prompt.

Prompt-create owns objective/schema, candidates, public-safe cases, oracle isolation, model matrix, scorer, holdout, and selection evidence. This creator retains Skill naming, routing, bundle structure, metadata, validation, installation, commit, and push. The direction is creator to prompt-create only; prompt-create is not a second packaging entrypoint.

## Three-Step Work Contract

1. Co-create the requirement with the user: preserve exact wording, agree on the reusable outcome and acceptance checks, apply relevant experience, and gather the necessary evidence.
2. Execute the result: classify the candidate, audit overlap/handoffs, use prompt-create when required, and create or refactor only the agreed bundle and metadata.
3. Verify the result: run focused validators/tests, prove retired aliases and overlaps are absent when applicable, optionally refresh through `$axis-tools-skill-update`, and report exact scope.

## Workflow

1. Scan the current conversation for repeated behavior and decide whether it has a stable trigger, independent outcome, clear checks, and public-safe content.
2. Compare trigger, output, evidence, and handoffs with every existing packaged Skill. Prefer one front door with internal modes/references when outcomes overlap.
3. Write a failing validation or concrete acceptance check before non-trivial authoring.
4. Create the bundle with `scripts/axis-skill-create.mjs`; keep `SKILL.md` concise and put deep material on-demand in references.
5. Validate with `quick_validate.py` and repository tests; reconcile manifest/catalog/routing only when the task permits those files.
6. Deposit source changes, then commit/push only if authorized. Refresh the local installation through `$axis-tools-skill-update` when immediate use is requested.

## Bilingual Description Rule

Descriptions start with `Use when`, contain concise English and Chinese on the same frontmatter line, and remain public-safe. `agents/openai.yaml` uses the exact Skill name as `display_name`, a bilingual `short_description`, and a default prompt containing `$skill-name`.

## Package, Reasoning, and Experience Rules

- Every bundle states use/non-use, inputs, outputs, safety, checks, and After Use Deposition.
- Coding/design-type skills should include `Three-Step Work Contract` and `Light Adversarial Review` capped at 30%.
- Orbit content Skills also include `Mandatory Before-Use Experience Application`, `Mandatory After-Use Deposition`, and `Model Reasoning Level`.
- Choose reasoning from task difficulty: light/low, standard/medium, complex/high, critical/max; require safety/stopping/verification rules before upgrading.
- Report `Experience used: ...` and `Deposition: ...`; stable experience is applied, candidate experience is tested, and raw experience is reference only.

## Checks

- Frontmatter, directory, manifest entry, `display_name`, and `$skill-name` prompt agree; descriptions are bilingual and begin with `Use when`.
- Trigger/output/evidence overlap and handoff cycles are audited; every top-level Skill owns one independently selectable outcome.
- Complete bundles contain only declared files, remain concise, and pass `quick_validate.py` plus focused repo tests.
- Coding/design-type skills should include the required work/review contracts and the user's literal semantics.
- A refactor proves retired names are absent from packaged directories, manifest, public inventory, routing, and refreshed local installation.
- Commit/push scope contains only authorized Skill source, metadata, docs, and tests.

## Light Adversarial Review

Keep challenge and critique to no more than 30% of the interaction. Verify repeatability, public safety, ownership, trigger/output overlap, circular handoffs, rollback, and validation; once evidence is sufficient, create or refactor decisively.

## After Use Deposition

Check whether this run improved the creation standard itself. If yes, update `axis-tools-skill-create`, validate it, refresh the local copy, and push only when authorized. Otherwise report that no creator update is needed.
