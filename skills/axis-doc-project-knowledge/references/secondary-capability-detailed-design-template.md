# {project_name} · {secondary_capability_name} 详细设计说明书

> 文档状态：评审中<br>
> 文档版本：{revision}<br>
> 所属能力：`{level1_capability_id}`<br>
> 二级能力标识：`{secondary_capability_id}`<br>
> 对应业务标识：`{business_ids}`<br>
> 证据基线：{source_commit}

> 设计完整性：`interface_design_status={detailed_or_not_applicable}` · `interface_coverage={complete_partial_or_not_applicable}`

[返回能力总览](business/capabilities/{level1_capability_id}/detailed-design.md) · [上一个二级能力]({previous_secondary_document_path}) · [下一个二级能力]({next_secondary_document_path})

本文件保存 `{secondary_capability_name}` 的完整业务与代码设计。Dashboard 根据规范路径把它挂载到所属能力下；业务架构和能力总览只保留摘要、关系和链接，不复制本文件正文。

> **可追溯性约定**：已实现事实必须从业务流追溯至接口、代码对象、实体/表和测试；代码证据统一写为“`文件路径:起始行-结束行#符号`”。待开发设计写明“目标设计”，无法从仓库证实的内容写“缺失证据”，不得用类名或推测代替定位。

> **一级旅程同 ID 契约**：一级“对外业务能力与接口实现”中一个 `journey_id` 可以参与多个二级能力。只要该一级 `3.N` 的“参与二级能力”或实现步骤包含本能力，本文件就必须以完全相同的 `level1_journey_id` 出现，并绑定本能力承接的 `flow_id` 和/或 `api_id`；本文件也不得增加一级没有或未将本能力列为参与者的旅程 ID。一级为 `complete` 时本文件必须为 `interface_coverage=complete`。一级保留跨二级逻辑、Controller/Handler、Service/UseCase、数据结果、用户可见结果和全局表/ER 设计；本文件负责按接口展开完整内部代码流、局部数据读写和测试追溯。

> **表追溯契约**：每个持久化读写都必须在对应 `5.N.1` 和 `5.N.2` 中记录实际 Mapper/Repository、实体/物理表、一级表结构设计中同值的 parent `table_id`、键、数据变化和约束。每个 `5.N.1` 的“实体/表”实现追溯行固定包含 `table_id={parent_table_ids_or_not_applicable}`；只有精确证据证明该接口完全不读写持久化数据时才可使用 `not_applicable`。本文件不复制一级完整表清单、ER 和字段字典。

## 1. 能力定位与边界

本能力负责 {responsibility}，承接一级旅程 `{level1_journey_ids}`。非目标：{non_goals}。

能力标识、所属一级能力和 `business_ids` 已在文档头统一声明，本节不再重复调用主体或接口信息。

## 2. 调用主体、权限与接口矩阵

本表是“谁凭什么权限调用哪个接口”的唯一权威清单。一行只表达一个“主体/角色 × `api_id`”关系；同一接口允许多个主体时分别列行。`api_id` 和“可调用接口/能力”必须与第 5 章完全一致，第 5 章每个接口至少在本表出现一次，本表也不得引用第 5 章不存在的接口。

“所需权限/策略”填写真实权限码、`authenticated`、`public`、可信内部边界或有证据的资源归属规则，不得写“执行已授权流程”“具备相应权限”等泛化结论。“数据范围”写明租户、组织、门店、资源归属或公开数据边界，并提供授权或范围校验的精确代码证据；证据不足时明确记录 `missing_evidence` 和稳定 gap，不得推断固定角色。

| 主体/角色 | 所需权限/策略 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |
| --- | --- | --- | --- | --- | --- |
| {concrete_actor_or_role} | {permission_code_authentication_or_policy} | `{api_id}` | `{method_and_path_or_event_topic_job_command}` | {tenant_organization_resource_or_public_scope} | {authorization_or_scope_evidence} |

## 3. 能力级流程与跨接口关系

本章只描述二级能力内部多个接口、事件、主题、任务或命令之间的能力级编排，例如先后顺序、触发关系、跨契约状态传递和补偿关系。单个契约内部的参数校验、方法调用、业务判断、数据读写、结果生成与失败处理统一放在对应的 `5.N.2 内部处理逻辑`，不得在本章重复一张泛化的 Controller → Service → Mapper 图。

