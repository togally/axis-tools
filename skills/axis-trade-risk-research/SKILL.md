---
name: axis-trade-risk-research
description: Use when a user needs current source-backed fundamental, regulatory, market-structure, custody, or protocol-risk research on an A-share, crypto asset, or other investment candidate. / 用于对 A 股、加密资产或其他投资候选开展基于当前来源的基本面、监管、市场结构、托管或协议风险调研。
---

# Axis Trade Risk Research

## Purpose

Use this skill to produce a current, source-backed risk review for a precisely identified investable asset before another workflow decides whether an investment plan is eligible. It supports public-market instruments, including A-shares, and cryptoassets, including native coins, tokens, stablecoins, protocols, custodial products, and exchange-listed instruments.

The output is an evidence snapshot and eligibility opinion, not a promise that the asset is safe, not a price forecast, and not an instruction to trade. A scoped review does not prove risk absence.

## Use When

Use this skill when the user wants to:

- investigate an asset's fundamental, regulatory, operational, governance, liquidity, custody, or market-structure risks;
- refresh research used by an entry, increase, hold, reduction, or exit plan;
- determine whether a current official disclosure creates a blocking condition;
- compare a thesis with verified issuer, protocol, exchange, regulator, or on-chain evidence;
- hand a documented research status to `$axis-trade-plan-gate`.

## Do Not Use

Do not use this skill to place, simulate, or route an order; connect to a broker, exchange, wallet, or signing device; move funds; alter a trading-system parameter; approve a plan; or claim that an asset has no risk. Use the portfolio workflow for holdings reconciliation and the system-governance workflow for parameter changes.

## Core Safety Contract

- Treat financial facts, laws, listings, audits, governance proposals, token supplies, security incidents, and corporate disclosures as time-sensitive. Research them live unless the user explicitly requests a historical as-of review.
- Prefer official primary sources. Secondary sources may help discover an event, but they cannot be the sole support for a material eligibility conclusion.
- Separate verified fact, calculated value, source-supported interpretation, and unresolved uncertainty.
- Never write `no risk`, `risk free`, `没有风险`, `无基本面风险`, or an equivalent absolute conclusion. The strongest allowed conclusion is: `No blocking risk was identified within the documented scope as of <timestamp>; residual and unknown risks remain.`
- Absence of evidence is not evidence of safety. Missing, stale, contradictory, inaccessible, or identity-mismatched evidence must lower the status.
- Do not silently repair the user's thesis, asset identity, horizon, or intended action. State the correction needed and return the appropriate non-eligible status.
- Do not expose account identifiers, wallet addresses, credentials, private API endpoints, or exact private holdings in a public skill bundle or public research example.

## Required Inputs

Resolve these before making an eligibility judgment:

- intended action: new entry, add, hold review, partial exit, full exit, or replacement;
- asset class and exact identity;
- A-share identity: exchange, ticker, issuer legal name, and share class;
- crypto identity: network, native asset or token, symbol, contract address when applicable, protocol or issuer, and intended custody or trading venue when relevant;
- research as-of time, jurisdiction and account eligibility when material;
- thesis, expected holding horizon, stated invalidation conditions, and material events the user already knows about;
- the approved trading-system version and any explicit disqualifiers when the research is for a plan.

If two assets share a name or symbol, stop and resolve identity. A ticker or token symbol alone is not sufficient when ambiguity is plausible.

## `.axis/trade` Workspace Contract

Read `.axis/trade/config.yaml` and the current approved system at `.axis/trade/system/active.yaml` when they exist. Store an immutable research snapshot under:

```text
.axis/trade/research/<filesystem-safe-asset-id>/<research-id>.md
```

Use the canonical `asset_id` from `.axis/trade/portfolio/assets.yaml` when available; it must include asset class and market or network identity. Use an explicitly documented filesystem-safe encoding in paths without changing the canonical ID inside the record. Record the snapshot in `.axis/trade/research/index.yaml` only after validation. The index must point to the immutable snapshot and expose its `content_hash`, `as_of`, `valid_until`, `review_scope`, `research_status`, and `fundamental_status` so downstream plan and daily-brief workflows consume the same contract. Never overwrite an older snapshot to make a conclusion appear current. If the workspace uses a different documented canonical path, follow that contract and report the resolved path.

The research record must include source URLs, retrieval timestamps, effective or publication dates, supported propositions, status, `review_scope`, an evidence-based `valid_until`, invalidation triggers, residual risks, missing evidence, corrections, and the approved-system version used for any blocker mapping. Keep credentials and private account data outside the record. `valid_until` is a review-expiry boundary, not a promise that no event will occur before it; a material post-cut-off event invalidates the affected scope immediately.

## Three-Step Work Contract

### 1. Co-create the research question

Confirm exact asset identity, intended action, horizon, jurisdiction-sensitive constraints, research date, and thesis. Define the evidence cut-off and the conditions that would be blocking under the approved trading system. Ask only for missing facts that can materially change the conclusion.

