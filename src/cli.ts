#!/usr/bin/env node
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, type Dirent } from 'node:fs';
import { appendFile, chmod, copyFile, cp, readdir, readFile, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

type Json = Record<string, unknown>;
type Status = 'running' | 'blocked' | 'stopped' | 'idle';
type Phase =
  | 'starting'
  | 'waiting_prompt'
  | 'reading'
  | 'editing'
  | 'executing'
  | 'testing'
  | 'waiting_permission'
  | 'compacting'
  | 'stopped'
  | 'blocked'
  | 'unknown';

interface NormalizedEvent {
  ts: string;
  session_id: string | null;
  turn_id: string | null;
  cwd: string;
  event: string;
  phase: Phase;
  status: Status;
  tool_name?: string | null;
  tool_use_id?: string | null;
  matcher_hint?: string | null;
  source?: string | null;
  trigger?: string | null;
  prompt_preview?: string | null;
  transcript_path?: string | null;
  permission_mode?: string | null;
  outcome?: 'ok' | 'error' | 'blocked' | null;
  message?: string | null;
  raw: Json;
}

interface LatestState {
  updated_at: string;
  session_id: string | null;
  turn_id: string | null;
  cwd: string;
  status: Status;
  phase: Phase;
  last_event: string;
  last_tool: string | null;
  last_tool_use_id: string | null;
  last_prompt_preview: string | null;
  last_outcome: string | null;
  transcript_path: string | null;
  permission_mode: string | null;
  source: string | null;
  trigger: string | null;
  event_count: number;
  events_path: string;
}

interface ProjectBinding {
  backendUrl: string;
  mcpUrl?: string;
  token?: string | null;
  key?: string | null;
  session?: string | null;
  account?: string | null;
  user?: OrbitUser | null;
  productLineUuid?: string | null;
  projectUuid?: string | null;
  productLineId?: string | null;
  projectId?: string | null;
  productLineName?: string | null;
  projectName?: string | null;
  owner: string | null;
  repo: string;
  selectedAgent?: AgentChoice | null;
  skillPath?: string | null;
  agentSkillPath?: string | null;
  repoPath?: string | null;
  githubRepo?: string | null;
  sourceRepo?: string | null;
  repositoryUrl?: string | null;
  gitUrl?: string | null;
  remoteUrl?: string | null;
  updatedAt: string;
}

interface ProductLineBinding {
  backendUrl: string;
  mcpUrl?: string;
  token: string;
  key: string;
  session?: string | null;
  account: string | null;
  user: OrbitUser | null;
  productLineUuid: string | null;
  productLineId: string;
  productLineName: string;
  owner?: string | null;
  rootPath: string;
  selectedAgent?: AgentChoice | null;
  skillPath?: string | null;
  agentSkillPath?: string | null;
  updatedAt: string;
}

type AgentChoice = 'codex' | 'claude-code' | 'none';
type PoolAgentChoice = AgentChoice | 'current';
type InstallAgentChoice = 'codex' | 'claude-code' | 'all';
type StartWorkAgentChoice = 'codex' | 'claude-code' | 'claude';
type CreateEmployeeAgentChoice = 'codex' | 'claude-code';
type CreateEmployeeLanguage = 'zh' | 'en';
type EmployeeRole = 'development' | 'qa' | 'devops' | 'architecture' | 'product' | 'design';

const EMPLOYEE_ROLE_OPTIONS: { value: EmployeeRole; label: string }[] = [
  { value: 'development', label: '开发' },
  { value: 'qa', label: '测试' },
  { value: 'devops', label: '运维' },
  { value: 'architecture', label: '架构' },
  { value: 'product', label: '产品' },
  { value: 'design', label: '美工' },
];

interface PoolConfig {
  command: string;
  pool: string;
  kind: 'requirement' | 'idea' | 'bug' | 'suggestion';
  displayName: string;
  skill: string;
  defaultDir: string;
}

interface PoolArtifact {
  schemaVersion: 'orbit.pool.artifact.v1';
  kind: PoolConfig['kind'];
  title: string;
  summary: string;
  status: string;
  markdown: string;
  sections: unknown[];
  workItems: unknown[];
}

interface PoolSubmitResult {
  ok: boolean;
  mode: 'hub' | 'local' | 'dry-run';
  repo: string;
  pool: string;
  artifact: PoolArtifact;
  id: string | null;
  url: string | null;
  savedPath: string | null;
  itemsCount?: number;
  warning: string | null;
  response?: unknown;
}

interface PoolSeedResult {
  ok: boolean;
  mode: 'hub-seed' | 'local-seed' | 'dry-run';
  repo: string;
  pool: string;
  kind: PoolConfig['kind'];
  title: string;
  seed: string;
  summary: string;
  status: string;
  id: string | null;
  url: string | null;
  savedPath: string | null;
  warning: string | null;
  response?: unknown;
}

interface DiscoveredProjectBinding {
  repoPath: string;
  configPath: string;
  binding: ProjectBinding;
}

interface DiscoveredProductLineBinding {
  rootPath: string;
  configPath: string;
  binding: ProductLineBinding;
}

interface PoolSeedBindingDiscovery {
  projects: DiscoveredProjectBinding[];
  productLines: DiscoveredProductLineBinding[];
  scannedDirs: number;
  capped: boolean;
}

interface PoolSeedTarget {
  repoPath: string;
  binding: ProjectBinding | null;
  warning: string | null;
}

interface PoolTemplateContext {
  template: Json;
  projectContext: Json;
  warning: string | null;
}

interface WorkPrerequisiteStep {
  name: string;
  ok: boolean;
  status: string;
  path?: string;
  command?: string;
  warning?: string;
}

interface MethodologyCandidate {
  skill: string;
  source: string;
  path: string;
}

interface MethodologyInjection {
  skill: string;
  source: string | null;
  path: string | null;
  content: string;
  injected: boolean;
  warning: string | null;
  truncated: boolean;
  bytes: number;
}

class OrbitHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface PoolListItem {
  id: string | null;
  title: string;
  kind: string | null;
  sourceType: string | null;
  path?: string;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface OrbitUser {
  id?: string | null;
  account?: string | null;
  displayName?: string | null;
  name?: string | null;
  role?: string | null;
  permissions?: string[];
}

interface OrbitLoginSession {
  token: string;
  key: string;
  session?: string | null;
  user: OrbitUser;
}

interface CachedOrbitLoginSession extends OrbitLoginSession {
  backendUrl: string;
  mcpUrl?: string | null;
  account: string;
  updatedAt: string;
}

interface OrbitProductLine {
  id: string;
  uuid: string | null;
  name: string;
  summary?: string | null;
  status?: string | null;
}

interface OrbitProjectModule {
  id: string;
  uuid: string | null;
  productId?: string | null;
  projectId?: string | null;
  name: string;
  summary?: string | null;
  status?: string | null;
  repoPath?: string | null;
  githubRepo?: string | null;
  sourceRepo?: string | null;
  repositoryAddress?: string | null;
  repositoryUrl?: string | null;
  gitUrl?: string | null;
  remoteUrl?: string | null;
}

interface OrbitProductDetail {
  product: OrbitProductLine;
  modules: OrbitProjectModule[];
}

interface AxisWorkspaceProject {
  workspaceRoot: string;
  product: OrbitProductLine;
  project: OrbitProjectModule;
  repoPath: string;
  binding: ProjectBinding;
  materialized: boolean;
  repoUrl: string | null;
  syncStatus: string;
  warning: string | null;
}

interface StartWorkTarget {
  repoPath: string;
  binding: ProjectBinding;
  productLineId: string | null;
  productLineName: string | null;
  projectId: string;
  projectName: string | null;
}

interface StartWorkContextDocument {
  key: string;
  content: string;
  markdown?: string;
  found?: boolean;
  warning?: string;
  source?: 'employee' | 'project';
  employeeRole?: EmployeeRole;
}

interface StartWorkHeartbeatState {
  status: string;
  currentWorkItemId: string | null;
  scope: Json;
}

interface StartWorkSummary {
  ready: number;
  claimed: number;
  executed: number;
  failed: number;
  conflicts: number;
  idle: number;
  warnings: string[];
}

type StartWorkSelectionSource = 'agent' | 'fallback';

interface StartWorkSelectionDecision {
  selectedWorkItemId: string | null;
  reason: string;
  source: StartWorkSelectionSource;
  warning?: string;
}

interface AxisWorkspaceResolution {
  workspaceRoot: string;
  backendUrl: string;
  account: string;
  login: OrbitLoginSession;
  projects: AxisWorkspaceProject[];
  warnings: string[];
  catalogPath: string;
}

interface PromptSession {
  question(prompt: string, options?: { hidden?: boolean }): Promise<string>;
  close(): void;
}

interface ProjectCandidate {
  name: string;
  path: string;
  markers: string[];
}

const SHARED_BACKEND_URL = 'http://117.72.14.134:18081';
const execFileAsync = promisify(execFile);
const POOL_SEED_DISCOVERY_MAX_DEPTH = 2;
const POOL_SEED_DISCOVERY_MAX_DIRS = 80;
const POOL_SEED_DISCOVERY_MAX_CHILDREN = 60;
const POOL_SEED_DISCOVERY_MAX_CANDIDATES = 20;
const POOL_SEED_DISCOVERY_EXCLUDED_DIRS = new Set([
  '.axis',
  '.cache',
  '.git',
  '.hg',
  '.next',
  '.orbit',
  '.svn',
  'build',
  'cache',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'vendor',
]);
const POOLS: Record<string, PoolConfig> = {
  'axis-ide': { command: 'axis-ide', pool: 'ide', kind: 'idea', displayName: '想法池', skill: 'oribit-idea', defaultDir: 'docs/ideas' },
  'axis-req': { command: 'axis-req', pool: 'req', kind: 'requirement', displayName: '需求池', skill: 'orbit-requirement', defaultDir: 'docs/requirements' },
  'axis-bug': { command: 'axis-bug', pool: 'bug', kind: 'bug', displayName: 'Bug池', skill: 'orbit-bug', defaultDir: 'docs/bugs' },
  'axis-sug': { command: 'axis-sug', pool: 'sug', kind: 'suggestion', displayName: '优化池', skill: 'orbit-suggestion', defaultDir: 'docs/suggestions' },
  'orbit-ide': { command: 'orbit-ide', pool: 'ide', kind: 'idea', displayName: '想法池', skill: 'oribit-idea', defaultDir: 'docs/ideas' },
  'orbit-req': { command: 'orbit-req', pool: 'req', kind: 'requirement', displayName: '需求池', skill: 'orbit-requirement', defaultDir: 'docs/requirements' },
  'orbit-bug': { command: 'orbit-bug', pool: 'bug', kind: 'bug', displayName: 'Bug池', skill: 'orbit-bug', defaultDir: 'docs/bugs' },
  'orbit-sug': { command: 'orbit-sug', pool: 'sug', kind: 'suggestion', displayName: '优化池', skill: 'orbit-suggestion', defaultDir: 'docs/suggestions' },
};
const AXIS_POOLS_BY_KIND: Record<PoolConfig['kind'], PoolConfig> = {
  idea: POOLS['axis-ide'],
  requirement: POOLS['axis-req'],
  bug: POOLS['axis-bug'],
  suggestion: POOLS['axis-sug'],
};
const POOL_METHODOLOGY_BY_KIND: Record<PoolConfig['kind'], string> = {
  idea: 'plan-ceo-review',
  requirement: 'superpowers:brainstorm',
  bug: 'superpowers:systematic-debugging',
  suggestion: 'superpowers:brainstorm',
};
const METHODOLOGY_INJECTION_MAX_CHARS = 24_000;
const LIFECYCLE_NEW = 'NEW';
const LIFECYCLE_WAIT_REVIEW = 'WAIT_REVIEW';
const LIFECYCLE_WAIT_USER_CONFIRM = 'WAIT_USER_CONFIRM';
const LIFECYCLE_WAIT_CODE = 'WAIT_CODE';
const REVIEW_INPUT_STATUSES = [LIFECYCLE_NEW, LIFECYCLE_WAIT_REVIEW, 'pending-confirmation'] as const;
const CODING_INPUT_STATUSES = [LIFECYCLE_WAIT_CODE, 'ready'] as const;
const SAFE_BINDING_KEYS = [
  'productLineId',
  'productLineUuid',
  'projectId',
  'projectUuid',
  'productLineName',
  'projectName',
  'backendUrl',
  'mcpUrl',
  'selectedAgent',
  'repo',
] as const;
const LOCAL_BINDING_GLOBAL_KEYS = [
  'productLineUuid',
  'projectUuid',
  'productLineId',
  'projectId',
  'productLineName',
  'projectName',
  'owner',
  'repo',
  'repoPath',
  'repositoryUrl',
  'gitUrl',
  'remoteUrl',
  'lastRepo',
  'lastProductLineRoot',
];

function printUsage(): void {
  console.log(`axis\n\nAliases: axis-tools, orbit, orbit-tools\n\nCommands:\n  login\n  me\n  init\n  bind\n  pull\n  init-product-line\n  create-employee [--agent <codex|claude-code|cc>] [--language <zh|en>] [--backend-url <url>] [--json]\n  install [--agent <codex|claude-code|cc|all>] [--force]\n  logout [--backend-url <url>]\n  axis-req <text> [--repo <path>] [--json]\n  axis-req --list [--repo <path>] [--page <n>] [--page-size <n>] [--json]\n  axis-req --delete <id> [--repo <path>] [--yes] [--json]\n  axis-ide|axis-bug|axis-sug use the same seed/list/delete flags\n  axis start-work [--agent <codex|claude-code|claude>] [--foreground] [--interval <seconds>] [--heartbeat-interval <seconds>] [--json] [--employee-id <id>] [--project-id <id>|--product-line-id <id>]\n  axis work-status [--json]\n  axis work-review [--repo <path>] [--project-id <id>|--project-uuid <uuid>] [--interval <seconds>|--sleep <seconds>] [--iterations <n>|--max-iterations <n>|--once] [--json]\n  axis work-coding [--repo <path>] [--project-id <id>|--project-uuid <uuid>] [--interval <seconds>|--sleep <seconds>] [--iterations <n>|--max-iterations <n>|--once] [--json]\n  codex-hook ingest [--file <json-file>] [--repo <path>]\n  codex-status current [--repo <path>] [--json]\n  codex-status tail [--repo <path>] [--limit <n>]\n  codex-status summary [--repo <path>]\n  codex-run once --repo <path> --prompt <text> [--json] [--model <model>]\n  mcp install [--repo <path>] [--config <hermes-config>] [--backend-url <url>] [--mcp-url <url>] [--server-name <name>]\n  project bind --interactive [--repo <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project bind [--repo <path>] --product-line-uuid <uuid> --project-uuid <uuid> [--product-line-id <id>] [--project-id <id>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project show [--repo <path>] [--json]\n\nDeprecated worker commands:\n  axis work-review [--repo <path>] ... = deprecated review/refine worker; use start-work for coding execution\n  axis work-coding [--repo <path>] ... = deprecated coding probe; use start-work for coding execution\n  work-review and work-coding are deprecated; use axis start-work\n\nDeprecated worker aliases:\n  axis work-once --repo <path> [--agent <codex|claude-code|none>] [--json]\n  axis work-loop --repo <path> [--iterations <n>|--max-iterations <n>|--once] [--interval <seconds>|--sleep <seconds>] [--agent <codex|claude-code|none>] [--json]\n  axis work once|loop ... = deprecated aliases for the review worker\n\nMain flow:\n  login = prompt for AxisNode account and hidden password; cache session\n  me = show current AxisNode user\n  init = packaged skill setup only\n  bind = bind a repo or product-line root to AxisNode\n  pull = clone/pull maintained repos from AxisNode into AXIS_HOME or ~/.axis by default\n  create-employee = create a local Axis employee runtime and register it to Axis Hub\n\nPool examples:\n  axis-req "商品评价支持图片"\n  axis-bug "登录失败"\n  axis-sug "优化按钮文案" --json\n  axis-req --list --page 1 --page-size 20\n\nWorker examples:\n  axis start-work --agent codex\n  axis start-work --agent claude-code\n  axis start-work --foreground --heartbeat-interval 30\n  axis work-status\n  axis work-review --iterations 1 --json\n  axis work-coding --once --json\n\nPool flags:\n  --local / --save-local = force local seed save instead of Hub submit\n  --save = deprecated alias for --local\n  --from <file> / --stdin = read seed input from file or stdin\n  --json = machine-readable output\n\nAdvanced overrides:\n  init [--repo <path>] [--backend-url <url>] [--agent <codex|claude-code|none>]\n  bind [--repo <path>] [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n  pull [--root <path>] [--backend-url <url>]\n  init-product-line [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n`);
  console.log(`Employee role flag:\n  create-employee [--agent <codex|claude-code|cc>] [--language <zh|en>] [--role <development|qa|devops|architecture|product|design>]\n`);
  console.log(`Pool interactive defaults:\n  axis-req --list = interactive pagination, default 10 items/page\n  axis-req --delete = choose an item interactively, then type yes to confirm\n  --yes is for scripts/CI; --json keeps machine-readable non-interactive output\n`);
}

function printStartWorkUsage(): void {
  console.log(`axis start-work\n\nUsage:\n  axis start-work [--agent <codex|claude-code|claude>] [--foreground] [--interval <seconds>] [--heartbeat-interval <seconds>] [--json] [--employee-id <id>] [--project-id <id>|--product-line-id <id>]\n\nDefault behavior:\n  Starts a detached background worker and returns the worker session id, pid, agent, scope, and log path immediately. With --employee-id, the worker reads that employee's remote Hub soul.md / skill.md / memory.md, asks the agent to choose the best matching WAIT_CODE WorkItem for that employee's responsibilities, then claims only the selected item.\n\nFlags:\n  --agent <codex|claude-code|claude>\n                                   Agent runtime. Defaults to configured selectedAgent, then local codex/claude detection.\n  --employee-id <id>               Attach an Axis employee id to worker scope, prompts, claims, heartbeats, and remote Hub employee context.\n  --foreground                     Run in this terminal and stream logs for debugging\n  --repo <path>                    Narrow to one bound repo\n  --project-id <id>, --project-uuid <uuid>\n                                   Narrow workspace mode to one accessible project\n  --product-line-id <id>, --product-line-uuid <uuid>\n                                   Narrow workspace mode to one accessible product line\n  --interval <seconds>             Seconds between WAIT_CODE polls\n  --heartbeat-interval <seconds>   Seconds between Hub worker heartbeats; default 30\n  --json                           Print machine-readable output\n  --help, -h                       Print this help\n\nExamples:\n  axis start-work --agent codex\n  axis start-work --agent claude-code\n  axis start-work --employee-id emp_example\n  axis start-work --foreground --heartbeat-interval 30\n`);
  console.log(`Responsibility categories:\n  开发/development, 测试/QA, 运维/DevOps, 架构/architecture, 产品/product, 美工/design/visual\n`);
}

function printCreateEmployeeUsage(): void {
  console.log(`axis create-employee\n\nUsage:\n  axis create-employee [--agent <codex|claude-code|cc>] [--language <zh|en>] [--role <development|qa|devops|architecture|product|design>] [--backend-url <url>] [--json]\n\nDefault behavior:\n  Creates ~/.axis/employees/<employeeId>/ with soul.md, skill.md, memory.md, config.json, then registers the employee to Axis Hub.\n\nFlags:\n  --agent <codex|claude-code|cc>   Agent runtime used to generate soul.md. Interactive mode asks when both are available.\n  --language <zh|en>               Document/profile language. Aliases: chinese, english. Interactive default is 中文.\n  --role <role>                    Optional structured role: development, qa, devops, architecture, product, or design.\n  --backend-url <url>              Axis Hub backend. Defaults to cached config, then shared backend.\n  --json                           Print machine-readable output and never prompt.\n  --help, -h                       Print this help\n`);
}

function printWorkWorkerUsage(workerType: WorkWorkerType): void {
  const command = workerType === 'review' ? 'work-review' : 'work-coding';
  const queueText = workerType === 'review'
    ? '\nReview queue:\n  Consumes NEW, WAIT_REVIEW, and legacy pending-confirmation review inputs across accessible projects.\n'
    : '\nCoding queue:\n  Probes WAIT_CODE and legacy ready WorkItems across accessible projects.\n';
  console.log(`axis ${command}\n\nUsage:\n  axis ${command} [--repo <path>] [--project-id <id>|--project-uuid <uuid>] [--interval <seconds>|--sleep <seconds>] [--iterations <n>|--max-iterations <n>|--once] [--json]\n\nDefault scope:\n  Without --repo, use AXIS_HOME or ~/.axis, sync accessible AxisNode projects, and loop all permitted project queues.${queueText}\nFlags:\n  --repo <path>                    Narrow to one repo and read its AxisNode project binding\n  --project-id <id>, --project-uuid <uuid>\n                                   Narrow workspace mode to one accessible project\n  --backend-url <url>              AxisNode backend; defaults to cached login backend or shared backend\n  --interval <seconds>, --sleep <seconds>\n                                   Seconds between polls\n  --iterations <n>, --max-iterations <n>\n                                   Run a bounded number of polls\n  --once                           Alias for --iterations 1\n  --json                           Print machine-readable JSON output\n  --help, -h                       Print this help\n`);
}

function isHelpFlag(value: string | undefined): boolean {
  return value === '--help' || value === '-h';
}

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseJsonText(text: string): Json {
  return JSON.parse(text) as Json;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function combineWarnings(...warnings: (string | null | undefined)[]): string | null {
  const present = warnings.filter((warning): warning is string => Boolean(warning));
  return present.length > 0 ? present.join(' ') : null;
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function homeDir(): string {
  return process.env.HOME ?? process.cwd();
}

function defaultBackendUrl(): string {
  return process.env.AXIS_BACKEND_URL ?? process.env.ORBIT_BACKEND_URL ?? SHARED_BACKEND_URL;
}

function defaultMcpUrl(backendUrl: string): string {
  return process.env.AXIS_MCP_URL ?? process.env.ORBIT_MCP_URL ?? `${backendUrl.replace(/\/$/, '')}/api/mcp`;
}

function resolveMcpUrl(explicit: string | null, existing?: string | null): string | undefined {
  return explicit ?? existing ?? undefined;
}

function resolveRepoArg(): string {
  return path.resolve(getArg('--repo') ?? process.cwd());
}

function resolveProductLineRootArg(): string {
  return path.resolve(getArg('--root') ?? getArg('--repo') ?? process.cwd());
}

function orbitDir(repoPath: string): string {
  return path.join(repoPath, '.orbit');
}

function axisDir(repoPath: string): string {
  return path.join(repoPath, '.axis');
}

function projectConfigPath(repoPath: string): string {
  const axisPath = axisProjectConfigPath(repoPath);
  return existsSync(axisPath) ? axisPath : legacyProjectConfigPath(repoPath);
}

function productLineConfigPath(rootPath: string): string {
  const axisPath = axisProductLineConfigPath(rootPath);
  return existsSync(axisPath) ? axisPath : legacyProductLineConfigPath(rootPath);
}

function axisProjectConfigPath(repoPath: string): string {
  return path.join(axisDir(repoPath), 'project.json');
}

function legacyProjectConfigPath(repoPath: string): string {
  return path.join(orbitDir(repoPath), 'project.json');
}

function axisProductLineConfigPath(rootPath: string): string {
  return path.join(axisDir(rootPath), 'product-line.json');
}

function legacyProductLineConfigPath(rootPath: string): string {
  return path.join(orbitDir(rootPath), 'product-line.json');
}

function cliPackageRoot(): string {
  const cliFile = fileURLToPath(import.meta.url);
  const cliDir = path.dirname(cliFile);
  return path.basename(cliDir) === 'dist' ? path.dirname(cliDir) : process.cwd();
}

function globalOrbitConfigPath(): string {
  return path.join(homeDir(), '.orbit', 'config.json');
}

function axisHomeDir(): string {
  return path.resolve(process.env.AXIS_HOME ?? path.join(homeDir(), '.axis'));
}

function axisWorkspaceCatalogPath(workspaceRoot = axisHomeDir()): string {
  return path.join(workspaceRoot, 'catalog.json');
}

function stableOrbitSkillPath(skillName = 'orbit-workflow'): string {
  return path.join(homeDir(), '.orbit', 'skills', skillName, 'SKILL.md');
}

function bundledSkillsDir(): string {
  return path.join(cliPackageRoot(), 'skills');
}

function bundledOrbitSkillPath(skillName = 'orbit-workflow'): string {
  return path.join(bundledSkillsDir(), skillName, 'SKILL.md');
}

function agentSkillPath(agent: AgentChoice, skillName = 'orbit-workflow'): string | null {
  if (agent === 'codex') return path.join(homeDir(), '.codex', 'skills', skillName, 'SKILL.md');
  if (agent === 'claude-code') return path.join(homeDir(), '.claude', 'skills', skillName, 'SKILL.md');
  return null;
}

function hermesSkillPath(skillName: string): string {
  return path.join(homeDir(), '.hermes', 'skills', skillName, 'SKILL.md');
}

function hermesSkillsDir(): string {
  return path.join(homeDir(), '.hermes', 'skills');
}

function codexSuperpowersSkillRoot(): string {
  return path.join(homeDir(), '.codex', 'skills', 'superpowers');
}

function gstackHomeDir(): string {
  return path.resolve(process.env.AXIS_GSTACK_HOME ?? path.join(homeDir(), 'gstack'));
}

function userLocalBinDir(): string {
  return path.join(homeDir(), '.local', 'bin');
}

function gstackWrapperPath(): string {
  return path.join(userLocalBinDir(), 'gstack');
}

function defaultHermesConfigPath(): string {
  return path.join(homeDir(), '.hermes', 'config.yaml');
}

async function readJsonFile<T extends Json>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function readGlobalOrbitConfig(): Promise<Json> {
  return readJsonFile<Json>(globalOrbitConfigPath(), {});
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function buildHermesOrbitYaml(serverName: string, backendUrl: string, mcpUrl: string): string[] {
  return [
    `  ${serverName}:`,
    '    enabled: true',
    '    transport: http',
    `    url: ${yamlQuote(mcpUrl)}`,
    '    headers:',
    `      x-orbit-backend-url: ${yamlQuote(backendUrl)}`,
  ];
}

function upsertHermesYaml(content: string, serverName: string, backendUrl: string, mcpUrl: string): string {
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const block = buildHermesOrbitYaml(serverName, backendUrl, mcpUrl);
  const mcpIndex = lines.findIndex((line) => /^mcp_servers:\s*$/.test(line));

  if (mcpIndex === -1) {
    return ['mcp_servers:', ...block, '', ...lines].join('\n').replace(/\n*$/, '\n');
  }

  let insertAt = mcpIndex + 1;
  let blockEnd = insertAt;
  while (blockEnd < lines.length && (lines[blockEnd].startsWith(' ') || lines[blockEnd].trim() === '')) {
    blockEnd++;
  }

  const nextLines: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (index > mcpIndex && index < blockEnd && lines[index] === `  ${serverName}:`) {
      index++;
      while (index < blockEnd && (lines[index].startsWith('    ') || lines[index].trim() === '')) {
        index++;
      }
      index--;
      continue;
    }
    nextLines.push(lines[index]);
  }

  insertAt = nextLines.findIndex((line) => /^mcp_servers:\s*$/.test(line)) + 1;
  nextLines.splice(insertAt, 0, ...block);
  return nextLines.join('\n').replace(/\n*$/, '\n');
}

async function installHermesMcp(configPath: string, serverName: string, backendUrl: string, mcpUrl: string): Promise<void> {
  ensureDir(path.dirname(configPath));
  const isJson = configPath.endsWith('.json');

  if (isJson) {
    const config = await readJsonFile<Json>(configPath, {});
    const mcpServers = typeof config.mcp_servers === 'object' && config.mcp_servers !== null ? config.mcp_servers as Json : {};
    mcpServers[serverName] = {
      enabled: true,
      transport: 'http',
      url: mcpUrl,
      headers: {
        'x-orbit-backend-url': backendUrl,
      },
    };
    config.mcp_servers = mcpServers;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return;
  }

  const current = existsSync(configPath) ? await readFile(configPath, 'utf8') : '';
  await writeFile(configPath, upsertHermesYaml(current, serverName, backendUrl, mcpUrl), 'utf8');
}

async function writeGlobalOrbitConfig(values: Json): Promise<void> {
  const filePath = globalOrbitConfigPath();
  ensureDir(path.dirname(filePath));
  const current = await readGlobalOrbitConfig();
  await writeFile(filePath, `${JSON.stringify(cleanGlobalOrbitConfig({ ...current, ...values, updatedAt: new Date().toISOString() }), null, 2)}\n`, 'utf8');
}

async function readProjectBinding(repoPath: string): Promise<ProjectBinding | null> {
  return (await readProjectBindingWithPath(repoPath))?.binding ?? null;
}

async function readProjectBindingWithPath(repoPath: string): Promise<DiscoveredProjectBinding | null> {
  for (const filePath of [axisProjectConfigPath(repoPath), legacyProjectConfigPath(repoPath)]) {
    try {
      return {
        repoPath,
        configPath: filePath,
        binding: JSON.parse(await readFile(filePath, 'utf8')) as ProjectBinding,
      };
    } catch {
      // Try the next supported binding path.
    }
  }
  return null;
}

async function readProductLineBindingWithPath(rootPath: string): Promise<DiscoveredProductLineBinding | null> {
  for (const filePath of [axisProductLineConfigPath(rootPath), legacyProductLineConfigPath(rootPath)]) {
    try {
      return {
        rootPath,
        configPath: filePath,
        binding: JSON.parse(await readFile(filePath, 'utf8')) as ProductLineBinding,
      };
    } catch {
      // Try the next supported binding path.
    }
  }
  return null;
}

function inferPhase(eventName: string, toolName: string | null): Phase {
  if (eventName === 'SessionStart') return 'starting';
  if (eventName === 'UserPromptSubmit') return 'waiting_prompt';
  if (eventName === 'PermissionRequest') return 'waiting_permission';
  if (eventName === 'PreCompact' || eventName === 'PostCompact') return 'compacting';
  if (eventName === 'Stop') return 'stopped';

  const tool = (toolName ?? '').toLowerCase();
  if (/(read|grep|glob|search|ls|find)/.test(tool)) return 'reading';
  if (/(edit|write|patch)/.test(tool)) return 'editing';
  if (/(pytest|test|jest|vitest|mocha)/.test(tool)) return 'testing';
  if (/(bash|shell|command|npm|pnpm|yarn|node)/.test(tool)) return 'executing';
  return 'unknown';
}

function inferStatus(eventName: string, phase: Phase): Status {
  if (eventName === 'Stop') return 'stopped';
  if (eventName === 'PermissionRequest') return 'blocked';
  if (phase === 'blocked') return 'blocked';
  return 'running';
}

function promptPreview(prompt: string | null): string | null {
  if (!prompt) return null;
  return prompt.replace(/\s+/g, ' ').slice(0, 140);
}

function resolveRepoPath(raw: Json, repoArg: string | null): string {
  if (repoArg) return path.resolve(repoArg);
  const cwd = safeString(raw.cwd);
  if (cwd) return cwd;
  return process.cwd();
}

function statusDir(repoPath: string): string {
  return path.join(repoPath, '.codex-status');
}

function latestPath(repoPath: string): string {
  return path.join(statusDir(repoPath), 'latest.json');
}

function eventsPath(repoPath: string): string {
  return path.join(statusDir(repoPath), 'events.jsonl');
}

async function readLatest(repoPath: string): Promise<LatestState | null> {
  try {
    const content = await readFile(latestPath(repoPath), 'utf8');
    return JSON.parse(content) as LatestState;
  } catch {
    return null;
  }
}

async function countEvents(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf8');
    return content.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function appendNormalizedEvent(repoPath: string, normalized: NormalizedEvent): Promise<void> {
  const dir = statusDir(repoPath);
  ensureDir(dir);
  const eventLogPath = eventsPath(repoPath);
  await appendFile(eventLogPath, `${JSON.stringify(normalized)}\n`, 'utf8');
  const total = await countEvents(eventLogPath);
  const previous = await readLatest(repoPath);
  const latest: LatestState = {
    updated_at: normalized.ts,
    session_id: normalized.session_id,
    turn_id: normalized.turn_id,
    cwd: repoPath,
    status: normalized.status,
    phase: normalized.phase,
    last_event: normalized.event,
    last_tool: normalized.tool_name ?? null,
    last_tool_use_id: normalized.tool_use_id ?? null,
    last_prompt_preview: normalized.prompt_preview ?? previous?.last_prompt_preview ?? null,
    last_outcome: normalized.outcome ?? null,
    transcript_path: normalized.transcript_path ?? null,
    permission_mode: normalized.permission_mode ?? null,
    source: normalized.source ?? null,
    trigger: normalized.trigger ?? null,
    event_count: total,
    events_path: eventLogPath,
  };
  await writeFile(latestPath(repoPath), `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
}

function normalizeEvent(raw: Json): NormalizedEvent {
  const event = safeString(raw.hook_event_name) ?? safeString(raw.event) ?? 'Unknown';
  const toolName = safeString(raw.tool_name);
  const phase = inferPhase(event, toolName);
  const status = inferStatus(event, phase);
  return {
    ts: new Date().toISOString(),
    session_id: safeString(raw.session_id),
    turn_id: safeString(raw.turn_id),
    cwd: safeString(raw.cwd) ?? process.cwd(),
    event,
    phase,
    status,
    tool_name: toolName,
    tool_use_id: safeString(raw.tool_use_id),
    matcher_hint: toolName,
    source: safeString(raw.source),
    trigger: safeString(raw.trigger),
    prompt_preview: promptPreview(safeString(raw.prompt)),
    transcript_path: safeString(raw.transcript_path),
    permission_mode: safeString(raw.permission_mode),
    outcome: event === 'PermissionRequest' ? 'blocked' : 'ok',
    message: null,
    raw,
  };
}

function normalizeExecJson(repoPath: string, prompt: string, raw: Json): NormalizedEvent | null {
  const type = safeString(raw.type);
  const ts = new Date().toISOString();
  if (!type) return null;

  if (type === 'thread.started') {
    return {
      ts,
      session_id: safeString(raw.thread_id),
      turn_id: null,
      cwd: repoPath,
      event: 'SessionStart',
      phase: 'starting',
      status: 'running',
      prompt_preview: promptPreview(prompt),
      outcome: 'ok',
      raw,
    };
  }

  if (type === 'turn.started') {
    return {
      ts,
      session_id: null,
      turn_id: 'turn-started',
      cwd: repoPath,
      event: 'UserPromptSubmit',
      phase: 'waiting_prompt',
      status: 'running',
      prompt_preview: promptPreview(prompt),
      outcome: 'ok',
      raw,
    };
  }

  if (type === 'item.started' || type === 'item.completed') {
    const item = (raw.item ?? {}) as Json;
    const itemType = safeString(item.type);
    if (itemType === 'command_execution') {
      const command = safeString(item.command) ?? 'command';
      const event = type === 'item.started' ? 'PreToolUse' : 'PostToolUse';
      const outcome = type === 'item.completed' && Number(item.exit_code ?? 0) !== 0 ? 'error' : 'ok';
      return {
        ts,
        session_id: null,
        turn_id: null,
        cwd: repoPath,
        event,
        phase: inferPhase(event, 'Bash'),
        status: 'running',
        tool_name: 'Bash',
        tool_use_id: safeString(item.id),
        prompt_preview: promptPreview(prompt),
        outcome,
        message: command,
        raw,
      };
    }
    if (itemType === 'agent_message') {
      return {
        ts,
        session_id: null,
        turn_id: null,
        cwd: repoPath,
        event: 'AgentMessage',
        phase: 'unknown',
        status: 'running',
        prompt_preview: promptPreview(prompt),
        outcome: 'ok',
        message: safeString(item.text),
        raw,
      };
    }
  }

  if (type === 'turn.completed') {
    return {
      ts,
      session_id: null,
      turn_id: 'turn-completed',
      cwd: repoPath,
      event: 'Stop',
      phase: 'stopped',
      status: 'stopped',
      prompt_preview: promptPreview(prompt),
      outcome: 'ok',
      raw,
    };
  }

  return null;
}

async function ingest(): Promise<void> {
  const fileArg = getArg('--file');
  const repoArg = getArg('--repo');
  const input = fileArg ? readFileSync(path.resolve(fileArg), 'utf8') : readFileSync(0, 'utf8');
  const raw = parseJsonText(input);
  const repoPath = resolveRepoPath(raw, repoArg);
  const normalized = normalizeEvent(raw);
  await appendNormalizedEvent(repoPath, normalized);
  console.log(JSON.stringify({ ok: true, repo: repoPath, latest: latestPath(repoPath), events: eventsPath(repoPath), event: normalized.event, phase: normalized.phase, status: normalized.status }));
}

async function showCurrent(): Promise<void> {
  const repoArg = getArg('--repo');
  const repoPath = repoArg ? path.resolve(repoArg) : process.cwd();
  const latest = await readLatest(repoPath);
  if (!latest) {
    console.error(`No status found under ${statusDir(repoPath)}`);
    process.exit(1);
  }
  if (hasFlag('--json')) {
    console.log(JSON.stringify(latest, null, 2));
    return;
  }
  console.log(`repo: ${latest.cwd}`);
  console.log(`status: ${latest.status}`);
  console.log(`phase: ${latest.phase}`);
  console.log(`last_event: ${latest.last_event}`);
  console.log(`last_tool: ${latest.last_tool ?? '-'}`);
  console.log(`updated_at: ${latest.updated_at}`);
  console.log(`events: ${latest.event_count}`);
}

async function showTail(): Promise<void> {
  const repoArg = getArg('--repo');
  const repoPath = repoArg ? path.resolve(repoArg) : process.cwd();
  const limitRaw = getArg('--limit');
  const limit = limitRaw ? Number(limitRaw) : 10;
  const filePath = eventsPath(repoPath);
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  const recent = lines.slice(-limit);
  for (const line of recent) {
    const event = JSON.parse(line) as NormalizedEvent;
    console.log(`${event.ts} ${event.event} phase=${event.phase} status=${event.status} tool=${event.tool_name ?? '-'} cwd=${event.cwd}${event.message ? ` msg=${event.message}` : ''}`);
  }
}

async function showSummary(): Promise<void> {
  const repoArg = getArg('--repo');
  const repoPath = repoArg ? path.resolve(repoArg) : process.cwd();
  const latest = await readLatest(repoPath);
  if (!latest) {
    console.error(`No status found under ${statusDir(repoPath)}`);
    process.exit(1);
  }
  const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(latest.updated_at).getTime()) / 1000));
  console.log(`${path.basename(repoPath)} | ${latest.status} | ${latest.phase} | event=${latest.last_event} | tool=${latest.last_tool ?? '-'} | age=${ageSeconds}s | count=${latest.event_count}`);
}

async function runCodexOnce(): Promise<void> {
  const repoArg = getArg('--repo');
  const promptArg = getArg('--prompt');
  const modelArg = getArg('--model');
  const jsonFlag = hasFlag('--json');
  if (!repoArg || !promptArg) {
    console.error('codex-run once requires --repo and --prompt');
    process.exit(1);
  }

  const repoPath = path.resolve(repoArg);
  ensureDir(statusDir(repoPath));

  const args = ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', promptArg];
  if (modelArg) args.unshift(modelArg), args.unshift('--model');

  const child = spawn('codex', args, {
    cwd: repoPath,
    env: {
      ...process.env,
      PATH: `${process.env.HOME ?? '/home/jasperWei'}/.local/bin:${process.env.PATH ?? ''}`,
      HTTP_PROXY: process.env.HTTP_PROXY ?? 'http://127.0.0.1:7890',
      HTTPS_PROXY: process.env.HTTPS_PROXY ?? 'http://127.0.0.1:7890',
      ALL_PROXY: process.env.ALL_PROXY ?? 'socks5://127.0.0.1:7891',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let lastAgentMessage: string | null = null;

  const flushJsonLines = async (chunk: string): Promise<void> => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const raw = JSON.parse(trimmed) as Json;
        const normalized = normalizeExecJson(repoPath, promptArg, raw);
        if (normalized) {
          await appendNormalizedEvent(repoPath, normalized);
          if (normalized.event === 'AgentMessage' && normalized.message) {
            lastAgentMessage = normalized.message;
          }
        }
        if (jsonFlag) console.log(trimmed);
      } catch {
        // ignore parse noise
      }
    }
  };

  child.stdout.on('data', (chunk: Buffer) => {
    void flushJsonLines(chunk.toString('utf8'));
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf8');
  });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (stdoutBuffer.trim().startsWith('{')) {
    await flushJsonLines('\n');
  }

  const latest = await readLatest(repoPath);
  const result = {
    ok: exitCode === 0,
    exit_code: exitCode,
    repo: repoPath,
    last_agent_message: lastAgentMessage,
    latest,
    stderr: stderrBuffer.trim() || null,
  };

  console.log(JSON.stringify(result, null, 2));
  if (exitCode !== 0) process.exit(exitCode);
}

async function installMcp(): Promise<void> {
  const repoPath = resolveRepoArg();
  const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
  const mcpUrl = getArg('--mcp-url') ?? defaultMcpUrl(backendUrl);
  const configPath = path.resolve(getArg('--config') ?? defaultHermesConfigPath());
  const serverName = getArg('--server-name') ?? 'orbit';

  await installHermesMcp(configPath, serverName, backendUrl, mcpUrl);
  await writeGlobalOrbitConfig({
    backendUrl,
    mcpUrl,
    hermesConfigPath: configPath,
    mcpServerName: serverName,
  });

  console.log(JSON.stringify({ ok: true, repo: repoPath, config: configPath, server: serverName, backendUrl, mcpUrl }, null, 2));
}

function normalizeBackendUrl(backendUrl: string): string {
  return backendUrl.replace(/\/$/, '');
}

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanGlobalOrbitConfig(config: Json): Json {
  for (const key of LOCAL_BINDING_GLOBAL_KEYS) {
    delete config[key];
  }
  return config;
}

function asPermissionList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((permission): permission is string => typeof permission === 'string')
    : [];
}

function mergePermissions(...permissionLists: string[][]): string[] {
  return [...new Set(permissionLists.flat())];
}

function asOrbitUser(value: unknown, account: string, extraPermissions: string[] = []): OrbitUser {
  if (!isJson(value)) return { account, name: account };
  const permissions = mergePermissions(asPermissionList(value.permissions), extraPermissions);
  return {
    id: safeString(value.id),
    account: safeString(value.account) ?? account,
    displayName: safeString(value.displayName) ?? safeString(value.name),
    name: safeString(value.name) ?? safeString(value.displayName) ?? safeString(value.account) ?? account,
    role: safeString(value.role),
    permissions,
  };
}

function asLoginSession(value: unknown, account: string): OrbitLoginSession | null {
  if (!isJson(value)) return null;
  const token = safeString(value.token);
  const key = safeString(value.key);
  if (!token || !key) return null;
  return {
    token,
    key,
    session: safeString(value.session),
    user: asOrbitUser(value.user, account, asPermissionList(value.permissions)),
  };
}

function asCachedLoginSession(value: unknown): CachedOrbitLoginSession | null {
  if (!isJson(value)) return null;
  const backendUrl = safeString(value.backendUrl);
  const account = safeString(value.account);
  const token = safeString(value.token);
  const key = safeString(value.key);
  if (!backendUrl || !account || !token || !key) return null;
  return {
    backendUrl,
    mcpUrl: safeString(value.mcpUrl),
    account,
    token,
    key,
    session: safeString(value.session),
    user: asOrbitUser(value.user, account),
    updatedAt: safeString(value.updatedAt) ?? new Date(0).toISOString(),
  };
}

function globalSessions(config: Json): Json {
  return isJson(config.sessions) ? config.sessions : {};
}

class OrbitCliError extends Error {}

function loginRequiredMessage(backendUrl: string): string {
  return `请先登录 / Please login: run axis login --backend-url ${normalizeBackendUrl(backendUrl)}; verify account has product/project access.`;
}

function insufficientPermissionMessage(backendUrl: string): string {
  return `权限不足 / Insufficient permission: run axis login --backend-url ${normalizeBackendUrl(backendUrl)} with the correct account; verify account has product/project access.`;
}

async function cachedLoginSession(backendUrl: string): Promise<CachedOrbitLoginSession | null> {
  const config = await readGlobalOrbitConfig();
  return asCachedLoginSession(globalSessions(config)[normalizeBackendUrl(backendUrl)]);
}

async function writeGlobalOrbitConfigObject(config: Json): Promise<void> {
  const filePath = globalOrbitConfigPath();
  ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(cleanGlobalOrbitConfig({ ...config, updatedAt: new Date().toISOString() }), null, 2)}\n`, 'utf8');
}

async function saveLoginSession(backendUrl: string, mcpUrl: string | undefined, account: string, login: OrbitLoginSession): Promise<CachedOrbitLoginSession> {
  const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
  const cached: CachedOrbitLoginSession = {
    backendUrl: normalizedBackendUrl,
    account,
    token: login.token,
    key: login.key,
    session: login.session,
    user: login.user,
    updatedAt: new Date().toISOString(),
  };
  if (mcpUrl) cached.mcpUrl = mcpUrl;
  const config = await readGlobalOrbitConfig();
  config.sessions = {
    ...globalSessions(config),
    [normalizedBackendUrl]: cached,
  };
  config.backendUrl = normalizedBackendUrl;
  if (mcpUrl) config.mcpUrl = mcpUrl;
  config.token = cached.token;
  config.key = cached.key;
  config.session = cached.session;
  config.account = cached.account;
  config.user = cached.user;
  await writeGlobalOrbitConfigObject(config);
  return cached;
}

async function requireCachedLoginSession(backendUrl: string, mcpUrl?: string): Promise<{ login: OrbitLoginSession; account: string }> {
  const cached = await cachedLoginSession(backendUrl);
  if (!cached) {
    throw new OrbitCliError(loginRequiredMessage(backendUrl));
  }
  const user = await fetchCurrentUser(backendUrl, cached.token);
  const account = user.account ?? cached.account;
  const refreshed = await saveLoginSession(backendUrl, mcpUrl ?? cached.mcpUrl ?? undefined, account, { ...cached, user });
  return { login: refreshed, account };
}

async function loginCommand(): Promise<void> {
  const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
  const mcpUrl = resolveMcpUrl(getArg('--mcp-url'));
  const prompt = await createPromptSession();
  try {
    const account = (await prompt.question('AxisNode account: ')).trim();
    const password = (await prompt.question('AxisNode password: ', { hidden: true })).trim();
    if (!account || !password) throw new Error('AxisNode account and password are required');
    const login = await loginOrbitHub(backendUrl, account, password);
    await saveLoginSession(backendUrl, mcpUrl, account, login);
    console.log(`Logged in to AxisNode as ${login.user.account ?? account}.`);
  } finally {
    prompt.close();
  }
}

async function meCommand(): Promise<void> {
  const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
  const { login, account } = await requireCachedLoginSession(backendUrl);
  const user = login.user;
  console.log(`account: ${user.account ?? account}`);
  console.log(`displayName: ${user.displayName ?? user.name ?? '-'}`);
  console.log(`role: ${user.role ?? '-'}`);
  console.log(`permissions: ${user.permissions && user.permissions.length > 0 ? user.permissions.join(', ') : '-'}`);
}

function asProductLine(value: unknown): OrbitProductLine | null {
  if (!isJson(value)) return null;
  const id = safeString(value.id);
  const name = safeString(value.name);
  if (!id || !name) return null;
  return {
    id,
    uuid: safeString(value.uuid),
    name,
    summary: safeString(value.summary),
    status: safeString(value.status),
  };
}

function asProjectModule(value: unknown): OrbitProjectModule | null {
  if (!isJson(value)) return null;
  const id = safeString(value.id);
  const name = safeString(value.name);
  if (!id || !name) return null;
  return {
    id,
    uuid: safeString(value.uuid),
    productId: safeString(value.productId),
    projectId: safeString(value.projectId),
    name,
    summary: safeString(value.summary),
    status: safeString(value.status),
    repoPath: safeString(value.repoPath),
    githubRepo: safeString(value.githubRepo),
    sourceRepo: safeString(value.sourceRepo),
    repositoryAddress: safeString(value.repositoryAddress),
    repositoryUrl: safeString(value.repositoryUrl),
    gitUrl: safeString(value.gitUrl),
    remoteUrl: safeString(value.remoteUrl),
  };
}

function asProductDetail(value: unknown): OrbitProductDetail | null {
  if (!isJson(value)) return null;
  const product = asProductLine(value.product);
  if (!product) return null;
  const rawModules = Array.isArray(value.modules) ? value.modules : [];
  return {
    product,
    modules: rawModules.map(asProjectModule).filter((module): module is OrbitProjectModule => Boolean(module)),
  };
}

function isHiddenCatalogRecord(record: { name?: string | null; summary?: string | null; status?: string | null }): boolean {
  const text = [record.name, record.summary].map((value) => String(value ?? '').trim()).join('\n');
  const name = String(record.name ?? '').trim().toLowerCase();
  return /non-destructive create\/read contract product/i.test(text)
    || name.startsWith('orbit check product')
    || name.startsWith('orbit check product line')
    || name.startsWith('orbit check module')
    || name.startsWith('orbit check project')
    || name.startsWith('hermes verify product')
    || name.startsWith('hermes verify product line')
    || name.startsWith('hermes verify module')
    || name.startsWith('hermes verify project')
    || name.startsWith('axis codex product')
    || name.startsWith('axis codex product line')
    || name.startsWith('axis codex module')
    || name.startsWith('axis codex project');
}

function visibleProductDetail(entry: OrbitProductDetail): OrbitProductDetail | null {
  if (isHiddenCatalogRecord(entry.product)) return null;
  return {
    product: entry.product,
    modules: entry.modules.filter((module) => !isHiddenCatalogRecord(module)),
  };
}

async function fetchOrbitJson(backendUrl: string, routePath: string, token?: string | null): Promise<unknown> {
  const url = `${normalizeBackendUrl(backendUrl)}${routePath}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot reach AxisNode backend at ${url}: ${message}`);
  }

  if (!response.ok) {
    if (response.status === 401) throw new OrbitCliError(loginRequiredMessage(backendUrl));
    if (response.status === 403) throw new OrbitCliError(insufficientPermissionMessage(backendUrl));
    throw new OrbitHttpError(response.status, `AxisNode backend returned HTTP ${response.status} for ${url}`);
  }

  try {
    return await response.json() as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AxisNode backend returned invalid JSON for ${url}: ${message}`);
  }
}

async function postOrbitJson(backendUrl: string, routePath: string, body: Json, token?: string | null): Promise<unknown> {
  const url = `${normalizeBackendUrl(backendUrl)}${routePath}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot reach AxisNode backend at ${url}: ${message}`);
  }

  if (!response.ok) {
    if (response.status === 401) throw new OrbitCliError(loginRequiredMessage(backendUrl));
    if (response.status === 403) throw new OrbitCliError(insufficientPermissionMessage(backendUrl));
    throw new OrbitHttpError(response.status, `AxisNode backend returned HTTP ${response.status} for ${url}`);
  }

  try {
    return await response.json() as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AxisNode backend returned invalid JSON for ${url}: ${message}`);
  }
}

async function patchOrbitJson(backendUrl: string, routePath: string, body: Json, token?: string | null): Promise<unknown> {
  const url = `${normalizeBackendUrl(backendUrl)}${routePath}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot reach AxisNode backend at ${url}: ${message}`);
  }

  if (!response.ok) {
    if (response.status === 401) throw new OrbitCliError(loginRequiredMessage(backendUrl));
    if (response.status === 403) throw new OrbitCliError(insufficientPermissionMessage(backendUrl));
    throw new OrbitHttpError(response.status, `AxisNode backend returned HTTP ${response.status} for ${url}`);
  }

  try {
    return await response.json() as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AxisNode backend returned invalid JSON for ${url}: ${message}`);
  }
}

function pageArg(): number {
  const value = Number.parseInt(getArg('--page') ?? '1', 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function pageSizeArg(): number {
  const value = Number.parseInt(getArg('--page-size') ?? '10', 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 10;
}

function extractId(payload: unknown): string | null {
  if (!isJson(payload)) return null;
  return safeString(payload.id)
    ?? safeString(payload.uuid)
    ?? safeString(payload.documentId)
    ?? safeString(payload.requirementId)
    ?? (isJson(payload.document) ? extractId(payload.document) : null)
    ?? (isJson(payload.data) ? extractId(payload.data) : null);
}

function extractUrl(payload: unknown): string | null {
  if (!isJson(payload)) return null;
  return safeString(payload.url)
    ?? safeString(payload.webUrl)
    ?? safeString(payload.href)
    ?? (isJson(payload.document) ? extractUrl(payload.document) : null)
    ?? (isJson(payload.data) ? extractUrl(payload.data) : null);
}

function extractItemsCount(payload: unknown): number {
  if (!isJson(payload)) return 0;
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.workItems)) return payload.workItems.length;
  if (isJson(payload.document)) return extractItemsCount(payload.document);
  if (isJson(payload.data)) return extractItemsCount(payload.data);
  return 0;
}

function projectApiId(binding: ProjectBinding): string | null {
  return safeString(binding.projectId) ?? safeString(binding.projectUuid);
}

async function tokenForBinding(binding: ProjectBinding | null): Promise<string | null> {
  if (!binding) return null;
  const direct = safeString(binding.token);
  if (direct) return direct;
  const cached = await cachedLoginSession(binding.backendUrl);
  if (cached?.token) return cached.token;
  const config = await readGlobalOrbitConfig();
  return safeString(config.token);
}

async function loginOrbitHub(backendUrl: string, account: string, password: string): Promise<OrbitLoginSession> {
  const payload = await postOrbitJson(backendUrl, '/api/login', { account, password });
  const session = asLoginSession(payload, account);
  if (!session) {
    throw new Error('AxisNode backend response for /api/login did not include token/key/user data');
  }
  return session;
}

async function fetchCurrentUser(backendUrl: string, token: string): Promise<OrbitUser> {
  const payload = await fetchOrbitJson(backendUrl, '/api/me', token);
  const rawUser = isJson(payload) && isJson(payload.user) ? payload.user : payload;
  const user = asOrbitUser(rawUser, '', isJson(payload) ? asPermissionList(payload.permissions) : []);
  if (!user.account) {
    throw new Error('AxisNode backend response for /api/me did not include user.account');
  }
  return user;
}

async function fetchProductLines(backendUrl: string, token?: string | null, options: { account?: string | null; allowEmpty?: boolean } = {}): Promise<OrbitProductDetail[]> {
  const payload = await fetchOrbitJson(backendUrl, '/api/products', token);
  if (!isJson(payload) || !Array.isArray(payload.products)) {
    throw new Error('AxisNode backend response for /api/products did not include a products array');
  }
  const products = payload.products
    .map(asProductDetail)
    .filter((entry): entry is OrbitProductDetail => Boolean(entry))
    .map(visibleProductDetail)
    .filter((entry): entry is OrbitProductDetail => Boolean(entry));
  if (products.length === 0) {
    if (options.allowEmpty) return [];
    const account = options.account ? ` for account "${options.account}"` : ' for this account';
    throw new Error(`No accessible product lines${account} at ${normalizeBackendUrl(backendUrl)}. Verify this account has product/project access for this backend.`);
  }
  return products;
}

async function fetchProductDetail(backendUrl: string, productLineId: string, token?: string | null, options: { allowEmptyProjects?: boolean } = {}): Promise<OrbitProductDetail> {
  const payload = await fetchOrbitJson(backendUrl, `/api/products/${encodeURIComponent(productLineId)}`, token);
  const detail = asProductDetail(payload);
  if (!detail) {
    throw new Error(`AxisNode backend response for product line ${productLineId} did not include product/modules data`);
  }
  const visibleDetail = visibleProductDetail(detail);
  if (!visibleDetail) {
    throw new Error(`Product line ${productLineId} is a hidden verification record and cannot be selected by default.`);
  }
  if (!options.allowEmptyProjects && visibleDetail.modules.length === 0) {
    throw new Error(`No projects found under product line "${visibleDetail.product.name}". Create a project in that product line first.`);
  }
  return visibleDetail;
}

function describeProductLine(product: OrbitProductLine): string {
  const parts = [product.name];
  if (product.status) parts.push(`[${product.status}]`);
  if (product.summary) parts.push(`- ${product.summary}`);
  return parts.join(' ');
}

function describeProject(module: OrbitProjectModule): string {
  const parts = [module.name];
  if (module.status) parts.push(`[${module.status}]`);
  const repo = repositoryAddress(module);
  if (repo) parts.push(`- ${repo}`);
  return parts.join(' ');
}

function repositoryAddress(module: OrbitProjectModule): string | null {
  return module.repositoryAddress
    ?? module.repositoryUrl
    ?? module.gitUrl
    ?? module.remoteUrl
    ?? module.githubRepo
    ?? module.sourceRepo
    ?? module.repoPath
    ?? null;
}

function explicitCloneAddress(module: OrbitProjectModule): string | null {
  return module.repositoryAddress
    ?? module.repositoryUrl
    ?? module.gitUrl
    ?? module.remoteUrl
    ?? module.githubRepo
    ?? module.sourceRepo
    ?? null;
}

type HiddenLineInput = NodeJS.ReadStream & {
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
};

type HiddenLineOutput = {
  write(chunk: string): unknown;
};

export async function readHiddenLine(
  prompt: string,
  input: HiddenLineInput = process.stdin,
  output: HiddenLineOutput = process.stdout,
): Promise<string> {
  const setRawMode = input.setRawMode?.bind(input);
  const wasRaw = input.isRaw;
  let answer = '';

  output.write(prompt);
  input.resume();
  setRawMode?.(true);

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      input.off('data', onData);
      setRawMode?.(wasRaw);
      input.pause();
    };
    const finish = (): void => {
      cleanup();
      output.write('\n');
      resolve(answer);
    };
    const interrupt = (): void => {
      cleanup();
      output.write('\n');
      reject(new Error('Interrupted'));
    };
    const onData = (chunk: Buffer | string): void => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      for (const char of text) {
        if (char === '\u0003') {
          interrupt();
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\b' || char === '\u007f') {
          answer = answer.slice(0, -1);
          continue;
        }
        if (char >= ' ' && char !== '\u007f' && char !== '\u001b') {
          answer += char;
        }
      }
    };
    input.on('data', onData);
  });
}

async function createPromptSession(): Promise<PromptSession> {
  if (process.stdin.isTTY) {
    return {
      async question(question: string, options?: { hidden?: boolean }): Promise<string> {
        if (options?.hidden) return readHiddenLine(question);
        const prompt = createInterface({ input: process.stdin, output: process.stdout });
        try {
          return await prompt.question(question);
        } finally {
          prompt.close();
        }
      },
      close(): void {},
    };
  }

  let input = '';
  for await (const chunk of process.stdin) {
    input += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  }
  const answers = input.split(/\r?\n/);

  return {
    async question(prompt: string, options?: { hidden?: boolean }): Promise<string> {
      process.stdout.write(prompt);
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error('No input received for interactive project bind selection');
      }
      process.stdout.write(options?.hidden ? '\n' : `${answer}\n`);
      return answer;
    },
    close(): void {},
  };
}

async function promptSelect<T>(
  prompt: PromptSession,
  title: string,
  items: T[],
  describe: (item: T) => string,
): Promise<T> {
  console.log(title);
  items.forEach((item, index) => {
    console.log(`  ${index + 1}. ${describe(item)}`);
  });

  while (true) {
    const answer = (await prompt.question('Enter number: ')).trim();
    const selected = Number.parseInt(answer, 10);
    if (Number.isInteger(selected) && selected >= 1 && selected <= items.length) {
      return items[selected - 1];
    }
    console.log(`Please enter a number from 1 to ${items.length}.`);
  }
}

async function promptProjectOrSkip(
  prompt: PromptSession,
  title: string,
  projects: OrbitProjectModule[],
): Promise<OrbitProjectModule | null> {
  console.log(title);
  projects.forEach((project, index) => {
    console.log(`  ${index + 1}. ${describeProject(project)}`);
  });
  const skipNumber = projects.length + 1;
  console.log(`  ${skipNumber}. Skip`);

  while (true) {
    const answer = (await prompt.question('Enter number: ')).trim();
    const selected = Number.parseInt(answer, 10);
    if (Number.isInteger(selected) && selected >= 1 && selected <= projects.length) {
      return projects[selected - 1];
    }
    if (selected === skipNumber) {
      return null;
    }
    console.log(`Please enter a number from 1 to ${skipNumber}.`);
  }
}

async function writeProjectBinding(repoPath: string, binding: ProjectBinding): Promise<void> {
  ensureDir(axisDir(repoPath));
  ensureDir(orbitDir(repoPath));
  const content = `${JSON.stringify(binding, null, 2)}\n`;
  await writeFile(axisProjectConfigPath(repoPath), content, 'utf8');
  await writeFile(legacyProjectConfigPath(repoPath), content, 'utf8');
  const globalValues: Json = {
    backendUrl: binding.backendUrl,
    token: binding.token,
    key: binding.key,
    session: binding.session,
    account: binding.account,
    user: binding.user,
    selectedAgent: binding.selectedAgent,
    skillPath: binding.skillPath,
    agentSkillPath: binding.agentSkillPath,
  };
  if (binding.mcpUrl) globalValues.mcpUrl = binding.mcpUrl;
  await writeGlobalOrbitConfig(globalValues);
}

async function promptProjectSelection(
  prompt: PromptSession,
  backendUrl: string,
  token?: string | null,
): Promise<{ productDetail: OrbitProductDetail; selectedProject: OrbitProjectModule }> {
  const productLines = await fetchProductLines(backendUrl, token);
  const selectedProduct = await promptSelect(prompt, 'Select product line:', productLines.map((entry) => entry.product), describeProductLine);
  const productDetail = await fetchProductDetail(backendUrl, selectedProduct.id, token);
  const selectedProject = await promptSelect(prompt, 'Select project:', productDetail.modules, describeProject);
  return { productDetail, selectedProject };
}

function buildProjectBinding(values: {
  repoPath: string;
  backendUrl: string;
  mcpUrl?: string;
  owner: string | null;
  productDetail: OrbitProductDetail;
  selectedProject: OrbitProjectModule;
  login?: OrbitLoginSession | null;
  account?: string | null;
  selectedAgent?: AgentChoice | null;
  skillPath?: string | null;
  agentSkillPath?: string | null;
}): ProjectBinding {
  if (!values.productDetail.product.uuid) {
    throw new Error(`Selected product line "${values.productDetail.product.name}" does not include product.uuid from the backend`);
  }
  if (!values.selectedProject.uuid) {
    throw new Error(`Selected project "${values.selectedProject.name}" does not include module.uuid from the backend`);
  }

  const binding: ProjectBinding = {
    backendUrl: values.backendUrl,
    token: values.login?.token,
    key: values.login?.key,
    session: values.login?.session,
    account: values.account ?? values.login?.user.account ?? null,
    user: values.login?.user ?? null,
    productLineUuid: values.productDetail.product.uuid,
    projectUuid: values.selectedProject.uuid,
    productLineId: values.productDetail.product.id,
    projectId: values.selectedProject.projectId ?? values.selectedProject.id,
    productLineName: values.productDetail.product.name,
    projectName: values.selectedProject.name,
    owner: values.owner,
    repo: values.repoPath,
    selectedAgent: values.selectedAgent,
    skillPath: values.skillPath,
    agentSkillPath: values.agentSkillPath,
    updatedAt: new Date().toISOString(),
  };
  if (values.mcpUrl) binding.mcpUrl = values.mcpUrl;
  if (values.selectedProject.repoPath) binding.repoPath = values.selectedProject.repoPath;
  if (values.selectedProject.githubRepo) binding.githubRepo = values.selectedProject.githubRepo;
  if (values.selectedProject.sourceRepo) binding.sourceRepo = values.selectedProject.sourceRepo;
  if (values.selectedProject.repositoryUrl) binding.repositoryUrl = values.selectedProject.repositoryUrl;
  if (values.selectedProject.gitUrl) binding.gitUrl = values.selectedProject.gitUrl;
  if (values.selectedProject.remoteUrl) binding.remoteUrl = values.selectedProject.remoteUrl;
  return binding;
}

function parseAgentArg(value: string | null): AgentChoice | null {
  if (!value) return null;
  if (value === 'codex' || value === 'claude-code' || value === 'none') return value;
  if (value === 'cc') return 'claude-code';
  throw new Error('--agent must be one of: codex, claude-code, none');
}

function buildProductLineBinding(values: {
  rootPath: string;
  backendUrl: string;
  mcpUrl?: string;
  productDetail: OrbitProductDetail;
  login: OrbitLoginSession;
  account: string;
  owner?: string | null;
  selectedAgent?: AgentChoice | null;
  skillPath?: string | null;
  agentSkillPath?: string | null;
}): ProductLineBinding {
  if (!values.productDetail.product.uuid) {
    throw new Error(`Selected product line "${values.productDetail.product.name}" does not include product.uuid from the backend`);
  }

  const binding: ProductLineBinding = {
    backendUrl: values.backendUrl,
    token: values.login.token,
    key: values.login.key,
    session: values.login.session,
    account: values.account,
    user: values.login.user,
    productLineUuid: values.productDetail.product.uuid,
    productLineId: values.productDetail.product.id,
    productLineName: values.productDetail.product.name,
    owner: values.owner,
    rootPath: values.rootPath,
    selectedAgent: values.selectedAgent,
    skillPath: values.skillPath,
    agentSkillPath: values.agentSkillPath,
    updatedAt: new Date().toISOString(),
  };
  if (values.mcpUrl) binding.mcpUrl = values.mcpUrl;
  return binding;
}

async function writeProductLineBinding(rootPath: string, binding: ProductLineBinding): Promise<void> {
  ensureDir(axisDir(rootPath));
  ensureDir(orbitDir(rootPath));
  const content = `${JSON.stringify(binding, null, 2)}\n`;
  await writeFile(axisProductLineConfigPath(rootPath), content, 'utf8');
  await writeFile(legacyProductLineConfigPath(rootPath), content, 'utf8');
  const globalValues: Json = {
    backendUrl: binding.backendUrl,
    token: binding.token,
    key: binding.key,
    session: binding.session,
    account: binding.account,
    user: binding.user,
    selectedAgent: binding.selectedAgent,
    skillPath: binding.skillPath,
    agentSkillPath: binding.agentSkillPath,
  };
  if (binding.mcpUrl) globalValues.mcpUrl = binding.mcpUrl;
  await writeGlobalOrbitConfig(globalValues);
}

async function detectProjectMarkers(candidatePath: string): Promise<string[]> {
  const markers = [
    'package.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',
    'tsconfig.json',
    'pyproject.toml',
    'requirements.txt',
    'Cargo.toml',
    'go.mod',
    'composer.json',
    'pom.xml',
    'build.gradle',
    'settings.gradle',
    'README.md',
  ];
  const found: string[] = [];
  for (const marker of markers) {
    if (existsSync(path.join(candidatePath, marker))) {
      found.push(marker);
    }
  }
  return found;
}

async function scanProjectCandidates(rootPath: string): Promise<ProjectCandidate[]> {
  const excluded = new Set(['.git', 'node_modules', 'dist', 'build', 'cache']);
  const entries = await readdir(rootPath, { withFileTypes: true });
  const candidates: ProjectCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
    const candidatePath = path.join(rootPath, entry.name);
    candidates.push({
      name: entry.name,
      path: candidatePath,
      markers: await detectProjectMarkers(candidatePath),
    });
  }
  return candidates.sort((left, right) => left.name.localeCompare(right.name));
}

function describeCandidate(candidate: ProjectCandidate): string {
  return `${candidate.name} (${candidate.markers.length > 0 ? candidate.markers.join(', ') : 'plain folder'})`;
}

async function bindProjectInteractively(repoPath: string, backendUrl: string, mcpUrl: string | undefined, owner: string | null): Promise<void> {
  const prompt = await createPromptSession();
  let productDetail!: OrbitProductDetail;
  let selectedProject!: OrbitProjectModule;
  const { login, account } = await requireCachedLoginSession(backendUrl, mcpUrl);
  try {
    ({ productDetail, selectedProject } = await promptProjectSelection(prompt, backendUrl, login.token));
  } finally {
    prompt.close();
  }

  const binding = buildProjectBinding({
    repoPath,
    backendUrl,
    mcpUrl,
    owner,
    productDetail,
    selectedProject,
    login,
    account,
  });

  await writeProjectBinding(repoPath, binding);
  console.log(JSON.stringify({ ok: true, config: axisProjectConfigPath(repoPath), legacyConfig: legacyProjectConfigPath(repoPath), binding }, null, 2));
}

async function packagedSkillNames(): Promise<string[]> {
  const dir = bundledSkillsDir();
  const entries = await readdir(dir, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (existsSync(bundledOrbitSkillPath(entry.name))) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

async function copySkillTextIfAllowed(sourceText: string, target: string, force: boolean): Promise<'copied' | 'identical'> {
  ensureDir(path.dirname(target));
  if (existsSync(target)) {
    const targetText = await readFile(target, 'utf8');
    if (targetText === sourceText) return 'identical';
    if (!force) {
      throw new Error(`Refusing to overwrite modified skill at ${target}. Re-run with --force to replace it.`);
    }
  }
  await writeFile(target, sourceText, 'utf8');
  return 'copied';
}

async function copySkillIfAllowed(source: string, target: string, force: boolean): Promise<'copied' | 'identical'> {
  ensureDir(path.dirname(target));
  const sourceText = await readFile(source, 'utf8');
  if (existsSync(target)) {
    const targetText = await readFile(target, 'utf8');
    if (targetText === sourceText) return 'identical';
    if (!force) {
      throw new Error(`Refusing to overwrite modified skill at ${target}. Re-run with --force to replace it.`);
    }
  }
  await copyFile(source, target);
  return 'copied';
}

async function gstackOfficeHoursDependencyText(): Promise<string> {
  const source = hermesSkillPath('gstack-office-hours');
  if (existsSync(source)) {
    return readFile(source, 'utf8');
  }

  return `---
name: gstack-office-hours
description: Dependency skill for running gstack office-hours discussions used by Oribit Idea.
---

# Gstack Office Hours

Use this dependency skill when another skill asks for gstack's \`office-hours\` capability/skill.

Run the office-hours discussion with:

\`\`\`bash
gstack office-hours
\`\`\`

The \`oribit-idea\` skill uses this dependency to incubate ideas through an office-hours discussion, then turns the resulting notes into AxisNode-ready artifacts.
`;
}

function installAgentsForChoice(agent: InstallAgentChoice): AgentChoice[] {
  if (agent === 'all') return ['codex', 'claude-code'];
  return [agent];
}

function parseInstallAgentArg(value: string | null): InstallAgentChoice {
  if (!value || value === 'all') return 'all';
  if (value === 'codex') return 'codex';
  if (value === 'claude-code' || value === 'cc') return 'claude-code';
  throw new Error('--agent must be one of: codex, claude-code, cc, all');
}

async function installPackagedSkills(agent: AgentChoice | InstallAgentChoice, force: boolean): Promise<{
  skillPath: string;
  agentSkillPath: string | null;
  installed: { skill: string; target: string; status: 'copied' | 'identical' }[];
}> {
  const skillNames = await packagedSkillNames();
  if (skillNames.length === 0) {
    throw new Error(`No packaged skills found under ${bundledSkillsDir()}`);
  }

  const agents = agent === 'none' ? [] : installAgentsForChoice(agent);
  const installed: { skill: string; target: string; status: 'copied' | 'identical' }[] = [];
  for (const skillName of skillNames) {
    const source = bundledOrbitSkillPath(skillName);
    const stableTarget = stableOrbitSkillPath(skillName);
    installed.push({ skill: skillName, target: stableTarget, status: await copySkillIfAllowed(source, stableTarget, force) });
    for (const selectedAgent of agents) {
      const target = agentSkillPath(selectedAgent, skillName);
      if (!target) continue;
      installed.push({ skill: skillName, target, status: await copySkillIfAllowed(source, target, force) });
    }
  }

  const dependencyText = await gstackOfficeHoursDependencyText();
  for (const selectedAgent of agents) {
    const target = agentSkillPath(selectedAgent, 'gstack-office-hours');
    if (!target) continue;
    installed.push({
      skill: 'gstack-office-hours',
      target,
      status: await copySkillTextIfAllowed(dependencyText, target, force),
    });
  }

  return {
    skillPath: stableOrbitSkillPath('orbit-workflow'),
    agentSkillPath: agent === 'none' || agent === 'all' ? null : agentSkillPath(agent, 'orbit-workflow'),
    installed,
  };
}

async function installSkillsCommand(): Promise<void> {
  const agent = parseInstallAgentArg(getArg('--agent'));
  const install = await installPackagedSkills(agent, hasFlag('--force'));
  console.log(JSON.stringify({ ok: true, agent, installed: install.installed }, null, 2));
}

async function promptAgent(prompt: PromptSession): Promise<AgentChoice> {
  const choices: { id: AgentChoice; label: string }[] = [
    { id: 'codex', label: 'Codex' },
    { id: 'claude-code', label: 'Claude Code/cc' },
    { id: 'none', label: 'None' },
  ];
  const selected = await promptSelect(prompt, 'Select agent:', choices, (choice) => choice.label);
  return selected.id;
}

async function setupRepo(): Promise<void> {
  const repoPath = resolveRepoArg();
  const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
  const selectedAgentArg = parseAgentArg(getArg('--agent'));

  const prompt = await createPromptSession();
  let selectedAgent!: AgentChoice;
  try {
    selectedAgent = selectedAgentArg ?? await promptAgent(prompt);
  } finally {
    prompt.close();
  }

  const install = await installPackagedSkills(selectedAgent, true);
  await writeGlobalOrbitConfig({
    backendUrl,
    selectedAgent,
    skillPath: install.skillPath,
    agentSkillPath: install.agentSkillPath,
  });
  console.log(JSON.stringify({ ok: true, repo: repoPath, backendUrl, selectedAgent, skillPath: install.skillPath, agentSkillPath: install.agentSkillPath }, null, 2));
}

async function setupProductLineRoot(): Promise<void> {
  const rootPath = resolveProductLineRootArg();
  const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
  const mcpUrl = resolveMcpUrl(getArg('--mcp-url'));
  const ownerArg = getArg('--owner');
  const selectedAgent = parseAgentArg(getArg('--agent'));

  let account = '';
  let login!: OrbitLoginSession;
  let productDetail!: OrbitProductDetail;
  const bound: string[] = [];
  const skipped: string[] = [];
  ({ login, account } = await requireCachedLoginSession(backendUrl, mcpUrl));

  const prompt = await createPromptSession();
  try {
    const owner = ownerArg ?? login.user.account ?? account;

    const productLines = await fetchProductLines(backendUrl, login.token);
    const selectedProduct = await promptSelect(prompt, 'Select product line:', productLines.map((entry) => entry.product), describeProductLine);
    productDetail = await fetchProductDetail(backendUrl, selectedProduct.id, login.token, { allowEmptyProjects: true });

    const install = selectedAgent ? await installPackagedSkills(selectedAgent, true) : { skillPath: null, agentSkillPath: null };
      const rootBinding = buildProductLineBinding({
        rootPath,
        backendUrl,
        mcpUrl,
        productDetail,
        login,
        account,
        owner,
        selectedAgent: selectedAgent ?? undefined,
        skillPath: install.skillPath ?? undefined,
        agentSkillPath: install.agentSkillPath ?? undefined,
    });
    await writeProductLineBinding(rootPath, rootBinding);

    const candidates = await scanProjectCandidates(rootPath);
    for (const candidate of candidates) {
      const selectedProject = await promptProjectOrSkip(
        prompt,
        `Bind ${describeCandidate(candidate)} as a project under ${productDetail.product.name}?`,
        productDetail.modules,
      );
      if (!selectedProject) {
        skipped.push(candidate.path);
        continue;
      }

      const binding = buildProjectBinding({
        repoPath: candidate.path,
        backendUrl,
        mcpUrl,
        owner,
        productDetail,
        selectedProject,
        login,
        account,
        selectedAgent: selectedAgent ?? undefined,
        skillPath: install.skillPath ?? undefined,
        agentSkillPath: install.agentSkillPath ?? undefined,
      });
      await writeProjectBinding(candidate.path, binding);
      bound.push(projectConfigPath(candidate.path));
    }
  } finally {
    prompt.close();
  }

  console.log('Summary:');
  console.log(`  root config: ${productLineConfigPath(rootPath)}`);
  console.log(`  bound: ${bound.length}`);
  bound.forEach((configPath) => console.log(`    ${configPath}`));
  console.log(`  skipped: ${skipped.length}`);
  skipped.forEach((folderPath) => console.log(`    ${folderPath}`));
}

async function bindProductLineRootWithSession(values: {
  prompt: PromptSession;
  rootPath: string;
  backendUrl: string;
  mcpUrl?: string;
  owner: string;
  login: OrbitLoginSession;
  account: string;
  selectedAgent?: AgentChoice | null;
}): Promise<void> {
  const productLines = await fetchProductLines(values.backendUrl, values.login.token);
  const selectedProduct = await promptSelect(values.prompt, 'Select product line:', productLines.map((entry) => entry.product), describeProductLine);
  const productDetail = await fetchProductDetail(values.backendUrl, selectedProduct.id, values.login.token, { allowEmptyProjects: true });

  const install = values.selectedAgent ? await installPackagedSkills(values.selectedAgent, true) : { skillPath: null, agentSkillPath: null };
  const rootBinding = buildProductLineBinding({
    rootPath: values.rootPath,
    backendUrl: values.backendUrl,
    mcpUrl: values.mcpUrl,
    productDetail,
    login: values.login,
    account: values.account,
    owner: values.owner,
    selectedAgent: values.selectedAgent ?? undefined,
    skillPath: install.skillPath ?? undefined,
    agentSkillPath: install.agentSkillPath ?? undefined,
  });
  await writeProductLineBinding(values.rootPath, rootBinding);

  const bound: string[] = [];
  const skipped: string[] = [];
  const candidates = await scanProjectCandidates(values.rootPath);
  for (const candidate of candidates) {
    const selectedProject = await promptProjectOrSkip(
      values.prompt,
      `Bind ${describeCandidate(candidate)} as a project under ${productDetail.product.name}?`,
      productDetail.modules,
    );
    if (!selectedProject) {
      skipped.push(candidate.path);
      continue;
    }

    const binding = buildProjectBinding({
      repoPath: candidate.path,
      backendUrl: values.backendUrl,
      mcpUrl: values.mcpUrl,
      owner: values.owner,
      productDetail,
      selectedProject,
      login: values.login,
      account: values.account,
      selectedAgent: values.selectedAgent ?? undefined,
      skillPath: install.skillPath ?? undefined,
      agentSkillPath: install.agentSkillPath ?? undefined,
    });
    await writeProjectBinding(candidate.path, binding);
    bound.push(projectConfigPath(candidate.path));
  }

  console.log('Summary:');
  console.log(`  root config: ${productLineConfigPath(values.rootPath)}`);
  console.log(`  bound: ${bound.length}`);
  bound.forEach((configPath) => console.log(`    ${configPath}`));
  console.log(`  skipped: ${skipped.length}`);
  skipped.forEach((folderPath) => console.log(`    ${folderPath}`));
}

async function bindTopLevel(): Promise<void> {
  const repoPath = resolveRepoArg();
  const rootPath = resolveProductLineRootArg();
  const existing = await readProjectBinding(repoPath);
  const backendUrl = getArg('--backend-url') ?? existing?.backendUrl ?? defaultBackendUrl();
  const mcpUrl = resolveMcpUrl(getArg('--mcp-url'), existing?.mcpUrl);
  const selectedAgent = parseAgentArg(getArg('--agent'));

  const { login, account } = await requireCachedLoginSession(backendUrl, mcpUrl);
  const prompt = await createPromptSession();
  try {
    const owner = getArg('--owner') ?? login.user.account ?? account;
    const target = await promptSelect(
      prompt,
      'Bind target:',
      [
        { id: 'project' as const, label: 'Single project repo' },
        { id: 'product-line' as const, label: 'Product-line root' },
      ],
      (choice) => choice.label,
    );

    if (target.id === 'project') {
      const { productDetail, selectedProject } = await promptProjectSelection(prompt, backendUrl, login.token);
      const binding = buildProjectBinding({
        repoPath,
        backendUrl,
        mcpUrl,
        owner,
        productDetail,
        selectedProject,
        login,
        account,
      });
      await writeProjectBinding(repoPath, binding);
      console.log(JSON.stringify({ ok: true, config: axisProjectConfigPath(repoPath), legacyConfig: legacyProjectConfigPath(repoPath), binding }, null, 2));
      return;
    }

    await bindProductLineRootWithSession({
      prompt,
      rootPath,
      backendUrl,
      mcpUrl,
      owner,
      login,
      account,
      selectedAgent,
    });
  } finally {
    prompt.close();
  }
}

function safeSlug(name: string, fallback = 'orbit-item'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

async function directoryIsEmpty(dirPath: string): Promise<boolean> {
  if (!await directoryExists(dirPath)) return true;
  return (await readdir(dirPath)).length === 0;
}

async function isGitRepo(repoPath: string): Promise<boolean> {
  if (!await directoryExists(repoPath)) return false;
  try {
    await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

function cloneAddress(module: OrbitProjectModule): string | null {
  return explicitCloneAddress(module);
}

function summarizeCommandError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).join(' ');
  }
  return String(error);
}

type SyncRepositoryResult = {
  status: 'cloned' | 'pulled' | 'skipped-nonempty' | 'clone-failed';
  error?: string;
};

async function syncRepository(repoUrl: string, targetPath: string): Promise<SyncRepositoryResult> {
  if (!await directoryExists(targetPath) || await directoryIsEmpty(targetPath)) {
    ensureDir(path.dirname(targetPath));
    try {
      await execFileAsync('git', ['clone', repoUrl, targetPath]);
      return { status: 'cloned' };
    } catch (error) {
      return { status: 'clone-failed', error: summarizeCommandError(error) };
    }
  }

  if (await isGitRepo(targetPath)) {
    await execFileAsync('git', ['-C', targetPath, 'fetch', '--all', '--prune']);
    await execFileAsync('git', ['-C', targetPath, 'pull', '--ff-only']);
    return { status: 'pulled' };
  }

  return { status: 'skipped-nonempty' };
}

async function selectProductLinesToPull(prompt: PromptSession, backendUrl: string, token?: string | null, account?: string | null): Promise<OrbitProductDetail[]> {
  const productLines = await fetchProductLines(backendUrl, token, { account });
  const allChoice = { id: 'all', label: 'All product lines', detail: null as OrbitProductDetail | null };
  const choices = [
    allChoice,
    ...productLines.map((detail) => ({ id: detail.product.id, label: describeProductLine(detail.product), detail })),
  ];
  const selected = await promptSelect(prompt, 'Pull product lines:', choices, (choice) => choice.label);
  if (selected.id === 'all') {
    const details: OrbitProductDetail[] = [];
    for (const entry of productLines) {
      try {
        details.push(await fetchProductDetail(backendUrl, entry.product.id, token, { allowEmptyProjects: true }));
      } catch (error) {
        if (error instanceof OrbitCliError) throw error;
        details.push(entry);
      }
    }
    return details;
  }
  return [await fetchProductDetail(backendUrl, selected.id, token, { allowEmptyProjects: true })];
}

function workspaceProductPath(workspaceRoot: string, product: OrbitProductLine): string {
  return path.join(workspaceRoot, safeSlug(product.name, 'product-line'));
}

function workspaceProjectPath(workspaceRoot: string, product: OrbitProductLine, project: OrbitProjectModule): string {
  return path.join(workspaceProductPath(workspaceRoot, product), safeSlug(project.name, 'project'));
}

function workspaceProjectFilter(): { id: string | null; uuid: string | null; productLineId: string | null; productLineUuid: string | null } {
  return {
    id: getArg('--project-id'),
    uuid: getArg('--project-uuid'),
    productLineId: getArg('--product-line-id'),
    productLineUuid: getArg('--product-line-uuid'),
  };
}

function workspaceProjectMatchesFilter(
  product: OrbitProductLine,
  project: OrbitProjectModule,
  filter: { id: string | null; uuid: string | null; productLineId: string | null; productLineUuid: string | null },
): boolean {
  if (filter.productLineId && filter.productLineId !== product.id) return false;
  if (filter.productLineUuid && filter.productLineUuid !== product.uuid) return false;
  if (filter.id && filter.id !== project.id && filter.id !== project.projectId) return false;
  if (filter.uuid && filter.uuid !== project.uuid) return false;
  return true;
}

function describeWorkspaceFilter(filter: { id: string | null; uuid: string | null; productLineId: string | null; productLineUuid: string | null }): string {
  const parts = [
    filter.productLineId ? `--product-line-id ${filter.productLineId}` : null,
    filter.productLineUuid ? `--product-line-uuid ${filter.productLineUuid}` : null,
    filter.id ? `--project-id ${filter.id}` : null,
    filter.uuid ? `--project-uuid ${filter.uuid}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  return parts.join(' and ');
}

async function fetchWorkspaceProductDetails(backendUrl: string, token: string, account: string): Promise<{ details: OrbitProductDetail[]; warnings: string[] }> {
  const warnings: string[] = [];
  const productLines = await fetchProductLines(backendUrl, token, { account, allowEmpty: true });
  const details: OrbitProductDetail[] = [];
  for (const entry of productLines) {
    try {
      details.push(await fetchProductDetail(backendUrl, entry.product.id, token, { allowEmptyProjects: true }));
    } catch (error) {
      if (error instanceof OrbitCliError) throw error;
      warnings.push(`Product line ${entry.product.name} detail fetch failed; using catalog summary. ${error instanceof Error ? error.message : String(error)}`);
      details.push(entry);
    }
  }
  return { details, warnings };
}

function safeWorkspaceProject(project: AxisWorkspaceProject): Json {
  return {
    productLineId: project.binding.productLineId ?? project.binding.productLineUuid ?? null,
    productLineUuid: project.binding.productLineUuid ?? null,
    productLineName: project.binding.productLineName ?? project.product.name,
    projectId: project.binding.projectId ?? project.binding.projectUuid ?? null,
    projectUuid: project.binding.projectUuid ?? null,
    projectName: project.binding.projectName ?? project.project.name,
    repoPath: project.repoPath,
    materialized: project.materialized,
    repoUrl: project.repoUrl,
    syncStatus: project.syncStatus,
    warning: project.warning,
  };
}

async function writeAxisWorkspaceCatalog(workspace: AxisWorkspaceResolution): Promise<void> {
  ensureDir(path.dirname(workspace.catalogPath));
  const payload: Json = {
    schemaVersion: 'axis.workspace.catalog.v1',
    workspaceRoot: workspace.workspaceRoot,
    backendUrl: normalizeBackendUrl(workspace.backendUrl),
    account: workspace.account,
    updatedAt: new Date().toISOString(),
    projectCount: workspace.projects.length,
    projects: workspace.projects.map(safeWorkspaceProject),
    warnings: workspace.warnings,
  };
  await writeFile(workspace.catalogPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function syncAxisWorkspaceProject(values: {
  workspaceRoot: string;
  backendUrl: string;
  mcpUrl?: string;
  owner: string;
  productDetail: OrbitProductDetail;
  project: OrbitProjectModule;
  login: OrbitLoginSession;
  account: string;
}): Promise<AxisWorkspaceProject> {
  const repoPath = workspaceProjectPath(values.workspaceRoot, values.productDetail.product, values.project);
  const repoUrl = cloneAddress(values.project);
  let materialized = false;
  let syncStatus = repoUrl ? 'not-synced' : 'metadata-only';
  let warning: string | null = null;

  if (repoUrl) {
    try {
      const sync = await syncRepository(repoUrl, repoPath);
      syncStatus = sync.status;
      materialized = sync.status === 'cloned' || sync.status === 'pulled';
      warning = sync.error ? `Repository sync failed for ${values.project.name}: ${sync.error}` : null;
    } catch (error) {
      syncStatus = 'sync-failed';
      warning = `Repository sync failed for ${values.project.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  ensureDir(repoPath);
  const binding = buildProjectBinding({
    repoPath,
    backendUrl: values.backendUrl,
    mcpUrl: values.mcpUrl,
    owner: values.owner,
    productDetail: values.productDetail,
    selectedProject: values.project,
    login: values.login,
    account: values.account,
  });
  await writeProjectBinding(repoPath, binding);
  return {
    workspaceRoot: values.workspaceRoot,
    product: values.productDetail.product,
    project: values.project,
    repoPath,
    binding,
    materialized,
    repoUrl,
    syncStatus,
    warning,
  };
}

async function resolveAxisWorkspaceForWorker(): Promise<AxisWorkspaceResolution> {
  const config = await readGlobalOrbitConfig();
  const workspaceRoot = axisHomeDir();
  const backendUrl = getArg('--backend-url') ?? safeString(config.backendUrl) ?? defaultBackendUrl();
  const mcpUrl = resolveMcpUrl(getArg('--mcp-url'), safeString(config.mcpUrl));
  const { login, account } = await requireCachedLoginSession(backendUrl, mcpUrl);
  const owner = login.user.account ?? account;
  const warnings: string[] = [];
  const { details, warnings: detailWarnings } = await fetchWorkspaceProductDetails(backendUrl, login.token, owner);
  warnings.push(...detailWarnings);

  ensureDir(workspaceRoot);
  const filter = workspaceProjectFilter();
  const projects: AxisWorkspaceProject[] = [];
  for (const productDetail of details) {
    const productPath = workspaceProductPath(workspaceRoot, productDetail.product);
    let productHasProjects = false;
    for (const project of productDetail.modules) {
      if (!workspaceProjectMatchesFilter(productDetail.product, project, filter)) continue;
      productHasProjects = true;
      try {
        const workspaceProject = await syncAxisWorkspaceProject({
          workspaceRoot,
          backendUrl,
          mcpUrl,
          owner,
          productDetail,
          project,
          login,
          account,
        });
        projects.push(workspaceProject);
        if (workspaceProject.warning) warnings.push(workspaceProject.warning);
      } catch (error) {
        warnings.push(`Project ${project.name} could not be added to Axis workspace: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (productHasProjects) {
      const productBinding = buildProductLineBinding({
        rootPath: productPath,
        backendUrl,
        mcpUrl,
        productDetail,
        login,
        account,
        owner,
      });
      await writeProductLineBinding(productPath, productBinding);
    }
  }

  if ((filter.id || filter.uuid || filter.productLineId || filter.productLineUuid) && projects.length === 0) {
    warnings.push(`No accessible AxisNode project matched ${describeWorkspaceFilter(filter)}.`);
  } else if (projects.length === 0) {
    warnings.push('No accessible AxisNode projects found in the user workspace.');
  }

  const workspace: AxisWorkspaceResolution = {
    workspaceRoot,
    backendUrl,
    account,
    login,
    projects,
    warnings,
    catalogPath: axisWorkspaceCatalogPath(workspaceRoot),
  };
  await writeAxisWorkspaceCatalog(workspace);
  return workspace;
}

async function pullCloudStructure(): Promise<void> {
  const config = await readGlobalOrbitConfig();
  const rootPath = path.resolve(getArg('--root') ?? axisHomeDir());
  const backendUrl = getArg('--backend-url') ?? safeString(config.backendUrl) ?? defaultBackendUrl();
  const mcpUrl = resolveMcpUrl(getArg('--mcp-url'), safeString(config.mcpUrl));

  const productConfigs: string[] = [];
  const projectConfigs: string[] = [];
  const gitResults: { path: string; status: string; repo: string | null; error?: string }[] = [];
  const { login, account } = await requireCachedLoginSession(backendUrl, mcpUrl);

  const prompt = await createPromptSession();
  try {
    const owner = login.user.account ?? account;
    const productDetails = await selectProductLinesToPull(prompt, backendUrl, login.token, owner);

    ensureDir(rootPath);
    for (const productDetail of productDetails) {
      const productPath = path.join(rootPath, safeSlug(productDetail.product.name));

      for (const project of productDetail.modules) {
        const projectPath = path.join(productPath, safeSlug(project.name));
        const repoUrl = cloneAddress(project);
        if (!repoUrl) {
          gitResults.push({ path: projectPath, status: 'skipped-no-repo', repo: null });
          continue;
        }
        const syncResult = await syncRepository(repoUrl, projectPath);
        gitResults.push({ path: projectPath, status: syncResult.status, repo: repoUrl, error: syncResult.error });
        if (syncResult.status === 'clone-failed' || syncResult.status === 'skipped-nonempty') {
          continue;
        }
        const binding = buildProjectBinding({
          repoPath: projectPath,
          backendUrl,
          mcpUrl,
          owner,
          productDetail,
          selectedProject: project,
          login,
          account,
        });
        await writeProjectBinding(projectPath, binding);
        projectConfigs.push(projectConfigPath(projectPath));
      }

      if (!projectConfigs.some((configPath) => configPath.startsWith(`${productPath}${path.sep}`))) {
        continue;
      }
      const productBinding = buildProductLineBinding({
        rootPath: productPath,
        backendUrl,
        mcpUrl,
        productDetail,
        login,
        account,
        owner,
      });
      await writeProductLineBinding(productPath, productBinding);
      productConfigs.push(productLineConfigPath(productPath));
    }
  } finally {
    prompt.close();
  }

  console.log('Summary:');
  console.log(`  product lines: ${productConfigs.length}`);
  productConfigs.forEach((configPath) => console.log(`    ${configPath}`));
  console.log(`  projects: ${projectConfigs.length}`);
  projectConfigs.forEach((configPath) => console.log(`    ${configPath}`));
  for (const status of ['cloned', 'pulled', 'skipped-no-repo', 'skipped-nonempty', 'clone-failed']) {
    const matches = gitResults.filter((result) => result.status === status);
    console.log(`  ${status}: ${matches.length}`);
    matches.forEach((result) => console.log(`    ${result.path}${result.repo ? ` <- ${result.repo}` : ''}${result.error ? ` (${result.error})` : ''}`));
  }
}

async function bindProject(): Promise<void> {
  const repoPath = resolveRepoArg();
  const existing = await readProjectBinding(repoPath);
  const backendUrl = getArg('--backend-url') ?? existing?.backendUrl ?? defaultBackendUrl();
  const mcpUrl = resolveMcpUrl(getArg('--mcp-url'), existing?.mcpUrl);
  const owner = getArg('--owner') ?? existing?.owner ?? process.env.USER ?? null;

  if (hasFlag('--interactive')) {
    try {
      await bindProjectInteractively(repoPath, backendUrl, mcpUrl, owner);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    }
    return;
  }

  const productLineUuid = getArg('--product-line-uuid') ?? existing?.productLineUuid ?? null;
  const projectUuid = getArg('--project-uuid') ?? existing?.projectUuid ?? null;
  const productLineId = getArg('--product-line-id') ?? existing?.productLineId ?? null;
  const projectId = getArg('--project-id') ?? existing?.projectId ?? null;

  if ((!productLineUuid || !projectUuid) && (!productLineId || !projectId)) {
    console.error('project bind requires --product-line-uuid and --project-uuid');
    process.exit(1);
  }

  const binding: ProjectBinding = {
    backendUrl,
    productLineUuid,
    projectUuid,
    owner,
    repo: repoPath,
    updatedAt: new Date().toISOString(),
  };
  if (mcpUrl) binding.mcpUrl = mcpUrl;
  if (productLineId) binding.productLineId = productLineId;
  if (projectId) binding.projectId = projectId;

  await writeProjectBinding(repoPath, binding);

  console.log(JSON.stringify({ ok: true, config: axisProjectConfigPath(repoPath), legacyConfig: legacyProjectConfigPath(repoPath), binding }, null, 2));
}

async function logoutOrbit(): Promise<void> {
  const backendUrl = getArg('--backend-url');
  const config = await readGlobalOrbitConfig();
  const sessions = globalSessions(config);
  let cleared: string[];

  if (backendUrl) {
    const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
    cleared = Object.prototype.hasOwnProperty.call(sessions, normalizedBackendUrl) ? [normalizedBackendUrl] : [];
    delete sessions[normalizedBackendUrl];
    config.sessions = sessions;
  } else {
    cleared = Object.keys(sessions);
    config.sessions = {};
  }

  delete config.token;
  delete config.key;
  delete config.session;
  delete config.account;
  delete config.user;
  await writeGlobalOrbitConfigObject(config);
  console.log(JSON.stringify({ ok: true, cleared }, null, 2));
}

async function showProject(): Promise<void> {
  const repoPath = resolveRepoArg();
  const binding = await readProjectBinding(repoPath);
  if (!binding) {
    console.error(`No AxisNode project binding found at ${axisProjectConfigPath(repoPath)} or ${legacyProjectConfigPath(repoPath)}`);
    process.exit(1);
  }

  if (hasFlag('--json')) {
    console.log(JSON.stringify(binding, null, 2));
    return;
  }

  console.log(`repo: ${binding.repo}`);
  console.log(`backendUrl: ${binding.backendUrl}`);
  if (binding.mcpUrl) console.log(`mcpUrl: ${binding.mcpUrl}`);
  console.log(`productLineUuid: ${binding.productLineUuid ?? '-'}`);
  console.log(`projectUuid: ${binding.projectUuid ?? '-'}`);
  if (binding.productLineId || binding.projectId) {
    console.log(`productLineId: ${binding.productLineId ?? '-'}`);
    console.log(`projectId: ${binding.projectId ?? '-'}`);
  }
  console.log(`owner: ${binding.owner ?? '-'}`);
  console.log(`updatedAt: ${binding.updatedAt}`);
}

function safeProjectBinding(binding: ProjectBinding | null, repoPath: string): Json | null {
  if (!binding) return null;
  const safe: Json = {};
  for (const key of SAFE_BINDING_KEYS) {
    const value = binding[key];
    if (value !== undefined && value !== null) safe[key] = value;
  }
  if (!safe.repo) safe.repo = repoPath;
  return safe;
}

function poolMethodologyMap(): Record<PoolConfig['kind'], string> {
  return { ...POOL_METHODOLOGY_BY_KIND };
}

function canonicalLifecycleStatus(status: string | null | undefined): string | null {
  const value = status?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'pending-confirmation') return LIFECYCLE_NEW;
  if (lower === 'ready') return LIFECYCLE_WAIT_CODE;
  if (['new', 'wait_review', 'wait_user_confirm', 'wait_code'].includes(lower)) return value.toUpperCase().replace(/-/g, '_');
  return value;
}

function isReviewInputStatus(status: string | null | undefined): boolean {
  const canonical = canonicalLifecycleStatus(status);
  return canonical === LIFECYCLE_NEW || canonical === LIFECYCLE_WAIT_REVIEW;
}

function gstackSkillCheckoutPath(skillName: string): string {
  return path.join(gstackHomeDir(), skillName.replace(/^gstack-/, ''), 'SKILL.md');
}

function gstackSkillCandidatePaths(skillName: string): string[] {
  return [
    hermesSkillPath(skillName),
    path.join(gstackHomeDir(), '.hermes', 'skills', skillName, 'SKILL.md'),
    gstackSkillCheckoutPath(skillName),
  ];
}

function gstackSkillExists(skillName: string): boolean {
  return gstackSkillCandidatePaths(skillName).some((candidate) => existsSync(candidate));
}

function uniqueMethodologyCandidates(candidates: MethodologyCandidate[]): MethodologyCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = path.resolve(candidate.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ideaMethodologyCandidates(): MethodologyCandidate[] {
  return uniqueMethodologyCandidates([
    { skill: 'gstack-plan-ceo-review', source: 'hermes', path: hermesSkillPath('gstack-plan-ceo-review') },
    { skill: 'plan-ceo-review', source: 'hermes', path: hermesSkillPath('plan-ceo-review') },
    { skill: 'gstack-plan-ceo-review', source: 'gstack-checkout-hermes', path: path.join(gstackHomeDir(), '.hermes', 'skills', 'gstack-plan-ceo-review', 'SKILL.md') },
    { skill: 'plan-ceo-review', source: 'gstack-checkout-hermes', path: path.join(gstackHomeDir(), '.hermes', 'skills', 'plan-ceo-review', 'SKILL.md') },
    { skill: 'gstack-plan-ceo-review', source: 'gstack-checkout', path: gstackSkillCheckoutPath('gstack-plan-ceo-review') },
  ]);
}

function existingIdeaMethodologyCandidate(): MethodologyCandidate | null {
  return ideaMethodologyCandidates().find((entry) => existsSync(entry.path)) ?? null;
}

function superpowersSkillDir(methodologySkill: string): string | null {
  if (methodologySkill === 'superpowers:brainstorm') return 'brainstorming';
  if (methodologySkill === 'superpowers:systematic-debugging') return 'systematic-debugging';
  return null;
}

async function superpowersMethodologyCandidates(methodologySkill: string): Promise<MethodologyCandidate[]> {
  const skillDir = superpowersSkillDir(methodologySkill);
  if (!skillDir) return [];

  const directSources = [
    { source: 'codex-superpowers', root: codexSuperpowersSkillRoot() },
    process.env.AXIS_CODEX_SUPERPOWERS_SOURCE ? { source: 'codex-superpowers-env', root: path.resolve(process.env.AXIS_CODEX_SUPERPOWERS_SOURCE) } : null,
    { source: 'codex-superpowers-cache', root: path.join(homeDir(), '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills') },
    { source: 'codex-superpowers-cache', root: path.join(homeDir(), '.codex', 'plugins', 'superpowers', 'skills') },
  ].filter((entry): entry is { source: string; root: string } => Boolean(entry));

  const cacheSource = await findSuperpowersCacheSource();
  if (cacheSource) {
    directSources.push({ source: 'codex-superpowers-cache', root: cacheSource });
  }

  return uniqueMethodologyCandidates(directSources.map((entry) => ({
    skill: methodologySkill,
    source: entry.source,
    path: path.join(entry.root, skillDir, 'SKILL.md'),
  })));
}

async function methodologyCandidatesForPool(pool: PoolConfig, methodologySkill: string): Promise<MethodologyCandidate[]> {
  if (pool.kind === 'idea') return ideaMethodologyCandidates();
  if (methodologySkill.startsWith('superpowers:')) return superpowersMethodologyCandidates(methodologySkill);
  return [{ skill: methodologySkill, source: 'hermes', path: hermesSkillPath(methodologySkill) }];
}

function resolvePoolMethodologySkill(pool: PoolConfig): string {
  if (pool.kind !== 'idea') return POOL_METHODOLOGY_BY_KIND[pool.kind];
  const candidate = existingIdeaMethodologyCandidate();
  if (candidate) return candidate.skill;
  return POOL_METHODOLOGY_BY_KIND.idea;
}

function redactSensitiveSkillContent(content: string): string {
  return content
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted private key]')
    .replace(/\b(token|password|passwd|secret|session|api[_-]?key|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}["']?/gi, '$1: [redacted by axis-tools]');
}

async function readMethodologyCandidate(candidate: MethodologyCandidate): Promise<MethodologyInjection | null> {
  if (!existsSync(candidate.path)) return null;
  try {
    const raw = await readFile(candidate.path, 'utf8');
    if (raw.includes('\u0000')) {
      return {
        skill: candidate.skill,
        source: candidate.source,
        path: candidate.path,
        content: '',
        injected: false,
        warning: `Methodology skill content at ${candidate.path} appears to be binary; content was not injected.`,
        truncated: false,
        bytes: 0,
      };
    }

    const redacted = redactSensitiveSkillContent(raw.replace(/\r\n/g, '\n'));
    const truncated = redacted.length > METHODOLOGY_INJECTION_MAX_CHARS;
    const content = truncated
      ? `${redacted.slice(0, METHODOLOGY_INJECTION_MAX_CHARS)}\n\n[axis-tools: methodology SKILL.md truncated to ${METHODOLOGY_INJECTION_MAX_CHARS} characters before prompt injection.]`
      : redacted;
    return {
      skill: candidate.skill,
      source: candidate.source,
      path: candidate.path,
      content,
      injected: true,
      warning: truncated ? `Methodology skill content at ${candidate.path} was truncated before prompt injection.` : null,
      truncated,
      bytes: Buffer.byteLength(raw, 'utf8'),
    };
  } catch (error) {
    return {
      skill: candidate.skill,
      source: candidate.source,
      path: candidate.path,
      content: '',
      injected: false,
      warning: `Methodology skill content at ${candidate.path} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      truncated: false,
      bytes: 0,
    };
  }
}

async function resolvePoolMethodologyInjection(pool: PoolConfig): Promise<MethodologyInjection> {
  const methodologySkill = resolvePoolMethodologySkill(pool);
  const candidates = await methodologyCandidatesForPool(pool, methodologySkill);
  const checkedPaths = candidates.map((candidate) => candidate.path);
  let firstReadFailure: MethodologyInjection | null = null;
  for (const candidate of candidates) {
    const injection = await readMethodologyCandidate(candidate);
    if (!injection) continue;
    if (injection.injected) return injection;
    firstReadFailure ??= injection;
  }

  if (firstReadFailure) return firstReadFailure;

  return {
    skill: methodologySkill,
    source: null,
    path: null,
    content: '',
    injected: false,
    warning: `Methodology skill content for ${methodologySkill} was not found on local filesystem${checkedPaths.length > 0 ? `; checked ${checkedPaths.join(', ')}` : ''}.`,
    truncated: false,
    bytes: 0,
  };
}

function localPoolTemplate(pool: PoolConfig, source = 'local-fallback'): Json {
  const sectionsByKind: Record<PoolConfig['kind'], string[]> = {
    requirement: ['背景', '目标', '范围', '用户故事', '验收标准', '风险', 'WorkItems'],
    idea: ['问题假设', '目标用户', '价值主张', 'MVP', '验证方式', '风险', '下一步'],
    bug: ['现象', '影响范围', '复现步骤', '期望结果', '实际结果', '日志线索', '修复建议', '验证方式'],
    suggestion: ['当前问题', '优化目标', '方案', '收益', '风险', '验收方式', 'WorkItems'],
  };
  const sections = sectionsByKind[pool.kind];
  const markdownTemplate = [
    '# {{title}}',
    '',
    '> 根据用户 seed 和项目上下文生成 orbit.pool.artifact.v1。',
    '',
    ...sections.flatMap((section) => [`## ${section}`, '']),
  ].join('\n');
  return {
    source,
    schemaVersion: 'orbit.pool.template.v1',
    kind: pool.kind,
    displayName: pool.displayName,
    templateVersion: 'cli-fallback.v1',
    markdownTemplate,
    artifactSchema: 'orbit.pool.artifact.v1',
    requiredSections: sections,
    instructions: [
      '用户只输入 seed；请结合模板和项目上下文生成标准 artifact。',
      '输出 JSON schemaVersion 必须为 orbit.pool.artifact.v1。',
      '不要包含 token、session、key、password 等凭据。',
    ],
  };
}

function compactDocument(document: Json): Json {
  const source = isJson(document.source) ? document.source : {};
  return {
    id: safeString(document.id),
    title: safeString(document.title) ?? safeString(document.name),
    status: safeString(document.status),
    kind: safeString(source.type) ?? safeString(source.kind) ?? safeString(document.kind),
    summary: safeString(document.summary),
  };
}

function compactWorkItem(item: Json): Json {
  return {
    id: safeString(item.id),
    title: safeString(item.title) ?? safeString(item.name),
    type: safeString(item.type),
    pool: safeString(item.pool) ?? safeString(item.category),
    status: safeString(item.status),
    sourceArtifactId: safeString(item.sourceArtifactId),
  };
}

async function fetchPoolTemplateContext(pool: PoolConfig, repoPath: string): Promise<PoolTemplateContext> {
  const binding = await readProjectBinding(repoPath);
  const projectContext: Json = {
    bound: Boolean(binding),
    binding: safeProjectBinding(binding, repoPath),
    project: binding ? {
      id: binding.projectId ?? binding.projectUuid ?? null,
      uuid: binding.projectUuid ?? null,
      name: binding.projectName ?? null,
      productLineId: binding.productLineId ?? binding.productLineUuid ?? null,
      productLineName: binding.productLineName ?? null,
      repo: repoPath,
    } : null,
    documents: [],
    workItems: [],
  };
  if (!binding) {
    return { template: localPoolTemplate(pool), projectContext, warning: 'No AxisNode project binding found; using local fallback template.' };
  }
  const projectId = projectApiId(binding);
  if (!projectId) {
    return { template: localPoolTemplate(pool), projectContext, warning: 'Project binding has no projectId/projectUuid; using local fallback template.' };
  }
  const token = await tokenForBinding(binding);
  let warning: string | null = null;
  let template = localPoolTemplate(pool);
  try {
    const payload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/pool-templates?kind=${encodeURIComponent(pool.kind)}`, token);
    template = isJson(payload) ? { source: 'hub', ...payload } : localPoolTemplate(pool);
    if (isJson(payload) && isJson(payload.project)) projectContext.project = payload.project;
  } catch (error) {
    warning = `AxisNode template fetch failed; using local fallback template. ${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    const docsPayload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/documents?page=1&pageSize=10`, token);
    projectContext.documents = documentArray(docsPayload).slice(0, 10).map(compactDocument);
  } catch (error) {
    warning = warning ?? `AxisNode project documents fetch failed; context is partial. ${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    const itemsPayload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/work-items?page=1&pageSize=10`, token);
    projectContext.workItems = documentArray(itemsPayload).slice(0, 10).map(compactWorkItem);
  } catch (error) {
    warning = warning ?? `AxisNode project workItems fetch failed; context is partial. ${error instanceof Error ? error.message : String(error)}`;
  }
  return { template, projectContext, warning };
}

async function preparePool(pool: PoolConfig): Promise<void> {
  const repoPath = resolveRepoArg();
  const binding = await readProjectBinding(repoPath);
  const cloud = await fetchPoolTemplateContext(pool, repoPath);
  const payload = {
    schemaVersion: 'orbit.pool.prepare.v1',
    pool: pool.pool,
    kind: pool.kind,
    displayName: pool.displayName,
    repo: repoPath,
    bound: Boolean(binding),
    binding: safeProjectBinding(binding, repoPath),
    skill: pool.skill,
    methodologySkill: resolvePoolMethodologySkill(pool),
    template: cloud.template,
    projectContext: cloud.projectContext,
    expectedArtifactSchema: 'orbit.pool.artifact.v1',
    instructions: [
      `Before producing the artifact, use the methodology skill ${resolvePoolMethodologySkill(pool)} for ${pool.kind} seeds.`,
      'Use the user seed plus template.markdownTemplate plus projectContext to produce orbit.pool.artifact.v1 JSON.',
      `Artifact kind must be ${pool.kind}; artifactSchema is orbit.pool.artifact.v1.`,
      'If key information is missing, ask clarifying questions or include explicit open questions in the artifact.',
      `When already running inside an Agent/Skill, generate the artifact yourself and call ${pool.command} import --stdin. This import will try AxisNode first; pass --local for local-only fallback/debug output.`,
      'Do not include credentials, tokens, passwords, sessions, or private keys in artifacts.',
    ],
    warning: cloud.warning,
  };
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

function firstMarkdownTitle(markdown: string): string | null {
  const line = markdown.split(/\r?\n/).find((entry) => /^#\s+/.test(entry.trim()));
  return line ? line.replace(/^#\s+/, '').trim() || null : null;
}

function localDateStamp(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function poolArtifactFromMarkdown(pool: PoolConfig, markdown: string): PoolArtifact {
  const title = firstMarkdownTitle(markdown) ?? `${pool.displayName} ${localDateStamp()}`;
  return {
    schemaVersion: 'orbit.pool.artifact.v1',
    kind: pool.kind,
    title,
    summary: '',
    status: 'draft',
    markdown,
    sections: [],
    workItems: [],
  };
}

function poolArtifactFromText(pool: PoolConfig, text: string): PoolArtifact {
  const title = text.trim().split(/\r?\n/)[0]?.trim() || `${pool.displayName} ${localDateStamp()}`;
  const markdown = [
    `# ${title}`,
    '',
    '## Summary',
    text.trim() || 'Draft artifact generated by AxisNode Tools.',
    '',
    '## Details',
    '',
    '## Acceptance Criteria',
    '',
    '## WorkItems',
    '',
  ].join('\n');
  return {
    schemaVersion: 'orbit.pool.artifact.v1',
    kind: pool.kind,
    title,
    summary: text.trim(),
    status: 'draft',
    markdown,
    sections: [],
    workItems: [],
  };
}

function normalizePoolArtifact(pool: PoolConfig, input: string): PoolArtifact {
  const trimmed = input.trim();
  if (!trimmed) return poolArtifactFromText(pool, '');
  if (trimmed.startsWith('{')) {
    const raw = parseJsonText(trimmed);
    const kind = safeString(raw.kind);
    if (kind && kind !== pool.kind) {
      throw new Error(`Artifact kind ${kind} does not match ${pool.kind}`);
    }
    const markdown = safeString(raw.markdown) ?? `# ${safeString(raw.title) ?? `${pool.displayName} ${localDateStamp()}`}\n`;
    const title = safeString(raw.title) ?? firstMarkdownTitle(markdown) ?? `${pool.displayName} ${localDateStamp()}`;
    return {
      schemaVersion: 'orbit.pool.artifact.v1',
      kind: pool.kind,
      title,
      summary: safeString(raw.summary) ?? '',
      status: safeString(raw.status) ?? 'draft',
      markdown,
      sections: Array.isArray(raw.sections) ? raw.sections : [],
      workItems: Array.isArray(raw.workItems) ? raw.workItems : [],
    };
  }
  if (/^#\s+/m.test(trimmed)) return poolArtifactFromMarkdown(pool, input);
  return poolArtifactFromText(pool, input);
}

async function readStdinText(): Promise<string> {
  let input = '';
  for await (const chunk of process.stdin) {
    input += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  }
  return input;
}

async function readPoolInput(args: string[]): Promise<string> {
  const fromFile = getArg('--from') ?? getArg('--file');
  if (fromFile) return readFile(path.resolve(fromFile), 'utf8');
  if (hasFlag('--stdin')) return readStdinText();
  return collectFreeText(args);
}

function collectFreeText(args: string[]): string {
  const flagsWithValue = new Set(['--repo', '--from', '--file', '--agent', '--page', '--page-size', '--delete']);
  const text: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (flagsWithValue.has(arg)) {
      index++;
      continue;
    }
    if (arg === '--save' || arg === '--local' || arg === '--save-local' || arg === '--no-doc' || arg === '--dry-run' || arg === '--stdin' || arg === '--json' || arg === '--list' || arg === '--yes' || arg === '--help' || arg === '-h') continue;
    if (arg.startsWith('--')) continue;
    text.push(arg);
  }
  return text.join(' ').trim();
}

function yamlScalar(value: string): string {
  if (value && /^[A-Za-z0-9_./:@ -]+$/.test(value)) return value;
  return JSON.stringify(value);
}

async function savePoolArtifact(pool: PoolConfig, artifact: PoolArtifact, repoPath: string, source: string): Promise<string> {
  const binding = await readProjectBinding(repoPath);
  const targetDir = path.join(repoPath, pool.defaultDir);
  ensureDir(targetDir);
  const fallbackSlug = pool.command.startsWith('axis-') ? 'axis-item' : 'orbit-item';
  const fileName = `${localDateStamp()}-${pool.pool}-${safeSlug(artifact.title, fallbackSlug)}.md`;
  const filePath = path.join(targetDir, fileName);
  const metadata = [
    '---',
    `kind: ${artifact.kind}`,
    `source: ${yamlScalar(source)}`,
    `command: ${pool.command}`,
    `project: ${yamlScalar(binding?.projectName ?? binding?.projectUuid ?? binding?.projectId ?? '')}`,
    `productLine: ${yamlScalar(binding?.productLineName ?? binding?.productLineUuid ?? binding?.productLineId ?? '')}`,
    `repo: ${yamlScalar(repoPath)}`,
    `createdAt: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');
  await writeFile(filePath, `${metadata}${artifact.markdown.replace(/\s*$/, '\n')}`, 'utf8');
  return filePath;
}

function shouldUseLocalOnly(): boolean {
  return hasFlag('--local') || hasFlag('--save-local') || hasFlag('--save');
}

function shouldSkipHubCache(): boolean {
  return hasFlag('--no-doc');
}

function buildPoolPayload(pool: PoolConfig, artifact: PoolArtifact, repoPath: string): Json {
  return {
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    status: LIFECYCLE_WAIT_USER_CONFIRM,
    markdown: artifact.markdown,
    sections: artifact.sections,
    workItems: artifact.workItems,
    sourceId: pool.command,
    source: 'CLI',
    artifact,
    repo: repoPath,
  };
}

function poolSeedTitle(pool: PoolConfig, seed: string): string {
  return seed.trim().split(/\r?\n/)[0]?.trim() || `${pool.displayName} ${localDateStamp()}`;
}

function buildPoolSeedPayload(pool: PoolConfig, seed: string, repoPath: string): Json {
  const trimmed = seed.trim();
  const title = poolSeedTitle(pool, trimmed);
  return {
    kind: pool.kind,
    title,
    seed: trimmed,
    summary: trimmed,
    status: LIFECYCLE_NEW,
    source: 'CLI',
    sourceId: pool.command,
    repo: repoPath,
  };
}

function canPromptForPoolSeedTarget(): boolean {
  return process.stdin.isTTY === true && !hasFlag('--json');
}

function shouldScanPoolSeedDir(entryName: string): boolean {
  if (POOL_SEED_DISCOVERY_EXCLUDED_DIRS.has(entryName)) return false;
  if (entryName.startsWith('.') || entryName === '') return false;
  return true;
}

function bindingDisplayName(binding: ProjectBinding): string {
  const product = binding.productLineName ?? binding.productLineUuid ?? binding.productLineId ?? 'Unknown product line';
  const project = binding.projectName ?? binding.projectUuid ?? binding.projectId ?? 'Unknown project';
  return `${product} / ${project}`;
}

function productLineDisplayName(binding: ProductLineBinding): string {
  return binding.productLineName ?? binding.productLineUuid ?? binding.productLineId ?? 'Unknown product line';
}

function describeDiscoveredProject(candidate: DiscoveredProjectBinding): string {
  return `${bindingDisplayName(candidate.binding)} - ${candidate.repoPath}`;
}

function describeDiscoveredProductLine(candidate: DiscoveredProductLineBinding): string {
  return `${productLineDisplayName(candidate.binding)} - ${candidate.rootPath}`;
}

function discoveryList<T>(items: T[], describe: (item: T) => string, limit = 8): string {
  const shown = items.slice(0, limit).map(describe);
  const hidden = items.length - shown.length;
  return hidden > 0 ? `${shown.join('; ')}; and ${hidden} more` : shown.join('; ');
}

async function discoverPoolSeedBindings(rootPath: string): Promise<PoolSeedBindingDiscovery> {
  const projects: DiscoveredProjectBinding[] = [];
  const productLines: DiscoveredProductLineBinding[] = [];
  const seenProjectConfigs = new Set<string>();
  const seenProductLineConfigs = new Set<string>();
  const queue: { dirPath: string; depth: number }[] = [{ dirPath: rootPath, depth: 0 }];
  let scannedDirs = 0;
  let capped = false;

  while (queue.length > 0) {
    if (scannedDirs >= POOL_SEED_DISCOVERY_MAX_DIRS) {
      capped = true;
      break;
    }

    const current = queue.shift();
    if (!current) break;
    const { dirPath, depth } = current;
    scannedDirs++;

    const project = await readProjectBindingWithPath(dirPath);
    if (project && !seenProjectConfigs.has(project.configPath)) {
      seenProjectConfigs.add(project.configPath);
      projects.push(project);
      if (projects.length >= POOL_SEED_DISCOVERY_MAX_CANDIDATES) {
        capped = true;
        break;
      }
    }

    const productLine = await readProductLineBindingWithPath(dirPath);
    if (productLine && !seenProductLineConfigs.has(productLine.configPath)) {
      seenProductLineConfigs.add(productLine.configPath);
      productLines.push(productLine);
    }

    if (depth >= POOL_SEED_DISCOVERY_MAX_DEPTH) continue;

    let entries: Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const directories = entries
      .filter((entry) => entry.isDirectory() && shouldScanPoolSeedDir(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));

    if (directories.length > POOL_SEED_DISCOVERY_MAX_CHILDREN) {
      capped = true;
    }

    for (const entry of directories.slice(0, POOL_SEED_DISCOVERY_MAX_CHILDREN)) {
      queue.push({ dirPath: path.join(dirPath, entry.name), depth: depth + 1 });
    }
  }

  return { projects, productLines, scannedDirs, capped };
}

function multiplePoolSeedTargetsWarning(repoPath: string, discovery: PoolSeedBindingDiscovery): string {
  const capText = discovery.capped ? ` Discovery was capped after scanning ${discovery.scannedDirs} directories.` : '';
  return [
    `Multiple AxisNode project bindings found under ${repoPath}; seed saved locally instead.`,
    'Run inside a specific project or pass --repo <project-path>.',
    `Candidates: ${discoveryList(discovery.projects, describeDiscoveredProject)}.`,
    capText.trim(),
  ].filter(Boolean).join(' ');
}

function cappedPoolSeedDiscoveryWarning(repoPath: string, discovery: PoolSeedBindingDiscovery): string {
  const candidateText = discovery.projects.length > 0
    ? ` Discovered candidates: ${discoveryList(discovery.projects, describeDiscoveredProject)}.`
    : '';
  return `AxisNode project binding discovery under ${repoPath} was capped after scanning ${discovery.scannedDirs} directories; seed saved locally instead. Run inside a specific project or pass --repo <project-path>.${candidateText}`;
}

function productLineOnlyPoolSeedWarning(repoPath: string, discovery: PoolSeedBindingDiscovery): string {
  const productLines = discoveryList(discovery.productLines, describeDiscoveredProductLine);
  const capText = discovery.capped ? ` Discovery was capped after scanning ${discovery.scannedDirs} directories.` : '';
  return [
    `AxisNode product-line binding found under ${repoPath}, but no project binding was discovered; seed saved locally instead.`,
    `Product lines: ${productLines}.`,
    'Run inside a project directory or pass --repo <project-path>.',
    capText.trim(),
  ].filter(Boolean).join(' ');
}

async function promptPoolSeedTarget(discovery: PoolSeedBindingDiscovery): Promise<DiscoveredProjectBinding> {
  const prompt = await createPromptSession();
  try {
    if (discovery.capped) {
      console.log(`AxisNode project discovery was capped after scanning ${discovery.scannedDirs} directories.`);
    }
    return await promptSelect(prompt, 'Select AxisNode project for this seed:', discovery.projects, describeDiscoveredProject);
  } finally {
    prompt.close();
  }
}

async function resolvePoolSeedTarget(repoPath: string): Promise<PoolSeedTarget> {
  const direct = await readProjectBinding(repoPath);
  if (direct) return { repoPath, binding: direct, warning: null };

  const discovery = await discoverPoolSeedBindings(repoPath);

  if (discovery.projects.length === 1 && !discovery.capped) {
    const candidate = discovery.projects[0];
    return {
      repoPath: candidate.repoPath,
      binding: candidate.binding,
      warning: `Resolved AxisNode project binding from ${repoPath} to ${candidate.repoPath}.`,
    };
  }

  if (discovery.projects.length > 0) {
    if (canPromptForPoolSeedTarget()) {
      const candidate = await promptPoolSeedTarget(discovery);
      return {
        repoPath: candidate.repoPath,
        binding: candidate.binding,
        warning: `Resolved AxisNode project binding from ${repoPath} to ${candidate.repoPath}.`,
      };
    }
    const warning = discovery.projects.length > 1
      ? multiplePoolSeedTargetsWarning(repoPath, discovery)
      : cappedPoolSeedDiscoveryWarning(repoPath, discovery);
    return { repoPath, binding: null, warning };
  }

  if (discovery.productLines.length > 0) {
    return { repoPath, binding: null, warning: productLineOnlyPoolSeedWarning(repoPath, discovery) };
  }

  if (discovery.capped) {
    return { repoPath, binding: null, warning: cappedPoolSeedDiscoveryWarning(repoPath, discovery) };
  }

  return { repoPath, binding: null, warning: 'No AxisNode project binding found; seed saved locally instead.' };
}

function localPoolSeedDir(repoPath: string): string {
  return path.join(repoPath, '.axis', 'pool-seeds');
}

async function savePoolSeed(pool: PoolConfig, payload: Json, repoPath: string): Promise<string> {
  const dir = localPoolSeedDir(repoPath);
  ensureDir(dir);
  const title = safeString(payload.title) ?? poolSeedTitle(pool, '');
  const filePath = path.join(dir, `${localDateStamp()}-${pool.pool}-${safeSlug(title, 'axis-seed')}.json`);
  await writeFile(filePath, `${JSON.stringify({ ...payload, savedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  return filePath;
}

async function submitPoolSeedToHub(pool: PoolConfig, binding: ProjectBinding, token: string | null, payload: Json): Promise<unknown> {
  const projectId = projectApiId(binding);
  if (!projectId) throw new Error('project binding has no projectId/projectUuid');
  if (!token) throw new Error('project binding has no token and no cached login session');
  return postOrbitJson(
    binding.backendUrl,
    `/api/projects/${encodeURIComponent(projectId)}/pool-seeds`,
    payload,
    token,
  );
}

function extractStatus(payload: unknown): string | null {
  if (!isJson(payload)) return null;
  return safeString(payload.status)
    ?? (isJson(payload.seed) ? extractStatus(payload.seed) : null)
    ?? (isJson(payload.data) ? extractStatus(payload.data) : null);
}

async function submitPoolSeed(pool: PoolConfig, repoPath: string, seed: string): Promise<PoolSeedResult> {
  const initialPayload = buildPoolSeedPayload(pool, seed, repoPath);
  const title = safeString(initialPayload.title) ?? poolSeedTitle(pool, seed);
  const summary = safeString(initialPayload.summary) ?? seed.trim();
  const status = safeString(initialPayload.status) ?? LIFECYCLE_NEW;

  if (hasFlag('--dry-run')) {
    return { ok: true, mode: 'dry-run', repo: repoPath, pool: pool.pool, kind: pool.kind, title, seed: seed.trim(), summary, status, id: null, url: null, savedPath: null, warning: null };
  }

  if (shouldUseLocalOnly()) {
    const savedPath = await savePoolSeed(pool, initialPayload, repoPath);
    return { ok: true, mode: 'local-seed', repo: repoPath, pool: pool.pool, kind: pool.kind, title, seed: seed.trim(), summary, status, id: null, url: null, savedPath, warning: null };
  }

  const target = await resolvePoolSeedTarget(repoPath);
  const payload = buildPoolSeedPayload(pool, seed, target.repoPath);
  if (target.binding) {
    try {
      const response = await submitPoolSeedToHub(pool, target.binding, await tokenForBinding(target.binding), payload);
      return {
        ok: true,
        mode: 'hub-seed',
        repo: target.repoPath,
        pool: pool.pool,
        kind: pool.kind,
        title,
        seed: seed.trim(),
        summary,
        status: extractStatus(response) ?? status,
        id: extractId(response),
        url: extractUrl(response),
        savedPath: null,
        warning: target.warning,
        response,
      };
    } catch (error) {
      const savedPath = await savePoolSeed(pool, payload, target.repoPath);
      const submitWarning = `AxisNode seed submit failed; seed saved locally instead. ${error instanceof Error ? error.message : String(error)}`;
      return {
        ok: true,
        mode: 'local-seed',
        repo: target.repoPath,
        pool: pool.pool,
        kind: pool.kind,
        title,
        seed: seed.trim(),
        summary,
        status,
        id: null,
        url: null,
        savedPath,
        warning: target.warning ? `${target.warning} ${submitWarning}` : submitWarning,
      };
    }
  }

  const savedPath = await savePoolSeed(pool, payload, target.repoPath);
  return {
    ok: true,
    mode: 'local-seed',
    repo: target.repoPath,
    pool: pool.pool,
    kind: pool.kind,
    title,
    seed: seed.trim(),
    summary,
    status,
    id: null,
    url: null,
    savedPath,
    warning: target.warning,
  };
}

function printPoolSeed(result: PoolSeedResult): void {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.kind}: ${result.title}`);
  console.log(`mode: ${result.mode}`);
  if (result.id) console.log(`id: ${result.id}`);
  console.log(`status: ${result.status}`);
  if (result.url) console.log(`url: ${result.url}`);
  if (result.savedPath) console.log(`savedPath: ${result.savedPath}`);
  if (result.warning) console.log(`warning: ${result.warning}`);
}

async function submitRequirementToHub(pool: PoolConfig, binding: ProjectBinding, token: string | null, artifact: PoolArtifact, repoPath: string): Promise<unknown> {
  const projectId = projectApiId(binding);
  if (!projectId) throw new Error('project binding has no projectId/projectUuid');
  if (!token) throw new Error('project binding has no token and no cached login session');
  return postOrbitJson(
    binding.backendUrl,
    `/api/projects/${encodeURIComponent(projectId)}/requirements`,
    buildPoolPayload(pool, artifact, repoPath),
    token,
  );
}

async function submitPoolDocumentToHub(pool: PoolConfig, binding: ProjectBinding, token: string | null, artifact: PoolArtifact, repoPath: string): Promise<unknown> {
  const projectId = projectApiId(binding);
  if (!projectId) throw new Error('project binding has no projectId/projectUuid');
  if (!token) throw new Error('project binding has no token and no cached login session');
  return postOrbitJson(
    binding.backendUrl,
    `/api/projects/${encodeURIComponent(projectId)}/pool-documents`,
    buildPoolPayload(pool, artifact, repoPath),
    token,
  );
}

async function submitPoolArtifact(pool: PoolConfig, repoPath: string, artifact: PoolArtifact, source: string): Promise<PoolSubmitResult> {
  if (hasFlag('--dry-run')) {
    return { ok: true, mode: 'dry-run', repo: repoPath, pool: pool.pool, artifact, id: null, url: null, savedPath: null, warning: null };
  }

  if (shouldUseLocalOnly()) {
    const savedPath = await savePoolArtifact(pool, artifact, repoPath, source);
    return { ok: true, mode: 'local', repo: repoPath, pool: pool.pool, artifact, id: null, url: null, savedPath, warning: null };
  }

  const binding = await readProjectBinding(repoPath);
  if (binding) {
    try {
      const token = await tokenForBinding(binding);
      let response: unknown;
      let warning: string | null = null;
      try {
        response = await submitPoolDocumentToHub(pool, binding, token, artifact, repoPath);
      } catch (error) {
        if (pool.kind === 'requirement' && error instanceof OrbitHttpError && error.status === 404) {
          response = await submitRequirementToHub(pool, binding, token, artifact, repoPath);
          warning = 'Hub /pool-documents endpoint returned 404; submitted requirement through legacy /requirements endpoint.';
        } else {
          throw error;
        }
      }
      const savedPath = shouldSkipHubCache() ? null : await savePoolArtifact(pool, artifact, repoPath, 'hub-cache');
      return {
        ok: true,
        mode: 'hub',
        repo: repoPath,
        pool: pool.pool,
        artifact,
        id: extractId(response),
        url: extractUrl(response),
        savedPath,
        itemsCount: extractItemsCount(response),
        warning,
        response,
      };
    } catch (error) {
      const warning = `AxisNode submit failed; saved locally instead. ${error instanceof Error ? error.message : String(error)}`;
      const savedPath = await savePoolArtifact(pool, artifact, repoPath, source);
      return { ok: true, mode: 'local', repo: repoPath, pool: pool.pool, artifact, id: null, url: null, savedPath, warning };
    }
  }

  const reason = !binding
    ? 'No AxisNode project binding found; saved locally instead.'
    : `Project binding is not usable for ${pool.kind}; saved locally instead.`;
  const savedPath = await savePoolArtifact(pool, artifact, repoPath, source);
  return { ok: true, mode: 'local', repo: repoPath, pool: pool.pool, artifact, id: null, url: null, savedPath, warning: reason };
}

function printPoolSubmit(result: PoolSubmitResult): void {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.artifact.kind}: ${result.artifact.title}`);
  console.log(`mode: ${result.mode}`);
  if (result.id) console.log(`id: ${result.id}`);
  if (result.url) console.log(`url: ${result.url}`);
  if (typeof result.itemsCount === 'number') console.log(`items: ${result.itemsCount}`);
  if (result.savedPath) console.log(`savedPath: ${result.savedPath}`);
  if (result.warning) console.log(`warning: ${result.warning}`);
}

async function importPoolArtifact(pool: PoolConfig, args: string[], source = `${pool.command} import`): Promise<void> {
  const repoPath = resolveRepoArg();
  const input = await readPoolInput(args);
  const artifact = normalizePoolArtifact(pool, input);
  printPoolSubmit(await submitPoolArtifact(pool, repoPath, artifact, source));
}

function parsePoolAgentArg(value: string | null): PoolAgentChoice | null {
  if (!value) return null;
  if (value === 'current' || value === 'codex' || value === 'claude-code' || value === 'none') return value;
  if (value === 'cc') return 'claude-code';
  throw new Error('--agent must be one of: codex, claude-code, current, none');
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    await execFileAsync('sh', ['-c', `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

async function runPoolAgent(
  agent: Exclude<PoolAgentChoice, 'current' | 'none'>,
  repoPath: string,
  prompt: string,
  options: { progress?: (message: string) => void } = {},
): Promise<string> {
  const command = agent === 'codex' ? 'codex' : 'claude';
  if (!await commandAvailable(command)) {
    throw new Error(`agent not found: ${command}`);
  }
  const args = agent === 'codex' ? ['exec', '--skip-git-repo-check', prompt] : ['-p', prompt];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!hasFlag('--json')) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (!hasFlag('--json')) {
        process.stderr.write(chunk);
      } else if (chunk.trim()) {
        process.stderr.write(chunk);
      }
    });
    child.on('error', (error) => {
      reject(new Error(`${command} command failed: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      options.progress?.(`agent exit: ${command} ${code === null ? signal ?? 'unknown' : code}`);
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const suffix = stderr.trim() || stdout.trim() || (signal ? `signal ${signal}` : `exit code ${code}`);
      reject(new Error(`${command} command failed: ${suffix}`));
    });
  });
}

function parseCreateEmployeeAgentArg(value: string | null): CreateEmployeeAgentChoice | null {
  if (!value) return null;
  if (value === 'codex' || value === 'claude-code') return value;
  if (value === 'cc' || value === 'claude') return 'claude-code';
  throw new Error('--agent must be one of: codex, claude-code, cc');
}

function parseCreateEmployeeLanguageArg(value: string | null): CreateEmployeeLanguage | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'zh' || normalized === 'cn' || normalized === 'chinese' || normalized === '中文') return 'zh';
  if (normalized === 'en' || normalized === 'english') return 'en';
  throw new Error('--language must be one of: zh, en, chinese, english');
}

function parseEmployeeRole(value: string | null): EmployeeRole | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  const match = EMPLOYEE_ROLE_OPTIONS.find((option) => option.value === normalized);
  if (match) return match.value;
  throw new Error('--role must be one of: development, qa, devops, architecture, product, design');
}

function employeeRoleLabel(role: EmployeeRole): string {
  return EMPLOYEE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

function normalizeEmployeeRoleValue(value: unknown): EmployeeRole | null {
  const normalized = safeString(value)?.trim().toLowerCase();
  if (!normalized) return null;
  return EMPLOYEE_ROLE_OPTIONS.find((option) => option.value === normalized)?.value ?? null;
}

async function resolveCreateEmployeeLanguage(): Promise<CreateEmployeeLanguage> {
  const explicit = parseCreateEmployeeLanguageArg(getArg('--language'));
  if (explicit) return explicit;
  if (!process.stdin.isTTY || hasFlag('--json')) return 'zh';

  const prompt = await createPromptSession();
  console.log('选择员工语言 / Select employee language:');
  console.log('  1. 中文 (default)');
  console.log('  2. English');
  while (true) {
    const answer = (await prompt.question('Enter number: ')).trim();
    if (answer === '') return 'zh';
    if (answer === '1') return 'zh';
    if (answer === '2') return 'en';
    console.log('Please enter 1, 2, or press Enter for 中文.');
  }
}

async function resolveCreateEmployeeAgent(): Promise<CreateEmployeeAgentChoice> {
  const explicit = parseCreateEmployeeAgentArg(getArg('--agent'));
  if (explicit) return explicit;

  const available: CreateEmployeeAgentChoice[] = [];
  if (await commandAvailable('codex')) available.push('codex');
  if (await commandAvailable('claude')) available.push('claude-code');
  if (available.length === 1) return available[0];
  if (available.length > 1 && process.stdin.isTTY && !hasFlag('--json')) {
    const prompt = await createPromptSession();
    return promptSelect(prompt, 'Select employee agent runtime:', available, (choice) => choice === 'codex' ? 'Codex' : 'Claude Code');
  }
  return available[0] ?? 'codex';
}

function machineIdentifier(): string {
  for (const filePath of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const value = readFileSync(filePath, 'utf8').trim();
      if (value) return value;
    } catch {
      // Fall through to hostname.
    }
  }
  return os.hostname();
}

function localIPAddresses(): string[] {
  const addresses: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry.address) continue;
      addresses.push(`${entry.family}:${entry.address}`);
    }
  }
  return [...new Set(addresses)].sort();
}

function createEmployeeId(now = new Date(), salt = randomBytes(16).toString('base64url')): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      machine: machineIdentifier(),
      ips: localIPAddresses(),
      timestamp: now.toISOString(),
      salt,
    }))
    .digest('base64url')
    .slice(0, 28);
  return `emp_${digest}`;
}

