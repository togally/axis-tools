---
name: axis-project-knowledge-bootstrap
description: Use when a repository needs its first Axis v0.2 project knowledge set for global technical architecture, global business architecture, business inventory, and document gap report. / 用于为存量项目首次生成 Axis v0.2 项目知识文档集，包括全局技术架构、全局业务架构、子业务清单和文档缺口报告。
---

# Project Knowledge Bootstrap

Use this skill to bootstrap a repository's project knowledge documents for the first learning pass. The output helps a project owner or code reviewer move from global architecture to a business inventory, then into later domain documents and task or version records.

Keep this skill public-safe. Do not place private project facts, customer names, private hosts, account names, raw logs, credentials, connection strings, or internal issue links into this reusable skill bundle. Project-specific facts belong only in the generated project documents for that repository.

## Boundary

Generate the first repository-level document set:

- `project_technical_architecture`
- `project_business_architecture`
- `business_inventory`
- `doc_gap_report`

Do not generate full `domain_business_spec`, `domain_technical_design`, `task_execution_record`, or `version_iteration_record` content in this bootstrap pass. You may create planned `doc_refs` for those documents and gap items that tell the next skill what to generate.

Do not approve generated documents, upload OSS packages, trigger public releases, create databases, add search services, or create a management UI. Use `status: review` by default unless the user has explicitly supplied an approved source.

## Three-Step Work Contract

1. Co-create the target with the user.
   Confirm the repository root, organization ID, project slug, learning goal, public-safety boundary, expected output directory, and whether existing `.axis/docs` files should be treated as source evidence. If this is already specified by an issue or design document, summarize the accepted inputs and proceed.
2. Execute document generation.
   Scan repository evidence, infer only what the evidence supports, write the four bootstrap document structures, and mark missing, stale, blocked, or low-confidence areas in `business_inventory` and `doc_gap_report`.
3. Verify the result.
   Parse generated YAML or Markdown, check required fields, run no-placeholder and public-safety scans, confirm every factual claim has an `evidence_refs` item or an explicit assumption, and report exact commands and residual risk.

Keep light adversarial review under 30% of the interaction. Use it to challenge unsafe shortcuts such as approving unreviewed docs, guessing business rules from names alone, hiding evidence gaps, or putting private repository facts in reusable public templates.

## Evidence Collection Rules

Collect evidence before writing claims. Prefer structured source files and existing docs over memory.

Required evidence categories to scan and report:

- `routes`: HTTP route files, RPC declarations, CLI commands, job entrypoints, API specs.
- `controllers`: request handlers, adapters, resolvers, command handlers.
- `pages`: frontend pages, route components, mobile screens, server-rendered templates.
- `menus`: navigation config, permission menus, feature flags, sidebar definitions.
- `services`: application services, domain services, workers, integrations.
- `entities`: ORM entities, domain models, DTOs, schemas, mappers.
- `migrations`: database migrations, seeders, schema snapshots.
- `tests`: unit, integration, contract, e2e, benchmark, fixture evidence.
- `config`: runtime config, env-var names, package scripts, deployment descriptors.
- `docs`: README files, architecture docs, API docs, runbooks, accepted design notes.

For each evidence item, record:

```yaml
kind: source_file
path: src/example-route.ts
symbol: null
summary: Route evidence for an inferred business capability.
confidence: medium
last_verified_at: "2026-07-06T00:00:00Z"
```

Use public-safe summaries. Do not copy secrets, private URLs, customer data, account identifiers, or raw production payloads into evidence summaries.

## Output Location

Use these default paths unless the user or repository has a stronger convention:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/technical.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/business.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/inventory.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/gaps/doc-gap-report.yaml
```

Use path variables literally in reusable examples. Replace them only in generated project documents.

## Common Metadata

Each generated document should include:

```yaml
schema: axis.project_knowledge_doc
schema_version: "0.2"
doc_id: doc_{organization_id}_{project_slug}_{doc_type}_{scope_key}_v001
doc_type: business_inventory
title: Business Inventory
status: review
revision: 1
supersedes: null
scope:
  organization_id: org_example
  project_slug: example-project
  business_id: null
  version_id: null
storage:
  path: .axis/docs/orgs/org_example/projects/example-project/business/inventory.yaml
  content_sha256: null
doc_status:
  value: needs_review
  reason: generated_from_repository_evidence
confidence:
  level: medium
  score: 0.70
  basis:
    - routes_scanned
    - services_scanned
evidence_refs: []
public_safety:
  reviewed: true
  contains_credentials: false
  contains_private_urls: false
  validation:
    status: passed
    validators:
      - no_placeholder_scan
      - credential_pattern_scan
      - private_url_scan
    findings_count: 0
generated_fields:
  generated_by_skill: axis-project-knowledge-bootstrap
  generated_at: "2026-07-06T00:00:00Z"
  source_commit: null
