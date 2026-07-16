---
name: axis-ops-ali-dashboard
description: Use when a user asks to create, repair, or validate Alibaba Cloud CloudMonitor/SLS dashboard JSON or SLS drilldowns. / 用于创建、修复或校验阿里云 CloudMonitor/SLS 仪表盘 JSON、下钻动作和监控面板。
---

# Axis Operations Aliyun Dashboard

Produce production-ready dashboard JSON and validation evidence, not screenshots or loose query fragments.

## When to Use

- Create or repair Alibaba Cloud CloudMonitor 2.0 dashboard JSON.
- Validate Prometheus aggregate panels, SLS detail tables, or Logstore drilldowns.
- Diagnose a difference between imported JSON, documented behavior, and the live console.

## Do Not Use

- Do not use for the local Axis document dashboard, generic product analytics, or unrelated Grafana dashboards.
- Do not mutate a live cloud dashboard when the user requested only a JSON artifact or review.
- Do not treat a screenshot or an unvalidated PromQL fragment as the finished output.

## Inputs

- Existing or exported dashboard JSON and the user-visible business wording to preserve.
- Dashboard engine/version, datasource plugins, metric names, SLS project/Logstore/index fields, and variable behavior.
- The failing interaction or required formulas, filters, drilldowns, time-range semantics, and target validation environment.

## Outputs

- One repaired or created dashboard JSON artifact.
- Focused regression tests plus `jq`, local test, and Aliyun schema-validator results.
- A clear note when live import/click behavior remains unverified.

## Safety and Boundaries

- Keep high-cardinality identifiers such as `biz_id` and `trace_id` out of Prometheus labels; use SLS detail tables for instance lookup.
- Keep credentials, tokens, private endpoints, and customer-specific identifiers out of this public skill bundle.
- Preserve the user's titles, labels, formulas, and drilldown meaning. Do not silently replace business semantics with a generic monitoring model.
- Inspect current official documentation and console runtime before asserting that an unstable cloud JSON key is authoritative.

## Three-Step Work Contract

1. Co-create the contract: inspect the real JSON and failure, confirm the engine, data sources, formulas, interaction, and acceptance checks.
2. Execute the artifact: write a failing regression when the defect is reproducible, make the smallest JSON change, and follow the relevant reference contract.
3. Verify the result: parse the JSON, run focused tests and the bundled validator, then distinguish local proof from any remaining live-console check.

## Workflow

1. Read the existing JSON, tests, and exported runtime shape before editing.
2. Use [aliyun-sls-drilldown.md](references/aliyun-sls-drilldown.md) for Logstore drilldowns and [business-flow-dashboard-json.md](references/business-flow-dashboard-json.md) for Prometheus/SLS business-flow dashboards.
3. Keep Prometheus panels aggregate-only and translate technical codes into business-facing labels in SLS SQL when appropriate.
4. When a variable supports multiple business domains, pair total KPI cards with a nearby grouped breakdown.
5. If cloud behavior differs from local proof, re-import and click the affected path; do not guess a replacement key.

## Checks

```bash
jq empty <dashboard.json>
python3 skills/axis-ops-ali-dashboard/scripts/validate_dashboard_json.py <dashboard.json>
```

- Every Logstore drilldown uses the field contract in the reference, including the correct indexed field name.
- Full `trace_id` drilldowns are not accidentally restricted to business-flow-only logs.
- All KPI formulas use the same event population and time range; multi-select totals have an explainable grouped breakdown.
- Detail identifiers render as strings, and project-local regression tests cover the previously failing JSON keys.

## Light Adversarial Review

Keep challenge and critique to no more than 30% of the interaction. Verify datasource assumptions, cardinality, time populations, field names, and live-console drift; once the evidence is sufficient, make and validate the JSON change decisively.

## After Use Deposition

Check whether the work exposed a reusable dashboard rule, cloud-console quirk, validation check, or script correction. If yes, update this bundle, validate it, refresh the local copy, and push only when authorized. Otherwise report that no skill update is needed.
