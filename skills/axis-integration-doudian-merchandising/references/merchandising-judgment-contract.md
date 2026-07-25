# Merchandising Judgment Contract

This contract is mandatory for every non-deterministic decision made by the skill. The root agent gathers evidence, removes private data, validates schemas, performs deterministic arithmetic, and controls the App. It does not replace the required expert judgment.

## Fixed execution target

- `fork_turns`: `none`
- `model`: `gpt-5.6-sol`
- `reasoning_effort`: `xhigh`
- fallback: forbidden

Run five bounded delegations named `selection`, `keyword`, `copy`, `pricing`, and `final_review`. If the fixed target is unavailable, times out, or does not return a valid contract, record `blocked_model_requirement` and stop before modifying or publishing the product.

## Trusted model input

Send one JSON object named `model_input`. Use stable IDs and public-safe summaries; do not send credentials, cookies, customer data, private shop identifiers, or oracle fields.

```json
{
  "task": "selection | keyword | copy | pricing | final_review",
  "shop_profile": {
    "category_discovery": {
      "verified_categories": [],
      "qualification_evidence_refs": [],
      "captured_at": "RFC3339"
    },
    "positioning": [],
    "allowed_categories": [],
    "blocked_categories": [],
    "current_price_bands": [],
    "explicit_constraints": []
  },
  "policy": {
    "marketplace_limits": [],
    "qualification_requirements": [],
    "claim_restrictions": [],
    "inventory_policy": ""
  },
  "opportunity_ledger": [
    {
      "entry_route": "merchant_center | product_management | source_goods",
      "section_label": "literal App label",
      "discovery_refs": [],
      "source_offer_refs": []
    }
  ],
  "candidate_offers": [],
  "market_snapshot": {
    "captured_at": "RFC3339",
    "evidence": []
  },
  "unit_economics": {
    "currency": "CNY",
    "fee_assumptions": [],
    "target_contribution": null
  },
  "upstream_outputs": [],
  "requested_output_schema": "merchandising_judgment_v1"
}
```

Every factual input must carry an `evidence_id` or be labeled `user_constraint`. Preserve missing values as `null`; never ask the model to estimate a missing fee, qualification, stock level, or supplier metric.

## Required output

Return strict JSON only. `status` describes the requested task, not whole-run publication readiness. Evaluate only the gates applicable to that task and its supplied upstream artifacts; use `not_evaluated` instead of treating absent downstream work as a failure. The task-specific result belongs under its matching key; the other task keys may be `null`.

```json
{
  "schema_version": "merchandising_judgment_v1",
  "task": "selection | keyword | copy | pricing | final_review",
  "status": "pass | needs_more_data | reject",
  "assortment_decision": null,
  "keyword_analysis": null,
  "listing_copy": null,
  "pricing_decision": null,
  "final_review": null,
  "publication_gate": {
    "decision": "auto_publish | block | not_evaluated",
    "supplier_gate": "pass | fail | not_evaluated",
    "profitability_gate": "pass | fail | not_evaluated",
    "blocking_reasons": []
  },
  "evidence_refs": [],
  "assumptions": [],
  "hard_failures": [],
  "warnings": [],
  "missing_inputs": [],
  "confidence": "low | medium | high"
}
```

Task payload requirements:

- `assortment_decision`: ranked candidate IDs, selection/rejection, shop-fit rationale, supplier/product quality, fulfillment, return risk, economics feasibility, and compliance gate results.
- `assortment_decision` must account for all three independent entry routes: `商机中心` tabs `追抖音热词` and `跟潜力爆品`; `商品管理` area `发布潜力商品`; and `源头好货` sections `抖音爆款榜` and `热搜商机`. Route A/B candidates require a `找货源` mapping; Route C candidates require directly evidenced supplier/offer facts.
- `keyword_analysis`: core, attribute, scenario, long-tail, excluded, risky, and unsupported terms; each retained term includes evidence references and intended placement.
- `listing_copy`: title, guide short title, introduction, factual bullet points, attribute/media recommendations, removed claims, character checks, and evidence mapping for every substantive claim.
- `pricing_decision`: per-SKU identity, stock, landed cost, expected after-sale loss, variable rate, base/stress floors, market band, proposed price, base/stress contribution and margin, promotion room, sensitivity cases, and exclusions.
- `final_review`: joined-plan decision, supplier gate, conservative profitability gate, publication gate, detected inconsistencies, and the exact material fields whose later change requires recalculation before automatic publication.
- `publication_gate`: isolated `selection`, `keyword`, `copy`, or `pricing` tasks set `decision`, `supplier_gate`, and `profitability_gate` all to `not_evaluated`; `final_review` returns `auto_publish` only when every required delegation and App/evidence/supplier/profitability gate passes, otherwise `block`. It is executable by the root agent without a further user confirmation only during an explicit full-auto invocation. A user-authorized automatic traffic-price exception does not change this contract result: missing cost or market-band inputs remain a `block`, and the root may act only under the separately documented run-level automatic exception after its warning and explicit current-run authorization; no per-source confirmation is required.

