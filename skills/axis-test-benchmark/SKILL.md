---
name: axis-test-benchmark
description: Use when the requested outcome is reproducible latency, throughput, concurrency, or capacity evidence for an API, module, or dependency path. / 用于为 API、模块或依赖链路生成可复现的延迟、吞吐、并发或容量证据。
---

# Benchmark

Measure one explicit path safely and report what the result includes and excludes. Benchmark evidence is not an implementation fix and request concurrency is not a user-count claim.

## When to Use

- The user asks to benchmark, 压测, measure p95/p99, QPS/TPS, throughput, concurrency, saturation, or capacity.
- The target is an HTTP API, local module, deployed module, client path, database, cache, search engine, queue consumer, or command runner.
- The requested result is measurement evidence, not code optimization.

## Do Not Use

- Use `$axis-code-api-performance-tuning` when measured slow reads need implementation changes.
- Use `$axis-test-side-effects` for one real state-changing workflow whose primary result is effect and cleanup verification.
- Do not run write load, destructive actions, login load, or production load without explicit scope-specific authorization.
- Do not guess whether “module throughput” means HTTP, local code, deployed code, or a remote dependency path.

## Inputs

- Target kind, exact entrypoint or endpoint set, execution location, revision, dependency path, and data scale.
- Workload shape, concurrency steps, duration, warmup, success predicate, SLO or stop thresholds, and required percentiles.
- Authentication supplied only through explicit token arguments, environment variables, or local token files.
- Read/write classification, test-data plan, cleanup plan for any authorized write, and artifact location.

## Three-Step Work Contract

1. Co-create the scope. State target, location, dependency path, data, safety boundary, workload, and success metric in one short confirmation.
2. Execute the agreed benchmark. Smoke first, then increase load conservatively; capture raw output for non-trivial runs.
3. Verify and report. Count transport and business failures, identify slow endpoints or cases, state inclusions and exclusions, and avoid unsupported capacity claims.

## Light Adversarial Review

Keep review at or below 30% of the interaction. Challenge ambiguous target wording, unsafe writes, credentials on command lines, undeployed code claims, hidden remote dependencies, stale tokens, and concurrency-to-people conversions. Once scope and safety are explicit, run the benchmark decisively.

## Scope Clarification Gate

Before execution, identify:

- target kind and exact API, module, or dependency path;
- execution location and code revision;
- included and excluded layers;
- read-only default or explicitly authorized write boundary;
- data scale, workload, SLO, stop conditions, and output artifact.

If the user corrects “API” to “module,” switch immediately and restate the path. A local module -> remote dependency run measures local construction, mapping, and the remote call; it does not prove deployed server, gateway, auth-filter, or end-to-end capacity.

## API Benchmark Workflow

1. Build the endpoint set from OpenAPI, client files, controller routes, or a user-provided endpoint JSON file; do not infer paths.
2. Classify actor and write risk. Default to public, read-only endpoints and verify one smoke call plus the business success predicate.
3. Run a small baseline, then bounded mixed steps. Stop at user/SLO thresholds; use conservative defaults only when none are supplied.
4. Sort slow details by p95 and report method plus redacted path/query, samples, errors, p95, p99, and max.
5. Run targeted slow-endpoint probes only when they help distinguish endpoint-local latency from whole-system saturation.

## Module Benchmark Workflow

1. Identify the real method, service, repository, client, consumer, job, or runner and whether dependencies are real or mocked.
2. Prefer a temporary or test-only runner. Smoke one call before load so setup or classpath errors are not misreported as capacity failures.
3. Separate mixed-module throughput from targeted case throughput and print QPS, samples, errors, p95, p99, and max.
4. If deployed capacity is the claim, rerun on the deployed environment or benchmark the deployed API.

## Bundled Script

The bundled HTTP runner is safe-by-default: public scope, no login, GET-only endpoints, and no built-in credentials.

```bash
python3 ~/.codex/skills/axis-test-benchmark/scripts/core_api_benchmark.py \
  --base-url https://test.example.com/api \
  --scope public \
  --steps 1,3,5,10,20 \
  --duration 12
```

For authenticated reads, provide a pre-issued token explicitly through `AXIS_BENCH_MEMBER_TOKEN`, `AXIS_BENCH_ADMIN_TOKEN`, `--member-token-file`, or `--admin-token-file`. Authentication sampling is off unless `--auth-sample` is present. Never place passwords in arguments or packaged files.

## Outputs

- Exact target path, revision, location, workload, and included or excluded layers.
- Stable operating point, saturation or stop point, QPS/TPS, latency percentiles, and error/business-failure rate.
- Slow endpoint or case details with sensitive query values redacted.
- Raw artifact location and explicit caveats for local, remote-dependency, or undeployed-code results.
- User or DAU estimates only when a stated request-rate model maps the measured path to a real user transaction.

## Safety and Boundaries

- Start with smoke and low concurrency; respect the user/SLO stop threshold and stop on instability or unexpected writes.
- Read-only is the default. Orders, payments, inventory, bookings, approval, delete, upload, broker publish, and batch mutation require explicit authorization plus `$axis-test-side-effects` safeguards.
- Tokens come from explicit token input, environment, or token files; do not auto-login, embed credentials, print tokens, or benchmark login unless separately authorized.
- Count wrapped business failures even when HTTP status is 200. Let endpoint definitions declare accepted business codes.
- Redact token, password, secret, key, phone, email, cookie, and authorization-like query values in output.
- Do not call component QPS “supported users” without a transparent workload assumption.

## Checks

- Smoke confirms the target exists, returns the expected shape, and performs no unapproved write.
- Endpoint or case inventory is traceable to real code or user-supplied input.
- Results contain sample count, success and business-failure count, QPS/TPS, p95, p99, max, workload, revision, and environment.
- Stop conditions were honored and raw evidence is retained outside Git unless explicitly required as source input.
- The report distinguishes measured facts from capacity estimates and optimization hypotheses.

## Process Failure Guard

If the wrong target was benchmarked, stop escalating, acknowledge the scope miss, and switch to the corrected path. Do not reuse API results as module evidence, local dependency results as deployed capacity, or undeployed code as before/after proof.

## Deposition Gate

Do not treat "the benchmark finished" as complete until the deposition check is reported. A completed benchmark may hand off to `$axis-test-report` only when the user requests a packaged report; do not create it automatically.

## After Use Deposition

If the run produced a reusable scope rule, safety threshold, success predicate, output schema, or script correction, update this skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise state why no skill update is needed.
