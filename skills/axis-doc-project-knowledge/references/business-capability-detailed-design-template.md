# {project_name} · {level1_capability_name} 一级能力接口详情设计

<!-- axis-template-use
默认生成 reader_profile=compact，只展示下面 1-6 六个读者章节。实际输出必须替换所有花括号内容，删除不适用的示例行与未采用的图；不得把模板变量、示例证据或机器校验说明留成读者正文。
如因完整证据和明确审计需求生成 full 版本，必须把 metadata 改为 reader_profile=strict_full；不得让 compact 标识与完整展开正文并存。两种新 profile 都遵守图的原子单元规则。
-->

<!-- axis-document-metadata
reader_profile=compact
document_status=review
revision={revision}
level1_capability_id={level1_capability_id}
business_architecture=architecture/business.md
business_inventory=business/inventory.yaml
source_commit={source_commit}
user_journey_design_status=detailed user_journey_coverage={complete_or_partial} user_journey_gap_id={gap_id_or_not_applicable}
user_journey_coverage_allowed=complete|partial
table_design_status={detailed_or_not_applicable} table_design_coverage={complete_partial_or_not_applicable} table_design_gap_id={gap_id_or_not_applicable}
dependency_graph_status={pending_level1_completion_or_derived} dependency_graph_revision={not_derived_or_revision} dependency_graph_gap_id={gap_id_or_not_applicable}
-->

[返回业务架构](architecture/business.md) · [上一个能力]({previous_capability_document_path}) · [下一个能力]({next_capability_document_path})

本文件说明本能力对外提供什么、用户如何使用、二级能力如何协作，以及涉及哪些业务数据。接口字段和内部实现见对应二级能力详细设计。

源码定位对读者只显示 `文件名:起始行-结束行#符号`；完整仓库相对路径保存在紧邻的 `axis-evidence` HTML 注释中，例如：`ExampleService.java:12-24#execute`。

<!-- axis-evidence: modules/example/src/ExampleService.java:12-24#execute -->

## 1. 设计结论与能力边界

<!-- axis-authoring-contract
说明本能力为哪些用户/角色提供哪些业务价值、覆盖哪些二级能力/模块、与相邻一级能力如何分工，以及证据不足的边界。结论只能来自业务架构、清单、仓库证据或明确的人工确认。上游和下游不得由本文件单独推断，只能从项目级统一模型梳理得到的 canonical 依赖图投影。
-->

| 项目 | 说明 |
| --- | --- |
| 业务价值 | {business_value} |
| 纳入范围 | {included_scope} |
| 排除范围 | {excluded_scope} |
| 主要用户/角色 | {actors} |
| 上下游关系 | {reader_facing_direct_dependency_summary_or_not_derived} |

<!-- axis-boundary-machine-table
| 字段 | 内容 | 来源 |
| --- | --- | --- |
| `level1_capability_id` | `{level1_capability_id}` | `business/inventory.yaml` |
| `level1_capability_name` | `{level1_capability_name}` | `business/inventory.yaml` |
| 纳入范围 | {included_scope} | {evidence_ref} |
| 排除范围 | {excluded_scope} | {evidence_ref} |
| 主要用户/角色 | {actors} | {evidence_ref} |
| 上游能力 | `{direct_upstream_capability_ids_or_not_derived}` | `business/level1-capability-dependency-graph.yaml` |
| 下游能力 | `{direct_downstream_capability_ids_or_not_derived}` | `business/level1-capability-dependency-graph.yaml` |
-->

<!-- axis-authoring-contract
依赖投影规则：

- 先完成 inventory 中全部一级能力总览和全部所属二级能力接口设计；只要任一一级 `user_journey_coverage=partial` 或任一二级 `interface_coverage=partial`，项目图保持 `pending_level1_completion`，本表上下游都必须写 `not_derived`；
- 全部文档完整后，`axis-doc-project-knowledge` 一次性读取完整 inventory、全部当前一级总览和二级追溯，由模型进行项目级统一模型梳理，生成 `business/level1-capability-dependency-graph.yaml`；
- `derived` 状态下，上游能力严格等于 canonical 图中指向本能力的直接入边来源，下游能力严格等于从本能力发出的直接出边目标；没有直接关系时使用 `[]`；
- 禁止局部手工修订某一份总览的上下游。一级能力集合、边界或关系证据变化时，先把图和所有投影退回 pending，再统一派生并批量回填。

