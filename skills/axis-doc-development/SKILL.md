---
name: axis-doc-development
description: Use when a user needs to export, create, correct, or iterate development documents for an existing or planned feature, including discovery, master-draft expansion, design impact updates, and traceable archival. / 用于为已有或规划功能输出、生成、修正或迭代开发文档，并完成需求问询、原始稿扩写、设计影响更新与可追溯归档。
---

# Unified Development Documentation

Use this skill as the single front door for feature and development-document work. It owns feature resolution, discovery for code-changing work, `master_draft` creation, document-set expansion, technical and database design depth, affected project-knowledge updates, and pre-change archival.

Do not use retired top-level document generators. Their durable rules now live in this bundle's `references/` directory. Keep project facts in generated documents, never in this reusable public skill.

## Four Operating Modes

Classify every request as exactly one mode before writing:

| Mode | Use when | Required result |
| --- | --- | --- |
| `existing_feature_export` | The feature already exists and the user wants one or more documents describing the confirmed current or approved target behavior. | Resolve the feature, gather evidence, and output the requested document set. Do not change code or canonical documents unless requested. |
| `planned_feature_generation` | The feature is not implemented and its future implementation will add or modify code. | Run discovery, produce and confirm one `master_draft`, then expand the approved draft into the selected design documents. |
| `implemented_feature_correction` | The feature exists, but its retained document is missing, stale, or factually wrong while product behavior is not intentionally changing. | Resolve against code, archive every canonical document before modification, and correct the documents from evidence. If intended behavior or code must change, switch to `implemented_feature_iteration`. |
| `implemented_feature_iteration` | An implemented feature must change behavior and therefore needs code additions or modifications plus updated documents. | Run discovery, produce and confirm one `master_draft`, archive affected canonical documents, then generate iteration documents and reviewed revisions. |

If wording fits more than one mode, show the inferred mode and the evidence that determined it. Ask only when choosing the wrong mode would change code scope, archival behavior, or the deliverable.

## Inputs and Source Priority

Prefer, in order:

1. the user's latest confirmed requirement and literal business wording;
2. approved requirements and current canonical Axis project knowledge;
3. connected repository evidence from routes through tests;
4. existing draft/review documents;
5. explicit assumptions and recommendations.

Never present an assumption or market inference as confirmed product or repository behavior.

## Three-Step Work Contract

1. Co-create and resolve the target.
   Select the operating mode, run the Feature Resolution Confirmation Gate where applicable, and gather only the decisions needed for the mode. For `planned_feature_generation` and `implemented_feature_iteration`, run the structured discovery interview and obtain explicit approval of the `master_draft` before expansion.
2. Execute the document lifecycle.
   Archive each canonical document before its first modification, write the requested documents, update affected detailed/global project knowledge at the correct level, preserve canonical paths for current reading, and complete the configured OSS synchronization gate. This skill designs the change; implementation code starts only when the user separately authorizes execution.
3. Verify and report.
   Validate evidence, document structure, cross-document consistency, archive metadata and hashes, lifecycle status, links, diagrams, affected knowledge revisions, and the published OSS checksum/status. For a secondary detailed design, validate every material flow's traceability through API/entrypoint, code objects, entities/tables and tests with repository-relative `path:begin-end#symbol` anchors. For its level-1 overview, validate the fixed user business-operation panorama and same-ID linkage into the owning secondary document. Report current paths, archive paths, OSS run ID, assumptions, verification results, and any code work still awaiting authorization.

Keep light adversarial review below 30% of the interaction. Challenge guessed scope, hidden product decisions, unsafe architecture, unmeasured performance claims, broken business flows, weak schema choices, unjustified market assumptions, or silent overwrites. Once decisions are sufficient, become decisive and produce the artifacts.

## Feature Resolution Confirmation Gate

Read [feature-resolution-and-lifecycle.md](references/feature-resolution-and-lifecycle.md) before resolving an existing feature.

