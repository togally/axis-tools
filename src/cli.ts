#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, readlink, readdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { ProjectInitInspection } from './project-init/index.js';

type InstallAgentChoice = 'codex' | 'claude-code' | 'all';
type InstallStatus = 'copied' | 'identical' | 'would_copy' | 'would_replace' | 'blocked';
type InstallAction = 'copy' | 'replace' | 'skip' | 'block';
type ReleaseChannel = 'private_beta' | 'public';
type ReleaseGate = 'not_requested' | 'pending' | 'passed' | 'failed';
type AssetType = 'coding_capture' | 'test_report' | 'project_knowledge_snapshot';
type ArtifactStatus = 'passed' | 'failed' | 'partial' | 'informational';
type PublishStatus = 'local_ready' | 'uploading' | 'published' | 'failed';
type PublishMode = 'dry_run' | 'local_only' | 'upload';
type ContractVersion = '0.2';

const packagedSkillNamePattern = /^axis-(?:code|doc|integration|ops|skill|test)-[a-z0-9][a-z0-9-]*$/;

interface InstalledSkill {
  skill: string;
  agent: Exclude<InstallAgentChoice, 'all'>;
  target: string;
  status: InstallStatus;
}

interface InstallInventoryItem {
  skill: string;
  agent: Exclude<InstallAgentChoice, 'all'>;
  source: string;
  target: string;
  target_root: string;
  exists: boolean;
  identical: boolean;
  action: InstallAction;
  source_sha256: string;
  target_sha256: string | null;
  reason?: string;
}

interface BackupEntry {
  target: string;
  backup_path: string | null;
  type: 'directory' | 'file' | 'symlink' | 'missing';
  symlink_target?: string;
}

interface BackupManifest {
  version: 1;
  created_at: string;
  entries: BackupEntry[];
}

interface BackupSession extends BackupManifest {
  dir: string;
}

interface AxisConfig {
  contract_version?: string;
  organization?: {
    id?: string;
    registry?: string;
  };
  project?: {
    slug?: string;
    display_name?: string;
  };
  package?: {
    outbox_dir?: string;
  };
  release?: {
    channel?: ReleaseChannel | string;
    gate?: ReleaseGate | string;
  };
  local?: {
    outbox_dir?: string;
    dry_run?: boolean;
    redaction_patterns_file?: string;
  };
  oss?: {
    provider?: string;
    profile?: string;
    bucket?: string;
    prefix?: string;
    endpoint_env?: string;
    region_env?: string;
    access_key_id_env?: string;
    access_key_secret_env?: string;
    security_token_env?: string;
  };
  skills?: {
    project_init?: string;
    coding_capture?: string;
    test_report?: string;
    oss_publish?: string;
  };
}

interface OrganizationSnapshot {
  id: string;
  slug: string;
  display_name: string;
}

interface EffectiveOssConfig {
  provider: 'aliyun-oss';
  profile?: string;
  bucket: string;
  prefix: string;
  endpoint_env: string;
  region_env: string;
  access_key_id_env: string;
  access_key_secret_env: string;
  security_token_env?: string;
}

interface EffectiveAxisConfig {
  contract_version: ContractVersion;
  organization?: OrganizationSnapshot;
  project: {
    slug: string;
    display_name: string;
  };
  package: {
    outbox_dir: string;
  };
  release: {
    channel: ReleaseChannel;
    gate: ReleaseGate;
  };
  oss: EffectiveOssConfig;
  skills: {
    project_init: string;
    coding_capture: string;
    test_report: string;
    oss_publish: string;
  };
}

interface OrganizationRegistry {
  schema?: string;
  schema_version?: string;
  organizations?: unknown;
}

interface RegistryOrganization {
  id?: string;
  slug?: string;
  display_name?: string;
  status?: string;
  oss_profiles?: unknown;
  products?: unknown;
  projects?: unknown;
}

interface RegistryOssProfile {
  name?: string;
  provider?: string;
  bucket?: string;
  prefix?: string;
  endpoint_env?: string;
  region_env?: string;
  access_key_id_env?: string;
  access_key_secret_env?: string;
  security_token_env?: string;
}

interface RegistryProject {
  slug?: string;
  display_name?: string;
}

interface RegistryProduct {
  slug?: string;
  display_name?: string;
  projects?: unknown;
}

interface FileEntry {
  kind: 'metadata' | 'report' | 'experience' | 'document' | 'manifest';
  path: string;
  media_type: string;
  sha256: string;
  bytes: number;
}

interface ManifestFileEntry extends FileEntry {
  path: string;
}

interface PackageManifest {
  schema?: string;
  schema_version?: string;
  package_id?: string;
  organization?: {
    id?: string;
    slug?: string;
    display_name?: string;
  };
  project?: {
    slug?: string;
    display_name?: string;
  };
  oss_profile?: {
    name?: string;
    provider?: string;
    bucket?: string;
    prefix?: string;
  };
  producer?: {
    skill?: string;
  };
  run?: {
    run_id?: string;
  };
  release?: {
    channel?: string;
    gate?: string;
  };
  files?: ManifestFileEntry[];
  publish?: {
    provider?: string;
    status?: PublishStatus | string;
    bucket?: string;
    prefix?: string;
    base_uri?: string;
  };
  public_safety_validation?: {
    status?: string;
  };
}

interface PackageMetadata {
  organization?: {
    id?: string;
    slug?: string;
    display_name?: string;
  };
  project?: {
    slug?: string;
    display_name?: string;
  };
  source_evidence?: {
    run_id?: string;
  };
  index_refs?: {
    organization_index?: string;
    project_package_path?: string;
    project_document_path?: string;
  };
  artifact?: {
    type?: string;
  };
  public_safety?: {
    reviewed?: boolean;
    contains_credentials?: boolean;
    contains_private_urls?: boolean;
    validation?: {
      status?: string;
    };
  };
}

interface PublishFile {
  path: string;
  absolutePath: string;
  media_type: string;
  sha256: string;
  bytes: number;
  object_key: string;
  target_uri: string;
}

interface OssCredentials {
  endpoint: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}

interface OssStorageAdapter {
  headObject(key: string): Promise<{ sha256: string | null } | null>;
  putObject(key: string, filePath: string, metadata: { sha256: string }): Promise<void>;
}

interface ResolveAxisConfigOptions {
  localOssEnvOverrides?: AxisConfig['oss'];
  registryOverride?: OrganizationRegistry;
}

const execFileAsync = promisify(execFile);
const defaultOutboxDir = '.axis/outbox';
const ignoredLocalPaths = ['.axis/config.local.yml', '.axis/outbox/'];
const requiredEnvFields = ['endpoint_env', 'region_env', 'access_key_id_env', 'access_key_secret_env'] as const;
const skillNames = {
  projectInit: 'axis-doc-project-init',
  codingCapture: 'axis-code-capture',
  testReport: 'axis-test-report',
  projectKnowledge: 'axis-doc-project-knowledge',
  ossPublish: 'axis-ops-oss-publish',
} as const;
const protocolVersions = {
  document_protocol: '0.2',
  workflow_protocol: '0.2',
  experience_protocol: '0.2',
  agent_execution_protocol: '0.2',
} as const;
const expiredV01Message = 'Axis v0.1 is expired; migrate with project-init --repo <path> --inspect --json, confirm the v0.2 answers, then apply them';
const publicSafetyValidators = [
  'deterministic_secret_scan',
  'private_url_scan',
  'manual_public_safe_review',
] as const;

type ProjectInitApi = typeof import('./project-init/index.js');

async function projectInitApi(): Promise<ProjectInitApi> {
  return import('./project-init/index.js');
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function skillsRoot(): string {
  return path.join(repoRoot(), 'skills');
}

function homeDir(): string {
  return os.homedir();
}

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function getArgs(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function isHelpFlag(value: string | undefined): boolean {
  return value === '--help' || value === '-h';
}

function printUsage(): void {
  console.log(`axis-tools

Commands:
  install [--agent <codex|claude-code|cc|all>] [--skill <skill-name>] [--dry-run] [--force] [--backup-dir <path>] [--rollback <backup-dir-or-manifest>]
  inventory [--agent <codex|claude-code|cc|all>] [--skill <skill-name>]
  project-init --repo <path> --inspect --json [--registry-path <relative-path>] [--organization-id <id>] [--oss-profile <name>]
  project-init --repo <path> --answers-file <path> --apply
  project-init --repo <path> --recover
  validate-config --repo <path>
  coding-capture --repo <path> --title <title> --summary <summary> --status <status> --report <markdown> [--experience <markdown>] [--tag <tag>] [--run-id <run-id>]
  test-report --repo <path> --title <title> --summary <summary> --status <status> --report <markdown> [--experience <markdown>] [--tag <tag>] [--run-id <run-id>]
  project-knowledge-capture --repo <path> [--run-id <run-id>] [--language <zh-CN>]
  oss-publish --repo <path> --run-id <run-id> [--dry-run | --local-only]

Skill helper scripts:
  node scripts/axis-skill-update.mjs --repo <axis-tools> --agent codex --json
  node scripts/axis-skill-create.mjs --scan-conversation <conversation.txt> --json
  node scripts/axis-skill-deposit.mjs --skill <skill-name> --commit --push --branch main

Purpose:
  Install and maintain the public Axis packaged skills in this repository.
`);
}

function requireArg(flag: string): string {
  const value = getArg(flag);
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} is required`);
  }
  return value;
}

function repoArg(): string {
  return path.resolve(getArg('--repo') ?? process.cwd());
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function relativeToRepo(repo: string, target: string): string {
  return toPosix(path.relative(repo, target));
}

type SimpleYamlValue = string | boolean | SimpleYamlObject | SimpleYamlValue[];
interface SimpleYamlObject {
  [key: string]: SimpleYamlValue;
}

interface SimpleYamlLine {
  indent: number;
  content: string;
}

function parseScalar(value: string): string | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isSimpleYamlObject(value: SimpleYamlValue): value is SimpleYamlObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseKeyValue(line: string): { key: string; rawValue: string } {
  const separator = line.indexOf(':');
  if (separator === -1) {
    throw new Error(`Unsupported config line: ${line}`);
  }
  return {
    key: line.slice(0, separator).trim(),
    rawValue: line.slice(separator + 1),
  };
}

function parseSimpleYaml(text: string): AxisConfig {
  const lines: SimpleYamlLine[] = text.split(/\r?\n/)
    .filter((rawLine) => rawLine.trim() && !rawLine.trimStart().startsWith('#'))
    .map((rawLine) => ({
      indent: rawLine.match(/^ */)?.[0].length ?? 0,
      content: rawLine.trim(),
    }));
  let index = 0;

  const parseBlock = (indent: number): SimpleYamlValue => {
    if (index >= lines.length || lines[index].indent < indent) return {};
    if (lines[index].indent !== indent) {
      throw new Error(`Unsupported config indentation: ${lines[index].content}`);
    }
    return lines[index].content.startsWith('- ') ? parseArray(indent) : parseMap(indent);
  };

  const parseMap = (indent: number): SimpleYamlObject => {
    const object: SimpleYamlObject = {};
    while (index < lines.length) {
      const line = lines[index];
      if (line.indent < indent) break;
      if (line.indent !== indent || line.content.startsWith('- ')) break;
      const { key, rawValue } = parseKeyValue(line.content);
      index += 1;
      if (rawValue.trim()) {
        object[key] = parseScalar(rawValue);
      } else if (index < lines.length
        && (lines[index].indent > indent
          || (lines[index].indent === indent && lines[index].content.startsWith('- ')))) {
        object[key] = parseBlock(lines[index].indent);
      } else {
        object[key] = {};
      }
    }
    return object;
  };

  const parseArray = (indent: number): SimpleYamlValue[] => {
    const values: SimpleYamlValue[] = [];
    while (index < lines.length && lines[index].indent === indent && lines[index].content.startsWith('- ')) {
      const itemText = lines[index].content.slice(2).trim();
      index += 1;
      if (!itemText) {
        values.push(index < lines.length && lines[index].indent > indent ? parseBlock(lines[index].indent) : {});
        continue;
      }

      if (itemText.includes(':')) {
        const { key, rawValue } = parseKeyValue(itemText);
        const object: SimpleYamlObject = {};
        if (rawValue.trim()) {
          object[key] = parseScalar(rawValue);
        } else if (index < lines.length && lines[index].indent > indent) {
          object[key] = parseBlock(lines[index].indent);
        } else {
          object[key] = {};
        }
        if (index < lines.length && lines[index].indent > indent) {
          const rest = parseBlock(lines[index].indent);
          if (!isSimpleYamlObject(rest)) {
            throw new Error(`Unsupported array item continuation: ${itemText}`);
          }
          Object.assign(object, rest);
        }
        values.push(object);
      } else {
        values.push(parseScalar(itemText));
      }
    }
    return values;
  };

  if (lines.length === 0) return {};
  const parsed = parseBlock(lines[0].indent);
  if (!isSimpleYamlObject(parsed)) {
    throw new Error('Root YAML value must be a mapping');
  }
  return parsed as AxisConfig;
}

async function readAxisConfig(repo: string): Promise<AxisConfig> {
  const configPath = path.join(repo, '.axis', 'config.yml');
  if (!existsSync(configPath)) {
    throw new Error('Missing .axis/config.yml. Run project-init first.');
  }
  return parseSimpleYaml(await readFile(configPath, 'utf8'));
}

function requireString(errors: string[], value: unknown, field: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} is required`);
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectionRecords<T>(value: unknown, keyField: string): T[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as T[];
  }
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([key, record]) => ({
      ...record,
      [keyField]: typeof record[keyField] === 'string' ? record[keyField] : key,
    }) as T);
}

