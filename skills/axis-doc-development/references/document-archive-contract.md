# Document Archive Contract

Archive every existing canonical document before modifying it. The archive is an immutable exact-content snapshot plus trace metadata; the current canonical path remains the normal reading path.

## Layout

For a canonical project document:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/{canonical_path}
```

store a snapshot at:

```text
.axis/docs/_archive/orgs/{organization_id}/projects/{project_slug}/{canonical_path}.history/{archive_id}/document{extension}
.axis/docs/_archive/orgs/{organization_id}/projects/{project_slug}/{canonical_path}.history/{archive_id}/metadata.json
```

The `_archive` tree is deliberately outside `.axis/docs/orgs`. Current-document scanners therefore keep their existing canonical list, while archive-aware dashboards can expose history separately.

## Metadata

`metadata.json` uses:

```json
{
  "schema": "axis.document_archive",
  "schema_version": "0.2",
  "archive_id": "timestamp-source-revision-hash",
  "organization_id": "org_example",
  "project_slug": "example-project",
  "canonical_path": "business/capabilities/example_capability/detailed-design.md",
  "current_document": ".axis/docs/orgs/org_example/projects/example-project/business/capabilities/example_capability/detailed-design.md",
  "archive_content": "document.md",
  "archived_at": "ISO-8601 UTC",
  "change_reason": "human-readable reason",
  "request_summary": "bounded request summary",
  "source_revision": "2",
  "target_revision": "3",
  "content_sha256": "64 lowercase hex characters"
}
```

Do not put credentials, private URLs, raw production data, account identifiers or customer data into metadata.

## Execution

Run:

```bash
python3 <skill-dir>/scripts/archive_document.py \
  --repo <repo> \
  --document <canonical-document> \
  --reason <change-reason> \
  --request-summary <summary> \
  --source-revision <current-revision> \
  --target-revision <next-revision>
```

The script:

- rejects documents outside `.axis/docs/orgs/{organization}/projects/{project}`;
- copies bytes without modifying the canonical file;
- computes and records SHA-256;
- uses a collision-safe archive ID;
- returns the existing snapshot when the same canonical content and revision were already archived;
- writes metadata atomically after the archive content;
- reports repo-relative paths as JSON.

## Blocking Rules

- Archive before the first write, not after editing.
- Verify both content and metadata exist and hashes match.
- Stop the document modification when archive creation or verification fails.
- Never edit or delete an archive snapshot.
- An `approved` source produces a new `review` revision with `supersedes`; it is never overwritten in place.
- Dashboard history is read-only and separated from the current document list.
