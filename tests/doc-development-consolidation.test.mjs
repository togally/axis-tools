import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  flatSecondaryDetailedDesign,
  validGroupedSecondaryDetailedDesign,
  validGroupedSecondaryDetailedDesignWithInternalLogic,
  validLevel1CapabilityDependencyGraph,
  validLevel1CapabilityDetailedDesign,
  validPartialLevel1CapabilityDetailedDesign,
  validSecondaryDetailedDesign,
} from './helpers/project-knowledge-fixtures.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

function businessArchitectureDocument({
  status = 'derived',
  revision = status === 'derived' ? '1' : 'not_derived',
  gapId = status === 'derived' ? 'not_applicable' : 'gap_level1_dependency_graph_derivation',
  capabilities = [{ id: 'merchant_operations', name: '商户经营' }],
  edgeIds = [],
} = {}) {
  return [
    '# 业务架构',
    '',
    `> 依赖图派生状态：\`dependency_graph_status=${status}\` · \`dependency_graph_revision=${revision}\` · \`dependency_graph_gap_id=${gapId}\``,
    '',
    '唯一机器源：`business/level1-capability-dependency-graph.yaml`',
    '',
    ...capabilities.map(({ id, name }) => `[${name}](business/capabilities/${id}/detailed-design.md)`),
    ...(edgeIds.length > 0 ? [
      '',
      '```mermaid',
      'flowchart LR',
      ...edgeIds.map((edgeId) => `    merchant_operations -->|${edgeId}| customer_support`),
      '```',
    ] : []),
    '',
  ].join('\n');
}

const compactSecondaryCapabilities = Array.from({ length: 14 }, (_, index) => ({
  id: `compact_capability_${String(index + 1).padStart(2, '0')}`,
  name: `最小能力 ${String(index + 1).padStart(2, '0')}`,
  businessId: `compact_business_${String(index + 1).padStart(2, '0')}`,
}));

function compactPartialSecondaryDetailedDesign(secondary, index) {
  const suffix = String(index + 1).padStart(2, '0');
  const classStem = `Compact${suffix}`;
  const executeRoute = `/app/compact/${suffix}`;
  const queryRoute = `${executeRoute}/{recordId}`;
  const executeApiId = `COMPACT_${suffix}_EXECUTE`;
  const queryApiId = `COMPACT_${suffix}_QUERY`;
  const navigationLinks = ['[返回能力总览](../../detailed-design.md)'];
  if (index > 0) {
    navigationLinks.push(
      `[上一个二级能力](../${compactSecondaryCapabilities[index - 1].id}/detailed-design.md)`,
    );
  }
  if (index + 1 < compactSecondaryCapabilities.length) {
    navigationLinks.push(
      `[下一个二级能力](../${compactSecondaryCapabilities[index + 1].id}/detailed-design.md)`,
    );
  }
  return [
    `# ${secondary.name}`,
    '',
    '<!-- axis-document-metadata',
    'reader_profile=compact',
    'secondary_reader_contract=participant_flow_interface_v1',
    'document_status=review',
    'revision=1',
    'level1_capability_id=compact_operations',
    `secondary_capability_id=${secondary.id}`,
    `business_ids=${secondary.businessId}`,
    'interface_design_status=detailed interface_coverage=partial interface_gap_id=gap_compact_secondary_traceability',
    '-->',
    '',
    navigationLinks.join(' · '),
    '',
    '## 1. 能力定位与边界',
    '',
    `负责${secondary.name}的独立业务结果；不负责其他能力的状态变更。`,
    `证据：\`${classStem}Controller.java:10-20#execute\`。`,
    '',
    `<!-- axis-evidence: src/compact/${classStem}Controller.java:10-20#execute -->`,
    '',
    '## 2. 参与者、职责与权限',
    '',
    '| 参与者 | 参与类型 | 业务职责 | 参与步骤 | 权限与数据范围 |',
    '| --- | --- | --- | --- | --- |',
    '| 登录会员 | 业务角色 | 提交执行请求并查询本人处理结果 | `S1`、`S4` | 已登录；仅操作和查看当前会员拥有的业务对象 |',
    '| 精简业务能力 | 内部业务能力 | 校验对象归属并记录处理结果 | `S2`、`S3` | 仅在请求所属租户和业务对象范围内执行 |',
    '',
    '<!-- axis-access-matrix-machine-table',
    '| 主体/角色 | 所需权限/策略 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| 登录会员 | authenticated + compact:execute | `' + executeApiId + '` | POST ' + executeRoute + ' | 当前会员可执行的业务对象 | `src/compact/' + classStem + 'Authorization.java:10-18#canExecute` |',
    '| 登录会员 | authenticated + compact:read | `' + queryApiId + '` | GET ' + queryRoute + ' | 当前会员拥有的处理记录 | `src/compact/' + classStem + 'Authorization.java:20-28#canRead` |',
    '-->',
    '',
    '## 3. 能力流程',
    '',
    '```mermaid',
    'flowchart LR',
    `    step_submit_${suffix}["登录会员提交执行请求"] --> step_validate_${suffix}["精简业务能力校验对象归属"]`,
    `    step_validate_${suffix} --> step_record_${suffix}["精简业务能力记录处理结果"]`,
    `    step_record_${suffix} --> step_query_${suffix}["登录会员查询处理结果"]`,
    '```',
    '',
    '| 步骤 | 参与者 | 业务动作 | 前置状态/条件 | 结果/下一状态与下一步 | 失败/补偿 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| `S1` | 登录会员 | 提交最小能力执行请求 | 已登录且业务对象可操作 | 请求已受理；下一步：`S2` | 非法请求直接拒绝且不写入 |',
    '| `S2` | 精简业务能力 | 校验业务对象归属 | 请求已受理 | 归属校验通过；下一步：`S3` | 越权时终止且不写入 |',
    '| `S3` | 精简业务能力 | 记录最小能力处理结果 | 归属校验通过 | 处理结果已形成；下一步：`S4` | 写入失败时事务回滚 |',
    '| `S4` | 登录会员 | 查询最小能力处理结果 | 处理结果已形成 | 结果已向会员展示；下一步：结束 | 不存在或越权时不返回数据 |',
    '',
    '<!-- axis-flow-step-machine-table',
    '| 步骤 | 参与者 | `api_id` | 契约关系 | 证据 |',
    '| --- | --- | --- | --- | --- |',
    '| `S1` | 登录会员 | `' + executeApiId + '` | caller | `src/compact/' + classStem + 'Controller.java:10-20#execute` |',
    '| `S2` | 精简业务能力 | `not_applicable` | not_applicable | `src/compact/' + classStem + 'Service.java:30-36#validateOwnership` |',
    '| `S3` | 精简业务能力 | `not_applicable` | not_applicable | `src/compact/' + classStem + 'Service.java:37-45#recordResult` |',
    '| `S4` | 登录会员 | `' + queryApiId + '` | caller | `src/compact/' + classStem + 'Controller.java:22-30#query` |',
    '-->',
    '',
    '## 4. 对象与规则',
    '',
    `- ${secondary.name}只处理当前登录会员可见的数据。`,
    '- 重复请求按当前业务状态返回，不产生第二份业务记录。',
    '',
    '## 5. 接口摘要',
    '',
    '### 5.1 提交能力执行',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 接口/触发 | POST ${executeRoute} |`,
    `| 业务目的 | 提交${secondary.name}执行请求 |`,
    '| 调用方/参与者 | 登录会员 |',
    '| 前置条件/权限 | 已登录且具有 compact:execute 权限 |',
    `| 关键输入 | ${secondary.name}业务对象标识 |`,
    `| 业务结果/状态变化 | 返回${secondary.name}处理记录标识并形成可查询结果 |`,
    '| 失败/拒绝条件 | 对象不存在、越权或重复状态冲突 |',
    '| 对应流程步骤 | `S1` |',
    '| 实现定位 | `' + classStem + 'Controller.java:10-20#execute` |',
    '',
    '<!-- axis-evidence: src/compact/' + classStem + 'Controller.java:10-20#execute -->',
    '<!-- axis-interface-machine-table',
    '| 项目 | 内容 |',
    '| --- | --- |',
    '| `level1_journey_id` | `journey_compact_' + suffix + '` |',
    '| `flow_id` | `flow_compact_' + suffix + '` |',
    '| `api_id` | `' + executeApiId + '` |',
    '| 契约类型 | HTTP |',
    `| 方法与完整路径或主题 | POST ${executeRoute} |`,
    '| 请求模型 | `' + classStem + 'ExecuteRequest` |',
    '| 响应模型 | `' + classStem + 'ExecuteResult` |',
    '| 状态 | 已实现 |',
    '-->',
    '<!-- axis-implementation-machine-table',
    '| 实现层 | 精确定位 | 职责 |',
    '| --- | --- | --- |',
    '| Controller/入口 | `src/compact/' + classStem + 'Controller.java:10-20#execute` | 接收并校验执行请求 |',
    '| Service/用例 | `src/compact/' + classStem + 'Service.java:30-45#recordResult` | 校验归属并记录处理结果 |',
    '-->',
    '',
    '### 5.2 查询处理结果',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 接口/触发 | GET ${queryRoute} |`,
    `| 业务目的 | 查询${secondary.name}处理结果 |`,
    '| 调用方/参与者 | 登录会员 |',
    '| 前置条件/权限 | 已登录且具有 compact:read 权限 |',
    '| 关键输入 | `recordId` |',
    `| 业务结果/状态变化 | 返回${secondary.name}当前处理状态，不产生写入 |`,
    '| 失败/拒绝条件 | 记录不存在或不属于当前会员 |',
    '| 对应流程步骤 | `S4` |',
    '| 实现定位 | `' + classStem + 'Controller.java:22-30#query` |',
    '',
    '<!-- axis-evidence: src/compact/' + classStem + 'Controller.java:22-30#query -->',
    '<!-- axis-interface-machine-table',
    '| 项目 | 内容 |',
    '| --- | --- |',
    '| `level1_journey_id` | `journey_compact_' + suffix + '` |',
    '| `flow_id` | `flow_compact_' + suffix + '` |',
    '| `api_id` | `' + queryApiId + '` |',
    '| 契约类型 | HTTP |',
    `| 方法与完整路径或主题 | GET ${queryRoute} |`,
    '| 请求模型 | `' + classStem + 'Query` |',
    '| 响应模型 | `' + classStem + 'View` |',
    '| 状态 | 已实现 |',
    '-->',
    '<!-- axis-implementation-machine-table',
    '| 实现层 | 精确定位 | 职责 |',
    '| --- | --- | --- |',
    '| Controller/入口 | `src/compact/' + classStem + 'Controller.java:22-30#query` | 接收查询并返回处理结果 |',
    '| Service/用例 | `src/compact/' + classStem + 'Service.java:47-55#query` | 校验归属并读取处理记录 |',
    '-->',
    '',
    '## 6. 缺口',
    '',
    '覆盖状态为 partial。真实集成测试与全部字段仍需补证；缺口：gap_compact_secondary_traceability。',
    '',
    '<!-- axis-gap-machine-table',
    '| `gap_id` | 范围 | 状态 | 关闭条件 |',
    '| --- | --- | --- | --- |',
    '| `gap_compact_secondary_traceability` | `compact_operations/' + secondary.id + '` | open | 补齐真实集成测试与全部业务字段证据 |',
    '-->',
    '',
    `<!-- axis-evidence: src/compact/${classStem}Controller.java:10-20#execute -->`,
    `<!-- axis-evidence: src/compact/${classStem}Controller.java:22-30#query -->`,
    `<!-- axis-evidence: src/compact/${classStem}Service.java:30-36#validateOwnership -->`,
    `<!-- axis-evidence: src/compact/${classStem}Service.java:37-45#recordResult -->`,
    `<!-- axis-evidence: src/compact/${classStem}Service.java:47-55#query -->`,
    '',
  ].join('\n');
}

function compactPartialLevel1DetailedDesign() {
  const secondaryRows = compactSecondaryCapabilities.map((secondary) => (
    `| ${secondary.name} | 完成${secondary.name} | [查看](secondary-capabilities/${secondary.id}/detailed-design.md) |`
  ));
  const entryRows = compactSecondaryCapabilities.map((secondary, index) => (
    `| ${secondary.name}入口 | \`POST /app/compact/${String(index + 1).padStart(2, '0')}\` | ${secondary.name} | 完成${secondary.name} |`
  ));
  return [
    '# 示例项目 · 精简能力总览',
    '',
    '<!-- axis-document-metadata',
    'reader_profile=compact',
    'secondary_reader_contract=participant_flow_interface_v1',
    'document_status=review',
    'revision=1',
    'level1_capability_id=compact_operations',
    'user_journey_design_status=detailed user_journey_coverage=partial user_journey_gap_id=gap_compact_user_journey_coverage',
    'table_design_status=detailed table_design_coverage=partial table_design_gap_id=gap_compact_table_coverage',
    'dependency_graph_status=pending_level1_completion dependency_graph_revision=not_derived dependency_graph_gap_id=gap_level1_dependency_graph_derivation',
    '-->',
    '',
    '## 1. 能力边界',
    '',
    '负责十四项可独立评审的最小业务结果，不承担其他一级能力的业务状态。',
    '',
    '## 2. 二级能力',
    '',
    '| 二级能力 | 最小业务结果 | 详情 |',
    '| --- | --- | --- |',
    ...secondaryRows,
    '',
    '## 3. 对外业务入口',
    '',
    '| 业务 | 代表入口 | 原子能力 | 用户结果 |',
    '| --- | --- | --- | --- |',
    ...entryRows,
    '',
    '## 4. 原子流程',
    '',
    '```mermaid',
    'flowchart LR',
    '    A["Compact01Controller.execute()"] --> B["Compact01Service.execute()"]',
    '```',
    '',
    '每个节点只表示一个方法。',
    '',
    '## 5. 关键规则',
    '',
    '- 每项二级能力只产生一个可独立验收的业务结果。',
    '- 重复请求不得跨能力修改状态。',
    '',
    '## 6. 证据与缺口',
    '',
    '- `Compact01Controller.java:10-20#execute`',
    '',
    '当前覆盖为 partial，未覆盖入口和表设计需补证：gap_compact_user_journey_coverage、gap_compact_table_coverage。',
    '',
    '<!-- axis-evidence: src/compact/Compact01Controller.java:10-20#execute -->',
    '',
  ].join('\n');
}

const manifest = JSON.parse(await readFile(path.join(repoRoot, 'skills', 'manifest.json'), 'utf8'));
const skillNames = manifest.skills.map((skill) => skill.name);

for (const retiredSkill of [
  'axis-doc-business-domain',
  'axis-doc-db-design',
  'axis-doc-feature-detailed-design',
  'axis-doc-project-knowledge-bootstrap',
  'axis-doc-tech-design',
]) {
  assert.equal(skillNames.includes(retiredSkill), false, `${retiredSkill} should be consolidated out of the top-level skill list`);
}

const development = manifest.skills.find((skill) => skill.name === 'axis-doc-development');
assert.ok(development, 'axis-doc-development should remain the unified document front door');
assert.deepEqual(development.files.sort(), [
  'SKILL.md',
  'agents/openai.yaml',
  'references/discovery-and-master-draft.md',
  'references/document-archive-contract.md',
  'references/feature-detailed-design-template.md',
  'references/feature-resolution-and-lifecycle.md',
  'references/technical-and-database-design.md',
  'scripts/archive_document.py',
]);

