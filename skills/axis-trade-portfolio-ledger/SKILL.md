---
name: axis-trade-portfolio-ledger
description: Use when a user wants to maintain and reconcile a source-aware cross-asset portfolio ledger and exposure view across A-shares, crypto assets, cash, and extensible asset classes. / 用于维护并核对覆盖 A 股、加密资产、现金及可扩展资产类别的跨资产投资台账与风险敞口。
---

# Axis Trade Portfolio Ledger

Use this skill to record, reconcile, value, and summarize a private cross-asset portfolio without converting incomplete or estimated data into false precision. It maintains factual asset state; it does not decide what to buy or sell.

Read [the portfolio ledger contract](references/portfolio-ledger-contract.md) before importing transactions, posting a reconciliation, calculating portfolio totals, or adding an asset class.

## Use This Skill When

- The user wants to record or reconcile accounts, cash, A-share holdings, crypto assets, funds, liabilities, or other investments.
- The user supplies statements, transaction exports, wallet or exchange summaries, deposits, withdrawals, transfers, fees, dividends, staking rewards, or corrections.
- The user asks for portfolio value, cost, realized or unrealized P&L, allocation, concentration, liquidity, custody, currency, or counterparty exposure.
- A new asset class or account needs to be added to the private `.axis/trade` workspace.

Do not use this skill to change trading-system parameters, approve an investment plan, research whether an asset should be purchased, generate a daily news brief, access execution credentials, or place orders.

## Ledger Principles

- The transaction ledger is append-only. Correct an error with a reversal and replacement; never silently rewrite posted history.
- Import batches use the exact lifecycle `staged -> reconciled -> posted`. Allowed terminal or corrective states are `rejected` and `reversed`.
- A valuation is a timestamped observation, not a transaction and not proof of ownership.
- Missing is not zero. Unknown cost, price, currency conversion, quantity, or history stays `unknown` and must not be used to manufacture P&L.
- Use decimal strings for money, price, quantity, rates, fees, and percentages. Use ISO 8601 timestamps with timezone.
- Canonical valuation fields include `valuation_as_of` and `base_currency`; never substitute an undated quote or implicit currency.
- Prevent double counting across accounts, transfers, chains, wrappers, brokers, exchanges, and wallets.

## Private Runtime State

Use the user-selected workspace:

```text
.axis/trade/
  config.yaml
  portfolio/
    accounts.yaml
    assets.yaml
    import-batches/
    ledger.jsonl
    valuations/
    snapshots/
    reconciliations/
  audit/
    events.jsonl
```

Do not create holdings from casual conversation, a daily brief, a watchlist, or an unverified inference. A write requires a direct recording/import request or an already authorized connector. Conflicting or estimated records remain staged until the discrepancy is resolved and, when judgment was required, the user confirms the chosen treatment.

## Workflow

1. Inspect `.axis/trade/config.yaml`, account and asset registries, prior import batches, posted ledger entries, the most recent reconciliation, valuation freshness, and audit history.
2. Establish source provenance and scope: account, asset, period, timezone, currency, statement or connector identity, completeness, and whether transaction history begins before the requested reporting period.
3. Normalize canonical asset IDs, account aliases, event types, quantities, prices, fees, taxes, settlement times, currencies, and transfer links. Never store secrets or expose full private identifiers.
4. Write new input to a `staged` import batch. Detect duplicates, unmatched transfers, missing opening balances, inconsistent signs, unsupported events, stale prices, and account-total discrepancies.
5. Reconcile staged entries against the source statement or authorized snapshot. Mark `reconciled` only when differences are zero within an explicit rounding tolerance or individually explained.
6. Post reconciled entries atomically to the append-only ledger. Generate reversals rather than editing earlier posted entries.
7. Create timestamped valuations and a portfolio snapshot. Separate verified, user-reported, estimated, stale, and unknown values. Exclude protected funding buckets from the trading risk budget.
8. Verify totals, currencies, transfers, cost-basis availability, exposure aggregation, source links, and audit events. Report all unresolved discrepancies and unknowns.

## Asset and Funding Coverage

The core model supports `a_share`, `crypto`, `cash`, `fund`, `bond`, `commodity`, `real_estate`, and `other`, while allowing asset-class-specific attributes without changing common ledger semantics.

At minimum distinguish these funding buckets:

- `trading_capital`
- `long_term_investment`
- `emergency_reserve`
- `living_expense`
- `other`

