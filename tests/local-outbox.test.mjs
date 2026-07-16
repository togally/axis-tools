import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  validLevel1CapabilityDependencyGraph,
  validLevel1CapabilityDetailedDesign,
  validSecondaryDetailedDesign,
} from './helpers/project-knowledge-fixtures.mjs';

const execFileAsync = promisify(execFile);
const cli = path.resolve('dist/cli.js');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-local-outbox-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function run(args, options = {}) {
  return execFileAsync(process.execPath, [cli, ...args], {
    ...options,
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...(options.env ?? {}),
    },
  });
}

async function initializeProject(repo, extraArgs = []) {
  const { stdout: inspectStdout } = await run([
    'project-init',
    '--repo',
    repo,
    '--inspect',
    '--json',
    ...extraArgs,
  ]);
  const inspection = JSON.parse(inspectStdout);
  const decisions = inspection.fields.map((entry) => {
    const value = Object.hasOwn(entry, 'current_value')
      ? entry.current_value
      : Object.hasOwn(entry, 'mapped_value')
        ? entry.mapped_value
        : entry.recommendation ?? null;
    const decision = entry.resolution === 'stored'
      ? 'keep'
      : entry.resolution === 'mapped'
        ? 'accept_mapping'
        : entry.resolution === 'recommended'
          ? 'accept_recommendation'
          : 'change';
    return { key: entry.key, value, decision };
  });
  for (const decision of decisions) {
    if (decision.key === 'organization.id') decision.value = 'org_axis_tools';
    if (decision.key === 'oss_profile.name') decision.value = 'private_beta_main';
    if (decision.key === 'oss_profile.bucket') decision.value = 'axis-v02-private-beta-example';
    if (decision.key === 'oss_profile.prefix') decision.value = 'axis/v0.2';
    if (decision.key === 'project.slug') decision.value = 'demo-project';
    if (decision.key === 'project.display_name') decision.value = 'Demo Project';
    if (
      decision.key === 'organization.id'
      || decision.key === 'oss_profile.name'
      || decision.key === 'oss_profile.bucket'
      || decision.key === 'oss_profile.prefix'
      || decision.key === 'project.slug'
      || decision.key === 'project.display_name'
    ) {
      decision.decision = 'change';
    }
  }
  const answersPath = path.join(repo, 'project-init-answers.json');
  await writeFile(answersPath, `${JSON.stringify({
    schema: 'axis.project_init_answers',
    schema_version: 1,
    repo: inspection.repo,
    latest_contract_version: inspection.latest_contract_version,
    selectors: inspection.selectors,
    files: inspection.files,
    decisions,
    final_confirmation: true,
  }, null, 2)}\n`, 'utf8');
  const { stdout } = await run([
    'project-init',
    '--repo',
    repo,
    '--answers-file',
    answersPath,
    '--apply',
  ], {
    env: {
      ALIYUN_OSS_ENDPOINT: 'https://oss.example.invalid',
      ALIYUN_OSS_REGION: 'oss-cn-hangzhou',
      ALIYUN_OSS_ACCESS_KEY_ID: 'LTAI_TEST_ACCESS_KEY_ID',
      ALIYUN_OSS_ACCESS_KEY_SECRET: 'test-secret-value',
    },
  });
  return JSON.parse(stdout);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function rewritePackageJsonAndRefreshManifest(packageDir, relativePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(packageDir, relativePath), serialized, 'utf8');

  const manifestPath = path.join(packageDir, 'manifest.json');
  const manifest = await readJson(manifestPath);
  const entry = manifest.files.find((file) => file.path === relativePath);
  assert.ok(entry);
  entry.sha256 = sha256(serialized);
  entry.bytes = Buffer.byteLength(serialized);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function publicSafeReport(result = 'passed') {
  return [
    '# Report',
    '',
    '## Summary',
    'Local package smoke report.',
    '',
    '## Scope',
    'Demo project package generation.',
    '',
    '## Commands',
    '- npm test',
    '',
    '## Result',
    result,
    '',
    '## Evidence',
    'Focused checks passed.',
    '',
    '## Public Safety',
    'Reviewed; no credentials or private URLs included.',
    '',
    '## Limitations',
    'Local-only package, not uploaded.',
    '',
    '## Next Actions',
    'Review generated package files.',
    '',
  ].join('\n');
}

async function writeTestReport(repo, options = {}) {
  const runId = options.runId ?? '20260704T010101Z-test-report-abcdef12';
  const report = options.report ?? publicSafeReport();
  const { stdout } = await run([
    'test-report',
    '--repo',
    repo,
    '--run-id',
    runId,
    '--title',
    'Demo Project Test Report',
    '--summary',
    'Public-safe validation report for the demo-project package contract.',
    '--status',
    'passed',
    '--tag',
    'axis-tools',
    '--tag',
    'test-report',
    '--report',
    report,
  ]);
  return JSON.parse(stdout);
}

async function writeV02Config(repo, options = {}) {
  const orgId = options.orgId ?? 'org_axis_tools';
  const profile = options.profile ?? 'private_beta_main';
  const channel = options.channel ?? 'private_beta';
  const gate = options.gate ?? 'not_requested';
  await mkdir(path.join(repo, '.axis'), { recursive: true });
  await writeFile(path.join(repo, '.axis', 'config.yml'), [
    'contract_version: "0.2"',
    'organization:',
    `  id: ${orgId}`,
    '  registry: .axis/organizations.yml',
    'project:',
    '  slug: demo-project',
    '  display_name: Demo Project',
    'package:',
    '  outbox_dir: .axis/outbox',
    'release:',
    `  channel: ${channel}`,
    `  gate: ${gate}`,
    'oss:',
    '  provider: aliyun-oss',
    `  profile: ${profile}`,
    'skills:',
    '  project_init: axis-doc-project-init',
    '  coding_capture: axis-code-capture',
    '  test_report: axis-test-report',
    '  oss_publish: axis-ops-oss-publish',
    '',
  ].join('\n'), 'utf8');
}

async function writeV02Registry(repo) {
  await mkdir(path.join(repo, '.axis'), { recursive: true });
  await writeFile(path.join(repo, '.axis', 'organizations.yml'), [
    'schema: axis.organization_registry',
    'schema_version: "0.2"',
    'organizations:',
    '  - id: org_axis_tools',
    '    slug: axis-tools',
    '    display_name: Axis Tools',
    '    status: active',
    '    oss_profiles:',
    '      - name: private_beta_main',
    '        provider: aliyun-oss',
    '        bucket: axis-v02-private-beta-example',
    '        prefix: axis/v0.2',
    '        endpoint_env: ALIYUN_OSS_ENDPOINT',
    '        region_env: ALIYUN_OSS_REGION',
    '        access_key_id_env: ALIYUN_OSS_ACCESS_KEY_ID',
    '        access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET',
    '        security_token_env: ALIYUN_OSS_SECURITY_TOKEN',
    '    products:',
    '      - slug: axis-tools',
    '        display_name: Axis Tools',
    '        projects:',
    '          - slug: demo-project',
    '            display_name: Demo Project',
    '  - id: org_second_mock',
    '    slug: second-mock',
    '    display_name: Second Mock Organization',
    '    status: active',
    '    oss_profiles:',
    '      - name: private_beta_main',
    '        provider: aliyun-oss',
    '        bucket: second-org-v02-private-beta-example',
    '        prefix: axis/v0.2',
    '        endpoint_env: SECOND_OSS_ENDPOINT',
    '        region_env: SECOND_OSS_REGION',
    '        access_key_id_env: SECOND_OSS_ACCESS_KEY_ID',
    '        access_key_secret_env: SECOND_OSS_ACCESS_KEY_SECRET',
    '    products:',
    '      - slug: demo-product',
    '        display_name: Demo Product',
    '        projects:',
    '          - slug: demo-project',
    '            display_name: Same Slug In Another Org',
    '',
  ].join('\n'), 'utf8');
}

async function writeProjectKnowledgeDocs(repo) {
  const root = path.join(
    repo,
    '.axis',
    'docs',
    'orgs',
    'org_axis_tools',
    'projects',
    'demo-project',
  );
  await mkdir(path.join(root, 'architecture'), { recursive: true });
  await mkdir(path.join(root, 'business', 'capabilities', 'commerce'), { recursive: true });
  await mkdir(path.join(root, 'business', 'capabilities', 'commerce', 'secondary-capabilities', 'sales'), { recursive: true });
  await mkdir(path.join(root, 'business', 'capabilities', 'commerce', 'secondary-capabilities', 'support'), { recursive: true });
  await mkdir(
    path.join(root, 'business', 'capabilities', 'commerce', 'requirements', 'price-protection'),
    { recursive: true },
  );
  await mkdir(path.join(root, 'gaps'), { recursive: true });
  await writeFile(path.join(root, 'metadata.yaml'), 'document_language: zh-CN\nstatus: review\n', 'utf8');
  await writeFile(path.join(root, 'architecture', 'technical.md'), '# 技术架构\n\n## C4 系统上下文\n', 'utf8');
  await writeFile(path.join(root, 'architecture', 'business.md'), [
    '# 业务架构',
    '',
    '> 依赖图派生状态：`dependency_graph_status=derived` · `dependency_graph_revision=1` · `dependency_graph_gap_id=not_applicable`',
    '',
    '唯一机器源：`business/level1-capability-dependency-graph.yaml`',
    '',
    '## 业务能力地图',
    '',
    '[商业经营](business/capabilities/commerce/detailed-design.md)',
    '',
  ].join('\n'), 'utf8');
  await writeFile(
    path.join(root, 'business', 'inventory.yaml'),
    [
      'level1_capabilities:',
      '  - level1_capability_id: commerce',
      '    level1_capability_name: 商业经营',
      '    secondary_capabilities:',
      '      - secondary_capability_id: sales',
      '        name: 销售交易',
      '        business_ids:',
      '          - sales',
      '      - secondary_capability_id: support',
      '        name: 客户支持',
      '        business_ids:',
      '          - support',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(root, 'business', 'level1-capability-dependency-graph.yaml'),
    validLevel1CapabilityDependencyGraph([
      { id: 'commerce', name: '商业经营' },
    ]),
    'utf8',
  );
  await writeFile(
    path.join(root, 'business', 'capabilities', 'commerce', 'detailed-design.md'),
    validLevel1CapabilityDetailedDesign('commerce', [
      { id: 'sales', name: '销售交易' },
      { id: 'support', name: '客户支持' },
    ]),
    'utf8',
  );
  await writeFile(
    path.join(root, 'business', 'capabilities', 'commerce', 'secondary-capabilities', 'sales', 'detailed-design.md'),
    validSecondaryDetailedDesign('sales'),
    'utf8',
  );
  await writeFile(
    path.join(root, 'business', 'capabilities', 'commerce', 'secondary-capabilities', 'support', 'detailed-design.md'),
    validSecondaryDetailedDesign('support'),
    'utf8',
  );
  await writeFile(
    path.join(root, 'business', 'capabilities', 'commerce', 'requirements', 'price-protection', 'detailed-design.md'),
    '# 价保需求详细设计\n\n## 需求结论\n',
    'utf8',
  );
  await writeFile(path.join(root, 'gaps', 'doc-gap-report.md'), '# 文档差距报告\n', 'utf8');
}

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });

  const result = await initializeProject(repo);

  assert.equal(result.ok, true);
  assert.equal(result.config_path, '.axis/config.yml');
  assert.equal(result.contract_version, '0.2');
  assert.equal(result.registry_path, '.axis/organizations.yml');

  const config = await readFile(path.join(repo, '.axis', 'config.yml'), 'utf8');
  assert.match(config, /contract_version: "0\.2"/);
  assert.match(config, /organization:/);
  assert.match(config, /id: org_axis_tools/);
  assert.match(config, /profile: private_beta_main/);
  assert.match(config, /slug: demo-project/);
  assert.match(config, /display_name: Demo Project/);
  assert.match(config, /outbox_dir: \.axis\/outbox/);
  assert.match(config, /channel: private_beta/);
  assert.match(config, /gate: not_requested/);

  const registry = await readFile(path.join(repo, '.axis', 'organizations.yml'), 'utf8');
  assert.match(registry, /endpoint_env: ALIYUN_OSS_ENDPOINT/);
  assert.match(registry, /access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET/);

  const gitignore = await readFile(path.join(repo, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.axis\/config\.local\.yml$/m);
  assert.match(gitignore, /^\.axis\/docs\/$/m);
  assert.match(gitignore, /^\.axis\/outbox\/$/m);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);

  const { stdout, stderr } = await run(['validate-config', '--repo', repo], {
    env: {
      ALIYUN_OSS_ENDPOINT: 'https://secret-endpoint.example.invalid',
      ALIYUN_OSS_ACCESS_KEY_SECRET: 'super-secret-value',
    },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.release.channel, 'private_beta');
  assert.equal(result.release.gate, 'not_requested');
  assert.deepEqual(result.required_env.sort(), [
    'ALIYUN_OSS_ACCESS_KEY_ID',
    'ALIYUN_OSS_ACCESS_KEY_SECRET',
    'ALIYUN_OSS_ENDPOINT',
    'ALIYUN_OSS_REGION',
  ]);
  assert.doesNotMatch(stdout, /super-secret-value|secret-endpoint/);
  assert.doesNotMatch(stderr, /super-secret-value|secret-endpoint/);
});