Before research begins, write concrete acceptance checks: identity resolved, required official-source classes covered, evidence dates recorded, contradictions reconciled or disclosed, status derived from the matrix, and no order execution.

### 2. Execute current official-source research

Research the applicable common risks and the asset-class-specific risks in [risk-research-matrix.md](references/risk-research-matrix.md). Start with issuer, exchange, regulator, statutory filing, project, governance, audit, repository, and canonical on-chain sources as applicable. Use secondary reporting only to discover or cross-check facts, and trace material claims back to primary evidence.

Build an evidence ledger before writing the conclusion. Evaluate identity and eligibility, financial or protocol fundamentals, governance and control, dilution or supply changes, related parties and concentration, litigation and regulatory exposure, audit or code-assurance limitations, material incidents, custody and counterparty risk, liquidity, and event timing. Compare each verified issue with an explicit approved-system rule; do not invent a blocker because an issue merely sounds concerning.

For A-shares, record both the reporting period and disclosure date and cover financial statements, audit opinion, regulator or exchange actions, control, pledges, dilution, litigation, debt, cash flow, major events, and delisting or trading-status risk. For crypto, cover protocol security, code assurance, tokenomics, unlocks, governance and privileged control, custody, liquidity, venue and counterparty exposure, chain incidents, and relevant regulatory status.

### 3. Verify, classify, and report

Re-open the decisive sources, verify that dates and asset identity match, check calculations, identify unsupported claims, and run the eligibility matrix. Verify that `review_scope`, `valid_until`, and invalidation triggers reflect the evidence and intended action. Save the immutable snapshot and register its validated metadata in the research index only after these checks pass.

Report the result in this order:

1. exact asset and as-of timestamp;
2. `research_status` and one-sentence rationale;
3. blocking findings, if any;
4. required corrections or missing evidence;
5. material non-blocking and residual risks;
6. thesis-supporting and thesis-challenging evidence;
7. source ledger and freshness notes;
8. permitted next handoff.

## Research Status Contract

Record one `fundamental_status` in addition to the overall research status:

- `no_blocking_red_flags_observed`: no material disqualifying red flag was identified within the documented, current review scope;
- `blocking_red_flags_observed`: verified evidence identifies one or more material disqualifying red flags;
- `unknown_or_incomplete`: required evidence is missing, stale, contradictory, inaccessible, or not tied to the exact asset.

The first status does not prove risk absence. Always state the reviewed sources and reporting periods, residual risks, and unknowns.

Use exactly one status:

- `eligible`: identity is resolved, required current evidence and review scope are sufficient through the recorded `valid_until`, no approved-system or verified legal/operational blocker is matched, and residual risks and invalidation triggers are explicit.
- `needs_correction`: a bounded correction could make the research usable, such as resolving venue identity, narrowing the thesis, refreshing one required disclosure, or adding a missing system constraint. State each correction; do not apply it silently.
- `blocked`: a verified fact matches an explicit approved-system, legal, eligibility, or operational blocker for the intended action. Cite both the fact and the rule. A concerning fact without a mapped rule is not automatically a hard block.
- `insufficient_evidence`: the required official evidence cannot be obtained, is materially contradictory, or cannot be tied to the exact asset. This status is not eligible.
- `stale`: an earlier snapshot no longer satisfies the required freshness window or a material event occurred after its cut-off. A newly completed review should not be labeled current if decisive evidence remains stale.

Only `eligible` research may support a new-entry or exposure-increase plan. Other statuses must hand off their corrections or blockers. For a protective exit, stale or incomplete entry research must not be used to pressure the user to remain exposed; hand off the verified identity and known hazards to the plan gate with the limitation stated.

## Light Adversarial Review

Use a constructive adversarial stance for no more than 30% of the interaction. Challenge symbol ambiguity, promotional claims, selective time windows, unaudited metrics, unsupported causal stories, survivorship bias, circular token-economy claims, and the assumption that a familiar asset or profitable position is fundamentally safe. Look actively for evidence that could invalidate the thesis.

Once the decisive evidence is sufficient, stop debating and issue the status. Preserve the user's literal thesis and intended action in the record even when the evidence challenges them.

## Model Reasoning Level

Default to `high` because the workflow affects financial risk and requires multi-source reconciliation.

- Use `medium` only for a mechanical refresh or formatting pass where identity, scope, decisive evidence, and eligibility are already current and no conclusion changes.
- Use `high` for a standard single-asset A-share or crypto review.
- Use `max` for leverage or derivatives, insolvency or delisting risk, adverse audit or enforcement events, bridge or smart-contract incidents, stablecoin reserve questions, cross-jurisdiction eligibility, opaque ownership, conflicting primary sources, or a decision that could materially change portfolio exposure.

Never lower the reasoning level merely to avoid current research.

## Handoff Boundary

This skill may recommend `proceed to plan gate`, `correct and re-review`, `do not establish the plan`, or `protective-exit review`. It cannot create or activate an investment plan, change an approved parameter, or execute a transaction. `$axis-trade-plan-gate` owns plan eligibility and user confirmation.

No order execution: never execute or place a trade.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
