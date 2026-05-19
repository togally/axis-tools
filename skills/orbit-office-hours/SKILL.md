---
name: orbit-office-hours
description: Use when a user wants to discuss an idea through gstack office-hours, turn the discussion into artifacts, and import or upload the result to the bound Orbit Hub project.
---

# Orbit Office Hours

Use this skill to turn an early idea into Orbit-ready office-hours artifacts.

## Required Binding

1. Read `.orbit/project.json` from the target repo.
2. Confirm it includes `backendUrl`, `token`, `productLineUuid`, and `projectUuid`.
3. Prefer `productLineUuid` and `projectUuid` for Orbit Hub association. Preserve legacy `productLineId` and `projectId` in metadata when present.
4. If `token` is missing, ask the user to run `orbit-tools init --login` or `orbit-tools init-product-line --login` before importing.

## Discussion Flow

1. Run `gstack office-hours` from the repo or product workspace.
2. Use it to discuss the idea, constraints, risks, affected users, and success criteria.
3. Save the resulting notes as office-hours docs under an `office-hours/` or `docs/office-hours/` folder in the repo.
4. Produce these docs:
   - `summary.md`: the idea, context, participants, date, and key decisions.
   - `requirements.md`: concrete requirements and acceptance criteria.
   - `risks.md`: open questions, assumptions, dependencies, and rollout risks.
   - `orbit-import.json`: structured import payload for Orbit Hub.

## Import Payload

Build `orbit-import.json` with this shape:

```json
{
  "kind": "office-hours",
  "productLineUuid": "<productLineUuid from .orbit/project.json>",
  "projectUuid": "<projectUuid from .orbit/project.json>",
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

## Orbit Hub Import

Use the bound backend and token from `.orbit/project.json`.

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

Do not mark Orbit work items complete from this skill. This skill only creates and imports office-hours artifacts.
