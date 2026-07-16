---
name: axis-trade-daily-brief
description: Use when a user wants a source-backed daily briefing for configured holdings, investment plans, and watchlisted assets with freshness, deduplication, risk escalation, and delivery status. / 用于为已配置持仓、投资计划和关注资产生成有来源、可追溯、去重、包含风险升级与推送状态的每日简报。
---

# Axis Trade Daily Brief

Use this skill to produce a source-backed daily briefing for configured holdings, active or proposed investment plans, and watchlisted assets. It is a read-only monitoring and delivery workflow: it does not place orders, change positions, approve plans, or edit trading-system parameters.

Read `references/daily-brief-contract.md` before the first run, when configuring automation or delivery, and whenever coverage is partial, an asset identity is ambiguous, or a critical event is reported.

## Boundary

- Treat `.axis/trade` as the local source of truth. Resolve paths through `.axis/trade/config.yaml` when it provides them; otherwise use the default layout described in the reference.
- Read trading-system rules, asset identities, positions, plans, approved monitoring configuration, and the indexed immutable research snapshots produced by `axis-trade-risk-research`. Do not modify them.
- The only routine writes allowed are daily reports under `.axis/trade/briefs/daily/`, monitoring state under `.axis/trade/briefs/state/`, and an append-only run event in `.axis/trade/audit/events.jsonl`. Do not rewrite audit history or write broker, exchange, custody, portfolio, plan, research-index, research-snapshot, or trading-system state.
- Never place, stage, simulate as real, cancel, or suggest that this skill executed an order. Never log in to a broker, exchange, wallet, custodian, or signing interface.
- No order execution: never execute or place a trade.
- A daily delta scan cannot prove that an asset has no fundamental risk. It may only report that no new verified disqualifying risk was found within successfully checked sources as of a stated time.
- Require a current indexed research snapshot for any asset that needs a risk-clearance or plan-conformance conclusion. Missing, expired, stale, non-eligible, invalidated, or scope-incomplete research evidence is `INCOMPLETE`, not safe.
- If a new or existing plan appears inconsistent with the approved trading system, emit `PLAN_REVIEW_REQUIRED` with evidence and the affected rule. Do not create, approve, reject, pause, cancel, or rewrite the plan from this skill.
- Keep A-share and crypto policy adapters separate. Do not apply A-share T+1, lot-size, daily-limit, or stock-pool rules to crypto. When no approved crypto trading system exists, report fundamental, protocol, custody, regulatory, and event risk only; mark system conformance as unknown.
- Use live sources on every run. Never reuse model memory as current market evidence, and never treat a search-result snippet, social post, or unsourced summary as confirmation.
- Preserve the user's literal risk rules, asset scope, schedule, and privacy requirements. Monitoring automation must not silently relax freshness, source coverage, or alert thresholds.

## Model Reasoning Level

- Use **medium** reasoning for routine daily collection, normalization, deduplication, rule mapping, and report generation.
- Escalate to **high** reasoning for critical or conflicting evidence, ambiguous crypto asset identity, changed official filings, legal or regulatory events, protocol or custody incidents, and any conclusion that could block a plan.
- Do not use low reasoning to clear fundamental risk or declare plan conformance.
- Keep the written brief concise even when high reasoning is used internally. Separate verified fact, inference, uncertainty, and required review.

## Three-Step Work Contract

### 1. Co-create and approve the monitoring contract

For first-time setup or a material configuration change, confirm the `.axis/trade` root, canonical asset identifiers, indexed research status and scope, source policy, coverage window, freshness thresholds, schedule and timezone, delivery destination, and privacy mode. Show the expected report and explain what the workflow cannot guarantee. Run one manual dry run and obtain explicit approval before creating or changing recurring automation or external delivery.

For an already approved automated run, load the approved contract and proceed without re-asking stable questions. If a required input is absent or ambiguous, fail closed for the affected asset instead of guessing.

### 2. Execute the approved daily run

1. Load and validate `.axis/trade/config.yaml`, `.axis/trade/system/active.yaml`, the canonical portfolio assets and ledger/snapshot state, plans, `.axis/trade/research/index.yaml`, and each applicable immutable research snapshot.
2. Determine the collection window from per-source watermarks with the approved overlap. On a first run, use the approved bootstrap window and label it as an incremental scan, not a historical clearance.
3. Query current primary sources for each configured asset and relevant macro exposure. Open the source document; do not summarize from headlines or search snippets alone.
4. Capture source, event, publication, retrieval, and data-period timestamps with timezone. Mark freshness and coverage explicitly.
5. Normalize asset and event identities, cluster reports about the same underlying event, and classify each item as `NEW`, `UPDATE`, or `ONGOING`.
6. Separate event severity, user urgency, and evidence confidence. Map verified events to the affected holding, plan, baseline assumption, or trading-system rule.
7. Persist the local report before attempting external delivery. Advance only successful per-source watermarks. Track seen events separately from delivery acknowledgements.
8. Deliver only to an approved destination and record `delivered=true` or `delivered=false` without exposing credentials or sensitive account data.
9. Append one sanitized run event to `.axis/trade/audit/events.jsonl` after the collection and delivery outcomes are known.

