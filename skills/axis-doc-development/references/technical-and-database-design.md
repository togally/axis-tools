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
| Level-1 `business_capability_detailed_design` | 本一级能力对外逐项提供什么业务，每项业务如何由一个或多个二级能力通过接口实现，使用了哪些表以及表间关系如何？ | One model-derived `3.N` group per external business capability, with vertical business description, secondary-node/interface-edge Mermaid and per-hop vertical trace; professional terminology; mandatory table inventory, ER and per-table physical-column dictionary | Request/response field dictionaries, full call chains, Mapper/Repository implementation, per-interface transaction/concurrency/compensation detail, and test matrices |
| `secondary_capability_detailed_design` | 每条一级旅程由哪些接口承接，每个接口内部如何执行、保护和验收？ | Complete business and internal code flow, field-level interface contract, code trace, transactions, concurrency, performance, fault tolerance, security, tests and observable acceptance for every contract | A disconnected design that cannot identify its parent level-1 journey, or global quality/test chapters that obscure the owning interface |

Every level-1 overview records the journey controls once in the header plus `table_design_status=detailed|not_applicable`, `table_design_coverage=complete|partial|not_applicable` and `table_design_gap_id=not_applicable|<stable_gap_id>` once at the start of Section 5. Its fixed reader structure is 1 边界, 2 二级导航, 3 对外业务能力与接口实现, 4 业务语义, 5 表结构设计, 6 缺口, 7 校验 and 8 导航证据. The model derives every actual external business capability and creates one sequential `3.N` group with exactly one `3.N.1`, `3.N.2` and `3.N.3` in that fixed order. `3.N.1` uses exactly `journey_id`, 用户/角色, 提供的业务, 用户目标, 用户怎么操作, 用户可见结果, 参与二级能力 and 证据 in a vertical table. `3.N.2` organizes the actual Mermaid around secondary-capability nodes; each `api_id` plus complete HTTP/event/job/command contract is the label on its implementation edge, never a standalone node, and multiple secondaries connect in implementation-step order. `3.N.3` gives every hop a separate vertical table with `step_id`, `secondary_capability_id`, `api_id`, 接口/入口, Controller/Handler, Service/UseCase, 读取数据, 写入/产生数据, 读写 `table_id`, 二级能力详情 and 证据. Controller/Handler and Service/UseCase use concrete repository-relative `path:begin-end#symbol` anchors. Each step lists one or more stable parent `table_id` values; only exact no-persistence evidence permits `not_applicable`.

One level-1 `journey_id` may cross several secondary capabilities. Every participating child repeats it as `level1_journey_id`, binds its own hop to a `flow_id` and/or `api_id`, and expands the full entry-to-code/data-touchpoint/test trace inside that contract's Section 5 group. Cross-secondary handoff is already expressed in the parent `3.N` graph and steps, so no independent cross-secondary chapter is generated.

Section 4 uses the fixed professional-term fields 专业术语, 定义, 适用场景与边界, 易混淆术语及区别, 关联二级能力 and 权威来源/证据. Section 5 detailed mode is fixed as `5.1 表清单`, `5.2 ER 图`, `5.2.1 ER 关系证据`, then continuous physical-table-titled subsections from `5.3`. It uses `table_id | 物理表名 | 业务实体/用途 | 所属二级能力 | 读写 api_id | 证据`, an evidence-backed ER whose entities use actual physical table names, and one `table_id`-controlled field table with `字段 | 类型 | 可空 | 默认值 | 键/约束 | 业务语义 | 读写 api_id | 证据` per table. The inventory-ID set equals exactly the deduplicated union of Section 3 step table IDs. With multiple tables, the fixed `ER 关系证据` table uses `relation_id | 主表 table_id | 关系/基数 | 从表 table_id | 关联键 | 业务语义 | 证据`, covers every table and has exact relationship evidence; a single-table design explicitly states `ER 关系证据：not_applicable（单表，无需跨表关系）`. Only exact no-persistence evidence permits the retained Section 5 `not_applicable` reason/evidence branch.

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

1. `能力定位与边界`
2. `调用主体、权限与接口矩阵`
3. `能力级流程与跨接口关系`
4. `业务对象、状态与规则`
5. `接口详细设计`, with one complete eight-subsection group per HTTP interface, event/topic, job or command
6. `代码对象与关系`
7. `风险、假设与缺失证据`
8. `文档导航与证据索引`

The default secondary document must not add top-level `## 实体、表与对象关系`, `## 表结构设计`, `## 事务、并发、性能与容错`, `## 安全、测试与验收`, or `## 端到端追溯矩阵` sections. The latter three concerns are not deleted: transaction/performance/fault tolerance belongs to each `5.N.7`, security/test/acceptance belongs to each `5.N.8`, and traceability belongs to `5.N.1` plus `5.N.8`. The parent level-1 Section 5 owns the complete table inventory, ER and field dictionaries; every child interface still records its local Mapper/Repository, entity/physical table, matching parent `table_id`, key and data-change trace in `5.N.1` and `5.N.2`. Every `5.N.1` “实体/表” row contains the same parent `table_id` value or values as its owning level-1 step, or exact-evidence `not_applicable` when the interface has no persisted-data read/write.

Section 3 is titled `能力级流程与跨接口关系` and records only capability-level orchestration among multiple interfaces, events, topics, jobs or commands: ordering, trigger relationships, cross-contract state handoff and compensation. It does not use one generic actor-to-API diagram to stand in for an individual contract's internal behavior. When no cross-contract orchestration exists, say so and point readers to the corresponding `5.N.2` subsections.

