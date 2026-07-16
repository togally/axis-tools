# Project Knowledge Contracts

## Canonical layout

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/metadata.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/technical.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/architecture/business.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/inventory.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/level1-capability-dependency-graph.yaml
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/gaps/doc-gap-report.md
```

History exists only under `.axis/docs/_archive/` and never appears as another current document.

## Reader profiles

`compact` is the default. It retains complete identity and evidence in hidden metadata while exposing concise business content. It does not require fixed `3.N` groups, complete parent/child journey expansion, table-ID unions, full ER evidence, or visible eight-part interface expansions.

`strict_full` is optional and requires an explicit audit need plus complete evidence. It may require sequential `3.N.1/.2/.3`, parent/child journey bindings, complete Controller/Service/data anchors, ER/table unions and one `5.N.1` through `5.N.8` group per interface. Historical strict documents without `reader_profile` are grandfathered until materially reconciled.

## Evidence and presentation

- Connect entrypoints, UI/menu/permission, services, integrations, repositories/mappers, entities/tables, migrations/schemas and tests.
- Record repository-relative `path:begin-end#symbol`, supported conclusion, confidence and verification time in hidden evidence.
- Reader-facing evidence uses only `FileName:begin-end#symbol` and business-relevant fields.
- Horizontal tables have at most six columns; prose-heavy records use vertical `项目 / 内容` tables.
- Business diagrams contain business actions, decisions, states or results. Implementation diagrams contain concrete method calls. Never mix the layers or combine multiple units in one node.

## Dependency graph

The project graph is the only source for level-1 upstream/downstream relationships.

- If any parent journey or child interface coverage is partial, keep `pending_level1_completion`, `edges: []`, one stable gap and `not_derived` projections.
- After every parent/child design is complete, run one project-wide synthesis and write the graph before batch-updating overview projections.
- Reject self edges, unknown nodes, duplicate edge IDs and duplicate `(from,to,relation_type,stage)` relations.
- A boundary or relationship-evidence change invalidates the graph and every affected projection; never patch one overview independently.

## Archive and lifecycle

- Before changing a canonical file, create an immutable exact-content archive with request/reason, source/target revision and SHA-256 metadata.
- Stop the modification when archive creation or hash verification fails.
- Keep the current canonical path stable for readers.
- `approved` is never overwritten; a new `review` revision records `supersedes`.
- Supported lifecycle values are `draft`, `review`, `approved`, `completed`, `superseded`, `archived` and `rejected`; uncertainty belongs in explicit quality/gap state, not invented content.
