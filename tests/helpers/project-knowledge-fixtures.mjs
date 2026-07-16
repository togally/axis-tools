export function flatSecondaryDetailedDesign(secondaryCapabilityId) {
  const apiId = `${secondaryCapabilityId.toUpperCase()}_EXECUTE`;
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
    `| \`${apiId}\` | \`${secondaryCapabilityId.toUpperCase()}_EXECUTE\` | \`POST /api/${secondaryCapabilityId}/actions\` | 登录用户与订单归属校验 | \`CreateOrderRequest\` | \`OrderView\` | 参数错误、重复订单 | 业务单号唯一约束与事务 | \`src/${secondaryCapabilityId}/CapabilityController.java:10-20#execute\` | \`src/${secondaryCapabilityId}/CapabilityService.java:20-40#execute\` | \`src/OrderMapper.java:8-12#insert\` | \`order\` | \`test/OrderTest.java:10-30#createOrder\` |`,
    '',
    '### 5.2 请求字段',
    '',
    '| `api_id` | 字段 | 位置 | 类型 | 必填 | 约束 | 业务语义 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    `| \`${apiId}\` | \`orderNo\` | body | \`String\` | 是 | 非空 | 业务订单号 | \`src/CreateOrderRequest.java:8-12#orderNo\` |`,
    '',
    '### 5.3 响应字段',
    '',
    '| `api_id` | 字段 | 类型 | 可空 | 业务语义 | 产生位置 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| \`${apiId}\` | \`id\` | \`Long\` | 否 | 订单主键 | Service 创建后返回 | \`src/OrderView.java:8-12#id\` |`,
    '',
    '### 5.4 错误码与异常映射',
    '',
    '| `api_id` | HTTP/错误码 | 触发条件 | 用户可见语义 | 回滚/补偿 | 代码证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| \`${apiId}\` | \`400\` | 参数校验失败 | 请求无效 | 不落库 | \`src/OrderController.java:10-20#create\` |`,
    '',
  ].join('\n');
}

