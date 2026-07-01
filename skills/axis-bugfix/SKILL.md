---
name: axis-bugfix
description: Use when a user reports a bug, production error, failed benchmark, flaky behavior, or pasted logs/screenshots and wants a root-cause fix rather than a guess.
---

# Axis Bugfix

## Overview

Evidence first, fix second. A bugfix is not done until the failing symptom is tied to a concrete code path or external dependency, a regression check exists, and the verification result matches the original failure mode.

## When To Use

Use for:
- Pasted stack traces, screenshots, production logs, benchmark errors, or "it broke" reports.
- Bugs where infrastructure, dependency limits, retries, timeouts, and application code could all be plausible.
- Regressions that need a safe code change, not only an explanation.

Do not use for pure feature planning, design docs, or one-line operational questions.

## Method

1. Preserve the evidence.
   Capture the exact error, timestamp, endpoint, request shape, environment, benchmark step, and business failure code. Do not summarize away stack frames, retry spans, or slow operations.

2. Map the real path.
   Trace from entrypoint to service, repository/client, external call, configuration, and tests. Use current checkout evidence, not route names or memory.

3. Classify before fixing.
   Classify external dependency failures separately from application code bugs before choosing a fix.
   Separate the failing layer:
   - application code bug;
   - configuration or active profile mismatch;
   - external dependency capacity, timeout, retry, routing, authentication, quota, or unsupported command;
   - benchmark or test harness artifact.

4. Prove the most likely cause.
   Run the smallest command or code inspection that distinguishes competing explanations. Do not fix by theory alone.

5. Write RED before changing behavior.
   Add a focused regression check that fails for the observed problem or asserts the new safety boundary. For process-only fixes, write a concrete acceptance check.

6. Implement the smallest safe change.
   Prefer removing the dangerous hot path, narrowing the retry/scope, adding fallback, correcting configuration, or making lifecycle work explicit. Avoid unrelated refactors.

7. Verify GREEN and residual risk.
   Rerun the focused test, then any adjacent tests or smoke commands needed for the changed layer. State what was not verified if deployment or access is unavailable.

8. Re-read the original evidence.
   Confirm the fix addresses the same endpoint, stack frame, retry span, error class, or user-visible symptom that started the investigation.

## Quick Reference

| Symptom | First Move |
| --- | --- |
| Stack trace | Follow the top application frame to the real dependency call. |
| Slow benchmark | Sort by failing endpoint and p95/p99, then inspect the slow operation span. |
| External client error | Verify from the same runtime context before blaming code. |
| Retry storm | Find the hot path that schedules retries or repeated probes. |
| "Works normally" | Compare normal path with load, container, profile, and dependency capacity. |

## Common Mistakes

- Treating the exception wrapper as the root cause instead of reading nested causes.
- Fixing the infrastructure symptom while leaving a code hot path that can recreate it under load.
- Adding broad retries when the real issue is repeated probes, no fallback, or bad lifecycle ownership.
- Reporting success from a remote environment that does not contain the local change.
- Writing tests after the fix and never proving they catch the original failure.

## Report Shape

Use this compact final report:

- Root cause: one sentence tied to evidence.
- Change: files or behavior changed.
- Verification: exact commands and results.
- Remaining risk: deploy, data, external dependency, or benchmark caveat.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
