---
name: orbit-workflow
description: Use when routing OfficeHours discussions, requirements, bugs, and improvements through Orbit DB project pools via the configured Orbit MCP.
---

# Orbit Workflow

Use this skill when the repo has an Orbit project binding in `.orbit/project.json` or when Hermes has the `orbit` MCP server configured.

## Required Context

1. Run `orbit-tools project show --json` from the target repo.
2. Confirm the binding has `backendUrl`, `mcpUrl`, `productLineId`, `projectId`, and `owner`.
3. Use the configured Orbit MCP server for Orbit DB mutations. Do not edit Orbit DB files directly.

## OfficeHours Intake

When an OfficeHours discussion produces actionable work:

1. Submit the discussion summary to Orbit DB under the bound `productLineId` and `projectId`.
2. Preserve the original discussion link, participants, owner, and date when available.
3. Split the discussion into requirement items. Each item should have a title, description, source discussion, acceptance criteria, and type.
4. Use these item types: `requirement`, `BUG`, `improvement`.
5. Put items into the matching project pool instead of assigning work immediately unless a human explicitly asks for a claim.

## Work Claim Flow

For implementation work:

1. Pick from the requirement, BUG, or improvement pool for the bound project.
2. Claim the item in Orbit DB before starting development.
3. Mark the item `started` with the branch or worktree path.
4. Implement in the repo that owns the binding.
5. Push the development branch when requested by the user or by the team workflow.
6. Mark the item `complete` only after verification has run and the branch or commit is available.
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
orbit-tools mcp install --backend-url <url> --mcp-url <url>/api/mcp
```

Bind the current repo to a product-line project:

```bash
orbit-tools project bind --product-line-id <id> --project-id <id> --owner <owner>
```

Show the active binding:

```bash
orbit-tools project show --json
```
