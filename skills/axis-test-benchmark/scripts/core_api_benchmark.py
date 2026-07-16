#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError as error:  # pragma: no cover
    raise SystemExit("requests is required: python3 -m pip install requests") from error


DEFAULT_SUCCESS_CODES = ("0", "200", "OK", "SUCCESS", "true")
SENSITIVE_QUERY_KEYS = {
    "access_key",
    "access_token",
    "api_key",
    "authorization",
    "cookie",
    "credential",
    "email",
    "key",
    "member_phone",
    "password",
    "phone",
    "secret",
    "session",
    "token",
}


@dataclass(frozen=True)
class Endpoint:
    name: str
    group: str
    path: str
    params: dict[str, Any] | None = None
    auth: str = "public"
    weight: int = 1
    method: str = "GET"
    success_codes: tuple[str, ...] = DEFAULT_SUCCESS_CODES
    accept_any_json: bool = False


ENDPOINTS = [
    Endpoint("health", "public", "/actuator/health", weight=3, accept_any_json=True),
    Endpoint("openapi", "public", "/v3/api-docs", weight=1, accept_any_json=True),
    Endpoint("public_list", "public_read", "/api/example/items", {"pageNum": 1, "pageSize": 10}, weight=3),
    Endpoint("public_search", "public_read", "/api/example/search", {"keyword": "demo", "pageNum": 1, "pageSize": 10}, weight=2),
    Endpoint("member_profile", "member_read", "/api/member/profile", auth="member", weight=2),
    Endpoint("member_orders", "member_read", "/api/member/orders", {"pageNum": 1, "pageSize": 10}, auth="member", weight=2),
    Endpoint("admin_items", "admin_read", "/api/admin/items", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=1),
]

TARGETED_ENDPOINTS = [
    Endpoint("public_list", "public_read", "/api/example/items", {"pageNum": 1, "pageSize": 10}),
    Endpoint("member_orders", "member_read", "/api/member/orders", {"pageNum": 1, "pageSize": 10}, auth="member"),
    Endpoint("admin_items", "admin_read", "/api/admin/items", {"pageNum": 1, "pageSize": 10}, auth="admin"),
]

PUBLIC_GROUPS = {
    "public",
    "public_read",
}

THREAD_LOCAL = threading.local()


def select_builtin_endpoints(scope: str) -> list[Endpoint]:
    if scope == "public":
        return [endpoint for endpoint in ENDPOINTS if endpoint.group in PUBLIC_GROUPS]
    return list(ENDPOINTS)


def select_builtin_targeted_endpoints(scope: str) -> list[Endpoint]:
    if scope == "public":
        return [endpoint for endpoint in TARGETED_ENDPOINTS if endpoint.group in PUBLIC_GROUPS]
    return list(TARGETED_ENDPOINTS)


def endpoint_from_dict(item: dict[str, Any]) -> Endpoint:
    raw_success_codes = item.get("success_codes")
    success_codes = (
        tuple(str(code) for code in raw_success_codes)
        if isinstance(raw_success_codes, list)
        else DEFAULT_SUCCESS_CODES
    )
    return Endpoint(
        name=str(item["name"]),
        group=str(item.get("group") or "custom"),
        path=str(item["path"]),
        params=item.get("params") if isinstance(item.get("params"), dict) else None,
        auth=str(item.get("auth") or "public"),
        weight=int(item.get("weight") or 1),
        method=str(item.get("method") or "GET").upper(),
        success_codes=success_codes,
        accept_any_json=bool(item.get("accept_any_json", False)),
    )


def load_custom_endpoints(path: str) -> list[Endpoint]:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    raw_endpoints = data.get("endpoints") if isinstance(data, dict) else data
    if not isinstance(raw_endpoints, list):
        raise ValueError("endpoint file must be a list or an object with an endpoints list")
    endpoints = [endpoint_from_dict(item) for item in raw_endpoints]
    unsupported_auth = sorted({endpoint.auth for endpoint in endpoints} - {"public", "member", "admin"})
    if unsupported_auth:
        raise ValueError(f"unsupported auth values: {', '.join(unsupported_auth)}")
    return endpoints


