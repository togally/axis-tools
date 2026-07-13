# Feature Resolution and Document Lifecycle

## Existing Feature Resolution

Scan connected evidence across:

- `routes`, API specifications, commands, events, jobs and consumers;
- controllers, handlers, resolvers and adapters;
- pages, screens, menus, permissions and feature flags;
- application/domain services, workers and integrations;
- entities, DTOs, repositories, mappers, migrations and schemas;
- unit, integration, contract, end-to-end and benchmark tests;
- runtime configuration and accepted project knowledge.

Name-only matches are insufficient. A valid candidate has at least one concrete entrypoint connected to implementation evidence. Record paths, symbols, match basis and confidence.

Outcomes:

- `zero_matches`: nothing is written; report search scope and ask for a locator.
- `multiple_matches`: nothing is written; present two to five candidates and ask the user to choose.
- `confirmed_feature`: evidence and explicit user confirmation identify exactly one feature, one owning `level1_capability_id`, and at least one affected `secondary_capability_id`.

## Planned Feature Resolution

For behavior intentionally absent from code, use `confirmed_planned_feature` only after the user confirms:

- stable `feature_id` and display name;
- owning `level1_capability_id` and `level1_capability_name`;
- at least one owning `secondary_capability_id` and its `business_ids` mapping;
- product goal and target user;
- scope and non-goals;
- main acceptance boundary;
- whether it extends an existing capability or introduces a new one.

Do not mislabel absence from code as a failed existing-feature lookup.

## Canonical Paths

Use established repository conventions when stronger. Axis v0.2 defaults are:

```text
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/features/{feature_id}/detailed-design.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/requirements/{requirement_id}/master-draft.md
.axis/docs/orgs/{organization_id}/projects/{project_slug}/business/capabilities/{level1_capability_id}/requirements/{requirement_id}/detailed-design.md
```

Keep exactly one current overview per `level1_capability_id` and one detailed design per inventory-declared `secondary_capability_id`. The overview contains the complete summary/link matrix; child documents contain full local design. Historical content belongs under `_archive`, not beside current files.

## Revision Rules

- New planned documents start as `review` unless the user explicitly chooses `draft`.
- Correcting a `draft` or `review` document still requires archival before changing the canonical file.
- An `approved` document is immutable. Archive it and create a new `review` revision with `supersedes` pointing to the prior document revision.
- Do not reuse a revision number for different content.
- Update metadata, doc refs, source baseline, content hash and gap items with the canonical revision.
- Preserve superseded history; never delete it merely because the current design changed.

## Iteration Document Minimum

An implemented-feature iteration must state:

- current contract and approved target contract;
- product and business-flow change;
- affected modules, APIs, data, permissions, states and dependencies;
- compatibility and migration behavior;
- performance and capacity impact;
- rollout, observability and rollback;
- test and acceptance evidence required;
- which canonical feature, level-1 capability and global documents receive new revisions, and which secondary-capability sections change.
