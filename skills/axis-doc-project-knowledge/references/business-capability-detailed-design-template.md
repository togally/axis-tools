# {project_name} · {level1_capability_name} 用户业务操作全景

> 文档状态：评审中<br>
> 文档版本：{revision}<br>
> 能力标识：`{level1_capability_id}`<br>
> 上游业务架构：`architecture/business.md`<br>
> 业务清单：`business/inventory.yaml`<br>
> 证据基线：{source_commit}

> 用户旅程设计完整性：`user_journey_design_status=detailed` · `user_journey_coverage={complete_or_partial}` · `user_journey_gap_id={gap_id_or_not_applicable}`
> 一级能力依赖投影：`dependency_graph_status={pending_level1_completion_or_derived}` · `dependency_graph_revision={not_derived_or_revision}` · `dependency_graph_gap_id={gap_id_or_not_applicable}`

[返回业务架构](architecture/business.md) · [上一个能力]({previous_capability_document_path}) · [下一个能力]({next_capability_document_path})

本文件是 `{level1_capability_name}` 唯一的一级用户业务操作全景。它回答“谁为了什么目标、怎样使用系统、后台主要入口怎样承接、读取或产生什么数据、用户最终看到什么”，并链接对应二级能力详细设计。

一级文档只摘要到 Controller/Handler、Service/UseCase 和读写/产生数据及用户可见结果。字段字典、完整调用链、Mapper/Repository、ER、索引与约束、事务与并发、补偿细节和测试矩阵全部由二级能力文档负责，不得复制到本文件。

## 1. 设计结论与能力边界

说明本能力为哪些用户/角色提供哪些业务价值、覆盖哪些二级能力/模块、与相邻一级能力如何分工，以及证据不足的边界。结论只能来自业务架构、清单、仓库证据或明确的人工作证。上游和下游不得由本文件单独推断，只能从项目级统一模型梳理得到的 canonical 依赖图投影。

| 字段 | 内容 | 来源 |
| --- | --- | --- |
| `level1_capability_id` | `{level1_capability_id}` | `business/inventory.yaml` |
| `level1_capability_name` | `{level1_capability_name}` | `business/inventory.yaml` |
| 纳入范围 | {included_scope} | {evidence_ref} |
| 排除范围 | {excluded_scope} | {evidence_ref} |
| 主要用户/角色 | {actors} | {evidence_ref} |
| 上游能力 | `{direct_upstream_capability_ids_or_not_derived}` | `business/level1-capability-dependency-graph.yaml` |
| 下游能力 | `{direct_downstream_capability_ids_or_not_derived}` | `business/level1-capability-dependency-graph.yaml` |

依赖投影规则：

- 先完成 inventory 中全部一级能力总览和全部所属二级能力接口设计；只要任一一级 `user_journey_coverage=partial` 或任一二级 `interface_coverage=partial`，项目图保持 `pending_level1_completion`，本表上下游都必须写 `not_derived`，不得放入模型猜测或局部候选关系；
- 全部文档完整后，`axis-doc-project-knowledge` 一次性读取完整 inventory、全部当前一级总览和二级追溯，由模型进行项目级统一模型梳理，生成 `business/level1-capability-dependency-graph.yaml`；
- `derived` 状态下，上游能力严格等于 canonical 图中指向本能力的直接入边来源，下游能力严格等于从本能力发出的直接出边目标；没有直接关系时使用 `[]`，祖先、后代和完整路径由 Dashboard 遍历图得到；
- 图允许一个能力具有多个上游，也允许用不同 `stage` 表达分阶段反向关系；因此机器源是有向依赖图，Dashboard 可提供树状视图。禁止把“上一个能力/下一个能力”的文档导航顺序当作业务依赖；
- 禁止局部手工修订某一份总览的上下游。一级能力集合、边界或关系证据变化时，先把图和所有投影退回 pending，再统一派生并批量回填。

本文件的历史版本进入 `_archive`。二级能力独立修订和存档；只有用户业务操作全景、一级边界、共享规则、跨能力协作或导航发生变化时才修订本文件。

## 2. 用户旅程覆盖契约

