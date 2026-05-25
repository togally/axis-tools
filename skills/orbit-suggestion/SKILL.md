---
name: axis-suggestion
description: Use when turning an optimization, improvement request, or product suggestion into an AxisNode suggestion-pool artifact.
---

# AxisNode Suggestion

Use this skill to convert a simple improvement seed into an AxisNode suggestion artifact. User-facing CLI calls such as `axis-sug "优化按钮文案"` fetch the cloud template/context, create the artifact, submit it to Hub, and keep a local cache automatically; `prepare` and `import` are the internal Agent protocol.

## Flow

1. Run `axis-sug prepare --json` in the target repo to read the cloud template, safe project binding context, and recent documents/WorkItems.
2. Clarify the current pain, proposed improvement, expected benefit, affected users, risks, and measurement signal.
3. Produce an `orbit.pool.artifact.v1` JSON artifact with `kind: "suggestion"`.
4. Import through the CLI:

```bash
axis-sug import --stdin
```

Build the artifact from user seed + `template.markdownTemplate` + `projectContext`.

`import` tries to submit to the bound AxisNode pool through `/pool-documents` first. Use `--local` only for local-only debug output, `--no-doc` to skip the local hub-cache after a successful upload, and `--save` as a deprecated alias for `--local`.

For user-facing suggestion-pool management, prefer:

```bash
axis-sug --list
axis-sug --delete
```

`--list` paginates interactively and offers delete/quit actions. `--delete` without an id lets the user choose an item, then requires typing `yes`; `--yes` is only for scripts/CI and `--json` machine mode.

When this skill is already running inside an Agent, use `--agent current` only for `axis-sug run` handoffs where the Agent has already produced the semantic artifact. Do not ask the CLI to start another Agent from inside this skill.

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
