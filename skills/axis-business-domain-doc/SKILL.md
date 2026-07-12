---
name: axis-business-domain-doc
description: Use when reconciling existing detailed designs into one business-domain design and business architecture, or designing a requirement under one business_id and summarizing its architecture impact. / 用于扫描梳理已有详细设计并补充业务域详细设计与业务架构，或按需求生成所属业务域的需求详细设计并汇总业务架构影响。
---

# Business Domain Detailed Design

Support two explicit modes while preserving one canonical `business_domain_detailed_design` for each `business_id`.

Keep the reusable skill public-safe. Project facts may appear only in generated project documents. Never include credentials, private URLs, raw logs, customer data, account identifiers, or private issue links in this skill bundle.

## Boundary

Required inputs:

- the selected `business_id` and its unique `business_inventory` item;
- `project_business_architecture` and `project_technical_architecture`;
- repository evidence for the selected domain;
- the current `doc_gap_report` and optional approved human rules.

Canonical domain file:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/{business_id}/detailed-design.md
```

Do not split one domain into parallel legacy documents or create orphan documents. Do not approve documents, modify business code, publish OSS, or silently rewrite an approved document. If `business_id` is missing, duplicated, or absent from inventory, stop and record the exact gap.

## Operating Modes

### `scan_and_reconcile`

Use when the repository already contains detailed-design documents, accepted requirements, design notes, API specs, or implementation evidence.

1. Scan existing detailed designs and classify each as current, stale, conflicting, duplicated, orphaned, or reusable evidence.
2. Resolve each usable design to exactly one `business_id`; use `zero_matches` or `multiple_matches` when ownership cannot be resolved and ask the user instead of guessing.
3. Supplement or revise the canonical domain `detailed-design.md` with evidence-backed flows, objects, rules, implementation mappings, tests, and gaps.
4. Create a reviewed revision of `project_business_architecture` when new domain boundaries, capabilities, value streams, collaborations, objects, or governance concerns are discovered; update the business architecture summary and add links to the affected domain documents without copying detailed paragraphs into the architecture.
5. Preserve superseded source documents and record their disposition in metadata rather than deleting history.

### `requirement_design`

Use when the input is a new or changed requirement.

1. Normalize the requirement goal, actors, scope, non-goals, business outcome, constraints, acceptance criteria, and approved human decisions.
2. Resolve the owning `business_id` from inventory and repository evidence. `zero_matches` means no defensible owner; `multiple_matches` means two or more plausible owners. In either case write nothing and ask the user to confirm.
3. Generate one `requirement_detailed_design` at:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/{business_id}/requirements/{requirement_id}/detailed-design.md
```

4. Summarize the requirement in the canonical domain design through a navigation/impact entry; avoid duplicating the requirement body.
5. Create a reviewed business-architecture revision that summarizes requirement impact on goals, capabilities, value streams, domain relationships, objects, risks, and gaps. Do not promote implementation details into the global architecture.
6. If business rules, permissions, states, thresholds, or acceptance meaning are missing or conflicting, pause those design decisions and ask the user for the exact decision/source.

`requirement_id` must be stable, repository-safe, and unique within the owning domain. A requirement document does not replace the one-per-domain canonical design or the single-feature confirmation workflow.

## Three-Step Work Contract

1. Co-create the domain target.
   Confirm the selected `business_id`, inventory revision, repository root, global architecture baseline, output path, public-safety boundary, and any approved human rules. Reuse confirmed project-level settings instead of asking one field at a time.
2. Execute detailed-design work.
   Run `scan_and_reconcile` or `requirement_design`, write the mode-specific document, and update the reviewed architecture summary. Mark weak or absent facts as `assumptions`, `missing_evidence`, `low_confidence`, or `conflict`.
3. Verify the result.
   Check the Markdown structure, Mermaid syntax, evidence traceability, public safety, inventory mapping, and document-count invariant; then report commands and residual risks.

Keep light adversarial review under 30% of the interaction and use it only to prevent invented business flow, state model, permissions, table structure, interfaces, code locations, or test points. The rule is: do not invent.

## Evidence Rules

Scan and classify evidence before drafting:

- `routes`: HTTP/RPC routes, commands, jobs, and API specs;
- `controllers`: handlers, adapters, resolvers, and command handlers;
- `pages`: frontend pages, routes, screens, and templates;
- `menus`: navigation, permission menus, feature flags, and sidebars;
- `services`: application/domain services, workers, and integrations;
- `entities`: domain models, DTOs, schemas, mappers, and persisted objects;
- `migrations`: migrations, seeders, and schema snapshots;
- `tests`: unit, integration, contract, e2e, benchmark, and fixtures;
- `config`: environment-name declarations, runtime config, and deployment descriptors;
- `docs`: architecture, API, README, runbook, and accepted design notes.

Record repository-relative paths, symbols where useful, supported conclusions, confidence, and verification time. Naming-only evidence is not enough to confirm policy, permission, state, threshold, transaction, or compensation behavior.

## Compose Existing Document Skills

