---
name: axis-test-tdd
description: Use when the user explicitly requests TDD or a code skill conditionally hands off an authorized behavior change to RED-GREEN-REFACTOR. / 用于用户明确要求 TDD，或代码技能将已授权的行为变更交由红绿重构流程执行。
---

# Test-Driven Development

Drive one authorized behavior from an observed failing check to the smallest passing implementation, then refactor while green. TDD is an implementation method; the parent bugfix, feature, architecture, or performance workflow retains ownership of the final outcome.

## When to Use

- The user explicitly asks for TDD, test-first, RED-GREEN-REFACTOR, or a failing test before production code.
- `$axis-code-bugfix`, `$axis-code-arch-optimize`, or another implementation workflow conditionally hands off a clearly defined behavior.
- The behavior is small enough to express in one focused test slice.

## Do Not Use

- Do not implicitly take over every feature, bugfix, refactor, or code-edit request.
- Do not use for diagnosis-only work, report packaging, generated artifacts, or pure configuration without executable behavior.
- Do not use a unit-test shortcut for a real external effect; apply `$axis-test-side-effects` when the RED/GREEN path would mutate external state.
- Do not rewrite or delete user-owned work to manufacture a RED state.

## Inputs

- Authorized behavior change, literal acceptance criteria, owning implementation workflow, and repository test conventions.
- Existing code path, nearby tests, smallest focused command, and relevant edge or failure cases.
- Dirty-worktree boundary and identification of changes created by the current agent in the current run.
- External-effect boundary, if the test touches state outside the local process.

## Three-Step Work Contract

1. Co-create the behavior target. Confirm one observable behavior, expected result, smallest test slice, and authorization to implement it.
2. Execute RED-GREEN. Write and run the focused test, verify it fails for the intended missing behavior, then make the smallest production change that passes.
3. Verify and refactor. Rerun the focused check, nearby regressions, and requested smoke checks; refactor only while green and report exact evidence.

## Light Adversarial Review

Keep review at or below 30% of the interaction. Challenge ambiguous acceptance, setup failures disguised as RED, implementation-shaped tests, excessive mocks, unsafe external effects, and pressure to claim RED retroactively. Once the behavior and test boundary are clear, implement.

## Non-Destructive RED Rule

Never delete, reset, overwrite, or discard user-owned or pre-existing changes to force a failing test.

- For new behavior not yet implemented, observe the focused test fail before writing production code.
- If the current agent wrote implementation first in this run, revert only that agent-owned edit when it can be isolated without touching user work, then observe RED.
- If behavior predates the test or cannot be safely reverted, add a characterization or regression check and prove its sensitivity with a controlled pre-fix baseline, mutation, or existing failing revision when available.
- If no honest RED can be observed, do not fabricate it. Report that classic TDD ordering was not verified and provide the strongest non-destructive regression evidence available.

## Workflow

1. Write one test for one behavior and run the exact focused command.
2. Confirm the failure is the expected missing behavior, not import, syntax, fixture, environment, or setup failure.
3. Implement the smallest passing change and rerun the same command.
4. Run nearby regressions; for real external effects, pause and apply the side-effect authorization gate before execution.
5. Refactor only after green and keep the focused plus adjacent checks green.
6. Return control and evidence to the owning workflow.

## Outputs

- Behavior and acceptance criterion tested.
- Exact RED command, failure reason, and whether classic RED ordering was honestly observed.
- Minimal implementation change and exact GREEN result.
- Adjacent regression or smoke results and any skipped verification.
- Parent workflow receiving the evidence and any residual risk.

## Safety and Boundaries

- Preserve all user-owned, pre-existing, unrelated, and unstaged changes.
- Never claim a typo, broken fixture, or test setup failure as behavioral RED.
- Mock only unavoidable boundaries; tests should exercise real production behavior at the narrowest safe layer.
- Do not trigger external writes without the exact authorization, impact, cleanup, and stop gate from `$axis-test-side-effects`.
- Do not broaden the implementation beyond the accepted behavior merely to make a test easier to pass.

## Checks

- One behavior per focused test; names containing multiple outcomes are split where practical.
- RED failed for the intended reason or the report explicitly states why classic RED could not be observed safely.
- The same focused command passes after the minimal change.
- Nearby regressions pass, and refactoring occurred only while green.
- No user-owned change was deleted or reset.

## After Use Deposition

If the run produced a reusable test boundary, non-destructive RED method, command, or edge case, update this skill bundle, validate it, refresh the local copy, and push when permissions allow. Otherwise report that no skill update is needed.
