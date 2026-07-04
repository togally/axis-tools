---
name: axis-review-summary
description: Use when a user needs to review a PR, change set, or document set before deep inspection. / 用于审核 PR、变更集或文档前生成待审文件摘要和风险定位。
---

# Axis Review Summary

Use this skill to prepare a compact review brief before a human or agent reads a PR, change set, document set, or release artifact in detail. The review brief is an index and risk map, not an approval decision.

Keep the reusable skill public-safe. Do not bake private repository names, customer facts, hosts, credentials, or issue URLs into the skill. In task output, preserve original file paths but redact credential-like values, private tokens, and unnecessary private content.

## When to Use

- The user says they need to review, audit, approve, inspect, or summarize a PR, diff, change set, document, protocol, design, or release note.
- The user wants to read a summary first, then jump to original files for close review.
- The request asks for `待审文件清单`, `文件摘要`, `风险点`, `细查位置`, `原始路径`, review checklist, or PR review preparation.
- The review target is mostly documentation, configuration, scripts, schemas, tests, or source changes that can be summarized from local files, git diff, or PR metadata.

Do not use this as a replacement for full code review, security approval, legal review, or production change approval. It only creates the review map and highlights where to inspect next.

## Core Principle

Create an evidence-backed Review Brief that lets the reviewer scan every relevant file, understand why it matters, see likely risks, and open the exact original path for deeper inspection.

## Workflow

1. Confirm the review target.
   Identify whether the target is a PR number or URL, branch diff, commit range, working-tree change, document directory, or pasted file list. If the target is obvious from context, proceed and state the source used.
2. Collect the changed or requested file list.
   Prefer structured evidence: `gh pr diff --name-only`, `git diff --name-only`, `git show --name-only --stat`, local manifests, or explicit user-provided paths. Include deleted, renamed, generated, and test files when they affect review scope.
3. Read only what is needed to summarize and risk-rank.
   Use file contents, diffs, headings, schema keys, tests, and surrounding context. Avoid copying long passages; summarize behavior and decisions.
4. Produce the Review Brief in the required shape.
   For each file, include original path, concise summary, risks, suggested close-read locations, and whether the file is source, test, doc, config, generated, or unknown.
5. Run a public-safety pass.
   Do not output secrets, tokens, passwords, private keys, bearer strings, cookie values, or unnecessary private URLs. Redact credential-like values as `[REDACTED]` and note that redaction happened. If the requested review itself contains sensitive material, report the limitation and point to the file path instead of reproducing the value.

## Review Brief Output

Use this structure by default. Keep it concise enough for a reviewer to scan, but do not drop files from scope.

```markdown
## Review Brief

Scope: <PR/commit range/branch/directory/source>
Review target status: <open/merged/local/unknown if known>
Public-safety: <no credential-like content included | redactions applied | not fully checked>

### 待审文件清单
| # | 原始路径 | 类型 | 变更性质 | 建议优先级 |
| --- | --- | --- | --- | --- |
| 1 | path/to/file | doc/config/source/test | added/modified/deleted/renamed | high/medium/low |

### 文件审阅摘要
#### 1. `path/to/file`
- 每个文件摘要: <what changed and why it matters>
- 风险点: <correctness/security/compatibility/operations/product/docs risk, or "未发现明显风险">
- 建议细查位置: <headings, functions, schema keys, line ranges if available, or diff hunks>
- 原始路径: `path/to/file`

### 横向风险
- <risk that spans multiple files, duplicated assumptions, missing tests, stale docs, unclear rollback, etc.>

### 建议审阅顺序
1. <highest-value file/path first, with reason>
```

If a file is binary or too large to inspect directly, say so in its summary and recommend the closest verifiable evidence, such as metadata, generated checksum, preview, or owning source file.

## Risk Heuristics

Call out risks when you see:

- protocol, schema, manifest, CLI, workflow, or public API changes;
- security, credential handling, public-safety, privacy, permission, or publication behavior;
- operational concerns such as rollback, observability, failure state, retry/resume, compatibility, or release ordering;
- generated outputs without source verification, examples that may not parse, or documentation that claims behavior not covered by tests;
- large files, deleted files, renamed ownership boundaries, stale code maps, or changed default behavior;
- missing tests, validators, fixtures, or checks for the changed surface.

Avoid overstating risk. If evidence is weak, mark the item as "needs close-read" rather than inventing a defect.

## Suggested Close-Read Locations

Use the most precise anchors available:

- Markdown: section heading names.
- Code: function, class, exported symbol, route, command, or config key.
- Schema/YAML/JSON: top-level key path, array item, or example block.
- Diff: hunk context or line range when the tool provides it.
- Binary/generated: source path, generator command, checksum, or preview artifact.

## Verification Checklist

Before reporting the brief, verify:

1. Every changed or requested file is listed, including deletions and renames when visible.
2. Every file entry has `每个文件摘要`, `风险点`, `建议细查位置`, and `原始路径`.
3. The summary distinguishes evidence from inference.
4. Public-safety redaction was applied to credential-like values and no secret values are pasted.
5. The recommended review order matches risk and reviewer value, not just file order.

Useful commands:

```bash
git diff --name-status <base>...<head>
git diff --stat <base>...<head>
gh pr diff <number> --name-only
gh pr diff <number>
rg -n "token|secret|password|api[_-]?key|private key|bearer" <review-paths>
```

## Common Mistakes

- Summarizing only the largest file and omitting small metadata, schema, or test changes.
- Pasting long file contents instead of creating a review map.
- Treating a Review Brief as an approval decision.
- Hiding uncertainty instead of marking `unknown`, `not inspected`, or `needs close-read`.
- Copying credential-like values into the report when a redacted pointer to the original path is enough.

## Three-Step Work Contract

For coding and design work, run the workflow in three steps:

1. Co-create with the user: clarify what they want, preserve their exact business wording, identify acceptance criteria, and gather the code, schema, logs, docs, redacted configuration context, endpoints, or environment details needed to execute the next step.
2. Execute the result: implement the code change, write the design, or produce the requested artifact using the agreed scope and the repository's existing patterns.
3. Verify the result: run focused tests, validators, benchmarks, document checks, or review passes that prove the result matches the request, then report what passed and what remains unverified.

Keep light adversarial review to no more than 30% of the interaction. Calibrate it to the risk: challenge missing evidence, unsafe shortcuts, or unclear ownership, but do not let critique replace execution once the next step is sufficiently specified.

## Light Adversarial Review

For coding, architecture, optimization, testing, database, or design-document workflows, use a lightly adversarial stance: verify the user's goal against code or evidence, surface hidden assumptions, name correctness and risk trade-offs, and challenge unsafe shortcuts before implementing or finalizing. Keep it constructive and below 30% of the interaction: preserve the user's explicit business wording, avoid debate for its own sake, and become decisive once evidence is sufficient.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
