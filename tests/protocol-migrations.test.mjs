import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { migrateDraft } = await import('../dist/project-init/migrations.js');
const fixtureDir = path.resolve('tests/fixtures/protocol-migrations');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-protocol-migrations-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function copyFixtureChain(mappingsDir) {
  await cp(path.join(fixtureDir, '0.0-to-0.1.yml'), path.join(mappingsDir, '0.0-to-0.1.yml'));
  await cp(path.join(fixtureDir, '0.1-to-0.2.yml'), path.join(mappingsDir, '0.1-to-0.2.yml'));
}

async function writeMapping(mappingsDir, filename, content) {
  await writeFile(path.join(mappingsDir, filename), content, 'utf8');
}

function legacyDraft() {
  return {
    project: {
      name: 'Protocol Migration Demo',
      slug: 'protocol-migration-demo',
    },
    package: {
      outbox_dir: '.axis/outbox',
    },
    release: {
      channel: 'private_beta',
      gate: 'not_requested',
    },
    oss: {
      provider: 'aliyun-oss',
      bucket: 'legacy-public-safe-bucket',
      prefix: 'axis/v0.1',
      endpoint_env: 'LEGACY_OSS_ENDPOINT',
      region_env: 'LEGACY_OSS_REGION',
      access_key_id_env: 'LEGACY_OSS_ACCESS_KEY_ID',
      access_key_secret_env: 'LEGACY_OSS_ACCESS_KEY_SECRET',
      security_token_env: 'LEGACY_OSS_SECURITY_TOKEN',
    },
    local: {
      outbox_dir: '.axis/local-outbox',
      dry_run: true,
      environment_name: 'staging',
      oss: {
        endpoint_env: 'LOCAL_OSS_ENDPOINT',
        region_env: 'LOCAL_OSS_REGION',
        access_key_id_env: 'LOCAL_OSS_ACCESS_KEY_ID',
        access_key_secret_env: 'LOCAL_OSS_ACCESS_KEY_SECRET',
        security_token_env: 'LOCAL_OSS_SECURITY_TOKEN',
      },
      inline_target: 'https://legacy-inline-target.invalid',
      credential_blob: 'legacy-secret-value',
    },
  };
}

await withTempDir(async (mappingsDir) => {
  await copyFixtureChain(mappingsDir);

  const result = await migrateDraft({
    sourceVersion: '0.0',
    latestVersion: '0.2',
    draft: legacyDraft(),
    mappingsDir,
  });

  assert.deepEqual(
    result.chain.map((link) => `${link.fromVersion}->${link.toVersion}`),
    ['0.0->0.1', '0.1->0.2'],
  );
  assert.deepEqual(result.draft, {
    contract_version: '0.2',
    project: {
      display_name: 'Protocol Migration Demo',
      slug: 'protocol-migration-demo',
    },
    package: {
      outbox_dir: '.axis/outbox',
    },
    release: {
      channel: 'private_beta',
      gate: 'not_requested',
    },
    oss_profile: {
      provider: 'aliyun-oss',
      bucket: 'legacy-public-safe-bucket',
      prefix: 'axis/v0.1',
      endpoint_env: 'LEGACY_OSS_ENDPOINT',
      region_env: 'LEGACY_OSS_REGION',
      access_key_id_env: 'LEGACY_OSS_ACCESS_KEY_ID',
      access_key_secret_env: 'LEGACY_OSS_ACCESS_KEY_SECRET',
      security_token_env: 'LEGACY_OSS_SECURITY_TOKEN',
    },
    local: {
      outbox_dir: '.axis/local-outbox',
      dry_run: true,
      environment_name: 'staging',
      oss: {
        endpoint_env: 'LOCAL_OSS_ENDPOINT',
        region_env: 'LOCAL_OSS_REGION',
        access_key_id_env: 'LOCAL_OSS_ACCESS_KEY_ID',
        access_key_secret_env: 'LOCAL_OSS_ACCESS_KEY_SECRET',
        security_token_env: 'LOCAL_OSS_SECURITY_TOKEN',
      },
    },
  });
  assert.deepEqual(result.unresolved.map((prompt) => prompt.target), [
    'organization.id',
    'organization.registry',
    'oss_profile.name',
  ]);
  assert.equal(result.unresolved.every((prompt) => prompt.sourceVersion === '0.1'), true);
  assert.deepEqual(
    result.dropped.map((entry) => entry.sourcePath).sort(),
    [
      'local.credential_blob',
      'local.inline_target',
      'project.name',
    ],
  );
  assert.equal(result.dropped.every((entry) => entry.redacted === true), true);
  assert.deepEqual(result.provenance['project.display_name'], {
    sourceVersion: '0.0',
    sourcePath: 'project.name',
  });
  assert.deepEqual(result.provenance['oss_profile.bucket'], {
    sourceVersion: '0.0',
    sourcePath: 'oss.bucket',
  });
  assert.deepEqual(result.provenance.contract_version, {
    sourceVersion: '0.1',
    sourcePath: '$mapping.operations[21].value',
  });
  assert.doesNotMatch(JSON.stringify(result), /legacy-inline-target|legacy-secret-value/);
});