def session() -> requests.Session:
    current = getattr(THREAD_LOCAL, "session", None)
    if current is None:
        current = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=160, pool_maxsize=160, max_retries=0)
        current.mount("http://", adapter)
        current.mount("https://", adapter)
        current.headers.update({"User-Agent": "Axis-Core-API-Benchmark/1.0", "Accept": "application/json"})
        THREAD_LOCAL.session = current
    return current


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    k = (len(ordered) - 1) * p
    floor = int(k)
    ceil = min(floor + 1, len(ordered) - 1)
    if floor == ceil:
        return ordered[floor]
    return ordered[floor] + (ordered[ceil] - ordered[floor]) * (k - floor)


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    latencies = [item["ms"] for item in results]
    ok_count = sum(1 for item in results if item["success"])
    total = len(results)
    return {
        "n": total,
        "ok": ok_count,
        "err": total - ok_count,
        "err_pct": (total - ok_count) / total * 100 if total else 0.0,
        "avg": statistics.fmean(latencies) if latencies else 0.0,
        "p50": percentile(latencies, 0.50),
        "p90": percentile(latencies, 0.90),
        "p95": percentile(latencies, 0.95),
        "p99": percentile(latencies, 0.99),
        "max": max(latencies) if latencies else 0.0,
    }


def format_summary(summary: dict[str, Any]) -> str:
    qps = f"qps={summary['qps']:.1f} " if "qps" in summary else ""
    return (
        f"{qps}n={summary['n']} ok={summary['ok']} err={summary['err']} "
        f"err%={summary['err_pct']:.1f} avg={summary['avg']:.0f} "
        f"p50={summary['p50']:.0f} p90={summary['p90']:.0f} p95={summary['p95']:.0f} "
        f"p99={summary['p99']:.0f} max={summary['max']:.0f}"
    )


def business_success(body: Any, endpoint: Endpoint) -> tuple[bool, str]:
    if not isinstance(body, dict):
        return False, "non_json"
    if "code" in body:
        code = body.get("code")
        return str(code) in endpoint.success_codes, f"code={code}"
    if "success" in body and isinstance(body["success"], bool):
        return body["success"], f"success={str(body['success']).lower()}"
    if "status" in body:
        status = str(body["status"])
        return status.upper() in {"UP", "OK", "HEALTHY", "SUCCESS"}, f"status={status}"
    if "rows" in body or "total" in body:
        return True, "table"
    if "data" in body:
        return True, "data"
    if endpoint.accept_any_json:
        return True, "accepted_json"
    return False, "unrecognized_json"


def load_token(explicit: str | None, environment_name: str, token_file: str | None) -> str | None:
    sources = [bool(explicit), bool(os.environ.get(environment_name)), bool(token_file)]
    if sum(sources) > 1:
        raise ValueError(f"provide only one token source for {environment_name}: argument, environment, or file")
    if explicit:
        return explicit.strip()
    environment_value = os.environ.get(environment_name)
    if environment_value:
        return environment_value.strip()
    if token_file:
        value = Path(token_file).expanduser().read_text(encoding="utf-8").strip()
        if not value:
            raise ValueError(f"token file for {environment_name} is empty")
        return value
    return None


def public_headers(client_id: str | None) -> dict[str, str]:
    return {"clientid": client_id} if client_id else {}


def authenticated_headers(token: str, client_id: str | None) -> dict[str, str]:
    headers = public_headers(client_id)
    headers["Authorization"] = f"Bearer {token}"
    return headers


def sensitive_query_key(key: str) -> bool:
    normalized = key.strip().lower().replace("-", "_")
    return normalized in SENSITIVE_QUERY_KEYS or normalized.endswith(("_token", "_secret", "_password", "_phone", "_email", "_key"))


