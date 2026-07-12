---
name: axis-test-benchmark
description: Use when the user asks to benchmark APIs, local modules, service dependencies, throughput, latency, concurrency, or capacity. / 用于对 API、本地模块、服务依赖链路、吞吐、延迟、并发或容量进行基准测试。
---

# Benchmark

Use this skill to safely benchmark a clearly scoped target and translate latency/QPS results into engineering and business capacity terms. It supports API benchmarks and local module benchmarks. It is public-repo safe: project-specific endpoint sets, module runners, credentials, hosts, and test data should be supplied as local files or environment variables instead of being embedded in the skill.

## When to Use

- The user asks to `压测`, `压一下`, benchmark, check latency, QPS, TPS, throughput, concurrency, slow interfaces, module throughput, or how many users a system can support.
- The target might be an HTTP API, a deployed service, a local module calling a remote dependency, a database/Elasticsearch/Redis client path, a queue consumer, or a command-line benchmark runner.
- The user asks to benchmark only a subset, for example `只压app端接口`, `测一下新模块吞吐量`, or `本地对模块进行压测`.
- The target has a discoverable surface from OpenAPI, frontend service files, controller mappings, module service classes, route tables, an explicit endpoint list, or a user-provided benchmark runner.

Do not use for destructive load tests unless the user explicitly approves writes and test-data pollution.

## Three-Step Work Contract

Run benchmark work in three steps:

1. Co-create the benchmark scope with the user.
   Clarify the benchmark target, execution location, dependency path, data set, write/read safety, success metric, concurrency range, duration, stop threshold, and whether the result should represent local code, deployed service code, or an external dependency. Keep this brief when the user has already specified enough context, but do not guess API vs module.
2. Execute the agreed benchmark.
   Run smoke checks first, then low-to-high steps. Capture raw output in an artifact file when the result is non-trivial. Do not change production data or write paths unless explicitly approved.
3. Verify and report the result.
   Validate errors/business failures, sort slow endpoints or slow cases by p95/p99, explain the tested path precisely, identify what the result does and does not include, and run the deposition check before final.

## Light Adversarial Review

Use a lightly adversarial stance for benchmark work. Keep it below 30% of the interaction: challenge ambiguous scope, unsafe write load, benchmark results from code that is not deployed, overly broad user-count conclusions, and hidden dependencies. Once the target and safety boundary are clear, execute decisively.

## Scope Clarification Gate

Before running a benchmark, state the intended scope in one short line and correct it if the user pushes back. At minimum identify:

- target kind: API, local module, deployed module, dependency client, database, cache, search engine, queue, or mixed workflow;
- execution location: local machine, test server, production-like server, CI, or managed service console;
- dependency path: for example local module -> remote search service, deployed service -> remote cache, or API -> application -> database;
- data and index/table size when known;
- safety boundary: read-only by default, with writes only after explicit approval;
- success metric: stable QPS/TPS, p95/p99, error rate, saturation point, or capacity estimate.

If the user asks for "module throughput" or corrects you with "不是走 api", immediately switch from HTTP benchmark to local/module runner and make the tested path explicit.

## API Benchmark Workflow

1. Identify the target base URL from the user's wording, frontend/backend environment files, deployed app settings, or prior validated scripts. Record the exact URL.
2. Build the endpoint set from real sources, not guesses:
   - OpenAPI/Swagger docs for declared APIs.
   - frontend service files for paths actually used by clients.
   - backend controller or route mappings when docs and clients disagree.
   - a user-provided endpoint JSON file when the project has no docs.
3. Classify endpoints into public, user/member, admin/operator, merchant/tenant, and write-risk groups. Run only safe read groups by default.
4. Obtain tokens from documented test accounts, existing seed scripts, or user-provided bearer tokens. Verify live login before using them.
5. Run smoke checks for each candidate endpoint. Drop endpoints that are not deployed, return permissions unrelated to the intended actor, or require unavailable credentials.
6. Run a per-endpoint baseline with small samples and low concurrency. Capture p50/p90/p95/p99/max and business error counts.
7. Run conservative mixed-read steps, for example 5, 10, 20, 40, 60 concurrency, fixed 15-30 second windows, and stop at the thresholds below. For every mixed step, output slow endpoint details sorted by p95 response time so the report names concrete interfaces, not only slow groups. Endpoint aliases from JSON files are not enough; include the traceable HTTP method, path, and query params for each slow row.
8. If mixed p95 rises sharply, run targeted tests for the slowest endpoints at 5/10/20 concurrency to separate global saturation from endpoint-specific bottlenecks.

## Module Benchmark Workflow

Use module benchmarks when the user wants local code or a library/module path measured without HTTP.

1. Identify the local entrypoint:
   - service class, repository, client wrapper, command, SDK method, queue consumer, scheduled job, or module-level runner;
   - whether the benchmark includes real remote dependencies or mocks;
   - whether the benchmark includes serialization, mapping, cache, connection pools, thread pools, or only raw dependency calls.
2. Prefer a temporary or artifact-local runner over committing benchmark scaffolding into production code. If a runner must be added to the repo, make it test-only, manual-tagged, and easy to remove.
3. Smoke one request/call first and verify the result is not a local reflection/classpath/config failure masquerading as a benchmark failure.
4. Run baseline and mixed steps with small durations first. Capture per-case p50/p90/p95/p99/max, QPS, error count, and slow cases sorted by p95.
5. Separate mixed-module throughput from targeted single-case throughput. Mixed runs show the whole module workload; targeted runs show whether one case or fan-out path is the bottleneck.
6. In the report, explicitly say what the benchmark includes and excludes. For example, "local module -> remote dependency" includes local query construction and response mapping, but excludes HTTP controllers, auth filters, server CPU, servlet pools, deployed runtime settings, and upstream gateway overhead.
7. If the result should represent deployed capacity, rerun the same runner on the deployed/test server or benchmark the deployed API. A local runner against remote dependencies is not proof of server capacity.

