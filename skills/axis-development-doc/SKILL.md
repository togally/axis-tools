---
name: axis-development-doc
description: Use when the user asks to create one or more development documents such as 概要设计, 详细设计, database design, API docs, test plans, deployment docs, or Word/DOCX outputs from a prompt or repo evidence. / 用于根据提示词或仓库证据生成一个或多个开发文档，包括概要设计、详细设计、数据库设计、接口文档、测试方案、部署文档或 Word 文档。
---

# Development Document Creation

Use this skill to generate one or more development documents from a user prompt, repository evidence, pasted requirements, schemas, APIs, or previous discussion. It acts as the document-set router for development work, while specialized skills such as `$axis-tech-design-doc` and `$axis-db-design-doc` remain the preferred deep workflows for technical design and database design documents.

Keep this skill public-repo safe. Do not embed private repository names, hostnames, table names, credentials, customer names, or project-specific facts in this reusable workflow. Put task-specific facts only in the generated documents for that task.

## When to Use

- The user asks to create `开发文档`, `概要设计`, `详细设计`, `需求规格`, `接口文档`, `数据库设计`, `测试方案`, `部署方案`, `运维手册`, `验收文档`, or a mix of those documents.
- The user gives a prompt and expects one document or a document set rather than implementation code.
- The user asks for Word/DOCX output for one or more development documents.
- The user wants industry-standard or formal document structure, but does not specify an exact template.
- The request needs routing between existing document skills, especially `$axis-tech-design-doc` for technical design and `$axis-db-design-doc` for database design.

Do not use this for tiny README edits, code comments, changelog notes, or a pure code review unless the user asks to produce retained development documentation.

## Core Principle

Turn the user's prompt into the smallest complete set of useful development documents, grounded in evidence and written as final deliverables. Preserve the user's literal business wording when it defines scope, names, statistics口径, states, or acceptance criteria.

When the user says the document should describe the final target, write the final contract directly. Avoid current-state, migration, investigation-history, old-vs-new, or background sections unless the user explicitly asks for them.

## Three-Step Work Contract

1. Co-create the document target with the user.
   Identify requested document types, audience, output format, source of truth, final-only vs current-state preference, standards or template basis, and acceptance criteria. Ask only for missing information that materially changes the document; otherwise proceed with explicit assumptions.
2. Execute the document set.
   Produce the requested document or documents using the selection matrix below. Reuse specialized skills when they apply, inspect repo evidence when available, and keep each artifact independently useful.
3. Verify the result.
   Check every generated document against required sections, evidence coverage, no-placeholder rules, requested output format, and Word/DOCX rendering or parse checks when applicable. Report generated paths and what was verified.

Keep light adversarial review below 30% of the interaction. Use it to catch missing evidence, unsafe assumptions, weak boundaries, guessed schema/API facts, or conflicts between multiple documents. Once scope is clear, write the documents decisively.

## Light Adversarial Review

Before finalizing a development document set, pressure-test it:

- Does the document set match the user's latest prompt and corrections?
- Are business terms, statistics口径, state names, endpoint names, and visible labels preserved exactly where the user specified them?
- Is each claim grounded in repo code, schema, API definitions, logs, screenshots, pasted text, or an explicit assumption?
- Are generated documents consistent with each other on module boundaries, data ownership, states, APIs, permissions, error handling, and acceptance criteria?
- Are final-only documents polluted with current implementation history or migration notes?
- Are database, API, testing, and deployment documents routed to the right specialized workflow instead of being guessed from a generic template?

If a risk changes the final deliverable, fix the document. If it does not block the deliverable, state it as an assumption, risk, or verification item.

## Document Selection Matrix

| User asks for | Generate | Preferred workflow |
| --- | --- | --- |
| `概要设计`, high-level design, HLD | Overview design document | Use this skill's `概要设计` structure, and reuse `$axis-tech-design-doc` when architecture or technical solution depth is required. |
| `详细设计`, low-level design, LLD | Detailed design document | Use this skill's `详细设计` structure, with implementation anchors, algorithms, state transitions, APIs, data interactions, errors, and tests. |
| `技术方案`, `技术设计`, solution design | Technical design document | Invoke or follow `$axis-tech-design-doc`. |
| `数据库设计`, data dictionary, schema design, DBDD | Database design document | Invoke or follow `$axis-db-design-doc`. |
| `接口文档`, API document | API contract document | Ground in controllers, route definitions, OpenAPI, DTOs, mapper SQL, or pasted API examples. |
| `需求规格`, PRD, SRS | Requirements specification | Capture scope, roles, user stories, business rules, states, non-functional needs, and acceptance criteria. |
| `测试方案`, test plan | Test design document | Cover scope, environments, test data, scenarios, boundary cases, regression cases, and acceptance checks. |
| `部署方案`, `运维手册`, runbook | Deployment or operations document | Cover environments, configuration, release steps, observability, rollback, permissions, and troubleshooting. |
| `开发文档`, `多种文档`, `文档集` | Document set | Select the smallest coherent set from this matrix; explain the selection briefly in the final response. |

If the user names multiple documents, generate all named documents. If the user gives a broad prompt without naming document types, infer the smallest useful set and proceed unless the ambiguity is high-risk.

## Default Document Set

For a non-trivial feature request that only says `开发文档`, default to:

1. Requirements or scope summary, if business behavior is not already clear.
2. 概要设计文档.
3. 详细设计文档.
4. Database design only when persistent schema or field dictionaries are part of the work.
5. API document only when external or frontend-backend contracts are part of the work.
6. Test plan when behavior, data, or integration risk is material.

