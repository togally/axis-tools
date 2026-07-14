---
name: axis-doc-project-knowledge
description: Use when a repository needs its first Axis v0.2 project knowledge set or existing global, capability-overview, secondary-design, inventory, navigation, and gap documents must be reconciled after requirements or implementation changes. / 用于首次生成 Axis v0.2 项目知识集，或在需求与实现变化后梳理更新全局架构、能力总览、二级详细设计、业务清单、导航和文档缺口。
---

# Project Knowledge Lifecycle

Use this skill for project-wide knowledge bootstrap and multi-capability maintenance. Use `$axis-doc-development` for a single feature or requirement; invoke this skill when the work must create or reconcile the project-level knowledge system around those documents.

## Operating Modes

Choose exactly one:

| Mode | Trigger | Output |
| --- | --- | --- |
| `bootstrap` | The repository has no complete Axis v0.2 project knowledge set. | Global technical and business architecture, capability inventory, one overview per `level1_capability_id`, one detailed design per secondary capability, gap report, and metadata. |
| `scan_and_reconcile` | Project knowledge exists but capability/global designs may be missing, duplicated, stale or conflicting. | Reconciled capability overviews and independently reviewable secondary designs, reviewed global revisions where impact exists, inventory/metadata updates, dispositions and gaps. |
| `requirement_design` | A requirement must be assigned to one level-1 and one secondary capability and its project-wide impact summarized. | Requirement design/navigation under the owning level-1 capability plus justified capability/global revisions and traceability. Use `$axis-doc-development` when discovery and a `master_draft` are required. |

Do not use this for one isolated export, one feature correction with no project-level impact, task/version capture, code implementation, document approval, or implicit publishing.

## Boundary and Invariants

Required project knowledge:

- `project_technical_architecture`;
- `project_business_architecture`;
- `business_inventory`;
- one project-level `level1_capability_dependency_graph` at `business/level1-capability-dependency-graph.yaml`;
- one `business_capability_detailed_design` for every unique `level1_capability_id`;
- one `secondary_capability_detailed_design` for every declared `secondary_capability_id`;
- `doc_gap_report`;
- `project_knowledge_metadata`.

Invariants:

- one canonical overview per level1_capability_id;
- each level-1 overview contains every secondary capability as a summary and link; each secondary capability owns one independent detailed-design document;
- each level-1 overview is a complete user business-operation panorama (`用户业务操作全景`), not an implementation detailed design: it covers every evidence-backed user/role operation and stops at Controller/Handler, Service/UseCase, read/write or produced-data summary, user-visible result, and the canonical secondary-document link;
- `user_journey_design_status`, `user_journey_coverage` and `user_journey_gap_id` are authoring and capture controls kept in the overview header and gap evidence; do not render a reader-facing `用户旅程覆盖契约` chapter;
- level-1 overviews never copy field dictionaries, full call chains, Mapper/Repository detail, transaction/concurrency detail or test matrices; secondary documents own the interface-local code, data, governance and verification detail inside each `5.N` contract group;
- `business_id` is a mapping from a secondary capability to implementation/business evidence, not a document boundary;
- repeated rows or evidence with the same level-1 capability are merged into one document rather than producing parallel detailed designs;
- upstream/downstream is a project-wide derived relationship, never a per-overview guess: the dependency graph is the unique machine source, and every level-1 overview contains only its direct incoming and outgoing projection;
- no global business detailed-design duplicate;
- global documents explain shared structure and boundaries, level-1 overviews explain the user business-operation panorama, navigation and cross-secondary handoff summaries, and secondary documents contain complete local business plus interface-owned code, data, quality and verification design;
- unsupported claims remain assumptions, `missing_evidence`, `low_confidence` or `conflict`;
- documents remain `review` until explicit human approval;
- approved documents are superseded by new reviewed revisions, never silently rewritten.

## Three-Step Work Contract

1. Co-create the project-knowledge target.
   Confirm repository, organization, project, language, mode, source baseline, public-safety boundary, inventory revision, affected `level1_capability_id` and `secondary_capability_id` values, output paths, and authorization to create reviewed revisions.
2. Execute the selected mode.
   Scan repository evidence, generate or reconcile global architecture, capability inventory, level-1 documents, metadata and gaps. For changed canonical documents, archive them through `$axis-doc-development` before modification.
3. Verify and report.
   Validate document count, canonical paths, evidence traceability, role separation, revision links, archive records, Mermaid, public safety, metadata/inventory consistency and gap disposition.