- Apply `$axis-development-doc` patterns to requirements, business flow, acceptance, API notes, and test planning.
- Apply `$axis-tech-design-doc` patterns to module boundaries, state model, transactions, errors, observability, rollout, and rollback.
- Apply `$axis-db-design-doc` patterns only when table structure, indexes, relationships, or data dictionaries are directly evidenced.
- Hand off a confirmed single feature to `$axis-feature-detailed-design`; its Feature Resolution Confirmation Gate remains mandatory.

## Required Document Structure

The Markdown document must include:

1. design conclusion, `business_id`, status, revision, upstream architecture revision, inventory revision, and evidence baseline;
2. purpose, readers, scope, non-goals, domain boundary, upstream/downstream domains, and external systems;
3. business goals, domain capabilities, actors, RACI, permissions, data scope, and tenant boundary;
4. main business flow plus evidence-backed branches, failure paths, recovery, and compensation;
5. business objects, ownership, state model, transitions, validation, and rule decision tables;
6. input/output semantics, interfaces, events, jobs, idempotency, concurrency, transaction, and consistency behavior;
7. code locations and module responsibilities for routes, controllers, pages, menus, services, entities, migrations, config, and docs;
8. data model and table structure only where evidence supports them; otherwise name the missing evidence;
9. security, privacy, audit, observability, operational ownership, rollout, rollback, and compatibility;
10. test points, existing coverage, acceptance criteria, business-goal-to-design traceability, assumptions, `missing_evidence`, and gaps;
11. evidence index and navigation to confirmed feature documents.

Do not copy global architecture paragraphs. Reference architecture headings or element IDs, then add only domain-specific decisions, mappings, and evidence. Documents for different domains must not reuse reader-facing paragraphs except standard lifecycle labels and cross-references.

For `requirement_detailed_design`, also require requirement source/confirmation, change intent, current-versus-target behavior, impacted domain capabilities, requirement-specific flows and rules, compatibility/migration, delivery slices, acceptance traceability, architecture-impact summary, and unresolved user decisions.

## Metadata And Lifecycle

Represent the document in project `metadata.yaml` and inventory with:

```yaml
business_domain_detailed_designs:
  example_business:
    path: .axis/docs/orgs/org_example/projects/example-project/business/domains/example_business/detailed-design.md
    doc_id: doc_org_example_example-project_business_domain_detailed_design_example_business_v001
    status: review
    revision: 1
    content_sha256: null
```

The selected inventory item uses:

```yaml
doc_refs:
  business_domain_detailed_design: .axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/{business_id}/detailed-design.md
next_action: review_evidence
```

Allowed lifecycle states include `draft`, `review`, `approved`, `completed`, `superseded`, `archived`, and `rejected`. Generated documents default to `review`. Use `low_confidence` or `conflict` for content quality when core evidence is weak or inconsistent.

## Missing Evidence Gate

Do not turn uncertainty into prose that looks confirmed:

- If a non-core detail is absent, keep the section and record `missing_evidence`, searched scope, impact, required source, and owner role.
- If a core domain boundary, main flow, permission, authoritative state, or business rule cannot be resolved, stop that conclusion, update `gap_items` / `doc_gap_report`, and ask the user for the specific source or decision.
- If evidence conflicts, show both references and request an approved resolution.
- If no repository evidence connects the proposed domain to an entrypoint and implementation, do not generate filler.

## Workflow

1. Read the selected inventory item and both global architecture documents.
2. Validate that `business_id` maps to exactly one item.
3. Build a domain-only evidence map across all required categories.
4. Resolve domain boundary, actors, flows, objects, rules, system mapping, and tests.
5. Execute the selected mode and write its canonical output.
6. Update metadata, inventory refs, `gap_items`, `next_action`, `doc_gap_report`, and the reviewed `project_business_architecture` summary.
7. Run structure, Mermaid, no-placeholder, credential-pattern, private-URL, evidence, architecture-summary, and role-separation checks.

## Verification Checklist

- Inventory business count equals detailed-design document count.
- Every inventory `business_id` has exactly one canonical `detailed-design.md` when the bootstrap set is complete.
- The selected file contains only its domain's detailed design and direct collaboration boundaries.
- Business flow, state model, permissions, table structure, interfaces, code locations, and test points are either evidenced or explicitly unresolved.
- Every factual claim has an evidence reference or appears under `assumptions` / `missing_evidence`.
- Mermaid blocks render and Markdown has no unresolved placeholder or filler text.
- Public-safety scans find no credentials, private URLs, raw logs, or customer identifiers.
- The file remains `review` without explicit human approval.
- Existing-design disposition and architecture summary changes are traceable in `scan_and_reconcile` mode.
- Requirement ownership, `requirement_id`, acceptance, domain navigation, and architecture-impact summary are traceable in `requirement_design` mode.

Useful checks:

```bash
rg -n "placeholder|dummy|filler" .axis/docs
rg -n "(token|api[_-]?key|secret|password)\\s*[:=]" .axis/docs
```

## Handoff

Report the generated path, `business_id`, inventory and architecture revisions, evidence categories, confidence boundaries, gap changes, validation commands, and residual risk. For one feature, invoke `axis-feature-detailed-design` and stop for user confirmation when resolution returns zero or multiple matches.

## After Use Deposition

If the run reveals reusable corrections, edge cases, or validation rules, update this skill bundle, validate it, and refresh the local installation. Otherwise report that no reusable skill change is needed.
