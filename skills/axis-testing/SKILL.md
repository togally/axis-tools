---
name: axis-testing
description: Use when testing backend actions that trigger real external side effects, device or service state changes, broker messages, asynchronous progress, or cleanup-sensitive operations.
---

# Axis Testing

## Overview

Use this skill to test commands that cause real side effects in external systems. The core principle is to prove the current action, observe the state it creates, and leave the system in a known condition.

## When To Use

- A backend endpoint publishes to a broker, calls a third-party API, controls hardware, starts a job, or mutates remote state.
- The user asks for a real integration test instead of a mock or simulated path.
- The feature exposes asynchronous status, progress, callbacks, or cached action results.
- The operation needs a specific precondition before the action is meaningful.

Do not use this for pure unit tests, read-only endpoints, or actions whose real side effects are unsafe without explicit user approval.

## Test Pattern

1. Identify the semantic precondition. Put the system into that state before testing the target action.
2. Capture a before snapshot from the same interface the product uses: API response, cache key, event stream, broker topic, database row, or device status.
3. Establish a status boundary for the new attempt. Clear stale cached status, add a request timestamp, action id, or correlation id, then trigger the action.
4. Observe the real signal path. Prefer production code and the configured external endpoint over hand-published fake messages.
5. Poll for state and progress until a terminal condition, timeout, or user-safe stop point.
6. Verify both command acceptance and effect. A `"sent"` response alone is not success.
7. Run cleanup that restores the original state, then verify cleanup through the same observation path.
8. Record exact evidence: command, time window, before/after state, progress events, and any missing callback.

## Quick Reference

| Question | Required Evidence |
| --- | --- |
| Is this result from the current attempt? | Timestamp, action id, correlation id, or cache reset before send |
| Did the command really go out? | API response plus broker/client/service log or observed downstream state |
| Did progress work? | Intermediate progress payloads or proof that no progress arrived before timeout |
| Is the environment safe now? | Cleanup command plus final state snapshot |

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Testing the action without preparing the real precondition | Drive the prerequisite state first, then test the target action |
| Treating `sent` as success | Separate dispatch acknowledgement from effect, progress, and terminal status |
| Reusing stale cache/status | Reset old action fields or compare `updatedAt` with the current request time |
| Simulating the external callback when the user asked for real testing | Use the configured integration path and mark only blocked parts as unverified |
| Forgetting cleanup | Restore state and verify the restoration before finishing |

## Report Format

Report the tested action, environment, observation path, before state, sent time, progress/status samples, final state, cleanup result, and anything that was not observed.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
