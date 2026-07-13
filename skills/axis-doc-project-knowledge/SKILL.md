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
- one `business_capability_detailed_design` for every unique `level1_capability_id`;
- one `secondary_capability_detailed_design` for every declared `secondary_capability_id`;
- `doc_gap_report`;
- `project_knowledge_metadata`.

Invariants:

- one canonical overview per level1_capability_id;
- each level-1 overview contains every secondary capability as a summary and link; each secondary capability owns one independent detailed-design document;
- `business_id` is a mapping from a secondary capability to implementation/business evidence, not a document boundary;
- repeated rows or evidence with the same level-1 capability are merged into one document rather than producing parallel detailed designs;
- no global business detailed-design duplicate;
- global documents explain shared structure and boundaries, level-1 overviews explain navigation and cross-secondary design, and secondary documents contain complete local business and code design;
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

Record repository-relative paths, symbols, supported conclusions, confidence and verification time. For a secondary detailed design, use `path:begin-end#symbol` anchors for every implemented API entrypoint, code object relation, mapper/repository, entity/table mapping and test. Names alone do not prove a capability, policy, permission, state, threshold, transaction, compensation rule or external contract.

Before rendering each secondary document, resolve and record these machine-checkable states:

- `interface_design_status=detailed|not_applicable` and `interface_coverage=complete|partial|not_applicable`;
- `persistence_design_status=detailed|not_applicable` and `relationship_model_status=relational|single_table|not_applicable`.

`detailed` interface design requires a concrete HTTP path, event, job or command; field-level request and response contracts; error mapping; and exact entry, service, persistence and test anchors. `partial` coverage requires a stable gap identifier. `not_applicable` requires a reason and an exact repository evidence anchor.

Persisted multi-table capabilities require a real ER relationship whose endpoints match the table inventory. Each edge records both join fields, cardinality, ownership, evidence and one of `physical_fk`, `logical_relation` or `external_reference`. A single-table capability still renders its real entity block. Never use `BUSINESS_FLOW`, `API`, `RESULT`, `TABLE`, `ENTITY_A` or `ENTITY_B` as database entities. `not_applicable` persistence requires a reason and exact evidence; “no schema change in this revision” does not make the current table design optional.

## bootstrap

1. Establish source baseline and language.
2. Write `architecture/technical.md` using [project-technical-architecture-template.md](references/project-technical-architecture-template.md).
3. Write `architecture/business.md` using [project-business-architecture-template.md](references/project-business-architecture-template.md).
4. Build `business/inventory.yaml` with stable, unique `level1_capability_id` values; each item contains `level1_capability_name` and a complete `secondary_capabilities` array, and each secondary item contains its `business_ids` mapping.
5. Write one `business/capabilities/{level1_capability_id}/detailed-design.md` overview per unique level-1 capability using [business-capability-detailed-design-template.md](references/business-capability-detailed-design-template.md). It must list and link every secondary capability.
6. Write one `business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md` using [secondary-capability-detailed-design-template.md](references/secondary-capability-detailed-design-template.md) for every inventory secondary capability.
7. Write `gaps/doc-gap-report.md` and project metadata.
8. Validate role separation, counts, links, evidence and lifecycle state.

Do not generate feature documents, task records or version records in this pass.

## scan_and_reconcile

1. Classify existing design documents as current, stale, conflicting, duplicated, orphaned or reusable evidence.
2. Resolve every usable design to exactly one `level1_capability_id`; then map its features and evidence to one or more `secondary_capability_id` values and their `business_ids`. Stop on `zero_matches` or `multiple_matches` instead of guessing.
3. Archive affected canonical documents before changing them.
4. Reconcile the single level-1 overview and each affected secondary document. The overview retains the complete summary/link matrix and cross-secondary design; each child owns its flows, objects, rules, interfaces, table structures, implementation mapping, tests and gaps.
5. Create reviewed global revisions only when capability changes alter shared boundaries, value streams, system structure or cross-cutting principles.
6. Preserve superseded documents and record disposition, revision links, metadata, inventory refs and gaps.

## requirement_design

1. Normalize requirement goal, actors, scope, non-goals, outcome, constraints, acceptance and confirmed decisions.
2. Resolve exactly one owning `level1_capability_id` and at least one `secondary_capability_id`; retain associated `business_ids` as evidence mappings. Stop on absent or ambiguous ownership.
3. Use `$axis-doc-development` when code-changing discovery or `master_draft` approval is required.
4. Write the requirement design under:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/requirements/{requirement_id}/detailed-design.md
```

5. Update the owning secondary document and the level-1 overview's navigation/impact summary rather than duplicating the requirement body.
6. Revise global business or technical architecture only when the impact matrix justifies it.
7. Update inventory, metadata, traceability and gap records.

## Canonical Layout

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/metadata.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/technical.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/business.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/inventory.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/gaps/doc-gap-report.md
```

Archive history stays under `.axis/docs/_archive/` and must not appear as a second current document.

## Architecture Impact Rules

- Local feature/API/data detail: update the owning feature/requirement and its `secondary_capability_detailed_design`.
- Secondary-capability actor, permission, state ownership or internal flow: update the owning secondary document, its summary/link in the level-1 overview, and inventory when identity or mapping changes.
- Level-1 boundary, value stream, shared business object or governance rule: create a reviewed `project_business_architecture` revision.
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
- inventory secondary-capability count equals `secondary_capability_detailed_design` document count;
- every inventory `secondary_capabilities` item appears exactly once in its level-1 completeness matrix and links to its canonical child document;
- every secondary document has resolved `interface_design_status`, `interface_coverage`, `persistence_design_status` and `relationship_model_status` values, a business-flow diagram, field-level interface design, interface-to-code trace, code-object relation map, entity/table relationship model and flow-to-test traceability matrix; every implemented hop is a repository-relative `path:begin-end#symbol` anchor or an explicit missing-evidence record;
- every persistence-impacting secondary document includes table inventory, entity-to-table/code mapping, field structure, indexes and constraints, real relationships with join fields and `physical_fk` / `logical_relation` / `external_reference` classification, ownership, state mapping, read/write consistency, and migration/rollback evidence; an evidence-backed single-table or not-applicable model is the only exception;
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

Report mode, generated/revised paths, affected `level1_capability_id`, `secondary_capability_id`, and `business_id` values, inventory and architecture revisions, archive records, evidence coverage, confidence boundaries, gaps, validation commands and residual risk. Use `$axis-doc-drift-capture` after implementation or PR completion for task/version records and remaining drift classification.

## After Use Deposition

If the run reveals reusable domain-resolution, architecture-impact, archive, validation or gap-handling improvements, update this bundle, validate it and refresh the local installation. Otherwise report that no reusable skill change is needed.
