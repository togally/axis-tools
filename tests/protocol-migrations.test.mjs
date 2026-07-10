import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { migrateDraft } = await import('../dist/project-init/migrations.js');
const fixtureDir = path.resolve('tests/fixtures/protocol-migrations');
const transitiveRedactionFixtureDir = path.join(fixtureDir, 'transitive-redaction-bypass');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-protocol-migrations-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function copyFixtureChain(mappingsDir, sourceDir = fixtureDir) {
  await cp(path.join(sourceDir, '0.0-to-0.1.yml'), path.join(mappingsDir, '0.0-to-0.1.yml'));
  await cp(path.join(sourceDir, '0.1-to-0.2.yml'), path.join(mappingsDir, '0.1-to-0.2.yml'));
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
      redaction_patterns_file: '.axis/redaction-patterns.txt',
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
      redaction_patterns_file: '.axis/redaction-patterns.txt',
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
  assert.deepEqual(
    result.dropped.find((entry) => entry.sourcePath === 'project.name'),
    {
      sourcePath: 'project.name',
      sourceVersion: '0.0',
      reason: 'project.name was renamed to project.display_name.',
      redacted: false,
    },
  );
  assert.deepEqual(
    result.dropped.find((entry) => entry.sourcePath === 'local.credential_blob'),
    {
      sourcePath: 'local.credential_blob',
      sourceVersion: '0.1',
      reason: 'Local credential-like values are not supported in 0.2.',
      redacted: true,
    },
  );
  assert.deepEqual(result.provenance['project.display_name'], {
    sourceVersion: '0.0',
    sourcePath: 'project.name',
  });
  assert.deepEqual(result.provenance['oss_profile.bucket'], {
    sourceVersion: '0.0',
    sourcePath: 'oss.bucket',
  });
  assert.deepEqual(result.provenance['local.redaction_patterns_file'], {
    sourceVersion: '0.0',
    sourcePath: 'local.redaction_patterns_file',
  });
  assert.deepEqual(result.provenance.contract_version, {
    sourceVersion: '0.1',
    sourcePath: '$mapping.operations[22].value',
  });
  assert.doesNotMatch(JSON.stringify(result), /legacy-inline-target|legacy-secret-value/);
});

await withTempDir(async (mappingsDir) => {
  await cp(path.join(fixtureDir, '0.1-to-0.2.yml'), path.join(mappingsDir, '0.1-to-0.2.yml'));
  const localOssProvider = 'local-aliyun-oss';
  const localOssBucket = 'local-safe-bucket';
  const localOssPrefix = 'axis/local';
  const result = await migrateDraft({
    sourceVersion: '0.1',
    latestVersion: '0.2',
    draft: {
      local: {
        oss: {
          provider: localOssProvider,
          bucket: localOssBucket,
          prefix: localOssPrefix,
          endpoint_env: 'LOCAL_OSS_ENDPOINT',
          region_env: 'LOCAL_OSS_REGION',
          access_key_id_env: 'LOCAL_OSS_ACCESS_KEY_ID',
          access_key_secret_env: 'LOCAL_OSS_ACCESS_KEY_SECRET',
          security_token_env: 'LOCAL_OSS_SECURITY_TOKEN',
        },
      },
    },
    mappingsDir,
  });

  assert.deepEqual(result.draft.local, {
    oss: {
      endpoint_env: 'LOCAL_OSS_ENDPOINT',
      region_env: 'LOCAL_OSS_REGION',
      access_key_id_env: 'LOCAL_OSS_ACCESS_KEY_ID',
      access_key_secret_env: 'LOCAL_OSS_ACCESS_KEY_SECRET',
      security_token_env: 'LOCAL_OSS_SECURITY_TOKEN',
    },
  });
  assert.deepEqual(result.dropped, [
    {
      sourcePath: 'local.oss.provider',
      sourceVersion: '0.1',
      reason: 'Local OSS provider overrides are not supported in 0.2.',
      redacted: true,
    },
    {
      sourcePath: 'local.oss.bucket',
      sourceVersion: '0.1',
      reason: 'Local OSS bucket overrides are not supported in 0.2.',
      redacted: true,
    },
    {
      sourcePath: 'local.oss.prefix',
      sourceVersion: '0.1',
      reason: 'Local OSS prefix overrides are not supported in 0.2.',
      redacted: true,
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(`${localOssProvider}|${localOssBucket}|${localOssPrefix}`),
  );
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
  await writeMapping(mappingsDir, 'invalid-copy-redact.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: copy',
    '    from: project.name',
    '    to: project.display_name',
    '    redact: false',
    '',
  ].join('\n'));

  await assert.rejects(
    () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.1', draft: legacyDraft(), mappingsDir }),
    /schema validation failed/i,
  );
});

await withTempDir(async (mappingsDir) => {
  const copiedSecret = 'copied-then-dropped-secret';
  await writeMapping(mappingsDir, 'unsafe-copy.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: copy',
    '    from: local.credential_blob',
    '    to: organization.credential_alias',
    '  - op: drop',
    '    from: local.credential_blob',
    '    reason: Credential-like values must not cross protocol boundaries.',
    '',
  ].join('\n'));

  let errorMessage = '';
  let result;
  await assert.rejects(
    async () => {
      result = await migrateDraft({
        sourceVersion: '0.0',
        latestVersion: '0.1',
        draft: { local: { credential_blob: copiedSecret } },
        mappingsDir,
      });
    },
    (error) => {
      errorMessage = String(error);
      return error instanceof Error && error.message === 'local.credential_blob';
    },
  );
  assert.equal(result, undefined);
  assert.doesNotMatch(errorMessage, new RegExp(copiedSecret));
});

