# Discovery Interview and Master Draft

Load this reference for `planned_feature_generation` and `implemented_feature_iteration`.

## Interview Rules

- Ask one compact batch containing only material unresolved decisions.
- Start with user/product decisions; translate technical decisions into plain-language consequences.
- Do not ask the user to design indexes, transactions, capacity, or deployment unaided.
- When the user does not know, recommend one option and explain its trade-off, then offer at most two alternatives.
- Record a recommendation as decided only when the user accepts it.
- Preserve exact business terms, visible labels, formulas, states, thresholds, and acceptance wording supplied by the user.

## Decision Matrix

| Dimension | Resolve | Recommended guidance when unknown |
| --- | --- | --- |
| `product` | target user, problem, value, scope, non-goals, user-visible result, success measure | Recommend the smallest end-to-end outcome that proves user value and name deferred scope explicitly. |
| `market` | alternatives, differentiation, willingness to adopt/pay, compliance or channel constraints | Use only when it can change scope or acceptance; recommend a small evidence-gathering step instead of unsupported market certainty. |
| `business_flow` | actors, trigger, main path, branches, states, permissions, failure, recovery, compensation | Recommend one authoritative state owner and one visible recovery path for each material failure. |
| `architecture` | owning level-1/secondary capability, module boundary, shared capability, dependencies, sync/async split, consistency, rollout | Prefer existing repository boundaries and shared capabilities; introduce a new component only when evidence shows the old boundary cannot own the behavior safely. |
| `performance` | traffic/load model, latency, throughput, concurrency, data volume, hot path, capacity, degradation, observability | If no target exists, recommend a measurable initial SLO and state the workload assumptions instead of inventing production scale. |
| `database_design` | data owner, persisted/derived data, entities, relationships, constraints, indexes, retention, migration, rollback | Prefer normalized authoritative data plus explicit derived fields; recommend constraints from business uniqueness and indexes from evidenced query paths. |
| `api_and_integration` | callers, contracts, auth, idempotency, pagination, callbacks, retries, compatibility | Prefer stable contracts, explicit errors, idempotency for retries, and backward-compatible rollout. |
| `security_and_operations` | data sensitivity, permissions, audit, secrets, monitoring, alerting, support ownership | Apply least privilege, redact sensitive evidence, and define an owner plus actionable signals for each critical failure. |
| `delivery` | slices, dependencies, test evidence, migration, release, rollback | Recommend the smallest reversible slice with an observable acceptance result. |

## Prioritization

Ask in this order unless risk requires otherwise:

1. product goal, user, scope and non-goals;
2. actors, business flow, states, permissions and acceptance;
3. owning `level1_capability_id`, affected `secondary_capability_id` values and architecture boundary;
4. data/database and external contracts;
5. performance, security and operations;
6. market factors that materially affect the preceding decisions;
7. delivery slices, rollout and rollback.

Block expansion when product goal, owning level-1/secondary capability, main business flow, authoritative state, permission boundary, data owner, or acceptance meaning is unresolved. Other uncertainty may remain under assumptions with a named impact and confirmation owner.

## master_draft Structure

Use the following reader-facing structure:

1. Document Control
   - `requirement_id`, owning `level1_capability_id`, affected `secondary_capability_id` values, associated `business_ids`, mode, status, revision, source baseline, authorship and confirmation.
2. Design Conclusion
   - the outcome, user value, chosen direction, and intended document expansion set.
3. Product Definition
   - target users, problem, scope, non-goals, visible behavior and success measures.
4. Market Context
   - only when used; sources, alternatives, differentiation, constraints and explicit inferences.
5. Actors, Permissions and Business Flow
   - main path, branches, failures, recovery, compensation, states and decision tables.
6. Architecture Direction
   - ownership, boundaries, dependencies, reuse, consistency, async behavior, rollout and rollback.
7. Performance and Capacity
   - workload assumptions, SLOs, volume, hot paths, degradation, measurement and observability.
8. Data and Database Direction
   - ownership, persisted/derived fields, relationships, constraints, indexes, lifecycle, migration and rollback.
9. APIs and Integrations
   - callers, contracts, security, errors, idempotency, compatibility, retries and callbacks.
10. Security, Privacy, Audit and Operations
11. Acceptance and Test Intent
12. Delivery Slices
13. Decision Log
   - question, options, recommendation, user choice, rationale and date.
14. Assumptions, Risks and Unresolved Items
15. Expansion Plan
   - exact downstream documents and their purpose.

## Expansion Traceability

Each downstream document should name the `master_draft` path and revision in its evidence baseline. Maintain a compact mapping:

```yaml
master_draft_traceability:
  source_path: business/capabilities/{level1_capability_id}/requirements/{requirement_id}/master-draft.md
  source_revision: 1
  decisions:
    product_scope: accepted
    business_flow: accepted
    architecture_direction: accepted
    performance_target: accepted
    database_direction: accepted
  expanded_documents: []
```

Do not copy the entire master draft into every document. Expand the relevant decisions at the correct level and keep cross-references.
