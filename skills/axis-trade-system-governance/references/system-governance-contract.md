# Trade System Governance Contract

This reference defines the private runtime state and deterministic gates used by `axis-trade-system-governance`. It is a public-safe contract: examples and field names are generic, while real values remain in the user's private workspace.

## Canonical Runtime Layout

```text
.axis/trade/
  config.yaml
  system/
    active.yaml
    versions/
      <system-version>.yaml
    proposals/
      <proposal-id>.yaml
    experiments/
      <experiment-id>.yaml
    rendered/
      <system-version>.md
  plans/
    active/
  audit/
    events.jsonl
```

Structured state is canonical. Markdown is a rendered view and must identify its source version and hash. An existing Markdown-only system may be imported, but ambiguities must be surfaced and approved rather than guessed.

Use ISO 8601 timestamps with timezone. Use decimal strings for money, quantities, rates, and percentages; do not use binary floating-point values in canonical state. Writes must be atomic.

## Active System

Minimum fields:

```yaml
schema_version: "1"
system_id: "system-example"
system_version: "0.1.0"
status: "active"
effective_at: "2026-01-01T00:00:00+08:00"
base_currency: "CNY"
jurisdiction: "example"
strategy_scope:
  asset_classes: ["example_asset"]
  direction: "long_only"
parameters: []
hard_invariants: []
evidence_policy: {}
source_proposal_id: null
content_hash: "sha256:..."
```

Every plan must pin the `system_version` and `content_hash` against which it was approved.

## Parameter Registry

A parameter entry should contain:

```yaml
parameter_id: "risk.per_trade"
path: "/risk/per_trade"
label: "Mock per-trade risk"
kind: "decimal"
value: "0.007"
unit: "fraction_of_equity"
allowed_range:
  minimum: "0"
  maximum: "0.03"
applies_to: ["new_plans"]
safety_class: "portfolio_risk"
evidence_requirement: "configured_policy"
locked: false
last_changed_by_proposal_id: null
```

Governance applies equally to numbers, booleans, enumerations, ranges, formulas, text rules, input definitions, data-source priorities, exceptions, and scope. A wording change that changes behavior is a semantic parameter change.

## Proposal Schema

```yaml
schema_version: "1"
proposal_id: "CHG-YYYYMMDD-NNN"
status: "draft"
created_at: "..."
created_by: "user|assistant"
base_system_version: "0.1.0"
base_system_hash: "sha256:..."
classification: "normal|risk_increasing|critical"
changes:
  - parameter_id: "risk.per_trade"
    path: "/risk/per_trade"
    old_value: "0.007"
    new_value: "0.006"
    unit: "fraction_of_equity"
    semantic_delta: "mock description"
rationale: "..."
evidence:
  sample_start: "..."
  sample_end: "..."
  eligible_observations: null
  excluded_observations: null
  metrics: {}
  source_refs: []
  missing: []
evaluation:
  verdict: "pass|conditional|needs_evidence|reject"
  evaluated_at: null
  expected_effects: []
  downside_risks: []
  portfolio_impact: {}
  invariant_findings: []
  overfitting_findings: []
  affected_plan_ids: []
  conditions: []
  alternative_no_change: "..."
  review_at: null
  rollback_conditions: []
approval:
  required: true
  status: "pending|approved|rejected|withdrawn|expired"
  approved_by: null
  approved_at: null
  proposal_fingerprint: "sha256:..."
  approval_text: null
application:
  applied_at: null
  new_system_version: null
  before_hash: null
  after_hash: null
  approved_paths: []
  rollback_version: null
verification:
  status: "pending|verified|failed|rolled_back"
  checks: []
```

The proposal fingerprint covers the base version/hash, classification, every requested path and value, conditions, and rollback criteria. Any change to fingerprinted content invalidates prior approval.

## State Machine

Primary lifecycle:

```text
draft -> evaluated -> awaiting_user_approval -> approved -> applied -> verified
```

Allowed alternatives:

```text
draft -> needs_evidence
draft -> withdrawn
evaluated -> needs_evidence
evaluated -> rejected
awaiting_user_approval -> rejected
awaiting_user_approval -> withdrawn
awaiting_user_approval -> expired
approved -> expired
approved -> apply_failed
applied -> apply_failed
applied -> rolled_back
verified -> rolled_back
```

Transition conditions:

- `evaluated`: an evaluation record exists with evidence, impact, invariant, and overfitting review.
- `awaiting_user_approval`: verdict is `pass`, or `conditional` and the conditions are objectively satisfiable and displayed.
- `approved`: explicit user approval uniquely identifies the proposal and fingerprint; all conditions are satisfied.
- `applied`: base version/hash still match, prior version is snapshotted, and only approved paths were written atomically.
- `verified`: schema, hashes, diff, invariants, audit, rendering, rollback, and affected-plan checks all pass.
- `expired`: base state or proposal fingerprint changed, or a configured approval expiry elapsed.
- `apply_failed`: any write or post-write check failed; the prior active version remains authoritative.

## Evaluation Dimensions

Every proposal must assess applicable dimensions:

- Single-position planned loss and aggregate open risk.
- Position size, concentration, correlation, and liquidity.
- Maximum drawdown sensitivity and loss clustering.
- Exposure frequency, holding duration, and gap or stop-execution risk.
- Effects on existing plans, open positions, and metrics comparability.
- Operational ability to observe and execute the rule.
- Sample eligibility, missing data, survivorship, look-ahead, selection, and recency bias.
- Parameter coupling and whether a multi-parameter proposal prevents attribution.
- Expected benefit, plausible failure modes, review window, and rollback trigger.

Do not invent a universal sample threshold. Use the active system's evidence policy. If no evidence threshold exists and the available evidence cannot support the claimed effect, return `needs_evidence`.

## Approval Wording

The approval request must make the next action unambiguous, for example:

```text
To approve, confirm proposal CHG-YYYYMMDD-NNN, fingerprint sha256:..., changing /risk/per_trade from mock-old to mock-new.
```

An approval is invalid if it refers to a different value, omits which of several pending proposals it selects, predates the current fingerprint, or conflicts with a newer active version. Evaluation and application are separate interaction boundaries.

## Application Algorithm

1. Lock the private system state.
2. Re-read active version/hash and proposal fingerprint.
3. Validate state, verdict, conditions, approval, and classification.
4. Snapshot the current active system into `versions/`.
5. Apply only the proposal's `approved_paths` to a temporary candidate.
6. Validate schema, hard invariants, and full diff.
7. Assign a new immutable version and content hash.
8. Atomically replace the active pointer or file.
9. Render the human-readable view from the structured version.
10. Append the audit event and list plans requiring re-evaluation.
11. Mark `verified` only after reading the result back successfully.

If a failure occurs before the atomic replace, discard the candidate. If a failure occurs after replacement, restore the prior version, append a failure/rollback event, and report the exact outcome.

## Audit Event

Append one JSON object per event:

```json
{
  "event_id": "EVT-...",
  "at": "2026-01-01T00:00:00+08:00",
  "actor": "user|assistant|automation",
  "action": "proposal_created|evaluated|approved|applied|verified|failed|rolled_back",
  "entity_type": "system_change_proposal",
  "entity_id": "CHG-...",
  "before_hash": "sha256:...",
  "after_hash": "sha256:...",
  "approval_fingerprint": "sha256:...",
  "result": "success|failure",
  "details": {}
}
```

Audit history is append-only. Never rewrite it to make a failed or rejected proposal disappear.

## Public/Private Boundary

Public bundle:

- Generic workflow, schemas, validators, and synthetic fixtures.
- No user-specific thresholds, system text, holdings, approvals, or source credentials.

Private runtime:

- All `.axis/trade` state, current parameters, rendered systems, proposals, approval text, audit logs, plans, and account-linked evidence.

Never include private runtime state in skill deposition, tests, examples, commits, issue text, or external notifications. Never persist secrets in either boundary.
