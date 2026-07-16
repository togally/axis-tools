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
- each level-1 overview is a compact external-business-capability panorama (`对外业务能力与接口实现`): the model derives every evidence-backed external business capability, gives each one an independent `3.N` group with fixed `3.N.1/.2/.3` order, a short business-description table, an atomic business-only Mermaid graph and compact implementation steps; hidden machine tables retain `api_id`, complete contracts and stable parent `table_id` values;
- `user_journey_design_status`, `user_journey_coverage` and `user_journey_gap_id` are authoring and capture controls kept in the overview header and gap evidence; do not render a reader-facing `用户旅程覆盖契约` chapter;
- every level-1 overview records `table_design_status=detailed|not_applicable`, `table_design_coverage=complete|partial|not_applicable` and `table_design_gap_id=<stable_gap_id>|not_applicable` in hidden metadata. Its visible `表结构设计` chapter shows only business objects, useful physical-table locations, relationships and business-relevant fields; the hidden inventory equals the Section 3 step-ID union and retains exact ER/field trace;
- level-1 overviews never copy request/response dictionaries, full call chains, Mapper/Repository detail, per-interface governance or test matrices. Compact secondary documents expose interface summaries while hidden machine comments own complete interface-local code, data-touchpoint, governance and verification trace;
- `business_id` is a mapping from a secondary capability to implementation/business evidence, not a document boundary;
- repeated rows or evidence with the same level-1 capability are merged into one document rather than producing parallel detailed designs;
- upstream/downstream is a project-wide derived relationship, never a per-overview guess: the dependency graph is the unique machine source, and every level-1 overview contains only its direct incoming and outgoing projection;
- no global business detailed-design duplicate;
- global documents explain shared structure and boundaries; level-1 overviews explain external business capabilities, cross-secondary handoffs, professional terminology and business-data summaries; secondary documents expose six compact reader sections and retain complete interface-owned code, data-touchpoint, quality and verification evidence in machine comments;
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

## OSS Upload Confirmation Gate

Run this gate only after local project-knowledge validation succeeds. It does not change the selected operating mode and never makes publishing implicit.

1. Establish upload readiness without an external write.
   - Run `axis validate-config --repo <repo>` and require a resolved Axis v0.2 `oss_profile`.
   - Check that every environment-variable name returned in `required_env` is present in the current process. Never read, print or log credential values, and never ask the user to paste them.
   - Create a fresh local snapshot with `axis project-knowledge-capture --repo <repo>`, then run `axis oss-publish --repo <repo> --run-id <run_id> --dry-run`.
   - If the available OSS integration supports it, use only a read-only remote access or policy probe. Never test write permission by creating, overwriting or deleting an OSS object before confirmation.
   - Record exactly one readiness state: `oss_upload_readiness=unavailable|ready`. `ready` requires valid OSS configuration, required credential variables, current-task permission to invoke the publish action after confirmation, a public-safety-clean capture and a passed dry-run. Credential presence, a read-only probe and dry-run do not prove that remote OSS write IAM will succeed; report that residual risk explicitly.
2. If readiness is `unavailable`, keep the result local, report the missing configuration, credential, permission or preflight condition, and do not ask a misleading upload question.
3. If readiness is `ready`, record `oss_upload_decision=pending|approved|declined`, show the exact `run_id`, `target_prefix`, file count and redaction count, and ask one direct yes/no question: `检测到 OSS 配置和上传条件，是否将本次项目知识快照上传到 <target_prefix>？`
   - End the turn and wait for the answer. Do not upload in the same turn that asks for confirmation.
   - Silence, timeout, ambiguity, or authorization from an older run is not consent.
4. Only explicit approval for that exact `run_id` and `target_prefix` changes the decision to `approved`. Then use `$axis-ops-oss-publish` to execute the real upload. On rejection, set the decision to `declined`, keep the snapshot local and do not ask again unless the run or target changes or the user requests it.
5. After an authorized upload, verify `publish.status=published`, `_sync/manifest.json`, Dashboard/catalog current paths and archive traceability. If remote OSS IAM rejects the write, report the failure and keep the local snapshot; do not broaden permissions or retry destructively.

## Markdown Table Readability Contract

