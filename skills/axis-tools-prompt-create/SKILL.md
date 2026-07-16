---
name: axis-tools-prompt-create
description: Use when a prompt must be created, refined, or selected through blind evaluation across multiple public-safe data sources and model tiers. / 用于通过多种公开安全数据源和不同级别模型的盲测来创建、改进或选出稳健提示词。
---

# Axis Tools Prompt Creation

Create prompts as tested source assets. Prefer stable behavior across sources and exact model IDs over one attractive example or one strong-model result.

## When to Use

- Create, compare, refine, or select a non-trivial prompt with a testable output contract.
- Reproduce and prevent under-splitting, over-splitting, omission, invention, format failure, or another model-dependent defect.
- Supply prompt evidence to a reusable domain or skill workflow before its prompt is frozen.

## Do Not Use

- Do not use for one-line copy editing without an oracle, ordinary API load testing, or execution of an already frozen domain prompt.
- Do not use to name, package, install, commit, publish, or push a Skill; `$axis-tools-skill-create` owns those actions.
- Do not claim a selected winner when no scorer/reviewer contract exists or no candidate clears its hard gates.

## Inputs

- Objective, smallest valid output unit, model-visible schema, forbidden behavior, hard gates, and scored dimensions.
- Public-safe diagnostic cases with separate `model_input` and evaluator-only `oracle`, plus an independently prepared holdout.
- Baseline, at least two explainable challengers, exact model IDs and tier labels, fixed reasoning effort, repeats, timeout, tools policy, and cost boundary.
- Task-specific scorer adapter, output schema, thresholds, and an ignored temporary output location.

## Outputs

- Selected prompt source or an explicit `no_candidate_passed` result.
- Candidate, prompt, case-set, schema, and scorer hashes plus exact model IDs and settings.
- Diagnostic/final cell scores, hard failures, prompt length, estimated cost, residual limits, and raw evidence path outside Git.

## Safety and Boundaries

- Send only public-safe `model_input`; never serialize oracle, gold labels/counts, scores, stage labels, reviewer notes, credentials, private hosts, or customer data.
- Keep generated requests, outputs, events, stderr, and reports under `/tmp` or another approved ignored location. Do not Git-manage generated reports or project documents.
- Keep domain gold cases and scorer semantics in the owning domain skill. This skill owns the generic experiment and deterministic selection contract.
- Fix candidate, data, schema, scorer, model, and inference settings before comparison; do not favor a candidate with extra retries or tools.

## Three-Step Work Contract

1. Co-create the contract: preserve the user's literal semantics, reproduce the failure, freeze acceptance criteria, and separate `model_input` from `oracle`.
2. Execute the experiment: keep the current prompt as baseline, create at least two challengers, and revise only from the Blind Evaluation diagnostic matrix.
3. Verify and freeze: apply the Worst-Cell Gate, freeze hashes, run the Frozen Holdout once, and report a passing selection or no winner.

## Blind Evaluation

Put a unique sentinel in oracle-only fields and prove the final request excludes it. Parse errors, schema errors, timeouts, tool failures, scorer failures, and empty output are hard failures and remain in the denominator. Read [prompt-evaluation-contract.md](references/prompt-evaluation-contract.md) before building the task-specific runner/scorer.

## Data Source Matrix

Use multiple public-safe source kinds rather than near-duplicate examples. A general robustness claim covers at least a historical failure, a valid split, a valid merge, and a boundary trap; add code, API, event, data, workflow, or prose sources when the task depends on them.

## Model Tier Matrix

Map actual available IDs to at least small, standard, and strong tiers before claiming cross-tier robustness. Record and score exact `model_id` values; a tier label is reporting metadata and must not average away failure from one model. Keep effort, tools, schema, retries, and repeats fixed.

## Worst-Cell Gate

Normalize every attempt and use [rank_prompt_results.mjs](scripts/rank_prompt_results.mjs) with its schema-v1 input, frozen `candidate_ids`, and explicit `planned_units`. The primary cell is exact `model_id × source_kind`. Sort by zero/fewer hard failures, highest worst-cell mean, highest overall mean, lowest cell spread, then lower `prompt_length`, lower `estimated_cost`, and stable prompt ID. Reject missing candidates or units, duplicates, and incomplete thresholds before accepting a winner.

## Frozen Holdout

Use diagnostics for iteration. Before revealing the final holdout, record prompt, case, schema, and scorer hashes plus models, effort, and thresholds. Run it once. If the prompt changes after failure, prepare a new holdout or label all reuse as diagnostic evidence.

## Checks

- Baseline and at least two challengers cover the historical failure, split, merge, and boundary controls.
- Oracle-sentinel isolation passes and invocation count equals candidate × model × case × repeat.
- Exact model/source cells are complete; failure observations are retained and hard thresholds are applied.
- Ranking regression covers hidden tier averages plus prompt-length/cost ties.
- Final claims include frozen hashes, exact model IDs, settings, observation/failure counts, and temporary evidence paths.
- Generated run artifacts remain outside Git.

## Light Adversarial Review

Keep challenge and critique to no more than 30% of the interaction. Detect oracle leakage, duplicate source kinds, favorable model selection, incomplete matrices, averages hiding exact-model failures, inference drift, or reused holdouts; once sound, execute decisively.

## After Use Deposition

Check whether the run produced a reusable prompt mechanism, leak-prevention check, ranking rule, or edge case. If yes, update this bundle, validate it, refresh the local copy, and push only when authorized; keep domain gold/scoring in its owner. Otherwise report that no skill update is needed.
