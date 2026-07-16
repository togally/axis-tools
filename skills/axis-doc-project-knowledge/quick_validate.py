#!/usr/bin/env python3
"""Local quick validation for Axis v0.2 project-knowledge skills."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


REQUIRED_TERMS = {
    "axis-doc-project-knowledge": [
        "When to Use",
        "Do Not Use",
        "Inputs",
        "Outputs",
        "Safety and Boundaries",
        "Three-Step Work Contract",
        "Light Adversarial Review",
        "bootstrap",
        "scan_and_reconcile",
        "level1_capability_id",
        "business_id",
        "business_inventory",
        "project_technical_architecture",
        "project_business_architecture",
        "level-1 dependency graph",
        "secondary_granularity_gate",
        "one independently reviewable business outcome",
    "reader_profile=compact",
    "secondary_reader_contract=participant_flow_interface_v1",
        "strict_full",
        "does **not** require `3.N`",
        "typed participants (`业务角色`, `外部系统`, `内部业务能力`, or `自动任务`), business responsibilities, participating steps, permission/data scope",
        "atomic business-step flow",
        "one independent `5.N` summary per real contract",
        "access `api_id` set exactly equals",
        "FileName:begin-end#symbol",
        "secondary-capability-boundary-matrix-v3.1.md",
        "$axis-tools-prompt-create",
        "domain bundle retains its public-safe gold cases",
        "secondary-capability-detailed-design-output-schema.json",
        "secondary-capability-detailed-design-prompt-baseline.md",
        "secondary-capability-detailed-design-prompt-selection.json",
        "artifact hashes, diagnostic matrix, frozen holdout",
        "OSS Upload Confirmation Gate",
        "oss_upload_readiness=unavailable|ready",
        "oss_upload_decision=pending|approved|declined",
        "axis validate-config --repo <repo>",
        "axis oss-publish --run-id <run_id> --dry-run",
        "exact `run_id`, `target_prefix`",
        "End the turn and wait",
        "$axis-ops-oss-publish",
        "Checks",
        "After Use Deposition",
    ],
}

GROUPED_INTERFACE_TEMPLATE_TERMS = [
    "## 1. 能力定位与边界",
    "secondary_reader_contract=participant_flow_interface_v1",
    "## 2. 参与者、职责与权限",
    "| 参与者 | 参与类型 | 业务职责 | 参与步骤 | 权限与数据范围 |",
    "| 主体/角色 | 所需权限/策略 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |",
    "actor × api",
    "## 3. 能力流程",
    "| 步骤 | 参与者 | 业务动作 | 前置状态/条件 | 结果/下一状态与下一步 | 失败/补偿 |",
    "axis-flow-step-machine-table",
    "| 步骤 | 参与者 | `api_id` | 契约关系 | 证据 |",
    "Mermaid 可选",
    "### 5.1 `{method_and_path_or_event_topic_job_command}`",
    "| 接口/触发 | `{method_and_path_or_event_topic_job_command}` |",
    "| 业务目的 | {business_purpose} |",
    "| 调用方/参与者 | {caller_or_participant} |",
    "| 前置条件/权限 | {business_precondition_and_permission} |",
    "| 关键输入 | {business_relevant_input_summary_or_not_applicable} |",
    "| 业务结果/状态变化 | {business_result_or_state_change} |",
    "| 失败/拒绝条件 | {business_failure_or_rejection_condition} |",
    "| 对应流程步骤 | `{flow_step_ids_directly_mapped_to_this_contract}` |",
    "| 实现定位 |",
    "必须且只能拥有一个连续编号的 5.N 独立摘要",
    "access matrix 的 `api_id` 集合必须与本章隐藏 interface machine table 的 `api_id` 集合完全一致",
    "#### 5.1.1 接口清单与代码追溯",
    "| 项目 | 内容 |",
    "| 实现层 | 精确定位 | 职责 |",
    "#### 5.1.2 内部处理逻辑",
    "处理说明：{concrete_internal_processing_summary}",
    "| 步骤 | 方法 | 业务作用 | 数据/状态变化 | 失败处理 |",
    "实际输出必须替换所有花括号内容",
    "#### 5.1.3 请求字段",
    "| 字段 | 位置 | 类型/必填 | 约束/枚举 | 业务语义/敏感处理 | 证据/状态 |",
    "#### 5.1.4 响应字段",
    "| HTTP/消息/执行状态 | 字段 | 类型/可空 | 业务语义/产生位置 | 证据/状态 |",
    "#### 5.1.5 错误码与异常映射",
    "#### 5.1.6 认证与授权执行",
    "#### 5.1.7 事务、并发、性能与容错",
    "#### 5.1.8 安全、测试与验收",
    "### 5.2 `{next_method_and_path_or_event_topic_job_command}`",
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
    "<!-- axis-document-metadata",
    "<!-- axis-evidence:",
    "业务相关字段",
    "文件名:起始行-结束行#符号",
    "同一张图只选择一种视角：业务或方法",
    "每个方法节点只写一个具体方法调用",
    "axis-implementation-machine-table",
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

DETAILED_DESIGN_CANDIDATE_PROMPT_FILES = {
    "detailed-design-baseline-v1": (
        "secondary-capability-detailed-design-prompt-baseline.md"
    ),
    "detailed-design-closure-first-v1": (
        "secondary-capability-detailed-design-prompt-closure-first.md"
    ),
}


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 1


def is_finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value == value
        and value not in {float("inf"), float("-inf")}
    )


def is_non_negative_integer(value: object) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value >= 0
    )


def numbers_match(left: object, right: object) -> bool:
    return (
        is_finite_number(left)
        and is_finite_number(right)
        and abs(left - right) <= 1e-12
    )


def detailed_design_result_cells_summary(
    result: dict,
    models: list,
    cases: list[dict],
    repeats: int,
    label: str,
) -> tuple[str | None, dict | None]:
    expected_cells: dict[tuple[str, str], int] = {}
    source_case_counts: dict[str, int] = {}
    for case in cases:
        source_kind = case["source_kind"]
        source_case_counts[source_kind] = source_case_counts.get(source_kind, 0) + 1
    for model in models:
        for source_kind, case_count in source_case_counts.items():
            expected_cells[(model["model_id"], source_kind)] = case_count * repeats

    cells = result.get("cells")
    if not isinstance(cells, list):
        return f"{label} exact model-by-source cells must be an array", None
    observed_cells: set[tuple[str, str]] = set()
    weighted_score_sum = 0.0
    observation_count = 0
    hard_fail_count = 0
    cell_means: list[float] = []
    for cell in cells:
        if not isinstance(cell, dict):
            return f"{label} contains an invalid exact model-by-source cell", None
        model_id = cell.get("model_id")
        source_kind = cell.get("source_kind")
        if not isinstance(model_id, str) or not isinstance(source_kind, str):
            return f"{label} cell model_id/source_kind is invalid", None
        key = (model_id, source_kind)
        if key not in expected_cells:
            return f"{label} contains an unexpected exact model-by-source cell", None
        if key in observed_cells:
            return f"{label} contains a duplicate exact model-by-source cell", None
        observed_cells.add(key)
        expected_observation_count = expected_cells[key]
        cell_observation_count = cell.get("observation_count")
        if (
            not is_non_negative_integer(cell_observation_count)
            or cell_observation_count != expected_observation_count
        ):
            return f"{label} cell observation_count is inconsistent", None
        cell_hard_fail_count = cell.get("hard_fail_count")
        if (
            not isinstance(cell_hard_fail_count, int)
            or isinstance(cell_hard_fail_count, bool)
            or cell_hard_fail_count < 0
            or cell_hard_fail_count > cell_observation_count
        ):
            return f"{label} cell hard_fail_count is invalid", None
        cell_mean = cell.get("mean_score")
        if not is_finite_number(cell_mean) or cell_mean < 0 or cell_mean > 1:
            return f"{label} cell mean_score is invalid", None
        observation_count += cell_observation_count
        hard_fail_count += cell_hard_fail_count
        weighted_score_sum += cell_mean * cell_observation_count
        cell_means.append(cell_mean)
    if observed_cells != set(expected_cells):
        return f"{label} exact model-by-source matrix is incomplete", None

    return None, {
        "observation_count": observation_count,
        "hard_fail_count": hard_fail_count,
        "worst_cell_mean": min(cell_means),
        "overall_mean": weighted_score_sum / observation_count,
        "cell_spread": max(cell_means) - min(cell_means),
    }


def detailed_design_prompt_selection_error(
    selection: object,
    eval_cases_document: object,
    skill_dir: Path,
) -> str | None:
    """Recompute the frozen prompt result from versioned aggregate evidence."""

    if not isinstance(selection, dict):
        return "detailed-design prompt selection must be an object"
    if not isinstance(eval_cases_document, dict):
        return "detailed-design evaluation cases must be an object"

    models = selection.get("models")
    if not isinstance(models, list) or not models:
        return "detailed-design model matrix must be a non-empty array"
    model_ids: set[str] = set()
    for model in models:
        if not isinstance(model, dict):
            return "detailed-design model matrix contains an invalid row"
        model_id = model.get("model_id")
        model_tier = model.get("model_tier")
        if not isinstance(model_id, str) or not model_id:
            return "detailed-design model matrix contains an invalid model_id"
        if not isinstance(model_tier, str) or not model_tier:
            return "detailed-design model matrix contains an invalid model_tier"
        if model_id in model_ids:
            return "detailed-design model matrix contains a duplicate model_id"
        model_ids.add(model_id)

    cases = eval_cases_document.get("cases")
    if not isinstance(cases, list) or not cases:
        return "detailed-design evaluation cases must be a non-empty array"
    cases_by_id: dict[str, dict] = {}
    for case in cases:
        if not isinstance(case, dict):
            return "detailed-design evaluation cases contain an invalid row"
        case_id = case.get("case_id")
        source_kind = case.get("source_kind")
        stage = case.get("evaluation_stage")
        if not isinstance(case_id, str) or not case_id:
            return "detailed-design evaluation case has an invalid case_id"
        if case_id in cases_by_id:
            return "detailed-design evaluation cases contain a duplicate case_id"
        if not isinstance(source_kind, str) or not source_kind:
            return f"detailed-design evaluation case {case_id} has an invalid source_kind"
        if stage not in {"diagnostic", "final_holdout"}:
            return f"detailed-design evaluation case {case_id} has an invalid stage"
        cases_by_id[case_id] = case

    thresholds = selection.get("thresholds")
    if not isinstance(thresholds, dict):
        return "detailed-design thresholds must be an object"
    if set(thresholds) != {
        "max_hard_fail_count",
        "min_worst_cell_mean",
        "min_overall_mean",
    }:
        return "detailed-design threshold fields drifted"
    max_hard_fail_count = thresholds.get("max_hard_fail_count")
    if (
        not isinstance(max_hard_fail_count, int)
        or isinstance(max_hard_fail_count, bool)
        or max_hard_fail_count < 0
    ):
        return "detailed-design max_hard_fail_count must be a non-negative integer"
    for field in ["min_worst_cell_mean", "min_overall_mean"]:
        value = thresholds.get(field)
        if not is_finite_number(value) or value < 0 or value > 1:
            return f"detailed-design {field} must be between 0 and 1"

    diagnostic = selection.get("diagnostic")
    if not isinstance(diagnostic, dict):
        return "detailed-design diagnostic result must be an object"
    diagnostic_case_ids = diagnostic.get("case_ids")
    if not isinstance(diagnostic_case_ids, list) or any(
        not isinstance(case_id, str) for case_id in diagnostic_case_ids
    ):
        return "detailed-design diagnostic case_ids must be an array of strings"
    expected_diagnostic_case_ids = {
        case_id
        for case_id, case in cases_by_id.items()
        if case.get("evaluation_stage") == "diagnostic"
    }
    if (
        len(diagnostic_case_ids) != len(set(diagnostic_case_ids))
        or set(diagnostic_case_ids) != expected_diagnostic_case_ids
    ):
        return "detailed-design diagnostic case set drifted"
    diagnostic_cases = [cases_by_id[case_id] for case_id in diagnostic_case_ids]
    diagnostic_source_kind_count = len(
        {case["source_kind"] for case in diagnostic_cases}
    )
    if (
        not is_non_negative_integer(diagnostic.get("source_kind_count"))
        or diagnostic.get("source_kind_count") != diagnostic_source_kind_count
    ):
        return "detailed-design diagnostic source_kind_count is inconsistent"

    diagnostic_repeats = diagnostic.get("repeats")
    if (
        not isinstance(diagnostic_repeats, int)
        or isinstance(diagnostic_repeats, bool)
        or diagnostic_repeats < 1
    ):
        return "detailed-design diagnostic repeats must be a positive integer"
    candidate_results = diagnostic.get("candidate_results")
    if not isinstance(candidate_results, dict) or not candidate_results:
        return "detailed-design diagnostic candidate_results must be a non-empty object"
    if set(candidate_results) != set(DETAILED_DESIGN_CANDIDATE_PROMPT_FILES):
        return "detailed-design diagnostic candidate set drifted"
    if (
        not is_non_negative_integer(diagnostic.get("candidate_count"))
        or diagnostic.get("candidate_count") != len(candidate_results)
    ):
        return "detailed-design diagnostic candidate_count is inconsistent"

    planned_per_candidate = (
        len(models) * len(diagnostic_case_ids) * diagnostic_repeats
    )
    planned_diagnostic_observations = (
        planned_per_candidate * len(candidate_results)
    )
    if (
        not is_non_negative_integer(diagnostic.get("planned_observation_count"))
        or diagnostic.get("planned_observation_count")
        != planned_diagnostic_observations
    ):
        return "detailed-design diagnostic planned_observation_count is inconsistent"

    references_dir = skill_dir / "references"
    ranked_candidates: list[tuple[tuple, str, dict, bool]] = []
    completed_diagnostic_observations = 0
    diagnostic_hard_fail_count = 0
    for prompt_id, result in candidate_results.items():
        if not isinstance(result, dict):
            return f"detailed-design candidate result is invalid: {prompt_id}"
        cells_error, cells_summary = detailed_design_result_cells_summary(
            result,
            models,
            diagnostic_cases,
            diagnostic_repeats,
            f"detailed-design candidate {prompt_id}",
        )
        if cells_error:
            return cells_error
        observation_count = result.get("observation_count")
        if (
            not is_non_negative_integer(observation_count)
            or observation_count != planned_per_candidate
            or observation_count != cells_summary["observation_count"]
        ):
            return (
                "detailed-design candidate observation_count is inconsistent: "
                + prompt_id
            )
        hard_fail_count = result.get("hard_fail_count")
        if (
            not isinstance(hard_fail_count, int)
            or isinstance(hard_fail_count, bool)
            or hard_fail_count < 0
            or hard_fail_count > observation_count
        ):
            return f"detailed-design candidate hard_fail_count is invalid: {prompt_id}"
        if hard_fail_count != cells_summary["hard_fail_count"]:
            return (
                "detailed-design candidate hard_fail_count is inconsistent with "
                f"exact model-by-source cells: {prompt_id}"
            )
        completed_diagnostic_observations += observation_count
        diagnostic_hard_fail_count += hard_fail_count

        for field in ["worst_cell_mean", "overall_mean", "cell_spread"]:
            value = result.get(field)
            if not is_finite_number(value) or value < 0 or value > 1:
                return f"detailed-design candidate {field} is invalid: {prompt_id}"
            if not numbers_match(value, cells_summary[field]):
                return (
                    f"detailed-design candidate {field} is inconsistent with "
                    f"exact model-by-source cells: {prompt_id}"
                )
        prompt_length = result.get("prompt_length")
        if (
            not isinstance(prompt_length, int)
            or isinstance(prompt_length, bool)
            or prompt_length < 0
        ):
            return f"detailed-design candidate prompt_length is invalid: {prompt_id}"
        prompt_path = references_dir / DETAILED_DESIGN_CANDIDATE_PROMPT_FILES[prompt_id]
        if not prompt_path.exists():
            return f"detailed-design candidate prompt not found: {prompt_id}"
        actual_prompt_length = len(prompt_path.read_text(encoding="utf-8"))
        if prompt_length != actual_prompt_length:
            return f"detailed-design candidate prompt_length drifted: {prompt_id}"
        estimated_cost = result.get("estimated_cost")
        if estimated_cost is not None and (
            not is_finite_number(estimated_cost) or estimated_cost < 0
        ):
            return f"detailed-design candidate estimated_cost is invalid: {prompt_id}"

        passes_thresholds = (
            hard_fail_count <= max_hard_fail_count
            and result["worst_cell_mean"] >= thresholds["min_worst_cell_mean"]
            and result["overall_mean"] >= thresholds["min_overall_mean"]
        )
        rank_key = (
            hard_fail_count,
            -result["worst_cell_mean"],
            -result["overall_mean"],
            result["cell_spread"],
            prompt_length,
            float("inf") if estimated_cost is None else estimated_cost,
            prompt_id,
        )
        ranked_candidates.append((rank_key, prompt_id, result, passes_thresholds))

    if (
        not is_non_negative_integer(diagnostic.get("completed_observation_count"))
        or diagnostic.get("completed_observation_count")
        != completed_diagnostic_observations
    ):
        return "detailed-design diagnostic completed_observation_count is inconsistent"
    if (
        not is_non_negative_integer(diagnostic.get("hard_fail_count"))
        or diagnostic.get("hard_fail_count") != diagnostic_hard_fail_count
    ):
        return "detailed-design diagnostic hard_fail_count is inconsistent"

    ranked_candidates.sort(key=lambda item: item[0])
    recomputed_winner = next(
        (prompt_id for _, prompt_id, _, passes in ranked_candidates if passes),
        None,
    )
    if selection.get("selected_prompt_id") != recomputed_winner:
        return "detailed-design selected prompt does not match recomputed winner"
    if recomputed_winner is None:
        return "detailed-design prompt selection has no candidate passing thresholds"
    expected_selected_path = DETAILED_DESIGN_CANDIDATE_PROMPT_FILES[recomputed_winner]
    if selection.get("selected_prompt_path") != expected_selected_path:
        return "detailed-design selected prompt path does not match recomputed winner"

    holdout = selection.get("final_holdout")
    if not isinstance(holdout, dict):
        return "detailed-design frozen holdout must be an object"
    if holdout.get("opened_after_selection") is not True:
        return "detailed-design frozen holdout was not opened after selection"
    if holdout.get("candidate_id") != recomputed_winner:
        return "detailed-design frozen holdout candidate does not match winner"
    holdout_case_ids = holdout.get("case_ids")
    if not isinstance(holdout_case_ids, list) or any(
        not isinstance(case_id, str) for case_id in holdout_case_ids
    ):
        return "detailed-design holdout case_ids must be an array of strings"
    expected_holdout_case_ids = {
        case_id
        for case_id, case in cases_by_id.items()
        if case.get("evaluation_stage") == "final_holdout"
    }
    if (
        len(holdout_case_ids) != len(set(holdout_case_ids))
        or set(holdout_case_ids) != expected_holdout_case_ids
    ):
        return "detailed-design holdout case set drifted"
    holdout_cases = [cases_by_id[case_id] for case_id in holdout_case_ids]
    holdout_source_kind_count = len({case["source_kind"] for case in holdout_cases})
    if (
        not is_non_negative_integer(holdout.get("source_kind_count"))
        or holdout.get("source_kind_count") != holdout_source_kind_count
    ):
        return "detailed-design holdout source_kind_count is inconsistent"

    holdout_repeats = holdout.get("repeats")
    if (
        not isinstance(holdout_repeats, int)
        or isinstance(holdout_repeats, bool)
        or holdout_repeats < 1
    ):
        return "detailed-design holdout repeats must be a positive integer"
    planned_holdout_observations = len(models) * len(holdout_case_ids) * holdout_repeats
    if (
        not is_non_negative_integer(holdout.get("planned_observation_count"))
        or holdout.get("planned_observation_count") != planned_holdout_observations
    ):
        return "detailed-design holdout planned_observation_count is inconsistent"
    holdout_cells_error, holdout_cells_summary = detailed_design_result_cells_summary(
        holdout,
        models,
        holdout_cases,
        holdout_repeats,
        "detailed-design holdout",
    )
    if holdout_cells_error:
        return holdout_cells_error
    if (
        not is_non_negative_integer(holdout.get("completed_observation_count"))
        or holdout.get("completed_observation_count")
        != planned_holdout_observations
        or holdout.get("completed_observation_count")
        != holdout_cells_summary["observation_count"]
    ):
        return "detailed-design holdout completed_observation_count is inconsistent"
    holdout_hard_fail_count = holdout.get("hard_fail_count")
    if (
        not isinstance(holdout_hard_fail_count, int)
        or isinstance(holdout_hard_fail_count, bool)
        or holdout_hard_fail_count < 0
        or holdout_hard_fail_count > planned_holdout_observations
    ):
        return "detailed-design holdout hard_fail_count is invalid"
    if holdout_hard_fail_count != holdout_cells_summary["hard_fail_count"]:
        return (
            "detailed-design holdout hard_fail_count is inconsistent with "
            "exact model-by-source cells"
        )
    for field in ["worst_cell_mean", "overall_mean", "cell_spread"]:
        value = holdout.get(field)
        if not is_finite_number(value) or value < 0 or value > 1:
            return f"detailed-design holdout {field} is invalid"
        if not numbers_match(value, holdout_cells_summary[field]):
            return (
                f"detailed-design holdout {field} is inconsistent with "
                "exact model-by-source cells"
            )
    holdout_passes = (
        holdout_hard_fail_count <= max_hard_fail_count
        and holdout["worst_cell_mean"] >= thresholds["min_worst_cell_mean"]
        and holdout["overall_mean"] >= thresholds["min_overall_mean"]
    )
    expected_holdout_status = "pass" if holdout_passes else "fail"
    if holdout.get("status") != expected_holdout_status:
        return "detailed-design frozen holdout status is inconsistent"
    if not holdout_passes:
        return "detailed-design frozen holdout is not passing"

    return None


def has_cjk(text: str) -> bool:
    return re.search(r"[\u3400-\u9fff]", text) is not None


def html_comment_structure_error(text: str) -> str | None:
    in_comment = False
    for token in re.finditer(r"<!--|-->", text):
        if token.group(0) == "<!--":
            if in_comment:
                return "nested HTML comments found"
            in_comment = True
        else:
            if not in_comment:
                return "unmatched HTML comment close found"
            in_comment = False
    if in_comment:
        return "unclosed HTML comment found"
    return None


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

    if skill_name == "axis-doc-project-knowledge":
        if re.search(r"(?m)^\s*\|\s*`requirement_design`\s*\|", skill_md):
            return fail("retired requirement_design mode must not return")
        if re.search(r"(?m)^##\s+requirement_design\s*$", skill_md):
            return fail("retired requirement_design section must not return")
        if "archive them through `$axis-doc-development`" in skill_md:
            return fail("project knowledge must not call development for archival")
        for reference in [
            skill_dir / "references" / "project-knowledge-contracts.md",
            skill_dir
            / "references"
            / "secondary-capability-boundary-matrix-v3.1.md",
        ]:
            if not reference.exists():
                return fail(f"required reference not found: {reference.name}")

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
        candidate_manifest_path = (
            skill_dir
            / "references"
            / "secondary-capability-prompt-candidates.json"
        )
        eval_cases_path = (
            skill_dir / "references" / "secondary-capability-eval-cases.json"
        )
        evaluator_path = (
            skill_dir / "scripts" / "evaluate_secondary_capability_prompts.mjs"
        )
        detailed_design_eval_cases_path = (
            skill_dir
            / "references"
            / "secondary-capability-detailed-design-eval-cases.json"
        )
        detailed_design_scorer_path = (
            skill_dir
            / "scripts"
            / "score_secondary_capability_detailed_design.mjs"
        )
        detailed_design_output_schema_path = (
            skill_dir
            / "references"
            / "secondary-capability-detailed-design-output-schema.json"
        )
        detailed_design_selection_path = (
            skill_dir
            / "references"
            / "secondary-capability-detailed-design-prompt-selection.json"
        )
        for required_path, label in [
            (candidate_manifest_path, "granularity prompt candidate manifest"),
            (eval_cases_path, "granularity prompt evaluation cases"),
            (evaluator_path, "granularity prompt evaluator"),
            (detailed_design_eval_cases_path, "detailed-design evaluation cases"),
            (detailed_design_scorer_path, "detailed-design scorer"),
            (detailed_design_output_schema_path, "detailed-design output schema"),
            (detailed_design_selection_path, "detailed-design prompt selection"),
        ]:
            if not required_path.exists():
                return fail(f"{label} not found")
        try:
            candidate_manifest = json.loads(
                candidate_manifest_path.read_text(encoding="utf-8")
            )
            eval_cases = json.loads(eval_cases_path.read_text(encoding="utf-8"))
            detailed_design_eval_cases = json.loads(
                detailed_design_eval_cases_path.read_text(encoding="utf-8")
            )
            detailed_design_output_schema = json.loads(
                detailed_design_output_schema_path.read_text(encoding="utf-8")
            )
            detailed_design_selection = json.loads(
                detailed_design_selection_path.read_text(encoding="utf-8")
            )
        except json.JSONDecodeError as exc:
            return fail(f"granularity evaluation JSON is invalid: {exc}")
        if detailed_design_eval_cases.get("schema_version") != 1:
            return fail("detailed-design evaluation schema_version must be 1")
        detailed_design_cases = detailed_design_eval_cases.get("cases", [])
        if len(detailed_design_cases) < 3:
            return fail("detailed-design evaluation requires at least 3 public-safe cases")
        if len({case.get("source_kind") for case in detailed_design_cases}) < 3:
            return fail("detailed-design evaluation requires at least 3 source kinds")
        if detailed_design_output_schema.get("type") != "object":
            return fail("detailed-design output schema root type must be object")
        if set(detailed_design_output_schema.get("required", [])) != {
            "case_id",
            "secondary_capability_id",
            "participants",
            "flows",
            "interfaces",
        }:
            return fail("detailed-design output schema required fields drifted")

        selected_detailed_prompt_path = detailed_design_selection.get(
            "selected_prompt_path"
        )
        if not isinstance(selected_detailed_prompt_path, str):
            return fail("selected detailed-design prompt path is invalid")
        detailed_references_dir = (skill_dir / "references").resolve()
        selected_detailed_prompt_file = (
            detailed_references_dir / selected_detailed_prompt_path
        ).resolve()
        if detailed_references_dir not in selected_detailed_prompt_file.parents:
            return fail("selected detailed-design prompt escapes references directory")
        if not selected_detailed_prompt_file.exists():
            return fail("selected detailed-design prompt not found")

        frozen_artifacts = detailed_design_selection.get("frozen_artifacts", {})
        expected_artifacts = {
            "cases_sha256": detailed_design_eval_cases_path,
            "output_schema_sha256": detailed_design_output_schema_path,
            "scorer_sha256": detailed_design_scorer_path,
        }
        for hash_field, artifact_path in expected_artifacts.items():
            actual_hash = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
            if frozen_artifacts.get(hash_field) != actual_hash:
                return fail(f"detailed-design frozen hash mismatch: {hash_field}")
        candidate_hashes = frozen_artifacts.get("candidate_prompt_sha256", {})
        candidate_prompt_paths = {
            prompt_id: detailed_references_dir / prompt_file
            for prompt_id, prompt_file in DETAILED_DESIGN_CANDIDATE_PROMPT_FILES.items()
        }
        for prompt_id, prompt_path in candidate_prompt_paths.items():
            if not prompt_path.exists():
                return fail(f"detailed-design candidate prompt not found: {prompt_id}")
            actual_hash = hashlib.sha256(prompt_path.read_bytes()).hexdigest()
            if candidate_hashes.get(prompt_id) != actual_hash:
                return fail(f"detailed-design candidate hash mismatch: {prompt_id}")

        model_pairs = {
            (model.get("model_id"), model.get("model_tier"))
            for model in detailed_design_selection.get("models", [])
        }
        if len(detailed_design_selection.get("models", [])) != 3 or model_pairs != {
            ("gpt-5.4-mini", "small"),
            ("gpt-5.6-terra", "standard"),
            ("gpt-5.6-sol", "strong"),
        }:
            return fail("detailed-design exact model-tier matrix drifted")
        settings = detailed_design_selection.get("inference_settings", {})
        if (
            settings.get("reasoning_effort") != "low"
            or settings.get("output") != "strict_json_schema"
        ):
            return fail("detailed-design inference settings drifted")
        selection_error = detailed_design_prompt_selection_error(
            detailed_design_selection,
            detailed_design_eval_cases,
            skill_dir,
        )
        if selection_error:
            return fail(selection_error)
        selected_prompt_id = candidate_manifest.get("selected_prompt_id")
        if selected_prompt_id != "boundary_matrix_v3_1":
            return fail("selected granularity prompt id must be boundary_matrix_v3_1")
        candidates = candidate_manifest.get("candidates", [])
        selected_candidate = next(
            (
                candidate
                for candidate in candidates
                if candidate.get("prompt_id") == selected_prompt_id
            ),
            None,
        )
        if not selected_candidate or not selected_candidate.get("prompt_file"):
            return fail("selected granularity prompt manifest entry is missing")
        references_dir = (skill_dir / "references").resolve()
        selected_prompt_path = (
            references_dir / selected_candidate["prompt_file"]
        ).resolve()
        if references_dir not in selected_prompt_path.parents:
            return fail("selected granularity prompt escapes references directory")
        if not selected_prompt_path.exists():
            return fail("selected granularity prompt not found")
        selected_prompt = selected_prompt_path.read_text(encoding="utf-8")
        for term in [
            "Atomic evidence census",
            "must_split",
            "must_merge",
            "exactly once",
            "one acceptance sentence",
            "independent reverse audit",
        ]:
            if term not in selected_prompt:
                return fail(f"selected granularity prompt missing: {term}")
        if len(candidates) < 6:
            return fail("granularity prompt evaluation requires six candidates")
        cases = eval_cases.get("cases", [])
        if len(cases) < 12:
            return fail("granularity prompt evaluation requires twelve cases")
        if len([case for case in cases if case.get("evaluation_stage") == "sealed"]) < 3:
            return fail("granularity prompt evaluation requires three sealed cases")
        if len(
            [case for case in cases if case.get("evaluation_stage") == "final_holdout"]
        ) < 3:
            return fail("granularity prompt evaluation requires three final holdout cases")

        level1_overview_template_path = (
            skill_dir / "references" / "business-capability-detailed-design-template.md"
        )
        if not level1_overview_template_path.exists():
            return fail("level-1 capability overview template not found")
        level1_overview_template = level1_overview_template_path.read_text(
            encoding="utf-8"
        )
        comment_error = html_comment_structure_error(level1_overview_template)
        if comment_error:
            return fail(f"level-1 capability overview {comment_error}")
        for term in [
            "<!-- axis-document-metadata",
            "<!-- axis-evidence:",
            "| 二级能力 | 业务摘要 | 详情 |",
            "每个节点只能表达一个最小业务动作、业务判断、业务状态或用户可见结果",
            "同一张图不得混用业务节点与代码方法节点",
        ]:
            if term not in level1_overview_template:
                return fail(f"level-1 reader contract missing: {term}")
        if re.search(r"^>\s*文档(?:状态|版本)：", level1_overview_template, re.MULTILINE):
            return fail("level-1 authoring metadata is reader-visible")
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
            "<!-- axis-evidence: {exact_repository_evidence} -->",
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
            r"(?:-->|==>)\|\"\{api_id\}: \{method_and_path_or_event_job_command\}\"\|\s*"
            r"secondary_1_\{secondary_capability_id\}\[",
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
            for line in level1_overview_template.splitlines()
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
        comment_error = html_comment_structure_error(interface_template)
        if comment_error:
            return fail(f"secondary capability detailed-design template {comment_error}")
        for term in GROUPED_INTERFACE_TEMPLATE_TERMS:
            if term not in interface_template:
                return fail(f"grouped interface template missing required term: {term}")
        if interface_template.count(
            "| 参与者 | 参与类型 | 业务职责 | 参与步骤 | 权限与数据范围 |"
        ) != 1:
            return fail("compact participant table must use the five-field reader schema")
        if interface_template.count(
            "| 步骤 | 参与者 | 业务动作 | 前置状态/条件 | 结果/下一状态与下一步 | 失败/补偿 |"
        ) != 1:
            return fail("compact capability flow must use the atomic six-field step schema")
        if interface_template.count("<!-- axis-flow-step-machine-table") != 1:
            return fail("compact capability flow must contain one flow-step machine table")
        compact_interface_match = re.search(
            r"^###\s+5\.1\s+`\{method_and_path_or_event_topic_job_command\}`\s*$"
            r"([\s\S]*?)(?=^<!--\s+axis-evidence:)",
            interface_template,
            re.MULTILINE,
        )
        if not compact_interface_match:
            return fail("compact independent interface summary cannot be isolated")
        compact_interface = compact_interface_match.group(1)
        compact_interface_fields = [
            "接口/触发",
            "业务目的",
            "调用方/参与者",
            "前置条件/权限",
            "关键输入",
            "业务结果/状态变化",
            "失败/拒绝条件",
            "对应流程步骤",
            "实现定位",
        ]
        compact_interface_positions = [
            compact_interface.find(f"| {field} |")
            for field in compact_interface_fields
        ]
        if any(position < 0 for position in compact_interface_positions) or (
            compact_interface_positions != sorted(compact_interface_positions)
        ):
            return fail("compact independent interface summary fields are missing or out of order")
        for forbidden_field in ["入口", "核心业务输入", "数据影响", "验收"]:
            if re.search(
                rf"^\|\s*{re.escape(forbidden_field)}\s*\|",
                compact_interface,
                re.MULTILINE,
            ):
                return fail(
                    "compact independent interface summary contains a retired reader field: "
                    + forbidden_field
                )
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
        if re.search(r"^>\s*文档(?:状态|版本)：", interface_template, re.MULTILINE):
            return fail("secondary authoring metadata is reader-visible")
        if re.search(r"^##\s+\d+\.?\s+代码对象与关系\s*$", interface_template, re.MULTILINE):
            return fail("secondary template repeats a top-level code-object chapter")
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
