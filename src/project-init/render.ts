import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Module from 'ajv/dist/2020.js';
import {
  isMap,
  isSeq,
  parseDocument,
  YAMLMap,
  YAMLSeq,
  type Document,
  type YAMLMap as YAMLMapType,
  type YAMLSeq as YAMLSeqType,
} from 'yaml';
import type {
  InspectionField,
  ProjectInitInspection,
} from './inspection.js';
import type {
  ProjectInitAnswer,
  ProjectInitAnswers,
  ProjectSourceFiles,
  RenderedProjectFiles,
} from './types.js';

type ConfigDocument = Document.Parsed;
type MapNode = YAMLMapType<unknown, unknown>;
type SeqNode = YAMLSeqType<unknown>;

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../schemas/project-init-answers.schema.json',
);
const answersSchema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
type SchemaError = { instancePath?: string; message?: string };
type SchemaValidator = ((input: unknown) => boolean) & { errors?: SchemaError[] | null };
type AjvConstructor = new (options: { allErrors: boolean; strict: boolean }) => {
  compile: (schema: object) => SchemaValidator;
};
const Ajv2020 = Ajv2020Module as unknown as AjvConstructor;
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(answersSchema);
const sensitivePathPattern = /credential|secret|token|password|access_?key/i;
const legacyOssFields = [
  'bucket',
  'prefix',
  'endpoint_env',
  'region_env',
  'access_key_id_env',
  'access_key_secret_env',
  'security_token_env',
];

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function sameValue(left: unknown, right: unknown): boolean {
  try {
    assert.deepStrictEqual(left, right);
    return true;
  } catch {
    return false;
  }
}

