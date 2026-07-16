# Yunxiao Codeup OpenAPI Reference

Use the official Yunxiao developer documentation as the source of truth for endpoint changes. Keep task-specific organization IDs, repository IDs, branch names, and merge-request URLs outside this public skill.

## Official Docs

- Service access point domain: `https://help.aliyun.com/zh/yunxiao/developer-reference/service-access-point-domain`
- Personal access token: `https://help.aliyun.com/zh/yunxiao/get-personal-access-token`
- Create merge request: `https://help.aliyun.com/zh/yunxiao/developer-reference/createchangerequest-creates-a-code-merge-request`
- List repositories: `https://help.aliyun.com/zh/yunxiao/developer-reference/listrepositories-query-code-library-list`
- Get repository: `https://help.aliyun.com/zh/yunxiao/developer-reference/getrepository-query-code-library`

## Access Modes

Center version:

- Use the centralized OpenAPI access domain.
- Use organization-scoped paths under `/oapi/v1/codeup/organizations/{organizationId}`.

Region version:

- Use the Yunxiao instance access domain.
- Use paths under `/oapi/v1/codeup`.
- Pass the exact self-hosted HTTPS hostname with both `--domain` and `--allowed-host`. This is an explicit trust decision; suffix matching is never used.

## Authentication

Send the API token in the `x-yunxiao-token` request header. Never pass the token itself as a command-line argument.

The helper requires HTTPS and blocks redirects before sending token-bearing requests. The official center host is trusted by exact name. A self-hosted region instance must be explicitly allowlisted by exact hostname.

## Repository Lookup

List repositories:

- Center: `GET https://{domain}/oapi/v1/codeup/organizations/{organizationId}/repositories`
- Region: `GET https://{domain}/oapi/v1/codeup/repositories`
- Useful query fields: `search`, `page`, `perPage`
- Useful response fields: `id`, `name`, `pathWithNamespace`, `webUrl`, `sshUrlToRepo`, `httpUrlToRepo`, `defaultBranch`

Get repository:

- Center: `GET https://{domain}/oapi/v1/codeup/organizations/{organizationId}/repositories/{repositoryId}`
- Region: `GET https://{domain}/oapi/v1/codeup/repositories/{repositoryId}`
- `repositoryId` can be a numeric ID or a URL-encoded full path.

## Merge Request Creation

Create merge request:

- Center: `POST https://{domain}/oapi/v1/codeup/organizations/{organizationId}/repositories/{repositoryId}/changeRequests`
- Region: `POST https://{domain}/oapi/v1/codeup/repositories/{repositoryId}/changeRequests`

Required body fields:

- `sourceBranch`
- `sourceProjectId`
- `targetBranch`
- `targetProjectId`
- `title`

Optional body fields:

- `description`
- `reviewers`
- `assignees`
- `workItemIds`
- `createFrom`

Useful response fields:

- `webUrl`
- `detailUrl`
- `localId`
- `status`
- `allRequirementsPass`
- `sourceBranch`
- `targetBranch`
