# Axis Skill Consolidation Audit

## Consolidated Decision

The current decision is **Consolidate now** for overlapping document-generation skills. User-visible triggers had become ambiguous: one feature design could invoke the development router, technical design, database design, feature detailed design, and business-domain design together.

The public document surface is reduced to:

- `axis-doc-development`: one front door for existing-feature export, planned generation, implemented correction, implemented iteration, discovery, `master_draft` expansion, technical/database depth, project-knowledge impact and archival;
- `axis-doc-project-knowledge`: project-wide bootstrap and reconciliation of global architecture, inventory, one overview per level-1 capability, independent secondary designs, navigation, metadata and gaps;
- `axis-doc-drift-capture`: post-task/PR task records, version records and residual drift classification;
- `axis-doc-project-init`: Axis project configuration;
- `axis-doc-dashboard`: current-document review plus separate archive traceability.

Retired top-level bundles are `axis-doc-tech-design`, `axis-doc-db-design`, `axis-doc-feature-detailed-design`, `axis-doc-business-domain`, and `axis-doc-project-knowledge-bootstrap`. Their durable rules and templates were moved into the two surviving bundles rather than discarded.

## Whole-Inventory Refactor

The current packaged inventory contains 26 canonical skills: the 19 outcome owners established by the whole-inventory refactor plus seven non-overlapping additions (`axis-doc-contract-review`, `axis-integration-doudian-merchandising`, and five `axis-trade-*` skills). All 26 remain because each owns a distinct primary result; no additional merge is justified after comparing trigger, output, evidence and risk boundaries.

The original 19-skill refactor cohort has explicit `When to Use`, `Do Not Use`, `Inputs`, `Outputs`, `Safety and Boundaries`, `Checks`, and `After Use Deposition` sections. Coding, design and external-action workflows also retain a task-specific three-step contract and light adversarial review capped at 30%. Deep schemas, templates and playbooks live in `references/`; each front door stays below 180 lines. The seven newer skills keep their own domain-specific gates while participating in the same canonical naming, manifest and routing inventory.

`skills/routing.json` is the executable overlap registry. It assigns one unique primary outcome to every skill and permits only acyclic one-way handoffs. Important boundaries are:

- benchmark measures; API performance tuning changes a proven slow read path;
- bugfix owns a failure outcome; TDD is an explicitly selected implementation method;
- code capture and test report package existing evidence only and never trigger automatically;
- feature development emits a development set plus a project-knowledge change set; project knowledge alone edits the canonical project-wide set;
- project knowledge may request prompt R&D or an exact-run OSS publication, but neither handoff runs implicitly;
- skill creation owns packaging; prompt creation owns blind prompt evaluation; skill update owns local installation and migration.
- Doudian merchandising owns explicitly invoked, App-driven same-category opportunity selection, market/copy/pricing review, supplier/profit-gated automatic publication, and post-action verification; it does not overlap source-control, operations, or generic prompt packaging outcomes.

Runtime safety was tightened with the same refactor: benchmark defaults to public GET without login or packaged credentials, side-effect tests require exact impact and cleanup authorization, Codeup rejects untrusted/non-HTTPS token destinations and redirects, and OSS consent is bound to one `run_id + target_prefix` pair.

## Rename Guard

- packaged skill directories match `axis-(code|doc|integration|ops|test|tools|trade)-[a-z0-9][a-z0-9-]*`;
- frontmatter `name`, manifest `name/path`, OpenAI `display_name`, and `$skill-name` prompt agree;
- retired document skills must not reappear in the manifest or packaged directory list;
- retired pre-taxonomy aliases (`axis-api-performance-tuning`, `axis-arch-optimize`, `axis-benchmark`, `axis-bugfix`, `axis-business-domain-doc`, `axis-coding-capture`, `axis-db-design-doc`, `axis-development-doc`, and `axis-ali-dashboard`) must be migrated to their canonical `axis-{category}-*` owners;
- the misspelled `axis-doc-dashbord` entry is retired in favor of `axis-doc-dashboard`;
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

`axis-doc-drift-capture` remains separate because it consumes completed task or PR evidence and produces audit records; it is not a design generator. Contract review remains separate because it owns legal-source, clause-adjudication and DOCX delivery gates rather than software design generation. Code capture, test reporting, OSS publishing, TDD, benchmarks, performance tuning, bug fixing, meta-tooling, platform integrations and operations dashboards also keep their distinct risk and output contracts.

The `axis-trade-*` family also remains split by independently selectable outcome: system-parameter governance, factual portfolio ledger, evidence-producing risk research, investment-plan admission, and read-only daily monitoring. The dependency direction is `system + portfolio + research -> plan -> daily brief`; no trade skill may execute an order or package personal financial data in the public repository.

## Archive And Dashboard Decision

Every modification of an existing canonical design requires a pre-change immutable snapshot under `.axis/docs/_archive/`. Current documents stay under `.axis/docs/orgs/`, so normal paths and default reading remain stable. The dashboard catalog exposes project `archives` and `archive_count` separately and opens history only through a “历史追溯” action.

## Current Packaged Document Inventory

- `axis-doc-contract-review`
- `axis-doc-dashboard`
- `axis-doc-development`
- `axis-doc-drift-capture`
- `axis-doc-project-init`
- `axis-doc-project-knowledge`
