# Axis Skill Consolidation Audit

## Current Decision

All packaged skills in `axis-tools` use the required `axis-{category}-xxx` format. The current optimization decision is: **Do not merge now** at the directory or packaged-skill level.

The repository should keep the current 22 packaged skill bundles as separately installable capabilities, and consolidate them through documented families, routers, handoffs, and automated naming guards instead. This preserves clear trigger semantics for Codex and Claude Code while still reducing ambiguity for maintainers.

## Rename Guard

The required naming contract is:

- every packaged skill directory under `skills/` must match `axis-(code|doc|integration|ops|skill|test)-[a-z0-9][a-z0-9-]*`;
- every `SKILL.md` front matter `name` must exactly match the directory name;
- every `skills/manifest.json` entry must use the same `name` and `path: skills/<name>`;
- every `agents/openai.yaml` `display_name` must exactly match the skill name so UI pickers show the `axis-{category}-xxx` identifier;
- every `agents/openai.yaml` default prompt must reference `$<axis-skill-name>`;
- new skills created or deposited by `scripts/axis-skill-create.mjs` and `scripts/axis-skill-deposit.mjs` must keep the same `axis-{category}-xxx` rule.

This guard is covered by `tests/axis-skills.test.mjs` so a future nonconforming skill name fails the source validation suite.

## Consolidation Findings

| Family | Skills | Finding | Decision |
| --- | --- | --- | --- |
| Document design | `axis-doc-development`, `axis-doc-tech-design`, `axis-doc-db-design` | These overlap because all generate retained development documentation. `axis-doc-development` already acts as the document-set router, while `axis-doc-tech-design` and `axis-doc-db-design` carry deeper technical and schema-specific quality gates. | Keep separate. Integrate through the `axis-doc-development` selection matrix and explicit handoff references. |
| Project knowledge | `axis-doc-project-knowledge-bootstrap`, `axis-doc-business-domain`, `axis-doc-drift-capture` | These form one lifecycle: first project bootstrap, then per-domain document generation, then drift/task/version capture after changes. | Keep separate. Treat as a pipeline under the v0.2 project knowledge protocol. |
| v0.1 local package | `axis-doc-project-init`, `axis-code-capture`, `axis-test-report`, `axis-ops-oss-publish` | These are adjacent stages for local outbox creation and publishing, but the v0.1 contract, CLI config, tests, and package metadata refer to each skill by name. | Keep separate. Consolidate only in docs and config as one package workflow. |
| Fix and optimization | `axis-code-bugfix`, `axis-code-arch-optimize`, `axis-code-api-performance-tuning`, `axis-test-benchmark` | These often appear in the same engineering session, but they represent different phases: measurement, root-cause repair, architecture extraction, and post-benchmark performance tuning. | Keep separate. Use handoffs: benchmark evidence can trigger performance tuning; repeated bugfix patterns can trigger architecture optimization. |
| Test and verification | `axis-test-tdd`, `axis-test-side-effects`, `axis-test-report`, `axis-test-benchmark` | These all concern validation, but their risk models differ: RED/GREEN unit behavior, real side effects, report capture, and capacity measurement. | Keep separate. Maintain a shared verification family in docs instead of merging runtime instructions. |
| Skill governance | `axis-skill-create`, `axis-skill-update` | These support skill lifecycle work with distinct outputs: candidate creation/refactoring and local installation refresh. | Keep separate; neither needs a generic review-summary wrapper. |
| Domain specialty | `axis-ops-ali-dashboard`, `axis-integration-yunxiao-codeup` | These are specialized workflows with external platform contracts and bundled references/scripts. | Keep separate. Do not merge into generic engineering or governance skills. |

## Why Not Merge The Obvious Groups

### `axis-doc-development` vs specialized document skills

`axis-doc-development` is already the consolidation point. It chooses the smallest useful document set and routes deep technical or schema work to `axis-doc-tech-design` and `axis-doc-db-design`.

Merging the specialized skills into the router would make the router longer and easier to invoke incorrectly. Keeping the specialized skills separate preserves sharper triggers for requests that explicitly ask for technical design or database design.

### v0.1 package workflow skills

`axis-doc-project-init`, `axis-code-capture`, `axis-test-report`, and `axis-ops-oss-publish` are a pipeline, not duplicates. The CLI config and v0.1 contract use these names as stable producer identifiers. Merging them would break auditability of which stage created or published a package.

### Fix, architecture, benchmark, and performance tuning

`axis-test-benchmark` produces evidence; `axis-code-api-performance-tuning` consumes benchmark evidence after a confirmation gate; `axis-code-bugfix` handles root-cause repair from logs or failures; `axis-code-arch-optimize` lifts repeated local behavior into a shared architecture boundary. The overlap is intentional handoff, not duplicated ownership.

## Future Merge Triggers

Only consider a packaged-skill merge when all of these are true:

1. Two skills share the same trigger wording, the same required evidence, and the same output contract.
2. Their `After Use Deposition` updates repeatedly change the same instructions.
3. The merge does not break CLI config, manifest tests, public catalog docs, v0.1/v0.2 protocol references, or installed `$skill-name` prompts.
4. A replacement router skill can preserve the old behaviors with explicit routing and deprecation notes.

Possible future candidates:

- `axis-doc-development`, `axis-doc-tech-design`, and `axis-doc-db-design` could be represented by one public catalog family, but should remain separate packaged skills unless trigger confusion becomes measurable.

## Current Packaged Skill Inventory

All current packaged skills are intentionally retained:

- `axis-ops-ali-dashboard`
- `axis-code-api-performance-tuning`
- `axis-code-arch-optimize`
- `axis-test-benchmark`
- `axis-code-bugfix`
- `axis-doc-business-domain`
- `axis-code-capture`
- `axis-skill-create`
- `axis-doc-db-design`
- `axis-doc-development`
- `axis-doc-drift-capture`
- `axis-ops-oss-publish`
- `axis-doc-project-init`
- `axis-doc-project-knowledge-bootstrap`
- `axis-doc-tech-design`
- `axis-test-tdd`
- `axis-test-report`
- `axis-test-side-effects`
- `axis-skill-update`
- `axis-integration-yunxiao-codeup`