Keep light adversarial review below 30% of the interaction. Challenge invented capability boundaries, missing secondary capabilities, ambiguous `business_id` mapping, business rules, permissions, states, tables, interfaces, code locations, architecture claims or false completeness; then proceed decisively once evidence and decisions are sufficient.

## Evidence Collection Rules

Scan and connect:

- routes, API specifications, commands, events, jobs and consumers;
- controllers, handlers, resolvers and adapters;
- pages, screens, menus, permissions and feature flags;
- application/domain services, workers and integrations;
- entities, DTOs, repositories, mappers, migrations and schemas;
- unit, integration, contract, end-to-end and benchmark tests;
- runtime configuration, deployment descriptors and accepted docs.

Record repository-relative paths, symbols, supported conclusions, confidence and verification time. For a secondary detailed design, use `path:begin-end#symbol` anchors for every implemented API entrypoint, code object relation, applicable mapper/repository and entity/table hop, and test. Names alone do not prove a capability, policy, permission, state, threshold, transaction, compensation rule or external contract.

Before rendering each level-1 overview, resolve and record these machine-checkable states:

- `user_journey_design_status=detailed` (the only allowed value);
- `user_journey_coverage=complete|partial`;
- `user_journey_gap_id=<stable_gap_id>|not_applicable`.

Also record exactly one dependency projection control line with `dependency_graph_status=pending_level1_completion|derived`, `dependency_graph_revision=<not_derived_or_revision>` and `dependency_graph_gap_id=<stable_gap_id>|not_applicable`. Read [level1-capability-dependency-graph-template.yaml](references/level1-capability-dependency-graph-template.yaml). The project-level graph gate is mandatory:

1. Build and reconcile every level-1 overview and every owning secondary design first. If any overview has `user_journey_coverage=partial` or any child has `interface_coverage=partial`, keep the graph at `pending_level1_completion`, set `derivation_revision=not_derived`, use one stable graph gap, keep `edges: []`, and write `not_derived` for both upstream and downstream in every overview.
2. Only after all level-1 and secondary documents are complete, perform one 项目级统一模型梳理 over the complete inventory and all current overviews/child traces. Write the canonical `business/level1-capability-dependency-graph.yaml` before updating any overview projection.
3. Each derived edge has a stable `edge_id`, `from_level1_capability_id`, `to_level1_capability_id`, `relation_type`, `stage`, summary, source/target `journey_ids` and/or `api_ids`, exact code or canonical-document evidence refs and confidence. The graph may contain multiple direct incoming edges, multiple direct outgoing edges and evidence-backed staged reverse relationships; reject self edges, unknown nodes, duplicate edge IDs and duplicate `(from,to,relation_type,stage)` relations. Preserve every `edge_id` in the business-architecture Mermaid/tree rendering so it can be checked against the canonical graph.
4. For each overview, upstream is exactly the source set of its 直接入边 and downstream is exactly the target set of its 直接出边. Use `[]` only after derivation proves no direct neighbor; `not_derived` means the global analysis has not run. Do not confuse document navigation with dependency direction.
5. A level-1 capability, boundary or relationship-evidence change invalidates local projections. Return the graph and all overview projections to pending, then rerun the project-wide model synthesis and batch update them; never patch one overview independently.

`detailed` requires the fixed user-journey table fields: `journey_id`, 用户/角色, 所属二级能力/模块, 提供的业务, 用户目标, 用户怎么操作, 接口/入口, Controller/Handler exact `path:begin-end#symbol`, Service/UseCase exact anchor, 读取数据, 写入/产生数据, 用户可见结果, 二级能力详情 and 证据. Scan all declared secondary capabilities and connected pages, menus, routes, APIs, events, jobs and commands; every declared secondary capability must have at least one fully anchored journey row, while one representative interface per module does not satisfy complete coverage. Every listed journey requires concrete Controller/Handler and Service/UseCase `path:begin-end#symbol` anchors. `complete` means every evidence-backed user business operation in that scope is represented and uses `user_journey_gap_id=not_applicable`. `partial` means additional journeys remain unlisted and requires a non-empty stable `user_journey_gap_id` in the overview and gap report, with the uncovered operation/evidence, searched scope, impact and remediation; it never permits an empty secondary capability or `missing_evidence` / `not_applicable` in place of either anchor on a listed row. Do not invent a page, button or user gesture when only backend evidence exists.

The level-1 table summarizes only the exact Controller/Handler and Service/UseCase anchors plus read/write or produced-data and the user-visible result. Field-level contracts, the complete implementation chain, applicable Mapper/Repository and entity/table anchors, transactions, concurrency, compensation, security, tests and observable acceptance remain in the owning secondary document's `5.N` contract group.

