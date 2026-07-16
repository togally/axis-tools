---
name: axis-code-api-performance-tuning
description: Use when measured slow read APIs need implementation or query optimization without changing business correctness. / 用于已有慢读接口测量证据且需要在不改变业务正确性的前提下优化实现或查询。
---

# API Performance Tuning

Optimize only a proven slow read path. Preserve business semantics first, then improve latency with focused code, query, cache, or concurrency changes and same-environment evidence.

## When to Use

- A benchmark or trace identifies concrete slow read endpoints, p95/p99, data volume, and environment.
- The requested result is an implementation, query, cache, batching, index, or safe parallelism change.
- Correctness, freshness, authorization, ordering, and fallback behavior can be stated and tested.

## Do Not Use

- Use `$axis-test-benchmark` when the requested result is measurement or capacity evidence only.
- Use `$axis-code-bugfix` for functional errors, crashes, wrong results, or flaky behavior without a latency-optimization goal.
- Do not optimize from route names, an undeployed local diff, or benchmark output whose target and commit cannot be identified.
- Do not use this workflow for destructive write-load tests.

## Inputs

- Benchmark or trace evidence: target, environment, deployed revision, load shape, latency distribution, error rate, and slow endpoint.
- Real code path: controller, service, data access, cache, remote calls, fallbacks, and existing tests.
- Correctness boundary: actor scope, request parameters, freshness, ordering, invalidation, failure isolation, and strong-state constraints.
- Acceptance target and authorized scope, including whether schema, deployment, or live benchmarking is allowed.

## Three-Step Work Contract

1. Co-create the target. Confirm the measured path, acceptance metric, data scale, deployed revision, and correctness boundary; keep this brief when the request already provides them.
2. Execute the agreed result. Write a focused RED check, implement the narrowest safe optimization, and avoid unrelated cleanup.
3. Verify the result. Run GREEN and adjacent regression checks, then rerun only benchmarks whose environment contains the change.

## Light Adversarial Review

Keep review at or below 30% of the interaction. Challenge stale or cross-tenant caches, incomplete invalidation, unsafe ThreadLocal use, N+1 assumptions, environment mismatch, and strong-state caching. Once evidence and scope are clear, execute decisively.

## Plan Confirmation Gate

If the user asks only for a plan, assessment, or whether optimization is possible, present the evidence-backed proposal and stop for implementation authorization. Do not write RED tests, edit code, change schema, or run implementation benchmarks while the request remains plan-only.

If the original request already asks to implement, optimize, fix, or execute within a clear scope, that is authorization; do not add a redundant confirmation pause. Ask again only when execution would expand into schema changes, deployment, external writes, or another materially different scope.

## Workflow

1. Preserve the benchmark evidence and map each slow endpoint to the real code and data sources.
2. Classify the bottleneck before choosing a lever: repeated calls, N+1, inefficient query or sort, missing index, remote fan-out, serialization, cache miss, or environment capacity.
3. Write RED tests for the selected safety boundary, such as call counts, cache keys and invalidation, ordering, fallback, concurrency start, or freshness.
4. Implement one narrow optimization using existing repository patterns. Keep private business policy in its owning module.
5. Run focused GREEN tests, related regressions, and whitespace or static checks.
6. Compare before and after only in the same effective environment and revision. Otherwise label the result as a baseline or unverified projection.

## Outputs

- Slow path and measured symptom.
- Optimization class, changed files or behavior, and correctness rules preserved.
- Exact RED/GREEN commands and results.
- Same-environment before/after latency evidence, or an explicit reason it is unavailable.
- Residual deployment, data-volume, invalidation, or dependency risk.

## Safety and Boundaries

- Never cache orders, payments, inventory, coupons, bookings, queues, or other strong state without complete scope and invalidation proof.
- Cache private reads by principal and all behavior-changing parameters; never share tenant or member data across keys.
- Do not claim improvement from a target that does not contain the changed code.
- Do not add broad retries, unbounded parallelism, hidden fallbacks, or unrelated architecture refactors.
- Schema changes, deployments, and live load are separate state-changing actions and require matching authority.

## Checks

- The measured endpoint maps to the edited path and deployed revision.
- RED failed for the intended missing behavior; GREEN and adjacent regressions pass.
- Business success codes, authorization, freshness, ordering, fallback, and invalidation remain correct.
- Benchmark comparison uses the same workload, data scale, target class, and revision boundary.
- Anything not deployed or remeasured is labeled unverified.

## After Use Deposition

Deposit lessons only after implementation and verification. If the work produced a reusable safety rule, test pattern, benchmark caveat, or optimization decision rule, update the relevant skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise report that no skill update is needed.
