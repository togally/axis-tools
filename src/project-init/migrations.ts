import { Ajv } from 'ajv';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type {
  Draft,
  DroppedEntry,
  MigrateDraftOptions,
  MigrateDraftResult,
  MigrationLink,
  MigrationOperation,
  ProtocolMigration,
  ProvenanceEntry,
  UnresolvedPrompt,
} from './types.js';

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../schemas/protocol-migration.schema.json',
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function parseVersion(version: string): number[] {
  const parts = version.split('.').map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`invalid protocol version: ${version}`);
  }
  return parts;
}

function isAdjacentVersion(fromVersion: string, toVersion: string): boolean {
  const from = parseVersion(fromVersion);
  const to = parseVersion(toVersion);
  if (from.length !== to.length) return false;
  return from.slice(0, -1).every((part, index) => part === to[index])
    && to.at(-1) === from.at(-1)! + 1;
}

function getPath(draft: Draft, dottedPath: string): { found: boolean; value?: unknown } {
  let current: unknown = draft;
  for (const segment of dottedPath.split('.')) {
    if (!isRecord(current) || !(segment in current)) return { found: false };
    current = current[segment];
  }
  return { found: true, value: current };
}

function setPath(draft: Draft, dottedPath: string, value: unknown): void {
  const segments = dottedPath.split('.');
  let current = draft;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!isRecord(next)) current[segment] = {};
    current = current[segment] as Draft;
  }
  current[segments.at(-1)!] = structuredClone(value);
}

function detectCycle(mappings: ProtocolMigration[]): void {
  const edges = new Map<string, string[]>();
  for (const mapping of mappings) {
    const targets = edges.get(mapping.from_version) ?? [];
    targets.push(mapping.to_version);
    edges.set(mapping.from_version, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (version: string): void => {
    if (visiting.has(version)) throw new Error('cycle detected in protocol migrations');
    if (visited.has(version)) return;
    visiting.add(version);
    for (const target of edges.get(version) ?? []) visit(target);
    visiting.delete(version);
    visited.add(version);
  };
  for (const version of edges.keys()) visit(version);
}

async function loadMappings(mappingsDir: string): Promise<ProtocolMigration[]> {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as object;
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  const filenames = (await readdir(mappingsDir))
    .filter((filename) => filename.endsWith('.yml') || filename.endsWith('.yaml'))
    .sort();
  const mappings: ProtocolMigration[] = [];

  for (const filename of filenames) {
    let parsed: unknown;
    try {
      parsed = parse(await readFile(path.join(mappingsDir, filename), 'utf8'));
    } catch {
      throw new Error(`invalid protocol migration mapping: ${filename}`);
    }
    if (!validate(parsed)) throw new Error(`schema validation failed for protocol migration: ${filename}`);
    mappings.push(parsed as ProtocolMigration);
  }
  return mappings;
}

function buildChain(
  mappings: ProtocolMigration[],
  sourceVersion: string,
  latestVersion: string,
): { mappings: ProtocolMigration[]; chain: MigrationLink[] } {
  const bySource = new Map<string, ProtocolMigration>();
  for (const mapping of mappings) {
    parseVersion(mapping.from_version);
    parseVersion(mapping.to_version);
    const existing = bySource.get(mapping.from_version);
    if (existing) {
      throw new Error(`duplicate migration edge: ${mapping.from_version} -> ${mapping.to_version}`);
    }
    bySource.set(mapping.from_version, mapping);
  }
  detectCycle(mappings);
  for (const mapping of mappings) {
    if (!isAdjacentVersion(mapping.from_version, mapping.to_version)) {
      throw new Error(`non-adjacent protocol migration: ${mapping.from_version} -> ${mapping.to_version}`);
    }
  }

  const chain: MigrationLink[] = [];
  const chainMappings: ProtocolMigration[] = [];
  let currentVersion = sourceVersion;
  while (currentVersion !== latestVersion) {
    const mapping = bySource.get(currentVersion);
    if (!mapping) throw new Error(`missing migration link: ${currentVersion} -> ${latestVersion}`);
    chain.push({ fromVersion: mapping.from_version, toVersion: mapping.to_version });
    chainMappings.push(mapping);
    currentVersion = mapping.to_version;
  }
  return { mappings: chainMappings, chain };
}

function applyMapping(
  input: Draft,
  mapping: ProtocolMigration,
  unresolved: UnresolvedPrompt[],
  dropped: DroppedEntry[],
  provenance: Record<string, ProvenanceEntry>,
): Draft {
  const output: Draft = {};
  const writtenTargets = new Set<string>();
  mapping.operations.forEach((operation: MigrationOperation, operationIndex) => {
    if (operation.op === 'drop') {
      if (getPath(input, operation.from).found) {
        dropped.push({
          sourcePath: operation.from,
          sourceVersion: mapping.from_version,
          reason: operation.reason,
          redacted: true,
        });
      }
      return;
    }

    if (writtenTargets.has(operation.to)) {
      throw new Error(`conflicting writes to target: ${operation.to}`);
    }
    writtenTargets.add(operation.to);

    if (operation.op === 'prompt') {
      unresolved.push({
        target: operation.to,
        prompt: operation.prompt,
        sourceVersion: mapping.from_version,
      });
      return;
    }

    if (operation.op === 'copy') {
      const source = getPath(input, operation.from);
      if (!source.found) return;
      setPath(output, operation.to, source.value);
      provenance[operation.to] = provenance[operation.from] ?? {
        sourceVersion: mapping.from_version,
        sourcePath: operation.from,
      };
      return;
    }

    setPath(output, operation.to, operation.value);
    provenance[operation.to] = {
      sourceVersion: mapping.from_version,
      sourcePath: `$mapping.operations[${operationIndex}].value`,
    };
  });
  return output;
}

export async function migrateDraft(options: MigrateDraftOptions): Promise<MigrateDraftResult> {
  const mappings = await loadMappings(options.mappingsDir);
  const { mappings: chainMappings, chain } = buildChain(
    mappings,
    options.sourceVersion,
    options.latestVersion,
  );
  const unresolved: UnresolvedPrompt[] = [];
  const dropped: DroppedEntry[] = [];
  const provenance: Record<string, ProvenanceEntry> = {};
  let draft = structuredClone(options.draft);
  for (const mapping of chainMappings) {
    draft = applyMapping(draft, mapping, unresolved, dropped, provenance);
  }
  return { draft, chain, unresolved, dropped, provenance };
}