Do not inflate the set with documents that add no decision value.

## 概要设计 Structure

Use this structure for overview design unless the user provides a stricter template:

1. Document Control
2. Purpose and Scope
3. Template Basis and References
4. Business Context and Goals
5. Overall Architecture
6. Functional Modules
7. Data Overview
8. External Interfaces and Dependencies
9. Key Workflows
10. Non-Functional Design
11. Security and Permissions
12. Risks, Assumptions, and Acceptance Criteria

The overview should explain what is built, why it exists, who uses it, major components, key flows, and the main design boundaries. It should not duplicate every method, SQL detail, or test case from the detailed design.

## 详细设计 Structure

Use this structure for detailed design unless the user provides a stricter template:

1. Document Control
2. Scope and Design Inputs
3. Module Responsibilities
4. Domain Model and Data Mapping
5. API and Interface Contracts
6. State Model and Lifecycle
7. Core Algorithms and Calculation Rules
8. Transaction, Idempotency, and Concurrency Design
9. Error Handling and Compensation
10. Security, Permissions, and Audit
11. Observability
12. Test Design
13. Deployment, Rollback, and Compatibility Notes
14. Open Assumptions and Risks

The detailed design should be specific enough for implementation. Include pseudo-code, state transition tables, sequence diagrams, request/response contracts, validation rules, and data dictionary references when they materially reduce ambiguity.

## API Document Structure

For interface documents, include:

- API inventory and versioning.
- Authentication, authorization, and tenant or actor context.
- Endpoint path, method, purpose, request parameters, response fields, examples, and error codes.
- Idempotency, pagination, sorting, filtering, upload/download, callbacks, and retry behavior where relevant.
- Backward compatibility and deprecation notes.

Ground API claims in routes, controllers, OpenAPI files, DTOs, tests, logs, or pasted source.

## Test Plan Structure

For test documents, include:

- Test objectives and scope.
- Environment and dependency assumptions.
- Test data and reset rules.
- Functional scenarios, boundary scenarios, negative cases, concurrency/idempotency cases, integration cases, and regression cases.
- Acceptance criteria mapped back to requirements and design guarantees.
- Evidence expected from logs, metrics, screenshots, database rows, API responses, or generated files.

## Word/DOCX Output

When the user requests Word/DOCX:

- Generate real `.docx` files using available document tooling such as python-docx, LibreOffice, or the local document skill/tooling. Do not rename Markdown to `.docx`.
- Use a cover page, revision table, table of contents when feasible, consistent heading levels, page numbers, and readable tables.
- Put generated files under `output/doc/` unless the repository has a stronger convention.
- For multiple Word documents, use stable filenames such as `<feature>概要设计文档.docx` and `<feature>详细设计文档.docx`.
- Verify the DOCX by parsing headings and tables, and render or visually inspect representative pages when tooling is available.

## Evidence Gathering

Prefer real sources over memory or guesses:

- Existing requirements, user prompt, screenshots, logs, or pasted business rules.
- Code modules, controllers, services, entities, migrations, mapper SQL, DTOs, tests, scripts, and configuration.
- Existing docs as secondary context.
- Current standards or public templates only when the user asks for formal standards or citations.

If a standard, law, regulation, or current product/library behavior could have changed, verify it from current primary sources before citing it.

## Output Rules

- Default to Markdown unless the user asks for Word/DOCX, PDF, or another format.
- For multiple documents, create one file per document unless the user asks for a combined document.
- Use Chinese headings when the user's request is Chinese, and preserve exact Chinese business wording.
- Keep final retention documents focused on the target design. Put assumptions and risks in bounded sections rather than mixing uncertainty into every paragraph.
- Avoid placeholders such as `TBD`, `TODO`, `待补充`, `待定`, `xxx`, or empty tables.
- Include diagrams using Mermaid when they clarify architecture, sequence, ER, state machine, or deployment flow.

## Verification Checklist

Before delivery, verify:

1. The generated document types match the user's request or the documented selection logic.
2. 概要设计 and 详细设计 are clearly separated when both are requested.
3. Specialized database and technical design needs reuse or follow `$axis-db-design-doc` and `$axis-tech-design-doc`.
4. Required sections are present and not empty.
5. Source evidence or explicit assumptions back important business, API, database, state, and calculation claims.
6. Cross-document terms, state names, API names, and data ownership are consistent.
7. Final-only documents do not include unwanted current-state, old implementation, or investigation-history sections.
8. Word/DOCX files are real documents and have been parsed, rendered, or visually checked when tooling allows.
9. Generated paths are reported clearly.

Useful local checks:

```bash
rg -n "TODO|TBD|待补|待定|xxx|XXX|\\.\\.\\." output/doc
```

For this reusable skill itself, run the skill validator, repository tests, and local skill refresh workflow before claiming it is installed:

```bash
python3 <codex-skill-validator> <axis-tools>/skills/axis-development-doc
npm test
node scripts/axis-update-skills.mjs --repo <axis-tools> --agent codex --no-pull --json
```

## Common Mistakes

- Generating only a generic template when the user asked for a real document.
- Writing 概要设计 and 详细设计 with the same level of detail.
- Guessing database fields or API responses without source evidence.
- Creating a document set that is larger than the user's actual need.
- Forgetting Word/DOCX verification after generating files.
- Treating earlier discussion as final when the user's latest correction changed the contract.
- Copying private project facts into the reusable skill instead of the generated task document.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
