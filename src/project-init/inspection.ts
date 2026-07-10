import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { migrateDraft } from './migrations.js';
import type { Draft, MigrateDraftResult, ProvenanceEntry } from './types.js';

export type ContractVersion = '0.1' | '0.2';
export type InspectionResolution = 'stored' | 'mapped' | 'recommended' | 'unresolved' | 'remove';

export interface InspectionSelectors {
  registry_path: string;
  organization_id: string | null;
  oss_profile: string | null;
}

export interface ProjectInitInspectionOptions {
  repo: string;
  registryPath?: string | null;
  organizationId?: string | null;
  ossProfile?: string | null;
  environment?: NodeJS.ProcessEnv;
}

export interface ProjectInitInspection {
  schema: 'axis.project_init_inspection';
  schema_version: 1;
  repo: string;
  source_contract_version: ContractVersion | null;
  latest_contract_version: '0.2';
  status?: 'ok' | 'recovery_required';
  recovery_required?: boolean;
  selectors: InspectionSelectors;
  files: InspectionFile[];
  migration_chain: Array<{ from: string; to: string; mapping: string }>;
  fields: InspectionField[];
  environment: EnvironmentInspection[];
  provenance: Record<string, Array<{ version: string; source: string }>>;
  resolutions: Record<string, InspectionResolution>;
  recommendations: Record<string, unknown>;
  options: Record<string, unknown[]>;
}

export interface InspectionFile {
  role: 'main_config' | 'local_config' | 'target_registry' | 'source_registry' | 'gitignore';
  path: string;
  state: 'present' | 'absent';
  sha256: string | null;
}

export interface InspectionField {
  key: string;
  label: string;
  required: boolean;
  current_value?: unknown;
  mapped_value?: unknown;
  recommendation?: unknown;
  options?: unknown[];
  resolution: InspectionResolution;
  disposition?: 'keep' | 'remove';
  removal_reason?: string;
  provenance: Array<{ version: string; source: string }>;
}

export interface EnvironmentInspection {
  field: string;
  name: string | null;
  required: boolean;
  present: boolean;
}

interface Registry {
  schema?: unknown;
  schema_version?: unknown;
  organizations?: unknown;
}

interface Organization {
  id?: unknown;
  slug?: unknown;
  display_name?: unknown;
  status?: unknown;
  oss_profiles?: unknown;
  projects?: unknown;
  products?: unknown;
  [key: string]: unknown;
}

interface OssProfile {
  name?: unknown;
  provider?: unknown;
  bucket?: unknown;
  prefix?: unknown;
  endpoint_env?: unknown;
  region_env?: unknown;
  access_key_id_env?: unknown;
  access_key_secret_env?: unknown;
  security_token_env?: unknown;
  [key: string]: unknown;
}

interface ParsedFile {
  exists: boolean;
  path: string;
  value: Draft;
  text: string | null;
}

interface CandidateProfile {
  organization: Organization;
  profile: OssProfile;
}

const latestVersion: '0.2' = '0.2';
const defaultRegistryPath = '.axis/organizations.yml';
const defaultOutboxDir = '.axis/outbox';
const defaultEnvironment = {
  endpoint_env: 'ALIYUN_OSS_ENDPOINT',
  region_env: 'ALIYUN_OSS_REGION',
  access_key_id_env: 'ALIYUN_OSS_ACCESS_KEY_ID',
  access_key_secret_env: 'ALIYUN_OSS_ACCESS_KEY_SECRET',
  security_token_env: 'ALIYUN_OSS_SECURITY_TOKEN',
} as const;
const environmentFields = [
  { key: 'endpoint_env', required: true },
  { key: 'region_env', required: true },
  { key: 'access_key_id_env', required: true },
  { key: 'access_key_secret_env', required: true },
  { key: 'security_token_env', required: false },
] as const;
const unsafePathSegments = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function collectionRecords<T extends Record<string, unknown>>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value.filter(isRecord) as T[];
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([name, item]) => ({ ...item, [key]: typeof item[key] === 'string' ? item[key] : name }) as T);
}