def endpoint_route(endpoint: Endpoint) -> str:
    route = f"{endpoint.method} {endpoint.path}"
    if endpoint.params:
        query_parts = []
        for key, value in sorted(endpoint.params.items()):
            if sensitive_query_key(str(key)):
                query_parts.append(f"{key}=<redacted>")
                continue
            if isinstance(value, list | tuple):
                query_parts.extend(f"{key}={item}" for item in value)
            else:
                query_parts.append(f"{key}={value}")
        route += "?" + "&".join(query_parts)
    return route


class BenchmarkClient:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.base_url = args.base_url.rstrip("/")
        self.timeout = (args.connect_timeout, args.read_timeout)
        member_token = load_token(args.member_token, "AXIS_BENCH_MEMBER_TOKEN", args.member_token_file)
        admin_token = load_token(args.admin_token, "AXIS_BENCH_ADMIN_TOKEN", args.admin_token_file)
        self.headers: dict[str, dict[str, str]] = {
            "public": public_headers(args.public_client_id),
        }
        if member_token:
            self.headers["member"] = authenticated_headers(member_token, args.member_client_id)
        if admin_token:
            self.headers["admin"] = authenticated_headers(admin_token, args.admin_client_id)

    def call(self, endpoint: Endpoint) -> dict[str, Any]:
        started = time.perf_counter()
        route = endpoint_route(endpoint)
        try:
            if endpoint.method != "GET":
                return {
                    "name": endpoint.name,
                    "group": endpoint.group,
                    "route": route,
                    "ms": (time.perf_counter() - started) * 1000,
                    "success": False,
                    "reason": f"unsupported_method={endpoint.method}",
                }
            response = session().get(
                self.base_url + endpoint.path,
                params=endpoint.params or {},
                headers=self.headers.get(endpoint.auth) or {},
                timeout=self.timeout,
            )
            elapsed = (time.perf_counter() - started) * 1000
            try:
                body: Any = response.json()
            except ValueError:
                body = None
            success, reason = business_success(body, endpoint)
            if not 200 <= response.status_code < 300:
                success, reason = False, f"http={response.status_code}"
            return {"name": endpoint.name, "group": endpoint.group, "route": route, "ms": elapsed, "success": success, "reason": reason}
        except Exception as error:  # noqa: BLE001 - report benchmark failures compactly.
            return {
                "name": endpoint.name,
                "group": endpoint.group,
                "route": route,
                "ms": (time.perf_counter() - started) * 1000,
                "success": False,
                "reason": type(error).__name__,
            }


def run_repeated(client: BenchmarkClient, endpoint: Endpoint, total: int, concurrency: int) -> list[dict[str, Any]]:
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        return list(executor.map(lambda _: client.call(endpoint), range(total)))


def run_for_duration(client: BenchmarkClient, endpoints: list[Endpoint], concurrency: int, duration: float) -> tuple[list[dict[str, Any]], float]:
    weighted: list[Endpoint] = []
    for endpoint in endpoints:
        weighted.extend([endpoint] * endpoint.weight)

    results: list[dict[str, Any]] = []
    lock = threading.Lock()
    stop_at = time.perf_counter() + duration

    def worker() -> None:
        rng = random.Random(time.time_ns() ^ threading.get_ident())
        while time.perf_counter() < stop_at:
            result = client.call(rng.choice(weighted))
            with lock:
                results.append(result)

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        for future in as_completed([executor.submit(worker) for _ in range(concurrency)]):
            future.result()
    return results, time.perf_counter() - started


def print_errors(results: list[dict[str, Any]], limit: int = 8) -> None:
    errors: dict[tuple[str, str], int] = {}
    for item in results:
        if item["success"]:
            continue
        key = (item["name"], item["reason"])
        errors[key] = errors.get(key, 0) + 1
    if errors:
        text = ", ".join(f"{name}:{reason}={count}" for (name, reason), count in sorted(errors.items(), key=lambda entry: entry[1], reverse=True)[:limit])
        print(f"  errors {text}")


