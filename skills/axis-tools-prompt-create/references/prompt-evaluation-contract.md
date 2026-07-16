# Prompt Evaluation Contract

## Case Boundary

Store evaluator-only truth separately from model-visible input:

```json
{
  "case_id": "stable-id",
  "source_kind": "workflow",
  "evaluation_stage": "diagnostic",
  "model_input": {},
  "oracle": {}
}
```

The runner must serialize `model_input` only. Before a real run, put a unique sentinel under `oracle` and assert that the final request payload, including system and user messages, contains no sentinel.

## Experiment Plan

Freeze these fields before comparing candidates:

- candidate IDs and prompt hashes;
- case-set and schema hashes;
- scorer adapter and version;
- exact model IDs plus `small`, `standard`, or `strong` tier labels;
- reasoning effort, tool policy, timeout, retries, repeats, and concurrency;
- hard gates, cell threshold, and ranking order;
- `diagnostic` or `final_holdout` stage and output directory.

The dry-run invocation count must equal `candidate × model × case × repeat`.

Materialize candidates as `candidate_ids` and the frozen matrix as `planned_units`. Do not derive either from returned observations: every candidate can otherwise omit the same unit, or one candidate can return no observations, without detection.

```json
{
  "schema_version": 1,
  "candidate_ids": ["baseline", "challenger-a", "challenger-b"],
  "planned_units": [
    {
      "model_id": "provider/model-version",
      "model_tier": "standard",
      "source_kind": "controller",
      "case_id": "case-07",
      "repeat": 1
    }
  ],
  "observations": [],
  "thresholds": {
    "max_hard_fail_count": 0,
    "min_worst_cell_mean": 0.8,
    "min_overall_mean": 0.85
  }
}
```

## Normalized Observation

Normalize every attempt before ranking:

```json
{
  "prompt_id": "challenger-b",
  "model_id": "provider/model-version",
  "model_tier": "standard",
  "source_kind": "controller",
  "case_id": "case-07",
  "repeat": 1,
  "score": 0.92,
  "hard_fail": false,
  "failure_kind": null,
  "prompt_length": 1200,
  "estimated_cost": 0.02
}
```

Use a bounded numeric score with the same meaning across all cases. A parse error, timeout, invalid schema, empty output, or scorer failure sets `hard_fail: true` and `score: 0`; it must not be omitted. If `prompt_length` or `estimated_cost` is recorded for a candidate, record it on every observation. Prompt length must stay constant for that candidate.

## Selection

Run `node scripts/rank_prompt_results.mjs --input <evaluation.json>` with the schema-versioned object above. The ranker rejects unknown fields, duplicate or out-of-plan observations, and any prompt missing a frozen `model_id × source_kind × case_id × repeat` unit. It groups observations by prompt, then by exact `model_id × source_kind`; model tiers are reporting metadata and never hide one model's failure. Compute hard-failure count, the mean for each cell, worst-cell mean, overall mean, and cell spread. Sort by:

1. hard-failure count ascending;
2. worst-cell mean descending;
3. overall mean descending;
4. cell spread ascending;
5. prompt length ascending when supplied;
6. measured cost ascending when supplied;
7. prompt ID for deterministic final ordering.

Apply all three required thresholds before declaring a winner: `max_hard_fail_count`, `min_worst_cell_mean`, and `min_overall_mean`. Unknown, misspelled, missing, or null threshold fields are errors. A ranking without a passing candidate is still useful evidence, but it is not a successful prompt selection and returns `selected_prompt_id: null`.

## Holdout Integrity

The final holdout is created independently and stays unavailable while candidates are revised. Record the frozen prompt, cases, schema, and scorer hashes before opening it. Run it once. After any prompt change, the previous holdout becomes diagnostic evidence.

## Evidence Report

Report exact candidate and data hashes, model IDs, tiers, effort, repeats, observation/failure counts, cell scores, thresholds, selected candidate, and raw evidence directory. Keep generated evidence outside the repository.
