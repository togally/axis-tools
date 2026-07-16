---
name: axis-code-arch-optimize
description: Use when repeated local implementations should become one shared cross-cutting architecture capability. / 用于多处局部实现需要沉淀为统一横切架构能力时。
---

# Architecture Optimization

Promote behavior into a shared layer only when evidence shows a reusable boundary. Preserve contracts, keep private business rules local, and prove migration with focused tests.

## When to Use

- The same policy or mechanism appears across services, controllers, jobs, listeners, clients, or modules.
- Consistency requires one owner for validation, idempotency, retry, cache, permission, telemetry, mapping, lifecycle, or fallback behavior.
- The user explicitly asks for middleware, an adapter, wrapper, annotation, shared contract, or reusable component.

## Do Not Use

- Do not lift a genuinely isolated defect or one-method cleanup without reuse evidence.
- Use `$axis-code-bugfix` when the primary result is repairing one observed failure.
- Use `$axis-code-api-performance-tuning` when the primary result is measured latency improvement.
- Use `$axis-doc-development` for architecture design only when no implementation is requested.
- Do not create a parallel framework merely to standardize naming or style.

## Inputs

- Repeated call sites and the duplicated policy or mechanism.
- Existing module boundaries, dependency direction, public contracts, tests, and repository conventions.
- Required variation between callers, lifecycle ownership, rollout and rollback needs, and migration scope.
- Acceptance criteria for shared behavior and for behavior that must remain business-specific.

## Three-Step Work Contract

1. Co-create the architecture target. Confirm ownership, affected call sites, public contract, allowed migration, and rollback boundary.
2. Execute the result. Add the smallest shared capability, migrate a representative caller first, then migrate only agreed callers.
3. Verify the result. Run contract tests, boundary tests, migration tests, and adjacent regressions; report what moved and what intentionally stayed local.

## Light Adversarial Review

Keep review at or below 30% of the interaction. Challenge speculative abstraction, reversed dependencies, private-business leakage, hidden lifecycle ownership, unbounded defaults, missing rollback, and migrations with no representative proof. Once the architecture boundary is supported by evidence, implement rather than continuing abstract debate.

## Architecture Boundary

Choose one owning layer before editing:

- Domain or application layer: business orchestration, invariants, request shape, and authorization.
- Shared middleware: reusable cross-cutting mechanics used by multiple modules.
- Adapter or client: external protocols, serialization, retries, and fallbacks.
- Infrastructure or configuration: runtime switches, conservative defaults, metrics, and lifecycle.

Lift only the stable mechanism. Keep product-specific decisions, status rules, and private business policy in the owning business module.

## Workflow

1. Describe the duplication or inconsistent policy in one sentence and enumerate evidence-bearing call sites.
2. Define the smallest shared API and dependency direction that match the repository style.
3. Write failing contract tests plus a boundary test that prevents private-module dependency.
4. Add failure-mode checks for disabled switches, invalid inputs, empty results, cleanup, and rollback where relevant.
5. Implement the shared mechanism and migrate one representative caller.
6. Verify behavior and operational ownership, then migrate remaining agreed callers incrementally.

## Outputs

- Chosen architecture boundary and the evidence supporting it.
- Shared API or component, migrated callers, and intentionally local behavior.
- RED/GREEN contract, boundary, migration, and regression evidence.
- Runtime switches, limits, metrics, cleanup, rollout, and rollback notes where applicable.

## Safety and Boundaries

- Shared modules must not import private business modules or encode one endpoint, table, tenant, or customer as the abstraction.
- Preserve existing contracts unless the user explicitly authorizes a change and migration.
- Defaults must be conservative and bounded; stateful components need lifecycle and cleanup ownership.
- Do not mix unrelated refactors into the migration or silently migrate unreviewed callers.
- Keep user-owned local changes intact and stage only the intended architecture scope.

## Checks

- Contract tests prove the shared public behavior.
- Boundary tests prove dependency direction and absence of private-business coupling.
- Migration tests prove at least one real caller uses the shared capability.
- Failure, cleanup, disabled, and rollback paths are covered where relevant.
- The report distinguishes completed migrations from deferred callers and residual rollout risk.

## After Use Deposition

If the work produced a reusable boundary rule, migration check, lifecycle pattern, or failure case, update this skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise report that no skill update is needed.
