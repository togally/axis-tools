# Daily Brief Reference

This reference defines the default local layout, evidence schema, source hierarchy, event taxonomy, freshness, deduplication, report shape, and automation checks for `axis-trade-daily-brief`.

## `.axis/trade` Default Layout

Use paths declared in `.axis/trade/config.yaml` when present. Otherwise use this public-safe default:

```text
.axis/trade/
├── config.yaml
├── system/
│   └── active.yaml
├── portfolio/
│   ├── accounts.yaml
│   ├── assets.yaml
│   ├── ledger.jsonl
│   └── snapshots/
├── plans/
├── research/
│   ├── index.yaml
│   └── <filesystem-safe-asset-id>/
│       └── <research-id>.md
├── briefs/
│   ├── daily/
│   └── state/
│       ├── daily-brief.json
│       └── delivery.json
└── audit/
    └── events.jsonl
```

Read-only inputs:

- `config.yaml`
- `system/**`
- `portfolio/**`
- `plans/**`
- `.axis/trade/research/index.yaml`
- `research/<filesystem-safe-asset-id>/<research-id>.md`

Allowed writes:

- `briefs/daily/**`
- `briefs/state/daily-brief.json`
- `briefs/state/delivery.json`
- append-only events owned by this skill in `audit/events.jsonl`

Do not create a missing source-of-truth file during an automated run. Report the missing prerequisite. Creating or changing configuration belongs to an explicit setup or approved change flow.

## Minimum Configuration Contract

The exact serialization can follow the surrounding suite, but the approved configuration must express the following concepts:

```yaml
version: 1
timezone: Asia/Shanghai
monitoring:
  include_current_holdings: true
  include_active_plans: true
  watchlist_asset_ids: []
paths:
  active_system: .axis/trade/system/active.yaml
  accounts: .axis/trade/portfolio/accounts.yaml
  assets: .axis/trade/portfolio/assets.yaml
  ledger: .axis/trade/portfolio/ledger.jsonl
  snapshots: .axis/trade/portfolio/snapshots
  plans: .axis/trade/plans
  research_index: .axis/trade/research/index.yaml
  research_root: .axis/trade/research
  briefs: .axis/trade/briefs/daily
  state: .axis/trade/briefs/state/daily-brief.json
  delivery_state: .axis/trade/briefs/state/delivery.json
  audit: .axis/trade/audit/events.jsonl
collection:
  first_run_lookback_hours: 72
  watermark_overlap_hours: 6
  crypto_quote_max_age_minutes: 15
  calendar_horizon_days: 7
delivery:
  mode: local
  privacy_profile: external_redacted
```

These values are conservative defaults, not silently mutable runtime tuning. Reducing coverage or loosening freshness requires an impact evaluation and approval. Secret values must not appear in this file; use environment or connector references.

## Canonical Asset Identity

### A-share

Require at least:

```yaml
asset_id: a_share:SSE:600000
asset_class: a_share
exchange: SSE
ticker: "600000"
issuer_name: Example Company
```

Supported exchanges should be explicit, such as `SSE`, `SZSE`, or `BSE`. Preserve leading zeroes by storing tickers as strings. Do not resolve an issuer from name alone when multiple matches exist.

### Crypto native asset

Require at least:

```yaml
asset_id: crypto:bitcoin:native:BTC
asset_class: crypto
network: bitcoin
asset_type: native
symbol: BTC
official_sources:
  - <verified project or network source>
```

### Crypto token

Require at least:

```yaml
asset_id: crypto:ethereum:token:0x...
asset_class: crypto
network: ethereum
asset_type: token
contract_address: "0x..."
symbol: EXAMPLE
official_sources:
  - <verified project domain>
official_repositories:
  - <verified repository url>
governance_sources:
  - <verified governance url>
```

A symbol alone is never sufficient because symbols can collide or be impersonated. Normalize contract addresses according to the chain and preserve the source used to verify official domains and repositories.

## Baseline Research Contract

Daily monitoring is only an incremental control. Its baseline is the validated immutable snapshot produced by `axis-trade-risk-research` and registered in `.axis/trade/research/index.yaml`; the daily brief must not invent a second baseline schema or select a snapshot by filename order.

The research index entry must include:

```yaml
research_id: <immutable id>
asset_id: <canonical id>
path: <filesystem-safe-asset-id>/<research-id>.md
content_hash: <sha256-of-exact-snapshot-bytes>
as_of: <ISO-8601 timestamp with timezone>
valid_until: <ISO-8601 timestamp with timezone>
research_status: eligible | needs_correction | blocked | insufficient_evidence | stale
fundamental_status: no_blocking_red_flags_observed | blocking_red_flags_observed | unknown_or_incomplete
review_scope: []
```

The immutable snapshot must include:

```yaml
schema: axis.trade.research
schema_version: 1
asset_id: <canonical id>
research_id: <immutable id>
as_of: <ISO-8601 timestamp with timezone>
valid_until: <ISO-8601 timestamp with timezone>
research_status: eligible | needs_correction | blocked | insufficient_evidence | stale
fundamental_status: no_blocking_red_flags_observed | blocking_red_flags_observed | unknown_or_incomplete
review_scope:
  - business_or_protocol
  - financial_or_treasury
  - governance_and_control
  - legal_and_regulatory
  - security_and_custody
  - liquidity_and_market_structure
invalidation_triggers: []
source_ids:
  - <evidence id>
```

`content_hash` lives only in the research index. The immutable snapshot must not contain its own `content_hash`; recompute SHA-256 over its exact UTF-8 bytes and compare that value with the index entry.

Risk-clearance wording requires a snapshot whose exact UTF-8 bytes match the index `content_hash`, whose snapshot and index metadata agree, whose `research_status` is `eligible`, whose `fundamental_status` is `no_blocking_red_flags_observed`, whose `review_scope` covers the categories required by the asset and plan, whose `valid_until` has not passed, and whose covered assumptions have not been invalidated by a material post-cut-off event. This remains a scoped conclusion, not proof of safety. A daily brief must not repair or rewrite the research index or snapshot. It should emit `BASELINE_RESEARCH_REQUIRED` when the index or snapshot is missing, expired, stale, non-eligible, incomplete in scope, hash-inconsistent, or invalidated by a material event.

## Source Hierarchy

### Tier 0: authoritative primary evidence

For A-shares:

- issuer filings and announcements on the relevant exchange or the legally designated disclosure platform;
- Shanghai, Shenzhen, and Beijing exchange notices, inquiry letters, disciplinary actions, delisting, suspension, and market-risk notices;
- China Securities Regulatory Commission and its official local offices for investigations, administrative measures, and penalties;
- official issuer investor-relations material only as a supplement when the exchange filing is the controlling disclosure;
- official macro and policy releases from the competent authority, such as the People's Bank of China, National Bureau of Statistics, Ministry of Finance, or another responsible agency, only when relevant to a configured exposure or plan.

Public official entry points include:

- `https://www.cninfo.com.cn/`
- `https://www.sse.com.cn/`
- `https://www.szse.cn/`
- `https://www.bse.cn/`
- `https://www.csrc.gov.cn/`
- `https://www.pbc.gov.cn/`
- `https://www.stats.gov.cn/`

For crypto:

- official protocol or project site, blog, documentation, security notice, and status page registered for the canonical asset;
- official governance proposal and vote;
- verified official repository release and security advisory;
- verified chain, contract, block, transaction, and event evidence;
- official regulator or court notice in the configured jurisdiction;
- official exchange, custodian, wallet, bridge, or venue notice for venue-specific availability, incident, delisting, or custody risk.

Do not assume that an account with an official-looking name is authoritative. Official social content can be a lead but should point back to a registered official source or independently verifiable event.

### Tier 1: credible secondary evidence

Use reputable newswires, licensed market-data services, audited research, or established security investigators for discovery or corroboration. Record the publisher, timestamp, and link. A Tier 1 source alone cannot support a statement that no disqualifying risk exists.

### Tier 2: leads only

Treat social posts, forums, influencer content, anonymous messages, and news aggregators as unverified leads. Put them in the separate unverified section unless confirmed by Tier 0 or sufficient independent Tier 1 evidence.

## Required Evidence Fields

Each normalized item should support:

```yaml
event_id: <stable event id>
event_status: NEW | UPDATE | ONGOING
asset_ids:
  - <canonical id>
category: <event category>
event_time: <when the underlying event occurred or null>
published_at: <source publication time>
retrieved_at: <collection time>
data_period: <financial, operational, block, or market-data period>
source_tier: 0 | 1 | 2
source_type: <issuer_filing, regulator, governance, repository, chain, ...>
source_authority: <publisher or network>
source_url: <direct source url>
source_document_id: <announcement, case, proposal, release, incident, tx, or fallback id>
content_hash: <normalized digest when available>
freshness: fresh | stale | unknown
event_severity: critical | high | medium | low
user_priority: immediate | before_next_session | today | watch
evidence_confidence: confirmed | partially_confirmed | unverified
affected_plan_ids: []
affected_rule_ids: []
fact_summary: <source-grounded fact>
impact_assessment: <inference, clearly labeled>
review_by: <deadline or null>
```

Keep `fact_summary` distinct from `impact_assessment`. A source can establish that an event occurred without establishing the investment outcome inferred from it.

## Event Taxonomy

### A-share mandatory categories

- investigation, administrative measure, disciplinary action, penalty, inquiry letter;
- ST or other risk warning, suspension, resumption, delisting warning, termination listing;
- audit opinion, internal-control issue, financial restatement, accounting correction;
- earnings forecast, earnings warning, forecast correction, periodic report;
- debt default, refinancing stress, guarantee, pledge, freeze, major litigation, bankruptcy, restructuring;
- controlling-owner, beneficial-owner, control-right, executive, director, or auditor change;
- shareholder reduction, issuance, unlock, repurchase, dividend, ex-rights, or material dilution event;
- major asset transaction, related-party transaction, contract award or termination;
- major accident, production halt, permit loss, product recall, or operational disruption;
- abnormal volatility, trading restriction, public market-risk notice;
- next-session and next-seven-day known events that can affect an approved plan.

### Crypto mandatory categories

- exploit, compromised key, bridge incident, contract bug, emergency pause, malicious upgrade;
- chain halt, finality failure, reorganization, consensus incident, validator or sequencer outage;
- governance proposal, vote, timelock execution, admin or multisig change;
- protocol upgrade, migration, fork, deprecation, release, or critical dependency change;
- token issuance, vesting unlock, burn, treasury transfer, foundation or insider movement;
- stable-asset depeg, reserve disclosure, liquidity impairment, redemption constraint;
- exchange or custodian outage, deposit/withdrawal halt, delisting, insolvency, or custody loss;
- regulator, court, sanctions, registration, enforcement, or jurisdictional availability event;
- official audit, security advisory, bug-bounty disclosure, remediation, or postmortem;
- configured market-structure or liquidity event supported by fresh authorized data.

### Relevance rule for macro events

Do not include broad macro news merely because it is popular. Include it only when the brief can identify the affected asset or plan, the transmission channel, the relevant official data period, and why it matters to an approved rule or baseline assumption.

## Freshness Rules

Use source-specific watermarks rather than one global success time.

Default collection window:

```text
window_start = source.last_successful_watermark - approved_overlap
window_end = current_run_retrieved_at
```

On first run:

```text
window_start = current_run_retrieved_at - approved_first_run_lookback
coverage_label = bootstrap_incremental
```

Defaults:

- overlap: 6 hours;
- first-run lookback: 72 hours;
- future event calendar: 7 days;
- A-share price or technical context: most recent valid trading-session close, with session date;
- crypto price used for alerting: no more than 15 minutes old at report generation.

Do not use a fresh article to disguise stale underlying data. For example, a current article that cites an old financial period must retain the old data period. On holidays and non-trading days, identify the last valid A-share session rather than presenting it as today's close.

## Coverage and Fail-Closed Logic

Coverage is evaluated per asset and category:

```yaml
asset_id: <id>
category: legal_and_regulatory
required_sources:
  - exchange
  - regulator
checked_sources:
  - exchange
failed_sources:
  - regulator
coverage_status: incomplete
```

Use these conclusions:

- `complete`: all required sources for the configured category were checked with acceptable freshness;
- `partial`: some required evidence is unavailable, stale, ambiguous, or unreadable;
- `failed`: no safe conclusion can be produced for the asset or run.

Safe negative formulation:

```text
As of <retrieved_at>, no new verified disqualifying risk was found within the sources successfully checked for <asset_id>.
```

Chinese equivalent:

```text
截至 <retrieved_at>，在已成功检查的来源范围内，未发现 <asset_id> 新增的已验证否决性风险。
```

Never use `safe`, `no risk`, `risk free`, `fully cleared`, or an equivalent absolute statement.

## Deduplication Algorithm

Prefer the primary stable identifier:

```text
official announcement id
regulatory case or decision number
governance proposal id
repository release tag or security advisory id
incident or status-page id
chain block/transaction/event identity
venue notice id
```

Primary event key:

```text
canonical_asset_id | event_category | source_authority | source_document_id
```

Fallback key:

```text
canonical_asset_id | event_category | normalized_event_date | normalized_title | content_hash
```

Cluster secondary reports into the primary event when they describe the same issuer/protocol, underlying action, event date, and official document. One macro event affecting multiple assets should be one event with multiple `asset_ids`.

Emit:

- `NEW` when the canonical event has not been reported;
- `UPDATE` when official content, confidence, severity, deadline, affected plan, or rule impact materially changes;
- `ONGOING` for unresolved critical or high events that still require review.

Do not repeat unchanged low or medium events. Do not suppress an event that was seen locally but not successfully delivered to an approved destination.

## State Semantics

Recommended logical state:

```yaml
sources:
  <source_id>:
    last_successful_watermark: <timestamp>
    last_attempt_at: <timestamp>
    status: ok | partial | failed
events:
  <event_id>:
    first_seen_at: <timestamp>
    last_seen_at: <timestamp>
    last_content_hash: <hash>
    status: NEW | UPDATE | ONGOING | RESOLVED
    unresolved: true | false
delivery:
  <destination_id>:
    <report_id>:
      delivered: true | false
      attempted_at: <timestamp>
      error_code: <sanitized code or null>
```

Persist the report before state changes. Advance only successful source watermarks. Mark delivery only after the destination acknowledges success. A failed external delivery should leave the report available locally and eligible for a bounded or next-run retry. Append one sanitized run event to `audit/events.jsonl`; never rewrite or truncate the audit log.

## Severity, Urgency, and Confidence

Keep the axes independent.

### Event severity

- `critical`: credible risk of material loss, illegality, control failure, protocol compromise, custody loss, insolvency, delisting, or inability to execute required risk controls;
- `high`: material change that requires review before the next relevant trading, governance, unlock, or redemption window;
- `medium`: material context or changed assumption without an immediate action deadline;
- `low`: relevant background information.

### User priority

- `immediate`: review now because exposure or a decision window is active;
- `before_next_session`: review before the next market, governance, unlock, or execution window;
- `today`: include in the current daily review;
- `watch`: monitor without an immediate review requirement.

### Evidence confidence

- `confirmed`: authoritative primary evidence or equivalent direct verifiable event;
- `partially_confirmed`: credible evidence exists but a material fact or source is missing;
- `unverified`: lead only, conflicting evidence, ambiguous identity, or no authoritative support.

Exposure can raise `user_priority`; it cannot lower `event_severity`. A severe but unverified lead may block new-plan clearance pending verification, but the brief must keep the underlying fact labeled unverified.

## Plan and System Mapping

Read the applicable approved system and cite its stable rule or section. For an approved A-share trend system, applicable mappings may include:

- stock-pool exclusions such as ST, delisting, insufficient listing age, or known major near-term uncertainty;
- market-environment and total-position limits;
- industry or correlated-theme concentration;
- planned entry, invalidation price, initial risk, and position-size requirements;
- account drawdown or consecutive-loss gates;
- technical exit and profit-protection rules when fresh authorized market data is available.

Do not invent a crypto trading rule from the A-share system. When no approved asset-class system exists, use:

```yaml
system_conformance: unknown
reason: no approved system covers this asset class
```

For a conflict, preserve the literal approved rule, name the evidence, and emit `PLAN_REVIEW_REQUIRED`. The daily brief itself must not change plan state.

## Report Template

