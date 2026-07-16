---
name: axis-trade-plan-gate
description: Use when a user wants to propose, review, activate, revise, or close an investment plan under the approved trading system and evidence-backed risk gates. / 用于在已批准交易系统与证据化风险门禁下提出、审查、激活、修订或结束投资计划。
---

# Axis Trade Plan Gate

## Purpose

Use this skill to assess, correct, record, and route proposed investment plans. It covers new entries, exposure increases, holds with explicit conditions, partial reductions, full exits, and replacements across asset classes such as A-shares and cryptoassets.

For a new entry, add, replacement entry leg, or any other exposure increase, the plan gate must prove that the proposal uses current eligible research, matches the approved trading system, fits current portfolio constraints, and is explicitly confirmed before it becomes active. A purely protective or risk-reducing exit uses the separate `risk_reduction_exception` contract below: it still requires exact holding and quantity evidence and explicit confirmation, but missing, stale, or incomplete entry research by itself cannot force continued exposure. This skill never executes a transaction. No order execution: never execute or place a trade.

## When to Use

Use this skill when the user wants to:

- establish a new investment plan;
- add to or otherwise increase an existing exposure;
- revise an entry, size, stop, invalidation, add, reduction, or exit rule;
- plan a partial or full exit;
- check whether a proposed plan complies with the approved trading system and portfolio limits;
- correct and resubmit a previously blocked proposal.

## Do Not Use

Do not use this skill to research an asset from scratch, change trading-system parameters, reconcile holdings, or place an order. Use `$axis-trade-risk-research` for current due diligence, the portfolio workflow for exposure truth, and the system-governance workflow for parameter changes.

Never log in to a broker or exchange, call a trading API, prepare a signed transaction, open a wallet signing flow, transfer funds, or claim that recording an active plan means an order was or will be executed.

## Safety and Boundaries

- An entry or exposure-increase proposal must not become an active plan unless research is current and `eligible`, every mandatory system rule passes, portfolio capacity is verified, and the user confirms the exact corrected version.
- A proposal that does not comply must be labeled `blocked_nonconforming`, `blocked_insufficient_evidence`, or `blocked_disqualifying_risk`. Explain the failure, propose bounded corrections where possible, and do not create an active plan.
- Never change a system parameter inside a plan to make it pass. Route the parameter change through the system-governance confirmation workflow first.
- Never silently change the asset, thesis, trigger, quantity, stop, invalidation, time horizon, or exit rule. Present corrections as a new proposal version.
- No gate may claim that eligible means safe, profitable, suitable in every circumstance, or free of fundamental risk.
- A risk-reducing exit deserves special handling: missing entry research or an imperfect original plan must not be used to pressure the user to remain exposed. The exit still needs exact holding identity, quantity bounds, and residual-risk checks.

## Inputs

Resolve or explicitly mark missing:

- action: entry, add, hold-rule update, partial exit, full exit, or replacement;
- exact asset identity and account or custody context needed to distinguish the held instrument;
- current approved trading-system version and parameter set;
- current portfolio snapshot, available capital, existing exposure, correlated exposure, and pending plans;
- current `axis-trade-risk-research` record and status;
- thesis, horizon, setup, entry trigger or exit trigger, invalidation, stop or protective condition, planned size, risk budget, add/reduce rules, profit-protection rule, and known event constraints;
- for exits, current quantity, requested quantity or percentage, residual position, and whether the exit creates another exposure.

Do not infer missing private holdings from prior conversation when a current portfolio snapshot is available. Do not accept a currency amount without its currency, an asset quantity without units, or a percentage without its denominator.

## `.axis/trade` Workspace Contract

Resolve the current approved system from `.axis/trade/system/active.yaml`, the most recent applicable reconciled snapshot under `.axis/trade/portfolio/snapshots/`, and research from `.axis/trade/research/index.yaml` when those canonical files exist. Use `.axis/trade/config.yaml` path overrides when defined; do not guess a "current" portfolio from filename order alone.

Store immutable proposals under:

```text
.axis/trade/plans/proposals/<plan-id>/<version>.yaml
```

Only after eligibility and explicit confirmation may the exact version be copied or referenced as active under:

```text
.axis/trade/plans/active/<plan-id>.yaml
```

Keep blocked, declined, and superseded proposals for audit, but never place them in the active index. If the workspace documents different canonical paths, follow them and report the resolved files.

## Three-Step Work Contract

### 1. Co-create the exact proposal

Capture the user's literal intended action and decision rules. Load the approved system, current portfolio snapshot, and current research. Define acceptance checks before changing any plan record: identity, research, system compliance, sizing math, portfolio impact, event constraints, exit coverage, gate state, confirmation state, immutable version, and no execution.

Ask for facts that could materially change eligibility. If the user asks to modify a system parameter to make the proposal fit, pause the plan and route that separate change for evaluation and approval.

### 2. Evaluate and correct

Apply [investment-plan-contract.md](references/investment-plan-contract.md). Verify the research status and date, map each plan field to the approved system, calculate planned loss and post-plan exposure with units, check portfolio capacity, concentration and correlated risk, test event and liquidity constraints, and evaluate entry, add, reduction, and exit rules.

When the proposal fails but can be made compliant without changing the approved system, present a correction set such as lower size, a defined invalidation, a narrower trigger, removal of unauthorized leverage, refreshed research, or an event wait condition. Preserve both the original and corrected versions. Do not apply corrections on the user's behalf.

