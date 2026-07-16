# Risk Research Reference

Use this reference to build and validate an `axis-trade-risk-research` evidence snapshot. Adapt the checklist to the asset; do not pad a review with irrelevant sections.

## Source Hierarchy

| Priority | Source class | Appropriate use |
| --- | --- | --- |
| 1 | Regulator, legislature, court, official registry | Legal status, enforcement, eligibility, licences, sanctions, final rules, formal proceedings. |
| 1 | Issuer filing, exchange announcement, statutory disclosure | Financial statements, audit opinion, corporate actions, pledges, related parties, suspensions, delisting notices, material events. |
| 1 | Canonical project documentation, governance system, source repository, security advisory, chain explorer | Protocol design, governance decisions, releases, contract identity, supply, privileged roles, incidents, on-chain state. |
| 2 | Independent audit, assurance, rating, or research with disclosed methods | Corroboration and technical analysis; record scope, date, limitations, and conflicts. |
| 3 | Reputable reporting or data aggregation | Discovery and context only; trace decisive facts to a primary source. |
| 4 | Social posts, forums, influencer or promotional content | Leads and sentiment only; never the sole support for eligibility. |

An issuer or project statement is primary evidence of what it claims, not independent proof that the claim is true. Record that distinction.

## Identity Resolution

### A-shares

Record exchange, ticker, legal issuer name, share class, current listing status, and disclosure page. Confirm corporate-action aliases and recent ticker or name changes.

### Cryptoassets

Record whether the asset is a native coin, token, receipt, wrapped asset, stablecoin, governance token, liquidity-provider token, or exchange product. For a token, record network and contract address from a canonical source. Record bridges, wrappers, issuer or protocol, upgradeability, privileged control, intended custody, and venue when those change the risk.

Treat the same symbol on different networks or contracts as different assets until equivalence is proven.

## Freshness Rules

Set a research cut-off in an explicit timezone. Use the most recent required periodic filing and search from its period end through the cut-off for material events. For fast-moving crypto risks, check canonical incident, governance, supply, contract, reserve, and venue information at the time of review.

Do not rely on a fixed universal number of days. Derive freshness from the approved trading system, event cadence, disclosure obligation, and intended holding horizon. Immediately mark prior research stale after a potentially material event, including a new filing, trading halt, enforcement action, exploit, governance execution, contract migration, reserve event, or listing-status change.

## Common Review Matrix

Review applicable rows and mark non-applicable rows explicitly:

- exact identity and legal or account eligibility;
- intended instrument versus underlying exposure;
- business or protocol purpose and revenue or value-accrual mechanism;
- cash flow, balance-sheet resilience, reserves, liabilities, and funding dependence;
- ownership, governance, voting power, privileged roles, key-person dependence, and change controls;
- dilution, issuance, unlocks, treasury actions, burns, buybacks, splits, rights issues, and convertible claims;
- related-party transactions, insider or controller activity, pledges, concentration, and conflicts;
- audit opinion, assurance scope, restatement, internal-control weakness, code audit limitations, and unresolved findings;
- litigation, investigation, enforcement, sanctions, licences, listing status, suspension, and delisting risk;
- major customer, supplier, validator, sequencer, oracle, bridge, custodian, exchange, or banking dependencies;
- operational outage, cyber incident, exploit, key compromise, upgrade, migration, recovery, and disclosure quality;
- liquidity, free float, depth, spreads, redemption mechanics, withdrawal constraints, and market concentration;
- known event calendar and whether the thesis depends on an unverified catalyst;
- correlation and concentration interaction with the current portfolio when portfolio context is available.

## A-share Addendum

Where applicable, review current periodic reports and subsequent announcements for audit opinion, going-concern language, revenue and cash-flow quality, debt and guarantees, receivables and impairments, inventory, non-recurring gains, related parties, shareholder pledges, controller changes, regulatory inquiries, penalties, litigation, restructuring, issuance, repurchase, dividends, performance forecasts, trading abnormality, suspension, risk-warning treatment, and delisting conditions.

Do not infer company fundamentals from price action alone. Do not treat an exchange inquiry as proof of wrongdoing; record the question, response, status, and unresolved issue.

## Cryptoasset Addendum

Where applicable, review supply and unlock mechanics, holder and validator concentration, governance capture, admin keys and upgradeability, oracle and bridge dependence, smart-contract scope and audit age, disclosed incidents, treasury and runway, fee or revenue claims, token value accrual, stablecoin reserve and redemption structure, custody and withdrawal risk, exchange counterparty exposure, sanctions or regulatory restrictions, chain liveness, sequencer dependence, and contract migrations.