Only accounts and balances explicitly included in the trading risk budget may be consumed by trading-system or plan calculations. Never silently treat a family reserve or other household reserves as investable capital.

For crypto, include custody type, opaque custody alias, network, lock or staking status, unlock timing, counterparty, withdrawal restrictions, and liquidity metadata when known. Never store private keys, seed phrases, signing material, API secrets, or complete wallet addresses.

## Valuation and Confidence

Every valuation must identify:

- `as_of`, market or source timezone, and price source.
- Quantity source and whether it reconciles to the posted ledger.
- Native currency, base currency, FX rate, FX source, and FX timestamp.
- Valuation method for non-market or illiquid assets.
- Confidence: `verified`, `reported`, `estimated`, or `unknown`.
- Freshness: `fresh`, `stale`, or `missing` under the configured policy.

Do not aggregate an unknown value as zero. Provide a known subtotal plus a clearly separated unknown component. Do not calculate cost-based P&L when opening history or cost basis is incomplete.

## Outputs

Depending on the request, produce:

- A staged import and discrepancy report.
- A reconciliation report with source totals and explained differences.
- Posted immutable ledger entries and audit evidence.
- A timestamped portfolio snapshot showing known and unknown values.
- Allocation and exposure by asset class, account, currency, sector or theme, custody or counterparty, liquidity, funding bucket, and jurisdiction where supported.

Summaries must state the cutoff time, coverage, source quality, reconciliation status, stale inputs, excluded reserves, and any values that remain unknown.

## Public and Private Safety

- Public skill bundles contain only generic schemas, deterministic validators, and synthetic mock examples.
- All actual accounts, balances, transactions, holdings, source documents, opaque aliases, reconciliations, valuations, snapshots, and audit events remain inside the user's private `.axis/trade` workspace.
- Never deposit, commit, publish, or paste private runtime data into public skill maintenance, examples, tests, issue text, or external notifications.
- Redact broker and exchange account identifiers and wallet addresses. Use opaque local aliases.
- Never request or store passwords, tokens, API secrets, private keys, seed phrases, or signing permissions.
- Read-only data authorization does not imply trade-execution authority. Never place orders, transfer assets, withdraw funds, or promise returns.
- No order execution: never execute or place a trade.
- If current prices, FX, legal treatment, or product status materially affect the report, verify them from current authoritative sources and label unavailable evidence.

## Validation

A posted update or portfolio snapshot is valid only when:

- The import batch followed `staged -> reconciled -> posted`.
- Every posted entry has a unique ID, source reference, account, asset, event type, timestamp, decimal quantity, currency treatment, and audit record.
- Duplicate detection and linked-transfer checks pass.
- Source totals reconcile within the recorded tolerance, or every difference remains visibly unresolved.
- Valuations include `as_of`, provenance, confidence, freshness, and FX metadata where applicable.
- Unknown and stale values remain separate from known totals.
- Protected funding buckets are excluded from investable capital unless explicitly configured otherwise.
- Corrections use reversal entries and preserve the original audit history.

If any material check fails, keep the batch staged or mark it `rejected`; do not post it and do not report the portfolio as fully reconciled.

## Three-Step Work Contract

1. Co-create with the user: clarify the requested accounts, assets, reporting cutoff, base currency, funding-bucket treatment, source authority, cost-basis method, privacy boundary, and acceptable reconciliation tolerance.
2. Execute the ledger result: normalize the supplied evidence, stage the import, reconcile it, obtain confirmation where judgment or conflict exists, then post immutable entries and create timestamped valuations or snapshots within `.axis/trade`.
3. Verify the result: prove source-to-ledger totals, duplicate and transfer handling, currency conversion, cost-basis availability, known-versus-unknown separation, reserve exclusion, exposure totals, and audit completeness; report every unresolved gap.

## Light Adversarial Review

Use a constructive adversarial stance for no more than 30% of the interaction. Challenge double counting, missing opening history, stale valuation, unlinked transfers, unsupported cost-basis assumptions, reserve leakage, misleading P&L, hidden custody concentration, and requests to treat estimates as verified facts. Once provenance and reconciliation are sufficient, execute the requested recording work without prolonging debate.

## Model Reasoning Level

Default to `high`. Use `max` for large reconciliation discrepancies, missing opening history that affects total assets or P&L, cross-chain or cross-account transfer ambiguity, reserve classification, liabilities, custody risk, or corrections to posted history. `medium` is acceptable for read-only formatting of an already verified snapshot. Never use `low` to post ledger entries or certify reconciliation.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
