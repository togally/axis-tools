#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

try:
    import requests
except ImportError as error:  # pragma: no cover
    raise SystemExit("requests is required: python3 -m pip install requests") from error


DEFAULT_MEMBER_CLIENT = "member-app"
DEFAULT_ADMIN_CLIENT = "9f51b346ef87bee0998ba2b1c132084e"


@dataclass(frozen=True)
class Endpoint:
    name: str
    group: str
    path: str
    params: dict[str, Any] | None = None
    auth: str = "public"
    weight: int = 1


ENDPOINTS = [
    Endpoint("app_category", "public_app", "/app/mall/category", weight=3),
    Endpoint("product_list", "public_app", "/mall/app/product/list", {"pageNum": 1, "pageSize": 10}, weight=5),
    Endpoint("home_header", "public_app", "/app/mall/home/header", weight=2),
    Endpoint("home_recommend", "public_app", "/app/mall/home/recommend/page", {"pageNum": 1, "pageSize": 10}, weight=3),
    Endpoint("search_suggest", "public_app", "/app/mall/search/suggest", {"keyword": "cat"}, weight=2),
    Endpoint("search_aggregate", "public_app", "/app/search/aggregate", {"keyword": "cat", "pageNum": 1, "pageSize": 10}, weight=2),
    Endpoint("grooming_shop_page", "public_service", "/app/grooming/shops/page", {"pageNum": 1, "pageSize": 10}, weight=2),
    Endpoint("health_shop_page", "public_service", "/app/health/shops/page", {"pageNum": 1, "pageSize": 10}, weight=2),
    Endpoint("ugc_recommend", "public_ugc", "/app/ugc/feed/recommend", {"pageNum": 1, "pageSize": 10}, weight=3),
    Endpoint("me", "member", "/app/me", auth="member", weight=3),
    Endpoint("pet_list", "member", "/mall/app/pet/list", auth="member", weight=3),
    Endpoint("pet_cards", "member", "/mall/app/pet/cards", auth="member", weight=3),
    Endpoint("cart_list", "member", "/mall/app/cart/list", auth="member", weight=2),
    Endpoint("address_list", "member", "/mall/app/address/list", auth="member", weight=2),
    Endpoint("trade_list", "member_trade", "/mall/app/trade/list", {"pageNum": 1, "pageSize": 10}, auth="member", weight=2),
    Endpoint("health_queue_my", "member_service", "/app/health/queue/my", auth="member", weight=1),
    Endpoint("grooming_booking_page", "member_service", "/app/grooming/booking/page", {"pageNum": 1, "pageSize": 10}, auth="member", weight=1),
    Endpoint("coupon_page", "member_service", "/app/marketing/coupon/page", {"pageNum": 1, "pageSize": 10}, auth="member", weight=1),
    Endpoint("ugc_following", "member_ugc", "/app/ugc/feed/following", {"pageNum": 1, "pageSize": 10}, auth="member", weight=1),
    Endpoint("circle_my", "member_ugc", "/app/pet-friend-circles/my", {"pageNum": 1, "pageSize": 10}, auth="member", weight=1),
    Endpoint("admin_brand_list", "admin", "/mall/admin/brand/list", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=1),
    Endpoint("admin_category_list", "admin", "/mall/admin/category/list", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=1),
    Endpoint("admin_product_list", "admin", "/mall/admin/product/list", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=2),
    Endpoint("admin_order_list", "admin_trade", "/mall/admin/order/list", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=2),
    Endpoint("admin_trade_list", "admin_trade", "/mall/admin/trade/list", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=1),
    Endpoint("admin_after_sale_list", "admin_trade", "/mall/admin/after-sale/list", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=1),
    Endpoint("admin_merchant_list", "admin", "/mall/admin/merchant/list", {"pageNum": 1, "pageSize": 10}, auth="admin", weight=1),
    Endpoint("admin_member_list", "admin_member", "/admin-api/member/list", {"pageNum": 1, "pageSize": 10, "status": "0"}, auth="admin", weight=1),
]

TARGETED_ENDPOINTS = [
    Endpoint("member_trade_list", "member_trade", "/mall/app/trade/list", {"pageNum": 1, "pageSize": 10}, auth="member"),
    Endpoint("member_pet_cards", "member", "/mall/app/pet/cards", auth="member"),
    Endpoint("member_me", "member", "/app/me", auth="member"),
    Endpoint("admin_product_list", "admin", "/mall/admin/product/list", {"pageNum": 1, "pageSize": 10}, auth="admin"),
    Endpoint("admin_after_sale_list", "admin_trade", "/mall/admin/after-sale/list", {"pageNum": 1, "pageSize": 10}, auth="admin"),
    Endpoint("public_search_aggregate", "public_app", "/app/search/aggregate", {"keyword": "cat", "pageNum": 1, "pageSize": 10}),
    Endpoint("public_product_list", "public_app", "/mall/app/product/list", {"pageNum": 1, "pageSize": 10}),
]

PETMALL_APP_GROUPS = {
    "public_app",
    "public_service",
    "public_ugc",
    "member",
    "member_trade",
    "member_service",
    "member_ugc",
}