Reader-facing Markdown horizontal tables have at most six columns and contain only compact, atomic values. A record containing several prose-heavy business fields uses its own `项目 / 内容` vertical table. Stable IDs, coverage controls, full repository paths and machine trace fields stay in named HTML comments; do not expose them merely to preserve a capture schema. Escape literal pipe characters inside cells. Dashboard horizontal scrolling is only a rendering fallback; it does not make a wide source table valid.

## Reader Profiles

Use `reader_profile=compact` by default. The level-1 overview exposes only six useful sections: boundary, secondary navigation, external business flows, business semantics, business-data summary and actionable gaps; validation and evidence indexes remain machine metadata. A secondary detail exposes exactly these six reader sections: `1. 能力定位与边界`, `2. 调用主体、权限与接口矩阵`, `3. 能力流程`, `4. 对象与规则`, `5. 接口摘要`, and `6. 缺口`.

Treat existing compact headings `能力级流程与跨接口关系`, `业务对象、状态与规则`, `接口详细设计` and `覆盖缺口` as compatible aliases during reconciliation; normalize newly generated documents to the six titles above without forcing a content-only revision of otherwise current documents.

Use `reader_profile=strict_full` only when the evidence set is complete and the user explicitly needs audit-level contract detail. In that optional profile, each interface may expand to `5.N.1` through `5.N.8`; the compact profile must not render those eight subsections, complete field dictionaries, coverage panels, lifecycle fields or machine trace tables. Both profiles keep the same hidden identities and evidence anchors, so compact does not mean untraceable.

Compatibility switch: historical strict documents without `reader_profile` remain grandfathered and are not rewritten only to add the field. Every newly generated or materially reconciled document must declare `reader_profile=compact` or `reader_profile=strict_full`. Selecting the optional full expansion requires changing metadata to `reader_profile=strict_full`; never leave compact metadata on full reader content. Atomic-diagram rules apply to both new profiles: one semantic layer per diagram and one concrete call per method node.

## Secondary Capability Granularity Contract

One secondary capability owns one independently reviewable business outcome. / 一个二级能力只承载一个可独立命名、评审和演进的业务结果，并保持内聚的主要角色、权限与数据边界、权威状态和生命周期。独立入口或触发、独立用户可见结果、独立状态机、独立治理权限或可单独演进的事务边界，都是继续拆分的证据。像“发布、互动、发现、举报与治理”这样枚举多个目标的能力必须拆开；同一个 Controller、Service、目录或 `business_id` 不能作为保持合并的理由。反过来，不得按 Controller/Service/Mapper 技术层、每个方法或每张表机械拆分；多个方法共同完成同一业务结果时仍属于同一二级能力。

Run the project-wide inventory granularity gate before selecting affected documents. This gate applies to `bootstrap`, `scan_and_reconcile` and `requirement_design`: a reviewed, unchanged or currently out-of-scope inventory row is not grandfathered when its evidence shows a compound boundary. Read and apply the selected [boundary_matrix_v3_1 prompt](references/secondary-capability-boundary-matrix-v3.1.md).

1. Build atomic evidence cards for every current inventory row and every uncovered entrypoint. Record actor, trigger, business object, authoritative state change, visible result, permission/data scope, transaction/compensation/governance boundary and exact evidence ID.
2. Run the selected outcome-first partition independently of document generation. Every evidence ID appears exactly once. Record `must_split`, `must_merge`, the proposed secondary capability, cohesion reason and legacy `business_id` disposition.
3. Split different independently governable results, lifecycles, authorities, compensation/arbitration boundaries or independently evolving behavior. Keep technical steps, aliases, inverse state operations, owner-scoped object lifecycle operations and query/analysis variants together when they serve one business result under the same authority and data scope.
4. Run separate under-merge and over-split reviews. Reject enumeration-style aggregates such as “下单、履约、退款与售后”; also reject one-method-one-capability partitions that lack an independent business outcome.
5. Record `secondary_granularity_gate=locked`, `secondary_granularity_prompt=boundary_matrix_v3_1`, the audited inventory revision, evidence count, resulting capability count and legacy dispositions. Do not generate or reconcile detailed-design documents until the secondary-capability boundary inventory is locked.

