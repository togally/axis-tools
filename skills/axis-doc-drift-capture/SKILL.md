---
name: axis-doc-drift-capture
description: Use when completed implementation, review, or test work needs Axis task records, version impact, and document-drift classification. / 用于实现、评审或测试完成后记录 Axis 任务执行、版本影响和文档漂移分类。
---

# Document Drift Capture

Capture what a completed task or PR changed, how it was verified, and which canonical project documents remain current or need follow-up. This is an audit-record workflow, not a document-authoring workflow.

## When to Use

- A task, commit range, or PR is complete enough to record changed files and verification evidence.
- A version or milestone needs links to completed task records and a grouped document-impact summary.
- Code/API/schema/config/permission/business-flow changes need an auditable project-knowledge drift decision.

## Do Not Use

- Do not design the feature, implement code, or replace global/capability documents with a task record.
- Do not silently rewrite, approve, publish, or upload canonical project knowledge.
- Do not claim completion when verification or required evidence is missing.

## Inputs

- task identity, requester/actor, start and completion times;
- issue, PR, base/head commit and commit list when available;
- changed files, modules, migrations, generated/deleted files, and a public-safe summary;
- passed, failed and skipped build/test/review/benchmark evidence;
- current project knowledge, task/version records, and gap report;
- `doc_update_authorization`, including whether new reviewed revisions may be created by the owning workflow.

## Outputs

- one `task_execution_record` draft or validated record;
- an optional `version_iteration_record` update when the version scope is known;
- `affected_docs` decisions using `unchanged`, `needs_revision`, `stale`, `missing`, `conflict`, or `blocked`;
- gap recommendations, risks, missing evidence, and follow-up owners/actions.

Read [record-schemas.md](references/record-schemas.md) for required record fields and [drift-classification.md](references/drift-classification.md) for change categories, statuses, and authorization rules.

## Safety and Boundaries

- Keep reusable text and generated records public-safe. Redact credentials, tokens, cookies, private hosts, connection strings, customer/account data, raw logs, private issue links, and production payloads.
- Treat PR diffs, changed files, verification output, and approved documents as evidence. Mark absence as missing evidence; never guess.
- If `may_create_new_doc_revisions` is false, produce drift decisions and follow-ups only. Canonical revisions belong to `$axis-doc-project-knowledge` after authorization.
- Never mutate an `approved` document in place. A future authorized change creates a new `review` revision with `supersedes`.
- A failed verification may be recorded, but the version must not be marked completed or release-ready.

## Workflow

1. Read and normalize task, repository, PR and verification evidence.
2. Classify every changed file using the domain categories in [drift-classification.md](references/drift-classification.md).
3. Build the task record and mark unavailable values explicitly.
4. Map each signal to expected canonical documents and assign exactly one drift status with concise evidence refs.
5. Apply `doc_update_authorization`; this skill records or recommends revisions but does not author canonical knowledge.
6. Link the task into a known version record, or add one follow-up asking which version owns it.
7. Parse, safety-scan and cross-reference the outputs, then report exact records, decisions and residual gaps.

## Checks

- YAML/JSON parses and every required field is present or paired with a missing-evidence follow-up.
- Changed-file categories, affected-doc statuses, evidence refs and recommended actions agree.
- Every affected path exists, is marked `missing`, or has a follow-up.
- Failed or skipped commands are never reported as passed.
- Version completion requires passed verification and an owner or explicit acceptance for blocking drift.
- No task record substitutes for a global, level-1, secondary, requirement, or feature design.
- Public-safety and placeholder scans pass.

Run the bundled validator where applicable:

```bash
python3 <skill-dir>/quick_validate.py
```

## After Use Deposition

Check whether the run produced a reusable category correction, status rule, schema field, redaction check, or edge case. If yes, update this bundle, validate it, refresh the local install, and push when authorized. Otherwise report that no skill update is needed.