function validateProjectReleaseSkills(
  config: AxisConfig,
  errors: string[],
): {
  slug: string | null;
  displayName: string | null;
  channel: ReleaseChannel | null;
  gate: ReleaseGate | null;
} {
  const slug = requireString(errors, config.project?.slug, 'project.slug');
  if (slug && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    errors.push('project.slug must match ^[a-z0-9][a-z0-9-]{1,62}$');
  }
  const displayName = requireString(errors, config.project?.display_name, 'project.display_name');
  if (config.package?.outbox_dir !== defaultOutboxDir) {
    errors.push(`package.outbox_dir must be ${defaultOutboxDir}`);
  }

  const channel = config.release?.channel;
  const gate = config.release?.gate;
  let releaseChannel: ReleaseChannel | null = null;
  let releaseGate: ReleaseGate | null = null;
  if (channel !== 'private_beta' && channel !== 'public') {
    errors.push('release.channel must be private_beta or public');
  } else {
    releaseChannel = channel;
  }
  if (gate !== 'not_requested' && gate !== 'pending' && gate !== 'passed' && gate !== 'failed') {
    errors.push('release.gate must be not_requested, pending, passed, or failed');
  } else {
    releaseGate = gate;
  }
  if (channel === 'public' && gate !== 'passed') {
    errors.push('public release requires release.gate: passed');
  }

  if (config.skills?.project_init !== skillNames.projectInit) errors.push(`skills.project_init must be ${skillNames.projectInit}`);
  if (config.skills?.coding_capture !== skillNames.codingCapture) errors.push(`skills.coding_capture must be ${skillNames.codingCapture}`);
  if (config.skills?.test_report !== skillNames.testReport) errors.push(`skills.test_report must be ${skillNames.testReport}`);
  if (config.skills?.oss_publish !== skillNames.ossPublish) errors.push(`skills.oss_publish must be ${skillNames.ossPublish}`);

  return { slug, displayName, channel: releaseChannel, gate: releaseGate };
}

function validateOssTarget(
  errors: string[],
  source: Record<string, unknown> | AxisConfig['oss'] | RegistryOssProfile | undefined,
  fieldPrefix: string,
): { oss: EffectiveOssConfig | null; requiredEnv: string[] } {
  const provider = source?.provider;
  if (provider !== 'aliyun-oss') errors.push(`${fieldPrefix}.provider must be aliyun-oss`);
  const bucket = requireString(errors, source?.bucket, `${fieldPrefix}.bucket`);
  const prefix = requireString(errors, source?.prefix, `${fieldPrefix}.prefix`);
  if (prefix && (prefix.startsWith('/') || prefix.endsWith('/'))) {
    errors.push(`${fieldPrefix}.prefix must not start or end with /`);
  }

  const requiredEnv: string[] = [];
  for (const field of requiredEnvFields) {
    const envName = requireString(errors, source?.[field], `${fieldPrefix}.${field}`);
    if (!envName) continue;
    if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) {
      errors.push(`${fieldPrefix}.${field} must be an environment variable name`);
    }
    requiredEnv.push(envName);
  }
  const securityTokenEnv = source?.security_token_env;
  if (securityTokenEnv && typeof securityTokenEnv !== 'string') {
    errors.push(`${fieldPrefix}.security_token_env must be an environment variable name`);
  }
  if (typeof securityTokenEnv === 'string' && !/^[A-Z_][A-Z0-9_]*$/.test(securityTokenEnv)) {
    errors.push(`${fieldPrefix}.security_token_env must be an environment variable name`);
  }

  if (errors.length > 0 || provider !== 'aliyun-oss' || !bucket || !prefix) {
    return { oss: null, requiredEnv };
  }

  return {
    oss: {
      provider,
      bucket,
      prefix,
      endpoint_env: source?.endpoint_env as string,
      region_env: source?.region_env as string,
      access_key_id_env: source?.access_key_id_env as string,
      access_key_secret_env: source?.access_key_secret_env as string,
      security_token_env: typeof securityTokenEnv === 'string' ? securityTokenEnv : undefined,
    },
    requiredEnv,
  };
}

function withLocalOssEnvOverrides(profile: RegistryOssProfile, overrides: AxisConfig['oss'] | undefined): RegistryOssProfile {
  if (!overrides) return profile;
  const merged = { ...profile };
  for (const field of requiredEnvFields) {
    if (overrides[field]) merged[field] = overrides[field];
  }
  if (overrides.security_token_env) merged.security_token_env = overrides.security_token_env;
  return merged;
}

function findDuplicateProjectSlugs(organization: RegistryOrganization): string[] {
  const slugs: string[] = [];
  const collect = (projects: unknown): void => {
    for (const project of collectionRecords<RegistryProject>(projects, 'slug')) {
      if (typeof project.slug === 'string') slugs.push(project.slug);
    }
  };
  collect(organization.projects);
  for (const product of collectionRecords<RegistryProduct>(organization.products, 'slug')) {
    collect(product.projects);
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
  }
  return [...duplicates].sort();
}

async function readOrganizationRegistry(repo: string, registryPath: string): Promise<OrganizationRegistry> {
  if (path.isAbsolute(registryPath) || registryPath.split(/[\\/]+/).includes('..')) {
    throw new Error('organization.registry must be a relative path inside the repo');
  }
  const absolutePath = path.resolve(repo, registryPath);
  const repoWithSeparator = repo.endsWith(path.sep) ? repo : `${repo}${path.sep}`;
  if (!absolutePath.startsWith(repoWithSeparator)) {
    throw new Error('organization.registry must be a relative path inside the repo');
  }
  if (!existsSync(absolutePath)) {
    throw new Error(`organization registry file not found: ${registryPath}`);
  }
  return parseSimpleYaml(await readFile(absolutePath, 'utf8')) as OrganizationRegistry;
}