## Safety Rules

1. Treat the user's environment, target kind, and execution location as authoritative once clarified.
2. Start with smoke checks and low concurrency. Do not jump straight to high load.
3. Default to read-only endpoints or read-only module calls. Exclude submit order, payment callback, inventory adjustment, shipment, approval, delete, upload, audit, queue publish, and batch mutation paths unless explicitly approved.
4. Count business failures, not only transport failures. In wrapped HTTP APIs, HTTP 200 can still contain a business error code.
5. Keep login/auth benchmark separate. Repeated logins can invalidate or replace earlier tokens, so refresh tokens before the main mixed-read run.
6. Stop or avoid escalating when error rate rises above 5 percent, p95 exceeds 5 seconds for mixed traffic, or the environment starts returning auth/rate-limit/system errors.
7. For module benchmarks, stop when QPS no longer increases but p95/p99 grows sharply; report the saturation point rather than chasing a larger concurrency number.

## Script

Prefer the bundled API script when the target is HTTP:

```bash
python3 ~/.codex/skills/axis-test-benchmark/scripts/core_api_benchmark.py \
  --base-url https://test.example.com/api \
  --endpoint-file endpoints.json \
  --max-concurrency 60 \
  --duration 25
```

For public-only smoke capacity checks with the generic sample profile:

```bash
python3 ~/.codex/skills/axis-test-benchmark/scripts/core_api_benchmark.py \
  --base-url https://test.example.com/api \
  --profile sample \
  --scope public \
  --steps 1,3,5,10,20,40 \
  --duration 12 \
  --no-auth-sample
```

Useful flags:

- `--scope public`: benchmark only generic public sample endpoints when no endpoint file is supplied.
- `--no-auth-sample`: skip isolated login sampling.
- `--targeted`: run targeted slow-endpoint probes after the mixed test.
- `--endpoint-file endpoints.json`: run a custom endpoint set instead of the generic sample profile.
- `--slow-detail-limit 8`: print the top N slow endpoint rows per mixed step, sorted by p95 response time; each row includes the traceable HTTP method/path/query plus the endpoint alias; use `0` to hide endpoint rows.
- `--member-token`, `--admin-token`, `--no-login`: use pre-issued tokens or public-only endpoints.
- `--member-phone`, `--member-password`, `--admin-phone`, `--admin-password`: override test credentials.

If the API script is missing or incompatible, write a temporary runner with the same safeguards instead of using a generic HTTP benchmark that ignores JSON business codes.

For module benchmarks, create a local runner that prints this minimum schema:

```text
MODULE_TARGET <local/deployed/dependency path>
SCOPE <what is included and excluded>
BASELINE_PER_CASE samples=<n> concurrency=<n>
MIXED_MODULE_STEPS duration=<seconds>
concurrency=<n> qps=<q> n=<n> ok=<n> err=<n> err%=<pct> avg=<ms> p95=<ms> p99=<ms> max=<ms>
slow_cases_by_p95
TARGETED_CASE_STEPS duration=<seconds>
```

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

For module benchmarks, avoid user-count claims unless the module workload is mapped to an actual user transaction. A module QPS number is a component capacity signal, not an end-to-end business capacity number.

## Output Template

```text
目标：<target kind and exact path>
范围：<API endpoints or module cases>; excluded <writes/unavailable areas>

结论：
- 稳定吞吐：<N concurrency>, QPS/TPS <Q>, p95 <latency>, error <rate>
- 可接受上限：<N>, p95 <latency>, caveat
- 不建议：<N>, reason

瓶颈：
- <endpoint/group/module case>: p95, QPS, likely concern
- 慢明细：按 p95 响应时间降序列出 method/path/query 或 module case、group、p95、p99、avg、max、样本数、错误数

口径：
- 本次包含：<for example local module code + remote dependency + mapping>
- 本次不包含：<for example HTTP controller/auth/server CPU/gateway>
- 人数/DAU estimate only when the benchmark maps to user-facing requests

回归：
- Smoke/baseline/mixed/targeted checks run
- Raw artifacts path
- Skill deposition check result
```

## Process Failure Guard

If you realize after starting that the wrong target was benchmarked, stop escalating, acknowledge the scope miss, and switch to the user's corrected scope. The common causes are:

- assuming API benchmark when the user asked for module throughput;
- treating a local runner against a remote dependency as deployed server capacity;
- forgetting to state what the benchmark includes and excludes;
- ending after the report without running the deposition check.

Prevent these by using the Scope Clarification Gate before execution and the Deposition Gate before final.

## Common Mistakes

- Using OpenAPI paths without checking the deployed test environment.
- Treating wrapped HTTP 200 responses as success when the business code is not success.
- Running auth samples before mixed traffic and then reusing stale tokens.
- Reporting "并发数等于人数".
- Polluting test data with submit/order/payment/audit/write endpoints during a quick capacity check.
- Calling a local module -> remote dependency result "environment API capacity".
- Reporting only endpoint aliases or case names when code tracing needs method/path/query or concrete module entrypoint.

## After Use Deposition

Before the final answer, always run a deposition check:

1. Did this benchmark expose a reusable scope rule, runner schema, safety threshold, output format, interpretation rule, or script fix?
2. If yes, update this skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow.
3. If no, say explicitly that no skill update is needed and why.

Do not treat "the benchmark finished" as complete until the deposition check has been reported.
