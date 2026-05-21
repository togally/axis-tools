#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { appendFile, copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile, spawn } from 'node:child_process';
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
type InstallAgentChoice = 'codex' | 'claude-code' | 'all';

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

function printUsage(): void {
  console.log(`orbit-tools\n\nCommands:\n  login\n  me\n  init\n  bind\n  pull\n  init-product-line\n  install [--agent <codex|claude-code|cc|all>] [--force]\n  logout [--backend-url <url>]\n  codex-hook ingest [--file <json-file>] [--repo <path>]\n  codex-status current [--repo <path>] [--json]\n  codex-status tail [--repo <path>] [--limit <n>]\n  codex-status summary [--repo <path>]\n  codex-run once --repo <path> --prompt <text> [--json] [--model <model>]\n  mcp install [--repo <path>] [--config <hermes-config>] [--backend-url <url>] [--mcp-url <url>] [--server-name <name>]\n  project bind --interactive [--repo <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project bind [--repo <path>] --product-line-uuid <uuid> --project-uuid <uuid> [--product-line-id <id>] [--project-id <id>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project show [--repo <path>] [--json]\n\nMain flow:\n  login = prompt for Orbit account and hidden password; cache session\n  me = show current Orbit Hub user\n  init = packaged skill setup only\n  bind = bind a repo or product-line root to Orbit Hub\n  pull = create local folders from Orbit Hub and clone maintained repos\n\nAdvanced overrides:\n  init [--repo <path>] [--backend-url <url>] [--agent <codex|claude-code|none>]\n  bind [--repo <path>] [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n  pull [--root <path>] [--backend-url <url>]\n  init-product-line [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n`);
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

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function homeDir(): string {
  return process.env.HOME ?? process.cwd();
}

function defaultBackendUrl(): string {
  return process.env.ORBIT_BACKEND_URL ?? SHARED_BACKEND_URL;
}

function defaultMcpUrl(backendUrl: string): string {
  return process.env.ORBIT_MCP_URL ?? `${backendUrl.replace(/\/$/, '')}/api/mcp`;
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

function projectConfigPath(repoPath: string): string {
  return path.join(orbitDir(repoPath), 'project.json');
}

function productLineConfigPath(rootPath: string): string {
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
  await writeFile(filePath, `${JSON.stringify({ ...current, ...values, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

async function readProjectBinding(repoPath: string): Promise<ProjectBinding | null> {
  try {
    return JSON.parse(await readFile(projectConfigPath(repoPath), 'utf8')) as ProjectBinding;
  } catch {
    return null;
  }
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

function asOrbitUser(value: unknown, account: string): OrbitUser {
  if (!isJson(value)) return { account, name: account };
  const permissions = Array.isArray(value.permissions)
    ? value.permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];
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
    user: asOrbitUser(value.user, account),
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
  return `请先登录 / Please login: run orbit-tools login --backend-url ${normalizeBackendUrl(backendUrl)}`;
}

function insufficientPermissionMessage(): string {
  return '权限不足 / Insufficient permission: ask an Orbit Hub owner/admin to grant access.';
}

async function cachedLoginSession(backendUrl: string): Promise<CachedOrbitLoginSession | null> {
  const config = await readGlobalOrbitConfig();
  return asCachedLoginSession(globalSessions(config)[normalizeBackendUrl(backendUrl)]);
}

async function writeGlobalOrbitConfigObject(config: Json): Promise<void> {
  const filePath = globalOrbitConfigPath();
  ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
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
    const account = (await prompt.question('Orbit account: ')).trim();
    const password = (await prompt.question('Orbit password: ', { hidden: true })).trim();
    if (!account || !password) throw new Error('Orbit account and password are required');
    const login = await loginOrbitHub(backendUrl, account, password);
    await saveLoginSession(backendUrl, mcpUrl, account, login);
    console.log(`Logged in to Orbit Hub as ${login.user.account ?? account}.`);
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
    || name.startsWith('orbit codex product')
    || name.startsWith('orbit codex product line')
    || name.startsWith('orbit codex module')
    || name.startsWith('orbit codex project');
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
    throw new Error(`Cannot reach Orbit Hub backend at ${url}: ${message}`);
  }

  if (!response.ok) {
    if (response.status === 401) throw new OrbitCliError(loginRequiredMessage(backendUrl));
    if (response.status === 403) throw new OrbitCliError(insufficientPermissionMessage());
    throw new Error(`Orbit Hub backend returned HTTP ${response.status} for ${url}`);
  }

  try {
    return await response.json() as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Orbit Hub backend returned invalid JSON for ${url}: ${message}`);
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
    throw new Error(`Cannot reach Orbit Hub backend at ${url}: ${message}`);
  }

  if (!response.ok) {
    if (response.status === 401) throw new OrbitCliError(loginRequiredMessage(backendUrl));
    if (response.status === 403) throw new OrbitCliError(insufficientPermissionMessage());
    throw new Error(`Orbit Hub backend returned HTTP ${response.status} for ${url}`);
  }

  try {
    return await response.json() as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Orbit Hub backend returned invalid JSON for ${url}: ${message}`);
  }
}

async function loginOrbitHub(backendUrl: string, account: string, password: string): Promise<OrbitLoginSession> {
  const payload = await postOrbitJson(backendUrl, '/api/login', { account, password });
  const session = asLoginSession(payload, account);
  if (!session) {
    throw new Error('Orbit Hub backend response for /api/login did not include token/key/user data');
  }
  return session;
}

async function fetchCurrentUser(backendUrl: string, token: string): Promise<OrbitUser> {
  const payload = await fetchOrbitJson(backendUrl, '/api/me', token);
  const rawUser = isJson(payload) && isJson(payload.user) ? payload.user : payload;
  const user = asOrbitUser(rawUser, '');
  if (!user.account) {
    throw new Error('Orbit Hub backend response for /api/me did not include user.account');
  }
  return user;
}

async function fetchProductLines(backendUrl: string, token?: string | null): Promise<OrbitProductDetail[]> {
  const payload = await fetchOrbitJson(backendUrl, '/api/products', token);
  if (!isJson(payload) || !Array.isArray(payload.products)) {
    throw new Error('Orbit Hub backend response for /api/products did not include a products array');
  }
  const products = payload.products
    .map(asProductDetail)
    .filter((entry): entry is OrbitProductDetail => Boolean(entry))
    .map(visibleProductDetail)
    .filter((entry): entry is OrbitProductDetail => Boolean(entry));
  if (products.length === 0) {
    throw new Error(`No product lines found in Orbit Hub at ${normalizeBackendUrl(backendUrl)}. Create a product line first.`);
  }
  return products;
}

async function fetchProductDetail(backendUrl: string, productLineId: string, token?: string | null, options: { allowEmptyProjects?: boolean } = {}): Promise<OrbitProductDetail> {
  const payload = await fetchOrbitJson(backendUrl, `/api/products/${encodeURIComponent(productLineId)}`, token);
  const detail = asProductDetail(payload);
  if (!detail) {
    throw new Error(`Orbit Hub backend response for product line ${productLineId} did not include product/modules data`);
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
  ensureDir(orbitDir(repoPath));
  await writeFile(projectConfigPath(repoPath), `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
  const globalValues: Json = {
    backendUrl: binding.backendUrl,
    token: binding.token,
    key: binding.key,
    session: binding.session,
    account: binding.account,
    user: binding.user,
    productLineUuid: binding.productLineUuid,
    projectUuid: binding.projectUuid,
    productLineId: binding.productLineId,
    projectId: binding.projectId,
    productLineName: binding.productLineName,
    projectName: binding.projectName,
    owner: binding.owner,
    selectedAgent: binding.selectedAgent,
    skillPath: binding.skillPath,
    agentSkillPath: binding.agentSkillPath,
    lastRepo: repoPath,
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
  ensureDir(orbitDir(rootPath));
  await writeFile(productLineConfigPath(rootPath), `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
  const globalValues: Json = {
    backendUrl: binding.backendUrl,
    token: binding.token,
    key: binding.key,
    session: binding.session,
    account: binding.account,
    user: binding.user,
    productLineUuid: binding.productLineUuid,
    productLineId: binding.productLineId,
    productLineName: binding.productLineName,
    owner: binding.owner,
    selectedAgent: binding.selectedAgent,
    skillPath: binding.skillPath,
    agentSkillPath: binding.agentSkillPath,
    lastProductLineRoot: rootPath,
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
  console.log(JSON.stringify({ ok: true, config: projectConfigPath(repoPath), binding }, null, 2));
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

The \`oribit-idea\` skill uses this dependency to incubate ideas through an office-hours discussion, then turns the resulting notes into Orbit-ready artifacts.
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
    lastRepo: repoPath,
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
      console.log(JSON.stringify({ ok: true, config: projectConfigPath(repoPath), binding }, null, 2));
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

function safeSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'orbit-item';
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

async function isCloneableLocalRepoPath(repoPath: string | null | undefined): Promise<boolean> {
  if (!repoPath || !path.isAbsolute(repoPath) || !repoPath.endsWith('.git')) return false;
  if (!await directoryExists(repoPath)) return false;
  try {
    await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--is-bare-repository']);
    return true;
  } catch {
    return false;
  }
}

async function cloneAddress(module: OrbitProjectModule): Promise<string | null> {
  const explicitAddress = explicitCloneAddress(module);
  if (explicitAddress) return explicitAddress;
  if (await isCloneableLocalRepoPath(module.repoPath)) return module.repoPath ?? null;
  return null;
}

function summarizeCommandError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).join(' ');
  }
  return String(error);
}

type SyncRepositoryResult = {
  status: 'created' | 'cloned' | 'pulled' | 'skipped-nonempty' | 'clone-failed';
  error?: string;
};

async function syncRepository(repoUrl: string | null, targetPath: string): Promise<SyncRepositoryResult> {
  if (!repoUrl) {
    ensureDir(targetPath);
    return { status: 'created' };
  }

  if (!await directoryExists(targetPath) || await directoryIsEmpty(targetPath)) {
    ensureDir(path.dirname(targetPath));
    try {
      await execFileAsync('git', ['clone', repoUrl, targetPath]);
      return { status: 'cloned' };
    } catch (error) {
      ensureDir(targetPath);
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

async function selectProductLinesToPull(prompt: PromptSession, backendUrl: string, token?: string | null): Promise<OrbitProductDetail[]> {
  const productLines = await fetchProductLines(backendUrl, token);
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
      } catch {
        details.push(entry);
      }
    }
    return details;
  }
  return [await fetchProductDetail(backendUrl, selected.id, token, { allowEmptyProjects: true })];
}

async function pullCloudStructure(): Promise<void> {
  const rootPath = path.resolve(getArg('--root') ?? process.cwd());
  const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
  const mcpUrl = resolveMcpUrl(getArg('--mcp-url'));

  const productConfigs: string[] = [];
  const projectConfigs: string[] = [];
  const gitResults: { path: string; status: string; repo: string | null; error?: string }[] = [];
  const { login, account } = await requireCachedLoginSession(backendUrl, mcpUrl);

  const prompt = await createPromptSession();
  try {
    const owner = login.user.account ?? account;
    const productDetails = await selectProductLinesToPull(prompt, backendUrl, login.token);

    ensureDir(rootPath);
    for (const productDetail of productDetails) {
      const productPath = path.join(rootPath, safeSlug(productDetail.product.name));
      ensureDir(productPath);
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

      for (const project of productDetail.modules) {
        const projectPath = path.join(productPath, safeSlug(project.name));
        const repoUrl = await cloneAddress(project);
        const syncResult = await syncRepository(repoUrl, projectPath);
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
        gitResults.push({ path: projectPath, status: syncResult.status, repo: repoUrl, error: syncResult.error });
      }
    }
  } finally {
    prompt.close();
  }

  console.log('Summary:');
  console.log(`  product lines: ${productConfigs.length}`);
  productConfigs.forEach((configPath) => console.log(`    ${configPath}`));
  console.log(`  projects: ${projectConfigs.length}`);
  projectConfigs.forEach((configPath) => console.log(`    ${configPath}`));
  for (const status of ['cloned', 'pulled', 'created', 'skipped-nonempty', 'clone-failed']) {
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

  console.log(JSON.stringify({ ok: true, config: projectConfigPath(repoPath), binding }, null, 2));
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
    console.error(`No Orbit project binding found at ${projectConfigPath(repoPath)}`);
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

async function main(): Promise<void> {
  const [, , group, command] = process.argv;
  if (!group || group === '--help' || group === '-h') {
    printUsage();
    process.exit(0);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    if (error instanceof OrbitCliError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