await withTempDir(async (mappingsDir) => {
  const copiedSecret = 'dropped-then-copied-secret';
  await writeMapping(mappingsDir, 'unsafe-reverse-copy.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: drop',
    '    from: local.credential_blob',
    '    reason: Credential-like values must not cross protocol boundaries.',
    '  - op: copy',
    '    from: local.credential_blob',
    '    to: retained.note',
    '',
  ].join('\n'));

  let errorMessage = '';
  let result;
  await assert.rejects(
    async () => {
      result = await migrateDraft({
        sourceVersion: '0.0',
        latestVersion: '0.1',
        draft: { local: { credential_blob: copiedSecret } },
        mappingsDir,
      });
    },
    (error) => {
      errorMessage = String(error);
      return error instanceof Error && error.message === 'local.credential_blob';
    },
  );
  assert.equal(result, undefined);
  assert.doesNotMatch(errorMessage, new RegExp(copiedSecret));
});

await withTempDir(async (mappingsDir) => {
  const copiedSecret = 'transitive-alias-secret-must-not-leak';
  await copyFixtureChain(mappingsDir, transitiveRedactionFixtureDir);

  let errorMessage = '';
  let result;
  await assert.rejects(
    async () => {
      result = await migrateDraft({
        sourceVersion: '0.0',
        latestVersion: '0.2',
        draft: { local: { credential_blob: copiedSecret } },
        mappingsDir,
      });
    },
    (error) => {
      errorMessage = String(error);
      return error instanceof Error && error.message === 'local.credential_blob';
    },
  );
  assert.equal(result, undefined);
  assert.doesNotMatch(errorMessage, new RegExp(copiedSecret));
});

