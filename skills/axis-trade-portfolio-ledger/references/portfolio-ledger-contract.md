# Cross-Asset Portfolio Ledger Contract

This reference defines the public-safe state contract used by `axis-trade-portfolio-ledger`. Real portfolio data is private; all examples below are synthetic.

## Canonical Runtime Layout

```text
.axis/trade/
  config.yaml
  portfolio/
    accounts.yaml
    assets.yaml
    import-batches/
      <batch-id>.yaml
    ledger.jsonl
    valuations/
      <valuation-id>.yaml
    snapshots/
      <snapshot-id>.yaml
    reconciliations/
      <reconciliation-id>.yaml
  audit/
    events.jsonl
```

Canonical state uses ISO 8601 timestamps with timezone and decimal strings. Human-readable tables are derived views. Writes must be atomic, and posted ledger history is append-only.

## Canonical IDs

Use stable, non-secret identifiers:

```text
account_id: ACC-<opaque-local-id>
asset_id for A-shares: a_share:<exchange>:<ticker>
asset_id for native crypto: crypto:<network>:native:<symbol>
asset_id for tokens: crypto:<network>:token:<normalized-contract-or-public-alias>
asset_id for cash: cash:<ISO-4217-currency>
transaction_id: TX-<source-or-generated-id>
batch_id: IMP-YYYYMMDD-NNN
valuation_id: VAL-YYYYMMDD-NNN
snapshot_id: SNAP-YYYYMMDD-NNN
```

Use the registry's exact `asset_id` unchanged in research, plans, briefs, ledger entries, valuations, and snapshots. Preserve A-share leading zeroes and use the official exchange code such as `SSE`, `SZSE`, or `BSE`. Do not put a full brokerage account number, exchange UID, wallet address, private contract alias, or personal name in an ID. A public token contract may be normalized as the instrument identifier; a private wallet address may not.

## Account Registry

```yaml
schema_version: "1"
accounts:
  - account_id: "ACC-MOCK-001"
    label: "Synthetic account"
    account_type: "broker|exchange|wallet|bank|fund|other"
    asset_classes: ["a_share"]
    base_currency: "CNY"
    jurisdiction: "example"
    funding_bucket: "trading_capital"
    include_in_total_assets: true
    include_in_trading_risk_budget: true
    custody_type: "broker_custody|centralized_exchange|self_custody|bank|other"
    counterparty_alias: "COUNTERPARTY-MOCK"
    source_authority: "statement|authorized_connector|user_reported"
    verified_at: null
    status: "active|closed|unknown"
```

Funding buckets:

```text
trading_capital
long_term_investment
emergency_reserve
living_expense
other
```

`include_in_trading_risk_budget` must never be inferred from account type or balance size.

## Asset Registry

```yaml
schema_version: "1"
assets:
  - asset_id: "a_share:mock-exchange:000000"
    asset_class: "a_share"
    symbol: "000000"
    display_name: "Synthetic asset"
    venue_or_network: "mock-exchange"
    native_currency: "CNY"
    jurisdiction: "example"
    instrument_type: "equity"
    identifiers: {}
    attributes:
      board: "mock-board"
      industry: "mock-industry"
    status: "active|delisted|suspended|unknown"
    source_refs: []
```

Supported core classes are `a_share`, `crypto`, `cash`, `fund`, `bond`, `commodity`, `real_estate`, and `other`. Extension attributes must not replace common identity, currency, source, and status fields.

Crypto attributes may include:

```yaml
network: "mock-network"
contract_alias: "CONTRACT-MOCK"
custody_alias: "CUSTODY-MOCK"
staking_status: "none|liquid|locked|unknown"
unlock_at: null
withdrawal_status: "available|restricted|suspended|unknown"
counterparty_alias: "COUNTERPARTY-MOCK"
```

Never store signing material, secrets, or complete private identifiers.

## Import Batch

```yaml
schema_version: "1"
batch_id: "IMP-YYYYMMDD-NNN"
status: "staged|reconciled|posted|rejected|reversed"
source:
  kind: "statement|authorized_connector|user_reported"
  source_ref: "opaque-reference"
  period_start: "..."
  period_end: "..."
  obtained_at: "..."
  timezone: "Asia/Shanghai"
scope:
  account_ids: []
  currencies: []
history_complete: false
opening_balance_available: false
entries: []
duplicate_findings: []
transfer_findings: []
discrepancies: []
reconciliation_id: null
posted_at: null
```

Exact primary lifecycle:

```text
staged -> reconciled -> posted
```

Alternative transitions:

```text
staged -> rejected
reconciled -> staged
reconciled -> rejected
posted -> reversed
```

A posted batch is never edited. Its correction is a new batch containing reversal and replacement entries.

## Ledger Entry

Each line in `ledger.jsonl` is one immutable JSON object with at least:

```json
{
  "schema_version": "1",
  "transaction_id": "TX-MOCK-001",
  "batch_id": "IMP-YYYYMMDD-NNN",
  "account_id": "ACC-MOCK-001",
  "asset_id": "a_share:mock-exchange:000000",
  "event_type": "BUY",
  "trade_at": "2026-01-01T10:00:00+08:00",
  "settle_at": "2026-01-02T00:00:00+08:00",
  "quantity": "100",
  "price": "10.00",
  "trade_currency": "CNY",
  "gross_amount": "1000.00",
  "fee_amount": "1.00",
  "tax_amount": "0.00",
  "cash_effect": "-1001.00",
  "source_ref": "opaque-reference",
  "linked_transaction_id": null,
  "reverses_transaction_id": null,
  "confidence": "verified"
}
```

Core event types:

```text
BUY
SELL
DEPOSIT
WITHDRAWAL
TRANSFER_IN
TRANSFER_OUT
FEE
TAX
DIVIDEND
INTEREST
STAKING_REWARD
AIRDROP
SPLIT
MERGER
OPENING_BALANCE
VALUATION_ADJUSTMENT
REVERSAL
OTHER
```

Transfers require linked outbound/inbound entries when both sides are in scope. A transfer is not income, profit, a deposit, or a withdrawal from the total portfolio.

## Reconciliation

```yaml
schema_version: "1"
reconciliation_id: "REC-YYYYMMDD-NNN"
batch_id: "IMP-YYYYMMDD-NNN"
status: "balanced|discrepant|incomplete"
as_of: "..."
tolerance:
  currency: "CNY"
  amount: "0.01"
source_totals: {}
ledger_totals: {}
differences: []
unmatched_transfers: []
duplicate_candidates: []
missing_opening_history: []
assumptions: []
confirmed_by: null
confirmed_at: null
```

Only `balanced`, or a record whose every non-zero difference is individually resolved and approved, may advance a batch to `reconciled`. `incomplete` must keep affected cost, P&L, and total fields unknown.

## Valuation

```yaml
schema_version: "1"
valuation_id: "VAL-YYYYMMDD-NNN"
as_of: "2026-01-01T15:00:00+08:00"
account_id: "ACC-MOCK-001"
asset_id: "a_share:mock-exchange:000000"
quantity: "100"
quantity_source: "reconciled_ledger"
unit_price: "10.00"
price_currency: "CNY"
price_source: "mock-source"
price_as_of: "2026-01-01T15:00:00+08:00"
base_currency: "CNY"
fx_rate: "1"
fx_source: "identity"
fx_as_of: "2026-01-01T15:00:00+08:00"
market_value: "1000.00"
valuation_method: "market_price"
confidence: "verified|reported|estimated|unknown"
freshness: "fresh|stale|missing"
source_refs: []
```

Valuation methods may include `market_price`, `statement_value`, `independent_appraisal`, `model_estimate`, and `unknown`. A model estimate must never be labeled verified.

## Portfolio Snapshot

```yaml
schema_version: "1"
snapshot_id: "SNAP-YYYYMMDD-NNN"
as_of: "..."
base_currency: "CNY"
coverage:
  account_ids: []
  included_asset_ids: []
  missing_asset_ids: []
known_totals:
  gross_assets: "0"
  liabilities: "0"
  net_assets: "0"
  investable_assets: "0"
  trading_risk_budget_assets: "0"
unknown_components: []
excluded_funding_buckets:
  - "emergency_reserve"
  - "living_expense"
exposures:
  by_asset_class: {}
  by_account: {}
  by_currency: {}
  by_sector_or_theme: {}
  by_custody_or_counterparty: {}
  by_liquidity: {}
reconciliation_status: "balanced|discrepant|incomplete"
stale_inputs: []
source_refs: []
content_hash: "sha256:..."
```

Known totals must not absorb unknown components. Report them as “known subtotal plus unknown items,” not as a complete total.

## Cost and P&L Rules

- Record the configured cost-basis method and jurisdiction context; do not invent a universal accounting or tax method.
- If opening lots or transaction history are incomplete, set cost basis, realized P&L, or unrealized P&L to `unknown` for affected assets.
- Fees and taxes must be included consistently with the configured method.
- Corporate actions, token migrations, wraps, bridges, and chain transfers need explicit linkage so they do not create artificial gains, losses, deposits, or duplicate assets.
- Report realized and unrealized P&L separately and identify valuation cutoff.

## Exposure Rules

Where data permits, calculate exposure by:

- Asset class and instrument.
- Account and funding bucket.
- Currency and jurisdiction.
- Sector, industry, theme, or correlated driver.
- Custody, exchange, protocol, bridge, chain, or other counterparty.
- Liquidity, lockup, staking, withdrawal, or settlement status.

Do not infer correlation or liquidity from asset labels alone. Label unsupported dimensions as unknown.

## Audit Event

Append one event per staging, reconciliation, posting, reversal, valuation, and snapshot action. Include event ID, actor, timestamp, entity ID, source reference, before/after hashes where applicable, result, and discrepancy summary. Audit history is append-only.

## Privacy Boundary

Public bundle:

- Generic contract, validators, and synthetic fixtures.

Private `.axis/trade` runtime:

- Accounts, balances, holdings, statements, transaction sources, opaque aliases, valuations, snapshots, reconciliations, and audit events.

Never place credentials, private keys, seed phrases, signing data, complete wallet addresses, full account identifiers, or unredacted statements in either public examples or canonical runtime files. Credentials belong in an approved secret store outside this contract.