为每条能力级链路分配稳定的 `{flow_id}`，并从一级全景带入同值 `{level1_journey_id}`。存在真实跨契约编排时，可以补充使用实际 `api_id`、事件、任务和状态名称的 Mermaid 图；不存在跨契约编排时，明确写“本能力无跨契约编排，接口内部逻辑见各 `5.N.2`”，不要生成占位图。

| `level1_journey_id` | `flow_id` | 上游契约/触发 | 下游契约/结果 | 跨契约规则或状态传递 | 失败与补偿 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| `{level1_journey_id}` | `{flow_id}` | `{upstream_api_event_job_or_command}` | `{downstream_api_event_job_or_command_or_result}` | {cross_contract_rule_or_state_handoff} | {cross_contract_failure_compensation} | {evidence_ref} |

## 4. 业务对象、状态与规则

| 对象/规则 | 权威来源 | 当前状态/条件 | 触发 | 下一状态/决策 | 约束 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| {object_or_rule} | {source_of_truth} | {condition} | {trigger} | {result} | {constraint} | {evidence_ref} |

## 5. 接口详细设计

HTTP 接口、事件/主题、定时任务和内部命令均是可追溯契约。`interface_design_status=detailed` 时，每个契约必须拥有一个直接位于本章下的独立 `### 5.N {接口/事件/任务/命令名称}` 分组；组内固定使用同一编号前缀的 `5.N.1` 至 `5.N.8`，不得把多个契约压平到一张横向宽表，也不得把内部处理逻辑、请求、响应、错误、事务、性能、安全或验收内容提取为全章共用小节。第二个契约必须使用 `5.2.1` 至 `5.2.8`，后续依次递增。

每个分组列出具体 HTTP 方法与完整路径、EVENT/TOPIC 主题、JOB 调度入口或 COMMAND 名称，字段级输入输出、错误映射以及入口到测试的代码链；不得用“现有入口集合”“对应应用服务”或仅列类名代替。`interface_coverage=partial` 时必须记录稳定的 `interface_gap_id`，并说明未覆盖入口及影响。

只有仓库证据能证明本能力不存在任何可调用入口、事件、主题、任务或命令时，才可使用 `interface_design_status=not_applicable` 与 `interface_coverage=not_applicable`。此时不保留空分组，改为填写 `interface_not_applicable_reason={reason}` 和 `interface_not_applicable_evidence={file_path_line_symbol}`；证据必须是仓库相对的 `path:begin-end#symbol`，不能只写“无接口”。

### 5.1 {interface_event_job_or_command_name}

#### 5.1.1 接口清单与代码追溯

| 项目 | 内容 |
| --- | --- |
| `level1_journey_id` | `{level1_journey_id}` |
| `api_id` | `{api_id}` |
| 契约类型 | HTTP / EVENT / TOPIC / JOB / COMMAND |
| 方法与完整路径或主题 | `{method_and_path_or_event_topic_job_command}` |
| 业务目的 | {business_purpose} |
| 调用方 | {caller} |
| 请求模型 | `{request_type}` |
| 响应模型 | `{response_type}` / `not_applicable`（原因与证据） |
| 状态 | 已实现 / 目标设计 / 缺失证据 |

| 实现层 | 精确定位 | 职责 |
| --- | --- | --- |
| Controller/入口 | `{controller_file_line_symbol}` | {entry_responsibility} |
| Service/用例 | `{service_file_line_symbol}` | {use_case_responsibility} |
| Mapper/Repository | `{mapper_file_line_symbol}` | {persistence_responsibility} |
| 实体/表 | `{entity_file_line_symbol_or_not_applicable_evidence}`；`table_id={parent_table_ids_or_not_applicable}`；物理表 `{physical_table_names_or_not_applicable}` | {entity_table_responsibility_or_no_persistence_reason} |
| 测试 | `{test_file_line_symbol}` | {test_responsibility} |