const developmentBody = await readFile(path.join(repoRoot, development.path, 'SKILL.md'), 'utf8');
for (const requiredText of [
  'existing_feature_export',
  'planned_feature_generation',
  'implemented_feature_correction',
  'implemented_feature_iteration',
  'Feature Resolution Confirmation Gate',
  'product',
  'architecture',
  'performance',
  'business_flow',
  'database_design',
  'market',
  'master_draft',
  'Expansion Gate',
  'development_document_set',
  'project_knowledge_change_set',
  'level1_capability_id',
  'secondary_capability_id',
  '$axis-doc-project-knowledge',
  'approved',
  'archive',
  'Never call a real OSS upload',
  'FileName:begin-end#symbol',
]) {
  assert.match(developmentBody, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(developmentBody, /Mandatory OSS Synchronization Gate|OSS-first|axis project-knowledge-capture|axis oss-publish/);

const technicalAndDatabaseDesign = await readFile(
  path.join(repoRoot, development.path, 'references', 'technical-and-database-design.md'),
  'utf8',
);
for (const requiredText of [
  'Interface Applicability Gate',
  'interface_design_status',
  'interface_coverage',
  '请求字段',
  '响应字段',
  '错误码与异常映射',
  '认证与授权执行',
  '事务、并发、性能与容错',
  '安全、测试与验收',
  'explicitly requests',
]) {
  assert.match(technicalAndDatabaseDesign, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const projectKnowledge = manifest.skills.find((skill) => skill.name === 'axis-doc-project-knowledge');
assert.ok(projectKnowledge, 'axis-doc-project-knowledge should merge bootstrap and business-domain maintenance');
for (const requiredFile of [
  'SKILL.md',
  'agents/openai.yaml',
  'quick_validate.py',
  'references/project-knowledge-contracts.md',
  'references/secondary-capability-boundary-matrix-v3.1.md',
  'references/secondary-capability-detailed-design-eval-cases.json',
  'references/secondary-capability-detailed-design-template.md',
  'references/secondary-capability-eval-cases.json',
  'scripts/evaluate_secondary_capability_prompts.mjs',
  'scripts/score_secondary_capability_detailed_design.mjs',
]) assert.ok(projectKnowledge.files.includes(requiredFile), `missing project-knowledge bundle file: ${requiredFile}`);
const projectKnowledgeBody = await readFile(path.join(repoRoot, projectKnowledge.path, 'SKILL.md'), 'utf8');
for (const requiredText of [
  'bootstrap',
  'scan_and_reconcile',
  'project_technical_architecture',
  'project_business_architecture',
  'business_inventory',
  'level1_capability_id',
  'secondary_capability_id',
  'one independently reviewable business outcome',
  'reader_profile=compact',
  'six useful sections',
  'does **not** require `3.N`',
  '$axis-tools-prompt-create',
  'OSS Upload Confirmation Gate',
  'exact pair',
]) {
  assert.match(projectKnowledgeBody, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(projectKnowledgeBody, /requirement_design/);
assert.doesNotMatch(projectKnowledgeBody, /one canonical (?:domain )?detailed design per `?business_id`?/i);

const capabilityTemplate = await readFile(
  path.join(repoRoot, projectKnowledge.path, 'references', 'business-capability-detailed-design-template.md'),
  'utf8',
);
for (const requiredText of [
  '# {project_name} · {level1_capability_name} 一级能力接口详情设计',
  'level1_capability_id',
  '对外业务能力与接口实现',
  'user_journey_design_status',
  'user_journey_coverage',
  'user_journey_gap_id',
  'Controller/Handler',
  'Service/UseCase',
  '读取数据',
  '写入/产生数据',
  '用户可见结果',
  'secondary_capabilities',
  'business_id',
  '二级能力完整性与导航',
  '二级能力与接口实现逻辑',
  '业务语义',
  '表结构设计',
  'table_design_status',
  'erDiagram',
  '不得遗漏任何二级能力',
  '二级能力文档',
  '返回业务架构',
  '上一个能力',
  '下一个能力',
]) {
  assert.match(capabilityTemplate, new RegExp(requiredText));
}
for (const fixedTableDesignHeading of [
  '### 5.1 表清单',
  '### 5.2 ER 图',
  '#### 5.2.1 ER 关系证据',
  '### 5.3 `{physical_table_name}`',
]) {
  assert.ok(
    capabilityTemplate.includes(fixedTableDesignHeading),
    `missing fixed level-1 table-design heading: ${fixedTableDesignHeading}`,
  );
}
assert.doesNotMatch(capabilityTemplate, /^###\s+5\.3\s+ER\s*关系证据\s*$/m);
assert.doesNotMatch(capabilityTemplate, /^###\s+5\.3\s+`?\{physical_table_name\}`?\s+字段设计\s*$/m);
assert.doesNotMatch(capabilityTemplate, /^##\s+\d+\.?\s+用户旅程覆盖契约\s*$/m);
assert.doesNotMatch(
  capabilityTemplate,
  /^##\s+\d+\.?\s+(?:用户业务操作全景|跨二级能力用户旅程|共享业务语义与一级治理)\s*$/m,
);
assert.doesNotMatch(
  capabilityTemplate,
  /^\|\s*`journey_id`\s*\|\s*用户\/角色\s*\|\s*所属二级能力\/模块\s*\|/m,
);

const secondaryCapabilityTemplate = await readFile(
  path.join(repoRoot, projectKnowledge.path, 'references', 'secondary-capability-detailed-design-template.md'),
  'utf8',
);
for (const requiredText of [
  '详细设计说明书',
  'secondary_capability_id',
  '返回能力总览',
  '上一个二级能力',
  '下一个二级能力',
  'interface_design_status',
  'interface_coverage',
  '能力级流程与跨接口关系',
  '接口详细设计',
  '5.1.6 认证与授权执行',
  '5.1.7 事务、并发、性能与容错',
  '5.1.8 安全、测试与验收',
  '5.2.6 认证与授权执行',
  '5.2.7 事务、并发、性能与容错',
  '5.2.8 安全、测试与验收',
  '请求字段',
  '响应字段',
  '错误码与异常映射',
  '业务相关字段',
  '{evidence_file_name}:{begin_line}-{end_line}#{symbol}',
]) {
  assert.match(secondaryCapabilityTemplate, new RegExp(requiredText));
}
assert.doesNotMatch(secondaryCapabilityTemplate, /^##\s+\d+\.?\s+代码对象与关系\s*$/m);
for (const legacyTopLevelTitle of [
  '实体、表与对象关系',
  '表结构设计',
  '事务、并发、性能与容错',
  '安全、测试与验收',
  '端到端追溯矩阵',
]) {
  assert.doesNotMatch(
    secondaryCapabilityTemplate,
    new RegExp(`^##\\s+\\d+\\.?\\s+${legacyTopLevelTitle}\\s*$`, 'm'),
  );
}
assert.doesNotMatch(capabilityTemplate, /一级能力详细设计说明书/);

const work = await mkdtemp(path.join(tmpdir(), 'axis-doc-archive-'));
try {
  const canonical = path.join(
    work,
    '.axis',
    'docs',
    'orgs',
    'org_example',
    'projects',
    'example-project',
    'business',
    'capabilities',
    'merchant_operations',
    'detailed-design.md',
  );
  await mkdir(path.dirname(canonical), { recursive: true });
  const original = '# 订单域详细设计\n\n当前正式版本。\n';
  await writeFile(canonical, original, 'utf8');
  const script = path.join(repoRoot, development.path, 'scripts', 'archive_document.py');
  const { stdout } = await execFileAsync('python3', [
    script,
    '--repo', work,
    '--document', canonical,
    '--reason', '迭代订单提交规则',
    '--request-summary', '增加并发提交保护',
    '--source-revision', '2',
    '--target-revision', '3',
  ]);
  const archived = JSON.parse(stdout);
  assert.equal(archived.ok, true);
  assert.equal(await readFile(canonical, 'utf8'), original, 'archiving must not change the current canonical document');
  assert.match(archived.archive_dir, /\.axis\/docs\/_archive\/orgs\/org_example\/projects\/example-project\//);
  assert.equal(await readFile(path.join(work, archived.archive_content), 'utf8'), original);
  const metadata = JSON.parse(await readFile(path.join(work, archived.metadata), 'utf8'));
  assert.equal(metadata.schema, 'axis.document_archive');
  assert.equal(metadata.canonical_path, 'business/capabilities/merchant_operations/detailed-design.md');
  assert.equal(metadata.change_reason, '迭代订单提交规则');
  assert.equal(metadata.source_revision, '2');
  assert.equal(metadata.target_revision, '3');
  assert.match(metadata.content_sha256, /^[a-f0-9]{64}$/);
  const rootMetadataDocument = path.join(
    work,
    '.axis',
    'docs',
    'orgs',
    'org_example',
    'projects',
    'example-project',
    'metadata.yaml',
  );
  await writeFile(rootMetadataDocument, 'revision: 8\n', 'utf8');
  const { stdout: rootMetadataArchiveStdout } = await execFileAsync('python3', [
    script,
    '--repo', work,
    '--document', rootMetadataDocument,
    '--reason', '更新项目知识元数据',
    '--request-summary', '同步一级用户旅程文档修订',
    '--source-revision', '8',
    '--target-revision', '9',
  ]);
  const rootMetadataArchive = JSON.parse(rootMetadataArchiveStdout);
  const rootMetadataArchiveMetadata = JSON.parse(
    await readFile(path.join(work, rootMetadataArchive.metadata), 'utf8'),
  );
  assert.equal(rootMetadataArchiveMetadata.canonical_path, 'metadata.yaml');
} finally {
  await rm(work, { recursive: true, force: true });
}

const capabilityRepo = await mkdtemp(path.join(tmpdir(), 'axis-capability-knowledge-'));
try {
  await mkdir(path.join(capabilityRepo, '.axis', 'docs', 'orgs', 'org_example', 'projects', 'example-project', 'architecture'), { recursive: true });
  await mkdir(path.join(capabilityRepo, '.axis', 'docs', 'orgs', 'org_example', 'projects', 'example-project', 'business', 'capabilities', 'merchant_operations'), { recursive: true });
  await mkdir(path.join(capabilityRepo, '.axis', 'docs', 'orgs', 'org_example', 'projects', 'example-project', 'business', 'capabilities', 'merchant_operations', 'secondary-capabilities', 'merchant_governance'), { recursive: true });
  await mkdir(path.join(capabilityRepo, '.axis', 'docs', 'orgs', 'org_example', 'projects', 'example-project', 'business', 'capabilities', 'merchant_operations', 'secondary-capabilities', 'catalog_inventory'), { recursive: true });
  await mkdir(path.join(capabilityRepo, '.axis', 'docs', 'orgs', 'org_example', 'projects', 'example-project', 'gaps'), { recursive: true });
  await writeFile(path.join(capabilityRepo, '.axis', 'config.yml'), [
    'contract_version: "0.2"',
    'organization:',
    '  id: org_example',
    '  registry: .axis/organizations.yml',
    'project:',
    '  slug: example-project',
    '  display_name: Example Project',
    'package:',
    '  outbox_dir: .axis/outbox',
    'release:',
    '  channel: private_beta',
    '  gate: not_requested',
    'oss:',
    '  provider: aliyun-oss',
    '  profile: private_beta_main',
    'skills:',
    '  project_init: axis-doc-project-init',
    '  coding_capture: axis-code-capture',
    '  test_report: axis-test-report',
    '  oss_publish: axis-ops-oss-publish',
  ].join('\n'), 'utf8');
  await writeFile(path.join(capabilityRepo, '.axis', 'organizations.yml'), [
    'schema: axis.organization_registry',
    'schema_version: "0.2"',
    'organizations:',
    '  - id: org_example',
    '    slug: example',
    '    display_name: Example',
    '    status: active',
    '    oss_profiles:',
    '      - name: private_beta_main',
    '        provider: aliyun-oss',
    '        bucket: example-bucket',
    '        prefix: axis/v0.2',
    '        endpoint_env: TEST_OSS_ENDPOINT',
    '        region_env: TEST_OSS_REGION',
    '        access_key_id_env: TEST_OSS_KEY',
    '        access_key_secret_env: TEST_OSS_SECRET',
    '    products:',
    '      - slug: example-product',
    '        display_name: Example Product',
    '        projects:',
    '          - slug: example-project',
    '            display_name: Example Project',
  ].join('\n'), 'utf8');
  const projectRoot = path.join(capabilityRepo, '.axis', 'docs', 'orgs', 'org_example', 'projects', 'example-project');
  await writeFile(path.join(projectRoot, 'metadata.yaml'), 'document_language: zh-CN\nstatus: review\n', 'utf8');
  await writeFile(path.join(projectRoot, 'architecture', 'technical.md'), '# 技术架构\n', 'utf8');
  const businessArchitecturePath = path.join(projectRoot, 'architecture', 'business.md');
  await writeFile(businessArchitecturePath, businessArchitectureDocument(), 'utf8');
  await writeFile(path.join(projectRoot, 'business', 'inventory.yaml'), [
    'level1_capabilities:',
    '- level1_capability_id: merchant_operations',
    '  level1_capability_name: 商户经营',
    '  secondary_capabilities:',
    '  - secondary_capability_id: merchant_governance',
    '    name: 入驻申请、审核与门店管理',
    '    business_ids:',
    '    - merchant_shop_governance',
    '  - secondary_capability_id: catalog_inventory',
    '    name: 分类、品牌、商品、SKU与库存',
    '    business_ids:',
    '    - product_catalog_inventory',
  ].join('\n'), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    '# 商户经营详细设计\n\n## 二级能力完整性清单\n\n- [`merchant_governance`](secondary-capabilities/merchant_governance/detailed-design.md)：入驻申请、审核与门店管理\n- [`catalog_inventory`](secondary-capabilities/catalog_inventory/detailed-design.md)：分类、品牌、商品、SKU与库存\n',
    'utf8',
  );
  const merchantSecondaryPath = path.join(
    projectRoot,
    'business',
    'capabilities',
    'merchant_operations',
    'secondary-capabilities',
    'merchant_governance',
    'detailed-design.md',
  );
  await writeFile(merchantSecondaryPath, validSecondaryDetailedDesign('merchant_governance'), 'utf8');
  const catalogSecondaryPath = path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'secondary-capabilities', 'catalog_inventory', 'detailed-design.md');
  await writeFile(catalogSecondaryPath, validSecondaryDetailedDesign('catalog_inventory'), 'utf8');
  await writeFile(path.join(projectRoot, 'gaps', 'doc-gap-report.md'), '# 文档缺口\n', 'utf8');
  const archiveRelativeRoot = path.join(
    'business',
    'capabilities',
    'merchant_operations',
    'secondary-capabilities',
    'merchant_governance',
    'detailed-design.md.history',
    '20260713T010000Z-r1-a1b2c3d4',
  );
  const archiveRoot = path.join(
    capabilityRepo,
    '.axis',
    'docs',
    '_archive',
    'orgs',
    'org_example',
    'projects',
    'example-project',
    archiveRelativeRoot,
  );
  await mkdir(archiveRoot, { recursive: true });
  await writeFile(path.join(archiveRoot, 'document.md'), '# 入驻与门店管理历史版本\n', 'utf8');
  await writeFile(path.join(archiveRoot, 'metadata.json'), JSON.stringify({
    schema: 'axis.document_archive',
    organization_id: 'org_example',
    project_slug: 'example-project',
    canonical_path: 'business/capabilities/merchant_operations/secondary-capabilities/merchant_governance/detailed-design.md',
    archive_id: '20260713T010000Z-r1-a1b2c3d4',
    archive_content: 'document.md',
  }), 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-user-journey-a0b1c2d3',
    ]),
    /level-1 capability detailed design missing outward capability implementation: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-missing-level1-graph-a0b1c2d2',
    ]),
    /project knowledge level-1 capability dependency graph missing: business\/level1-capability-dependency-graph\.yaml/,
  );
  const capabilityDependencyGraphPath = path.join(
    projectRoot,
    'business',
    'level1-capability-dependency-graph.yaml',
  );
  await writeFile(
    capabilityDependencyGraphPath,
    validLevel1CapabilityDependencyGraph(),
    'utf8',
  );
  const readerFacingDualTables = validLevel1CapabilityDetailedDesign('merchant_operations')
    .replace(
      '#### 3.1.1 业务说明\n\n| 项目 | 内容 |',
      [
        '#### 3.1.1 业务说明',
        '',
        '| 项目 | 内容 |',
        '| --- | --- |',
        '| 提供的业务 | 入驻申请、审核与门店管理 |',
        '| 用户可见结果 | 返回业务编号和当前状态 |',
        '',
        '<!-- axis-journey-machine-table',
        '| 项目 | 内容 |',
      ].join('\n'),
    )
    .replace(
      '\n\n#### 3.1.2 二级能力与接口实现逻辑',
      '\n-->\n\n#### 3.1.2 二级能力与接口实现逻辑',
    )
    .replace(
      '##### 步骤 1 · 入驻申请、审核与门店管理\n\n| 项目 | 内容 |',
      [
        '##### 步骤 1 · 入驻申请、审核与门店管理',
        '',
        '| 项目 | 内容 |',
        '| --- | --- |',
        '| 接口/入口 | `POST /api/merchant_governance/actions` |',
        '| 业务数据变化 | 写入业务记录并返回处理状态 |',
        '',
        '<!-- axis-step-machine-table',
        '| 项目 | 内容 |',
      ].join('\n'),
    )
    .replace(
      '| 证据 | `test/merchant_governance/CapabilityFlowTest.java:10-30#executeJourney` |\n\n### 3.2',
      '| 证据 | `test/merchant_governance/CapabilityFlowTest.java:10-30#executeJourney` |\n-->\n\n### 3.2',
    );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    readerFacingDualTables,
    'utf8',
  );
  const { stdout: readerFacingDualTablesStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010100Z-project-knowledge-reader-facing-dual-tables-a0b1c306',
  ]);
  assert.equal(JSON.parse(readerFacingDualTablesStdout).ok, true);
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations', undefined, {
      upstream: ['unknown_capability'],
    }),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-graph-projection-a0b1c2d1',
    ]),
    /project knowledge level-1 capability upstream projection mismatches canonical graph: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  const level1JourneyGapId = 'gap_level1_merchant_operations_user_journey_coverage';
  const dependencyGraphGapId = 'gap_level1_dependency_graph_derivation';
  const pendingLevel1Document = validPartialLevel1CapabilityDetailedDesign('merchant_operations');
  await writeFile(businessArchitecturePath, businessArchitectureDocument({
    status: 'pending_level1_completion',
  }), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    pendingLevel1Document,
    'utf8',
  );
  await writeFile(
    capabilityDependencyGraphPath,
    validLevel1CapabilityDependencyGraph(undefined, [], {
      status: 'pending_level1_completion',
      gapId: dependencyGraphGapId,
    }),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'gaps', 'doc-gap-report.md'),
    `# 文档缺口\n\n${level1JourneyGapId}\n\n${dependencyGraphGapId}\n`,
    'utf8',
  );
  await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010100Z-project-knowledge-level1-graph-pending-a0b1c2d0',
  ]);
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    pendingLevel1Document.replace('| 上游能力 | `not_derived` |', '| 上游能力 | `merchant_operations` |'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-graph-pending-projection-a0b1c2cf',
    ]),
    /level-1 capability must keep dependency projection not_derived until global analysis: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    pendingLevel1Document,
    'utf8',
  );
  await writeFile(
    capabilityDependencyGraphPath,
    validLevel1CapabilityDependencyGraph(undefined, [{
      upstream: 'merchant_operations',
      downstream: 'merchant_operations',
    }], {
      status: 'pending_level1_completion',
      gapId: dependencyGraphGapId,
    }),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-graph-pending-edge-a0b1c2ce',
    ]),
    /pending level-1 capability dependency graph must not contain derived edges/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(businessArchitecturePath, businessArchitectureDocument(), 'utf8');
  await writeFile(
    capabilityDependencyGraphPath,
    validLevel1CapabilityDependencyGraph(undefined, [], {
      status: 'pending_level1_completion',
      gapId: dependencyGraphGapId,
    }),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-graph-complete-pending-a0b1c2cd',
    ]),
    /complete level-1 capability set requires a derived dependency graph/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations', undefined, {
      upstream: ['merchant_operations'],
      downstream: ['merchant_operations'],
    }),
    'utf8',
  );
  await writeFile(
    capabilityDependencyGraphPath,
    validLevel1CapabilityDependencyGraph(undefined, [{
      upstream: 'merchant_operations',
      downstream: 'merchant_operations',
    }]),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-graph-self-edge-a0b1c2cc',
    ]),
    /level-1 capability dependency graph contains a self edge: merchant_operations_to_merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(capabilityDependencyGraphPath, validLevel1CapabilityDependencyGraph(), 'utf8');
  await writeFile(path.join(projectRoot, 'gaps', 'doc-gap-report.md'), '# 文档缺口\n', 'utf8');
  const readabilityFeatureDirectory = path.join(
    projectRoot,
    'business',
    'capabilities',
    'merchant_operations',
    'features',
    'table-readability',
  );
  const readabilityFeaturePath = path.join(readabilityFeatureDirectory, 'detailed-design.md');
  const technicalArchitecturePath = path.join(projectRoot, 'architecture', 'technical.md');
  const captureReadabilityFixture = (runId) => execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', runId,
  ]);
  const quickValidatorPath = path.join(
    repoRoot,
    'skills',
    'axis-doc-project-knowledge',
    'quick_validate.py',
  );
  const pythonReadabilityError = async (markdown) => {
    const pythonProgram = [
      'import runpy, sys',
      'module = runpy.run_path(sys.argv[1])',
      'error = module["markdown_table_readability_error"](sys.argv[2], "fixture.md")',
      'print(error or "OK")',
    ].join('\n');
    const { stdout } = await execFileAsync('python3', [
      '-B',
      '-c',
      pythonProgram,
      quickValidatorPath,
      markdown,
    ]);
    return stdout.trim();
  };
  await mkdir(readabilityFeatureDirectory, { recursive: true });
  const screenshotStyleWideTable = [
    '# 技术架构',
    '',
    '| `journey_id` | 用户/角色 | 所属二级能力/模块 | 提供的业务 | 用户目标 | 用户怎么操作 | 接口/入口 | Controller/Handler | Service/UseCase | 读取数据 | 写入/产生数据 | 用户可见结果 | 二级能力详情 | 证据 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| `TRADE_SUBMIT` | 已登录买家 | `order_fulfillment_after_sale` | 提交订单 | 创建交易 | 提交确认页 | `POST /mall/app/trade/submit` | Controller | Service | 预订单 | 交易单 | 支付凭证 | 详细设计 | 代码证据 |',
    '',
  ].join('\n');
  await writeFile(technicalArchitecturePath, screenshotStyleWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020100Z-project-knowledge-screenshot-table-a0b1c400'),
    /Markdown table exceeds 6 columns: architecture\/technical\.md:3 \(14 columns\)/,
  );
  await writeFile(technicalArchitecturePath, '# 技术架构\n', 'utf8');

  await writeFile(readabilityFeaturePath, [
    '# 宽表格可读性验证',
    '',
    '| A | B | C | D | E | F | G |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| 1 | 2 | 3 | 4 | 5 | 6 | 7 |',
    '',
  ].join('\n'), 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020101Z-project-knowledge-wide-table-a0b1c401'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(7 columns\)/,
  );

  const borderlessWideTable = [
    '# 无外框宽表格可读性验证',
    '',
    'A | B | C | D | E | F | G',
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, borderlessWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020102Z-project-knowledge-borderless-wide-table-a0b1c402'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(7 columns\)/,
  );
  assert.match(await pythonReadabilityError(borderlessWideTable), /exceeds 6 columns: fixture\.md:3 \(7 columns\)/);

  for (const [frameTable, runId] of [
    [
      '# 仅左外框宽表格\n\n| A | B | C | D | E | F | G\n| --- | --- | --- | --- | --- | --- | ---\n| 1 | 2 | 3 | 4 | 5 | 6 | 7\n',
      '20260714T020103Z-project-knowledge-left-frame-wide-table-a0b1c403',
    ],
    [
      '# 仅右外框宽表格\n\nA | B | C | D | E | F | G |\n--- | --- | --- | --- | --- | --- | --- |\n1 | 2 | 3 | 4 | 5 | 6 | 7 |\n',
      '20260714T020104Z-project-knowledge-right-frame-wide-table-a0b1c404',
    ],
  ]) {
    await writeFile(readabilityFeaturePath, frameTable, 'utf8');
    await assert.rejects(
      captureReadabilityFixture(runId),
      /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(7 columns\)/,
    );
    assert.match(await pythonReadabilityError(frameTable), /exceeds 6 columns: fixture\.md:3 \(7 columns\)/);
  }

  const ordinaryPipeText = [
    '# 普通竖线文本验证',
    '',
    'A | B 只是普通说明。',
    '下一行 | 不是 Markdown 表格分隔行。',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, ordinaryPipeText, 'utf8');
  const { stdout: ordinaryPipeTextStdout } = await captureReadabilityFixture(
    '20260714T020105Z-project-knowledge-ordinary-pipe-text-a0b1c405',
  );
  assert.equal(JSON.parse(ordinaryPipeTextStdout).ok, true);
  assert.equal(await pythonReadabilityError(ordinaryPipeText), 'OK');

  const blockquoteWideTable = [
    '# 引用块宽表格验证',
    '',
    '> A | B | C | D | E | F | G',
    '> --- | --- | --- | --- | --- | --- | ---',
    '> 1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, blockquoteWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020106Z-project-knowledge-blockquote-wide-table-a0b1c406'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(7 columns\)/,
  );
  assert.match(await pythonReadabilityError(blockquoteWideTable), /exceeds 6 columns: fixture\.md:3 \(7 columns\)/);

  const evenBackslashWideTable = [
    '# 双反斜杠列边界验证',
    '',
    String.raw`A \\| B | C | D | E | F | G`,
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, evenBackslashWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020107Z-project-knowledge-even-backslash-wide-table-a0b1c407'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(7 columns\)/,
  );
  assert.match(await pythonReadabilityError(evenBackslashWideTable), /exceeds 6 columns: fixture\.md:3 \(7 columns\)/);

  const nonRenderedWideTableExamples = [
    '# 非渲染宽表示例验证',
    '',
    '    A | B | C | D | E | F | G',
    '    --- | --- | --- | --- | --- | --- | ---',
    '    1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
    '<!--',
    'A | B | C | D | E | F | G',
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '-->',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, nonRenderedWideTableExamples, 'utf8');
  const { stdout: nonRenderedWideTableStdout } = await captureReadabilityFixture(
    '20260714T020108Z-project-knowledge-non-rendered-wide-table-a0b1c408',
  );
  assert.equal(JSON.parse(nonRenderedWideTableStdout).ok, true);
  assert.equal(await pythonReadabilityError(nonRenderedWideTableExamples), 'OK');

  const inlineCommentWideTable = [
    '# 行内注释宽表格验证',
    '',
    'A | B | C | D | E | F | G <!-- note -->',
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, inlineCommentWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020117Z-project-knowledge-inline-comment-wide-table-a0b1c417'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(7 columns\)/,
  );
  assert.match(await pythonReadabilityError(inlineCommentWideTable), /exceeds 6 columns: fixture\.md:3 \(7 columns\)/);

  const inlineCodeCommentWideTable = [
    '# 行内代码注释标记宽表验证',
    '',
    'A | B | C | D | E | F | `<!--`',
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, inlineCodeCommentWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020122Z-project-knowledge-inline-code-comment-wide-table-a0b1c422'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(7 columns\)/,
  );
  assert.match(await pythonReadabilityError(inlineCodeCommentWideTable), /exceeds 6 columns: fixture\.md:3 \(7 columns\)/);

  const fencedCommentThenWideTable = [
    '# 围栏注释状态隔离验证',
    '',
    '```markdown',
    '<!--',
    '```',
    '',
    'A | B | C | D | E | F | G',
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, fencedCommentThenWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020118Z-project-knowledge-fenced-comment-wide-table-a0b1c418'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:7 \(7 columns\)/,
  );
  assert.match(await pythonReadabilityError(fencedCommentThenWideTable), /exceeds 6 columns: fixture\.md:7 \(7 columns\)/);

  const blockquoteCommentThenWideTable = [
    '# 引用注释状态隔离验证',
    '',
    '> <!--',
    'A | B | C | D | E | F | G',
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, blockquoteCommentThenWideTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020121Z-project-knowledge-blockquote-comment-wide-table-a0b1c421'),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:4 \(7 columns\)/,
  );
  assert.match(await pythonReadabilityError(blockquoteCommentThenWideTable), /exceeds 6 columns: fixture\.md:4 \(7 columns\)/);

  for (const [nonTableBody, runId] of [
    [
      '# 引用层级不拼表\n\nA | B\n> --- | ---\n> 1 | 2\n',
      '20260714T020119Z-project-knowledge-quote-depth-a0b1c419',
    ],
    [
      '# 表后标题边界\n\nA | B\n--- | ---\n1 | 2\n# 后续标题 | 不是数据行\n',
      '20260714T020120Z-project-knowledge-heading-boundary-a0b1c420',
    ],
    [
      '# 表后围栏边界\n\nA | B\n--- | ---\n1 | 2\n```text | option | extra\ncode\n```\n',
      '20260714T020123Z-project-knowledge-fence-boundary-a0b1c423',
    ],
    [
      '# 列表围栏宽表示例\n\n- ```markdown\n  A | B | C | D | E | F | G\n  --- | --- | --- | --- | --- | --- | ---\n  1 | 2 | 3 | 4 | 5 | 6 | 7\n  ```\n',
      '20260714T020124Z-project-knowledge-list-fence-a0b1c424',
    ],
  ]) {
    await writeFile(readabilityFeaturePath, nonTableBody, 'utf8');
    const { stdout } = await captureReadabilityFixture(runId);
    assert.equal(JSON.parse(stdout).ok, true);
    assert.equal(await pythonReadabilityError(nonTableBody), 'OK');
  }

  await writeFile(readabilityFeaturePath, [
    '# 六列表格可读性验证',
    '',
    '| A | B | C | D | E | F |',
    '| --- | --- | --- | --- | --- | --- |',
    '| 1 | 2 | 3 | 4 | 5 | 6 |',
    '',
  ].join('\n'), 'utf8');
  const { stdout: sixColumnTableStdout } = await captureReadabilityFixture(
    '20260714T020109Z-project-knowledge-six-column-table-a0b1c409',
  );
  assert.equal(JSON.parse(sixColumnTableStdout).ok, true);

  await writeFile(readabilityFeaturePath, [
    '# 空表头验证',
    '',
    '| A | | C |',
    '| --- | --- | --- |',
    '| 1 | 2 | 3 |',
    '',
  ].join('\n'), 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020110Z-project-knowledge-empty-header-a0b1c410'),
    /Markdown table has an empty header cell: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(column 2\)/,
  );

  await writeFile(readabilityFeaturePath, [
    '# 表头与分隔行错列验证',
    '',
    '| A | B | C |',
    '| --- | --- |',
    '| 1 | 2 | 3 |',
    '',
  ].join('\n'), 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020111Z-project-knowledge-separator-columns-a0b1c411'),
    /Markdown table header\/separator column mismatch: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:3 \(header=3, separator=2\)/,
  );

  const shortSeparatorTable = [
    '# 过短分隔线验证',
    '',
    '| A | B |',
    '| -- | -- |',
    '| 1 | 2 |',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, shortSeparatorTable, 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020112Z-project-knowledge-short-separator-a0b1c412'),
    /Markdown table has an invalid separator: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:4/,
  );
  assert.match(await pythonReadabilityError(shortSeparatorTable), /invalid separator: fixture\.md:4/);

  await writeFile(readabilityFeaturePath, [
    '# 数据行错列验证',
    '',
    '| A | B | C |',
    '| --- | --- | --- |',
    '| 1 | 2 |',
    '',
  ].join('\n'), 'utf8');
  await assert.rejects(
    captureReadabilityFixture('20260714T020113Z-project-knowledge-data-columns-a0b1c413'),
    /Markdown table data row column mismatch: business\/capabilities\/merchant_operations\/features\/table-readability\/detailed-design\.md:5 \(header=3, row=2\)/,
  );

  const fencedWideTable = [
    '# 代码围栏宽表格验证',
    '',
    '```markdown',
    '| A | B | C | D | E | F | G |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| 1 | 2 | 3 | 4 | 5 | 6 | 7 |',
    '```',
    '',
  ].join('\n');
  await writeFile(readabilityFeaturePath, fencedWideTable, 'utf8');
  const { stdout: fencedWideTableStdout } = await captureReadabilityFixture(
    '20260714T020114Z-project-knowledge-fenced-wide-table-a0b1c414',
  );
  assert.equal(JSON.parse(fencedWideTableStdout).ok, true);
  assert.equal(await pythonReadabilityError(fencedWideTable), 'OK');

  await writeFile(path.join(archiveRoot, 'document.md'), [
    '# 归档宽表格保留',
    '',
    '| A | B | C | D | E | F | G | H |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |',
    '',
  ].join('\n'), 'utf8');
  const { stdout: archivedWideTableStdout } = await captureReadabilityFixture(
    '20260714T020115Z-project-knowledge-archive-wide-table-a0b1c415',
  );
  assert.equal(JSON.parse(archivedWideTableStdout).ok, true);
  const nestedArchiveDirectory = path.join(
    projectRoot,
    'business',
    'capabilities',
    'merchant_operations',
    '_archive',
  );
  await mkdir(nestedArchiveDirectory, { recursive: true });
  await writeFile(path.join(nestedArchiveDirectory, 'wide-history.md'), [
    '# 嵌套归档宽表格保留',
    '',
    'A | B | C | D | E | F | G',
    '--- | --- | --- | --- | --- | --- | ---',
    '1 | 2 | 3 | 4 | 5 | 6 | 7',
    '',
  ].join('\n'), 'utf8');
  const { stdout: nestedArchiveWideTableStdout } = await captureReadabilityFixture(
    '20260714T020116Z-project-knowledge-nested-archive-wide-table-a0b1c416',
  );
  assert.equal(JSON.parse(nestedArchiveWideTableStdout).ok, true);
  await rm(readabilityFeatureDirectory, { recursive: true, force: true });
  const validLevel1WithOutwardCapabilities = validLevel1CapabilityDetailedDesign('merchant_operations');
  const merchantJourneyRow = validLevel1WithOutwardCapabilities
    .split('\n')
    .find((line) => line === '| `journey_id` | `MERCHANT_GOVERNANCE_EXECUTE` |');
  assert.ok(merchantJourneyRow);
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1WithOutwardCapabilities.replace(
      merchantJourneyRow,
      '| `journey_id` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-missing-level1-summary-a0b1c2dc',
    ]),
    /Markdown table data row column mismatch: business\/capabilities\/merchant_operations\/detailed-design\.md:\d+ \(header=2, row=1\)/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  const level1WithoutGraphApi = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    'api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions',
    'api_id: OMITTED_FROM_GRAPH · POST /api/merchant_governance/actions',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    level1WithoutGraphApi,
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-graph-node-a0b1c2df',
    ]),
    /level-1 outward capability diagram must place api_id and interface on one edge: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE\/merchant_governance_execute_step/,
  );
  const level1WithApiAndInterfaceNodes = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    '    journey_MERCHANT_GOVERNANCE_EXECUTE["发起业务请求"] -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S1_merchant_governance["入驻申请、审核与门店管理"]',
    [
      '    journey_MERCHANT_GOVERNANCE_EXECUTE["发起业务请求"] --> A["api_id: MERCHANT_GOVERNANCE_EXECUTE"]',
      '    A --> I["POST /api/merchant_governance/actions"]',
      '    I --> S1_merchant_governance["入驻申请、审核与门店管理"]',
    ].join('\n'),
  );
  assert.doesNotMatch(
    level1WithApiAndInterfaceNodes,
    /--\>\|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST \/api\/merchant_governance\/actions"\|/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    level1WithApiAndInterfaceNodes,
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-api-interface-nodes-a0b1c2ed',
    ]),
    /level-1 outward capability diagram uses api_id or interface as a node: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE\/merchant_governance_execute_step/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      '#### 3.1.2 二级能力与接口实现逻辑',
      '#### 3.1.2 跨二级能力用户旅程',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-subsection-title-a0b1c2ee',
    ]),
    /level-1 outward capability has invalid fixed subsection structure: merchant_operations\/1/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('读取当前用户与 `merchant_governance_record` 状态', '读取 `none`'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-placeholder-data-a0b1c2e1',
    ]),
    /level-1 capability user journey missing concrete read data: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('CapabilityController.java:10-20#execute', 'CapabilityController.java:20-10#execute'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-reversed-anchor-a0b1c2e0',
    ]),
    /level-1 capability user journey missing exact Controller\/Handler anchor: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace(
        '| 提供的业务 | 入驻申请、审核与门店管理 |',
        '| 提供的业务 | 入驻申请\\|审核与门店管理 |',
      ),
    'utf8',
  );
  await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010100Z-project-knowledge-escaped-level1-pipe-a0b1c2de',
  ]);
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('`POST /api/merchant_governance/actions`', '现有入口集合'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-generic-level1-journey-a0b1c2d4',
    ]),
    /level-1 capability user journey uses generic interface placeholder: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    [
      validLevel1CapabilityDetailedDesign('merchant_operations', [
        { id: 'merchant_governance', name: '入驻申请、审核与门店管理' },
      ]),
      '## 9. 补充导航',
      '',
      '[`catalog_inventory`](secondary-capabilities/catalog_inventory/detailed-design.md)：分类、品牌、商品、SKU与库存',
      '',
    ].join('\n'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-module-coverage-a0b1c2d5',
    ]),
    /level-1 capability user journeys omit secondary capability: merchant_operations\/catalog_inventory/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('src/merchant_governance/CapabilityController.java:10-20#execute', 'CapabilityController#execute'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-controller-anchor-a0b1c2d6',
    ]),
    /level-1 capability user journey missing exact Controller\/Handler anchor: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('读取当前用户与 `merchant_governance_record` 状态', '读取相关数据'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-read-data-a0b1c2d7',
    ]),
    /level-1 capability user journey missing concrete read data: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('[查看代码与数据设计](secondary-capabilities/merchant_governance/detailed-design.md)', '详见二级文档'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-child-link-a0b1c2d8',
    ]),
    /level-1 capability user journey omits secondary capability link: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('user_journey_coverage=complete', 'user_journey_coverage=partial'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-partial-gap-a0b1c2d9',
    ]),
    /level-1 capability partial user journey coverage requires an explicit gap: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('user_journey_coverage=complete', 'user_journey_coverage=partial')
      .replace('user_journey_gap_id=not_applicable', 'user_journey_gap_id=gap_missing_user_operations'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-gap-details-a0b1c2e4',
    ]),
    /level-1 capability partial user journey gap is not traced in overview and gap report: merchant_operations\/gap_missing_user_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace('`CATALOG_INVENTORY_EXECUTE`', '`MERCHANT_GOVERNANCE_EXECUTE`'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-duplicate-journey-a0b1c2da',
    ]),
    /level-1 capability user journey has duplicate journey_id: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance')
      .replaceAll('MERCHANT_GOVERNANCE_EXECUTE', 'UNRELATED_FLOW'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-cross-level-journey-a0b1c2db',
    ]),
    /secondary capability detailed design omits level-1 journey_id: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance'),
    'utf8',
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance')
      .replace('| `api_id` | `MERCHANT_GOVERNANCE_EXECUTE` |', '| `api_id` | `missing_evidence` |'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-cross-level-trace-binding-a0b1c2dd',
    ]),
    /secondary capability interface group has invalid api_id: merchant_operations\/merchant_governance\/5\.1/,
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance'),
    'utf8',
  );
  const validMerchantSecondary = validGroupedSecondaryDetailedDesign('merchant_governance');
  const secondInterfaceStart = validMerchantSecondary.indexOf('### 5.2 查询业务接口');
  assert.ok(secondInterfaceStart > 0);
  const merchantWithUnlistedJourney = `${validMerchantSecondary.slice(0, secondInterfaceStart)}${validMerchantSecondary
    .slice(secondInterfaceStart)
    .replace('`MERCHANT_GOVERNANCE_EXECUTE`', '`MERCHANT_GOVERNANCE_QUERY`')}`;
  await writeFile(
    merchantSecondaryPath,
    merchantWithUnlistedJourney,
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-unlisted-child-journey-a0b1c2e2',
    ]),
    /secondary capability detailed design contains journey_id absent from level-1 outward capabilities: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_QUERY/,
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance'),
    'utf8',
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance')
      .replace(
        'interface_coverage=complete',
        'interface_coverage=partial` · `interface_gap_id=gap_more_user_operations',
      ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-complete-parent-partial-child-a0b1c2e3',
    ]),
    /level-1 complete user journey coverage conflicts with partial secondary interface coverage: merchant_operations\/merchant_governance/,
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance'),
    'utf8',
  );
  const duplicateControlDocument = validLevel1CapabilityDetailedDesign('merchant_operations');
  const journeyControlLine = duplicateControlDocument
    .split('\n')
    .find((line) => line.includes('user_journey_design_status=detailed'));
  assert.ok(journeyControlLine);
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    duplicateControlDocument.replace(journeyControlLine, `${journeyControlLine}\n${journeyControlLine}`),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-duplicate-control-a0b1c2e5',
    ]),
    /level-1 capability detailed design requires one user journey control line: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      /## 5\. 表结构设计[\s\S]*?(?=## 6\. 缺口与覆盖说明)/,
      '',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-table-design-a0b1c2e7',
    ]),
    /level-1 capability detailed design missing fixed section 5\. 表结构设计: merchant_operations/,
  );
  const validLevel1WithEr = validLevel1CapabilityDetailedDesign('merchant_operations');
  const level1ErDiagram = validLevel1WithEr.match(/```mermaid\nerDiagram[\s\S]*?```/)?.[0];
  assert.ok(level1ErDiagram);
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1WithEr.replace(
      level1ErDiagram,
      level1ErDiagram.replaceAll('catalog_inventory_record', 'catalog_inventory_omitted'),
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-coverage-a0b1c2e8',
    ]),
    /level-1 capability ER diagram omits table: merchant_operations\/catalog_inventory_record/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      /### 5\.4 `catalog_inventory_record`[\s\S]*?(?=## 6\. 缺口与覆盖说明)/,
      '',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-table-fields-a0b1c2e9',
    ]),
    /level-1 capability table inventory and field structures differ: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      '#### 5.2.1 ER 关系证据',
      '### 5.3 ER 关系证据',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-subsection-a0b1c2ea',
    ]),
    /level-1 capability table design has invalid fixed subsection structure: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      '### 5.3 `merchant_governance_record`',
      '### 5.3 `merchant_governance_record` 字段设计',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-table-title-a0b1c2eb',
    ]),
    /level-1 capability table field section title mismatches physical table: merchant_operations\/merchant_governance_record/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      '### 5.4 `catalog_inventory_record`',
      '### 5.5 `catalog_inventory_record`',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-table-numbering-a0b1c2ec',
    ]),
    /level-1 capability table design has invalid fixed subsection structure: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      '| 读写 `table_id` | `merchant_governance_record` |',
      '| 读写 `table_id` | `merchant_governance_record`, `merchant_governance_audit` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-step-table-set-a0b1c2f0',
    ]),
    /level-1 capability step table_id set and table inventory differ: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      'merchant_governance_record.id -> catalog_inventory_record.parent_record_id',
      'merchant_governance_record.id -> catalog_inventory_record.missing_parent_id',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-key-a0b1c2f1',
    ]),
    /level-1 capability ER relationship key mismatches fields: merchant_operations\/relation_merchant_governance_to_catalog_inventory/,
  );
  const notApplicableTableDesign = [
    '## 5. 表结构设计',
    '',
    '> 表结构设计完整性：`table_design_status=not_applicable` · `table_design_coverage=not_applicable` · `table_design_gap_id=not_applicable`',
    '',
    '### 5.1 不适用说明',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    '| `table_design_status` | `not_applicable` |',
    '| 原因 | 当前能力仅编排外部服务，不产生本地持久化数据 |',
    '| 证据 | `src/merchant_governance/CapabilityService.java:20-40#execute` |',
    '',
  ].join('\n');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      /## 5\. 表结构设计[\s\S]*?(?=## 6\. 缺口与覆盖说明)/,
      `${notApplicableTableDesign}\n`,
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-table-not-applicable-a0b1c2f2',
    ]),
    /level-1 capability table design not_applicable conflicts with persisted table trace: merchant_operations/,
  );
  const singleSecondaryCapabilities = [
    { id: 'merchant_governance', name: '入驻申请、审核与门店管理' },
  ];
  await writeFile(path.join(projectRoot, 'business', 'inventory.yaml'), [
    'level1_capabilities:',
    '- level1_capability_id: merchant_operations',
    '  level1_capability_name: 商户经营',
    '  secondary_capabilities:',
    '  - secondary_capability_id: merchant_governance',
    '    name: 入驻申请、审核与门店管理',
    '    business_ids:',
    '    - merchant_shop_governance',
  ].join('\n'), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations', singleSecondaryCapabilities).replace(
      'ER 关系证据：not_applicable（单表，无需跨表关系）',
      '当前只有一张表。',
    ),
    'utf8',
  );
  await writeFile(merchantSecondaryPath, validSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-single-table-er-a0b1c2f3',
    ]),
    /level-1 capability single-table design must declare ER relationship not_applicable: merchant_operations/,
  );
  await writeFile(path.join(projectRoot, 'business', 'inventory.yaml'), [
    'level1_capabilities:',
    '- level1_capability_id: merchant_operations',
    '  level1_capability_name: 商户经营',
    '  secondary_capabilities:',
    '  - secondary_capability_id: merchant_governance',
    '    name: 入驻申请、审核与门店管理',
    '    business_ids:',
    '    - merchant_shop_governance',
    '  - secondary_capability_id: catalog_inventory',
    '    name: 分类、品牌、商品、SKU与库存',
    '    business_ids:',
    '    - product_catalog_inventory',
  ].join('\n'), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      '## 3. 对外业务能力与接口实现',
      '## 3. 用户业务操作全景',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-legacy-flat-a0b1c2ea',
    ]),
    /level-1 capability detailed design uses a legacy flat or separate cross-capability section: merchant_operations/,
  );
  const merchantLevel1DetailedDesignPath = path.join(
    projectRoot,
    'business',
    'capabilities',
    'merchant_operations',
    'detailed-design.md',
  );
  const legacyHorizontalJourneyTable = [
    '| `journey_id` | 用户/角色 | 所属二级能力/模块 | 接口/入口 | 用户可见结果 |',
    '| --- | --- | --- | --- | --- |',
    '| `LEGACY_MERCHANT_FLOW` | 商户 | `merchant_governance` | `POST /api/merchant_governance/actions` | 返回审核结果 |',
    '',
  ].join('\n');
  await writeFile(
    merchantLevel1DetailedDesignPath,
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      '## 3. 对外业务能力与接口实现\n',
      `## 3. 对外业务能力与接口实现\n\n${legacyHorizontalJourneyTable}`,
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-legacy-horizontal-a0b1c2f4',
    ]),
    /level-1 outward capability section contains a legacy flat list: merchant_operations/,
  );

  const disconnectedCrossSecondaryGraph = validLevel1CapabilityDetailedDesign(
    'merchant_operations',
    undefined,
    {},
    { crossSecondary: true },
  ).replace(
    '    S1_merchant_governance -->|"api_id: CATALOG_INVENTORY_EXECUTE · POST /api/catalog_inventory/actions"| S2_catalog_inventory["分类、品牌、商品、SKU与库存"]',
    '    S1_ALIAS_merchant_governance["入驻申请、审核与门店管理"] -->|"api_id: CATALOG_INVENTORY_EXECUTE · POST /api/catalog_inventory/actions"| S2_catalog_inventory["分类、品牌、商品、SKU与库存"]',
  );
  await writeFile(merchantLevel1DetailedDesignPath, disconnectedCrossSecondaryGraph, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-disconnected-cross-secondary-a0b1c2f5',
    ]),
    /level-1 outward capability diagram step order or secondary nodes mismatch: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE\/merchant_governance_to_catalog_inventory_execute_step/,
  );

  const level1GraphWithoutUserStart = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    'journey_MERCHANT_GOVERNANCE_EXECUTE["发起业务请求"]',
    'unbound_entry["发起业务请求"]',
  );
  await writeFile(merchantLevel1DetailedDesignPath, level1GraphWithoutUserStart, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-missing-user-start-a0b1c2f6',
    ]),
    /level-1 outward capability diagram step order or secondary nodes mismatch: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE\/merchant_governance_execute_step/,
  );

  const level1GraphWithMixedMethodNode = [
    'reader_profile=strict_full',
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      'S1_merchant_governance["入驻申请、审核与门店管理"]',
      'S1_merchant_governance["CapabilityController.execute()：处理入驻申请"]',
    ),
  ].join('\n');
  await writeFile(merchantLevel1DetailedDesignPath, level1GraphWithMixedMethodNode, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-mixed-method-node-a0b1c305',
    ]),
    /level-1 outward capability diagram mixes business and method nodes: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );

  const level1GraphWithoutVisibleResult = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    'S1_merchant_governance --> R["返回业务编号和当前状态"]',
    'S1_merchant_governance --> R["内部处理结束"]',
  );
  await writeFile(merchantLevel1DetailedDesignPath, level1GraphWithoutVisibleResult, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-missing-visible-result-a0b1c2f7',
    ]),
    /level-1 outward capability diagram does not end at the user-visible result: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );

  const level1GraphWithDisconnectedBranch = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    '    S1_merchant_governance --> R["返回业务编号和当前状态"]',
    [
      '    S1_merchant_governance --> R["返回业务编号和当前状态"]',
      '    X["旁路开始"] --> Y["旁路结束"]',
    ].join('\n'),
  );
  await writeFile(merchantLevel1DetailedDesignPath, level1GraphWithDisconnectedBranch, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-disconnected-branch-a0b1c2ff',
    ]),
    /level-1 outward capability diagram contains a disconnected branch: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );

  const commentOnlyErDiagram = [
    '```mermaid',
    'erDiagram',
    '    %% merchant_governance_record {',
    '    %%     BIGINT id PK',
    '    %% }',
    '    %% catalog_inventory_record {',
    '    %%     BIGINT id PK',
    '    %% }',
    '    %% merchant_governance_record ||--o{ catalog_inventory_record : "业务协作"',
    '```',
  ].join('\n');
  await writeFile(
    merchantLevel1DetailedDesignPath,
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      /```mermaid\nerDiagram[\s\S]*?```/,
      commentOnlyErDiagram,
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-comment-forgery-a0b1c2f8',
    ]),
    /level-1 capability ER diagram omits table: merchant_operations\/merchant_governance_record/,
  );

  await writeFile(
    merchantLevel1DetailedDesignPath,
    validLevel1CapabilityDetailedDesign('merchant_operations').replace(
      'merchant_governance_record ||--o{ catalog_inventory_record : "分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链"',
      'merchant_governance_record ||--|| catalog_inventory_record : "分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链"',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-cardinality-a0b1c2f9',
    ]),
    /level-1 capability ER diagram omits evidenced relationship: merchant_operations\/relation_merchant_governance_to_catalog_inventory/,
  );

  const level1ErWithGhostEntity = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    '    merchant_governance_record ||--o{ catalog_inventory_record : "分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链"',
    [
      '    ghost_audit_record {',
      '        BIGINT id PK',
      '    }',
      '    merchant_governance_record ||--o{ catalog_inventory_record : "分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链"',
    ].join('\n'),
  );
  await writeFile(merchantLevel1DetailedDesignPath, level1ErWithGhostEntity, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-ghost-entity-a0b1c300',
    ]),
    /level-1 capability ER diagram contains an entity absent from table inventory: merchant_operations/,
  );

  const level1ErWithUnevidencedRelationship = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    '    merchant_governance_record ||--o{ catalog_inventory_record : "分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链"',
    [
      '    merchant_governance_record ||--o{ catalog_inventory_record : "分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链"',
      '    catalog_inventory_record ||--|| merchant_governance_record : "额外镜像关系"',
    ].join('\n'),
  );
  await writeFile(merchantLevel1DetailedDesignPath, level1ErWithUnevidencedRelationship, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-unevidenced-relation-a0b1c301',
    ]),
    /level-1 capability ER diagram contains an unevidenced relationship: merchant_operations/,
  );

  const level1ErWithMismatchedRelationshipSemantics = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    'catalog_inventory_record : "分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链"',
    'catalog_inventory_record : "仅用于展示的错误关系语义"',
  );
  await writeFile(merchantLevel1DetailedDesignPath, level1ErWithMismatchedRelationshipSemantics, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-er-semantics-a0b1c302',
    ]),
    /level-1 capability ER diagram omits evidenced relationship: merchant_operations\/relation_merchant_governance_to_catalog_inventory/,
  );

  const level1WithReversedFieldSections = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    /(### 5\.3 `merchant_governance_record`[\s\S]*?)(### 5\.4 `catalog_inventory_record`[\s\S]*?)(?=## 6\. 缺口与覆盖说明)/,
    (_matched, merchantFieldSection, catalogFieldSection) => (
      `${catalogFieldSection.replace('### 5.4', '### 5.3')}${merchantFieldSection.replace('### 5.3', '### 5.4')}`
    ),
  );
  assert.notEqual(
    level1WithReversedFieldSections,
    validLevel1CapabilityDetailedDesign('merchant_operations'),
  );
  await writeFile(merchantLevel1DetailedDesignPath, level1WithReversedFieldSections, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-reversed-field-order-a0b1c303',
    ]),
    /level-1 capability table field sections do not follow inventory order: merchant_operations\/catalog_inventory_record/,
  );

  const validSemanticsDocument = validLevel1CapabilityDetailedDesign('merchant_operations');
  const merchantStatusTermRow = validSemanticsDocument
    .split('\n')
    .find((line) => line.startsWith('| 入驻申请、审核与门店管理处理状态 |'));
  assert.ok(merchantStatusTermRow);
  await writeFile(
    merchantLevel1DetailedDesignPath,
    validSemanticsDocument.replace(merchantStatusTermRow, `${merchantStatusTermRow}\n${merchantStatusTermRow}`),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-duplicate-term-a0b1c2fa',
    ]),
    /level-1 capability business semantics has generic term: merchant_operations/,
  );

  const extraGovernanceTable = [
    '| 治理对象 | 治理规则 |',
    '| --- | --- |',
    '| 接口发布 | 统一审批 |',
    '',
  ].join('\n');
  await writeFile(
    merchantLevel1DetailedDesignPath,
    validSemanticsDocument.replace(
      '## 5. 表结构设计',
      `${extraGovernanceTable}## 5. 表结构设计`,
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-extra-governance-table-a0b1c2fb',
    ]),
    /level-1 capability business semantics missing terminology rows: merchant_operations/,
  );

  await writeFile(
    merchantLevel1DetailedDesignPath,
    validSemanticsDocument.replace(
      '## 5. 表结构设计',
      '### 4.1 一级治理\n\n接口发布统一经过审批。\n\n## 5. 表结构设计',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-governance-subsection-a0b1c2fc',
    ]),
    /level-1 capability business semantics contains a governance subsection: merchant_operations/,
  );

  const pureChineseDataSummaryDocument = validLevel1CapabilityDetailedDesign('merchant_operations')
    .replace('读取当前用户与 `merchant_governance_record` 状态', '读取当前会员的实名状态与门店审核进度')
    .replace('写入 `merchant_governance_record` 并记录处理状态', '保存门店审核结论并更新入驻进度')
    .replace('读取当前用户与 `catalog_inventory_record` 状态', '读取当前商户的商品分类与库存状态')
    .replace('写入 `catalog_inventory_record` 并记录处理状态', '保存商品信息并更新可售库存');
  await writeFile(merchantLevel1DetailedDesignPath, pureChineseDataSummaryDocument, 'utf8');
  await writeFile(merchantSecondaryPath, validSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await writeFile(catalogSecondaryPath, validSecondaryDetailedDesign('catalog_inventory'), 'utf8');
  const { stdout: pureChineseDataSummaryStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010100Z-project-knowledge-level1-chinese-data-summary-a0b1c2fd',
  ]);
  assert.equal(JSON.parse(pureChineseDataSummaryStdout).ok, true);

  const shortBusinessObjectSummaryDocument = validLevel1CapabilityDetailedDesign('merchant_operations')
    .replace('读取当前用户与 `merchant_governance_record` 状态', '订单')
    .replace('读取当前用户与 `catalog_inventory_record` 状态', '库存');
  await writeFile(merchantLevel1DetailedDesignPath, shortBusinessObjectSummaryDocument, 'utf8');
  const { stdout: shortBusinessObjectSummaryStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010100Z-project-knowledge-level1-short-data-summary-a0b1c304',
  ]);
  assert.equal(JSON.parse(shortBusinessObjectSummaryStdout).ok, true);

  const repeatedApiBaseDocument = validLevel1CapabilityDetailedDesign('merchant_operations');
  const repeatedApiOriginalStep = repeatedApiBaseDocument
    .match(/##### 步骤 1 · 入驻申请、审核与门店管理[\s\S]*?(?=### 3\.2)/)?.[0]
    ?.trimEnd();
  assert.ok(repeatedApiOriginalStep);
  const repeatedApiSecondStep = repeatedApiOriginalStep
    .replace(
      '##### 步骤 1 · 入驻申请、审核与门店管理',
      '##### 步骤 2 · 再次执行入驻申请、审核与门店管理',
    )
    .replace(
      '| `step_id` | `merchant_governance_execute_step` |',
      '| `step_id` | `merchant_governance_repeat_execute_step` |',
    );
  const repeatedApiOriginalGraph = [
    '    journey_MERCHANT_GOVERNANCE_EXECUTE["发起业务请求"] -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S1_merchant_governance["入驻申请、审核与门店管理"]',
    '    S1_merchant_governance --> R["返回业务编号和当前状态"]',
  ].join('\n');
  const repeatedApiSequentialGraph = [
    '    journey_MERCHANT_GOVERNANCE_EXECUTE["发起业务请求"] -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S1_merchant_governance["入驻申请、审核与门店管理"]',
    '    S1_merchant_governance -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S2_merchant_governance["入驻申请、审核与门店管理"]',
    '    S2_merchant_governance --> R["返回业务编号和当前状态"]',
  ].join('\n');
  const repeatedApiJourneyDocument = repeatedApiBaseDocument
    .replace(repeatedApiOriginalGraph, repeatedApiSequentialGraph)
    .replace(
      repeatedApiOriginalStep,
      `${repeatedApiOriginalStep}\n\n${repeatedApiSecondStep}`,
    );
  assert.match(repeatedApiJourneyDocument, /merchant_governance_repeat_execute_step/);
  assert.equal(
    repeatedApiJourneyDocument.match(/api_id: MERCHANT_GOVERNANCE_EXECUTE · POST \/api\/merchant_governance\/actions/g)?.length,
    2,
  );
  await writeFile(merchantLevel1DetailedDesignPath, repeatedApiJourneyDocument, 'utf8');
  const { stdout: repeatedApiJourneyStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010100Z-project-knowledge-level1-repeated-api-edges-a0b1c305',
  ]);
  assert.equal(JSON.parse(repeatedApiJourneyStdout).ok, true);

  const firstRelationshipSemantics = '分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链';
  const secondRelationshipSemantics = '分类库存记录通过复核字段关联同一条上游审核记录';
  const firstRelationshipEvidenceRow = '| `relation_merchant_governance_to_catalog_inventory` | `merchant_governance_record` -> `catalog_inventory_record` | `1:N` | `merchant_governance_record.id -> catalog_inventory_record.parent_record_id` | 分类、品牌、商品、SKU与库存记录归属于同一条跨二级能力业务链 | `db/catalog_inventory/catalog_inventory_record.sql:3-3#parentRecordId` |';
  const secondRelationshipEvidenceRow = '| `relation_merchant_governance_to_catalog_review` | `merchant_governance_record` -> `catalog_inventory_record` | `1:N` | `merchant_governance_record.id -> catalog_inventory_record.review_record_id` | 分类库存记录通过复核字段关联同一条上游审核记录 | `db/catalog_inventory/catalog_inventory_record.sql:4-4#reviewRecordId` |';
  const catalogParentFieldRow = '| `parent_record_id` | `BIGINT`；可空=否；默认值=无 | FK -> `merchant_governance_record.id` | 关联同一业务协作链的上游记录 | `CATALOG_INVENTORY_EXECUTE` | `db/catalog_inventory/catalog_inventory_record.sql:3-3#parentRecordId` |';
  const catalogReviewFieldRow = '| `review_record_id` | `BIGINT`；可空=否；默认值=无 | FK -> `merchant_governance_record.id` | 关联同一业务协作链的上游复核记录 | `CATALOG_INVENTORY_EXECUTE` | `db/catalog_inventory/catalog_inventory_record.sql:4-4#reviewRecordId` |';
  const reverseOrderedMultiRelationshipDocument = validLevel1CapabilityDetailedDesign('merchant_operations')
    .replace(
      '        BIGINT parent_record_id FK',
      '        BIGINT parent_record_id FK\n        BIGINT review_record_id FK',
    )
    .replace(
      `    merchant_governance_record ||--o{ catalog_inventory_record : "${firstRelationshipSemantics}"`,
      [
        `    merchant_governance_record ||--o{ catalog_inventory_record : "${secondRelationshipSemantics}"`,
        `    merchant_governance_record ||--o{ catalog_inventory_record : "${firstRelationshipSemantics}"`,
      ].join('\n'),
    )
    .replace(
      firstRelationshipEvidenceRow,
      `${firstRelationshipEvidenceRow}\n${secondRelationshipEvidenceRow}`,
    )
    .replace(
      catalogParentFieldRow,
      `${catalogParentFieldRow}\n${catalogReviewFieldRow}`,
    );
  assert.match(reverseOrderedMultiRelationshipDocument, /review_record_id/);
  assert.ok(
    reverseOrderedMultiRelationshipDocument.indexOf(`: "${secondRelationshipSemantics}"`)
      < reverseOrderedMultiRelationshipDocument.indexOf(`: "${firstRelationshipSemantics}"`),
  );
  assert.ok(
    reverseOrderedMultiRelationshipDocument.indexOf(firstRelationshipEvidenceRow)
      < reverseOrderedMultiRelationshipDocument.indexOf(secondRelationshipEvidenceRow),
  );
  await writeFile(merchantLevel1DetailedDesignPath, reverseOrderedMultiRelationshipDocument, 'utf8');
  const { stdout: reverseOrderedMultiRelationshipStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010100Z-project-knowledge-level1-reverse-er-evidence-a0b1c306',
  ]);
  assert.equal(JSON.parse(reverseOrderedMultiRelationshipStdout).ok, true);

  const merchantWithMismatchedParentApi = validSecondaryDetailedDesign('merchant_governance')
    .replace(
      '| Web 管理端用户 | `authenticated + order:create` | `MERCHANT_GOVERNANCE_EXECUTE` |',
      '| Web 管理端用户 | `authenticated + order:create` | `MERCHANT_GOVERNANCE_ALTERNATE` |',
    )
    .replace(
      '| `api_id` | `MERCHANT_GOVERNANCE_EXECUTE` |',
      '| `api_id` | `MERCHANT_GOVERNANCE_ALTERNATE` |',
    );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  await writeFile(merchantSecondaryPath, merchantWithMismatchedParentApi, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-api-binding-a0b1c2eb',
    ]),
    /secondary capability detailed design mismatches level-1 journey trace: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  const merchantWithMismatchedParentTable = validSecondaryDetailedDesign('merchant_governance')
    .replace('table_id=merchant_governance_record', 'table_id=merchant_governance_shadow');
  await writeFile(merchantSecondaryPath, merchantWithMismatchedParentTable, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-table-binding-a0b1c2ef',
    ]),
    /secondary capability detailed design mismatches level-1 journey trace: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  const merchantWithMismatchedPhysicalTable = validSecondaryDetailedDesign('merchant_governance')
    .replace(
      '物理表 `merchant_governance_record`',
      '物理表 `merchant_governance_shadow`',
    );
  assert.match(merchantWithMismatchedPhysicalTable, /table_id=merchant_governance_record/);
  await writeFile(merchantSecondaryPath, merchantWithMismatchedPhysicalTable, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-physical-table-binding-a0b1c2fe',
    ]),
    /secondary capability detailed design mismatches level-1 journey trace: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(merchantSecondaryPath, validSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations')
      .replace(
        'test/merchant_governance/CapabilityFlowTest.java:10-30#executeJourney',
        'CapabilityFlowTest#executeJourney',
      ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-evidence-a0b1c2e6',
    ]),
    /level-1 capability user journey missing exact evidence anchor: merchant_operations\/MERCHANT_GOVERNANCE_EXECUTE/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010101Z-project-knowledge-capability-a1b2c3d4',
  ]);
  const captured = JSON.parse(stdout);
  assert.equal(captured.ok, true);
  assert.ok(captured.files.includes('documents/business/capabilities/merchant_operations/detailed-design.md'));
  assert.ok(captured.files.includes('documents/business/capabilities/merchant_operations/secondary-capabilities/merchant_governance/detailed-design.md'));
  assert.ok(captured.files.includes(`documents/_archive/${archiveRelativeRoot}/document.md`));
  assert.ok(captured.files.includes(`documents/_archive/${archiveRelativeRoot}/metadata.json`));
  const { stdout: publishDryRunStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'oss-publish',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010101Z-project-knowledge-capability-a1b2c3d4',
    '--dry-run',
  ]);
  const publishDryRun = JSON.parse(publishDryRunStdout);
  assert.equal(
    publishDryRun.files.find((file) => file.path === `documents/_archive/${archiveRelativeRoot}/document.md`).target_uri,
    `oss://example-bucket/axis/v0.2/_archive/orgs/org_example/projects/example-project/${archiveRelativeRoot}/document.md`,
  );
  const capturedMetadata = JSON.parse(await readFile(path.join(capabilityRepo, captured.package_dir, 'metadata.json'), 'utf8'));
  assert.deepEqual(
    capturedMetadata.document.documents
      .filter((document) => document.doc_type === 'business_capability_detailed_design')
      .map((document) => document.doc_id),
    ['business_capability_detailed_design_merchant_operations'],
  );
  assert.deepEqual(
    capturedMetadata.document.documents
      .filter((document) => document.doc_type === 'secondary_capability_detailed_design')
      .map((document) => document.doc_id)
      .sort(),
    [
      'secondary_capability_detailed_design_merchant_operations_catalog_inventory',
      'secondary_capability_detailed_design_merchant_operations_merchant_governance',
    ],
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance')
      .replace(
        '| 方法与完整路径或主题 | `POST /api/merchant_governance/actions` |',
        '| 方法与完整路径或主题 | 现有入口集合 |',
      ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010105Z-project-knowledge-generic-interface-e5f6a7b8',
    ]),
    /secondary capability detailed design uses generic interface placeholder: merchant_operations\/merchant_governance/,
  );
  await writeFile(
    merchantSecondaryPath,
    validSecondaryDetailedDesign('merchant_governance')
      .replace('src/merchant_governance/CapabilityController.java:10-20#execute', 'CapabilityController#execute')
      .replace('src/merchant_governance/CapabilityService.java:20-40#execute', 'CapabilityService#execute')
      .replace('src/OrderMapper.java:8-12#insert', 'OrderMapper#insert')
      .replace('test/OrderTest.java:10-30#createOrder', 'OrderTest#createOrder'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010105Z-project-knowledge-interface-anchors-e5f6a7b9',
    ]),
    /secondary capability interface design missing exact code anchors: merchant_operations\/merchant_governance/,
  );
  await writeFile(merchantSecondaryPath, validSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await rm(catalogSecondaryPath);
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010102Z-project-knowledge-child-b2c3d4e5',
    ]),
    /secondary capability detailed design missing: merchant_operations\/catalog_inventory/,
  );
  await writeFile(catalogSecondaryPath, validSecondaryDetailedDesign('catalog_inventory'), 'utf8');
  await writeFile(businessArchitecturePath, '# 业务架构\n', 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010103Z-project-knowledge-business-nav-c3d4e5f6',
    ]),
    /business architecture omits capability overview link: merchant_operations/,
  );
  await writeFile(businessArchitecturePath, businessArchitectureDocument(), 'utf8');

  await writeFile(merchantSecondaryPath, flatSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await writeFile(catalogSecondaryPath, flatSecondaryDetailedDesign('catalog_inventory'), 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010107Z-project-knowledge-interface-flat-f7a8b9c0',
    ]),
    /Markdown table exceeds 6 columns: business\/capabilities\/merchant_operations\/secondary-capabilities\/catalog_inventory\/detailed-design\.md:\d+ \(13 columns\)/,
  );

  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations', undefined, {}, { includeQueries: true }),
    'utf8',
  );
  const validGroupedMerchantSecondary = validGroupedSecondaryDetailedDesign('merchant_governance');
  const validGroupedCatalogSecondary = validGroupedSecondaryDetailedDesign('catalog_inventory');
  const merchantWithMismatchedQueryApi = validGroupedMerchantSecondary
    .replaceAll('`ORDER_QUERY`', '`ORDER_QUERY_ALTERNATE`');
  await writeFile(merchantSecondaryPath, merchantWithMismatchedQueryApi, 'utf8');
  await writeFile(catalogSecondaryPath, validGroupedCatalogSecondary, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010107Z-project-knowledge-query-api-binding-f7a8b9cf',
    ]),
    /secondary capability detailed design mismatches level-1 journey trace: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_QUERY/,
  );
  const merchantWithExtraExecuteBinding = validGroupedMerchantSecondary.replace(
    '| `level1_journey_id` | `MERCHANT_GOVERNANCE_QUERY` |',
    '| `level1_journey_id` | `MERCHANT_GOVERNANCE_EXECUTE`, `MERCHANT_GOVERNANCE_QUERY` |',
  );
  await writeFile(merchantSecondaryPath, merchantWithExtraExecuteBinding, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010107Z-project-knowledge-extra-query-binding-f7a8b9ce',
    ]),
    /secondary capability detailed design contains interface binding absent from level-1 outward capability: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_EXECUTE\/ORDER_QUERY/,
  );
  const merchantWithoutSecondRequest = validGroupedMerchantSecondary.replace(
    /#### 5\.2\.3 请求字段[\s\S]*?(?=#### 5\.2\.4 响应字段)/,
    '',
  );
  assert.doesNotMatch(merchantWithoutSecondRequest, /#### 5\.2\.3 请求字段/);
  await writeFile(merchantSecondaryPath, merchantWithoutSecondRequest, 'utf8');
  await writeFile(catalogSecondaryPath, validGroupedCatalogSecondary, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010108Z-project-knowledge-interface-missing-request-f7a8b9c1',
    ]),
    /secondary capability interface group missing 5\.2\.3 请求字段: merchant_operations\/merchant_governance/,
  );

  const merchantWithWrongSecondNumbering = validGroupedMerchantSecondary.replaceAll(
    '#### 5.2.',
    '#### 5.1.',
  );
  assert.doesNotMatch(merchantWithWrongSecondNumbering, /#### 5\.2\.3 请求字段/);
  await writeFile(merchantSecondaryPath, merchantWithWrongSecondNumbering, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010109Z-project-knowledge-interface-wrong-numbering-f7a8b9c2',
    ]),
    /secondary capability interface group subsection numbering mismatch: merchant_operations\/merchant_governance\/5\.2/,
  );

  await writeFile(merchantSecondaryPath, validGroupedMerchantSecondary, 'utf8');
  await writeFile(catalogSecondaryPath, validGroupedCatalogSecondary, 'utf8');
  const { stdout: groupedInterfaceStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010110Z-project-knowledge-interface-grouped-f7a8b9c3',
  ]);
  assert.equal(JSON.parse(groupedInterfaceStdout).ok, true);

  const merchantWithInterfaceLogic = validGroupedSecondaryDetailedDesignWithInternalLogic('merchant_governance');
  const catalogWithInterfaceLogic = validGroupedSecondaryDetailedDesignWithInternalLogic('catalog_inventory');
  const legacyTopLevelInterfaceSections = [
    ['7', '实体、表与对象关系'],
    ['8', '表结构设计'],
    ['9', '事务、并发、性能与容错'],
    ['10', '安全、测试与验收'],
    ['11', '端到端追溯矩阵'],
  ];
  for (let index = 0; index < legacyTopLevelInterfaceSections.length; index += 1) {
    const [sectionNumber, sectionTitle] = legacyTopLevelInterfaceSections[index];
    const merchantWithLegacyTopLevelSection = [
      merchantWithInterfaceLogic,
      '',
      `## ${sectionNumber}. ${sectionTitle}`,
      '',
      '旧版全局接口设计内容。',
      '',
    ].join('\n');
    const escapedSectionTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await writeFile(merchantSecondaryPath, merchantWithLegacyTopLevelSection, 'utf8');
    await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, [
        path.join(repoRoot, 'dist', 'cli.js'),
        'project-knowledge-capture',
        '--repo', capabilityRepo,
        '--run-id', `20260713T010110Z-project-knowledge-legacy-top-${index}-f7a8b9d8`,
      ]),
      new RegExp(
        `secondary capability detailed design uses legacy top-level interface-local section: merchant_operations/merchant_governance/${escapedSectionTitle}`,
      ),
    );
  }

  const merchantWithoutSecondOperationalDesign = merchantWithInterfaceLogic.replace(
    /#### 5\.2\.7 事务、并发、性能与容错[\s\S]*?(?=#### 5\.2\.8 安全、测试与验收)/,
    '',
  );
  assert.doesNotMatch(merchantWithoutSecondOperationalDesign, /#### 5\.2\.7 事务、并发、性能与容错/);
  assert.match(merchantWithoutSecondOperationalDesign, /#### 5\.1\.7 事务、并发、性能与容错/);
  assert.match(merchantWithoutSecondOperationalDesign, /#### 5\.2\.8 安全、测试与验收/);
  await writeFile(merchantSecondaryPath, merchantWithoutSecondOperationalDesign, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-interface-missing-operations-f7a8b9dd',
    ]),
    /secondary capability interface group missing 5\.2\.7 事务、并发、性能与容错: merchant_operations\/merchant_governance/,
  );

  const merchantWithoutSecondSecurityAcceptance = merchantWithInterfaceLogic.replace(
    /#### 5\.2\.8 安全、测试与验收[\s\S]*$/,
    '',
  );
  assert.doesNotMatch(merchantWithoutSecondSecurityAcceptance, /#### 5\.2\.8 安全、测试与验收/);
  assert.match(merchantWithoutSecondSecurityAcceptance, /#### 5\.1\.8 安全、测试与验收/);
  assert.match(merchantWithoutSecondSecurityAcceptance, /#### 5\.2\.7 事务、并发、性能与容错/);
  await writeFile(merchantSecondaryPath, merchantWithoutSecondSecurityAcceptance, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-interface-missing-security-f7a8b9de',
    ]),
    /secondary capability interface group missing 5\.2\.8 安全、测试与验收: merchant_operations\/merchant_governance/,
  );

  const merchantQueryAccessRow = merchantWithInterfaceLogic
    .split('\n')
    .find((line) => line.includes('| `ORDER_QUERY` |'));
  assert.ok(merchantQueryAccessRow);
  const merchantWithEmptyAccessSubject = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace('| Web 管理端用户 |', '|  |'),
  );
  assert.match(
    merchantWithEmptyAccessSubject,
    /^\|\s*\| `authenticated \+ order:read` \| `ORDER_QUERY` \|/m,
  );
  await writeFile(merchantSecondaryPath, merchantWithEmptyAccessSubject, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d5',
    ]),
    /secondary capability access matrix has generic subject: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithEmptyAccessPermission = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace('| `authenticated + order:read` |', '|  |'),
  );
  assert.match(
    merchantWithEmptyAccessPermission,
    /^\| Web 管理端用户 \|\s*\| `ORDER_QUERY` \|/m,
  );
  await writeFile(merchantSecondaryPath, merchantWithEmptyAccessPermission, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d6',
    ]),
    /secondary capability access matrix has generic permission: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithEmptyAccessDataScope = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace('| 当前组织内可查看的订单 |', '|  |'),
  );
  assert.match(
    merchantWithEmptyAccessDataScope,
    /\| `ORDER_QUERY` \| `GET \/api\/merchant_governance\/actions\/\{id\}` \|\s*\|/,
  );
  await writeFile(merchantSecondaryPath, merchantWithEmptyAccessDataScope, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d7',
    ]),
    /secondary capability access matrix has generic data scope: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithoutCapabilityBoundary = merchantWithInterfaceLogic.replace(
    /## 1\. 能力定位与边界[\s\S]*?(?=## 2\. 调用主体、权限与接口矩阵)/,
    '',
  );
  assert.doesNotMatch(merchantWithoutCapabilityBoundary, /## 1\. 能力定位与边界/);
  assert.match(merchantWithoutCapabilityBoundary, /## 2\. 调用主体、权限与接口矩阵/);
  assert.match(merchantWithoutCapabilityBoundary, /## 5\. 接口详细设计/);
  await writeFile(merchantSecondaryPath, merchantWithoutCapabilityBoundary, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d4',
    ]),
    /secondary capability detailed design missing capability boundary: merchant_operations\/merchant_governance/,
  );

  const legacyDuplicateAccessSections = [
    '## 1. 身份、职责与 business_id 映射',
    '',
    '| 字段 | 内容 |',
    '| --- | --- |',
    '| `secondary_capability_id` | `merchant_governance` |',
    '| 业务职责 | 管理业务订单 |',
    '',
    '## 2. 参与者、权限与数据范围',
    '',
    '| 参与者 | 前置条件 | 允许动作 | 数据范围 | 审计要求 | 证据 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| Web 管理端用户 | 已登录 | 查询订单 | 当前组织订单 | 记录查询主体 | `src/merchant_governance/CapabilityAuthorization.java:20-28#canRead` |',
    '',
  ].join('\n');
  const merchantWithLegacyDuplicateAccessSections = merchantWithInterfaceLogic.replace(
    '\n## 5. 接口详细设计',
    `\n${legacyDuplicateAccessSections}\n## 5. 接口详细设计`,
  );
  assert.match(
    merchantWithLegacyDuplicateAccessSections,
    /## 2\. 调用主体、权限与接口矩阵[\s\S]*## 1\. 身份、职责与 business_id 映射[\s\S]*## 2\. 参与者、权限与数据范围/,
  );
  await writeFile(merchantSecondaryPath, merchantWithLegacyDuplicateAccessSections, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d3',
    ]),
    /secondary capability detailed design uses legacy duplicate access sections: merchant_operations\/merchant_governance/,
  );

  const merchantWithLegacyAccessHeader = merchantWithInterfaceLogic.replace(
    '| 主体/角色 | 所需权限/策略 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |',
    '| 主体/角色 | 权限/授权规则 | `api_id` | 可调用接口/能力 | 数据范围 | 授权证据 |',
  );
  assert.match(
    merchantWithLegacyAccessHeader,
    /\| 主体\/角色 \| 权限\/授权规则 \| `api_id` \| 可调用接口\/能力 \| 数据范围 \| 授权证据 \|/,
  );
  assert.doesNotMatch(
    merchantWithLegacyAccessHeader,
    /\| 主体\/角色 \| 所需权限\/策略 \| `api_id` \| 可调用接口\/能力 \| 数据范围 \| 授权证据 \|/,
  );
  await writeFile(merchantSecondaryPath, merchantWithLegacyAccessHeader, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d2',
    ]),
    /secondary capability access matrix missing fixed schema or rows: merchant_operations\/merchant_governance/,
  );

  const merchantWithoutExactAuthorizationEvidence = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace(
      '`src/merchant_governance/CapabilityAuthorization.java:20-28#canRead`',
      '`CapabilityAuthorization#canRead`',
    ),
  );
  assert.match(
    merchantWithoutExactAuthorizationEvidence,
    /\| `ORDER_QUERY` \|[^\n]+\| `CapabilityAuthorization#canRead` \|/,
  );
  assert.doesNotMatch(
    merchantWithoutExactAuthorizationEvidence,
    /src\/merchant_governance\/CapabilityAuthorization\.java:20-28#canRead/,
  );
  await writeFile(merchantSecondaryPath, merchantWithoutExactAuthorizationEvidence, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d1',
    ]),
    /secondary capability access matrix missing authorization evidence: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithGenericSubject = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace('| Web 管理端用户 |', '| 调用方 |'),
  );
  assert.match(
    merchantWithGenericSubject,
    /\| 调用方 \| `authenticated \+ order:read` \| `ORDER_QUERY` \|/,
  );
  assert.match(
    merchantWithGenericSubject,
    /\| Web 管理端用户 \| `authenticated \+ order:create` \| `MERCHANT_GOVERNANCE_EXECUTE` \|/,
  );
  await writeFile(merchantSecondaryPath, merchantWithGenericSubject, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9d0',
    ]),
    /secondary capability access matrix has generic subject: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithGenericDataScope = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace('当前组织内可查看的订单', '当前租户及业务归属'),
  );
  assert.match(
    merchantWithGenericDataScope,
    /\| `ORDER_QUERY` \| `GET \/api\/merchant_governance\/actions\/\{id\}` \| 当前租户及业务归属 \|/,
  );
  assert.match(
    merchantWithGenericDataScope,
    /\| `MERCHANT_GOVERNANCE_EXECUTE` \| `POST \/api\/merchant_governance\/actions` \| 当前组织内可创建的订单 \|/,
  );
  await writeFile(merchantSecondaryPath, merchantWithGenericDataScope, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9cf',
    ]),
    /secondary capability access matrix has generic data scope: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithGenericPermission = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace('`authenticated + order:read`', '执行已授权流程'),
  );
  assert.match(
    merchantWithGenericPermission,
    /\| Web 管理端用户 \| 执行已授权流程 \| `ORDER_QUERY` \|/,
  );
  assert.match(
    merchantWithGenericPermission,
    /\| Web 管理端用户 \| `authenticated \+ order:create` \| `MERCHANT_GOVERNANCE_EXECUTE` \|/,
  );
  await writeFile(merchantSecondaryPath, merchantWithGenericPermission, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9ce',
    ]),
    /secondary capability access matrix has generic permission: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithMismatchedAccessInterface = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    merchantQueryAccessRow.replace(
      '`GET /api/merchant_governance/actions/{id}`',
      '`DELETE /api/merchant_governance/actions/{id}`',
    ),
  );
  assert.match(
    merchantWithMismatchedAccessInterface,
    /\| Web 管理端用户 \|[^\n]+\| `ORDER_QUERY` \| `DELETE \/api\/merchant_governance\/actions\/\{id\}` \|/,
  );
  assert.match(
    merchantWithMismatchedAccessInterface,
    /\| 方法与完整路径或主题 \| `GET \/api\/merchant_governance\/actions\/\{id\}` \|/,
  );
  await writeFile(merchantSecondaryPath, merchantWithMismatchedAccessInterface, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9cd',
    ]),
    /secondary capability access matrix mismatches interface: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithUnknownAccessApi = merchantWithInterfaceLogic.replace(
    merchantQueryAccessRow,
    `${merchantQueryAccessRow}\n${merchantQueryAccessRow.replace('`ORDER_QUERY`', '`ORDER_DELETE`')}`,
  );
  assert.match(
    merchantWithUnknownAccessApi,
    /\| Web 管理端用户 \|[^\n]+\| `ORDER_DELETE` \|/,
  );
  assert.doesNotMatch(merchantWithUnknownAccessApi, /\| `api_id` \| `ORDER_DELETE` \|/);
  assert.match(merchantWithUnknownAccessApi, /\| `api_id` \| `ORDER_QUERY` \|/);
  assert.match(
    merchantWithUnknownAccessApi,
    /\| Web 管理端用户 \|[^\n]+\| `ORDER_QUERY` \|/,
  );
  await writeFile(merchantSecondaryPath, merchantWithUnknownAccessApi, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9cc',
    ]),
    /secondary capability access matrix references unknown api_id: merchant_operations\/merchant_governance\/ORDER_DELETE/,
  );

  const merchantWithoutQueryAccess = merchantWithInterfaceLogic.replace(`${merchantQueryAccessRow}\n`, '');
  assert.doesNotMatch(
    merchantWithoutQueryAccess,
    /\| Web 管理端用户 \|[^\n]+\| `ORDER_QUERY` \|/,
  );
  assert.match(merchantWithoutQueryAccess, /\| `api_id` \| `ORDER_QUERY` \|/);
  await writeFile(merchantSecondaryPath, merchantWithoutQueryAccess, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010110Z-project-knowledge-access-matrix-f7a8b9cb',
    ]),
    /secondary capability access matrix omits api_id: merchant_operations\/merchant_governance\/ORDER_QUERY/,
  );

  const merchantWithoutFirstLogic = merchantWithInterfaceLogic.replace(
    /#### 5\.1\.2 内部处理逻辑[\s\S]*?(?=#### 5\.1\.3 请求字段)/,
    '',
  );
  await writeFile(merchantSecondaryPath, merchantWithoutFirstLogic, 'utf8');
  await writeFile(catalogSecondaryPath, validGroupedCatalogSecondary, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010111Z-project-knowledge-interface-missing-logic-f7a8b9c4',
    ]),
    /secondary capability interface group missing 5\.1\.2 内部处理逻辑: merchant_operations\/merchant_governance/,
  );

  const merchantWithoutSecondLogic = merchantWithInterfaceLogic.replace(
    /#### 5\.2\.2 内部处理逻辑[\s\S]*?(?=#### 5\.2\.3 请求字段)/,
    '',
  );
  assert.doesNotMatch(merchantWithoutSecondLogic, /#### 5\.2\.2 内部处理逻辑/);
  await writeFile(merchantSecondaryPath, merchantWithoutSecondLogic, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010112Z-project-knowledge-interface-second-logic-f7a8b9c5',
    ]),
    /secondary capability interface group missing 5\.2\.2 内部处理逻辑: merchant_operations\/merchant_governance/,
  );

  const genericLogic = [
    '#### 5.1.2 内部处理逻辑',
    '',
    '接口内部通过通用应用服务执行规则并产生结果。',
    '',
    '```mermaid',
    'flowchart LR',
    '    actor --> api',
    '    api --> application_service',
    '    application_service --> business_rule',
    '    business_rule --> entity_or_table',
    '    business_rule --> outcome_or_state',
    '```',
    '',
  ].join('\n');
  const merchantWithGenericLogic = merchantWithInterfaceLogic.replace(
    /#### 5\.1\.2 内部处理逻辑[\s\S]*?(?=#### 5\.1\.3 请求字段)/,
    genericLogic,
  );
  await writeFile(merchantSecondaryPath, merchantWithGenericLogic, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010113Z-project-knowledge-interface-generic-logic-f7a8b9c6',
    ]),
    /secondary capability interface internal logic uses generic placeholder: merchant_operations\/merchant_governance\/5\.1/,
  );

  const merchantWithoutLogicSummary = merchantWithInterfaceLogic.replace(
    /#### 5\.1\.2 内部处理逻辑[\s\S]*?(?=#### 5\.1\.3 请求字段)/,
    [
      '#### 5.1.2 内部处理逻辑',
      '',
      '```mermaid',
      'flowchart LR',
      '    A["CapabilityController.execute"] --> B["CapabilityService.execute"]',
      '    B --> C["OrderMapper.insert 写入 order"]',
      '```',
      '',
    ].join('\n'),
  );
  await writeFile(merchantSecondaryPath, merchantWithoutLogicSummary, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010114Z-project-knowledge-interface-logic-summary-f7a8b9c7',
    ]),
    /secondary capability interface internal logic missing concrete summary: merchant_operations\/merchant_governance\/5\.1/,
  );

  const merchantWithoutLogicFlow = merchantWithInterfaceLogic.replace(
    /#### 5\.1\.2 内部处理逻辑[\s\S]*?(?=#### 5\.1\.3 请求字段)/,
    [
      '#### 5.1.2 内部处理逻辑',
      '',
      '该接口由 `CapabilityController.execute` 校验订单，再调用 `CapabilityService.execute` 和 `OrderMapper.insert` 写入 `order` 并返回订单状态。',
      '',
    ].join('\n'),
  );
  await writeFile(merchantSecondaryPath, merchantWithoutLogicFlow, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010115Z-project-knowledge-interface-logic-flow-f7a8b9c8',
    ]),
    /secondary capability interface internal logic missing flow diagram or step table: merchant_operations\/merchant_governance\/5\.1/,
  );

  const merchantWithMixedMethodNode = [
    'reader_profile=strict_full',
    merchantWithInterfaceLogic.replace(
      'B["CapabilityService.execute()"]',
      'B["CapabilityService.execute()：检查业务单号"]',
    ),
  ].join('\n');
  await writeFile(merchantSecondaryPath, merchantWithMixedMethodNode, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010115Z-project-knowledge-interface-mixed-method-node-f7a8b9cb',
    ]),
    /secondary capability interface method node is not atomic: merchant_operations\/merchant_governance\/5\.1/,
  );

  const merchantWithBareStrictFullNode = [
    'reader_profile=strict_full',
    merchantWithInterfaceLogic.replace(
      '    B -->|"持久化业务记录"| C["OrderMapper.insert()"]',
      [
        '    B -->|"持久化业务记录"| C["OrderMapper.insert()"]',
        '    C --> BusinessStep',
      ].join('\n'),
    ),
  ].join('\n');
  await writeFile(merchantSecondaryPath, merchantWithBareStrictFullNode, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010115Z-project-knowledge-interface-bare-node-f7a8b9cc',
    ]),
    /secondary capability interface method node is not atomic: merchant_operations\/merchant_governance\/5\.1/,
  );

  const merchantWithSemicolonBareStrictFullNode = [
    'reader_profile=strict_full',
    merchantWithInterfaceLogic.replace(
      '    A["CapabilityController.execute()"] -->|"校验请求"| B["CapabilityService.execute()"]',
      '    A["CapabilityController.execute()"] --> B["CapabilityService.execute()"]; BusinessStep --> A',
    ),
  ].join('\n');
  await writeFile(merchantSecondaryPath, merchantWithSemicolonBareStrictFullNode, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010115Z-project-knowledge-interface-semicolon-bare-node-f7a8b9cd',
    ]),
    /secondary capability interface method node is not atomic: merchant_operations\/merchant_governance\/5\.1/,
  );

  const merchantWithOldRequestNumber = merchantWithInterfaceLogic.replace(
    '#### 5.2.3 请求字段',
    '#### 5.2.2 请求字段',
  );
  assert.doesNotMatch(merchantWithOldRequestNumber, /#### 5\.2\.3 请求字段/);
  await writeFile(merchantSecondaryPath, merchantWithOldRequestNumber, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010116Z-project-knowledge-interface-logic-numbering-f7a8b9c9',
    ]),
    /secondary capability interface group subsection numbering mismatch: merchant_operations\/merchant_governance\/5\.2/,
  );

  assert.match(merchantWithInterfaceLogic, /#### 5\.1\.2 内部处理逻辑[\s\S]*CapabilityController\.execute[\s\S]*```mermaid/);
  assert.match(merchantWithInterfaceLogic, /#### 5\.2\.2 内部处理逻辑[\s\S]*CapabilityController\.detail[\s\S]*\| 步骤 \| 内部处理 \|/);
  for (const prefix of ['5.1', '5.2']) {
    assert.match(merchantWithInterfaceLogic, new RegExp(`#### ${prefix.replace('.', '\\.')}\\.3 请求字段`));
    assert.match(merchantWithInterfaceLogic, new RegExp(`#### ${prefix.replace('.', '\\.')}\\.4 响应字段`));
    assert.match(merchantWithInterfaceLogic, new RegExp(`#### ${prefix.replace('.', '\\.')}\\.5 错误码与异常映射`));
    assert.match(merchantWithInterfaceLogic, new RegExp(`#### ${prefix.replace('.', '\\.')}\\.6 认证与授权执行`));
    assert.match(merchantWithInterfaceLogic, new RegExp(`#### ${prefix.replace('.', '\\.')}\\.7 事务、并发、性能与容错`));
    assert.match(merchantWithInterfaceLogic, new RegExp(`#### ${prefix.replace('.', '\\.')}\\.8 安全、测试与验收`));
  }
  await writeFile(merchantSecondaryPath, merchantWithInterfaceLogic, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  const { stdout: groupedInterfaceLogicStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010117Z-project-knowledge-interface-logic-grouped-f7a8b9ca',
  ]);
  assert.equal(JSON.parse(groupedInterfaceLogicStdout).ok, true);

  const firstImplementationTablePattern = /\| 实现层 \| 精确定位 \| 职责 \|\n\| --- \| --- \| --- \|\n\| Controller\/入口 \|[^\n]+\n\| Service\/用例 \|[^\n]+\n\| Mapper\/Repository \|[^\n]+\n\| 实体\/表 \|[^\n]+\n\| 测试 \|[^\n]+/;
  const firstImplementationTable = firstImplementationTablePattern.exec(merchantWithInterfaceLogic)?.[0];
  assert.ok(firstImplementationTable);
  const readerFacingImplementationTable = [
    '| 实现层 | 精确定位 | 职责 |',
    '| --- | --- | --- |',
    '| Controller/入口 | `CapabilityController.java:10-20#execute` | 接收创建请求 |',
    '| Service/用例 | `CapabilityService.java:20-40#execute` | 执行业务编排 |',
    '| Mapper/Repository | `OrderMapper.java:8-12#insert` | 保存业务记录 |',
    '| 实体/表 | `CapabilityRecord.java:10-30#CapabilityRecord` | 承载业务状态 |',
    '| 测试 | `OrderTest.java:10-30#createOrder` | 验证主流程 |',
    '',
    '<!-- axis-implementation-machine-table',
    firstImplementationTable,
    '-->',
  ].join('\n');
  const merchantWithReaderFacingImplementation = merchantWithInterfaceLogic.replace(
    firstImplementationTable,
    readerFacingImplementationTable,
  );
  await writeFile(merchantSecondaryPath, merchantWithReaderFacingImplementation, 'utf8');
  await writeFile(catalogSecondaryPath, catalogWithInterfaceLogic, 'utf8');
  const { stdout: readerFacingImplementationStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010117Z-project-knowledge-reader-facing-implementation-f7a8b9cc',
  ]);
  assert.equal(JSON.parse(readerFacingImplementationStdout).ok, true);

  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations', undefined, {}, { crossSecondary: true }),
    'utf8',
  );
  await writeFile(merchantSecondaryPath, validSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await writeFile(
    catalogSecondaryPath,
    validSecondaryDetailedDesign('catalog_inventory').replace(
      '| `level1_journey_id` | `CATALOG_INVENTORY_EXECUTE` |',
      '| `level1_journey_id` | `MERCHANT_GOVERNANCE_EXECUTE`, `CATALOG_INVENTORY_EXECUTE` |',
    ),
    'utf8',
  );
  const { stdout: crossSecondaryStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260713T010117Z-project-knowledge-cross-secondary-f7a8b9cd',
  ]);
  assert.equal(JSON.parse(crossSecondaryStdout).ok, true);

  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations', [
      { id: 'merchant_governance', name: '入驻申请、审核与门店管理' },
    ]),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010104Z-project-knowledge-incomplete-d4e5f6a7',
    ]),
    /level-1 capability user journeys omit secondary capability: merchant_operations\/catalog_inventory/,
  );

  const customerSupportCapabilityPath = path.join(
    projectRoot,
    'business',
    'capabilities',
    'customer_support',
  );
  const customerSupportSecondaryPath = path.join(
    customerSupportCapabilityPath,
    'secondary-capabilities',
    'support_operations',
  );
  await mkdir(customerSupportSecondaryPath, { recursive: true });
  await writeFile(path.join(projectRoot, 'business', 'inventory.yaml'), [
    'level1_capabilities:',
    '- level1_capability_id: merchant_operations',
    '  level1_capability_name: 商户经营',
    '  secondary_capabilities:',
    '  - secondary_capability_id: merchant_governance',
    '    name: 入驻申请、审核与门店管理',
    '    business_ids:',
    '    - merchant_shop_governance',
    '  - secondary_capability_id: catalog_inventory',
    '    name: 分类、品牌、商品、SKU与库存',
    '    business_ids:',
    '    - product_catalog_inventory',
    '- level1_capability_id: customer_support',
    '  level1_capability_name: 客户支持',
    '  secondary_capabilities:',
    '  - secondary_capability_id: support_operations',
    '    name: 客户问题处理',
    '    business_ids:',
    '    - customer_support_operations',
  ].join('\n'), 'utf8');
  await writeFile(merchantSecondaryPath, validSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await writeFile(catalogSecondaryPath, validSecondaryDetailedDesign('catalog_inventory'), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations', undefined, {
      downstream: ['customer_support'],
    }),
    'utf8',
  );
  await writeFile(
    path.join(customerSupportCapabilityPath, 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('customer_support', [
      { id: 'support_operations', name: '客户问题处理' },
    ], {
      upstream: ['merchant_operations'],
    }),
    'utf8',
  );
  await writeFile(
    path.join(customerSupportSecondaryPath, 'detailed-design.md'),
    validSecondaryDetailedDesign('support_operations'),
    'utf8',
  );
  await writeFile(businessArchitecturePath, businessArchitectureDocument({
    capabilities: [
      { id: 'merchant_operations', name: '商户经营' },
      { id: 'customer_support', name: '客户支持' },
    ],
    edgeIds: ['merchant_to_customer_support'],
  }), 'utf8');
  const twoCapabilityGraph = validLevel1CapabilityDependencyGraph([
    { id: 'merchant_operations', name: '商户经营' },
    { id: 'customer_support', name: '客户支持' },
  ], [{
    edgeId: 'merchant_to_customer_support',
    upstream: 'merchant_operations',
    downstream: 'customer_support',
    journeyId: 'MERCHANT_GOVERNANCE_EXECUTE',
    apiId: 'MERCHANT_GOVERNANCE_EXECUTE',
    evidenceRef: 'src/merchant_governance/CapabilityService.java:20-40#execute',
  }]);
  await writeFile(capabilityDependencyGraphPath, twoCapabilityGraph, 'utf8');
  const { stdout: twoCapabilityStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', capabilityRepo,
    '--run-id', '20260714T010117Z-project-knowledge-level1-graph-edge-f7a8b9cb',
  ]);
  assert.equal(JSON.parse(twoCapabilityStdout).ok, true);

  await writeFile(
    capabilityDependencyGraphPath,
    twoCapabilityGraph.replace(
      '    api_ids:\n      - MERCHANT_GOVERNANCE_EXECUTE',
      '    api_ids:\n      - FAKE_API',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260714T010118Z-project-knowledge-level1-graph-fake-api-f7a8b9cc',
    ]),
    /level-1 capability dependency graph edge references unknown api_id: merchant_to_customer_support\/FAKE_API/,
  );
} finally {
  await rm(capabilityRepo, { recursive: true, force: true });
}

