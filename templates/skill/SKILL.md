---
name: axis-skill-example
description: Use when demonstrating a public-safe Axis skill template with mock inputs and redacted examples. / 用于演示只包含 mock 输入和脱敏示例的公开安全 Axis 技能模板。
---

# Axis Example Skill

Use this template when creating a new public-safe Axis skill bundle. Replace the example topic with a reusable workflow that can be understood without access to non-public systems.

## Scope

- Keep the workflow generic and reusable.
- Use mock inputs, redacted examples, and public references only.
- Keep detailed reference material in `references/` when the main instructions grow too large.
- Keep deterministic helper scripts in `scripts/` only when the workflow needs repeatable execution.

## Inputs

- A mock task brief.
- A public or redacted example artifact.
- A clear success criterion that does not depend on hidden project context.

## Outputs

- A concise action plan.
- A validated artifact or review result.
- Notes that can be safely deposited back into the public bundle.

## Safety Gate

Before using or updating this skill, check that examples do not contain credentials, non-public hostnames, personal data, platform identifiers, real incident text, screenshots, or raw logs.

## Validation

Run the smallest command that proves the workflow still works. If no script exists, validate the instructions by applying them to the mock example in this bundle.

## After Use Deposition

After using the skill, deposit only reusable and public-safe improvements:

- Add generic edge cases that would help the next user.
- Replace real artifacts with mock or redacted equivalents.
- Update `skill.meta.yaml` when scope, safety, or validation changes.
- Do not add one-off project facts.