Each level-1 `journey_id` is also a cross-layer traceability key. The owning secondary document must repeat the same identifier as `level1_journey_id` and bind it to a matching `flow_id` and/or `api_id`, then expand the internal entry-to-data and test trace. The parent and child journey-ID sets must match in both directions: a level-1 journey without that same-ID child expansion, or a child journey without a same-ID parent row, is invalid. A level-1 overview marked `complete` also requires `interface_coverage=complete` in every child.

Before rendering each secondary document, resolve and record these machine-checkable states:

- `interface_design_status=detailed|not_applicable` and `interface_coverage=complete|partial|not_applicable`.

Section 1 is a concise `能力定位与边界`; identity fields already declared in the document header are not repeated as a vertical table. Section 2 is the authoritative `调用主体、权限与接口矩阵` with the fixed fields 主体/角色, 所需权限/策略, `api_id`, 可调用接口/能力, 数据范围 and 授权证据. Each row represents one subject-to-interface relation. Every Section 5 `api_id` has at least one matrix row, matrix interfaces exactly equal their Section 5 contracts, and no matrix row references an absent interface. Use real permission codes, `authenticated`, `public`, trusted-boundary policies or evidence-backed ownership checks; record concrete tenant, organization, shop, resource or public-data scope. Generic permissions or scope text and inferred roles are invalid. Missing authorization evidence is an explicit stable gap.

`detailed` interface design requires a concrete HTTP path, event/topic, job or command; its internal processing logic; field-level request and response contracts; error mapping; authentication and authorization execution; transaction, concurrency, performance and fault-tolerance behavior; security, tests and observable acceptance; and exact implementation evidence. Section 5 is grouped by contract rather than by field type: every direct `### 5.N` interface/event/job/command owns exactly `#### 5.N.1 接口清单与代码追溯`, `5.N.2 内部处理逻辑`, `5.N.3 请求字段`, `5.N.4 响应字段`, `5.N.5 错误码与异常映射`, `5.N.6 认证与授权执行`, `5.N.7 事务、并发、性能与容错`, and `5.N.8 安全、测试与验收`. `5.N.1` summarizes the caller consistently with Section 2 and records the complete entry-to-implementation and applicable data/test trace. `5.N.6` records the actual authentication, permission, tenant, resource and data-scope enforcement without redefining who has access. `5.N.7` records transaction boundaries, consistency, idempotency, concurrency control, performance/capacity evidence, timeout, retry, compensation, degradation and explicit gaps. `5.N.8` records security/privacy/audit controls, concrete test cases or plans, exact test anchors and observable acceptance results. Every `5.N.2` contains a concrete processing summary plus either an actual Mermaid flow/sequence/state diagram or a compact step table; it names the applicable validation, use-case orchestration, decision branches, data reads/writes, result/state/event and failure/recovery behavior, and never retains generic nodes or template placeholders. The subsection prefix must match its parent, so the second contract uses `5.2.1` through `5.2.8`. Section 3 is explicitly titled `能力级流程与跨接口关系` and is reserved for capability-level relationships across contracts; when no cross-contract orchestration exists it says so and points to each `5.N.2` instead of rendering a generic actor-to-API diagram. Do not flatten multiple contracts into one wide table or global logic/request/response sections. Do not add default capability-level chapters for entity/table relationships, table structure, transaction/quality governance or end-to-end traceability; interface-owned facts belong in the corresponding `5.N` group. `partial` coverage requires a stable gap identifier. `not_applicable` requires a reason and an exact repository evidence anchor; a fieldless or one-way contract uses an explicit evidence-backed `not_applicable` row instead of an empty subsection.

When an interface reads or writes persisted data, record the actual mapper/repository, entity/table, keys, data changes and governing constraints in its `5.N.1` and `5.N.2` evidence. Add relationship, field, index or migration detail only when it materially governs that interface or a proven cross-interface contract; do not synthesize a default ER model, table inventory or table-structure chapter.

## bootstrap

