# Investment Plan Gate Reference

Use this reference to evaluate and validate proposals handled by `axis-trade-plan-gate`.

## Evaluation Order

Evaluate in this order so later calculations do not hide an earlier blocker:

1. exact asset and held-instrument identity;
2. intended action and whether it creates or increases exposure;
3. approved system version and immutable parameter set;
4. portfolio snapshot date and account or custody scope;
5. research identity, indexed `content_hash`, status, cut-off, and material events after the cut-off;
6. mandatory plan fields and system-rule mapping;
7. loss, size, concentration, correlation, liquidity, and event calculations;
8. entry/add/hold/exit-specific checks;
9. gate state, corrections, residual risks, and exact-version confirmation.

Do not continue to an eligible conclusion after an unresolved hard failure. Continue only far enough to give useful corrections and identify additional independent blockers.

## Gate Matrix

| Check | Eligible for user approval | Blocked nonconforming | Blocked insufficient evidence or disqualifying risk |
| --- | --- | --- | --- |
| Identity | Exact market/network/instrument match | Bounded venue or wrapper detail missing | Ambiguous asset or held instrument |
| Research for entry/increase | Current and `eligible` | Refreshable non-decisive field missing | `blocked`, `insufficient_evidence`, `stale`, or material post-cut-off event unresolved |
| Research for protective exit | Best available research and limitations disclosed; stale or incomplete research alone does not block | Refresh can improve disclosure without delaying risk reduction | Holding identity, exit quantity, or accidental-new-exposure facts cannot be verified |
| System | Uses current approved version | Proposal fields can be corrected within it | Requires an unapproved parameter change or violates a non-waivable rule |
| Risk definition | Entry/invalidation/size and units are complete | A bounded field or cost allowance is missing | Loss cannot be bounded or calculated where the system requires it |
| Portfolio | Current snapshot and post-plan exposure pass | Size can be reduced to pass | Snapshot/holding identity cannot be verified or mandatory cap cannot be met |
| Instrument eligibility | Verified for intended use | Operational detail can be supplied | Verified prohibition, unsupported account, or prohibited leverage/instrument |
| Confirmation | Exact version explicitly approved | Exact eligible version awaiting approval | Version changed after approval or approval is ambiguous |

Every blocked status is non-eligible. A correctable failure still remains `blocked_nonconforming` until a new immutable proposal version passes every gate.

## Mandatory Proposal Fields

Every proposal needs:

- immutable plan ID and version;
- created-at timestamp and timezone;
- intended action and exact asset key;
- system version and portfolio snapshot ID;
- research ID, hash, cut-off, and status for the standard gate; under `risk_reduction_exception`, explicit `null` or `unavailable` values plus limitations are allowed when no snapshot exists;
- thesis and falsifiable invalidation;
- holding horizon or time-based review condition;
- trigger and conditions;
- quantity or sizing method with units and denominator;
- maximum planned capital at risk under the approved formula;
- concentration and correlated-exposure result;
- liquidity, event, and operational constraints;
- add, reduce, profit-protection, and exit handling relevant to the action;
- gate, confirmation, and lifecycle states;
- correction history and residual risks;
- explicit `execution_status: not_executed`.

Do not invent a price, quantity, equity value, fee, slippage, tax, stop, volatility estimate, or exchange rule. Missing inputs remain missing and affect eligibility.

## Calculation Checks

Use the approved trading-system formulas. When the system uses price-risk sizing, verify at minimum:

```text
risk_per_unit = abs(planned_entry - protective_exit_or_stop)
gross_price_risk = quantity * risk_per_unit
planned_capital_at_risk = gross_price_risk + explicit_cost_and_slippage_allowance
account_risk_rate = planned_capital_at_risk / verified_account_equity
post_plan_asset_exposure = current_asset_exposure + proposed_change
post_plan_group_exposure = current_correlated_group_exposure + proposed_change
```

These are validation identities, not permission to replace the system's formula. For nonlinear products, leverage, options, perpetuals, lending, liquidity-provider positions, or assets with gap/liquidation risk, a simple stop-distance calculation is insufficient; use the approved specialized model or block pending one.

State assumptions, units, quote currency, FX rate and timestamp when conversion is necessary, fee and slippage treatment, and whether gap or liquidity loss can exceed the modeled amount.

## Action-Specific Checks

### New entry

Require current eligible research, a valid setup and trigger, invalidation, size, maximum loss, initial protection, event constraints, and an exit framework. A watch item without an entry trigger is not an active entry plan.

### Add or exposure increase

Require the approved add rule, current thesis validity, aggregate rather than incremental risk, post-add average cost where relevant, updated invalidation and protection, concentration after the add, and proof that the add is not an unauthorized averaging-down exception.

### Hold-rule update

Verify that the revision does not silently widen the stop, increase risk, extend the horizon, or change a system parameter. If it does, treat the affected portion as a new-risk or system-change proposal.

### Partial exit

Verify quantity is within the holding, calculate residual quantity and exposure, retain or revise the remaining invalidation/protection rule, and define what happens to pending add or exit proposals. Do not mark the plan completed while residual exposure remains.

### Full exit

Verify exact held instrument and target quantity. Define completion in terms of the reconciled position reaching the intended terminal state. This record plans the exit; a later portfolio or execution reconciliation must prove whether it occurred.

