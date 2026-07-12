import type { InspectionFile, ProjectInitInspection } from './inspection.js';

export type Draft = Record<string, unknown>;

export interface CopyOperation {
  op: 'copy';
  from: string;
  to: string;
}

export interface SetOperation {
  op: 'set';
  to: string;
  value: unknown;
}

export interface PromptOperation {
  op: 'prompt';
  to: string;
  prompt: string;
}

export interface DropOperation {
  op: 'drop';
  from: string;
  reason: string;
  redact?: boolean;
}

export type MigrationOperation = CopyOperation | SetOperation | PromptOperation | DropOperation;

export interface ProtocolMigration {
  schema: 'axis.protocol_migration';
  schema_version: 1;
  from_version: string;
  to_version: string;
  operations: MigrationOperation[];
}

export interface MigrationLink {
  fromVersion: string;
  toVersion: string;
}

export interface UnresolvedPrompt {
  target: string;
  prompt: string;
  sourceVersion: string;
}

export interface DroppedEntry {
  sourcePath: string;
  sourceVersion: string;
  reason: string;
  redacted: boolean;
}

export interface ProvenanceOrigin {
  sourceVersion: string;
  sourcePath: string;
}

export interface ProvenanceEntry extends ProvenanceOrigin {
  origins?: ProvenanceOrigin[];
}

export interface MigrateDraftOptions {
  sourceVersion: string;
  latestVersion: string;
  draft: Draft;
  mappingsDir: string;
}

export interface MigrateDraftResult {
  draft: Draft;
  chain: MigrationLink[];
  unresolved: UnresolvedPrompt[];
  dropped: DroppedEntry[];
  provenance: Record<string, ProvenanceEntry>;
}

export type ProjectInitAnswerDecision = 'keep' | 'accept_mapping' | 'accept_recommendation' | 'change';

export interface ProjectInitAnswer {
  key: string;
  value: string | number | boolean | null;
  decision: ProjectInitAnswerDecision;
}

export interface ProjectInitAnswers {
  schema: 'axis.project_init_answers';
  schema_version: 1;
  repo: string;
  latest_contract_version: '0.2';
  selectors: ProjectInitInspection['selectors'];
  files: InspectionFile[];
  decisions: ProjectInitAnswer[];
  final_confirmation: true;
}

export interface ProjectSourceFiles {
  main_config: string | null;
  local_config: string | null;
  target_registry: string | null;
  gitignore: string | null;
  source_registry?: string | null;
}

export interface RenderedProjectFiles {
  main_config: string;
  local_config: string | null;
  target_registry: string;
  gitignore: string;
}