for (const { name, operations } of [
  {
    name: 'unsafe-ancestor-copy',
    operations: [
      '  - op: copy',
      '    from: local',
      '    to: retained',
      '  - op: drop',
      '    from: local.credential_blob',
      '    reason: Credential-like values must not cross protocol boundaries.',
    ],
  },
  {
    name: 'unsafe-ancestor-reverse-copy',
    operations: [
      '  - op: drop',
      '    from: local.credential_blob',
      '    reason: Credential-like values must not cross protocol boundaries.',
      '  - op: copy',
      '    from: local',
      '    to: retained',
    ],
  },
  {
    name: 'unsafe-descendant-copy',
    operations: [
      '  - op: copy',
      '    from: local.credential_blob.value',
      '    to: retained',
      '  - op: drop',
      '    from: local.credential_blob',
      '    reason: Credential-like values must not cross protocol boundaries.',
    ],
  },
  {
    name: 'unsafe-descendant-reverse-copy',
    operations: [
      '  - op: drop',
      '    from: local.credential_blob',
      '    reason: Credential-like values must not cross protocol boundaries.',
      '  - op: copy',
      '    from: local.credential_blob.value',
      '    to: retained',
    ],
  },
]) {
  await withTempDir(async (mappingsDir) => {
    const copiedSecret = `${name}-secret`;
    await writeMapping(mappingsDir, `${name}.yml`, [
      'schema: axis.protocol_migration',
      'schema_version: 1',
      'from_version: "0.0"',
      'to_version: "0.1"',
      'operations:',
      ...operations,
      '',
    ].join('\n'));

    let errorMessage = '';
    let result;
    await assert.rejects(
      async () => {
        result = await migrateDraft({
          sourceVersion: '0.0',
          latestVersion: '0.1',
          draft: {
            local: {
              credential_blob: { value: copiedSecret },
              unrelated_value: 'retain-sibling-behavior',
            },
          },
          mappingsDir,
        });
      },
      (error) => {
        errorMessage = String(error);
        return error instanceof Error && error.message === 'local.credential_blob';
      },
    );
    assert.equal(result, undefined);
    assert.doesNotMatch(errorMessage, new RegExp(copiedSecret));
  });
}

await withTempDir(async (mappingsDir) => {
  const copiedSecret = 'sibling-copy-must-not-be-rejected';
  await writeMapping(mappingsDir, 'safe-sibling-copy.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: drop',
    '    from: local.credential_blob',
    '    reason: Credential-like values must not cross protocol boundaries.',
    '  - op: copy',
    '    from: local.environment_name',
    '    to: retained.environment_name',
    '',
  ].join('\n'));

  const result = await migrateDraft({
    sourceVersion: '0.0',
    latestVersion: '0.1',
    draft: { local: { credential_blob: copiedSecret, environment_name: 'staging' } },
    mappingsDir,
  });
  assert.deepEqual(result.draft, { retained: { environment_name: 'staging' } });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(copiedSecret));
});

await withTempDir(async (mappingsDir) => {
  const copiedToken = 'neutral-name-token-must-not-leak';
  await writeMapping(mappingsDir, 'unsafe-neutral-copy.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: copy',
    '    from: local.api_token',
    '    to: retained.note',
    '  - op: drop',
    '    from: local.api_token',
    '    reason: This source cannot cross protocol boundaries.',
    '',
  ].join('\n'));

  let errorMessage = '';
  let result;
  await assert.rejects(
    async () => {
      result = await migrateDraft({
        sourceVersion: '0.0',
        latestVersion: '0.1',
        draft: { local: { api_token: copiedToken } },
        mappingsDir,
      });
    },
    (error) => {
      errorMessage = String(error);
      return error instanceof Error && error.message === 'local.api_token';
    },
  );
  assert.equal(result, undefined);
  assert.doesNotMatch(errorMessage, new RegExp(copiedToken));
});

await withTempDir(async (mappingsDir) => {
  const copiedToken = 'dropped-then-copied-token-must-not-leak';
  await writeMapping(mappingsDir, 'unsafe-neutral-reverse-copy.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: drop',
    '    from: local.api_token',
    '    reason: This source cannot cross protocol boundaries.',
    '  - op: copy',
    '    from: local.api_token',
    '    to: retained.note',
    '',
  ].join('\n'));

  let errorMessage = '';
  let result;
  await assert.rejects(
    async () => {
      result = await migrateDraft({
        sourceVersion: '0.0',
        latestVersion: '0.1',
        draft: { local: { api_token: copiedToken } },
        mappingsDir,
      });
    },
    (error) => {
      errorMessage = String(error);
      return error instanceof Error && error.message === 'local.api_token';
    },
  );
  assert.equal(result, undefined);
  assert.doesNotMatch(errorMessage, new RegExp(copiedToken));
});