### 3. Verify and report the run

- Verify that every material claim has a directly supporting source, timestamp, and affected asset or rule.
- Verify that primary-source failures, stale data, unreadable PDFs, invalid identifiers, missing or invalid indexed research, and delivery failures are visible in the report.
- Verify deduplication against prior state and ensure material corrections or severity changes are emitted as `UPDATE`.
- Verify that unresolved critical events remain visible as `ONGOING` until their resolution is evidenced.
- Verify that no trading system, plan, position, asset registry, research index or snapshot, credential, order, or external account state was changed.
- Verify that the run appended at most its own public-safe audit event and did not rewrite prior audit history.
- Report exact collection and delivery status as `COMPLETE`, `PARTIAL`, or `FAILED`; never hide degraded coverage behind a clean summary.

## Light Adversarial Review

Keep constructive challenge to no more than 30% of the interaction, but explicitly challenge these unsafe assumptions:

- “Daily monitoring guarantees no fundamental risk.” It does not; require a valid indexed research snapshot and describe checked coverage.
- “No result means no news.” A failed, stale, or blocked source means unknown coverage.
- “A familiar ticker identifies a crypto asset.” Require chain, native-asset identity or contract address, and verified official sources.
- “One daily push is real-time alerting.” It is not; require a separately approved critical monitor for shorter response objectives.
- “A media article is enough.” Prefer the official filing, regulator, protocol, governance, repository, status page, venue notice, or verified on-chain evidence.
- “Reducing the lookback or loosening freshness is harmless.” Treat monitoring changes that can create missed events as approval-gated changes with an impact statement.

After surfacing these risks, become decisive. Run the approved checks, produce the report, and state what remains unverified instead of remaining in open-ended critique.

## Required Inputs

At minimum, require:

- `.axis/trade/config.yaml` with timezone, source policy, brief path, state path, audit path, and delivery mode;
- `.axis/trade/portfolio/assets.yaml` with exchange and code for A-shares, or chain/native identity/contract plus verified official locations for crypto assets;
- current holdings derived from the approved portfolio ledger and snapshot contract, plus configured plans or watchlist scope;
- the applicable approved trading system or an explicit `monitor_only` classification;
- indexed `axis-trade-risk-research` metadata and immutable snapshot for any asset that requires risk clearance;
- an approved privacy profile and delivery destination for external delivery.

Reject or isolate only the affected asset when possible. Fail the whole run when the configuration or portfolio scope cannot be loaded safely.

## Source and Evidence Contract

Use the source hierarchy and event taxonomy in the reference.

- Prefer issuer, exchange, regulator, official macro publisher, protocol, governance, official repository, official status page, venue, and verified on-chain sources.
- Use reputable secondary sources for discovery or corroboration, not as proof that no disqualifying risk exists.
- Treat social and aggregator content as unverified leads unless independently confirmed.
- Record `event_time`, `published_at`, `retrieved_at`, `data_period`, `source_type`, `source_url`, `source_document_id`, and `content_hash` when available.
- For high or critical claims, use the authoritative primary source or two independent credible confirmations. If neither is available, quarantine the item as `unverified` and do not clear a plan.
- If a PDF, filing, governance proposal, or incident report cannot be read in full, report the read failure and avoid conclusions derived only from its title.

## Freshness and Coverage

- Use a per-source watermark plus an approved overlap; the conservative defaults are six hours of overlap and a 72-hour first-run window.
- Label first-run coverage as bootstrap coverage. It does not replace a scoped research snapshot.
- For A-share market data, use the most recent valid trading-session close and state the session date.
- If crypto price data is used for risk classification, it should be no more than 15 minutes old at generation time unless the approved configuration states a stricter threshold. Otherwise omit the price-derived conclusion and mark that coverage stale.
- Always state both the financial or operational data period and the disclosure date.
- A source failure prevents a “no new verified risk” conclusion for the categories that source was required to cover.
- Changes that reduce overlap, shorten lookback, widen stale-data tolerance, remove a primary source, or suppress an event category require an impact evaluation and explicit approval before the configuration is changed.

## Deduplication and State

- Prefer stable identifiers such as official announcement number, regulatory case number, governance proposal id, release tag, incident id, block/transaction hash, or venue notice id.
- Otherwise derive an event key from canonical asset id, event category, source authority, event date, and normalized-content hash.
- Cluster multiple articles and reposts around the underlying event. Keep the primary source as evidence and secondary sources as corroboration.
- Re-emit an event as `UPDATE` when the official content, severity, confidence, affected plan, deadline, or system impact materially changes.
- Carry unresolved critical or high items as `ONGOING`; do not repeat ordinary unchanged items.
- Maintain separate per-source watermarks, seen-event state, unresolved-event state, and per-destination delivery acknowledgements. A delivery failure must not mark an item delivered or suppress its retry.

## Risk and Plan Mapping

Use three separate fields:

```text
event_severity: critical | high | medium | low
user_priority: immediate | before_next_session | today | watch
evidence_confidence: confirmed | partially_confirmed | unverified
```

