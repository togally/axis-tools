---
name: axis-project-knowledge-bootstrap
description: Use when a repository needs its first Axis v0.2 project knowledge set with global technical architecture, global business architecture, one detailed design per business domain, business inventory, and document gap report. / 用于为存量项目首次生成 Axis v0.2 项目知识文档集，包括全局技术架构、全局业务架构、每个业务域一份详细设计、业务清单和文档缺口报告。
---

# Project Knowledge Bootstrap

Bootstrap the repository-level knowledge set, then decompose the business architecture by the stable `business_id` entries in `business_inventory`. The invariant is **one document per business_id**.

Keep the reusable skill public-safe. Project-specific facts belong only in generated repository documents. Never put private hosts, credentials, connection strings, account identifiers, raw logs, customer data, or internal issue links in this skill bundle.

## Boundary

Generate:

- `project_technical_architecture`;
- `project_business_architecture`;
- `business_inventory`;
- one `business_domain_detailed_design` for every inventory `business_id`;
- `doc_gap_report`;
- `project_knowledge_metadata`.

Do not generate `feature_detailed_design`, `task_execution_record`, or `version_iteration_record` in this pass. Do not approve documents, change business code, create OSS resources, or publish implicitly.

Local generation and OSS synchronization are separate actions. After local validation, create a snapshot with `axis project-knowledge-capture`, run `axis oss-publish --dry-run`, and upload only when the user authorizes synchronization. Project documents synchronize to `{prefix}/orgs/{organization_id}/projects/{project_slug}/`; `_sync/manifest.json` is uploaded last.

## Standards Baseline

- `ISO/IEC/IEEE 42010:2022`: stakeholders, concerns, viewpoints, models, correspondences, decisions, and rationale.
- `arc42`: goals, constraints, context, solution strategy, building blocks, runtime, deployment, crosscutting concepts, decisions, quality, risks, and glossary.
- `C4`: System Context and Container views; add Component, Dynamic, or Deployment only when justified.
- `ISO/IEC 25010:2023`: measurable quality scenarios.
- `TOGAF Business Architecture` and ArchiMate-lite: goals, capabilities, value streams, processes, objects, and mappings.
- `GB/T 8567-2006`: Chinese formal-deliverable completeness.
- `ISO/IEC/IEEE 15289:2019`: lifecycle, revision, review, maintenance, and supersession.
- `IEEE 1016-2009`: applicable software-design-description views, elements, relationships, rationale, and traceability without claiming active-standard certification.

Use [project-technical-architecture-template.md](references/project-technical-architecture-template.md), [project-business-architecture-template.md](references/project-business-architecture-template.md), and [business-domain-detailed-design-template.md](references/business-domain-detailed-design-template.md). Read the domain template when producing domain documents through `$axis-business-domain-doc`.

## Document Language

Set `document_language` before drafting. Explicit user choice wins; otherwise use repository Axis config, then repository convention, then default to `zh-CN`. For `zh-CN`, reader-facing titles, summaries, decisions, risks, assumptions, and next actions are Chinese. Preserve code symbols, paths, IDs, enums, and protocol names.

## Document Role Separation

- `project_technical_architecture` explains system structure, runtime, deployment, data, quality, decisions, risks, and technical evidence.
- `project_business_architecture` explains stakeholders, capability map, value streams, processes, objects, domain boundaries, and business risks.
- `business_inventory` is the compact domain index and execution queue.
- `business_domain_detailed_design` explains exactly one domain's business and implementation design. It references global architecture rather than copying it and does not expand another domain's internals.
- `doc_gap_report` records missing, stale, conflicting, blocked, or low-confidence evidence and remediation.
- `project_knowledge_metadata` records lifecycle, evidence baseline, language, checksums, revisions, supersession, and package linkage.

Run `document_role_separation_check`: reader-facing paragraphs must not be duplicated across documents except standard labels and evidence references. Domain documents must differ by domain-specific flows, objects, rules, code locations, tests, and gaps.

## Three-Step Work Contract

1. Co-create the target.
   Confirm repository root, organization ID, project slug, learning goal, public-safety boundary, output directory, existing `.axis/docs` treatment, and language. Reuse project configuration already confirmed through the v0.2 batch gate.
2. Execute generation.
   Scan repository evidence, write both global architecture documents, build inventory, then compose `$axis-business-domain-doc` once for each unique `business_id`. Record unsupported claims as assumptions or gaps.
3. Verify the result.
   Parse YAML and Markdown, render Mermaid, check document count and canonical paths, run no-placeholder/public-safety scans, verify evidence traceability and role separation, then report commands and residual risk.

Keep light adversarial review under 30% of the interaction. Use it to prevent invented rules, permissions, states, policies, or misleading document completeness.

## Evidence Collection Rules

Scan these categories and record repository-relative paths, optional symbols, supported conclusions, confidence, and verification time:

- `routes`: HTTP/RPC routes, commands, jobs, and API specs;
- `controllers`: request handlers, adapters, resolvers, and command handlers;
- `pages`: frontend pages, routes, screens, and templates;
- `menus`: navigation, permission menus, feature flags, and sidebars;
- `services`: application/domain services, workers, and integrations;
- `entities`: models, DTOs, schemas, mappers, and persisted objects;
- `migrations`: migrations, seeders, and schema snapshots;
- `tests`: unit, integration, contract, e2e, benchmark, and fixtures;
- `config`: runtime config, environment-name declarations, scripts, and deployment descriptors;
- `docs`: README, architecture, API, runbook, and accepted design notes.

Do not infer policy, permissions, states, thresholds, transactions, compensation, or external contracts from names alone.