await withTempDir(async (mappingsDir) => {
  const droppedName = 'drop-only-name-must-not-leak';
  await writeMapping(mappingsDir, 'non-sensitive-drop-only.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: drop',
    '    from: project.name',
    '    reason: The retired field is not part of the target protocol.',
    '    redact: false',
    '',
  ].join('\n'));

  let errorMessage = '';
  let result;
  await assert.rejects(
    async () => {
      result = await migrateDraft({
        sourceVersion: '0.0',
        latestVersion: '0.1',
        draft: { project: { name: droppedName } },
        mappingsDir,
      });
    },
    (error) => {
      errorMessage = String(error);
      return error instanceof Error && error.message === 'project.name';
    },
  );
  assert.equal(result, undefined);
  assert.doesNotMatch(errorMessage, new RegExp(droppedName));
});

await withTempDir(async (mappingsDir) => {
  const credentialValue = 'credential-rename-must-not-leak';
  await writeMapping(mappingsDir, 'credential-rename.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: copy',
    '    from: local.credential_blob',
    '    to: local.legacy_credential_blob',
    '  - op: drop',
    '    from: local.credential_blob',
    '    reason: Credential-like values must not cross protocol boundaries.',
    '    redact: false',
    '',
  ].join('\n'));

  let errorMessage = '';
  let result;
  await assert.rejects(
    async () => {
      result = await migrateDraft({
        sourceVersion: '0.0',
        latestVersion: '0.1',
        draft: { local: { credential_blob: credentialValue } },
        mappingsDir,
      });
    },
    (error) => {
      errorMessage = String(error);
      return error instanceof Error && error.message === 'local.credential_blob';
    },
  );
  assert.equal(result, undefined);
  assert.doesNotMatch(errorMessage, new RegExp(credentialValue));
});

for (const { name, source, target, sourceValue } of [
  {
    name: 'credential-like-structural-source',
    source: 'local.oss.access_key_secret_env',
    target: 'local.oss.legacy_access_key_secret_env',
    sourceValue: 'LOCAL_OSS_ACCESS_KEY_SECRET',
  },
  {
    name: 'credential-like-structural-target',
    source: 'local.oss.provider',
    target: 'local.oss.accesskey_alias',
    sourceValue: 'local-aliyun-oss',
  },
]) {
  await withTempDir(async (mappingsDir) => {
    await writeMapping(mappingsDir, `${name}.yml`, [
      'schema: axis.protocol_migration',
      'schema_version: 1',
      'from_version: "0.0"',
      'to_version: "0.1"',
      'operations:',
      '  - op: copy',
      `    from: ${source}`,
      `    to: ${target}`,
      '  - op: drop',
      `    from: ${source}`,
      '    reason: Structural renames cannot cross credential-like paths.',
      '    redact: false',
      '',
    ].join('\n'));

    let errorMessage = '';
    let result;
    await assert.rejects(
      async () => {
        result = await migrateDraft({
          sourceVersion: '0.0',
          latestVersion: '0.1',
          draft: { local: { oss: source.includes('access_key')
            ? { access_key_secret_env: sourceValue }
            : { provider: sourceValue } } },
          mappingsDir,
        });
      },
      (error) => {
        errorMessage = String(error);
        return error instanceof Error && error.message === source;
      },
    );
    assert.equal(result, undefined);
    assert.doesNotMatch(errorMessage, new RegExp(sourceValue));
  });
}

for (const segment of ['__proto__', 'constructor', 'prototype']) {
  for (const field of ['from', 'to']) {
    await withTempDir(async (mappingsDir) => {
      const operation = field === 'from'
        ? [`    from: local.${segment}.axis_polluted`, '    to: project.slug']
        : ['    from: project.name', `    to: local.${segment}.axis_polluted`];
      await writeMapping(mappingsDir, `${segment}-${field}.yml`, [
        'schema: axis.protocol_migration',
        'schema_version: 1',
        'from_version: "0.0"',
        'to_version: "0.1"',
        'operations:',
        '  - op: copy',
        ...operation,
        '',
      ].join('\n'));

      try {
        await assert.rejects(
          () => migrateDraft({ sourceVersion: '0.0', latestVersion: '0.1', draft: legacyDraft(), mappingsDir }),
          /schema validation failed|unsafe protocol path/i,
        );
        assert.equal(({}).axis_polluted, undefined);
      } finally {
        delete Object.prototype.axis_polluted;
      }
    });
  }
}

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
    /conflicting writes to targets: project\.slug/i,
  );
});

