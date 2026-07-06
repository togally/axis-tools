---
name: axis-business-domain-doc
description: Use when generating Axis v0.2 domain business and technical documents for one business_id from business_inventory and repository evidence. / 用于根据 business_inventory 中的一个 business_id 和仓库证据生成 Axis v0.2 业务域业务文档与技术文档。
---

# Business Domain Documents

Use this skill to generate the domain-level documents for one business area after `$axis-project-knowledge-bootstrap` has produced global architecture, `business_inventory`, and `doc_gap_report` inputs. The output helps a project owner or code reviewer move from one inventory item to its business rules, technical implementation, evidence, gaps, and tests.

Keep this skill public-safe. Do not place private project facts, customer names, private hosts, account names, raw logs, credentials, connection strings, or internal issue links into this reusable skill bundle. Project-specific facts belong only in the generated project documents for that repository.

## Boundary

Generate domain documents for exactly one inventory item:

- `domain_business_spec`
- `domain_technical_design`

Also produce review-revision suggestions for `business_inventory.gap_items` and `doc_gap_report` when evidence is missing, conflicting, stale, or too weak. Do not directly modify business code, approve generated documents, upload OSS packages, trigger public releases, or silently rewrite approved project knowledge documents.

Required inputs:

- `business_id`
- `business_inventory` containing the selected business entry
- `project_technical_architecture`
- `project_business_architecture`
- repository evidence for the selected business area
- optional human-supplied rules, with clear source labels

If `business_id` is absent from `business_inventory`, stop and write a gap entry instead of creating orphan domain documents.

## Three-Step Work Contract

1. Co-create the domain target.
   Confirm `business_id`, inventory revision, global architecture sources, repository root, output directory, public-safety boundary, and whether any human-supplied business rules are approved inputs. If this is already specified by an issue or design document, summarize the accepted inputs and proceed.
2. Execute domain document generation.
   Gather evidence, produce `domain_business_spec` and `domain_technical_design`, and mark every weak, missing, or conflicting claim as `assumptions`, `missing_evidence`, `low_confidence`, or `conflict` instead of presenting it as fact.
3. Verify the result.
   Parse generated YAML or Markdown, check required sections, run no-placeholder and public-safety scans, confirm every factual claim has evidence or an explicit assumption, and report exact commands plus residual risk.

Keep light adversarial review under 30% of the interaction. Use it to challenge unsafe shortcuts such as guessing business flow, inventing table structure, approving low-confidence claims, hiding gaps, or copying private project facts into reusable skill text.

## Evidence Rules

Collect evidence before writing claims. Prefer repository files and approved project documents over memory.

Required evidence categories:

- `routes`: HTTP routes, RPC declarations, CLI commands, job entrypoints, API specs.
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
summary: Public-safe evidence for the selected business_id.
confidence: medium
last_verified_at: "2026-07-06T00:00:00Z"
```

Use public-safe summaries. Do not copy secrets, private URLs, customer data, account identifiers, raw production payloads, or private issue identifiers into evidence summaries.

## Reuse Existing Document Skills

This skill composes existing Axis document workflows instead of replacing them:

- Use `$axis-development-doc` patterns for business scope, requirements, API notes, and test plan structure.
- Use `$axis-tech-design-doc` patterns for state model, module boundaries, transaction, error handling, observability, rollout, and rollback.
- Use `$axis-db-design-doc` patterns for table structure, data dictionary, indexes, relationships, persisted fields, derived fields, and unverified schema risks.

When a database, API, or technical claim lacks direct evidence, mark it as `missing_evidence` or an assumption. The rule is: do not invent table fields, endpoints, statuses, permissions, dependencies, code locations, or test coverage.

## Output Location

Use these default paths unless the user or repository has a stronger convention:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/{business_id}/business-spec.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/{business_id}/technical-design.yaml
```

Use path variables literally in reusable examples. Replace them only in generated project documents.

## Common Metadata

Each generated document should include:

```yaml
schema: axis.project_knowledge_doc
schema_version: "0.2"
doc_id: doc_{organization_id}_{project_slug}_{doc_type}_{business_id}_v001
doc_type: domain_business_spec
title: Domain Business Spec
status: review
revision: 1
supersedes: null
scope:
  organization_id: org_example
  project_slug: example-project
  business_id: example_business
  version_id: null
storage:
  path: .axis/docs/orgs/org_example/projects/example-project/business/domains/example_business/business-spec.yaml
  content_sha256: null
doc_status:
  value: needs_review
  reason: generated_from_repository_evidence
confidence:
  level: medium
  score: 0.70
  basis:
    - inventory_entry_reviewed
    - repository_evidence_scanned
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
  generated_by_skill: axis-business-domain-doc
  generated_at: "2026-07-06T00:00:00Z"
  source_commit: null
```

`status` follows the document lifecycle: `draft`, `review`, `approved`, `completed`, `superseded`, `archived`, `rejected`.

`doc_status.value` follows the content-quality lifecycle: `missing`, `needs_review`, `approved_current`, `low_confidence`, `stale`, `conflict`, `blocked`, `superseded`.

## domain_business_spec

Include:

