---
name: axis-doc-feature-detailed-design
description: Use when the user asks for a detailed design of one specific feature and the feature must first be resolved from repository evidence without guessing. / 用于为某个单独功能生成详细设计；必须先从仓库证据定位功能，找不到或存在歧义时停止生成并向用户确认。
---

# Feature Detailed Design

Use this skill to move from project-level or business-domain knowledge to a formal detailed design for exactly one confirmed feature. Default reader-facing document language is Simplified Chinese (`zh-CN`) unless the user explicitly requests another language.

Keep the reusable skill public-safe. Project names, private hosts, credentials, account identifiers, raw production payloads, customer data, and private issue links belong only in the target repository's generated documents when authorized; they must not be copied into this skill bundle.

## Boundary

This skill writes one `feature_detailed_design` only after resolving the feature against repository evidence. It does not generate global architecture, replace domain documents, implement code, approve its own output, or upload a package.

Preferred inputs:

- repository root;
- feature query or business wording;
- `business_id` when an inventory exists;
- one or more locators such as route, page, menu item, class, method, event, job, table, test, or source path;
- optional approved requirements or acceptance rules, labelled as human-supplied evidence.

Do not require the user to know internal identifiers. Resolve them from evidence when possible. Never infer a feature from its display name alone.

## Three-Step Work Contract

1. Co-create and resolve the target.
   Scan repository evidence, classify the resolution result, and show the user what was or was not found. When the target is absent or ambiguous, stop and ask the user to confirm; do not generate a design.
2. Generate the detailed design.
   Only after `confirmed_feature` is satisfied, load `references/feature-detailed-design-template.md`, compose `$axis-doc-tech-design` patterns, and write a Chinese, evidence-backed design for one feature.
3. Verify and hand off.
   Check scope, evidence links, diagrams, unresolved claims, public safety, and document-role separation. Report the exact output path and residual gaps; keep the document in review status until a human approves it.

Keep light adversarial review under 30% of the interaction. Use it to challenge guessed scope, invented interfaces or fields, missing failure paths, weak transaction boundaries, or acceptance criteria that cannot be traced to evidence.

## Feature Resolution Confirmation Gate

The gate runs before any document file is created or modified.

### Evidence scan

Search these categories, including common framework-specific locations:

- `routes`: HTTP/RPC routes, GraphQL operations, CLI commands, scheduled jobs, message consumers, API specifications;
- `controllers`: controllers, handlers, resolvers, adapters, command handlers;
- `pages`: web routes, page components, mobile screens, templates;
- `menus`: navigation, permission menus, feature flags, sidebar or tab definitions;
- `services`: application services, domain services, use cases, workers, integrations;
- `entities`: domain models, ORM entities, DTOs, schemas, repositories, mappers;
- `migrations`: migrations, schema snapshots, seeders;
- `tests`: unit, integration, contract, end-to-end, fixtures, benchmark tests;
- `config`: environment variable names, runtime config, package/build/deployment descriptors;
- `docs`: architecture, API, requirements, runbooks, accepted design notes, Axis knowledge.

Record candidates with evidence rather than a name-only score:

```yaml
feature_candidate:
  feature_id: order_submit
  display_name: 订单提交
  business_id: order_management
  entrypoints:
    - kind: route
      path: src/routes/order.ts
      symbol: submitOrder
  supporting_evidence:
    - kind: service
      path: src/services/order-service.ts
      symbol: submit
  confidence: high
  match_basis:
    - route_and_service_connected
```

Paths and symbols above are reusable examples, not facts for a target project.

### Resolution outcomes

Classify the result as exactly one of:

#### `zero_matches`

No candidate has connected entrypoint and implementation evidence.

- Do not create or modify `detailed-design.md`.
- Report the searched categories and query terms.
- State which evidence is missing.
- Ask the user for one or more concrete locators: route, page/menu text, screenshot, class or method, API path, table/event/job name, source path, or approved business wording.
- Do not convert a similarly named module into the requested feature.

#### `multiple_matches`

Two or more plausible candidates remain, or different code paths implement materially different behaviors.

- Do not generate the document and do not merge candidates.
- Present two to five candidates with display name, `business_id`, entrypoints, evidence paths, and why each matched.
- Ask the user to select or narrow the target.
- If the user chooses one candidate, preserve that choice as human confirmation evidence.

#### `confirmed_feature`

Use this outcome only when both conditions hold:

1. repository evidence connects a concrete entrypoint to implementation evidence; and
2. the user has explicitly identified that exact route, page, symbol, path, or candidate, or has confirmed the presented resolution summary.

If there is one strong match but the user's wording did not identify the exact target, show a compact resolution summary and ask the user to confirm it before writing. A feature name alone never satisfies this outcome.

Persist the gate result in the document evidence baseline:

```yaml
feature_resolution:
  outcome: confirmed_feature
  confirmed_by: user
  confirmation_summary: User confirmed the resolved route and service path.
  resolved_at: "2026-01-01T00:00:00Z"
```

Do not fabricate confirmation. If the interaction does not contain confirmation evidence, the gate remains open and the skill must stop.

## Standards Baseline

Apply standards as structural guidance, not as a certification claim:

- `IEEE 1016-2009` Software Design Descriptions: organize design information by stakeholders, concerns, views, design elements, relationships, attributes, rationale, and design languages. IEEE lists this edition as inactive-reserved, so state that Axis uses its still-relevant SDD concepts rather than claiming current formal compliance.
- `ISO/IEC/IEEE 15289:2019`: record purpose, scope, revision, status, source baseline, review, maintenance, and supersession for the lifecycle information item.
- `ISO/IEC/IEEE 42010:2022`: use explicit stakeholders, concerns, viewpoints, models, correspondences, decisions, and rationale when the feature changes architectural boundaries.
- `ISO/IEC 25010:2023`: express applicable quality characteristics as measurable scenarios.
- `GB/T 8567-2006`: use formal Chinese software-document conventions and complete traceable sections.

