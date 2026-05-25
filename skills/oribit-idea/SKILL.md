---
name: oribit-idea
description: Use when a user wants to incubate an idea through the Oribit Idea workflow, internally call gstack office-hours, turn the discussion into artifacts, and import or upload the result to the bound AxisNode project.
---

# Oribit Idea

Use this skill to incubate a simple idea seed through the Oribit Idea workflow and turn it into AxisNode-ready artifacts. User-facing CLI calls such as `axis-ide "AI宠物健康顾问"` fetch the cloud template/context, create the artifact, submit it to Hub, and keep a local cache automatically; `prepare` and `import` are the internal Agent protocol. This skill depends on gstack's `office-hours` capability/skill when a deeper office-hours discussion is needed.

For an Agent-produced idea-pool artifact, hand it back through:

```bash
axis-ide import --stdin
```

`prepare` includes the cloud template, safe project context, and recent documents/WorkItems. Build the artifact from user seed + `template.markdownTemplate` + `projectContext`.

`import` tries the bound AxisNode pool through `/pool-documents` first and falls back locally when Hub upload is unavailable. Use `--local` only for local-only debug output, `--no-doc` to skip the local hub-cache after a successful upload, and `--save` as a deprecated alias for `--local`.

For user-facing idea-pool management, prefer:

```bash
axis-ide --list
axis-ide --delete
```

`--list` paginates interactively and offers delete/quit actions. `--delete` without an id lets the user choose an item, then requires typing `yes`; `--yes` is only for scripts/CI and `--json` machine mode.

## Required Binding

1. Read `.axis/project.json (or legacy .orbit/project.json)` from the target repo.
2. Confirm it includes `backendUrl`, `token`, `productLineUuid`, and `projectUuid`.
3. Prefer `productLineUuid` and `projectUuid` for AxisNode association. Preserve legacy `productLineId` and `projectId` in metadata when present.
4. If `token` is missing, ask the user to run `axis init --login` to refresh the session cache, then `axis bind` if the repo still lacks a project binding.

## Discussion Flow

1. Invoke gstack's `office-hours` capability/skill from the repo or product workspace. If using the CLI directly, run `gstack office-hours`.
2. Use it to discuss the idea, constraints, risks, affected users, and success criteria.
3. Save the resulting notes as office-hours docs under an `office-hours/` or `docs/office-hours/` folder in the repo.
4. Produce these docs:
   - `summary.md`: the idea, context, participants, date, and key decisions.
   - `requirements.md`: concrete requirements and acceptance criteria.
   - `risks.md`: open questions, assumptions, dependencies, and rollout risks.
   - `orbit-import.json`: structured import payload for AxisNode.

## Import Payload

Build `orbit-import.json` with this shape:

```json
{
  "kind": "office-hours",
  "productLineUuid": "<productLineUuid from .axis/project.json (or legacy .orbit/project.json)>",
  "projectUuid": "<projectUuid from .axis/project.json (or legacy .orbit/project.json)>",
  "source": {
    "tool": "gstack office-hours",
    "repo": "<repo path>",
    "date": "<ISO date>",
    "docs": ["summary.md", "requirements.md", "risks.md"]
  },
  "summary": "<short discussion summary>",
  "items": [
    {
      "type": "requirement",
      "title": "<work item title>",
      "description": "<problem, proposed behavior, and context>",
      "acceptanceCriteria": ["<observable criterion>"],
      "source": "office-hours"
    }
  ]
}
```

Use item types `requirement`, `BUG`, and `improvement`. Put speculative follow-ups into `improvement` unless the user explicitly scopes them as current requirements.

## AxisNode Import

Use the bound backend and token from `.axis/project.json (or legacy .orbit/project.json)`.

1. First try the existing office-hours artifact import API:

```bash
curl -sS -X POST "$backendUrl/api/office-hours/import" \
  -H "authorization: Bearer $token" \
  -H "content-type: application/json" \
  --data-binary @orbit-import.json
```

2. If the server responds with 404 or the import API is unavailable, try the artifact upload route:

```bash
curl -sS -X POST "$backendUrl/api/projects/$projectUuid/office-hours/artifacts" \
  -H "authorization: Bearer $token" \
  -H "content-type: application/json" \
  --data-binary @orbit-import.json
```

3. If both routes are unavailable, keep the docs in the repo and tell the user exactly where they are. Include the backend URL, project UUID, and the failed HTTP status so a human can import them later.

## Fallback Docs

When import/upload is unavailable, the work is still useful if these files exist:

- `summary.md` with decisions and discussion context.
- `requirements.md` with split work items and acceptance criteria.
- `risks.md` with unresolved questions and dependencies.
- `orbit-import.json` with the structured payload ready for later upload.

Do not mark AxisNode work items complete from this skill. This skill only creates and imports office-hours artifacts.
