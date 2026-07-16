---
name: axis-doc-project-knowledge
description: Use when a repository needs its first Axis v0.2 project knowledge set or canonical global, inventory, level-1, secondary, navigation, and gap documents must be reconciled. / 用于仓库首次建立 Axis v0.2 项目知识集，或梳理正式全局架构、能力清单、一级总览、二级设计、导航与缺口文档。
---

# Project Knowledge Lifecycle

Build or reconcile the canonical project-wide Axis knowledge system. This skill owns formal global and capability knowledge; one-feature discovery and development-document authoring remain outside its boundary.

## When to Use

Choose exactly one mode:

| Mode | Trigger | Primary result |
| --- | --- | --- |
| `bootstrap` | No complete Axis v0.2 knowledge set exists. | Global architecture, inventory, dependency graph, one level-1 overview per capability, one child document per secondary capability, metadata and gaps. |
| `scan_and_reconcile` | Existing formal knowledge may be incomplete, duplicated, stale, conflicting, or structurally outdated. | Locked inventory boundaries, reconciled canonical documents, reviewed global revisions where justified, archive/disposition records and explicit gaps. |

## Do Not Use

- Do not use for one feature's discovery, `master_draft`, isolated export, or development-document correction; use `$axis-doc-development`.
- Do not create task/version execution records, implement code, approve documents, start the dashboard application, or publish implicitly.
- Do not generate detailed designs before the secondary-capability inventory is locked.

## Inputs

- target repository, Axis organization/project configuration, language, mode and source baseline;
- current metadata, architecture, inventory, dependency graph, capability documents, archives and gap report;
- connected UI/menu, route/API, command/event/job, code, schema, configuration and test evidence;
- authorized document scope and revision boundary;
- public-safety boundary and, only after local validation, OSS configuration/readiness metadata.

## Outputs

- canonical `project_technical_architecture`, `project_business_architecture`, `business_inventory`, level-1 dependency graph, level-1 overviews, secondary designs, metadata and gap report;
- pre-change archives, supersedes/disposition links, evidence/confidence boundaries and validation results;
- `oss_upload_readiness=unavailable|ready` and `oss_upload_decision=pending|approved|declined`, with exact run and target when applicable.

Read [project-knowledge-contracts.md](references/project-knowledge-contracts.md) for canonical paths, reader profiles, evidence, dependency derivation and archive rules. Use the linked architecture and detailed-design templates only for their owning document types.

## Safety and Boundaries

- Preserve confirmed business wording and distinguish repository facts, approved decisions, assumptions, missing evidence and conflicts.
- One `level1_capability_id` owns one overview; every locked `secondary_capability_id` owns exactly one independent child document. `business_id` is evidence mapping, never a document boundary.
- One secondary capability represents one independently reviewable business outcome with cohesive actor, authority/data boundary, state and lifecycle. Split enumerated independent results; never split mechanically by Controller, method, technical layer or table.
- Archive each canonical document before modification. Never mutate an `approved` document in place; create a new `review` revision with `supersedes`.
- Do not expose credentials, private URLs, raw logs/payloads, account identifiers, customer data, or unsupported claims.
- No external OSS write occurs before explicit approval for the exact immutable run ID and target prefix.

## Three-Step Work Contract

1. Co-create and lock. Confirm mode, repository, scope and revision authorization; scan the complete inventory boundary and lock atomic secondary capabilities before selecting documents.
2. Execute. Bootstrap or reconcile the canonical set, archive before change, preserve explicit gaps, and keep dependency projections pending until the complete project gate passes.
3. Verify and report. Validate counts, links, evidence, reader profile, archives, graph projections, public safety and lifecycle; then run the OSS readiness gate without inferring upload consent.

## Prompt Creation Handoff

Use `$axis-tools-prompt-create` before changing the reusable secondary-granularity or dependency-synthesis prompt. It owns the blind multi-source/model-tier experiment contract and ranking; this domain bundle retains its public-safe gold cases, scorer semantics, specialized evaluator, candidates and frozen selected prompt.

Normal project-knowledge runs execute the frozen prompt and do not invoke prompt R&D. The selected granularity prompt is [secondary-capability-boundary-matrix-v3.1.md](references/secondary-capability-boundary-matrix-v3.1.md). A replacement is promoted only with frozen hashes, oracle-leak checks, worst-cell evidence and holdout status returned by `$axis-tools-prompt-create`.

## Capability and Reader Contract

