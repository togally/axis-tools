---
name: axis-integration-yunxiao-codeup
description: Use when Yunxiao Codeup repositories must be queried or a merge request must be created through OpenAPI with an environment token. / 用于通过环境变量令牌调用云效 Codeup OpenAPI 查询代码库或创建合并请求。
---

# Axis Integration Yunxiao Codeup

Use the bundled helper for the repository lookup and merge-request creation operations it actually supports.

## When to Use

- List/search Codeup repositories or fetch one repository through Yunxiao OpenAPI.
- Create one Codeup merge request when ordinary git commands cannot create the review object.
- Dry-run one of those supported requests to verify its endpoint and body shape.

## Do Not Use

- Do not use to list, inspect, approve, merge, close, or comment on existing merge requests; the bundled helper does not implement those operations.
- Do not use for GitHub/GitLab review objects or normal local git operations.
- Do not send a request to an arbitrary domain or create a merge request when the user requested only repository inspection.

## Inputs

- Operation: `repos`, `repo`, or `create-mr`.
- Center/region API mode, official domain or explicitly allowed self-hosted HTTPS hostname, organization ID, and repository ID/path.
- For creation: source branch, target branch, title, optional description/project IDs, and explicit write intent.
- Name of the token environment variable; `CODE_UP_API_TOKEN` is the default.

## Outputs

- Repository search/detail JSON, or a created merge-request response with URL, status, source, target, and readiness fields.
- A dry-run request shape that contains no token value.
- A precise validation, authorization, host, transport, or API error without private request headers.

## Safety and Boundaries

- Never print, echo, log, commit, comment, or pass the token as a command-line value. Read only the named environment variable and do not enumerate environment variables.
- Require HTTPS. Trust the exact official `openapi-rdc.aliyuncs.com` hostname by default; suffix lookalikes are not trusted.
- A self-hosted hostname is allowed only when it is passed exactly with `--allowed-host`; redirects are blocked so `x-yunxiao-token` is never forwarded across hosts.
- Keep organization/repository IDs, branch names, URLs, reviewers, and other task-specific identifiers out of the public bundle.
- Creating a merge request is an external write. Dry-run first when any repository, branch, title, project ID, API mode, or write intent is uncertain.

## Three-Step Work Contract

1. Co-create the request: confirm read versus write, API mode, trusted host, repository, branch pair, title, and exact success evidence.
2. Execute safely: resolve a numeric repository ID when possible, run dry-run for creation, then issue only the requested supported OpenAPI call.
3. Verify the result: check repository identity or returned MR URL/status/source/target and report any unverified merge-readiness field without exposing secrets.

## Workflow

```bash
python3 skills/axis-integration-yunxiao-codeup/scripts/yunxiao_codeup.py \
  repos --organization-id <org-id> --search <repo-name>

python3 skills/axis-integration-yunxiao-codeup/scripts/yunxiao_codeup.py \
  repo --organization-id <org-id> --repo <repo-id-or-path>

python3 skills/axis-integration-yunxiao-codeup/scripts/yunxiao_codeup.py \
  create-mr --dry-run --organization-id <org-id> --repo <repo-id> \
  --source <branch> --target <branch> --title "<title>"
```

After a correct dry-run, omit `--dry-run` only when creation is authorized. For a controlled self-hosted instance, add `--domain https://<host> --allowed-host <host>`. Read [yunxiao-openapi.md](references/yunxiao-openapi.md) for the supported endpoint/body contract.

## Checks

- The named token variable exists without printing its value or enumerating the environment.
- HTTP, user-info URLs, paths/query fragments, unofficial hosts, suffix lookalikes, non-443 ports, and redirects are rejected before token-bearing traffic.
- Dry-run reads no token and prints no private header.
- Creation body uses the resolved source/target project IDs and the exact branch/title values approved by the user.
- Returned repository or MR identity matches the request; unsupported MR inspection is not claimed.

## Light Adversarial Review

Keep challenge and critique to no more than 30% of the interaction. Verify host trust, API mode, IDs, branch direction, and write intent; after those are sound, execute only the supported operation and report concrete evidence.

## After Use Deposition

Check whether the call exposed a reusable endpoint, host-validation, request-shape, response, or safety correction. If yes, update this public-safe bundle, validate it, refresh the local copy, and push only when authorized. Otherwise report that no skill update is needed.