def print_slowest_groups(results: list[dict[str, Any]], limit: int = 6) -> None:
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in results:
        groups.setdefault(item["group"], []).append(item)
    slow = sorted(((group, summarize(items)["p95"], len(items)) for group, items in groups.items()), key=lambda item: item[1], reverse=True)[:limit]
    print("  slow_p95_groups " + ", ".join(f"{group}:{p95:.0f}ms/{count}" for group, p95, count in slow))


def print_slowest_endpoints(results: list[dict[str, Any]], limit: int = 8) -> None:
    if limit <= 0:
        return
    endpoints: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for item in results:
        endpoints.setdefault((item["group"], item["name"], item.get("route") or item["name"]), []).append(item)
    slow = []
    for (group, name, route), items in endpoints.items():
        summary = summarize(items)
        slow.append((group, name, route, summary))
    slow.sort(key=lambda item: (item[3]["p95"], item[3]["max"], item[3]["avg"]), reverse=True)
    print("  slow_endpoints_by_p95")
    for group, name, route, summary in slow[:limit]:
        print(
            f"    {route} name={name} group={group} "
            f"p95={summary['p95']:.0f}ms p99={summary['p99']:.0f}ms "
            f"avg={summary['avg']:.0f}ms max={summary['max']:.0f}ms "
            f"n={summary['n']} err={summary['err']}"
        )


def steps(max_concurrency: int, raw_steps: str | None) -> list[int]:
    if raw_steps:
        values = [int(part.strip()) for part in raw_steps.split(",") if part.strip()]
    else:
        values = [5, 10, 20, 40, 60]
    return [value for value in values if value <= max_concurrency]


