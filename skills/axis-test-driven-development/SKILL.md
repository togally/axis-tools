---
name: axis-test-driven-development
description: Use when implementing any feature, bugfix, refactor, or behavior change before writing production code.
---

# Axis Test-Driven Development

## Overview

Use TDD for code changes: write a focused failing test, watch it fail for the expected reason, write the smallest implementation, watch it pass, then refactor while staying green.

**Core principle:** If the test did not fail first, it has not proven it can catch the missing behavior.

## When To Use

- Implementing a feature, bug fix, refactor, or behavior change.
- Changing behavior in code with weak or missing tests.
- Fixing a bug found during manual QA, logs, review, or production use.
- Adding edge-case handling, validation, concurrency rules, or error handling.

Do not use this for throwaway exploration, generated code, or pure configuration unless the user explicitly wants TDD there.

## Iron Law

```text
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Code written before a failing test must be deleted and restarted from the test. Do not keep it as reference, adapt it, or treat tests-after as equivalent.

## Workflow

1. Choose one behavior.
2. Write the smallest test that describes that behavior.
3. Run the exact focused test command and confirm RED.
4. Check the failure is expected: missing behavior, not typo/setup/import error.
5. Implement the smallest production change that can pass.
6. Run the same focused test and confirm GREEN.
7. Run nearby regression tests.
8. Refactor only after green; keep tests green.
9. Repeat for the next behavior or bug.

## Bug Fix Rule

Every bug fix starts with a reproducing test. The test should fail before the fix and pass after the fix. A manual reproduction, log line, or pasted stack trace is evidence for writing the test, not a substitute for it.

## Good Red Tests

| Quality | Rule |
| --- | --- |
| Focused | One behavior per test; split names containing "and". |
| Real | Exercise real production code; mock only unavoidable boundaries. |
| Diagnostic | Failure message points at the missing behavior. |
| Narrow | Run the smallest command that proves this behavior first. |

## Common Rationalizations

| Excuse | Reality |
| --- | --- |
| "Too small to test" | Small changes break; write the tiny test. |
| "I'll add tests after" | Tests-after prove less because they are biased by the implementation. |
| "I already manually verified" | Manual checks are not repeatable regression protection. |
| "Existing code has no tests" | Add the first characterization or behavior test now. |
| "Deleting work is wasteful" | Keeping unproven code is the expensive path. |

## Completion Checklist

- [ ] Each behavior change has a test.
- [ ] The test was observed failing before implementation.
- [ ] The failure reason was expected.
- [ ] The implementation was minimal.
- [ ] The focused test passes.
- [ ] Nearby regression tests pass.
- [ ] Refactoring happened only after green.

## After Use

Report the exact RED command/result and GREEN command/result. If a full test suite was skipped, say why and name the narrower verification that ran.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