For reader-facing brevity, document status, revision, stable IDs, coverage controls, gap IDs, confidence and source commit live in hidden authoring metadata rather than the visible introduction. Reader-facing evidence shows only the file basename, line range and symbol; the complete repository-relative `path:begin-end#symbol` remains in an `axis-evidence` HTML comment for capture and audit. Keep only fields that affect a business decision, permission/data scope, state, amount/quantity/time, sensitive handling, user-visible result or failure semantics; omit generic response wrappers, pagination boilerplate, trace fields and infrastructure-only DTO fields from reader-facing tables.

One diagram uses one semantic layer. A business diagram contains atomic business actions, decisions, states or visible results; an implementation diagram contains concrete method calls and atomic decisions. Never mix business nodes with code-method nodes in the same diagram. Each node expresses one unit only: do not combine a method name with prose such as “接收与校验”, combine Repository/entity/table with a read/write action, or merge success and failure outcomes in one node. Use separate nodes and directional edges for sequence, branching and results.

## Evidence Collection Rules

Scan and connect:

- routes, API specifications, commands, events, jobs and consumers;
- controllers, handlers, resolvers and adapters;
- pages, screens, menus, permissions and feature flags;
- application/domain services, workers and integrations;
- entities, DTOs, repositories, mappers, migrations and schemas;
- unit, integration, contract, end-to-end and benchmark tests;
- runtime configuration, deployment descriptors and accepted docs.

Record repository-relative paths, symbols, supported conclusions, confidence and verification time. For a secondary detailed design, keep one complete `path:begin-end#symbol` anchor in hidden `axis-evidence` metadata for every implemented API entrypoint, code object relation, applicable mapper/repository and entity/table hop, and test; show readers only `FileName:begin-end#symbol`. Names alone do not prove a capability, policy, permission, state, threshold, transaction, compensation rule or external contract.

Before rendering each level-1 overview, resolve and record these machine-checkable states:

- `user_journey_design_status=detailed` (the only allowed value);
- `user_journey_coverage=complete|partial`;
- `user_journey_gap_id=<stable_gap_id>|not_applicable`.
- `table_design_status=detailed|not_applicable`;
- `table_design_coverage=complete|partial|not_applicable`;
- `table_design_gap_id=<stable_gap_id>|not_applicable`.

Store the journey and table-design controls once in hidden authoring metadata and repeat only actionable gap conclusions in the visible gap section. Do not render control lines as reader-facing header data or duplicate them elsewhere.

Also record exactly one dependency projection control line with `dependency_graph_status=pending_level1_completion|derived`, `dependency_graph_revision=<not_derived_or_revision>` and `dependency_graph_gap_id=<stable_gap_id>|not_applicable`. Read [level1-capability-dependency-graph-template.yaml](references/level1-capability-dependency-graph-template.yaml). The project-level graph gate is mandatory:

1. Build and reconcile every level-1 overview and every owning secondary design first. If any overview has `user_journey_coverage=partial` or any child has `interface_coverage=partial`, keep the graph at `pending_level1_completion`, set `derivation_revision=not_derived`, use one stable graph gap, keep `edges: []`, and write `not_derived` for both upstream and downstream in every overview.
2. Only after all level-1 and secondary documents are complete, perform one 项目级统一模型梳理 over the complete inventory and all current overviews/child traces. Write the canonical `business/level1-capability-dependency-graph.yaml` before updating any overview projection.
3. Each derived edge has a stable `edge_id`, `from_level1_capability_id`, `to_level1_capability_id`, `relation_type`, `stage`, summary, source/target `journey_ids` and/or `api_ids`, exact code or canonical-document evidence refs and confidence. The graph may contain multiple direct incoming edges, multiple direct outgoing edges and evidence-backed staged reverse relationships; reject self edges, unknown nodes, duplicate edge IDs and duplicate `(from,to,relation_type,stage)` relations. Preserve every `edge_id` in the business-architecture Mermaid/tree rendering so it can be checked against the canonical graph.
4. For each overview, upstream is exactly the source set of its 直接入边 and downstream is exactly the target set of its 直接出边. Use `[]` only after derivation proves no direct neighbor; `not_derived` means the global analysis has not run. Do not confuse document navigation with dependency direction.
5. A level-1 capability, boundary or relationship-evidence change invalidates local projections. Return the graph and all overview projections to pending, then rerun the project-wide model synthesis and batch update them; never patch one overview independently.