def run_auth_sample(client: BenchmarkClient, endpoints: list[Endpoint]) -> None:
    authenticated = [endpoint for endpoint in endpoints if endpoint.auth != "public"]
    if not authenticated:
        print("\nAUTH_SAMPLE skipped: no authenticated read endpoints")
        return
    print("\nAUTH_SAMPLE authenticated_reads samples=12 concurrency=4")
    seen_auth: set[str] = set()
    for endpoint in authenticated:
        if endpoint.auth in seen_auth:
            continue
        seen_auth.add(endpoint.auth)
        results = run_repeated(client, endpoint, total=12, concurrency=4)
        print(f"auth            {endpoint.name:24s} {format_summary(summarize(results))}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Safely benchmark core read APIs.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--profile", default="sample", choices=("sample",), help="Built-in generic endpoint profile to use when --endpoint-file is omitted.")
    parser.add_argument("--scope", default="public", choices=("all", "public"), help="Built-in endpoint scope; public is the safe default.")
    parser.add_argument("--endpoint-file", default=None, help="JSON list of endpoints or object with endpoints list.")
    parser.add_argument("--member-token", default=None, help="Pre-issued bearer token for endpoints with auth=member.")
    parser.add_argument("--admin-token", default=None, help="Pre-issued bearer token for endpoints with auth=admin.")
    parser.add_argument("--member-token-file", default=None, help="Local UTF-8 file containing only the pre-issued member token.")
    parser.add_argument("--admin-token-file", default=None, help="Local UTF-8 file containing only the pre-issued admin token.")
    parser.add_argument("--public-client-id", default=os.environ.get("AXIS_BENCH_PUBLIC_CLIENT_ID"))
    parser.add_argument("--member-client-id", default=os.environ.get("AXIS_BENCH_MEMBER_CLIENT_ID"))
    parser.add_argument("--admin-client-id", default=os.environ.get("AXIS_BENCH_ADMIN_CLIENT_ID"))
    parser.add_argument("--duration", type=float, default=25.0)
    parser.add_argument("--baseline-samples", type=int, default=6)
    parser.add_argument("--max-concurrency", type=int, default=60)
    parser.add_argument("--steps", default=None, help="Comma-separated mixed concurrency steps, for example 5,10,20.")
    parser.add_argument("--connect-timeout", type=float, default=3.0)
    parser.add_argument("--read-timeout", type=float, default=18.0)
    parser.add_argument("--max-error-rate", type=float, default=5.0, help="Stop when business or transport error percentage exceeds this value.")
    parser.add_argument("--max-p95-ms", type=float, default=5000.0, help="Stop when mixed-traffic p95 exceeds this value.")
    parser.add_argument("--slow-detail-limit", type=int, default=8, help="Number of slow endpoint rows to print per mixed step; use 0 to hide.")
    parser.add_argument("--no-baseline", action="store_true")
    parser.add_argument("--auth-sample", action="store_true", default=False, help="Explicitly sample authenticated read endpoints using supplied tokens.")
    parser.add_argument("--no-auth-sample", action="store_true", help="Deprecated no-op; auth sampling is already off by default.")
    parser.add_argument("--targeted", action="store_true")
    args = parser.parse_args()

    if args.auth_sample and args.no_auth_sample:
        parser.error("--auth-sample and --no-auth-sample cannot be used together")

    endpoints = load_custom_endpoints(args.endpoint_file) if args.endpoint_file else select_builtin_endpoints(args.scope)
    targeted_endpoints = [] if args.endpoint_file else select_builtin_targeted_endpoints(args.scope)
    required_auths = ({endpoint.auth for endpoint in endpoints} | ({endpoint.auth for endpoint in targeted_endpoints} if args.targeted else set())) - {"public"}
    client = BenchmarkClient(args)
    missing_auth = sorted(required_auths - set(client.headers))
    if missing_auth:
        raise SystemExit(
            f"missing auth headers for: {', '.join(missing_auth)}. "
            "Provide a pre-issued token argument, AXIS_BENCH_*_TOKEN environment variable, or token file."
        )
    print(f"TARGET {client.base_url}")
    print(f"PROFILE {'custom' if args.endpoint_file else args.profile}")
    if not args.endpoint_file:
        print(f"SAMPLE_SCOPE {args.scope}")
    print(f"SCOPE read-only core APIs: {len(endpoints)} endpoints")
    print("AUTH headers prepared")

    if not args.no_baseline:
        print(f"\nBASELINE_PER_ENDPOINT samples={args.baseline_samples} concurrency=3")
        for endpoint in endpoints:
            results = run_repeated(client, endpoint, args.baseline_samples, min(3, args.baseline_samples))
            line = f"{endpoint.group:15s} {endpoint.name:24s} {format_summary(summarize(results))}"
            print(line)
            print_errors(results, limit=3)

    if args.auth_sample:
        run_auth_sample(client, endpoints)

    print(
        f"\nMIXED_READ_STEPS duration={args.duration:g}s "
        f"stop_if(err>{args.max_error_rate:g}% or p95>{args.max_p95_ms:g}ms)"
    )
    for concurrency in steps(args.max_concurrency, args.steps):
        results, elapsed = run_for_duration(client, endpoints, concurrency, args.duration)
        summary = summarize(results)
        summary["qps"] = len(results) / elapsed if elapsed else 0.0
        print(f"concurrency={concurrency:2d} elapsed={elapsed:.1f}s {format_summary(summary)}")
        print_slowest_groups(results)
        print_slowest_endpoints(results, args.slow_detail_limit)
        print_errors(results)
        if summary["err_pct"] > args.max_error_rate or summary["p95"] > args.max_p95_ms:
            print("  STOP threshold reached")
            break

    if args.targeted:
        if not targeted_endpoints:
            print("\nTARGETED_STEPS skipped: no targeted endpoint set for custom endpoint file")
            return
        print("\nTARGETED_STEPS duration=15s")
        for endpoint in targeted_endpoints:
            print(f"\n{endpoint.name}")
            for concurrency in (5, 10, 20):
                if concurrency > args.max_concurrency:
                    continue
                results, elapsed = run_for_duration(client, [endpoint], concurrency, 15.0)
                summary = summarize(results)
                summary["qps"] = len(results) / elapsed if elapsed else 0.0
                print(f"  c={concurrency:2d} {format_summary(summary)}")
                print_errors(results, limit=3)
                if summary["err_pct"] > args.max_error_rate or summary["p95"] > args.max_p95_ms:
                    break


if __name__ == "__main__":
    main()