function getPath(value: unknown, dottedPath: string): { found: boolean; value?: unknown } {
  let current = value;
  for (const segment of dottedPath.split('.')) {
    if (unsafePathSegments.has(segment) || !isRecord(current) || !(segment in current)) {
      return { found: false };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

function setPath(value: Draft, dottedPath: string, nextValue: unknown): void {
  const segments = dottedPath.split('.');
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(current[segment])) current[segment] = {};
    current = current[segment] as Draft;
  }
  current[segments.at(-1)!] = nextValue;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function validateRelativePath(value: string, field: string): string {
  if (!value || path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) {
    throw new Error(`${field} must be a relative path inside the repo`);
  }
  return toPosix(value);
}

function normalizeIdentifier(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'project';
}

function normalizeProjectSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'demo-project';
}

function displayNameFromSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Axis Project';
}

function isCredentialLikePath(key: string): boolean {
  return /credential|secret|token|password|access_?key/i.test(key);
}

function safeValue(key: string, value: unknown): unknown {
  return isCredentialLikePath(key) ? '[redacted]' : value;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function parseFile(repo: string, relativePath: string, label: string): Promise<ParsedFile> {
  const absolutePath = path.join(repo, relativePath);
  if (!await pathExists(absolutePath)) {
    return { exists: false, path: relativePath, value: {}, text: null };
  }
  let parsed: unknown;
  const text = await readFile(absolutePath, 'utf8');
  try {
    parsed = parse(text);
  } catch (error: unknown) {
    throw new Error(`invalid YAML in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || parsed === undefined) return { exists: true, path: relativePath, value: {}, text };
  if (!isRecord(parsed)) throw new Error(`${label} YAML root must be a mapping`);
  return { exists: true, path: relativePath, value: parsed, text };
}

async function fingerprint(repo: string, role: InspectionFile['role'], relativePath: string): Promise<InspectionFile> {
  const absolutePath = path.join(repo, relativePath);
  if (!await pathExists(absolutePath)) return { role, path: relativePath, state: 'absent', sha256: null };
  const bytes = await readFile(absolutePath);
  return {
    role,
    path: relativePath,
    state: 'present',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function readRegistry(repo: string, relativePath: string): Promise<ParsedFile> {
  return parseFile(repo, relativePath, `organization registry ${relativePath}`);
}

async function assertRepo(repo: string): Promise<string> {
  const absoluteRepo = path.resolve(repo);
  let repositoryStat;
  try {
    repositoryStat = await stat(absoluteRepo);
  } catch {
    throw new Error(`repository does not exist: ${absoluteRepo}`);
  }
  if (!repositoryStat.isDirectory()) throw new Error(`repository is not a directory: ${absoluteRepo}`);
  return absoluteRepo;
}

async function transactionJournalExists(repo: string): Promise<boolean> {
  const axisPath = path.join(repo, '.axis');
  if (!await pathExists(axisPath)) return false;
  const names = await readdir(axisPath);
  return names.some((name) => (
    /project-init.*(journal|transaction)|(?:journal|transaction).*project-init/i.test(name)
  ));
}

function sourceVersionFor(config: Draft): ContractVersion | null {
  if (Object.keys(config).length === 0) return null;
  if (config.contract_version !== '0.1' && config.contract_version !== '0.2') {
    throw new Error('contract_version must be "0.1" or "0.2" for project-init inspection');
  }
  return config.contract_version;
}

function emptyMigration(): MigrateDraftResult {
  return { draft: {}, chain: [], unresolved: [], dropped: [], provenance: {} };
}

async function migrate(
  draft: Draft,
  sourceVersion: ContractVersion | null,
  mappingsDir: string,
): Promise<MigrateDraftResult> {
  if (!sourceVersion || sourceVersion === latestVersion) return emptyMigrationForDraft(draft, sourceVersion);
  return migrateDraft({ sourceVersion, latestVersion, draft, mappingsDir });
}

function emptyMigrationForDraft(draft: Draft, sourceVersion: ContractVersion | null): MigrateDraftResult {
  const provenance: Record<string, ProvenanceEntry> = {};
  if (sourceVersion) {
    const visit = (value: unknown, prefix: string): void => {
      if (!isRecord(value)) return;
      for (const [key, child] of Object.entries(value)) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        if (isRecord(child)) visit(child, childPath);
        else provenance[childPath] = { sourceVersion, sourcePath: childPath };
      }
    };
    visit(draft, '');
  }
  return { draft: structuredClone(draft), chain: [], unresolved: [], dropped: [], provenance };
}

function migrationProvenance(result: MigrateDraftResult, key: string, sourceVersion: ContractVersion | null): Array<{ version: string; source: string }> {
  const entry = result.provenance[key];
  if (entry) {
    const origins = entry.origins ?? [entry];
    return origins.map((origin) => ({ version: origin.sourceVersion, source: origin.sourcePath }));
  }
  if (sourceVersion) return [{ version: sourceVersion, source: key }];
  return [];
}

function fieldLabel(key: string): string {
  const last = key.split('.').at(-1) ?? key;
  return last.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function currentOrMapped(
  raw: Draft,
  migrated: Draft,
  sourceVersion: ContractVersion | null,
  key: string,
): { current?: unknown; mapped?: unknown; resolution: InspectionResolution } {
  const rawValue = getPath(raw, key);
  const mappedValue = getPath(migrated, key);
  if (sourceVersion === '0.2' && rawValue.found) {
    return { current: safeValue(key, rawValue.value), resolution: 'stored' };
  }
  if (sourceVersion === '0.1' && mappedValue.found) {
    return { mapped: safeValue(key, mappedValue.value), resolution: 'mapped' };
  }
  if (mappedValue.found && sourceVersion === '0.2') {
    return { current: safeValue(key, mappedValue.value), resolution: 'stored' };
  }
  return { resolution: 'unresolved' };
}

function fieldFrom(
  key: string,
  raw: Draft,
  migrated: Draft,
  sourceVersion: ContractVersion | null,
  required: boolean,
  recommendations: Record<string, unknown>,
  options: Record<string, unknown[]>,
  provenance: Record<string, Array<{ version: string; source: string }>>,
  resolutions: Record<string, InspectionResolution>,
): InspectionField {
  const result = currentOrMapped(raw, migrated, sourceVersion, key);
  const field: InspectionField = {
    key,
    label: fieldLabel(key),
    required,
    resolution: result.resolution,
    provenance: migrationProvenance(
      { draft: migrated, chain: [], unresolved: [], dropped: [], provenance: {} },
      key,
      sourceVersion,
    ),
  };
  if (sourceVersion === null && key === 'contract_version') {
    field.mapped_value = latestVersion;
    field.resolution = 'mapped';
  }
  if (result.current !== undefined) field.current_value = result.current;
  if (result.mapped !== undefined) field.mapped_value = result.mapped;
  if (Object.hasOwn(recommendations, key)) {
    field.recommendation = recommendations[key];
    if (field.resolution === 'unresolved') field.resolution = 'recommended';
  }
  if (Object.hasOwn(options, key)) field.options = options[key];
  provenance[key] = field.provenance;
  resolutions[key] = field.resolution;
  return field;
}

function registryOrganizations(registry: Registry | null): Organization[] {
  return collectionRecords<Organization>(registry?.organizations, 'id');
}

function profilesFor(registry: Registry | null): CandidateProfile[] {
  return registryOrganizations(registry).flatMap((organization) => (
    collectionRecords<OssProfile>(organization.oss_profiles, 'name').map((profile) => ({ organization, profile }))
  ));
}

function profileValue(profile: OssProfile, key: string): unknown {
  return profile[key];
}

function exactProfileMatches(migrated: Draft, registry: Registry | null): CandidateProfile[] {
  const old = getPath(migrated, 'oss_profile');
  if (!old.found || !isRecord(old.value)) return [];
  const oldProfile = old.value;
  return profilesFor(registry).filter(({ profile }) => {
    for (const key of ['provider', 'bucket', 'prefix', ...environmentFields.map(({ key }) => key)]) {
      if (oldProfile[key] !== undefined && profileValue(profile, key) !== oldProfile[key]) return false;
    }
    return ['provider', 'bucket', 'prefix'].every((key) => oldProfile[key] !== undefined);
  });
}

function sortedCandidates(candidates: CandidateProfile[]): CandidateProfile[] {
  return [...candidates].sort((left, right) => (
    String(left.organization.id).localeCompare(String(right.organization.id))
    || String(left.profile.name).localeCompare(String(right.profile.name))
  ));
}

function availableIdentifier(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function registryValue(organization: Organization | null, profile: OssProfile | null, key: string): unknown {
  if (key.startsWith('organization.')) return organization?.[key.slice('organization.'.length)];
  if (key.startsWith('oss_profile.')) return profile?.[key.slice('oss_profile.'.length)];
  return undefined;
}

function appendRegistryFields(
  fields: InspectionField[],
  raw: Draft,
  migrated: Draft,
  sourceVersion: ContractVersion | null,
  organization: Organization | null,
  profile: OssProfile | null,
  recommendations: Record<string, unknown>,
  options: Record<string, unknown[]>,
  provenance: Record<string, Array<{ version: string; source: string }>>,
  resolutions: Record<string, InspectionResolution>,
): void {
  for (const [key, required] of [
    ['organization.id', true],
    ['organization.registry', true],
    ['organization.slug', true],
    ['organization.display_name', true],
    ['organization.status', true],
    ['oss_profile.name', true],
    ['oss_profile.provider', true],
    ['oss_profile.bucket', true],
    ['oss_profile.prefix', true],
    ...environmentFields.map(({ key: environmentKey, required: environmentRequired }) => [`oss_profile.${environmentKey}`, environmentRequired]),
  ] as Array<[string, boolean]>) {
    const field = fieldFrom(key, raw, migrated, sourceVersion, required, recommendations, options, provenance, resolutions);
    const value = registryValue(organization, profile, key);
    if (value !== undefined && field.current_value === undefined && field.mapped_value === undefined) {
      field.current_value = safeValue(key, value);
      field.resolution = 'stored';
      field.provenance = [{ version: '0.2', source: key }];
      provenance[key] = field.provenance;
      resolutions[key] = field.resolution;
    }
    fields.push(field);
  }
}

function localFields(
  fields: InspectionField[],
  raw: Draft,
  migrated: Draft,
  sourceVersion: ContractVersion | null,
  recommendations: Record<string, unknown>,
  options: Record<string, unknown[]>,
  provenance: Record<string, Array<{ version: string; source: string }>>,
  resolutions: Record<string, InspectionResolution>,
): void {
  for (const [key, required] of [
    ['local.outbox_dir', false],
    ['local.dry_run', false],
    ['local.redaction_patterns_file', false],
    ...environmentFields.map(({ key: environmentKey }) => [`local.oss.${environmentKey}`, false]),
  ] as Array<[string, boolean]>) {
    fields.push(fieldFrom(key, raw, migrated, sourceVersion, required, recommendations, options, provenance, resolutions));
  }
}

function mergeLocal(main: Draft, local: Draft): Draft {
  const merged = structuredClone(main);
  if (!isRecord(local.local)) return merged;
  if (!isRecord(merged.local)) merged.local = {};
  const localRecord = local.local as Record<string, unknown>;
  const mergedLocal = merged.local as Record<string, unknown>;
  merged.local = { ...mergedLocal, ...localRecord };
  const localOss = localRecord.oss;
  if (isRecord(localOss)) {
    const existing = isRecord(mergedLocal.oss)
      ? mergedLocal.oss
      : {};
    mergedLocal.oss = {
      ...existing,
      ...localOss,
    };
  }
  return merged;
}

function mappingFields(result: MigrateDraftResult, fields: InspectionField[], provenance: Record<string, Array<{ version: string; source: string }>>, resolutions: Record<string, InspectionResolution>): void {
  for (const dropped of result.dropped) {
    const field: InspectionField = {
      key: dropped.sourcePath,
      label: fieldLabel(dropped.sourcePath),
      required: false,
      current_value: '[redacted]',
      resolution: 'remove',
      disposition: 'remove',
      removal_reason: dropped.reason,
      provenance: [{ version: dropped.sourceVersion, source: dropped.sourcePath }],
    };
    fields.push(field);
    provenance[field.key] = field.provenance;
    resolutions[field.key] = field.resolution;
  }
}

function validateUnknownCredentialValues(value: unknown, prefix = '', authorizedDrops = new Set<string>()): void {
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    const authorized = authorizedDrops.has(childPath) || authorizedDrops.has(`local.${childPath}`);
    if (isCredentialLikePath(childPath) && !authorized && !isRecord(child) && !Array.isArray(child)) {
      throw new Error(`credential-like inspection field requires an authorized migration drop: ${childPath}`);
    }
    validateUnknownCredentialValues(child, childPath, authorizedDrops);
  }
}

function applyRecommendation(
  recommendations: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined && value !== null) recommendations[key] = value;
}

function selectedOrganization(registry: Registry | null, organizationId: string | null): Organization | null {
  if (!organizationId) return null;
  return registryOrganizations(registry).find((candidate) => candidate.id === organizationId) ?? null;
}

function selectedProfile(organization: Organization | null, profileName: string | null): OssProfile | null {
  if (!organization || !profileName) return null;
  return collectionRecords<OssProfile>(organization.oss_profiles, 'name')
    .find((candidate) => candidate.name === profileName) ?? null;
}

export async function inspectProjectInit(options: ProjectInitInspectionOptions): Promise<ProjectInitInspection> {
  const repo = await assertRepo(options.repo);
  const main = await parseFile(repo, '.axis/config.yml', '.axis/config.yml');
  const local = await parseFile(repo, '.axis/config.local.yml', '.axis/config.local.yml');
  const sourceVersion = sourceVersionFor(main.value);
  const mappingsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../protocols/migrations');
  const mainMigration = await migrate(main.value, sourceVersion, mappingsDir);
  const localMigration = await migrate(local.value, sourceVersion, mappingsDir);
  const migrated = mergeLocal(mainMigration.draft, localMigration.draft);
  const raw = mergeLocal(main.value, local.value);
  const authorizedDrops = new Set([
    ...mainMigration.dropped.map((entry) => entry.sourcePath),
    ...localMigration.dropped.map((entry) => entry.sourcePath),
  ]);
  validateUnknownCredentialValues(raw.local, '', authorizedDrops);

  const configuredRegistryPath = getPath(main.value, 'organization.registry');
  const sourceRegistryPath = sourceVersion === '0.2' && typeof configuredRegistryPath.value === 'string'
    ? validateRelativePath(configuredRegistryPath.value, 'organization.registry')
    : null;
  const targetRegistryPath = validateRelativePath(
    options.registryPath ?? sourceRegistryPath ?? defaultRegistryPath,
    '--registry-path',
  );
  const targetRegistry = await readRegistry(repo, targetRegistryPath);
  const sourceRegistry = sourceRegistryPath && sourceRegistryPath !== targetRegistryPath
    ? await readRegistry(repo, sourceRegistryPath)
    : null;

  const configuredOrganizationId = getPath(main.value, 'organization.id').value;
  const storedOrganizationId = sourceVersion === '0.2' && typeof configuredOrganizationId === 'string'
    ? configuredOrganizationId
    : null;
  const configuredProfileName = getPath(main.value, 'oss.profile').value;
  const storedProfileName = sourceVersion === '0.2' && typeof configuredProfileName === 'string'
    ? configuredProfileName
    : null;
  const registryChanged = Boolean(options.registryPath && sourceRegistryPath && targetRegistryPath !== sourceRegistryPath);
  const explicitOrganizationId = options.organizationId ?? null;
  const organizationId = explicitOrganizationId
    ?? (!registryChanged ? storedOrganizationId : null);
  const explicitProfileName = options.ossProfile ?? null;
  let profileName = explicitProfileName
    ?? (!registryChanged && (explicitOrganizationId === null || explicitOrganizationId === storedOrganizationId) ? storedProfileName : null);

  const candidates = sortedCandidates(exactProfileMatches(mainMigration.draft, targetRegistry.value as Registry));
  const recommendations: Record<string, unknown> = {};
  const optionsByField: Record<string, unknown[]> = {};
  if (!organizationId && sourceVersion !== '0.2' && candidates.length === 1) {
    applyRecommendation(recommendations, 'organization.id', candidates[0].organization.id);
    applyRecommendation(recommendations, 'oss_profile.name', candidates[0].profile.name);
  } else if (!organizationId && sourceVersion !== '0.2' && candidates.length > 1) {
    optionsByField['organization.id'] = candidates.map(({ organization, profile }) => ({
      organization_id: organization.id,
      oss_profile: profile.name,
    }));
    optionsByField['oss_profile.name'] = optionsByField['organization.id'];
  }

  const organizations = registryOrganizations(targetRegistry.value as Registry);
  const usedOrganizationIds = new Set(organizations.map((organization) => String(organization.id)));
  const fallbackProjectSlug = normalizeProjectSlug(path.basename(repo).replace(/-[a-z0-9]{6}$/i, ''));
  const projectSlug = typeof getPath(migrated, 'project.slug').value === 'string'
    ? String(getPath(migrated, 'project.slug').value)
    : fallbackProjectSlug;
  const projectDisplayName = typeof getPath(migrated, 'project.display_name').value === 'string'
    ? String(getPath(migrated, 'project.display_name').value)
    : displayNameFromSlug(projectSlug);
  const recommendedOrganizationId = organizationId
    ?? (candidates.length === 1 ? String(candidates[0].organization.id) : availableIdentifier(`org_${normalizeIdentifier(projectSlug)}`, usedOrganizationIds));
  const selectedOrg = selectedOrganization(targetRegistry.value as Registry, recommendedOrganizationId);
  const usedProfileNames = new Set(selectedOrg ? collectionRecords<OssProfile>(selectedOrg.oss_profiles, 'name').map((item) => String(item.name)) : []);
  const recommendedProfileName = profileName
    ?? (candidates.length === 1 ? String(candidates[0].profile.name) : availableIdentifier('private_beta_main', usedProfileNames));
  if (!organizationId && candidates.length !== 1) applyRecommendation(recommendations, 'organization.id', recommendedOrganizationId);
  if (!profileName && candidates.length !== 1) applyRecommendation(recommendations, 'oss_profile.name', recommendedProfileName);
  profileName ??= recommendedProfileName;
  const resolvedOrganizationId = organizationId ?? (candidates.length === 1 ? String(candidates[0].organization.id) : recommendedOrganizationId);
  const organization = selectedOrganization(targetRegistry.value as Registry, resolvedOrganizationId);
  const profile = selectedProfile(organization, profileName);

  if (!organization) applyRecommendation(recommendations, 'organization.id', resolvedOrganizationId);
  if (!profile && profileName) applyRecommendation(recommendations, 'oss_profile.name', profileName);

  applyRecommendation(recommendations, 'project.slug', projectSlug);
  applyRecommendation(recommendations, 'project.display_name', projectDisplayName);
  applyRecommendation(recommendations, 'package.outbox_dir', defaultOutboxDir);
  applyRecommendation(recommendations, 'release.channel', getPath(migrated, 'release.channel').value ?? 'private_beta');
  applyRecommendation(recommendations, 'release.gate', getPath(migrated, 'release.gate').value ?? 'not_requested');
  applyRecommendation(recommendations, 'contract_version', '0.2');
  applyRecommendation(recommendations, 'organization.registry', targetRegistryPath);
  applyRecommendation(recommendations, 'organization.slug', organization?.slug ?? normalizeIdentifier(projectSlug));
  applyRecommendation(recommendations, 'organization.display_name', organization?.display_name ?? projectDisplayName);
  applyRecommendation(recommendations, 'organization.status', organization?.status ?? 'active');
  applyRecommendation(recommendations, 'oss_profile.provider', profile?.provider ?? 'aliyun-oss');
  applyRecommendation(recommendations, 'oss_profile.bucket', profile?.bucket ?? getPath(migrated, 'oss_profile.bucket').value ?? 'axis-v02-private-beta-example');
  applyRecommendation(recommendations, 'oss_profile.prefix', profile?.prefix ?? getPath(migrated, 'oss_profile.prefix').value ?? 'axis/v0.2');
  for (const { key } of environmentFields) {
    applyRecommendation(recommendations, `oss_profile.${key}`, profile?.[key] ?? getPath(migrated, `oss_profile.${key}`).value ?? defaultEnvironment[key]);
  }

  const provenance: Record<string, Array<{ version: string; source: string }>> = {};
  const resolutions: Record<string, InspectionResolution> = {};
  const fields: InspectionField[] = [];
  fields.push(fieldFrom('contract_version', raw, migrated, sourceVersion, true, recommendations, optionsByField, provenance, resolutions));
  for (const [key, required] of [
    ['project.slug', true],
    ['project.display_name', true],
    ['package.outbox_dir', true],
    ['release.channel', true],
    ['release.gate', true],
  ] as Array<[string, boolean]>) {
    fields.push(fieldFrom(key, raw, migrated, sourceVersion, required, recommendations, optionsByField, provenance, resolutions));
  }
  appendRegistryFields(fields, raw, migrated, sourceVersion, organization, profile, recommendations, optionsByField, provenance, resolutions);
  localFields(fields, raw, migrated, sourceVersion, recommendations, optionsByField, provenance, resolutions);
  mappingFields(mainMigration, fields, provenance, resolutions);
  if (local.exists) mappingFields(localMigration, fields, provenance, resolutions);

  const environment: EnvironmentInspection[] = environmentFields.map(({ key, required }) => {
    const localOverride = getPath(migrated, `local.oss.${key}`);
    const name = typeof localOverride.value === 'string'
      ? localOverride.value
      : typeof profile?.[key] === 'string'
        ? profile[key] as string
        : typeof recommendations[`oss_profile.${key}`] === 'string'
          ? recommendations[`oss_profile.${key}`] as string
          : null;
    return { field: key, name, required, present: Boolean(name && (options.environment ?? process.env)[name]) };
  });

  const files = [
    await fingerprint(repo, 'main_config', '.axis/config.yml'),
    await fingerprint(repo, 'local_config', '.axis/config.local.yml'),
    await fingerprint(repo, 'target_registry', targetRegistryPath),
    ...(sourceRegistryPath && sourceRegistryPath !== targetRegistryPath
      ? [await fingerprint(repo, 'source_registry', sourceRegistryPath)]
      : []),
    await fingerprint(repo, 'gitignore', '.gitignore'),
  ];
  const recoveryRequired = await transactionJournalExists(repo);
  return {
    schema: 'axis.project_init_inspection',
    schema_version: 1,
    repo,
    source_contract_version: sourceVersion,
    latest_contract_version: latestVersion,
    ...(recoveryRequired ? { status: 'recovery_required' as const, recovery_required: true } : {}),
    selectors: {
      registry_path: targetRegistryPath,
      organization_id: resolvedOrganizationId,
      oss_profile: profileName,
    },
    files,
    migration_chain: [
      ...mainMigration.chain,
      ...localMigration.chain.filter((link) => !mainMigration.chain.some((mainLink) => mainLink.fromVersion === link.fromVersion && mainLink.toVersion === link.toVersion)),
    ].map((link) => ({ from: link.fromVersion, to: link.toVersion, mapping: `${link.fromVersion}-to-${link.toVersion}.yml` })),
    fields,
    environment,
    provenance,
    resolutions,
    recommendations,
    options: optionsByField,
  };
}

export const projectInitInspectionJournalPath = journalPathFor;

function journalPathFor(repo: string): string {
  return path.join(repo, '.axis', 'project-init.journal.json');
}
