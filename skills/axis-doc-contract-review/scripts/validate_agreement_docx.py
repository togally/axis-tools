#!/usr/bin/env python3
"""Validate publication-clean and annotated-response DOCX agreement packages."""

from __future__ import annotations

import argparse
import json
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = f"{{{W_NS}}}"
REQUIRED_PARTS = {"[Content_Types].xml", "_rels/.rels", "word/document.xml"}
TRACKED_TAGS = {f"{W}ins", f"{W}del", f"{W}moveFrom", f"{W}moveTo"}


def _attribute(element: ET.Element, name: str) -> str:
    return element.attrib.get(f"{W}{name}", "")


def _word_xml_roots(archive: ZipFile) -> list[ET.Element]:
    roots: list[ET.Element] = []
    for name in archive.namelist():
        if name.startswith("word/") and name.endswith(".xml"):
            roots.append(ET.fromstring(archive.read(name)))
    return roots


def inspect_docx(path: Path) -> dict[str, object]:
    with ZipFile(path) as archive:
        corrupt_member = archive.testzip()
        names = set(archive.namelist())
        missing_parts = sorted(REQUIRED_PARTS - names)
        document = ET.fromstring(archive.read("word/document.xml"))
        roots = _word_xml_roots(archive)

        comment_ids: list[str] = []
        if "word/comments.xml" in names:
            comments = ET.fromstring(archive.read("word/comments.xml"))
            comment_ids = [_attribute(node, "id") for node in comments.iter(f"{W}comment")]

        starts = [_attribute(node, "id") for node in document.iter(f"{W}commentRangeStart")]
        ends = [_attribute(node, "id") for node in document.iter(f"{W}commentRangeEnd")]
        references = [_attribute(node, "id") for node in document.iter(f"{W}commentReference")]
        text = "".join(node.text or "" for node in document.iter(f"{W}t"))

        tracked_changes = 0
        shadings: Counter[str] = Counter()
        highlights: Counter[str] = Counter()
        font_colors: Counter[str] = Counter()
        for root in roots:
            for node in root.iter():
                if node.tag in TRACKED_TAGS:
                    tracked_changes += 1
                if node.tag == f"{W}shd":
                    shadings[_attribute(node, "fill").upper()] += 1
                elif node.tag == f"{W}highlight":
                    highlights[_attribute(node, "val")] += 1
                elif node.tag == f"{W}color":
                    font_colors[_attribute(node, "val").upper()] += 1

    return {
        "path": str(path),
        "filename": path.name,
        "corrupt_member": corrupt_member,
        "missing_parts": missing_parts,
        "text": text,
        "text_length": len(text),
        "comments": comment_ids,
        "comment_range_starts": starts,
        "comment_range_ends": ends,
        "comment_references": references,
        "tracked_changes": tracked_changes,
        "shadings": dict(sorted(shadings.items())),
        "highlights": dict(sorted(highlights.items())),
        "font_colors": dict(sorted(font_colors.items())),
        "placeholders": {
            "待填写": text.count("【待填写】"),
            "待上线前填写": text.count("【待上线前填写】"),
        },
    }


def _check_package(result: dict[str, object], label: str, errors: list[str]) -> None:
    if result["corrupt_member"]:
        errors.append(f"{label}: corrupt ZIP member {result['corrupt_member']}")
    if result["missing_parts"]:
        errors.append(f"{label}: missing required parts {result['missing_parts']}")


def _check_clean(result: dict[str, object], errors: list[str]) -> None:
    if result["comments"]:
        errors.append("clean: comments.xml contains comments")
    for key in ("comment_range_starts", "comment_range_ends", "comment_references"):
        if result[key]:
            errors.append(f"clean: {key} is not empty")
    if result["tracked_changes"]:
        errors.append("clean: tracked changes remain")


def _check_annotated(
    result: dict[str, object], expected_comments: int | None, errors: list[str]
) -> None:
    sequences = [
        result["comments"],
        result["comment_range_starts"],
        result["comment_range_ends"],
        result["comment_references"],
    ]
    normalized = [sorted(sequence, key=lambda value: int(value)) for sequence in sequences]
    if any(len(sequence) != len(set(sequence)) for sequence in sequences):
        errors.append("annotated: duplicate comment IDs or anchors")
    if not all(sequence == normalized[0] for sequence in normalized[1:]):
        errors.append("annotated: comment definitions and anchors do not match")
    if expected_comments is not None and len(sequences[0]) != expected_comments:
        errors.append(
            f"annotated: expected {expected_comments} comments, found {len(sequences[0])}"
        )