- `zero_matches`: do not invent an existing feature. Ask for a route, page, menu, symbol, API, table, event, job, screenshot, source path, or approved wording.
- `multiple_matches`: present two to five evidence-backed candidates and ask the user to select one.
- `confirmed_feature`: require a connected entrypoint-to-implementation match plus explicit user confirmation of the resolved target, its `level1_capability_id`, its `secondary_capability_id`, and associated `business_ids`.
- A planned feature may use `confirmed_planned_feature` only after the user confirms its name, owning level-1 capability, owning secondary capability, goal, non-goals, and acceptance boundary. Absence from code is expected in this mode.

The gate runs before creating or modifying a feature document.

## Detailed-Design Aggregation Contract

The retained detailed-design hierarchy uses a level-1 overview plus independently reviewable secondary-capability documents:

- use `business_capability_detailed_design` for the level-1 overview and `secondary_capability_detailed_design` for each child;
- create one overview document per level-1 capability and one detailed-design document per declared secondary capability;
- use `level1_capability_id` as the canonical document key and `level1_capability_name` as its reader-facing title;
- read the complete `secondary_capabilities` array from `business/inventory.yaml` before drafting;
- include every secondary capability in the level-1 overview as a summary and canonical link, even when only one secondary capability changed;
- give each `secondary_capability_id` an independent document containing its complete business and code design;
- keep `business_ids` inside the owning secondary-capability entry as traceability to business/implementation evidence; a `business_id` never creates another level-1 detailed-design document;
- when multiple inventory rows or evidence groups share the same level-1 capability, merge them into one overview and preserve every distinct secondary document;
- do not mark the hierarchy complete while any declared secondary capability, parent/child link, or adjacent-document navigation is missing, duplicated, or unresolved.

Default canonical path:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md
```

Feature and requirement documents live beneath that level-1 capability and identify the secondary capabilities they affect. Updating one feature revises the owning secondary document; the overview changes when its user-journey row, coverage state/gap, summary, shared design, boundary or navigation changes.

### Mandatory Level-1 User-Journey Contract

The level-1 `business_capability_detailed_design` is a `用户业务操作全景`, not an implementation detailed design. It records:

- `user_journey_design_status=detailed` as the only valid design-status value;
- `user_journey_coverage=complete|partial`;
- `user_journey_gap_id=not_applicable` for complete coverage or a stable non-empty gap ID for partial coverage.

Its fixed core table fields are `journey_id`, 用户/角色, 所属二级能力/模块, 提供的业务, 用户目标, 用户怎么操作, 接口/入口, `Controller/Handler`, `Service/UseCase`, 读取数据, 写入/产生数据, 用户可见结果, 二级能力详情 and 证据. Every declared secondary capability has at least one journey row. Every listed row, regardless of complete or partial coverage, requires concrete repository-relative `path:begin-end#symbol` anchors in both `Controller/Handler` and `Service/UseCase`; `missing_evidence`, `not_applicable`, class names and module names are not substitutes. `partial` means additional journeys remain unlisted and tracked by `user_journey_gap_id`, not that a declared secondary capability may be empty or a listed row may be incomplete. One representative endpoint per module is not complete panorama coverage, and UI actions must not be invented from backend-only evidence.

The overview stops at Controller/Handler, Service/UseCase, read/write or produced-data summary and the user-visible result. It must not copy field dictionaries, the full call chain, Mapper/Repository detail, ER models, indexes/constraints, transaction/concurrency or compensation detail, or test matrices. The owning `secondary_capability_detailed_design` expands those internal code-flow and persistence details.

Use the level-1 `journey_id` as a cross-layer traceability key. Its owning secondary document repeats the same value as `level1_journey_id`, binds it to the corresponding `flow_id` and/or `api_id`, and expands the entry-to-data and test trace. Parent and child journey-ID sets must match in both directions; never create unrelated or unpaired identifiers for the same user operation. If level-1 coverage is `complete`, every owning child must also declare `interface_coverage=complete`.

