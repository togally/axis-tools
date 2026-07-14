# 单功能详细设计说明书模板

> 本模板用于已经通过 `Feature Resolution Confirmation Gate` 的单一功能。所有花括号字段均应替换为已确认值；无法从证据确认的内容应写入“假设、缺失证据与待确认事项”，不得补写成事实。

---

schema: axis.project_knowledge_doc
schema_version: "0.2"
doc_type: feature_detailed_design
document_language: zh-CN
status: review
doc_status: needs_review
organization_id: "{organization_id}"
project_slug: "{project_slug}"
level1_capability_id: "{level1_capability_id}"
secondary_capability_ids:
  - "{secondary_capability_id}"
business_ids:
  - "{business_id}"
feature_id: "{feature_id}"
revision: 1
source_commit: "{source_commit}"
generated_by_skill: axis-doc-development

---

## 1. 文档控制

### 1.1 文档目的

说明 `{feature_name}` 的功能边界、当前实现、目标设计、接口、数据、状态、异常、质量要求、测试与发布策略，为开发、测试、评审和运维提供共同依据。

### 1.2 适用范围

- 所属一级能力：`{level1_capability_id}`
- 涉及二级能力：`{secondary_capability_ids}`
- 对应 business_id：`{business_ids}`
- 功能标识：`{feature_id}`
- 纳入范围：`{included_scope}`
- 排除范围：`{excluded_scope}`

### 1.3 读者与关注点

| 角色 | 关注点 |
| --- | --- |
| 产品/业务 | 规则、边界、主流程、异常结果 |
| 开发 | 模块职责、接口、状态、数据、事务与并发 |
| 测试 | 可验证规则、异常路径、验收条件 |
| 运维/安全 | 可观测性、权限、审计、发布与回滚 |

### 1.4 修订与状态

记录版本、作者或生成方式、评审人、状态、变更摘要、替代关系和更新时间。

## 2. 功能定位与确认记录

### 2.1 功能身份

| 字段 | 值 |
| --- | --- |
| 功能名称 | `{feature_name}` |
| feature_id | `{feature_id}` |
| level1_capability_id | `{level1_capability_id}` |
| secondary_capability_ids | `{secondary_capability_ids}` |
| business_ids | `{business_ids}` |
| 用户入口 | `{user_entry}` |
| 技术入口 | `{technical_entry}` |

### 2.2 Feature Resolution Confirmation Gate

```yaml
feature_resolution:
  outcome: confirmed_feature
  confirmed_by: user
  confirmation_summary: "{confirmation_summary}"
  resolved_at: "{resolved_at}"
```

列出候选筛选过程、最终命中的路由/页面/菜单/符号/路径，以及用户确认依据。

### 2.3 证据基线

| 编号 | 类型 | 仓库相对路径 | 符号/位置 | 支持的结论 | 置信度 |
| --- | --- | --- | --- | --- | --- |
| E-01 | `{evidence_kind}` | `{source_path}` | `{symbol}` | `{supported_claim}` | `{confidence}` |

## 3. 需求、目标与非目标

### 3.1 背景与目标

说明已由代码、正式文档或用户确认支持的目标，并标明证据编号。

### 3.2 功能需求与业务规则

| 编号 | 需求/规则 | 来源 | 优先级 | 验收关联 |
| --- | --- | --- | --- | --- |
| FR-01 | `{requirement}` | `{evidence_or_confirmation}` | `{priority}` | `{acceptance_id}` |

### 3.3 非目标与约束

说明本设计明确不处理的行为、兼容性限制、技术约束和外部前提。

## 4. 当前实现与问题分析

### 4.1 当前代码地图

| 层次 | 路径/符号 | 当前职责 | 证据 |
| --- | --- | --- | --- |
| 入口 | `{path_or_symbol}` | `{responsibility}` | `{evidence_id}` |

### 4.2 当前主流程

按实际调用顺序描述入口、校验、业务处理、持久化、外部调用和响应。

### 4.3 当前异常流程

说明权限失败、参数失败、资源不存在、重复请求、并发冲突、外部依赖失败、超时和降级行为；没有证据的项转入第 17 章。

### 4.4 已知问题与设计动因

区分已验证问题、需求变化、质量属性改进和仅供评审的建议。

## 5. 详细设计概览

### 5.1 设计原则与关键决策

| 决策编号 | 决策 | 备选方案 | 理由 | 影响 | 证据/确认 |
| --- | --- | --- | --- | --- | --- |
| D-01 | `{decision}` | `{alternatives}` | `{rationale}` | `{impact}` | `{source}` |

### 5.2 模块与职责

说明组件、类、方法、任务、消费者或前端单元的职责及边界。

### 5.3 组件关系图

仅在关系较复杂时使用 Mermaid，并在图后解释节点、方向和关键约束。

## 6. 参与者、权限与审计

| 参与者 | 前置条件 | 允许操作 | 权限检查位置 | 审计要求 | 证据 |
| --- | --- | --- | --- | --- | --- |
| `{actor}` | `{precondition}` | `{capability}` | `{check_location}` | `{audit_rule}` | `{evidence_id}` |

## 7. 流程与交互时序

### 7.1 主成功流程

使用编号步骤描述每一步的发起方、输入、处理、状态/数据变化、输出和证据。

### 7.2 关键异常流程

分别描述可恢复错误、不可恢复错误、重试、补偿、超时和用户可见结果。

### 7.3 时序图

时序图必须与接口、模块和异常处理章节一致。

## 8. 接口详细设计