```

`status` follows the document lifecycle: `draft`, `review`, `approved`, `completed`, `superseded`, `archived`, `rejected`.

`doc_status.value` follows the content-quality lifecycle: `missing`, `needs_review`, `approved_current`, `low_confidence`, `stale`, `conflict`, `blocked`, `superseded`.

## Document Structures

### project_technical_architecture

Include:

- repository purpose and technical non-goals;
- runtime entrypoints, build commands, test commands, package scripts;
- module map and ownership boundaries;
- routes, controllers, jobs, pages, services, entities, migrations, config, and docs evidence;
- data flow and external dependency summary;
- reliability, security, observability, and deployment assumptions;
- evidence gaps and low-confidence technical claims.

### project_business_architecture

Include:

- project business purpose and user groups;
- business capabilities and major user journeys;
- actors, external systems, state and permission boundaries;
- relationship to `business_inventory`;
- non-goals and areas that cannot be confirmed from repository evidence;
- business risks, open assumptions, and review requirements.

### business_inventory

`business_inventory` is the main index and execution queue, not an appendix. It must let a user choose one business area and then request domain-level documents.

Required top-level fields:

```yaml
businesses:
  - business_id: example_business
    name: Example Business
    aliases: []
    summary: Public-safe summary grounded in repository evidence.
    actors: []
    priority: medium
    business_status: unknown
    doc_status: low_confidence
    confidence: medium
    confidence_reason: Evidence is naming-based and needs human review.
    evidence_refs: []
    code_refs:
      routes: []
      controllers: []
      pages: []
      menus: []
      services: []
      entities: []
      migrations: []
      tests: []
      config: []
      docs: []
    doc_refs:
      project_technical_architecture: null
      project_business_architecture: null
      domain_business_spec: null
      domain_technical_design: null
      task_execution_records: []
      version_iteration_records: []
    flows: []
    states: []
    permissions: []
    dependencies:
      upstream_business_ids: []
      downstream_business_ids: []
      external_systems: []
    gap_items: []
    last_verified_at: "2026-07-06T00:00:00Z"
    next_action: review_evidence
```

Required `priority` values: `critical / high / medium / low`.

Required `business_status` values: `active / deprecated / prototype / external_only / unknown`.

Required `doc_status` values: `missing / draft / review / approved / low_confidence / stale / blocked / not_applicable`.

Required `confidence` values: `high / medium / low`; every entry must also include `confidence_reason`.

Required `next_action` values: `generate_domain_docs / review_evidence / mark_not_applicable / refresh_stale_docs / manual_confirm`.

Rules:

- `business_id` must be stable within `organization_id + project_slug`.
- Low-confidence entries may appear in the inventory, but they must not be counted as mastered or approved.
- Missing domain documents should be represented through `doc_refs` and `gap_items`.
- Do not invent flows, states, permissions, or external systems without evidence.

### doc_gap_report

Include:

```yaml
gaps:
  - gap_id: gap_example_business_domain_docs
    doc_type: domain_business_spec
    scope_key: example_business
    gap_type: missing
    status: open
    severity: medium
    summary: Domain business document has not been generated.
    evidence_refs: []
    recommended_next_action: generate_domain_docs
    blocked_by: []
```

Recommended `gap_type` values: `missing`, `low_confidence`, `stale`, `conflict`, `blocked`, `not_applicable`.

Sort gaps by severity, business priority, confidence risk, and whether the gap blocks code review or user learning.

## Workflow

1. Read project config and existing docs.
   Look for `.axis/config.yml`, `.axis/docs`, README, package files, route maps, schema files, migrations, and tests. If no Axis config exists, ask for or infer only public-safe `organization_id` and `project_slug` values.
2. Build an evidence map.
   Group files by evidence category and record confidence. Treat naming-only evidence as low or medium confidence.
3. Draft global technical architecture.
   Describe verified modules, entrypoints, data paths, config names, and tests. Use assumptions for unclear runtime or deployment facts.
4. Draft global business architecture.
   Infer business capabilities conservatively from routes, pages, menus, services, docs, tests, and domain names. Mark uncertain boundaries.
5. Build `business_inventory`.
   Create one entry per business capability with required fields, status values, evidence refs, code refs, doc refs, gap items, and next action.
6. Build `doc_gap_report`.
   Add missing domain docs, low-confidence claims, stale docs, conflicts, blocked public-safety findings, and unverified critical dependencies.
7. Verify and report.
   Run parsers and scans, then report generated paths, confidence boundaries, and recommended next skill.

## Verification Checklist

- The four bootstrap documents exist or the user receives the exact reason generation stopped.
- YAML or Markdown parses with the repository's available tooling.
- No unresolved placeholder markers such as task reminders, dummy customer names, or filler text remain in generated docs.
- No credential-like assignments, private URLs, raw logs, account values, customer identifiers, or internal ticket links are present.
- Every `business_inventory.businesses[]` item has all required fields.
- Every inventory status uses the allowed values listed in this skill.
- Every factual claim has `evidence_refs` or is clearly marked as an assumption.
- Missing, stale, blocked, conflict, and low-confidence findings are present in `doc_gap_report`.
- Generated documents stay in `review` unless there is explicit approval evidence.

Useful local checks:

```bash
rg -n "placeholder|dummy|filler" .axis/docs
rg -n "(token|api[_-]?key|secret|password)\\s*[:=]" .axis/docs
```

Add repository-specific YAML parsing or test commands when available.

## Handoff

Report:

- generated file paths;
- evidence categories scanned;
- business count and critical gaps;
- RED/GREEN or validation commands and results;
- compatibility notes with existing Axis v0.1 document protocol;
- residual risk and whether `axis-business-domain-doc` should run next.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update this skill bundle, validate it, refresh the local install, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
