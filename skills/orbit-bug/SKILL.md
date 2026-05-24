---
name: orbit-bug
description: Use when turning a bug report, regression, error log, or failed workflow into an Orbit bug-pool artifact.
---

# Orbit Bug

Use this skill to convert a user report or debugging context into an Orbit bug artifact. User-facing CLI calls such as `orbit-bug "登录失败"` create and submit/fallback automatically; `prepare` and `import` are the internal Agent protocol.

## Flow

1. Run `orbit-bug prepare --json` in the target repo to read safe project binding context.
2. Understand the bug: expected behavior, actual behavior, reproduction steps, environment, logs, severity, and suspected scope.
3. Produce an `orbit.pool.artifact.v1` JSON artifact with `kind: "bug"`.
4. Import through the CLI:

```bash
orbit-bug import --stdin
```

`import` tries to submit to the bound Orbit pool first. Use `--local` only for fallback/debug local files; `--save` remains a deprecated alias for `--local`.

When this skill is already running inside an Agent, use `--agent current` only for `orbit-bug run` handoffs where the Agent has already produced the semantic artifact. Do not ask the CLI to start another Agent from inside this skill.

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