function axisEmployeesRootDir(): string {
  return path.join(axisHomeDir(), 'employees');
}

function axisEmployeeDir(employeeId: string): string {
  return path.join(axisEmployeesRootDir(), employeeId);
}

function employeeFallbackName(language: CreateEmployeeLanguage): string {
  return language === 'zh' ? '林知远' : 'Evelyn Hart';
}

function buildEmployeeSoulPrompt(employeeId: string, agent: CreateEmployeeAgentChoice, language: CreateEmployeeLanguage): string {
  const languageInstructions = language === 'zh'
    ? [
      'Language: 中文. soul.md, skill.md, and memory.md must be written in Chinese.',
      'Name requirement: choose a natural human-like name in the selected language: Chinese-style name or tasteful persona name.',
      'Do not use meaningless IDs or generic names such as emp_abc, Agent 1, Axis Employee, random tokens, or the employee id.',
      'The profile itself must be in Chinese and should include 姓名、性别、人格、角色定位、优势、工作方式、工作原则。',
    ]
    : [
      'Language: English. soul.md, skill.md, and memory.md must be written in English.',
      'Name requirement: choose a natural human-like name in the selected language: a human-like English name.',
      'Do not use meaningless IDs or generic names such as emp_abc, Agent 1, Axis Employee, random tokens, or the employee id.',
      'The profile itself must be in English and should include display name, gender, personality, role/persona, strengths, working style, and operating principles.',
    ];
  return [
    '# Axis employee creation',
    '',
    `Employee id seed/context: ${employeeId}`,
    `Agent runtime: ${agent}`,
    '',
    'Create your own Axis employee soul profile as Markdown.',
    'Use a natural human-like name/person-like display name that is suitable for the selected language.',
    ...languageInstructions,
    'Do not include secrets, credentials, raw machine fingerprints, IP addresses, or private local paths.',
    'Return only Markdown content for soul.md.',
  ].join('\n');
}

