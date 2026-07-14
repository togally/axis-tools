export function flatSecondaryDetailedDesign(secondaryCapabilityId) {
  return [
    '# 二级能力详细设计',
    '',
    `\`secondary_capability_id\`: \`${secondaryCapabilityId}\``,
    `\`level1_journey_id\`: \`${secondaryCapabilityId.toUpperCase()}_EXECUTE\``,
    '',
    '> 设计完整性：`interface_design_status=detailed` · `interface_coverage=complete`',
    '',
    '## 5. 接口详细设计',
    '',
    '### 5.1 接口清单与代码追踪',
    '',
    '| `api_id` | `level1_journey_id` | 方法与路径/主题 | 认证/授权 | 请求模型 | 响应模型 | 错误语义 | 幂等/事务 | Controller/入口 | Service/用例 | Mapper/Repository | 实体/表 | 测试 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| \`ORDER_CREATE\` | \`${secondaryCapabilityId.toUpperCase()}_EXECUTE\` | \`POST /api/${secondaryCapabilityId}/actions\` | 登录用户与订单归属校验 | \`CreateOrderRequest\` | \`OrderView\` | 参数错误、重复订单 | 业务单号唯一约束与事务 | \`src/${secondaryCapabilityId}/CapabilityController.java:10-20#execute\` | \`src/${secondaryCapabilityId}/CapabilityService.java:20-40#execute\` | \`src/OrderMapper.java:8-12#insert\` | \`order\` | \`test/OrderTest.java:10-30#createOrder\` |`,
    '',
    '### 5.2 请求字段',
    '',
    '| `api_id` | 字段 | 位置 | 类型 | 必填 | 约束 | 业务语义 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| `ORDER_CREATE` | `orderNo` | body | `String` | 是 | 非空 | 业务订单号 | `src/CreateOrderRequest.java:8-12#orderNo` |',
    '',
    '### 5.3 响应字段',
    '',
    '| `api_id` | 字段 | 类型 | 可空 | 业务语义 | 产生位置 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| `ORDER_CREATE` | `id` | `Long` | 否 | 订单主键 | Service 创建后返回 | `src/OrderView.java:8-12#id` |',
    '',
    '### 5.4 错误码与异常映射',
    '',
    '| `api_id` | HTTP/错误码 | 触发条件 | 用户可见语义 | 回滚/补偿 | 代码证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| `ORDER_CREATE` | `400` | 参数校验失败 | 请求无效 | 不落库 | `src/OrderController.java:10-20#create` |',
    '',
  ].join('\n');
}