async function resolveAxisConfig(repo: string, config: AxisConfig, options: ResolveAxisConfigOptions = {}): Promise<{
  errors: string[];
  requiredEnv: string[];
  effectiveConfig: EffectiveAxisConfig | null;
}> {
  const errors: string[] = [];
  if (config.contract_version === '0.1') {
    return { errors: [expiredV01Message], requiredEnv: [], effectiveConfig: null };
  }
  if (config.contract_version !== '0.2') {
    errors.push('contract_version must be "0.2"');
  }
  const common = validateProjectReleaseSkills(config, errors);
  const baseConfig = {
    project: {
      slug: common.slug ?? '',
      display_name: common.displayName ?? '',
    },
    package: {
      outbox_dir: defaultOutboxDir,
    },
    release: {
      channel: common.channel ?? 'private_beta',
      gate: common.gate ?? 'not_requested',
    },
    skills: {
      project_init: skillNames.projectInit,
      coding_capture: skillNames.codingCapture,
      test_report: skillNames.testReport,
      oss_publish: skillNames.ossPublish,
    },
  };

  if (config.oss?.provider !== 'aliyun-oss') errors.push('oss.provider must be aliyun-oss');
  if (config.oss?.bucket) errors.push('oss.bucket is not allowed for contract_version "0.2"; use oss.profile');
  if (config.oss?.prefix) errors.push('oss.prefix is not allowed for contract_version "0.2"; use oss.profile');

  const organizationId = requireString(errors, config.organization?.id, 'organization.id');
  if (organizationId && !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(organizationId)) {
    errors.push('organization.id must match ^[a-z0-9][a-z0-9_-]{1,62}$');
  }
  const registryPath = requireString(errors, config.organization?.registry, 'organization.registry');
  const profileName = requireString(errors, config.oss?.profile, 'oss.profile');
  if (profileName && !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(profileName)) {
    errors.push('oss.profile must match ^[a-z0-9][a-z0-9_-]{1,62}$');
  }
  if (!organizationId || !registryPath || !profileName) {
    return { errors, requiredEnv: [], effectiveConfig: null };
  }

  let registry: OrganizationRegistry | null = null;
  if (options.registryOverride) {
    registry = options.registryOverride;
  } else {
    try {
      registry = await readOrganizationRegistry(repo, registryPath);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!registry) return { errors, requiredEnv: [], effectiveConfig: null };
  if (registry.schema && registry.schema !== 'axis.organization_registry') {
    errors.push('organization registry schema must be axis.organization_registry');
  }
  if (registry.schema_version !== '0.2') {
    errors.push('organization registry schema_version must be "0.2"');
  }

  const organization = collectionRecords<RegistryOrganization>(registry.organizations, 'id')
    .find((candidate) => candidate.id === organizationId);
  if (!organization) {
    errors.push('organization.id is not declared in the organization registry');
    return { errors, requiredEnv: [], effectiveConfig: null };
  }
  const organizationSlug = requireString(errors, organization.slug, 'organization registry organization.slug');
  const organizationDisplayName = requireString(errors, organization.display_name, 'organization registry organization.display_name');
  const duplicateSlugs = findDuplicateProjectSlugs(organization);
  if (duplicateSlugs.length > 0) {
    errors.push(`project.slug is duplicated inside organization.id ${organizationId}: ${duplicateSlugs.join(', ')}`);
  }

  const profile = collectionRecords<RegistryOssProfile>(organization.oss_profiles, 'name')
    .find((candidate) => candidate.name === profileName);
  if (!profile) {
    errors.push('oss.profile is not declared for organization.id');
    return { errors, requiredEnv: [], effectiveConfig: null };
  }
  const resolvedProfile = withLocalOssEnvOverrides(profile, options.localOssEnvOverrides);
  const { oss, requiredEnv } = validateOssTarget(errors, resolvedProfile, 'organization registry oss_profile');
  if (oss) {
    oss.profile = profileName;
  }

  return {
    errors,
    requiredEnv,
    effectiveConfig: errors.length === 0 && oss && organizationSlug && organizationDisplayName ? {
      contract_version: '0.2',
      organization: {
        id: organizationId,
        slug: organizationSlug,
        display_name: organizationDisplayName,
      },
      ...baseConfig,
      oss,
    } : null,
  };
}

async function ensureGitignore(repo: string): Promise<void> {
  const gitignorePath = path.join(repo, '.gitignore');
  let existing = '';
  if (existsSync(gitignorePath)) {
    existing = await readFile(gitignorePath, 'utf8');
  }
  const lines = existing.split(/\r?\n/).filter((line) => line.length > 0);
  for (const ignoredPath of ignoredLocalPaths) {
    if (!lines.includes(ignoredPath)) lines.push(ignoredPath);
  }
  await writeFile(gitignorePath, `${lines.join('\n')}\n`, 'utf8');
}

async function readProjectInitFile(repo: string, relativePath: string): Promise<string | null> {
  const absolutePath = path.join(repo, relativePath);
  if (!existsSync(absolutePath)) return null;
  return readFile(absolutePath, 'utf8');
}

function localOssEnvOverrides(localConfig: AxisConfig | null): AxisConfig['oss'] | undefined {
  if (!localConfig?.oss) return undefined;
  const overrides: AxisConfig['oss'] = {};
  for (const field of requiredEnvFields) {
    if (localConfig.oss[field]) overrides[field] = localConfig.oss[field];
  }
  if (localConfig.oss.security_token_env) overrides.security_token_env = localConfig.oss.security_token_env;
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function assertResolvedProjectInitConfig(
  repo: string,
  config: AxisConfig,
  registry: OrganizationRegistry,
  localConfig: AxisConfig | null,
): Promise<void> {
  return resolveAxisConfig(repo, config, {
    registryOverride: registry,
    localOssEnvOverrides: localOssEnvOverrides(localConfig),
  }).then(({ errors, effectiveConfig }) => {
    if (errors.length > 0) throw new Error(errors.join('\n'));
    if (!effectiveConfig || effectiveConfig.contract_version !== '0.2') {
      throw new Error('generated project configuration did not resolve to v0.2');
    }
  });
}

async function applyProjectInitCommand(repo: string, answersFile: string): Promise<void> {
  const { inspectProjectInit, renderProjectFiles, validateAnswers, applyTransaction } = await projectInitApi();
  const input = await readJsonFile<unknown>(path.resolve(answersFile));
  const answersMetadata = input && typeof input === 'object' ? input as { selectors?: ProjectInitInspection['selectors'] } : {};
  const inspection = await inspectProjectInit({
    repo,
    registryPath: answersMetadata.selectors?.registry_path,
    organizationId: answersMetadata.selectors?.organization_id,
    ossProfile: answersMetadata.selectors?.oss_profile,
  });
  if (inspection.recovery_required) {
    throw new Error('project-init recovery is required; run project-init --repo <path> --recover first');
  }
  const answers = validateAnswers(inspection, input);
  const missingEnvironment = inspection.environment
    .filter((entry) => entry.required && (!entry.name || !process.env[entry.name]))
    .map((entry) => entry.name ?? entry.field);
  if (missingEnvironment.length > 0) {
    throw new Error(`required project-init environment variables are missing: ${missingEnvironment.join(', ')}`);
  }

  const targetRegistryPath = inspection.selectors.registry_path;
  const sourceFiles = {
    main_config: await readProjectInitFile(repo, '.axis/config.yml'),
    local_config: await readProjectInitFile(repo, '.axis/config.local.yml'),
    target_registry: await readProjectInitFile(repo, targetRegistryPath),
    gitignore: await readProjectInitFile(repo, '.gitignore'),
    source_registry: inspection.files.find((file) => file.role === 'source_registry')
      ? await readProjectInitFile(repo, inspection.files.find((file) => file.role === 'source_registry')!.path)
      : null,
  };
  const rendered = renderProjectFiles({ inspection, answers, sourceFiles });
  const renderedConfig = parseSimpleYaml(rendered.main_config) as AxisConfig;
  const renderedRegistry = parseSimpleYaml(rendered.target_registry) as OrganizationRegistry;
  const renderedLocal = rendered.local_config === null ? null : parseSimpleYaml(rendered.local_config) as AxisConfig;
  const targetFiles = [
    { role: 'main_config', path: '.axis/config.yml', originalText: sourceFiles.main_config, nextText: rendered.main_config },
    ...(sourceFiles.local_config !== null || rendered.local_config !== null
      ? [{ role: 'local_config', path: '.axis/config.local.yml', originalText: sourceFiles.local_config, nextText: rendered.local_config }]
      : []),
    { role: 'target_registry', path: targetRegistryPath, originalText: sourceFiles.target_registry, nextText: rendered.target_registry },
    { role: 'gitignore', path: '.gitignore', originalText: sourceFiles.gitignore, nextText: rendered.gitignore },
  ];
  await applyTransaction({
    repo,
    files: targetFiles,
    validateBefore: async () => assertResolvedProjectInitConfig(repo, renderedConfig, renderedRegistry, renderedLocal),
    validateAfter: async () => {
      const persistedConfig = await readAxisConfig(repo);
      const persistedLocal = await readOptionalLocalConfig(repo);
      const persistedRegistry = await readOrganizationRegistry(repo, targetRegistryPath);
      await assertResolvedProjectInitConfig(repo, persistedConfig, persistedRegistry, persistedLocal);
    },
  });
  console.log(JSON.stringify({
    ok: true,
    contract_version: '0.2',
    config_path: '.axis/config.yml',
    registry_path: targetRegistryPath,
    files: targetFiles.map((file) => file.path),
  }, null, 2));
}

async function recoverProjectInitCommand(repo: string): Promise<void> {
  const { recoverTransaction } = await projectInitApi();
  await recoverTransaction(repo);
  console.log(JSON.stringify({ ok: true, recovered: true }, null, 2));
}

async function projectInitCommand(): Promise<void> {
  const repo = repoArg();
  const inspect = hasFlag('--inspect');
  const apply = hasFlag('--apply');
  const recover = hasFlag('--recover');
  const hasSelector = Boolean(getArg('--registry-path') || getArg('--organization-id') || getArg('--oss-profile'));
  const hasAnswersFile = Boolean(getArg('--answers-file'));

  if (inspect && apply) throw new Error('--inspect and --apply cannot combine');
  if (recover && (hasAnswersFile || inspect || apply)) throw new Error('--recover cannot combine with other project-init modes');
  if (hasSelector && !inspect) throw new Error('project-init selectors are only valid with --inspect');
  if (apply && !hasAnswersFile) throw new Error('--answers-file is required with --apply');
  if (hasFlag('--json') && !inspect) throw new Error('--json is only valid with --inspect');

  if (inspect) {
    if (!hasFlag('--json')) throw new Error('--json is required with --inspect');
    const { inspectProjectInit } = await projectInitApi();
    const result = await inspectProjectInit({
      repo,
      registryPath: getArg('--registry-path'),
      organizationId: getArg('--organization-id'),
      ossProfile: getArg('--oss-profile'),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (recover) {
    await recoverProjectInitCommand(repo);
    return;
  }
  if (apply) {
    await applyProjectInitCommand(repo, getArg('--answers-file') as string);
    return;
  }
  if (getArg('--project-slug') || getArg('--display-name') || hasFlag('--force')) {
    throw new Error('Axis v0.1 project-init is expired; use project-init --inspect --json and the v0.2 answers-file flow');
  }
  throw new Error('project-init requires --inspect --json for v0.2 configuration');

}

async function validateConfigCommand(): Promise<void> {
  const repo = repoArg();
  const config = await readAxisConfig(repo);
  const { errors, requiredEnv, effectiveConfig } = await resolveAxisConfig(repo, config);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  if (!effectiveConfig) throw new Error('Unable to resolve Axis config');
  console.log(JSON.stringify({
    ok: true,
    contract_version: effectiveConfig.contract_version,
    organization: effectiveConfig.organization,
    project: {
      slug: effectiveConfig.project.slug,
      display_name: effectiveConfig.project.display_name,
    },
    release: {
      channel: effectiveConfig.release.channel,
      gate: effectiveConfig.release.gate,
    },
    oss_profile: effectiveConfig.oss.profile ? {
      name: effectiveConfig.oss.profile,
      provider: effectiveConfig.oss.provider,
      bucket: effectiveConfig.oss.bucket,
      prefix: effectiveConfig.oss.prefix,
    } : undefined,
    required_env: requiredEnv,
  }, null, 2));
}

function parseArtifactStatus(): ArtifactStatus {
  const status = requireArg('--status');
  if (status !== 'passed' && status !== 'failed' && status !== 'partial' && status !== 'informational') {
    throw new Error('--status must be passed, failed, partial, or informational');
  }
  return status;
}

function buildRunId(assetType: AssetType): string {
  const provided = getArg('--run-id');
  if (provided) {
    if (!/^\d{8}T\d{6}Z-[a-z0-9-]+-[a-f0-9]{8}$/.test(provided)) {
      throw new Error('--run-id must match YYYYMMDDThhmmssZ-name-8hex');
    }
    return provided;
  }
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${timestamp}-${assetType.replaceAll('_', '-')}-${randomBytes(4).toString('hex')}`;
}

async function readTextArg(flag: string, fileFlag: string, fallback: string | null = null): Promise<string> {
  const filePath = getArg(fileFlag);
  if (filePath) return readFile(path.resolve(filePath), 'utf8');
  const value = getArg(flag);
  if (value) return value;
  if (fallback !== null) return fallback;
  throw new Error(`${flag} or ${fileFlag} is required`);
}

function defaultExperience(title: string): string {
  return [
    '# Experience',
    '',
    '## Context',
    `${title} was generated as a local-only Axis v0.2 package.`,
    '',
    '## Decision',
    'Write public-safe package files to the local outbox before any OSS upload.',
    '',
    '## Steps',
    'Validate configuration, write metadata, write report, write experience, then write manifest.',
    '',
    '## Validation',
    'Package files were written locally with manifest checksums and byte counts.',
    '',
    '## Reuse Notes',
    'Reuse this pattern for local package creation before a release gate or OSS publish step.',
    '',
    '## Public Safety',
    'Reviewed; no credentials or private URLs are included.',
    '',
  ].join('\n');
}

function projectKnowledgeSourceRoot(repo: string, config: EffectiveAxisConfig): string {
  if (config.contract_version !== '0.2' || !config.organization) {
    throw new Error('project-knowledge-capture requires a resolved v0.2 organization configuration');
  }
  return path.join(repo, '.axis', 'docs', 'orgs', config.organization.id, 'projects', config.project.slug);
}

interface ProjectKnowledgeSourceFile {
  source: string;
  sourceRoot?: string;
  target: string;
  docType: string;
  docId?: string;
  mediaType: string;
}

interface SecondaryCapabilityInventoryItem {
  secondary_capability_id?: string;
  name?: string;
  business_ids?: string[];
}

interface Level1CapabilityInventoryItem {
  level1_capability_id?: string;
  level1_capability_name?: string;
  secondary_capabilities?: SecondaryCapabilityInventoryItem[];
}

function secondaryDesignStatus(
  body: string,
  key: string,
  allowed: string[],
  capabilityId: string,
  secondaryId: string,
): string {
  const match = new RegExp(`\\b${key}\\s*=\\s*(${allowed.join('|')})\\b`).exec(body);
  if (!match) {
    throw new Error(
      `project knowledge secondary capability detailed design missing ${key}: ${capabilityId}/${secondaryId}`,
    );
  }
  return match[1];
}

function exactCodeAnchors(body: string): string[] {
  return [...body.matchAll(
    /(?:[A-Za-z0-9_.@+\-]+\/)+[A-Za-z0-9_.$@+\-]+\.[A-Za-z0-9]+:\d+-\d+#[A-Za-z_$][A-Za-z0-9_$<>.\-]*/g,
  )].map((match) => match[0]);
}

function projectKnowledgeSection(body: string, heading: RegExp): string | null {
  const match = heading.exec(body);
  if (!match || match.index === undefined) return null;
  const sectionStart = match.index + match[0].length;
  const nextHeading = /^##\s+/m.exec(body.slice(sectionStart));
  return body.slice(sectionStart, nextHeading ? sectionStart + nextHeading.index : body.length);
}

function assertSecondaryCapabilityDetailedDesign(
  body: string,
  capabilityId: string,
  secondaryId: string,
): void {
  const scope = `${capabilityId}/${secondaryId}`;
  const interfaceStatus = secondaryDesignStatus(
    body,
    'interface_design_status',
    ['detailed', 'not_applicable'],
    capabilityId,
    secondaryId,
  );
  const interfaceCoverage = secondaryDesignStatus(
    body,
    'interface_coverage',
    ['complete', 'partial', 'not_applicable'],
    capabilityId,
    secondaryId,
  );
  const persistenceStatus = secondaryDesignStatus(
    body,
    'persistence_design_status',
    ['detailed', 'not_applicable'],
    capabilityId,
    secondaryId,
  );
  const relationshipStatus = secondaryDesignStatus(
    body,
    'relationship_model_status',
    ['relational', 'single_table', 'not_applicable'],
    capabilityId,
    secondaryId,
  );

  if (interfaceStatus === 'not_applicable') {
    if (interfaceCoverage !== 'not_applicable'
      || !/\binterface_not_applicable_reason\s*=\s*[^`\n|·]+/.test(body)
      || !/\binterface_not_applicable_evidence\s*=\s*(?:`)?(?:[A-Za-z0-9_.@+\-]+\/)+[A-Za-z0-9_.$@+\-]+\.[A-Za-z0-9]+:\d+-\d+#[A-Za-z_$][A-Za-z0-9_$<>.\-]*/.test(body)) {
      throw new Error(`project knowledge secondary capability interface not_applicable requires reason and evidence: ${scope}`);
    }
  } else {
    if (interfaceCoverage === 'not_applicable') {
      throw new Error(`project knowledge secondary capability interface coverage conflicts with detailed status: ${scope}`);
    }
    const interfaceSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+接口详细设计\s*$/m);
    if (!interfaceSection) {
      throw new Error(`project knowledge secondary capability detailed design missing interface detail section: ${scope}`);
    }
    if (/现有入口集合|对应应用服务|以\s*DTO\/BO\s*校验为准|以统一响应和领域异常为准/.test(interfaceSection)) {
      throw new Error(`project knowledge secondary capability detailed design uses generic interface placeholder: ${scope}`);
    }
    if (!/(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+)/.test(interfaceSection)) {
      throw new Error(`project knowledge secondary capability interface design missing concrete contract: ${scope}`);
    }
    for (const requiredHeading of ['请求字段', '响应字段', '错误码与异常映射']) {
      if (!new RegExp(`^###\\s+\\d+\\.\\d+\\s+${requiredHeading}\\s*$`, 'm').test(interfaceSection)) {
        throw new Error(`project knowledge secondary capability interface design missing ${requiredHeading}: ${scope}`);
      }
    }
    const interfaceAnchors = exactCodeAnchors(interfaceSection);
    if (interfaceAnchors.length < 4 && !/目标设计/.test(interfaceSection)) {
      throw new Error(`project knowledge secondary capability interface design missing exact code anchors: ${scope}`);
    }
    if (interfaceCoverage === 'partial' && !/(?:interface_gap_id\s*=|missing_evidence|缺失证据)/.test(body)) {
      throw new Error(`project knowledge secondary capability partial interface coverage requires an explicit gap: ${scope}`);
    }
  }

  if (persistenceStatus === 'not_applicable') {
    if (relationshipStatus !== 'not_applicable'
      || !/\bpersistence_not_applicable_reason\s*=\s*[^`\n|·]+/.test(body)
      || !/\bpersistence_not_applicable_evidence\s*=\s*(?:`)?(?:[A-Za-z0-9_.@+\-]+\/)+[A-Za-z0-9_.$@+\-]+\.[A-Za-z0-9]+:\d+-\d+#[A-Za-z_$][A-Za-z0-9_$<>.\-]*/.test(body)) {
      throw new Error(`project knowledge secondary capability persistence not_applicable requires reason and evidence: ${scope}`);
    }
    return;
  }

  if (relationshipStatus === 'not_applicable') {
    throw new Error(`project knowledge secondary capability relationship model conflicts with persistence status: ${scope}`);
  }
  const relationshipSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+实体、表与对象关系\s*$/m);
  const tableSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+表结构设计\s*$/m);
  if (!relationshipSection || !tableSection) {
    throw new Error(`project knowledge secondary capability detailed design missing persistence sections: ${scope}`);
  }
  const erBlock = /```mermaid\s*\r?\nerDiagram\s*\r?\n([\s\S]*?)```/.exec(relationshipSection)?.[1] ?? '';
  if (!erBlock) {
    throw new Error(`project knowledge secondary capability detailed design missing ER diagram: ${scope}`);
  }
  if (/\b(?:BUSINESS_FLOW|API|RESULT|TABLE|ENTITY_A|ENTITY_B|CONTROLLER|SERVICE)\b/i.test(erBlock)) {
    throw new Error(`project knowledge secondary capability detailed design uses non-entity ER placeholder: ${scope}`);
  }
  const tableInventoryHeading = /^###\s+8\.1\s+数据表清单\s*$/m.exec(tableSection);
  const tableInventoryRemainder = tableInventoryHeading
    ? tableSection.slice((tableInventoryHeading.index ?? 0) + tableInventoryHeading[0].length)
    : '';
  const nextTableSubsection = /^###\s+8\./m.exec(tableInventoryRemainder);
  const tableInventorySection = tableInventoryRemainder.slice(
    0,
    nextTableSubsection?.index ?? tableInventoryRemainder.length,
  );
  const tableNames = new Set(
    [...tableInventorySection.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)]
      .map((match) => match[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')),
  );
  if (tableNames.size === 0) {
    throw new Error(`project knowledge secondary capability table inventory is empty: ${scope}`);
  }
  const relationships = [...erBlock.matchAll(
    /^\s*([A-Za-z][A-Za-z0-9_]*)\s+([|o}{]{2}--[|o}{]{2})\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*"([^"]+)"/gm,
  )];
  if (relationshipStatus === 'relational') {
    if (relationships.length === 0) {
      throw new Error(`project knowledge secondary capability ER diagram missing table relationship: ${scope}`);
    }
    for (const relationship of relationships) {
      for (const entityName of [relationship[1], relationship[3]]) {
        const normalized = entityName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!tableNames.has(normalized)) {
          throw new Error(`project knowledge secondary capability ER relationship must reference table inventory: ${scope}/${entityName}`);
        }
      }
      const relationshipLabel = relationship[4];
      if (!/[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*/.test(relationshipLabel)
        || !/\b(?:physical_fk|logical_relation|external_reference)\b/.test(relationshipLabel)) {
        throw new Error(`project knowledge secondary capability ER relationship missing join fields or relationship type: ${scope}`);
      }
      const sourceName = relationship[1].toLowerCase();
      const targetName = relationship[3].toLowerCase();
      const relationshipRow = relationshipSection
        .split(/\r?\n/)
        .filter((line) => /^\s*\|/.test(line))
        .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/`/g, '')))
        .find((cells) => cells.length >= 8
          && cells[0].toLowerCase() === sourceName
          && cells[2].toLowerCase() === targetName);
      if (!relationshipRow
        || !/[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*/.test(relationshipRow[3] ?? '')
        || !/^(?:\d+(?:\.\.(?:\d+|\*))?|[NM]):(?:\d+(?:\.\.(?:\d+|\*))?|[NM])$/i.test(relationshipRow[4] ?? '')
        || !/^(?:physical_fk|logical_relation|external_reference)$/.test(relationshipRow[5] ?? '')
        || (!exactCodeAnchors(relationshipRow.join(' | ')).length
          && !/(?:目标设计|missing_evidence|缺失证据)/.test(relationshipRow.join(' | ')))) {
        throw new Error(`project knowledge secondary capability relationship table missing fields, cardinality, type or evidence: ${scope}`);
      }
    }
  } else {
    if (tableNames.size !== 1 || relationships.length > 0) {
      throw new Error(`project knowledge secondary capability single_table model must contain exactly one table and no relationship: ${scope}`);
    }
    const [tableName] = tableNames;
    if (!new RegExp(`\\b${tableName.toUpperCase()}\\s*\\{`).test(erBlock.toUpperCase())) {
      throw new Error(`project knowledge secondary capability single_table ER must define the inventory table: ${scope}`);
    }
  }
  for (const requiredText of [
    '关联字段/业务键',
    '实体-表-代码映射',
    '表定义与字段结构',
    '索引与约束',
    '状态与字段映射',
    '读写路径与一致性',
    '数据迁移、兼容与回滚',
  ]) {
    if (!body.includes(requiredText)) {
      throw new Error(`project knowledge secondary capability persistence design missing ${requiredText}: ${scope}`);
    }
  }
}

async function projectKnowledgeSourceFiles(sourceRoot: string): Promise<ProjectKnowledgeSourceFile[]> {
  const inventoryPath = path.join(sourceRoot, 'business', 'inventory.yaml');
  if (!existsSync(inventoryPath)) {
    throw new Error('project knowledge document missing: business/inventory.yaml');
  }
  const inventory = parseSimpleYaml(await readFile(inventoryPath, 'utf8')) as {
    level1_capabilities?: Level1CapabilityInventoryItem[];
  };
  const level1Capabilities = Array.isArray(inventory.level1_capabilities)
    ? inventory.level1_capabilities
    : [];
  if (level1Capabilities.length === 0) {
    throw new Error('project knowledge inventory must contain at least one level1_capability_id');
  }
  const capabilityIdPattern = /^[a-z][a-z0-9_]*$/;
  const level1CapabilityIds = level1Capabilities.map((capability) => capability.level1_capability_id ?? '');
  if (level1CapabilityIds.some((capabilityId) => !capabilityIdPattern.test(capabilityId))) {
    throw new Error('project knowledge inventory contains an invalid level1_capability_id');
  }
  if (new Set(level1CapabilityIds).size !== level1CapabilityIds.length) {
    throw new Error('project knowledge inventory contains duplicate level1_capability_id values');
  }
  const businessArchitecturePath = path.join(sourceRoot, 'architecture', 'business.md');
  if (!existsSync(businessArchitecturePath)) {
    throw new Error('project knowledge document missing: architecture/business.md');
  }
  const businessArchitectureBody = await readFile(businessArchitecturePath, 'utf8');
  for (const capabilityId of level1CapabilityIds) {
    const overviewPath = `business/capabilities/${capabilityId}/detailed-design.md`;
    if (!businessArchitectureBody.includes(overviewPath)) {
      throw new Error(`project knowledge business architecture omits capability overview link: ${capabilityId}`);
    }
  }
  const assignedBusinessIds = new Set<string>();
  for (const capability of level1Capabilities) {
    const capabilityId = capability.level1_capability_id as string;
    const secondaryCapabilities = Array.isArray(capability.secondary_capabilities)
      ? capability.secondary_capabilities
      : [];
    if (secondaryCapabilities.length === 0) {
      throw new Error(`project knowledge level-1 capability has no secondary capabilities: ${capabilityId}`);
    }
    const secondaryIds = secondaryCapabilities.map((secondary) => secondary.secondary_capability_id ?? '');
    if (secondaryIds.some((secondaryId) => !capabilityIdPattern.test(secondaryId))) {
      throw new Error(`project knowledge inventory contains an invalid secondary_capability_id: ${capabilityId}`);
    }
    if (new Set(secondaryIds).size !== secondaryIds.length) {
      throw new Error(`project knowledge inventory contains duplicate secondary_capability_id values: ${capabilityId}`);
    }
    for (const secondary of secondaryCapabilities) {
      const businessIds = Array.isArray(secondary.business_ids) ? secondary.business_ids : [];
      if (businessIds.length === 0 || businessIds.some((businessId) => !capabilityIdPattern.test(businessId))) {
        throw new Error(`project knowledge secondary capability must contain valid business_ids: ${capabilityId}/${secondary.secondary_capability_id}`);
      }
      for (const businessId of businessIds) {
        if (assignedBusinessIds.has(businessId)) {
          throw new Error(`project knowledge business_id is assigned to multiple secondary capabilities: ${businessId}`);
        }
        assignedBusinessIds.add(businessId);
      }
    }
  }

  const capabilityDetailedDesigns = level1CapabilityIds.map((capabilityId) => ({
    source: `business/capabilities/${capabilityId}/detailed-design.md`,
    target: `documents/business/capabilities/${capabilityId}/detailed-design.md`,
    docType: 'business_capability_detailed_design',
    docId: `business_capability_detailed_design_${capabilityId}`,
    mediaType: 'text/markdown',
  }));
  for (const capability of level1Capabilities) {
    const capabilityId = capability.level1_capability_id as string;
    const capabilityDocument = capabilityDetailedDesigns.find(
      (document) => document.docId === `business_capability_detailed_design_${capabilityId}`,
    ) as ProjectKnowledgeSourceFile;
    const capabilityDocumentPath = path.join(sourceRoot, capabilityDocument.source);
    if (!existsSync(capabilityDocumentPath)) {
      throw new Error(`project knowledge level-1 capability detailed design missing: ${capabilityId}`);
    }
    const capabilityDocumentBody = await readFile(capabilityDocumentPath, 'utf8');
    for (const secondary of capability.secondary_capabilities as SecondaryCapabilityInventoryItem[]) {
      const secondaryId = secondary.secondary_capability_id as string;
      const escapedSecondaryId = secondaryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const secondaryIdPattern = new RegExp(`(^|[^a-z0-9_])${escapedSecondaryId}([^a-z0-9_]|$)`);
      if (!secondaryIdPattern.test(capabilityDocumentBody)) {
        throw new Error(
          `project knowledge level-1 capability detailed design omits secondary_capability_id: ${capabilityId}/${secondaryId}`,
        );
      }
      const childPath = `business/capabilities/${capabilityId}/secondary-capabilities/${secondaryId}/detailed-design.md`;
      const relativeChildPath = `secondary-capabilities/${secondaryId}/detailed-design.md`;
      if (!capabilityDocumentBody.includes(childPath) && !capabilityDocumentBody.includes(relativeChildPath)) {
        throw new Error(
          `project knowledge capability overview omits secondary capability link: ${capabilityId}/${secondaryId}`,
        );
      }
    }
  }

  const secondaryCapabilityDetailedDesigns: ProjectKnowledgeSourceFile[] = [];
  for (const capability of level1Capabilities) {
    const capabilityId = capability.level1_capability_id as string;
    for (const secondary of capability.secondary_capabilities as SecondaryCapabilityInventoryItem[]) {
      const secondaryId = secondary.secondary_capability_id as string;
      const relativePath = `business/capabilities/${capabilityId}/secondary-capabilities/${secondaryId}/detailed-design.md`;
      const absolutePath = path.join(sourceRoot, relativePath);
      if (!existsSync(absolutePath)) {
        throw new Error(`project knowledge secondary capability detailed design missing: ${capabilityId}/${secondaryId}`);
      }
      const body = await readFile(absolutePath, 'utf8');
      const escapedSecondaryId = secondaryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const secondaryIdPattern = new RegExp(`(^|[^a-z0-9_])${escapedSecondaryId}([^a-z0-9_]|$)`);
      if (!secondaryIdPattern.test(body)) {
        throw new Error(`project knowledge secondary capability detailed design has wrong identity: ${capabilityId}/${secondaryId}`);
      }
      assertSecondaryCapabilityDetailedDesign(body, capabilityId, secondaryId);
      secondaryCapabilityDetailedDesigns.push({
        source: relativePath,
        target: `documents/${relativePath}`,
        docType: 'secondary_capability_detailed_design',
        docId: `secondary_capability_detailed_design_${capabilityId}_${secondaryId}`,
        mediaType: 'text/markdown',
      });
    }
  }

  const requirementDetailedDesigns: ProjectKnowledgeSourceFile[] = [];
  for (const capabilityId of level1CapabilityIds) {
    const requirementsRoot = path.join(sourceRoot, 'business', 'capabilities', capabilityId, 'requirements');
    if (!existsSync(requirementsRoot)) continue;
    const requirementDirectories = (await readdir(requirementsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const requirementDirectory of requirementDirectories) {
      const requirementId = requirementDirectory.name;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(requirementId)) {
        throw new Error(`project knowledge requirement_id is invalid: ${capabilityId}/${requirementId}`);
      }
      const relativePath = `business/capabilities/${capabilityId}/requirements/${requirementId}/detailed-design.md`;
      if (!existsSync(path.join(sourceRoot, relativePath))) {
        throw new Error(`project knowledge requirement detailed design missing: ${capabilityId}/${requirementId}`);
      }
      requirementDetailedDesigns.push({
        source: relativePath,
        target: `documents/${relativePath}`,
        docType: 'requirement_detailed_design',
        docId: `requirement_detailed_design_${capabilityId}_${requirementId}`,
        mediaType: 'text/markdown',
      });
    }
  }

  return [
    {
      source: 'metadata.yaml',
      target: 'documents/metadata.yaml',
      docType: 'project_knowledge_metadata',
      mediaType: 'application/yaml',
    },
    {
      source: 'architecture/technical.md',
      target: 'documents/architecture/technical.md',
      docType: 'project_technical_architecture',
      mediaType: 'text/markdown',
    },
    {
      source: 'architecture/business.md',
      target: 'documents/architecture/business.md',
      docType: 'project_business_architecture',
      mediaType: 'text/markdown',
    },
    {
      source: 'business/inventory.yaml',
      target: 'documents/business/inventory.yaml',
      docType: 'business_inventory',
      mediaType: 'application/yaml',
    },
    ...capabilityDetailedDesigns,
    ...secondaryCapabilityDetailedDesigns,
    ...requirementDetailedDesigns,
    {
      source: 'gaps/doc-gap-report.md',
      target: 'documents/gaps/doc-gap-report.md',
      docType: 'doc_gap_report',
      mediaType: 'text/markdown',
    },
  ];
}

async function projectKnowledgeArchiveSourceFiles(
  repo: string,
  config: EffectiveAxisConfig,
): Promise<ProjectKnowledgeSourceFile[]> {
  if (!config.organization?.id) return [];
  const archiveRoot = path.join(
    repo,
    '.axis',
    'docs',
    '_archive',
    'orgs',
    config.organization.id,
    'projects',
    config.project.slug,
  );
  if (!existsSync(archiveRoot)) return [];
  const supportedExtensions = new Set(['.md', '.markdown', '.yaml', '.yml', '.json', '.txt', '.html', '.csv']);
  const archiveMediaType = (filePath: string): string => {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.md' || extension === '.markdown') return 'text/markdown';
    if (extension === '.yaml' || extension === '.yml') return 'application/yaml';
    if (extension === '.json') return 'application/json';
    if (extension === '.html') return 'text/html';
    if (extension === '.csv') return 'text/csv';
    return 'text/plain';
  };
  const files: ProjectKnowledgeSourceFile[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const relativePath = path.relative(archiveRoot, absolutePath).split(path.sep).join('/');
      files.push({
        source: relativePath,
        sourceRoot: archiveRoot,
        target: `documents/_archive/${relativePath}`,
        docType: entry.name === 'metadata.json' ? 'document_archive_metadata' : 'document_archive',
        docId: `document_archive_${createHash('sha256').update(relativePath).digest('hex').slice(0, 16)}`,
        mediaType: archiveMediaType(relativePath),
      });
    }
  };
  await visit(archiveRoot);
  return files;
}

async function assertPublicSafeProjectKnowledgeSources(
  sourceRoot: string,
  sourceFiles: ProjectKnowledgeSourceFile[],
): Promise<void> {
  for (const sourceFile of sourceFiles) {
    const sourcePath = path.join(sourceFile.sourceRoot ?? sourceRoot, sourceFile.source);
    if (!existsSync(sourcePath)) {
      throw new Error(`project knowledge document missing: ${sourceFile.source}`);
    }
    const scan = redactSensitiveText(await readFile(sourcePath, 'utf8'));
    if (scan.redactions > 0) {
      throw new Error(`project knowledge document contains credential-like content: ${sourceFile.source}`);
    }
  }
}

async function projectKnowledgeCaptureCommand(): Promise<void> {
  const repo = repoArg();
  const rawConfig = await readAxisConfig(repo);
  const { errors, effectiveConfig: config } = await resolveAxisConfig(repo, rawConfig);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  if (!config) throw new Error('Unable to resolve Axis config');
  if (config.contract_version !== '0.2') {
    throw new Error('project-knowledge-capture requires contract_version: "0.2"');
  }

  const language = getArg('--language') ?? 'zh-CN';
  if (language !== 'zh-CN') {
    throw new Error('--language currently supports only zh-CN');
  }
  const runId = buildRunId('project_knowledge_snapshot');
  const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const sourceRoot = projectKnowledgeSourceRoot(repo, config);
  const sourceFiles = [
    ...await projectKnowledgeSourceFiles(sourceRoot),
    ...await projectKnowledgeArchiveSourceFiles(repo, config),
  ];
  await assertPublicSafeProjectKnowledgeSources(sourceRoot, sourceFiles);

  const packageDir = packageDirFor(repo, config, runId);
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });
  for (const sourceFile of sourceFiles) {
    const targetPath = path.join(packageDir, sourceFile.target);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(path.join(sourceFile.sourceRoot ?? sourceRoot, sourceFile.source), targetPath);
  }

  const organization = organizationSnapshot(config);
  const project = projectSnapshot(config);
  const ossProfile = ossProfileSnapshot(config);
  const git = await gitInfo(repo);
  const publicSafetyValidation = {
    status: 'passed',
    validators: [...publicSafetyValidators, 'project_knowledge_source_scan'],
    findings_count: 0,
    validated_at: createdAt,
    validated_by: { role: 'producing_skill' },
  };
  const documentRefs = await Promise.all(sourceFiles.map(async (sourceFile) => {
    const entry = await fileEntry(packageDir, 'document', sourceFile.target, sourceFile.mediaType);
    return {
      doc_id: sourceFile.docId ?? sourceFile.docType,
      doc_type: sourceFile.docType,
      status: 'review',
      revision: 1,
      source_path: sourceFile.target,
      content_sha256: entry.sha256,
    };
  }));
  const metadata = {
    schema: 'axis.package.metadata',
    schema_version: config.contract_version,
    title: `${config.project.display_name} 项目知识快照`,
    summary: '项目知识启动文档的可发布快照。',
    tags: ['project-knowledge', language.toLowerCase()],
    organization,
    project,
    source_evidence: {
      repo_ref: path.basename(repo),
      commit: git.commit,
      run_id: runId,
    },
    index_refs: {
      organization_index: `${normalizeOssPrefix(config.oss.prefix)}/orgs/${organization?.id}/index/projects.jsonl`,
      project_document_path: projectDocumentsOssPath(config),
    },
    artifact: {
      type: 'project_knowledge_snapshot',
      status: 'passed',
      started_at: createdAt,
      finished_at: createdAt,
    },
    skill: {
      name: skillNames.projectKnowledge,
      responsibility: 'Package the reviewed project knowledge source documents for explicit OSS publishing.',
    },
    public_safety: {
      reviewed: true,
      contains_credentials: false,
      contains_private_urls: false,
      validation: publicSafetyValidation,
      redaction_notes: 'Credential-like content is rejected before the snapshot is created.',
    },
    document: {
      doc_id: `project_knowledge_snapshot_${runId.replace(/[^A-Za-z0-9]+/g, '_')}`,
      doc_type: 'project_knowledge_snapshot',
      status: 'review',
      revision: 1,
      language,
      source_root: relativeToRepo(repo, sourceRoot),
      documents: documentRefs,
    },
  };
  await writeJsonFile(path.join(packageDir, 'metadata.json'), metadata);

  const documentEntries = await Promise.all(sourceFiles.map((sourceFile) => (
    fileEntry(packageDir, 'document', sourceFile.target, sourceFile.mediaType)
  )));
  const manifest = {
    schema: 'axis.package.manifest',
    schema_version: config.contract_version,
    package_id: packageIdFor(config, runId),
    created_at: createdAt,
    organization,
    project,
    oss_profile: ossProfile,
    producer: { skill: skillNames.projectKnowledge, agent: 'codex' },
    run: { run_id: runId, git },
    release: config.release,
    files: [
      await fileEntry(packageDir, 'metadata', 'metadata.json', 'application/json'),
      ...documentEntries,
      {
        kind: 'manifest' as const,
        path: 'manifest.json',
        media_type: 'application/json',
        sha256: '0'.repeat(64),
        bytes: 0,
      },
    ],
    publish: {
      provider: 'aliyun-oss',
      status: 'local_ready' as const,
      bucket: config.oss.bucket,
      prefix: config.oss.prefix,
      base_uri: projectDocumentsBaseUri(config),
    },
    protocols: protocolVersions,
    document_refs: documentRefs,
    skill_refs: [{
      skill_id: skillNames.projectKnowledge,
      canonical_family: 'project_knowledge',
      status: 'active',
    }],
    tool_refs: [],
    public_safety_validation: publicSafetyValidation,
  };
  const manifestPath = path.join(packageDir, 'manifest.json');
  await writeJsonFile(manifestPath, manifest);
  manifest.files[manifest.files.length - 1] = await fileEntry(packageDir, 'manifest', 'manifest.json', 'application/json');
  await writeJsonFile(manifestPath, manifest);

  console.log(JSON.stringify({
    ok: true,
    asset_type: 'project_knowledge_snapshot',
    package_dir: relativeToRepo(repo, packageDir),
    files: manifest.files.map((file) => file.path),
  }, null, 2));
}

async function gitValue(repo: string, args: string[], fallback: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: repo });
    return stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function gitInfo(repo: string): Promise<{ branch: string; commit: string; dirty: boolean }> {
  const branch = await gitValue(repo, ['branch', '--show-current'], 'unknown');
  const commit = await gitValue(repo, ['rev-parse', 'HEAD'], 'unknown');
  const statusText = await gitValue(repo, ['status', '--short'], '');
  return {
    branch,
    commit: /^[a-f0-9]{40}$/.test(commit) ? commit : 'unknown',
    dirty: statusText.length > 0,
  };
}

function packageDirFor(repo: string, config: EffectiveAxisConfig, runId: string): string {
  const organizationId = config.organization?.id;
  if (!organizationId) throw new Error('organization.id is required for v0.2 package path');
  return path.join(repo, config.package.outbox_dir, 'v0.2', organizationId, config.project.slug, runId);
}

function packageIdFor(config: EffectiveAxisConfig, runId: string): string {
  return `${config.organization?.id}__${config.project.slug}__${runId}`;
}

function ossPackagePath(config: EffectiveAxisConfig, runId: string): string {
  if (config.contract_version === '0.2') {
    if (!config.organization?.id) throw new Error('organization.id is required for v0.2 OSS package path');
    return `${normalizeOssPrefix(config.oss.prefix)}/orgs/${config.organization.id}/projects/${config.project.slug}/packages/${runId}/`;
  }
  return `${normalizeOssPrefix(config.oss.prefix)}/${config.project.slug}/${runId}/`;
}

function projectDocumentsOssPath(config: EffectiveAxisConfig): string {
  if (config.contract_version !== '0.2' || !config.organization?.id) {
    throw new Error('project document sync requires contract_version "0.2" and organization.id');
  }
  return `${normalizeOssPrefix(config.oss.prefix)}/orgs/${config.organization.id}/projects/${config.project.slug}/`;
}

function projectDocumentArchivesOssPath(config: EffectiveAxisConfig): string {
  if (config.contract_version !== '0.2' || !config.organization?.id) {
    throw new Error('project document archive sync requires contract_version "0.2" and organization.id');
  }
  return `${normalizeOssPrefix(config.oss.prefix)}/_archive/orgs/${config.organization.id}/projects/${config.project.slug}/`;
}

function baseUriFor(config: EffectiveAxisConfig, runId: string): string {
  return `oss://${config.oss.bucket}/${ossPackagePath(config, runId)}`;
}

function projectDocumentsBaseUri(config: EffectiveAxisConfig): string {
  return `oss://${config.oss.bucket}/${projectDocumentsOssPath(config)}`;
}

function organizationSnapshot(config: EffectiveAxisConfig): OrganizationSnapshot | undefined {
  if (config.contract_version !== '0.2') return undefined;
  if (!config.organization) throw new Error('organization.id is required for v0.2 package snapshot');
  return config.organization;
}

function projectSnapshot(config: EffectiveAxisConfig): { slug: string; display_name: string } {
  return {
    slug: config.project.slug,
    display_name: config.project.display_name,
  };
}

function ossProfileSnapshot(config: EffectiveAxisConfig): { name: string; provider: string; bucket: string; prefix: string } {
  return {
    name: config.oss.profile as string,
    provider: config.oss.provider,
    bucket: config.oss.bucket,
    prefix: config.oss.prefix,
  };
}

async function fileEntry(packageDir: string, kind: FileEntry['kind'], fileName: string, mediaType: string): Promise<FileEntry> {
  const filePath = path.join(packageDir, fileName);
  const content = await readFile(filePath);
  const stats = await stat(filePath);
  return {
    kind,
    path: fileName,
    media_type: mediaType,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: stats.size,
  };
}

function skillNameForAsset(assetType: AssetType): string {
  return assetType === 'test_report' ? skillNames.testReport : skillNames.codingCapture;
}

function skillResponsibilityForAsset(assetType: AssetType): string {
  if (assetType === 'test_report') {
    return 'Run configured validation commands and write a public-safe report.';
  }
  return 'Convert coding work into a public-safe local package.';
}

function documentTypeForAsset(assetType: AssetType): 'execution_report' | 'test_report' {
  return assetType === 'test_report' ? 'test_report' : 'execution_report';
}

function canonicalFamilyForAsset(assetType: AssetType): string {
  return assetType === 'test_report' ? 'test_verify_benchmark' : 'fix_optimize';
}

function protocolDocId(runId: string): string {
  return `report_${runId.replace(/[^A-Za-z0-9]+/g, '_')}`;
}

function workflowStatusForArtifact(status: ArtifactStatus): 'blocked' | 'completed' {
  return status === 'failed' || status === 'partial' ? 'blocked' : 'completed';
}

async function writePackageCommand(assetType: AssetType): Promise<void> {
  const repo = repoArg();
  const rawConfig = await readAxisConfig(repo);
  const { errors, effectiveConfig: config } = await resolveAxisConfig(repo, rawConfig);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  if (!config) throw new Error('Unable to resolve Axis config');
  const slug = config.project.slug;
  const displayName = config.project.display_name;
  const releaseChannel = config.release.channel;
  const releaseGate = config.release.gate;
  const title = requireArg('--title');
  const summary = requireArg('--summary');
  if (summary.length > 500) {
    throw new Error('--summary must be 500 characters or less');
  }
  const artifactStatus = parseArtifactStatus();
  const tags = getArgs('--tag').map((tag) => tag.toLowerCase());
  const report = await readTextArg('--report', '--report-file');
  const experience = await readTextArg('--experience', '--experience-file', defaultExperience(title));
  const runId = buildRunId(assetType);
  const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const packageDir = packageDirFor(repo, config, runId);
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });

  await writeFile(path.join(packageDir, 'report.md'), report.endsWith('\n') ? report : `${report}\n`, 'utf8');
  await writeFile(path.join(packageDir, 'experience.md'), experience.endsWith('\n') ? experience : `${experience}\n`, 'utf8');

  const reportEntry = await fileEntry(packageDir, 'report', 'report.md', 'text/markdown');
  const experienceEntry = await fileEntry(packageDir, 'experience', 'experience.md', 'text/markdown');
  const docId = protocolDocId(runId);
  const documentType = documentTypeForAsset(assetType);
  const workflowStatus = workflowStatusForArtifact(artifactStatus);
  const git = await gitInfo(repo);
  const organization = organizationSnapshot(config);
  const project = projectSnapshot(config);
  const ossProfile = ossProfileSnapshot(config);
  const publicSafetyValidation = {
    status: 'passed',
    validators: [...publicSafetyValidators],
    findings_count: 0,
    validated_at: createdAt,
    validated_by: {
      role: 'producing_skill',
    },
  };
  const metadata = {
    schema: 'axis.package.metadata',
    schema_version: config.contract_version,
    title,
    summary,
    tags,
    ...(organization ? { organization } : {}),
    ...(config.contract_version === '0.2' ? {
      project,
      source_evidence: {
        repo_ref: path.basename(repo),
        commit: git.commit,
        run_id: runId,
      },
      index_refs: {
        organization_index: `${normalizeOssPrefix(config.oss.prefix)}/orgs/${organization?.id}/index/projects.jsonl`,
        project_package_path: ossPackagePath(config, runId).replace(/\/$/, '/'),
      },
    } : {}),
    artifact: {
      type: assetType,
      status: artifactStatus,
      started_at: createdAt,
      finished_at: createdAt,
    },
    skill: {
      name: skillNameForAsset(assetType),
      responsibility: skillResponsibilityForAsset(assetType),
    },
    public_safety: {
      reviewed: true,
      contains_credentials: false,
      contains_private_urls: false,
      validation: publicSafetyValidation,
      redaction_notes: 'No credentials, private URLs, or customer-specific identifiers were included.',
    },
    document: {
      doc_id: docId,
      doc_type: documentType,
      status: 'completed',
      revision: 1,
      storage: {
        path: 'report.md',
        content_sha256: reportEntry.sha256,
      },
    },
    workflow: {
      workflow_run_id: null,
      workflow_step: null,
      status: workflowStatus,
      blocked_reason: workflowStatus === 'blocked' ? 'partial_execution' : null,
      checkpoint_ref: docId,
    },
    experience: {
      scope: 'task',
      related_skill: skillNameForAsset(assetType),
      candidate_path: 'experience.md',
      confidence: 'medium',
      quality: {
        evidence_count: 1,
        novelty: 'unknown',
      },
    },
    agent_execution: {
      pack_id: null,
      run_id: runId,
      expected_outputs: {
        execution_report: {
          doc_type: documentType,
          required: true,
        },
        experience_candidates: {
          doc_type: 'experience_card',
          required: assetType === 'coding_capture',
        },
      },
    },
    links: {
      manifest_path: 'manifest.json',
      report_path: 'report.md',
      experience_path: 'experience.md',
    },
  };
  await writeFile(path.join(packageDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  const manifest = {
    schema: 'axis.package.manifest',
    schema_version: config.contract_version,
    package_id: packageIdFor(config, runId),
    created_at: createdAt,
    organization,
    project,
    oss_profile: ossProfile,
    producer: {
      skill: skillNameForAsset(assetType),
      agent: 'codex',
    },
    run: {
      run_id: runId,
      git,
    },
    release: {
      channel: releaseChannel,
      gate: releaseGate,
    },
    files: [
      await fileEntry(packageDir, 'metadata', 'metadata.json', 'application/json'),
      reportEntry,
      experienceEntry,
      {
        kind: 'manifest',
        path: 'manifest.json',
        media_type: 'application/json',
        sha256: '0'.repeat(64),
        bytes: 0,
      },
    ],
    publish: {
      provider: 'aliyun-oss',
      status: 'local_ready',
      bucket: config.oss.bucket,
      prefix: config.oss.prefix,
      base_uri: baseUriFor(config, runId),
    },
    protocols: protocolVersions,
    document_refs: [
      {
        doc_id: docId,
        doc_type: documentType,
        status: 'completed',
        revision: 1,
        source_path: 'report.md',
        content_sha256: reportEntry.sha256,
      },
    ],
    skill_refs: [
      {
        skill_id: skillNameForAsset(assetType),
        canonical_family: canonicalFamilyForAsset(assetType),
        status: 'active',
      },
    ],
    tool_refs: [],
    execution: {
      pack_id: null,
      report_doc_id: docId,
      retry_of_run_id: null,
      resume_from_report_id: null,
    },
    experience_refs: [],
    workflow_recovery: {
      workflow_run_id: null,
      status: workflowStatus,
      blocked_reason: workflowStatus === 'blocked' ? 'partial_execution' : null,
      checkpoint_ref: docId,
    },
    public_safety_validation: publicSafetyValidation,
  };
  const manifestPath = path.join(packageDir, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  manifest.files[3] = await fileEntry(packageDir, 'manifest', 'manifest.json', 'application/json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    asset_type: assetType,
    package_dir: relativeToRepo(repo, packageDir),
    files: manifest.files.map((file) => file.path),
  }, null, 2));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readOptionalLocalConfig(repo: string): Promise<AxisConfig | null> {
  const configPath = path.join(repo, '.axis', 'config.local.yml');
  if (!existsSync(configPath)) return null;
  return parseSimpleYaml(await readFile(configPath, 'utf8'));
}

async function readPublishConfig(repo: string): Promise<{
  config: AxisConfig;
  localDryRun: boolean;
  localOssEnvOverrides?: AxisConfig['oss'];
}> {
  const config = await readAxisConfig(repo);
  const localConfig = await readOptionalLocalConfig(repo);
  if (!localConfig) return { config, localDryRun: false };
  if (localConfig.contract_version && localConfig.contract_version !== config.contract_version) {
    throw new Error('contract_version in .axis/config.local.yml must match .axis/config.yml');
  }
  const localOssEnvOverrides: AxisConfig['oss'] = {};
  for (const field of requiredEnvFields) {
    if (localConfig.oss?.[field]) localOssEnvOverrides[field] = localConfig.oss[field];
  }
  if (localConfig.oss?.security_token_env) {
    localOssEnvOverrides.security_token_env = localConfig.oss.security_token_env;
  }
  const hasLocalOssEnvOverrides = Object.keys(localOssEnvOverrides).length > 0;
  return {
    config: {
      ...config,
      package: {
        ...config.package,
        outbox_dir: localConfig.local?.outbox_dir ?? config.package?.outbox_dir,
      },
      oss: config.oss,
    },
    localDryRun: localConfig.local?.dry_run === true,
    localOssEnvOverrides: hasLocalOssEnvOverrides ? localOssEnvOverrides : undefined,
  };
}

function assertReleaseChannel(value: unknown, source: string): asserts value is ReleaseChannel {
  if (value !== 'private_beta' && value !== 'public') {
    throw new Error(`${source} must be private_beta or public`);
  }
}

function assertReleaseGate(value: unknown, source: string): asserts value is ReleaseGate {
  if (value !== 'not_requested' && value !== 'pending' && value !== 'passed' && value !== 'failed') {
    throw new Error(`${source} must be not_requested, pending, passed, or failed`);
  }
}

function assertPublishStatus(value: unknown): asserts value is PublishStatus {
  if (value !== 'local_ready' && value !== 'uploading' && value !== 'published' && value !== 'failed') {
    throw new Error('manifest.publish.status must be local_ready, uploading, published, or failed');
  }
}

function normalizeOssPrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '');
}

