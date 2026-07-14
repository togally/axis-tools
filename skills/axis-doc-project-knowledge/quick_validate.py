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
        "对外业务能力与接口实现",
        "user_journey_design_status",
        "user_journey_coverage",
        "user_journey_gap_id",
        "table_design_status",
        "table_design_coverage",
        "table_design_gap_id",
        "表结构设计",
        "table_id",
        "ER diagram",
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
        "读写 `table_id`",
        "ER 关系证据",
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
    "| 字段 | 位置 | 类型/必填 | 约束/枚举 | 业务语义/敏感处理 | 证据/状态 |",
    "#### 5.1.4 响应字段",
    "| HTTP/消息/执行状态 | 字段 | 类型/可空 | 业务语义/产生位置 | 证据/状态 |",
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
    "table_id={parent_table_ids_or_not_applicable}",
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

MAX_READABLE_MARKDOWN_TABLE_COLUMNS = 6


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


def split_markdown_table_row(line: str) -> list[str]:
    content = line.strip()
    if content.startswith("|"):
        content = content[1:]
    if has_unescaped_trailing_pipe(content):
        content = content[:-1]
    cells: list[str] = []
    current: list[str] = []
    index = 0
    while index < len(content):
        character = content[index]
        if character != "|":
            current.append(character)
            index += 1
            continue
        backslash_count = 0
        previous = index - 1
        while previous >= 0 and content[previous] == "\\":
            backslash_count += 1
            previous -= 1
        if backslash_count % 2 == 1:
            current = current[:-1]
            current.append("|")
        else:
            cells.append("".join(current).strip())
            current = []
        index += 1
    cells.append("".join(current).strip())
    return cells


def has_unescaped_trailing_pipe(line: str) -> bool:
    if not line.endswith("|"):
        return False
    backslash_count = 0
    index = len(line) - 2
    while index >= 0 and line[index] == "\\":
        backslash_count += 1
        index -= 1
    return backslash_count % 2 == 0


