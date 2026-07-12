# Alibaba Cloud SLS Drilldown Pattern

Use this reference for CloudMonitor 2.0 dashboard JSON that opens SLS Logstore pages from a table cell.

## Product Semantics

Alibaba Cloud SLS drilldown events support opening a LogStore, inheriting dashboard filters, inheriting or setting a time range, and adding a filter statement. The official documentation describes the UI behavior: the filter statement is synchronized to the target LogStore and added before the query with `AND`; variables use `${{field_name}}` syntax.

Documentation URL:

```text
https://help.aliyun.com/zh/sls/drill-down-events
```

## JSON Contract Observed In CloudMonitor Runtime

For imported JSON, the Logstore drilldown editor stores the filter statement as `searchFilter`.

Use this shape:

```json
{
  "type": "logstore",
  "label": "按 BizId 打开 SLS",
  "settings": {
    "project": "example-sls-project",
    "logstore": "example-logstore",
    "title": "按 BizId 打开 SLS",
    "type": "logstore",
    "blank": false,
    "timeRange": -1,
    "filterInherit": true,
    "searchFilter": "business_flow_stage and ${{biz_id}}"
  }
}
```

For full technical trace drilldown, use the trace value by itself so SLS can search the whole log set. Do not prefix it with `business_flow_stage`; that would restrict the jump to business-flow node logs only:

```json
{
  "type": "logstore",
  "label": "按 TraceId 打开 SLS",
  "settings": {
    "project": "example-sls-project",
    "logstore": "example-logstore",
    "title": "按 TraceId 打开 SLS",
    "type": "logstore",
    "blank": false,
    "timeRange": -1,
    "filterInherit": true,
    "searchFilter": "${{trace_id}}"
  }
}
```

If the target is intentionally a business-flow-only table, `business_flow_stage and trace_id:${{trace_id}}` can be valid, but do not use that shape for a user request that asks for the complete technical trace.

## Why These Keys Matter

The console runtime calls `handleSearchFilter(settings.type, settings.searchFilter, variables, settings.blank)`.

- When `settings.type === "logstore"`, the runtime emits `queryString`.
- When `settings.type` is absent or different, the runtime emits `filters`; the SLS search box may appear empty or unfiltered.
- `filter` is not the editor field. It imports without obvious failure but does not populate the target search condition.
- `blank: false` opens a drawer or in-console panel rather than a new page.

## Regression Tests To Add

Assert all of these for every `logstore` drilldown action:

```python
assert settings["type"] == "logstore"
assert settings["blank"] is False
assert settings["timeRange"] == -1
assert settings["filterInherit"] is True
assert "searchFilter" in settings
assert "filter" not in settings
assert "query" not in settings
```

For trace rows:

```python
assert settings["searchFilter"] == "${{trace_id}}"
assert "business_flow_stage" not in settings["searchFilter"]
```

## Debugging Imported Dashboards

If an imported dashboard opens SLS but loses the condition:

1. Check the exported JSON, not only the UI.
2. Confirm `settings.searchFilter` exists.
3. Confirm `settings.type` exists and equals `logstore`.
4. Confirm the field name in the condition matches an SLS indexed field.
5. Re-import and manually click a row to verify the query box is populated.
6. If behavior still differs, inspect the currently loaded CloudMonitor console bundle because Aliyun can change internal JSON keys without changing the UI docs.
