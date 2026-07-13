# {project_name} · {level1_capability_name} 详细设计说明书

> 文档状态：评审中<br>
> 文档版本：{revision}<br>
> 能力标识：`{level1_capability_id}`<br>
> 上游业务架构：`architecture/business.md`<br>
> 业务清单：`business/inventory.yaml`<br>
> 证据基线：{source_commit}

[返回业务架构](architecture/business.md) · [上一个能力]({previous_capability_document_path}) · [下一个能力]({next_capability_document_path})

本文件是 `{level1_capability_name}` 的设计总览。它完整列出 `business/inventory.yaml` 中该 `level1_capability_id` 下的全部 `secondary_capabilities`，并链接每份二级能力文档；详细业务和代码设计保存在对应二级能力文档中，不在总览重复正文。

## 1. 设计结论

说明本能力承担的业务价值、覆盖范围、关键协作、共享对象、质量目标和主要风险。结论只能来自业务架构、清单、仓库证据或明确的人工作证。

## 2. 文档控制与设计边界

| 字段 | 内容 | 来源 |
| --- | --- | --- |
| `level1_capability_id` | `{level1_capability_id}` | `business/inventory.yaml` |
| `level1_capability_name` | `{level1_capability_name}` | `business/inventory.yaml` |
| 纳入范围 | {included_scope} | {evidence_ref} |
| 排除范围 | {excluded_scope} | {evidence_ref} |
| 上游能力 | {upstream_capability_ids} | {evidence_ref} |
| 下游能力 | {downstream_capability_ids} | {evidence_ref} |

本文件是 `{level1_capability_id}` 唯一的当前总览。历史版本进入 `_archive`；二级能力独立修订和存档，只有边界、共享规则、跨能力契约或导航变化时才修订本文件。

## 3. 二级能力完整性清单

先从 inventory 读取完整 `secondary_capabilities`，再生成本表。不得遗漏任何二级能力。

| 顺序 | `secondary_capability_id` | 二级能力名称 | 对应 business_id | 类型 | 二级能力文档 | 文档状态 | 证据/置信度 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `{secondary_capability_id}` | {secondary_capability_name} | `{business_ids}` | {core_support_governance} | [打开详细设计](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) | review | {evidence_ref} |

完整性规则：

- inventory 中每个二级能力在本表恰好出现一次；
- 每行至少关联一个 `business_id`，多个 `business_ids` 应全部列出；
- 每行必须链接唯一的当前二级能力文档；
- 缺失证据的二级能力仍保留清单行和独立文档并标记，不得删除以制造完整假象；
- Dashboard 以本表和规范路径构建可折叠父子导航。

## 4. 二级能力导航

| 二级能力 | 业务职责摘要 | 主要参与者 | 主流程摘要 | 核心对象/状态 | 系统入口 | 详细设计 |
| --- | --- | --- | --- | --- | --- | --- |
| `{secondary_capability_id}` | {responsibility_summary} | {actors} | {flow_summary} | {objects_and_states} | {entrypoints} | [查看](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) |

本节只帮助读者定位，不复制二级文档中的流程、接口、表结构和测试细节。

## 5. 跨二级能力协作流程

| 协作场景 | 发起二级能力 | 接收二级能力 | 交付物/事件 | 顺序与一致性 | 失败责任 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| {scenario} | `{source_secondary_id}` | `{target_secondary_id}` | {handoff} | {ordering_consistency} | {failure_owner} | {evidence_ref} |

用 Mermaid 表达复杂跨二级流程；具体步骤引用相应二级能力文档。

## 6. 共享对象、规则与状态

| 共享对象/规则 | 权威所有者 | 使用方 | 统一语义 | 冲突优先级 | 证据 |
| --- | --- | --- | --- | --- | --- |
| {shared_object_or_rule} | `{owner_secondary_id}` | {consumer_secondary_ids} | {canonical_semantics} | {conflict_priority} | {evidence_ref} |

## 7. 业务到系统实现映射

| 二级能力 | business_id | 系统/容器 | 入口 | 应用服务 | 数据对象 | 外部依赖 | 测试证据 | 置信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `{secondary_capability_id}` | `{business_id}` | {system} | {entrypoint} | {service} | {data_object} | {dependency} | {test_evidence} | {confidence} |

## 8. 外部能力协作契约

仅记录本能力与其他能力之间的输入、输出、事件、责任和失败语义；对方内部设计只引用其文档。

## 9. 安全、隐私、审计与治理

覆盖跨二级能力的最小权限、敏感信息、租户/组织边界、审核追踪、操作留痕和治理责任。局部控制放入对应二级能力文档。

## 10. 质量、性能与运行度量

| 质量场景 | 触发 | 度量 | 目标/门槛 | 监测来源 | 责任方 | 证据状态 |
| --- | --- | --- | --- | --- | --- | --- |
| {quality_scenario} | {trigger} | {measure} | {target} | {monitoring_source} | {owner} | {evidence_status} |

## 11. 发布、兼容、迁移与回滚

说明二级能力之间的发布顺序、兼容窗口、跨文档数据迁移、灰度门槛、停止条件和回滚责任。

## 12. 验收与追踪矩阵

| 业务目标 | 二级能力 | business_id | 流程/规则 | 系统映射 | 验收条件 | 测试证据 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {goal} | `{secondary_capability_id}` | `{business_id}` | {flow_rule} | {mapping} | {acceptance} | {test_evidence} | {trace_status} |

## 13. 文档完整性校验

- inventory 中该 `level1_capability_id` 只对应一个当前总览路径；
- `secondary_capabilities` 数量等于完整性清单和二级文档数量；
- 每个二级能力 ID、名称、全部 `business_ids` 和文档路径一致；
- 每个二级文档都能返回本总览，并能导航到相邻二级能力；
- 本总览能返回业务架构，并能导航到上一个能力和下一个能力；
- 当前文件状态、revision、metadata、archive 和 `supersedes` 一致。

## 14. 文档导航与后续分解

列出本能力下的需求、功能、API、数据库、测试和部署文档。二级能力详细设计由独立文档维护，功能或需求文档不得替代二级能力文档。

## 15. 证据索引与术语表

按 architecture、inventory、routes、controllers、pages、menus、services、entities、migrations、tests、config 和 docs 分类列出证据，并统一能力、二级能力、`business_id`、流程、对象、状态和规则术语。
