# {project_name} · {business_name} 业务域详细设计说明书

> 文档状态：评审中
> 文档版本：{revision}
> 业务域标识：`{business_id}`
> 上游业务架构：`architecture/business.md`
> 证据基线：{source_commit}
> 采用方法：IEEE 1016-2009 SDD 概念、ISO/IEC/IEEE 42010:2022、TOGAF Business Architecture、ArchiMate-lite、GB/T 8567-2006

## 1. 设计结论

用简洁语言说明本业务域的运行设计：它承担什么业务价值、从哪里接收输入、向哪里交付结果，以及最重要的状态、权限、一致性和失败处理原则。

结论只能来自业务架构、业务清单、仓库证据或明确的人工作证。缺少证据的设计决定进入第 17 章，不写成已确认事实。

## 2. 文档目的、范围与读者

### 2.1 文档目的

说明本详细设计如何把 `architecture/business.md` 和 `business/inventory.yaml` 中属于 `{business_id}` 的目标、能力、价值流、流程、对象和规则细化为可评审、可实现、可测试、可追踪的业务域设计。

### 2.2 设计范围与非目标

| 项目 | 内容 | 来源 |
| --- | --- | --- |
| 纳入范围 | {included_scope} | {evidence_ref} |
| 排除范围 | {excluded_scope} | {evidence_ref} |
| 非目标 | {non_goal} | {evidence_ref} |

本文件是 `{business_id}` 唯一的业务域详细设计，不替代单功能详细设计；单一功能内部字段、方法和算法应通过后续功能文档展开。

### 2.3 业务域边界

| 边界项 | 内容 | 证据 |
| --- | --- | --- |
| 业务域标识 | `{business_id}` | `business/inventory.yaml` |
| 域内职责 | {included_responsibility} | {evidence_ref} |
| 域外职责 | {excluded_responsibility} | {evidence_ref} |
| 上游业务域 | {upstream_business_ids} | {evidence_ref} |
| 下游业务域 | {downstream_business_ids} | {evidence_ref} |

### 2.4 读者与关注点

| 读者 | 关注点 |
| --- | --- |
| 产品与业务负责人 | 业务规则、跨域流程、角色职责、验收结果 |
| 架构与研发 | 业务边界、系统映射、状态、接口和一致性 |
| 测试 | 主流程、异常分支、规则决策表、验收追踪 |
| 运营、安全与实施 | 权限、审计、外部协作、运行指标和处置规则 |

## 3. 业务架构追踪基线

### 3.1 上游文档与证据

| 编号 | 来源 | 版本/位置 | 支持的设计内容 | 置信度 |
| --- | --- | --- | --- | --- |
| E-01 | 业务架构 | `architecture/business.md` | {supported_design} | {confidence} |

### 3.2 业务架构元素追踪

| 业务架构元素 | 上游章节 | 详细设计章节 | 设计状态 | 缺失证据 |
| --- | --- | --- | --- | --- |
| {architecture_element} | {source_section} | {design_section} | {design_status} | {missing_evidence} |

所有业务目标、能力、价值流、关键流程、业务对象和治理要求都必须映射到详细设计，或者明确说明不适用及其证据。

## 4. 业务域能力与协作设计

### 4.1 能力职责分解

| 业务能力 | 所属业务域 | 业务职责 | 输入 | 输出 | 上游依赖 | 下游依赖 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {capability} | {business_id} | {responsibility} | {input} | {output} | {upstream} | {downstream} | {evidence_ref} |

### 4.2 共享能力与扩展能力

说明身份、权限、审核、支付、消息、搜索、统计等共享能力被哪些核心价值流复用，以及各业务域保留哪些扩展责任。不得把技术模块名称直接当作业务能力。

### 4.3 能力协作图

使用 Mermaid 表达 `{business_id}` 与直接上、下游业务域的协作方向。图中关系必须标注交付物、业务事件或控制要求，图后说明边界和证据；不得扩写其他业务域内部设计。

## 5. 业务流程编排

### 5.1 业务域主流程

| 步骤 | 发起角色 | 业务动作 | 所属能力/业务域 | 输入 | 输出 | 状态变化 | 规则 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | {actor} | {business_action} | {capability_or_domain} | {input} | {output} | {state_change} | {rule_ref} | {evidence_ref} |

### 5.2 分支流程

对本业务域内的渠道差异、角色差异、人工与自动处理差异进行分支设计。其他业务域的内部步骤只引用其详细设计。

### 5.3 流程前置条件与完成条件

| 流程 | 前置条件 | 完成条件 | 终止条件 | 可恢复条件 | 证据 |
| --- | --- | --- | --- | --- | --- |
| {flow} | {precondition} | {completion} | {termination} | {recovery} | {evidence_ref} |

## 6. 异常与补偿设计

| 异常编号 | 触发条件 | 业务可见结果 | 系统处理 | 状态处理 | 补偿/恢复 | 责任角色 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EX-01 | {trigger} | {visible_result} | {system_action} | {state_action} | {compensation} | {owner_role} | {evidence_ref} |

覆盖校验失败、权限不足、重复请求、库存/容量不足、支付失败、审核拒绝、外部依赖失败、超时、部分成功和人工处置。无法确认的处理规则必须写入第 17 章。

## 7. 角色职责与权限设计

### 7.1 RACI 职责矩阵

| 业务活动 | 会员/客户 | 商户/合作方 | 服务人员 | 平台运营 | 审核人员 | 系统自动化 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {activity} | {raci} | {raci} | {raci} | {raci} | {raci} | {raci} | {evidence_ref} |

### 7.2 权限与数据边界