def looks_like_markdown_table_row(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    return (
        stripped.startswith("|")
        or has_unescaped_trailing_pipe(stripped)
        or len(split_markdown_table_row(stripped)) > 1
    )


def markdown_line_context(line: str) -> tuple[str, int]:
    content = line
    blockquote_depth = 0
    while True:
        prefix = re.match(r"^ {0,3}>[ \t]?", content)
        if prefix is None:
            return content, blockquote_depth
        content = content[prefix.end():]
        blockquote_depth += 1


def is_indented_markdown_code(line: str) -> bool:
    return line.startswith("    ") or line.startswith("\t")


def markdown_fence_match(line: str) -> re.Match[str] | None:
    return re.match(
        r"^ {0,3}(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})(.*)$",
        line,
    )


def inline_code_span_end(line: str, start: int) -> int | None:
    delimiter_length = 1
    while start + delimiter_length < len(line) and line[start + delimiter_length] == "`":
        delimiter_length += 1
    delimiter = "`" * delimiter_length
    candidate = line.find(delimiter, start + delimiter_length)
    while candidate >= 0:
        preceding = line[candidate - 1] if candidate > 0 else ""
        following_index = candidate + delimiter_length
        following = line[following_index] if following_index < len(line) else ""
        if preceding != "`" and following != "`":
            return following_index
        candidate = line.find(delimiter, following_index)
    return None


def strip_markdown_html_comments(
    line: str, initial_comment_state: bool = False
) -> tuple[str, bool]:
    content: list[str] = []
    cursor = 0
    in_comment = initial_comment_state
    while cursor < len(line):
        if in_comment:
            comment_end = line.find("-->", cursor)
            if comment_end < 0:
                return "".join(content), True
            in_comment = False
            cursor = comment_end + 3
            continue
        comment_start = line.find("<!--", cursor)
        code_span_start = line.find("`", cursor)
        if code_span_start >= 0 and (
            comment_start < 0 or code_span_start < comment_start
        ):
            code_span_end = inline_code_span_end(line, code_span_start)
            if code_span_end is not None:
                content.append(line[cursor:code_span_end])
                cursor = code_span_end
            else:
                content.append(line[cursor:code_span_start + 1])
                cursor = code_span_start + 1
            continue
        if comment_start < 0:
            content.append(line[cursor:])
            break
        content.append(line[cursor:comment_start])
        in_comment = True
        cursor = comment_start + 4
    return "".join(content), in_comment


def is_markdown_block_boundary(line: str) -> bool:
    return (
        re.match(r"^#{1,6}(?:\s|$)", line.lstrip()) is not None
        or markdown_fence_match(line) is not None
    )


def markdown_table_readability_error(markdown: str, source: str) -> str | None:
    lines = markdown.splitlines()
    fence_marker: str | None = None
    fence_length = 0
    fence_blockquote_depth = 0
    in_html_comment = False
    html_comment_blockquote_depth = 0
    index = 0
    while index < len(lines) - 1:
        context_content, blockquote_depth = markdown_line_context(lines[index])
        if fence_marker is not None and blockquote_depth < fence_blockquote_depth:
            fence_marker = None
            fence_length = 0
            fence_blockquote_depth = 0
        if in_html_comment and blockquote_depth < html_comment_blockquote_depth:
            in_html_comment = False
            html_comment_blockquote_depth = 0
        unstripped_fence_match = markdown_fence_match(context_content)
        if fence_marker is not None:
            if unstripped_fence_match:
                marker = unstripped_fence_match.group(1)[0]
                if (
                    marker == fence_marker
                    and blockquote_depth == fence_blockquote_depth
                    and len(unstripped_fence_match.group(1)) >= fence_length
                    and not unstripped_fence_match.group(2).strip()
                ):
                    fence_marker = None
                    fence_length = 0
                    fence_blockquote_depth = 0
            index += 1
            continue
        if not in_html_comment and is_indented_markdown_code(context_content):
            index += 1
            continue
        was_in_html_comment = in_html_comment
        raw_line, in_html_comment = strip_markdown_html_comments(
            context_content, in_html_comment
        )
        if not was_in_html_comment and in_html_comment:
            html_comment_blockquote_depth = blockquote_depth
        if not in_html_comment:
            html_comment_blockquote_depth = 0
        fence_match = markdown_fence_match(raw_line)
        if fence_match:
            fence_marker = fence_match.group(1)[0]
            fence_length = len(fence_match.group(1))
            fence_blockquote_depth = blockquote_depth
            index += 1
            continue
        if in_html_comment:
            index += 1
            continue

        header_line = raw_line.strip()
        raw_separator_line, separator_blockquote_depth = markdown_line_context(
            lines[index + 1]
        )
        if (
            separator_blockquote_depth != blockquote_depth
            or is_indented_markdown_code(raw_separator_line)
        ):
            index += 1
            continue
        separator_line = strip_markdown_html_comments(raw_separator_line)[0].strip()
        if not (
            looks_like_markdown_table_row(header_line)
            and looks_like_markdown_table_row(separator_line)
        ):
            index += 1
            continue
        headers = split_markdown_table_row(header_line)
        separators = split_markdown_table_row(separator_line)
        valid_separator_cells = [
            re.fullmatch(r":?-{3,}:?", cell.strip()) is not None
            for cell in separators
        ]
        separator_like = bool(separators) and all(
            re.fullmatch(r":?-+:?", cell.strip()) is not None
            for cell in separators
        )
        if not separator_like and not any(valid_separator_cells):
            index += 1
            continue
        line_number = index + 1
        if not all(valid_separator_cells):
            return f"Markdown table has an invalid separator: {source}:{line_number + 1}"
        if len(headers) != len(separators):
            return (
                "Markdown table header/separator column mismatch: "
                f"{source}:{line_number} "
                f"(header={len(headers)}, separator={len(separators)})"
            )
        for header_index, header in enumerate(headers):
            if not re.sub(r"[`*]", "", header).strip():
                return (
                    f"Markdown table has an empty header cell: {source}:{line_number} "
                    f"(column {header_index + 1})"
                )
        if len(headers) > MAX_READABLE_MARKDOWN_TABLE_COLUMNS:
            return (
                f"Markdown table exceeds {MAX_READABLE_MARKDOWN_TABLE_COLUMNS} columns: "
                f"{source}:{line_number} ({len(headers)} columns)"
            )
        row_index = index + 2
        while row_index < len(lines):
            raw_row_line, row_blockquote_depth = markdown_line_context(lines[row_index])
            if (
                row_blockquote_depth != blockquote_depth
                or is_indented_markdown_code(raw_row_line)
            ):
                break
            row_line = strip_markdown_html_comments(raw_row_line)[0].strip()
            if not row_line or is_markdown_block_boundary(row_line):
                break
            if not looks_like_markdown_table_row(row_line):
                break
            row = split_markdown_table_row(row_line)
            if len(row) != len(headers):
                return (
                    f"Markdown table data row column mismatch: {source}:{row_index + 1} "
                    f"(header={len(headers)}, row={len(row)})"
                )
            row_index += 1
        index = row_index
    return None


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

    markdown_paths = sorted(
        path
        for path in skill_dir.rglob("*")
        if path.is_file()
        and path.suffix.lower() in {".md", ".markdown"}
        and "_archive" not in path.relative_to(skill_dir).parts
    )
    for markdown_path in markdown_paths:
        readability_error = markdown_table_readability_error(
            markdown_path.read_text(encoding="utf-8"),
            markdown_path.relative_to(skill_dir).as_posix(),
        )
        if readability_error:
            return fail(readability_error)

    if skill_name == "axis-doc-project-knowledge":
        level1_overview_template_path = (
            skill_dir / "references" / "business-capability-detailed-design-template.md"
        )
        if not level1_overview_template_path.exists():
            return fail("level-1 capability overview template not found")
        level1_overview_template = level1_overview_template_path.read_text(
            encoding="utf-8"
        )
        if re.search(
            r"^##\s+\d+\.?\s+用户旅程覆盖契约\s*$",
            level1_overview_template,
            re.MULTILINE,
        ):
            return fail("reader-facing journey coverage contract section found")
        for heading in [
            "## 2. 二级能力完整性与导航",
            "## 3. 对外业务能力与接口实现",
            "## 4. 业务语义",
            "## 5. 表结构设计",
            "## 6. 缺口与覆盖说明",
            "## 7. 文档完整性校验",
            "## 8. 文档导航与证据索引",
        ]:
            if heading not in level1_overview_template:
                return fail(f"level-1 capability overview missing heading: {heading}")
        for term in [
            "table_design_status={detailed_or_not_applicable}",
            "table_design_coverage={complete_partial_or_not_applicable}",
            "table_design_gap_id={gap_id_or_not_applicable}",
            "### 3.1 {provided_business_capability_name}",
            "#### 3.1.1 业务说明",
            "#### 3.1.2 二级能力与接口实现逻辑",
            "#### 3.1.3 实现步骤",
            "| `journey_id` | `{journey_id}` |",
            "| 参与二级能力 | `{participating_secondary_capability_ids}` |",
            "| `step_id` | `{step_id}` |",
            "| `secondary_capability_id` | `{secondary_capability_id}` |",
            "| `api_id` | `{api_id}` |",
            "| 读写 `table_id` | `{read_write_table_ids_or_not_applicable}` |",
            "| 专业术语 | 定义 | 适用场景与边界 | 易混淆术语及区别 | 关联二级能力 | 权威来源/证据 |",
            "| `table_id` | 物理表名 | 业务实体/用途 | 所属二级能力 | 读写 `api_id` | 证据 |",
            "### 5.2 ER 图",
            "#### 5.2.1 ER 关系证据",
            "### 5.3 `{physical_table_name}`",
            "| `relation_id` | 表关系（主 -> 从） | 关系/基数 | 关联键 | 业务语义 | 证据 |",
            "ER 关系证据：not_applicable（单表，无需跨表关系）",
            "字段小节固定从 `5.3` 开始并按表清单顺序连续编号",
            "小节标题只写表清单中的实际物理表名",
            "表清单 `table_id` 集合必须与第 3 章全部步骤“读写 `table_id`”的非 `not_applicable` 值去重并集严格相等",
            "table_id={table_id}",
            "| 字段 | 类型/可空/默认值 | 键/约束 | 业务语义 | 读写 `api_id` | 证据 |",
            "| 原因 | {no_persistence_reason} |",
            "| 证据 | {exact_repository_evidence} |",
        ]:
            if term not in level1_overview_template:
                return fail(
                    f"level-1 capability overview missing required contract: {term}"
                )
        section3_match = re.search(
            r"^##\s+3\.?\s+对外业务能力与接口实现\s*$([\s\S]*?)(?=^##\s+4\.?\s+)",
            level1_overview_template,
            re.MULTILINE,
        )
        if not section3_match:
            return fail("level-1 Section 3 cannot be isolated")
        section3 = section3_match.group(1)
        ordered_subsections = [
            "#### 3.1.1 业务说明",
            "#### 3.1.2 二级能力与接口实现逻辑",
            "#### 3.1.3 实现步骤",
        ]
        subsection_positions = []
        for subsection in ordered_subsections:
            if section3.count(subsection) != 1:
                return fail(
                    "level-1 example must contain exactly one ordered subsection: "
                    + subsection
                )
            subsection_positions.append(section3.index(subsection))
        if subsection_positions != sorted(subsection_positions):
            return fail("level-1 3.N.1/3.N.2/3.N.3 order is invalid")
        if not re.search(
            r"-->\|\"\{api_id\}: \{method_and_path_or_event_job_command\}\"\|\s*"
            r"secondary_1\[",
            section3,
        ):
            return fail(
                "level-1 Mermaid must use api_id plus complete interface as an edge label"
            )
        if not re.search(
            r"\| 写入/产生数据 \|[^\n]+\|\n"
            r"\| 读写 `table_id` \| `\{read_write_table_ids_or_not_applicable\}` \|\n"
            r"\| 二级能力详情 \|",
            section3,
        ):
            return fail("level-1 implementation step table-id row is misplaced or missing")
        if re.search(
            r"^##\s+\d+\.?\s+(?:用户业务操作全景|跨二级能力用户旅程|共享业务语义与一级治理|文档导航、证据索引与术语表)\s*$",
            level1_overview_template,
            re.MULTILINE,
        ):
            return fail("legacy level-1 reader-facing section found")
        if re.search(
            r"^\|\s*`journey_id`\s*\|\s*用户/角色\s*\|\s*所属二级能力/模块\s*\|",
            level1_overview_template,
            re.MULTILINE,
        ):
            return fail("legacy level-1 fourteen-column panorama table found")
        table_design_section = re.search(
            r"^##\s+5\.?\s+表结构设计\s*$([\s\S]*?)(?=^##\s+6\.?\s+)",
            level1_overview_template,
            re.MULTILINE,
        )
        if not table_design_section:
            return fail("level-1 table-design section cannot be isolated")
        er_diagram = re.search(
            r"```mermaid\s*\nerDiagram\s*\n([\s\S]*?)```",
            table_design_section.group(1),
        )
        if not er_diagram or "{PHYSICAL_TABLE_A}" not in er_diagram.group(1):
            return fail("level-1 ER example must use actual physical-table placeholders")
        if re.search(r"\{table_id\}", er_diagram.group(1), re.IGNORECASE):
            return fail("level-1 ER entities must not use table_id placeholders")
        table_control_lines = [
            line
            for line in table_design_section.group(1).splitlines()
            if re.search(r"\btable_design_status\s*=", line)
            and re.search(r"\btable_design_coverage\s*=", line)
            and re.search(r"\btable_design_gap_id\s*=", line)
        ]
        if len(table_control_lines) != 1:
            return fail("level-1 table-design section must contain one control line")
        ordered_table_design_headings = [
            "### 5.1 表清单",
            "### 5.2 ER 图",
            "#### 5.2.1 ER 关系证据",
            "### 5.3 `{physical_table_name}`",
        ]
        table_design_heading_positions = []
        for heading in ordered_table_design_headings:
            if table_design_section.group(1).count(heading) != 1:
                return fail(
                    "level-1 table-design example must contain exactly one heading: "
                    + heading
                )
            table_design_heading_positions.append(
                table_design_section.group(1).index(heading)
            )
        if table_design_heading_positions != sorted(table_design_heading_positions):
            return fail("level-1 5.1/5.2/5.2.1/5.3 order is invalid")
        if re.search(
            r"^###\s+5\.3\s+ER\s*关系证据\s*$",
            table_design_section.group(1),
            re.MULTILINE,
        ):
            return fail("level-1 ER relationship evidence must be nested at 5.2.1")
        if re.search(
            r"^###\s+5\.3\s+`?\{physical_table_name\}`?\s+字段设计\s*$",
            table_design_section.group(1),
            re.MULTILINE,
        ):
            return fail("level-1 field subsection title must be the physical table name")
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
        if not re.search(
            r"^\| 实体/表 \|[^\n]*"
            r"`table_id=\{parent_table_ids_or_not_applicable\}`[^\n]*"
            r"\{physical_table_names_or_not_applicable\}[^\n]*\|",
            interface_template,
            re.MULTILINE,
        ):
            return fail(
                "grouped interface entity/table row must contain parent table_id or not_applicable"
            )
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