For the level-1 external-business-flow section, scan all declared secondary capabilities and connected pages, menus, routes, APIs, events, jobs, commands and tests, then identify each distinct capability from the actual user goal and visible result. Do not use a fixed list or one representative endpoint per module. Compact may present these flows without `3.N` grouping, but every shown hop names a real entry, shows short Controller/Handler and Service/UseCase locations, binds them to exact hidden anchors, and uses atomic business-only diagrams. `strict_full` and grandfathered no-profile strict documents retain sequential `3.N.1 业务说明`, `3.N.2 二级能力与接口实现逻辑`, `3.N.3 实现步骤`; their hidden trace binds `journey_id`, `step_id`, `secondary_capability_id`, `api_id`, parent `table_id`, `读取数据` and `写入/产生数据`. Do not invent a page, button or user gesture when only backend evidence exists.

In `strict_full` or grandfathered no-profile strict documents, one `journey_id` may cross multiple secondary capabilities; every participating child repeats it as `level1_journey_id` and binds the local `flow_id` and/or `api_id`. Compact may retain these machine bindings when available but does not fail for lacking complete parent/child journey expansion.

When journey coverage controls exist, `complete` means every evidence-backed external business capability in scope is represented and `partial` requires an explicit actionable gap. Compact keeps field contracts and implementation trace hidden behind interface summaries; they become reader-visible only in optional `strict_full`.

Section 4 is `业务语义`, not a shared-governance catalog. It defines the level-1 capability's actual professional terms with the fixed fields 专业术语, 定义, 适用场景与边界, 易混淆术语及区别, 关联二级能力 and 权威来源/证据. Security, release, quality and operational governance do not belong in this terminology section.

Section 5 of a compact level-1 overview is a business-data summary: business objects, useful physical-table locations, business-relevant fields, relationships and short evidence. Stable `table_id`, `api_id`, relation IDs and full paths stay hidden. `strict_full` and grandfathered no-profile strict documents additionally require the complete ER diagram, `ER 关系证据`, per-step 读写 `table_id` bindings and the exact table-ID union. Only exact repository evidence permits `table_design_status=not_applicable`.

Before rendering each secondary document, resolve and record these machine-checkable states in hidden authoring metadata:

- `interface_design_status=detailed|not_applicable` and `interface_coverage=complete|partial|not_applicable`.

The default secondary document has exactly six visible sections: capability boundary; caller/permission/entry matrix; capability flow; objects and rules; interface summaries; gaps. Section 2 shows only 主体/角色, 所需权限/策略, 可调用接口/能力 and 数据范围; the hidden machine row retains `api_id` and `授权证据` with full authorization anchors. Each row represents one subject-to-interface relation. Every interface summary has at least one matrix binding, and no matrix row references an absent interface. Use real permission codes, `authenticated`, `public`, trusted-boundary policies or evidence-backed ownership checks; record concrete tenant, organization, shop, resource or public-data scope. Generic permissions or scope text and inferred roles are invalid. Missing authorization evidence is an explicit stable gap.

`detailed` interface design still requires a concrete HTTP path, event/topic, job or command; business-relevant inputs and outputs; failure semantics; authorization; data impact; observable acceptance; and exact implementation evidence. In compact mode, Section 5 is grouped by contract and renders one short interface summary per contract; IDs, full implementation chains and governance detail remain machine trace. `strict_full` is the optional audit profile: Section 5 is grouped by contract and expands `接口清单与代码追溯`, `内部处理逻辑`, `请求字段`, `响应字段`, `错误码与异常映射`, `认证与授权执行`, `事务、并发、性能与容错`, and `安全、测试与验收`; the second contract ends at `5.2.8`. Both profiles show only fields that change validation, permission/data scope, business state, amount/quantity/time, sensitive handling, user-visible output or failure semantics. Generic wrappers, pagination boilerplate, trace fields and infrastructure-only DTO fields are summarized by model name. Any method diagram contains exactly one concrete method call per node; business meaning, inputs, results and errors belong on edges or in adjacent prose.

When an interface reads or writes persisted data, record the actual mapper/repository, entity/table, parent level-1 `table_id`, keys, data changes and governing constraints in hidden interface evidence. The parent `table_id`, physical table and `api_id` must agree with the level-1 machine step and business-data summary; only an exact no-persistence anchor permits `not_applicable`. Add relationship, field, index or migration detail to `strict_full` only when it materially governs that interface; do not duplicate the complete level-1 model as a secondary top-level chapter.

