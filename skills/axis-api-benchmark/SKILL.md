---
name: axis-api-benchmark
description: Use when the user asks to load test or benchmark test-environment APIs, estimate concurrency or active users, compare endpoint latency, or identify slow business interfaces.
---

# API Benchmark

Use this skill to safely benchmark test-environment APIs and translate latency/QPS results into a business concurrency estimate. It includes a built-in PetMall profile, but the workflow applies to other projects when endpoints and tokens are supplied.

## When to Use

- The user asks to `压测`, `压一下测试环境`, check API latency, QPS, concurrency, or how many users an API environment can support.
- The target has a discoverable API surface from OpenAPI, frontend service files, controller mappings, route tables, or an explicit endpoint list.
- The target may be PetMall/PetMallPlatform, but it does not have to be.
- The user asks for a business-facing interpretation such as "够多少人用".

Do not use for destructive load tests unless the user explicitly approves writes and test-data pollution.

## Safety Rules

1. Treat the user's environment URL as authoritative. If no URL is provided, re-check app/admin configs before choosing a target.
2. Start with smoke checks and low concurrency. Do not jump straight to high load.
3. Default to read-only endpoints: GET/list/detail/search/profile/cart/order query/admin query. Exclude submit order, payment callback, inventory adjustment, shipment, approval, delete, upload, and audit endpoints unless explicitly approved.
4. Count business failures, not only HTTP failures. In this codebase HTTP 200 can still contain `code=401`, `code=403`, or `code=500`.
5. Keep login/auth benchmark separate. Repeated logins can invalidate or replace earlier tokens, so refresh tokens before the main mixed-read run.
6. Stop or avoid escalating when error rate rises above 5 percent, p95 exceeds 5 seconds for mixed traffic, or the environment starts returning auth/rate-limit/system errors.

## Workflow

1. Identify the target base URL from the user's wording, frontend/backend environment files, deployed app settings, or prior validated scripts. Record the exact URL.
2. Build the endpoint set from real sources, not guesses:
   - OpenAPI/Swagger docs for declared APIs.
   - frontend service files for paths actually used by clients.
   - backend controller or route mappings when docs and clients disagree.
   - a user-provided endpoint JSON file when the project has no docs.
3. Classify endpoints into public, user/member, admin/operator, merchant/tenant, and write-risk groups. Run only safe read groups by default.
4. Obtain tokens from documented test accounts, existing seed scripts, or user-provided bearer tokens. For the built-in PetMall profile, typical test values are in `PetMallPlatform/scripts/seed_ugc_pet_demo_via_api.py` and `doc/mvp/deliverables/account-role-list.md`; verify live login before using them.
5. Run smoke checks for each candidate endpoint. Drop endpoints that are not deployed, return permissions unrelated to the intended actor, or require unavailable merchant credentials.
6. Run a per-endpoint baseline with small samples and low concurrency. Capture p50/p90/p95/p99/max and business error counts.
7. Run conservative mixed-read steps, for example 5, 10, 20, 40, 60 concurrency, fixed 15-30 second windows, and stop at the thresholds above.
8. If mixed p95 rises sharply, run targeted tests for the slowest endpoints at 5/10/20 concurrency to separate global saturation from endpoint-specific bottlenecks.
9. Report results in business terms:
   - stable concurrency and QPS;
   - p95/p99 latency at each step;
   - slowest endpoint groups;
   - excluded unsafe or unavailable areas;
   - a conservative active-user estimate.

## Script

Prefer the bundled script when available:

```bash
python3 ~/.codex/skills/axis-api-benchmark/scripts/core_api_benchmark.py \
  --base-url http://8.155.11.203/prod-api \
  --profile petmall \
  --max-concurrency 60 \
  --duration 25
```

Useful flags:

- `--no-auth-sample`: skip isolated login sampling.
- `--targeted`: run targeted slow-endpoint probes after the mixed test.
- `--endpoint-file endpoints.json`: run a custom endpoint set instead of the built-in PetMall profile.
- `--member-token`, `--admin-token`, `--no-login`: use pre-issued tokens or public-only endpoints for non-PetMall projects.
- `--member-phone`, `--member-password`, `--admin-phone`, `--admin-password`: override test credentials.

If the script is missing or incompatible, write a temporary runner with the same safeguards instead of using a generic HTTP benchmark that ignores JSON business codes.

## Interpreting Users

Do not equate request concurrency with people. Convert with:

```text
active_users ~= stable_qps / requests_per_second_per_active_user
```

Use conservative examples:

- heavy usage: about 1 request/user/second;
- normal browsing: about 1 request/user/3 seconds;
- light browsing: about 1 request/user/5 seconds.

Also explain that registered users or DAU are much larger than simultaneous active users. For DAU, state the assumption, for example peak active users are 5-10 percent of DAU.

## Output Template

```text
目标：<base-url>
范围：<endpoint count and groups>; excluded <writes/unavailable areas>

结论：
- 稳定并发：<N>, QPS <Q>, p95 <latency>, error <rate>
- 可接受上限：<N>, p95 <latency>, caveat
- 不建议：<N>, reason

瓶颈：
- <endpoint/group>: p95, QPS, likely concern

人数口径：
- 重度/正常/轻度活跃用户 estimate
- DAU estimate with explicit peak ratio assumption
```

## Common Mistakes

- Using OpenAPI paths without checking the deployed test environment.
- Treating wrapped HTTP 200 responses as success when `code` is not 200.
- Running auth samples before mixed traffic and then reusing stale tokens.
- Reporting "并发数等于人数".
- Polluting test data with submit/order/payment/audit/write endpoints during a quick capacity check.
