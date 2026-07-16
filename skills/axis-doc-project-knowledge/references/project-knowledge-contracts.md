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

`compact` is the default. It retains complete identity and evidence in hidden metadata while exposing concise business content. A secondary document still shows every evidence-backed participant with one controlled type (`业务角色`, `外部系统`, `内部业务能力`, or `自动任务`), business responsibility, participating steps and permission/data scope; one atomic business-step row per actor/action with explicit next-step IDs or a terminal marker; and one independently numbered `5.N` summary per real HTTP, event, topic, job or command contract. Implementation components are evidence, not business participants. Concise means fewer business-relevant fields, never merged participants, compound flow steps or combined interfaces.

`compact` does not require fixed `3.N` groups, complete parent/child journey expansion, table-ID unions, full ER evidence, or visible eight-part interface expansions. The hidden access matrix keeps one row per caller/producer × `api_id`; consumers and handlers stay in the flow mapping and are never relabeled as callers. Its `api_id` set must equal the independent interface-summary set, and each normalized concrete contract maps back to exactly one `api_id`. A flow-step machine table gives every visible step exact evidence and an explicit `caller|producer|consumer|handler|not_applicable` relationship; it may map the same step to multiple independent contracts, or the same contract to multiple real participant steps. Internal steps use one evidence-backed `not_applicable` row; they never inherit the caller's HTTP `api_id` merely because they execute underneath it.

`strict_full` is optional and requires an explicit audit need plus complete evidence. It may require sequential `3.N.1/.2/.3`, parent/child journey bindings, complete Controller/Service/data anchors, ER/table unions and one `5.N.1` through `5.N.8` group per interface. Historical strict documents without `reader_profile` are grandfathered until materially reconciled.

## Reader evidence gate

Boundary locking and reader readiness are separate project-wide gates. Inventory `evidence_refs`, a representative method or one boundary anchor cannot be promoted directly into participant, flow and interface facts. Before rendering each locked secondary document, its reader evidence card must prove concrete business participants/responsibilities, atomic actions and state/branch results, real observable contracts, permission/data scope and bound implementation evidence. The frozen detailed-design prompt returns `ready` only when that card is sufficient; `blocked` records actionable gap codes and produces no reader document. The project gate passes only when every locked secondary is ready, never when only one level-1 capability is polished.

Reusable text such as “发起有证据支持的契约”“复核调用权威”“形成并返回已锁定的业务结果” is scaffold, not evidence. `COMMAND internal:Class.method`, `JOB internal:Class.method`, `COMMAND Class.method`, `JOB XxxJob.method` and `JOB XxxTask schedule` are synthetic implementation labels and are forbidden; class, method, scheduler class and schedule labels belong only in implementation evidence. A real named business command or scheduled-job identifier remains valid when its observable boundary is independently evidenced.

## Evidence and presentation

- Connect entrypoints, UI/menu/permission, services, integrations, repositories/mappers, entities/tables, migrations/schemas and tests.
- Record repository-relative `path:begin-end#symbol`, supported conclusion, confidence and verification time in hidden evidence.
- Reader-facing evidence uses only `FileName:begin-end#symbol` and business-relevant fields.
- Horizontal tables have at most six columns; prose-heavy records use vertical `项目 / 内容` tables.
- Participant tables expose only participant, controlled participant type, business responsibility, participating steps and permission/data scope. Flow tables expose only step, participant, atomic action, precondition, result/next state plus explicit next step, and failure/compensation.
- Interface summaries expose only interface/trigger, business purpose, caller/participant, precondition/permission, key input, business result/state change, failure/rejection condition, corresponding flow steps and compact implementation location.
- Every `5.N` heading and fixed nine-field summary is reader-visible. Each retained implementation-machine row contains exactly one full path anchor; rows without exact evidence are omitted and tracked as gaps. Every visible short implementation locator resolves to exactly one anchor inside the same `5.N` block.
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