for (const parentOperation of ['set', 'copy', 'prompt']) {
  for (const childOperation of ['set', 'copy', 'prompt']) {
    for (const operations of [
      [
        { operation: parentOperation, target: 'project' },
        { operation: childOperation, target: 'project.slug' },
      ],
      [
        { operation: childOperation, target: 'project.slug' },
        { operation: parentOperation, target: 'project' },
      ],
    ]) {
      await withTempDir(async (mappingsDir) => {
        const operationYaml = operations.map(({ operation, target }) => {
          if (operation === 'copy') {
            return [
              '  - op: copy',
              '    from: source.value',
              `    to: ${target}`,
            ];
          }
          if (operation === 'prompt') {
            return [
              '  - op: prompt',
              `    to: ${target}`,
              '    prompt: Provide a safe project value.',
            ];
          }
          return [
            '  - op: set',
            `    to: ${target}`,
            '    value: safe-value',
          ];
        }).flat();
        await writeMapping(mappingsDir, 'ancestor-descendant-conflict.yml', [
          'schema: axis.protocol_migration',
          'schema_version: 1',
          'from_version: "0.0"',
          'to_version: "0.1"',
          'operations:',
          ...operationYaml,
          '',
        ].join('\n'));

        await assert.rejects(
          () => migrateDraft({
            sourceVersion: '0.0',
            latestVersion: '0.1',
            draft: { source: { value: 'safe-source-value' } },
            mappingsDir,
          }),
          (error) => error instanceof Error
            && error.message === 'conflicting writes to targets: project, project.slug',
        );
      });
    }
  }
}

for (const firstOperation of ['set', 'copy', 'prompt']) {
  for (const secondOperation of ['set', 'copy', 'prompt']) {
    await withTempDir(async (mappingsDir) => {
      const operationYaml = [firstOperation, secondOperation].map((operation) => {
        if (operation === 'copy') {
          return [
            '  - op: copy',
            '    from: source.value',
            '    to: project.slug',
          ];
        }
        if (operation === 'prompt') {
          return [
            '  - op: prompt',
            '    to: project.slug',
            '    prompt: Provide a safe project value.',
          ];
        }
        return [
          '  - op: set',
          '    to: project.slug',
          '    value: safe-value',
        ];
      }).flat();
      await writeMapping(mappingsDir, 'equal-target-conflict.yml', [
        'schema: axis.protocol_migration',
        'schema_version: 1',
        'from_version: "0.0"',
        'to_version: "0.1"',
        'operations:',
        ...operationYaml,
        '',
      ].join('\n'));

      await assert.rejects(
        () => migrateDraft({
          sourceVersion: '0.0',
          latestVersion: '0.1',
          draft: { source: { value: 'safe-source-value' } },
          mappingsDir,
        }),
        (error) => error instanceof Error
          && error.message === 'conflicting writes to targets: project.slug',
      );
    });
  }
}

await withTempDir(async (mappingsDir) => {
  await writeMapping(mappingsDir, 'sibling-writes.yml', [
    'schema: axis.protocol_migration',
    'schema_version: 1',
    'from_version: "0.0"',
    'to_version: "0.1"',
    'operations:',
    '  - op: set',
    '    to: project.name',
    '    value: Safe Project',
    '  - op: copy',
    '    from: source.slug',
    '    to: project.slug',
    '  - op: prompt',
    '    to: project.description',
    '    prompt: Provide a safe project description.',
    '',
  ].join('\n'));

  const result = await migrateDraft({
    sourceVersion: '0.0',
    latestVersion: '0.1',
    draft: { source: { slug: 'safe-project' } },
    mappingsDir,
  });
  assert.deepEqual(result.draft, { project: { name: 'Safe Project', slug: 'safe-project' } });
  assert.deepEqual(result.unresolved.map((prompt) => prompt.target), ['project.description']);
});

console.log('protocol migration tests passed');