def validate(
    clean_path: Path,
    annotated_path: Path | None,
    expected_comments: int | None,
    forbidden_shading: set[str],
    forbidden_highlight: set[str],
    forbidden_font_color: set[str],
    forbidden_filename_token: list[str],
) -> dict[str, object]:
    errors: list[str] = []
    clean = inspect_docx(clean_path)
    _check_package(clean, "clean", errors)
    _check_clean(clean, errors)

    lower_name = clean_path.name.lower()
    for token in forbidden_filename_token:
        if token.lower() in lower_name:
            errors.append(f"clean: filename contains forbidden token {token!r}")

    present_shading = {value.upper() for value in clean["shadings"]}
    present_highlight = set(clean["highlights"])
    present_font_color = {value.upper() for value in clean["font_colors"]}
    for value in sorted(forbidden_shading & present_shading):
        errors.append(f"clean: forbidden shading remains: {value}")
    for value in sorted(forbidden_highlight & present_highlight):
        errors.append(f"clean: forbidden highlight remains: {value}")
    for value in sorted(forbidden_font_color & present_font_color):
        errors.append(f"clean: forbidden font color remains: {value}")

    annotated = None
    if annotated_path:
        annotated = inspect_docx(annotated_path)
        _check_package(annotated, "annotated", errors)
        _check_annotated(annotated, expected_comments, errors)
        if clean["text"] != annotated["text"]:
            errors.append("clean and annotated normalized body/table text differ")

    return {
        "ok": not errors,
        "errors": errors,
        "clean": {key: value for key, value in clean.items() if key != "text"},
        "annotated": (
            {key: value for key, value in annotated.items() if key != "text"}
            if annotated
            else None
        ),
    }


def _minimal_parts(document: bytes, comments: bytes | None = None) -> dict[str, bytes]:
    parts = {
        "[Content_Types].xml": b"<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'/>",
        "_rels/.rels": b"<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'/>",
        "word/document.xml": document,
    }
    if comments is not None:
        parts["word/comments.xml"] = comments
    return parts


def _write_docx(path: Path, parts: dict[str, bytes]) -> None:
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)


def self_test() -> dict[str, object]:
    clean_document = (
        f"<w:document xmlns:w='{W_NS}'><w:body><w:p><w:r><w:t>same text</w:t>"
        "</w:r></w:p></w:body></w:document>"
    ).encode()
    annotated_document = (
        f"<w:document xmlns:w='{W_NS}'><w:body><w:p>"
        "<w:commentRangeStart w:id='0'/><w:r><w:t>same text</w:t></w:r>"
        "<w:commentRangeEnd w:id='0'/><w:r><w:commentReference w:id='0'/></w:r>"
        "</w:p></w:body></w:document>"
    ).encode()
    comments = (
        f"<w:comments xmlns:w='{W_NS}'><w:comment w:id='0'><w:p><w:r>"
        "<w:t>review</w:t></w:r></w:p></w:comment></w:comments>"
    ).encode()

    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        clean = root / "agreement-v1.docx"
        annotated = root / "agreement-v1-comment-response.docx"
        _write_docx(clean, _minimal_parts(clean_document))
        _write_docx(annotated, _minimal_parts(annotated_document, comments))
        result = validate(
            clean,
            annotated,
            expected_comments=1,
            forbidden_shading={"FFF2CC"},
            forbidden_highlight={"yellow"},
            forbidden_font_color={"7F6000"},
            forbidden_filename_token=["clean", "清洁版"],
        )
        if not result["ok"]:
            raise AssertionError(result["errors"])
        return {"ok": True, "checks": ["package", "comments", "parity", "format", "filename"]}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clean", type=Path)
    parser.add_argument("--annotated", type=Path)
    parser.add_argument("--expected-comments", type=int)
    parser.add_argument("--forbid-shading", action="append", default=[])
    parser.add_argument("--forbid-highlight", action="append", default=[])
    parser.add_argument("--forbid-font-color", action="append", default=[])
    parser.add_argument("--forbid-filename-token", action="append", default=[])
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        print(json.dumps(self_test(), ensure_ascii=False, indent=2))
        return 0
    if not args.clean:
        raise SystemExit("--clean is required unless --self-test is used")

    result = validate(
        args.clean,
        args.annotated,
        args.expected_comments,
        {value.upper() for value in args.forbid_shading},
        set(args.forbid_highlight),
        {value.upper() for value in args.forbid_font_color},
        args.forbid_filename_token,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
