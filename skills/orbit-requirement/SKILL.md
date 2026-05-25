---
name: axis-requirement
description: Use when converting a product/project idea or user request into a structured AxisNode requirement/spec document and linked requirement WorkItems.
---

# AxisNode Requirement

Use this skill to turn a simple user seed into an AxisNode project requirement document and optional requirement-pool WorkItems. User-facing CLI calls such as `axis-req "商品评价支持图片"` fetch the cloud template/context, create the artifact, submit it to Hub, and keep a local cache automatically; `prepare` and `import` are the internal Agent protocol.

## Trigger Conditions

- The user asks for a requirement, PRD, spec, feature brief, acceptance criteria, or scoped WorkItems.
- A discussion has enough product intent to preserve as a project document.
- The repo has `.axis/project.json (or legacy .orbit/project.json)`, or the user wants a requirement saved for later AxisNode import.

## Discovery Rules

Ask only 2-4 high-leverage questions unless the prompt already gives enough context. Prefer questions about user, outcome, scope boundary, and acceptance signal.

Do not over-interrupt. If the user says "你来做", "直接做", "you decide", or similar, proceed with explicit assumptions and label them in the document.

## Markdown Template

Create one Markdown document with these sections:

```markdown
# <Requirement Title>

## 背景

## 目标

## 用户故事

## 范围(In/Out)

## 交互流程

## 数据模型影响

## API/后端影响

## 验收标准

## Open Questions

## WorkItems
```

Keep the spec concrete: observable behavior, boundaries, risks, and acceptance criteria. Mark guesses as `Assumption:` instead of presenting them as facts.

## WorkItems Shape

When deriving WorkItems, use this shape:

```json
{
  "title": "<short action-oriented title>",
  "type": "requirement",
  "pool": "requirement",
  "notes": "<context, source requirement, assumptions>",
  "energy": "<S|M|L or 1-5 if the project uses numeric sizing>",
  "acceptanceCriteria": ["<observable criterion>"]
}
```

Keep WorkItems small enough to implement independently. Do not mark them claimed, started, or done.

## AxisNode Import Flow

When this skill is running inside an Agent, prefer handing the artifact to the CLI:

```bash
axis-req import --stdin
```

`prepare` includes the cloud template, safe project context, and recent documents/WorkItems. Build the artifact from user seed + `template.markdownTemplate` + `projectContext`.

`import` tries `POST /api/projects/{projectId}/pool-documents` first and falls back to legacy `/requirements` when needed. Use `--local` only for local-only debug output, `--no-doc` to skip the local hub-cache after a successful upload, and `--save` as a deprecated alias for `--local`.

For user-facing pool management, prefer the interactive commands:

```bash
axis-req --list
axis-req --delete
```

`--list` paginates interactively and offers delete/quit actions. `--delete` without an id lets the user choose an item, then requires typing `yes`; `--yes` is only for scripts/CI and `--json` machine mode.

1. Read `.axis/project.json (or legacy .orbit/project.json)` from the target repo when available.
2. Use `projectUuid`/`projectId` and `productLineUuid`/`productLineId` from that binding. Prefer UUID fields.
3. Use `backendUrl` from `.axis/project.json (or legacy .orbit/project.json)`; if missing, check `~/.orbit/config.json`.
4. Read the cached login token from `~/.orbit/config.json` for that `backendUrl` when possible. Prefer `sessions[backendUrl].token`, then top-level `token`.
5. Build an import payload:

```json
{
  "title": "<requirement title>",
  "summary": "<one paragraph summary>",
  "markdown": "<full requirement markdown>",
  "status": "draft",
  "workItems": []
}
```

6. POST to the AxisNode requirement endpoint if available:

```bash
curl -sS -X POST "$backendUrl/api/projects/$projectUuid/requirements" \
  -H "authorization: Bearer $token" \
  -H "content-type: application/json" \
  --data-binary @axis-requirement-import.json
```

If that route returns 404 or is unavailable, try the current documented requirement import route if AxisNode exposes one. Preserve the failed status and route in the handoff.

## Fallback Save

If API import is unavailable, save the Markdown under:

```text
docs/requirements/<slug>.md
```

Also save `docs/requirements/<slug>.orbit-import.json` when WorkItems were derived. Tell the user the exact file paths, backend URL, project UUID/id, and that manual AxisNode import is needed.

## Guardrails

- Do not invent irreversible architecture decisions; list them as options or questions.
- Do not mark WorkItems done, claimed, or started from this skill.
- Do not silently create broad scope. Put excluded work in `范围(In/Out)`.
- Do not overwrite existing requirement docs without asking or creating a new dated/slugged file.
- Keep implementation tasks separate from requirement discovery unless the user explicitly asks to build next.
