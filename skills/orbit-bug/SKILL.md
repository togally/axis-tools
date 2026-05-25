---
name: axis-bug
description: Use when turning a bug report, regression, error log, or failed workflow into an AxisNode bug-pool artifact.
---

# AxisNode Bug

Use this skill to convert a simple bug seed, user report, or debugging context into an AxisNode bug artifact. User-facing CLI calls such as `axis-bug "登录失败"` fetch the cloud template/context, create the artifact, submit it to Hub, and keep a local cache automatically; `prepare` and `import` are the internal Agent protocol.

## Flow

1. Run `axis-bug prepare --json` in the target repo to read the cloud template, safe project binding context, and recent documents/WorkItems.
2. Understand the bug: expected behavior, actual behavior, reproduction steps, environment, logs, severity, and suspected scope.
3. Produce an `orbit.pool.artifact.v1` JSON artifact with `kind: "bug"`.
4. Import through the CLI:

```bash
axis-bug import --stdin
```

Build the artifact from user seed + `template.markdownTemplate` + `projectContext`.

`import` tries to submit to the bound AxisNode pool through `/pool-documents` first. Use `--local` only for local-only debug output, `--no-doc` to skip the local hub-cache after a successful upload, and `--save` as a deprecated alias for `--local`.

For user-facing bug-pool management, prefer:

```bash
axis-bug --list
axis-bug --delete
```

`--list` paginates interactively and offers delete/quit actions. `--delete` without an id lets the user choose an item, then requires typing `yes`; `--yes` is only for scripts/CI and `--json` machine mode.

When this skill is already running inside an Agent, use `--agent current` only for `axis-bug run` handoffs where the Agent has already produced the semantic artifact. Do not ask the CLI to start another Agent from inside this skill.

## Artifact Shape

```json
{
  "schemaVersion": "orbit.pool.artifact.v1",
  "kind": "bug",
  "title": "<short bug title>",
  "summary": "<impact and failing behavior>",
  "status": "draft",
  "markdown": "# <Bug Title>\n\n## Actual\n\n## Expected\n\n## Reproduction\n\n## Impact\n\n## Evidence\n\n## WorkItems\n",
  "sections": [],
  "workItems": []
}
```

Do not include tokens, sessions, passwords, or private keys. Keep guesses marked as assumptions.
