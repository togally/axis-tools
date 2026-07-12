#!/usr/bin/env python3
"""Manage the standalone Axis document review console."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser


DEFAULT_REPOSITORY = "https://github.com/togally/axis-document-review.git"
DEFAULT_TARGET = Path(os.environ.get("AXIS_DOC_DASHBORD_DIR", "~/axis-document-review")).expanduser()
SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL_ROOT / "assets" / "axis-doc-dashbord-template.tgz"


def emit(**payload: object) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def ready(target: Path) -> bool:
    return all((target / relative).is_file() for relative in (
        "package.json",
        "src/cli.mjs",
        "public/index.html",
    ))


def ensure_empty_target(target: Path) -> None:
    if target.exists() and any(target.iterdir()):
        raise RuntimeError(f"Target directory is not empty: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)


def command_status(args: argparse.Namespace) -> None:
    target = args.target.resolve()
    if ready(target):
        emit(ok=True, state="ready", target=str(target), git=(target / ".git").is_dir())
    else:
        emit(ok=True, state="repo_missing", target=str(target), git=False)


def command_clone(args: argparse.Namespace) -> None:
    target = args.target.resolve()
    ensure_empty_target(target)
    if target.exists():
        target.rmdir()
    subprocess.run(["git", "clone", "--depth", "1", args.repo_url, str(target)], check=True)
    if not ready(target):
        raise RuntimeError("Cloned repository is not a valid axis-document-review application")
    emit(ok=True, state="ready", method="pull_public_repo", target=str(target))


def safe_members(archive: tarfile.TarFile, target: Path):
    root = target.resolve()
    for member in archive.getmembers():
        destination = (target / member.name).resolve()
        if destination != root and root not in destination.parents:
            raise RuntimeError(f"Unsafe template entry: {member.name}")
        yield member


def command_scaffold(args: argparse.Namespace) -> None:
    target = args.target.resolve()
    ensure_empty_target(target)
    if not TEMPLATE.is_file():
        raise RuntimeError(f"Bundled template is missing: {TEMPLATE}")
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(TEMPLATE, "r:gz") as archive:
        archive.extractall(target, members=safe_members(archive, target))
    if not ready(target):
        raise RuntimeError("Bundled template did not create a valid application")
    emit(ok=True, state="ready", method="build_local_template", target=str(target))


def health(url: str) -> dict | None:
    try:
        with urlopen(f"{url}/api/health", timeout=1.5) as response:
            health_payload = json.loads(response.read().decode("utf-8"))
        with urlopen(f"{url}/api/catalog", timeout=1.5) as response:
            catalog = json.loads(response.read().decode("utf-8"))
        if catalog.get("schema") != "axis.document_review.catalog":
            return None
        return health_payload
    except (URLError, TimeoutError, json.JSONDecodeError):
        return None


def command_start(args: argparse.Namespace) -> None:
    target = args.target.resolve()
    project = args.project.resolve()
    if not ready(target):
        raise RuntimeError(f"Application is not ready: {target}; run status and resolve repo_missing first")
    if not project.is_dir():
        raise RuntimeError(f"Project directory does not exist: {project}")
    url = f"http://{args.host}:{args.port}"
    existing = health(url)
    if existing is not None:
        if args.open:
            webbrowser.open(url)
        emit(ok=True, state="running", reused=True, url=url, health=existing, target=str(target), project=str(project))
        return

    if not (target / "node_modules").is_dir():
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"], cwd=target, check=True)

    runtime = target / ".axis-runtime"
    runtime.mkdir(exist_ok=True)
    log_path = runtime / "server.log"
    log_handle = log_path.open("ab")
    command = [
        "npm", "start", "--", "--repo", str(project), "--source", args.source,
        "--host", args.host, "--port", str(args.port),
    ]
    process = subprocess.Popen(
        command,
        cwd=target,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    (runtime / "server.pid").write_text(f"{process.pid}\n", encoding="utf-8")
    checked = None
    for _ in range(40):
        if process.poll() is not None:
            break
        checked = health(url)
        if checked is not None:
            break
        time.sleep(0.25)
    log_handle.close()
    if checked is None:
        raise RuntimeError(f"Server did not become healthy; inspect {log_path}")
    if args.open:
        webbrowser.open(url)
    emit(
        ok=True,
        state="running",
        reused=False,
        pid=process.pid,
        url=url,
        health=checked,
        target=str(target),
        project=str(project),
        log=str(log_path),
    )


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    subparsers = result.add_subparsers(dest="command", required=True)
    for name in ("status", "clone", "scaffold"):
        command = subparsers.add_parser(name)
        command.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    subparsers.choices["clone"].add_argument("--repo-url", default=DEFAULT_REPOSITORY)
    start = subparsers.add_parser("start")
    start.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    start.add_argument("--project", type=Path, default=Path.cwd())
    start.add_argument("--source", choices=("all", "local", "oss"), default="all")
    start.add_argument("--host", default="127.0.0.1")
    start.add_argument("--port", type=int, default=4177)
    start.add_argument("--open", action=argparse.BooleanOptionalAction, default=True)
    return result


def main() -> int:
    args = parser().parse_args()
    if not 0 <= getattr(args, "port", 4177) <= 65535:
        raise RuntimeError("port must be between 0 and 65535")
    globals()[f"command_{args.command}"](args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        emit(ok=False, state="error", error=str(error))
        raise SystemExit(1)