function groupedSecondaryDetailedDesignWithoutInternalLogic(secondaryCapabilityId) {
  const journeyId = `${secondaryCapabilityId.toUpperCase()}_EXECUTE`;
  const groupedInterfaceDesign = [
    '## 1. 能力定位与边界',
    '',
    '本能力负责创建和查询当前组织内的业务订单，承接一级业务操作；不负责跨组织订单管理。',
    '',
    '## 2. 调用主体、权限与接口矩阵',
    '',
    '| 主体/角色 | 所需权限/策略 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| Web 管理端用户 | \`authenticated + order:create\` | \`ORDER_CREATE\` | \`POST /api/${secondaryCapabilityId}/actions\` | 当前组织内可创建的订单 | \`src/${secondaryCapabilityId}/CapabilityAuthorization.java:10-18#canCreate\` |`,
    `| Web 管理端用户 | \`authenticated + order:read\` | \`ORDER_QUERY\` | \`GET /api/${secondaryCapabilityId}/actions/{id}\` | 当前组织内可查看的订单 | \`src/${secondaryCapabilityId}/CapabilityAuthorization.java:20-28#canRead\` |`,
    '',
    '## 5. 接口详细设计',
    '',
    '### 5.1 创建业务接口',
    '',
    '#### 5.1.1 接口清单与代码追溯',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| \`level1_journey_id\` | \`${journeyId}\` |`,
    '| `api_id` | `ORDER_CREATE` |',
    `| 方法与完整路径或主题 | \`POST /api/${secondaryCapabilityId}/actions\` |`,
    '| 业务目的 | 创建业务订单并返回当前处理状态 |',
    '| 调用方 | Web 管理端 |',
    '| 请求模型 | `CreateOrderRequest` |',
    '| 响应模型 | `OrderView` |',
    '| 状态 | 已实现 |',
    '',
    '| 实现层 | 精确定位 | 职责 |',
    '| --- | --- | --- |',
    `| Controller/入口 | \`src/${secondaryCapabilityId}/CapabilityController.java:10-20#execute\` | 接收并校验创建请求 |`,
    `| Service/用例 | \`src/${secondaryCapabilityId}/CapabilityService.java:20-40#execute\` | 编排创建流程和事务 |`,
    '| Mapper/Repository | `src/OrderMapper.java:8-12#insert` | 写入订单记录 |',
    '| 实体/表 | `src/Order.java:10-30#Order`；表 `order` | 承载订单状态和业务单号 |',
    '| 测试 | `test/OrderTest.java:10-30#createOrder` | 验证创建主路径 |',
    '',
    '#### 5.1.2 请求字段',
    '',
    '| 字段 | 位置 | 类型 | 必填 | 约束 | 业务语义 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| `orderNo` | body | `String` | 是 | 非空 | 业务订单号 | `src/CreateOrderRequest.java:8-12#orderNo` |',
    '',
    '#### 5.1.3 响应字段',
    '',
    '| 字段 | 类型 | 可空 | 业务语义 | 产生位置 | 证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| `id` | `Long` | 否 | 订单主键 | Service 创建后返回 | `src/OrderView.java:8-12#id` |',
    '',
    '#### 5.1.4 错误码与异常映射',
    '',
    '| HTTP/错误码 | 触发条件 | 用户可见语义 | 回滚/补偿 | 代码证据 |',
    '| --- | --- | --- | --- | --- |',
    '| `400` | 参数校验失败 | 请求无效 | 不落库 | `src/OrderController.java:10-20#create` |',
    '',
    '#### 5.1.5 认证与授权执行',
    '',
    '| 维度 | 设计 | 证据 |',
    '| --- | --- | --- |',
    '| 认证 | 登录态令牌校验 | `src/OrderController.java:10-20#create` |',
    '| 授权 | 校验用户拥有订单创建权限 | `src/OrderController.java:10-20#create` |',
    '',
    '#### 5.1.7 事务、并发、性能与容错',
    '',
    '| 维度 | 设计 | 证据 |',
    '| --- | --- | --- |',
    '| 幂等 | 业务单号唯一约束 | `src/OrderService.java:20-40#create` |',
    '| 事务/一致性 | 创建主表和明细使用同一事务 | `src/OrderService.java:20-40#create` |',
    '| 并发 | 业务单号唯一约束阻止并发重复创建 | `src/OrderService.java:20-40#create` |',
    '| 性能/容量 | 单次创建仅写入订单主表与明细 | `src/OrderService.java:20-40#create` |',
    '| 超时/重试/补偿 | 客户端超时后使用同一业务单号安全重试，失败整体回滚 | `src/OrderService.java:20-40#create` |',
    '| 降级/可观测性 | 创建失败保留错误并通过测试验证无部分写入 | `test/OrderTest.java:10-30#createOrder` |',
    '',
    '#### 5.1.8 安全、测试与验收',
    '',
    '| 维度 | 设计/验收标准 | 证据/计划 |',
    '| --- | --- | --- |',
    '| 安全 | 仅允许当前组织内具备创建权限的用户提交订单 | `src/OrderController.java:10-20#create` |',
    '| 测试 | 覆盖正常创建、重复业务单号和事务回滚 | `test/OrderTest.java:10-30#createOrder` |',
    '| 验收 | 返回新订单标识和已创建状态且不存在部分写入 | `test/OrderTest.java:10-30#createOrder` |',
    '',
    '### 5.2 查询业务接口',
    '',
    '#### 5.2.1 接口清单与代码追溯',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| \`level1_journey_id\` | \`${journeyId}\` |`,
    '| `api_id` | `ORDER_QUERY` |',
    `| 方法与完整路径或主题 | \`GET /api/${secondaryCapabilityId}/actions/{id}\` |`,
    '| 业务目的 | 查询业务订单及当前处理状态 |',
    '| 调用方 | Web 管理端 |',
    '| 请求模型 | `OrderDetailQuery` |',
    '| 响应模型 | `OrderView` |',
    '| 状态 | 已实现 |',
    '',
    '| 实现层 | 精确定位 | 职责 |',
    '| --- | --- | --- |',
    `| Controller/入口 | \`src/${secondaryCapabilityId}/CapabilityController.java:22-30#detail\` | 接收订单详情查询 |`,
    `| Service/用例 | \`src/${secondaryCapabilityId}/CapabilityService.java:42-55#detail\` | 校验归属并查询订单 |`,
    '| Mapper/Repository | `src/OrderMapper.java:14-18#selectById` | 按主键读取订单 |',
    '| 实体/表 | `src/Order.java:10-30#Order`；表 `order` | 提供订单详情数据 |',
    '| 测试 | `test/OrderTest.java:32-45#queryOrder` | 验证详情查询主路径 |',
    '',
    '#### 5.2.2 请求字段',
    '',
    '| 字段 | 位置 | 类型 | 必填 | 约束 | 业务语义 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| `id` | path | `Long` | 是 | 正整数 | 订单主键 | `src/OrderController.java:22-30#detail` |',
    '',
    '#### 5.2.3 响应字段',
    '',
    '| 字段 | 类型 | 可空 | 业务语义 | 产生位置 | 证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| `status` | `String` | 否 | 当前订单状态 | Service 查询后返回 | `src/OrderView.java:14-18#status` |',
    '',
    '#### 5.2.4 错误码与异常映射',
    '',
    '| HTTP/错误码 | 触发条件 | 用户可见语义 | 回滚/补偿 | 代码证据 |',
    '| --- | --- | --- | --- | --- |',
    '| `404` | 订单不存在 | 未找到订单 | 无写入 | `src/OrderService.java:42-55#detail` |',
    '',
    '#### 5.2.5 认证与授权执行',
    '',
    '| 维度 | 设计 | 证据 |',
    '| --- | --- | --- |',
    '| 认证 | 登录态令牌校验 | `src/OrderController.java:22-30#detail` |',
    '| 授权 | 校验用户拥有订单查看权限 | `src/OrderService.java:42-55#detail` |',
    '',
    '#### 5.2.7 事务、并发、性能与容错',
    '',
    '| 维度 | 设计 | 证据 |',
    '| --- | --- | --- |',
    '| 幂等 | 只读接口天然幂等 | `src/OrderService.java:42-55#detail` |',
    '| 事务/一致性 | 使用只读事务读取一致状态 | `src/OrderService.java:42-55#detail` |',
    '| 并发 | 按主键读取当前已提交状态，不持有写锁 | `src/OrderService.java:42-55#detail` |',
    '| 性能/容量 | 使用订单主键查询并限制为单条结果 | `src/OrderMapper.java:14-18#selectById` |',
    '| 超时/重试/补偿 | 查询超时可安全重试，不产生补偿写入 | `src/OrderService.java:42-55#detail` |',
    '| 降级/可观测性 | 查询失败返回明确状态且测试覆盖不存在场景 | `test/OrderTest.java:32-45#queryOrder` |',
    '',
    '#### 5.2.8 安全、测试与验收',
    '',
    '| 维度 | 设计/验收标准 | 证据/计划 |',
    '| --- | --- | --- |',
    '| 安全 | 仅返回当前组织内且用户有权查看的订单 | `src/OrderService.java:42-55#detail` |',
    '| 测试 | 覆盖正常查询、订单不存在和越权查询 | `test/OrderTest.java:32-45#queryOrder` |',
    '| 验收 | 返回订单当前状态，未找到或越权时不泄露订单数据 | `test/OrderTest.java:32-45#queryOrder` |',
  ].join('\n');
  const flatDocument = flatSecondaryDetailedDesign(secondaryCapabilityId);
  return flatDocument.replace(
    /## 5\. 接口详细设计[\s\S]*$/,
    `${groupedInterfaceDesign}\n`,
  );
}