- `user_journey_design_status` 固定为 `detailed`，不得使用其他值；这表示全景表逐项记录已发现的用户业务操作，而不是只挑选代表接口。
- `user_journey_coverage` 只能是 `complete` 或 `partial`。`complete` 表示该一级能力及其全部二级能力中，经证据扫描识别出的用户业务操作均已进入全景表；此时 `user_journey_gap_id=not_applicable`。
- `partial` 必须填写稳定、非空的 `user_journey_gap_id`，并在“缺口与覆盖说明”及 `gaps/doc-gap-report.md` 中记录尚未列入全景表的操作、已检查范围、影响和补证动作。`partial` 只表示仍有未列旅程，不降低已列旅程的行内证据要求，也不允许某个已声明二级能力完全没有旅程行。
- 页面、按钮或用户动作没有证据时，不得虚构前端入口；应按已证实的 API、事件、任务或命令语义描述，并将页面证据缺失纳入覆盖缺口。
- 后台运营、商户、外部渠道和系统触发方都可以是“用户/角色”，但必须写清真实发起方及其与用户目标的关系。

## 3. 二级能力完整性与导航

先从 inventory 读取完整 `secondary_capabilities`，再生成本表。不得遗漏任何二级能力。

| 顺序 | `secondary_capability_id` | 二级能力名称 | 对应 `business_id` | 提供的业务摘要 | 二级能力文档 | 文档状态 | 证据/置信度 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `{secondary_capability_id}` | {secondary_capability_name} | `{business_ids}` | {business_summary} | [打开详细设计](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) | review | {evidence_ref} |

完整性规则：

- inventory 中每个二级能力在本表恰好出现一次；
- 每行列出全部 `business_ids`，并链接唯一的当前二级能力文档；
- 每个已声明二级能力在“用户业务操作全景”中至少有一条满足严格双锚点要求的旅程行；其余尚未覆盖的操作由 `user_journey_gap_id` 追踪；
- 缺失证据的二级能力仍保留清单行和独立文档并标记，不得删除以制造完整假象；
- Dashboard 以本表和规范路径构建可折叠父子导航。

## 4. 用户业务操作全景

以下表头是一级能力文档的固定核心字段，不得重命名、删减或用一条“代表接口”替代同一模块的其他用户业务操作。`Controller/Handler` 与 `Service/UseCase` 两列的每个单元格都必须是精确的仓库相对 `path:begin-end#symbol` 锚点。

| `journey_id` | 用户/角色 | 所属二级能力/模块 | 提供的业务 | 用户目标 | 用户怎么操作 | 接口/入口 | Controller/Handler | Service/UseCase | 读取数据 | 写入/产生数据 | 用户可见结果 | 二级能力详情 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `{journey_id}` | {actor_or_role} | `{secondary_capability_id}` / {module} | {provided_business} | {user_goal} | {user_operation} | `{method_and_path_or_event_job_command}` | `{controller_or_handler_path_begin_end_symbol}` | `{service_or_use_case_path_begin_end_symbol}` | {read_data_summary} | {written_or_produced_data_summary} | {user_visible_result} | [查看二级能力详细设计](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) | {evidence_ref} |

填表规则：

- 每个可区分的用户业务操作使用一个稳定且唯一的 `journey_id`；创建、修改、审核、支付、取消、退款、查询等不同目标不得合并成一条模糊旅程。
- “提供的业务”说明系统能力，“用户目标”说明期望完成的事情，“用户怎么操作”说明已证实的页面/菜单/按钮或调用动作，三者不得互相替代。
- “接口/入口”填写完整 HTTP 方法与路径、事件主题、任务或命令；没有直接用户入口时，明确业务触发方和触发方式。
- 每条已列旅程的 Controller/Handler 与 Service/UseCase 都必须使用仓库相对 `path:begin-end#symbol` 精确锚点，无论 `user_journey_coverage` 是 `complete` 还是 `partial`，都不得用 `missing_evidence`、`not_applicable`、类名或模块名代替。无法取得两个锚点的候选操作不得写成已覆盖旅程，必须作为未列旅程进入 `user_journey_gap_id`。
- “读取数据”和“写入/产生数据”只摘要业务对象、表、缓存、索引、事件或外部结果，不展开字段、关联、SQL、事务或完整内部调用链。
- “用户可见结果”记录响应、页面状态、业务单号、可观察状态或错误语义；不能只写内部方法返回值。
- “二级能力详情”必须链接所属二级能力的规范路径；内部代码流、持久化细节和测试证据由该二级文档展开。
- 每个一级 `journey_id` 必须在所属二级文档中以同值 `level1_journey_id` 出现，并绑定对应的 `flow_id` 和/或 `api_id`；二级也不得出现一级没有的旅程 ID。一级与二级旅程集合必须双向一致。一级为 `complete` 时，所属二级的 `interface_coverage` 也必须全部为 `complete`。