- business identity: `business_id`, name, aliases, summary, owner role, priority, and inventory source revision;
- business goal, non-goals, actors, external systems, and dependency boundaries;
- business flow for the main success path and important failure paths;
- state model with states, transitions, terminal states, and unclear transitions;
- permissions and actor capabilities, including unverified permission gaps;
- user-visible rules, validation rules, exception cases, and message assumptions;
- interfaces visible to users or external actors, backed by routes, pages, commands, docs, or explicit assumptions;
- gap handling through `missing_evidence`, `assumptions`, `low_confidence`, `conflict`, and inventory `gap_items`;
- acceptance criteria and test points that a reviewer can use to check behavior.

Do not mark the business as mastered when the document contains low-confidence or stale core claims.

## domain_technical_design

Include:

- code locations for routes, controllers, pages, menus, services, entities, migrations, tests, config, and docs;
- module responsibilities and ownership boundaries for the selected business area;
- interface contracts: endpoint, command, job, event, or UI entrypoints with evidence references;
- table structure and data model evidence, including persisted fields, derived fields, indexes, and unknowns;
- state model implementation mapping, validation logic, transaction boundaries, idempotency, concurrency, and retries;
- permission checks, security boundaries, audit needs, and privacy-sensitive data handling;
- external dependencies, config names, observability signals, and operational assumptions;
- test points and existing test coverage by unit, integration, contract, e2e, benchmark, fixture, or missing coverage;
- rollout, rollback, compatibility notes, and evidence gaps.

If evidence conflicts, set `doc_status.value: conflict`, list both evidence refs, and do not choose a side without approved input.

## Inventory And Gap Feedback

When generation completes, suggest a review revision for the selected inventory item:

```yaml
business_id: example_business
doc_refs:
  domain_business_spec:
    path: .axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/example_business/business-spec.yaml
    doc_status: review
  domain_technical_design:
    path: .axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/example_business/technical-design.yaml
    doc_status: review
gap_items:
  - gap_id: gap_example_business_missing_permission_evidence
    gap_type: missing
    summary: Permission rule needs approved source evidence.
next_action: manual_confirm
```

Also update or propose `doc_gap_report` entries for:

- missing domain documents;
- low-confidence business rules;
- stale domain docs after code changes;
- conflict between repository evidence and existing docs;
- blocked generation caused by public-safety findings or absent required input.

Recommended gap fields:

```yaml
gap_id: gap_example_business_domain_technical_design
doc_type: domain_technical_design
scope_key: example_business
gap_type: low_confidence
status: open
severity: medium
summary: Technical design has unverified table structure.
evidence_refs: []
recommended_next_action: review_evidence
blocked_by: []
```

## Workflow

1. Read input documents.
   Load the selected `business_inventory` entry, global architecture docs, existing domain docs, and gap report if present.
2. Validate `business_id`.
   Stop if it is missing, duplicated, or outside the inventory scope. Record a `doc_gap_report` item instead of generating an orphan document.
3. Build an evidence map.
   Group repository files by category and confidence. Treat naming-only evidence as low or medium confidence.
4. Draft `domain_business_spec`.
   Ground business flow, state model, permissions, interfaces, exception paths, assumptions, and test points in evidence.
5. Draft `domain_technical_design`.
   Ground code locations, interfaces, table structure, state implementation, permission checks, dependencies, and tests in evidence.
6. Update gap suggestions.
   Reflect `missing_evidence`, `low_confidence`, `conflict`, stale docs, and blocked public-safety findings in inventory `gap_items` and `doc_gap_report`.
7. Verify and report.
   Run parsers and scans, then report generated paths, evidence categories, confidence boundaries, and recommended next skill.

## Verification Checklist

- `business_id` exists in `business_inventory` and maps to exactly one business item.
- Both `domain_business_spec` and `domain_technical_design` exist or the user receives the exact reason generation stopped.
- Business flow, state model, permissions, table structure, interfaces, code locations, and test points are covered.
- YAML or Markdown parses with the repository's available tooling.
- No unresolved placeholder markers, dummy customer names, filler text, credentials, private URLs, raw logs, or customer identifiers remain.
- Every factual claim has evidence or is listed under `assumptions`.
- Missing, stale, blocked, conflict, and low-confidence findings are reflected in `gap_items` or `doc_gap_report`.
- Generated documents stay in `review` unless there is explicit approval evidence.
- The reusable skill bundle remains public-safe and contains no private project facts.

Useful local checks:

```bash
rg -n "placeholder|dummy|filler" .axis/docs
rg -n "(token|api[_-]?key|secret|password)\\s*[:=]" .axis/docs
```

Add repository-specific YAML parsing or test commands when available.

## Handoff

Report:

- generated file paths;
- source inventory revision and selected `business_id`;
- evidence categories scanned;
- domain business and technical coverage summary;
- inventory and `doc_gap_report` feedback;
- RED/GREEN or validation commands and results;
- compatibility notes with Axis v0.1 document protocol and v0.2 project knowledge docs;
- residual risk and whether `axis-doc-drift-capture` or manual review should run next.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update this skill bundle, validate it, refresh the local install, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