1. Establish source baseline and language.
2. Write `architecture/technical.md` using [project-technical-architecture-template.md](references/project-technical-architecture-template.md).
3. Write `architecture/business.md` using [project-business-architecture-template.md](references/project-business-architecture-template.md).
4. Build `business/inventory.yaml` with stable, unique `level1_capability_id` values; each item contains `level1_capability_name` and a complete `secondary_capabilities` array, and each secondary item contains its `business_ids` mapping.
5. Create `business/level1-capability-dependency-graph.yaml` in pending state from [level1-capability-dependency-graph-template.yaml](references/level1-capability-dependency-graph-template.yaml), with the complete node set, no edges and one graph gap.
6. Write one `business/capabilities/{level1_capability_id}/detailed-design.md` user business-operation panorama per unique level-1 capability using [business-capability-detailed-design-template.md](references/business-capability-detailed-design-template.md). It must list and link every secondary capability, populate the fixed journey fields for every covered operation, resolve `user_journey_design_status`, `user_journey_coverage` and any required `user_journey_gap_id`, and ensure each `journey_id` has a same-ID expansion in its owning secondary document. Until the graph gate passes, its dependency projection stays `not_derived`.
7. Write one `business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md` using [secondary-capability-detailed-design-template.md](references/secondary-capability-detailed-design-template.md) for every inventory secondary capability.
8. When all parent and child coverage is complete, run one model synthesis, derive the project graph and batch-project direct incoming/outgoing neighbors into every level-1 overview. Otherwise retain the pending graph and explicit gap.
9. Write `gaps/doc-gap-report.md` and project metadata.
10. Validate role separation, counts, links, graph/projection equality, evidence and lifecycle state.

Do not generate feature documents, task records or version records in this pass.

## scan_and_reconcile

1. Classify existing design documents as current, stale, conflicting, duplicated, orphaned or reusable evidence.
2. Resolve every usable design to exactly one `level1_capability_id`; then map its features and evidence to one or more `secondary_capability_id` values and their `business_ids`. Stop on `zero_matches` or `multiple_matches` instead of guessing.
3. Archive affected canonical documents before changing them.
4. Reconcile the single level-1 user business-operation panorama and each affected secondary document. The overview retains the complete summary/link matrix, every user/role operation, exact Controller/Handler and Service/UseCase anchors, data-result summaries and cross-secondary journey; each child owns its complete internal flows, objects, rules, interfaces, call chains, actual data effects and constraints, implementation mapping, transactions, quality controls and tests.
5. If any graph input or capability relationship changed, archive the current graph and every overview whose projection will change, return them to pending, then run one global model synthesis only after the complete parent/child gate passes. Update the graph first and all overview projections as one batch.
6. Create reviewed global revisions only when capability changes alter shared boundaries, value streams, system structure or cross-cutting principles.
7. Preserve superseded documents and record disposition, revision links, metadata, inventory refs and gaps.

## requirement_design

1. Normalize requirement goal, actors, scope, non-goals, outcome, constraints, acceptance and confirmed decisions.
2. Resolve exactly one owning `level1_capability_id` and at least one `secondary_capability_id`; retain associated `business_ids` as evidence mappings. Stop on absent or ambiguous ownership.
3. Use `$axis-doc-development` when code-changing discovery or `master_draft` approval is required.
4. Write the requirement design under:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/requirements/{requirement_id}/detailed-design.md
```

5. Update the owning secondary document and the level-1 overview's journey row, navigation and impact summary rather than duplicating the requirement body or secondary implementation detail.
6. Revise global business or technical architecture only when the impact matrix justifies it.
7. Update inventory, metadata, traceability and gap records.

## Canonical Layout

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/metadata.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/technical.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/business.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/inventory.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/level1-capability-dependency-graph.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/gaps/doc-gap-report.md
```

Archive history stays under `.axis/docs/_archive/` and must not appear as a second current document.

## Architecture Impact Rules

- Local feature/API/data detail: update the owning feature/requirement and its `secondary_capability_detailed_design`.
- Secondary-capability actor, permission, state ownership or internal flow: update the owning secondary document, any affected level-1 journey row or coverage gap, its summary/link in the overview, and inventory when identity or mapping changes.
- Level-1 boundary, value stream, shared business object or governance rule: create a reviewed `project_business_architecture` revision.
- Level-1 upstream/downstream relation: never edit one overview directly; invalidate the canonical graph, rerun project-level model synthesis after all completeness gates pass, and batch-update every affected direct projection.
- System boundary, shared technical capability, deployment topology, cross-cutting consistency, security or performance principle: create a reviewed `project_technical_architecture` revision.

Do not copy capability-detail paragraphs into global documents. Reference `level1_capability_id` and `secondary_capability_id` values and add only shared conclusions, mappings and rationale.

## Missing Evidence Gate

- Non-core absence: record `missing_evidence`, searched scope, impact, required source and owner role.
- Unresolved core boundary, main flow, permission, authoritative state or business rule: stop that conclusion and request the exact source or decision.
- Conflicting evidence: show both references and request an approved resolution.
- No connected entrypoint and implementation: do not generate filler capability content.

## Lifecycle and Validation

