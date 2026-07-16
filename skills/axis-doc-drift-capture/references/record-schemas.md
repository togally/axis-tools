# Drift Record Schemas

Use these shapes as retained contracts. Add repository-specific values only to generated records, never to this public reference.

## Task execution record

```yaml
schema: axis.project_knowledge_doc
schema_version: "0.2"
doc_type: task_execution_record
task_execution_record:
  task_id: TASK-000
  issue_id: null
  task_title: Public-safe task title
  actor:
    type: agent
    name: axis-agent
  requested_by: null
  started_at: "2026-01-01T00:00:00Z"
  completed_at: "2026-01-01T00:00:00Z"
  pr_url: null
  pr_number: null
  commit_sha: null
  commit_range:
    base: null
    head: null
  changed_files:
    - path: src/example.ts
      change_type: modified
      change_category: code
      summary: Public-safe change summary.
  verification:
    status: passed
    commands: []
    skipped: []
  affected_docs: []
  risk_items: []
  follow_up_items: []
```

Required fields are `task_id`, `issue_id`, `task_title`, `actor`, `started_at`, `completed_at`, `pr_url`, `commit_sha`, `changed_files`, `verification`, `affected_docs`, `risk_items`, and `follow_up_items`. Use `null` only when the source is absent or unavailable and add a follow-up when the missing value affects traceability.

## Version iteration record

```yaml
schema: axis.project_knowledge_doc
schema_version: "0.2"
doc_type: version_iteration_record
version_iteration_record:
  version_id: v0.2-stage
  title: Public-safe version title
  status: review
  task_records: []
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
    blocked: []
  risks: []
  follow_up_items: []
```

Reference task records instead of repeating their file and command detail. Do not mark a version `approved` or `completed` unless verification passed and blocking drift has an owner or explicit acceptance.
