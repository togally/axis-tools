import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
const answersSchemaPath = path.resolve('schemas/project-init-answers.schema.json');
const { inspectProjectInit } = await import('../dist/project-init/inspection.js');
const { renderProjectFiles, validateAnswers } = await import('../dist/project-init/render.js');
const { applyProjectInit, recoverProjectInit } = await import('../dist/project-init/index.js');

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

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function answersFor(inspection, changes = {}) {
  const decisions = inspection.fields.map((entry) => {
    if (own(changes, entry.key)) {
      return { key: entry.key, value: changes[entry.key], decision: 'change' };
    }
    if (entry.resolution === 'remove') {
      return { key: entry.key, value: null, decision: 'change' };
    }
    if (entry.resolution === 'stored' && own(entry, 'current_value')) {
      return { key: entry.key, value: entry.current_value, decision: 'keep' };
    }
    if (entry.resolution === 'mapped' && own(entry, 'mapped_value')) {
      return { key: entry.key, value: entry.mapped_value, decision: 'accept_mapping' };
    }
    if (entry.resolution === 'recommended' && own(entry, 'recommendation')) {
      return { key: entry.key, value: entry.recommendation, decision: 'accept_recommendation' };
    }
    return { key: entry.key, value: null, decision: 'change' };
  });
  return {
    schema: 'axis.project_init_answers',
    schema_version: 1,
    repo: inspection.repo,
    latest_contract_version: inspection.latest_contract_version,
    selectors: structuredClone(inspection.selectors),
    files: structuredClone(inspection.files),
    decisions,
    final_confirmation: true,
  };
}

function sourceFiles({ mainConfig = null, localConfig = null, targetRegistry = null, gitignore = null } = {}) {
  return {
    main_config: mainConfig,
    local_config: localConfig,
    target_registry: targetRegistry,
    gitignore,
  };
}

async function writeAnswers(repo, answers) {
  const answersPath = path.join(repo, 'project-init-answers.json');
  await writeFile(answersPath, `${JSON.stringify(answers, null, 2)}\n`, 'utf8');
  return answersPath;
}

function completeEnvironment() {
  return {
    [defaultEnv.endpoint_env]: 'https://oss.example.invalid',
    [defaultEnv.region_env]: 'region-value',
    [defaultEnv.access_key_id_env]: 'access-key-id-value',
    [defaultEnv.access_key_secret_env]: 'access-key-secret-value',
  };
}

function journalEntry({ role, filePath, oldText, newText, backupPath }) {
  return {
    role,
    path: filePath,
    original: oldText === null
      ? { state: 'absent', sha256: null, backup: null }
      : { state: 'present', sha256: sha256(oldText), backup: backupPath },
    next: newText === null
      ? { state: 'absent', sha256: null }
      : { state: 'present', sha256: sha256(newText) },
  };
}

