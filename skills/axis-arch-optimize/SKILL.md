---
name: axis-arch-optimize
description: Use when implementation work starts as method-level fixes but should become a shared architecture capability, middleware component, adapter, annotation, wrapper, or cross-cutting module.
---

# Axis Arch Optimize

## Purpose

Use this skill when an implementation request starts as a local method-level fix but the shape of the problem says it should become an architecture-level capability. The goal is to move repeated, cross-cutting behavior into the right shared boundary while preserving existing contracts and proving the change with focused checks.

## Use When

- The same pattern appears in multiple services, controllers, jobs, listeners, or clients.
- A one-method fix would copy policy, validation, retry, cache, permission, idempotency, telemetry, mapping, or error-handling logic.
- The user asks for a reusable component, middleware module, annotation, SDK wrapper, shared contract, or architecture-level optimization.
- The current fix would become harder to operate because each call site needs its own switch, limit, metrics, or fallback.

Do not use this for a genuinely isolated bug, a tiny local cleanup, or a change whose behavior depends entirely on one private business flow.

## Architecture Boundary First

Before editing code, identify the architecture boundary:

- Domain service: business-specific orchestration and invariants.
- Application service/controller: request shape, authorization, and user-facing contract.
- Middleware/shared module: cross-cutting policy used by multiple modules.
- Adapter/client layer: external systems, serialization, protocol, retries, and fallbacks.
- Infrastructure/config: runtime switches, environment policy, metrics, and operational defaults.

Only lift behavior upward when it removes real duplication or centralizes a policy that must be consistent. Keep business rules in the business module; move reusable mechanics into the shared layer.

## RED Checks

Write failing checks before implementation:

- Contract tests for the new public API, annotation, interface, wrapper, or component.
- Architecture tests that prove target call sites depend on the shared capability instead of duplicating logic.
- Boundary tests that prove business-specific behavior did not leak into the shared module.
- Migration tests for at least one existing call site.
- Failure-mode tests for disabled switches, fallback paths, invalid inputs, and empty results.
- Invalidation/cleanup tests when the component owns state, background work, or local resources.

If performance is part of the request, keep baseline and after measurements. Add a same-environment control when possible so architecture gains are not confused with deployment differences.

## Implementation Pattern

1. Describe the current duplication or local-only policy in one sentence.
2. Pick the smallest shared abstraction that fits the existing code style.
3. Add the shared API in the owning common, middleware, adapter, or infrastructure module.
4. Implement the mechanism behind that API without importing private business modules.
5. Migrate one representative call site first.
6. Add opt-in switches or per-call configuration only where callers truly need different policy.
7. Wire invalidation, lifecycle, metrics, and logging where the new component owns runtime behavior.
8. Migrate remaining call sites incrementally after the first path is green.

Prefer configuration objects, annotations, interfaces, decorators, or adapters that match the repository's existing patterns. Avoid creating a parallel framework.

## Review Checklist

- The shared layer has no dependency on private business module classes.
- The public API names describe the reusable concept, not one endpoint or table.
- Callers can tune the small set of policy values they actually need.
- Defaults are conservative and bounded.
- Existing behavior is preserved unless the user asked to change it.
- Tests prove both the shared component and at least one migrated call site.
- Operational behavior is documented in code or a short report: switches, limits, metrics, cleanup, and rollback.

## Output Contract

Report:

- The architecture boundary chosen and why.
- What moved from method-level logic into shared architecture.
- Which call sites were migrated.
- Which tests failed first and passed after.
- Any performance, reliability, or maintainability evidence.
- What intentionally stayed local because it is business-specific.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