const compactCapabilityRepo = await mkdtemp(path.join(tmpdir(), 'axis-compact-capability-knowledge-'));
try {
  const compactProjectRoot = path.join(
    compactCapabilityRepo,
    '.axis',
    'docs',
    'orgs',
    'org_compact',
    'projects',
    'compact-project',
  );
  const compactCapabilityRoot = path.join(
    compactProjectRoot,
    'business',
    'capabilities',
    'compact_operations',
  );
  await mkdir(path.join(compactProjectRoot, 'architecture'), { recursive: true });
  await mkdir(path.join(compactProjectRoot, 'gaps'), { recursive: true });
  for (const secondary of compactSecondaryCapabilities) {
    await mkdir(
      path.join(compactCapabilityRoot, 'secondary-capabilities', secondary.id),
      { recursive: true },
    );
  }
  await writeFile(path.join(compactCapabilityRepo, '.axis', 'config.yml'), [
    'contract_version: "0.2"',
    'organization:',
    '  id: org_compact',
    '  registry: .axis/organizations.yml',
    'project:',
    '  slug: compact-project',
    '  display_name: Compact Project',
    'package:',
    '  outbox_dir: .axis/outbox',
    'release:',
    '  channel: private_beta',
    '  gate: not_requested',
    'oss:',
    '  provider: aliyun-oss',
    '  profile: private_beta_main',
    'skills:',
    '  project_init: axis-doc-project-init',
    '  coding_capture: axis-code-capture',
    '  test_report: axis-test-report',
    '  oss_publish: axis-ops-oss-publish',
  ].join('\n'), 'utf8');
  await writeFile(path.join(compactCapabilityRepo, '.axis', 'organizations.yml'), [
    'schema: axis.organization_registry',
    'schema_version: "0.2"',
    'organizations:',
    '  - id: org_compact',
    '    slug: compact',
    '    display_name: Compact',
    '    status: active',
    '    oss_profiles:',
    '      - name: private_beta_main',
    '        provider: aliyun-oss',
    '        bucket: compact-bucket',
    '        prefix: axis/v0.2',
    '        endpoint_env: TEST_OSS_ENDPOINT',
    '        region_env: TEST_OSS_REGION',
    '        access_key_id_env: TEST_OSS_KEY',
    '        access_key_secret_env: TEST_OSS_SECRET',
    '    products:',
    '      - slug: compact-product',
    '        display_name: Compact Product',
    '        projects:',
    '          - slug: compact-project',
    '            display_name: Compact Project',
  ].join('\n'), 'utf8');
  await writeFile(path.join(compactProjectRoot, 'metadata.yaml'), 'document_language: zh-CN\nstatus: review\n', 'utf8');
  await writeFile(path.join(compactProjectRoot, 'architecture', 'technical.md'), '# 技术架构\n', 'utf8');
  await writeFile(
    path.join(compactProjectRoot, 'architecture', 'business.md'),
    businessArchitectureDocument({
      status: 'pending_level1_completion',
      revision: 'not_derived',
      gapId: 'gap_level1_dependency_graph_derivation',
      capabilities: [{ id: 'compact_operations', name: '精简能力' }],
    }),
    'utf8',
  );
  const compactInventoryPath = path.join(compactProjectRoot, 'business', 'inventory.yaml');
  const compactInventory = [
    'level1_capabilities:',
    '- level1_capability_id: compact_operations',
    '  level1_capability_name: 精简能力',
    '  secondary_capabilities:',
    ...compactSecondaryCapabilities.flatMap((secondary) => [
      `  - secondary_capability_id: ${secondary.id}`,
      `    secondary_capability_name: ${secondary.name}`,
      `    business_ids: [${secondary.businessId}]`,
    ]),
  ].join('\n');
  await writeFile(compactInventoryPath, compactInventory, 'utf8');
  const compactLevel1Path = path.join(compactCapabilityRoot, 'detailed-design.md');
  const compactLevel1 = compactPartialLevel1DetailedDesign();
  await writeFile(compactLevel1Path, compactLevel1, 'utf8');
  const compactSecondaryPaths = new Map();
  for (const [index, secondary] of compactSecondaryCapabilities.entries()) {
    const documentPath = path.join(
      compactCapabilityRoot,
      'secondary-capabilities',
      secondary.id,
      'detailed-design.md',
    );
    compactSecondaryPaths.set(secondary.id, documentPath);
    await writeFile(documentPath, compactPartialSecondaryDetailedDesign(secondary, index), 'utf8');
  }
  await writeFile(path.join(compactProjectRoot, 'gaps', 'doc-gap-report.md'), [
    '# 文档缺口',
    '',
    '- gap_compact_user_journey_coverage：补齐其余业务入口和验收证据。',
    '- gap_compact_table_coverage：补齐表结构与关系证据。',
    '- gap_compact_secondary_traceability：补齐接口字段与真实集成测试。',
    '- gap_level1_dependency_graph_derivation：全部能力 complete 后统一派生。',
    '',
  ].join('\n'), 'utf8');
  await writeFile(
    path.join(compactProjectRoot, 'business', 'level1-capability-dependency-graph.yaml'),
    validLevel1CapabilityDependencyGraph(
      [{ id: 'compact_operations', name: '精简能力' }],
      [],
      { status: 'pending_level1_completion' },
    ),
    'utf8',
  );

  const { stdout: compactCaptureStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', compactCapabilityRepo,
    '--run-id', '20260715T010100Z-project-knowledge-compact-partial-a1b2c3d4',
  ]);
  const compactCapture = JSON.parse(compactCaptureStdout);
  assert.equal(compactCapture.ok, true);
  assert.equal(
    compactCapture.files.filter((file) => /secondary-capabilities\/.+\/detailed-design\.md$/.test(file)).length,
    14,
  );

  const firstCompactSecondary = compactSecondaryCapabilities[0];
  const firstCompactSecondaryPath = compactSecondaryPaths.get(firstCompactSecondary.id);
  const firstCompactSecondaryBody = compactPartialSecondaryDetailedDesign(firstCompactSecondary, 0);

  assert.match(
    firstCompactSecondaryBody,
    /secondary_reader_contract=participant_flow_interface_v1/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      'secondary_reader_contract=participant_flow_interface_v1',
      'secondary_reader_contract=participant_flow_interface_v9',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010200Z-project-knowledge-compact-unknown-reader-a1b2c400',
    ]),
    /unsupported secondary_reader_contract: compact_operations\/compact_capability_01\/participant_flow_interface_v9/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace('secondary_reader_contract=participant_flow_interface_v1\n', ''),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010201Z-project-knowledge-compact-reader-latch-a1b2c401',
    ]),
    /level-1 capability requires all secondary documents to use secondary_reader_contract=participant_flow_interface_v1: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      /\n<!-- axis-implementation-machine-table[\s\S]*?-->/,
      '',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010202Z-project-knowledge-compact-scoped-implementation-a1b2c402',
    ]),
    /interface block requires one scoped implementation trace: compact_operations\/compact_capability_01\/5\.1/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '### 5.1 提交能力执行',
      '<!--\n### 5.1 提交能力执行\n-->',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010202Z-project-knowledge-compact-hidden-interface-a1b2c408',
    ]),
    /must group each concrete interface|interface headings must remain reader-visible/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| Controller/入口 | `src/compact/Compact01Controller.java:10-20#execute` | 接收并校验执行请求 |',
      '| Controller/入口 | none | 接收并校验执行请求 |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010202Z-project-knowledge-compact-invalid-implementation-a1b2c409',
    ]),
    /interface block requires one scoped implementation trace: compact_operations\/compact_capability_01\/5\.1/,
  );

  const mismatchedImplementationBody = firstCompactSecondaryBody.replace(
    [
      '| 实现定位 | `Compact01Controller.java:10-20#execute` |',
      '',
      '<!-- axis-evidence: src/compact/Compact01Controller.java:10-20#execute -->',
    ].join('\n'),
    [
      '| 实现定位 | `Compact01Controller.java:22-30#query` |',
      '',
      '<!-- axis-evidence: src/compact/Compact01Controller.java:22-30#query -->',
    ].join('\n'),
  );
  await writeFile(firstCompactSecondaryPath, mismatchedImplementationBody, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010202Z-project-knowledge-compact-mismatched-implementation-a1b2c410',
    ]),
    /visible implementation locator does not match its scoped implementation trace: compact_operations\/compact_capability_01\/5\.1/,
  );

  const duplicateConcreteContractBody = firstCompactSecondaryBody
    .replaceAll('COMPACT_01_QUERY', 'COMPACT_01_QUERY_ALIAS')
    .replaceAll('GET /app/compact/01/{recordId}', 'POST  /app/compact/01');
  await writeFile(firstCompactSecondaryPath, duplicateConcreteContractBody, 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010202Z-project-knowledge-compact-duplicate-contract-a1b2c411',
    ]),
    /concrete contract maps to multiple api_id values: compact_operations\/compact_capability_01\/POST \/app\/compact\/01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| 实现定位 | `Compact01Controller.java:10-20#execute` |',
      '| 实现定位 | `Compact01Controller.java:22-30#query` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010203Z-project-knowledge-compact-cross-block-evidence-a1b2c403',
    ]),
    /short locator does not exactly match path evidence|visible implementation locator does not match its scoped implementation trace/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| `S1` | 登录会员 | `COMPACT_01_EXECUTE` | caller |',
      '| `S1` | 登录会员 | `COMPACT_01_EXECUTE` | consumer |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010204Z-project-knowledge-compact-consumer-caller-a1b2c404',
    ]),
    /consumer or handler must not be represented as a caller: compact_operations\/compact_capability_01\/S1\/COMPACT_01_EXECUTE/,
  );

  const eventProducerConsumerBody = firstCompactSecondaryBody
    .replace(
      '| 登录会员 | authenticated + compact:read | `COMPACT_01_QUERY` | GET /app/compact/01/{recordId} | 当前会员拥有的处理记录 |',
      '| 精简业务能力 | 可信内部事件发布者 | `COMPACT_01_QUERY` | EVENT CompactResultChanged | 当前能力形成的处理记录 |',
    )
    .replace(
      '| `S3` | 精简业务能力 | `not_applicable` | not_applicable |',
      '| `S3` | 精简业务能力 | `COMPACT_01_QUERY` | producer |',
    )
    .replace(
      '| `S4` | 登录会员 | `COMPACT_01_QUERY` | caller |',
      '| `S4` | 登录会员 | `COMPACT_01_QUERY` | consumer |',
    )
    .replace(
      /\n### 5\.2 查询处理结果[\s\S]*?(?=\n## 6\. 缺口)/,
      (group) => group
        .replace(/GET \/app\/compact\/01\/\{recordId\}/g, 'EVENT CompactResultChanged')
        .replace('| 调用方/参与者 | 登录会员 |', '| 调用方/参与者 | 精简业务能力、登录会员 |')
        .replace('| 对应流程步骤 | `S4` |', '| 对应流程步骤 | `S3-S4` |')
        .replace('| 契约类型 | HTTP |', '| 契约类型 | EVENT |'),
    );
  await writeFile(firstCompactSecondaryPath, eventProducerConsumerBody, 'utf8');
  const { stdout: eventProducerConsumerStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', compactCapabilityRepo,
    '--run-id', '20260716T010207Z-project-knowledge-compact-event-relations-a1b2c407',
  ]);
  assert.equal(JSON.parse(eventProducerConsumerStdout).ok, true);

  const noInterfaceCompactSecondaryBody = firstCompactSecondaryBody
    .replace(
      'interface_design_status=detailed interface_coverage=partial interface_gap_id=gap_compact_secondary_traceability',
      [
        'interface_design_status=not_applicable interface_coverage=not_applicable interface_gap_id=not_applicable',
        'interface_not_applicable_reason=该能力仅执行内部业务步骤且不存在独立契约',
        'interface_not_applicable_evidence=src/compact/Compact01Service.java:30-45#recordResult',
      ].join('\n'),
    )
    .replace(/\n<!-- axis-access-matrix-machine-table[\s\S]*?-->\n/, '\n')
    .replace(
      '| `S1` | 登录会员 | `COMPACT_01_EXECUTE` | caller |',
      '| `S1` | 登录会员 | `not_applicable` | not_applicable |',
    )
    .replace(
      '| `S4` | 登录会员 | `COMPACT_01_QUERY` | caller |',
      '| `S4` | 登录会员 | `not_applicable` | not_applicable |',
    )
    .replace(/\n## 5\. 接口摘要[\s\S]*?\n## 6\. 缺口/, [
      '',
      '## 5. 接口摘要',
      '',
      '该能力仅执行有证据的内部业务步骤，不暴露独立 HTTP、事件、主题、任务或命令契约。',
      '',
      '证据：`Compact01Service.java:30-45#recordResult`。',
      '',
      '<!-- axis-evidence: src/compact/Compact01Service.java:30-45#recordResult -->',
      '',
      '## 6. 缺口',
    ].join('\n'));
  await writeFile(firstCompactSecondaryPath, noInterfaceCompactSecondaryBody, 'utf8');
  const { stdout: noInterfaceStdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, 'dist', 'cli.js'),
    'project-knowledge-capture',
    '--repo', compactCapabilityRepo,
    '--run-id', '20260716T010205Z-project-knowledge-compact-no-interface-a1b2c405',
  ]);
  assert.equal(JSON.parse(noInterfaceStdout).ok, true);

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      'interface_design_status=detailed interface_coverage=partial interface_gap_id=gap_compact_secondary_traceability',
      [
        'interface_design_status=not_applicable interface_coverage=not_applicable interface_gap_id=not_applicable',
        'interface_not_applicable_reason=该能力仅执行内部业务步骤且不存在独立契约',
        'interface_not_applicable_evidence=src/compact/Compact01Service.java:30-45#recordResult',
      ].join('\n'),
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010206Z-project-knowledge-compact-no-interface-block-a1b2c406',
    ]),
    /interface not_applicable must not declare an access matrix: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      ' · [下一个二级能力](../compact_capability_02/detailed-design.md)',
      '',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010059Z-project-knowledge-compact-navigation-a1b2c3df',
    ]),
    /secondary capability navigation omits expected document: compact_operations\/compact_capability_01\/business\/capabilities\/compact_operations\/secondary-capabilities\/compact_capability_02\/detailed-design\.md/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| 精简业务能力 | 内部业务能力 | 校验对象归属并记录处理结果 | `S2`、`S3` |',
      '| 精简业务能力 | 内部业务能力 | 校验对象归属并记录处理结果 | `S2` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010100Z-project-knowledge-compact-participant-closure-a1b2c3e0',
    ]),
    /compact secondary capability participant step declaration mismatches flow: compact_operations\/compact_capability_01\/精简业务能力/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      [
        '    step_submit_01["登录会员提交执行请求"] --> step_validate_01["精简业务能力校验对象归属"]',
        '    step_validate_01 --> step_record_01["精简业务能力记录处理结果"]',
        '    step_record_01 --> step_query_01["登录会员查询处理结果"]',
      ].join('\n'),
      [
        '    request["发起能力请求"] --> authority["校验主体与权威边界"]',
        '    authority --> result["形成可验收业务结果"]',
      ].join('\n'),
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010101Z-project-knowledge-compact-generic-flow-a1b2c3e1',
    ]),
    /compact secondary capability business diagram is generic or mixes semantic layers: compact_operations\/compact_capability_01\/3/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody
      .replace(
        '| 接口/触发 | POST /app/compact/01 |',
        '| 接口/触发 | POST /app/compact/01；GET /app/compact/01/{recordId} |',
      )
      .replace(
        '| 方法与完整路径或主题 | POST /app/compact/01 |',
        '| 方法与完整路径或主题 | POST /app/compact/01；GET /app/compact/01/{recordId} |',
      ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010102Z-project-knowledge-compact-merged-interface-a1b2c3e2',
    ]),
    /compact secondary capability interface summary aggregates or omits a concrete contract: compact_operations\/compact_capability_01\/5\.1/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      /\n### 5\.2 查询处理结果[\s\S]*?\n## 6\. 缺口/,
      '\n## 6. 缺口',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010103Z-project-knowledge-compact-missing-interface-block-a1b2c3e3',
    ]),
    /compact secondary capability api_id sets do not close across access, flow and interface blocks: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| `api_id` | `COMPACT_01_QUERY` |',
      '| `api_id` | `COMPACT_01_EXECUTE` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010104Z-project-knowledge-compact-duplicate-api-id-a1b2c3e4',
    ]),
    /compact secondary capability interface block is not one-to-one with its api_id, contract and callers: compact_operations\/compact_capability_01\/5\.2\/COMPACT_01_EXECUTE/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace('reader_profile=compact\n', ''),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010100Z-project-knowledge-compact-profile-a1b2c3d0',
    ]),
    /compact partial document profile mismatch: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| 实现定位 | `Compact01Controller.java:10-20#execute` |',
      '| 实现定位 | `Compact01Controller.java:21-22#execute` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010100Z-project-knowledge-compact-evidence-line-a1b2c3d1',
    ]),
    /compact partial short locator does not exactly match path evidence: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| 实现定位 | `Compact01Controller.java:10-20#execute` |',
      '| 实现定位 | `Compact01Controller.java:10-20#execute/query` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010105Z-project-knowledge-compact-combined-locator-a1b2c3e5',
    ]),
    /compact partial locator is malformed or combines symbols: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      'src/compact/Compact01Authorization.java:10-18#canExecute` |',
      'src/compact/Compact01Authorization.java:10-18#canExecute/canRead` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260716T010106Z-project-knowledge-compact-hidden-combined-a1b2c3e6',
    ]),
    /compact partial locator is malformed or combines symbols: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| 实现定位 | `Compact01Controller.java:10-20#execute` |',
      '| 实现定位 | `Compact01Controller.java:10-20#wrongSymbol` |',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010100Z-project-knowledge-compact-evidence-symbol-a1b2c3d2',
    ]),
    /compact partial short locator does not exactly match path evidence: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '<!-- axis-evidence: src/compact/Compact01Controller.java:10-20#execute -->',
      [
        '<!-- axis-evidence: src/compact/Compact01Controller.java:10-20#execute -->',
        '<!-- axis-evidence: src/shadow/Compact01Controller.java:10-20#execute -->',
      ].join('\n'),
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010100Z-project-knowledge-compact-evidence-ambiguous-a1b2c3d3',
    ]),
    /compact partial short locator is ambiguous: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '    step_record_01 --> step_query_01["登录会员查询处理结果"]',
      [
        '    step_record_01 --> step_query_01["登录会员查询处理结果"]',
        '    step_query_01 --> BusinessStep',
      ].join('\n'),
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010100Z-project-knowledge-compact-bare-node-a1b2c3d4',
    ]),
    /compact secondary capability business diagram is generic or mixes semantic layers: compact_operations\/compact_capability_01\/3/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '    step_record_01 --> step_query_01["登录会员查询处理结果"]',
      '    step_record_01 --> step_query_01["登录会员查询处理结果"]; BusinessStep --> step_submit_01',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010100Z-project-knowledge-compact-semicolon-bare-node-a1b2c3d5',
    ]),
    /compact secondary capability business diagram is generic or mixes semantic layers: compact_operations\/compact_capability_01\/3/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(`business_ids=${firstCompactSecondary.businessId}\n`, ''),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010101Z-project-knowledge-compact-business-ids-a1b2c3d5',
    ]),
    /compact partial secondary capability metadata business_ids mismatch: compact_operations\/compact_capability_01/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      'step_validate_01["精简业务能力校验对象归属"]',
      'step_validate_01["Compact01Service.validateOwnership()"]',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010102Z-project-knowledge-compact-non-atomic-a1b2c3d6',
    ]),
    /compact secondary capability business diagram is generic or mixes semantic layers: compact_operations\/compact_capability_01\/3/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody.replace(
      '| 接口/触发 | POST /app/compact/01 |\n',
      '',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010103Z-project-knowledge-compact-empty-interface-a1b2c3d7',
    ]),
    /compact secondary capability interface summary does not match fixed schema: compact_operations\/compact_capability_01\/5\.1/,
  );

  await writeFile(
    firstCompactSecondaryPath,
    firstCompactSecondaryBody
      .replace(' interface_gap_id=gap_compact_secondary_traceability', '')
      .replace('；缺口：gap_compact_secondary_traceability。', '。'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010104Z-project-knowledge-compact-gap-a1b2c3d8',
    ]),
    /compact partial secondary capability requires an explicit interface gap: compact_operations\/compact_capability_01/,
  );
  await writeFile(firstCompactSecondaryPath, firstCompactSecondaryBody, 'utf8');

  await writeFile(
    compactLevel1Path,
    compactLevel1.replace(
      'secondary-capabilities/compact_capability_01/detailed-design.md',
      'secondary-capabilities/missing/detailed-design.md',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010105Z-project-knowledge-compact-link-a1b2c3d9',
    ]),
    /compact partial level-1 overview omits secondary capability link: compact_operations\/compact_capability_01/,
  );
  await writeFile(compactLevel1Path, compactLevel1, 'utf8');

  await writeFile(
    compactLevel1Path,
    compactLevel1.replace('reader_profile=compact\n', ''),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010105Z-project-knowledge-compact-level1-profile-a1b2c3dc',
    ]),
    /compact partial level-1 capability requires reader_profile=compact: compact_operations/,
  );
  await writeFile(compactLevel1Path, compactLevel1, 'utf8');

  await writeFile(
    compactInventoryPath,
    compactInventory.replace(
      'business_ids: [compact_business_02]',
      'business_ids: [compact_business_01]',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010106Z-project-knowledge-inline-duplicate-a1b2c3da',
    ]),
    /business_id is assigned to multiple secondary capabilities: compact_business_01/,
  );
  await writeFile(
    compactInventoryPath,
    compactInventory.replace(
      'business_ids: [compact_business_02]',
      'business_ids: [Invalid-Business-Id]',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', compactCapabilityRepo,
      '--run-id', '20260715T010107Z-project-knowledge-inline-invalid-a1b2c3db',
    ]),
    /secondary capability must contain valid business_ids: compact_operations\/compact_capability_02/,
  );
} finally {
  await rm(compactCapabilityRepo, { recursive: true, force: true });
}

