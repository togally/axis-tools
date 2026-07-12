# Axis Skill Consolidation Audit

## Current Decision

All packaged skills in `axis-tools` already use the required `axis-xxx` format. The current optimization decision is: **Do not merge now** at the directory or packaged-skill level.

The repository should keep the current 21 packaged skill bundles as separately installable capabilities, and consolidate them through documented families, routers, handoffs, and automated naming guards instead. This preserves clear trigger semantics for Codex and Claude Code while still reducing ambiguity for maintainers.

## Rename Guard

The required naming contract is:

- every packaged skill directory under `skills/` must match `axis-[a-z0-9][a-z0-9-]*`;
- every `SKILL.md` front matter `name` must exactly match the directory name;
- every `skills/manifest.json` entry must use the same `name` and `path: skills/<name>`;
- every `agents/openai.yaml` `display_name` must exactly match the skill name so UI pickers show the `axis-xxx` identifier;
- every `agents/openai.yaml` default prompt must reference `$<axis-skill-name>`;
- new skills created or deposited by `scripts/axis-create-skill.mjs` and `scripts/axis-skill-deposit.mjs` must keep the same `axis-xxx` rule.

This guard is covered by `tests/axis-skills.test.mjs` so a future non-axis skill name fails the source validation suite.

## Consolidation Findings

| Family | Skills | Finding | Decision |
| --- | --- | --- | --- |
| Document design | `axis-development-doc`, `axis-tech-design-doc`, `axis-db-design-doc` | These overlap because all generate retained development documentation. `axis-development-doc` already acts as the document-set router, while `axis-tech-design-doc` and `axis-db-design-doc` carry deeper technical and schema-specific quality gates. | Keep separate. Integrate through the `axis-development-doc` selection matrix and explicit handoff references. |
| Project knowledge | `axis-project-knowledge-bootstrap`, `axis-business-domain-doc`, `axis-doc-drift-capture` | These form one lifecycle: first project bootstrap, then per-domain document generation, then drift/task/version capture after changes. | Keep separate. Treat as a pipeline under the v0.2 project knowledge protocol. |
| v0.1 local package | `axis-project-init`, `axis-coding-capture`, `axis-test-report`, `axis-oss-publish` | These are adjacent stages for local outbox creation and publishing, but the v0.1 contract, CLI config, tests, and package metadata refer to each skill by name. | Keep separate. Consolidate only in docs and config as one package workflow. |
| Fix and optimization | `axis-bugfix`, `axis-arch-optimize`, `axis-api-performance-tuning`, `axis-benchmark` | These often appear in the same engineering session, but they represent different phases: measurement, root-cause repair, architecture extraction, and post-benchmark performance tuning. | Keep separate. Use handoffs: benchmark evidence can trigger performance tuning; repeated bugfix patterns can trigger architecture optimization. |
| Test and verification | `axis-test-driven-development`, `axis-testing`, `axis-test-report`, `axis-benchmark` | These all concern validation, but their risk models differ: RED/GREEN unit behavior, real side effects, report capture, and capacity measurement. | Keep separate. Maintain a shared verification family in docs instead of merging runtime instructions. |
| Skill governance | `axis-create-skill`, `axis-update`, `axis-review-summary` | These all support skill lifecycle work, but their outputs differ: candidate creation, local install refresh, and public-safe review map. | Keep separate for now. A future `axis-skill-governance` router could be added only if users repeatedly ask for a single entrypoint. |
| Domain specialty | `axis-ali-dashboard`, `axis-yunxiao-codeup` | These are specialized workflows with external platform contracts and bundled references/scripts. | Keep separate. Do not merge into generic engineering or governance skills. |

## Why Not Merge The Obvious Groups

### `axis-development-doc` vs specialized document skills

`axis-development-doc` is already the consolidation point. It chooses the smallest useful document set and routes deep technical or schema work to `axis-tech-design-doc` and `axis-db-design-doc`.

Merging the specialized skills into the router would make the router longer and easier to invoke incorrectly. Keeping the specialized skills separate preserves sharper triggers for requests that explicitly ask for technical design or database design.

### v0.1 package workflow skills

`axis-project-init`, `axis-coding-capture`, `axis-test-report`, and `axis-oss-publish` are a pipeline, not duplicates. The CLI config and v0.1 contract use these names as stable producer identifiers. Merging them would break auditability of which stage created or published a package.

### Fix, architecture, benchmark, and performance tuning

`axis-benchmark` produces evidence; `axis-api-performance-tuning` consumes benchmark evidence after a confirmation gate; `axis-bugfix` handles root-cause repair from logs or failures; `axis-arch-optimize` lifts repeated local behavior into a shared architecture boundary. The overlap is intentional handoff, not duplicated ownership.

## Future Merge Triggers

Only consider a packaged-skill merge when all of these are true:

1. Two skills share the same trigger wording, the same required evidence, and the same output contract.
2. Their `After Use Deposition` updates repeatedly change the same instructions.
3. The merge does not break CLI config, manifest tests, public catalog docs, v0.1/v0.2 protocol references, or installed `$skill-name` prompts.
4. A replacement router skill can preserve the old behaviors with explicit routing and deprecation notes.

Possible future candidates:

- `axis-create-skill`, `axis-update`, and `axis-review-summary` could become one governance router if lifecycle tasks become too fragmented.
- `axis-development-doc`, `axis-tech-design-doc`, and `axis-db-design-doc` could be represented by one public catalog family, but should remain separate packaged skills unless trigger confusion becomes measurable.

## Current Packaged Skill Inventory

All current packaged skills are intentionally retained:

- `axis-ali-dashboard`
- `axis-api-performance-tuning`
- `axis-arch-optimize`
- `axis-benchmark`
- `axis-bugfix`
- `axis-business-domain-doc`
- `axis-coding-capture`
- `axis-create-skill`
- `axis-db-design-doc`
- `axis-development-doc`
- `axis-doc-drift-capture`
- `axis-oss-publish`
- `axis-project-init`
- `axis-project-knowledge-bootstrap`
- `axis-review-summary`
- `axis-tech-design-doc`
- `axis-test-driven-development`
- `axis-test-report`
- `axis-testing`
- `axis-update`
- `axis-yunxiao-codeup`
