import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

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
  const { stdout } = await run([
    'project-init',
    '--repo',
    repo,
    '--project-slug',
    'demo-project',
    '--display-name',
    'Demo Project',
    ...extraArgs,
  ]);
  return JSON.parse(stdout);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
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

await withTempDir(async (repo) => {
  await mkdir(repo, { recursive: true });

  const result = await initializeProject(repo);

  assert.equal(result.ok, true);
  assert.equal(result.config_path, '.axis/config.yml');
  assert.deepEqual(result.ignored_paths, ['.axis/config.local.yml', '.axis/outbox/']);

  const config = await readFile(path.join(repo, '.axis', 'config.yml'), 'utf8');
  assert.match(config, /contract_version: "0\.1"/);
  assert.match(config, /slug: demo-project/);
  assert.match(config, /display_name: Demo Project/);
  assert.match(config, /outbox_dir: \.axis\/outbox/);
  assert.match(config, /channel: private_beta/);
  assert.match(config, /gate: not_requested/);
  assert.match(config, /endpoint_env: ALIYUN_OSS_ENDPOINT/);
  assert.match(config, /access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET/);

  const gitignore = await readFile(path.join(repo, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.axis\/config\.local\.yml$/m);
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
  assert.equal(result.package_dir, '.axis/outbox/v0.1/demo-project/20260703T121530Z-test-report-a1b2c3d4');
  assert.deepEqual(result.files.sort(), ['experience.md', 'manifest.json', 'metadata.json', 'report.md']);
  assert.doesNotMatch(stdout, /super-secret-value/);

  const packageDir = path.join(repo, result.package_dir);
  assert.deepEqual((await readdir(packageDir)).sort(), ['experience.md', 'manifest.json', 'metadata.json', 'report.md']);

  const manifest = await readJson(path.join(packageDir, 'manifest.json'));
  assert.equal(manifest.schema, 'axis.package.manifest');
  assert.equal(manifest.schema_version, '0.1');
  assert.equal(manifest.package_id, 'demo-project__20260703T121530Z-test-report-a1b2c3d4');
  assert.equal(manifest.project.slug, 'demo-project');
  assert.equal(manifest.producer.skill, 'axis-test-report');
  assert.equal(manifest.release.channel, 'private_beta');
  assert.equal(manifest.release.gate, 'not_requested');
  assert.equal(manifest.publish.status, 'local_ready');
  assert.equal(manifest.publish.base_uri, 'oss://axis-v01-beta-packages-example/axis/v0.1/private-beta/packages/demo-project/20260703T121530Z-test-report-a1b2c3d4/');
  assert.deepEqual(manifest.files.map((file) => file.path).sort(), ['experience.md', 'manifest.json', 'metadata.json', 'report.md']);
  for (const file of manifest.files) {
    assert.match(file.path, /^[^/]+$/);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.equal(Number.isInteger(file.bytes), true);
  }
  const reportEntry = manifest.files.find((file) => file.path === 'report.md');
  assert.ok(reportEntry);
  assert.deepEqual(manifest.protocols, {
    document_protocol: '0.1',
    workflow_protocol: '0.1',
    experience_protocol: '0.1',
    agent_execution_protocol: '0.1',
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
  assert.equal(metadata.schema_version, '0.1');
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
  assert.equal(metadata.skill.name, 'axis-coding-capture');
  assert.equal(metadata.document.doc_type, 'execution_report');
  assert.equal(metadata.experience.related_skill, 'axis-coding-capture');
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
  assert.equal(result.target_prefix, `oss://axis-v01-beta-packages-example/axis/v0.1/private-beta/packages/demo-project/${runId}/`);
  assert.deepEqual(result.files.map((file) => file.path).sort(), ['experience.md', 'manifest.json', 'metadata.json', 'report.md']);
  assert.equal(result.upload_order.at(-1).path, 'manifest.json');
  assert.doesNotMatch(stdout, /dry-run-secret-value|LTAI_TEST_ACCESS_KEY_ID|oss-example-endpoint/);
  assert.doesNotMatch(stderr, /dry-run-secret-value|LTAI_TEST_ACCESS_KEY_ID|oss-example-endpoint/);

  const manifest = await readJson(path.join(repo, '.axis', 'outbox', 'v0.1', 'demo-project', runId, 'manifest.json'));
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
    'axis-v01-beta-packages-example',
    'axis',
    'v0.1',
    'private-beta',
    'packages',
    'demo-project',
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
  let manifest = await readJson(path.join(repo, '.axis', 'outbox', 'v0.1', 'demo-project', runId, 'manifest.json'));
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
  manifest = await readJson(path.join(repo, '.axis', 'outbox', 'v0.1', 'demo-project', runId, 'manifest.json'));
  assert.equal(manifest.publish.status, 'published');
});