本文件的历史版本进入 `_archive`。二级能力独立修订和存档；只有对外业务能力、一级边界、专业语义、表结构、跨能力协作或导航发生变化时才修订本文件。
-->

## 2. 二级能力完整性与导航

<!-- axis-authoring-contract
先从 inventory 读取完整 `secondary_capabilities`。一个二级能力只承载一个可独立评审的业务结果；独立用户结果、状态机、治理权限或事务边界是继续拆分的证据。不得遗漏任何二级能力。
-->

| 二级能力 | 业务摘要 | 详情 |
| --- | --- | --- |
| {secondary_capability_name} | {business_summary} | [查看](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) |

<!-- axis-secondary-navigation-machine-table
| 顺序 | `secondary_capability_id` | 二级能力名称 | 对应 `business_id` | 二级能力文档 | 文档状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `{secondary_capability_id}` | {secondary_capability_name} | `{business_ids}` | [打开详细设计](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) | review |
-->

<!-- axis-authoring-contract
完整性规则：

- inventory 中每个二级能力在可见导航和隐藏 machine 表中都恰好出现一次；
- 每行列出全部 `business_ids`，并链接唯一的当前二级能力文档；
- 每个已声明二级能力至少参与第 3 章一项有证据的对外业务能力；
- 缺失证据的二级能力仍保留清单行和独立文档并标记，不得删除以制造完整假象；
- Dashboard 以本表和规范路径构建可折叠父子导航。
-->

## 3. 对外业务能力与接口实现

<!-- axis-authoring-contract
模型必须根据当前业务清单、页面/菜单、路由、API、事件、任务、代码与测试证据，逐项识别本一级能力对外提供的真实业务能力。这不是固定清单，也不是按二级能力或接口一对一分组；应按用户目标和用户可见结果划分业务能力，为每项能力生成一个连续的 `3.N` 小节。禁止用一张横向宽表代替这些小节。

同一项对外业务能力使用一个稳定 `journey_id`，可以由一个或多个二级能力通过多个接口协作完成。跨二级能力的业务接力、顺序和结果直接由该 `3.N` 的逻辑图和实现步骤表达，不再生成独立的“跨二级能力用户旅程”章节。每个 `3.N` 必须严格按 `3.N.1 业务说明`、`3.N.2 二级能力与接口实现逻辑`、`3.N.3 实现步骤` 的顺序且各出现一次，不得交换、跳过、合并或添加平行替代小节。
-->

### 3.1 {provided_business_capability_name}

#### 3.1.1 业务说明

| 项目 | 内容 |
| --- | --- |
| 用户/角色 | {actor_or_role} |
| 提供的业务 | {provided_business} |
| 用户目标 | {user_goal} |
| 用户怎么操作 | {user_operation} |
| 用户可见结果 | {user_visible_result} |

<!-- axis-evidence: {business_evidence_path_begin_end_symbol} -->
<!-- axis-journey-machine-table
| 项目 | 内容 |
| --- | --- |
| `journey_id` | `{journey_id}` |
| 用户/角色 | {actor_or_role} |
| 提供的业务 | {provided_business} |
| 用户目标 | {user_goal} |
| 用户怎么操作 | {user_operation} |
| 用户可见结果 | {user_visible_result} |
| 参与二级能力 | `{participating_secondary_capability_ids}` |
| 证据 | `{business_evidence_path_begin_end_symbol}` |
-->

#### 3.1.2 二级能力与接口实现逻辑

<!-- axis-authoring-contract
本图只表达业务语义。每个节点只能表达一个最小业务动作、业务判断、业务状态或用户可见结果；同一张图不得混用业务节点与代码方法节点。稳定 ID、接口契约和代码符号只放隐藏绑定，不出现在读者图中。多二级能力场景按机器步骤顺序连接，且与 `3.N.3` 一致。
-->

```mermaid
flowchart LR
    journey_{journey_id}["{atomic_user_operation}"] ==>|"{business_transition}"| secondary_1_{secondary_capability_id}["{atomic_business_action}"]
    secondary_1_{secondary_capability_id} ==>|"{next_business_transition}"| secondary_2_{next_secondary_capability_id}["{next_atomic_business_action}"]
    secondary_2_{next_secondary_capability_id} ==> result["{user_visible_result}"]
```