Before that flow design, keep Section 1 as a short `能力定位与边界` and use Section 2 as the only authoritative `调用主体、权限与接口矩阵`. Its fixed fields are 主体/角色, 所需权限/策略, `api_id`, 可调用接口/能力, 数据范围 and 授权证据. One row answers “who may invoke which contract under what policy and scope.” Every Section 5 API is covered, every matrix API and interface exactly matches Section 5, and permissions or scopes use concrete evidence rather than generic “authorized flow” prose. `5.N.1` may summarize the caller, but `5.N.6 认证与授权执行` is limited to the actual annotation, filter/interceptor, policy, ownership or scope-enforcement path so it does not become a second role inventory.

For every material secondary flow, colocate a concrete processing summary and a readable Mermaid flow/sequence/state diagram or compact step table with its owning Section 5 contract. `5.N.1` traces `level1_journey_id` and `api_id` through the entrypoint, controller/handler, service/use case, mapper/repository, touched entity/physical table plus parent `table_id`, and test; `5.N.8` records the observable acceptance result and exact test evidence or target plan. The code-object relation diagram remains at capability level only when it clarifies dependencies. Mark a missing internal hop as `missing_evidence`; do not infer it. A missing secondary hop does not weaken the level-1 rule that both Controller/Handler and Service/UseCase anchors must be concrete before a journey step is listed there.

Within Section 5, organize contracts by interface rather than by field type. Each HTTP interface, EVENT/TOPIC, JOB or COMMAND is a direct `### 5.N` group and owns exactly these same-prefix subsections:

1. `#### 5.N.1 接口清单与代码追溯`: a compact `项目 / 内容` table for `level1_journey_id`, `api_id`, contract type, complete path/topic/entry, purpose, caller, models and status, followed by an `实现层 / 精确定位 / 职责` table for Controller/entry, Service/use case, Mapper/Repository, entity/physical table plus the same parent `table_id` value or values as the level-1 step (or exact-evidence `not_applicable`), and test;
2. `#### 5.N.2 内部处理逻辑`: a concrete summary naming the applicable entry/trigger, validation, Service/UseCase orchestration, key decisions, data reads/writes, output/state/result event and failure/recovery behavior, followed by at least one actual Mermaid diagram or compact step table; generic nodes and retained template placeholders are invalid;
3. `#### 5.N.3 请求字段`;
4. `#### 5.N.4 响应字段`;
5. `#### 5.N.5 错误码与异常映射`;
6. `#### 5.N.6 认证与授权执行`: concrete authentication entry, permission/policy enforcement, ownership or data-scope check and exact evidence, consistent with the authoritative Section 2 matrix;
7. `#### 5.N.7 事务、并发、性能与容错`: transaction/consistency boundary, idempotency, concurrency/locking, capacity and latency assumptions, timeout/retry/compensation, degradation and observable signals;
8. `#### 5.N.8 安全、测试与验收`: non-authorization security controls, privacy/audit where applicable, test type and scenario, expected observable result, exact test evidence or an explicit target plan.

The numeric prefix follows its parent: a `### 5.2` contract uses `5.2.1` through `5.2.8`. Never replace these groups with one horizontal interface inventory or global logic, request, response, error, governance, quality or test sections. For EVENT/TOPIC, internal logic covers consumption, validation/deduplication, use-case processing, persistence/publication and acknowledgement or failure handling; request means envelope/key/payload and response means acknowledgement, a result event or evidence-backed one-way semantics. For JOB/COMMAND, internal logic covers trigger context, selection/locking, execution, checkpoint/result and retry/compensation; request means execution context/parameters and response means execution result/status. A contract with no field, direct response or applicable control records an explicit `not_applicable` row with reason and exact evidence; it does not leave the subsection empty.

## Interface Applicability Gate

Every secondary-capability detailed design records two machine-checkable interface states before expansion:

- `interface_design_status=detailed|not_applicable`;
- `interface_coverage=complete|partial|not_applicable`.

For `interface_design_status=detailed`, interface design is mandatory and includes a concrete HTTP path, event/topic, job or command; all eight per-contract subsections; exact entry-to-test anchors; and explicit evidence-backed handling for inapplicable fields or controls. `interface_coverage=partial` requires a stable gap ID. Use interface-level `not_applicable` only with a reason and exact repository evidence; use subsection-row `not_applicable` when a real contract has no request field, direct response or applicable control in one dimension.

## Optional Deeper Standalone Database Design

The parent level-1 capability document always contains its evidence-backed table inventory, ER and per-table physical-column dictionary, or the evidence-backed no-persistence `not_applicable` branch. This baseline is not optional. It is never duplicated as a default secondary-document chapter; secondary interfaces retain only their local `table_id` and data-touchpoint trace.

Create an additional standalone database-design deliverable only when the user explicitly requests a separately reviewable DBDD, migration/release package, DBA/compliance review or equivalent deeper database scope. Those needs may justify recommending the additional document, but they do not authorize it without the explicit request.

When requested, include:

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

Every table, field, enum, constraint and index claim must come from approved target decisions or DDL/migration/ORM/mapper/query evidence. Separate response-only and computed fields from stored columns. Link the standalone document from affected level-1 Section 5 entries and secondary `5.N.1` or `5.N.7` subsections; do not copy its release-level detail into every secondary document.

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
