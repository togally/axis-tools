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
        "level1_capability_dependency_graph",
        "business/level1-capability-dependency-graph.yaml",
        "dependency_graph_status",
        "dependency_graph_revision",
        "dependency_graph_gap_id",
        "pending_level1_completion",
        "not_derived",
        "项目级统一模型梳理",
        "直接入边",
        "直接出边",
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
        "调用主体、权限与接口矩阵",
        "所需权限/策略",
        "可调用接口/能力",
        "授权证据",
        "Section 5 is grouped by contract",
        "接口清单与代码追溯",
        "内部处理逻辑",
        "认证与授权执行",
        "事务、并发、性能与容错",
        "安全、测试与验收",
        "5.2.8",
        "not_applicable",
        "After Use Deposition",
    ],
}

GROUPED_INTERFACE_TEMPLATE_TERMS = [
    "## 1. 能力定位与边界",
    "## 2. 调用主体、权限与接口矩阵",
    "| 主体/角色 | 所需权限/策略 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |",
    "执行已授权流程",
    "### 5.1 {interface_event_job_or_command_name}",
    "#### 5.1.1 接口清单与代码追溯",
    "| 项目 | 内容 |",
    "| 实现层 | 精确定位 | 职责 |",
    "#### 5.1.2 内部处理逻辑",
    "处理说明：{concrete_internal_processing_summary}",
    "| 步骤 | 内部处理 | 代码对象 | 数据读写/状态变化 | 失败处理 |",
    "实际输出必须替换所有花括号内容",
    "#### 5.1.3 请求字段",
    "#### 5.1.4 响应字段",
    "#### 5.1.5 错误码与异常映射",
    "#### 5.1.6 认证与授权执行",
    "#### 5.1.7 事务、并发、性能与容错",
    "#### 5.1.8 安全、测试与验收",
    "### 5.2 {next_interface_event_job_or_command_name}",
    "#### 5.2.1 接口清单与代码追溯",
    "#### 5.2.2 内部处理逻辑",
    "#### 5.2.3 请求字段",
    "#### 5.2.4 响应字段",
    "#### 5.2.5 错误码与异常映射",
    "#### 5.2.6 认证与授权执行",
    "#### 5.2.7 事务、并发、性能与容错",
    "#### 5.2.8 安全、测试与验收",
    "## 3. 能力级流程与跨接口关系",
    "本章只描述二级能力内部多个接口",
    "接口内部逻辑见各 `5.N.2`",
    "HTTP / EVENT / TOPIC / JOB / COMMAND",
    "interface_not_applicable_reason",
    "interface_not_applicable_evidence",
]

LEGACY_TOP_LEVEL_SEMANTIC_TITLES = {
    "实体、表与对象关系",
    "表结构设计",
    "事务、并发、性能与容错",
    "安全、测试与验收",
    "端到端追溯矩阵",
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

    if skill_name == "axis-doc-project-knowledge":
        dependency_template_path = (
            skill_dir / "references" / "level1-capability-dependency-graph-template.yaml"
        )
        if not dependency_template_path.exists():
            return fail("level-1 capability dependency graph template not found")
        dependency_template = dependency_template_path.read_text(encoding="utf-8")
        for term in [
            "axis.level1_capability_dependency_graph",
            "derivation_status",
            "model_synthesis",
            "not_derived",
            "from_level1_capability_id",
            "to_level1_capability_id",
            "relation_type",
            "stage",
            "evidence_refs",
        ]:
            if term not in dependency_template:
                return fail(
                    f"level-1 capability dependency graph template missing required term: {term}"
                )
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
            r"^### 5\.\d+ (?:接口清单与代码追踪|内部处理逻辑|请求字段|响应字段|错误码与异常映射)\s*$",
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
        if re.search(
            r"actor\[\"\{actor\}\"\][\s\S]*"
            r"application\[\"\{application_service\}\"\][\s\S]*"
            r"\{entity_or_table\}[\s\S]*\{outcome_or_state\}",
            interface_template,
        ):
            return fail("legacy generic actor-to-api flow placeholder found")
        if re.search(
            r"^##\s+\d+\.?\s+(?:身份、职责与 business_id 映射|参与者、权限与数据范围)\s*$",
            interface_template,
            re.MULTILINE,
        ):
            return fail("legacy duplicate identity or participant section found")
        for line in interface_template.splitlines():
            heading_match = re.fullmatch(
                r"##\s+(?:\d+(?:\.\d+)*[.、]?\s*)?(.+?)\s*", line
            )
            if (
                heading_match
                and heading_match.group(1) in LEGACY_TOP_LEVEL_SEMANTIC_TITLES
            ):
                return fail(
                    "legacy top-level semantic section found: "
                    + heading_match.group(1)
                )

    print(f"{skill_name} quick validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(validate(Path(__file__).resolve().parent))