### 3. Verify, classify, confirm, and record

Recalculate from the corrected inputs, verify canonical record hashes or version IDs where available, and assign one gate state. Show the user the exact version, changes from the prior version, pass/fail matrix, expected portfolio impact, residual risks, and research cut-off.

Only `eligible_for_user_approval` may proceed to confirmation. Require explicit approval of that exact version before setting `confirmation_status: approved` and `plan_status: active`. Silence, timeout, earlier approval, approval of a different version, or general enthusiasm is not confirmation.

Report clearly that the active record is a plan only and no transaction was executed.

## Gate and Lifecycle States

Use one `gate_status`:

- `eligible_for_user_approval`: either every mandatory current-system, research, sizing, exposure, and plan-completeness check passes, or a purely protective/risk-reducing exit satisfies the documented `risk_reduction_exception` without creating new exposure. The exact version is not active until explicitly approved.
- `blocked_nonconforming`: one or more approved-system, sizing, portfolio-capacity, operational, or plan-completeness rules fail. List the failed rules and required corrections.
- `blocked_insufficient_evidence`: current research, exact asset identity, portfolio state, or another mandatory input is missing, stale, contradictory, or unavailable. State what evidence is required.
- `blocked_disqualifying_risk`: verified evidence identifies a legal, eligibility, operational, custody, protocol, or fundamental red flag that disqualifies the intended risk-increasing action.

Track confirmation separately:

- `pending`: the exact `eligible_for_user_approval` version has not been approved;
- `approved`: user explicitly approved this exact version;
- `declined`: user rejected or withdrew it.

Track lifecycle separately:

- `proposal`, `active`, `completed`, `cancelled`, or `superseded`.

An `eligible_for_user_approval` proposal with pending confirmation is not active. A blocked proposal remains an audit artifact and must not appear in the active-plan index.

## Exit-Plan Nuance

Classify an exit as one of: `protective_exit`, `system_rule_exit`, `thesis_invalidation`, `profit_protection`, `rebalance`, `discretionary_exit`, or `replacement`.

- A protective or risk-reducing exit may proceed through the planning gate even when entry research is stale; require exact holding identity, confirm the requested quantity does not exceed the long holding unless shorting is explicitly intended and permitted, and disclose what remains unverified.
- For a qualifying exit, record `gate_basis: risk_reduction_exception`. Missing, stale, or incomplete research must not block a purely protective reduction; record `research_id`, `research_hash`, and `research_status` as `null` or `unavailable` when no snapshot exists, and state the limitations. Ambiguous holding identity, unbounded quantity, accidental shorting, or a replacement/new-exposure leg remains blocking.
- If a discretionary risk reduction conflicts with the system, record it as `manual_risk_reduction/out_of_system`; do not represent it as a compliant system sample.
- Do not block a protective exit merely because the original entry violated the current system. Record the historical non-compliance separately.
- A partial exit must calculate the residual quantity, capital at risk, concentration, and remaining stop or invalidation rule.
- A full exit must define what closes the plan and how unfilled or residual quantities are handled at the planning level, without routing orders.
- A replacement or swap contains a new exposure. Gate the exit leg and entry leg separately; the new leg still requires current eligible research.
- An exit that would create a short, derivative, borrowed, leveraged, wrapped, or different-asset exposure is not purely risk-reducing and must pass the corresponding new-exposure rules.
- If a discretionary exit conflicts with the approved system, label it non-compliant and present the correction or explicit exception route. Do not tell the user they must continue holding; this skill records plan compliance and does not control their assets.

## Light Adversarial Review

Keep constructive challenge below 30% of the interaction. Test whether the proposal is a disguised parameter change, whether position size was chosen before risk was calculated, whether the stop is economically meaningful, whether the thesis moved after price moved, whether an add averages down contrary to the system, whether correlated positions evade the concentration cap, and whether an exit plan accidentally creates new exposure.

Challenge FOMO, anchoring, sunk-cost reasoning, profit targets without invalidation, and claims that eligible research makes loss impossible. Once the evidence and calculations are sufficient, issue the gate state decisively.

## Model Reasoning Level

Default to `high`.

- Use `medium` only for a mechanical status update or exact-format correction that cannot change exposure or eligibility.
- Use `high` for standard entry, add, partial-exit, full-exit, and plan-revision gates.
- Use `max` for leverage, derivatives, short exposure, replacements across asset classes or chains, large concentration changes, conflicting research, emergency conditions, complex tax or jurisdiction constraints, or any proposal whose correction could materially alter maximum loss.

Never downgrade reasoning to make a plan pass more quickly.

## Outputs

Return the plan version, canonical `asset_id`, `gate_status`, `confirmation_status`, lifecycle state, failed and passed rules, required corrections, calculations, pinned `system_hash`, pinned `research_hash`, residual risks, and canonical proposal path.

Allowed next actions are `request exact confirmation`, `apply user-approved corrections as a new proposal version`, `refresh research`, `request portfolio reconciliation`, `request system-parameter evaluation`, `record declined`, or `stop`. No output from this skill authorizes or performs execution.

## Checks

- Identity, units, current `system_hash`, current `research_hash`, and portfolio capacity are verified.
- Gate and confirmation states follow the allowed lifecycle; blocked proposals never enter the active index.
- Sizing, residual exposure, required corrections, immutable versioning, and the `risk_reduction_exception` boundary are explicit.
- The final report states that this workflow performed no order execution.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