function addInterfaceInternalLogic(document, groupNumber, logicBody) {
  const prefix = `5.${groupNumber}`;
  return document
    .replace(`#### ${prefix}.5 认证与授权执行`, `#### ${prefix}.6 认证与授权执行`)
    .replace(`#### ${prefix}.4 错误码与异常映射`, `#### ${prefix}.5 错误码与异常映射`)
    .replace(`#### ${prefix}.3 响应字段`, `#### ${prefix}.4 响应字段`)
    .replace(
      `#### ${prefix}.2 请求字段`,
      `#### ${prefix}.2 内部处理逻辑\n\n${logicBody}\n\n#### ${prefix}.3 请求字段`,
    );
}

export function validGroupedSecondaryDetailedDesignWithInternalLogic(secondaryCapabilityId) {
  const createLogic = [
    '该接口由 `CapabilityController.execute` 校验业务单号和登录上下文，随后调用 `CapabilityService.execute` 检查业务单号是否重复；校验通过后在同一事务中由 `OrderMapper.insert` 写入 `order`，并返回新订单的 `id` 与 `status`。重复业务单号或持久化失败时整体回滚，不产生部分订单数据。',
    '',
    '```mermaid',
    'flowchart LR',
    '    A["Web 管理端提交订单"] --> B["CapabilityController.execute 校验请求"]',
    '    B --> C["CapabilityService.execute 检查业务单号"]',
    '    C --> D["OrderMapper.insert 写入 order"]',
    '    D --> E["返回 OrderView 的 id 与 status"]',
    '    C -->|"业务单号重复"| F["返回 400 且不落库"]',
    '```',
  ].join('\n');
  const queryLogic = [
    '该接口由 `CapabilityController.detail` 取得路径参数和登录用户，`CapabilityService.detail` 先校验订单归属，再由 `OrderMapper.selectById` 读取 `order`。记录存在时映射为 `OrderView` 返回；记录不存在或用户无权查看时终止后续处理且不产生数据写入。',
    '',
    '| 步骤 | 内部处理 | 代码对象 | 数据读写 | 失败处理 |',
    '| --- | --- | --- | --- | --- |',
    '| 1 | 解析并校验订单主键 | `CapabilityController.detail` | 无 | 非法主键返回 400 |',
    '| 2 | 校验当前用户对订单的查看权限 | `CapabilityService.detail` | 读取用户上下文 | 无权查看时拒绝请求 |',
    '| 3 | 按主键查询订单并映射响应 | `OrderMapper.selectById` | 读取 `order` | 无记录时返回 404 |',
  ].join('\n');
  return addInterfaceInternalLogic(
    addInterfaceInternalLogic(
      groupedSecondaryDetailedDesignWithoutInternalLogic(secondaryCapabilityId),
      1,
      createLogic,
    ),
    2,
    queryLogic,
  );
}

