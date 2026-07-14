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
  validLevel1CapabilityDetailedDesign,
  validSecondaryDetailedDesign,
} from './helpers/project-knowledge-fixtures.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

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
  'Interface and Persistence Applicability Gate',
  'interface_design_status',
  'interface_coverage',
  'persistence_design_status',
  'relationship_model_status',
  '请求字段',
  '响应字段',
  '错误码与异常映射',
  'physical_fk',
  'logical_relation',
  '禁止使用 `BUSINESS_FLOW`',
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
  '# {project_name} · {level1_capability_name} 用户业务操作全景',
  'level1_capability_id',
  '用户业务操作全景',
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
  '不得遗漏任何二级能力',
  '二级能力文档',
  '返回业务架构',
  '上一个能力',
  '下一个能力',
]) {
  assert.match(capabilityTemplate, new RegExp(requiredText));
}

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
  'persistence_design_status',
  'relationship_model_status',
  '表结构设计',
  '数据表清单',
  '字段结构',
  '索引与约束',
  '表关系与数据所有权',
  '状态与字段映射',
  '数据迁移、兼容与回滚',
  '能力级流程与跨接口关系',
  '接口详细设计',
  '请求字段',
  '响应字段',
  '错误码与异常映射',
  '禁止使用 `BUSINESS_FLOW`',
  'physical_fk',
  'logical_relation',
  '代码对象与关系',
  '实体、表与对象关系',
  '实体-表-代码映射',
  '端到端追溯矩阵',
  '文件路径:起始行-结束行#符号',
]) {
  assert.match(secondaryCapabilityTemplate, new RegExp(requiredText));
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
  await writeFile(businessArchitecturePath, '# 业务架构\n\n[商户经营](business/capabilities/merchant_operations/detailed-design.md)\n', 'utf8');
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
    /level-1 capability detailed design missing user operation panorama: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  const validLevel1WithRows = validLevel1CapabilityDetailedDesign('merchant_operations');
  const merchantJourneyRow = validLevel1WithRows
    .split('\n')
    .find((line) => line.startsWith('| `MERCHANT_GOVERNANCE_EXECUTE`'));
  assert.ok(merchantJourneyRow);
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1WithRows.replace(
      merchantJourneyRow,
      `${merchantJourneyRow.replace('在业务页面', '在业务 | 页面')}\n${merchantJourneyRow}`,
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-malformed-level1-row-a0b1c2dc',
    ]),
    /level-1 capability user journey table has malformed row: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
  );
  const invalidSeparatorLines = validLevel1CapabilityDetailedDesign('merchant_operations').split('\n');
  const journeyHeaderIndex = invalidSeparatorLines.findIndex((line) => line.includes('| `journey_id` |'));
  assert.ok(journeyHeaderIndex >= 0);
  invalidSeparatorLines[journeyHeaderIndex + 1] = merchantJourneyRow;
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    invalidSeparatorLines.join('\n'),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010100Z-project-knowledge-level1-separator-a0b1c2df',
    ]),
    /level-1 capability user journey table has malformed separator: merchant_operations/,
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('merchant_operations'),
    'utf8',
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
        '| 入驻申请、审核与门店管理 | 完成入驻申请、审核与门店管理 |',
        '| 入驻申请、审核与门店管理 | 完成入驻申请\\|审核与门店管理 |',
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
      .replace('| `api_id` | `ORDER_CREATE` |', '| `api_id` | `missing_evidence` |'),
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
    /secondary capability detailed design contains journey_id absent from level-1 panorama: merchant_operations\/merchant_governance\/MERCHANT_GOVERNANCE_QUERY/,
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
  await writeFile(
    catalogSecondaryPath,
    validSecondaryDetailedDesign('catalog_inventory').replace(
      'ORDER ||--o{ ORDER_ITEM : "order.id = order_item.order_id; logical_relation"',
      'BUSINESS_FLOW ||--o{ ORDER : "writes"',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010106Z-project-knowledge-pseudo-er-f6a7b8c9',
    ]),
    /secondary capability detailed design uses non-entity ER placeholder: merchant_operations\/catalog_inventory/,
  );
  await writeFile(
    catalogSecondaryPath,
    validSecondaryDetailedDesign('catalog_inventory').replace(
      'order.id = order_item.order_id; logical_relation',
      'order_id',
    ),
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010106Z-project-knowledge-er-contract-f6a7b8ca',
    ]),
    /secondary capability ER relationship missing join fields or relationship type: merchant_operations\/catalog_inventory/,
  );
  await writeFile(catalogSecondaryPath, validSecondaryDetailedDesign('catalog_inventory'), 'utf8');
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
  await writeFile(businessArchitecturePath, '# 业务架构\n\n[商户经营](business/capabilities/merchant_operations/detailed-design.md)\n', 'utf8');

  await writeFile(merchantSecondaryPath, flatSecondaryDetailedDesign('merchant_governance'), 'utf8');
  await writeFile(catalogSecondaryPath, flatSecondaryDetailedDesign('catalog_inventory'), 'utf8');
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010107Z-project-knowledge-interface-flat-f7a8b9c0',
    ]),
    /secondary capability interface design must group each interface: merchant_operations\/merchant_governance/,
  );

  const validGroupedMerchantSecondary = validGroupedSecondaryDetailedDesign('merchant_governance');
  const validGroupedCatalogSecondary = validGroupedSecondaryDetailedDesign('catalog_inventory');
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
    /\| Web 管理端用户 \| `authenticated \+ order:create` \| `ORDER_CREATE` \|/,
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
    /\| `ORDER_CREATE` \| `POST \/api\/merchant_governance\/actions` \| 当前组织内可创建的订单 \|/,
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
    /\| Web 管理端用户 \| `authenticated \+ order:create` \| `ORDER_CREATE` \|/,
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
    assert.match(merchantWithInterfaceLogic, new RegExp(`#### ${prefix.replace('.', '\\.')}\\.6 认证、授权、幂等与事务`));
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