function objectKeyForConfig(config: EffectiveAxisConfig, runId: string, relativePath: string): string {
  if (config.contract_version === '0.2') {
    return `${ossPackagePath(config, runId)}${relativePath}`;
  }
  return `${normalizeOssPrefix(config.oss.prefix)}/${config.project.slug}/${runId}/${relativePath}`;
}

function projectKnowledgeSyncedRelativePath(packagePath: string): string {
  if (packagePath.startsWith('documents/')) return packagePath.slice('documents/'.length);
  if (packagePath === 'metadata.json') return '_sync/metadata.json';
  if (packagePath === 'manifest.json') return '_sync/manifest.json';
  throw new Error(`unsupported project knowledge sync path: ${packagePath}`);
}

function objectKeyForPublish(
  config: EffectiveAxisConfig,
  runId: string,
  relativePath: string,
  assetType: string | undefined,
): string {
  if (assetType === 'project_knowledge_snapshot') {
    if (relativePath.startsWith('documents/_archive/')) {
      return `${projectDocumentArchivesOssPath(config)}${relativePath.slice('documents/_archive/'.length)}`;
    }
    return `${projectDocumentsOssPath(config)}${projectKnowledgeSyncedRelativePath(relativePath)}`;
  }
  return objectKeyForConfig(config, runId, relativePath);
}