“实体/表”行中的每个非 `not_applicable` parent `table_id` 必须与一级第 3 章对应步骤“读写 `table_id`”和一级第 5 章表清单同值，物理表名也必须一致。接口读写多张表时全部列出；只有精确仓库证据证明本接口完全不读写持久化数据时，定位、`table_id` 和物理表三项才都写 `not_applicable`，并在职责列写明原因。

#### 5.1.2 内部处理逻辑

先用一段具体处理说明概括这一项契约从入口到结果的内部逻辑，至少写清入口或触发、输入校验、Service/UseCase 编排、关键业务判断或分支、数据读写、输出/状态/结果事件以及失败与恢复中实际适用的部分。说明中的代码对象、物理表、parent `table_id` 和状态必须与 `5.1.1` 的实现追溯、一级第 3 章对应步骤及一级第 5 章表结构设计一致，不能只写“调用服务处理并返回结果”。

处理说明：{concrete_internal_processing_summary}

处理说明之后至少保留一种结构化表达：有重要分支、异步交互、循环、事务或补偿时优先使用 Mermaid；简单线性流程可使用步骤表。下面两种形式是可替换示例，实际输出必须替换所有花括号内容，删除未采用的形式，不得保留占位节点或占位文字。

```mermaid
flowchart TD
    entry["{concrete_entry_or_trigger_symbol}: {receive_or_trigger_action}"] --> validation{"{concrete_validation_or_business_decision}"}
    validation -->|{accepted_condition}| usecase["{concrete_service_or_usecase_symbol}: {orchestration_action}"]
    validation -->|{rejected_condition}| failure["{concrete_error_or_failure_state}"]
    usecase --> data["{concrete_repository_entity_or_table}: {read_or_write_action}"]
    data --> result["{concrete_response_state_event_or_job_result}"]
```

| 步骤 | 内部处理 | 代码对象 | 数据读写/状态变化 | 失败处理 |
| --- | --- | --- | --- | --- |
| 1 | {concrete_validation_or_decision} | `{concrete_code_symbol}` | {concrete_read_write_or_state_change} | {concrete_failure_or_recovery} |

#### 5.1.3 请求字段

本小节只描述 5.1 这一项契约。HTTP 逐项列出 Header、Path、Query 与 Body；EVENT/TOPIC 列出消息头、键与载荷；JOB/COMMAND 列出调度上下文、参数和触发条件。确实没有字段时保留一行 `not_applicable`，同时写出原因和精确证据，不得留空。

| 字段 | 位置 | 类型 | 必填 | 约束/枚举 | 业务语义 | 敏感处理 | 证据/状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{field_name}` | Header / Path / Query / Body / MessageHeader / Key / Payload / Context | `{field_type}` | 是 / 否 | {validation_or_enum} | {business_semantics} | {sensitivity_control} | {evidence_or_target} |

#### 5.1.4 响应字段

HTTP 列出状态码与响应体；EVENT/TOPIC 列出确认、结果事件或明确的单向语义；JOB/COMMAND 列出执行结果与状态。没有直接响应时使用带原因和证据的 `not_applicable` 行。

| HTTP/消息/执行状态 | 字段 | 类型 | 可空 | 业务语义 | 产生位置 | 证据/状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `{status}` | `{field_name}` | `{field_type}` | 是 / 否 | {business_semantics} | {producer} | {evidence_or_target} |

#### 5.1.5 错误码与异常映射

| HTTP/错误码/失败状态 | 触发条件 | 用户或调用方可见语义 | 重试/回滚/补偿 | 代码证据/状态 |
| --- | --- | --- | --- | --- |
| `{http_error_or_failure_status}` | {trigger_condition} | {visible_semantics} | {recovery_behavior} | {evidence_or_target} |

#### 5.1.6 认证与授权执行

| 维度 | 设计 | 证据 |
| --- | --- | --- |
| 认证 | {authentication_design} | {evidence_or_target} |
| 授权 | {authorization_design} | {evidence_or_target} |

本小节只解释第 2 章主体—权限规则如何在本接口中执行，不重复维护角色清单。

#### 5.1.7 事务、并发、性能与容错

| 维度 | 设计 | 证据 |
| --- | --- | --- |
| 事务/一致性 | {transaction_consistency_design} | {evidence_or_target} |
| 幂等 | {idempotency_design} | {evidence_or_target} |
| 并发 | {concurrency_design} | {evidence_or_target} |
| 超时/重试/补偿 | {timeout_retry_compensation_design} | {evidence_or_target} |
| 性能/容量 | {performance_capacity_design_or_gap} | {evidence_or_target} |
| 降级/可观测性 | {degradation_observability_design} | {evidence_or_target} |

#### 5.1.8 安全、测试与验收

| 维度 | 设计/验收标准 | 证据/计划 |
| --- | --- | --- |
| 安全 | {input_data_privacy_audit_control} | {evidence_or_plan} |
| 测试 | {unit_integration_contract_failure_test_scope} | {test_evidence_or_plan} |
| 验收 | {observable_acceptance_result} | {acceptance_evidence_or_plan} |

若存在第二项契约，复制完整分组并严格使用以下标题；不得只复制清单或沿用 `5.1.x` 编号：

- `### 5.2 {next_interface_event_job_or_command_name}`；
- `#### 5.2.1 接口清单与代码追溯`；
- `#### 5.2.2 内部处理逻辑`；
- `#### 5.2.3 请求字段`；
- `#### 5.2.4 响应字段`；
- `#### 5.2.5 错误码与异常映射`；
- `#### 5.2.6 认证与授权执行`；
- `#### 5.2.7 事务、并发、性能与容错`；
- `#### 5.2.8 安全、测试与验收`。

