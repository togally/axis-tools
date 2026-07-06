---
name: axis-yunxiao-codeup
description: Use when accessing Yunxiao Codeup repositories or merge requests through OpenAPI with an environment token. / 用于通过云效 Codeup OpenAPI 查询代码库、创建合并请求或接入 Git 评审操作。
---

# Yunxiao Codeup OpenAPI

Use this skill to work with Yunxiao Codeup repositories and merge requests through the official OpenAPI when normal git commands or GitHub-specific tooling cannot create or inspect review objects.

## Safety Rules

- Never print, echo, log, commit, or comment with the API token value.
- Read tokens from environment variables. Use `CODE_UP_API_TOKEN` by default, or pass `--token-env NAME` to select another variable name.
- Do not pass raw tokens as command-line arguments because shells, process lists, and CI logs can expose them.
- Run `--dry-run` before creating a merge request when organization ID, repository ID, source branch, target branch, or API mode is uncertain.
- Keep tenant IDs, repository IDs, branch names, and merge-request URLs task-local. Do not hard-code customer or project identifiers into this public skill.

## Workflow

1. Confirm the token variable exists by listing environment variable names only.
2. Determine whether the Yunxiao deployment uses the center-version organization-scoped API or a region-version instance domain.
3. Search or fetch the repository and prefer a numeric repository ID for merge-request creation.
4. Create the merge request with source branch, target branch, title, and optional description.
5. Report the returned review URL, status, and merge-readiness fields. Do not report token values or private request headers.

## Script

Use the bundled helper for deterministic OpenAPI calls:

```bash
python3 scripts/yunxiao_codeup.py repos --organization-id <org-id> --search <repo-name>
python3 scripts/yunxiao_codeup.py repo --organization-id <org-id> --repo <repo-id-or-path>
python3 scripts/yunxiao_codeup.py create-mr --organization-id <org-id> --repo <repo-id> --source <branch> --target <branch> --title "..."
```

Use dry-run mode to inspect a request shape without reading the token or sending the request:

```bash
python3 scripts/yunxiao_codeup.py create-mr --dry-run --organization-id <org-id> --repo <repo-id> --source feature/x --target main --title "Example"
```

## References

Read `references/yunxiao-openapi.md` when you need the official endpoint shapes, required body fields, and token header name.

## Three-Step Work Contract

For coding and design work, run the workflow in three steps:

1. Co-create with the user: clarify what they want, preserve their exact business wording, identify acceptance criteria, and gather the code, schema, logs, docs, credentials, endpoints, or environment details needed to execute the next step.
2. Execute the result: implement the code change, write the design, or produce the requested artifact using the agreed scope and the repository's existing patterns.
3. Verify the result: run focused tests, validators, benchmarks, document checks, or review passes that prove the result matches the request, then report what passed and what remains unverified.

Keep light adversarial review to no more than 30% of the interaction. Calibrate it to the risk: challenge missing evidence, unsafe shortcuts, or unclear ownership, but do not let critique replace execution once the next step is sufficiently specified.

## Light Adversarial Review

For coding, architecture, optimization, testing, database, or design-document workflows, use a lightly adversarial stance: verify the user's goal against code or evidence, surface hidden assumptions, name correctness and risk trade-offs, and challenge unsafe shortcuts before implementing or finalizing. Keep it constructive and below 30% of the interaction: preserve the user's explicit business wording, avoid debate for its own sake, and become decisive once evidence is sufficient.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