function schemaErrors(): string {
  return (validateSchema.errors ?? [])
    .map((error: SchemaError) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

function assertSafeDecisionValue(field: InspectionField, answer: ProjectInitAnswer): void {
  if (sensitivePathPattern.test(field.key) && !field.key.endsWith('_env') && answer.value !== null) {
    throw new Error(`credential-like answer value must be null or an environment variable name: ${field.key}`);
  }
  if (field.resolution === 'remove' || field.disposition === 'remove') {
    if (answer.value !== null) {
      throw new Error(`confirmed removal must use value null: ${field.key}`);
    }
    return;
  }
  if (field.required && answer.value === null) {
    throw new Error(`required project-init field cannot be null: ${field.key}`);
  }
}

function assertDecisionValue(field: InspectionField, answer: ProjectInitAnswer): void {
  if (answer.decision === 'keep') {
    if (!hasOwn(field, 'current_value') || !sameValue(field.current_value, answer.value)) {
      throw new Error(`keep decision does not match inspected value: ${field.key}`);
    }
  } else if (answer.decision === 'accept_mapping') {
    if (!hasOwn(field, 'mapped_value') || !sameValue(field.mapped_value, answer.value)) {
      throw new Error(`mapping decision does not match inspected value: ${field.key}`);
    }
  } else if (answer.decision === 'accept_recommendation') {
    if (!hasOwn(field, 'recommendation') || !sameValue(field.recommendation, answer.value)) {
      throw new Error(`recommendation decision does not match inspected value: ${field.key}`);
    }
  }
  assertSafeDecisionValue(field, answer);
}

function assertExactInspectionMetadata(inspection: ProjectInitInspection, answers: ProjectInitAnswers): void {
  if (answers.repo !== inspection.repo) throw new Error('answers repository does not match inspection');
  if (answers.latest_contract_version !== inspection.latest_contract_version) {
    throw new Error('answers latest contract version does not match inspection');
  }
  if (!sameValue(answers.selectors, inspection.selectors)) {
    throw new Error('answers selectors do not match inspection');
  }
  if (!sameValue(answers.files, inspection.files)) {
    throw new Error('answers file fingerprints do not match inspection');
  }
}

export function validateAnswers(
  inspection: ProjectInitInspection,
  input: unknown,
): ProjectInitAnswers {
  if (!validateSchema(input)) {
    throw new Error(`project-init answers schema validation failed: ${schemaErrors()}`);
  }
  const answers = input as ProjectInitAnswers;
  assertExactInspectionMetadata(inspection, answers);
  if (answers.decisions.length !== inspection.fields.length) {
    throw new Error('answers must contain exactly one decision for every inspection field');
  }

  const seen = new Set<string>();
  answers.decisions.forEach((answer, index) => {
    if (seen.has(answer.key)) throw new Error(`duplicate project-init answer decision: ${answer.key}`);
    seen.add(answer.key);
    const field = inspection.fields[index];
    if (!field || answer.key !== field.key) {
      throw new Error(`answers decisions must preserve inspection field order; unexpected field: ${answer.key}`);
    }
    assertDecisionValue(field, answer);
  });
  return structuredClone(answers);
}

function parseYamlDocument(text: string | null, label: string): ConfigDocument {
  const document = parseDocument(text ?? '');
  if (document.errors.length > 0) {
    throw new Error(`invalid YAML in ${label}: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  if (document.contents !== null && !isMap(document.contents)) {
    throw new Error(`${label} YAML root must be a mapping`);
  }
  return document;
}

function documentMap(document: ConfigDocument, label: string): MapNode {
  if (!document.contents) document.set('schema', undefined);
  if (!document.contents || !isMap(document.contents)) {
    throw new Error(`${label} YAML root must be a mapping`);
  }
  return document.contents;
}

function mapNode(value: unknown): MapNode | null {
  return isMap(value) ? value : null;
}

function valueAt(document: ConfigDocument, pathSegments: string[]): unknown {
  return document.getIn(pathSegments);
}

function setIfDifferent(document: ConfigDocument, pathSegments: string[], value: unknown): void {
  if (!sameValue(valueAt(document, pathSegments), value)) document.setIn(pathSegments, structuredClone(value));
}

function setMapIfDifferent(map: MapNode, key: string, value: unknown): void {
  if (!sameValue(map.get(key), value)) map.set(key, structuredClone(value));
}

function deleteIfPresent(document: ConfigDocument, pathSegments: string[]): void {
  if (document.getIn(pathSegments) !== undefined) document.deleteIn(pathSegments);
}

function finalValues(inspection: ProjectInitInspection, answers: ProjectInitAnswers): Map<string, unknown> {
  return new Map(inspection.fields.map((field, index) => [field.key, answers.decisions[index].value]));
}

function sourceValue(sourceFiles: ProjectSourceFiles, key: keyof ProjectSourceFiles): string | null {
  const aliases: Record<string, string[]> = {
    main_config: ['main_config', 'mainConfig', 'config'],
    local_config: ['local_config', 'localConfig'],
    target_registry: ['target_registry', 'targetRegistry', 'registry'],
    gitignore: ['gitignore', 'gitIgnore'],
  };
  const candidate = (aliases[key] ?? [key]).find((alias) => hasOwn(sourceFiles, alias));
  const value = candidate ? (sourceFiles as unknown as Record<string, unknown>)[candidate] : null;
  return typeof value === 'string' ? value : null;
}

function selectedMapNode(
  collection: SeqNode | MapNode,
  identityKey: string,
  identityValue: string,
): MapNode | null {
  if (isSeq(collection)) {
    const match = collection.items.find((item) => {
      const record = mapNode(item);
      return record !== null && record.get(identityKey) === identityValue;
    });
    return mapNode(match);
  }
  return mapNode(collection.get(identityValue, true));
}

function collectionNode(parent: MapNode, key: string, label: string): SeqNode | MapNode {
  const existing = parent.get(key, true);
  if (existing === undefined || existing === null) {
    const sequence = new YAMLSeq<unknown>();
    parent.set(key, sequence);
    return sequence;
  }
  if (!isSeq(existing) && !isMap(existing)) throw new Error(`${label}.${key} must be a sequence or mapping`);
  return existing;
}

function addRecord(
  collection: SeqNode | MapNode,
  identityKey: string,
  identityValue: string,
  values: Record<string, unknown>,
): MapNode {
  const record = new YAMLMap<unknown, unknown>();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      const sequence = new YAMLSeq<unknown>();
      for (const item of value) sequence.add(structuredClone(item));
      record.set(key, sequence);
    } else {
      record.set(key, structuredClone(value));
    }
  }
  if (isSeq(collection)) {
    collection.add(record);
    return record;
  }
  record.delete(identityKey);
  collection.set(identityValue, record);
  return record;
}

function upsertRecord(
  collection: SeqNode | MapNode,
  identityKey: string,
  identityValue: string,
  values: Record<string, unknown>,
): MapNode {
  const existing = selectedMapNode(collection, identityKey, identityValue);
  if (existing) return existing;
  return addRecord(collection, identityKey, identityValue, values);
}

function renderMainConfig(
  values: Map<string, unknown>,
  sourceText: string | null,
): string {
  const document = parseYamlDocument(sourceText, '.axis/config.yml');
  setIfDifferent(document, ['contract_version'], '0.2');
  const organizationId = values.get('organization.id');
  const registryPath = values.get('organization.registry');
  const profileName = values.get('oss_profile.name');
  if (typeof organizationId !== 'string' || typeof registryPath !== 'string' || typeof profileName !== 'string') {
    throw new Error('v0.2 rendering requires selected organization, registry, and OSS profile values');
  }
  setIfDifferent(document, ['organization', 'id'], organizationId);
  setIfDifferent(document, ['organization', 'registry'], registryPath);
  for (const [fieldKey, pathSegments] of [
    ['project.slug', ['project', 'slug']],
    ['project.display_name', ['project', 'display_name']],
    ['package.outbox_dir', ['package', 'outbox_dir']],
    ['release.channel', ['release', 'channel']],
    ['release.gate', ['release', 'gate']],
  ] as Array<[string, string[]]>) {
    const value = values.get(fieldKey);
    if (value !== null && value !== undefined) setIfDifferent(document, pathSegments, value);
  }
  for (const [key, skill] of [
    ['project_init', 'axis-doc-project-init'],
    ['coding_capture', 'axis-code-capture'],
    ['test_report', 'axis-test-report'],
    ['oss_publish', 'axis-ops-oss-publish'],
  ]) {
    setIfDifferent(document, ['skills', key], skill);
  }
  setIfDifferent(document, ['oss', 'provider'], values.get('oss_profile.provider'));
  setIfDifferent(document, ['oss', 'profile'], profileName);
  for (const key of legacyOssFields) deleteIfPresent(document, ['oss', key]);
  return document.toString();
}

function updateRegistry(
  inspection: ProjectInitInspection,
  values: Map<string, unknown>,
  sourceText: string | null,
): string {
  const document = parseYamlDocument(sourceText, inspection.selectors.registry_path);
  const root = documentMap(document, inspection.selectors.registry_path);
  setMapIfDifferent(root, 'schema', 'axis.organization_registry');
  setMapIfDifferent(root, 'schema_version', '0.2');
  const organizations = collectionNode(root, 'organizations', 'organization registry');
  const organizationId = values.get('organization.id');
  const profileName = values.get('oss_profile.name');
  const projectSlug = values.get('project.slug');
  if (typeof organizationId !== 'string' || typeof profileName !== 'string' || typeof projectSlug !== 'string') {
    throw new Error('v0.2 registry rendering requires selected organization, profile, and project values');
  }

  const organization = upsertRecord(organizations, 'id', organizationId, {
    id: organizationId,
    slug: values.get('organization.slug'),
    display_name: values.get('organization.display_name'),
    status: values.get('organization.status'),
    oss_profiles: [],
    projects: [],
  });
  for (const [key, fieldKey] of [
    ['slug', 'organization.slug'],
    ['display_name', 'organization.display_name'],
    ['status', 'organization.status'],
  ] as Array<[string, string]>) {
    const value = values.get(fieldKey);
    if (value !== null && value !== undefined) setMapIfDifferent(organization, key, value);
  }

  const profiles = collectionNode(organization, 'oss_profiles', 'organization');
  const profile = upsertRecord(profiles, 'name', profileName, {
    name: profileName,
    provider: values.get('oss_profile.provider'),
    bucket: values.get('oss_profile.bucket'),
    prefix: values.get('oss_profile.prefix'),
    endpoint_env: values.get('oss_profile.endpoint_env'),
    region_env: values.get('oss_profile.region_env'),
    access_key_id_env: values.get('oss_profile.access_key_id_env'),
    access_key_secret_env: values.get('oss_profile.access_key_secret_env'),
    security_token_env: values.get('oss_profile.security_token_env'),
  });
  for (const key of ['provider', 'bucket', 'prefix', 'endpoint_env', 'region_env', 'access_key_id_env', 'access_key_secret_env', 'security_token_env']) {
    const value = values.get(`oss_profile.${key}`);
    if (value !== null && value !== undefined) setMapIfDifferent(profile, key, value);
  }

  const projects = collectionNode(organization, 'projects', 'organization');
  const matches = isSeq(projects)
    ? projects.items.filter((item) => mapNode(item)?.get('slug') === projectSlug)
    : isMap(projects) && mapNode(projects.get(projectSlug, true))
      ? [projects.get(projectSlug, true)]
      : [];
  if (matches.length > 1) throw new Error(`duplicate project slug in organization: ${projectSlug}`);
  const project = matches.length === 1
    ? mapNode(matches[0])!
    : addRecord(projects, 'slug', projectSlug, {
      slug: projectSlug,
      display_name: values.get('project.display_name'),
    });
  setMapIfDifferent(project, 'slug', projectSlug);
  setMapIfDifferent(project, 'display_name', values.get('project.display_name'));
  return document.toString();
}

function renderLocalConfig(
  inspection: ProjectInitInspection,
  values: Map<string, unknown>,
  sourceText: string | null,
): string | null {
  if (sourceText === null) return null;
  const document = parseYamlDocument(sourceText, '.axis/config.local.yml');
  setIfDifferent(document, ['contract_version'], '0.2');
  for (const [key, value] of values) {
    if (!key.startsWith('local.')) continue;
    const pathSegments = key.split('.');
    if (value === null) {
      deleteIfPresent(document, pathSegments);
    } else {
      setIfDifferent(document, pathSegments, value);
    }
  }
  const authorizedRemovals = new Set(
    inspection.fields
      .filter((field) => field.resolution === 'remove' || field.disposition === 'remove')
      .map((field) => field.key),
  );
  for (const field of inspection.fields) {
    if (!authorizedRemovals.has(field.key)) continue;
    if (values.get(field.key) !== null) throw new Error(`unconfirmed removal field cannot be rendered: ${field.key}`);
    deleteIfPresent(document, field.key.split('.'));
  }
  return document.toString();
}

function renderGitignore(sourceText: string | null): string {
  const lines = (sourceText ?? '').replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const required of ['.axis/config.local.yml', '.axis/docs/', '.axis/outbox/']) {
    if (!lines.includes(required)) lines.push(required);
  }
  return `${lines.join('\n')}\n`;
}

export function renderProjectFiles(options: {
  inspection: ProjectInitInspection;
  answers: ProjectInitAnswers;
  sourceFiles: ProjectSourceFiles;
}): RenderedProjectFiles {
  const answers = validateAnswers(options.inspection, options.answers);
  const values = finalValues(options.inspection, answers);
  return {
    main_config: renderMainConfig(
      values,
      sourceValue(options.sourceFiles, 'main_config'),
    ),
    local_config: renderLocalConfig(
      options.inspection,
      values,
      sourceValue(options.sourceFiles, 'local_config'),
    ),
    target_registry: updateRegistry(
      options.inspection,
      values,
      sourceValue(options.sourceFiles, 'target_registry'),
    ),
    gitignore: renderGitignore(sourceValue(options.sourceFiles, 'gitignore')),
  };
}