每个接口、事件或命令独立成节并使用纵向表，避免输入、输出、错误和证据在窄列中逐字换行。

### 8.{interface_index} `{interface}`

| 项目 | 内容 |
| --- | --- |
| 接口/事件/命令 | `{interface}` |
| 方向 | `{direction}` |
| 调用方 | `{caller}` |
| 输入 | `{input}` |
| 输出 | `{output}` |
| 错误 | `{errors}` |
| 幂等键 | `{idempotency_key}` |
| 证据 | `{evidence_id}` |

逐项说明字段语义、必填性、格式、枚举、边界、兼容策略和错误映射。不得根据命名推测未出现的字段。

## 9. 状态与数据设计

### 9.1 状态模型

每个状态转换单独使用一张纵向表。

#### 状态转换 `{from_state}` → `{to_state}`

| 项目 | 内容 |
| --- | --- |
| 当前状态 | `{from_state}` |
| 触发条件 | `{trigger}` |
| 守卫条件 | `{guard}` |
| 下一状态 | `{to_state}` |
| 副作用 | `{side_effect}` |
| 失败处理 | `{failure}` |
| 证据 | `{evidence_id}` |

### 9.2 数据模型

列出已存在或已批准的数据对象、字段、约束、索引、关系、生命周期和敏感级别。没有迁移、实体或正式设计证据时，不得虚构表字段。

### 9.3 数据一致性

说明权威数据源、读写路径、缓存、失效、最终一致性窗口和修复机制。

## 10. 核心算法与校验规则

每条规则单独使用一张纵向表。

### 10.{rule_index} R-{number}

| 项目 | 内容 |
| --- | --- |
| 规则编号 | R-{number} |
| 输入 | `{input}` |
| 条件/算法 | `{rule}` |
| 输出 | `{output}` |
| 错误 | `{error}` |
| 边界案例 | `{edge_case}` |
| 证据 | `{evidence_id}` |

## 11. 事务、幂等与并发

说明事务边界、锁或版本控制、唯一约束、幂等策略、重复提交、乱序、竞态、重试和补偿。无适用场景时必须给出证据化理由。

## 12. 外部依赖与容错

每个依赖单独使用一张纵向表。

### 12.{dependency_index} `{dependency}`

| 项目 | 内容 |
| --- | --- |
| 依赖 | `{dependency}` |
| 用途 | `{purpose}` |
| 协议 | `{protocol}` |
| 超时 | `{timeout}` |
| 重试 | `{retry}` |
| 熔断/降级 | `{fallback}` |
| 失败影响 | `{impact}` |
| 证据 | `{evidence_id}` |

## 13. 安全、隐私与审计

覆盖认证、授权、输入防护、敏感数据最小化、传输/存储保护、日志脱敏、审计事件和数据保留。不得在文档中写入真实凭据或用户数据。

## 14. 可观测性与运维

每个信号单独使用一张纵向表。

### 14.{signal_index} `{signal_name}`

| 项目 | 内容 |
| --- | --- |
| 信号 | `{signal_type}` |
| 名称 | `{signal_name}` |
| 触发点 | `{emission_point}` |
| 标签 | `{labels}` |
| 告警/阈值 | `{threshold}` |
| 排障用途 | `{diagnostic_use}` |
| 证据 | `{evidence_id}` |

说明日志、指标、追踪、审计、健康检查、运行手册和数据修复入口。

## 15. 测试与验收

### 15.1 测试策略

覆盖单元、集成、契约、端到端、并发、故障注入、性能和安全测试中适用的层次。

### 15.2 验收条件

| 验收编号 | Given | When | Then | 对应需求 | 测试位置/计划 |
| --- | --- | --- | --- | --- | --- |
| AC-01 | `{precondition}` | `{action}` | `{observable_result}` | `{requirement_id}` | `{test_evidence_or_plan}` |

## 16. 发布、兼容与回滚

说明发布顺序、配置或数据迁移、灰度条件、兼容窗口、监控门槛、停止条件、回滚步骤和不可逆风险。

## 17. 风险、假设、缺失证据与待确认事项

### 17.1 风险

| 风险 | 触发条件 | 影响 | 缓解 | 责任角色 |
| --- | --- | --- | --- | --- |
| `{risk}` | `{trigger}` | `{impact}` | `{mitigation}` | `{owner_role}` |

### 17.2 假设

| 假设 | 原因 | 影响 | 验证方式 | 失效后的处理 |
| --- | --- | --- | --- | --- |
| `{assumption}` | `{basis}` | `{impact}` | `{verification}` | `{fallback}` |

### 17.3 缺失证据与待确认事项

| 缺失内容 | 已检查范围 | 对设计的影响 | 需要用户/责任人的确认 | 阻断级别 |
| --- | --- | --- | --- | --- |
| `{missing_evidence}` | `{searched_scope}` | `{design_impact}` | `{confirmation_needed}` | `{blocking_level}` |

## 18. 需求—设计—测试追踪

每条需求或规则单独使用一张纵向追踪表。

### 18.{trace_index} `{requirement_id}`

| 项目 | 内容 |
| --- | --- |
| 需求/规则 | `{requirement_id}` |
| 流程 | `{flow_ref}` |
| 接口 | `{interface_ref}` |
| 状态/数据 | `{state_or_data_ref}` |
| 实现证据 | `{implementation_evidence}` |
| 测试/验收 | `{test_or_acceptance_ref}` |
| 状态 | `{trace_status}` |

## 19. 评审与批准

记录评审意见、未关闭问题、批准角色和批准时间。在获得明确人工批准前，文档状态保持 `review`。
