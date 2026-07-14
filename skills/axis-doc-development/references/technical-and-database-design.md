# Technical and Database Design

## Technical Solution vs Detailed Design

Use two internal output modes without separate top-level skills:

- `technical_solution`: decision-oriented; explains final business intent, architecture choices, boundaries, alternatives, guarantees, failure policy, rollout and rollback.
- `detailed_design`: implementation-oriented; explains modules, interfaces, states, algorithms, transactions, concurrency, data mappings, errors, observability and tests.

Both should describe the approved target. Include current-versus-target comparison only for an iteration, migration or explicit correction task.

## Level-1 Panorama vs Secondary Detailed Design

The retained capability hierarchy has two deliberately different design depths:

| Layer | Reader question | Required depth | Must not contain |
| --- | --- | --- | --- |
| Level-1 `business_capability_detailed_design` | 哪些用户/角色为了什么目标怎样操作，主要后台入口如何承接，读取或产生什么数据，用户最终看到什么？ | A complete `用户业务操作全景`: interface/entry, exact Controller/Handler and Service/UseCase anchors, read/write or produced-data summary, user-visible result, evidence and child link | Field dictionaries, full call chains, Mapper/Repository detail, ER models, indexes/constraints, transaction/concurrency or compensation detail, and test matrices |
| `secondary_capability_detailed_design` | 每条一级旅程在模块内部如何完整实现和持久化？ | Complete business and internal code flow, field-level interface contract, Mapper/Repository and entity/table mapping, ER, fields, indexes, transactions, consistency, errors, compensation and flow-to-test traceability | A disconnected design that cannot identify its parent level-1 journey |

Every level-1 overview records `user_journey_design_status=detailed`, `user_journey_coverage=complete|partial`, and `user_journey_gap_id=not_applicable` for complete coverage or a stable non-empty gap ID for partial coverage. Its fixed fields are `journey_id`, 用户/角色, 所属二级能力/模块, 提供的业务, 用户目标, 用户怎么操作, 接口/入口, `Controller/Handler`, `Service/UseCase`, 读取数据, 写入/产生数据, 用户可见结果, 二级能力详情 and 证据. Every declared secondary capability has at least one journey row. Each listed row requires concrete repository-relative `path:begin-end#symbol` anchors for both Controller/Handler and Service/UseCase, even when coverage is partial. `partial` tracks additional unlisted journeys; it does not permit an empty secondary capability or incomplete listed rows.

The level-1 `journey_id` crosses the layer boundary unchanged. The owning secondary document repeats it as `level1_journey_id`, binds it to the corresponding `flow_id` and/or `api_id`, and expands the full entry-to-data and test trace. The two layers' journey-ID sets must match in both directions, and level-1 `complete` requires every child interface coverage to be `complete`. Do not duplicate secondary implementation content into the panorama, and do not publish a secondary flow that cannot identify its parent journey.

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

## Default Secondary Detailed-Design Structure

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

Section 3 is titled `能力级流程与跨接口关系` and records only capability-level orchestration among multiple interfaces, events, topics, jobs or commands: ordering, trigger relationships, cross-contract state handoff and compensation. It does not use one generic actor-to-API diagram to stand in for an individual contract's internal behavior. When no cross-contract orchestration exists, say so and point readers to the corresponding `5.N.2` subsections.

Before that flow design, keep Section 1 as a short `能力定位与边界` and use Section 2 as the only authoritative `调用主体、权限与接口矩阵`. Its fixed fields are 主体/角色, 所需权限/策略, `api_id`, 可调用接口/能力, 数据范围 and 授权证据. One row answers “who may invoke which contract under what policy and scope.” Every Section 5 API is covered, every matrix API and interface exactly matches Section 5, and permissions or scopes use concrete evidence rather than generic “authorized flow” prose. `5.N.1` may summarize the caller, but `5.N.6` is limited to the code-level enforcement mechanism so it does not become a second role inventory.

For every material secondary flow, colocate a concrete processing summary and a readable Mermaid flow/sequence/state diagram or compact step table with its owning Section 5 contract, plus one end-to-end row linking: `level1_journey_id` → business rule/state → API or entrypoint → controller/handler → service/use case → mapper/repository → entity/table → test. Include an ER-style relation diagram for persisted entities and a code-object relation diagram for the entrypoint-to-data path. Mark a missing internal hop as `missing_evidence`; do not infer it. A missing secondary hop does not weaken the level-1 rule that both Controller/Handler and Service/UseCase anchors must be concrete before a journey is listed there.

Within Section 5, organize contracts by interface rather than by field type. Each HTTP interface, EVENT/TOPIC, JOB or COMMAND is a direct `### 5.N` group and owns exactly these same-prefix subsections:

1. `#### 5.N.1 接口清单与代码追溯`: a compact `项目 / 内容` table for `level1_journey_id`, `api_id`, contract type, complete path/topic/entry, purpose, caller, models and status, followed by an `实现层 / 精确定位 / 职责` table for Controller/entry, Service/use case, Mapper/Repository, entity/table and test;
2. `#### 5.N.2 内部处理逻辑`: a concrete summary naming the applicable entry/trigger, validation, Service/UseCase orchestration, key decisions, data reads/writes, output/state/result event and failure/recovery behavior, followed by at least one actual Mermaid diagram or compact step table; generic nodes and retained template placeholders are invalid;
3. `#### 5.N.3 请求字段`;
4. `#### 5.N.4 响应字段`;
5. `#### 5.N.5 错误码与异常映射`;
6. `#### 5.N.6 认证、授权、幂等与事务`.

The numeric prefix follows its parent: a `### 5.2` contract uses `5.2.1` through `5.2.6`. Never replace these groups with one horizontal interface inventory and global logic, request, response or error sections. For EVENT/TOPIC, internal logic covers consumption, validation/deduplication, use-case processing, persistence/publication and acknowledgement or failure handling; request means envelope/key/payload and response means acknowledgement, a result event or evidence-backed one-way semantics. For JOB/COMMAND, internal logic covers trigger context, selection/locking, execution, checkpoint/result and retry/compensation; request means execution context/parameters and response means execution result/status. A contract with no field or direct response records an explicit `not_applicable` row with reason and exact evidence; it does not leave the subsection empty.

## Interface and Persistence Applicability Gate

Every secondary-capability detailed design records four machine-checkable states before expansion:

- `interface_design_status=detailed|not_applicable`;
- `interface_coverage=complete|partial|not_applicable`;
- `persistence_design_status=detailed|not_applicable`;
- `relationship_model_status=relational|single_table|not_applicable`.

For `interface_design_status=detailed`, interface design is mandatory and includes a concrete HTTP path, event/topic, job or command; per-contract internal processing logic, 请求字段, 响应字段, 错误码与异常映射, authorization, idempotency and transaction behavior; and exact entry-to-test anchors. `interface_coverage=partial` requires a stable gap ID. Use interface-level `not_applicable` only with a reason and exact repository evidence; use field-row `not_applicable` when a real contract has no request field, direct response or applicable control in one dimension.

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
