---
name: axis-ali-dashboard
description: Generate, repair, and validate Alibaba Cloud CloudMonitor/SLS dashboard JSON for business-facing observability dashboards. Use when a user asks to create or modify dashboard JSON, fix Aliyun SLS drilldown actions, add bizId/traceId drilldowns, align Prometheus aggregate panels with SLS detail tables, or troubleshoot imported dashboard JSON whose filters, time range, labels, or drilldowns do not work.
---

# Axis Dashboard JSON

Use this skill to produce production-ready dashboard JSON, not screenshots or loose PromQL snippets. The common target is an Alibaba Cloud CloudMonitor 2.0 dashboard that combines low-cardinality Prometheus metrics with SLS Logstore detail tables.

## Workflow

1. Read the existing dashboard JSON, tests, and any pasted exported JSON before editing.
2. Identify the dashboard engine and datasource plugins. For Alibaba Cloud CloudMonitor/SLS dashboards, use the field contracts in `references/aliyun-sls-drilldown.md`.
3. Preserve business semantics first: titles, labels, formulas, and drilldown behavior must match the user's wording.
4. Keep Prometheus panels aggregate-only. Do not put high-cardinality IDs such as `biz_id` or `trace_id` into Prometheus labels.
5. Put instance lookup and down-drill data in an SLS table panel. Use Logstore SQL to translate technical codes into business-facing Chinese labels when the dashboard is for business users.
6. Write or update tests before changing JSON when the failure is already visible. At minimum, test the exact JSON keys that previously broke.
7. Validate the JSON with `jq empty`, run the local tests, then use `scripts/validate_dashboard_json.py` for Aliyun drilldown schema checks.
8. If the user reports cloud behavior differs from tests, inspect official docs and the loaded console runtime before guessing a JSON key.

## Required Checks

For Alibaba Cloud SLS drilldowns:

- Use `settings.searchFilter`, not `settings.filter`.
- Include `settings.type: "logstore"` for Logstore drilldowns so the target receives a `queryString`.
- Use `settings.blank: false` when the user wants the SLS view opened in the same console surface.
- Use `settings.timeRange: -1` to inherit the dashboard time range.
- Use `settings.filterInherit: true` when dashboard filters should carry over.
- Match SLS indexed field names exactly. If the table column is `trace_id`, the drilldown should use `trace_id:${{trace_id}}`, not `traceId:${{trace_id}}`.

## References

- Read `references/aliyun-sls-drilldown.md` before editing Alibaba Cloud drilldown events.
- Read `references/business-flow-dashboard-json.md` before building a business-flow style dashboard with Prometheus aggregates plus SLS detail rows.

## Validation

Run:

```bash
jq empty <dashboard.json>
python3 skills/axis-ali-dashboard/scripts/validate_dashboard_json.py <dashboard.json>
```

For business-flow dashboards, also add or run project-local tests that assert:

- top metrics and trend formulas use the global time range;
- event totals, running, exception, completed, and completion-rate formulas use the same event population;
- detail table columns keep identifiers as strings;
- SLS drilldown conditions carry `biz_id` and `trace_id` correctly.