Run the project-wide inventory granularity gate before selecting affected documents. Build atomic evidence cards for every inventory row and uncovered entrypoint, partition every evidence ID exactly once, record split/merge decisions and legacy dispositions, and run separate under-merge and over-split reviews. Lock `secondary_granularity_gate` before document generation. Do not generate or reconcile detailed-design documents until the secondary-capability boundary inventory is locked.

Default `reader_profile=compact`:

- a level-1 overview has six useful sections: boundary, secondary navigation, external business flows, business semantics, business-data summary and actionable gaps;
- a secondary document has six sections: capability boundary, caller/permission/entry matrix, capability flow, objects/rules, interface summaries and gaps;
- compact does **not** require `3.N` grouping, full journey expansion, full ER/table-ID unions, or visible `5.N.1` through `5.N.8` sections;
- `strict_full` is allowed only for an explicit audit need with complete evidence and owns those expanded structures.

Keep stable IDs, coverage controls, full paths and exact traces in hidden metadata. Readers see only business-relevant fields and `FileName:begin-end#symbol`. Every diagram uses one semantic layer and one atomic business unit or concrete method call per node.

## Mode Workflows

For `bootstrap`:

1. establish source baseline and write global technical/business architecture;
2. lock the complete granularity-reviewed inventory and create a pending dependency graph;
3. create one compact overview per level-1 capability and one compact child per secondary capability;
4. write metadata and gaps; derive the graph only when all parent/child coverage is complete.

For `scan_and_reconcile`:

1. audit the complete inventory and uncovered entrypoints before choosing affected documents;
2. lock boundaries, classify current/stale/conflicting/duplicate/orphan evidence, and archive affected canonical files;
3. reconcile canonical compact documents and create global revisions only for justified shared impact;
4. if a capability boundary or relationship changed, return the graph and all projections to pending, then globally rederive and batch-project only after completeness passes.

Unsupported core boundary, main-flow, authority, state or business-rule evidence blocks that conclusion. Non-core absence becomes an actionable stable gap with searched scope, impact, needed source and owner role.

## OSS Upload Confirmation Gate

Run only after local document validation:

1. Run `axis validate-config --repo <repo>`, check required environment-variable **names and presence only**, create a fresh local `project-knowledge-capture`, and run `axis oss-publish --run-id <run_id> --dry-run`. Optional IAM probing must be read-only.
2. Record `unavailable` when any configuration, credential-presence, permission, redaction, capture or dry-run precondition fails. Keep the result local and do not ask a misleading upload question.
3. When ready, show exact `run_id`, `target_prefix`, file count and redaction count; record `pending` and ask: `检测到 OSS 配置和上传条件，是否将本次项目知识快照上传到 <target_prefix>？`
4. End the turn and wait. Silence, timeout, ambiguity or approval for another run/target is not consent.
5. Only a later explicit approval for that exact pair changes the decision to `approved`; then invoke `$axis-ops-oss-publish`. A decline keeps the snapshot local.
6. After upload, verify `published`, `_sync/manifest.json`, current catalog paths/checksums and archive traceability. Report IAM failure without broadening permissions or retrying destructively.

## Light Adversarial Review

Spend no more than 30% of the interaction challenging compound capability names, technical-layer splits, missing entrypoints, invented roles/permissions/states, weak evidence, false completeness, unsafe document rewrites, or inferred upload consent. Once the inventory and evidence gates pass, execute decisively.

## Checks

- Inventory level-1 count equals overview count; locked secondary count equals child-document count.
- Every evidence ID is assigned once, every legacy aggregate has a disposition, and under/over-split reviews pass.
- Compact documents follow the six-section reader contract and do not inherit strict-only numbering/detail requirements.
- Parent/child, architecture/overview and adjacent navigation links resolve; no detail link returns 404.
- Dependency graph nodes equal inventory; pending has no edges and `not_derived` projections, while derived projections exactly match direct graph edges.
- Every factual claim has evidence or an explicit assumption/gap/conflict; basename labels bind to hidden exact anchors.
- Every changed canonical file has a verified pre-change archive and valid revision/supersedes metadata.
- Mermaid, tables, metadata, links and templates validate; reader content omits irrelevant fields and full absolute paths.
- OSS upload occurs only after exact-run/target approval and post-upload manifest/catalog verification.

## After Use Deposition

Check whether the run produced a reusable granularity, evidence, reader-profile, dependency, archive, gap, validation, or upload-gate correction. If yes, update public-safe bundle material, validate it, refresh the local install, and push when authorized. Otherwise report that no skill update is needed.