export function validGroupedSecondaryDetailedDesign(secondaryCapabilityId) {
  return validGroupedSecondaryDetailedDesignWithInternalLogic(secondaryCapabilityId);
}

export function validSecondaryDetailedDesign(secondaryCapabilityId) {
  return validGroupedSecondaryDetailedDesign(secondaryCapabilityId)
    .replace(
      /\n### 5\.2 查询业务接口[\s\S]*$/,
      '',
    )
    .split('\n')
    .filter((line) => !line.includes('| `ORDER_QUERY` |'))
    .join('\n');
}

export function validLevel1CapabilityDetailedDesign(
  level1CapabilityId,
  secondaryCapabilities = [
    { id: 'merchant_governance', name: '入驻申请、审核与门店管理' },
    { id: 'catalog_inventory', name: '分类、品牌、商品、SKU与库存' },
  ],
  dependencyProjection = {},
) {
  const dependencyStatus = dependencyProjection.status ?? 'derived';
  const dependencyRevision = dependencyStatus === 'derived' ? '1' : 'not_derived';
  const dependencyGapId = dependencyStatus === 'derived'
    ? 'not_applicable'
    : (dependencyProjection.gapId ?? 'gap_level1_dependency_graph_derivation');
  const upstreamCapabilityIds = dependencyStatus === 'derived'
    ? (dependencyProjection.upstream ?? []).map((id) => `\`${id}\``).join(', ') || '`[]`'
    : '`not_derived`';
  const downstreamCapabilityIds = dependencyStatus === 'derived'
    ? (dependencyProjection.downstream ?? []).map((id) => `\`${id}\``).join(', ') || '`[]`'
    : '`not_derived`';
  const moduleRows = secondaryCapabilities.map(({ id, name }) => (
    `| \`${id}\` | ${name} | 商户、平台运营人员 | [查看实现细节](secondary-capabilities/${id}/detailed-design.md) |`
  ));
  const journeyRows = secondaryCapabilities.map(({ id, name }) => {
    const apiId = `${id.toUpperCase()}_EXECUTE`;
    return `| \`${apiId}\` | 商户或平台运营人员 | \`${id}\` | ${name} | 完成${name} | 在业务页面提交${name}操作 | \`POST /api/${id}/actions\` | \`src/${id}/CapabilityController.java:10-20#execute\` | \`src/${id}/CapabilityService.java:20-40#execute\` | 读取当前用户与 \`${id}_record\` 状态 | 写入 \`${id}_record\` 并记录处理状态 | 返回业务编号和当前状态 | [查看代码与数据设计](secondary-capabilities/${id}/detailed-design.md) | \`test/${id}/CapabilityFlowTest.java:10-30#executeJourney\` |`;
  });
  const navigationRows = secondaryCapabilities.map(({ id, name }) => (
    `| \`${id}\` | ${name} | [进入二级能力](secondary-capabilities/${id}/detailed-design.md) |`
  ));
  return [
    `# 示例项目 · ${level1CapabilityId} 详细设计说明书`,
    '',
    '> 文档状态：评审中  ',
    `> 能力标识：\`${level1CapabilityId}\`  `,
    '> 用户旅程完整性：`user_journey_design_status=detailed` · `user_journey_coverage=complete` · `user_journey_gap_id=not_applicable`',
    `> 一级能力依赖投影：\`dependency_graph_status=${dependencyStatus}\` · \`dependency_graph_revision=${dependencyRevision}\` · \`dependency_graph_gap_id=${dependencyGapId}\``,
    '',
    '## 1. 能力面向的用户与业务',
    '',
    '本能力面向商户和平台运营人员，说明用户能完成什么业务、如何操作以及系统产生什么结果。',
    '',
    '### 1.1 项目级能力依赖投影',
    '',
    '| 字段 | 内容 | 来源 |',
    '| --- | --- | --- |',
    `| 上游能力 | ${upstreamCapabilityIds} | \`business/level1-capability-dependency-graph.yaml\` |`,
    `| 下游能力 | ${downstreamCapabilityIds} | \`business/level1-capability-dependency-graph.yaml\` |`,
    '',
    '## 2. 模块与业务服务',
    '',
    '| 二级能力/模块 | 提供的业务 | 主要用户 | 实现细节 |',
    '| --- | --- | --- | --- |',
    ...moduleRows,
    '',
    '## 3. 用户业务操作全景',
    '',
    '| `journey_id` | 用户/角色 | 所属二级能力/模块 | 提供的业务 | 用户目标 | 用户怎么操作 | 接口/入口 | Controller/Handler | Service/UseCase | 读取数据 | 写入/产生数据 | 用户可见结果 | 二级能力详情 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...journeyRows,
    '',
    '## 4. 用户操作与系统响应流程',
    '',
    '```mermaid',
    'flowchart LR',
    '    U["用户操作"] --> API["接口接收"] --> S["业务方法处理"] --> D["读取或写入数据"] --> R["返回用户结果"]',
    '```',
    '',
    '## 5. 业务规则、异常与用户反馈',
    '',
    '| 场景 | 用户看到的规则或反馈 | 系统处理边界 |',
    '| --- | --- | --- |',
    '| 正常提交 | 返回业务编号和当前状态 | 具体校验、事务和异常映射在二级能力文档中展开 |',
    '',
    '## 6. 跨模块协作',
    '',
    '跨模块协作只说明业务交接和用户结果，不复制二级能力内部调用细节。',
    '',
    '## 7. 二级能力导航',
    '',
    '| 二级能力 | 业务职责 | 详细设计 |',
    '| --- | --- | --- |',
    ...navigationRows,
    '',
    '## 8. 验收、证据与缺口',
    '',
    '每个模块均可从用户操作追溯到接口、Controller、Service、数据影响和二级能力详细设计。',
    '',
  ].join('\n');
}

