---
name: axis-trade-system-governance
description: Use when a user wants to create, inspect, version, or propose controlled changes to a personal trading system with evaluation and explicit approval before any parameter mutation. / 用于创建、检查、版本化或提议受控调整个人交易系统，并在任何参数变更前完成评价和明确审批。
---

# Axis Trade System Governance

Use this skill to initialize, inspect, evaluate, version, or change a trading system without allowing an unreviewed parameter change to reach the active rules. The active system is a private decision contract, not a promise of returns.

Read [the system governance contract](references/system-governance-contract.md) before creating a proposal, applying a change, migrating an existing system, or validating the workspace.

## When to Use

- The user wants to establish or revise a trading-system rule, threshold, formula, scope, data source, or interpretation.
- The user wants to tune entry, exit, position sizing, portfolio exposure, drawdown, profit protection, market-regime, evidence, or review parameters.
- The user asks what changed between system versions, whether a proposed change is justified, or whether an approved change was applied correctly.
- A local trading system needs to be initialized or migrated into the private `.axis/trade` state contract.

## Do Not Use

Do not use this skill to recommend or activate a specific investment plan, reconcile holdings, generate a daily brief, place orders, or access a broker or exchange. Those are separate outcomes.

## Inputs

- Current `.axis/trade/config.yaml`, active system, immutable version history, open proposals, audit events, and affected plans.
- Exact requested rule or parameter change, rationale, evidence window, risk limits, approval expectations, and rollback conditions.
- Missing samples, portfolio facts, execution constraints, and market evidence remain explicit gaps rather than inferred values.

## Governing Principle

Treat every system field that can change behavior as governed. This includes numbers, ranges, enumerations, formulas, formulas' inputs, asset or market scope, evidence thresholds, source priority, execution timing, exception wording, and semantic changes that leave the displayed number unchanged.

The exact primary lifecycle is:

```text
draft -> evaluated -> awaiting_user_approval -> approved -> applied -> verified
```

Permitted non-primary states are `needs_evidence`, `rejected`, `withdrawn`, `expired`, `apply_failed`, and `rolled_back`. Never skip a primary state and never treat discussion, silence, a generic acknowledgement, or an earlier blanket instruction as approval.

## Parameter Change Approval Gate

Before changing `.axis/trade/system/active.yaml` or its human-readable rendered view:

1. Create a proposal with a stable `proposal_id`, the exact old and new values, `base_system_version`, `base_system_hash`, rationale, evidence, risk classification, expected effect, downside risks, affected plans, rollback conditions, and review date.
2. Evaluate the proposal against the active system, its hard invariants, the available trading evidence, portfolio consequences, operational feasibility, and overfitting risk.
3. Set the evaluation verdict to exactly one of `pass`, `conditional`, `needs_evidence`, or `reject`.
4. Present a change card to the user. Stop after the evaluation and wait for a separate, explicit approval that identifies the `proposal_id` and exact target values or proposal fingerprint.
5. Apply only when the verdict is `pass`, or `conditional` with every recorded condition satisfied, and the explicit approval still matches the current proposal fingerprint, base version, and base hash.

`needs_evidence` and `reject` cannot become active changes. They may produce a simulation-only experiment, but the experiment must not alter the live active system or authorize live plans.

A generic reply such as “可以”, “继续”, or “按建议做” is not enough when the approved values are not restated or uniquely bound to the proposal. If there is any ambiguity, ask for explicit confirmation and do not mutate the active system.

## Change Classification

- `normal`: clarifies or tunes behavior without increasing the declared capital-at-risk ceiling.
- `risk_increasing`: can increase position size, loss per trade, aggregate risk, concentration, leverage, holding risk, execution gap, or the frequency with which capital is exposed.
- `critical`: changes a hard invariant, capital boundary, family-reserve separation, leverage permission, mandatory exit protection, or another rule whose failure could materially impair the account.

Risk-increasing and critical proposals require quantified downside analysis. A hard invariant cannot be weakened as a side effect of another proposal. Changing the invariant itself requires a separate critical proposal and explicit approval after its risks have been communicated.

## Workflow