```markdown
# Daily Investment Brief — <date>

- Generated at: <timestamp and timezone>
- Coverage window: <start> to <end>
- Collection status: COMPLETE | PARTIAL | FAILED
- Delivery status: delivered=true|false
- Baseline exceptions: <count>

## Review Before the Next Relevant Window

<verified critical/high items, or an explicit none-within-complete-coverage statement>

## Plan and Trading-System Conflicts

<PLAN_REVIEW_REQUIRED items with plan id, rule id, evidence, and review-by time>

## New and Updated Events

<NEW and UPDATE items>

## Ongoing Material Risks

<unresolved ONGOING items>

## Next Seven Days

<configured material calendar events>

## No New Verified Disqualifying Risk Found

<asset-specific safe negative statements only where required coverage is complete>

## Unverified Leads

<clearly quarantined items>

## Coverage and Failures

<per-source and per-asset freshness, failures, last success, impact, and recovery action>

## Delivery

<destination class, privacy profile, acknowledgement, sanitized error if any>
```

Do not let a compact delivery message omit collection status or a critical coverage failure. A short external push can link or point to the full local report when the destination supports it.

## Automation Setup Protocol

1. Run the brief manually against the approved `.axis/trade/config.yaml`.
2. Show the resulting coverage, privacy behavior, and failure semantics.
3. Obtain explicit approval for human-readable schedule, timezone, project, destination, and privacy profile.
4. Use the Codex automation capability to locate the project and inspect existing matching automation state.
5. Update a matching automation rather than creating a duplicate. Keep the name non-sensitive.
6. Keep the automation prompt limited to invoking `axis-trade-daily-brief` with the approved config path and read-only/fail-closed requirements.
7. Confirm the resulting automation in human-readable terms. Do not expose raw recurrence syntax.

Use a standalone local scheduled job for a daily brief. Do not use a short thread heartbeat. Local Codex task delivery is the default. Any external connector requires explicit authorization and verified destination identity.

A daily automation is not a critical real-time monitor. If a user requests near-real-time incident detection, treat it as a separate automation with separately approved frequency, sources, cost, privacy, retry, and escalation behavior.

## Delivery and Privacy Profiles

Recommended profiles:

- `local_full`: full local report; sensitive values included only when explicitly configured;
- `external_redacted`: asset identity, event, rule impact, and exposure band/percentage, but no account id, absolute balance, cost basis, private wallet, note, credential, or connector secret;
- `external_minimal`: only urgent event, affected public asset id, required review time, confidence, and link/reference to the local report.

Store connector and API secrets only in approved secret storage. Configuration may contain a secret reference but never the secret value. Sanitize errors and do not include private endpoints or tokens in reports.

## Failure and Retry Rules

- Use bounded retries for transient source or delivery failures; do not wait indefinitely or hide repeated failure.
- Do not replace a failed Tier 0 source with a Tier 1 or Tier 2 source and still label coverage complete.
- Do not advance a failed source watermark.
- Do not mark external delivery successful without destination acknowledgement.
- Preserve the full local report even when delivery fails.
- On the next run, retry undelivered critical material according to the approved policy.
- If all required primary sources fail or the monitored scope cannot be loaded, produce a minimal `FAILED` report rather than a fabricated brief.

Every failure entry should include:

```yaml
source_or_destination: <id>
status: stale | failed | unreadable | ambiguous | unauthorized
affected_asset_ids: []
affected_categories: []
last_successful_at: <timestamp or null>
retry_count: <bounded integer>
conclusions_blocked: []
next_action: <repair or verification action>
```

## Acceptance Fixtures

The skill bundle or consuming project should validate these cases:

1. One issuer announcement plus two media copies yields one canonical event with the official filing primary.
2. One mandatory regulator source fails; the asset/category becomes incomplete and receives no negative-risk clearance.
3. The indexed research snapshot is missing or expired; the brief emits `BASELINE_RESEARCH_REQUIRED`.
4. Two crypto tokens share a symbol; the asset without chain and contract identity is rejected instead of guessed.
5. A crypto quote exceeds the approved maximum age; no fresh price-derived alert is produced.
6. An issuer corrects an announcement; the event becomes `UPDATE` with the new content hash.
7. A critical incident remains unresolved; it appears as `ONGOING` on the next brief.
8. One macro event affects three assets; it is emitted once with three affected asset ids.
9. A matching recurring automation exists; setup updates it instead of creating a second one.
10. External delivery fails; the local report exists, delivery remains false, and the critical item is eligible for retry.
11. A run-level diff proves no trading system, portfolio, plan, baseline, asset registry, order, broker, exchange, custody, or wallet state changed; only allowed brief/state outputs and the skill-owned append-only audit event changed.