const dashboardWork = await mkdtemp(path.join(tmpdir(), 'axis-doc-dashboard-archive-'));
await rm(dashboardWork, { recursive: true, force: true });
try {
  const dashboardScript = path.join(repoRoot, 'skills', 'axis-doc-dashboard', 'scripts', 'axis_doc_dashboard.py');
  await execFileAsync('python3', [dashboardScript, 'scaffold', '--target', dashboardWork]);
  const core = await readFile(path.join(dashboardWork, 'src', 'core.mjs'), 'utf8');
  const browser = await readFile(path.join(dashboardWork, 'src', 'browser.mjs'), 'utf8');
  const html = await readFile(path.join(dashboardWork, 'public', 'index.html'), 'utf8');
  assert.match(core, /axis\.document_archive/);
  assert.match(core, /axis\.package\.manifest/);
  assert.match(core, /synchronizedProjectDocumentPaths/);
  assert.match(core, /project\.archives|archives:/);
  assert.match(core, /archive_count/);
  assert.match(browser, /historyPanel/);
  assert.match(html, /历史追溯/);
  assert.match(html, /返回当前版本/);
  assert.match(html, /id="historyPanel"/);
} finally {
  await rm(dashboardWork, { recursive: true, force: true });
}

const packagedDirs = (await readdir(path.join(repoRoot, 'skills'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(packagedDirs, skillNames.sort());
