# Market and Pricing Evidence

Use this reference to build a current, auditable market snapshot and to calculate SKU prices before any merchandising judgment or App edit.

## Evidence catalog

Each evidence item must contain:

```json
{
  "evidence_id": "stable-id",
  "source_class": "doudian_app | official_rule | first_party_market | public_comparison",
  "query": "sanitized query or in-App navigation path",
  "url_or_app_reference": "direct URL or exact App page label",
  "accessed_at": "RFC3339",
  "observed_period": "when the underlying fact applies",
  "supported_facts": [],
  "limitations": []
}
```

For a publish run, use at least one current in-App signal and one current public source. After current App evidence verifies operated categories and qualifications, independently exhaust: `商机中心` tabs `追抖音热词` and `跟潜力爆品`; `商品管理` area `发布潜力商品`; and `源头好货` sections `抖音爆款榜` and `热搜商机` with `流量扶持` when shown. Route A/B products obtain offers through `找货源`; Route C cards already represent source-backed candidates. Prefer official platform rules and first-party/public market sources. Third-party pages are comparison samples, not market-wide truth.

Default freshness is 24 hours for visible price, stock, sales badge, promotion, keyword, and supplier-operating signals, and 7 days for platform rules only when the official page shows no newer revision. A run may set a stricter policy. If freshness cannot be established, label the evidence stale and stop publication.

Never infer search volume, market share, conversion, trend magnitude, or competitor sales from search ordering or a small sample. Keep public queries generic; exclude shop identity, internal product IDs, private margins, customer data, and unpublished performance.

## Unit economics

Calculate each SKU independently with one currency and explicit units.

```text
landed_cost = supply_price + inbound_or_supplier_freight + packaging + other_fixed_fulfillment

expected_after_sale_loss = return_probability * nonrecoverable_loss_per_return

fixed_per_order = landed_cost + expected_after_sale_loss + other_fixed_per_order

variable_rate = platform_rate + payment_rate + affiliate_rate + traffic_rate
              + promotion_rate + tax_rate + other_percentage_rate

contribution_floor_price = (fixed_per_order + minimum_absolute_contribution) / (1 - variable_rate)

margin_floor_price = fixed_per_order / (1 - variable_rate - minimum_margin_rate)

price_floor = max(contribution_floor_price, margin_floor_price)

estimated_contribution = proposed_price * (1 - variable_rate) - fixed_per_order

estimated_margin = estimated_contribution / proposed_price
```

Do not count a fee in both `landed_cost` and `variable_rate`. Rates must be decimals between 0 and 1, and their sum must be below 1. Unknown required cost, rate, return loss, or freight stays unknown; it is not silently set to zero.

The deterministic calculator owns arithmetic. Sol/xhigh reviews assumptions, market fit, supplier quality, sensitivity, and risk; it must not replace a missing input with a guess.

For a fully automatic run with no user-supplied profit target, use a default minimum stress-case buffer of both CNY 3 contribution per completed order and 10% contribution margin. Use the more conservative price floor. Sol/xhigh may raise either target when category, supplier, return, or market evidence warrants it, but may not lower the default. If `1 - variable_rate - minimum_margin_rate` is not positive, the SKU fails.

Build the stress case from current upper-bound or adverse-but-evidenced freight, platform/payment/affiliate/promotion fees, discounts, tax, return probability, and nonrecoverable after-sale loss. Every required cost must be known or conservatively bounded. Because future demand, refunds, rule changes, and operations cannot be guaranteed, describe this as a conservative positive-profit gate, never as an absolute guarantee of no loss.

## Source merchant gate

Before pricing or publishing, reconcile the source merchant and offer using current App evidence:

- stable supplier/offer identity, normal platform status, and no unresolved platform warning;
- required business/category qualifications and brand authorization when applicable;
- product quality/rating with sample size, supplier quality, supplier return rate, product return rate, on-time dispatch, dispatch promise, stock, freight, restricted regions, support/guarantees, and after-sales terms;
- comparison with same-product suppliers and same-category norms available in the current run;
- no material mismatch across title, images, category, SKU identity, price, inventory, shipping, or qualifications.

Missing material evidence fails the supplier gate. Sol/xhigh makes the contextual accept/reject judgment and records evidence references; a high sales badge or a single good review cannot substitute for the gate.

## Per-SKU record

For every source SKU, retain:

- stable SKU/offer identity and literal variant attributes;
- source stock and captured time;
- supply price, freight, packaging, fee assumptions, and expected_after_sale_loss;
- calculated `landed_cost`, `price_floor`, proposed price, contribution, and margin;
- current comparable market band with evidence IDs;
- include/exclude decision and reason;
- sensitivity at the high fee/high return and low market-price boundaries.

Exclude a SKU from publication when stock is zero or unknown, identity conflicts with the product, it is only an accessory/sample/deposit, it depends on an unsupported claim, or its required price is outside a viable evidenced market band.

## Low-price SKU integrity

Detect low-price SKU / 低价 SKU manipulation before opening the listing form:

- the lowest displayed price must be attached to an in-stock, orderable, complete, representative product;
- a zero-stock, irrelevant, tiny-size, accessory, sample, deposit, replacement part, or misleading variant cannot establish the price range;
- source-synchronized variants must not be renamed to obscure what the buyer receives;
- if the lowest representative SKU is unprofitable at its price floor, raise the price or exclude the product; never invent a bait SKU;
- compare price-range width and variant identity in final review and again after the App read-back.

## Market decision boundaries

- Selection needs store/category fit plus supplier, fulfillment, return, stock, qualification, and economics evidence; sales volume alone is insufficient.
- Keywords may describe only evidenced category, material, feature, audience, or scenario facts. A frequent competitor phrase is not proof of a product attribute.
- Copy must map each substantive claim to evidence and remove unsupported superlatives, absolutes, medical/health efficacy, brand authorization, origin, material, durability, `耐咬`, or `洁齿` claims.
- Pricing should sit within the evidenced comparable band unless the final review explains a verifiable differentiation. Below-floor prices or prices that miss either default stress buffer fail even if the market is cheaper.
- Promotion room is real only if the post-discount price still clears the price floor under the applicable fee and return assumptions.

## Pre-publication evidence check

Immediately before automatic publication, re-read stock, source cost, supplier/dispatch promise, restrictions, and the final price fields. Store the latest `accessed_at`. Any material change invalidates upstream pricing/final review and requires recalculation; no user confirmation is required after the gates pass again.
