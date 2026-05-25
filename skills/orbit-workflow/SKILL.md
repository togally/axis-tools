---
name: orbit-workflow
description: Use when routing OfficeHours discussions, requirements, bugs, and improvements through AxisNode project pools via the configured AxisNode MCP.
---

# AxisNode Workflow

Use this skill when the repo has an AxisNode project binding in `.axis/project.json (or legacy .orbit/project.json)` or when Hermes has the `orbit` MCP server configured.

## Required Context

1. Run `axis project show --json` from the target repo.
2. Confirm the binding has `backendUrl`, `productLineUuid`, `projectUuid`, and `owner`. Treat `mcpUrl` as optional and preserve it when it already exists.
3. If legacy `productLineId` or `projectId` fields are present, preserve them for compatibility but prefer UUID fields for new AxisNode association.
4. Use the configured AxisNode MCP server for AxisNode mutations. Do not edit AxisNode files directly.
5. If authentication is missing or expired, run `axis init --login` to refresh the cached session in `~/.orbit/config.json`.

## OfficeHours Intake

When an OfficeHours discussion produces actionable work:

1. If the user wants a fresh idea discussion, use the `oribit-idea` skill first. It internally calls gstack's `office-hours` capability/skill, produces office-hours docs, and imports/uploads them to AxisNode using the project binding.
2. Submit the discussion summary to AxisNode under the bound `productLineUuid` and `projectUuid`.
3. Preserve the original discussion link, participants, owner, and date when available.
4. Split the discussion into requirement items. Each item should have a title, description, source discussion, acceptance criteria, and type.
5. Use these item types: `requirement`, `BUG`, `improvement`.
6. Put items into the matching project pool instead of assigning work immediately unless a human explicitly asks for a claim.

## Work Claim Flow

For implementation work:

1. Pick from the requirement, BUG, or improvement pool for the bound project.
2. Claim the item in AxisNode before starting development by calling `orbit_work_item_lifecycle` with `action: "claim"`.
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

Install AxisNode MCP into Hermes:

```bash
axis mcp install --backend-url http://117.72.14.134:18081 --mcp-url http://117.72.14.134:18081/api/mcp
```

Initialize local AxisNode CLI state and packaged skills:

```bash
axis init
```

The command logs in to the shared AxisNode backend by default, refreshes the session cache, and installs packaged AxisNode skills for the selected agent. Login sessions are cached by `backendUrl` in `~/.orbit/config.json`; pass `--login` or `--force-login` to prompt for account/password again. For local development only, override the backend with `--backend-url http://127.0.0.1:18081` or `ORBIT_BACKEND_URL`.

Bind the current repo to a product-line project:

```bash
axis bind
```

`bind` writes `.axis/project.json (or legacy .orbit/project.json)` for a repo binding or `.axis/product-line.json (or legacy .orbit/product-line.json)` plus child project bindings for a product-line root. Use `--repo <repo-path>` for a single repo or `--root <root-path>` for a product-line root. It uses the cached session from `axis init`; pass `--login` first if the session is missing or expired.

Create local folders from AxisNode and clone maintained repos:

```bash
axis pull
```

`pull` creates product-line and project folders from cloud state, writes the corresponding `.axis/product-line.json (or legacy .orbit/product-line.json)` and `.axis/project.json (or legacy .orbit/project.json)` files, and clones maintained repositories when repo URLs are available.

Clear cached login/session data:

```bash
axis logout
axis logout --backend-url http://117.72.14.134:18081
```

For automation, pass `--product-line-uuid <uuid> --project-uuid <uuid>` directly to `axis bind` instead of using interactive selection.

Compatibility alias:

```bash
axis init-product-line
```

`init-product-line` remains available for older scripts, but new workflows should use `axis bind --root <root-path>` for product-line binding.

Advanced/local development overrides:

```bash
axis init --repo <repo-path> --backend-url http://127.0.0.1:18081
axis bind --root <root-path> --backend-url http://127.0.0.1:18081 --owner <owner>
```

Show the active binding:

```bash
axis project show --json
```

## MCP WorkItem Lifecycle

`axis-tools` does not implement lifecycle CLI commands. Use the configured AxisNode MCP server tools:

- List pools: `orbit_work_items_list` with `{ "projectId": "<projectUuid>", "pool": "requirement" }`, `{ "projectId": "<projectUuid>", "pool": "bug" }`, or `{ "projectId": "<projectUuid>", "pool": "improvement" }`.
- Claim / 认领: `orbit_work_item_lifecycle` with `{ "workItemId": "<workItemId>", "action": "claim", "owner": "<owner>" }`.
- Develop / 开发: `orbit_work_item_lifecycle` with `{ "workItemId": "<workItemId>", "action": "start", "owner": "<owner>" }`.
- Fix / 修复: use the same `claim` then `start` flow for a BUG-pool item and preserve repro/fix evidence in the writeback note when available.
- Complete / 完成: `orbit_work_item_lifecycle` with `{ "workItemId": "<workItemId>", "action": "complete", "owner": "<owner>" }`.
- Push/writeback / 回写: push the requested branch or commit, then record commit hash, verification command, and result through the AxisNode MCP/API writeback capability currently exposed by the server. If no separate writeback tool is listed by MCP discovery, include that evidence in the completion note or handoff message.
