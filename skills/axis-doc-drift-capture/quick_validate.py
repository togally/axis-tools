#!/usr/bin/env python3
"""Local quick validation for Axis v0.2 project-knowledge skills."""

from __future__ import annotations

import re
import sys
from pathlib import Path


REQUIRED_TERMS = {
    "axis-doc-drift-capture": [
        "Three-Step Work Contract",
        "task_execution_record",
        "version_iteration_record",
        "affected_docs",
        "doc_update_authorization",
        "No Silent Approved-Doc Rewrite",
        "After Use Deposition",
    ],
    "axis-business-domain-doc": [
        "Three-Step Work Contract",
        "business_id",
        "business_inventory",
        "business_domain_detailed_design",
        "business/domains/{business_id}/detailed-design.md",
        "missing_evidence",
        "After Use Deposition",
    ],
}

SENSITIVE_PATTERN = re.compile(
    r"(password|secret|api[_-]?key|access[_-]?key)\s*[:=]|"
    r"https?://(10\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)",
    re.IGNORECASE,
)


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 1


def has_cjk(text: str) -> bool:
    return re.search(r"[\u3400-\u9fff]", text) is not None


def parse_frontmatter(skill_md: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", skill_md, re.DOTALL)
    if not match:
        raise ValueError("SKILL.md must start with YAML frontmatter")

    frontmatter: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if not line.strip() or line.startswith(" "):
            continue
        if ":" not in line:
            raise ValueError(f"Invalid frontmatter line: {line}")
        key, value = line.split(":", 1)
        frontmatter[key.strip()] = value.strip().strip('"')
    return frontmatter


def validate(skill_dir: Path) -> int:
    skill_name = skill_dir.name
    if skill_name not in REQUIRED_TERMS:
        return fail(f"unsupported skill directory: {skill_name}")

    skill_md_path = skill_dir / "SKILL.md"
    agent_yaml_path = skill_dir / "agents" / "openai.yaml"
    if not skill_md_path.exists():
        return fail("SKILL.md not found")
    if not agent_yaml_path.exists():
        return fail("agents/openai.yaml not found")

    skill_md = skill_md_path.read_text(encoding="utf-8")
    agent_yaml = agent_yaml_path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(skill_md)

    if frontmatter.get("name") != skill_name:
        return fail(f"frontmatter name must be {skill_name}")

    description = frontmatter.get("description", "")
    if not description.startswith("Use when"):
        return fail("description must start with 'Use when'")
    if not re.search(r"[A-Za-z]", description) or not has_cjk(description):
        return fail("description must be bilingual English and Chinese")

    for term in REQUIRED_TERMS[skill_name]:
        if term not in skill_md:
            return fail(f"missing required term in SKILL.md: {term}")

    if "$" + skill_name not in agent_yaml:
        return fail(f"agents/openai.yaml must mention ${skill_name}")
    if "allow_implicit_invocation: true" not in agent_yaml:
        return fail("agents/openai.yaml must allow implicit invocation")
    short_description = next(
        (line for line in agent_yaml.splitlines() if line.strip().startswith("short_description:")),
        "",
    )
    if not re.search(r"[A-Za-z]", short_description) or not has_cjk(short_description):
        return fail("short_description must be bilingual English and Chinese")

    combined = skill_md + "\n" + agent_yaml
    if re.search(r"TODO|TBD|待补|待定|xxx|XXX|\.\.\.", combined):
        return fail("unresolved placeholder text found")
    if SENSITIVE_PATTERN.search(combined):
        return fail("credential-like value or private network URL found")

    print(f"{skill_name} quick validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(validate(Path(__file__).resolve().parent))