function fallbackEmployeeSoul(employeeId: string, agent: CreateEmployeeAgentChoice, language: CreateEmployeeLanguage, warning: string): string {
  const name = employeeFallbackName(language);
  if (language === 'zh') {
    return [
      `# ${name}`,
      '',
      `姓名：${name}`,
      '性别：未指定',
      `角色：通过 ${agent} 运行的 Axis 员工`,
      '',
      '人格：谨慎、简洁、重视执行质量。',
      '',
      '工作原则：',
      '- 始终围绕当前 Axis 目标保持范围清晰。',
      '- 保护用户数据、凭据和本机细节。',
      '- 在出现值得长期保留的上下文时更新 memory.md。',
      '',
      `创建说明：Agent 生成 soul.md 失败，因此 axis-tools 写入了中文 fallback。${warning}`,
    ].join('\n');
  }
  return [
    `# ${name}`,
    '',
    `Name: ${name}`,
    'Gender: unspecified',
    `Role: Axis employee operating through ${agent}`,
    '',
    'Personality: careful, concise, and execution-oriented.',
    '',
    'Operating principles:',
    '- Keep work scoped to the current Axis objective.',
    '- Preserve user data, credentials, and local machine details.',
    '- Record useful memory and skills as they become relevant.',
    '',
    `Creation note: Agent soul generation failed, so axis-tools wrote this English fallback. ${warning}`,
  ].join('\n');
}