Exposure may increase user priority but must not reduce inherent event severity. A critical unverified lead is still unverified; it may justify pausing new-plan clearance, but it must not be presented as established fact.

For plan or system conflicts, include:

```text
status: PLAN_REVIEW_REQUIRED
asset_id: <canonical id>
plan_id: <id or null>
rule_id: <approved rule id or section>
evidence: <source ids and timestamps>
reason: <literal conflict>
review_by: <time or next trading window>
```

Do not silently infer or invent a missing rule. If the current system does not cover the asset class, state `system_conformance: unknown`.

## Report Contract

Produce a dated report with:

1. generation time, coverage window, timezone, and `COMPLETE`, `PARTIAL`, or `FAILED` status;
2. verified risks requiring review before the next relevant trading or governance window;
3. plan or trading-system conflicts;
4. `NEW`, `UPDATE`, and unresolved `ONGOING` events;
5. the next seven days of configured material events;
6. assets with no new verified disqualifying risk within successfully checked coverage;
7. a separate unverified-leads section;
8. per-source and per-asset freshness and failure coverage;
9. local persistence and delivery result, including destination class and `delivered=true|false`.

Use the exact safe formulation where applicable:

> As of `<retrieved_at>`, no new verified disqualifying risk was found within the sources successfully checked for `<asset_id>`.

For a Chinese brief, use the equivalent complete formulation:

> 截至 `<retrieved_at>`，在已成功检查的来源范围内，未发现 `<asset_id>` 新增的已验证否决性风险。

Do not shorten this to “no risk,” “safe,” or “all clear.”

## Automation and Delivery

Support two explicit modes: `run-once` for a manual source and format check, and `configure-automation` only after the user approves the dry run, schedule, timezone, privacy profile, and destination.

- Do not create or change automation merely because the skill was used. Only configure it when the user explicitly requests recurring monitoring and has approved a manual dry run.
- Use the Codex automation capability rather than writing raw scheduler directives. Resolve the local project id, inspect existing matching automations, and update an existing automation instead of creating a duplicate.
- A daily recurring brief should run as a standalone local scheduled job, not a short thread heartbeat.
- Keep the automation prompt small and non-sensitive: invoke this skill against the approved `.axis/trade/config.yaml`; do not embed holdings, account numbers, API keys, wallet addresses that are not public asset identifiers, or private destination tokens.
- Do not expose raw recurrence expressions to the user. Confirm the human-readable schedule, timezone, project, and destination.
- Default delivery is the local Codex task result. Email, Slack, Teams, webhook, or other external delivery requires explicit authorization, destination verification, and an available connector.
- Save the local report before delivery. If delivery fails, preserve the report, record `delivered=false`, and expose a bounded retry or next-run retry; do not claim success.
- If no approved destination exists, save the report and record `delivery_not_configured`; never claim it was pushed.
- Use a stable run and destination idempotency key so the same brief is not delivered twice unless its material content or severity changed.
- A once-daily automation cannot promise immediate incident response. If the user needs near-real-time critical alerts, propose a separate, explicitly approved monitor with its own frequency, source coverage, cost, and failure policy.

## Privacy

- Keep account ids, absolute balances, cost basis, private wallet addresses, personal notes, credentials, and connector tokens out of external briefs by default.
- Prefer `held`, `planned`, or exposure bands/percentages in external delivery unless the user explicitly approves more detail.
- Keep secrets in approved environment or connector storage. Store only secret references, never secret values, in `.axis/trade` configuration or state.
- Do not include private holdings or plans in public examples, packaged fixtures, source queries beyond the canonical public asset identifier, or reusable skill documentation.
- Sanitize delivery and source errors so they reveal the failed adapter and impact, not credential contents or private endpoints.

## Failure Semantics

- `COMPLETE`: every required source and configured asset category was checked with fresh evidence.
- `PARTIAL`: one or more assets, categories, prices, documents, or delivery targets are stale, unavailable, ambiguous, or unreadable.
- `FAILED`: the monitoring configuration or scope cannot be loaded, or no required primary coverage can be obtained safely.

Always list failed source, affected assets and categories, last successful time, bounded retry result, conclusions that cannot be made, and the next recovery action. Advance successful source watermarks only; never advance a failed source or silently substitute lower-quality evidence.

## Validation Checklist

- A duplicated official announcement plus media coverage produces one event with the official source primary.
- An official-source outage produces `PARTIAL` and no risk-clearance wording for the affected categories.
- Missing, expired, invalidated, non-eligible, or scope-incomplete indexed research produces `baseline_status: incomplete` and prevents clearance wording.
- A crypto symbol without canonical chain/native/contract identity is rejected or isolated; it is never guessed.
- Stale price data does not produce a fresh price-derived signal.
- A corrected filing or changed severity produces `UPDATE`.
- An unresolved critical risk remains `ONGOING`.
- A matching automation is updated, not duplicated.
- Failed external delivery leaves the local report intact and `delivered=false`.
- No protected `.axis/trade` source-of-truth file or external financial account was mutated; only the allowed brief/state files and append-only run audit event changed.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