export function validLevel1CapabilityDependencyGraph(
  capabilities = [
    { id: 'merchant_operations', name: '商户经营' },
  ],
  edges = [],
  options = {},
) {
  const status = options.status ?? 'derived';
  const revision = status === 'derived' ? (options.revision ?? '1') : 'not_derived';
  const gapId = status === 'derived'
    ? 'not_applicable'
    : (options.gapId ?? 'gap_level1_dependency_graph_derivation');
  const lines = [
    'schema: axis.level1_capability_dependency_graph',
    'schema_version: "0.2"',
    `derivation_status: ${status}`,
    'derivation_method: model_synthesis',
    `derivation_revision: ${revision}`,
    `gap_id: ${gapId}`,
    'nodes:',
    ...capabilities.flatMap(({ id, name }) => [
      `  - level1_capability_id: ${id}`,
      `    level1_capability_name: ${name}`,
    ]),
  ];
  if (edges.length === 0) {
    lines.push('edges: []');
  } else {
    lines.push('edges:');
    for (const edge of edges) {
      lines.push(
        `  - edge_id: ${edge.edgeId ?? `${edge.upstream}_to_${edge.downstream}`}`,
        `    from_level1_capability_id: ${edge.upstream}`,
        `    to_level1_capability_id: ${edge.downstream}`,
        `    relation_type: ${edge.relationType ?? 'business_handoff'}`,
        `    stage: ${edge.stage ?? 'execution'}`,
        `    summary: ${edge.summary ?? '上游能力向下游能力交接业务处理'}`,
        '    journey_ids:',
        `      - ${edge.journeyId ?? 'EXAMPLE_JOURNEY'}`,
        '    api_ids:',
        `      - ${edge.apiId ?? 'EXAMPLE_API'}`,
        '    evidence_refs:',
        `      - ${edge.evidenceRef ?? 'src/example/CapabilityService.java:10-20#execute'}`,
        `    confidence: ${edge.confidence ?? 'high'}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function validPartialLevel1CapabilityDetailedDesign(
  level1CapabilityId,
  secondaryCapabilities,
  options = {},
) {
  const journeyGapId = options.journeyGapId ?? `gap_level1_${level1CapabilityId}_user_journey_coverage`;
  const dependencyGapId = options.dependencyGapId ?? 'gap_level1_dependency_graph_derivation';
  return validLevel1CapabilityDetailedDesign(
    level1CapabilityId,
    secondaryCapabilities,
    { status: 'pending_level1_completion', gapId: dependencyGapId },
  )
    .replace('user_journey_coverage=complete', 'user_journey_coverage=partial')
    .replace('user_journey_gap_id=not_applicable', `user_journey_gap_id=${journeyGapId}`)
    .replace(
      '每个模块均可从用户操作追溯到接口、Controller、Service、数据影响和二级能力详细设计。',
      `${journeyGapId}：仍有未覆盖用户业务操作；已检查当前模块，需补齐入口与代码证据。`,
    );
}