await withTempDir(async (mappingsDir) => {
  await writeMapping(mappingsDir, 'invalid.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: set',
    '    to: project.slug',
    '    value: safe-value',
    '    secret_value: must-not-be-accepted',
    '',
  ].join('\n'));

  await assert.rejects(
    () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.1', draft: legacyDraft(), mappingsDir }),
    /schema validation failed/i,
  );
});

await withTempDir(async (mappingsDir) => {
  await writeMapping(mappingsDir, '0.0-to-0.1.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: set',
    '    to: contract_version',
    '    value: "0.1"',
    '',
  ].join('\n'));

  await assert.rejects(
    () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.2', draft: legacyDraft(), mappingsDir }),
    /missing migration link: 0\.1 -> 0\.2/i,
  );
});

await withTempDir(async (mappingsDir) => {
  await writeMapping(mappingsDir, 'skip.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.2"',
    'operations:',
    '  - op: set',
    '    to: contract_version',
    '    value: "0.2"',
    '',
  ].join('\n'));

  await assert.rejects(
    () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.2', draft: legacyDraft(), mappingsDir }),
    /schema validation failed|adjacent/i,
  );
});

await withTempDir(async (mappingsDir) => {
  await writeMapping(mappingsDir, 'first.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: set',
    '    to: contract_version',
    '    value: "0.1"',
    '',
  ].join('\n'));
  await writeMapping(mappingsDir, 'second.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: set',
    '    to: contract_version',
    '    value: "0.1"',
    '',
  ].join('\n'));

  await assert.rejects(
    () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.1', draft: legacyDraft(), mappingsDir }),
    /duplicate migration edge: 0\.0 -> 0\.1/i,
  );
});

await withTempDir(async (mappingsDir) => {
  await writeMapping(mappingsDir, 'forward.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: set',
    '    to: contract_version',
    '    value: "0.1"',
    '',
  ].join('\n'));
  await writeMapping(mappingsDir, 'backward.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.1"',
    'to_version: "0.0"',
    'operations:',
    '  - op: set',
    '    to: contract_version',
    '    value: "0.0"',
    '',
  ].join('\n'));

  await assert.rejects(
    () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.1', draft: legacyDraft(), mappingsDir }),
    /cycle detected/i,
  );
});

await withTempDir(async (mappingsDir) => {
  await writeMapping(mappingsDir, 'conflict.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: copy',
    '    from: project.name',
    '    to: project.slug',
    '  - op: set',
    '    to: project.slug',
    '    value: replacement-slug',
    '',
  ].join('\n'));

  await assert.rejects(
    () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.1', draft: legacyDraft(), mappingsDir }),
    /conflicting writes to target: project\.slug/i,
  );
});

console.log('protocol migration tests passed');
