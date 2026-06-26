#!/usr/bin/env python3
"""Validate common Alibaba Cloud dashboard JSON contracts.

This linter focuses on failure modes that are easy to miss during import:
SLS drilldown filters silently using the wrong key, missing logstore type,
and high-cardinality identifiers leaking into Prometheus queries.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def walk(value: Any) -> list[Any]:
    items = [value]
    if isinstance(value, dict):
        for child in value.values():
            items.extend(walk(child))
    elif isinstance(value, list):
        for child in value:
            items.extend(walk(child))
    return items


def iter_chart_queries(dashboard: dict[str, Any]) -> list[dict[str, Any]]:
    queries: list[dict[str, Any]] = []
    for chart in dashboard.get("charts", []):
        search = chart.get("search", {})
        for query in search.get("chartQueries", []):
            if isinstance(query, dict):
                queries.append(query)
    return queries


def iter_action_events(dashboard: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
    events: list[tuple[str, str, dict[str, Any]]] = []
    for chart in dashboard.get("charts", []):
        chart_title = str(chart.get("title", "<untitled>"))
        options = chart.get("display", {}).get("options", {})
        for action in options.get("actionOptions", []):
            matcher = action.get("matcher", {}).get("options", "<unknown>")
            for event in action.get("events", []):
                if isinstance(event, dict):
                    events.append((chart_title, str(matcher), event))
    return events


def validate_logstore_drilldowns(dashboard: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for chart_title, matcher, event in iter_action_events(dashboard):
        if event.get("type") != "logstore":
            continue
        settings = event.get("settings")
        prefix = f"{chart_title}:{matcher}"
        if not isinstance(settings, dict):
            errors.append(f"{prefix}: logstore event is missing settings")
            continue
        if "filter" in settings:
            errors.append(f"{prefix}: use settings.searchFilter, not settings.filter")
        if "query" in settings:
            errors.append(f"{prefix}: do not use settings.query for logstore drilldown filters")
        if settings.get("type") != "logstore":
            errors.append(f"{prefix}: settings.type must be 'logstore' so SLS receives queryString")
        if "searchFilter" not in settings:
            errors.append(f"{prefix}: settings.searchFilter is required")
        if settings.get("blank") is not False:
            errors.append(f"{prefix}: settings.blank should be false for same-console drilldown")
        if settings.get("timeRange") != -1:
            errors.append(f"{prefix}: settings.timeRange should be -1 to inherit dashboard time")
        if settings.get("filterInherit") is not True:
            errors.append(f"{prefix}: settings.filterInherit should be true")
        search_filter = str(settings.get("searchFilter", ""))
        if matcher == "trace_id" and "traceId:" in search_filter:
            errors.append(f"{prefix}: use SLS field trace_id, not raw log token traceId")
    return errors


def validate_prometheus_cardinality(dashboard: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for query in iter_chart_queries(dashboard):
        datasource = query.get("datasource")
        datasource_type = datasource.get("type") if isinstance(datasource, dict) else None
        if datasource_type != "prometheus":
            continue
        expr = str(query.get("expr", ""))
        ref_id = str(query.get("refId", "?"))
        for forbidden in ("biz_id", "trace_id"):
            if forbidden in expr:
                errors.append(f"prometheus query {ref_id}: high-cardinality field {forbidden} belongs in SLS, not Prometheus")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Aliyun dashboard JSON contracts")
    parser.add_argument("dashboard_json", type=Path)
    args = parser.parse_args()

    try:
        dashboard = json.loads(args.dashboard_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"invalid json: {exc}")
        return 1

    errors = []
    errors.extend(validate_logstore_drilldowns(dashboard))
    errors.extend(validate_prometheus_cardinality(dashboard))

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("OK: dashboard JSON passed Aliyun drilldown/cardinality checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