第三项及后续契约同样使用 `5.3.1` 至 `5.3.8`、`5.4.1` 至 `5.4.8` 依次递增。每个分组中的 `level1_journey_id` 与 `api_id`、内部处理逻辑、字段、错误、事务/性能、安全/验收和代码定位只属于该分组，不能引用另一接口的全局流程图或字段表代替。

## 6. 代码对象与关系

列出承担本能力的入口、应用服务、领域对象、DTO/命令、实体、Mapper/Repository、事件、缓存和任务。每一条依赖均引用实际代码位置，不能只罗列类名。

```mermaid
classDiagram
    class {controller_symbol} {
      +{entry_method}()
    }
    class {application_service_symbol} {
      +{use_case_method}()
    }
    class {repository_symbol}
    class {entity_symbol}
    {controller_symbol} --> {application_service_symbol} : invokes
    {application_service_symbol} --> {repository_symbol} : reads/writes
    {repository_symbol} --> {entity_symbol} : maps
```

图中的节点必须替换为仓库中的实际符号或已批准的目标符号，不能保留 `Controller`、`ApplicationService`、`Repository`、`Entity` 等泛化节点名。

| 对象标识 | 类型 | 职责 | 输入/输出 | 依赖或被依赖关系 | 对应实体/表 | 源码定位 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{code_object}` | Controller / Service / DTO / Entity / Mapper / Event / Cache | {responsibility} | {input_output} | `{relation_type}` → `{related_object}` | {entity_table_refs} | `{file_path_line_symbol}` | 已实现 / 目标设计 / 缺失证据 |

## 7. 风险、假设与缺失证据

| 类型 | 内容 | 影响 | 已检查范围 | 需要确认的角色/证据 | 阻断级别 |
| --- | --- | --- | --- | --- | --- |
| {risk_assumption_missing} | {description} | {impact} | {searched_scope} | {confirmation_needed} | {blocking_level} |

## 8. 文档导航与证据索引

- 返回能力总览：`business/capabilities/{level1_capability_id}/detailed-design.md`；
- 上一个二级能力：`{previous_secondary_document_path}`；
- 下一个二级能力：`{next_secondary_document_path}`；
- 相关需求、功能、API、数据库、测试和部署文档：{related_document_paths}；
- 证据按 routes、controllers、pages、menus、services、entities、mappers、migrations、tests、config 和 docs 分类列出，并使用 `文件路径:起始行-结束行#符号` 格式；
- 每个 `level1_journey_id`、`flow_id`、`api_id`、代码对象、实体、数据表和父级 `table_id` 都应能在本节找到至少一个已验证定位或明确的内部缺失证据；每个 `level1_journey_id` 都能反向定位一级 `3.N` 中的同值 `journey_id`。
