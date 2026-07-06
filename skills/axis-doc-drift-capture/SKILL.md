---
name: axis-doc-drift-capture
description: Use when a completed task or PR needs Axis v0.2 task records, version iteration records, and document drift impact classification. / 用于在任务或 PR 完成后记录 Axis v0.2 任务执行、版本迭代和文档漂移影响。
---

# Document Drift Capture

Use this skill after implementation, review, or testing work changes a repository and the project knowledge documents need an auditable record of what happened. The output helps a project owner or code reviewer answer what the AI changed, how it was verified, which documents are still current, and which documents need a new revision.

Keep this skill public-safe. Do not copy raw logs, credentials, tokens, cookies, connection strings, private hosts, customer data, account names, internal issue links, or unredacted production payloads into reusable skill text or generated records. Summarize evidence and store only safe references.

## Boundary

Produce project-specific record drafts and document drift decisions:

- `task_execution_record`
- `version_iteration_record`
- `affected_docs`
- `doc_gap_report` update recommendations

Do not replace `domain_business_spec`, `domain_technical_design`, global architecture documents, or experience cards with a task record. Do not approve documents, publish packages, upload OSS artifacts, or silently modify `approved` project knowledge documents.

## Three-Step Work Contract

1. Co-create the capture target.
   Confirm the task or issue, PR URL, commit range, changed files, verification evidence, project docs in scope, document update authorization, and whether a version record already exists. If an issue or PR provides these inputs, summarize them and proceed.
2. Execute the capture.
   Build the task record, classify changed-file signals, map them to affected documents, and prepare version or gap updates. Preserve evidence boundaries and mark missing inputs instead of guessing.
3. Verify and report.
   Parse generated YAML or Markdown, confirm required fields, run no-placeholder and public-safety scans, and report exact commands, changed records, affected docs, stale docs, and follow-up items.

Keep light adversarial review under 30% of the interaction. Use it to challenge unsafe shortcuts such as treating a task record as a domain document, approving stale docs without review, hiding failed verification, or copying private evidence into public-safe records.

## Inputs

Collect these inputs before writing records:

- task identity: issue ID, issue key, title, assignee or agent, requester, start time, completed time;
- PR and commit evidence: PR URL, PR number, base commit, head commit, commit SHA list, merge status when known;
- change evidence: changed files, change summary, changed modules, generated files, deleted files, migration or config changes;
- verification evidence: build, lint, tests, benchmark, review, manual checks, skipped checks, failed checks;
- existing project knowledge: global architecture docs, `business_inventory`, domain docs, previous task records, version records, gap report;
- authorization: whether this run may write new document revisions or only mark stale and create follow-up items.

If PR diff, changed files, verification output, or approved docs are unavailable, record that as evidence missing and set the relevant drift decision to `blocked` or `low_confidence`.

## Task Execution Record

Every `task_execution_record` must include:

```yaml
schema: axis.project_knowledge_doc
schema_version: "0.2"
doc_type: task_execution_record
task_execution_record:
  task_id: WHA-000
  issue_id: null
  issue_key: WHA-000
  task_title: Public-safe task title
  actor:
    type: agent
    name: axis-agent
  requested_by: null
  started_at: "2026-07-06T00:00:00Z"
  completed_at: "2026-07-06T00:00:00Z"
  pr_url: null
  pr_number: null
  commit_sha: null
  commit_range:
    base: null
    head: null
  changed_files:
    - path: skills/example/SKILL.md
      change_type: modified
      change_category: code
      summary: Public-safe summary of the change.
  verification:
    status: passed
    commands:
      - command: npm run test:axis-skills
        result: passed
        evidence_summary: Focused packaged-skill checks passed.
    skipped:
      - command: npm test
        reason: Not required for documentation-only changes.
  affected_docs: []
  risk_items: []
  follow_up_items: []
```

Required fields are `task_id`, `issue_id`, `task_title`, `actor`, `started_at`, `completed_at`, `pr_url`, `commit_sha`, `changed_files`, `verification`, `affected_docs`, `risk_items`, and `follow_up_items`. Use `null` only when the source does not exist or is unavailable, and add a follow-up item explaining the missing evidence.

## Affected Document Classification

Classify each changed file or PR diff signal before deciding document impact. Use these change categories:

| change_category | Typical evidence | Required affected-doc response |
| --- | --- | --- |
| `code` | services, controllers, pages, jobs, commands, scripts | Review global technical architecture and related domain technical docs. |
| `api` | routes, OpenAPI, RPC contracts, DTOs, request or response schemas | Review domain business spec, domain technical design, and API docs if present. |
| `schema` | migrations, ORM entities, data dictionaries, validation schemas | Review domain technical design and database design docs. |
| `cache` | cache keys, TTL, invalidation, queues, async state | Review technical architecture and affected domain technical docs. |
| `permission` | roles, policies, guards, menus, feature flags | Review business rules, permissions, and technical enforcement docs. |
| `business_flow` | workflow states, user journeys, status transitions, domain service orchestration | Review project business architecture, business inventory, and domain business spec. |
| `config` | environment names, deployment descriptors, package scripts | Review technical architecture, deployment docs, and runbooks. |
| `tests` | unit, integration, contract, e2e, benchmark tests | Link as verification evidence and review test plan docs if present. |
| `docs` | project knowledge docs or README files | Check revision, supersedes, status, and consistency with changed code. |

Every affected document decision must use one of these statuses:

- `unchanged`: evidence shows the document is still current, with a short reason.
- `needs_revision`: the document should receive a new review revision in this task or a follow-up.
- `stale`: the document may no longer match the code, but this run is not authorized to modify it.
- `missing`: the expected document does not exist.
- `conflict`: available documents disagree with code, tests, or each other.
- `blocked`: classification cannot be completed because required evidence is absent or public-safety validation failed.

Record decisions in `affected_docs`:

```yaml
affected_docs:
  - doc_type: domain_technical_design
    path: .axis/docs/orgs/{organization_id}/projects/{project_slug}/business/domains/example/technical-design.yaml
    status: stale
    reason: Service and permission changes affect this business domain.
    change_categories:
      - code
      - permission
    evidence_refs:
      - kind: changed_file
        path: src/example-service.ts
        summary: Public-safe change summary.
    recommended_action: generate_new_revision
```

## No Silent Approved-Doc Rewrite

Use `doc_update_authorization` to decide what this run may do:

```yaml
doc_update_authorization:
  may_create_task_record: true
  may_create_version_record: true
  may_create_new_doc_revisions: false
  may_modify_approved_docs: false
  source: issue_scope
```

Rules:

- Always create or propose a task record when public-safety validation passes.
- If `may_create_new_doc_revisions` is false, do not edit project architecture, inventory, or domain docs. Mark them `stale`, `missing`, `conflict`, or `needs_revision`, and create follow-up items.
- If a document is `approved`, never mutate it in place. Create a new review revision with `supersedes` only when authorization explicitly allows new revisions.
- If verification failed, a task record may still exist, but the version record must not mark the work as completed or release-ready.
- If public-safety validation fails, stop writing records that contain unsafe evidence and produce a redacted follow-up only.

## Version Iteration Record Rules

Use `version_iteration_record` to summarize a release, milestone, stage, or PR set. It should reference task records rather than repeat every detail.

Required version update fields:

```yaml
version_iteration_record:
  version_id: v0.2-stage3
  title: Public-safe version or stage title
  status: review
  task_records:
    - records/tasks/WHA-000.yaml
  included_issues: []
  included_prs: []
  included_commits: []
  verification_summary:
    status: passed
    evidence_refs: []
  document_changes:
    unchanged: []
    needs_revision: []
    stale: []
    missing: []
    conflict: []
  risks: []
  follow_up_items: []
```

Update rules:

- Append the task record reference to the version record when the version scope is known.
- Group affected docs by status so users can see current, stale, missing, and conflicting knowledge.
- Do not mark a version `approved` or `completed` unless verification passed and all blocking document drift has an owner or explicit acceptance.
- When no version scope exists, output a follow-up item that asks the owner whether this task belongs to an existing version record or a new one.

## Workflow

1. Read task and repository evidence.
   Gather issue details, PR diff, changed files, commits, execution report, test report, and existing `.axis/docs` records.
2. Normalize evidence.
   Convert each changed file into a change category, redact unsafe details, and attach concise evidence refs.
3. Build the task record.
   Fill all required fields, including missing evidence markers and verification status.
4. Classify affected docs.
   Use `business_inventory`, doc refs, changed file paths, API/schema/cache/permission/business_flow signals, and existing records to decide `unchanged`, `needs_revision`, `stale`, `missing`, `conflict`, or `blocked`.
5. Apply authorization.
   If authorized, create new review revisions. If not, emit stale markers and follow-up items only.
6. Update version and gap recommendations.
   Link the task record, update grouped document drift lists, and add gap report recommendations for missing or stale docs.
7. Verify and report.
   Parse outputs, scan for placeholders and unsafe content, then report generated records, affected docs, verification evidence, risks, and follow-ups.

## Validation

Run checks appropriate for the generated format and repository:

- YAML or JSON parser for generated records.
- No-placeholder scan for unresolved markers and empty required fields.
- Public-safety scan for credentials, tokens, private URLs, raw logs, connection strings, and customer data.
- Cross-reference check that every affected doc path exists, is marked `missing`, or has a follow-up item.
- Verification evidence check that failed or skipped commands are not reported as passed.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases for document drift capture. If yes, update this skill bundle, validate it, refresh the local install, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