function initialEmployeeSkill(employeeId: string, agent: CreateEmployeeAgentChoice, language: CreateEmployeeLanguage): string {
  if (language === 'zh') {
    return [
      '# Axis 员工技能',
      '',
      `员工：${employeeId}`,
      `Agent 运行时：${agent}`,
      '',
      '- 修改代码前先阅读当前任务、仓库上下文和 Hub 文档。',
      '- 保持实现范围清晰，并验证变更后的行为。',
      '- 当出现新的持久上下文时更新 memory.md。',
    ].join('\n');
  }
  return [
    '# Axis employee skills',
    '',
    `Employee: ${employeeId}`,
    `Agent runtime: ${agent}`,
    '',
    '- Read the current task, repository context, and Hub documents before changing code.',
    '- Keep implementation scoped and verify changed behavior.',
    '- Update memory.md when new durable context matters.',
  ].join('\n');
}

function initialEmployeeMemory(employeeId: string, language: CreateEmployeeLanguage): string {
  if (language === 'zh') {
    return [
      '# Axis 员工记忆',
      '',
      `员工：${employeeId}`,
      '',
      '- 由 axis create-employee 创建。',
      '- 暂无持久项目记忆。',
    ].join('\n');
  }
  return [
    '# Axis employee memory',
    '',
    `Employee: ${employeeId}`,
    '',
    '- Created by axis create-employee.',
    '- No durable project-specific memory has been recorded yet.',
  ].join('\n');
}

function normalizeEmployeeNameCandidate(value: string): string {
  return value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
}

function isMeaninglessEmployeeName(name: string, employeeId: string): boolean {
  const normalized = name.trim();
  if (!normalized) return true;
  const lower = normalized.toLowerCase();
  if (lower === employeeId.toLowerCase()) return true;
  if (lower.startsWith('emp_')) return true;
  if (/^agent\s*\d*$/i.test(normalized)) return true;
  if (/^axis\s+employee(?:\s+[a-z0-9_-]+)?$/i.test(normalized)) return true;
  if (/^(employee|worker|assistant|unknown|unnamed)$/i.test(normalized)) return true;
  if (/^[a-z0-9_-]{8,}$/i.test(normalized) && /[0-9_-]/.test(normalized)) return true;
  return false;
}

function isHumanizedEmployeeName(name: string, employeeId: string, language: CreateEmployeeLanguage): boolean {
  if (isMeaninglessEmployeeName(name, employeeId)) return false;
  if (language === 'zh') {
    return /[\u4e00-\u9fff]/.test(name) && !/(员工|助手|智能体|代理|测试|未命名)/.test(name);
  }
  if (/[\u4e00-\u9fff]/.test(name)) return false;
  return /[A-Za-z]{2,}/.test(name);
}

function extractEmployeeDisplayName(markdown: string, employeeId: string, language: CreateEmployeeLanguage): string {
  const candidates: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#\s+(.+?)\s*$/);
    if (heading?.[1] && !/axis employee creation/i.test(heading[1])) {
      candidates.push(normalizeEmployeeNameCandidate(heading[1]));
    }
    const named = line.match(/^\s*(?:name|display name|human name|姓名|显示名称|名字)\s*[:：]\s*(.+?)\s*$/i);
    if (named?.[1]) {
      candidates.push(normalizeEmployeeNameCandidate(named[1]));
    }
  }
  return candidates.find((candidate) => isHumanizedEmployeeName(candidate, employeeId, language))
    ?? employeeFallbackName(language);
}

function employeeSoulMatchesLanguage(markdown: string, language: CreateEmployeeLanguage): boolean {
  const hasChinese = /[\u4e00-\u9fff]/.test(markdown);
  if (language === 'zh') return hasChinese;
  return true;
}

async function runEmployeeSoulAgent(agent: CreateEmployeeAgentChoice, employeeDir: string, prompt: string): Promise<string> {
  const command = agent === 'codex' ? 'codex' : 'claude';
  if (!await commandAvailable(command)) {
    throw new Error(`agent not found: ${command}`);
  }
  const args = agent === 'codex' ? ['exec', prompt] : ['-p', prompt];
  const timeoutMs = Math.max(5_000, Number.parseInt(process.env.AXIS_EMPLOYEE_AGENT_TIMEOUT_MS ?? '120000', 10) || 120_000);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: employeeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${command} command failed: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const suffix = stderr.trim() || stdout.trim() || (signal ? `signal ${signal}` : `exit code ${code}`);
      reject(new Error(`${command} command failed: ${suffix}`));
    });
  });
}

async function ensureEmployeeRuntimeFiles(employeeId: string, agent: CreateEmployeeAgentChoice, language: CreateEmployeeLanguage, soul: string): Promise<{
  employeeDir: string;
  soul: string;
  skill: string;
  memory: string;
}> {
  const employeeDir = axisEmployeeDir(employeeId);
  ensureDir(employeeDir);
  const soulPath = path.join(employeeDir, 'soul.md');
  const skillPath = path.join(employeeDir, 'skill.md');
  const memoryPath = path.join(employeeDir, 'memory.md');
  await writeFile(soulPath, `${soul.trim()}\n`, 'utf8');
  if (!existsSync(skillPath)) {
    await writeFile(skillPath, `${initialEmployeeSkill(employeeId, agent, language)}\n`, 'utf8');
  }
  if (!existsSync(memoryPath)) {
    await writeFile(memoryPath, `${initialEmployeeMemory(employeeId, language)}\n`, 'utf8');
  }
  return {
    employeeDir,
    soul: await readFile(soulPath, 'utf8'),
    skill: await readFile(skillPath, 'utf8'),
    memory: await readFile(memoryPath, 'utf8'),
  };
}

async function registerEmployeeToHub(values: {
  backendUrl: string;
  employeeId: string;
  name: string;
  language: CreateEmployeeLanguage;
  role: EmployeeRole | null;
  agent: CreateEmployeeAgentChoice;
  documents: { soul: string; skill: string; memory: string };
}): Promise<{ ok: boolean; status: string; warning: string | null; response: unknown | null }> {
  const cached = await cachedLoginSession(values.backendUrl);
  try {
    const payload: Json = {
      employeeId: values.employeeId,
      name: values.name,
      language: values.language,
      agentType: values.agent,
      status: 'active',
      documents: values.documents,
    };
    if (values.role) payload.role = values.role;
    const response = await postOrbitJson(values.backendUrl, '/api/employees/register', payload, cached?.token);
    return { ok: true, status: 'registered', warning: null, response };
  } catch (error) {
    return { ok: false, status: 'failed', warning: error instanceof Error ? error.message : String(error), response: null };
  }
}

