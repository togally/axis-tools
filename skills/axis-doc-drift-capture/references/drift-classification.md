# Document Drift Classification

## Change categories

| Category | Evidence examples | Documents to review |
| --- | --- | --- |
| `code` | service, controller, page, job, command | technical architecture and owning secondary design |
| `api` | route, RPC/OpenAPI contract, request/response schema | requirement, secondary design and API docs |
| `schema` | migration, ORM entity, validation schema | secondary design and database design |
| `cache` | cache key, TTL, invalidation, queue state | technical architecture and owning secondary design |
| `permission` | role, policy, guard, menu, feature flag | business rules, permission matrix and enforcement design |
| `business_flow` | journey, state transition, orchestration | business architecture, inventory and capability designs |
| `config` | environment, deployment descriptor, package script | technical architecture, deployment docs and runbooks |
| `tests` | unit, integration, contract, e2e, benchmark | verification evidence and test plan |
| `docs` | project knowledge or retained design | revision, supersedes and consistency checks |

Classify the demonstrated change, not merely the file extension. One file may carry several categories when evidence supports them.

## Affected-document statuses

- `unchanged`: evidence proves the current document still matches, with a short reason.
- `needs_revision`: an authorized owning workflow should create a new review revision.
- `stale`: likely inconsistent, but this run cannot revise it.
- `missing`: the expected document does not exist.
- `conflict`: code, tests or documents disagree.
- `blocked`: required evidence is absent or public-safety validation failed.

Every decision records `doc_type`, path, status, reason, categories, concise evidence refs and a recommended action.

## Authorization

```yaml
doc_update_authorization:
  may_create_task_record: true
  may_create_version_record: true
  may_create_new_doc_revisions: false
  may_modify_approved_docs: false
  source: issue_scope
```

- Task/version records may be created only within their granted flags.
- `may_create_new_doc_revisions: false` means drift decisions and follow-ups only.
- `may_modify_approved_docs` remains false; an approved document is superseded by a new review revision, never overwritten.
- Public-safety failure blocks unsafe record output and permits only a redacted follow-up.