<!-- axis-diagram-binding
journey_{journey_id}.actor={actor_or_role}
secondary_1_{secondary_capability_id}.secondary_capability_id={secondary_capability_id}
secondary_2_{next_secondary_capability_id}.secondary_capability_id={next_secondary_capability_id}
journey_{journey_id} ==>|"{api_id}: {method_and_path_or_event_job_command}"| secondary_1_{secondary_capability_id}["{atomic_business_action}"]
-->

#### 3.1.3 实现步骤

<!-- axis-authoring-contract
图中每个接口实现步骤都单独使用一张紧凑可见表，顺序必须与图一致。可见源码定位只写文件名、行号和方法；完整机器追溯放在其后的 HTML 注释中。
-->

##### {business_step_name}

| 项目 | 内容 |
| --- | --- |
| 接口/入口 | `{method_and_path_or_event_job_command}` |
| Controller/Handler | `{controller_or_handler_file_name}:{begin_line}-{end_line}#{symbol}` |
| Service/UseCase | `{service_or_use_case_file_name}:{begin_line}-{end_line}#{symbol}` |
| 业务数据变化 | {read_write_or_produced_business_data_summary} |
| 二级能力详情 | [查看二级能力详细设计](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) |
| 证据 | `{evidence_file_name}:{begin_line}-{end_line}#{symbol}` |

<!-- axis-evidence: {controller_or_handler_path_begin_end_symbol} -->
<!-- axis-evidence: {service_or_use_case_path_begin_end_symbol} -->
<!-- axis-evidence: {step_evidence_path_begin_end_symbol} -->
<!-- axis-step-machine-table
| 项目 | 内容 |
| --- | --- |
| `step_id` | `{step_id}` |
| `secondary_capability_id` | `{secondary_capability_id}` |
| `api_id` | `{api_id}` |
| 接口/入口 | `{method_and_path_or_event_job_command}` |
| Controller/Handler | `{controller_or_handler_path_begin_end_symbol}` |
| Service/UseCase | `{service_or_use_case_path_begin_end_symbol}` |
| 读取数据 | {read_data_summary} |
| 写入/产生数据 | {written_or_produced_data_summary} |
| 读写 `table_id` | `{read_write_table_ids_or_not_applicable}` |
| 二级能力详情 | [查看二级能力详细设计](business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md) |
| 证据 | `{step_evidence_path_begin_end_symbol}` |
-->

<!-- axis-authoring-contract
生成规则：

- 为每项真实对外业务能力复制完整且固定顺序的 `3.N.1`、`3.N.2` 和 `3.N.3`；不得只选每个模块的代表接口；
- 一个 `journey_id` 可以有多个 `step_id`并参与多个二级能力；每个步骤只绑定一个 `secondary_capability_id` 和一个 `api_id`；
- `3.N.2` 中每个节点都是最小业务单元；读者边标签只写业务转换，`api_id`、完整接口与二级能力 ID 保存在 `axis-diagram-binding`，不得拼进可见标签；
- 每个步骤的 Controller/Handler 与 Service/UseCase 对读者显示 `文件名:起始行-结束行#符号`，并在隐藏 machine 表中保留仓库相对 `path:begin-end#symbol` 精确锚点；
- 业务说明与每个实现步骤都至少包含一个隐藏 `axis-evidence` 完整锚点；
- 一级 `journey_id` 必须在所有参与二级能力文档中以同值 `level1_journey_id` 出现，并绑定该二级能力承接的 `flow_id` 和/或 `api_id`；
- “读取数据”和“写入/产生数据”摘要业务对象、缓存、索引、事件或外部结果；“读写 `table_id`”固定列出该步骤直接或间接读写的一个或多个稳定 `table_id`，并与第 5 章及二级 `5.N.1` 同值。只有精确代码证据证明该步骤完全不读写持久化数据时才写 `not_applicable`，且步骤证据必须能支持这一结论；
- `table_design_status=detailed` 时，第 3 章全部步骤“读写 `table_id`”的去重并集必须与第 5 章表清单 `table_id` 集合严格相等，不得遗漏、额外添加或用物理表名替代稳定 ID。
-->

## 4. 业务语义

<!-- axis-authoring-contract
逐项解释本一级能力中实际使用的业务、行业和领域专业术语。本章是读者理解业务的语义字典，不承载安全、隐私、发布、质量或运行治理规则。
-->