async function createEmployeeCommand(): Promise<void> {
  if (isHelpFlag(process.argv[3])) {
    printCreateEmployeeUsage();
    return;
  }
  const config = await readGlobalOrbitConfig();
  const backendUrl = normalizeBackendUrl(getArg('--backend-url') ?? safeString(config.backendUrl) ?? defaultBackendUrl());
  const language = await resolveCreateEmployeeLanguage();
  const role = parseEmployeeRole(getArg('--role'));
  const agent = await resolveCreateEmployeeAgent();
  const employeeId = createEmployeeId();
  const employeeDir = axisEmployeeDir(employeeId);
  ensureDir(employeeDir);
  const warnings: string[] = [];

  let soul: string;
  try {
    soul = await runEmployeeSoulAgent(agent, employeeDir, buildEmployeeSoulPrompt(employeeId, agent, language));
    if (!soul.trim()) {
      throw new Error('agent returned empty soul profile');
    }
    if (!employeeSoulMatchesLanguage(soul, language)) {
      throw new Error(`agent returned a soul profile that does not match language ${language}`);
    }
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    warnings.push(`Agent soul generation failed; wrote fallback soul.md. ${warning}`);
    soul = fallbackEmployeeSoul(employeeId, agent, language, warning);
  }

  const runtime = await ensureEmployeeRuntimeFiles(employeeId, agent, language, soul);
  const name = extractEmployeeDisplayName(runtime.soul, employeeId, language);
  const cloud = await registerEmployeeToHub({
    backendUrl,
    employeeId,
    name,
    language,
    role,
    agent,
    documents: {
      soul: runtime.soul,
      skill: runtime.skill,
      memory: runtime.memory,
    },
  });
  if (cloud.warning) warnings.push(`Hub registration failed. ${cloud.warning}`);
  await writeJsonFile(path.join(runtime.employeeDir, 'config.json'), {
    employeeId,
    name,
    language,
    ...(role ? { role } : {}),
    agentType: agent,
    backendUrl,
    localPath: runtime.employeeDir,
    status: 'active',
    cloud: {
      ok: cloud.ok,
      status: cloud.status,
      warning: cloud.warning,
    },
    createdAt: new Date().toISOString(),
  });

  const payload: Json = {
    ok: true,
    mode: 'create-employee',
    employeeId,
    name,
    language,
    ...(role ? { role } : {}),
    agent,
    localPath: runtime.employeeDir,
    cloud: {
      ok: cloud.ok,
      status: cloud.status,
      warning: cloud.warning,
    },
    warnings,
  };
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`employeeId: ${employeeId}`);
  console.log(`name: ${name}`);
  console.log(`language: ${language}`);
  if (role) console.log(`role: ${role} (${employeeRoleLabel(role)})`);
  console.log(`agent: ${agent}`);
  console.log(`local path: ${runtime.employeeDir}`);
  console.log(`cloud registration: ${cloud.status}`);
  for (const warning of warnings) console.error(`warning: ${warning}`);
}

function parseStartWorkAgentArg(value: string | null): StartWorkAgentChoice | null {
  if (!value) return null;
  if (value === 'codex' || value === 'claude-code' || value === 'claude') return value;
  if (value === 'cc') return 'claude-code';
  throw new Error('--agent must be one of: codex, claude-code, claude');
}

function startWorkRunnerAgent(agent: StartWorkAgentChoice): Exclude<PoolAgentChoice, 'current' | 'none'> {
  return agent === 'codex' ? 'codex' : 'claude-code';
}

function startWorkAgentCommand(agent: StartWorkAgentChoice): string {
  return agent === 'codex' ? 'codex' : 'claude';
}

function startWorkAgentName(agent: StartWorkAgentChoice): string {
  return agent === 'codex' ? 'Codex' : 'Claude Code';
}

function normalizeConfiguredStartWorkAgent(value: unknown): StartWorkAgentChoice | null {
  if (value === 'codex' || value === 'claude-code') return value;
  return null;
}

async function resolveStartWorkAgent(repoPath: string | null): Promise<StartWorkAgentChoice> {
  const explicit = parseStartWorkAgentArg(getArg('--agent'));
  if (explicit) return explicit;

  if (repoPath) {
    const binding = await readProjectBinding(repoPath);
    const boundAgent = normalizeConfiguredStartWorkAgent(binding?.selectedAgent);
    if (boundAgent) return boundAgent;
  }

  const config = await readGlobalOrbitConfig();
  const configuredAgent = normalizeConfiguredStartWorkAgent(config.selectedAgent);
  if (configuredAgent) return configuredAgent;

  if (await commandAvailable('codex')) return 'codex';
  if (await commandAvailable('claude')) return 'claude-code';
  throw new Error('No worker Agent is available; install codex or Claude Code, configure selectedAgent, or pass --agent codex/claude-code.');
}

function cliVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(path.join(cliPackageRoot(), 'package.json'), 'utf8')) as Json;
    return safeString(pkg.version);
  } catch {
    return null;
  }
}

function axisWorkerRootDir(): string {
  return path.join(axisHomeDir(), 'workers');
}

function axisWorkerSessionDir(sessionId: string): string {
  return path.join(axisWorkerRootDir(), sessionId);
}

function axisWorkerLogPath(sessionId: string): string {
  return path.join(axisWorkerSessionDir(sessionId), 'worker.log');
}

function axisWorkerConfigPath(sessionId: string): string {
  return path.join(axisWorkerSessionDir(sessionId), 'config.json');
}

function axisWorkerStatePath(sessionId: string): string {
  return path.join(axisWorkerSessionDir(sessionId), 'state.json');
}

function createStartWorkSessionId(agent: StartWorkAgentChoice): string {
  const host = safeSlug(os.hostname(), 'host');
  const random = Math.random().toString(36).slice(2, 8);
  return `axis-${host}-${process.pid}-${Date.now().toString(36)}-${agent.replace(/[^a-z0-9]+/g, '-')}-${random}`;
}

async function writeJsonFile(filePath: string, payload: Json): Promise<void> {
  ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function appendWorkerLog(sessionId: string, message: string): Promise<void> {
  ensureDir(axisWorkerSessionDir(sessionId));
  await appendFile(axisWorkerLogPath(sessionId), `${new Date().toISOString()} ${message}\n`, 'utf8');
}

async function writeWorkerState(sessionId: string, state: Json): Promise<void> {
  await writeJsonFile(axisWorkerStatePath(sessionId), {
    sessionId,
    updatedAt: new Date().toISOString(),
    ...state,
  });
}

function emitStartWorkProgress(message: string): void {
  const line = `[axis start-work] ${message}`;
  if (hasFlag('--json')) {
    console.error(line);
    return;
  }
  console.log(line);
}

function startWorkTargetScope(target: StartWorkTarget): Json {
  return {
    repoPath: target.repoPath,
    backendUrl: normalizeBackendUrl(target.binding.backendUrl),
    account: target.binding.account ?? target.binding.user?.account ?? null,
    employeeId: getArg('--employee-id'),
    productLineId: target.productLineId,
    productLineName: target.productLineName,
    projectId: target.projectId,
    projectName: target.projectName,
  };
}

function startWorkTargetsScope(targets: StartWorkTarget[]): Json {
  return {
    type: targets.length === 1 ? 'project' : 'workspace',
    count: targets.length,
    targets: targets.map(startWorkTargetScope),
  };
}

function requestedStartWorkScope(): Json {
  const repo = getArg('--repo');
  const projectId = getArg('--project-id');
  const projectUuid = getArg('--project-uuid');
  const productLineId = getArg('--product-line-id');
  const productLineUuid = getArg('--product-line-uuid');
  const employeeId = getArg('--employee-id');
  return {
    type: repo ? 'project' : 'workspace',
    repoPath: repo ? path.resolve(repo) : null,
    employeeId,
    projectId,
    projectUuid,
    productLineId,
    productLineUuid,
  };
}

function projectBindingMatchesStartWorkFilters(binding: ProjectBinding): boolean {
  const projectId = getArg('--project-id');
  const projectUuid = getArg('--project-uuid');
  const productLineId = getArg('--product-line-id');
  const productLineUuid = getArg('--product-line-uuid');
  if (projectId && projectId !== binding.projectId && projectId !== binding.projectUuid) return false;
  if (projectUuid && projectUuid !== binding.projectUuid) return false;
  if (productLineId && productLineId !== binding.productLineId && productLineId !== binding.productLineUuid) return false;
  if (productLineUuid && productLineUuid !== binding.productLineUuid) return false;
  return true;
}

function startWorkTargetFromBinding(repoPath: string, binding: ProjectBinding): StartWorkTarget | null {
  const projectId = projectApiId(binding);
  if (!projectId) return null;
  return {
    repoPath,
    binding,
    productLineId: binding.productLineId ?? binding.productLineUuid ?? null,
    productLineName: binding.productLineName ?? null,
    projectId,
    projectName: binding.projectName ?? null,
  };
}

async function resolveStartWorkTargets(): Promise<{ targets: StartWorkTarget[]; warnings: string[]; workspace?: AxisWorkspaceResolution }> {
  const repoArg = getArg('--repo');
  if (repoArg) {
    const repoPath = path.resolve(repoArg);
    const binding = await readProjectBinding(repoPath);
    if (!binding) {
      return { targets: [], warnings: [`No AxisNode project binding found at ${axisProjectConfigPath(repoPath)} or ${legacyProjectConfigPath(repoPath)}.`] };
    }
    if (!projectBindingMatchesStartWorkFilters(binding)) {
      return { targets: [], warnings: ['Bound repo does not match the requested --project/--product-line filter.'] };
    }
    const target = startWorkTargetFromBinding(repoPath, binding);
    if (!target) {
      return { targets: [], warnings: ['Project binding has no projectId/projectUuid; worker cannot claim WAIT_CODE work.'] };
    }
    return { targets: [target], warnings: [] };
  }

  const workspace = await resolveAxisWorkspaceForWorker();
  const targets = workspace.projects
    .map((project) => startWorkTargetFromBinding(project.repoPath, project.binding))
    .filter((target): target is StartWorkTarget => Boolean(target));
  return { targets, warnings: workspace.warnings, workspace };
}

function fallbackAgentContextDocument(key: string, warning?: string, source: 'employee' | 'project' = 'project'): StartWorkContextDocument {
  const message = warning ?? `Agent context document ${key} was not found; using empty fallback.`;
  return {
    key,
    found: false,
    content: `# ${key}\n\n${message}`,
    markdown: `# ${key}\n\n${message}`,
    warning: message,
    source,
  };
}

function startWorkContextDocumentsFromPayload(payload: unknown): { documents: StartWorkContextDocument[]; warnings: string[] } {
  const keys = ['soul.md', 'skill.md', 'memory.md'];
  const warnings: string[] = [];
  const documents: StartWorkContextDocument[] = [];
  const root = isJson(payload) ? payload : {};
  const rawDocuments = isJson(root.documents) ? root.documents : {};
  for (const key of keys) {
    const raw = isJson(rawDocuments[key]) ? rawDocuments[key] as Json : null;
    if (!raw) {
      const fallback = fallbackAgentContextDocument(key);
      documents.push(fallback);
      warnings.push(fallback.warning ?? '');
      continue;
    }
    const content = safeString(raw.content) ?? safeString(raw.markdown) ?? '';
    const document: StartWorkContextDocument = {
      key,
      found: raw.found === true,
      content: content || fallbackAgentContextDocument(key).content,
      markdown: safeString(raw.markdown) ?? content,
      warning: safeString(raw.warning) ?? undefined,
      source: 'project',
    };
    if (document.warning) warnings.push(document.warning);
    documents.push(document);
  }
  pushUniqueWarning(warnings, root.warning);
  return { documents, warnings: warnings.filter(Boolean) };
}

function remoteEmployeeContextMissingWarning(employeeId: string, key: string): string {
  return `Remote employee context document ${key} was not available for employee ${employeeId}; worker will not use local employee files as fallback.`;
}

function startWorkRemoteEmployeeDocumentsRoot(payload: unknown): Json {
  if (!isJson(payload)) return {};
  if (isJson(payload.employee) && isJson(payload.employee.documents)) return payload.employee.documents as Json;
  if (isJson(payload.documents)) return payload.documents as Json;
  return {};
}

function startWorkRemoteEmployeeRole(payload: unknown): EmployeeRole | null {
  if (!isJson(payload)) return null;
  if (isJson(payload.employee)) {
    return normalizeEmployeeRoleValue(payload.employee.role);
  }
  return normalizeEmployeeRoleValue(payload.role);
}

function startWorkEmployeeRoleDocument(role: EmployeeRole): StartWorkContextDocument {
  const label = employeeRoleLabel(role);
  const content = [
    `employee.role: ${role}`,
    `label: ${label}`,
    'Employee structured role is the highest-priority responsibility signal.',
    'Use soul.md, skill.md, and memory.md only as supporting context for this role.',
  ].join('\n');
  return {
    key: 'employee.role',
    found: true,
    content,
    markdown: content,
    source: 'employee',
    employeeRole: role,
  };
}

function remoteEmployeeDocumentContent(raw: unknown): { content: string; found: boolean; warning?: string } | null {
  if (typeof raw === 'string') {
    const content = raw.trim() ? raw : '';
    return content ? { content, found: true } : null;
  }
  if (!isJson(raw)) return null;
  if (raw.found === false) {
    return { content: '', found: false, warning: safeString(raw.warning) ?? undefined };
  }
  const content = safeString(raw.content)
    ?? safeString(raw.markdown)
    ?? safeString(raw.text)
    ?? safeString(raw.value)
    ?? '';
  if (!content.trim()) {
    return { content: '', found: false, warning: safeString(raw.warning) ?? undefined };
  }
  return { content, found: true, warning: safeString(raw.warning) ?? undefined };
}

function startWorkEmployeeContextDocumentsFromPayload(employeeId: string, payload: unknown): { documents: StartWorkContextDocument[]; warnings: string[] } {
  const keys = [
    { key: 'soul.md', remoteKey: 'soul' },
    { key: 'skill.md', remoteKey: 'skill' },
    { key: 'memory.md', remoteKey: 'memory' },
  ];
  const warnings: string[] = [];
  const documents: StartWorkContextDocument[] = [];
  const rawDocuments = startWorkRemoteEmployeeDocumentsRoot(payload);
  const role = startWorkRemoteEmployeeRole(payload);
  if (role) {
    documents.push(startWorkEmployeeRoleDocument(role));
  }

  for (const entry of keys) {
    const parsed = remoteEmployeeDocumentContent(rawDocuments[entry.remoteKey] ?? rawDocuments[entry.key]);
    if (!parsed?.found) {
      const warning = parsed?.warning ?? remoteEmployeeContextMissingWarning(employeeId, entry.key);
      documents.push(fallbackAgentContextDocument(entry.key, warning, 'employee'));
      warnings.push(warning);
      continue;
    }
    const document: StartWorkContextDocument = {
      key: entry.key,
      found: true,
      content: parsed.content,
      markdown: parsed.content,
      warning: parsed.warning,
      source: 'employee',
    };
    if (document.warning) warnings.push(document.warning);
    documents.push(document);
  }

  return { documents, warnings: warnings.filter(Boolean) };
}

async function fetchStartWorkContext(target: StartWorkTarget): Promise<{ documents: StartWorkContextDocument[]; warnings: string[] }> {
  const token = await tokenForBinding(target.binding);
  try {
    const query = `?projectId=${encodeURIComponent(target.projectId)}&keys=${encodeURIComponent('soul.md,skill.md,memory.md')}`;
    const payload = await fetchOrbitJson(target.binding.backendUrl, `/api/agent-context${query}`, token);
    return startWorkContextDocumentsFromPayload(payload);
  } catch (error) {
    const warning = `Axis Hub project agent-context fetch failed for ${target.projectId}; using empty project context fallback. ${error instanceof Error ? error.message : String(error)}`;
    return {
      documents: ['soul.md', 'skill.md', 'memory.md'].map((key) => fallbackAgentContextDocument(key, warning)),
      warnings: [warning],
    };
  }
}

function hubMissingAgentContextWarning(warning: string): boolean {
  return /Agent context document (?:soul|skill|memory)\.md was not found; using empty fallback\./.test(warning);
}

async function fetchStartWorkEmployeeContext(target: StartWorkTarget, employeeId: string): Promise<{ documents: StartWorkContextDocument[]; warnings: string[] }> {
  const token = await tokenForBinding(target.binding);
  try {
    const payload = await fetchOrbitJson(target.binding.backendUrl, `/api/employees/${encodeURIComponent(employeeId)}`, token);
    return startWorkEmployeeContextDocumentsFromPayload(employeeId, payload);
  } catch (error) {
    const warning = `Axis Hub employee context fetch failed for employee ${employeeId}; worker will not use local employee files as fallback. ${error instanceof Error ? error.message : String(error)}`;
    return {
      documents: ['soul.md', 'skill.md', 'memory.md'].map((key) => fallbackAgentContextDocument(key, warning, 'employee')),
      warnings: [warning],
    };
  }
}

function mergeStartWorkContextDocuments(values: {
  employee: { documents: StartWorkContextDocument[]; warnings: string[] } | null;
  project: { documents: StartWorkContextDocument[]; warnings: string[] };
}): { documents: StartWorkContextDocument[]; warnings: string[] } {
  if (!values.employee) {
    return {
      documents: values.project.documents,
      warnings: values.project.warnings,
    };
  }

  const usableProjectDocuments = values.project.documents.filter((document) => document.found !== false);
  return {
    documents: [...values.employee.documents, ...usableProjectDocuments],
    warnings: [
      ...values.employee.warnings,
      ...values.project.warnings.filter((warning) => !hubMissingAgentContextWarning(warning)),
    ],
  };
}

async function preloadStartWorkContexts(
  targets: StartWorkTarget[],
  progress: (message: string) => void,
): Promise<{ contexts: Map<string, StartWorkContextDocument[]>; warnings: string[] }> {
  const contexts = new Map<string, StartWorkContextDocument[]>();
  const warnings: string[] = [];
  const employeeId = getArg('--employee-id');
  for (const target of targets) {
    progress(`context: fetching project agent-context for ${target.projectId}`);
    const employeeContext = employeeId ? await fetchStartWorkEmployeeContext(target, employeeId) : null;
    if (employeeId) progress(`context: fetched remote employee documents for ${employeeId}`);
    const projectContext = await fetchStartWorkContext(target);
    const context = mergeStartWorkContextDocuments({ employee: employeeContext, project: projectContext });
    contexts.set(target.projectId, context.documents);
    for (const warning of context.warnings) {
      pushUniqueWarning(warnings, warning);
      progress(`context warning: ${warning}`);
    }
  }
  return { contexts, warnings };
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[axis-tools: truncated to ${maxChars} characters]`;
}

function startWorkContextMarkdown(documents: StartWorkContextDocument[]): string {
  return documents
    .map((document) => {
      const content = truncateText(document.markdown ?? document.content, 20_000);
      return `## ${document.key}\n\n${content}`;
    })
    .join('\n\n');
}

function startWorkContextDocumentsForSource(documents: StartWorkContextDocument[], source: 'employee' | 'project'): StartWorkContextDocument[] {
  return documents.filter((document) => document.source === source);
}

function startWorkResponsibilityContextDocuments(documents: StartWorkContextDocument[]): StartWorkContextDocument[] {
  const employeeDocuments = startWorkContextDocumentsForSource(documents, 'employee');
  return employeeDocuments.length > 0 ? employeeDocuments : documents;
}

function startWorkEmployeeContextUnavailable(documents: StartWorkContextDocument[]): boolean {
  const employeeDocuments = startWorkContextDocumentsForSource(documents, 'employee');
  return employeeDocuments.length > 0 && employeeDocuments.every((document) => document.found !== true);
}

function startWorkPromptContextSections(documents: StartWorkContextDocument[], fallbackTitle: string): string[] {
  const employeeDocuments = startWorkContextDocumentsForSource(documents, 'employee');
  if (employeeDocuments.length === 0) {
    return [
      fallbackTitle,
      '',
      startWorkContextMarkdown(documents),
    ];
  }

  const projectDocuments = startWorkContextDocumentsForSource(documents, 'project');
  const sections = [
    '# Employee Context',
    '',
    startWorkContextMarkdown(employeeDocuments),
  ];
  if (projectDocuments.length > 0) {
    sections.push('', '# Project Agent Context', '', startWorkContextMarkdown(projectDocuments));
  }
  return sections;
}

function buildStartWorkAgentPrompt(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  target: StartWorkTarget;
  workItem: Json;
  contextDocuments: StartWorkContextDocument[];
}): string {
  const contextSections = startWorkPromptContextSections(values.contextDocuments, '# Agent Context');
  const safeBinding = safeProjectBinding(values.target.binding, values.target.repoPath);
  return [
    '# Axis start-work coding execution',
    '',
    `Worker session: ${values.sessionId}`,
    `Agent runtime: ${values.agent}`,
    `Employee id: ${getArg('--employee-id') ?? 'unassigned'}`,
    `Repository: ${values.target.repoPath}`,
    '',
    ...contextSections,
    '',
    '# Project Scope',
    '',
    JSON.stringify(safeBinding, null, 2),
    '',
    '# WAIT_CODE WorkItem',
    '',
    JSON.stringify(values.workItem, null, 2),
    '',
    '# Instructions',
    '',
    'Implement the requested coding work in this repository.',
    'Use Employee Context as the employee identity and responsibility authority. Project Agent Context can supplement project details but must not redefine the employee role.',
    'Run the relevant verification commands for the changed surface when practical.',
    'Keep changes scoped to the WorkItem. Do not include Axis tokens, sessions, keys, or passwords in files or output.',
    'If execution is blocked, report the concrete blocker and the next required action.',
  ].join('\n');
}

function startWorkCandidateSummary(item: Json): Json {
  return {
    id: workItemId(item),
    title: workItemTitle(item),
    type: safeString(item.type) ?? safeString(item.kind) ?? safeString(item.sourceType),
    pool: safeString(item.pool) ?? safeString(item.category),
    status: safeString(item.status),
    notes: safeString(item.notes) ?? safeString(item.summary),
    sourceArtifactId: safeString(item.sourceArtifactId) ?? safeString(item.documentId),
  };
}

function buildStartWorkSelectionPrompt(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  target: StartWorkTarget;
  contextDocuments: StartWorkContextDocument[];
  candidates: Json[];
}): string {
  const contextSections = startWorkPromptContextSections(values.contextDocuments, '# Employee Context');
  const safeBinding = safeProjectBinding(values.target.binding, values.target.repoPath);
  return [
    '# Axis start-work task selection',
    '',
    `Worker session: ${values.sessionId}`,
    `Agent runtime: ${values.agent}`,
    `Employee id: ${getArg('--employee-id') ?? 'unassigned'}`,
    `Repository: ${values.target.repoPath}`,
    '',
    ...contextSections,
    '',
    '# Project Scope',
    '',
    JSON.stringify(safeBinding, null, 2),
    '',
    '# Candidate WorkItems',
    '',
    JSON.stringify(values.candidates, null, 2),
    '',
    '# Selection Rules',
    '',
    'Use Employee Context as the only authority for this employee\'s role and responsibilities.',
    'When employee.role is present, treat that structured field as the highest-priority responsibility signal.',
    'Use Project Agent Context only as supplemental project information; do not infer or replace the employee role from it.',
    'Choose the one WorkItem that best matches this employee\'s structured role, using soul.md, skill.md, and memory.md only as supporting context.',
    'Top-level employee roles are exactly: development/开发, qa/测试, devops/运维, architecture/架构, product/产品, design/美工.',
    'Do not treat frontend/backend as top-level employee roles; they are ordinary task terms under broader work categories.',
    'Do not choose based on queue order. Prefer responsibility fit over first available item.',
    'If no candidate matches the employee responsibilities, select null and explain why the worker should idle.',
    'Only select an id that appears in Candidate WorkItems.',
    'Return strict JSON only, with no Markdown, code fences, or commentary.',
    'Required shape: {"selectedWorkItemId":"...","reason":"..."} or {"selectedWorkItemId":null,"reason":"..."}',
  ].join('\n');
}

function startWorkSelectionJson(selection: StartWorkSelectionDecision): Json {
  return {
    selectedWorkItemId: selection.selectedWorkItemId,
    reason: selection.reason,
    source: selection.source,
    warning: selection.warning,
  };
}

function parseStartWorkSelectionOutput(output: string, candidateIds: Set<string>): { selection: StartWorkSelectionDecision | null; warning: string | null } {
  const trimmed = output.trim();
  if (!trimmed) {
    return { selection: null, warning: 'selection agent returned empty output' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { selection: null, warning: 'selection agent returned invalid JSON' };
  }

  if (!isJson(raw)) {
    return { selection: null, warning: 'selection agent JSON was not an object' };
  }

  if (!Object.prototype.hasOwnProperty.call(raw, 'selectedWorkItemId')) {
    return { selection: null, warning: 'selection agent JSON omitted selectedWorkItemId' };
  }

  const reason = safeString(raw.reason);
  if (!reason) {
    return { selection: null, warning: 'selection agent JSON omitted reason' };
  }

  const rawSelected = raw.selectedWorkItemId;
  if (rawSelected === null) {
    return { selection: { selectedWorkItemId: null, reason, source: 'agent' }, warning: null };
  }

  const selectedWorkItemId = safeString(rawSelected);
  if (!selectedWorkItemId) {
    return { selection: null, warning: 'selection agent selectedWorkItemId must be a string or null' };
  }
  if (!candidateIds.has(selectedWorkItemId)) {
    return { selection: null, warning: `selection agent selected non-candidate WorkItem ${selectedWorkItemId}` };
  }

  return { selection: { selectedWorkItemId, reason, source: 'agent' }, warning: null };
}

const START_WORK_RESPONSIBILITY_KEYWORD_GROUPS = [
  {
    role: 'development',
    name: 'development/开发',
    contextKeywords: ['development', 'developer', 'software development', 'coding', 'code', 'implementation', 'programming', 'programmer', 'feature work', 'frontend', 'front-end', 'front end', 'backend', 'back-end', 'back end', 'api', 'server', 'service', 'database', 'react', 'vue', 'node', 'go', '开发', '研发', '编码', '代码', '实现', '程序', '工程', '前端', '后端', '接口', '服务端', '数据库'],
    taskKeywords: ['development', 'develop', 'developer', 'coding', 'code', 'implementation', 'implement', 'feature', 'frontend', 'front-end', 'front end', 'backend', 'back-end', 'back end', 'api', 'endpoint', 'server', 'service', 'database', 'db', 'sql', 'migration', 'schema', 'auth', 'react', 'vue', 'component', '开发', '研发', '编码', '代码', '实现', '程序', '工程', '前端', '后端', '接口', '服务端', '数据库'],
  },
  {
    role: 'qa',
    name: 'qa/测试',
    contextKeywords: ['testing', 'qa', 'quality assurance', 'quality', 'tester', 'test automation', 'e2e', 'playwright', 'unit test', 'integration test', 'regression', 'verification', 'validation', 'release quality', '测试', '质量', '验证', '回归', '自动化测试', '用例'],
    taskKeywords: ['testing', 'qa', 'test', 'tests', 'quality', 'e2e', 'playwright', 'unit test', 'integration test', 'coverage', 'regression', 'verification', 'validation', 'release quality', '测试', '质量', '验证', '回归', '自动化测试', '用例'],
  },
  {
    role: 'devops',
    name: 'devops/运维',
    contextKeywords: ['devops', 'ops', 'operations', 'sre', 'infra', 'infrastructure', 'ci', 'cd', 'deployment', 'deploy', 'release', 'docker', 'kubernetes', 'terraform', 'observability', 'monitoring', 'pipeline', '运维', '部署', '发布', '基础设施', '监控', '流水线', '容器'],
    taskKeywords: ['devops', 'ops', 'operations', 'sre', 'infra', 'infrastructure', 'ci', 'cd', 'deployment', 'deploy', 'release', 'rollback', 'docker', 'kubernetes', 'terraform', 'pipeline', 'observability', 'monitoring', '运维', '部署', '发布', '回滚', '基础设施', '监控', '流水线', '容器'],
  },
  {
    role: 'architecture',
    name: 'architecture/架构',
    contextKeywords: ['architecture', 'architect', 'system design', 'technical design', 'platform design', 'scalability', 'distributed system', 'domain model', '架构', '架构师', '系统设计', '技术方案', '技术设计', '领域模型', '可扩展'],
    taskKeywords: ['architecture', 'architect', 'system design', 'technical design', 'platform design', 'scalability', 'distributed system', 'domain model', 'refactor architecture', '架构', '系统设计', '技术方案', '技术设计', '领域模型', '可扩展'],
  },
  {
    role: 'product',
    name: 'product/产品',
    contextKeywords: ['product', 'product manager', 'pm', 'prd', 'roadmap', 'planning', 'requirements', 'acceptance criteria', 'user story', 'scope', 'tradeoff', '产品', '产品经理', '需求', '验收', '规划', '路线图', '范围', '方案'],
    taskKeywords: ['product', 'product manager', 'prd', 'roadmap', 'planning', 'acceptance criteria', 'user story', 'scope', 'tradeoff', '产品', '产品经理', '验收标准', '路线图', '范围', '产品方案', '需求文档'],
  },
  {
    role: 'design',
    name: 'design/美工',
    contextKeywords: ['design', 'designer', 'visual', 'visual design', 'ui design', 'ux', 'interaction design', 'interface design', 'graphic', 'art', 'mockup', 'prototype', 'figma', 'typography', 'color system', 'layout', 'css', '美工', '设计', '视觉', '界面', '交互', '原型', '高保真', '配色', '字体', '排版', '样式'],
    taskKeywords: ['design', 'designer', 'visual', 'visual design', 'ui', 'ui design', 'ux', 'interaction', 'interface', 'screen', 'layout', 'color', 'typography', 'polish', 'mockup', 'prototype', 'figma', 'css', '美工', '设计', '视觉', '界面', '交互', '原型', '高保真', '配色', '字体', '排版', '样式'],
  },
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordPattern(keyword: string): RegExp {
  const escaped = escapeRegExp(keyword.toLowerCase());
  const pattern = /^[a-z0-9]+$/.test(keyword) ? `\\b${escaped}\\b` : escaped;
  return new RegExp(pattern, 'g');
}

function keywordIsNegated(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 96), index);
  const clause = prefix.split(/[.!?\n;。！？；]/).pop() ?? prefix;
  return /\b(skip|skips|skipped|not|avoid|avoids|avoided|without|exclude|excludes|excluded|unrelated|no)\b/i.test(clause)
    || /(不要|避免|跳过|不是|非)/.test(clause);
}

function keywordHits(text: string, keywords: readonly string[], options: { ignoreNegated?: boolean } = {}): string[] {
  const hits: string[] = [];
  const normalized = text.toLowerCase();
  for (const keyword of keywords) {
    const pattern = keywordPattern(keyword);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      if (options.ignoreNegated && keywordIsNegated(normalized, match.index)) continue;
      hits.push(keyword);
      break;
    }
  }
  return [...new Set(hits)];
}

function startWorkCandidateSearchText(summary: Json): string {
  return [
    safeString(summary.title),
    safeString(summary.type),
    safeString(summary.pool),
    safeString(summary.status),
    safeString(summary.notes),
    safeString(summary.sourceArtifactId),
  ].filter((entry): entry is string => Boolean(entry)).join('\n').toLowerCase();
}

function startWorkStructuredEmployeeRole(documents: StartWorkContextDocument[]): EmployeeRole | null {
  for (const document of startWorkContextDocumentsForSource(documents, 'employee')) {
    if (document.employeeRole) return document.employeeRole;
    const text = `${document.key}\n${document.markdown ?? document.content}`;
    const match = text.match(/\bemployee\.role\s*:\s*([a-z-]+)/i);
    const role = normalizeEmployeeRoleValue(match?.[1]);
    if (role) return role;
  }
  return null;
}

function fallbackStartWorkSelection(
  contextDocuments: StartWorkContextDocument[],
  workItems: Json[],
  fallbackCause: string,
): StartWorkSelectionDecision {
  const claimable = workItems
    .map((item, index) => ({ item, index, id: workItemId(item), summary: startWorkCandidateSummary(item) }))
    .filter((entry): entry is { item: Json; index: number; id: string; summary: Json } => Boolean(entry.id));

  if (claimable.length === 0) {
    return {
      selectedWorkItemId: null,
      source: 'fallback',
      reason: `No claimable WorkItem IDs were available; skipped instead of claiming unrelated work. Fallback used because ${fallbackCause}.`,
      warning: fallbackCause,
    };
  }

  const responsibilityContextDocuments = startWorkResponsibilityContextDocuments(contextDocuments);
  const contextText = responsibilityContextDocuments
    .map((document) => `${document.key}\n${document.markdown ?? document.content}`)
    .join('\n\n')
    .toLowerCase();
  const structuredRole = startWorkStructuredEmployeeRole(contextDocuments);
  const structuredRoleGroup = structuredRole
    ? START_WORK_RESPONSIBILITY_KEYWORD_GROUPS.find((group) => group.role === structuredRole)
    : null;
  const contextGroups = structuredRoleGroup
    ? [{ group: structuredRoleGroup, hits: [`employee.role:${structuredRole}`], structuredRole: true }]
    : START_WORK_RESPONSIBILITY_KEYWORD_GROUPS
      .map((group) => ({ group, hits: keywordHits(contextText, group.contextKeywords, { ignoreNegated: true }), structuredRole: false }))
      .filter((entry) => entry.hits.length > 0);

  if (contextGroups.length === 0) {
    return {
      selectedWorkItemId: null,
      source: 'fallback',
      reason: `No recognizable responsibility keywords were found in employee context; skipped instead of claiming unrelated work. Fallback used because ${fallbackCause}.`,
      warning: fallbackCause,
    };
  }

  const scored = claimable.map((candidate) => {
    let score = 0;
    const matchedGroups: string[] = [];
    const candidateText = startWorkCandidateSearchText(candidate.summary);
    for (const contextGroup of contextGroups) {
      const hits = keywordHits(candidateText, contextGroup.group.taskKeywords);
      if (hits.length === 0) continue;
      score += hits.length * 10 + contextGroup.hits.length;
      matchedGroups.push(`${contextGroup.group.name} (${hits.slice(0, 3).join(', ')})`);
    }
    return { ...candidate, score, matchedGroups };
  }).sort((left, right) => right.score - left.score || left.index - right.index);

  const best = scored[0];
  if (!best || best.score <= 0) {
    return {
      selectedWorkItemId: null,
      source: 'fallback',
      reason: structuredRole
        ? `No WorkItem matched the structured employee.role ${structuredRole}/${employeeRoleLabel(structuredRole)}; skipped instead of claiming unrelated work. Fallback used because ${fallbackCause}.`
        : `No WorkItem matched the employee responsibility keywords; skipped instead of claiming unrelated work. Fallback used because ${fallbackCause}.`,
      warning: fallbackCause,
    };
  }

  return {
    selectedWorkItemId: best.id,
    source: 'fallback',
    reason: structuredRole
      ? `Fallback selected ${best.id} because structured employee.role ${structuredRole}/${employeeRoleLabel(structuredRole)} matched WorkItem responsibility keywords: ${best.matchedGroups.join('; ')}. Fallback used because ${fallbackCause}.`
      : `Fallback selected ${best.id} because employee context and WorkItem text share responsibility keywords: ${best.matchedGroups.join('; ')}. Fallback used because ${fallbackCause}.`,
    warning: fallbackCause,
  };
}

async function selectStartWorkItem(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  target: StartWorkTarget;
  contextDocuments: StartWorkContextDocument[];
  workItems: Json[];
  progress: (message: string) => void;
}): Promise<StartWorkSelectionDecision> {
  const candidates = values.workItems.map(startWorkCandidateSummary);
  const candidateIds = new Set(candidates.map((candidate) => safeString(candidate.id)).filter((id): id is string => Boolean(id)));
  if (candidateIds.size === 0) {
    return {
      selectedWorkItemId: null,
      source: 'fallback',
      reason: 'No candidate WorkItem had an id; skipped instead of claiming unrelated work.',
      warning: 'No candidate WorkItem had an id.',
    };
  }
  if (startWorkEmployeeContextUnavailable(values.contextDocuments)) {
    const warning = 'Remote employee context documents were unavailable; worker idled instead of claiming work without authoritative employee responsibilities.';
    return {
      selectedWorkItemId: null,
      source: 'fallback',
      reason: warning,
      warning,
    };
  }

  const prompt = buildStartWorkSelectionPrompt({
    sessionId: values.sessionId,
    agent: values.agent,
    target: values.target,
    contextDocuments: values.contextDocuments,
    candidates,
  });

  values.progress(`selection: asking ${values.agent} to choose among ${candidateIds.size} candidate(s)`);
  try {
    const output = await runPoolAgent(startWorkRunnerAgent(values.agent), values.target.repoPath, prompt, { progress: values.progress });
    const parsed = parseStartWorkSelectionOutput(output, candidateIds);
    if (parsed.selection) return parsed.selection;
    return fallbackStartWorkSelection(values.contextDocuments, values.workItems, parsed.warning ?? 'selection agent returned an invalid decision');
  } catch (error) {
    const warning = `selection agent failed: ${error instanceof Error ? error.message : String(error)}`;
    return fallbackStartWorkSelection(values.contextDocuments, values.workItems, warning);
  }
}

function startWorkClaimPayload(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  leaseSeconds: number;
}): Json {
  return {
    owner: values.sessionId,
    agent: startWorkAgentName(values.agent),
    agentId: values.sessionId,
    agentName: startWorkAgentName(values.agent),
    agentType: values.agent,
    employeeId: getArg('--employee-id'),
    host: os.hostname(),
    sessionId: values.sessionId,
    client: 'axis-tools',
    leaseSeconds: values.leaseSeconds,
  };
}

async function claimStartWorkItem(target: StartWorkTarget, item: Json, payload: Json): Promise<{ claimed: boolean; conflict: boolean; response: unknown | null; warning: string | null }> {
  const id = workItemId(item);
  if (!id) return { claimed: false, conflict: false, response: null, warning: 'WAIT_CODE WorkItem had no id and could not be claimed.' };
  try {
    const response = await postOrbitJson(target.binding.backendUrl, `/api/work-items/${encodeURIComponent(id)}/claim`, payload, await tokenForBinding(target.binding));
    return { claimed: true, conflict: false, response, warning: null };
  } catch (error) {
    if (error instanceof OrbitHttpError && error.status === 409) {
      return { claimed: false, conflict: true, response: null, warning: `WorkItem ${id} was already claimed by another worker.` };
    }
    return { claimed: false, conflict: false, response: null, warning: error instanceof Error ? error.message : String(error) };
  }
}