In each secondary document, Section 5 is organized by callable contract. Every HTTP interface, EVENT/TOPIC, JOB or COMMAND receives one direct `### 5.N` group with its own `#### 5.N.1 接口清单与代码追溯`, `5.N.2 请求字段`, `5.N.3 响应字段`, `5.N.4 错误码与异常映射`, and `5.N.5 认证、授权、幂等与事务`. Numbering follows the parent (`5.2` owns `5.2.1` through `5.2.5`), and the first subsection uses a compact `项目 / 内容` contract table plus a separate `实现层 / 精确定位 / 职责` table. Never flatten multiple contracts into one horizontal interface row or global field dictionaries. A genuinely fieldless, one-way or inapplicable item remains explicit with its reason and repository-relative evidence instead of an empty table.

## Discovery Interview for Code-Changing Work

For `planned_feature_generation` and `implemented_feature_iteration`, read [discovery-and-master-draft.md](references/discovery-and-master-draft.md) and ask one compact, prioritized batch covering these decision dimensions:

- `product`: target users, problem, value, scope, non-goals, visible behavior, success criteria;
- `architecture`: ownership, boundaries, dependencies, reuse, integration, consistency, rollout and rollback;
- `performance`: load shape, latency/throughput goals, data volume, hot paths, capacity, degradation and observability;
- `business_flow`: actors, main path, branches, states, permissions, failure, recovery and compensation;
- `database_design`: ownership, persisted/derived data, tables, fields, relationships, constraints, indexes, lifecycle and migration;
- `market`: alternatives, differentiation, pricing/compliance/channel constraints, only when they can materially change product scope or acceptance.

Do not demand that the user already knows technical answers. For every unresolved material decision:

1. explain why it matters in plain language;
2. offer a recommended option first;
3. give one or two alternatives with trade-offs;
4. record the user's choice, accepted recommendation, or unresolved status.

Skip irrelevant dimensions with a recorded reason. Market research that depends on current external facts requires current sources and citations; do not browse merely to decorate a design.

## master_draft and Expansion Gate

The `master_draft` is the single approved source for downstream documents in code-changing modes. It is not a loose brainstorming transcript.

