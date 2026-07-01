---
name: axis-tech-design-doc
description: Use when the user asks to write, refine, or finalize a technical design document or solution design for retention. / 用于撰写、优化或定稿可留档的技术设计文档和方案设计，尤其适合区分业务设计与技术设计。
---

# Technical Design Document

Use this skill to turn an evolving technical discussion into a durable design document. The output should be useful for retention, review, implementation, and later debugging.

This skill is public-repo safe. Do not bake private repository names, hostnames, table names, credentials, customer names, or internal product facts into the skill. When a user asks for a repo-specific document, inspect the repo during that task and keep private details in the generated document, not in this reusable skill.

## When to Use

- The user asks to `输出设计文档`, `写一份技术方案`, `最终设计`, `留档`, `方案设计`, `技术设计`, or `业务和技术两方面设计`.
- The conversation contains multiple corrections and the user wants the final design, not a transcript of the debate.
- The user asks to remove current-state, old-SQL, legacy-implementation, or background descriptions from a final design document.
- The user wants a design that covers business behavior and technical implementation together.
- The user wants a document that future engineers can implement from.

Do not use this skill for simple README updates, API reference extraction, changelog writing, or pure code comments unless the user is asking for a decision-bearing design document.

## Core Principle

Write the final design the team should build, not a diary of how the team arrived there.

Use a lightly adversarial design-review stance before finalizing: verify the design against the user's latest correction and available evidence, surface hidden assumptions, name boundary and consistency risks, and challenge shortcuts that would make the retained design unsafe or misleading. Keep this constructive, bounded, and under 30% of the interaction; once the final intent is clear, write the design decisively instead of turning the document into a debate log.

## Three-Step Work Contract

1. Co-create the design target with the user.
   Clarify the final business intent, audience, scope, source of truth, acceptance criteria, and the evidence needed to write the document. Preserve the user's corrected wording exactly where it defines the business rule.
2. Execute the design result.
   Write or revise the retained design document around the agreed final target, separating business design from technical design when relevant.
3. Verify the result.
   Check the document against the acceptance list, final-only wording rules, latest user correction, and any repo/code evidence used. Report what was checked and what remains an assumption.

Keep light adversarial review under 30% of the interaction. Use it to surface unsafe assumptions and boundary risks, not to keep the design in permanent discussion.

If the user says the document is for final retention, avoid sections such as:

- current implementation;
- current SQL;
- legacy problem;
- background investigation;
- old path vs new path;
- temporary workaround.

Include those only when the user explicitly asks for migration notes, source tracing, or before/after comparison.

## Workflow

### 1. Recover the Final Intent

Scan the latest user corrections before writing. The last correction usually wins.

Extract:

- the final business rule;
- who sees what;
- what must be guaranteed;
- what is allowed to fail or be skipped;
- what must not happen;
- what should be shared by multiple flows;
- which terms the user used and wants preserved.

When the user corrects the design, rewrite the document around that correction instead of adding a small note at the bottom.

### 1.5. Light Adversarial Review

Before writing the retained document, pressure-test the design lightly:

- Is the source of truth explicit?
- Are business terms and user-visible behavior preserved exactly as the user corrected them?
- Are module boundaries, ownership, and dependencies clean?
- Are consistency, idempotency, concurrency, rollback, and failure rules believable?
- Are there hidden operational costs, high-frequency paths, or external dependency risks?
- Is the document accidentally describing today's implementation instead of the final target?

If a risk changes the design, incorporate the safer design directly. If it does not block the requested design, mention it as a bounded risk or test requirement rather than derailing the document.

### 2. Separate Business Design and Technical Design

Use two major sections:

```text
Business Design
Technical Design
```

Business design should answer:

- what the user can do;
- what the operator/admin can do;
- visible states and wording;
- success path;
- failure path;
- boundary rules;
- priority of guarantees;
- examples that explain edge cases.

Technical design should answer:

- service/module boundaries;
- state machine;
- data model;
- uniqueness and consistency rules;
- transaction boundaries;
- idempotency;
- concurrency handling;
- error handling;
- observability;
- rollout and rollback;
- tests.

### 3. Start With the Design Conclusion

Begin with a short conclusion that states the final architecture in plain language.

Example shape:

```text
The final design uses one shared orchestration flow. The common flow owns validation, state creation, and persistence. Optional business capabilities are extensions after the shared object is created.
```

Keep the conclusion specific enough that a reader knows what to implement.

### 4. Preserve Shared Flow Boundaries

When multiple business paths are similar, design the shared path first and then describe extensions.

Preferred structure:

```text
Unified main flow
  -> common validation
  -> common creation
  -> common persistence
  -> branch-specific extension
```

Avoid writing two independent flows when the user has said they should be shared.

State what is common:

- entry point;
- validation;
- idempotency;
- number or identity allocation;
- persistence;
- duplicate checks;
- core state transitions.

State what is different:

- payment;
- notification;
- approval;
- delayed activation;
- compensation;
- external integration.

### 5. Define States and Transitions

For workflow features, include a state model.

Use readable state names:

```text
PENDING
ACTIVE
PROCESSING
DONE
CANCELLED
TIMEOUT
FAILED
```

Document:

- what each state means;
- who can see it;
- which operations are allowed;
- what moves it forward;
- which states are terminal;
- which states count as active for duplicate prevention.

### 6. Make Failure Rules Explicit

Every final design should say what happens when things fail.

Cover:

- business validation failure;
- persistence failure;
- external service failure;
- callback failure;
- timeout;
- duplicate request;
- concurrent update;
- partial success;
- compensation path.

For user-facing products, include recommended user messages. Keep them business-readable, not stack-trace-like.

### 7. State Consistency Guarantees

Name the consistency level directly.

Examples:

```text
The system guarantees uniqueness, but not perfect continuity.
The system guarantees paid users have an existing record before payment starts.
The callback is idempotent: repeated success callbacks return success without creating a second record.
```

When using caches, Redis, queues, or external services, say which store is the final source of truth.

### 8. Include Implementation Anchors Without Over-Specifying

Give enough technical shape for implementation:

- service names or responsibilities;
- data fields;
- indexes or unique constraints;
- key formats;
- transaction boundaries;
- pseudo-code for the main orchestration;
- scheduled task or callback responsibilities.

Keep names generic unless the document is intentionally repo-specific.

### 9. Add Observability, Rollout, and Tests

A retained design document should include:

- key logs;
- metrics;
- alert conditions;
- gray release or feature-flag plan;
- rollback rules;
- required test cases.

Tests should match the design guarantees, not just happy paths.

## Recommended Document Shape

```text
# <Feature> Final Design

## Design Conclusion

## Business Design

### Core Principles
### Unified Main Flow
### Branch-Specific Extensions
### State Model
### User and Operator Views
### Failure Responses
### Edge Case Examples

## Technical Design

### Architecture Flow
### Service Responsibilities
### Data Model
### Constraints and Idempotency
### Main Orchestration Pseudo-Code
### External Callback or Async Handling
### Timeout and Compensation
### Consistency Rules
### Observability
### Rollout and Rollback
### Test Scope
```

## Pseudo-Code Guidance

Show one main orchestration method when the design has a shared flow.

```java
Result handle(Command command, Actor actor) {
    validate(command, actor);
    Decision decision = decideBusinessBranch(command);
    DomainObject object = createCommonObject(command, decision);
    repository.insert(object);

    if (!decision.requiresExtension()) {
        return Result.direct(object);
    }

    ExtensionResult extension = extensionService.start(object);
    object.bindExtension(extension);
    repository.update(object);

    return Result.withExtension(object, extension);
}
```

The pseudo-code should reveal boundaries, state changes, error paths, and idempotency. It does not need to compile.

## Final-Only Cleanup Check

If the user says the document should only describe the final design, scan the document and remove or rewrite these terms unless they are part of the final design itself:

```text
current
currently
existing implementation
old implementation
background
legacy
current SQL
old SQL
source tracing
problem analysis
```

For Chinese documents, also scan:

```text
当前
现有
旧实现
原实现
背景
当前 SQL
问题分析
来源排查
```

## Acceptance Check

Before finishing, verify:

1. The document starts with the final design conclusion.
2. Business design and technical design are both present when the user requested both.
3. The latest user correction is reflected in the main flow, not appended as an afterthought.
4. Shared flows are described once, with branch-specific extensions separated.
5. State transitions and terminal states are explicit.
6. Failure responses include user-visible behavior and system handling.
7. Consistency, uniqueness, idempotency, and concurrency rules are explicit when relevant.
8. Data model, constraints, and service responsibilities are specific enough for implementation.
9. Observability, rollout, rollback, and tests are included for non-trivial designs.
10. If final-only was requested, old/current/background/source-tracing sections are absent.
11. Hidden assumptions, unsafe shortcuts, and boundary risks were challenged before final wording.

## Common Mistakes

- Writing the investigation history instead of the final design.
- Keeping an old flow in the document after the user corrected the business rule.
- Splitting two flows that should share one orchestration path.
- Describing technical fields without explaining user-visible business behavior.
- Describing user behavior without enough technical constraints to implement safely.
- Forgetting failure paths, callbacks, duplicate requests, timeout, or compensation.
- Adding a "current problems" section to a final retention document after the user asked for final-only wording.
- Treating the user's first draft as settled when later corrections changed ownership, source of truth, or module boundaries.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