## bootstrap

1. Establish source baseline and language.
2. Write `architecture/technical.md` using [project-technical-architecture-template.md](references/project-technical-architecture-template.md).
3. Write `architecture/business.md` using [project-business-architecture-template.md](references/project-business-architecture-template.md).
4. Run the project-wide granularity gate with the selected [boundary_matrix_v3_1 prompt](references/secondary-capability-boundary-matrix-v3.1.md), lock the boundary inventory, then write `business/inventory.yaml` with stable, unique `level1_capability_id` values; each item contains `level1_capability_name` and a complete, granularity-reviewed `secondary_capabilities` array, and each secondary item contains its `business_ids` mapping. Split independent outcomes even when they share one Controller or aggregate legacy `business_id`; record the legacy aggregate as history rather than mapping it ambiguously to many current children.
5. Create `business/level1-capability-dependency-graph.yaml` in pending state from [level1-capability-dependency-graph-template.yaml](references/level1-capability-dependency-graph-template.yaml), with the complete node set, no edges and one graph gap.
6. Write one compact `business/capabilities/{level1_capability_id}/detailed-design.md` per unique level-1 capability using [business-capability-detailed-design-template.md](references/business-capability-detailed-design-template.md). It links every secondary capability, derives one `3.N` per actual external business capability, uses business-only atomic diagrams, exposes only business-relevant data summaries, and keeps journey/table/dependency IDs plus exact traces hidden. Until the graph gate passes, its dependency projection stays `not_derived`.
7. Write one compact six-section `business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md` using [secondary-capability-detailed-design-template.md](references/secondary-capability-detailed-design-template.md) for every inventory secondary capability. Do not select `strict_full` without complete evidence and an explicit reader need.
8. When all parent and child coverage is complete, run one model synthesis, derive the project graph and batch-project direct incoming/outgoing neighbors into every level-1 overview. Otherwise retain the pending graph and explicit gap.
9. Write `gaps/doc-gap-report.md` and project metadata.
10. Validate role separation, counts, links, graph/projection equality, evidence and lifecycle state.

Do not generate feature documents, task records or version records in this pass.

## scan_and_reconcile

1. Audit the complete current inventory and uncovered entrypoints with the project-wide granularity gate; do not limit this boundary pass to the requested or code-changed level-1 capability.
2. Lock the resulting secondary-capability inventory and legacy dispositions before classifying documents as current, stale, conflicting, duplicated, orphaned or reusable evidence.
3. Resolve every usable design to exactly one `level1_capability_id`; then map its features and evidence to one or more locked `secondary_capability_id` values and their `business_ids`. Stop on `zero_matches` or `multiple_matches` instead of guessing.
4. Archive affected canonical documents before changing them.
5. Reconcile the compact level-1 overview and each affected compact secondary document. The overview retains every secondary link, one independent section per external business capability, atomic business diagrams, short method locations, professional terminology and business-data summaries. Each child exposes only its six reader sections while hidden machine comments retain complete interface-local flows, objects, call chains, data effects, quality evidence and the same parent `journey_id` and `table_id` values.
6. If any graph input or capability relationship changed, archive the current graph and every overview whose projection will change, return them to pending, then run one global model synthesis only after the complete parent/child gate passes. Update the graph first and all overview projections as one batch.
7. Create reviewed global revisions only when capability changes alter shared boundaries, value streams, system structure or cross-cutting principles.
8. Preserve superseded documents and record disposition, revision links, metadata, inventory refs and gaps.

## requirement_design