Default path:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/requirements/{requirement_id}/master-draft.md
```

It must contain the final requirement framing, product conclusions, market conclusions when used, actors and business flow, architecture direction, performance targets, data/database direction, security and operations, acceptance criteria, non-goals, decision log, recommendations accepted by the user, assumptions, and unresolved items.

### Expansion Gate

1. Produce the complete `master_draft` first.
2. Show the user its design conclusion, decisions, recommendations, assumptions, and intended expansion set.
3. Ask for explicit approval or corrections.
4. Do not expand it into retained design documents until approval is present.
5. After approval, downstream documents must trace their claims to the approved `master_draft` plus repository evidence.

If the user corrects the draft, revise the draft first and repeat the gate once as a consolidated confirmation. Do not patch downstream documents independently from an outdated draft.

## Document Selection and Expansion

Select the smallest coherent set:

| Request or need | Output |
| --- | --- |
| Requirements or product boundary | `master_draft` and, when separately needed, requirements specification |
| 概要设计 / Overview / HLD | Overview design |
| Technical solution | Decision-oriented technical design |
| 详细设计 / Detailed design / LLD | One level-1 user business-operation panorama linking all declared secondary capabilities, plus one implementation-oriented detailed design per secondary capability |
| Database design | A detailed-design data section by default; standalone DBDD only for cross-domain schema, full data dictionary, independent DBA/compliance review, independent database release, or explicit request |
| API contract | API document |
| Material behavior or integration risk | Test plan |
| Release/operations need | Deployment or runbook document |
| Implemented feature iteration | Iteration design describing approved target, affected current contracts, compatibility, rollout, rollback, and required canonical revisions |

Read [technical-and-database-design.md](references/technical-and-database-design.md) for technical and schema depth. Read [feature-detailed-design-template.md](references/feature-detailed-design-template.md) for one-feature detailed-design structure.

## Output Formats

Default to one Markdown file per independently reviewable document. When the user requests Word/DOCX, create a real `.docx` with a cover, revision table, consistent heading levels, readable tables, page numbering and a table of contents when feasible; never rename Markdown to DOCX. Parse the generated file and render or visually inspect representative pages before delivery. Generate PDF or another retained format only when requested, while keeping the canonical Markdown/project-knowledge source when the repository requires it.

## Project-Knowledge Impact Updates

Generating a target document is not enough. Classify and apply its knowledge impact:

| Change impact | Required update |
| --- | --- |
| Formatting, wording, or evidence correction only | Target feature/requirement document only |
| Feature behavior, validation, API, state, transaction, or schema detail | Feature/requirement document plus the matching `secondary_capability_detailed_design`; also update the level-1 journey row and coverage state when any panorama field changes |
| Secondary-capability actor, permission, state ownership, or internal business flow | Owning secondary design, affected level-1 journey rows/coverage gaps and summary/link, `business_inventory`, and affected feature/requirement documents |
| Level-1 capability boundary, value stream, shared business object, or governance rule | Reviewed revision of `project_business_architecture` plus affected level-1 documents |
| System boundary, shared technical capability, deployment topology, cross-cutting consistency, security, or performance principle | Reviewed revision of `project_technical_architecture` plus affected capability/feature documents |

Do not rewrite global documents when the impact is local. Update `metadata.yaml`, document refs, revision links, `doc_gap_report`, and traceability when the repository uses Axis v0.2 project knowledge. Use `$axis-doc-project-knowledge` for whole-project bootstrap or multi-capability reconciliation, not as a second feature-document generator.

## Mandatory Pre-Change Archive

Read [document-archive-contract.md](references/document-archive-contract.md). Before modifying any existing canonical document:

1. run `scripts/archive_document.py` with the reason, request summary, source revision, and target revision;
2. verify the archived content hash matches the current file;
3. keep the current canonical path unchanged for normal readers;
4. place history only under `.axis/docs/_archive/`;
5. never mutate an `approved` document in place: archive it, create a new `review` revision, and record `supersedes`;
6. update current content only after archive verification succeeds.

If archival fails, stop the modification. A missing or failed archive is a blocking error, not a warning.

## Mandatory OSS Synchronization Gate

Axis Dashboard is OSS-first because one OSS catalog aggregates N organizations and projects, while a local repository represents only one working copy. Do not solve cross-project review by discovering or hard-coding every local repository.

For every Axis v0.2 repository where canonical project knowledge changed:

1. inherit an explicit project/user authorization for publish-on-change, or obtain it before the first external write;
2. validate configuration and create a fresh project-knowledge snapshot after the final local document write;
3. run `oss-publish --dry-run` and require zero public-safety, manifest, path, or credential errors;
4. upload the same immutable run and require `publish.status: published`;
5. refresh the Dashboard catalog and verify the OSS object size or checksum matches the snapshot before claiming completion.

```bash
axis validate-config --repo <repo>
axis project-knowledge-capture --repo <repo>
axis oss-publish --repo <repo> --run-id <run_id> --dry-run
axis oss-publish --repo <repo> --run-id <run_id>
```

The current local files remain the authoring source, but OSS is the default cross-organization review source. A local-only document change is incomplete after publish-on-change has been authorized. If OSS configuration, credentials, dry-run, upload, or checksum verification fails, retain the local snapshot, report the exact blocker, and do not describe Dashboard data as current. Never log credentials or expose them to the browser.

## Code-Change Boundary

This skill may establish that code must be added or modified, but document approval is not implementation authorization. After the expanded document set is approved, summarize the implementation slices, tests, migration, rollout, and rollback, then ask whether to execute. If authorized, hand off to the appropriate code/TDD workflow and later use `$axis-doc-drift-capture` for task/version evidence and residual document drift.

## Verification Checklist

- Exactly one operating mode is recorded.
- Existing-feature resolution is confirmed, or planned-feature ownership and boundary are explicitly confirmed with one `level1_capability_id` and at least one `secondary_capability_id`.
- Code-changing modes have a user-approved `master_draft` before expansion.
- Product, architecture, performance, business_flow, database_design, and applicable market decisions are answered, recommended-and-accepted, skipped with reason, or visibly unresolved.
- Every modified canonical document has a verified archive record created before modification.
- Every changed v0.2 project-knowledge set with publish-on-change authorization has a fresh snapshot, passing dry-run, `published` OSS status, and verified Dashboard OSS checksum/size.
- Current paths remain stable and archive paths stay under `_archive`.
- `approved` content is superseded by a new `review` revision rather than overwritten.
- There is exactly one current overview for the owning level-1 capability and one current detailed design per declared secondary capability; parent/child and adjacent-document navigation is complete.
- Every level-1 overview records `user_journey_design_status=detailed`, `user_journey_coverage=complete|partial`, and the correct `user_journey_gap_id`; complete coverage uses `not_applicable`, while partial coverage records unlisted journeys under a stable gap ID.
- Every declared secondary capability has at least one listed journey; every listed journey uses the fixed fields, has a unique `journey_id`, exact interface/entry, concrete Controller/Handler and Service/UseCase `path:begin-end#symbol` anchors, read/write or produced-data summary, user-visible result, evidence and a canonical secondary-document link; neither anchor may be `missing_evidence` or `not_applicable`.
- Level-1 `journey_id` and owning-child `level1_journey_id` sets match in both directions, with every ID bound to a matching `flow_id` and/or `api_id` plus complete internal code, persistence and test traceability; a complete level-1 overview has only children with complete interface coverage.
- Level-1 overviews do not contain field dictionaries, full call chains, Mapper/Repository detail, ER models, indexes/constraints, transaction/concurrency or compensation detail, or test matrices; those belong to secondary detailed designs.
- Detailed, capability, global business, and global technical documents are updated only at their justified impact level.
- Database content is a detailed-design section unless standalone delivery criteria apply.
- Every secondary detailed design makes the business-flow logic explicit and contains an interface-to-code map, code-object relation map, entity/table relationship model, and end-to-end flow-to-test traceability. Implemented hops use repository-relative `path:begin-end#symbol` anchors; target or unverifiable hops are explicitly labelled. Every Section 5 interface/event/job/command is an independent sequential `5.N` group and owns all five same-prefix contract subsections; no document uses one wide interface table plus global request/response/error sections.
- Every persistence-impacting secondary document contains a data-table inventory, entity-to-table/code mapping, field structure, indexes and constraints, relationships and ownership, state-to-column mapping, read/write consistency, and migration/rollback design; when no table changes are needed, it records that conclusion and its evidence explicitly.
- Cross-document terminology, states, APIs, data ownership, performance targets, acceptance, rollout, and rollback agree.
- Claims are backed by the approved `master_draft`, repository evidence, cited current market sources, or explicit assumptions.
- No unresolved filler, credentials, private URLs, raw production payloads, or customer identifiers leak into reusable or public material.

Useful checks:

```bash
python3 scripts/archive_document.py --help
rg -n "TODO|TBD|待补|待定|placeholder|dummy|filler" .axis/docs
```

For this bundle, run its focused acceptance test, the packaged-skill validator, repository tests, and local refresh before claiming installation.

## After Use Deposition

After use, check whether the session produced reusable discovery questions, recommendations, archive edge cases, expansion rules, or impact-classification corrections. Update only public-safe reusable material, validate the bundle, refresh the local installation, and push when authorized. Otherwise report that no skill update is needed.