async function postWorkItemLifecycle(target: StartWorkTarget, workItemID: string, action: 'start' | 'complete' | 'release', payload: Json): Promise<unknown | null> {
  try {
    return await postOrbitJson(target.binding.backendUrl, `/api/work-items/${encodeURIComponent(workItemID)}/${action}`, payload, await tokenForBinding(target.binding));
  } catch (error) {
    throw new Error(`WorkItem ${action} failed for ${workItemID}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function patchStartWorkResult(target: StartWorkTarget, workItemID: string, values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  output: string;
  ok: boolean;
}): Promise<unknown | null> {
  const statusLine = values.ok ? 'completed' : 'failed';
  const notes = [
    `axis start-work session ${values.sessionId} ${statusLine} agent execution at ${new Date().toISOString()}.`,
    `agent: ${values.agent}`,
    values.output ? `agent output:\n${truncateText(values.output, 12_000)}` : null,
  ].filter((entry): entry is string => Boolean(entry)).join('\n\n');
  try {
    return await patchOrbitJson(target.binding.backendUrl, `/api/work-items/${encodeURIComponent(workItemID)}`, { notes, owner: values.sessionId }, await tokenForBinding(target.binding));
  } catch {
    return null;
  }
}

async function processStartWorkTarget(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  target: StartWorkTarget;
  contextDocuments: StartWorkContextDocument[];
  heartbeatState: StartWorkHeartbeatState;
  summary: StartWorkSummary;
  progress: (message: string) => void;
}): Promise<Json> {
  const { sessionId, agent, target, contextDocuments, heartbeatState, summary, progress } = values;
  const execute = await probeHubQueueStatuses(target.binding, target.projectId, 'work-items', CODING_INPUT_STATUSES, 10);
  if (execute.warning) {
    pushUniqueWarning(summary.warnings, execute.warning);
  }
  const workItems = execute.items;
  summary.ready += workItems.length;
  progress(`queue: ${target.projectId} WAIT_CODE ${workItems.length}`);
  if (workItems.length === 0) {
    summary.idle++;
    return { status: 'idle', target: startWorkTargetScope(target), ready: 0, warning: execute.warning };
  }

  const selection = await selectStartWorkItem({
    sessionId,
    agent,
    target,
    contextDocuments,
    workItems,
    progress,
  });
  if (selection.warning) pushUniqueWarning(summary.warnings, selection.warning);
  if (selection.selectedWorkItemId) {
    progress(`selection: selected ${selection.selectedWorkItemId} - ${selection.reason}`);
  } else {
    progress(`selection: skipped - ${selection.reason}`);
    summary.idle++;
    return {
      status: 'idle',
      target: startWorkTargetScope(target),
      ready: workItems.length,
      selection: startWorkSelectionJson(selection),
      warning: selection.warning ?? execute.warning,
    };
  }

  const item = workItems.find((candidate) => workItemId(candidate) === selection.selectedWorkItemId);
  if (!item) {
    const warning = `Selected WorkItem ${selection.selectedWorkItemId} was not found in candidates; skipped instead of claiming unrelated work.`;
    pushUniqueWarning(summary.warnings, warning);
    progress(`selection: skipped - ${warning}`);
    summary.idle++;
    return {
      status: 'idle',
      target: startWorkTargetScope(target),
      ready: workItems.length,
      selection: startWorkSelectionJson({ ...selection, selectedWorkItemId: null, warning }),
      warning,
    };
  }

  const claimPayload = startWorkClaimPayload({ sessionId, agent, leaseSeconds: Math.max(60, secondsArgAny(['--lease-seconds'], 600, 86400)) });
  const id = selection.selectedWorkItemId;
  progress(`claim: ${id} ${workItemTitle(item)}`);
  const claim = await claimStartWorkItem(target, item, claimPayload);
  if (claim.conflict) {
    summary.conflicts++;
    summary.idle++;
    pushUniqueWarning(summary.warnings, claim.warning);
    progress(`claim conflict: ${id}`);
    return {
      status: 'idle',
      target: startWorkTargetScope(target),
      ready: workItems.length,
      selection: startWorkSelectionJson(selection),
      warning: claim.warning,
    };
  }
  if (!claim.claimed) {
    summary.idle++;
    pushUniqueWarning(summary.warnings, claim.warning);
    return {
      status: 'idle',
      target: startWorkTargetScope(target),
      ready: workItems.length,
      selection: startWorkSelectionJson(selection),
      warning: claim.warning ?? execute.warning,
    };
  }

  summary.claimed++;
  heartbeatState.status = 'working';
  heartbeatState.currentWorkItemId = id;
  progress(`agent: launching ${agent} for ${id}`);
  try {
    await postWorkItemLifecycle(target, id, 'start', claimPayload);
    const prompt = buildStartWorkAgentPrompt({ sessionId, agent, target, workItem: item, contextDocuments });
    const output = await runPoolAgent(startWorkRunnerAgent(agent), target.repoPath, prompt, { progress });
    await patchStartWorkResult(target, id, { sessionId, agent, output, ok: true });
    const complete = await postWorkItemLifecycle(target, id, 'complete', claimPayload);
    summary.executed++;
    heartbeatState.status = 'idle';
    heartbeatState.currentWorkItemId = null;
    return {
      status: 'executed',
      target: startWorkTargetScope(target),
      workItemId: id,
      title: workItemTitle(item),
      selection: startWorkSelectionJson(selection),
      claim: claim.response,
      complete,
      output: truncateText(output, 2_000),
    };
  } catch (error) {
    summary.failed++;
    const message = error instanceof Error ? error.message : String(error);
    pushUniqueWarning(summary.warnings, message);
    await patchStartWorkResult(target, id, { sessionId, agent, output: message, ok: false });
    heartbeatState.status = 'blocked';
    heartbeatState.currentWorkItemId = id;
    return {
      status: 'failed',
      target: startWorkTargetScope(target),
      workItemId: id,
      title: workItemTitle(item),
      selection: startWorkSelectionJson(selection),
      warning: message,
    };
  }
}

async function sendStartWorkHeartbeat(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  target: StartWorkTarget;
  heartbeatState: StartWorkHeartbeatState;
  startedAt: string;
}): Promise<{ ok: boolean; warning: string | null }> {
  const { sessionId, agent, target, heartbeatState, startedAt } = values;
  const payload: Json = {
    sessionId,
    agentType: agent,
    agentName: startWorkAgentName(agent),
    employeeId: getArg('--employee-id'),
    host: os.hostname(),
    pid: process.pid,
    cliVersion: cliVersion(),
    account: target.binding.account ?? target.binding.user?.account ?? null,
    status: heartbeatState.status,
    currentWorkItemId: heartbeatState.currentWorkItemId,
    startedAt,
    sentAt: new Date().toISOString(),
    scope: heartbeatState.scope,
  };
  try {
    const response = await postOrbitJson(target.binding.backendUrl, '/api/agent-workers/heartbeat', payload, await tokenForBinding(target.binding));
    await writeJsonFile(path.join(axisWorkerSessionDir(sessionId), 'last-heartbeat.json'), {
      ok: true,
      sentAt: payload.sentAt,
      response: isJson(response) ? response : {},
    });
    return { ok: true, warning: null };
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    await writeJsonFile(path.join(axisWorkerSessionDir(sessionId), 'last-heartbeat.json'), {
      ok: false,
      sentAt: payload.sentAt,
      warning,
    });
    return { ok: false, warning };
  }
}

function startStartWorkHeartbeatLoop(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  target: StartWorkTarget | null;
  heartbeatState: StartWorkHeartbeatState;
  heartbeatIntervalSeconds: number;
  startedAt: string;
  progress: (message: string) => void;
}): { stop: () => void; first: Promise<void> } {
  const { target } = values;
  if (!target) {
    return { stop: () => {}, first: Promise.resolve() };
  }
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const send = async (): Promise<void> => {
    const heartbeat = await sendStartWorkHeartbeat({
      sessionId: values.sessionId,
      agent: values.agent,
      target,
      heartbeatState: values.heartbeatState,
      startedAt: values.startedAt,
    });
    if (!heartbeat.ok && heartbeat.warning) values.progress(`heartbeat warning: ${heartbeat.warning}`);
  };
  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      void send().finally(schedule);
    }, Math.max(1, values.heartbeatIntervalSeconds) * 1000);
  };
  const first = send().finally(schedule);
  return {
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    first,
  };
}

async function runStartWorkForeground(options: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  intervalSeconds: number;
  heartbeatIntervalSeconds: number;
  maxIterations: number | null;
}): Promise<Json> {
  const { sessionId, agent, intervalSeconds, heartbeatIntervalSeconds, maxIterations } = options;
  const startedAt = new Date().toISOString();
  const bounded = maxIterations !== null;
  const progress = emitStartWorkProgress;
  ensureDir(axisWorkerSessionDir(sessionId));
  await writeWorkerState(sessionId, {
    agent,
    pid: process.pid,
    background: false,
    status: 'starting',
    startedAt,
    logPath: axisWorkerLogPath(sessionId),
  });

  const resolution = await resolveStartWorkTargets();
  const targets = resolution.targets;
  const scope = startWorkTargetsScope(targets);
  const heartbeatState: StartWorkHeartbeatState = { status: 'starting', currentWorkItemId: null, scope };
  const context = await preloadStartWorkContexts(targets, progress);
  const summary: StartWorkSummary = {
    ready: 0,
    claimed: 0,
    executed: 0,
    failed: 0,
    conflicts: 0,
    idle: 0,
    warnings: [...resolution.warnings],
  };
  for (const warning of context.warnings) pushUniqueWarning(summary.warnings, warning);

  const heartbeat = startStartWorkHeartbeatLoop({
    sessionId,
    agent,
    target: targets[0] ?? null,
    heartbeatState,
    heartbeatIntervalSeconds,
    startedAt,
    progress,
  });
  await heartbeat.first;

  const iterations: Json[] = [];
  const sleeps: Json[] = [];
  let stopReason = 'max-iterations';
  const cleanup = installWorkLoopInterruptHandlers(progress);

  progress(`session: ${sessionId}`);
  progress(`agent: ${agent}`);
  progress(`targets: ${targets.length}`);
  progress(`loop: ${bounded ? `bounded (${maxIterations} iteration${maxIterations === 1 ? '' : 's'})` : 'infinite'}`);
  progress(`heartbeat seconds: ${heartbeatIntervalSeconds}`);

  try {
    if (targets.length === 0) {
      stopReason = 'no-work-scope';
      heartbeatState.status = 'idle';
      summary.idle++;
      await writeWorkerState(sessionId, { agent, pid: process.pid, background: false, status: 'idle', startedAt, stopReason, scope });
    }

    for (let index = 0; targets.length > 0 && (maxIterations === null || index < maxIterations); index++) {
      if (workLoopInterrupted) {
        stopReason = 'interrupted';
        break;
      }
      const iterationNumber = index + 1;
      const startedIterationAt = new Date().toISOString();
      heartbeatState.status = 'polling';
      heartbeatState.currentWorkItemId = null;
      await writeWorkerState(sessionId, { agent, pid: process.pid, background: false, status: 'polling', startedAt, iteration: iterationNumber, scope });
      progress(`iteration ${iterationNumber}: start`);
      const projectResults: Json[] = [];
      let handledWork = false;
      for (const target of targets) {
        const result = await processStartWorkTarget({
          sessionId,
          agent,
          target,
          contextDocuments: context.contexts.get(target.projectId) ?? ['soul.md', 'skill.md', 'memory.md'].map((key) => fallbackAgentContextDocument(key)),
          heartbeatState,
          summary,
          progress,
        });
        projectResults.push(result);
        if (safeString(result.status) === 'executed' || safeString(result.status) === 'failed') {
          handledWork = true;
          break;
        }
      }
      if (!handledWork) {
        heartbeatState.status = 'idle';
        heartbeatState.currentWorkItemId = null;
      }
      const iteration: Json = {
        iteration: iterationNumber,
        startedAt: startedIterationAt,
        finishedAt: new Date().toISOString(),
        mode: 'start-work-iteration',
        workerType: 'coding',
        targetCount: targets.length,
        results: projectResults,
        summary: { ...summary, warnings: [...summary.warnings] },
      };
      iterations.push(iteration);
      progress(`iteration ${iterationNumber}: ready ${summary.ready}, claimed ${summary.claimed}, executed ${summary.executed}, failed ${summary.failed}, conflicts ${summary.conflicts}, idle ${summary.idle}`);

      if (workLoopInterrupted) {
        stopReason = 'interrupted';
        break;
      }
      const reachedBound = maxIterations !== null && iterationNumber >= maxIterations;
      if (reachedBound) {
        stopReason = 'max-iterations';
        break;
      }
      progress(`idle: sleeping ${intervalSeconds}s before next poll`);
      const sleep = await sleepWorkLoop(intervalSeconds);
      sleeps.push({ afterIteration: iterationNumber, seconds: intervalSeconds, skipped: sleep.skipped, interrupted: sleep.interrupted });
      if (sleep.interrupted) {
        stopReason = 'interrupted';
        break;
      }
    }
  } finally {
    cleanup();
    heartbeat.stop();
  }

  const finishedAt = new Date().toISOString();
  const payload: Json = {
    ok: true,
    mode: 'start-work',
    background: false,
    sessionId,
    pid: process.pid,
    agent,
    agentCommand: startWorkAgentCommand(agent),
    cliVersion: cliVersion(),
    sessionDir: axisWorkerSessionDir(sessionId),
    logPath: axisWorkerLogPath(sessionId),
    statePath: axisWorkerStatePath(sessionId),
    startedAt,
    finishedAt,
    scope,
    targetCount: targets.length,
    bounded,
    infinite: !bounded,
    maxIterations,
    intervalSeconds,
    heartbeatIntervalSeconds,
    iterations,
    sleeps,
    summary,
    stopReason,
    warning: summary.warnings.length > 0 ? summary.warnings.join(' ') : null,
  };
  await writeWorkerState(sessionId, {
    agent,
    pid: process.pid,
    background: false,
    status: stopReason === 'interrupted' ? 'stopped' : heartbeatState.status,
    startedAt,
    finishedAt,
    stopReason,
    scope,
    summary,
  });
  await appendWorkerLog(sessionId, `finished stopReason=${stopReason}`);
  return payload;
}

function backgroundStartWorkArgs(values: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  intervalSeconds: number;
  heartbeatIntervalSeconds: number;
  maxIterations: number | null;
}): string[] {
  const args = [
    fileURLToPath(import.meta.url),
    'start-work',
    '--foreground',
    '--worker-session',
    values.sessionId,
    '--agent',
    values.agent,
    '--interval',
    String(values.intervalSeconds),
    '--heartbeat-interval',
    String(values.heartbeatIntervalSeconds),
  ];
  const repo = getArg('--repo');
  const projectId = getArg('--project-id');
  const projectUuid = getArg('--project-uuid');
  const productLineId = getArg('--product-line-id');
  const productLineUuid = getArg('--product-line-uuid');
  const employeeId = getArg('--employee-id');
  if (repo) args.push('--repo', repo);
  if (employeeId) args.push('--employee-id', employeeId);
  if (projectId) args.push('--project-id', projectId);
  if (projectUuid) args.push('--project-uuid', projectUuid);
  if (productLineId) args.push('--product-line-id', productLineId);
  if (productLineUuid) args.push('--product-line-uuid', productLineUuid);
  if (values.maxIterations !== null) args.push('--iterations', String(values.maxIterations));
  return args;
}

async function spawnStartWorkBackground(options: {
  sessionId: string;
  agent: StartWorkAgentChoice;
  intervalSeconds: number;
  heartbeatIntervalSeconds: number;
  maxIterations: number | null;
}): Promise<Json> {
  const { sessionId, agent, intervalSeconds, heartbeatIntervalSeconds, maxIterations } = options;
  const startedAt = new Date().toISOString();
  ensureDir(axisWorkerSessionDir(sessionId));
  const config: Json = {
    sessionId,
    agent,
    agentCommand: startWorkAgentCommand(agent),
    background: true,
    cliVersion: cliVersion(),
    startedAt,
    intervalSeconds,
    heartbeatIntervalSeconds,
    maxIterations,
    scope: requestedStartWorkScope(),
    cwd: process.cwd(),
    argv: process.argv.slice(2),
  };
  await writeJsonFile(axisWorkerConfigPath(sessionId), config);
  await writeWorkerState(sessionId, {
    agent,
    pid: null,
    background: true,
    status: 'starting',
    startedAt,
    scope: requestedStartWorkScope(),
    logPath: axisWorkerLogPath(sessionId),
  });

  const fd = openSync(axisWorkerLogPath(sessionId), 'a');
  const child = spawn(process.execPath, backgroundStartWorkArgs(options), {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  closeSync(fd);

  await writeWorkerState(sessionId, {
    agent,
    pid: child.pid ?? null,
    background: true,
    status: 'running',
    startedAt,
    scope: requestedStartWorkScope(),
    logPath: axisWorkerLogPath(sessionId),
  });

  return {
    ok: true,
    mode: 'start-work',
    background: true,
    sessionId,
    pid: child.pid ?? null,
    agent,
    agentCommand: startWorkAgentCommand(agent),
    cliVersion: cliVersion(),
    intervalSeconds,
    heartbeatIntervalSeconds,
    maxIterations,
    scope: requestedStartWorkScope(),
    sessionDir: axisWorkerSessionDir(sessionId),
    logPath: axisWorkerLogPath(sessionId),
    configPath: axisWorkerConfigPath(sessionId),
    statePath: axisWorkerStatePath(sessionId),
    startedAt,
  };
}

function printStartWorkResult(payload: Json): void {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`mode: ${payload.mode}`);
  console.log(`session: ${payload.sessionId}`);
  console.log(`agent: ${payload.agent}`);
  const scope = isJson(payload.scope) ? payload.scope : {};
  if (safeString(scope.employeeId)) console.log(`employee: ${scope.employeeId}`);
  console.log(`background: ${payload.background ? 'true' : 'false'}`);
  if (payload.pid !== undefined && payload.pid !== null) console.log(`pid: ${payload.pid}`);
  console.log(`heartbeat seconds: ${payload.heartbeatIntervalSeconds}`);
  if (safeString(payload.logPath)) console.log(`log: ${payload.logPath}`);
  if (safeString(payload.stopReason)) console.log(`stop reason: ${payload.stopReason}`);
  if (safeString(payload.warning)) console.log(`warning: ${payload.warning}`);
}

async function startWorkCommand(): Promise<void> {
  const foreground = hasFlag('--foreground') || Boolean(getArg('--worker-session'));
  const repoArg = getArg('--repo');
  const repoPath = repoArg ? path.resolve(repoArg) : null;
  const agent = await resolveStartWorkAgent(repoPath);
  const sessionId = getArg('--worker-session') ?? createStartWorkSessionId(agent);
  const intervalSeconds = secondsArgAny(['--interval', '--sleep'], 10, 3600);
  const heartbeatIntervalSeconds = Math.max(1, secondsArgAny(['--heartbeat-interval'], 30, 3600));
  const maxIterations = workLoopMaxIterationsArg();

  if (!foreground) {
    printStartWorkResult(await spawnStartWorkBackground({ sessionId, agent, intervalSeconds, heartbeatIntervalSeconds, maxIterations }));
    return;
  }

  printStartWorkResult(await runStartWorkForeground({ sessionId, agent, intervalSeconds, heartbeatIntervalSeconds, maxIterations }));
}

async function workStatusCommand(): Promise<void> {
  const workersDir = axisWorkerRootDir();
  let entries: string[] = [];
  try {
    entries = await readdir(workersDir);
  } catch {
    entries = [];
  }
  const workers: Json[] = [];
  for (const entry of entries.sort()) {
    const sessionDir = path.join(workersDir, entry);
    const state = await readJsonFile<Json>(path.join(sessionDir, 'state.json'), {});
    const config = await readJsonFile<Json>(path.join(sessionDir, 'config.json'), {});
    const pid = typeof state.pid === 'number' ? state.pid : null;
    let alive = false;
    if (pid !== null) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    workers.push({
      sessionId: entry,
      agent: safeString(state.agent) ?? safeString(config.agent),
      pid,
      alive,
      status: safeString(state.status) ?? 'unknown',
      background: state.background === true || config.background === true,
      updatedAt: safeString(state.updatedAt),
      startedAt: safeString(state.startedAt) ?? safeString(config.startedAt),
      logPath: safeString(state.logPath) ?? axisWorkerLogPath(entry),
    });
  }
  const payload = { ok: true, workers };
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (workers.length === 0) {
    console.log(`No local Axis workers found under ${workersDir}`);
    return;
  }
  for (const worker of workers) {
    console.log(`${worker.sessionId} agent=${worker.agent ?? '-'} pid=${worker.pid ?? '-'} alive=${worker.alive ? 'true' : 'false'} status=${worker.status ?? '-'} log=${worker.logPath ?? '-'}`);
  }
}

async function runPool(pool: PoolConfig, args: string[]): Promise<void> {
  const repoPath = resolveRepoArg();
  const input = await readPoolInput(args);
  const explicitAgent = parsePoolAgentArg(getArg('--agent'));
  if (explicitAgent === 'codex' || explicitAgent === 'claude-code') {
    throw new Error('Pool run no longer launches Agents. Submit raw seeds with axis-req/axis-ide/axis-bug/axis-sug, then run axis work-review to refine them.');
  }
  const agent = explicitAgent ?? 'none';
  if (agent === 'none' || agent === 'current') {
    const cloud = await fetchPoolTemplateContext(pool, repoPath);
    if (agent === 'current' && input.trim() && !input.trim().startsWith('{') && !/^#\s+/m.test(input)) {
      console.error('--agent current received natural language; generated a template artifact. current mode is intended for Agent-produced artifacts.');
    }
    const artifact = normalizePoolArtifact(pool, input);
    const result = await submitPoolArtifact(pool, repoPath, artifact, `${pool.command} run`);
    printPoolSubmit({ ...result, warning: result.warning ?? cloud.warning, response: result.response ?? { agent } });
    return;
  }

  throw new Error('Pool run no longer launches Agents. Use axis work-review for review/refine worker execution.');
}

function poolDocumentMatches(pool: PoolConfig, document: Json): boolean {
  const source = isJson(document.source) ? document.source : {};
  const sourceType = safeString(source.type) ?? safeString(document.sourceType);
  const kind = safeString(source.kind) ?? safeString(document.kind) ?? safeString(document.type);
  if (pool.kind === 'requirement') {
    return sourceType === 'requirement' || kind === 'requirement';
  }
  return sourceType === pool.kind || kind === pool.kind;
}

function asPoolListItem(document: Json): PoolListItem {
  const source = isJson(document.source) ? document.source : {};
  return {
    id: safeString(document.id) ?? safeString(document.uuid) ?? safeString(document.documentId),
    title: safeString(document.title) ?? safeString(document.name) ?? 'Untitled',
    kind: safeString(source.kind) ?? safeString(document.kind) ?? safeString(document.type),
    sourceType: safeString(source.type) ?? safeString(document.sourceType),
    status: safeString(document.status),
    createdAt: safeString(document.createdAt) ?? safeString(document.created_at),
    updatedAt: safeString(document.updatedAt) ?? safeString(document.updated_at),
  };
}

function documentArray(payload: unknown): Json[] {
  if (Array.isArray(payload)) return payload.filter(isJson);
  if (!isJson(payload)) return [];
  for (const key of ['items', 'documents', 'data', 'rows', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isJson);
  }
  return [];
}

async function listLocalPoolItems(pool: PoolConfig, repoPath: string): Promise<PoolListItem[]> {
  const dir = path.join(repoPath, pool.defaultDir);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const items: PoolListItem[] = [];
  for (const name of names.filter((entry) => entry.endsWith('.md')).sort()) {
    const filePath = path.join(dir, name);
    const fallbackId = name.replace(/\.md$/, '');
    let id: string | null = fallbackId;
    let title = name.replace(/\.md$/, '');
    let status: string | null = null;
    try {
      const content = await readFile(filePath, 'utf8');
      const frontmatter = parseSimpleFrontmatter(content);
      id = frontmatter.id ?? fallbackId;
      title = frontmatter.title ?? firstMarkdownTitle(content) ?? title;
      status = frontmatter.status ?? null;
    } catch {
      // Keep filename fallback when a local item cannot be read.
    }
    items.push({ id, title, kind: pool.kind, sourceType: 'local', path: filePath, status });
  }
  return items;
}

function parseSimpleFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---', 4);
  if (end === -1) return {};
  const values: Record<string, string> = {};
  for (const line of content.slice(4, end).split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return values;
}

async function loadPoolItems(pool: PoolConfig, repoPath: string, page: number, pageSize: number): Promise<{
  mode: 'hub' | 'local';
  warning: string | null;
  items: PoolListItem[];
  bound: boolean;
}> {
  const binding = await readProjectBinding(repoPath);
  let mode: 'hub' | 'local' = 'local';
  let warning: string | null = null;
  let items: PoolListItem[] = [];

  if (binding && pool.kind === 'requirement') {
    const projectId = projectApiId(binding);
    if (projectId) {
      try {
        const query = `?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`;
        const payload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/documents${query}`, await tokenForBinding(binding));
        items = documentArray(payload).filter((entry) => poolDocumentMatches(pool, entry)).map(asPoolListItem);
        mode = 'hub';
      } catch (error) {
        warning = `Hub list failed; showing local items instead. ${error instanceof Error ? error.message : String(error)}`;
        items = await listLocalPoolItems(pool, repoPath);
      }
    } else {
      warning = 'Project binding has no projectId/projectUuid; showing local items instead.';
      items = await listLocalPoolItems(pool, repoPath);
    }
  } else {
    warning = binding ? `Hub pool endpoint for ${pool.kind} is not available in this CLI; showing local items.` : null;
    items = await listLocalPoolItems(pool, repoPath);
  }

  if (mode === 'local') {
    items = items.slice((page - 1) * pageSize, page * pageSize);
  }

  return { mode, warning, items, bound: Boolean(binding) };
}

function poolItemDisplayId(item: PoolListItem): string {
  if (item.id) return item.id;
  if (item.path) return path.basename(item.path, '.md');
  return 'unknown';
}

function formatPoolItemLine(item: PoolListItem, index: number): string {
  const status = item.status ? ` — ${item.status}` : '';
  return `${index}. [${poolItemDisplayId(item)}] ${item.title}${status}`;
}

async function listPoolItems(pool: PoolConfig): Promise<void> {
  const repoPath = resolveRepoArg();
  const page = pageArg();
  const pageSize = pageSizeArg();
  const loaded = await loadPoolItems(pool, repoPath, page, pageSize);
  const { mode, warning, items, bound } = loaded;

  const payload = { ok: true, mode, repo: repoPath, pool: pool.pool, bound, page, pageSize, items, warning };
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  await interactivePoolList(pool, repoPath, page, pageSize, items, warning);
}

async function interactivePoolList(pool: PoolConfig, repoPath: string, startPage: number, pageSize: number, initialItems: PoolListItem[], initialWarning: string | null): Promise<void> {
  let page = startPage;
  let items = initialItems;
  let warning = initialWarning;
  const prompt = await createPromptSession();
  try {
    while (true) {
      if (items.length === 0) {
        console.log(`${pool.displayName}暂无条目`);
      } else {
        console.log(`${pool.displayName} 第 ${page} 页，每页 ${pageSize} 条`);
        items.forEach((item, index) => console.log(formatPoolItemLine(item, index + 1)));
      }
      if (warning) console.log(`warning: ${warning}`);
      console.log('操作: [n]下一页 [p]上一页 [d]删除 [q]退出');

      const answer = (await prompt.question('> ')).trim().toLowerCase();
      if (answer === 'q' || answer === '') return;
      if (answer === 'n') {
        page += 1;
        const loaded = await loadPoolItems(pool, repoPath, page, pageSize);
        items = loaded.items;
        warning = loaded.warning;
        continue;
      }
      if (answer === 'p') {
        page = Math.max(1, page - 1);
        const loaded = await loadPoolItems(pool, repoPath, page, pageSize);
        items = loaded.items;
        warning = loaded.warning;
        continue;
      }
      if (answer === 'd') {
        const selected = await prompt.question('输入编号或 id: ');
        const item = findPoolItem(items, selected);
        if (!item) {
          console.log('未找到该条目');
          continue;
        }
        const deleted = await deletePoolItem(pool, poolItemDisplayId(item), { item, prompt });
        if (deleted) {
          const loaded = await loadPoolItems(pool, repoPath, page, pageSize);
          items = loaded.items;
          warning = loaded.warning;
        }
        continue;
      }
      console.log('请输入 n、p、d 或 q。');
    }
  } finally {
    prompt.close();
  }
}

function findPoolItem(items: PoolListItem[], input: string): PoolListItem | null {
  const value = input.trim();
  const index = Number.parseInt(value, 10);
  if (Number.isInteger(index) && index >= 1 && index <= items.length) return items[index - 1];
  return items.find((item) => poolItemDisplayId(item) === value || item.id === value || item.path === value) ?? null;
}

async function confirmDelete(pool: PoolConfig, id: string, prompt?: PromptSession): Promise<boolean> {
  if (hasFlag('--yes')) return true;
  if (hasFlag('--json')) {
    printDeletePayload({
      ok: false,
      repo: resolveRepoArg(),
      pool: pool.pool,
      id,
      error: {
        code: 'confirmation_required',
        message: 'Delete requires --yes in --json/non-interactive mode, or an interactive terminal confirmation.',
      },
    });
    process.exit(2);
  }
  console.log(`将删除 ${pool.displayName} 条目: ${id}`);
  const ownsPrompt = !prompt;
  const session = prompt ?? await createPromptSession();
  try {
    const answer = (await session.question('确认删除？输入 yes 确认: ')).trim();
    if (answer === 'yes') return true;
    if (!process.stdin.isTTY && answer === '') {
      throw new Error('Delete requires --yes or an interactive terminal confirmation.');
    }
    console.log('已取消删除');
    return false;
  } finally {
    if (ownsPrompt) session.close();
  }
}

function printDeletePayload(payload: Json): void {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (isJson(payload.error)) {
    console.error(safeString(payload.error.message) ?? 'Delete failed');
  }
}

async function deletePoolItem(pool: PoolConfig, id: string, options: { item?: PoolListItem; prompt?: PromptSession } = {}): Promise<boolean> {
  const repoPath = resolveRepoArg();
  const localItems = options.item ? [options.item] : await listLocalPoolItems(pool, repoPath);
  const localItem = localItems.find((item) => poolItemDisplayId(item) === id || item.id === id || item.path === id) ?? null;
  const confirmed = await confirmDelete(pool, id, options.prompt);
  if (!confirmed) return false;

  if (localItem?.path) {
    await unlink(localItem.path);
    const payload = { ok: true, mode: 'local', repo: repoPath, pool: pool.pool, id: poolItemDisplayId(localItem), deletedPath: localItem.path };
    if (hasFlag('--json')) console.log(JSON.stringify(payload, null, 2));
    else console.log(`deleted: ${localItem.path}`);
    return true;
  }

  const payload = {
    ok: false,
    repo: repoPath,
    pool: pool.pool,
    id,
    error: {
      code: 'unsupported',
      message: `Delete is not supported yet for ${pool.displayName}; AxisNode has no confirmed pool/document delete API in this CLI.`,
    },
  };
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(payload.error.message);
  }
  process.exit(2);
}

function integerArg(flag: string, fallback: number, max: number): number {
  const value = Number.parseInt(getArg(flag) ?? String(fallback), 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function integerArgAny(flags: string[], fallback: number, max: number): number {
  for (const flag of flags) {
    const raw = getArg(flag);
    if (raw === null) continue;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 1) return fallback;
    return Math.min(value, max);
  }
  return fallback;
}

function secondsArgAny(flags: string[], fallback: number, max: number): number {
  for (const flag of flags) {
    const raw = getArg(flag);
    if (raw === null) continue;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value < 0) return fallback;
    return Math.min(value, max);
  }
  return fallback;
}

async function probeHubQueue(binding: ProjectBinding, routePath: string): Promise<{ items: Json[]; warning: string | null }> {
  try {
    const payload = await fetchOrbitJson(binding.backendUrl, routePath, await tokenForBinding(binding));
    return { items: documentArray(payload), warning: null };
  } catch (error) {
    return { items: [], warning: error instanceof Error ? error.message : String(error) };
  }
}