| 专业术语 | 定义 | 适用场景与边界 | 易混淆术语及区别 | 关联二级能力 | 权威来源/证据 |
| --- | --- | --- | --- | --- | --- |
| {professional_term} | {definition} | {applicable_scenario_and_boundary} | {confusable_term_and_difference} | {secondary_capability_names} | {authority_or_file_name_line_symbol} |

<!-- axis-evidence: {authoritative_source_or_evidence} -->

## 5. 表结构设计

<!-- axis-authoring-contract
`table_design_status=detailed` 时，本章对读者只列业务对象、必要的物理表定位、业务关系和影响业务判断的字段；完整 ID、接口映射、字段追溯与 coverage 保存在机器注释中。

`table_design_coverage=partial` 必须使用稳定 `table_design_gap_id` 追踪未覆盖表或字段证据；`complete` 使用 `table_design_gap_id=not_applicable`。
-->

### 5.1 表清单

| 业务对象 | 物理表 | 业务用途 | 使用场景 | 证据 |
| --- | --- | --- | --- | --- |
| {business_entity_name} | `{physical_table_name}` | {business_entity_or_purpose} | {reader_relevant_read_write_scenario} | `{evidence_file_name}:{begin_line}-{end_line}#{symbol}` |

<!-- axis-evidence: {ddl_migration_orm_mapper_or_query_path_begin_end_symbol} -->
<!-- axis-table-inventory-machine-table
| `table_id` | 物理表名 | 业务实体/用途 | 所属二级能力 | 读写 `api_id` | 证据 |
| --- | --- | --- | --- | --- | --- |
| `{table_id}` | `{physical_table_name}` | {business_entity_or_purpose} | `{secondary_capability_ids}` | `{read_write_api_ids}` | `{ddl_migration_orm_mapper_or_query_path_begin_end_symbol}` |
-->

### 5.2 ER 图

<!-- axis-authoring-contract
ER 图中的实体名称必须使用表清单逐项声明的实际物理表名或经批准的目标物理表名，不得使用 `table_id` 充当实体名。关系、基数和键必须有 DDL、迁移、ORM、Mapper/查询或已批准目标设计证据，不得凭表名猜测。
-->

```mermaid
erDiagram
    {PHYSICAL_TABLE_A} ||--o{ {PHYSICAL_TABLE_B} : "{evidence_backed_relationship}"
    {PHYSICAL_TABLE_A} {
        {column_type} {primary_key_column} PK
    }
    {PHYSICAL_TABLE_B} {
        {column_type} {foreign_key_or_relation_column} FK
    }
```

#### 5.2.1 ER 关系证据

<!-- axis-authoring-contract
当表清单包含两张或更多表时，必须保留本表；每个 `table_id` 至少在“表关系（主 -> 从）”中出现一次。每行对读者显示短定位，并通过 `axis-evidence` 保留支持关系、基数和关联键的精确仓库相对 `path:begin-end#symbol`。ER 图中的关系标签与本表“业务语义”必须逐条同值；图中不得出现表清单外的实体或本表未记录的关系。
-->

| 主表 | 从表 | 关系/基数 | 业务含义 | 证据 |
| --- | --- | --- | --- | --- |
| `{primary_physical_table}` | `{secondary_physical_table}` | `1:1` / `1:N` / `N:1` / `N:M` | {relationship_business_semantics} | `{evidence_file_name}:{begin_line}-{end_line}#{symbol}` |

<!-- axis-evidence: {ddl_migration_orm_mapper_or_query_path_begin_end_symbol} -->
<!-- axis-er-relationship-machine-table
| `relation_id` | 表关系（主 -> 从） | 关系/基数 | 关联键 | 业务语义 | 证据 |
| --- | --- | --- | --- | --- | --- |
| `{relation_id}` | `{primary_table_id}` -> `{secondary_table_id}` | `1:1` / `1:N` / `N:1` / `N:M` / 无直接关系 | `{primary_table_id}.{primary_key} -> {secondary_table_id}.{foreign_or_join_key}` / `not_applicable` | {relationship_business_semantics} | `{ddl_migration_orm_mapper_or_query_path_begin_end_symbol}` |
-->

<!-- axis-authoring-contract
当表清单只有一张表时，删除上述关系证据表，并明确写：`ER 关系证据：not_applicable（单表，无需跨表关系）`。不得为满足模板虚构自关联或跨表关系。
-->

