---
name: orbit-workflow
description: Use when routing OfficeHours discussions, requirements, bugs, and improvements through Orbit DB project pools via the configured Orbit MCP.
---

# Orbit Workflow

Use this skill when the repo has an Orbit project binding in `.orbit/project.json` or when Hermes has the `orbit` MCP server configured.

## Required Context

1. Run `orbit-tools project show --json` from the target repo.
2. Confirm the binding has `backendUrl`, `mcpUrl`, `productLineUuid`, `projectUuid`, and `owner`.
3. If legacy `productLineId` or `projectId` fields are present, preserve them for compatibility but prefer UUID fields for new Orbit association.
4. Use the configured Orbit MCP server for Orbit DB mutations. Do not edit Orbit DB files directly.

## OfficeHours Intake

When an OfficeHours discussion produces actionable work:

1. Submit the discussion summary to Orbit DB under the bound `productLineUuid` and `projectUuid`.
2. Preserve the original discussion link, participants, owner, and date when available.
3. Split the discussion into requirement items. Each item should have a title, description, source discussion, acceptance criteria, and type.
4. Use these item types: `requirement`, `BUG`, `improvement`.
5. Put items into the matching project pool instead of assigning work immediately unless a human explicitly asks for a claim.

## Work Claim Flow

For implementation work:

1. Pick from the requirement, BUG, or improvement pool for the bound project.
2. Claim the item in Orbit DB before starting development by calling `orbit_work_item_lifecycle` with `action: "claim"`.
3. Mark the item as started by calling `orbit_work_item_lifecycle` with `action: "start"` and keep the branch or worktree path in the work note/writeback record when that API is available.
4. Implement in the repo that owns the binding.
5. Push the development branch when requested by the user or by the team workflow.
6. Mark the item complete with `orbit_work_item_lifecycle` and `action: "complete"` only after verification has run and the branch or commit is available.
7. Include the commit hash, verification command, and result in the completion note.

## Status Rules

- `submitted`: discussion or item is recorded but not ready for development.
- `ready`: item is split, scoped, and in the project pool.
- `claimed`: someone owns the item.
- `started`: development has begun.
- `blocked`: development cannot proceed without external input.
- `complete`: implementation is verified and pushed or otherwise available.

## Local Commands

Install Orbit MCP into Hermes:

```bash
orbit-tools mcp install --backend-url http://117.72.14.134:18081 --mcp-url http://117.72.14.134:18081/api/mcp
```

Bind the current repo to a product-line project:

```bash
orbit-tools project bind --interactive --backend-url http://117.72.14.134:18081 --owner <owner>
```

Current temporary no-login mode lists all product lines and projects available from the shared Orbit Hub backend. Future login/account scoping should filter that list automatically without changing the product-line-first, project-second CLI flow. For local development only, override the backend with `--backend-url http://127.0.0.1:18081` or `ORBIT_BACKEND_URL`.

For automation, pass `--product-line-uuid <uuid> --project-uuid <uuid>` directly instead of `--interactive`.

Initialize a product-line root that contains several child project folders:

```bash
orbit-tools init-product-line --backend-url http://117.72.14.134:18081 --owner <owner>
```

Run this from the product-line root, or pass `--repo <root-path>`. The command logs in with the same Orbit Hub account/password mock flow as `orbit-tools init`, writes `<root>/.orbit/product-line.json`, scans immediate child directories, and prompts for each child in sequence. Choose one project from the selected product line to bind that folder, or choose `Skip` explicitly and continue. Hidden directories, `.git`, `node_modules`, `dist`, `build`, and `cache` are ignored; unrecognized folders are still offered as `plain folder`.

`init-product-line` writes `<child>/.orbit/project.json` only for folders you bind. It does not ask for an agent or install the workflow skill per folder unless `--agent codex`, `--agent claude-code`, or `--agent none` is supplied; when supplied, it copies the skill the same way as `orbit-tools init` and records the selected agent paths in both root and child configs.

Show the active binding:

```bash
orbit-tools project show --json
```

## MCP WorkItem Lifecycle

`orbit-tools` does not implement lifecycle CLI commands. Use the configured Orbit MCP server tools:

- List pools: `orbit_work_items_list` with `{ "projectId": "<projectUuid>", "pool": "requirement" }`, `{ "projectId": "<projectUuid>", "pool": "bug" }`, or `{ "projectId": "<projectUuid>", "pool": "improvement" }`.
- Claim / 认领: `orbit_work_item_lifecycle` with `{ "workItemId": "<workItemId>", "action": "claim", "owner": "<owner>" }`.
- Develop / 开发: `orbit_work_item_lifecycle` with `{ "workItemId": "<workItemId>", "action": "start", "owner": "<owner>" }`.
- Fix / 修复: use the same `claim` then `start` flow for a BUG-pool item and preserve repro/fix evidence in the writeback note when available.
- Complete / 完成: `orbit_work_item_lifecycle` with `{ "workItemId": "<workItemId>", "action": "complete", "owner": "<owner>" }`.
- Push/writeback / 回写: push the requested branch or commit, then record commit hash, verification command, and result through the Orbit Hub MCP/API writeback capability currently exposed by the server. If no separate writeback tool is listed by MCP discovery, include that evidence in the completion note or handoff message.