## Output Location

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/metadata.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/technical.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/business.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/inventory.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/{business_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/gaps/doc-gap-report.md
```

The active knowledge set has no global business detailed-design file. Cross-domain design stays in `architecture/business.md`; domain detail belongs under the corresponding `business_id`.

## Metadata Shape

```yaml
schema: axis.project_knowledge_doc
schema_version: "0.2"
document_language: zh-CN
status: review
revision: 1
scope:
  organization_id: org_example
  project_slug: example-project
documents:
  project_technical_architecture:
    path: .axis/docs/orgs/org_example/projects/example-project/architecture/technical.md
    status: review
  project_business_architecture:
    path: .axis/docs/orgs/org_example/projects/example-project/architecture/business.md
    status: review
  business_inventory:
    path: .axis/docs/orgs/org_example/projects/example-project/business/inventory.yaml
    status: review
  business_domain_detailed_designs:
    example_business:
      path: .axis/docs/orgs/org_example/projects/example-project/business/domains/example_business/detailed-design.md
      doc_id: doc_org_example_example-project_business_domain_detailed_design_example_business_v001
      status: review
  doc_gap_report:
    path: .axis/docs/orgs/org_example/projects/example-project/gaps/doc-gap-report.md
    status: review
public_safety:
  reviewed: true
  contains_credentials: false
  contains_private_urls: false
generated_fields:
  generated_by_skill: axis-project-knowledge-bootstrap
  source_commit: null
```

Document lifecycle values include `draft`, `review`, `approved`, `completed`, `superseded`, `archived`, and `rejected`. Content quality values include `missing / draft / review / approved / low_confidence / stale / blocked / not_applicable`.

## Architecture Documents

### project_technical_architecture

`architecture/technical.md` covers purpose, readers, scope, stakeholder concerns, goals, constraints, solution strategy, C4 context/container views, arc42 building blocks, critical runtime scenarios, data architecture, deployment, security, tenancy, observability, decisions, ISO quality scenarios, risks, evidence, and glossary.

### project_business_architecture

`architecture/business.md` covers scope, goals, stakeholders, roles, layered capabilities, value streams, key processes, rules, states, permissions, objects, information flow, domain boundaries, capability-to-system mapping, external participants, risks, assumptions, inventory navigation, evidence, and glossary. Controllers, packages, and databases are evidence or system mappings, not business capabilities.

### business_domain_detailed_design

For each inventory entry, use `$axis-business-domain-doc` and the domain template. Each document covers its domain boundary, actors, RACI, permissions, main and exception flows, objects, state model, rule tables, interfaces/events, code mapping, data, transactions, idempotency, concurrency, security, audit, observability, tests, acceptance, assumptions, and missing evidence.

If core evidence is missing or conflicting, keep the relevant section unresolved and ask the user for a specific decision or source; do not create filler. A complete bootstrap set still records the domain document with `review` or `low_confidence` status when non-core details are missing, but it must not claim unsupported facts.

## business_inventory

Each `business_id` is stable, unique, and independently selectable. Required fields include `name`, `aliases`, `summary`, `actors`, priority `critical / high / medium / low`, business status `active / deprecated / prototype / external_only / unknown`, doc status, confidence, evidence refs, categorized code refs, dependencies, flows, states, permissions, gap items, and next action.

Use this `doc_refs` shape:

```yaml
doc_refs:
  project_technical_architecture: null
  project_business_architecture: null
  business_domain_detailed_design: null
  feature_detailed_designs: []
  task_execution_records: []
  version_iteration_records: []
```

Allowed next actions are `generate_domain_docs / review_evidence / mark_not_applicable / refresh_stale_docs / manual_confirm`.

## doc_gap_report

Include an executive conclusion, standards coverage matrix, stable gap table, prioritized remediation waves, and exit criteria. Each gap states standard/section, scope, type, severity, impact, evidence, recommended action, blocking dependency, and owner role.

## Workflow

1. Resolve v0.2 organization, project, OSS profile, language, and canonical source root.
2. Scan repository evidence and current Axis documents.
3. Write `architecture/technical.md` and `architecture/business.md`.
4. Build and validate `business/inventory.yaml` with unique `business_id` values.
5. Generate every `business/domains/{business_id}/detailed-design.md` through `$axis-business-domain-doc`.
6. Update `metadata.yaml`, inventory `doc_refs`, and `gaps/doc-gap-report.md`.
7. Verify, capture, dry-run publish, and synchronize only after explicit approval.

## Verification Checklist

- Global architecture documents use the standards baseline and contain real explanations, not directory dumps.
- Inventory IDs are unique and every capability appears at most once.
- Inventory business count equals canonical domain detailed-design count.
- Every domain document path matches `business/domains/{business_id}/detailed-design.md`.
- No two domain documents share reader-facing paragraphs beyond standard labels and references.
- Every factual claim has evidence or an explicit assumption/missing-evidence entry.
- Mermaid diagrams render; YAML parses; no unresolved placeholders, credentials, private URLs, raw logs, or customer identifiers remain.
- Metadata, inventory refs, and gap report agree.
- Generated documents remain `review` without authorized approval.
- `axis project-knowledge-capture` includes all domain detailed designs and excludes superseded global detailed designs.
- `axis oss-publish --dry-run` targets direct project-document paths and `_sync/manifest.json` last.

## Handoff

Report generated paths, inventory domain count, evidence coverage, confidence boundaries, gap summary, validation commands, snapshot run ID, and OSS sync status. For a single confirmed function, use `axis-feature-detailed-design`; it must stop and ask the user when feature resolution has zero or multiple matches.

## After Use Deposition

If this run yields reusable corrections, templates, validation rules, or edge cases, update the skill bundle, validate it, and refresh the local installation. Otherwise report that no reusable skill change is needed.
