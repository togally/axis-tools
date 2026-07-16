---
name: axis-doc-development
description: Use when one existing or planned feature needs discovery, a master draft, or a traceable development-document set. / 用于单个已有或规划功能需要需求问询、主草稿或可追溯开发文档集时。
---

# Feature Development Documentation

Use this skill as the single front door for one feature's development documents. It produces feature-scoped artifacts and a project-knowledge impact change set; it does not directly rewrite canonical project knowledge or publish to OSS.

## When to Use

Choose exactly one mode:

| Mode | Use when |
| --- | --- |
| `existing_feature_export` | Confirmed current or approved target behavior needs a feature-scoped document export. |
| `planned_feature_generation` | A new feature needs discovery, an approved `master_draft`, and design documents before implementation. |
| `implemented_feature_correction` | Feature documents are missing or factually stale while intended product behavior is unchanged. |
| `implemented_feature_iteration` | Approved behavior will change and needs an iteration design before code changes. |

## Do Not Use

- Do not bootstrap or reconcile the project-wide capability inventory, global architecture, level-1 overviews, or secondary-capability canonical documents; hand those changes to `$axis-doc-project-knowledge`.
- Do not create task/version audit records; use `$axis-doc-drift-capture` after implementation or PR completion.
- Do not implement code, approve documents, or publish/upload documents unless the user separately authorizes the owning workflow.

## Inputs

- target repository and one feature, route, page, API, event, job, symbol, table, screenshot, or approved requirement;
- latest confirmed business wording, scope, non-goals, actors, outcomes, constraints, and acceptance;
- existing canonical project knowledge and repository evidence from entrypoint through tests;
- desired document types and output format;
- authorization to create or modify feature-scoped documents.

## Outputs

- `development_document_set`: one approved `master_draft` when required plus the smallest coherent feature-scoped requirements, overview, technical, detailed, API, database, test, deployment, or iteration documents requested;
- `project_knowledge_change_set`: affected `level1_capability_id`, `secondary_capability_id`, `business_ids`, evidence, impact category, reason, and recommended canonical action for `$axis-doc-project-knowledge`;
- feature-document archive records, checks, assumptions, unresolved decisions, and implementation work still awaiting authorization.

## Safety and Boundaries

- Preserve the user's literal business semantics. Never present assumptions, market inference, or missing code evidence as confirmed behavior.
- Resolve one owning level-1 capability and at least one secondary capability before retaining feature documents; stop on zero or ambiguous matches.
- Modify only feature-scoped development documents authorized for this run. Never directly edit canonical global, inventory, dependency-graph, level-1, or secondary-capability documents.
- Never call a real OSS upload from this skill. Canonical changes and their exact-run upload confirmation belong to `$axis-doc-project-knowledge` and `$axis-ops-oss-publish`.
- Archive every existing feature document before its first modification. Stop when archive creation or hash verification fails.
- Do not expose credentials, private URLs, raw production payloads, customer identifiers, or unsupported implementation claims.

## Three-Step Work Contract

1. Co-create and resolve. Select one mode, confirm the feature and capability ownership, gather evidence, and obtain approval of the `master_draft` before expansion in code-changing modes.
2. Execute. Archive affected feature documents, create the smallest requested development-document set, and emit a separate project-knowledge change set without applying it.
3. Verify and report. Validate evidence, decisions, links, archives, formats, acceptance and cross-document consistency; then hand canonical impacts to `$axis-doc-project-knowledge` and report any code work awaiting authorization.

## Feature Resolution Confirmation Gate

Read [feature-resolution-and-lifecycle.md](references/feature-resolution-and-lifecycle.md) before resolving an existing feature:

- `zero_matches`: request one concrete locator; do not invent a feature.
- `multiple_matches`: show two to five evidence-backed candidates and ask the user to select.
- `confirmed_feature`: require connected entrypoint-to-implementation evidence plus confirmed capability ownership.

For `planned_feature_generation` and `implemented_feature_iteration`, read [discovery-and-master-draft.md](references/discovery-and-master-draft.md). Ask one compact batch covering the material `product`, `architecture`, `performance`, `business_flow`, `database_design`, and `market` dimensions plus security, rollout, rollback and acceptance. Recommend an option before alternatives and record accepted, skipped, assumed or unresolved decisions.

### Expansion Gate

The `master_draft` is the single approved source for downstream feature documents. Show its conclusions, decisions, assumptions and expansion set, then wait for explicit approval. Revise the draft before downstream documents when the user corrects it.

## Document Production

Select the smallest coherent set. Read [technical-and-database-design.md](references/technical-and-database-design.md) for technical and data depth and [feature-detailed-design-template.md](references/feature-detailed-design-template.md) for the feature-level detailed-design structure. Canonical level-1/secondary templates remain owned by `$axis-doc-project-knowledge`.

Use one Markdown file per independently reviewable artifact by default. A requested DOCX must be a real rendered Word document, not renamed Markdown; PDF is generated only when requested. Reader-facing horizontal tables have at most six columns. Show only business-relevant fields and short `FileName:begin-end#symbol` evidence; retain full repository-relative anchors in machine metadata when traceability requires them.

Before modifying a current feature document, apply [document-archive-contract.md](references/document-archive-contract.md):

```bash
python3 <skill-dir>/scripts/archive_document.py --help
```

## Light Adversarial Review

Spend no more than 30% of the interaction challenging an invented feature match, hidden product decision, unsafe architecture, unmeasured performance claim, weak schema, broken business flow, silent overwrite, or premature implementation. Once evidence and decisions are sufficient, produce the documents decisively.

## Checks

- Exactly one operating mode and one resolved feature are recorded.
- Code-changing modes have an explicitly approved `master_draft` before expansion.
- Every claim traces to confirmed wording, the approved draft, repository evidence, or a visible assumption/gap.
- The output contains `development_document_set` and a separate `project_knowledge_change_set`; no canonical project-knowledge file was directly modified.
- Every modified feature document has a pre-change archive and matching SHA-256 metadata.
- Tables, diagrams, evidence labels, terminology, states, API/data behavior, acceptance, rollout and rollback are concise and consistent.
- No code execution or OSS upload is inferred from document approval.
- Generated files parse/render correctly and contain no filler, secrets, private hosts, raw payloads, or customer data.

## After Use Deposition

Check whether the run produced reusable discovery questions, master-draft gates, archive edge cases, output-selection rules, or impact-classification corrections. If yes, update only public-safe bundle material, validate it, refresh the local install, and push when authorized. Otherwise report that no skill update is needed.
