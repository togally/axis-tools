import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  defaultEnv,
  ensureAxisDir,
  journalPath,
  organization,
  profile,
  registryYaml,
  v01Config,
  v02Config,
  writeRepoFile,
} from './helpers/project-init-fixtures.mjs';

const execFileAsync = promisify(execFile);
const cli = path.resolve('dist/cli.js');
const schemaPath = path.resolve('schemas/project-init-inspection.schema.json');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-project-init-v02-'));
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

async function inspect(repo, selectors = {}, options = {}) {
  const args = ['project-init', '--repo', repo, '--inspect', '--json'];
  if (selectors.registryPath) args.push('--registry-path', selectors.registryPath);
  if (selectors.organizationId) args.push('--organization-id', selectors.organizationId);
  if (selectors.ossProfile) args.push('--oss-profile', selectors.ossProfile);
  const { stdout } = await run(args, options);
  return JSON.parse(stdout);
}

async function failure(args, options = {}) {
  const error = await run(args, options).catch((caught) => caught);
  assert.equal(error.code, 1);
  return `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
}

function field(result, key) {
  const value = result.fields.find((entry) => entry.key === key);
  assert.ok(value, `missing inspection field ${key}`);
  return value;
}

function file(result, role) {
  const value = result.files.find((entry) => entry.role === role);
  assert.ok(value, `missing inspected file role ${role}`);
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

{
  await withTempDir(async (repo) => {
    const result = await inspect(repo);
    assert.equal(result.schema, 'axis.project_init_inspection');
    assert.equal(result.schema_version, 1);
    assert.equal(result.repo, path.resolve(repo));
    assert.equal(result.source_contract_version, null);
    assert.equal(result.latest_contract_version, '0.2');
    assert.deepEqual(result.selectors, {
      registry_path: '.axis/organizations.yml',
      organization_id: 'org_axis_project_init_v02',
      oss_profile: 'private_beta_main',
    });
    assert.equal(file(result, 'main_config').state, 'absent');
    assert.equal(file(result, 'main_config').sha256, null);
    assert.equal(file(result, 'local_config').state, 'absent');
    assert.equal(file(result, 'target_registry').state, 'absent');
    assert.equal(file(result, 'gitignore').state, 'absent');
    assert.equal(field(result, 'contract_version').mapped_value, '0.2');
    assert.equal(field(result, 'organization.status').recommendation, 'active');
    assert.equal(field(result, 'oss_profile.name').recommendation, 'private_beta_main');
  });
}

{
  await withTempDir(async (repo) => {
    await ensureAxisDir(repo);
    const config = v01Config({
      bucket: 'legacy-bucket',
      prefix: 'axis/legacy',
      local: [
        'local:',
        '  dry_run: true',
        '  credential_blob: secret-value',
        '  oss:',
        '    endpoint_env: LOCAL_ENDPOINT',
      ].join('\n'),
    });
    await writeRepoFile(repo, '.axis/config.yml', config);
    const result = await inspect(repo, {}, {
      env: {
        [defaultEnv.endpoint_env]: 'https://secret-endpoint.invalid',
        [defaultEnv.access_key_secret_env]: 'super-secret-value',
      },
    });
    assert.equal(result.source_contract_version, '0.1');
    assert.deepEqual(result.migration_chain, [
      { from: '0.1', to: '0.2', mapping: '0.1-to-0.2.yml' },
    ]);
    assert.equal(field(result, 'project.slug').mapped_value, 'demo-project');
    assert.equal(field(result, 'project.slug').resolution, 'mapped');
    assert.equal(field(result, 'local.credential_blob').disposition, 'remove');
    assert.equal(field(result, 'local.credential_blob').current_value, '[redacted]');
    assert.equal(field(result, 'local.credential_blob').removal_reason.length > 0, true);
    assert.doesNotMatch(JSON.stringify(result), /secret-value|super-secret-value|secret-endpoint/);
    const endpoint = result.environment.find((entry) => entry.field === 'endpoint_env');
    assert.equal(endpoint.present, false);
    assert.equal(endpoint.name, 'LOCAL_ENDPOINT');
    assert.equal(result.environment.some((entry) => Object.hasOwn(entry, 'value')), false);
  });
}

{
  await withTempDir(async (repo) => {
    const sourceRegistryPath = '.axis/organizations.yml';
    const targetRegistryPath = '.axis/organizations-alt.yml';
    await ensureAxisDir(repo);
    await writeRepoFile(repo, '.axis/config.yml', v02Config({
      registry: sourceRegistryPath,
      organizationId: 'org_first',
      profile: 'primary',
    }));
    const sourceRegistry = registryYaml([organization({
      id: 'org_first',
      slug: 'first-org',
      displayName: 'First Organization',
      profiles: [profile({ name: 'primary', bucket: 'source-bucket' })],
    })]);
    const targetRegistry = registryYaml([organization({
      id: 'org_first',
      slug: 'first-org',
      displayName: 'First Organization',
      profiles: [profile({ name: 'primary', bucket: 'first-target-bucket' })],
    }), organization({
      id: 'org_second',
      slug: 'second-org',
      displayName: 'Second Organization',
      profiles: [profile({ name: 'secondary', bucket: 'second-target-bucket' })],
    })]);
    await writeRepoFile(repo, sourceRegistryPath, sourceRegistry);
    await writeRepoFile(repo, targetRegistryPath, targetRegistry);
    const gitignore = '.axis/outbox/\n';
    await writeRepoFile(repo, '.gitignore', gitignore);
    const result = await inspect(repo, {
      registryPath: targetRegistryPath,
      organizationId: 'org_second',
      ossProfile: 'secondary',
    }, {
      env: {
        SECOND_OSS_ENDPOINT: 'present-but-redacted',
      },
    });
    assert.deepEqual(result.selectors, {
      registry_path: targetRegistryPath,
      organization_id: 'org_second',
      oss_profile: 'secondary',
    });
    assert.equal(field(result, 'organization.display_name').current_value, 'Second Organization');
    assert.equal(field(result, 'oss_profile.bucket').current_value, 'second-target-bucket');
    assert.equal(file(result, 'main_config').sha256, sha256(v02Config({
      registry: sourceRegistryPath,
      organizationId: 'org_first',
      profile: 'primary',
    })));
    assert.equal(file(result, 'target_registry').path, targetRegistryPath);
    assert.equal(file(result, 'target_registry').sha256, sha256(targetRegistry));
    assert.equal(file(result, 'source_registry').path, sourceRegistryPath);
    assert.equal(file(result, 'source_registry').sha256, sha256(sourceRegistry));
    assert.equal(file(result, 'gitignore').sha256, sha256(gitignore));
    assert.equal(result.environment.find((entry) => entry.field === 'endpoint_env').present, false);
    assert.doesNotMatch(JSON.stringify(result), /present-but-redacted/);
    assert.deepEqual(result.resolutions['organization.display_name'], 'stored');
    assert.equal(Array.isArray(result.provenance['organization.display_name']), true);
  });
}

{
  await withTempDir(async (repo) => {
    const registryPath = '.axis/organizations-alt.yml';
    await ensureAxisDir(repo);
    await writeRepoFile(repo, '.axis/config.yml', v02Config({
      registry: registryPath,
      organizationId: 'org_first',
      profile: 'primary',
    }));
    await writeRepoFile(repo, registryPath, registryYaml([
      organization({
        id: 'org_first',
        slug: 'first-org',
        displayName: 'First Organization',
        profiles: [profile({ name: 'primary', bucket: 'first-bucket' })],
      }),
      organization({
        id: 'org_second',
        slug: 'second-org',
        displayName: 'Second Organization',
        profiles: [profile({ name: 'secondary', bucket: 'second-bucket' })],
      }),
    ]));
    const second = await inspect(repo, {
      registryPath,
      organizationId: 'org_second',
      ossProfile: 'secondary',
    });
    const first = await inspect(repo, {
      registryPath,
      organizationId: 'org_first',
      ossProfile: 'primary',
    });
    assert.equal(second.selectors.organization_id, 'org_second');
    assert.equal(second.selectors.oss_profile, 'secondary');
    assert.equal(field(second, 'organization.display_name').current_value, 'Second Organization');
    assert.equal(field(second, 'oss_profile.bucket').current_value, 'second-bucket');
    assert.equal(field(first, 'organization.display_name').current_value, 'First Organization');
    assert.equal(field(first, 'oss_profile.bucket').current_value, 'first-bucket');
    assert.doesNotMatch(JSON.stringify(first), /Second Organization|second-bucket/);
  });
}

{
  await withTempDir(async (repo) => {
    await ensureAxisDir(repo);
    await writeRepoFile(repo, '.axis/config.yml', 'contract_version: [broken\n');
    const output = await failure(['project-init', '--repo', repo, '--inspect', '--json']);
    assert.match(output, /invalid YAML|YAML/i);
  });
}

{
  await withTempDir(async (repo) => {
    await ensureAxisDir(repo);
    await writeRepoFile(repo, journalPath, '{"state":"prepared"}\n');
    const before = await readFile(path.join(repo, journalPath), 'utf8');
    const result = await inspect(repo);
    assert.equal(result.status, 'recovery_required');
    assert.equal(result.recovery_required, true);
    assert.equal(await readFile(path.join(repo, journalPath), 'utf8'), before);
  });
}

{
  await withTempDir(async (repo) => {
    const selectors = ['--registry-path', '.axis/organizations.yml'];
    assert.match(await failure(['project-init', '--repo', repo, '--inspect', '--apply']), /cannot combine|mutually exclusive/i);
    assert.match(await failure(['project-init', '--repo', repo, '--recover', '--answers-file', 'answers.json']), /cannot combine|mutually exclusive/i);
    assert.match(await failure(['project-init', '--repo', repo, ...selectors]), /requires --inspect|only valid with --inspect/i);
    assert.match(await failure(['project-init', '--repo', repo, '--apply']), /answers-file.*required|requires.*answers-file/i);
    assert.match(await failure(['project-init', '--repo', repo, '--project-slug', 'demo-project', '--display-name', 'Demo Project', '--force']), /expired|inspect|answers-file|migration/i);
  });
}

{
  await withTempDir(async (repo) => {
    await ensureAxisDir(repo);
    const matching = organization({
      id: 'org_matching',
      slug: 'matching-org',
      displayName: 'Matching Organization',
      profiles: [profile({ name: 'matching', bucket: 'legacy-bucket', prefix: 'axis/legacy' })],
    });
    await writeRepoFile(repo, '.axis/config.yml', v01Config({
      bucket: 'legacy-bucket',
      prefix: 'axis/legacy',
      env: defaultEnv,
    }));
    await writeRepoFile(repo, '.axis/organizations.yml', registryYaml([matching]));
    const result = await inspect(repo);
    assert.equal(result.recommendations['organization.id'], 'org_matching');
    assert.equal(result.recommendations['oss_profile.name'], 'matching');
  });
}

{
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  await withTempDir(async (repo) => {
    const result = await inspect(repo);
    assert.equal(validate(result), true, JSON.stringify(validate.errors));
  });
}

console.log('project-init-v02 tests passed');
