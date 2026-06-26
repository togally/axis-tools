# Business-Flow Dashboard JSON Pattern

Use this reference when the dashboard monitors business flows such as merchant application, approval, fulfillment, payment, or other multi-stage processes.

## Session Lessons To Preserve

The dashboard should answer business questions first:

- How many business events happened in the selected time range?
- How many are still processing?
- How many ended abnormally?
- What is the completion rate?
- Which concrete `biz_id` or `trace_id` should I open in SLS to investigate?

Do not make the dashboard audit-specific unless the user explicitly scopes it to audit. Use generic names such as `业务事件数`, `处理中事件`, `异常事件数`, `事件完结率`, `业务发起趋势`, and `业务实例明细（BizId 下钻）`.

## Data Split

Use Prometheus for low-cardinality aggregate metrics only:

- flow or business domain;
- status/result buckets;
- stage groups if cardinality is bounded.

Use SLS for drilldown detail:

- `biz_id`;
- `trace_id`;
- translated stage names;
- translated error codes;
- cost or latency fields;
- raw log lookup through SLS, not by dumping large raw log text into the dashboard table.

Never put `biz_id` or `trace_id` into Prometheus labels.

## Top Metrics

The user's business invariant is:

```text
业务事件数 = 处理中事件 + 异常事件数 + 已完成事件数
```

Completion rate should be a percentage, not a decimal:

```text
事件完结率 = 已完成事件数 / 业务事件数 * 100
```

Make all top panels use the same time-range population as the trend panel. Do not mix an instant current-state metric with a time-range event trend unless the UI explicitly labels the difference.

## Prometheus Query Guidelines

For counter-like business events in arbitrary dashboard ranges:

- prefer range-aware expressions using `$__range` and `$__interval`;
- avoid fixed `start`, `end`, or `timeSpanType` on Prometheus panels so global time filters work;
- avoid `increase()` if the backend renders misleading fractional or missing values for sparse counters;
- use `offset $__interval`, `unless`, and `clamp_min(current - previous, 0)` when reconstructing per-step increments;
- use `sum_over_time(...[$__range:$__interval])` for range totals;
- use `sum by (flow)` for top bar charts grouped by business domain;
- use a real time-series chart with `xAxisOption.timeRangeMode = "searchTime"` for trends.

For business starts, define a bounded start-stage matcher:

```text
apply_submit_create|.*_submit_create|.*_start|.*_start_create
```

Adjust the matcher to the target domain instead of hard-coding an audit-only stage.

## SLS Detail Table Guidelines

Use `Logstore(SQL)` or the equivalent SLS SQL data source, not Prometheus, for detail rows.

Translate technical fields in the SQL:

```sql
CASE regexp_extract(message, 'flow=([^ ]+)', 1)
  WHEN 'merchant_apply' THEN '商户申请业务'
  ELSE regexp_extract(message, 'flow=([^ ]+)', 1)
END AS "业务领域"
```

For large identifiers, force string display so the console does not render them as floating-point numbers. A practical pattern is to emit a searchable string:

```sql
concat('biz_id=', regexp_extract(message, 'biz_id=([^ ]+)', 1)) AS "biz_id"
```

Then the drilldown can use:

```text
business_flow_stage and ${{biz_id}}
```

For trace IDs, keep the display column named `trace_id` and drill down with the SLS field:

```text
business_flow_stage and trace_id:${{trace_id}}
```

## Visual Guidelines

- Use Chinese labels for business users.
- Use bar gauge or compact bar panels for top metrics grouped by business domain.
- Keep bars thin enough for multiple business domains.
- Show values on the bars when the platform supports it.
- Keep diagnostic red/green panels out of the final dashboard.
- Keep explanatory markdown panels out of the final dashboard unless the user asks for documentation in the dashboard.

## Red-Green Verification

When cloud behavior disagrees with the JSON:

1. Write a failing test for the exact JSON contract.
2. Confirm it fails before changing JSON.
3. Make the smallest JSON change.
4. Run local tests and JSON validation.
5. Re-import the dashboard and click the affected UI path.

This is especially important for Aliyun dashboard JSON because UI labels and imported JSON field names can differ.
