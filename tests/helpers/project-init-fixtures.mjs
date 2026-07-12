import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const defaultEnv = {
  endpoint_env: 'ALIYUN_OSS_ENDPOINT',
  region_env: 'ALIYUN_OSS_REGION',
  access_key_id_env: 'ALIYUN_OSS_ACCESS_KEY_ID',
  access_key_secret_env: 'ALIYUN_OSS_ACCESS_KEY_SECRET',
  security_token_env: 'ALIYUN_OSS_SECURITY_TOKEN',
};

export const journalPath = '.axis/project-init.journal.json';

export async function ensureAxisDir(repo) {
  await mkdir(path.join(repo, '.axis'), { recursive: true });
}

export async function writeRepoFile(repo, relativePath, content) {
  const filePath = path.join(repo, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

export function v01Config({
  slug = 'demo-project',
  displayName = 'Demo Project',
  bucket = 'legacy-bucket',
  prefix = 'axis/v0.1',
  env = defaultEnv,
  local = '',
} = {}) {
  return [
    'contract_version: "0.1"',
    'project:',
    `  slug: ${slug}`,
    `  display_name: ${displayName}`,
    'package:',
    '  outbox_dir: .axis/outbox',
    'release:',
    '  channel: private_beta',
    '  gate: not_requested',
    'oss:',
    '  provider: aliyun-oss',
    `  bucket: ${bucket}`,
    `  prefix: ${prefix}`,
    `  endpoint_env: ${env.endpoint_env}`,
    `  region_env: ${env.region_env}`,
    `  access_key_id_env: ${env.access_key_id_env}`,
    `  access_key_secret_env: ${env.access_key_secret_env}`,
    `  security_token_env: ${env.security_token_env}`,
    ...(local ? [local.trimEnd()] : []),
    '',
  ].join('\n');
}

export function v02Config({
  slug = 'demo-project',
  displayName = 'Demo Project',
  registry = '.axis/organizations.yml',
  organizationId = 'org_demo',
  profile = 'private_beta_main',
  local = '',
} = {}) {
  return [
    'contract_version: "0.2"',
    'organization:',
    `  id: ${organizationId}`,
    `  registry: ${registry}`,
    'project:',
    `  slug: ${slug}`,
    `  display_name: ${displayName}`,
    'package:',
    '  outbox_dir: .axis/outbox',
    'release:',
    '  channel: private_beta',
    '  gate: not_requested',
    'oss:',
    '  provider: aliyun-oss',
    `  profile: ${profile}`,
    'skills:',
    '  project_init: axis-doc-project-init',
    '  coding_capture: axis-code-capture',
    '  test_report: axis-test-report',
    '  oss_publish: axis-ops-oss-publish',
    ...(local ? [local.trimEnd()] : []),
    '',
  ].join('\n');
}

export function registryYaml(organizations) {
  const lines = [
    'schema: axis.organization_registry',
    'schema_version: "0.2"',
    'organizations:',
  ];
  for (const organization of organizations) {
    lines.push(
      `  - id: ${organization.id}`,
      `    slug: ${organization.slug}`,
      `    display_name: ${organization.displayName}`,
      `    status: ${organization.status ?? 'active'}`,
      '    oss_profiles:',
    );
    for (const profile of organization.profiles) {
      lines.push(
        `      - name: ${profile.name}`,
        `        provider: ${profile.provider ?? 'aliyun-oss'}`,
        `        bucket: ${profile.bucket}`,
        `        prefix: ${profile.prefix}`,
        `        endpoint_env: ${profile.endpoint_env}`,
        `        region_env: ${profile.region_env}`,
        `        access_key_id_env: ${profile.access_key_id_env}`,
        `        access_key_secret_env: ${profile.access_key_secret_env}`,
        ...(profile.security_token_env ? [`        security_token_env: ${profile.security_token_env}`] : []),
      );
    }
    lines.push('    projects:');
    for (const project of organization.projects ?? []) {
      lines.push(`      - slug: ${project.slug}`, `        display_name: ${project.displayName}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function profile(overrides = {}) {
  return {
    name: 'private_beta_main',
    bucket: 'axis-v02-private-beta-example',
    prefix: 'axis/v0.2',
    ...defaultEnv,
    ...overrides,
  };
}

export function organization(overrides = {}) {
  return {
    id: 'org_demo',
    slug: 'demo-org',
    displayName: 'Demo Organization',
    profiles: [profile()],
    projects: [],
    ...overrides,
  };
}
