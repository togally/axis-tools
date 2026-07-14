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
  'project_technical_architecture',
  'project_business_architecture',
  'business_capability_detailed_design',
  'secondary_capability_detailed_design',
  'level1_capability_id',
  'secondary_capabilities',
  'one overview document per level-1 capability',
  'approved',
  'supersedes',
  '_archive',
  'Mandatory OSS Synchronization Gate',
  'project-knowledge-capture',
  'oss-publish',
  '--dry-run',
  'published',
  'OSS-first',
]) {
  assert.match(developmentBody, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

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
assert.deepEqual(projectKnowledge.files.sort(), [
  'SKILL.md',
  'agents/openai.yaml',
  'quick_validate.py',
  'references/business-capability-detailed-design-template.md',
  'references/level1-capability-dependency-graph-template.yaml',
  'references/project-business-architecture-template.md',
  'references/project-technical-architecture-template.md',
  'references/secondary-capability-detailed-design-template.md',
]);
const projectKnowledgeBody = await readFile(path.join(repoRoot, projectKnowledge.path, 'SKILL.md'), 'utf8');
for (const requiredText of [
  'bootstrap',
  'scan_and_reconcile',
  'requirement_design',
  'project_technical_architecture',
  'project_business_architecture',
  'business_inventory',
  'business_capability_detailed_design',
  'level1_capability_id',
  'level1_capability_name',
  'secondary_capabilities',
  'business/capabilities/{level1_capability_id}/detailed-design.md',
  'business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md',
  'one canonical overview per level1_capability_id',
  'every secondary capability',
  'secondary_capability_detailed_design',
  'doc_gap_report',
]) {
  assert.match(projectKnowledgeBody, new RegExp(requiredText));
}
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
  '代码对象与关系',
  '文件路径:起始行-结束行#符号',
]) {
  assert.match(secondaryCapabilityTemplate, new RegExp(requiredText));
}
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
    '    U["商户或平台运营人员：在业务页面提交入驻申请、审核与门店管理操作"] -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S1["secondary_capability_id: merchant_governance"]',
    [
      '    U["商户或平台运营人员：在业务页面提交入驻申请、审核与门店管理操作"] --> A["api_id: MERCHANT_GOVERNANCE_EXECUTE"]',
      '    A --> I["POST /api/merchant_governance/actions"]',
      '    I --> S1["secondary_capability_id: merchant_governance"]',
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
    '    S1 -->|"api_id: CATALOG_INVENTORY_EXECUTE · POST /api/catalog_inventory/actions"| S2["secondary_capability_id: catalog_inventory"]',
    '    S1_ALIAS["secondary_capability_id: merchant_governance"] -->|"api_id: CATALOG_INVENTORY_EXECUTE · POST /api/catalog_inventory/actions"| S2["secondary_capability_id: catalog_inventory"]',
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
    'U["商户或平台运营人员：在业务页面提交入驻申请、审核与门店管理操作"]',
    'U["内部调度器发起处理"]',
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

  const level1GraphWithoutVisibleResult = validLevel1CapabilityDetailedDesign('merchant_operations').replace(
    'S1 --> R["返回业务编号和当前状态"]',
    'S1 --> R["内部处理结束"]',
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
    '    S1 --> R["返回业务编号和当前状态"]',
    [
      '    S1 --> R["返回业务编号和当前状态"]',
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
    '    U["商户或平台运营人员：在业务页面提交入驻申请、审核与门店管理操作"] -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S1["secondary_capability_id: merchant_governance"]',
    '    S1 --> R["返回业务编号和当前状态"]',
  ].join('\n');
  const repeatedApiSequentialGraph = [
    '    U["商户或平台运营人员：在业务页面提交入驻申请、审核与门店管理操作"] -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S1["secondary_capability_id: merchant_governance"]',
    '    S1 -->|"api_id: MERCHANT_GOVERNANCE_EXECUTE · POST /api/merchant_governance/actions"| S2["secondary_capability_id: merchant_governance"]',
    '    S2 --> R["返回业务编号和当前状态"]',
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

const dashboardWork = await mkdtemp(path.join(tmpdir(), 'axis-doc-dashboard-archive-'));
await rm(dashboardWork, { recursive: true, force: true });
try {
  const dashboardScript = path.join(repoRoot, 'skills', 'axis-doc-dashbord', 'scripts', 'axis_doc_dashbord.py');
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