On-chain data is evidence of observable state, not automatic proof of beneficial ownership, solvency, intent, or off-chain liabilities. A code audit reduces only the reviewed scope at the reviewed version and date; it does not prove safety.

## Evidence Ledger Template

Use one row per proposition:

| ID | Proposition | Source class | Source and direct URL | Published/effective | Retrieved | Exact asset match | Fact/calculation/inference | Supports/challenges | Notes and limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Every blocking conclusion must reference at least one ledger ID and one approved-system or verified eligibility rule. When primary sources conflict, preserve both rows and explain why the conflict is resolved or why the result remains `insufficient_evidence`.

## Output Record Template

After validation, write the immutable snapshot first, compute SHA-256 over the exact UTF-8 bytes of the immutable snapshot after final serialization, and register the result in `.axis/trade/research/index.yaml`. The hash uses the `sha256:<lowercase-hex>` form and lives in the index so the snapshot never hashes a field containing its own hash. The index entry and snapshot must agree on `research_id`, `asset_id`, `as_of`, `valid_until`, `review_scope`, `research_status`, and `fundamental_status`; downstream workflows must resolve the snapshot through the index instead of guessing from filename order.

```yaml
research:
  - research_id: <immutable-id>
    asset_id: <canonical-portfolio-asset-id>
    path: <filesystem-safe-asset-id>/<research-id>.md
    content_hash: <sha256-of-exact-snapshot-bytes>
    as_of: <ISO-8601 timestamp with timezone>
    valid_until: <ISO-8601 timestamp with timezone>
    review_scope: []
    research_status: <eligible|needs_correction|blocked|insufficient_evidence|stale>
    fundamental_status: <no_blocking_red_flags_observed|blocking_red_flags_observed|unknown_or_incomplete>
```

```yaml
schema: axis.trade.research
schema_version: 1
research_id: <immutable-id>
asset_id: <canonical-portfolio-asset-id>
asset_identity:
  asset_class: <a_share|crypto|other>
  market_or_network: <value>
  ticker_or_symbol: <value>
  legal_name_or_contract: <value>
intended_action: <entry|add|hold_review|partial_exit|full_exit|replacement>
as_of: <ISO-8601 timestamp with timezone>
valid_until: <ISO-8601 timestamp with timezone>
review_scope:
  - business_or_protocol
  - financial_or_treasury
  - governance_and_control
  - legal_and_regulatory
  - security_and_custody
  - liquidity_and_market_structure
system_version: <approved-version-or-not-provided>
research_status: <eligible|needs_correction|blocked|insufficient_evidence|stale>
fundamental_status: <no_blocking_red_flags_observed|blocking_red_flags_observed|unknown_or_incomplete>
invalidation_triggers: []
blocking_rule_ids: []
required_corrections: []
missing_evidence: []
residual_risks: []
source_ids: []
next_handoff: <plan_gate|correct_and_research|stop|protective_exit_review>
```

Follow the YAML summary with the thesis, evidence ledger, risk matrix, contradiction analysis, calculations, decision rationale, and source-linked citations. `valid_until` must follow the approved freshness policy and evidence cadence; it does not override a material post-cut-off event, which immediately invalidates the affected `review_scope` until refreshed.

Before any plan pins this research, re-hash the exact immutable snapshot bytes and require equality with the index `content_hash`. A mismatch makes the research `insufficient_evidence` until the index or snapshot is repaired through an audited correction; never rewrite an old snapshot in place.

## Language Guardrails

Prefer calibrated wording:

- `verified by <source> as of <time>`;
- `not identified within the reviewed scope`;
- `evidence was unavailable or contradictory`;
- `this issue maps to system rule <id>`;
- `the conclusion may change after <event or disclosure>`.

Reject wording such as `guaranteed`, `certain winner`, `safe`, `zero risk`, `no fundamental risk`, `监管认可` without a precise official basis, or `audited therefore secure`.

## Validation Checklist

- Asset identity is exact and consistent across sources.
- The as-of timestamp and timezone are explicit.
- Decisive facts use current primary sources.
- Publication, effective, and retrieval dates are not confused.
- Every calculation shows inputs and units.
- Conflicting and missing evidence is visible.
- Blockers cite both evidence and a governing rule.
- Residual and unknown risks remain explicit for `eligible` and `no_blocking_red_flags_observed` results.
- The immutable snapshot path and index entry agree.
- No private credentials, account identifiers, order instructions, or absolute safety claims appear.