async function probeHubQueueStatuses(
  binding: ProjectBinding,
  projectId: string,
  endpoint: 'pool-seeds' | 'work-items',
  statuses: readonly string[],
  pageSize: number,
): Promise<{ items: Json[]; warning: string | null }> {
  const warnings: string[] = [];
  const items: Json[] = [];
  const seen = new Set<string>();
  for (const status of statuses) {
    const route = `/api/projects/${encodeURIComponent(projectId)}/${endpoint}?status=${encodeURIComponent(status)}&page=1&pageSize=${encodeURIComponent(String(pageSize))}`;
    const probe = await probeHubQueue(binding, route);
    if (probe.warning) warnings.push(probe.warning);
    for (const item of probe.items) {
      const id = extractId(item) ?? safeString(item.id) ?? safeString(item.documentId) ?? JSON.stringify(item);
      const key = `${endpoint}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return { items, warning: warnings.length > 0 ? [...new Set(warnings)].join(' ') : null };
}

function prerequisiteEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HTTP_PROXY: process.env.HTTP_PROXY ?? 'http://127.0.0.1:7890',
    HTTPS_PROXY: process.env.HTTPS_PROXY ?? 'http://127.0.0.1:7890',
    ALL_PROXY: process.env.ALL_PROXY ?? 'socks5://127.0.0.1:7891',
  };
}

function logWorkPrerequisite(message: string): void {
  console.error(`[axis work prerequisite] ${message}`);
}

function commandText(command: string, args: string[]): string {
  return [command, ...args].map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(' ');
}

async function runPrerequisiteCommand(command: string, args: string[], options: { cwd?: string } = {}): Promise<WorkPrerequisiteStep> {
  const display = commandText(command, args);
  logWorkPrerequisite(`running ${display}${options.cwd ? ` in ${options.cwd}` : ''}`);
  if (process.env.AXIS_WORK_PREREQ_DRY_RUN === '1') {
    return { name: display, ok: false, status: 'planned', command: display, warning: 'AXIS_WORK_PREREQ_DRY_RUN=1; command was not executed.' };
  }
  try {
    await execFileAsync(command, args, {
      cwd: options.cwd,
      env: prerequisiteEnv(),
      maxBuffer: 20 * 1024 * 1024,
    });
    return { name: display, ok: true, status: 'ok', command: display };
  } catch (error) {
    const warning = summarizeCommandError(error);
    logWorkPrerequisite(`warning: ${display} failed: ${warning}`);
    return { name: display, ok: false, status: 'failed', command: display, warning };
  }
}

async function copyGstackHermesSkills(gstackDir: string): Promise<WorkPrerequisiteStep> {
  const source = path.join(gstackDir, '.hermes', 'skills');
  const target = hermesSkillsDir();
  if (!await directoryExists(source)) {
    return {
      name: 'gstack hermes skills',
      ok: false,
      status: 'missing-source',
      path: source,
      warning: `Generated gstack Hermes skills were not found at ${source}.`,
    };
  }
  ensureDir(target);
  try {
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await cp(path.join(source, entry.name), path.join(target, entry.name), { recursive: true, force: true });
    }
    return { name: 'gstack hermes skills', ok: true, status: 'copied', path: target };
  } catch (error) {
    return {
      name: 'gstack hermes skills',
      ok: false,
      status: 'copy-failed',
      path: target,
      warning: summarizeCommandError(error),
    };
  }
}

async function linkOrCopyGstackAsset(source: string, target: string): Promise<void> {
  if (existsSync(target) || !existsSync(source)) return;
  try {
    await symlink(source, target);
    return;
  } catch {
    const sourceStat = await stat(source);
    if (sourceStat.isDirectory()) {
      await cp(source, target, { recursive: true, force: false, errorOnExist: false });
    } else {
      await copyFile(source, target);
    }
  }
}

async function linkGstackAssets(gstackDir: string): Promise<WorkPrerequisiteStep> {
  const skillsDir = hermesSkillsDir();
  if (!await directoryExists(skillsDir)) {
    return { name: 'gstack skill assets', ok: false, status: 'missing-skills-dir', path: skillsDir };
  }
  const assets = [
    { name: 'bin', source: path.join(gstackDir, 'bin') },
    { name: 'browse', source: path.join(gstackDir, 'browse') },
    { name: 'ETHOS.md', source: path.join(gstackDir, 'ETHOS.md') },
  ];
  let linked = 0;
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('gstack')) continue;
      const skillDir = path.join(skillsDir, entry.name);
      if (!existsSync(path.join(skillDir, 'SKILL.md'))) continue;
      for (const asset of assets) {
        await linkOrCopyGstackAsset(asset.source, path.join(skillDir, asset.name));
      }
      linked++;
    }
    return { name: 'gstack skill assets', ok: linked > 0, status: linked > 0 ? 'linked' : 'no-gstack-skills', path: skillsDir };
  } catch (error) {
    return { name: 'gstack skill assets', ok: false, status: 'failed', path: skillsDir, warning: summarizeCommandError(error) };
  }
}

async function writeGstackWrapper(gstackDir: string): Promise<WorkPrerequisiteStep> {
  const target = gstackWrapperPath();
  ensureDir(path.dirname(target));
  const text = `#!/usr/bin/env sh
set -eu
GSTACK_HOME="\${GSTACK_HOME:-${gstackDir}}"
if [ "\${1:-}" = "" ] || [ "\${1:-}" = "--help" ] || [ "\${1:-}" = "-h" ]; then
  echo "gstack skills are installed under $HOME/.hermes/skills; usage: gstack <skill-name>"
  exit 0
fi
skill="$1"
shift || true
for name in "gstack-$skill" "$skill"; do
  if [ -f "$HOME/.hermes/skills/$name/SKILL.md" ]; then
    printf '%s\\n' "$HOME/.hermes/skills/$name/SKILL.md"
    exit 0
  fi
  if [ -f "$GSTACK_HOME/$skill/SKILL.md" ]; then
    printf '%s\\n' "$GSTACK_HOME/$skill/SKILL.md"
    exit 0
  fi
done
echo "gstack skill not found: $skill" >&2
exit 2
`;
  try {
    await writeFile(target, text, 'utf8');
    await chmod(target, 0o755);
    return { name: 'gstack user command', ok: true, status: 'written', path: target };
  } catch (error) {
    return { name: 'gstack user command', ok: false, status: 'failed', path: target, warning: summarizeCommandError(error) };
  }
}

async function ensureGstackPrerequisite(): Promise<WorkPrerequisiteStep[]> {
  const steps: WorkPrerequisiteStep[] = [];
  const gstackDir = gstackHomeDir();
  const alreadyHasCommand = await commandAvailable('gstack') || existsSync(gstackWrapperPath());
  const alreadyHasSkill = gstackSkillExists('gstack-plan-ceo-review') || gstackSkillExists('plan-ceo-review');
  if (alreadyHasCommand && alreadyHasSkill) {
    steps.push({ name: 'gstack', ok: true, status: 'present', path: gstackWrapperPath() });
    steps.push({ name: 'gstack plan-ceo-review skill', ok: true, status: 'present', path: existingIdeaMethodologyCandidate()?.path ?? hermesSkillPath(resolvePoolMethodologySkill(AXIS_POOLS_BY_KIND.idea)) });
    return steps;
  }

  logWorkPrerequisite('gstack command or plan-ceo-review skill is missing; attempting user-local setup.');
  const repoUrl = process.env.AXIS_GSTACK_REPO_URL ?? 'https://github.com/garrytan/gstack.git';
  if (await directoryExists(gstackDir)) {
    steps.push(await runPrerequisiteCommand('git', ['-C', gstackDir, 'pull', '--ff-only']));
  } else {
    steps.push(await runPrerequisiteCommand('git', ['clone', repoUrl, gstackDir]));
  }

  if (await directoryExists(gstackDir)) {
    if (await commandAvailable('bun')) {
      steps.push(await runPrerequisiteCommand('bun', ['install'], { cwd: gstackDir }));
      steps.push(await runPrerequisiteCommand('bun', ['run', 'gen:skill-docs', '--host', 'hermes'], { cwd: gstackDir }));
    } else {
      const warning = 'bun was not found on PATH; skipped gstack dependency install and Hermes skill generation.';
      logWorkPrerequisite(`warning: ${warning}`);
      steps.push({ name: 'bun', ok: false, status: 'missing', warning });
    }
    steps.push(await copyGstackHermesSkills(gstackDir));
    steps.push(await linkGstackAssets(gstackDir));
    steps.push(await writeGstackWrapper(gstackDir));
  } else {
    steps.push({ name: 'gstack checkout', ok: false, status: 'missing', path: gstackDir, warning: `gstack checkout is unavailable at ${gstackDir}.` });
  }

  const hasCommandEvidence = await commandAvailable('gstack') || existsSync(gstackWrapperPath());
  const hasSkillEvidence = gstackSkillExists('gstack-plan-ceo-review') || gstackSkillExists('plan-ceo-review');
  steps.push({
    name: 'gstack verification',
    ok: hasCommandEvidence && hasSkillEvidence,
    status: hasCommandEvidence && hasSkillEvidence ? 'verified' : 'missing-evidence',
    path: hasSkillEvidence ? existingIdeaMethodologyCandidate()?.path ?? hermesSkillPath(resolvePoolMethodologySkill(AXIS_POOLS_BY_KIND.idea)) : undefined,
    warning: hasCommandEvidence && hasSkillEvidence ? undefined : 'gstack setup did not produce both command and plan-ceo-review skill evidence.',
  });
  return steps;
}

async function superpowersSkillEvidence(): Promise<string | null> {
  const root = codexSuperpowersSkillRoot();
  const required = [
    path.join(root, 'brainstorming', 'SKILL.md'),
    path.join(root, 'systematic-debugging', 'SKILL.md'),
  ];
  return required.every((filePath) => existsSync(filePath)) ? root : null;
}

async function findSuperpowersCacheSource(): Promise<string | null> {
  const explicit = process.env.AXIS_CODEX_SUPERPOWERS_SOURCE;
  const candidates = [
    explicit ? path.resolve(explicit) : null,
    path.join(homeDir(), '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills'),
    path.join(homeDir(), '.codex', 'plugins', 'superpowers', 'skills'),
  ].filter((entry): entry is string => Boolean(entry));
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'brainstorming', 'SKILL.md')) || existsSync(path.join(candidate, 'systematic-debugging', 'SKILL.md'))) {
      return candidate;
    }
  }
  return null;
}

async function linkOrCopySuperpowersSkills(source: string, target: string): Promise<WorkPrerequisiteStep> {
  ensureDir(path.dirname(target));
  if (path.resolve(source) === path.resolve(target)) {
    return { name: 'codex superpowers skills', ok: true, status: 'same-path', path: target };
  }
  try {
    if (!existsSync(target)) {
      try {
        await symlink(source, target);
        return { name: 'codex superpowers skills', ok: true, status: 'linked', path: target };
      } catch {
        await cp(source, target, { recursive: true, force: false, errorOnExist: false });
        return { name: 'codex superpowers skills', ok: true, status: 'copied', path: target };
      }
    }
    await cp(source, target, { recursive: true, force: false, errorOnExist: false });
    return { name: 'codex superpowers skills', ok: true, status: 'merged', path: target };
  } catch (error) {
    return { name: 'codex superpowers skills', ok: false, status: 'failed', path: target, warning: summarizeCommandError(error) };
  }
}

async function ensureCodexSuperpowersPrerequisite(): Promise<WorkPrerequisiteStep[]> {
  const steps: WorkPrerequisiteStep[] = [];
  const existing = await superpowersSkillEvidence();
  if (existing) {
    steps.push({ name: 'codex superpowers skills', ok: true, status: 'present', path: existing });
    return steps;
  }

  logWorkPrerequisite('Codex Superpowers skills are missing; attempting user-local setup.');
  const marketplaceSource = process.env.AXIS_CODEX_SUPERPOWERS_MARKETPLACE;
  if (marketplaceSource && await commandAvailable('codex')) {
    steps.push(await runPrerequisiteCommand('codex', ['plugin', 'marketplace', 'add', marketplaceSource]));
  }

  const source = await findSuperpowersCacheSource();
  if (source) {
    steps.push(await linkOrCopySuperpowersSkills(source, codexSuperpowersSkillRoot()));
  } else {
    const warning = 'No Codex Superpowers plugin cache was found to link/copy into ~/.codex/skills/superpowers.';
    logWorkPrerequisite(`warning: ${warning}`);
    steps.push({ name: 'codex superpowers cache', ok: false, status: 'missing', warning });
  }

  const verified = await superpowersSkillEvidence();
  steps.push({
    name: 'codex superpowers verification',
    ok: Boolean(verified),
    status: verified ? 'verified' : 'missing-evidence',
    path: verified ?? undefined,
    warning: verified ? undefined : 'Codex Superpowers setup did not produce filesystem evidence under ~/.codex/skills/superpowers.',
  });
  return steps;
}

async function ensureWorkThreadPrerequisites(): Promise<Json> {
  const steps = [
    ...await ensureGstackPrerequisite(),
    ...await ensureCodexSuperpowersPrerequisite(),
  ];
  const warnings = steps.map((step) => step.warning).filter((entry): entry is string => Boolean(entry));
  return {
    ok: steps.every((step) => step.ok),
    steps,
    warnings,
  };
}

function poolKindFromSeed(seed: Json): PoolConfig['kind'] | null {
  const raw = (safeString(seed.kind) ?? safeString(seed.pool) ?? safeString(seed.sourceType) ?? '').toLowerCase();
  if (raw === 'idea' || raw === 'ide') return 'idea';
  if (raw === 'requirement' || raw === 'req') return 'requirement';
  if (raw === 'bug') return 'bug';
  if (raw === 'suggestion' || raw === 'sug' || raw === 'improvement') return 'suggestion';
  return null;
}

function poolSeedId(seed: Json): string | null {
  return safeString(seed.id) ?? safeString(seed.uuid) ?? safeString(seed.seedId) ?? safeString(seed.documentId);
}

function poolSeedText(seed: Json): string {
  return safeString(seed.seed)
    ?? safeString(seed.summary)
    ?? safeString(seed.title)
    ?? JSON.stringify(seed);
}

function poolSeedReviewContext(seed: Json): Json | null {
  const contextKeys = [
    'document',
    'sourceDocument',
    'sourceArtifact',
    'artifact',
    'currentDocument',
    'currentArtifact',
    'existingDocument',
    'existingArtifact',
    'draftDocument',
    'draftArtifact',
    'poolDocument',
    'markdown',
    'documentMarkdown',
    'artifactMarkdown',
    'selectedOption',
    'userSelection',
    'feedback',
    'review',
    'comments',
  ];
  const context: Json = {};
  for (const key of contextKeys) {
    if (seed[key] !== undefined && seed[key] !== null) context[key] = seed[key];
  }
  return Object.keys(context).length > 0 ? context : null;
}

function methodologyPromptBlock(methodology: MethodologyInjection): string {
  if (!methodology.injected) {
    return [
      'Methodology skill content was not injected.',
      methodology.warning ? `Warning: ${methodology.warning}` : null,
      'Use the methodologySkill name as fallback guidance, and still follow the non-interactive decision rules below.',
    ].filter((line): line is string => Boolean(line)).join('\n');
  }

  return [
    'Injected methodology skill content from local filesystem:',
    '```markdown',
    methodology.content,
    '```',
  ].join('\n');
}

function buildWorkRefineAgentPrompt(pool: PoolConfig, seed: Json, prepare: Json, methodology: MethodologyInjection): string {
  const reviewContext = poolSeedReviewContext(seed);
  return [
    'You are an Axis work-review Agent converting one NEW/WAIT_REVIEW pool input into an Orbit/Axis pool artifact.',
    `Pool kind: ${pool.kind}`,
    `Pool command: ${pool.command}`,
    `methodologySkill: ${methodology.skill}`,
    `methodologyInjected: ${methodology.injected}`,
    `methodologySource: ${methodology.source ?? 'missing'}`,
    `methodologyPath: ${methodology.path ?? 'missing'}`,
    methodology.warning ? `methodologyWarning: ${methodology.warning}` : null,
    'You MUST apply the injected methodology skill content before producing the Orbit/Axis pool artifact.',
    'After applying the methodology, produce one orbit.pool.artifact.v1 JSON artifact for the seed.',
    'Do not write files directly. Return only the final JSON artifact.',
    'Do not include credentials, tokens, passwords, sessions, or private keys in artifacts.',
    '',
    methodologyPromptBlock(methodology),
    '',
    'Automated one-shot decision rules:',
    '- You MUST NOT ask the user questions, request confirmation, or stop for interaction.',
    '- If the methodology would normally ask a question, output that question inside the artifact markdown as a structured Decision block.',
    '- Each Decision block must include the available options, a clearly marked recommended option, and rationale.',
    '- After writing a Decision block, continue generation in the same pass using the recommended option so the document can be uploaded.',
    '- If multiple viable 方案 / paths are useful, append or update a markdown section named "可选方案 / 推荐方案" and mark the recommended one.',
    '- If the user already selected an option in edited context, respect that selection even when you also show other options.',
    '',
    'Edited document review loop rules:',
    '- Treat any existing edited document or artifact as user feedback/input, not as stale output to overwrite blindly.',
    '- If the user changed wording, scope, acceptance criteria, or selected one option, preserve and refine that choice in the generated artifact.',
    '- If options remain ambiguous, append or update decision options for user choice, still selecting a recommended default for upload.',
    '- Re-review and refine the existing artifact when present; keep useful user edits unless they conflict with the current seed.',
    '',
    'Prepare context:',
    JSON.stringify(prepare, null, 2),
    '',
    'Existing edited document/artifact context:',
    reviewContext ? JSON.stringify(reviewContext, null, 2) : 'None detected in seed/context.',
    '',
    'Pending seed:',
    JSON.stringify(seed, null, 2),
    '',
    'Seed text:',
    poolSeedText(seed),
  ].join('\n');
}

async function resolveWorkAgent(repoPath: string): Promise<Exclude<PoolAgentChoice, 'current' | 'none'> | null> {
  const explicit = parsePoolAgentArg(getArg('--agent'));
  if (explicit === 'current') throw new Error('--agent current is not supported for axis work; use codex, claude-code, or none.');
  if (explicit === 'none') return null;
  if (explicit === 'codex' || explicit === 'claude-code') return explicit;
  const binding = await readProjectBinding(repoPath);
  if (binding?.selectedAgent && binding.selectedAgent !== 'none') return binding.selectedAgent;
  if (await commandAvailable('codex')) return 'codex';
  if (await commandAvailable('claude')) return 'claude-code';
  return null;
}

async function convertPoolSeedWithAgent(
  agent: Exclude<PoolAgentChoice, 'current' | 'none'>,
  repoPath: string,
  seed: Json,
  options: { progress?: (message: string) => void } = {},
): Promise<Json> {
  const kind = poolKindFromSeed(seed);
  const seedId = poolSeedId(seed);
  const candidateSource = candidateSourceFromSeed(seed);
  const sourceId = safeString(seed.sourceId) ?? seedId;
  const workItemIdValue = safeString(seed.workItemId);
  const documentIdValue = safeString(seed.documentId) ?? safeString(seed.sourceArtifactId);
  if (!kind) {
    return { ok: false, seedId, kind: null, candidateSource, candidateType: null, sourceId, workItemId: workItemIdValue, documentId: documentIdValue, error: 'Seed has no supported kind.' };
  }
  const pool = AXIS_POOLS_BY_KIND[kind];
  const methodology = await resolvePoolMethodologyInjection(pool);
  const methodologySkill = methodology.skill;
  options.progress?.(`methodology: ${seedId ?? '(unknown seed)'} -> ${methodologySkill}${methodology.injected ? ' injected' : ' not injected'}`);
  const binding = await readProjectBinding(repoPath);
  const cloud = await fetchPoolTemplateContext(pool, repoPath);
  const prepare: Json = {
    schemaVersion: 'orbit.pool.prepare.v1',
    pool: pool.pool,
    kind: pool.kind,
    displayName: pool.displayName,
    repo: repoPath,
    bound: Boolean(binding),
    binding: safeProjectBinding(binding, repoPath),
    skill: pool.skill,
    methodologySkill,
    methodologySource: methodology.source,
    methodologyPath: methodology.path,
    methodologyInjected: methodology.injected,
    methodologyWarning: methodology.warning,
    methodologyTruncated: methodology.truncated,
    template: cloud.template,
    projectContext: cloud.projectContext,
    expectedArtifactSchema: 'orbit.pool.artifact.v1',
    instructions: [
      `Apply injected methodology skill ${methodologySkill} before producing the artifact.`,
      'Do not ask the user questions; convert interactive methodology questions into Decision blocks with options, a recommended default, and rationale.',
      'Continue generation in the same pass using the recommended option.',
      'Treat any existing edited document/artifact in the seed as user feedback to re-review and refine.',
      'Use the pending seed plus template.markdownTemplate plus projectContext to produce orbit.pool.artifact.v1 JSON.',
      'Return only the final JSON artifact.',
      'Do not include credentials, tokens, passwords, sessions, or private keys in artifacts.',
    ],
    warning: combineWarnings(cloud.warning, methodology.warning),
  };
  try {
    const output = await runPoolAgent(agent, repoPath, buildWorkRefineAgentPrompt(pool, seed, prepare, methodology), options);
    const artifact = normalizePoolArtifact(pool, output);
    const submit = await submitPoolArtifact(pool, repoPath, artifact, `axis work refine${seedId ? ` ${seedId}` : ''}`);
    const handled = await markReviewWorkItemHandled(repoPath, seed, submit as unknown as Json);
    const handledWarning = isJson(handled) ? safeString(handled.warning) : null;
    return {
      ok: true,
      seedId,
      kind,
      pool: pool.pool,
      candidateSource,
      candidateType: kind,
      sourceId,
      workItemId: workItemIdValue,
      documentId: documentIdValue,
      methodologySkill,
      methodologySource: methodology.source,
      methodologyPath: methodology.path,
      methodologyInjected: methodology.injected,
      methodologyWarning: methodology.warning,
      methodologyTruncated: methodology.truncated,
      artifactTitle: artifact.title,
      submit,
      handled,
      warning: combineWarnings(cloud.warning, methodology.warning, handledWarning),
    };
  } catch (error) {
    return {
      ok: false,
      seedId,
      kind,
      pool: pool.pool,
      candidateSource,
      candidateType: kind,
      sourceId,
      workItemId: workItemIdValue,
      documentId: documentIdValue,
      methodologySkill,
      methodologySource: methodology.source,
      methodologyPath: methodology.path,
      methodologyInjected: methodology.injected,
      methodologyWarning: methodology.warning,
      methodologyTruncated: methodology.truncated,
      error: error instanceof Error ? error.message : String(error),
      warning: combineWarnings(cloud.warning, methodology.warning),
    };
  }
}

interface WorkProbeOptions {
  spawn?: boolean;
  progress?: (message: string) => void;
}

type WorkWorkerType = 'review' | 'coding';

interface WorkIterationOptions extends WorkProbeOptions {
  mode?: string;
}

type ReviewCandidateSource = 'pool-seed' | 'work-item';

interface ReviewCandidate extends Record<string, unknown> {
  id: string;
  kind: PoolConfig['kind'];
  title: string;
  seed: string;
  notes: string;
  status: string;
  source: ReviewCandidateSource;
  sourceType: ReviewCandidateSource;
  sourceId: string;
  candidateSource: ReviewCandidateSource;
  candidateType: PoolConfig['kind'];
  pool: string;
  documentId?: string;
  sourceArtifactId?: string;
  workItemId?: string;
  duplicateWorkItemIds?: string[];
}

interface ReviewSourceCounts extends Record<string, number> {
  poolSeed: number;
  workItem: number;
  candidates: number;
  duplicates: number;
}

interface ReviewCandidateDiscovery {
  candidates: ReviewCandidate[];
  sourceCounts: ReviewSourceCounts;
  warnings: string[];
}

function poolSeedDisplayTitle(seed: Json): string {
  return safeString(seed.title) ?? poolSeedText(seed).slice(0, 120);
}

function workItemId(item: Json): string | null {
  return safeString(item.id) ?? safeString(item.uuid) ?? safeString(item.workItemId) ?? safeString(item.itemId);
}

function workItemKind(item: Json): string | null {
  return safeString(item.kind) ?? safeString(item.type) ?? safeString(item.sourceType);
}

function workItemTitle(item: Json): string {
  return safeString(item.title) ?? safeString(item.name) ?? safeString(item.summary) ?? 'Untitled work item';
}

function poolKindFromWorkItem(item: Json): PoolConfig['kind'] | null {
  const rawPool = (safeString(item.pool) ?? safeString(item.category) ?? '').toLowerCase();
  if (rawPool === 'requirement' || rawPool === 'req') return 'requirement';
  if (rawPool === 'idea' || rawPool === 'ide') return 'idea';
  if (rawPool === 'bug') return 'bug';
  if (rawPool === 'suggestion' || rawPool === 'sug' || rawPool === 'improvement' || rawPool === 'optimization') return 'suggestion';

  const rawKind = (safeString(item.kind) ?? safeString(item.type) ?? safeString(item.sourceType) ?? '').toLowerCase();
  if (rawKind === 'requirement' || rawKind === 'req') return 'requirement';
  if (rawKind === 'idea' || rawKind === 'ide') return 'idea';
  if (rawKind === 'bug') return 'bug';
  if (rawKind === 'suggestion' || rawKind === 'sug' || rawKind === 'improvement' || rawKind === 'optimization') return 'suggestion';
  return null;
}

function reviewPoolForKind(kind: PoolConfig['kind']): string {
  return kind === 'suggestion' ? 'improvement' : kind;
}

function poolSeedDocumentId(seed: Json): string | null {
  return safeString(seed.documentId)
    ?? safeString(seed.sourceArtifactId)
    ?? (isJson(seed.document) ? extractId(seed.document) : null)
    ?? (isJson(seed.sourceDocument) ? extractId(seed.sourceDocument) : null)
    ?? poolSeedId(seed);
}

function normalizePoolSeedCandidate(seed: Json): ReviewCandidate | null {
  const kind = poolKindFromSeed(seed);
  if (!kind) return null;
  const id = poolSeedId(seed) ?? poolSeedDocumentId(seed) ?? `${kind}:${poolSeedDisplayTitle(seed)}`;
  const documentId = poolSeedDocumentId(seed) ?? undefined;
  return {
    ...seed,
    id,
    kind,
    title: poolSeedDisplayTitle(seed),
    seed: poolSeedText(seed),
    notes: safeString(seed.notes) ?? safeString(seed.summary) ?? poolSeedText(seed),
    status: canonicalLifecycleStatus(safeString(seed.status)) ?? LIFECYCLE_NEW,
    source: 'pool-seed',
    sourceType: 'pool-seed',
    sourceId: id,
    candidateSource: 'pool-seed',
    candidateType: kind,
    pool: reviewPoolForKind(kind),
    ...(documentId ? { documentId, sourceArtifactId: documentId } : {}),
    originalSource: safeString(seed.source),
    originalSourceId: safeString(seed.sourceId),
  };
}

function normalizeWorkItemReviewCandidate(item: Json): ReviewCandidate | null {
  if (!isReviewInputStatus(safeString(item.status))) return null;
  const kind = poolKindFromWorkItem(item);
  if (!kind) return null;
  const id = workItemId(item);
  if (!id) return null;
  const sourceArtifactId = safeString(item.sourceArtifactId) ?? safeString(item.documentId) ?? undefined;
  const notes = safeString(item.notes) ?? safeString(item.summary) ?? '';
  const seed = notes || workItemTitle(item);
  return {
    id,
    kind,
    title: workItemTitle(item),
    seed,
    notes: seed,
    status: canonicalLifecycleStatus(safeString(item.status)) ?? LIFECYCLE_NEW,
    source: 'work-item',
    sourceType: 'work-item',
    sourceId: id,
    candidateSource: 'work-item',
    candidateType: kind,
    pool: safeString(item.pool) ?? reviewPoolForKind(kind),
    workItemId: id,
    ...(sourceArtifactId ? { documentId: sourceArtifactId, sourceArtifactId } : {}),
    workItem: compactWorkItem(item),
  };
}

function reviewCandidateDedupeKeys(candidate: ReviewCandidate): string[] {
  const keys: string[] = [];
  if (candidate.documentId) keys.push(`document:${candidate.documentId}`);
  if (candidate.sourceArtifactId) keys.push(`document:${candidate.sourceArtifactId}`);
  if (candidate.source && candidate.sourceId) keys.push(`${candidate.source}:${candidate.sourceId}`);
  keys.push(`candidate:${candidate.id}`);
  return [...new Set(keys)];
}

function appendUniqueString(target: ReviewCandidate, key: string, value: string | null | undefined): void {
  if (!value) return;
  const current = Array.isArray(target[key]) ? target[key].filter((entry): entry is string => typeof entry === 'string') : [];
  if (!current.includes(value)) current.push(value);
  target[key] = current;
}

function attachDuplicateReviewCandidate(target: ReviewCandidate, duplicate: ReviewCandidate): void {
  appendUniqueString(target, 'duplicateSources', duplicate.candidateSource);
  appendUniqueString(target, 'duplicateSourceIds', duplicate.sourceId);
  appendUniqueString(target, 'duplicateWorkItemIds', duplicate.workItemId);
}

function dedupeReviewCandidates(candidates: ReviewCandidate[]): { candidates: ReviewCandidate[]; duplicates: number } {
  const seen = new Map<string, ReviewCandidate>();
  const deduped: ReviewCandidate[] = [];
  let duplicates = 0;
  for (const candidate of candidates) {
    const keys = reviewCandidateDedupeKeys(candidate);
    const existing = keys.map((key) => seen.get(key)).find((entry): entry is ReviewCandidate => Boolean(entry));
    if (existing) {
      attachDuplicateReviewCandidate(existing, candidate);
      duplicates++;
      continue;
    }
    deduped.push(candidate);
    for (const key of keys) seen.set(key, candidate);
  }
  return { candidates: deduped, duplicates };
}

function reviewCandidateSourceCounts(seeds: Json[], workItems: Json[], candidates: ReviewCandidate[], duplicates: number): ReviewSourceCounts {
  return {
    poolSeed: seeds.length,
    workItem: workItems.length,
    candidates: candidates.length,
    duplicates,
  };
}

function emptyReviewSourceCounts(): ReviewSourceCounts {
  return { poolSeed: 0, workItem: 0, candidates: 0, duplicates: 0 };
}

function countCandidatesBy(candidates: Json[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    const value = safeString(candidate[field]);
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function candidateSourceFromSeed(seed: Json): ReviewCandidateSource {
  const raw = safeString(seed.candidateSource) ?? safeString(seed.source);
  return raw === 'work-item' ? 'work-item' : 'pool-seed';
}

const REVIEW_DOCUMENT_INPUT_POLICY: Json = {
  included: false,
  reason: 'Generated pool documents are edited artifacts, not raw review inputs. Raw seed documents are consumed through NEW/WAIT_REVIEW pool-seed entries or linked WorkItems and deduped by document/sourceArtifactId.',
};

function optionalPoolSeedProbeWarning(warning: string | null): string | null {
  if (!warning) return null;
  if (/HTTP (404|405)\b/.test(warning) && /\/pool-seeds\b/.test(warning)) return null;
  return warning;
}

async function discoverReviewCandidates(binding: ProjectBinding, projectId: string): Promise<ReviewCandidateDiscovery> {
  const seedProbe = await probeHubQueueStatuses(binding, projectId, 'pool-seeds', REVIEW_INPUT_STATUSES, 100);
  const workItemProbe = await probeHubQueueStatuses(binding, projectId, 'work-items', REVIEW_INPUT_STATUSES, 100);
  const seedCandidates = seedProbe.items
    .map(normalizePoolSeedCandidate)
    .filter((candidate): candidate is ReviewCandidate => Boolean(candidate));
  const workItemCandidates = workItemProbe.items
    .map(normalizeWorkItemReviewCandidate)
    .filter((candidate): candidate is ReviewCandidate => Boolean(candidate));
  const deduped = dedupeReviewCandidates([...seedCandidates, ...workItemCandidates]);
  return {
    candidates: deduped.candidates,
    sourceCounts: reviewCandidateSourceCounts(seedCandidates, workItemCandidates, deduped.candidates, deduped.duplicates),
    warnings: [optionalPoolSeedProbeWarning(seedProbe.warning), workItemProbe.warning].filter((warning): warning is string => Boolean(warning)),
  };
}

function reviewWorkItemIdsForHandling(candidate: Json): string[] {
  const ids = [
    safeString(candidate.workItemId),
    ...(Array.isArray(candidate.duplicateWorkItemIds) ? candidate.duplicateWorkItemIds.map(safeString) : []),
  ].filter((entry): entry is string => Boolean(entry));
  return [...new Set(ids)];
}

function reviewDocumentIdsForHandling(candidate: Json): string[] {
  const ids = [
    safeString(candidate.documentId),
    safeString(candidate.sourceArtifactId),
    poolSeedDocumentId(candidate),
  ].filter((entry): entry is string => Boolean(entry));
  return [...new Set(ids)];
}

async function markReviewWorkItemHandled(repoPath: string, candidate: Json, submit: Json): Promise<Json> {
  const workItemIds = reviewWorkItemIdsForHandling(candidate);
  const documentIds = reviewDocumentIdsForHandling(candidate);
  if (workItemIds.length === 0 && documentIds.length === 0) {
    return {
      ok: false,
      status: 'skipped',
      warning: 'Review input had no workItemId or documentId; original source could not move to WAIT_USER_CONFIRM and may be processed again.',
    };
  }
  const submitMode = safeString(submit.mode);
  if (submitMode !== 'hub') {
    return {
      ok: false,
      status: 'skipped',
      workItemId: workItemIds[0],
      workItemIds,
      documentIds,
      warning: `Review source(s) were converted but upload mode was ${submitMode ?? 'unknown'}; original source(s) were not moved to WAIT_USER_CONFIRM and may be processed again.`,
    };
  }
  const binding = await readProjectBinding(repoPath);
  if (!binding) {
    return {
      ok: false,
      status: 'skipped',
      workItemId: workItemIds[0],
      workItemIds,
      documentIds,
      warning: 'Review source(s) were converted but no project binding was available for lifecycle update; they may be processed again.',
    };
  }
  const token = await tokenForBinding(binding);
  const response = isJson(submit.response) ? submit.response : {};
  const documentId = extractId(response) ?? safeString(submit.id);
  const documentUrl = extractUrl(response) ?? safeString(submit.url);
  const previousNotes = safeString(candidate.notes) ?? safeString(candidate.seed) ?? '';
  const handledAt = new Date().toISOString();
  const notes = [
    `axis work-review converted this review input into a pool document at ${handledAt}.`,
    documentId ? `documentId: ${documentId}` : null,
    documentUrl ? `url: ${documentUrl}` : null,
    previousNotes ? `original notes: ${previousNotes}` : null,
  ].filter((line): line is string => Boolean(line)).join('\n');

  const patches: Json[] = [];
  const failures: string[] = [];
  const projectId = projectApiId(binding);
  for (const documentIdValue of documentIds) {
    if (!projectId) {
      failures.push(`project binding has no projectId/projectUuid for document ${documentIdValue}`);
      continue;
    }
    try {
      const patch = await patchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentIdValue)}`, {
        status: LIFECYCLE_WAIT_USER_CONFIRM,
        owner: 'axis-work-review',
      }, token);
      patches.push({ documentId: documentIdValue, response: patch });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const workItemIdValue of workItemIds) {
    try {
      const patch = await patchOrbitJson(binding.backendUrl, `/api/work-items/${encodeURIComponent(workItemIdValue)}`, {
        status: LIFECYCLE_WAIT_USER_CONFIRM,
        notes,
        sourceArtifactId: documentId ?? undefined,
        owner: 'axis-work-review',
      }, token);
      patches.push({ workItemId: workItemIdValue, response: patch });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (failures.length === 0) {
    return {
      ok: true,
      status: LIFECYCLE_WAIT_USER_CONFIRM,
      workItemId: workItemIds[0],
      workItemIds,
      documentIds,
      documentId,
      url: documentUrl,
      responses: patches,
    };
  }

  return {
    ok: false,
    status: 'failed',
    workItemId: workItemIds[0],
    workItemIds,
    documentIds,
    documentId,
    url: documentUrl,
    responses: patches,
    warning: `Review source(s) were converted and uploaded, but moving them to WAIT_USER_CONFIRM failed: ${failures.join('; ')}. They may be processed again.`,
  };
}

async function buildReviewWorkerIteration(repoPath: string, options: WorkIterationOptions = {}): Promise<Json> {
  const probe = await buildWorkProbe(repoPath, options);
  const lanes = isJson(probe.lanes) ? probe.lanes : {};
  const refineLane = isJson(lanes.refine) ? lanes.refine as Json : {};
  const seeds = Array.isArray(refineLane.items) ? refineLane.items.filter(isJson) : [];
  const sourceCounts = isJson(refineLane.sourceCounts) ? refineLane.sourceCounts as Json : emptyReviewSourceCounts();
  options.progress?.(`queue: review seeds ${numericValue(sourceCounts.poolSeed)}, workitems ${numericValue(sourceCounts.workItem)}, candidates ${seeds.length}`);
  const binding = await readProjectBinding(repoPath);
  const projectId = binding ? projectApiId(binding) : null;
  const review: Json = {
    agent: null,
    prerequisites: null,
    results: [],
    sourceCounts,
    candidatesBySource: countCandidatesBy(seeds, 'candidateSource'),
    candidatesByType: countCandidatesBy(seeds, 'candidateType'),
    warning: null,
  };
  const payload: Json = {
    ...probe,
    mode: options.mode ?? 'work-review-iteration',
    workerType: 'review',
    warning: null,
    review,
    refine: review,
    plan: [
      'Run review worker for NEW/WAIT_REVIEW pool seeds and WorkItem-pool inputs.',
      'Map each candidate kind to its methodology skill, inject the skill, launch the selected Agent, and submit a pool document.',
    ],
  };

  if (!binding || !projectId) {
    const warning = !binding
      ? 'No AxisNode project binding found; review worker did not launch.'
      : 'Project binding has no projectId/projectUuid; review worker did not launch.';
    review.warning = warning;
    payload.warning = warning;
    options.progress?.(`warning: ${warning}`);
    return payload;
  }

  if (seeds.length === 0) {
    review.warning = 'No NEW or WAIT_REVIEW pool seeds or pool WorkItems found; review worker is idle.';
    options.progress?.('idle: no NEW or WAIT_REVIEW pool seeds or pool WorkItems');
    return payload;
  }

  const prerequisites = await ensureWorkThreadPrerequisites();
  review.prerequisites = prerequisites;

  const agent = await resolveWorkAgent(repoPath);
  review.agent = agent;
  if (!agent) {
    const warning = 'No worker Agent is available; install codex or pass --agent codex/claude-code.';
    review.warning = warning;
    payload.warning = warning;
    options.progress?.(`warning: ${warning}`);
    return payload;
  }
  options.progress?.(`agent: selected ${agent}`);

  const results: Json[] = [];
  for (const seed of seeds) {
    const seedId = poolSeedId(seed) ?? '(unknown seed)';
    const kind = poolKindFromSeed(seed) ?? 'unknown';
    const candidateSource = candidateSourceFromSeed(seed);
    options.progress?.(`candidate: ${candidateSource} ${seedId} kind=${kind} title=${poolSeedDisplayTitle(seed)}`);
    options.progress?.(`agent: launching ${agent} for ${seedId}`);
    const result = await convertPoolSeedWithAgent(agent, repoPath, seed, { progress: options.progress });
    results.push(result);
    if (result.ok === true) {
      const submit = isJson(result.submit) ? result.submit as Json : {};
      options.progress?.(`upload: ${seedId} ${safeString(submit.mode) ?? 'unknown'} id=${safeString(submit.id) ?? 'n/a'}`);
    } else {
      options.progress?.(`conversion: ${seedId} failed: ${safeString(result.error) ?? 'unknown error'}`);
    }
  }
  review.results = results;
  const failures = results.filter((result) => result.ok !== true);
  if (failures.length > 0) {
    const warning = `${failures.length} pool seed conversion(s) failed.`;
    review.warning = warning;
    payload.warning = warning;
    options.progress?.(`warning: ${warning}`);
  }
  return payload;
}

async function buildWorkRun(repoPath: string, options: WorkProbeOptions = {}): Promise<Json> {
  return buildReviewWorkerIteration(repoPath, { ...options, spawn: true, mode: 'work-once' });
}

async function buildCodingWorkerIteration(repoPath: string, options: WorkIterationOptions = {}): Promise<Json> {
  const probe = await buildWorkProbe(repoPath, { ...options, spawn: false });
  const lanes = isJson(probe.lanes) ? probe.lanes : {};
  const executeLane = isJson(lanes.execute) ? lanes.execute as Json : {};
  const workItems = Array.isArray(executeLane.items) ? executeLane.items.filter(isJson) : [];
  options.progress?.(`queue: coding ready ${workItems.length}`);
  const binding = await readProjectBinding(repoPath);
  const projectId = binding ? projectApiId(binding) : null;
  const coding: Json = {
    ok: true,
    status: 'idle',
    readyCount: workItems.length,
    items: workItems,
    warning: null,
    todo: null,
  };
  const payload: Json = {
    ...probe,
    mode: options.mode ?? 'work-coding-iteration',
    workerType: 'coding',
    spawn: false,
    warning: null,
    coding,
    plan: [
      'Probe unclaimed WAIT_CODE WorkItems from the execute lane; Hub filters active leased claims.',
      'Do not execute or write back WorkItems until axis-tools implements the Hub claim handoff.',
    ],
  };

  if (!binding || !projectId) {
    const warning = !binding
      ? 'No AxisNode project binding found; coding worker did not launch.'
      : 'Project binding has no projectId/projectUuid; coding worker did not launch.';
    coding.status = 'stopped';
    coding.warning = warning;
    payload.warning = warning;
    options.progress?.(`warning: ${warning}`);
    return payload;
  }

  if (workItems.length === 0) {
    coding.warning = 'No WAIT_CODE coding WorkItems found; coding worker is idle.';
    options.progress?.('idle: no WAIT_CODE coding WorkItems');
    return payload;
  }

  for (const item of workItems) {
    options.progress?.(`workitem: ${workItemId(item) ?? '(unknown workitem)'} kind=${workItemKind(item) ?? 'unknown'} title=${workItemTitle(item)}`);
  }
  const warning = `TODO: axis-tools coding execution/writeback is not implemented yet; Hub claim API is available for leased assignment, but this command only probed ${workItems.length} unclaimed WAIT_CODE coding WorkItem(s) and did not launch a coding agent or mark work complete.`;
  coding.ok = false;
  coding.status = 'blocked';
  coding.warning = warning;
  coding.todo = 'Implement Hub WorkItem claim handoff, execution, verification, and writeback before enabling coding execution.';
  payload.warning = warning;
  options.progress?.(`blocked: ${warning}`);
  return payload;
}

async function buildWorkProbe(repoPath: string, options: WorkProbeOptions = {}): Promise<Json> {
  const binding = await readProjectBinding(repoPath);
  const spawn = options.spawn ?? hasFlag('--spawn');
  const lanes: Json = {
    refine: {
      description: '整理 NEW/WAIT_REVIEW seeds and pool WorkItems into WAIT_USER_CONFIRM documents.',
      query: 'pool-seeds?status=NEW|WAIT_REVIEW|pending-confirmation + work-items?status=NEW|WAIT_REVIEW|pending-confirmation',
      methodologyByKind: poolMethodologyMap(),
      items: [],
      sourceCounts: emptyReviewSourceCounts(),
      documentInputs: REVIEW_DOCUMENT_INPUT_POLICY,
      warning: null,
    },
    execute: {
      description: '开发 WAIT_CODE WorkItems.',
      query: 'work-items?status=WAIT_CODE|ready',
      items: [],
      warning: null,
    },
  };

  if (binding) {
    const projectId = projectApiId(binding);
    if (projectId) {
      const refine = await discoverReviewCandidates(binding, projectId);
      const execute = await probeHubQueueStatuses(binding, projectId, 'work-items', CODING_INPUT_STATUSES, 10);
      (lanes.refine as Json).items = refine.candidates;
      (lanes.refine as Json).sourceCounts = refine.sourceCounts;
      (lanes.refine as Json).warning = refine.warnings.length > 0 ? refine.warnings.join(' ') : null;
      (lanes.execute as Json).items = execute.items;
      (lanes.execute as Json).warning = execute.warning;
    } else {
      (lanes.refine as Json).warning = 'Project binding has no projectId/projectUuid; Hub queues were not probed.';
      (lanes.execute as Json).warning = 'Project binding has no projectId/projectUuid; Hub queues were not probed.';
    }
  } else {
    (lanes.refine as Json).warning = 'No AxisNode project binding found; Hub queues were not probed.';
    (lanes.execute as Json).warning = 'No AxisNode project binding found; Hub queues were not probed.';
  }

  return {
    ok: true,
    mode: 'probe',
    repo: repoPath,
    bound: Boolean(binding),
    projectId: binding ? projectApiId(binding) : null,
    spawn,
    lanes,
    plan: [
      'Probe Hub queues only; do not launch agents by default.',
      'Review worker: convert NEW/WAIT_REVIEW seeds and pool WorkItems into WAIT_USER_CONFIRM documents/work-items with the mapped methodology skill.',
      'Coding worker: probe WAIT_CODE work-items and report blocked until Hub claim/execute/writeback APIs are stable.',
      'TODO: implement Hub WorkItem claim, execution handoff, verification, and writeback APIs before coding execution.',
    ],
    warning: spawn ? '--spawn requested; deprecated review alias launches only when NEW/WAIT_REVIEW pool seeds or WorkItem-pool inputs exist.' : null,
  };
}

function printWorkProbe(payload: Json): void {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`repo: ${payload.repo}`);
  console.log(`mode: ${payload.mode}`);
  console.log(`spawn: ${payload.spawn ? 'requested-not-started' : 'false'}`);
  const lanes = isJson(payload.lanes) ? payload.lanes : {};
  for (const laneName of ['refine', 'execute']) {
    const lane = isJson(lanes[laneName]) ? lanes[laneName] as Json : {};
    const items = Array.isArray(lane.items) ? lane.items : [];
    if (laneName === 'refine') {
      const counts = isJson(lane.sourceCounts) ? lane.sourceCounts as Json : emptyReviewSourceCounts();
      console.log(`${laneName}: ${items.length} item(s), pool-seed ${numericValue(counts.poolSeed)}, work-item ${numericValue(counts.workItem)}, duplicates ${numericValue(counts.duplicates)}`);
    } else {
      console.log(`${laneName}: ${items.length} item(s)`);
    }
    if (safeString(lane.warning)) console.log(`${laneName} warning: ${lane.warning}`);
  }
  const refine = isJson(payload.refine) ? payload.refine : null;
  if (refine) {
    const results = Array.isArray(refine.results) ? refine.results : [];
    if (safeString(refine.agent)) console.log(`refine agent: ${refine.agent}`);
    console.log(`refine converted: ${results.filter((entry) => isJson(entry) && entry.ok === true).length}/${results.length}`);
    if (safeString(refine.warning)) console.log(`refine warning: ${refine.warning}`);
  }
  if (safeString(payload.warning)) console.log(`warning: ${payload.warning}`);
}

interface WorkIterationSummary {
  pending: number;
  pendingBySource: Record<string, number>;
  candidatesByType: Record<string, number>;
  ready: number;
  conversions: number;
  converted: number;
  failed: number;
  blocked: number;
  idle: number;
  warnings: string[];
}

interface WorkLoopSummary extends WorkIterationSummary {
  requested: number;
  attempted: number;
}

function pushUniqueWarning(warnings: string[], value: unknown): void {
  const warning = safeString(value);
  if (warning && !warnings.includes(warning)) warnings.push(warning);
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addNumericCounts(target: Record<string, number>, source: unknown): void {
  if (!isJson(source)) return;
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + numericValue(value);
  }
}

function summarizeWorkIteration(payload: Json): WorkIterationSummary {
  const lanes = isJson(payload.lanes) ? payload.lanes : {};
  const refineLane = isJson(lanes.refine) ? lanes.refine as Json : {};
  const executeLane = isJson(lanes.execute) ? lanes.execute as Json : {};
  const review = isJson(payload.review)
    ? payload.review as Json
    : isJson(payload.refine)
      ? payload.refine as Json
      : {};
  const coding = isJson(payload.coding) ? payload.coding as Json : {};
  const workerType = safeString(payload.workerType);
  const refineItems = Array.isArray(refineLane.items) ? refineLane.items.filter(isJson) : [];
  const pending = refineItems.length;
  const ready = Array.isArray(executeLane.items) ? executeLane.items.length : 0;
  const results = Array.isArray(review.results) ? review.results.filter(isJson) : [];
  const converted = results.filter((entry) => entry.ok === true).length;
  const blocked = safeString(coding.status) === 'blocked' ? 1 : 0;
  const idle = workerType === 'coding'
    ? ready === 0 && blocked === 0 ? 1 : 0
    : pending === 0 && results.length === 0 ? 1 : 0;
  const warnings: string[] = [];
  pushUniqueWarning(warnings, payload.warning);
  pushUniqueWarning(warnings, refineLane.warning);
  pushUniqueWarning(warnings, executeLane.warning);
  pushUniqueWarning(warnings, review.warning);
  pushUniqueWarning(warnings, coding.warning);
  for (const result of results) pushUniqueWarning(warnings, result.warning);
  return {
    pending,
    pendingBySource: countCandidatesBy(refineItems, 'candidateSource'),
    candidatesByType: countCandidatesBy(refineItems, 'candidateType'),
    ready,
    conversions: results.length,
    converted,
    failed: results.length - converted,
    blocked,
    idle,
    warnings,
  };
}

function summarizeWorkLoop(iterations: Json[], requested: number | null): WorkLoopSummary {
  const summary: WorkLoopSummary = {
    requested: requested ?? iterations.length,
    attempted: iterations.length,
    pending: 0,
    pendingBySource: {},
    candidatesByType: {},
    ready: 0,
    conversions: 0,
    converted: 0,
    failed: 0,
    blocked: 0,
    idle: 0,
    warnings: [],
  };
  for (const iteration of iterations) {
    const iterationSummary = isJson(iteration.summary)
      ? iteration.summary as Json
      : summarizeWorkIteration(iteration);
    summary.pending += numericValue(iterationSummary.pending);
    addNumericCounts(summary.pendingBySource, iterationSummary.pendingBySource);
    addNumericCounts(summary.candidatesByType, iterationSummary.candidatesByType);
    summary.ready += numericValue(iterationSummary.ready);
    summary.conversions += numericValue(iterationSummary.conversions);
    summary.converted += numericValue(iterationSummary.converted);
    summary.failed += numericValue(iterationSummary.failed);
    summary.blocked += numericValue(iterationSummary.blocked);
    summary.idle += numericValue(iterationSummary.idle);
    const warnings = Array.isArray(iterationSummary.warnings) ? iterationSummary.warnings : [];
    for (const warning of warnings) pushUniqueWarning(summary.warnings, warning);
  }
  return summary;
}

function baseWorkLanes(): Json {
  return {
    refine: {
      description: '整理 NEW/WAIT_REVIEW seeds and pool WorkItems into WAIT_USER_CONFIRM documents.',
      query: 'pool-seeds?status=NEW|WAIT_REVIEW|pending-confirmation + work-items?status=NEW|WAIT_REVIEW|pending-confirmation',
      methodologyByKind: poolMethodologyMap(),
      items: [],
      sourceCounts: emptyReviewSourceCounts(),
      documentInputs: REVIEW_DOCUMENT_INPUT_POLICY,
      warning: null,
    },
    execute: {
      description: '开发 WAIT_CODE WorkItems.',
      query: 'work-items?status=WAIT_CODE|ready',
      items: [],
      warning: null,
    },
  };
}

function appendLaneItemsAndWarnings(targetLanes: Json, sourcePayload: Json, warnings: string[]): void {
  const sourceLanes = isJson(sourcePayload.lanes) ? sourcePayload.lanes : {};
  for (const laneName of ['refine', 'execute']) {
    const sourceLane = isJson(sourceLanes[laneName]) ? sourceLanes[laneName] as Json : {};
    const targetLane = isJson(targetLanes[laneName]) ? targetLanes[laneName] as Json : {};
    const targetItems = Array.isArray(targetLane.items) ? targetLane.items : [];
    const sourceItems = Array.isArray(sourceLane.items) ? sourceLane.items.filter(isJson) : [];
    targetLane.items = [...targetItems, ...sourceItems];
    if (laneName === 'refine') {
      const targetCounts = isJson(targetLane.sourceCounts) ? targetLane.sourceCounts as Record<string, number> : emptyReviewSourceCounts();
      addNumericCounts(targetCounts, sourceLane.sourceCounts);
      targetLane.sourceCounts = targetCounts;
    }
    pushUniqueWarning(warnings, sourceLane.warning);
    targetLanes[laneName] = targetLane;
  }
}

function summarizeWorkspaceIteration(projectPayloads: Json[], workerType: WorkWorkerType, warnings: string[]): WorkIterationSummary {
  const summary: WorkIterationSummary = {
    pending: 0,
    pendingBySource: {},
    candidatesByType: {},
    ready: 0,
    conversions: 0,
    converted: 0,
    failed: 0,
    blocked: 0,
    idle: projectPayloads.length === 0 ? 1 : 0,
    warnings: [],
  };
  for (const warning of warnings) pushUniqueWarning(summary.warnings, warning);
  for (const projectPayload of projectPayloads) {
    const projectSummary = summarizeWorkIteration(projectPayload);
    summary.pending += projectSummary.pending;
    addNumericCounts(summary.pendingBySource, projectSummary.pendingBySource);
    addNumericCounts(summary.candidatesByType, projectSummary.candidatesByType);
    summary.ready += projectSummary.ready;
    summary.conversions += projectSummary.conversions;
    summary.converted += projectSummary.converted;
    summary.failed += projectSummary.failed;
    summary.blocked += projectSummary.blocked;
    summary.idle += projectSummary.idle;
    for (const warning of projectSummary.warnings) pushUniqueWarning(summary.warnings, warning);
  }
  if (workerType === 'coding' && summary.ready === 0 && summary.blocked === 0 && projectPayloads.length > 0) {
    summary.idle = Math.max(summary.idle, projectPayloads.length);
  }
  return summary;
}

function workspaceWorkLoopStopReason(workerType: WorkWorkerType, payload: Json, summary: WorkIterationSummary): string | null {
  const review = isJson(payload.review) ? payload.review as Json : {};
  if (workerType === 'review') {
    const reviewWarning = safeString(review.warning) ?? safeString(payload.warning);
    if (summary.conversions === 0 && reviewWarning?.includes('No worker Agent is available')) return 'no-worker-agent';
    if (summary.failed > 0) return 'worker-failure';
  }
  return null;
}

async function buildWorkspaceWorkerIteration(workspace: AxisWorkspaceResolution, workerType: WorkWorkerType, options: WorkIterationOptions = {}): Promise<Json> {
  const projects: Json[] = [];
  const lanes = baseWorkLanes();
  const warnings = [...workspace.warnings];
  const review: Json = {
    agent: null,
    prerequisites: null,
    results: [],
    warning: null,
  };
  const coding: Json = {
    ok: true,
    status: 'idle',
    readyCount: 0,
    items: [],
    warning: null,
    todo: null,
  };

  if (workspace.projects.length === 0) {
    const warning = workspace.warnings.find((entry) => /No accessible AxisNode/.test(entry))
      ?? 'No accessible AxisNode projects found in the user workspace; worker is idle.';
    warnings.push(warning);
    if (workerType === 'review') review.warning = warning;
    else coding.warning = warning;
  }

  for (const project of workspace.projects) {
    const projectId = project.binding.projectId ?? project.binding.projectUuid ?? project.project.id;
    const projectName = project.binding.projectName ?? project.project.name;
    options.progress?.(`project: ${projectId} ${projectName} (${project.repoPath})`);
    if (project.warning) options.progress?.(`project warning: ${project.warning}`);
    const run = workerType === 'review'
      ? await buildReviewWorkerIteration(project.repoPath, { spawn: true, progress: options.progress, mode: options.mode ? `${options.mode}-project` : 'work-review-project-iteration' })
      : await buildCodingWorkerIteration(project.repoPath, { progress: options.progress, mode: options.mode ? `${options.mode}-project` : 'work-coding-project-iteration' });
    const projectPayload: Json = {
      ...run,
      scope: 'project',
      workspaceRoot: workspace.workspaceRoot,
      productLineId: project.binding.productLineId ?? project.binding.productLineUuid ?? null,
      productLineName: project.binding.productLineName ?? project.product.name,
      projectId: project.binding.projectId ?? project.binding.projectUuid ?? null,
      projectName,
      repoPath: project.repoPath,
      materialized: project.materialized,
      syncStatus: project.syncStatus,
      syncWarning: project.warning,
    };
    projects.push(projectPayload);
    appendLaneItemsAndWarnings(lanes, projectPayload, warnings);

    const projectReview = isJson(projectPayload.review) ? projectPayload.review as Json : {};
    const projectCoding = isJson(projectPayload.coding) ? projectPayload.coding as Json : {};
    const projectResults = Array.isArray(projectReview.results) ? projectReview.results.filter(isJson) : [];
    review.results = [...(Array.isArray(review.results) ? review.results : []), ...projectResults];
    if (!review.agent && safeString(projectReview.agent)) review.agent = projectReview.agent;
    if (!review.prerequisites && isJson(projectReview.prerequisites)) review.prerequisites = projectReview.prerequisites;
    pushUniqueWarning(warnings, projectReview.warning);

    const projectItems = Array.isArray(projectCoding.items) ? projectCoding.items.filter(isJson) : [];
    coding.items = [...(Array.isArray(coding.items) ? coding.items : []), ...projectItems];
    coding.readyCount = numericValue(coding.readyCount) + numericValue(projectCoding.readyCount);
    if (safeString(projectCoding.status) === 'blocked') {
      coding.ok = false;
      coding.status = 'blocked';
      coding.todo = safeString(projectCoding.todo) ?? coding.todo;
    }
    pushUniqueWarning(warnings, projectCoding.warning);
  }

  const summary = summarizeWorkspaceIteration(projects, workerType, warnings);
  if (workerType === 'review') {
    review.warning = review.warning ?? (summary.warnings.length > 0 ? summary.warnings.join(' ') : null);
  } else {
    coding.warning = coding.warning ?? (summary.warnings.length > 0 ? summary.warnings.join(' ') : null);
  }
  const payload: Json = {
    ok: true,
    mode: options.mode ?? (workerType === 'review' ? 'work-review-workspace-iteration' : 'work-coding-workspace-iteration'),
    workerType,
    scope: 'workspace',
    repo: null,
    workspaceRoot: workspace.workspaceRoot,
    projectCount: workspace.projects.length,
    projects,
    lanes,
    warning: summary.warnings.length > 0 ? summary.warnings.join(' ') : null,
    summary,
    plan: [
      'Sync accessible AxisNode projects into the user workspace.',
      workerType === 'review'
        ? 'Run the existing review worker for each accessible project queue.'
        : 'Probe WAIT_CODE coding WorkItems for each accessible project queue without executing them.',
    ],
  };
  if (workerType === 'review') {
    payload.review = review;
    payload.refine = review;
  } else {
    payload.coding = coding;
  }
  return payload;
}

function workLoopStopReason(workerType: WorkWorkerType, payload: Json, summary: WorkIterationSummary): string | null {
  const lanes = isJson(payload.lanes) ? payload.lanes : {};
  const refineLane = isJson(lanes.refine) ? lanes.refine as Json : {};
  const executeLane = isJson(lanes.execute) ? lanes.execute as Json : {};
  const refine = isJson(payload.refine) ? payload.refine as Json : {};
  if (payload.bound !== true) return 'no-project-binding';
  if (!safeString(payload.projectId)) return 'no-project-id';
  if (workerType === 'review') {
    if (summary.pending === 0 && safeString(refineLane.warning)) return 'queue-warning';
    const refineWarning = safeString(refine.warning);
    if (summary.conversions === 0 && refineWarning?.includes('No worker Agent is available')) return 'no-worker-agent';
    if (summary.failed > 0) return 'worker-failure';
  }
  if (workerType === 'coding' && summary.ready === 0 && safeString(executeLane.warning)) return 'queue-warning';
  return null;
}

let workLoopInterrupted = false;
let wakeWorkLoopSleep: (() => void) | null = null;

function installWorkLoopInterruptHandlers(progress?: (message: string) => void): () => void {
  workLoopInterrupted = false;
  const handler = (signal: NodeJS.Signals) => {
    if (!workLoopInterrupted) progress?.(`interrupt: received ${signal}; stopping after current step`);
    workLoopInterrupted = true;
    wakeWorkLoopSleep?.();
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
    wakeWorkLoopSleep = null;
  };
}

function shouldSkipWorkLoopSleep(): boolean {
  return process.env.AXIS_WORK_LOOP_SKIP_SLEEP === '1';
}

async function sleepWorkLoop(seconds: number): Promise<{ skipped: boolean; interrupted: boolean }> {
  if (seconds <= 0 || workLoopInterrupted) return { skipped: false, interrupted: workLoopInterrupted };
  if (shouldSkipWorkLoopSleep()) return { skipped: true, interrupted: workLoopInterrupted };
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeWorkLoopSleep = null;
      resolve();
    }, Math.round(seconds * 1000));
    wakeWorkLoopSleep = () => {
      clearTimeout(timer);
      wakeWorkLoopSleep = null;
      resolve();
    };
  });
  return { skipped: false, interrupted: workLoopInterrupted };
}

function printWorkLoop(payload: Json): void {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (safeString(payload.scope) === 'workspace') {
    console.log(`workspace root: ${payload.workspaceRoot}`);
    console.log(`projects: ${payload.projectCount ?? 0}`);
  } else {
    console.log(`repo: ${payload.repo}`);
  }
  console.log(`mode: ${payload.mode}`);
  console.log(`worker: ${payload.workerType ?? 'review'}`);
  console.log(`loop: ${payload.infinite ? 'infinite' : 'bounded'}`);
  console.log(`max iterations: ${payload.maxIterations ?? 'unbounded'}`);
  console.log(`interval seconds: ${payload.intervalSeconds}`);
  const workerType = safeString(payload.workerType) ?? 'review';
  const iterations = Array.isArray(payload.iterations) ? payload.iterations.filter(isJson) : [];
  for (const iteration of iterations) {
    const summary = isJson(iteration.summary) ? iteration.summary as Json : summarizeWorkIteration(iteration);
    if (workerType === 'coding') {
      const projectText = safeString(payload.scope) === 'workspace' ? `projects ${iteration.projectCount ?? payload.projectCount ?? 0}, ` : '';
      console.log(`iteration ${iteration.iteration}/${payload.maxIterations ?? 'unbounded'}: ${projectText}ready ${summary.ready}, blocked ${summary.blocked}, idle ${summary.idle}`);
    } else {
      const projectText = safeString(payload.scope) === 'workspace' ? `projects ${iteration.projectCount ?? payload.projectCount ?? 0}, ` : '';
      console.log(`iteration ${iteration.iteration}/${payload.maxIterations ?? 'unbounded'}: ${projectText}pending ${summary.pending}, converted ${summary.converted}/${summary.conversions}, idle ${summary.idle}`);
    }
    const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
    for (const warning of warnings) console.log(`iteration ${iteration.iteration} warning: ${warning}`);
  }
  const summary = isJson(payload.summary) ? payload.summary as Json : {};
  if (workerType === 'coding') {
    console.log(`summary: iterations ${summary.attempted}/${summary.requested}, ready ${summary.ready}, blocked ${summary.blocked}, idle ${summary.idle}`);
  } else {
    console.log(`summary: iterations ${summary.attempted}/${summary.requested}, converted ${summary.converted}/${summary.conversions}, pending ${summary.pending}, idle ${summary.idle}`);
  }
  console.log(`stop reason: ${payload.stopReason}`);
  if (safeString(payload.warning)) console.log(`warning: ${payload.warning}`);
}

function workLoopMaxIterationsArg(): number | null {
  if (hasFlag('--once')) return 1;
  for (const flag of ['--iterations', '--max-iterations']) {
    const raw = getArg(flag);
    if (raw === null) continue;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 1) return 1;
    return value;
  }
  return null;
}

function emitWorkProgress(message: string): void {
  if (!hasFlag('--json')) console.log(message);
}

async function runWorkWorkerLoop(
  repoPath: string,
  workerType: WorkWorkerType,
  options: { mode?: string; iterationMode?: string; startupLabel?: string } = {},
): Promise<Json> {
  const maxIterations = workLoopMaxIterationsArg();
  const bounded = maxIterations !== null;
  const intervalSeconds = secondsArgAny(['--interval', '--sleep'], 10, 3600);
  const iterations: Json[] = [];
  const sleeps: Json[] = [];
  let stopReason = 'max-iterations';
  const cleanup = installWorkLoopInterruptHandlers(emitWorkProgress);
  const startupLabel = options.startupLabel ?? `axis work-${workerType === 'review' ? 'review' : 'coding'}`;
  const binding = await readProjectBinding(repoPath);
  const projectId = binding ? projectApiId(binding) : null;

  emitWorkProgress(`${startupLabel} starting`);
  emitWorkProgress(`repo: ${repoPath}`);
  emitWorkProgress(`project: ${projectId ?? (binding ? 'missing-project-id' : 'unbound')}`);
  emitWorkProgress(`worker: ${workerType}`);
  emitWorkProgress(`loop: ${bounded ? `bounded (${maxIterations} iteration${maxIterations === 1 ? '' : 's'})` : 'infinite'}`);
  emitWorkProgress(`interval seconds: ${intervalSeconds}`);

  try {
    for (let index = 0; maxIterations === null || index < maxIterations; index++) {
      if (workLoopInterrupted) {
        stopReason = 'interrupted';
        break;
      }
      const iterationNumber = index + 1;
      const startedAt = new Date().toISOString();
      emitWorkProgress(`iteration ${iterationNumber}: start`);
      const run = workerType === 'review'
        ? await buildReviewWorkerIteration(repoPath, { spawn: true, progress: emitWorkProgress, mode: options.iterationMode })
        : await buildCodingWorkerIteration(repoPath, { progress: emitWorkProgress, mode: options.iterationMode });
      const iteration: Json = {
        iteration: iterationNumber,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...run,
      };
      const iterationSummary = summarizeWorkIteration(iteration);
      iteration.summary = iterationSummary;
      iterations.push(iteration);
      if (workerType === 'coding') {
        emitWorkProgress(`iteration ${iterationNumber}: ready ${iterationSummary.ready}, blocked ${iterationSummary.blocked}, idle ${iterationSummary.idle}`);
      } else {
        emitWorkProgress(`iteration ${iterationNumber}: pending ${iterationSummary.pending}, converted ${iterationSummary.converted}/${iterationSummary.conversions}, idle ${iterationSummary.idle}`);
      }

      if (workLoopInterrupted) {
        stopReason = 'interrupted';
        break;
      }

      const reason = workLoopStopReason(workerType, iteration, iterationSummary);
      if (reason) {
        stopReason = reason;
        break;
      }

      const reachedBound = maxIterations !== null && iterationNumber >= maxIterations;
      if (reachedBound) {
        stopReason = 'max-iterations';
        break;
      }

      emitWorkProgress(`idle: sleeping ${intervalSeconds}s before next poll`);
      const sleep = await sleepWorkLoop(intervalSeconds);
      sleeps.push({ afterIteration: iterationNumber, seconds: intervalSeconds, skipped: sleep.skipped, interrupted: sleep.interrupted });
      if (sleep.interrupted) {
        stopReason = 'interrupted';
        break;
      }
    }
  } finally {
    cleanup();
  }

  const summary = summarizeWorkLoop(iterations, maxIterations);
  const payload: Json = {
    ok: true,
    mode: options.mode ?? (workerType === 'review' ? 'work-review' : 'work-coding'),
    workerType,
    repo: repoPath,
    bounded,
    infinite: !bounded,
    maxIterations,
    intervalSeconds,
    iterations,
    sleeps,
    summary,
    stopReason,
    warning: summary.warnings.length > 0 ? summary.warnings.join(' ') : null,
  };
  emitWorkProgress(`stop reason: ${stopReason}`);
  return payload;
}

async function runWorkspaceWorkWorkerLoop(
  workerType: WorkWorkerType,
  options: { mode?: string; iterationMode?: string; startupLabel?: string } = {},
): Promise<Json> {
  const maxIterations = workLoopMaxIterationsArg();
  const bounded = maxIterations !== null;
  const intervalSeconds = secondsArgAny(['--interval', '--sleep'], 10, 3600);
  const iterations: Json[] = [];
  const sleeps: Json[] = [];
  let stopReason = 'max-iterations';
  const startupLabel = options.startupLabel ?? `axis work-${workerType === 'review' ? 'review' : 'coding'}`;
  const workspace = await resolveAxisWorkspaceForWorker();
  const cleanup = installWorkLoopInterruptHandlers(emitWorkProgress);

  emitWorkProgress(`${startupLabel} starting`);
  emitWorkProgress(`workspace root: ${workspace.workspaceRoot}`);
  emitWorkProgress(`projects: ${workspace.projects.length}`);
  emitWorkProgress(`worker: ${workerType}`);
  emitWorkProgress(`loop: ${bounded ? `bounded (${maxIterations} iteration${maxIterations === 1 ? '' : 's'})` : 'infinite'}`);
  emitWorkProgress(`interval seconds: ${intervalSeconds}`);
  for (const warning of workspace.warnings) emitWorkProgress(`workspace warning: ${warning}`);

  try {
    for (let index = 0; maxIterations === null || index < maxIterations; index++) {
      if (workLoopInterrupted) {
        stopReason = 'interrupted';
        break;
      }
      const iterationNumber = index + 1;
      const startedAt = new Date().toISOString();
      emitWorkProgress(`iteration ${iterationNumber}: start`);
      const run = await buildWorkspaceWorkerIteration(workspace, workerType, {
        spawn: workerType === 'review',
        progress: emitWorkProgress,
        mode: options.iterationMode,
      });
      const iteration: Json = {
        iteration: iterationNumber,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...run,
      };
      const iterationSummary = isJson(iteration.summary) ? iteration.summary as unknown as WorkIterationSummary : summarizeWorkIteration(iteration);
      iteration.summary = iterationSummary;
      iterations.push(iteration);
      if (workerType === 'coding') {
        emitWorkProgress(`iteration ${iterationNumber}: projects ${workspace.projects.length}, ready ${iterationSummary.ready}, blocked ${iterationSummary.blocked}, idle ${iterationSummary.idle}`);
      } else {
        emitWorkProgress(`iteration ${iterationNumber}: projects ${workspace.projects.length}, pending ${iterationSummary.pending}, converted ${iterationSummary.converted}/${iterationSummary.conversions}, idle ${iterationSummary.idle}`);
      }

      if (workLoopInterrupted) {
        stopReason = 'interrupted';
        break;
      }

      const reason = workspaceWorkLoopStopReason(workerType, iteration, iterationSummary);
      if (reason) {
        stopReason = reason;
        break;
      }

      const reachedBound = maxIterations !== null && iterationNumber >= maxIterations;
      if (reachedBound) {
        stopReason = 'max-iterations';
        break;
      }

      emitWorkProgress(`idle: sleeping ${intervalSeconds}s before next poll`);
      const sleep = await sleepWorkLoop(intervalSeconds);
      sleeps.push({ afterIteration: iterationNumber, seconds: intervalSeconds, skipped: sleep.skipped, interrupted: sleep.interrupted });
      if (sleep.interrupted) {
        stopReason = 'interrupted';
        break;
      }
    }
  } finally {
    cleanup();
  }

  const summary = summarizeWorkLoop(iterations, maxIterations);
  const payload: Json = {
    ok: true,
    mode: options.mode ?? (workerType === 'review' ? 'work-review' : 'work-coding'),
    workerType,
    scope: 'workspace',
    repo: null,
    workspaceRoot: workspace.workspaceRoot,
    backendUrl: normalizeBackendUrl(workspace.backendUrl),
    projectCount: workspace.projects.length,
    workspaceProjects: workspace.projects.map(safeWorkspaceProject),
    catalogPath: workspace.catalogPath,
    bounded,
    infinite: !bounded,
    maxIterations,
    intervalSeconds,
    iterations,
    sleeps,
    summary,
    stopReason,
    warning: summary.warnings.length > 0 ? summary.warnings.join(' ') : null,
  };
  emitWorkProgress(`stop reason: ${stopReason}`);
  return payload;
}

async function handleWorkCommand(command?: string): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }
  const repoPath = resolveRepoArg();
  if (command === 'once') {
    printWorkProbe(hasFlag('--spawn') ? await buildWorkRun(repoPath) : await buildWorkProbe(repoPath));
    return;
  }
  if (command === 'loop') {
    printWorkLoop(await runWorkWorkerLoop(repoPath, 'review', {
      mode: 'loop-work',
      iterationMode: 'work-once',
      startupLabel: 'axis work loop',
    }));
    return;
  }
  printUsage();
  process.exit(1);
}

function getPoolDeleteId(args: string[]): string | null {
  const index = args.indexOf('--delete');
  if (index === -1) return null;
  const next = args[index + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
}

async function selectAndDeletePoolItem(pool: PoolConfig): Promise<void> {
  if (hasFlag('--json')) {
    const repoPath = resolveRepoArg();
    printDeletePayload({
      ok: false,
      repo: repoPath,
      pool: pool.pool,
      id: null,
      error: {
        code: 'id_required',
        message: 'Delete in --json mode requires an id and --yes.',
      },
    });
    process.exit(2);
  }
  const repoPath = resolveRepoArg();
  const pageSize = pageSizeArg();
  const loaded = await loadPoolItems(pool, repoPath, 1, pageSize);
  const items = loaded.items;
  if (items.length === 0) {
    console.log(`${pool.displayName}暂无条目`);
    return;
  }
  const prompt = await createPromptSession();
  try {
    console.log(`${pool.displayName} 第 1 页，每页 ${pageSize} 条`);
    items.forEach((item, index) => console.log(formatPoolItemLine(item, index + 1)));
    const selected = await prompt.question('输入编号或 id: ');
    if (!process.stdin.isTTY && selected.trim() === '') {
      throw new Error('Delete requires an id, --yes for scripts, or an interactive terminal selection.');
    }
    const item = findPoolItem(items, selected);
    if (!item) {
      console.log('未找到该条目');
      return;
    }
    await deletePoolItem(pool, poolItemDisplayId(item), { item, prompt });
  } finally {
    prompt.close();
  }
}

async function handlePoolCommand(pool: PoolConfig, args: string[]): Promise<void> {
  const subcommand = args[0];
  if (hasFlag('--help') || hasFlag('-h')) {
    printUsage();
    return;
  }
  if (hasFlag('--list')) {
    await listPoolItems(pool);
    return;
  }
  if (hasFlag('--delete')) {
    const deleteId = getPoolDeleteId(args);
    if (deleteId) {
      await deletePoolItem(pool, deleteId);
    } else {
      await selectAndDeletePoolItem(pool);
    }
    return;
  }
  if (subcommand === 'prepare') {
    await preparePool(pool);
    return;
  }
  if (subcommand === 'import') {
    await importPoolArtifact(pool, args.slice(1));
    return;
  }
  if (subcommand === 'run') {
    await runPool(pool, args.slice(1));
    return;
  }
  const repoPath = resolveRepoArg();
  const input = await readPoolInput(args);
  printPoolSeed(await submitPoolSeed(pool, repoPath, input));
}

async function main(): Promise<void> {
  const [, , group, command] = process.argv;
  const invoked = path.basename(process.argv[1] ?? '');
  if (POOLS[invoked]) {
    await handlePoolCommand(POOLS[invoked], process.argv.slice(2));
    return;
  }
  if (!group || group === '--help' || group === '-h') {
    printUsage();
    process.exit(0);
  }

  if (POOLS[group]) {
    await handlePoolCommand(POOLS[group], process.argv.slice(3));
    return;
  }

  if (group === 'login') {
    await loginCommand();
    return;
  }

  if (group === 'me' || group === 'whoami') {
    await meCommand();
    return;
  }

  if (group === 'init' || group === 'setup') {
    await setupRepo();
    return;
  }

  if (group === 'init-product-line') {
    await setupProductLineRoot();
    return;
  }

  if (group === 'bind') {
    await bindTopLevel();
    return;
  }

  if (group === 'pull') {
    await pullCloudStructure();
    return;
  }

  if (group === 'create-employee') {
    await createEmployeeCommand();
    return;
  }

  if (group === 'work') {
    await handleWorkCommand(command);
    return;
  }

  if (group === 'start-work') {
    if (isHelpFlag(command)) {
      printStartWorkUsage();
      return;
    }
    await startWorkCommand();
    return;
  }

  if (group === 'work-status') {
    await workStatusCommand();
    return;
  }

  if (group === 'work-once') {
    printWorkProbe(await buildWorkRun(resolveRepoArg(), { spawn: true, progress: emitWorkProgress }));
    return;
  }

  if (group === 'work-loop') {
    printWorkLoop(await runWorkWorkerLoop(resolveRepoArg(), 'review', {
      mode: 'loop-work',
      iterationMode: 'work-once',
      startupLabel: 'axis work-loop',
    }));
    return;
  }

  if (group === 'work-review') {
    if (isHelpFlag(command)) {
      printWorkWorkerUsage('review');
      return;
    }
    printWorkLoop(await (getArg('--repo')
      ? runWorkWorkerLoop(resolveRepoArg(), 'review')
      : runWorkspaceWorkWorkerLoop('review')));
    return;
  }

  if (group === 'work-coding') {
    if (isHelpFlag(command)) {
      printWorkWorkerUsage('coding');
      return;
    }
    printWorkLoop(await (getArg('--repo')
      ? runWorkWorkerLoop(resolveRepoArg(), 'coding')
      : runWorkspaceWorkWorkerLoop('coding')));
    return;
  }

  if (group === 'install') {
    await installSkillsCommand();
    return;
  }

  if (group === 'logout') {
    await logoutOrbit();
    return;
  }

  if (group === 'codex-hook' && command === 'ingest') {
    await ingest();
    return;
  }

  if (group === 'codex-status' && command === 'current') {
    await showCurrent();
    return;
  }

  if (group === 'codex-status' && command === 'tail') {
    await showTail();
    return;
  }

  if (group === 'codex-status' && command === 'summary') {
    await showSummary();
    return;
  }

  if (group === 'codex-run' && command === 'once') {
    await runCodexOnce();
    return;
  }

  if (group === 'mcp' && command === 'install') {
    await installMcp();
    return;
  }

  if (group === 'project' && command === 'bind') {
    await bindProject();
    return;
  }

  if (group === 'project' && command === 'show') {
    await showProject();
    return;
  }

  printUsage();
  process.exit(1);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    if (error instanceof OrbitCliError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