function groupedSecondaryDetailedDesignWithoutInternalLogic(secondaryCapabilityId) {
  const journeyId = `${secondaryCapabilityId.toUpperCase()}_EXECUTE`;
  const queryJourneyId = `${secondaryCapabilityId.toUpperCase()}_QUERY`;
  const createApiId = journeyId;
  const tableId = `${secondaryCapabilityId}_record`;
  const groupedInterfaceDesign = [
    '## 1. 能力定位与边界',
    '',
    '本能力负责创建和查询当前组织内的业务订单，承接一级业务操作；不负责跨组织订单管理。',
    '',
    '## 2. 调用主体、权限与接口矩阵',
    '',
    '| 主体/角色 | 所需权限/策略 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| Web 管理端用户 | \`authenticated + order:create\` | \`${createApiId}\` | \`POST /api/${secondaryCapabilityId}/actions\` | 当前组织内可创建的订单 | \`src/${secondaryCapabilityId}/CapabilityAuthorization.java:10-18#canCreate\` |`,
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
    `| \`api_id\` | \`${createApiId}\` |`,
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
    `| 实体/表 | \`src/${secondaryCapabilityId}/CapabilityRecord.java:10-30#CapabilityRecord\`；\`table_id=${tableId}\`；物理表 \`${tableId}\` | 承载业务状态和业务单号 |`,
    '| 测试 | `test/OrderTest.java:10-30#createOrder` | 验证创建主路径 |',
    '',
    '#### 5.1.2 请求字段',
    '',
    '| 字段 | 位置 | 类型/必填 | 约束/枚举 | 业务语义/敏感处理 | 证据/状态 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| `orderNo` | body | `String`；必填=是 | 非空 | 业务订单号；非敏感字段 | `src/CreateOrderRequest.java:8-12#orderNo`；已实现 |',
    '',
    '#### 5.1.3 响应字段',
    '',
    '| HTTP/消息/执行状态 | 字段 | 类型/可空 | 业务语义/产生位置 | 证据/状态 |',
    '| --- | --- | --- | --- | --- |',
    '| `200` | `id` | `Long`；可空=否 | 订单主键；Service 创建后返回 | `src/OrderView.java:8-12#id`；已实现 |',
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
    `| \`level1_journey_id\` | \`${queryJourneyId}\` |`,
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
    `| 实体/表 | \`src/${secondaryCapabilityId}/CapabilityRecord.java:10-30#CapabilityRecord\`；\`table_id=${tableId}\`；物理表 \`${tableId}\` | 提供业务详情数据 |`,
    '| 测试 | `test/OrderTest.java:32-45#queryOrder` | 验证详情查询主路径 |',
    '',
    '#### 5.2.2 请求字段',
    '',
    '| 字段 | 位置 | 类型/必填 | 约束/枚举 | 业务语义/敏感处理 | 证据/状态 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| `id` | path | `Long`；必填=是 | 正整数 | 订单主键；非敏感字段 | `src/OrderController.java:22-30#detail`；已实现 |',
    '',
    '#### 5.2.3 响应字段',
    '',
    '| HTTP/消息/执行状态 | 字段 | 类型/可空 | 业务语义/产生位置 | 证据/状态 |',
    '| --- | --- | --- | --- | --- |',
    '| `200` | `status` | `String`；可空=否 | 当前订单状态；Service 查询后返回 | `src/OrderView.java:14-18#status`；已实现 |',
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
  const tableId = `${secondaryCapabilityId}_record`;
  const createLogic = [
    `该接口由 \`CapabilityController.execute\` 校验业务单号和登录上下文，随后调用 \`CapabilityService.execute\` 检查业务单号是否重复；校验通过后在同一事务中由 \`OrderMapper.insert\` 写入 \`${tableId}\`，并返回新记录的 \`id\` 与 \`status\`。重复业务单号或持久化失败时整体回滚，不产生部分业务数据。`,
    '',
    '```mermaid',
    'flowchart LR',
    '    A["CapabilityController.execute()"] -->|"校验请求"| B["CapabilityService.execute()"]',
    '    B -->|"持久化业务记录"| C["OrderMapper.insert()"]',
    '    C -->|"映射响应"| D["OrderView.from()"]',
    '```',
  ].join('\n');
  const queryLogic = [
    `该接口由 \`CapabilityController.detail\` 取得路径参数和登录用户，\`CapabilityService.detail\` 先校验业务归属，再由 \`OrderMapper.selectById\` 读取 \`${tableId}\`。记录存在时映射为 \`OrderView\` 返回；记录不存在或用户无权查看时终止后续处理且不产生数据写入。`,
    '',
    '| 步骤 | 内部处理 | 代码对象 | 数据读写 | 失败处理 |',
    '| --- | --- | --- | --- | --- |',
    '| 1 | 解析并校验订单主键 | `CapabilityController.detail` | 无 | 非法主键返回 400 |',
    '| 2 | 校验当前用户对订单的查看权限 | `CapabilityService.detail` | 读取用户上下文 | 无权查看时拒绝请求 |',
    `| 3 | 按主键查询业务记录并映射响应 | \`OrderMapper.selectById\` | 读取 \`${tableId}\` | 无记录时返回 404 |`,
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
  options = {},
) {
  const includeQueries = options.includeQueries ?? false;
  const crossSecondary = options.crossSecondary ?? false;
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
  const executeStep = ({ id, name }, stepId = `${id}_execute_step`) => ({
    stepId,
    secondaryId: id,
    secondaryName: name,
    apiId: `${id.toUpperCase()}_EXECUTE`,
    interfaceEntry: `POST /api/${id}/actions`,
    controller: `src/${id}/CapabilityController.java:10-20#execute`,
    service: `src/${id}/CapabilityService.java:20-40#execute`,
    readData: `读取当前用户与 \`${id}_record\` 状态`,
    writtenData: `写入 \`${id}_record\` 并记录处理状态`,
    tableId: `${id}_record`,
    evidence: `test/${id}/CapabilityFlowTest.java:10-30#executeJourney`,
  });
  const queryStep = ({ id, name }) => ({
    stepId: `${id}_query_step`,
    secondaryId: id,
    secondaryName: name,
    apiId: 'ORDER_QUERY',
    interfaceEntry: `GET /api/${id}/actions/{id}`,
    controller: `src/${id}/CapabilityController.java:22-30#detail`,
    service: `src/${id}/CapabilityService.java:42-55#detail`,
    readData: `读取 \`${id}_record\` 详情与处理状态`,
    writtenData: '无需写入持久化数据：只读返回当前业务记录',
    tableId: `${id}_record`,
    evidence: `test/${id}/CapabilityFlowTest.java:32-45#queryJourney`,
  });
  const outwardCapabilities = secondaryCapabilities.flatMap((secondary) => {
    const executeApiId = `${secondary.id.toUpperCase()}_EXECUTE`;
    const capabilities = [{
      title: secondary.name,
      journeyId: executeApiId,
      actor: '商户或平台运营人员',
      providedBusiness: secondary.name,
      userGoal: `完成${secondary.name}`,
      userOperation: `在业务页面提交${secondary.name}操作`,
      visibleResult: '返回业务编号和当前状态',
      evidence: `test/${secondary.id}/CapabilityFlowTest.java:10-30#executeJourney`,
      steps: [executeStep(secondary)],
    }];
    if (includeQueries) {
      capabilities.push({
        title: `查询${secondary.name}结果`,
        journeyId: `${secondary.id.toUpperCase()}_QUERY`,
        actor: '商户或平台运营人员',
        providedBusiness: `查询${secondary.name}详情与处理结果`,
        userGoal: `掌握${secondary.name}当前状态`,
        userOperation: `在业务页面打开${secondary.name}详情`,
        visibleResult: '展示业务详情和当前处理状态',
        evidence: `test/${secondary.id}/CapabilityFlowTest.java:32-45#queryJourney`,
        steps: [queryStep(secondary)],
      });
    }
    return capabilities;
  });
  if (crossSecondary && secondaryCapabilities.length > 1) {
    const [firstSecondary, secondSecondary] = secondaryCapabilities;
    const firstExecute = outwardCapabilities.find((capability) => (
      capability.journeyId === `${firstSecondary.id.toUpperCase()}_EXECUTE`
    ));
    if (firstExecute) {
      firstExecute.title = `${firstSecondary.name}并衔接${secondSecondary.name}`;
      firstExecute.providedBusiness = `${firstSecondary.name}并衔接${secondSecondary.name}`;
      firstExecute.userGoal = `连续完成${firstSecondary.name}和${secondSecondary.name}`;
      firstExecute.userOperation = `先提交${firstSecondary.name}，再继续完成${secondSecondary.name}`;
      firstExecute.visibleResult = '返回跨二级能力业务链的编号和最终状态';
      firstExecute.steps.push(executeStep(
        secondSecondary,
        `${firstSecondary.id}_to_${secondSecondary.id}_execute_step`,
      ));
    }
  }
  const outwardCapabilitySections = outwardCapabilities.flatMap((capability, index) => {
    const sectionNumber = index + 1;
    const participatingSecondaryIds = [...new Set(capability.steps.map((step) => step.secondaryId))];
    const graphLines = [];
    capability.steps.forEach((step, stepIndex) => {
      const fromNode = stepIndex === 0
        ? `journey_${capability.journeyId}`
        : `S${stepIndex}_${capability.steps[stepIndex - 1].secondaryId}`;
      const toNode = `S${stepIndex + 1}_${step.secondaryId}`;
      graphLines.push(
        `    ${fromNode}${stepIndex === 0 ? '["发起业务请求"]' : ''} -->|"api_id: ${step.apiId} · ${step.interfaceEntry}"| ${toNode}["${step.secondaryName}"]`,
      );
    });
    const finalStep = capability.steps.at(-1);
    graphLines.push(`    S${capability.steps.length}_${finalStep.secondaryId} --> R["${capability.visibleResult}"]`);
    const stepTables = capability.steps.flatMap((step, stepIndex) => [
      `##### 步骤 ${stepIndex + 1} · ${step.secondaryName}`,
      '',
      '| 项目 | 内容 |',
      '| --- | --- |',
      `| \`step_id\` | \`${step.stepId}\` |`,
      `| \`secondary_capability_id\` | \`${step.secondaryId}\` |`,
      `| \`api_id\` | \`${step.apiId}\` |`,
      `| 接口/入口 | \`${step.interfaceEntry}\` |`,
      `| Controller/Handler | \`${step.controller}\` |`,
      `| Service/UseCase | \`${step.service}\` |`,
      `| 读取数据 | ${step.readData} |`,
      `| 写入/产生数据 | ${step.writtenData} |`,
      `| 读写 \`table_id\` | \`${step.tableId}\` |`,
      `| 二级能力详情 | [查看代码与数据设计](secondary-capabilities/${step.secondaryId}/detailed-design.md) |`,
      `| 证据 | \`${step.evidence}\` |`,
      '',
    ]);
    return [
      `### 3.${sectionNumber} ${capability.title}`,
      '',
      `#### 3.${sectionNumber}.1 业务说明`,
      '',
      '| 项目 | 内容 |',
      '| --- | --- |',
      `| \`journey_id\` | \`${capability.journeyId}\` |`,
      `| 用户/角色 | ${capability.actor} |`,
      `| 提供的业务 | ${capability.providedBusiness} |`,
      `| 用户目标 | ${capability.userGoal} |`,
      `| 用户怎么操作 | ${capability.userOperation} |`,
      `| 用户可见结果 | ${capability.visibleResult} |`,
      `| 参与二级能力 | ${participatingSecondaryIds.map((id) => `\`${id}\``).join(', ')} |`,
      `| 证据 | \`${capability.evidence}\` |`,
      '',
      `#### 3.${sectionNumber}.2 二级能力与接口实现逻辑`,
      '',
      '```mermaid',
      'flowchart LR',
      ...graphLines,
      '```',
      '',
      `#### 3.${sectionNumber}.3 实现步骤`,
      '',
      ...stepTables,
    ];
  });
  const terminologyRows = secondaryCapabilities.map(({ id, name }) => (
    `| ${name}处理状态 | 表示${name}从提交到完成的业务阶段 | 用于用户提交操作、后台处理和结果查询 | 不等同于接口 HTTP 状态；前者描述业务进展，后者描述传输结果 | \`${id}\` | \`src/${id}/CapabilityService.java:20-40#execute\` |`
  ));
  const tableInventoryRows = secondaryCapabilities.map(({ id, name }) => {
    const apiId = `${id.toUpperCase()}_EXECUTE`;
    const relatedApiIds = includeQueries ? `\`${apiId}\`, \`ORDER_QUERY\`` : `\`${apiId}\``;
    return `| \`${id}_record\` | \`${id}_record\` | 保存${name}的业务记录与处理状态 | \`${id}\` | ${relatedApiIds} | \`db/${id}/${id}_record.sql:1-30#createTable\` |`;
  });
  const erEntityRows = secondaryCapabilities.flatMap(({ id }, index) => [
    `    ${id}_record {`,
    '        BIGINT id PK',
    ...(index === 0 ? [] : ['        BIGINT parent_record_id FK']),
    '        VARCHAR status',
    '        TIMESTAMP updated_at',
    '    }',
  ]);
  const erRelationshipRows = secondaryCapabilities.slice(1).map(({ id, name }) => (
    `    ${secondaryCapabilities[0].id}_record ||--o{ ${id}_record : "${name}记录归属于同一条跨二级能力业务链"`
  ));
  const relationshipEvidenceRows = secondaryCapabilities.slice(1).map(({ id, name }) => (
    `| \`relation_${secondaryCapabilities[0].id}_to_${id}\` | \`${secondaryCapabilities[0].id}_record\` -> \`${id}_record\` | \`1:N\` | \`${secondaryCapabilities[0].id}_record.id -> ${id}_record.parent_record_id\` | ${name}记录归属于同一条跨二级能力业务链 | \`db/${id}/${id}_record.sql:3-3#parentRecordId\` |`
  ));
  const relationshipEvidenceSection = secondaryCapabilities.length > 1
    ? [
      '#### 5.2.1 ER 关系证据',
      '',
      '| `relation_id` | 表关系（主 -> 从） | 关系/基数 | 关联键 | 业务语义 | 证据 |',
      '| --- | --- | --- | --- | --- | --- |',
      ...relationshipEvidenceRows,
      '',
    ]
    : [
      '#### 5.2.1 ER 关系证据',
      '',
      'ER 关系证据：not_applicable（单表，无需跨表关系）',
      '',
    ];
  const tableFieldSections = secondaryCapabilities.flatMap(({ id, name }, index) => {
    const apiId = `${id.toUpperCase()}_EXECUTE`;
    const relatedApiIds = includeQueries ? `\`${apiId}\`, \`ORDER_QUERY\`` : `\`${apiId}\``;
    const sectionNumber = index + 3;
    return [
      `### 5.${sectionNumber} \`${id}_record\``,
      '',
      `> 表标识：\`table_id=${id}_record\``,
      '',
      '| 字段 | 类型/可空/默认值 | 键/约束 | 业务语义 | 读写 api_id | 证据 |',
      '| --- | --- | --- | --- | --- | --- |',
      `| \`id\` | \`BIGINT\`；可空=否；默认值=自增 | 主键 | ${name}记录主键 | ${relatedApiIds} | \`db/${id}/${id}_record.sql:2-2#id\` |`,
      ...(index === 0 ? [] : [
        `| \`parent_record_id\` | \`BIGINT\`；可空=否；默认值=无 | FK -> \`${secondaryCapabilities[0].id}_record.id\` | 关联同一业务协作链的上游记录 | ${relatedApiIds} | \`db/${id}/${id}_record.sql:3-3#parentRecordId\` |`,
      ]),
      `| \`status\` | \`VARCHAR(32)\`；可空=否；默认值=\`PENDING\` | 状态值约束 | ${name}当前业务处理状态 | ${relatedApiIds} | \`db/${id}/${id}_record.sql:3-3#status\` |`,
      `| \`updated_at\` | \`TIMESTAMP\`；可空=否；默认值=\`CURRENT_TIMESTAMP\` | 自动更新时间 | ${name}记录最近更新时间 | ${relatedApiIds} | \`db/${id}/${id}_record.sql:4-4#updated_at\` |`,
      '',
    ];
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
    '## 1. 设计结论与能力边界',
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
    '## 2. 二级能力完整性与导航',
    '',
    '| 二级能力/模块 | 提供的业务 | 主要用户 | 实现细节 |',
    '| --- | --- | --- | --- |',
    ...moduleRows,
    '',
    '## 3. 对外业务能力与接口实现',
    '',
    ...outwardCapabilitySections,
    '## 4. 业务语义',
    '',
    '| 专业术语 | 定义 | 适用场景与边界 | 易混淆术语及区别 | 关联二级能力 | 权威来源/证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...terminologyRows,
    '',
    '## 5. 表结构设计',
    '',
    '> 表结构设计完整性：`table_design_status=detailed` · `table_design_coverage=complete` · `table_design_gap_id=not_applicable`',
    '',
    '### 5.1 表清单',
    '',
    '| `table_id` | 物理表名 | 业务实体/用途 | 所属二级能力 | 读写 `api_id` | 证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...tableInventoryRows,
    '',
    '### 5.2 ER 图',
    '',
    '```mermaid',
    'erDiagram',
    ...erEntityRows,
    ...erRelationshipRows,
    '```',
    '',
    ...relationshipEvidenceSection,
    ...tableFieldSections,
    '## 6. 缺口与覆盖说明',
    '',
    '当前用户业务操作、二级能力接口实现、业务术语和表结构均已覆盖；无未覆盖缺口。',
    '',
    '## 7. 文档完整性校验',
    '',
    '| 校验项 | 结果 | 证据 |',
    '| --- | --- | --- |',
    '| 对外业务能力与接口实现 | 通过 | 每项业务均包含业务说明、实现逻辑图和接口实现步骤 |',
    '| 表结构与 ER 关系 | 通过 | 表清单、字段设计与 ER 图一致 |',
    '',
    '## 8. 文档导航与证据索引',
    '',
    '| 二级能力 | 业务职责 | 详细设计 |',
    '| --- | --- | --- |',
    ...navigationRows,
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
      '当前用户业务操作、二级能力接口实现、业务术语和表结构均已覆盖；无未覆盖缺口。',
      `${journeyGapId}：仍有未覆盖用户业务操作；已检查当前模块，需补齐入口与代码证据。`,
    );
}