1. Normalize requirement goal, actors, scope, non-goals, outcome, constraints, acceptance and confirmed decisions.
2. Resolve exactly one owning `level1_capability_id` and at least one `secondary_capability_id`; retain associated `business_ids` as evidence mappings. Stop on absent or ambiguous ownership.
3. Use `$axis-doc-development` when code-changing discovery or `master_draft` approval is required.
4. Write the requirement design under:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/requirements/{requirement_id}/detailed-design.md
```

5. Update every participating secondary document and the level-1 overview's owning `3.N` business-capability section, implementation steps, table design, navigation and impact summary rather than duplicating the requirement body or secondary implementation detail.
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
- Secondary-capability actor, permission, state ownership, internal flow or persisted-data touchpoint: update the owning secondary document, any affected level-1 `3.N` business-capability section or coverage gap, the level-1 table inventory/ER/field design when applicable, its summary/link in the overview, and inventory when identity or mapping changes.
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
- `secondary_granularity_gate=locked` and `secondary_granularity_prompt=boundary_matrix_v3_1` exist for the audited inventory revision; every evidence ID is assigned exactly once, every legacy aggregate has a disposition, and the under-merge and over-split reviews pass before any detail document is generated;
- every secondary capability satisfies the granularity contract: one independently reviewable business outcome with cohesive actors, state ownership and lifecycle; enumerated independent outcomes are split and technical layers are not treated as capabilities;
- select the validation profile first: explicit `compact` uses compact checks, explicit `strict_full` uses full checks, and a historical strict document without `reader_profile` is grandfathered under the previous full contract;
- every compact level-1 and secondary document has exactly six visible chapters, real HTTP/EVENT/TOPIC/JOB/COMMAND entries, short `FileName:begin-end#symbol` locations bound to exact hidden repository paths, atomic single-layer diagrams, explicit actionable gaps and complete parent/adjacent navigation; no visible lifecycle, coverage, stable-ID or full-path panels remain;
- compact does not require `3.N` grouping, complete parent/child journey expansion, table-ID unions or visible `5.N.1` through `5.N.8` sections. When compact machine metadata retains journey, table or interface controls, validate their values and referenced anchors without promoting them into reader content;
- `strict_full` and grandfathered no-profile strict documents retain the previous full checks: sequential `3.N.1`/`3.N.2`/`3.N.3`, parent `journey_id` to child `level1_journey_id` plus `flow_id`/`api_id` binding, complete Controller/Handler and Service/UseCase `path:begin-end#symbol` anchors, `读取数据`, `写入/产生数据`, parent `table_id` unions, full ER evidence, and one sequential `5.N.1` through `5.N.8` expansion per interface;
- every inventory `secondary_capabilities` item appears exactly once in its level-1 navigation and links to its canonical child document; level-1 readers never receive copied interface-local field dictionaries or full call chains;
- business architecture links to every level-1 overview; every overview returns to business architecture and links to adjacent overviews; every secondary document returns to its overview and links to adjacent secondary documents;
- every `business_id` maps to exactly one secondary capability unless an explicit reviewed exception is recorded;
- metadata, inventory refs, document revisions and gap report agree;
- every factual claim has evidence or appears under assumptions/missing evidence;
- documents have distinct roles and no duplicated reader-facing paragraphs;
- every modified document has a pre-change archive and valid SHA-256 metadata;
- Mermaid renders and no unresolved filler, template variable or unselected optional block remains;
- reader-facing metadata is hidden, evidence labels use only file basename plus line range and symbol, and every diagram uses one semantic layer with atomic business or method nodes; every method node is exactly one concrete method call;
- every reader-facing horizontal Markdown table has at most six columns; records with long code paths, evidence or prose are vertical or split by a stable ID rather than compressed into narrow columns;
- no credentials, private URLs, raw logs, account identifiers or customer data are exposed;
- local validation completes before the OSS Upload Confirmation Gate;
- when `oss_upload_readiness=ready`, the skill asks exactly once and waits; OSS synchronization occurs only after `oss_upload_decision=approved` for the exact run and target;
- after an authorized OSS synchronization, the latest published `_sync/manifest.json` defines the current document structure; manually refresh Dashboard and verify legacy paths are absent from the current list while their archived revisions remain traceable.

## Handoff

Report mode, generated/revised paths, affected `level1_capability_id`, `secondary_capability_id`, and `business_id` values, user-journey and table-design coverage states and gap IDs, inventory and architecture revisions, archive records, evidence coverage, confidence boundaries, gaps, validation commands, `oss_upload_readiness`, `oss_upload_decision` and residual risk. Use `$axis-doc-drift-capture` after implementation or PR completion for task/version records and remaining drift classification.

## After Use Deposition

If the run reveals reusable domain-resolution, architecture-impact, archive, validation or gap-handling improvements, update this bundle, validate it and refresh the local installation. Otherwise report that no reusable skill change is needed.