### 5.3 `{physical_table_name}`

| 业务字段 | 类型 | 业务语义 | 关键约束 | 证据 |
| --- | --- | --- | --- | --- |
| `{business_relevant_column_name}` | `{column_type}` | {business_semantics} | {business_relevant_constraint} | `{evidence_file_name}:{begin_line}-{end_line}#{symbol}` |

<!-- axis-evidence: {ddl_migration_orm_mapper_or_query_path_begin_end_symbol} -->
<!-- axis-table-field-machine-table
table_id={table_id}
| 字段 | 类型/可空/默认值 | 键/约束 | 业务语义 | 读写 `api_id` | 证据 |
| --- | --- | --- | --- | --- | --- |
| `{business_relevant_column_name}` | `{column_type}`；可空=是 / 否；默认值=`{default_value_or_none}` | {primary_unique_foreign_check_or_other_constraint} | {business_semantics} | `{read_write_api_ids}` | `{ddl_migration_orm_mapper_or_query_path_begin_end_symbol}` |
-->

<!-- axis-authoring-contract
字段小节固定从 `5.3` 开始并按表清单顺序连续编号；每个 `table_id` 恰好对应一个字段小节，小节标题只写表清单中的实际物理表名（允许使用反引号），不得追加“字段设计”等通用后缀。表清单、以实际物理表名为实体的 ER 图、`5.2.1 ER 关系证据`、字段表与二级接口中的局部读写追溯必须一致。表清单 `table_id` 集合必须与第 3 章全部步骤“读写 `table_id`”的非 `not_applicable` 值去重并集严格相等。多表时 ER 关系证据覆盖每张表；单表时在 `5.2.1` 明确“无需跨表关系”。表清单、关系证据与每个字段行都显示短定位，并在 `axis-evidence` 中保留 DDL、迁移、ORM、Mapper 或查询的完整锚点。
-->

<!-- axis-authoring-contract
只有证据能够证明本一级能力不读写任何持久化数据时，才可使用 `table_design_status=not_applicable`。该分支的 coverage 和 gap ID 也都使用 `not_applicable`。此时删除上述表清单、ER 图和每表字段示例，但必须保留第 5 章并填写：
-->

| 项目 | 内容 |
| --- | --- |
| 原因 | {no_persistence_reason} |
| 证据 | `{evidence_file_name}:{begin_line}-{end_line}#{symbol}` |

<!-- axis-evidence: {exact_repository_evidence} -->

## 6. 缺口与覆盖说明

| 缺口 | 影响 | 下一步 | 状态 |
| --- | --- | --- | --- |
| {missing_business_capability_table_or_evidence} | {coverage_impact} | {required_evidence_or_decision} | {gap_status} |

<!-- axis-gap-machine-table
| 字段 | 内容 |
| --- | --- |
| `user_journey_gap_id` | `{user_journey_gap_id_or_not_applicable}` |
| `table_design_gap_id` | `{table_design_gap_id_or_not_applicable}` |
| `secondary_capability_ids` | `{secondary_capability_ids}` |
| 已检查范围 | {searched_scope} |
| 责任角色 | {owner_role} |
| 完整证据 | `{gap_evidence_path_begin_end_symbol_or_not_applicable}` |
-->

<!-- axis-machine-validation-and-navigation
以下为机器校验与便携导航，不是读者章节。
## 7. 文档完整性校验
校验结论：{validation_summary}。
- journey、table、dependency controls 与 metadata、inventory、canonical graph 一致；
- 每个二级能力恰好出现一次并至少参与一项对外业务能力；
- 每个 3.N 只有一组 3.N.1、3.N.2、3.N.3，业务图节点原子且不混入方法；
- visible evidence 使用 basename:line#symbol，完整 path:begin-end#symbol 存在 axis-evidence；
- table_id、api_id、关系、字段、子文档机器追溯一致；
- 无未替换模板变量、无无证据结论、无敏感数据。

## 8. 文档导航与证据索引
- 返回业务架构：architecture/business.md；
- 上一个能力：{previous_capability_document_path}；
- 下一个能力：{next_capability_document_path}；
- 相关需求和功能文档：{related_requirement_and_feature_paths}；
- 完整证据按 architecture、inventory、routes、controllers、handlers、pages、menus、services、entities、mappers、migrations、tests、config 和 docs 分类保存。
-->
