import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cli = path.resolve('dist/cli.js');
const repo = await mkdtemp(path.join(tmpdir(), 'axis-project-knowledge-indentless-'));

try {
  const projectRoot = path.join(
    repo,
    '.axis',
    'docs',
    'orgs',
    'org_indentless',
    'projects',
    'indentless-project',
  );

  await mkdir(path.join(repo, '.axis'), { recursive: true });
  await writeFile(path.join(repo, '.axis', 'config.yml'), [
    'contract_version: "0.2"',
    'organization:',
    '  id: org_indentless',
    '  registry: .axis/organizations.yml',
    'project:',
    '  slug: indentless-project',
    '  display_name: Indentless Project',
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
    '',
  ].join('\n'), 'utf8');
  await writeFile(path.join(repo, '.axis', 'organizations.yml'), [
    'schema: axis.organization_registry',
    'schema_version: "0.2"',
    'organizations:',
    '  - id: org_indentless',
    '    slug: indentless',
    '    display_name: Indentless',
    '    status: active',
    '    oss_profiles:',
    '      - name: private_beta_main',
    '        provider: aliyun-oss',
    '        bucket: indentless-example',
    '        prefix: axis/v0.2',
    '        endpoint_env: ALIYUN_OSS_ENDPOINT',
    '        region_env: ALIYUN_OSS_REGION',
    '        access_key_id_env: ALIYUN_OSS_ACCESS_KEY_ID',
    '        access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET',
    '    products:',
    '      - slug: indentless',
    '        display_name: Indentless',
    '        projects:',
    '          - slug: indentless-project',
    '            display_name: Indentless Project',
    '',
  ].join('\n'), 'utf8');

  await mkdir(path.join(projectRoot, 'architecture'), { recursive: true });
  await mkdir(
    path.join(projectRoot, 'business', 'capabilities', 'commerce', 'secondary-capabilities', 'sales'),
    { recursive: true },
  );
  await mkdir(path.join(projectRoot, 'gaps'), { recursive: true });
  await writeFile(path.join(projectRoot, 'metadata.yaml'), 'status: review\n', 'utf8');
  await writeFile(path.join(projectRoot, 'architecture', 'technical.md'), '# 技术架构\n', 'utf8');
  await writeFile(
    path.join(projectRoot, 'architecture', 'business.md'),
    '# 业务架构\n\nbusiness/capabilities/commerce/detailed-design.md\n',
    'utf8',
  );
  await writeFile(path.join(projectRoot, 'business', 'inventory.yaml'), [
    'level1_capabilities:',
    '- level1_capability_id: commerce',
    '  level1_capability_name: 商业经营',
    '  secondary_capabilities:',
    '  - secondary_capability_id: sales',
    '    business_ids:',
    '    - sales',
    '',
  ].join('\n'), 'utf8');
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'commerce', 'detailed-design.md'),
    '# 商业经营\n\nsales\n\nbusiness/capabilities/commerce/secondary-capabilities/sales/detailed-design.md\n',
    'utf8',
  );
  await writeFile(
    path.join(projectRoot, 'business', 'capabilities', 'commerce', 'secondary-capabilities', 'sales', 'detailed-design.md'),
    '# 销售交易\n\nsecondary_capability_id: sales\n',
    'utf8',
  );
  await writeFile(path.join(projectRoot, 'gaps', 'doc-gap-report.md'), '# 文档差距\n', 'utf8');

  const { stdout } = await execFileAsync(process.execPath, [
    cli,
    'project-knowledge-capture',
    '--repo',
    repo,
    '--run-id',
    '20260713T040000Z-project-knowledge-a1b2c3d4',
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.ok(result.files.includes('documents/business/capabilities/commerce/detailed-design.md'));
  assert.ok(result.files.includes(
    'documents/business/capabilities/commerce/secondary-capabilities/sales/detailed-design.md',
  ));
} finally {
  await rm(repo, { recursive: true, force: true });
}