Allowed lifecycle states include `draft`, `review`, `approved`, `completed`, `superseded`, `archived` and `rejected`. Content quality states include `missing`, `draft`, `review`, `approved`, `low_confidence`, `stale`, `blocked` and `not_applicable`.

Verify:

- unique first-level capability count equals overview document count;
- `business/level1-capability-dependency-graph.yaml` exists, its node set exactly equals inventory, pending state has no edges and one tracked gap, and derived state is allowed only after every level-1 and secondary design is complete;
- every level-1 overview has one dependency control line and one upstream/downstream projection sourced from the graph; pending uses `not_derived`, while derived upstream/downstream exactly equal the graph's direct incoming/outgoing sets and use `[]` only for a confirmed empty direct set;
- inventory secondary-capability count equals `secondary_capability_detailed_design` document count;
- every level-1 overview records `user_journey_design_status=detailed`, `user_journey_coverage=complete|partial`, and `user_journey_gap_id=not_applicable` for complete coverage or a stable non-empty gap ID for partial coverage;
- every level-1 overview uses the fixed user business-operation panorama fields and gives every declared secondary capability at least one fully anchored journey row; complete coverage includes every evidence-backed user/role operation, while a representative endpoint per module can support partial coverage only when all additional journeys have a stable gap;
- every listed level-1 journey has a unique `journey_id`, exact interface/entry, repository-relative Controller/Handler and Service/UseCase `path:begin-end#symbol` anchors, read-data summary, write/produced-data summary, user-visible result, evidence and canonical secondary-document link; neither anchor may use `not_applicable` or `missing_evidence`, and any journey that cannot meet the row contract remains unlisted under the partial-coverage gap;
- the level-1 `journey_id` set and owning-child `level1_journey_id` set match in both directions; each ID binds to a matching `flow_id` and/or `api_id` that expands within the same `5.N` group into complete implementation, applicable data and test evidence, and a complete level-1 overview has only children with complete interface coverage;
- level-1 overviews contain no field dictionaries, full call chains, Mapper/Repository detail, transaction/concurrency detail or test matrices; interface-local details occur only in the owning secondary document's `5.N` group;
- every inventory `secondary_capabilities` item appears exactly once in its level-1 completeness matrix and links to its canonical child document;
- every secondary document has a concise capability boundary and one authoritative caller-permission-interface matrix whose fixed fields concretely and bidirectionally cover every Section 5 `api_id`; it also has resolved `interface_design_status` and `interface_coverage`, capability-level cross-contract orchestration when applicable, and field-level interface design; every implemented hop is a repository-relative `path:begin-end#symbol` anchor or an explicit missing-evidence record; every Section 5 contract is an independent sequential `5.N` group with exactly `5.N.1` through `5.N.8`, including concrete internal processing, fields, errors, authentication/authorization execution, transaction/concurrency/performance/fault tolerance, and security/test/observable acceptance;
- persistence-impacting interfaces identify their actual mapper/repository, entity/table, keys, data changes and material constraints inside the owning `5.N` group; capability-wide ER, table-inventory, table-structure and top-level traceability chapters are not default requirements;
- business architecture links to every level-1 overview; every overview returns to business architecture and links to adjacent overviews; every secondary document returns to its overview and links to adjacent secondary documents;
- every `business_id` maps to exactly one secondary capability unless an explicit reviewed exception is recorded;
- metadata, inventory refs, document revisions and gap report agree;
- every factual claim has evidence or appears under assumptions/missing evidence;
- documents have distinct roles and no duplicated reader-facing paragraphs;
- every modified document has a pre-change archive and valid SHA-256 metadata;
- Mermaid renders and no unresolved filler remains;
- no credentials, private URLs, raw logs, account identifiers or customer data are exposed;
- local validation completes before optional project-knowledge capture or OSS dry-run;
- OSS synchronization occurs only with explicit authorization.
- after an authorized OSS synchronization, the latest published `_sync/manifest.json` defines the current document structure; manually refresh Dashboard and verify legacy paths are absent from the current list while their archived revisions remain traceable.

## Handoff

Report mode, generated/revised paths, affected `level1_capability_id`, `secondary_capability_id`, and `business_id` values, user-journey coverage states and gap IDs, inventory and architecture revisions, archive records, evidence coverage, confidence boundaries, gaps, validation commands and residual risk. Use `$axis-doc-drift-capture` after implementation or PR completion for task/version records and remaining drift classification.

## After Use Deposition

If the run reveals reusable domain-resolution, architecture-impact, archive, validation or gap-handling improvements, update this bundle, validate it and refresh the local installation. Otherwise report that no reusable skill change is needed.
