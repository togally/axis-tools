# Technical and Database Design

## Technical Solution vs Detailed Design

Use two internal output modes without separate top-level skills:

- `technical_solution`: decision-oriented; explains final business intent, architecture choices, boundaries, alternatives, guarantees, failure policy, rollout and rollback.
- `detailed_design`: implementation-oriented; explains modules, interfaces, states, algorithms, transactions, concurrency, data mappings, errors, observability and tests.

Both should describe the approved target. Include current-versus-target comparison only for an iteration, migration or explicit correction task.

## Technical Design Review

Verify:

- source of truth and ownership;
- shared flow versus branch-specific behavior;
- state transitions and invalid transitions;
- consistency, idempotency, concurrency and transaction boundaries;
- external dependency failure, retry, timeout, degradation and compensation;
- security, privacy, permissions and audit;
- performance assumptions, hot paths, capacity, metrics and alerts;
- rollout, compatibility, rollback and test scope.

Prefer implementation anchors over speculative class or method names. For implemented behavior, use the repository-relative form `path:begin-end#symbol` for every API entrypoint, service/use case, mapper/repository, entity mapping and test. Repository evidence governs current claims; the approved `master_draft` governs new target decisions.

## Default Detailed-Design Structure

1. Document Control and Evidence Baseline
2. Design Conclusion and Scope
3. Actors, Permissions, Business Flow and Logic Relations
4. Module Responsibilities, Code Objects and Dependencies
5. API, Event and Job Contracts with Entry-to-Implementation Traceability
6. State Model and Lifecycle
7. Domain Model, Entity/Table Relations and Data Mapping
8. Core Algorithms and Decision Rules
9. Transaction, Idempotency, Concurrency and Consistency
10. Error Handling, Retry, Timeout and Compensation
11. Security, Privacy and Audit
12. Performance, Capacity and Degradation
13. Observability and Operations
14. Compatibility, Migration, Rollout and Rollback
15. Tests, Acceptance, End-to-End Traceability, Assumptions and Risks

For every material flow, include a readable flow diagram and one end-to-end row linking: business rule/state → API or entrypoint → controller/handler → service/use case → mapper/repository → entity/table → test. Include an ER-style relation diagram for persisted entities and a code-object relation diagram for the entrypoint-to-data path. Mark a missing hop as `missing_evidence`; do not infer it.

## Interface and Persistence Applicability Gate

Every secondary-capability detailed design records four machine-checkable states before expansion:

- `interface_design_status=detailed|not_applicable`;
- `interface_coverage=complete|partial|not_applicable`;
- `persistence_design_status=detailed|not_applicable`;
- `relationship_model_status=relational|single_table|not_applicable`.

For `interface_design_status=detailed`, interface design is mandatory and includes a concrete HTTP path, event, job or command; 请求字段; 响应字段; 错误码与异常映射; authorization, idempotency and transaction behavior; and exact entry-to-test anchors. `interface_coverage=partial` requires a stable gap ID. Use `not_applicable` only with a reason and exact repository evidence.

For `persistence_design_status=detailed`, a relationship model is mandatory. Multi-table designs render real inventory table names and join fields and classify each edge as `physical_fk`, `logical_relation` or `external_reference`. Single-table designs render the real table entity even without an edge. 禁止使用 `BUSINESS_FLOW`、`API`、`RESULT`、`TABLE`、`ENTITY_A` 或 `ENTITY_B` 作为 ER 实体。No-schema-change in the current revision does not remove the obligation to describe the current persisted model. Use persistence `not_applicable` only with a reason and exact repository evidence.

## Database Design as Part of Detailed Design

Default to a data/database section inside the detailed design. Include:

- affected table inventory and responsibility;
- persisted versus derived fields;
- per-field type, nullability, default, meaning and validation;
- primary, unique and foreign-key-like constraints;
- logical relationships and ownership;
- query paths and matching indexes;
- states/enums and data lifecycle;
- tenant, audit, privacy, retention and deletion rules;
- migration order, backfill, compatibility and rollback;
- transaction and consistency implications.

Every table, field, enum, constraint and index claim must come from approved target decisions or DDL/migration/ORM/mapper/query evidence. Separate response-only and computed fields from stored columns.

## Standalone Database Document Gate

Create a separate database design document only when one or more are true:

- the schema spans multiple features or business domains;
- a full database/data dictionary is required;
- DBA, compliance or security review is independent;
- database changes release independently;
- DDL/migration ordering is itself a major deliverable;
- the user explicitly requests DBDD, ER documentation or a Word database design document.

Otherwise keep database design within the detailed design and link to migrations or DDL appendices.

## Standalone Database Document Shape

1. Document Control and Scope
2. Data Ownership and Conventions
3. Table Inventory
4. ER and Relationship Model
5. Per-Table Field Dictionary
6. Constraints and Index Dictionary
7. States, Enums and Derived Data
8. Lifecycle, Retention, Privacy and Audit
9. Query and Performance Design
10. DDL, Migration, Backfill and Rollback
11. Risks, Evidence and Acceptance