function ossUri(bucket: string, objectKey: string): string {
  return `oss://${bucket}/${objectKey}`;
}

function redactSensitiveText(text: string): { text: string; redactions: number } {
  let redactions = 0;
  const replaceAll = (pattern: RegExp, replacement: string): void => {
    text = text.replace(pattern, () => {
      redactions += 1;
      return replacement;
    });
  };
  const redactAfterPrefix = (pattern: RegExp): void => {
    text = text.replace(pattern, (_match: string, prefix: string) => {
      redactions += 1;
      return `${prefix}[REDACTED]`;
    });
  };

  redactAfterPrefix(/(ALIYUN_OSS_ACCESS_KEY_SECRET\s*=\s*)[^\s`'"]+/gi);
  redactAfterPrefix(/(ALIYUN_OSS_ACCESS_KEY_ID\s*=\s*)[^\s`'"]+/gi);
  redactAfterPrefix(/\b(access[_-]?key[_-]?secret\s*[:=]\s*)[^\s`'"]+/gi);
  redactAfterPrefix(/\b(secret[_-]?access[_-]?key\s*[:=]\s*)[^\s`'"]+/gi);
  redactAfterPrefix(/(authorization:\s*bearer\s+)[A-Za-z0-9._~+/=-]+/gi);
  replaceAll(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]');
  replaceAll(/\b(?:AKIA|LTAI)[A-Za-z0-9]{8,}\b/g, '[REDACTED]');
  replaceAll(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');

  return { text, redactions };
}

function unsafePathReason(relativePath: string): string | null {
  if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    return relativePath || '(empty)';
  }
  const segments = relativePath.split('/');
  const unsafeDirs = new Set([
    '.git',
    '.hg',
    '.svn',
    '.cache',
    '.next',
    '.nuxt',
    '.turbo',
    '.vite',
    '.parcel-cache',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    'node_modules',
    'coverage',
    'dist',
    'build',
    'out',
    'target',
  ]);
  for (const segment of segments.slice(0, -1)) {
    if (unsafeDirs.has(segment)) return relativePath;
  }
  const fileName = segments[segments.length - 1];
  if (/^\.env(?:\.|$)/i.test(fileName)) return relativePath;
  if (/^(?:\.npmrc|\.pypirc|\.netrc|\.dockerconfigjson)$/i.test(fileName)) return relativePath;
  if (/\.(?:pem|key|p12|pfx|crt|cer)$/i.test(fileName)) return relativePath;
  if (/(^|[._-])(?:cookie|cookies|token|tokens|secret|secrets|credential|credentials)([._-]|$)/i.test(fileName)) {
    return relativePath;
  }
  return null;
}

async function collectPackageRelativePaths(packageDir: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      const relativePath = toPosix(path.relative(packageDir, child));
      const unsafe = unsafePathReason(relativePath);
      if (unsafe) throw new Error(`refusing unsafe package path: ${unsafe}`);
      if (entry.isSymbolicLink()) {
        throw new Error(`refusing symlink in package path: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  await visit(packageDir);
  return files.sort();
}

async function fileEntryFromRelative(packageDir: string, existing: ManifestFileEntry): Promise<ManifestFileEntry> {
  const absolutePath = path.join(packageDir, existing.path);
  const content = await readFile(absolutePath);
  const stats = await stat(absolutePath);
  return {
    ...existing,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: stats.size,
  };
}

async function refreshManifestFileEntries(packageDir: string, manifest: PackageManifest): Promise<void> {
  if (!manifest.files) return;
  const refreshed: ManifestFileEntry[] = [];
  for (const entry of manifest.files) {
    if (entry.path === 'manifest.json') {
      refreshed.push(entry);
    } else {
      refreshed.push(await fileEntryFromRelative(packageDir, entry));
    }
  }
  manifest.files = refreshed;
}

async function persistManifest(packageDir: string, manifest: PackageManifest, status?: PublishStatus): Promise<void> {
  if (!manifest.publish) manifest.publish = {};
  if (status) manifest.publish.status = status;
  await refreshManifestFileEntries(packageDir, manifest);
  await writeJsonFile(path.join(packageDir, 'manifest.json'), manifest);
}

function sortedCopy(values: string[]): string[] {
  return [...values].sort();
}

function assertSameStringSet(actual: string[], expected: string[], message: string): void {
  const actualSorted = sortedCopy(actual);
  const expectedSorted = sortedCopy(expected);
  if (actualSorted.length !== expectedSorted.length || actualSorted.some((value, index) => value !== expectedSorted[index])) {
    throw new Error(`${message}: expected ${expectedSorted.join(', ')}; got ${actualSorted.join(', ')}`);
  }
}

async function validatePackageManifest(
  repo: string,
  packageDir: string,
  runId: string,
  config: EffectiveAxisConfig,
  localFiles: string[],
): Promise<{ manifest: PackageManifest; metadata: PackageMetadata }> {
  const manifestPath = path.join(packageDir, 'manifest.json');
  const metadataPath = path.join(packageDir, 'metadata.json');
  if (!existsSync(manifestPath)) throw new Error('manifest.json is required');
  if (!existsSync(metadataPath)) throw new Error('metadata.json is required');

  const manifest = await readJsonFile<PackageManifest>(manifestPath);
  const metadata = await readJsonFile<PackageMetadata>(metadataPath);
  if (manifest.schema !== 'axis.package.manifest') throw new Error('manifest.schema must be axis.package.manifest');
  if (manifest.schema_version !== config.contract_version) {
    throw new Error(`manifest.schema_version must be "${config.contract_version}"`);
  }
  if (manifest.project?.slug !== config.project.slug) throw new Error('manifest.project.slug must match .axis/config.yml');
  if (manifest.project?.display_name !== config.project.display_name) {
    throw new Error('manifest.project.display_name must match .axis/config.yml');
  }
  if (manifest.run?.run_id !== runId) throw new Error('manifest.run.run_id must match --run-id');
  if (manifest.package_id !== packageIdFor(config, runId)) throw new Error('manifest.package_id does not match resolved config and run id');

  if (config.contract_version === '0.2') {
    const expectedOrganization = organizationSnapshot(config);
    const expectedOssProfile = ossProfileSnapshot(config);
    if (
      manifest.organization?.id !== expectedOrganization?.id
      || manifest.organization?.slug !== expectedOrganization?.slug
      || manifest.organization?.display_name !== expectedOrganization?.display_name
      || metadata.organization?.id !== expectedOrganization?.id
      || metadata.organization?.slug !== expectedOrganization?.slug
      || metadata.organization?.display_name !== expectedOrganization?.display_name
      || metadata.project?.slug !== config.project.slug
      || metadata.project?.display_name !== config.project.display_name
      || manifest.oss_profile?.name !== expectedOssProfile?.name
      || manifest.oss_profile?.provider !== expectedOssProfile?.provider
      || manifest.oss_profile?.bucket !== expectedOssProfile?.bucket
      || manifest.oss_profile?.prefix !== expectedOssProfile?.prefix
    ) {
      throw new Error('manifest organization/project/oss snapshot does not match resolved config');
    }
    const isProjectKnowledgeSync = metadata.artifact?.type === 'project_knowledge_snapshot';
    const expectedOrganizationIndex = `${normalizeOssPrefix(config.oss.prefix)}/orgs/${expectedOrganization?.id}/index/projects.jsonl`;
    if (metadata.source_evidence?.run_id !== runId) {
      throw new Error('metadata.source_evidence.run_id must match --run-id');
    }
    if (metadata.index_refs?.organization_index !== expectedOrganizationIndex) {
      throw new Error('metadata.index_refs.organization_index must match resolved OSS target');
    }
    if (isProjectKnowledgeSync) {
      if (metadata.index_refs?.project_document_path !== projectDocumentsOssPath(config)) {
        throw new Error('metadata.index_refs.project_document_path must match resolved OSS target');
      }
    } else if (metadata.index_refs?.project_package_path !== ossPackagePath(config, runId)) {
      throw new Error('metadata.index_refs.project_package_path must match resolved OSS target');
    }
  }

  assertReleaseChannel(manifest.release?.channel, 'manifest.release.channel');
  assertReleaseGate(manifest.release?.gate, 'manifest.release.gate');
  if (manifest.release.channel === 'public' && manifest.release.gate !== 'passed') {
    throw new Error('public release requires release.gate: passed');
  }
  if (manifest.release.channel !== config.release.channel) throw new Error('manifest.release.channel must match .axis/config.yml');
  if (manifest.release.gate !== config.release.gate) throw new Error('manifest.release.gate must match .axis/config.yml');

  if (manifest.publish?.provider !== 'aliyun-oss') throw new Error('manifest.publish.provider must be aliyun-oss');
  assertPublishStatus(manifest.publish?.status);
  if (manifest.publish.bucket !== config.oss.bucket) throw new Error('manifest.publish.bucket must match resolved config');
  if (manifest.publish.prefix !== config.oss.prefix) throw new Error('manifest.publish.prefix must match resolved config');
  const expectedBaseUri = metadata.artifact?.type === 'project_knowledge_snapshot'
    ? projectDocumentsBaseUri(config)
    : baseUriFor(config, runId);
  if (manifest.publish.base_uri !== expectedBaseUri) throw new Error('manifest.publish.base_uri does not match configured OSS target');

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('manifest.files is required');
  const manifestPaths = manifest.files.map((file) => file.path);
  for (const filePath of manifestPaths) {
    const unsafe = unsafePathReason(filePath);
    if (unsafe) throw new Error(`refusing unsafe package path: ${unsafe}`);
    if (filePath.startsWith('../') || path.isAbsolute(filePath)) {
      throw new Error(`manifest file path must be relative: ${filePath}`);
    }
  }
  assertSameStringSet(localFiles, manifestPaths, 'manifest.files must match package directory files');

  for (const entry of manifest.files) {
    const absolutePath = path.join(packageDir, entry.path);
    if (!existsSync(absolutePath)) throw new Error(`manifest file missing: ${entry.path}`);
    if (entry.path === 'manifest.json') continue;
    const actual = await fileEntryFromRelative(packageDir, entry);
    if (actual.sha256 !== entry.sha256) throw new Error(`manifest checksum mismatch: ${entry.path}`);
    if (actual.bytes !== entry.bytes) throw new Error(`manifest byte count mismatch: ${entry.path}`);
  }

  if (metadata.public_safety?.reviewed !== true) throw new Error('metadata.public_safety.reviewed must be true');
  if (metadata.public_safety.contains_credentials !== false) {
    throw new Error('metadata.public_safety.contains_credentials must be false');
  }
  if (metadata.public_safety.contains_private_urls !== false) {
    throw new Error('metadata.public_safety.contains_private_urls must be false');
  }
  if (metadata.public_safety.validation?.status !== 'passed') {
    throw new Error('metadata.public_safety.validation.status must be passed');
  }
  if (manifest.public_safety_validation?.status !== 'passed') {
    throw new Error('manifest.public_safety_validation.status must be passed');
  }

  return { manifest, metadata };
}

async function redactMarkdownFiles(
  packageDir: string,
  manifest: PackageManifest,
  mutate: boolean,
): Promise<number> {
  let redactions = 0;
  for (const entry of manifest.files ?? []) {
    if (!entry.path.endsWith('.md')) continue;
    const absolutePath = path.join(packageDir, entry.path);
    const original = await readFile(absolutePath, 'utf8');
    const redacted = redactSensitiveText(original);
    redactions += redacted.redactions;
    if (mutate && redacted.text !== original) {
      await writeFile(absolutePath, redacted.text, 'utf8');
    }
  }
  if (mutate && redactions > 0) {
    await persistManifest(packageDir, manifest, 'local_ready');
  }
  return redactions;
}

function readOssCredentials(config: EffectiveAxisConfig): OssCredentials {
  const envMap = {
    endpoint: config.oss.endpoint_env,
    region: config.oss.region_env,
    accessKeyId: config.oss.access_key_id_env,
    accessKeySecret: config.oss.access_key_secret_env,
    securityToken: config.oss.security_token_env,
  };
  const missing: string[] = [];
  const readEnv = (name: string | undefined, required: boolean): string | undefined => {
    if (!name) {
      if (required) missing.push('(unconfigured)');
      return undefined;
    }
    const value = process.env[name];
    if (!value && required) missing.push(name);
    return value;
  };
  const credentials = {
    endpoint: readEnv(envMap.endpoint, true),
    region: readEnv(envMap.region, true),
    accessKeyId: readEnv(envMap.accessKeyId, true),
    accessKeySecret: readEnv(envMap.accessKeySecret, true),
    securityToken: readEnv(envMap.securityToken, false),
  };
  if (missing.length > 0) {
    throw new Error(`missing required OSS environment variables: ${missing.join(', ')}`);
  }
  return credentials as OssCredentials;
}

class LocalMockOssStorage implements OssStorageAdapter {
  constructor(private readonly root: string, private readonly bucket: string) {}

  private objectPath(key: string): string {
    return path.join(this.root, this.bucket, ...key.split('/'));
  }

  async headObject(key: string): Promise<{ sha256: string | null } | null> {
    const objectPath = this.objectPath(key);
    if (!existsSync(objectPath)) return null;
    const sidecarPath = `${objectPath}.sha256`;
    if (existsSync(sidecarPath)) {
      return { sha256: (await readFile(sidecarPath, 'utf8')).trim() || null };
    }
    return {
      sha256: createHash('sha256').update(await readFile(objectPath)).digest('hex'),
    };
  }

  async putObject(key: string, filePath: string, metadata: { sha256: string }): Promise<void> {
    const objectPath = this.objectPath(key);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, await readFile(filePath));
    await writeFile(`${objectPath}.sha256`, `${metadata.sha256}\n`, 'utf8');
  }
}

class AliyunOssStorage implements OssStorageAdapter {
  private readonly client: {
    head(name: string): Promise<{ meta?: Record<string, string> | null }>;
    put(name: string, file: string, options?: { meta?: Record<string, string> }): Promise<unknown>;
  };

  constructor(config: EffectiveAxisConfig, credentials: OssCredentials) {
    const require = createRequire(import.meta.url);
    const OSS = require('ali-oss') as new (options: Record<string, string | undefined>) => AliyunOssStorage['client'];
    this.client = new OSS({
      region: credentials.region,
      endpoint: credentials.endpoint,
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      stsToken: credentials.securityToken,
      bucket: config.oss.bucket,
    });
  }

  async headObject(key: string): Promise<{ sha256: string | null } | null> {
    try {
      const result = await this.client.head(key);
      return { sha256: result.meta?.sha256 ?? null };
    } catch (error: unknown) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async putObject(key: string, filePath: string, metadata: { sha256: string }): Promise<void> {
    await this.client.put(key, filePath, {
      meta: {
        sha256: metadata.sha256,
      },
    });
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { status?: number; code?: string; name?: string };
  return maybe.status === 404 || maybe.code === 'NoSuchKey' || maybe.name === 'NoSuchKeyError';
}

function storageAdapter(config: EffectiveAxisConfig, credentials: OssCredentials): OssStorageAdapter {
  const mockRoot = process.env.AXIS_OSS_MOCK_DIR;
  if (mockRoot) {
    return new LocalMockOssStorage(path.resolve(mockRoot), config.oss.bucket);
  }
  return new AliyunOssStorage(config, credentials);
}

function mediaTypeForPath(filePath: string, fallback: string): string {
  if (fallback) return fallback;
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.md')) return 'text/markdown';
  return 'application/octet-stream';
}

async function buildPublishFiles(
  packageDir: string,
  manifest: PackageManifest,
  config: EffectiveAxisConfig,
  runId: string,
  assetType: string | undefined,
): Promise<PublishFile[]> {
  const bucket = config.oss.bucket;
  const files: PublishFile[] = [];
  for (const entry of manifest.files ?? []) {
    const absolutePath = path.join(packageDir, entry.path);
    const content = await readFile(absolutePath);
    const stats = await stat(absolutePath);
    const objectKey = objectKeyForPublish(config, runId, entry.path, assetType);
    files.push({
      path: entry.path,
      absolutePath,
      media_type: mediaTypeForPath(entry.path, entry.media_type),
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: stats.size,
      object_key: objectKey,
      target_uri: ossUri(bucket, objectKey),
    });
  }
  return files.sort((left, right) => {
    if (left.path === 'manifest.json') return 1;
    if (right.path === 'manifest.json') return -1;
    return left.path.localeCompare(right.path);
  });
}

async function uploadPublishFiles(
  adapter: OssStorageAdapter,
  files: PublishFile[],
  allowOverwrite: boolean,
): Promise<Array<PublishFile & { status: string }>> {
  const uploaded: Array<PublishFile & { status: string }> = [];
  for (const file of files) {
    const existing = await adapter.headObject(file.object_key);
    if (existing) {
      if (existing.sha256 !== file.sha256) {
        if (!allowOverwrite) throw new Error(`remote object differs: ${file.object_key}`);
        await adapter.putObject(file.object_key, file.absolutePath, { sha256: file.sha256 });
        uploaded.push({ ...file, status: 'updated' });
        continue;
      }
      uploaded.push({ ...file, status: 'already_present' });
      continue;
    }
    await adapter.putObject(file.object_key, file.absolutePath, { sha256: file.sha256 });
    uploaded.push({ ...file, status: 'uploaded' });
  }
  return uploaded;
}

function publishSummary(
  mode: PublishMode,
  uploaded: boolean,
  metadata: PackageMetadata,
  manifest: PackageManifest,
  files: Array<PublishFile & { status?: string }>,
  redactions: number,
): Record<string, unknown> {
  return {
    ok: true,
    mode,
    uploaded,
    organization: manifest.organization,
    project: {
      slug: manifest.project?.slug,
      display_name: manifest.project?.display_name,
    },
    oss_profile: manifest.oss_profile,
    asset_type: metadata.artifact?.type,
    run_id: manifest.run?.run_id,
    release: {
      channel: manifest.release?.channel,
      gate: manifest.release?.gate,
    },
    publish: {
      status: manifest.publish?.status,
      bucket: manifest.publish?.bucket,
      prefix: manifest.publish?.prefix,
      base_uri: manifest.publish?.base_uri,
    },
    target_prefix: manifest.publish?.base_uri,
    files: files.map((file) => ({
      path: file.path,
      media_type: file.media_type,
      bytes: file.bytes,
      sha256: file.sha256,
      target_uri: file.target_uri,
      status: file.status,
    })),
    upload_order: files.map((file) => ({
      path: file.path,
      target_uri: file.target_uri,
      status: file.status,
    })),
    redactions,
  };
}

async function ossPublishCommand(): Promise<void> {
  const repo = repoArg();
  const runId = requireArg('--run-id');
  if (!/^\d{8}T\d{6}Z-[a-z0-9-]+-[a-f0-9]{8}$/.test(runId)) {
    throw new Error('--run-id must match YYYYMMDDThhmmssZ-name-8hex');
  }
  const { config: rawConfig, localDryRun, localOssEnvOverrides } = await readPublishConfig(repo);
  const { errors, effectiveConfig: config } = await resolveAxisConfig(repo, rawConfig, { localOssEnvOverrides });
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  if (!config) throw new Error('Unable to resolve Axis config');

  const dryRun = hasFlag('--dry-run') || localDryRun;
  const localOnly = hasFlag('--local-only');
  if (dryRun && localOnly) throw new Error('--dry-run and --local-only cannot be combined');
  const mode: PublishMode = dryRun ? 'dry_run' : localOnly ? 'local_only' : 'upload';
  const packageDir = packageDirFor(repo, config, runId);
  if (!existsSync(packageDir)) {
    throw new Error(`outbox run not found: ${relativeToRepo(repo, packageDir)}`);
  }

  const localFiles = await collectPackageRelativePaths(packageDir);
  const { manifest, metadata } = await validatePackageManifest(repo, packageDir, runId, config, localFiles);
  const redactions = await redactMarkdownFiles(packageDir, manifest, mode !== 'dry_run');
  if (mode !== 'dry_run') {
    await persistManifest(packageDir, manifest, manifest.publish?.status as PublishStatus);
  }
  const assetType = metadata.artifact?.type;
  const projectDocumentSync = assetType === 'project_knowledge_snapshot';
  const plannedFiles = await buildPublishFiles(packageDir, manifest, config, runId, assetType);

  if (mode === 'dry_run' || mode === 'local_only') {
    console.log(JSON.stringify(publishSummary(mode, false, metadata, manifest, plannedFiles, redactions), null, 2));
    return;
  }

  const credentials = readOssCredentials(config);
  const adapter = storageAdapter(config, credentials);
  try {
    await persistManifest(packageDir, manifest, 'uploading');
    const uploadFiles = await buildPublishFiles(packageDir, manifest, config, runId, assetType);
    const manifestUploadFile = uploadFiles.find((file) => file.path === 'manifest.json');
    if (!manifestUploadFile) throw new Error('manifest.json is required');
    const contentUploadFiles = uploadFiles.filter((file) => file.path !== 'manifest.json');
    const uploadedFiles = await uploadPublishFiles(adapter, contentUploadFiles, projectDocumentSync);
    await persistManifest(packageDir, manifest, 'published');
    const finalFiles = await buildPublishFiles(packageDir, manifest, config, runId, assetType);
    const finalManifestUploadFile = finalFiles.find((file) => file.path === 'manifest.json');
    if (!finalManifestUploadFile) throw new Error('manifest.json is required');
    const manifestUploadedFiles = await uploadPublishFiles(adapter, [finalManifestUploadFile], projectDocumentSync);
    const statuses = new Map([...uploadedFiles, ...manifestUploadedFiles].map((file) => [file.path, file.status]));
    console.log(JSON.stringify(publishSummary(
      mode,
      true,
      metadata,
      manifest,
      finalFiles.map((file) => ({ ...file, status: statuses.get(file.path) ?? 'uploaded' })),
      redactions,
    ), null, 2));
  } catch (error: unknown) {
    await persistManifest(packageDir, manifest, 'failed');
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

function parseInstallAgentArg(value: string | null): InstallAgentChoice {
  if (!value || value === 'all') return 'all';
  if (value === 'codex') return 'codex';
  if (value === 'claude-code' || value === 'cc') return 'claude-code';
  throw new Error('--agent must be one of: codex, claude-code, cc, all');
}

function selectedAgents(agent: InstallAgentChoice): Exclude<InstallAgentChoice, 'all'>[] {
  if (agent === 'all') return ['codex', 'claude-code'];
  return [agent];
}

function agentSkillRoot(agent: Exclude<InstallAgentChoice, 'all'>): string {
  if (agent === 'codex') {
    return path.join(process.env.CODEX_HOME || path.join(homeDir(), '.codex'), 'skills');
  }
  return path.join(homeDir(), '.claude', 'skills');
}

function agentSkillDir(agent: Exclude<InstallAgentChoice, 'all'>, skillName: string): string {
  return path.join(agentSkillRoot(agent), skillName);
}

async function packagedSkillNames(): Promise<string[]> {
  const root = skillsRoot();
  const entries = await readdir(root, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (existsSync(path.join(root, entry.name, 'SKILL.md'))) {
      if (!packagedSkillNamePattern.test(entry.name)) {
        throw new Error(`Packaged skill must use axis-{category}-<action>: ${entry.name}`);
      }
      names.push(entry.name);
    }
  }
  return names.sort();
}

async function collectRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '__pycache__' || entry.name === '.DS_Store' || entry.name === '.git') continue;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile() && !entry.name.endsWith('.pyc')) {
        files.push(path.relative(root, child));
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function lstatIfExists(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch (error: unknown) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') return null;
    throw error;
  }
}

async function directoryFingerprint(root: string): Promise<string> {
  const hash = createHash('sha256');
  const files = await collectRelativeFiles(root);
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function directoriesIdentical(sourceDir: string, targetDir: string): Promise<boolean> {
  const targetStats = await lstatIfExists(targetDir);
  if (!targetStats || targetStats.isSymbolicLink()) return false;
  const sourceFiles = await collectRelativeFiles(sourceDir);
  const targetFiles = await collectRelativeFiles(targetDir);
  if (sourceFiles.length !== targetFiles.length) return false;
  for (let index = 0; index < sourceFiles.length; index += 1) {
    if (sourceFiles[index] !== targetFiles[index]) return false;
    const [sourceText, targetText] = await Promise.all([
      readFile(path.join(sourceDir, sourceFiles[index])),
      readFile(path.join(targetDir, targetFiles[index])),
    ]);
    if (!sourceText.equals(targetText)) return false;
  }
  return true;
}

async function inventorySkillBundle(
  skillName: string,
  agent: Exclude<InstallAgentChoice, 'all'>,
  sourceDir: string,
  targetDir: string,
  force: boolean,
): Promise<InstallInventoryItem> {
  const targetStats = await lstatIfExists(targetDir);
  const exists = targetStats !== null;
  const identical = exists && !targetStats.isSymbolicLink() && await directoriesIdentical(sourceDir, targetDir);
  const source_sha256 = await directoryFingerprint(sourceDir);
  const target_sha256 = exists && !targetStats.isSymbolicLink() && targetStats.isDirectory()
    ? await directoryFingerprint(targetDir)
    : null;

  let action: InstallAction = 'copy';
  let reason: string | undefined;
  if (identical) {
    action = 'skip';
    reason = 'target is identical';
  } else if (exists && force) {
    action = 'replace';
    reason = 'force requested and backup will be created before replacement';
  } else if (exists) {
    action = 'block';
    reason = 'target exists and differs from packaged bundle';
  }

  return {
    skill: skillName,
    agent,
    source: sourceDir,
    target: targetDir,
    target_root: agentSkillRoot(agent),
    exists,
    identical,
    action,
    source_sha256,
    target_sha256,
    ...(reason ? { reason } : {}),
  };
}

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function backupManifestPath(backupDirOrManifest: string): string {
  return path.basename(backupDirOrManifest) === 'manifest.json'
    ? backupDirOrManifest
    : path.join(backupDirOrManifest, 'manifest.json');
}

function backupRoot(): string {
  const provided = getArg('--backup-dir');
  if (provided) return path.resolve(provided);
  return path.join(homeDir(), '.axis', 'backups', 'axis-tools', timestampForPath());
}

function createBackupSession(): BackupSession {
  return {
    version: 1,
    created_at: new Date().toISOString(),
    dir: backupRoot(),
    entries: [],
  };
}

async function persistBackupManifest(session: BackupSession): Promise<void> {
  await mkdir(session.dir, { recursive: true });
  const manifest: BackupManifest = {
    version: 1,
    created_at: session.created_at,
    entries: session.entries,
  };
  await writeJsonFile(path.join(session.dir, 'manifest.json'), manifest);
}

async function backupExistingTarget(target: string, session: BackupSession): Promise<void> {
  const targetStats = await lstatIfExists(target);
  if (!targetStats) {
    session.entries.push({ target, backup_path: null, type: 'missing' });
    await persistBackupManifest(session);
    return;
  }

  await mkdir(session.dir, { recursive: true });
  const backupPath = path.join(session.dir, `${String(session.entries.length).padStart(3, '0')}-${path.basename(target)}`);
  if (targetStats.isSymbolicLink()) {
    session.entries.push({
      target,
      backup_path: null,
      type: 'symlink',
      symlink_target: await readlink(target),
    });
  } else if (targetStats.isDirectory()) {
    await cp(target, backupPath, { recursive: true });
    session.entries.push({ target, backup_path: backupPath, type: 'directory' });
  } else {
    await cp(target, backupPath);
    session.entries.push({ target, backup_path: backupPath, type: 'file' });
  }
  await persistBackupManifest(session);
}

async function restoreBackupEntry(entry: BackupEntry): Promise<void> {
  await mkdir(path.dirname(entry.target), { recursive: true });
  await rm(entry.target, { recursive: true, force: true });
  if (entry.type === 'missing') return;
  if (entry.type === 'symlink') {
    if (!entry.symlink_target) throw new Error(`Backup entry missing symlink target for ${entry.target}`);
    await symlink(entry.symlink_target, entry.target);
    return;
  }
  if (!entry.backup_path) throw new Error(`Backup entry missing backup path for ${entry.target}`);
  await cp(entry.backup_path, entry.target, { recursive: entry.type === 'directory' });
}

async function rollbackBackupEntries(entries: BackupEntry[]): Promise<BackupEntry[]> {
  const restored: BackupEntry[] = [];
  for (const entry of [...entries].reverse()) {
    await restoreBackupEntry(entry);
    restored.push(entry);
  }
  return restored;
}

async function copySkillBundle(
  skillName: string,
  sourceDir: string,
  targetDir: string,
  inventory: InstallInventoryItem,
  backupSession: BackupSession,
): Promise<InstallStatus> {
  await mkdir(path.dirname(targetDir), { recursive: true });
  if (inventory.action === 'skip') return 'identical';
  if (inventory.action === 'block') {
    throw new Error(`Refusing to overwrite modified skill directory at ${targetDir}. Re-run with --force to replace it.`);
  }
  const tempTarget = path.join(path.dirname(targetDir), `.axis-install-${path.basename(targetDir)}-${randomBytes(4).toString('hex')}`);
  try {
    if (inventory.action === 'replace') {
      await backupExistingTarget(targetDir, backupSession);
      if (process.env.AXIS_INSTALL_FAIL_AFTER_BACKUP === skillName) {
        throw new Error(`Simulated install failure after backup for ${skillName}`);
      }
    }
    await cp(sourceDir, tempTarget, { recursive: true });
    await rm(targetDir, { recursive: true, force: true });
    await rename(tempTarget, targetDir);
  } catch (error: unknown) {
    await rm(tempTarget, { recursive: true, force: true });
    throw error;
  }
  return 'copied';
}

async function buildInstallInventory(
  agent: InstallAgentChoice,
  force: boolean,
  requestedSkills: string[] = [],
): Promise<InstallInventoryItem[]> {
  const packagedNames = await packagedSkillNames();
  if (packagedNames.length === 0) {
    throw new Error(`No packaged skills found under ${skillsRoot()}`);
  }
  const requestedNames = [...new Set(requestedSkills)];
  for (const requestedName of requestedNames) {
    if (!packagedNames.includes(requestedName)) {
      throw new Error(`Unknown packaged skill: ${requestedName}`);
    }
  }
  const names = requestedNames.length > 0 ? requestedNames.sort() : packagedNames;

  const inventory: InstallInventoryItem[] = [];
  for (const skillName of names) {
    const source = path.join(skillsRoot(), skillName);
    for (const selectedAgent of selectedAgents(agent)) {
      const target = agentSkillDir(selectedAgent, skillName);
      inventory.push(await inventorySkillBundle(skillName, selectedAgent, source, target, force));
    }
  }
  return inventory;
}

function dryRunStatusFor(action: InstallAction): InstallStatus {
  if (action === 'skip') return 'identical';
  if (action === 'replace') return 'would_replace';
  if (action === 'block') return 'blocked';
  return 'would_copy';
}

async function installPackagedSkills(
  agent: InstallAgentChoice,
  force: boolean,
  dryRun: boolean,
  requestedSkills: string[] = [],
): Promise<{
  inventory: InstallInventoryItem[];
  installed: InstalledSkill[];
  backup_dir: string | null;
}> {
  const inventory = await buildInstallInventory(agent, force, requestedSkills);
  if (dryRun) {
    return {
      inventory,
      installed: inventory.map((item) => ({
        skill: item.skill,
        agent: item.agent,
        target: item.target,
        status: dryRunStatusFor(item.action),
      })),
      backup_dir: null,
    };
  }

  const backupSession = createBackupSession();
  const installed: InstalledSkill[] = [];
  try {
    for (const item of inventory) {
      installed.push({
        skill: item.skill,
        agent: item.agent,
        target: item.target,
        status: await copySkillBundle(item.skill, item.source, item.target, item, backupSession),
      });
    }
  } catch (error: unknown) {
    await rollbackBackupEntries(backupSession.entries);
    throw error;
  }
  if (backupSession.entries.length > 0) {
    await persistBackupManifest(backupSession);
  }
  return {
    inventory,
    installed,
    backup_dir: backupSession.entries.length > 0 ? backupSession.dir : null,
  };
}

async function installCommand(): Promise<void> {
  const rollbackTarget = getArg('--rollback');
  if (rollbackTarget) {
    await rollbackCommand(path.resolve(rollbackTarget));
    return;
  }
  const agent = parseInstallAgentArg(getArg('--agent'));
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const requestedSkills = getArgs('--skill');
  const result = await installPackagedSkills(agent, force, dryRun, requestedSkills);
  console.log(JSON.stringify({ ok: true, agent, skills: requestedSkills, dry_run: dryRun, force, ...result }, null, 2));
}

async function inventoryCommand(): Promise<void> {
  const agent = parseInstallAgentArg(getArg('--agent'));
  const requestedSkills = getArgs('--skill');
  const inventory = await buildInstallInventory(agent, hasFlag('--force'), requestedSkills);
  console.log(JSON.stringify({ ok: true, agent, skills: requestedSkills, inventory }, null, 2));
}

async function rollbackCommand(backupDirOrManifest: string): Promise<void> {
  const manifestPath = backupManifestPath(backupDirOrManifest);
  const manifest = await readJsonFile<BackupManifest>(manifestPath);
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error(`Invalid backup manifest: ${manifestPath}`);
  }
  const restored = await rollbackBackupEntries(manifest.entries);
  console.log(JSON.stringify({
    ok: true,
    rollback: {
      manifest: manifestPath,
      restored,
    },
  }, null, 2));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || isHelpFlag(command)) {
    printUsage();
    return;
  }

  if (command === 'install') {
    if (isHelpFlag(process.argv[3])) {
      printUsage();
      return;
    }
    await installCommand();
    return;
  }

  if (command === 'inventory') {
    if (isHelpFlag(process.argv[3])) {
      printUsage();
      return;
    }
    await inventoryCommand();
    return;
  }

  if (command === 'project-init') {
    if (isHelpFlag(process.argv[3])) {
      printUsage();
      return;
    }
    await projectInitCommand();
    return;
  }

  if (command === 'validate-config') {
    if (isHelpFlag(process.argv[3])) {
      printUsage();
      return;
    }
    await validateConfigCommand();
    return;
  }

  if (command === 'coding-capture') {
    await writePackageCommand('coding_capture');
    return;
  }

  if (command === 'test-report') {
    await writePackageCommand('test_report');
    return;
  }

  if (command === 'project-knowledge-capture') {
    await projectKnowledgeCaptureCommand();
    return;
  }

  if (command === 'oss-publish') {
    await ossPublishCommand();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
