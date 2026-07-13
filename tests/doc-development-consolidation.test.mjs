import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

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
  '# {project_name} · {level1_capability_name} 详细设计说明书',
  'level1_capability_id',
  '二级能力完整性清单',
  'secondary_capabilities',
  '对应 business_id',
  '二级能力导航',
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
  '表结构设计',
  '数据表清单',
  '字段结构',
  '索引与约束',
  '表关系与数据所有权',
  '状态与字段映射',
  '数据迁移、兼容与回滚',
  '业务流与逻辑关系',
  '接口到代码追踪',
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
    '  - level1_capability_id: merchant_operations',
    '    level1_capability_name: 商户经营',
    '    secondary_capabilities:',
    '      - secondary_capability_id: merchant_governance',
    '        name: 入驻申请、审核与门店管理',
    '        business_ids:',
    '          - merchant_shop_governance',
    '      - secondary_capability_id: catalog_inventory',
    '        name: 分类、品牌、商品、SKU与库存',
    '        business_ids:',
    '          - product_catalog_inventory',
  ].join('\n'), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    '# 商户经营详细设计\n\n## 二级能力完整性清单\n\n- [`merchant_governance`](business/capabilities/merchant_operations/secondary-capabilities/merchant_governance/detailed-design.md)：入驻申请、审核与门店管理\n- [`catalog_inventory`](business/capabilities/merchant_operations/secondary-capabilities/catalog_inventory/detailed-design.md)：分类、品牌、商品、SKU与库存\n',
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'secondary-capabilities', 'merchant_governance', 'detailed-design.md'),
    '# 入驻与门店管理详细设计\n\n`secondary_capability_id`: `merchant_governance`\n',
    'utf8',
  );
  const catalogSecondaryPath = path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'secondary-capabilities', 'catalog_inventory', 'detailed-design.md');
  await writeFile(
    catalogSecondaryPath,
    '# 商品与库存详细设计\n\n`secondary_capability_id`: `catalog_inventory`\n',
    'utf8',
  );
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
  await writeFile(
    catalogSecondaryPath,
    '# 商品与库存详细设计\n\n`secondary_capability_id`: `catalog_inventory`\n',
    'utf8',
  );
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
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'merchant_operations', 'detailed-design.md'),
    '# 商户经营详细设计\n\n## 二级能力完整性清单\n\n- [`merchant_governance`](business/capabilities/merchant_operations/secondary-capabilities/merchant_governance/detailed-design.md)：入驻申请、审核与门店管理\n',
    'utf8',
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(repoRoot, 'dist', 'cli.js'),
      'project-knowledge-capture',
      '--repo', capabilityRepo,
      '--run-id', '20260713T010104Z-project-knowledge-incomplete-d4e5f6a7',
    ]),
    /level-1 capability detailed design omits secondary_capability_id: merchant_operations\/catalog_inventory/,
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