THREAD_LOCAL = threading.local()


def select_builtin_endpoints(scope: str) -> list[Endpoint]:
    if scope == "app":
        return [endpoint for endpoint in ENDPOINTS if endpoint.group in PETMALL_APP_GROUPS]
    return list(ENDPOINTS)


def select_builtin_targeted_endpoints(scope: str) -> list[Endpoint]:
    if scope == "app":
        return [endpoint for endpoint in TARGETED_ENDPOINTS if endpoint.group in PETMALL_APP_GROUPS]
    return list(TARGETED_ENDPOINTS)


def endpoint_from_dict(item: dict[str, Any]) -> Endpoint:
    return Endpoint(
        name=str(item["name"]),
        group=str(item.get("group") or "custom"),
        path=str(item["path"]),
        params=item.get("params") if isinstance(item.get("params"), dict) else None,
        auth=str(item.get("auth") or "public"),
        weight=int(item.get("weight") or 1),
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
        current.headers.update({"User-Agent": "PetMall-Core-API-Benchmark/1.0", "Accept": "application/json"})
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


def business_success(body: Any) -> tuple[bool, str]:
    if not isinstance(body, dict):
        return False, "non_json"
    if "code" in body:
        code = body.get("code")
        return str(code) == "200", f"code={code}"
    if "rows" in body or "total" in body:
        return True, "table"
    if "data" in body:
        return True, "data"
    return True, "json"


def extract_token(body: dict[str, Any]) -> str:
    data = body.get("data") or {}
    for key in ("access_token", "accessToken", "token"):
        value = data.get(key)
        if value:
            return str(value)
    raise RuntimeError(f"token not found; response keys={list(data.keys())}")


class BenchmarkClient:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.base_url = args.base_url.rstrip("/")
        self.timeout = (args.connect_timeout, args.read_timeout)
        self.headers: dict[str, dict[str, str]] = {}

    def post_json(self, path: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        response = session().post(self.base_url + path, json=payload, headers=headers, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def login(self, required_auths: set[str] | None = None) -> None:
        required_auths = required_auths or {"member", "admin"}
        self.headers = {
            "public": {"clientid": self.args.member_client_id},
        }
        if self.args.member_token:
            self.headers["member"] = {"clientid": self.args.member_client_id, "Authorization": f"Bearer {self.args.member_token}"}
        if self.args.admin_token:
            self.headers["admin"] = {"clientid": self.args.admin_client_id, "Authorization": f"Bearer {self.args.admin_token}"}
        if self.args.no_login:
            return
        if "admin" in required_auths and "admin" not in self.headers:
            admin_body = self.post_json(
                "/auth/login",
                {
                    "clientId": self.args.admin_client_id,
                    "grantType": "password",
                    "tenantId": self.args.tenant_id,
                    "phonenumber": self.args.admin_phone,
                    "password": self.args.admin_password,
                },
                {"clientid": self.args.admin_client_id},
            )
            self.headers["admin"] = {"clientid": self.args.admin_client_id, "Authorization": f"Bearer {extract_token(admin_body)}"}
        if "member" in required_auths and "member" not in self.headers:
            member_body = self.post_json(
                "/app/auth/login",
                {
                    "clientId": self.args.member_client_id,
                    "phone": self.args.member_phone,
                    "password": self.args.member_password,
                },
                {"clientid": self.args.member_client_id},
            )
            self.headers["member"] = {"clientid": self.args.member_client_id, "Authorization": f"Bearer {extract_token(member_body)}"}

    def call(self, endpoint: Endpoint) -> dict[str, Any]:
        started = time.perf_counter()
        try:
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
            success, reason = business_success(body)
            if response.status_code != 200:
                success, reason = False, f"http={response.status_code}"
            return {"name": endpoint.name, "group": endpoint.group, "ms": elapsed, "success": success, "reason": reason}
        except Exception as error:  # noqa: BLE001 - report benchmark failures compactly.
            return {
                "name": endpoint.name,
                "group": endpoint.group,
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


def steps(max_concurrency: int, raw_steps: str | None) -> list[int]:
    if raw_steps:
        values = [int(part.strip()) for part in raw_steps.split(",") if part.strip()]
    else:
        values = [5, 10, 20, 40, 60]
    return [value for value in values if value <= max_concurrency]


def run_auth_sample(client: BenchmarkClient, required_auths: set[str]) -> None:
    print("\nAUTH_SAMPLE samples=12 concurrency=4")

    def auth_call(kind: str) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            if kind == "member_login":
                body = client.post_json(
                    "/app/auth/login",
                    {"clientId": client.args.member_client_id, "phone": client.args.member_phone, "password": client.args.member_password},
                    {"clientid": client.args.member_client_id},
                )
            else:
                body = client.post_json(
                    "/auth/login",
                    {
                        "clientId": client.args.admin_client_id,
                        "grantType": "password",
                        "tenantId": client.args.tenant_id,
                        "phonenumber": client.args.admin_phone,
                        "password": client.args.admin_password,
                    },
                    {"clientid": client.args.admin_client_id},
                )
            success, reason = business_success(body)
            return {"name": kind, "group": "auth", "ms": (time.perf_counter() - started) * 1000, "success": success, "reason": reason}
        except Exception as error:  # noqa: BLE001
            return {"name": kind, "group": "auth", "ms": (time.perf_counter() - started) * 1000, "success": False, "reason": type(error).__name__}

    kinds = []
    if "member" in required_auths:
        kinds.append("member_login")
    if "admin" in required_auths:
        kinds.append("admin_login")
    for kind in kinds:
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: auth_call(kind), range(12)))
        print(f"auth            {kind:24s} {format_summary(summarize(results))}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Safely benchmark core read APIs.")
    parser.add_argument("--base-url", default="http://8.155.11.203/prod-api")
    parser.add_argument("--profile", default="petmall", choices=("petmall",), help="Built-in endpoint profile to use when --endpoint-file is omitted.")
    parser.add_argument("--petmall-scope", default="all", choices=("all", "app"), help="Built-in PetMall endpoint scope: all core APIs or App-side APIs only.")
    parser.add_argument("--endpoint-file", default=None, help="JSON list of endpoints or object with endpoints list.")
    parser.add_argument("--member-token", default=None, help="Pre-issued bearer token for endpoints with auth=member.")
    parser.add_argument("--admin-token", default=None, help="Pre-issued bearer token for endpoints with auth=admin.")
    parser.add_argument("--no-login", action="store_true", help="Do not call built-in login endpoints; useful for public-only custom endpoint files.")
    parser.add_argument("--member-client-id", default=DEFAULT_MEMBER_CLIENT)
    parser.add_argument("--member-phone", default="13800002002")
    parser.add_argument("--member-password", default="666666")
    parser.add_argument("--admin-client-id", default=DEFAULT_ADMIN_CLIENT)
    parser.add_argument("--admin-phone", default="13900000002")
    parser.add_argument("--admin-password", default="666666")
    parser.add_argument("--tenant-id", default="000000")
    parser.add_argument("--duration", type=float, default=25.0)
    parser.add_argument("--baseline-samples", type=int, default=6)
    parser.add_argument("--max-concurrency", type=int, default=60)
    parser.add_argument("--steps", default=None, help="Comma-separated mixed concurrency steps, for example 5,10,20.")
    parser.add_argument("--connect-timeout", type=float, default=3.0)
    parser.add_argument("--read-timeout", type=float, default=18.0)
    parser.add_argument("--no-baseline", action="store_true")
    parser.add_argument("--no-auth-sample", action="store_true")
    parser.add_argument("--targeted", action="store_true")
    args = parser.parse_args()

    endpoints = load_custom_endpoints(args.endpoint_file) if args.endpoint_file else select_builtin_endpoints(args.petmall_scope)
    targeted_endpoints = [] if args.endpoint_file else select_builtin_targeted_endpoints(args.petmall_scope)
    required_auths = ({endpoint.auth for endpoint in endpoints} | ({endpoint.auth for endpoint in targeted_endpoints} if args.targeted else set())) - {"public"}
    client = BenchmarkClient(args)
    client.login(required_auths)
    missing_auth = sorted({endpoint.auth for endpoint in endpoints} - set(client.headers))
    if missing_auth:
        raise SystemExit(f"missing auth headers for: {', '.join(missing_auth)}. Provide tokens or omit --no-login.")
    print(f"TARGET {client.base_url}")
    print(f"PROFILE {'custom' if args.endpoint_file else args.profile}")
    if not args.endpoint_file:
        print(f"PETMALL_SCOPE {args.petmall_scope}")
    print(f"SCOPE read-only core APIs: {len(endpoints)} endpoints")
    print("AUTH headers prepared")

    if not args.no_baseline:
        print(f"\nBASELINE_PER_ENDPOINT samples={args.baseline_samples} concurrency=3")
        for endpoint in endpoints:
            results = run_repeated(client, endpoint, args.baseline_samples, min(3, args.baseline_samples))
            line = f"{endpoint.group:15s} {endpoint.name:24s} {format_summary(summarize(results))}"
            print(line)
            print_errors(results, limit=3)

    if not args.no_auth_sample:
        if args.no_login or args.endpoint_file:
            print("\nAUTH_SAMPLE skipped for custom/no-login mode")
        else:
            run_auth_sample(client, required_auths)
            client.login(required_auths)
            print("\nTOKENS refreshed after auth sample")

    print(f"\nMIXED_READ_STEPS duration={args.duration:g}s stop_if(err>5% or p95>5000ms)")
    for concurrency in steps(args.max_concurrency, args.steps):
        results, elapsed = run_for_duration(client, endpoints, concurrency, args.duration)
        summary = summarize(results)
        summary["qps"] = len(results) / elapsed if elapsed else 0.0
        print(f"concurrency={concurrency:2d} elapsed={elapsed:.1f}s {format_summary(summary)}")
        print_slowest_groups(results)
        print_errors(results)
        if summary["err_pct"] > 5 or summary["p95"] > 5000:
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
                if summary["err_pct"] > 2 or summary["p95"] > 8000:
                    break


if __name__ == "__main__":
    main()