| 角色 | 可执行动作 | 业务范围 | 数据范围 | 守卫条件 | 审计要求 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| {actor} | {action} | {business_scope} | {data_scope} | {guard} | {audit_requirement} | {evidence_ref} |

明确租户、组织、商户、门店、会员和资源归属边界。仅凭字段命名不能确认权限规则。

## 8. 业务对象与状态设计

### 8.1 业务对象职责

| 业务对象 | 所属业务域 | 业务标识 | 生命周期责任方 | 权威来源 | 关联对象 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| {business_object} | {business_id} | {business_identity} | {lifecycle_owner} | {source_of_truth} | {related_objects} | {evidence_ref} |

### 8.2 状态模型

| 对象 | 当前状态 | 触发事件 | 守卫条件 | 下一状态 | 可执行角色 | 业务副作用 | 失败处理 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {business_object} | {from_state} | {event} | {guard} | {to_state} | {actor} | {side_effect} | {failure_handling} | {evidence_ref} |

为关键对象提供状态图；未由代码、测试或正式规则证明的状态不得补写。

## 9. 业务规则决策表

| 规则编号 | 业务场景 | 条件 | 决策/动作 | 优先级 | 冲突处理 | 用户可见结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BR-01 | {scenario} | {condition} | {decision} | {priority} | {conflict_resolution} | {visible_result} | {evidence_ref} |

说明规则来源、适用范围、例外、版本和责任角色。若多个证据冲突，列出冲突并阻断对应设计结论。

## 10. 业务域输入、输出与事件设计

| 信息/业务事件 | 产生业务域 | 消费业务域 | 业务语义 | 最小必要信息 | 时序要求 | 重复/乱序处理 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {information_or_event} | {producer} | {consumer} | {business_meaning} | {minimum_data} | {timing} | {ordering_rule} | {evidence_ref} |

区分业务事实、命令和查询，不根据类名推断不存在的业务事件。

## 11. 业务能力到系统实现映射

| 业务能力/流程步骤 | 业务域 | 系统/容器 | 入口 | 应用服务 | 数据对象 | 外部依赖 | 测试证据 | 置信度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {capability_or_step} | {business_id} | {system_or_container} | {entrypoint} | {service} | {data_object} | {external_dependency} | {test_evidence} | {confidence} |

本节是本业务域设计到技术实现的追踪桥梁。必要的类、方法、字段和事务设计可在本文件中展开；单功能的复杂算法进入功能详细设计。

## 12. 接口与协作契约

| 契约 | 业务发起方 | 业务接收方 | 输入语义 | 输出语义 | 失败语义 | 幂等/一致性要求 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| {contract} | {initiator} | {receiver} | {input_meaning} | {output_meaning} | {failure_meaning} | {consistency_requirement} | {evidence_ref} |

只记录已存在或已批准的接口、事件、任务和人工交接。技术协议细节引用技术架构或领域技术设计。

## 13. 一致性、幂等与并发原则

说明各关键价值流的权威数据源、事务边界、唯一性保证、重复提交、并发修改、异步一致性、重试和补偿原则。缺少实现证据时，写成设计建议并标记需要确认，不写成系统现状。

## 14. 安全、隐私、审计与治理

| 控制目标 | 业务风险 | 控制点 | 责任角色 | 审计证据 | 缺失证据 |
| --- | --- | --- | --- | --- | --- |
| {control_objective} | {business_risk} | {control_point} | {owner_role} | {audit_evidence} | {missing_evidence} |

覆盖最小权限、敏感信息最小化、数据归属、审核追踪、操作留痕、内容/交易风险和租户隔离。

## 15. 业务质量与运行度量

| 质量场景 | 触发 | 度量 | 目标/门槛 | 监测来源 | 处置责任 | 证据状态 |
| --- | --- | --- | --- | --- | --- | --- |
| {quality_scenario} | {trigger} | {measure} | {target} | {monitoring_source} | {owner_role} | {evidence_status} |

质量目标必须可测量。没有正式阈值时记录缺失证据，不创建虚假的数值目标。

## 16. 验收与追踪矩阵

| 业务目标 | 业务能力 | 价值流/流程 | 业务规则 | 业务对象/状态 | 系统映射 | 验收条件 | 测试证据 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {business_goal} | {capability} | {flow} | {rule_ref} | {object_or_state} | {system_mapping} | {acceptance_criterion} | {test_evidence} | {trace_status} |

每项验收条件使用可观察的业务结果，不以“接口返回成功”替代业务完成条件。

## 17. 假设与缺失证据

| 编号 | 类型 | 内容 | 已检查范围 | 对设计的影响 | 需要确认的角色/证据 | 阻断级别 |
| --- | --- | --- | --- | --- | --- | --- |
| G-01 | {assumption_or_missing} | {description} | {searched_scope} | {design_impact} | {confirmation_needed} | {blocking_level} |

对缺失证据、低置信度、冲突、过期信息和不适用项分别记录。核心流程或权限缺少证据时，不得把相关章节标记为已确认。

## 18. 后续分解与文档导航

| 业务域/功能 | 需要的后续文档 | 触发技能 | 进入条件 | 当前状态 |
| --- | --- | --- | --- | --- |
| {business_id_or_feature} | {downstream_document} | {axis_skill} | {entry_condition} | {document_status} |

本文件由 `axis-doc-business-domain` 维护；单功能详细设计交给 `axis-doc-feature-detailed-design`，并遵守其功能定位确认门。

## 19. 证据索引

按业务架构、inventory、routes、controllers、pages、menus、services、entities、migrations、tests、config 和 docs 分类列出仓库相对路径、符号、支持的结论、置信度和最后核验时间。

## 20. 术语表

统一业务能力、业务域、价值流、流程、业务对象、业务事件、状态、规则、角色和系统边界等术语。
