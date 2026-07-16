---
name: axis-test-side-effects
description: Use when an explicitly authorized test must verify a real external state change, message, asynchronous effect, and cleanup. / 用于在明确授权后验证真实外部状态变更、消息投递、异步效果及清理结果。
---

# Side-Effect Testing

Verify real side effects from precondition through effect and cleanup. Dispatch acknowledgement is not success, stale status is not current-run evidence, and permission from an older run is not authorization.

## When to Use

- A backend action mutates remote state, publishes a message, calls a third party, controls hardware, starts a job, or triggers callbacks.
- The user explicitly asks for a real integration path rather than a mock.
- The effect has observable state, progress, terminal status, or cleanup behavior.

## Do Not Use

- Do not use for unit tests, read-only endpoints, or mocks with no real external effect.
- Use `$axis-test-benchmark` when the primary result is sustained throughput or capacity measurement.
- Do not execute production, payment, notification, hardware, account, destructive, or cost-bearing actions without exact current-run authorization.
- Do not proceed when the effect cannot be bounded, observed, stopped, or safely reconciled.

## Inputs

- Exact environment, tenant or account, actor, target resource, action, payload class, and semantic precondition.
- Maximum affected objects/messages/devices, maximum cost or duration, allowed time window, and prohibited outcomes.
- Observation path: API, database row, cache key, broker topic, event stream, callback, job status, or device state.
- Cleanup or compensation command, expected final state, abort signal, timeout, and responsible owner if cleanup fails.
- Explicit current-run user authorization covering the exact environment and impact envelope.

## Three-Step Work Contract

1. Co-create the safe test envelope. State the action, environment, identity, maximum impact, observation, cleanup, timeout, and stop conditions; obtain explicit approval for that exact envelope.
2. Execute the agreed test. Establish the precondition and status boundary, trigger one bounded action, observe the real signal path, and stop at the approved terminal condition.
3. Verify and reconcile. Prove acceptance and effect separately, run cleanup or compensation, and verify the final state through the same observation path.

## Light Adversarial Review

Keep review at or below 30% of the interaction. Challenge stale status, ambiguous identity, broad production scope, fake callbacks, “sent means success,” missing cost limits, irreversible actions, and cleanup that cannot be observed. After the safety envelope is explicit and approved, execute only that envelope.

## Authorization and Impact Gate

Before the first real write, show one compact gate containing:

- environment and authenticated actor;
- exact action and target resource;
- maximum records, messages, devices, money, duration, and concurrency;
- expected effect and observation path;
- cleanup or compensation and final-state proof;
- timeout, abort signal, and stop conditions.

Silence, a timeout, ambiguous approval, or authorization from an older run is not consent. Any change to environment, actor, action, payload, impact cap, cost, or cleanup invalidates the gate and requires new approval.

## Test Pattern

1. Prepare the real semantic precondition and capture a before snapshot.
2. Establish a current-attempt status boundary with timestamp, action id, correlation id, or stale-cache reset.
3. Trigger one bounded action through production code and the configured integration path.
4. Observe dispatch, downstream effect, progress, and terminal status separately.
5. Stop immediately on unexpected fan-out, cost, identity, target, error growth, or missing control.
6. Run cleanup or compensation and capture the verified final state.
7. Record command, time window, correlation evidence, before/after state, progress, cleanup, and anything not observed.

## Outputs

- Approved action envelope and execution environment.
- Before state, dispatch evidence, downstream effect, progress samples, terminal state, and correlation identifiers.
- Cleanup or compensation command and verified final state.
- Exact timeout, stop reason, unexpected side effects, and unverified gaps.

## Safety and Boundaries

- Never exceed the approved environment, actor, target set, concurrency, duration, cost, or payload class.
- Treat messages, callbacks, notifications, payments, device commands, and external API calls as real effects even in test environments.
- Prefer one action before any repeated action. Use idempotency or a unique correlation boundary when supported.
- Do not fabricate downstream success or manually publish a callback when the user requested the configured real path.
- If cleanup fails or cannot be verified, stop further testing, preserve evidence, and report the unreconciled state immediately.
- Package a report with `$axis-test-report` only when the user asks; do not upload or publish automatically.

## Checks

- Explicit approval matches the actual environment, actor, action, target, and impact cap.
- Evidence belongs to the current attempt, not stale cache or an earlier callback.
- Command acceptance, real effect, progress, and terminal status are evaluated separately.
- Cleanup restores the intended state and is verified through the same observation path.
- No unapproved fan-out, cost, notification, message, device, or data mutation occurred.

## After Use Deposition

If the run produced a reusable approval gate, correlation rule, cleanup pattern, stop condition, or edge case, update this skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise report that no skill update is needed.
