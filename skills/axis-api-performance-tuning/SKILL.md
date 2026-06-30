---
name: axis-api-performance-tuning
description: Use when API benchmarks or load tests identify slow read endpoints and the user asks to optimize latency without breaking correctness.
---

# API Performance Tuning

Use this skill after a benchmark has identified slow read endpoints and the user wants the implementation optimized without trading away correctness.

## When To Use

- API benchmark, load test, p95/p99, QPS, or concurrency results point to specific slow endpoints.
- The user asks to optimize slow interfaces and also asks for good tests around normal performance fixes.
- Multiple read paths are involved and fixes may include caching, batching, indexing, or parallelizing independent calls.

Do not use this as a replacement for the benchmark skill. Use the benchmark skill first to produce endpoint evidence. Do not use this for destructive write-load tests.

## Core Rule

Treat every performance optimization as a behavior change. First prove the slow path and the intended safety property, then make the smallest change that improves latency without stale, leaked, or inconsistent data.

Performance tuning has two phases:

- Proposal phase: preserve evidence, trace real code, classify safe levers, and present a concrete optimization plan.
- Execution phase: only after explicit user confirmation, write RED tests, implement, verify, rerun eligible benchmarks, and deposit reusable lessons.

## Plan Confirmation Gate

After the proposal phase, STOP and ask whether to implement. Do not write RED tests, edit code, change schema, or run implementation benchmarks until the user explicitly confirms development execution.

The proposal must include:

- slow endpoints, measured symptoms, and suspected root cause;
- code paths and data sources inspected;
- optimization class chosen and why it is safe;
- cache/index/read-model/fallback/invalidation risks;
- planned RED tests and verification commands;
- files or modules expected to change;
- deployment, backfill, or benchmark requirements.

If the user asks for a plan,方案,assessment, or "can this be optimized", provide the plan and wait. If the user later says to implement, execute, develop, fix, or confirms the plan, continue from the RED-test step.

## Workflow

1. Preserve benchmark evidence.
   Record target URL, endpoint file, auth mode, tested concurrency, QPS, p95/p99/max, business error rate, and the exact slow endpoint groups.

2. Map endpoints to real code.
   For each slow endpoint, trace controller, service, data access, cache annotations, remote calls, fallback paths, and existing tests. Do not optimize from route names alone.

3. Classify safe levers.
   - Stable private read views: cache by principal and all request parameters; add write-side invalidation for every mutation that can change the view.
   - Stable public reads: use short TTLs and explicit invalidation from admin or catalog writes.
   - Independent read calls: run concurrently, preserve response ordering, keep per-group failure isolation, and verify the code does not depend on request ThreadLocal context.
   - N+1 paths: batch child lookups and assert mapper/client call counts.
   - Database hot paths: prefer narrow composite indexes that match filters and sort order.
   - Strong-state paths: avoid blind caching for orders, payments, coupons, inventory, queues, and booking state unless invalidation coverage is complete.

4. Present the optimization plan and wait for confirmation.
   Use the Plan Confirmation Gate. The plan is not permission to code. If confirmation is not explicit, stop after the plan and ask one direct question about whether to execute.

5. Write RED tests before implementation.
   Good tests include:
   - cache contract tests for cache name, key, `unless`, TTL policy, and every write invalidation path;
   - concurrency tests with latches proving all independent groups start before any slow group blocks completion;
   - N+1 regression tests asserting one batched child query per relation;
   - route/fallback tests proving search/read-model paths do not fall back to the database when a usable result exists;
   - freshness tests proving writes invalidate or bypass stale reads.

6. Implement narrowly.
   Prefer existing cache helpers, thread/future style, pagination utilities, and query wrappers. Avoid mixing unrelated refactors into performance work.

7. Verify in layers.
   Run the RED command and record its expected failure. Run focused GREEN tests, related regression tests, and whitespace checks. Rerun a benchmark only against an environment that actually contains the new code; if the target is not deployed, clearly label the benchmark as a remote baseline or comparison, not proof of the local fix.

8. Deposit reusable lessons after execution.
   Do this only after implementation and verification, not after the proposal-only phase. Check whether the work produced reusable corrections, validation commands, edge cases, benchmark caveats, or decision rules. If yes, update the relevant skill bundle, validate it, install or refresh the local copy, and push when permissions allow. If no reusable lesson exists, say that no skill update is needed.

## Reporting

Report:
- slow endpoints and chosen optimization class;
- whether implementation was explicitly confirmed, or that the work stopped at proposal;
- RED and GREEN commands with results;
- what was intentionally not cached and why;
- benchmark before/after, or a clear note that remote results do not include local changes;
- reusable lessons deposited after execution, or why no deposition was needed;
- remaining deployment or data-volume risks.

## Common Mistakes

- Caching member data without member-scoped keys.
- Caching strong-state pages because they are slow.
- Parallelizing code that reads request-local login or tenant context inside worker threads.
- Reporting HTTP 200 as success while wrapped business codes are failures.
- Claiming benchmark improvement from a remote environment where the code was not deployed.
- Treating an optimization plan as approval to start coding.
- Depositing lessons before execution proves the lesson is reusable.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