## Hard gates

Evaluate all hard gates before ranking, copywriting, or price recommendation. Return task-local `reject` or `needs_more_data` with a non-empty `hard_failures` list when any of these apply. A removable claim or excludable SKU may be cured for the remaining product only when the output records the removal/exclusion and no product-level hard failure remains.

- category or qualification cannot be verified from current App evidence, category mismatch, restricted good, unresolved qualification, unauthorized brand, counterfeit risk, or source identity conflict;
- an applicable entry route or section is not exhausted, an eligible same-category product is silently omitted, a Route A/B candidate lacks a `找货源` mapping, or a Route C candidate from `抖音爆款榜`/`热搜商机` lacks directly evidenced supplier/offer facts;
- required evidence is missing, untraceable, stale under the run policy, or a market claim cannot be bound to a reference; absent a stricter run policy, use 24 hours for price/stock/opportunity/supplier signals and 7 days for official rules whose page shows no newer revision;
- all relevant stock is zero/unknown, or a proposed included SKU is unrelated, zero-stock, sample-only, deposit-only, accessory-only, or misleading;
- the lowest displayed price does not represent an in-stock complete product or appears designed only to create a low-price range;
- a title or introduction uses unsupported absolute, medical, health, veterinary, efficacy, durability, authorization, origin, material, or brand claims, including `耐咬` or `洁齿` without evidence;
- the price is below the deterministic stress-case price floor, required costs are unknown or unbounded, fees are double-counted, stress contribution misses the required buffer, or the target economics cannot be evaluated; calculate the floor as the maximum of `(stress_fixed_cost + minimum_absolute_contribution) / (1 - stress_variable_rate)` and `stress_fixed_cost / (1 - stress_variable_rate - minimum_margin_rate)`;
- supplier identity, platform status, quality signals, return performance, dispatch performance, shipping, restricted-region, after-sales, or qualification facts are missing, unacceptable, or conflict with the prepared listing; a platform warning, abnormal status, missing required qualification, identity conflict, or unresolved material underperformance against the current same-category comparison set fails the supplier gate;
- during `final_review`, any of the five required delegations is missing or used a model/effort other than the fixed target.

A score, high sales figure, bestseller badge, positive review, or platform recommendation never overrides a hard gate.

## Evaluation protocol

Use `references/merchandising-evaluation-cases.json` as public-safe diagnostic material. Keep every `oracle` hidden from model input. Reject any harness that copies `ORACLE_ONLY_SENTINEL` into `model_input`.

Compare at least these prompt candidates when changing the judgment contract:

1. `baseline`: direct evidence-bound request using the schema above.
2. `challenger-a-gate-first`: require hard-gate evaluation before ranking or writing copy.
3. `challenger-b-adversarial`: require an explicit attempt to disprove the attractive candidate, keyword, copy, and lowest-price SKU.

The current production pattern is `challenger-a-gate-first`: apply task-local hard gates before ranking, copy, or pricing, and reserve the stronger adversarial disproof for `final_review`. The diagnostic comparison found this pattern preserved safe task-local passes while blocking incomplete pricing and supplier evidence; baseline and fully adversarial variants more often conflated task completion with whole-run readiness. Re-evaluate after any schema or gate change.

Score schema compliance, evidence grounding, hard-gate recall, SKU integrity, arithmetic consistency, supplier safety, claim safety, and actionability. Any leaked oracle, unsupported claim, below-floor price, failed stress profit buffer, unresolved supplier, zero-stock inclusion, model fallback, or false automatic-publish recommendation is a hard failure.

These cases support prompt iteration only. Do not claim cross-model robustness or production accuracy without a frozen blind holdout and an explicitly recorded model matrix.