### Replacement or swap

Create two linked gates. The reducing leg uses exit rules; the new leg uses entry rules and requires separate current eligible research. Do not net the risks in a way that hides temporary overlap, settlement, bridge, custody, or execution-sequence exposure.

## Correction Protocol

For each failed rule, write:

```yaml
- rule_id: <approved-system-or-gate-rule>
  observed: <verified proposal value>
  required: <rule requirement>
  severity: <correction|block>
  correction_options:
    - <bounded option that preserves the approved system>
  user_decision: pending
```

Corrections create a new immutable proposal version. Keep a field-level diff from the original. Never relabel the original as if it had always complied, and never alter the approved system from inside the correction.

## Proposal Record Template

```yaml
schema: axis.trade.plan
schema_version: 1
plan_id: <stable-id>
version: <immutable-version>
action: <entry|add|hold_update|partial_exit|full_exit|replacement>
asset_id: <canonical-portfolio-asset-id>
created_at: <ISO-8601 timestamp with timezone>
system_version: <approved-system-version>
system_hash: <approved-system-content-hash>
portfolio_snapshot_id: <snapshot-id>
research_id: <research-id-or-null-only-for-risk-reduction-exception>
research_hash: <must-equal-indexed-research-content_hash-or-null-only-for-risk-reduction-exception>
research_as_of: <ISO-8601-timestamp-or-null>
research_status: <eligible|needs_correction|blocked|insufficient_evidence|stale|unavailable>
research_limitations: []
gate_basis: <standard|risk_reduction_exception>
thesis: <literal-user-thesis>
invalidation: <falsifiable-condition>
trigger: <entry-or-exit-trigger>
sizing:
  quantity: <value-and-unit-or-null>
  method: <approved-method>
  planned_capital_at_risk: <value-currency-or-null>
portfolio_impact:
  asset_exposure_after: <value-or-null>
  correlated_exposure_after: <value-or-null>
gate_status: <eligible_for_user_approval|blocked_nonconforming|blocked_insufficient_evidence|blocked_disqualifying_risk>
confirmation_status: <pending|approved|declined>
plan_status: <proposal|active|completed|cancelled|superseded>
failed_rules: []
required_corrections: []
residual_risks: []
execution_status: not_executed
```

Add action-specific fields instead of forcing irrelevant placeholders.

## Confirmation Record

Confirmation must identify the plan ID, exact immutable version or content hash, concise change summary, timestamp, and user's explicit decision. Approval of a thesis, asset, older version, or general strategy does not approve the current plan.

Any change after approval that affects asset identity, action, trigger, invalidation, size, risk, horizon, adds, reductions, exit behavior, or system/research/portfolio reference invalidates confirmation and returns the new version to `pending`.

For the standard gate, and whenever a research snapshot is referenced under `risk_reduction_exception`, resolve `research_id` through `.axis/trade/research/index.yaml`, compute SHA-256 over the exact UTF-8 bytes of the immutable snapshot, and require both the computed value and plan `research_hash` to equal the indexed `content_hash`. A mismatch is `blocked_insufficient_evidence`; do not silently refresh the hash or pin a different snapshot. If no snapshot exists, only a purely protective reduction may use `research_id: null`, `research_hash: null`, `research_status: unavailable`, and explicit `research_limitations`; no entry, increase, replacement, short, borrow, derivative, leverage, or new-asset leg may use this exception.

## Exit Safety Guard

The gate distinguishes compliance labeling from control over the user's assets. If the user wants to reduce risk immediately, do not use a plan defect to argue for continued exposure. Record the safest verifiable planning state, disclose missing information, and state that this workflow neither executes nor prevents an external action.

Treat an exit quantity above the verified long holding, an exit that borrows or shorts, and a swap into another asset as new exposure for the excess or new leg. Treat pending settlement, withdrawal locks, bridging, staking unbonding, redemption queues, and tax or legal constraints as operational facts to verify, not reasons to fabricate an execution promise.

When `gate_basis: risk_reduction_exception`, missing, stale, or incomplete research must not block a purely protective reduction. When research is entirely unavailable, use the explicit null contract above rather than fabricating a record. The proposal still needs exact held-instrument identity, a quantity no greater than the verified long holding, residual-position handling, no new exposure, explicit confirmation, and a complete disclosure of unknowns. Any replacement, short, derivative, leverage, borrow, wrapped-asset, or different-asset leg returns to the standard new-exposure gate.

## Validation Checklist

- The exact proposal version is immutable and reproducible.
- Current system and portfolio references resolve. A research reference, when present, resolves and passes the three-way hash check; when absent, the proposal satisfies the exact `risk_reduction_exception` null/unavailable contract.
- Research is eligible for every new or increased exposure.
- Every mandatory rule has a pass/fail result.
- Calculations include inputs, units, denominator, costs, and assumptions.
- Aggregate and correlated exposure are checked after the proposal.
- Corrections are explicit, versioned, and user-approved rather than silent.
- Exit handling covers residual exposure and accidental new exposure.
- Gate, confirmation, lifecycle, and execution states are distinct.
- Only the exact approved eligible version appears in the active index.
- No broker, exchange, wallet, transfer, signing, or order side effect occurred.
