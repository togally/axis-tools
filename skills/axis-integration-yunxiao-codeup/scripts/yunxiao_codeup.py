#!/usr/bin/env python3
"""Yunxiao Codeup OpenAPI helper.

The API token is read from an environment variable and is never printed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


DEFAULT_DOMAIN = "openapi-rdc.aliyuncs.com"
DEFAULT_TOKEN_ENV = "CODE_UP_API_TOKEN"


def env_first(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def normalize_domain(domain: str) -> str:
    domain = domain.strip().rstrip("/")
    if domain.startswith("http://") or domain.startswith("https://"):
        return domain
    return f"https://{domain}"


def encode_repo(repository_id: str) -> str:
    return urllib.parse.quote(str(repository_id), safe="")


def common_prefix(args: argparse.Namespace) -> str:
    base = normalize_domain(args.domain)
    if args.region:
        return f"{base}/oapi/v1/codeup"
    if not args.organization_id:
        raise SystemExit("error: --organization-id is required for center-version Yunxiao OpenAPI")
    organization_id = urllib.parse.quote(str(args.organization_id), safe="")
    return f"{base}/oapi/v1/codeup/organizations/{organization_id}"


def token_from_env(args: argparse.Namespace) -> str:
    token = os.environ.get(args.token_env)
    if not token:
        raise SystemExit(f"error: token env var {args.token_env!r} is not set")
    return token


def request_json(
    method: str,
    url: str,
    token: str,
    body: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> Any:
    data = None
    headers = {
        "Accept": "application/json",
        "x-yunxiao-token": token,
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise SystemExit(f"error: HTTP {exc.code} from Yunxiao API: {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"error: failed to reach Yunxiao API: {exc.reason}") from exc

    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def numeric_if_possible(value: str) -> int | str:
    return int(value) if str(value).isdigit() else value


def command_repos(args: argparse.Namespace) -> int:
    query: dict[str, Any] = {}
    if args.search:
        query["search"] = args.search
    if args.page:
        query["page"] = args.page
    if args.per_page:
        query["perPage"] = args.per_page

    url = f"{common_prefix(args)}/repositories"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"

    if args.dry_run:
        print_json({"method": "GET", "url": url, "tokenEnv": args.token_env})
        return 0

    print_json(request_json("GET", url, token_from_env(args), timeout=args.timeout))
    return 0


def command_repo(args: argparse.Namespace) -> int:
    url = f"{common_prefix(args)}/repositories/{encode_repo(args.repo)}"
    if args.dry_run:
        print_json({"method": "GET", "url": url, "tokenEnv": args.token_env})
        return 0

    print_json(request_json("GET", url, token_from_env(args), timeout=args.timeout))
    return 0


def resolve_same_project_id(args: argparse.Namespace) -> str | int:
    if args.project_id:
        return numeric_if_possible(args.project_id)
    if str(args.repo).isdigit():
        return numeric_if_possible(args.repo)
    if args.dry_run:
        return "<resolved repository id>"

    url = f"{common_prefix(args)}/repositories/{encode_repo(args.repo)}"
    repo = request_json("GET", url, token_from_env(args), timeout=args.timeout)
    data = repo.get("data", repo) if isinstance(repo, dict) else {}
    repo_id = data.get("id") if isinstance(data, dict) else None
    if repo_id is None:
        raise SystemExit("error: could not resolve repository id from get-repository response")
    return numeric_if_possible(str(repo_id))


def command_create_mr(args: argparse.Namespace) -> int:
    same_project_id = resolve_same_project_id(args)
    source_project_id = numeric_if_possible(args.source_project_id) if args.source_project_id else same_project_id
    target_project_id = numeric_if_possible(args.target_project_id) if args.target_project_id else same_project_id

    body: dict[str, Any] = {
        "sourceBranch": args.source,
        "sourceProjectId": source_project_id,
        "targetBranch": args.target,
        "targetProjectId": target_project_id,
        "title": args.title,
    }
    if args.description:
        body["description"] = args.description
    if args.create_from:
        body["createFrom"] = args.create_from

    url = f"{common_prefix(args)}/repositories/{encode_repo(args.repo)}/changeRequests"
    if args.dry_run:
        print_json({"method": "POST", "url": url, "tokenEnv": args.token_env, "body": body})
        return 0

    print_json(request_json("POST", url, token_from_env(args), body=body, timeout=args.timeout))
    return 0


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--domain", default=env_first("YUNXIAO_DOMAIN", "CODE_UP_DOMAIN") or DEFAULT_DOMAIN)
    parser.add_argument("--organization-id", default=env_first("YUNXIAO_ORGANIZATION_ID", "CODE_UP_ORGANIZATION_ID"))
    parser.add_argument("--region", action="store_true", help="Use region-version API paths instead of organization-scoped center-version paths.")
    parser.add_argument("--token-env", default=DEFAULT_TOKEN_ENV, help="Environment variable containing the Yunxiao API token.")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--dry-run", action="store_true", help="Print the request shape without sending it. Does not require a token.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Yunxiao Codeup OpenAPI helper. Reads the token from an environment variable.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    repos = subparsers.add_parser("repos", help="List or search repositories.")
    add_common_arguments(repos)
    repos.add_argument("--search")
    repos.add_argument("--page", type=int, default=1)
    repos.add_argument("--per-page", type=int, default=20)
    repos.set_defaults(func=command_repos)

    repo = subparsers.add_parser("repo", help="Get one repository.")
    add_common_arguments(repo)
    repo.add_argument("--repo", required=True, help="Repository numeric ID or full path.")
    repo.set_defaults(func=command_repo)

    create_mr = subparsers.add_parser("create-mr", help="Create a merge request.")
    add_common_arguments(create_mr)
    create_mr.add_argument("--repo", required=True, help="Repository numeric ID or full path.")
    create_mr.add_argument("--source", required=True, help="Source branch.")
    create_mr.add_argument("--target", required=True, help="Target branch.")
    create_mr.add_argument("--title", required=True)
    create_mr.add_argument("--description")
    create_mr.add_argument("--project-id", help="Use this repository/project ID as both sourceProjectId and targetProjectId.")
    create_mr.add_argument("--source-project-id")
    create_mr.add_argument("--target-project-id")
    create_mr.add_argument("--create-from", choices=["WEB", "COMMAND_LINE"])
    create_mr.set_defaults(func=command_create_mr)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
