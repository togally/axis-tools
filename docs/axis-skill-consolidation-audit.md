# Axis Skill Consolidation Audit

## Consolidated Decision

The current decision is **Consolidate now** for overlapping document-generation skills. User-visible triggers had become ambiguous: one feature design could invoke the development router, technical design, database design, feature detailed design, and business-domain design together.

The public document surface is reduced to:

- `axis-doc-development`: one front door for existing-feature export, planned generation, implemented correction, implemented iteration, discovery, `master_draft` expansion, technical/database depth, project-knowledge impact and archival;
- `axis-doc-project-knowledge`: project-wide bootstrap and reconciliation of global architecture, inventory, one overview per level-1 capability, independent secondary designs, navigation, metadata and gaps;
- `axis-doc-drift-capture`: post-task/PR task records, version records and residual drift classification;
- `axis-doc-project-init`: Axis project configuration;
- `axis-doc-dashbord`: current-document review plus separate archive traceability.

Retired top-level bundles are `axis-doc-tech-design`, `axis-doc-db-design`, `axis-doc-feature-detailed-design`, `axis-doc-business-domain`, and `axis-doc-project-knowledge-bootstrap`. Their durable rules and templates were moved into the two surviving bundles rather than discarded.

## Rename Guard

- packaged skill directories match `axis-(code|doc|integration|ops|test|tools|trade)-[a-z0-9][a-z0-9-]*`;
- frontmatter `name`, manifest `name/path`, OpenAI `display_name`, and `$skill-name` prompt agree;
- retired document skills must not reappear in the manifest or packaged directory list;
- retired meta-tool IDs `axis-create-skill`, `axis-skill-create`, and `axis-skill-update` must not remain callable or installed; their owners are `axis-tools-skill-create` and `axis-tools-skill-update`;
- prompt R&D is owned by `axis-tools-prompt-create`, while `axis-tools-skill-create` remains the single packaging entrypoint;
- references may describe retirement history only in this audit, not as callable handoffs;
- tests enforce the new consolidated inventory.

## Consolidation Map

| Retired skill | New owner | Preserved capability |
| --- | --- | --- |
| `axis-doc-tech-design` | `axis-doc-development/references/technical-and-database-design.md` | final technical solution, business/technical separation, failures, consistency, observability, rollout and tests |
| `axis-doc-db-design` | same reference | schema grounding, persisted/derived separation, constraints, indexes, data dictionary, migration and standalone DBDD gate |
| `axis-doc-feature-detailed-design` | `axis-doc-development` and its feature template/lifecycle reference | evidence resolution gate, canonical feature path and detailed-design structure |
| `axis-doc-business-domain` | `axis-doc-project-knowledge` | domain reconciliation, requirement ownership, architecture impact, metadata/inventory/gap updates |
| `axis-doc-project-knowledge-bootstrap` | `axis-doc-project-knowledge` | global architecture and initial one-document-per-level-1-capability bootstrap |

## Boundaries Kept Separate

`axis-doc-drift-capture` remains separate because it consumes completed task or PR evidence and produces audit records; it is not a design generator. Code capture, test reporting, OSS publishing, TDD, benchmarks, performance tuning, bug fixing, meta-tooling, platform integrations and operations dashboards also keep their distinct risk and output contracts.

## Archive And Dashboard Decision

Every modification of an existing canonical design requires a pre-change immutable snapshot under `.axis/docs/_archive/`. Current documents stay under `.axis/docs/orgs/`, so normal paths and default reading remain stable. The dashboard catalog exposes project `archives` and `archive_count` separately and opens history only through a “历史追溯” action.

## Current Packaged Document Inventory

- `axis-doc-dashbord`
- `axis-doc-development`
- `axis-doc-drift-capture`
- `axis-doc-project-init`
- `axis-doc-project-knowledge`
