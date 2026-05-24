---
name: orbit-suggestion
description: Use when turning an optimization, improvement request, or product suggestion into an Orbit suggestion-pool artifact.
---

# Orbit Suggestion

Use this skill to convert improvement ideas into Orbit suggestion artifacts. User-facing CLI calls such as `orbit-sug "优化按钮文案"` create and submit/fallback automatically; `prepare` and `import` are the internal Agent protocol.

## Flow

1. Run `orbit-sug prepare --json` in the target repo to read safe project binding context.
2. Clarify the current pain, proposed improvement, expected benefit, affected users, risks, and measurement signal.
3. Produce an `orbit.pool.artifact.v1` JSON artifact with `kind: "suggestion"`.
4. Import through the CLI:

```bash
orbit-sug import --stdin
```

`import` tries to submit to the bound Orbit pool first. Use `--local` only for fallback/debug local files; `--save` remains a deprecated alias for `--local`.

When this skill is already running inside an Agent, use `--agent current` only for `orbit-sug run` handoffs where the Agent has already produced the semantic artifact. Do not ask the CLI to start another Agent from inside this skill.

## Artifact Shape

```json
{
  "schemaVersion": "orbit.pool.artifact.v1",
  "kind": "suggestion",
  "title": "<short improvement title>",
  "summary": "<problem and expected value>",
  "status": "draft",
  "markdown": "# <Suggestion Title>\n\n## Current State\n\n## Proposal\n\n## Expected Value\n\n## Scope\n\n## Risks\n\n## WorkItems\n",
  "sections": [],
  "workItems": []
}
```

Do not include tokens, sessions, passwords, or private keys. Keep speculative claims marked as assumptions.