Do not cite a standard as evidence for project behavior. Standards govern document structure; repository or approved human evidence governs factual claims.

## Evidence and Claim Rules

- Cite repository-relative path and symbol for every material current-state claim.
- Prefer connected evidence across entrypoint, implementation, data/state, and test layers.
- Treat comments, naming, and stale documents as supporting evidence, not sole proof.
- Label approved user statements as `human_confirmation`; never disguise them as code evidence.
- Put unsupported statements under `assumptions` or `missing evidence`, with impact and confirmation needed.
- If evidence conflicts, present both sides and stop on decisions that would materially alter the design.
- Do not invent endpoints, status values, permissions, tables, columns, indexes, events, dependencies, retries, transactions, caches, code locations, test coverage, or operational guarantees.

## Output Contract

Default output:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/{business_id}/features/{feature_id}/detailed-design.md
```

If no reliable `business_id` exists, ask the user to confirm the owning domain before writing. Do not place the file into a guessed domain. Follow an established repository convention only when it is demonstrably stronger and record the chosen path.

The generated document uses:

```yaml
schema: axis.project_knowledge_doc
schema_version: "0.2"
doc_type: feature_detailed_design
document_language: zh-CN
status: review
doc_status: needs_review
generated_by_skill: axis-doc-feature-detailed-design
```

Use the reference template and include all applicable sections:

- purpose, scope, stakeholders, source baseline, requirements and non-goals;
- confirmed feature identity and current code map;
- actors, permissions, main and exception flows;
- interface contracts, validation rules, errors, state and data models;
- module, class, method, component, and dependency responsibilities;
- interaction sequence and key algorithms;
- transaction, idempotency, and concurrency;
- cache, consistency, retries, timeout, and degradation behavior;
- security, privacy, and audit;
- observability and operational handling;
- tests and acceptance criteria;
- rollout, rollback, compatibility, risks, decisions, assumptions, and missing evidence.

Use Mermaid only when a diagram materially clarifies sequence, state, module relation, or data flow. Each diagram must be backed by surrounding prose and evidence. Render diagrams when local tooling is available; otherwise report rendering as an unverified check.

## Generation Workflow

1. Read project knowledge.
   Load global architecture, inventory, owning domain docs, gap report, and any existing feature document.
2. Run the Feature Resolution Confirmation Gate.
   Build candidates, classify `zero_matches`, `multiple_matches`, or `confirmed_feature`, and stop unless confirmed.
3. Freeze the feature boundary.
   Record `feature_id`, `business_id`, display name, entrypoints, owning components, user confirmation, included behavior, and exclusions.
4. Build traceability.
   Map requirement or rule to flow, interface, state/data element, implementation evidence, test, and acceptance criterion.
5. Draft current and proposed design.
   Clearly separate observed current behavior, approved requirements, proposed decisions, assumptions, and missing evidence.
6. Apply composed skills.
   Use `$axis-doc-tech-design` for technical design reasoning, `$axis-doc-db-design` when persisted data is in scope, and `$axis-doc-development` for API/test/deployment document conventions. Do not broaden the output beyond one feature.
7. Verify.
   Run Markdown checks, Mermaid rendering where available, source-link existence checks, public-safety scans, and no-unresolved-text scans.
8. Hand off.
   Report output, gate evidence, confidence, open decisions, verification results, and whether domain/global documents may need drift review.

## Verification Checklist

- Gate outcome is `confirmed_feature` and contains real user confirmation evidence.
- Exactly one `feature_id` and one owning `business_id` are in scope.
- Every cited path exists and every cited symbol was checked when tooling permits.
- Current behavior, desired behavior, and design proposal are visibly separated.
- Main path and important failure, retry, timeout, permission, and concurrency paths are addressed or explicitly marked not applicable with evidence.
- Interfaces, states, data, module responsibilities, transactions, security, observability, tests, rollout, and rollback are covered when applicable.
- Acceptance criteria trace back to requirements and test points.
- Unsupported claims are under `assumptions` or `missing evidence`, not written as fact.
- No unresolved filler, credentials, private URLs, raw logs, account identifiers, or customer data remain.
- Document language is `zh-CN` unless the user explicitly chose another language.
- Status remains `review` until human approval.

Useful checks:

```bash
rg -n "placeholder|dummy|filler" .axis/docs
rg -n "(token|api[_-]?key|secret|password)\\s*[:=]" .axis/docs
```

Add repository-specific parsers, tests, link checks, and Mermaid rendering commands when available.

## Handoff

After a valid document is generated:

- use `$axis-doc-drift-capture` if the feature design reveals stale domain or global knowledge;
- use `$axis-test-tdd` only when the user asks to implement the design;
- use `$axis-ops-oss-publish` only after explicit upload authorization and a successful dry-run.

When the gate stops generation, the handoff is the confirmation question plus evidence summary. It is not a partial or guessed design.

## After Use Deposition

After using this skill, check whether the session exposed reusable feature-resolution patterns, framework-specific evidence locations, template improvements, validation commands, or ambiguity cases. If yes, update only public-safe skill material, validate the bundle, refresh the local installation, and push to the remote repository when permissions allow. If no reusable change exists, state that no skill update is needed.