1. Locate the user-selected workspace and inspect `.axis/trade/config.yaml`, `.axis/trade/system/active.yaml`, version history, open proposals, dependent active plans, and audit events. If structured state is absent, inspect the existing human-readable system and propose a reversible migration; do not silently declare the rendered document canonical.
2. Separate verified facts from assumptions. Record missing trade samples, incomplete MFE/MAE data, unknown portfolio capital, unavailable market data, or unclear execution constraints as evidence gaps.
3. For a new request, create or update only a proposal. Calculate both direct and second-order effects, including maximum planned loss, aggregate portfolio risk, signal frequency, drawdown sensitivity, liquidity, correlation, implementation burden, and likely attribution or overfitting problems.
4. Present the change card and recommendation. Do not apply the change in the evaluation turn.
5. After a valid explicit approval, re-read the active version and hash. Expire the approval if either differs. Otherwise snapshot the prior version, apply only the approved paths atomically, increment the version, render any human-readable view, and append an audit event.
6. Verify schema validity, approved-path-only diff, invariant preservation, version/hash linkage, rollback availability, and the list of plans that require re-evaluation. Mark `verified` only after all checks pass.

## Change Card

Every evaluation shown to the user must include:

- Proposal ID and current system version.
- Parameter or rule path, old value, new value, unit, and percentage or semantic delta.
- Evidence window, sample quality, relevant metrics, and missing evidence.
- Expected benefit and the mechanism by which it may occur.
- Downside, tail-risk, behavioral, operational, and overfitting risks.
- Effect on single-position risk, aggregate risk, concentration, drawdown, and active plans.
- Recommendation: `pass`, `conditional`, `needs_evidence`, or `reject`.
- Conditions, alternative of making no change, experiment or review window, and rollback trigger.
- The exact approval wording needed for the next step.

## Outputs

Depending on the request, produce one or more of:

- A read-only system assessment.
- A proposal under `.axis/trade/system/proposals/`.
- An evaluation/change card awaiting approval.
- A new immutable system version and updated active pointer after approval.
- A verification report listing exact diffs, hashes, affected plans, and remaining unverified risks.

Never describe an unverified or unapproved proposal as implemented.

## Safety and Boundaries

- Structured state is canonical; rendered Markdown and summaries are derived views.
- Personal financial data always stays in the private runtime workspace and never enters the public bundle.
- Skill code, references, tests, and examples may be public; all examples must be synthetic and clearly marked as mock data.
- Real parameters, system history, account values, proposals, approvals, plans, audit events, and rendered personal documents belong only in the user's private `.axis/trade` workspace.
- Never deposit, commit, publish, or include private runtime state in skill-maintenance output.
- Never store credentials, API tokens, broker identifiers, exchange secrets, private keys, seed phrases, or complete wallet addresses in the skill bundle or `.axis/trade` state.
- No order execution: never execute or place a trade.
- Do not place orders, connect to execution endpoints, promise returns, or claim that the system eliminates loss.
- Current market, legal, regulatory, or product facts must be verified from current authoritative sources when they materially affect an evaluation. Missing or inaccessible evidence remains explicitly unverified.

## Checks

An applied change is valid only when all of the following are true:

- The proposal completed the required lifecycle and has a valid explicit user approval.
- The proposal fingerprint, base version, and base hash still match.
- The active diff contains only approved paths and values.
- The prior version is recoverable and the new version is immutable.
- All hard invariants and schema checks pass.
- Risk-increasing effects and dependent plans are explicitly listed.
- The audit record contains actor, timestamp, proposal ID, before/after hashes, result, and rollback reference.

If any check fails, set `apply_failed`, preserve the prior active system, report the failure, and do not claim completion.

## Three-Step Work Contract

1. Co-create with the user: preserve the user's literal trading semantics, identify the exact field or behavior under review, agree on success and safety criteria, and gather the active version, evidence, portfolio boundaries, execution constraints, and approval expectations.
2. Execute the governed result: create and evaluate the proposal first; pause for explicit approval; then apply only the approved change within the private `.axis/trade` workspace.
3. Verify the result: validate the state transition, hashes, diff, invariants, rollback, rendered view, audit event, and affected-plan list, then report exact results and any evidence that remains unavailable.

## Light Adversarial Review

Use a constructive adversarial stance for no more than 30% of the interaction. Challenge sample-size weakness, single-trade recency bias, hidden coupling, risk-ceiling drift, look-ahead bias, overfitting, untestable wording, missing rollback conditions, and attempts to bypass explicit approval. Preserve the user's clarified business semantics and become decisive once the evidence and approval boundary are sufficient.

## Model Reasoning Level

Default to `high`. Use `max` for capital-at-risk ceilings, leverage, drawdown controls, hard invariants, family-reserve separation, semantic rule rewrites, conflicting evidence, or application/rollback failures. `medium` is acceptable only for read-only formatting or comparison after the underlying facts have already been validated. Never use `low` to evaluate or apply a live system change.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
