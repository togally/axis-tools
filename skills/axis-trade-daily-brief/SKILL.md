---
name: axis-trade-daily-brief
description: Use when a user wants a source-backed daily briefing for configured holdings, investment plans, and watchlisted assets with freshness, deduplication, risk escalation, and delivery status. / 用于为已配置持仓、投资计划和关注资产生成有来源、可追溯、去重、包含风险升级与推送状态的每日简报。
---

# Axis Trade Daily Brief

Produce a source-backed daily brief for configured holdings, plans, and watchlisted assets. This is a read-only monitoring and delivery workflow. Read [daily-brief-contract.md](references/daily-brief-contract.md) before first use, automation changes, partial coverage, ambiguous identity, or critical-event reporting.

## When to Use

- Run the approved daily source scan and summarize new, updated, or unresolved material events.
- Map verified events to configured assets, plans, research assumptions, and trading-system rules.
- Perform a manual `run-once`, or configure recurring monitoring after its contract and dry run are approved.
- Deliver a privacy-safe brief to an approved destination and record the delivery result.

## Do Not Use

- Do not research an asset from scratch, reconcile holdings, approve or rewrite a plan, or change trading-system parameters.
- Do not log in to brokers, exchanges, wallets, custodians, or signing interfaces.
- Do not infer safety from missing results, stale research, a search snippet, social post, or model memory.
- Do not create or change automation or external delivery without explicit authorization.

## Inputs

- `.axis/trade/config.yaml`: timezone, sources, freshness/overlap policy, paths, privacy mode, schedule, and delivery mode.
- Canonical assets, reconciled holdings/snapshot, configured plans or watchlist, and the applicable approved trading system or `monitor_only` classification.
- `.axis/trade/research/index.yaml` plus the indexed immutable snapshot for any risk-clearance or plan-conformance conclusion.
- Approved source policy and, for external delivery, an approved privacy profile and verified destination.

Reject or isolate only the affected asset where possible. Fail the run when configuration or portfolio scope cannot be loaded safely. Resolve ambiguous crypto identity by chain and native asset or contract; never guess from a symbol.

## Outputs

Write a dated local report containing:

1. generation time, coverage window, timezone, and `COMPLETE`, `PARTIAL`, or `FAILED`;
2. verified risks, plan/system conflicts, and `NEW`, `UPDATE`, or unresolved `ONGOING` events;
3. upcoming configured events and assets with no new verified disqualifying risk only within successfully checked coverage;
4. unverified leads plus per-source/per-asset freshness, failures, and conclusions that cannot be made;
5. local persistence and delivery result, including destination class and `delivered=true|false`.

Use this exact scope-limited wording where applicable: “As of `<retrieved_at>`, no new verified disqualifying risk was found within the sources successfully checked for `<asset_id>`.” Never shorten it to “safe” or “no risk.”

## Safety and Boundaries

- Treat `.axis/trade` structured state as canonical and read-only. Routine writes are limited to daily reports, monitoring state, and one append-only sanitized run event in `.axis/trade/audit/events.jsonl`.
- Never modify portfolio, plan, asset registry, research, system, credential, order, or external account state. No order execution: never execute or place a trade.
- A daily delta scan does not prove risk absence. Missing, stale, non-eligible, invalidated, or scope-incomplete indexed research is `INCOMPLETE`, not safe.
- Emit `PLAN_REVIEW_REQUIRED` with the affected rule and evidence when a plan appears inconsistent; do not create, approve, reject, pause, cancel, or rewrite it.
- Keep A-share and crypto adapters separate. When no approved crypto system exists, report protocol, custody, regulatory, event, and fundamental risk while marking conformance unknown.
- Use live authoritative sources on every run. Preserve literal risk rules, asset scope, schedule, privacy, freshness, and coverage requirements.
- Keep account IDs, balances, cost basis, private wallet addresses, notes, credentials, connector tokens, and other personal financial data out of external briefs by default.

## Model Reasoning Level

Use `medium` for routine collection, normalization, deduplication, mapping, and report generation. Use `high` for critical/conflicting evidence, ambiguous identity, changed filings, regulation, protocol/custody incidents, or conclusions that could block a plan. Never use low reasoning to clear risk or declare conformance.

## Three-Step Work Contract