async function writeRecoveryJournal(repo, state, entries, transactionId = 'test-recovery') {
  await writeRepoFile(repo, journalPath, `${JSON.stringify({
    schema: 'axis.project_init_journal',
    schema_version: 1,
    transaction_id: transactionId,
    state,
    files: entries,
  }, null, 2)}\n`);
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

{
  const schema = JSON.parse(await readFile(answersSchemaPath, 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  await withTempDir(async (repo) => {
    const inspection = await inspectProjectInit({ repo });
    const answers = answersFor(inspection);
    assert.equal(validate(answers), true, JSON.stringify(validate.errors));
    assert.deepEqual(validateAnswers(inspection, answers), answers);
    assert.equal(renderProjectFiles({
      inspection,
      answers,
      sourceFiles: sourceFiles(),
    }).local_config, null);
    assert.deepEqual(
      answers.decisions.map((entry) => entry.key),
      inspection.fields.map((entry) => entry.key),
    );

    const unknown = structuredClone(answers);
    unknown.extra = true;
    assert.throws(() => validateAnswers(inspection, unknown), /schema|additional|unknown/i);

    const duplicate = structuredClone(answers);
    duplicate.decisions[1] = structuredClone(duplicate.decisions[0]);
    assert.throws(() => validateAnswers(inspection, duplicate), /missing|duplicate|decision/i);

    const missing = structuredClone(answers);
    missing.decisions.pop();
    assert.throws(() => validateAnswers(inspection, missing), /missing|decision/i);

    const wrongSelector = structuredClone(answers);
    wrongSelector.selectors.oss_profile = 'other-profile';
    assert.throws(() => validateAnswers(inspection, wrongSelector), /selector|inspection/i);

    const wrongFingerprint = structuredClone(answers);
    wrongFingerprint.files[0].sha256 = '0'.repeat(64);
    assert.throws(() => validateAnswers(inspection, wrongFingerprint), /fingerprint|file|inspection/i);

    const secretProperty = structuredClone(answers);
    secretProperty.decisions[0].secret_value = 'do-not-accept';
    assert.throws(() => validateAnswers(inspection, secretProperty), /schema|secret|unknown/i);

    const nonV02 = structuredClone(answers);
    nonV02.latest_contract_version = '0.1';
    assert.throws(() => validateAnswers(inspection, nonV02), /0\.2|version/i);
  });
}

{
  await withTempDir(async (repo) => {
    const sourceRegistryPath = '.axis/source-organizations.yml';
    const targetRegistryPath = '.axis/target-organizations.yml';
    const mainConfig = v02Config({
      registry: sourceRegistryPath,
      organizationId: 'org_source',
      profile: 'primary',
    }) + [
      'extensions:',
      // YAML 1.2 parses `yes` as a string; this extension is intentionally boolean.
      '  keep_me: true',
      '',
    ].join('\n');
    const sourceRegistry = registryYaml([organization({
      id: 'org_source',
      slug: 'source-org',
      displayName: 'Source Organization',
      profiles: [profile({ name: 'primary', bucket: 'source-bucket' })],
    })]);
    const targetRegistry = [
      'schema: axis.organization_registry',
      'schema_version: "0.2"',
      'registry_extension: keep-me',
      'organizations:',
      '  - id: org_target',
      '    slug: target-org',
      '    display_name: Target Organization',
      '    status: active',
      '    organization_extension: keep-org',
      '    oss_profiles:',
      '      - name: secondary',
      '        provider: aliyun-oss',
      '        bucket: target-bucket',
      '        prefix: target/prefix',
      '        endpoint_env: TARGET_OSS_ENDPOINT',
      '        region_env: TARGET_OSS_REGION',
      '        access_key_id_env: TARGET_OSS_ACCESS_KEY_ID',
      '        access_key_secret_env: TARGET_OSS_ACCESS_KEY_SECRET',
      '        profile_extension: keep-profile',
      '      - name: other',
      '        provider: aliyun-oss',
      '        bucket: other-bucket',
      '        prefix: other/prefix',
      '        endpoint_env: OTHER_OSS_ENDPOINT',
      '        region_env: OTHER_OSS_REGION',
      '        access_key_id_env: OTHER_OSS_ACCESS_KEY_ID',
      '        access_key_secret_env: OTHER_OSS_ACCESS_KEY_SECRET',
      '    projects:',
      '      - slug: existing-project',
      '        display_name: Existing Project',
      '        project_extension: keep-project',
      '    products:',
      '      - name: existing-product',
      '  - id: org_other',
      '    slug: other-org',
      '    display_name: Other Organization',
      '    status: active',
      '    oss_profiles: []',
      '    projects: []',
      '',
    ].join('\n');
    const localConfig = [
      'contract_version: "0.2"',
      'local:',
      '  dry_run: true',
      '  custom_local: keep-local',
      '  oss:',
      '    endpoint_env: LOCAL_OSS_ENDPOINT',
      '',
    ].join('\n');
    await writeRepoFile(repo, '.axis/config.yml', mainConfig);
    await writeRepoFile(repo, sourceRegistryPath, sourceRegistry);
    await writeRepoFile(repo, targetRegistryPath, targetRegistry);
    await writeRepoFile(repo, '.axis/config.local.yml', localConfig);
    await writeRepoFile(repo, '.gitignore', '# existing\n.axis/outbox/\n');

    const inspection = await inspectProjectInit({
      repo,
      registryPath: targetRegistryPath,
      organizationId: 'org_target',
      ossProfile: 'secondary',
      environment: {},
    });
    const answers = validateAnswers(inspection, answersFor(inspection, {
      'organization.id': 'org_target',
      'organization.registry': targetRegistryPath,
      'oss_profile.name': 'secondary',
      'organization.display_name': 'Target Organization Updated',
      'local.oss.endpoint_env': null,
      'project.display_name': 'Renamed Project',
    }));
    const rendered = renderProjectFiles({
      inspection,
      answers,
      sourceFiles: sourceFiles({
        mainConfig,
        localConfig,
        targetRegistry,
        gitignore: '# existing\n.axis/outbox/\n',
      }),
    });
    const main = (await import('yaml')).parse(rendered.main_config);
    const local = (await import('yaml')).parse(rendered.local_config);
    const registry = (await import('yaml')).parse(rendered.target_registry);
    assert.equal(main.contract_version, '0.2');
    assert.equal(main.organization.id, 'org_target');
    assert.equal(main.organization.registry, targetRegistryPath);
    assert.equal(main.oss.profile, 'secondary');
    assert.equal(main.extensions.keep_me, true);
    assert.equal(local.contract_version, '0.2');
    assert.equal(local.local.dry_run, true);
    assert.equal(local.local.custom_local, 'keep-local');
    assert.equal(Object.hasOwn(local.local.oss, 'endpoint_env'), false);
    assert.equal(registry.registry_extension, 'keep-me');
    assert.equal(registry.organizations[0].organization_extension, 'keep-org');
    assert.equal(registry.organizations[0].display_name, 'Target Organization Updated');
    assert.equal(registry.organizations[0].oss_profiles[0].profile_extension, 'keep-profile');
    assert.equal(registry.organizations[0].oss_profiles[1].name, 'other');
    assert.equal(registry.organizations[0].projects[0].project_extension, 'keep-project');
    assert.equal(registry.organizations[0].projects.some((project) => project.slug === 'demo-project' && project.display_name === 'Renamed Project'), true);
    assert.equal(registry.organizations[0].products[0].name, 'existing-product');
    assert.equal(registry.organizations[1].id, 'org_other');
    assert.equal(sourceRegistry, await readFile(path.join(repo, sourceRegistryPath), 'utf8'));
    assert.equal(rendered.local_config !== null, true);
    assert.deepEqual(renderProjectFiles({
      inspection,
      answers,
      sourceFiles: sourceFiles({
        mainConfig: rendered.main_config,
        localConfig: rendered.local_config,
        targetRegistry: rendered.target_registry,
        gitignore: rendered.gitignore,
      }),
    }), rendered);
    assert.equal(rendered.gitignore, '# existing\n.axis/outbox/\n.axis/config.local.yml\n');
  });
}

{
  await withTempDir(async (repo) => {
    await ensureAxisDir(repo);
    const mainConfig = v01Config({ bucket: 'legacy-bucket', prefix: 'axis/legacy' });
    const localConfig = [
      'contract_version: "0.1"',
      'local:',
      '  dry_run: true',
      '  credential_blob: secret-value',
      '  oss:',
      '    endpoint_env: LOCAL_ENDPOINT',
      '',
    ].join('\n');
    await writeRepoFile(repo, '.axis/config.yml', mainConfig);
    await writeRepoFile(repo, '.axis/config.local.yml', localConfig);
    const inspection = await inspectProjectInit({ repo, environment: {} });
    const answers = validateAnswers(inspection, answersFor(inspection));
    const rendered = renderProjectFiles({
      inspection,
      answers,
      sourceFiles: sourceFiles({ mainConfig, localConfig, targetRegistry: null, gitignore: null }),
    });
    const main = (await import('yaml')).parse(rendered.main_config);
    const local = (await import('yaml')).parse(rendered.local_config);
    const registry = (await import('yaml')).parse(rendered.target_registry);
    assert.equal(main.contract_version, '0.2');
    assert.equal(Object.hasOwn(main.oss, 'bucket'), false);
    assert.equal(local.contract_version, '0.2');
    assert.equal(local.local.dry_run, true);
    assert.equal(local.local.credential_blob, undefined);
    assert.equal(local.local.oss.endpoint_env, 'LOCAL_ENDPOINT');
    assert.equal(registry.schema_version, '0.2');
    assert.equal(registry.organizations.length, 1);
    assert.equal(rendered.local_config !== null, true);
  });
}

{
  await withTempDir(async (repo) => {
    const environment = completeEnvironment();
    const inspection = await inspectProjectInit({ repo, environment });
    const answersPath = await writeAnswers(repo, answersFor(inspection));
    const { stdout } = await run(['project-init', '--repo', repo, '--answers-file', answersPath, '--apply'], { env: environment });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.contract_version, '0.2');
    assert.equal((await readFile(path.join(repo, '.axis', 'config.yml'), 'utf8')).includes('contract_version: "0.2"'), true);
    assert.equal((await readFile(path.join(repo, '.axis', 'organizations.yml'), 'utf8')).includes('schema_version: "0.2"'), true);
    await assert.rejects(() => readFile(path.join(repo, journalPath), 'utf8'), { code: 'ENOENT' });
  });
}

console.log('project-init-v02 tests passed');
