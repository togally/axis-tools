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
    "axis-doc-project-knowledge": [
        "Three-Step Work Contract",
        "bootstrap",
        "scan_and_reconcile",
        "requirement_design",
        "level1_capability_id",
        "secondary_capabilities",
        "business_id",
        "business_inventory",
        "project_technical_architecture",
        "project_business_architecture",
        "business_capability_detailed_design",
        "secondary_capability_detailed_design",
        "business/capabilities/{level1_capability_id}/detailed-design.md",
        "business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md",
        "doc_gap_report",
        "missing_evidence",
        "用户业务操作全景",
        "user_journey_design_status",
        "user_journey_coverage",
        "user_journey_gap_id",
        "Controller/Handler",
        "Service/UseCase",
        "读取数据",
        "写入/产生数据",
        "用户可见结果",
        "level1_journey_id",
        "flow_id",
        "api_id",
        "interface_design_status",
        "interface_coverage",
        "persistence_design_status",
        "relationship_model_status",
        "physical_fk",
        "logical_relation",
        "Section 5 is grouped by contract",
        "接口清单与代码追溯",
        "5.2.5",
        "not_applicable",
        "After Use Deposition",
    ],
}

GROUPED_INTERFACE_TEMPLATE_TERMS = [
    "### 5.1 {interface_event_job_or_command_name}",
    "#### 5.1.1 接口清单与代码追溯",
    "| 项目 | 内容 |",
    "| 实现层 | 精确定位 | 职责 |",
    "#### 5.1.2 请求字段",
    "#### 5.1.3 响应字段",
    "#### 5.1.4 错误码与异常映射",
    "#### 5.1.5 认证、授权、幂等与事务",
    "### 5.2 {next_interface_event_job_or_command_name}",
    "#### 5.2.1 接口清单与代码追溯",
    "#### 5.2.2 请求字段",
    "#### 5.2.3 响应字段",
    "#### 5.2.4 错误码与异常映射",
    "#### 5.2.5 认证、授权、幂等与事务",
    "HTTP / EVENT / TOPIC / JOB / COMMAND",
    "interface_not_applicable_reason",
    "interface_not_applicable_evidence",
]

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

    if skill_name == "axis-doc-project-knowledge":
        interface_template_path = (
            skill_dir / "references" / "secondary-capability-detailed-design-template.md"
        )
        if not interface_template_path.exists():
            return fail("secondary capability detailed-design template not found")
        interface_template = interface_template_path.read_text(encoding="utf-8")
        for term in GROUPED_INTERFACE_TEMPLATE_TERMS:
            if term not in interface_template:
                return fail(f"grouped interface template missing required term: {term}")
        if re.search(
            r"^### 5\.\d+ (?:接口清单与代码追踪|请求字段|响应字段|错误码与异常映射)\s*$",
            interface_template,
            re.MULTILINE,
        ):
            return fail("legacy global interface/request/response subsection found")
        if re.search(
            r"^\|\s*`level1_journey_id`\s*\|\s*`api_id`\s*\|\s*方法与完整路径",
            interface_template,
            re.MULTILINE,
        ):
            return fail("legacy flat wide interface trace table found")

    print(f"{skill_name} quick validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(validate(Path(__file__).resolve().parent))