## 5. 跨二级能力用户旅程

仅当一个用户目标跨越多个二级能力时记录本节。一级文档说明业务接力和用户可见结果，内部编排、事件顺序、事务和补偿引用二级文档。

| 用户目标/场景 | `journey_id` 顺序 | 参与二级能力 | 业务接力摘要 | 最终用户可见结果 | 二级能力详情 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| {user_goal_or_scenario} | `{journey_ids}` | {secondary_capability_ids} | {handoff_summary} | {visible_result} | {secondary_document_links} | {evidence_ref} |

## 6. 共享业务语义与一级治理

| 共享对象/规则/状态 | 权威二级能力 | 使用方 | 一级统一语义 | 用户可见影响 | 二级能力详情 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| {shared_object_rule_or_state} | `{owner_secondary_id}` | {consumer_secondary_ids} | {canonical_semantics} | {visible_impact} | {secondary_document_links} | {evidence_ref} |

只保留跨二级能力必须统一的业务语义、安全/隐私/审计边界、质量目标、发布兼容责任和运行度量摘要。局部规则及其实现细节放入所属二级能力文档。

## 7. 缺口与覆盖说明

| `user_journey_gap_id` | 未覆盖用户业务操作/证据 | 所属二级能力 | 已检查范围 | 对用户全景的影响 | 所需证据/确认 | 责任角色 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{gap_id_or_not_applicable}` | {missing_operation_or_evidence} | `{secondary_capability_id}` | {searched_scope} | {coverage_impact} | {required_evidence_or_decision} | {owner_role} | {gap_status} |

当 `user_journey_coverage=complete` 时，本节明确写 `user_journey_gap_id=not_applicable` 及覆盖基线；不得用 `complete` 隐藏未扫描模块或未解释的入口。

## 8. 文档完整性校验

- `user_journey_design_status=detailed`，且 `user_journey_coverage` 只取 `complete|partial`；`partial` 具有稳定 `user_journey_gap_id`，`complete` 使用 `not_applicable`；
- inventory 中该 `level1_capability_id` 只对应一个当前用户业务操作全景；
- `secondary_capabilities` 数量等于完整性清单和二级文档数量，每个二级能力都至少有一条满足严格双锚点要求的业务操作行；额外未列旅程由明确覆盖缺口追踪；
- 每个已列出的用户业务操作都有唯一 `journey_id`、精确入口、Controller/Handler 与 Service/UseCase 锚点、数据结果、用户可见结果和二级文档链接；行内不得以 `not_applicable` 或 `missing_evidence` 代替精确锚点；
- 一级 `journey_id` 与所属二级 `level1_journey_id` 集合双向一致；每个 ID 绑定至少一个 `flow_id` 或 `api_id` 并展开内部代码、持久化和测试追溯；一级为 `complete` 时所有子文档的接口覆盖也为 `complete`；
- 本文件未复制字段字典、完整调用链、Mapper/Repository 明细、ER、索引/约束、事务/并发或测试矩阵；
- 本总览能返回业务架构，并能导航到上一个能力、下一个能力和每份二级能力详细设计；每个二级文档也能返回本总览并导航到相邻二级能力；
- `dependency_graph_status`、`dependency_graph_revision` 和 `dependency_graph_gap_id` 与项目级图一致；pending 时上下游均为 `not_derived`，derived 时分别精确等于直接入边和直接出边；
- 当前文件状态、revision、metadata、archive 和 `supersedes` 一致。

## 9. 文档导航、证据索引与术语表

- 返回业务架构：`architecture/business.md`；
- 上一个能力：`{previous_capability_document_path}`；
- 下一个能力：`{next_capability_document_path}`；
- 二级能力详细设计：列出本能力全部规范路径；
- 相关需求和功能文档：{related_requirement_and_feature_paths}；
- 证据按 architecture、inventory、routes、controllers、handlers、pages、menus、services、entities、migrations、tests、config 和 docs 分类列出；代码证据使用 `path:begin-end#symbol`；
- 统一 `journey_id`、能力、二级能力、`business_id`、用户/角色、操作、对象、状态和结果术语。
