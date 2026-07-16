---
name: axis-tools-prompt-create
description: Use when a prompt must be created, refined, or selected through blind evaluation across multiple public-safe data sources and model tiers. / 用于通过多种公开安全数据源和不同级别模型的盲测来创建、改进或选出稳健提示词。
---

# Axis Tools Prompt Creation

Create prompts as tested source assets. Optimize for stable behavior across source kinds and model tiers, not for one attractive example or one strong model.

## When to Use

- A user asks to create, compare, refine, or select a non-trivial prompt.
- A prompt under-splits, over-splits, omits, invents, or mixes business units.
- Correctness changes materially across source kinds or model tiers.
- A reusable skill depends on a generative prompt that needs evidence before packaging.

Do not use this skill for one-line copy editing without a testable output contract, ordinary API load testing, or executing an already frozen domain prompt. Creating, naming, packaging, installing, and publishing a skill remain the responsibility of `$axis-tools-skill-create`; this skill returns the selected prompt and its evidence and does not hand back recursively.

## Inputs and Evaluation Contract

Before creating candidates, obtain or agree on:

- the task objective, smallest valid output unit, output schema, and forbidden behavior;
- hard gates and scored dimensions;
- public-safe diagnostic examples covering known failures and valid counterexamples;
- the source kinds, available model IDs, model-tier labels, fixed reasoning effort, repeats, timeout, and cost boundary;
- where temporary model outputs may be stored.

If there is no scoring oracle or equivalent reviewer contract, run exploration only and do not claim that a best prompt was selected.

## Three-Step Work Contract

1. Co-create the contract. Preserve the user's literal semantics, reproduce the current failure, freeze acceptance criteria, and separate every case into `model_input` and an evaluator-only `oracle`.
2. Execute the experiment. Keep the existing prompt as the baseline, create at least two challengers, run the blind diagnostic matrix, and revise only from diagnostic evidence.
3. Verify and freeze. Select by the Worst-Cell Gate, freeze the candidate and hashes, run the final holdout once, and report exact evidence and remaining limits.

## Candidate Construction

- Start with a baseline; never compare only new variants.
- Change one coherent mechanism per challenger so results remain explainable.
- Encode atomicity, merge/split rules, evidence requirements, output schema, and concise presentation separately.
- Prefer the shortest candidate that clears every hard gate; verbosity is a tiebreaker, not the primary objective.
- Keep prompts free of answer keys, case IDs that reveal expected behavior, evaluator notes, and private project data.

## Blind Evaluation

The model receives only `model_input`. Never serialize `oracle`, gold labels, expected counts, scores, stage labels, or reviewer notes into the request. Put a unique sentinel in oracle-only fields during validation and prove that the serialized model request does not contain it.

Treat parse errors, schema errors, timeouts, tool failures, and empty output as failed observations. Do not drop them from denominators or hide them behind a mean.

Read [prompt-evaluation-contract.md](references/prompt-evaluation-contract.md) before building a runner or score adapter. Use [rank_prompt_results.mjs](scripts/rank_prompt_results.mjs) to apply the deterministic ranking rule to normalized observations.

## Data Source Matrix

Use multiple public-safe source kinds, not several near-duplicate examples from one file type. For a general robustness claim, include at least four useful kinds: a historical failure, a valid split case, a valid merge case, and a boundary trap. Add code, API, event, database, workflow, or prose sources when the target task depends on them.

The domain skill owns its gold cases and scorer semantics. This skill owns the generic experiment contract and ranking method.

## Model Tier Matrix

Map actual available model IDs to at least `small`, `standard`, and `strong` tiers before claiming cross-tier robustness. Keep reasoning effort, tools, system instructions, schema, retries, and repeats fixed across prompt candidates. Record exact model IDs rather than reporting tier labels alone.

If fewer than three tiers are available, the run may still be diagnostic, but the result must not say that cross-tier validation passed.

## Worst-Cell Gate

For each prompt, aggregate every `model_tier × source_kind` cell. Rank candidates by:

1. zero hard failures;
2. highest worst-cell mean;
3. highest overall mean;
4. lowest cell spread or variance;
5. shortest prompt or lowest measured cost.

A candidate with a high average but a zero or hard failure in one cell cannot outrank a stable candidate that clears the configured threshold everywhere.

## Frozen Holdout

Use the diagnostic set for iteration. After choosing a candidate, record the candidate hash, case-set hash, schema hash, scorer version, models, effort, and thresholds. Only then run an independently prepared final holdout once.

If the holdout fails and the prompt changes, create a new holdout or label the rerun as diagnostic. Never tune repeatedly against the same cases while still calling them unseen holdout evidence.

## Output and Artifact Boundary

Keep raw requests, model outputs, event streams, stderr, diagnostic reports, and final run reports in `/tmp` or another user-approved ignored location. Do not add generated reports or generated project documents to Git.

Source-controlled assets may include the selected prompt, public-safe case source, schemas, deterministic runner/scorer code, and focused regression tests. Report prompt, data, schema, and scorer hashes plus the temporary evidence path.

## Light Adversarial Review

Spend no more than 30% of the interaction challenging weak evidence: detect oracle leakage, duplicate source kinds, favorable model selection, changing inference settings, averages that hide failure cells, or a reused holdout. Once the experiment contract is sound, execute it decisively.

## Checks

- Baseline and at least two challengers exist.
- Historical failure, split, merge, and boundary cases are represented.
- Model request serialization is proven oracle-free.
- Candidate × model × case × repeat invocation counts match the plan.
- Failure observations count as failures.
- Worst-cell ranking has a deterministic regression test.
- Final-holdout claims include frozen hashes and exact model IDs.
- Generated run artifacts remain outside Git.

## After Use Deposition

After using this skill, check whether the run produced reusable prompt mechanisms, leak-prevention checks, ranking rules, or edge cases. If yes, update this bundle, validate it, refresh the local copy, and push to the remote repository when permissions allow. Keep domain gold data and domain scoring logic in the owning domain skill. If no reusable change exists, say that no skill update is needed.
