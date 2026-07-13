#!/usr/bin/env python3
"""Create an immutable, traceable snapshot before an Axis document changes."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys


def safe_token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-._")
    return token or "unknown"


def relative_string(root: Path, target: Path) -> str:
    return target.relative_to(root).as_posix()


def atomic_write(path: Path, content: bytes) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(content)
    temporary.replace(path)


def existing_archive(history_root: Path, content_sha256: str, source_revision: str) -> tuple[Path, dict] | None:
    if not history_root.is_dir():
        return None
    for metadata_path in sorted(history_root.glob("*/metadata.json")):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            metadata.get("schema") == "axis.document_archive"
            and metadata.get("content_sha256") == content_sha256
            and str(metadata.get("source_revision")) == source_revision
        ):
            content_path = metadata_path.parent / str(metadata.get("archive_content", ""))
            if content_path.is_file() and hashlib.sha256(content_path.read_bytes()).hexdigest() == content_sha256:
                return metadata_path, metadata
    return None


def archive(args: argparse.Namespace) -> dict:
    repo = args.repo.expanduser().resolve()
    document = args.document.expanduser().resolve()
    current_root = repo / ".axis" / "docs" / "orgs"
    try:
        relative_current = document.relative_to(current_root)
    except ValueError as error:
        raise RuntimeError("document must be under .axis/docs/orgs/{organization_id}/projects/{project_slug}") from error

    parts = relative_current.parts
    if len(parts) < 5 or parts[1] != "projects":
        raise RuntimeError("document path must include orgs/{organization_id}/projects/{project_slug}/{canonical_path}")
    if not document.is_file():
        raise RuntimeError(f"canonical document does not exist: {document}")

    organization_id = parts[0]
    project_slug = parts[2]
    canonical_parts = parts[3:]
    canonical_path = Path(*canonical_parts).as_posix()
    content = document.read_bytes()
    content_sha256 = hashlib.sha256(content).hexdigest()
    source_revision = str(args.source_revision)
    target_revision = str(args.target_revision)
    history_root = (
        repo
        / ".axis"
        / "docs"
        / "_archive"
        / "orgs"
        / organization_id
        / "projects"
        / project_slug
        / f"{canonical_path}.history"
    )

    already = existing_archive(history_root, content_sha256, source_revision)
    if already:
        metadata_path, metadata = already
        content_path = metadata_path.parent / metadata["archive_content"]
        return {
            "ok": True,
            "status": "already_archived",
            "archive_id": metadata["archive_id"],
            "archive_dir": relative_string(repo, metadata_path.parent),
            "archive_content": relative_string(repo, content_path),
            "metadata": relative_string(repo, metadata_path),
            "content_sha256": content_sha256,
        }

    archived_at = datetime.now(timezone.utc)
    timestamp = archived_at.strftime("%Y%m%dT%H%M%S%fZ")
    archive_id = f"{timestamp}-r{safe_token(source_revision)}-{content_sha256[:12]}"
    archive_dir = history_root / archive_id
    archive_dir.mkdir(parents=True, exist_ok=False)
    extension = document.suffix or ".txt"
    content_path = archive_dir / f"document{extension}"
    metadata_path = archive_dir / "metadata.json"

    atomic_write(content_path, content)
    verified_sha256 = hashlib.sha256(content_path.read_bytes()).hexdigest()
    if verified_sha256 != content_sha256:
        raise RuntimeError("archive content hash verification failed")

    metadata = {
        "schema": "axis.document_archive",
        "schema_version": "0.2",
        "archive_id": archive_id,
        "organization_id": organization_id,
        "project_slug": project_slug,
        "canonical_path": canonical_path,
        "current_document": relative_string(repo, document),
        "archive_content": content_path.name,
        "archived_at": archived_at.isoformat().replace("+00:00", "Z"),
        "change_reason": args.reason.strip(),
        "request_summary": args.request_summary.strip(),
        "source_revision": source_revision,
        "target_revision": target_revision,
        "content_sha256": content_sha256,
    }
    atomic_write(metadata_path, f"{json.dumps(metadata, ensure_ascii=False, indent=2)}\n".encode("utf-8"))
    persisted = json.loads(metadata_path.read_text(encoding="utf-8"))
    if persisted.get("content_sha256") != verified_sha256:
        raise RuntimeError("archive metadata hash verification failed")

    return {
        "ok": True,
        "status": "archived",
        "archive_id": archive_id,
        "archive_dir": relative_string(repo, archive_dir),
        "archive_content": relative_string(repo, content_path),
        "metadata": relative_string(repo, metadata_path),
        "content_sha256": content_sha256,
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--repo", type=Path, required=True)
    result.add_argument("--document", type=Path, required=True)
    result.add_argument("--reason", required=True)
    result.add_argument("--request-summary", required=True)
    result.add_argument("--source-revision", required=True)
    result.add_argument("--target-revision", required=True)
    return result


def main() -> int:
    try:
        result = archive(parser().parse_args())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
