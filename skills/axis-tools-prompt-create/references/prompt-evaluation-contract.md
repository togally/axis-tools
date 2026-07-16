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
  "failure_kind": null
}
```

Use a bounded numeric score with the same meaning across all cases. A parse error, timeout, invalid schema, empty output, or scorer failure sets `hard_fail: true`; it must not be omitted.

## Selection

Group observations by prompt, then by `model_tier × source_kind`. Compute hard-failure count, the mean for each cell, worst-cell mean, overall mean, and cell spread. Sort by:

1. hard-failure count ascending;
2. worst-cell mean descending;
3. overall mean descending;
4. cell spread ascending;
5. prompt length or cost ascending when supplied;
6. prompt ID for deterministic final ordering.

Apply configured hard thresholds before declaring a winner. A ranking without a passing candidate is still useful evidence, but it is not a successful prompt selection.

## Holdout Integrity

The final holdout is created independently and stays unavailable while candidates are revised. Record the frozen prompt, cases, schema, and scorer hashes before opening it. Run it once. After any prompt change, the previous holdout becomes diagnostic evidence.

## Evidence Report

Report exact candidate and data hashes, model IDs, tiers, effort, repeats, observation/failure counts, cell scores, thresholds, selected candidate, and raw evidence directory. Keep generated evidence outside the repository.
