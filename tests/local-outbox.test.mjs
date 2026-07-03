import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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

  const report = [
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
    'passed',
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
    report,
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

  const metadata = await readJson(path.join(packageDir, 'metadata.json'));
  assert.equal(metadata.schema, 'axis.package.metadata');
  assert.equal(metadata.schema_version, '0.1');
  assert.equal(metadata.artifact.type, 'test_report');
  assert.equal(metadata.artifact.status, 'passed');
  assert.equal(metadata.skill.name, 'axis-test-report');
  assert.equal(metadata.public_safety.reviewed, true);
  assert.equal(metadata.public_safety.contains_credentials, false);
  assert.equal(metadata.public_safety.contains_private_urls, false);
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
});