await withTempDir(async (repo) => {
  await mkdir(path.join(repo, '.axis'), { recursive: true });
  await writeFile(path.join(repo, '.axis', 'config.yml'), 'contract_version: "0.1"\n', 'utf8');
  for (const args of [
    ['validate-config', '--repo', repo],
    ['coding-capture', '--repo', repo],
    ['test-report', '--repo', repo],
    ['oss-publish', '--repo', repo, '--run-id', '20260710T010101Z-test-report-abcdef12'],
  ]) {
    const error = await run(args).catch((caught) => caught);
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Axis v0\.1 is expired; migrate with project-init/);
  }
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);
  const configPath = path.join(repo, '.axis', 'config.yml');
  const config = await readFile(configPath, 'utf8');
  await writeFile(configPath, config.replace('channel: private_beta', 'channel: public'), 'utf8');

  const error = await run(['validate-config', '--repo', repo]).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /public release requires release.gate: passed/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);

  const { stdout } = await run([
    'test-report',
    '--repo',
    repo,
    '--run-id',
    '20260703T121530Z-test-report-a1b2c3d4',
    '--title',
    'Demo Project Test Report',
    '--summary',
    'Public-safe validation report for the demo-project package contract.',
    '--status',
    'passed',
    '--tag',
    'axis-tools',
    '--tag',
    'test-report',
    '--report',
    publicSafeReport(),
  ], {
    env: {
      ALIYUN_OSS_ACCESS_KEY_SECRET: 'super-secret-value',
    },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.asset_type, 'test_report');
  assert.equal(result.package_dir, '.axis/outbox/v0.2/org_axis_tools/demo-project/20260703T121530Z-test-report-a1b2c3d4');
  assert.deepEqual(result.files.sort(), ['experience.md', 'manifest.json', 'metadata.json', 'report.md']);
  assert.doesNotMatch(stdout, /super-secret-value/);

  const packageDir = path.join(repo, result.package_dir);
  assert.deepEqual((await readdir(packageDir)).sort(), ['experience.md', 'manifest.json', 'metadata.json', 'report.md']);

  const manifest = await readJson(path.join(packageDir, 'manifest.json'));
  assert.equal(manifest.schema, 'axis.package.manifest');
  assert.equal(manifest.schema_version, '0.2');
  assert.equal(manifest.package_id, 'org_axis_tools__demo-project__20260703T121530Z-test-report-a1b2c3d4');
  assert.equal(manifest.project.slug, 'demo-project');
  assert.equal(manifest.producer.skill, 'axis-test-report');
  assert.equal(manifest.release.channel, 'private_beta');
  assert.equal(manifest.release.gate, 'not_requested');
  assert.equal(manifest.publish.status, 'local_ready');
  assert.equal(manifest.publish.base_uri, 'oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/packages/20260703T121530Z-test-report-a1b2c3d4/');
  assert.deepEqual(manifest.files.map((file) => file.path).sort(), ['experience.md', 'metadata.json', 'report.md']);
  for (const file of manifest.files) {
    assert.match(file.path, /^[^/]+$/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.equal(Number.isInteger(file.bytes), true);
  }
  const reportEntry = manifest.files.find((file) => file.path === 'report.md');
  assert.ok(reportEntry);
  assert.deepEqual(manifest.protocols, {
    document_protocol: '0.2',
    workflow_protocol: '0.2',
    experience_protocol: '0.2',
    agent_execution_protocol: '0.2',
  });
  assert.deepEqual(manifest.document_refs, [
    {
      doc_id: 'report_20260703T121530Z_test_report_a1b2c3d4',
      doc_type: 'test_report',
      status: 'completed',
      revision: 1,
      source_path: 'report.md',
      content_sha256: reportEntry.sha256,
    },
  ]);
  assert.deepEqual(manifest.skill_refs, [
    {
      skill_id: 'axis-test-report',
      canonical_family: 'test_verify_benchmark',
      status: 'active',
    },
  ]);
  assert.deepEqual(manifest.tool_refs, []);
  assert.deepEqual(manifest.execution, {
    pack_id: null,
    report_doc_id: 'report_20260703T121530Z_test_report_a1b2c3d4',
    retry_of_run_id: null,
    resume_from_report_id: null,
  });
  assert.deepEqual(manifest.experience_refs, []);
  assert.deepEqual(manifest.workflow_recovery, {
    workflow_run_id: null,
    status: 'completed',
    blocked_reason: null,
    checkpoint_ref: 'report_20260703T121530Z_test_report_a1b2c3d4',
  });
  assert.equal(manifest.public_safety_validation.status, 'passed');
  assert.deepEqual(manifest.public_safety_validation.validators, [
    'deterministic_secret_scan',
    'private_url_scan',
    'manual_public_safe_review',
  ]);
  assert.equal(manifest.public_safety_validation.findings_count, 0);

  const metadata = await readJson(path.join(packageDir, 'metadata.json'));
  assert.equal(metadata.schema, 'axis.package.metadata');
  assert.equal(metadata.schema_version, '0.2');
  assert.equal(metadata.artifact.type, 'test_report');
  assert.equal(metadata.artifact.status, 'passed');
  assert.equal(metadata.skill.name, 'axis-test-report');
  assert.equal(metadata.public_safety.reviewed, true);
  assert.equal(metadata.public_safety.contains_credentials, false);
  assert.equal(metadata.public_safety.contains_private_urls, false);
  assert.equal(metadata.public_safety.validation.status, 'passed');
  assert.deepEqual(metadata.public_safety.validation.validators, [
    'deterministic_secret_scan',
    'private_url_scan',
    'manual_public_safe_review',
  ]);
  assert.equal(metadata.public_safety.validation.findings_count, 0);
  assert.equal(metadata.public_safety.validation.validated_by.role, 'producing_skill');
  assert.equal(metadata.document.doc_id, 'report_20260703T121530Z_test_report_a1b2c3d4');
  assert.equal(metadata.document.doc_type, 'test_report');
  assert.equal(metadata.document.status, 'completed');
  assert.equal(metadata.document.revision, 1);
  assert.equal(metadata.document.storage.path, 'report.md');
  assert.equal(metadata.document.storage.content_sha256, reportEntry.sha256);
  assert.equal(metadata.workflow.status, 'completed');
  assert.equal(metadata.workflow.checkpoint_ref, 'report_20260703T121530Z_test_report_a1b2c3d4');
  assert.equal(metadata.experience.scope, 'task');
  assert.equal(metadata.experience.related_skill, 'axis-test-report');
  assert.equal(metadata.experience.quality.evidence_count, 1);
  assert.equal(metadata.agent_execution.run_id, '20260703T121530Z-test-report-a1b2c3d4');
  assert.equal(metadata.agent_execution.expected_outputs.execution_report.required, true);
  assert.equal(metadata.agent_execution.expected_outputs.experience_candidates.required, false);
  assert.equal(metadata.links.manifest_path, 'manifest.json');
  assert.equal(metadata.links.report_path, 'report.md');
  assert.equal(metadata.links.experience_path, 'experience.md');
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);

  const { stdout } = await run([
    'coding-capture',
    '--repo',
    repo,
    '--run-id',
    '20260703T121531Z-coding-capture-deadbeef',
    '--title',
    'Demo Project Coding Capture',
    '--summary',
    'Public-safe coding capture for the demo-project package contract.',
    '--status',
    'informational',
    '--tag',
    'axis-tools',
    '--tag',
    'coding-capture',
    '--report',
    '# Report\n\n## Summary\nCoding capture completed.\n\n## Scope\nLocal-only output.\n\n## Commands\n- npm test\n\n## Result\ninformational\n\n## Evidence\nGenerated package files.\n\n## Public Safety\nReviewed.\n\n## Limitations\nNo upload.\n\n## Next Actions\nReview.\n',
    '--experience',
    '# Experience\n\n## Context\nLocal capture.\n\n## Decision\nWrite a package.\n\n## Steps\nGenerate files.\n\n## Validation\nInspect files.\n\n## Reuse Notes\nUse for local package capture.\n\n## Public Safety\nReviewed.\n',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.asset_type, 'coding_capture');

  const metadata = await readJson(path.join(repo, result.package_dir, 'metadata.json'));
  assert.equal(metadata.artifact.type, 'coding_capture');
  assert.equal(metadata.skill.name, 'axis-code-capture');
  assert.equal(metadata.document.doc_type, 'execution_report');
  assert.equal(metadata.experience.related_skill, 'axis-code-capture');
  assert.equal(metadata.agent_execution.expected_outputs.experience_candidates.required, true);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);
  const runId = '20260704T020202Z-test-report-abcdef12';
  await writeTestReport(repo, { runId });

  const { stdout, stderr } = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--dry-run'], {
    env: {
      ALIYUN_OSS_ENDPOINT: 'https://oss-example-endpoint.invalid',
      ALIYUN_OSS_REGION: 'oss-cn-hangzhou',
      ALIYUN_OSS_ACCESS_KEY_ID: 'LTAI_TEST_ACCESS_KEY_ID',
      ALIYUN_OSS_ACCESS_KEY_SECRET: 'dry-run-secret-value',
    },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'dry_run');
  assert.equal(result.uploaded, false);
  assert.equal(result.project.slug, 'demo-project');
  assert.equal(result.asset_type, 'test_report');
  assert.equal(result.run_id, runId);
  assert.deepEqual(result.release, { channel: 'private_beta', gate: 'not_requested' });
  assert.equal(result.publish.status, 'local_ready');
  assert.equal(result.target_prefix, `oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/packages/${runId}/`);
  assert.deepEqual(result.files.map((file) => file.path).sort(), ['experience.md', 'manifest.json', 'metadata.json', 'report.md']);
  assert.equal(result.upload_order.at(-1).path, 'manifest.json');
  assert.doesNotMatch(stdout, /dry-run-secret-value|LTAI_TEST_ACCESS_KEY_ID|oss-example-endpoint/);
  assert.doesNotMatch(stderr, /dry-run-secret-value|LTAI_TEST_ACCESS_KEY_ID|oss-example-endpoint/);

  const manifest = await readJson(path.join(repo, '.axis', 'outbox', 'v0.2', 'org_axis_tools', 'demo-project', runId, 'manifest.json'));
  assert.equal(manifest.publish.status, 'local_ready');
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);
  const runId = '20260704T030303Z-test-report-abcdef12';
  const report = publicSafeReport().replace(
    'Focused checks passed.',
    'ALIYUN_OSS_ACCESS_KEY_SECRET=leaked-secret-value\nAuthorization: Bearer leaked-token-value',
  );
  const packageResult = await writeTestReport(repo, { runId, report });

  const { stdout, stderr } = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--local-only']);

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'local_only');
  assert.equal(result.uploaded, false);
  assert.equal(result.redactions, 2);
  assert.doesNotMatch(stdout, /leaked-secret-value|leaked-token-value/);
  assert.doesNotMatch(stderr, /leaked-secret-value|leaked-token-value/);

  const packageDir = path.join(repo, packageResult.package_dir);
  const redactedReport = await readFile(path.join(packageDir, 'report.md'), 'utf8');
  assert.doesNotMatch(redactedReport, /leaked-secret-value|leaked-token-value/);
  assert.match(redactedReport, /\[REDACTED\]/);

  const manifest = await readJson(path.join(packageDir, 'manifest.json'));
  const reportEntry = manifest.files.find((file) => file.path === 'report.md');
  assert.ok(reportEntry);
  assert.equal(reportEntry.sha256, sha256(redactedReport));
  assert.equal(manifest.publish.status, 'local_ready');
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);
  const configPath = path.join(repo, '.axis', 'config.yml');
  const config = await readFile(configPath, 'utf8');
  await writeFile(
    configPath,
    config
      .replace('channel: private_beta', 'channel: public')
      .replace('gate: not_requested', 'gate: passed'),
    'utf8',
  );
  const runId = '20260704T040404Z-test-report-abcdef12';
  const packageResult = await writeTestReport(repo, { runId });
  const manifestPath = path.join(repo, packageResult.package_dir, 'manifest.json');
  const manifest = await readJson(manifestPath);
  manifest.release.gate = 'pending';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const error = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--local-only']).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /public release requires release.gate: passed/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);
  const runId = '20260704T050505Z-test-report-abcdef12';
  const packageResult = await writeTestReport(repo, { runId });
  await writeFile(path.join(repo, packageResult.package_dir, '.env'), 'ALIYUN_OSS_ACCESS_KEY_SECRET=unsafe\n', 'utf8');

  const error = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--dry-run']).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /refusing unsafe package path: \.env/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await initializeProject(repo);
  const runId = '20260704T060606Z-test-report-abcdef12';
  await writeTestReport(repo, { runId });
  const mockDir = path.join(repo, 'mock-oss');
  const objectPrefix = path.join(
    mockDir,
    'axis-v02-private-beta-example',
    'axis',
    'v0.2',
    'orgs',
    'org_axis_tools',
    'projects',
    'demo-project',
    'packages',
    runId,
  );
  await mkdir(objectPrefix, { recursive: true });
  await writeFile(path.join(objectPrefix, 'report.md'), 'conflicting remote object\n', 'utf8');
  await writeFile(path.join(objectPrefix, 'report.md.sha256'), '0000000000000000000000000000000000000000000000000000000000000000\n', 'utf8');

  const uploadEnv = {
    AXIS_OSS_MOCK_DIR: mockDir,
    ALIYUN_OSS_ENDPOINT: 'https://oss-example-endpoint.invalid',
    ALIYUN_OSS_REGION: 'oss-cn-hangzhou',
    ALIYUN_OSS_ACCESS_KEY_ID: 'LTAI_TEST_ACCESS_KEY_ID',
    ALIYUN_OSS_ACCESS_KEY_SECRET: 'retry-secret-value',
  };
  const firstError = await run(['oss-publish', '--repo', repo, '--run-id', runId], { env: uploadEnv }).catch((caught) => caught);

  assert.equal(firstError.code, 1);
  assert.match(firstError.stderr, /remote object differs: .*report\.md/);
  let manifest = await readJson(path.join(repo, '.axis', 'outbox', 'v0.2', 'org_axis_tools', 'demo-project', runId, 'manifest.json'));
  assert.equal(manifest.publish.status, 'failed');

  await rm(path.join(objectPrefix, 'report.md'), { force: true });
  await rm(path.join(objectPrefix, 'report.md.sha256'), { force: true });
  const { stdout, stderr } = await run(['oss-publish', '--repo', repo, '--run-id', runId], { env: uploadEnv });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'upload');
  assert.equal(result.uploaded, true);
  assert.equal(result.publish.status, 'published');
  assert.equal(result.upload_order.at(-1).path, 'manifest.json');
  assert.doesNotMatch(stdout, /retry-secret-value|LTAI_TEST_ACCESS_KEY_ID|oss-example-endpoint/);
  assert.doesNotMatch(stderr, /retry-secret-value|LTAI_TEST_ACCESS_KEY_ID|oss-example-endpoint/);
  assert.equal(existsSync(path.join(objectPrefix, 'manifest.json')), true);
  const remoteManifest = await readJson(path.join(objectPrefix, 'manifest.json'));
  assert.equal(remoteManifest.publish.status, 'published');
  manifest = await readJson(path.join(repo, '.axis', 'outbox', 'v0.2', 'org_axis_tools', 'demo-project', runId, 'manifest.json'));
  assert.equal(manifest.publish.status, 'published');
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeFile(path.join(repo, '.axis', 'config.yml'), [
    'contract_version: "0.2"',
    'project:',
    '  slug: demo-project',
    '  display_name: Demo Project',
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

  const error = await run(['validate-config', '--repo', repo]).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /organization\.id is required/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo, { orgId: 'org_missing' });

  const error = await run(['validate-config', '--repo', repo]).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /organization\.id is not declared in the organization registry/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo, { profile: 'missing_profile' });

  const error = await run(['validate-config', '--repo', repo]).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /oss\.profile is not declared for organization\.id/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  const runId = '20260706T010101Z-test-report-abcdef12';

  const packageResult = await writeTestReport(repo, { runId });

  assert.equal(packageResult.package_dir, `.axis/outbox/v0.2/org_axis_tools/demo-project/${runId}`);
  const manifest = await readJson(path.join(repo, packageResult.package_dir, 'manifest.json'));
  assert.equal(manifest.schema_version, '0.2');
  assert.equal(manifest.package_id, `org_axis_tools__demo-project__${runId}`);
  assert.deepEqual(manifest.organization, {
    id: 'org_axis_tools',
    slug: 'axis-tools',
    display_name: 'Axis Tools',
  });
  assert.deepEqual(manifest.project, {
    slug: 'demo-project',
    display_name: 'Demo Project',
  });
  assert.deepEqual(manifest.oss_profile, {
    name: 'private_beta_main',
    provider: 'aliyun-oss',
    bucket: 'axis-v02-private-beta-example',
    prefix: 'axis/v0.2',
  });
  assert.equal(
    manifest.publish.base_uri,
    `oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/packages/${runId}/`,
  );

  const metadata = await readJson(path.join(repo, packageResult.package_dir, 'metadata.json'));
  assert.deepEqual(metadata.organization, manifest.organization);
  assert.deepEqual(metadata.project, manifest.project);
  assert.equal(metadata.source_evidence.run_id, runId);
  assert.equal(metadata.index_refs.organization_index, 'axis/v0.2/orgs/org_axis_tools/index/projects.jsonl');
  assert.equal(metadata.index_refs.project_package_path, `axis/v0.2/orgs/org_axis_tools/projects/demo-project/packages/${runId}/`);

  await writeV02Config(repo, { orgId: 'org_second_mock' });
  const secondRunId = '20260706T010102Z-test-report-abcdef12';
  const secondPackageResult = await writeTestReport(repo, { runId: secondRunId });
  const secondManifest = await readJson(path.join(repo, secondPackageResult.package_dir, 'manifest.json'));

  assert.equal(secondPackageResult.package_dir, `.axis/outbox/v0.2/org_second_mock/demo-project/${secondRunId}`);
  assert.equal(secondManifest.organization.id, 'org_second_mock');
  assert.equal(secondManifest.oss_profile.bucket, 'second-org-v02-private-beta-example');
  assert.equal(
    secondManifest.publish.base_uri,
    `oss://second-org-v02-private-beta-example/axis/v0.2/orgs/org_second_mock/projects/demo-project/packages/${secondRunId}/`,
  );
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  await writeProjectKnowledgeDocs(repo);
  const runId = '20260711T020202Z-project-knowledge-abcdef12';

  const { stdout } = await run(['project-knowledge-capture', '--repo', repo, '--run-id', runId]);
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.asset_type, 'project_knowledge_snapshot');
  assert.equal(result.package_dir, `.axis/outbox/v0.2/org_axis_tools/demo-project/${runId}`);
  assert.deepEqual(result.files.sort(), [
    'documents/architecture/business.md',
    'documents/architecture/technical.md',
    'documents/business/capabilities/commerce/detailed-design.md',
    'documents/business/capabilities/commerce/requirements/price-protection/detailed-design.md',
    'documents/business/capabilities/commerce/secondary-capabilities/sales/detailed-design.md',
    'documents/business/capabilities/commerce/secondary-capabilities/support/detailed-design.md',
    'documents/business/inventory.yaml',
    'documents/business/level1-capability-dependency-graph.yaml',
    'documents/gaps/doc-gap-report.md',
    'documents/metadata.yaml',
    'manifest.json',
    'metadata.json',
  ]);

  const packageDir = path.join(repo, result.package_dir);
  const metadata = await readJson(path.join(packageDir, 'metadata.json'));
  const manifest = await readJson(path.join(packageDir, 'manifest.json'));
  assert.equal(manifest.files.some((file) => file.path === 'manifest.json'), false);
  assert.equal(metadata.artifact.type, 'project_knowledge_snapshot');
  assert.equal(metadata.document.doc_type, 'project_knowledge_snapshot');
  assert.equal(metadata.document.language, 'zh-CN');
  assert.equal(metadata.document.source_root, '.axis/docs/orgs/org_axis_tools/projects/demo-project');
  assert.equal(metadata.index_refs.organization_index, 'axis/v0.2/orgs/org_axis_tools/index/projects.jsonl');
  assert.equal(metadata.index_refs.project_document_path, 'axis/v0.2/orgs/org_axis_tools/projects/demo-project/');
  assert.equal(
    manifest.publish.base_uri,
    'oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/',
  );
  assert.equal(
    await readFile(path.join(packageDir, 'documents', 'architecture', 'technical.md'), 'utf8'),
    '# 技术架构\n\n## C4 系统上下文\n',
  );
  assert.equal(
    await readFile(path.join(packageDir, 'documents', 'business', 'capabilities', 'commerce', 'detailed-design.md'), 'utf8'),
    validLevel1CapabilityDetailedDesign('commerce', [
      { id: 'sales', name: '销售交易' },
      { id: 'support', name: '客户支持' },
    ]),
  );
  assert.deepEqual(
    metadata.document.documents
      .filter((document) => document.doc_type === 'business_capability_detailed_design')
      .map((document) => document.doc_id)
      .sort(),
    ['business_capability_detailed_design_commerce'],
  );
  assert.deepEqual(
    metadata.document.documents
      .filter((document) => document.doc_type === 'secondary_capability_detailed_design')
      .map((document) => document.doc_id)
      .sort(),
    [
      'secondary_capability_detailed_design_commerce_sales',
      'secondary_capability_detailed_design_commerce_support',
    ],
  );
  assert.equal(
    metadata.document.documents.find((document) => document.doc_type === 'requirement_detailed_design').doc_id,
    'requirement_detailed_design_commerce_price-protection',
  );

  const { stdout: publishStdout } = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--dry-run']);
  const publishResult = JSON.parse(publishStdout);
  assert.equal(publishResult.ok, true);
  assert.equal(publishResult.asset_type, 'project_knowledge_snapshot');
  assert.equal(
    publishResult.target_prefix,
    'oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/',
  );
  assert.equal(
    publishResult.files.find((file) => file.path === 'documents/business/capabilities/commerce/detailed-design.md').target_uri,
    'oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/business/capabilities/commerce/detailed-design.md',
  );
  assert.equal(
    publishResult.files.find(
      (file) => file.path === 'documents/business/capabilities/commerce/requirements/price-protection/detailed-design.md',
    ).target_uri,
    'oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/business/capabilities/commerce/requirements/price-protection/detailed-design.md',
  );
  assert.equal(
    publishResult.files.find((file) => file.path === 'metadata.json').target_uri,
    'oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/_sync/metadata.json',
  );
  assert.equal(
    publishResult.files.find((file) => file.path === 'manifest.json').target_uri,
    'oss://axis-v02-private-beta-example/axis/v0.2/orgs/org_axis_tools/projects/demo-project/_sync/manifest.json',
  );
  assert.equal(publishResult.upload_order.at(-1).path, 'manifest.json');

  const mockDir = path.join(repo, 'mock-project-docs-oss');
  const uploadEnv = {
    AXIS_OSS_MOCK_DIR: mockDir,
    ALIYUN_OSS_ENDPOINT: 'https://oss-example-endpoint.invalid',
    ALIYUN_OSS_REGION: 'oss-cn-hangzhou',
    ALIYUN_OSS_ACCESS_KEY_ID: 'LTAI_TEST_ACCESS_KEY_ID',
    ALIYUN_OSS_ACCESS_KEY_SECRET: 'project-doc-sync-secret',
  };
  const { stdout: firstUploadStdout } = await run(['oss-publish', '--repo', repo, '--run-id', runId], { env: uploadEnv });
  const firstUpload = JSON.parse(firstUploadStdout);
  assert.equal(firstUpload.publish.status, 'published');

  const remoteProjectRoot = path.join(
    mockDir,
    'axis-v02-private-beta-example',
    'axis',
    'v0.2',
    'orgs',
    'org_axis_tools',
    'projects',
    'demo-project',
  );
  assert.equal(existsSync(path.join(remoteProjectRoot, 'business', 'capabilities', 'commerce', 'detailed-design.md')), true);
  assert.equal(existsSync(path.join(remoteProjectRoot, 'business', 'capabilities', 'commerce', 'secondary-capabilities', 'sales', 'detailed-design.md')), true);
  assert.equal(existsSync(path.join(remoteProjectRoot, '_sync', 'manifest.json')), true);

  const sourceDetailedDesign = path.join(
    repo,
    '.axis',
    'docs',
    'orgs',
    'org_axis_tools',
    'projects',
    'demo-project',
    'business',
    'capabilities',
    'commerce',
    'detailed-design.md',
  );
  const revisedLevel1DetailedDesign = `${validLevel1CapabilityDetailedDesign('commerce', [
    { id: 'sales', name: '销售交易' },
    { id: 'support', name: '客户支持' },
  ])}\n同步修订版。\n`;
  await writeFile(sourceDetailedDesign, revisedLevel1DetailedDesign, 'utf8');
  const secondRunId = '20260711T030303Z-project-knowledge-abcdef34';
  await run(['project-knowledge-capture', '--repo', repo, '--run-id', secondRunId]);
  const { stdout: secondUploadStdout } = await run(
    ['oss-publish', '--repo', repo, '--run-id', secondRunId],
    { env: uploadEnv },
  );
  const secondUpload = JSON.parse(secondUploadStdout);
  assert.equal(
    secondUpload.files.find((file) => file.path === 'documents/business/capabilities/commerce/detailed-design.md').status,
    'updated',
  );
  assert.equal(
    await readFile(path.join(remoteProjectRoot, 'business', 'capabilities', 'commerce', 'detailed-design.md'), 'utf8'),
    revisedLevel1DetailedDesign,
  );
  const remoteManifest = await readJson(path.join(remoteProjectRoot, '_sync', 'manifest.json'));
  assert.equal(remoteManifest.run.run_id, secondRunId);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  await writeProjectKnowledgeDocs(repo);
  const { stdout } = await run(['project-knowledge-capture', '--repo', repo]);
  const result = JSON.parse(stdout);
  const generatedRunId = path.basename(result.package_dir);
  assert.match(generatedRunId, /^\d{8}T\d{6}Z-project-knowledge-snapshot-[a-f0-9]{8}$/);
  const { stdout: dryRunStdout } = await run([
    'oss-publish',
    '--repo',
    repo,
    '--run-id',
    generatedRunId,
    '--dry-run',
  ]);
  assert.equal(JSON.parse(dryRunStdout).ok, true);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  await writeProjectKnowledgeDocs(repo);
  await rm(
    path.join(
      repo,
      '.axis',
      'docs',
      'orgs',
      'org_axis_tools',
      'projects',
      'demo-project',
      'business',
      'capabilities',
      'commerce',
      'detailed-design.md',
    ),
  );

  await assert.rejects(
    run(['project-knowledge-capture', '--repo', repo, '--run-id', '20260711T040404Z-project-knowledge-abcdef56']),
    /project knowledge level-1 capability detailed design missing: commerce/,
  );
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  const runId = '20260706T020202Z-test-report-abcdef12';
  const packageResult = await writeTestReport(repo, { runId });
  const manifestPath = path.join(repo, packageResult.package_dir, 'manifest.json');
  const manifest = await readJson(manifestPath);
  manifest.organization.id = 'org_tampered';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const error = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--local-only']).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /manifest organization\/project\/oss snapshot does not match resolved config/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  const runId = '20260706T020203Z-test-report-abcdef12';
  const packageResult = await writeTestReport(repo, { runId });
  const packageDir = path.join(repo, packageResult.package_dir);
  const metadata = await readJson(path.join(packageDir, 'metadata.json'));
  metadata.index_refs.organization_index = 'axis/v0.2/orgs/org_tampered/index/packages.jsonl';
  await rewritePackageJsonAndRefreshManifest(packageDir, 'metadata.json', metadata);

  const error = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--local-only']).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /metadata\.index_refs\.organization_index must match resolved OSS target/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  const runId = '20260706T020204Z-test-report-abcdef12';
  const packageResult = await writeTestReport(repo, { runId });
  const packageDir = path.join(repo, packageResult.package_dir);
  const metadata = await readJson(path.join(packageDir, 'metadata.json'));
  metadata.source_evidence.run_id = '20260706T999999Z-test-report-deadbeef';
  await rewritePackageJsonAndRefreshManifest(packageDir, 'metadata.json', metadata);

  const error = await run(['oss-publish', '--repo', repo, '--run-id', runId, '--local-only']).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /metadata\.source_evidence\.run_id must match --run-id/);
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo);
  const runId = '20260706T020205Z-test-report-abcdef12';
  await writeTestReport(repo, { runId });
  await writeFile(path.join(repo, '.axis', 'config.local.yml'), [
    'contract_version: "0.2"',
    'oss:',
    '  endpoint_env: LOCAL_OSS_ENDPOINT',
    '  region_env: LOCAL_OSS_REGION',
    '  access_key_id_env: LOCAL_OSS_ACCESS_KEY_ID',
    '  access_key_secret_env: LOCAL_OSS_ACCESS_KEY_SECRET',
    '',
  ].join('\n'), 'utf8');
  const mockDir = path.join(repo, 'mock-oss-v02-local-env');

  const { stdout, stderr } = await run(['oss-publish', '--repo', repo, '--run-id', runId], {
    env: {
      AXIS_OSS_MOCK_DIR: mockDir,
      ALIYUN_OSS_ENDPOINT: '',
      ALIYUN_OSS_REGION: '',
      ALIYUN_OSS_ACCESS_KEY_ID: '',
      ALIYUN_OSS_ACCESS_KEY_SECRET: '',
      LOCAL_OSS_ENDPOINT: 'https://local-oss-endpoint.invalid',
      LOCAL_OSS_REGION: 'oss-cn-local',
      LOCAL_OSS_ACCESS_KEY_ID: 'LOCAL_TEST_ACCESS_KEY_ID',
      LOCAL_OSS_ACCESS_KEY_SECRET: 'local-secret-value',
    },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'upload');
  assert.equal(result.uploaded, true);
  assert.equal(result.publish.bucket, 'axis-v02-private-beta-example');
  assert.equal(result.publish.prefix, 'axis/v0.2');
  assert.equal(result.upload_order.at(-1).path, 'manifest.json');
  assert.doesNotMatch(stdout, /local-secret-value|LOCAL_TEST_ACCESS_KEY_ID|local-oss-endpoint/);
  assert.doesNotMatch(stderr, /local-secret-value|LOCAL_TEST_ACCESS_KEY_ID|local-oss-endpoint/);
  assert.equal(
    existsSync(path.join(
      mockDir,
      'axis-v02-private-beta-example',
      'axis',
      'v0.2',
      'orgs',
      'org_axis_tools',
      'projects',
      'demo-project',
      'packages',
      runId,
      'manifest.json',
    )),
    true,
  );
});

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });
  await writeV02Registry(repo);
  await writeV02Config(repo, { channel: 'public', gate: 'pending' });

  const error = await run(['validate-config', '--repo', repo]).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /public release requires release\.gate: passed/);
});