1. Co-create: on first setup or material changes, confirm paths, identities, research scope, source/freshness policy, timezone, schedule, delivery, and privacy. Show one manual dry run and obtain explicit approval before recurring automation or external delivery. Reuse an already approved stable contract.
2. Execute: load canonical state; collect current primary evidence from per-source watermarks with approved overlap; record timestamps; normalize and deduplicate events; map risks; persist locally; deliver if authorized; append the sanitized run event.
3. Verify: prove source support, freshness, coverage, deduplication, protected-state immutability, and delivery outcome; report the exact run status without hiding degradation.

## Evidence, Freshness, and State

- Prefer issuer, exchange, regulator, official macro publisher, protocol, governance, repository, status-page, venue, and verified on-chain sources. Secondary sources are discovery or corroboration only.
- Record `event_time`, `published_at`, `retrieved_at`, `data_period`, source identity, URL, document ID, and content hash when available. Unreadable documents remain explicit failures.
- Use per-source watermarks plus approved overlap. Label a first run as bootstrap coverage; it never replaces scoped research.
- Track financial/operational data period separately from disclosure time. A failed required source prevents clearance wording for the affected category.
- Prefer stable official event IDs; otherwise derive a key from canonical asset, category, authority, event date, and normalized-content hash.
- Keep source watermarks, seen events, unresolved events, and destination acknowledgements separate. Re-emit material corrections as `UPDATE`; keep unresolved high/critical events `ONGOING`.
- Maintain delivery idempotency independently of event deduplication. A failed delivery does not mark an item delivered or suppress retry.

## Risk and Plan Mapping

Keep `event_severity`, `user_priority`, and `evidence_confidence` separate. Exposure can raise urgency but cannot reduce severity; an unverified critical lead is not an established fact.

For conflicts record `status: PLAN_REVIEW_REQUIRED`, canonical `asset_id`, plan ID when known, approved rule ID, source/timestamp evidence, literal reason, and review deadline. If no applicable approved rule exists, state `system_conformance: unknown`.

## Automation and Delivery

Support two explicit modes: `run-once` and `configure-automation`. The latter requires an approved dry run, schedule, timezone, privacy profile, and destination.

- Use Codex automation capabilities and update an existing matching automation instead of duplicating it.
- Keep scheduled prompts small and non-sensitive; invoke this skill against approved config rather than embedding holdings or secrets.
- Save locally before delivery. External destinations require explicit authorization, verification, and an available connector.
- If delivery fails, retain the report and record `delivered=false`. If no destination is approved, record `delivery_not_configured`.
- Use a stable run/destination idempotency key. Do not deliver the same brief twice unless material content or severity changed.
- Daily delivery is not real-time alerting; a faster monitor needs separate approval, source coverage, cost, and failure policy.

## Failure Semantics

- `COMPLETE`: all required sources and configured asset categories were checked with fresh evidence.
- `PARTIAL`: one or more assets, categories, prices, documents, or delivery targets are stale, unavailable, ambiguous, or unreadable.
- `FAILED`: monitoring configuration/scope cannot load, or required primary coverage cannot be obtained safely.

List each failed source, affected scope, last success, retry result, unavailable conclusions, and recovery action. Advance only successful source watermarks.

## Checks

- Duplicate official and media reports resolve to one event with official evidence primary.
- Outage, unreadable evidence, stale prices, or incomplete research produces `PARTIAL` and blocks affected clearance wording.
- Ambiguous crypto identity is rejected or isolated; changed evidence becomes `UPDATE`; unresolved critical risk remains `ONGOING`.
- Every claim has source/timestamp/scope; failed delivery keeps the local report and remains `delivered=false`.
- Matching automation is updated rather than duplicated; prior audit history and protected `.axis/trade` state remain unchanged.

## Light Adversarial Review

Use constructive challenge for no more than 30% of the interaction. Challenge “no result means no news,” symbol-only identity, media-only proof, silent freshness relaxation, and claims that daily monitoring guarantees safety. Then run the approved checks decisively and state what remains unverified.

## After Use Deposition

After use, check for reusable corrections, examples, checks, or edge cases. If present, update and validate this public-safe bundle, refresh the local copy when requested, and push only when authorized. Otherwise report that no Skill update is needed.
