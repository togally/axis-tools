---
name: axis-code-bugfix
description: Use when an observed software failure needs evidence-based diagnosis and, when authorized, a root-cause fix. / 用于对已观测的软件故障进行证据化诊断，并在获准时完成根因修复。
---

# Evidence First Bugfix

Tie the reported symptom to a concrete code path or external dependency before changing behavior. A fix is complete only when a regression check catches the original failure and verification addresses the same symptom.

## When to Use

- The user reports an exception, wrong result, regression, flaky behavior, production error, failed check, screenshot, or logs.
- Application code, configuration, runtime profile, external dependency, and test harness are competing explanations.
- The request asks for diagnosis, repair, or both.

## Do Not Use

- Use `$axis-test-benchmark` when the requested result is capacity or latency measurement only.
- Use `$axis-code-api-performance-tuning` when a valid benchmark has isolated a slow read path and the primary result is optimization.
- Use `$axis-code-arch-optimize` when the proven fix must become a shared cross-cutting capability.
- Do not implement when the user requested diagnosis or explanation only.

## Inputs

- Exact symptom, expected behavior, environment, timestamp or request window, and reproducible inputs when available.
- Stack traces, logs, screenshots, business codes, traces, failing commands, or monitoring evidence without summarizing away nested causes.
- Current checkout, active profile, relevant code path, configuration, dependency state, and nearby tests.
- Authorization boundary: diagnosis only, local fix, schema change, deployment, external action, or data repair.

## Three-Step Work Contract

1. Co-create the target. Preserve the reported evidence, clarify expected behavior and environment, and ask only for information that blocks a safe next step.
2. Execute the agreed result. Prove the likely cause; when a fix is authorized, create a focused RED regression and implement the smallest safe change.
3. Verify the result. Confirm GREEN, run adjacent checks, and reread the original evidence to verify the same endpoint, frame, error class, or visible symptom is addressed.

## Light Adversarial Review

Keep review at or below 30% of the interaction. Challenge guessed root causes, exception-wrapper conclusions, broad retries, environment mismatch, hidden external failures, and tests written only after the fix. Once evidence distinguishes the cause, act decisively within the authorized mode.

## Workflow

1. Preserve the exact failure and map the real path from entrypoint through service, repository or client, external calls, configuration, and tests.
2. Classify external dependency failure separately from application code: also consider profile/config mismatch and benchmark or test-harness artifacts.
3. Run the smallest inspection or command that distinguishes competing explanations. Do not fix by theory alone.
4. In diagnosis-only mode, report the proven cause, confidence, and next safe action without editing.
5. In fix mode, use `$axis-test-tdd` as the implementation method: observe RED, make the narrow correction, and confirm GREEN.
6. Run adjacent regressions or smoke checks required by the changed layer and state anything blocked by deployment or access.

## Outputs

- Root cause in one sentence tied to concrete evidence.
- Mode used: diagnosis-only or fix.
- Changed behavior and files when a fix was authorized.
- Exact RED/GREEN and adjacent verification commands with results.
- Residual deployment, data, dependency, or observability risk.

## Safety and Boundaries

- Preserve user-owned changes and unrelated dirty-worktree content.
- Never hide dependency, auth, quota, routing, or capacity failure behind retries or fabricated fallback success.
- Do not mutate production data, deploy, restart services, or call external write paths without matching authority.
- A remote environment that lacks the local change cannot prove the fix.
- If evidence remains ambiguous, report the competing causes and the smallest next discriminator rather than guessing.

## Checks

- The root cause explains the original evidence and failing layer.
- The regression check failed for the intended reason before the authorized fix and passes after it.
- Adjacent tests cover configuration, fallback, lifecycle, or dependency behavior affected by the change.
- The final report separates verified facts, inference, and unverified external state.

## After Use Deposition

If the work produced a reusable diagnostic rule, regression pattern, command, or edge case, update this skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise report that no skill update is needed.
