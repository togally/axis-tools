#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { appendFile, chmod, copyFile, cp, readdir, readFile, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
class OrbitHttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
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
const POOLS = {
    'axis-ide': { command: 'axis-ide', pool: 'ide', kind: 'idea', displayName: '想法池', skill: 'oribit-idea', defaultDir: 'docs/ideas' },
    'axis-req': { command: 'axis-req', pool: 'req', kind: 'requirement', displayName: '需求池', skill: 'orbit-requirement', defaultDir: 'docs/requirements' },
    'axis-bug': { command: 'axis-bug', pool: 'bug', kind: 'bug', displayName: 'Bug池', skill: 'orbit-bug', defaultDir: 'docs/bugs' },
    'axis-sug': { command: 'axis-sug', pool: 'sug', kind: 'suggestion', displayName: '优化池', skill: 'orbit-suggestion', defaultDir: 'docs/suggestions' },
    'orbit-ide': { command: 'orbit-ide', pool: 'ide', kind: 'idea', displayName: '想法池', skill: 'oribit-idea', defaultDir: 'docs/ideas' },
    'orbit-req': { command: 'orbit-req', pool: 'req', kind: 'requirement', displayName: '需求池', skill: 'orbit-requirement', defaultDir: 'docs/requirements' },
    'orbit-bug': { command: 'orbit-bug', pool: 'bug', kind: 'bug', displayName: 'Bug池', skill: 'orbit-bug', defaultDir: 'docs/bugs' },
    'orbit-sug': { command: 'orbit-sug', pool: 'sug', kind: 'suggestion', displayName: '优化池', skill: 'orbit-suggestion', defaultDir: 'docs/suggestions' },
};
const AXIS_POOLS_BY_KIND = {
    idea: POOLS['axis-ide'],
    requirement: POOLS['axis-req'],
    bug: POOLS['axis-bug'],
    suggestion: POOLS['axis-sug'],
};
const POOL_METHODOLOGY_BY_KIND = {
    idea: 'plan-ceo-review',
    requirement: 'superpowers:brainstorm',
    bug: 'superpowers:systematic-debugging',
    suggestion: 'superpowers:brainstorm',
};
const METHODOLOGY_INJECTION_MAX_CHARS = 24_000;
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
];
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
function printUsage() {
    console.log(`axis\n\nAliases: axis-tools, orbit, orbit-tools\n\nCommands:\n  login\n  me\n  init\n  bind\n  pull\n  init-product-line\n  install [--agent <codex|claude-code|cc|all>] [--force]\n  logout [--backend-url <url>]\n  axis-req <text> [--repo <path>] [--json]\n  axis-req --list [--repo <path>] [--page <n>] [--page-size <n>] [--json]\n  axis-req --delete <id> [--repo <path>] [--yes] [--json]\n  axis-ide|axis-bug|axis-sug use the same seed/list/delete flags\n  axis work-review [--repo <path>] [--project-id <id>|--project-uuid <uuid>] [--interval <seconds>|--sleep <seconds>] [--iterations <n>|--max-iterations <n>|--once] [--json]\n  axis work-coding [--repo <path>] [--project-id <id>|--project-uuid <uuid>] [--interval <seconds>|--sleep <seconds>] [--iterations <n>|--max-iterations <n>|--once] [--json]\n  codex-hook ingest [--file <json-file>] [--repo <path>]\n  codex-status current [--repo <path>] [--json]\n  codex-status tail [--repo <path>] [--limit <n>]\n  codex-status summary [--repo <path>]\n  codex-run once --repo <path> --prompt <text> [--json] [--model <model>]\n  mcp install [--repo <path>] [--config <hermes-config>] [--backend-url <url>] [--mcp-url <url>] [--server-name <name>]\n  project bind --interactive [--repo <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project bind [--repo <path>] --product-line-uuid <uuid> --project-uuid <uuid> [--product-line-id <id>] [--project-id <id>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project show [--repo <path>] [--json]\n\nDeprecated worker aliases:\n  axis work-once --repo <path> [--agent <codex|claude-code|none>] [--json]\n  axis work-loop --repo <path> [--iterations <n>|--max-iterations <n>|--once] [--interval <seconds>|--sleep <seconds>] [--agent <codex|claude-code|none>] [--json]\n  axis work once|loop ... = deprecated aliases for the review worker\n\nMain flow:\n  login = prompt for AxisNode account and hidden password; cache session\n  me = show current AxisNode user\n  init = packaged skill setup only\n  bind = bind a repo or product-line root to AxisNode\n  pull = clone/pull maintained repos from AxisNode into AXIS_HOME or ~/.axis by default\n\nPool examples:\n  axis-req "商品评价支持图片"\n  axis-bug "登录失败"\n  axis-sug "优化按钮文案" --json\n  axis-req --list --page 1 --page-size 20\n\nWorker examples:\n  axis work-review\n  axis work-review --iterations 1 --json\n  axis work-review --repo /path/to/repo --iterations 1 --json\n  axis work-coding\n  axis work-coding --once --json\n  axis work-coding --repo /path/to/repo --once --json\n\nPool flags:\n  --local / --save-local = force local seed save instead of Hub submit\n  --save = deprecated alias for --local\n  --from <file> / --stdin = read seed input from file or stdin\n  --json = machine-readable output\n\nAdvanced overrides:\n  init [--repo <path>] [--backend-url <url>] [--agent <codex|claude-code|none>]\n  bind [--repo <path>] [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n  pull [--root <path>] [--backend-url <url>]\n  init-product-line [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n`);
    console.log(`Pool interactive defaults:\n  axis-req --list = interactive pagination, default 10 items/page\n  axis-req --delete = choose an item interactively, then type yes to confirm\n  --yes is for scripts/CI; --json keeps machine-readable non-interactive output\n`);
}
function printWorkWorkerUsage(workerType) {
    const command = workerType === 'review' ? 'work-review' : 'work-coding';
    console.log(`axis ${command}\n\nUsage:\n  axis ${command} [--repo <path>] [--project-id <id>|--project-uuid <uuid>] [--interval <seconds>|--sleep <seconds>] [--iterations <n>|--max-iterations <n>|--once] [--json]\n\nDefault scope:\n  Without --repo, use AXIS_HOME or ~/.axis, sync accessible AxisNode projects, and loop all permitted project queues.\n\nFlags:\n  --repo <path>                    Narrow to one repo and read its AxisNode project binding\n  --project-id <id>, --project-uuid <uuid>\n                                   Narrow workspace mode to one accessible project\n  --backend-url <url>              AxisNode backend; defaults to cached login backend or shared backend\n  --interval <seconds>, --sleep <seconds>\n                                   Seconds between polls\n  --iterations <n>, --max-iterations <n>\n                                   Run a bounded number of polls\n  --once                           Alias for --iterations 1\n  --json                           Print machine-readable JSON output\n  --help, -h                       Print this help\n`);
}
function isHelpFlag(value) {
    return value === '--help' || value === '-h';
}
function getArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1)
        return null;
    return process.argv[index + 1] ?? null;
}
function hasFlag(flag) {
    return process.argv.includes(flag);
}
function parseJsonText(text) {
    return JSON.parse(text);
}
function safeString(value) {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function combineWarnings(...warnings) {
    const present = warnings.filter((warning) => Boolean(warning));
    return present.length > 0 ? present.join(' ') : null;
}
function ensureDir(dir) {
    mkdirSync(dir, { recursive: true });
}
function homeDir() {
    return process.env.HOME ?? process.cwd();
}
function defaultBackendUrl() {
    return process.env.ORBIT_BACKEND_URL ?? SHARED_BACKEND_URL;
}
function defaultMcpUrl(backendUrl) {
    return process.env.ORBIT_MCP_URL ?? `${backendUrl.replace(/\/$/, '')}/api/mcp`;
}
function resolveMcpUrl(explicit, existing) {
    return explicit ?? existing ?? undefined;
}
function resolveRepoArg() {
    return path.resolve(getArg('--repo') ?? process.cwd());
}
function resolveProductLineRootArg() {
    return path.resolve(getArg('--root') ?? getArg('--repo') ?? process.cwd());
}
function orbitDir(repoPath) {
    return path.join(repoPath, '.orbit');
}
function axisDir(repoPath) {
    return path.join(repoPath, '.axis');
}
function projectConfigPath(repoPath) {
    const axisPath = axisProjectConfigPath(repoPath);
    return existsSync(axisPath) ? axisPath : legacyProjectConfigPath(repoPath);
}
function productLineConfigPath(rootPath) {
    const axisPath = axisProductLineConfigPath(rootPath);
    return existsSync(axisPath) ? axisPath : legacyProductLineConfigPath(rootPath);
}
function axisProjectConfigPath(repoPath) {
    return path.join(axisDir(repoPath), 'project.json');
}
function legacyProjectConfigPath(repoPath) {
    return path.join(orbitDir(repoPath), 'project.json');
}
function axisProductLineConfigPath(rootPath) {
    return path.join(axisDir(rootPath), 'product-line.json');
}
function legacyProductLineConfigPath(rootPath) {
    return path.join(orbitDir(rootPath), 'product-line.json');
}
function cliPackageRoot() {
    const cliFile = fileURLToPath(import.meta.url);
    const cliDir = path.dirname(cliFile);
    return path.basename(cliDir) === 'dist' ? path.dirname(cliDir) : process.cwd();
}
function globalOrbitConfigPath() {
    return path.join(homeDir(), '.orbit', 'config.json');
}
function axisHomeDir() {
    return path.resolve(process.env.AXIS_HOME ?? path.join(homeDir(), '.axis'));
}
function axisWorkspaceCatalogPath(workspaceRoot = axisHomeDir()) {
    return path.join(workspaceRoot, 'catalog.json');
}
function stableOrbitSkillPath(skillName = 'orbit-workflow') {
    return path.join(homeDir(), '.orbit', 'skills', skillName, 'SKILL.md');
}
function bundledSkillsDir() {
    return path.join(cliPackageRoot(), 'skills');
}
function bundledOrbitSkillPath(skillName = 'orbit-workflow') {
    return path.join(bundledSkillsDir(), skillName, 'SKILL.md');
}
function agentSkillPath(agent, skillName = 'orbit-workflow') {
    if (agent === 'codex')
        return path.join(homeDir(), '.codex', 'skills', skillName, 'SKILL.md');
    if (agent === 'claude-code')
        return path.join(homeDir(), '.claude', 'skills', skillName, 'SKILL.md');
    return null;
}
function hermesSkillPath(skillName) {
    return path.join(homeDir(), '.hermes', 'skills', skillName, 'SKILL.md');
}
function hermesSkillsDir() {
    return path.join(homeDir(), '.hermes', 'skills');
}
function codexSuperpowersSkillRoot() {
    return path.join(homeDir(), '.codex', 'skills', 'superpowers');
}
function gstackHomeDir() {
    return path.resolve(process.env.AXIS_GSTACK_HOME ?? path.join(homeDir(), 'gstack'));
}
function userLocalBinDir() {
    return path.join(homeDir(), '.local', 'bin');
}
function gstackWrapperPath() {
    return path.join(userLocalBinDir(), 'gstack');
}
function defaultHermesConfigPath() {
    return path.join(homeDir(), '.hermes', 'config.yaml');
}
async function readJsonFile(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    }
    catch {
        return fallback;
    }
}
async function readGlobalOrbitConfig() {
    return readJsonFile(globalOrbitConfigPath(), {});
}
function yamlQuote(value) {
    return JSON.stringify(value);
}
function buildHermesOrbitYaml(serverName, backendUrl, mcpUrl) {
    return [
        `  ${serverName}:`,
        '    enabled: true',
        '    transport: http',
        `    url: ${yamlQuote(mcpUrl)}`,
        '    headers:',
        `      x-orbit-backend-url: ${yamlQuote(backendUrl)}`,
    ];
}
function upsertHermesYaml(content, serverName, backendUrl, mcpUrl) {
    const lines = content.split('\n');
    if (lines.at(-1) === '')
        lines.pop();
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
    const nextLines = [];
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
async function installHermesMcp(configPath, serverName, backendUrl, mcpUrl) {
    ensureDir(path.dirname(configPath));
    const isJson = configPath.endsWith('.json');
    if (isJson) {
        const config = await readJsonFile(configPath, {});
        const mcpServers = typeof config.mcp_servers === 'object' && config.mcp_servers !== null ? config.mcp_servers : {};
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
async function writeGlobalOrbitConfig(values) {
    const filePath = globalOrbitConfigPath();
    ensureDir(path.dirname(filePath));
    const current = await readGlobalOrbitConfig();
    await writeFile(filePath, `${JSON.stringify(cleanGlobalOrbitConfig({ ...current, ...values, updatedAt: new Date().toISOString() }), null, 2)}\n`, 'utf8');
}
async function readProjectBinding(repoPath) {
    return (await readProjectBindingWithPath(repoPath))?.binding ?? null;
}
async function readProjectBindingWithPath(repoPath) {
    for (const filePath of [axisProjectConfigPath(repoPath), legacyProjectConfigPath(repoPath)]) {
        try {
            return {
                repoPath,
                configPath: filePath,
                binding: JSON.parse(await readFile(filePath, 'utf8')),
            };
        }
        catch {
            // Try the next supported binding path.
        }
    }
    return null;
}
async function readProductLineBindingWithPath(rootPath) {
    for (const filePath of [axisProductLineConfigPath(rootPath), legacyProductLineConfigPath(rootPath)]) {
        try {
            return {
                rootPath,
                configPath: filePath,
                binding: JSON.parse(await readFile(filePath, 'utf8')),
            };
        }
        catch {
            // Try the next supported binding path.
        }
    }
    return null;
}
function inferPhase(eventName, toolName) {
    if (eventName === 'SessionStart')
        return 'starting';
    if (eventName === 'UserPromptSubmit')
        return 'waiting_prompt';
    if (eventName === 'PermissionRequest')
        return 'waiting_permission';
    if (eventName === 'PreCompact' || eventName === 'PostCompact')
        return 'compacting';
    if (eventName === 'Stop')
        return 'stopped';
    const tool = (toolName ?? '').toLowerCase();
    if (/(read|grep|glob|search|ls|find)/.test(tool))
        return 'reading';
    if (/(edit|write|patch)/.test(tool))
        return 'editing';
    if (/(pytest|test|jest|vitest|mocha)/.test(tool))
        return 'testing';
    if (/(bash|shell|command|npm|pnpm|yarn|node)/.test(tool))
        return 'executing';
    return 'unknown';
}
function inferStatus(eventName, phase) {
    if (eventName === 'Stop')
        return 'stopped';
    if (eventName === 'PermissionRequest')
        return 'blocked';
    if (phase === 'blocked')
        return 'blocked';
    return 'running';
}
function promptPreview(prompt) {
    if (!prompt)
        return null;
    return prompt.replace(/\s+/g, ' ').slice(0, 140);
}
function resolveRepoPath(raw, repoArg) {
    if (repoArg)
        return path.resolve(repoArg);
    const cwd = safeString(raw.cwd);
    if (cwd)
        return cwd;
    return process.cwd();
}
function statusDir(repoPath) {
    return path.join(repoPath, '.codex-status');
}
function latestPath(repoPath) {
    return path.join(statusDir(repoPath), 'latest.json');
}
function eventsPath(repoPath) {
    return path.join(statusDir(repoPath), 'events.jsonl');
}
async function readLatest(repoPath) {
    try {
        const content = await readFile(latestPath(repoPath), 'utf8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
async function countEvents(filePath) {
    try {
        const content = await readFile(filePath, 'utf8');
        return content.split('\n').filter(Boolean).length;
    }
    catch {
        return 0;
    }
}
async function appendNormalizedEvent(repoPath, normalized) {
    const dir = statusDir(repoPath);
    ensureDir(dir);
    const eventLogPath = eventsPath(repoPath);
    await appendFile(eventLogPath, `${JSON.stringify(normalized)}\n`, 'utf8');
    const total = await countEvents(eventLogPath);
    const previous = await readLatest(repoPath);
    const latest = {
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
function normalizeEvent(raw) {
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
function normalizeExecJson(repoPath, prompt, raw) {
    const type = safeString(raw.type);
    const ts = new Date().toISOString();
    if (!type)
        return null;
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
        const item = (raw.item ?? {});
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
async function ingest() {
    const fileArg = getArg('--file');
    const repoArg = getArg('--repo');
    const input = fileArg ? readFileSync(path.resolve(fileArg), 'utf8') : readFileSync(0, 'utf8');
    const raw = parseJsonText(input);
    const repoPath = resolveRepoPath(raw, repoArg);
    const normalized = normalizeEvent(raw);
    await appendNormalizedEvent(repoPath, normalized);
    console.log(JSON.stringify({ ok: true, repo: repoPath, latest: latestPath(repoPath), events: eventsPath(repoPath), event: normalized.event, phase: normalized.phase, status: normalized.status }));
}
async function showCurrent() {
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
async function showTail() {
    const repoArg = getArg('--repo');
    const repoPath = repoArg ? path.resolve(repoArg) : process.cwd();
    const limitRaw = getArg('--limit');
    const limit = limitRaw ? Number(limitRaw) : 10;
    const filePath = eventsPath(repoPath);
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const recent = lines.slice(-limit);
    for (const line of recent) {
        const event = JSON.parse(line);
        console.log(`${event.ts} ${event.event} phase=${event.phase} status=${event.status} tool=${event.tool_name ?? '-'} cwd=${event.cwd}${event.message ? ` msg=${event.message}` : ''}`);
    }
}
async function showSummary() {
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
async function runCodexOnce() {
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
    if (modelArg)
        args.unshift(modelArg), args.unshift('--model');
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
    let lastAgentMessage = null;
    const flushJsonLines = async (chunk) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('{'))
                continue;
            try {
                const raw = JSON.parse(trimmed);
                const normalized = normalizeExecJson(repoPath, promptArg, raw);
                if (normalized) {
                    await appendNormalizedEvent(repoPath, normalized);
                    if (normalized.event === 'AgentMessage' && normalized.message) {
                        lastAgentMessage = normalized.message;
                    }
                }
                if (jsonFlag)
                    console.log(trimmed);
            }
            catch {
                // ignore parse noise
            }
        }
    };
    child.stdout.on('data', (chunk) => {
        void flushJsonLines(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString('utf8');
    });
    const exitCode = await new Promise((resolve, reject) => {
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
    if (exitCode !== 0)
        process.exit(exitCode);
}
async function installMcp() {
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
function normalizeBackendUrl(backendUrl) {
    return backendUrl.replace(/\/$/, '');
}
function isJson(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cleanGlobalOrbitConfig(config) {
    for (const key of LOCAL_BINDING_GLOBAL_KEYS) {
        delete config[key];
    }
    return config;
}
function asPermissionList(value) {
    return Array.isArray(value)
        ? value.filter((permission) => typeof permission === 'string')
        : [];
}
function mergePermissions(...permissionLists) {
    return [...new Set(permissionLists.flat())];
}
function asOrbitUser(value, account, extraPermissions = []) {
    if (!isJson(value))
        return { account, name: account };
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
function asLoginSession(value, account) {
    if (!isJson(value))
        return null;
    const token = safeString(value.token);
    const key = safeString(value.key);
    if (!token || !key)
        return null;
    return {
        token,
        key,
        session: safeString(value.session),
        user: asOrbitUser(value.user, account, asPermissionList(value.permissions)),
    };
}
function asCachedLoginSession(value) {
    if (!isJson(value))
        return null;
    const backendUrl = safeString(value.backendUrl);
    const account = safeString(value.account);
    const token = safeString(value.token);
    const key = safeString(value.key);
    if (!backendUrl || !account || !token || !key)
        return null;
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
function globalSessions(config) {
    return isJson(config.sessions) ? config.sessions : {};
}
class OrbitCliError extends Error {
}
function loginRequiredMessage(backendUrl) {
    return `请先登录 / Please login: run axis login --backend-url ${normalizeBackendUrl(backendUrl)}; verify account has product/project access.`;
}
function insufficientPermissionMessage(backendUrl) {
    return `权限不足 / Insufficient permission: run axis login --backend-url ${normalizeBackendUrl(backendUrl)} with the correct account; verify account has product/project access.`;
}
async function cachedLoginSession(backendUrl) {
    const config = await readGlobalOrbitConfig();
    return asCachedLoginSession(globalSessions(config)[normalizeBackendUrl(backendUrl)]);
}
async function writeGlobalOrbitConfigObject(config) {
    const filePath = globalOrbitConfigPath();
    ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${JSON.stringify(cleanGlobalOrbitConfig({ ...config, updatedAt: new Date().toISOString() }), null, 2)}\n`, 'utf8');
}
async function saveLoginSession(backendUrl, mcpUrl, account, login) {
    const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
    const cached = {
        backendUrl: normalizedBackendUrl,
        account,
        token: login.token,
        key: login.key,
        session: login.session,
        user: login.user,
        updatedAt: new Date().toISOString(),
    };
    if (mcpUrl)
        cached.mcpUrl = mcpUrl;
    const config = await readGlobalOrbitConfig();
    config.sessions = {
        ...globalSessions(config),
        [normalizedBackendUrl]: cached,
    };
    config.backendUrl = normalizedBackendUrl;
    if (mcpUrl)
        config.mcpUrl = mcpUrl;
    config.token = cached.token;
    config.key = cached.key;
    config.session = cached.session;
    config.account = cached.account;
    config.user = cached.user;
    await writeGlobalOrbitConfigObject(config);
    return cached;
}
async function requireCachedLoginSession(backendUrl, mcpUrl) {
    const cached = await cachedLoginSession(backendUrl);
    if (!cached) {
        throw new OrbitCliError(loginRequiredMessage(backendUrl));
    }
    const user = await fetchCurrentUser(backendUrl, cached.token);
    const account = user.account ?? cached.account;
    const refreshed = await saveLoginSession(backendUrl, mcpUrl ?? cached.mcpUrl ?? undefined, account, { ...cached, user });
    return { login: refreshed, account };
}
async function loginCommand() {
    const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
    const mcpUrl = resolveMcpUrl(getArg('--mcp-url'));
    const prompt = await createPromptSession();
    try {
        const account = (await prompt.question('AxisNode account: ')).trim();
        const password = (await prompt.question('AxisNode password: ', { hidden: true })).trim();
        if (!account || !password)
            throw new Error('AxisNode account and password are required');
        const login = await loginOrbitHub(backendUrl, account, password);
        await saveLoginSession(backendUrl, mcpUrl, account, login);
        console.log(`Logged in to AxisNode as ${login.user.account ?? account}.`);
    }
    finally {
        prompt.close();
    }
}
async function meCommand() {
    const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
    const { login, account } = await requireCachedLoginSession(backendUrl);
    const user = login.user;
    console.log(`account: ${user.account ?? account}`);
    console.log(`displayName: ${user.displayName ?? user.name ?? '-'}`);
    console.log(`role: ${user.role ?? '-'}`);
    console.log(`permissions: ${user.permissions && user.permissions.length > 0 ? user.permissions.join(', ') : '-'}`);
}
function asProductLine(value) {
    if (!isJson(value))
        return null;
    const id = safeString(value.id);
    const name = safeString(value.name);
    if (!id || !name)
        return null;
    return {
        id,
        uuid: safeString(value.uuid),
        name,
        summary: safeString(value.summary),
        status: safeString(value.status),
    };
}
function asProjectModule(value) {
    if (!isJson(value))
        return null;
    const id = safeString(value.id);
    const name = safeString(value.name);
    if (!id || !name)
        return null;
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
function asProductDetail(value) {
    if (!isJson(value))
        return null;
    const product = asProductLine(value.product);
    if (!product)
        return null;
    const rawModules = Array.isArray(value.modules) ? value.modules : [];
    return {
        product,
        modules: rawModules.map(asProjectModule).filter((module) => Boolean(module)),
    };
}
function isHiddenCatalogRecord(record) {
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
function visibleProductDetail(entry) {
    if (isHiddenCatalogRecord(entry.product))
        return null;
    return {
        product: entry.product,
        modules: entry.modules.filter((module) => !isHiddenCatalogRecord(module)),
    };
}
async function fetchOrbitJson(backendUrl, routePath, token) {
    const url = `${normalizeBackendUrl(backendUrl)}${routePath}`;
    let response;
    try {
        response = await fetch(url, {
            headers: token ? { authorization: `Bearer ${token}` } : undefined,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot reach AxisNode backend at ${url}: ${message}`);
    }
    if (!response.ok) {
        if (response.status === 401)
            throw new OrbitCliError(loginRequiredMessage(backendUrl));
        if (response.status === 403)
            throw new OrbitCliError(insufficientPermissionMessage(backendUrl));
        throw new OrbitHttpError(response.status, `AxisNode backend returned HTTP ${response.status} for ${url}`);
    }
    try {
        return await response.json();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`AxisNode backend returned invalid JSON for ${url}: ${message}`);
    }
}
async function postOrbitJson(backendUrl, routePath, body, token) {
    const url = `${normalizeBackendUrl(backendUrl)}${routePath}`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot reach AxisNode backend at ${url}: ${message}`);
    }
    if (!response.ok) {
        if (response.status === 401)
            throw new OrbitCliError(loginRequiredMessage(backendUrl));
        if (response.status === 403)
            throw new OrbitCliError(insufficientPermissionMessage(backendUrl));
        throw new OrbitHttpError(response.status, `AxisNode backend returned HTTP ${response.status} for ${url}`);
    }
    try {
        return await response.json();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`AxisNode backend returned invalid JSON for ${url}: ${message}`);
    }
}
function pageArg() {
    const value = Number.parseInt(getArg('--page') ?? '1', 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
}
function pageSizeArg() {
    const value = Number.parseInt(getArg('--page-size') ?? '10', 10);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 10;
}
function extractId(payload) {
    if (!isJson(payload))
        return null;
    return safeString(payload.id)
        ?? safeString(payload.uuid)
        ?? safeString(payload.documentId)
        ?? safeString(payload.requirementId)
        ?? (isJson(payload.document) ? extractId(payload.document) : null)
        ?? (isJson(payload.data) ? extractId(payload.data) : null);
}
function extractUrl(payload) {
    if (!isJson(payload))
        return null;
    return safeString(payload.url)
        ?? safeString(payload.webUrl)
        ?? safeString(payload.href)
        ?? (isJson(payload.document) ? extractUrl(payload.document) : null)
        ?? (isJson(payload.data) ? extractUrl(payload.data) : null);
}
function extractItemsCount(payload) {
    if (!isJson(payload))
        return 0;
    if (Array.isArray(payload.items))
        return payload.items.length;
    if (Array.isArray(payload.workItems))
        return payload.workItems.length;
    if (isJson(payload.document))
        return extractItemsCount(payload.document);
    if (isJson(payload.data))
        return extractItemsCount(payload.data);
    return 0;
}
function projectApiId(binding) {
    return safeString(binding.projectId) ?? safeString(binding.projectUuid);
}
async function tokenForBinding(binding) {
    if (!binding)
        return null;
    const direct = safeString(binding.token);
    if (direct)
        return direct;
    const cached = await cachedLoginSession(binding.backendUrl);
    if (cached?.token)
        return cached.token;
    const config = await readGlobalOrbitConfig();
    return safeString(config.token);
}
async function loginOrbitHub(backendUrl, account, password) {
    const payload = await postOrbitJson(backendUrl, '/api/login', { account, password });
    const session = asLoginSession(payload, account);
    if (!session) {
        throw new Error('AxisNode backend response for /api/login did not include token/key/user data');
    }
    return session;
}
async function fetchCurrentUser(backendUrl, token) {
    const payload = await fetchOrbitJson(backendUrl, '/api/me', token);
    const rawUser = isJson(payload) && isJson(payload.user) ? payload.user : payload;
    const user = asOrbitUser(rawUser, '', isJson(payload) ? asPermissionList(payload.permissions) : []);
    if (!user.account) {
        throw new Error('AxisNode backend response for /api/me did not include user.account');
    }
    return user;
}
async function fetchProductLines(backendUrl, token, options = {}) {
    const payload = await fetchOrbitJson(backendUrl, '/api/products', token);
    if (!isJson(payload) || !Array.isArray(payload.products)) {
        throw new Error('AxisNode backend response for /api/products did not include a products array');
    }
    const products = payload.products
        .map(asProductDetail)
        .filter((entry) => Boolean(entry))
        .map(visibleProductDetail)
        .filter((entry) => Boolean(entry));
    if (products.length === 0) {
        if (options.allowEmpty)
            return [];
        const account = options.account ? ` for account "${options.account}"` : ' for this account';
        throw new Error(`No accessible product lines${account} at ${normalizeBackendUrl(backendUrl)}. Verify this account has product/project access for this backend.`);
    }
    return products;
}
async function fetchProductDetail(backendUrl, productLineId, token, options = {}) {
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
function describeProductLine(product) {
    const parts = [product.name];
    if (product.status)
        parts.push(`[${product.status}]`);
    if (product.summary)
        parts.push(`- ${product.summary}`);
    return parts.join(' ');
}
function describeProject(module) {
    const parts = [module.name];
    if (module.status)
        parts.push(`[${module.status}]`);
    const repo = repositoryAddress(module);
    if (repo)
        parts.push(`- ${repo}`);
    return parts.join(' ');
}
function repositoryAddress(module) {
    return module.repositoryAddress
        ?? module.repositoryUrl
        ?? module.gitUrl
        ?? module.remoteUrl
        ?? module.githubRepo
        ?? module.sourceRepo
        ?? module.repoPath
        ?? null;
}
function explicitCloneAddress(module) {
    return module.repositoryAddress
        ?? module.repositoryUrl
        ?? module.gitUrl
        ?? module.remoteUrl
        ?? module.githubRepo
        ?? module.sourceRepo
        ?? null;
}
export async function readHiddenLine(prompt, input = process.stdin, output = process.stdout) {
    const setRawMode = input.setRawMode?.bind(input);
    const wasRaw = input.isRaw;
    let answer = '';
    output.write(prompt);
    input.resume();
    setRawMode?.(true);
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            input.off('data', onData);
            setRawMode?.(wasRaw);
            input.pause();
        };
        const finish = () => {
            cleanup();
            output.write('\n');
            resolve(answer);
        };
        const interrupt = () => {
            cleanup();
            output.write('\n');
            reject(new Error('Interrupted'));
        };
        const onData = (chunk) => {
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
async function createPromptSession() {
    if (process.stdin.isTTY) {
        return {
            async question(question, options) {
                if (options?.hidden)
                    return readHiddenLine(question);
                const prompt = createInterface({ input: process.stdin, output: process.stdout });
                try {
                    return await prompt.question(question);
                }
                finally {
                    prompt.close();
                }
            },
            close() { },
        };
    }
    let input = '';
    for await (const chunk of process.stdin) {
        input += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
    const answers = input.split(/\r?\n/);
    return {
        async question(prompt, options) {
            process.stdout.write(prompt);
            const answer = answers.shift();
            if (answer === undefined) {
                throw new Error('No input received for interactive project bind selection');
            }
            process.stdout.write(options?.hidden ? '\n' : `${answer}\n`);
            return answer;
        },
        close() { },
    };
}
async function promptSelect(prompt, title, items, describe) {
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
async function promptProjectOrSkip(prompt, title, projects) {
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
async function writeProjectBinding(repoPath, binding) {
    ensureDir(axisDir(repoPath));
    ensureDir(orbitDir(repoPath));
    const content = `${JSON.stringify(binding, null, 2)}\n`;
    await writeFile(axisProjectConfigPath(repoPath), content, 'utf8');
    await writeFile(legacyProjectConfigPath(repoPath), content, 'utf8');
    const globalValues = {
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
    if (binding.mcpUrl)
        globalValues.mcpUrl = binding.mcpUrl;
    await writeGlobalOrbitConfig(globalValues);
}
async function promptProjectSelection(prompt, backendUrl, token) {
    const productLines = await fetchProductLines(backendUrl, token);
    const selectedProduct = await promptSelect(prompt, 'Select product line:', productLines.map((entry) => entry.product), describeProductLine);
    const productDetail = await fetchProductDetail(backendUrl, selectedProduct.id, token);
    const selectedProject = await promptSelect(prompt, 'Select project:', productDetail.modules, describeProject);
    return { productDetail, selectedProject };
}
function buildProjectBinding(values) {
    if (!values.productDetail.product.uuid) {
        throw new Error(`Selected product line "${values.productDetail.product.name}" does not include product.uuid from the backend`);
    }
    if (!values.selectedProject.uuid) {
        throw new Error(`Selected project "${values.selectedProject.name}" does not include module.uuid from the backend`);
    }
    const binding = {
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
    if (values.mcpUrl)
        binding.mcpUrl = values.mcpUrl;
    if (values.selectedProject.repoPath)
        binding.repoPath = values.selectedProject.repoPath;
    if (values.selectedProject.githubRepo)
        binding.githubRepo = values.selectedProject.githubRepo;
    if (values.selectedProject.sourceRepo)
        binding.sourceRepo = values.selectedProject.sourceRepo;
    if (values.selectedProject.repositoryUrl)
        binding.repositoryUrl = values.selectedProject.repositoryUrl;
    if (values.selectedProject.gitUrl)
        binding.gitUrl = values.selectedProject.gitUrl;
    if (values.selectedProject.remoteUrl)
        binding.remoteUrl = values.selectedProject.remoteUrl;
    return binding;
}
function parseAgentArg(value) {
    if (!value)
        return null;
    if (value === 'codex' || value === 'claude-code' || value === 'none')
        return value;
    if (value === 'cc')
        return 'claude-code';
    throw new Error('--agent must be one of: codex, claude-code, none');
}
function buildProductLineBinding(values) {
    if (!values.productDetail.product.uuid) {
        throw new Error(`Selected product line "${values.productDetail.product.name}" does not include product.uuid from the backend`);
    }
    const binding = {
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
    if (values.mcpUrl)
        binding.mcpUrl = values.mcpUrl;
    return binding;
}
async function writeProductLineBinding(rootPath, binding) {
    ensureDir(axisDir(rootPath));
    ensureDir(orbitDir(rootPath));
    const content = `${JSON.stringify(binding, null, 2)}\n`;
    await writeFile(axisProductLineConfigPath(rootPath), content, 'utf8');
    await writeFile(legacyProductLineConfigPath(rootPath), content, 'utf8');
    const globalValues = {
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
    if (binding.mcpUrl)
        globalValues.mcpUrl = binding.mcpUrl;
    await writeGlobalOrbitConfig(globalValues);
}
async function detectProjectMarkers(candidatePath) {
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
    const found = [];
    for (const marker of markers) {
        if (existsSync(path.join(candidatePath, marker))) {
            found.push(marker);
        }
    }
    return found;
}
async function scanProjectCandidates(rootPath) {
    const excluded = new Set(['.git', 'node_modules', 'dist', 'build', 'cache']);
    const entries = await readdir(rootPath, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (entry.name.startsWith('.') || excluded.has(entry.name))
            continue;
        const candidatePath = path.join(rootPath, entry.name);
        candidates.push({
            name: entry.name,
            path: candidatePath,
            markers: await detectProjectMarkers(candidatePath),
        });
    }
    return candidates.sort((left, right) => left.name.localeCompare(right.name));
}
function describeCandidate(candidate) {
    return `${candidate.name} (${candidate.markers.length > 0 ? candidate.markers.join(', ') : 'plain folder'})`;
}
async function bindProjectInteractively(repoPath, backendUrl, mcpUrl, owner) {
    const prompt = await createPromptSession();
    let productDetail;
    let selectedProject;
    const { login, account } = await requireCachedLoginSession(backendUrl, mcpUrl);
    try {
        ({ productDetail, selectedProject } = await promptProjectSelection(prompt, backendUrl, login.token));
    }
    finally {
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
async function packagedSkillNames() {
    const dir = bundledSkillsDir();
    const entries = await readdir(dir, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (existsSync(bundledOrbitSkillPath(entry.name))) {
            names.push(entry.name);
        }
    }
    return names.sort();
}
async function copySkillTextIfAllowed(sourceText, target, force) {
    ensureDir(path.dirname(target));
    if (existsSync(target)) {
        const targetText = await readFile(target, 'utf8');
        if (targetText === sourceText)
            return 'identical';
        if (!force) {
            throw new Error(`Refusing to overwrite modified skill at ${target}. Re-run with --force to replace it.`);
        }
    }
    await writeFile(target, sourceText, 'utf8');
    return 'copied';
}
async function copySkillIfAllowed(source, target, force) {
    ensureDir(path.dirname(target));
    const sourceText = await readFile(source, 'utf8');
    if (existsSync(target)) {
        const targetText = await readFile(target, 'utf8');
        if (targetText === sourceText)
            return 'identical';
        if (!force) {
            throw new Error(`Refusing to overwrite modified skill at ${target}. Re-run with --force to replace it.`);
        }
    }
    await copyFile(source, target);
    return 'copied';
}
async function gstackOfficeHoursDependencyText() {
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
function installAgentsForChoice(agent) {
    if (agent === 'all')
        return ['codex', 'claude-code'];
    return [agent];
}
function parseInstallAgentArg(value) {
    if (!value || value === 'all')
        return 'all';
    if (value === 'codex')
        return 'codex';
    if (value === 'claude-code' || value === 'cc')
        return 'claude-code';
    throw new Error('--agent must be one of: codex, claude-code, cc, all');
}
async function installPackagedSkills(agent, force) {
    const skillNames = await packagedSkillNames();
    if (skillNames.length === 0) {
        throw new Error(`No packaged skills found under ${bundledSkillsDir()}`);
    }
    const agents = agent === 'none' ? [] : installAgentsForChoice(agent);
    const installed = [];
    for (const skillName of skillNames) {
        const source = bundledOrbitSkillPath(skillName);
        const stableTarget = stableOrbitSkillPath(skillName);
        installed.push({ skill: skillName, target: stableTarget, status: await copySkillIfAllowed(source, stableTarget, force) });
        for (const selectedAgent of agents) {
            const target = agentSkillPath(selectedAgent, skillName);
            if (!target)
                continue;
            installed.push({ skill: skillName, target, status: await copySkillIfAllowed(source, target, force) });
        }
    }
    const dependencyText = await gstackOfficeHoursDependencyText();
    for (const selectedAgent of agents) {
        const target = agentSkillPath(selectedAgent, 'gstack-office-hours');
        if (!target)
            continue;
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
async function installSkillsCommand() {
    const agent = parseInstallAgentArg(getArg('--agent'));
    const install = await installPackagedSkills(agent, hasFlag('--force'));
    console.log(JSON.stringify({ ok: true, agent, installed: install.installed }, null, 2));
}
async function promptAgent(prompt) {
    const choices = [
        { id: 'codex', label: 'Codex' },
        { id: 'claude-code', label: 'Claude Code/cc' },
        { id: 'none', label: 'None' },
    ];
    const selected = await promptSelect(prompt, 'Select agent:', choices, (choice) => choice.label);
    return selected.id;
}
async function setupRepo() {
    const repoPath = resolveRepoArg();
    const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
    const selectedAgentArg = parseAgentArg(getArg('--agent'));
    const prompt = await createPromptSession();
    let selectedAgent;
    try {
        selectedAgent = selectedAgentArg ?? await promptAgent(prompt);
    }
    finally {
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
async function setupProductLineRoot() {
    const rootPath = resolveProductLineRootArg();
    const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
    const mcpUrl = resolveMcpUrl(getArg('--mcp-url'));
    const ownerArg = getArg('--owner');
    const selectedAgent = parseAgentArg(getArg('--agent'));
    let account = '';
    let login;
    let productDetail;
    const bound = [];
    const skipped = [];
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
            const selectedProject = await promptProjectOrSkip(prompt, `Bind ${describeCandidate(candidate)} as a project under ${productDetail.product.name}?`, productDetail.modules);
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
    }
    finally {
        prompt.close();
    }
    console.log('Summary:');
    console.log(`  root config: ${productLineConfigPath(rootPath)}`);
    console.log(`  bound: ${bound.length}`);
    bound.forEach((configPath) => console.log(`    ${configPath}`));
    console.log(`  skipped: ${skipped.length}`);
    skipped.forEach((folderPath) => console.log(`    ${folderPath}`));
}
async function bindProductLineRootWithSession(values) {
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
    const bound = [];
    const skipped = [];
    const candidates = await scanProjectCandidates(values.rootPath);
    for (const candidate of candidates) {
        const selectedProject = await promptProjectOrSkip(values.prompt, `Bind ${describeCandidate(candidate)} as a project under ${productDetail.product.name}?`, productDetail.modules);
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
async function bindTopLevel() {
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
        const target = await promptSelect(prompt, 'Bind target:', [
            { id: 'project', label: 'Single project repo' },
            { id: 'product-line', label: 'Product-line root' },
        ], (choice) => choice.label);
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
    }
    finally {
        prompt.close();
    }
}
function safeSlug(name, fallback = 'orbit-item') {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug || fallback;
}
async function directoryExists(dirPath) {
    try {
        return (await stat(dirPath)).isDirectory();
    }
    catch {
        return false;
    }
}
async function directoryIsEmpty(dirPath) {
    if (!await directoryExists(dirPath))
        return true;
    return (await readdir(dirPath)).length === 0;
}
async function isGitRepo(repoPath) {
    if (!await directoryExists(repoPath))
        return false;
    try {
        await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--is-inside-work-tree']);
        return true;
    }
    catch {
        return false;
    }
}
function cloneAddress(module) {
    return explicitCloneAddress(module);
}
function summarizeCommandError(error) {
    if (error instanceof Error && error.message.trim()) {
        return error.message.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).join(' ');
    }
    return String(error);
}
async function syncRepository(repoUrl, targetPath) {
    if (!await directoryExists(targetPath) || await directoryIsEmpty(targetPath)) {
        ensureDir(path.dirname(targetPath));
        try {
            await execFileAsync('git', ['clone', repoUrl, targetPath]);
            return { status: 'cloned' };
        }
        catch (error) {
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
async function selectProductLinesToPull(prompt, backendUrl, token, account) {
    const productLines = await fetchProductLines(backendUrl, token, { account });
    const allChoice = { id: 'all', label: 'All product lines', detail: null };
    const choices = [
        allChoice,
        ...productLines.map((detail) => ({ id: detail.product.id, label: describeProductLine(detail.product), detail })),
    ];
    const selected = await promptSelect(prompt, 'Pull product lines:', choices, (choice) => choice.label);
    if (selected.id === 'all') {
        const details = [];
        for (const entry of productLines) {
            try {
                details.push(await fetchProductDetail(backendUrl, entry.product.id, token, { allowEmptyProjects: true }));
            }
            catch (error) {
                if (error instanceof OrbitCliError)
                    throw error;
                details.push(entry);
            }
        }
        return details;
    }
    return [await fetchProductDetail(backendUrl, selected.id, token, { allowEmptyProjects: true })];
}
function workspaceProductPath(workspaceRoot, product) {
    return path.join(workspaceRoot, safeSlug(product.name, 'product-line'));
}
function workspaceProjectPath(workspaceRoot, product, project) {
    return path.join(workspaceProductPath(workspaceRoot, product), safeSlug(project.name, 'project'));
}
function workspaceProjectFilter() {
    return {
        id: getArg('--project-id'),
        uuid: getArg('--project-uuid'),
    };
}
function workspaceProjectMatchesFilter(project, filter) {
    if (filter.id && filter.id !== project.id && filter.id !== project.projectId)
        return false;
    if (filter.uuid && filter.uuid !== project.uuid)
        return false;
    return true;
}
async function fetchWorkspaceProductDetails(backendUrl, token, account) {
    const warnings = [];
    const productLines = await fetchProductLines(backendUrl, token, { account, allowEmpty: true });
    const details = [];
    for (const entry of productLines) {
        try {
            details.push(await fetchProductDetail(backendUrl, entry.product.id, token, { allowEmptyProjects: true }));
        }
        catch (error) {
            if (error instanceof OrbitCliError)
                throw error;
            warnings.push(`Product line ${entry.product.name} detail fetch failed; using catalog summary. ${error instanceof Error ? error.message : String(error)}`);
            details.push(entry);
        }
    }
    return { details, warnings };
}
function safeWorkspaceProject(project) {
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
async function writeAxisWorkspaceCatalog(workspace) {
    ensureDir(path.dirname(workspace.catalogPath));
    const payload = {
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
async function syncAxisWorkspaceProject(values) {
    const repoPath = workspaceProjectPath(values.workspaceRoot, values.productDetail.product, values.project);
    const repoUrl = cloneAddress(values.project);
    let materialized = false;
    let syncStatus = repoUrl ? 'not-synced' : 'metadata-only';
    let warning = null;
    if (repoUrl) {
        try {
            const sync = await syncRepository(repoUrl, repoPath);
            syncStatus = sync.status;
            materialized = sync.status === 'cloned' || sync.status === 'pulled';
            warning = sync.error ? `Repository sync failed for ${values.project.name}: ${sync.error}` : null;
        }
        catch (error) {
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
async function resolveAxisWorkspaceForWorker() {
    const config = await readGlobalOrbitConfig();
    const workspaceRoot = axisHomeDir();
    const backendUrl = getArg('--backend-url') ?? safeString(config.backendUrl) ?? defaultBackendUrl();
    const mcpUrl = resolveMcpUrl(getArg('--mcp-url'), safeString(config.mcpUrl));
    const { login, account } = await requireCachedLoginSession(backendUrl, mcpUrl);
    const owner = login.user.account ?? account;
    const warnings = [];
    const { details, warnings: detailWarnings } = await fetchWorkspaceProductDetails(backendUrl, login.token, owner);
    warnings.push(...detailWarnings);
    ensureDir(workspaceRoot);
    const filter = workspaceProjectFilter();
    const projects = [];
    for (const productDetail of details) {
        const productPath = workspaceProductPath(workspaceRoot, productDetail.product);
        let productHasProjects = false;
        for (const project of productDetail.modules) {
            if (!workspaceProjectMatchesFilter(project, filter))
                continue;
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
                if (workspaceProject.warning)
                    warnings.push(workspaceProject.warning);
            }
            catch (error) {
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
    if ((filter.id || filter.uuid) && projects.length === 0) {
        warnings.push(`No accessible AxisNode project matched ${filter.id ? `--project-id ${filter.id}` : ''}${filter.id && filter.uuid ? ' and ' : ''}${filter.uuid ? `--project-uuid ${filter.uuid}` : ''}.`);
    }
    else if (projects.length === 0) {
        warnings.push('No accessible AxisNode projects found in the user workspace.');
    }
    const workspace = {
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
async function pullCloudStructure() {
    const config = await readGlobalOrbitConfig();
    const rootPath = path.resolve(getArg('--root') ?? axisHomeDir());
    const backendUrl = getArg('--backend-url') ?? safeString(config.backendUrl) ?? defaultBackendUrl();
    const mcpUrl = resolveMcpUrl(getArg('--mcp-url'), safeString(config.mcpUrl));
    const productConfigs = [];
    const projectConfigs = [];
    const gitResults = [];
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
    }
    finally {
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
async function bindProject() {
    const repoPath = resolveRepoArg();
    const existing = await readProjectBinding(repoPath);
    const backendUrl = getArg('--backend-url') ?? existing?.backendUrl ?? defaultBackendUrl();
    const mcpUrl = resolveMcpUrl(getArg('--mcp-url'), existing?.mcpUrl);
    const owner = getArg('--owner') ?? existing?.owner ?? process.env.USER ?? null;
    if (hasFlag('--interactive')) {
        try {
            await bindProjectInteractively(repoPath, backendUrl, mcpUrl, owner);
        }
        catch (error) {
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
    const binding = {
        backendUrl,
        productLineUuid,
        projectUuid,
        owner,
        repo: repoPath,
        updatedAt: new Date().toISOString(),
    };
    if (mcpUrl)
        binding.mcpUrl = mcpUrl;
    if (productLineId)
        binding.productLineId = productLineId;
    if (projectId)
        binding.projectId = projectId;
    await writeProjectBinding(repoPath, binding);
    console.log(JSON.stringify({ ok: true, config: axisProjectConfigPath(repoPath), legacyConfig: legacyProjectConfigPath(repoPath), binding }, null, 2));
}
async function logoutOrbit() {
    const backendUrl = getArg('--backend-url');
    const config = await readGlobalOrbitConfig();
    const sessions = globalSessions(config);
    let cleared;
    if (backendUrl) {
        const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
        cleared = Object.prototype.hasOwnProperty.call(sessions, normalizedBackendUrl) ? [normalizedBackendUrl] : [];
        delete sessions[normalizedBackendUrl];
        config.sessions = sessions;
    }
    else {
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
async function showProject() {
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
    if (binding.mcpUrl)
        console.log(`mcpUrl: ${binding.mcpUrl}`);
    console.log(`productLineUuid: ${binding.productLineUuid ?? '-'}`);
    console.log(`projectUuid: ${binding.projectUuid ?? '-'}`);
    if (binding.productLineId || binding.projectId) {
        console.log(`productLineId: ${binding.productLineId ?? '-'}`);
        console.log(`projectId: ${binding.projectId ?? '-'}`);
    }
    console.log(`owner: ${binding.owner ?? '-'}`);
    console.log(`updatedAt: ${binding.updatedAt}`);
}
function safeProjectBinding(binding, repoPath) {
    if (!binding)
        return null;
    const safe = {};
    for (const key of SAFE_BINDING_KEYS) {
        const value = binding[key];
        if (value !== undefined && value !== null)
            safe[key] = value;
    }
    if (!safe.repo)
        safe.repo = repoPath;
    return safe;
}
function poolMethodologyMap() {
    return { ...POOL_METHODOLOGY_BY_KIND };
}
function gstackSkillCheckoutPath(skillName) {
    return path.join(gstackHomeDir(), skillName.replace(/^gstack-/, ''), 'SKILL.md');
}
function gstackSkillCandidatePaths(skillName) {
    return [
        hermesSkillPath(skillName),
        path.join(gstackHomeDir(), '.hermes', 'skills', skillName, 'SKILL.md'),
        gstackSkillCheckoutPath(skillName),
    ];
}
function gstackSkillExists(skillName) {
    return gstackSkillCandidatePaths(skillName).some((candidate) => existsSync(candidate));
}
function uniqueMethodologyCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
        const key = path.resolve(candidate.path);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function ideaMethodologyCandidates() {
    return uniqueMethodologyCandidates([
        { skill: 'gstack-plan-ceo-review', source: 'hermes', path: hermesSkillPath('gstack-plan-ceo-review') },
        { skill: 'plan-ceo-review', source: 'hermes', path: hermesSkillPath('plan-ceo-review') },
        { skill: 'gstack-plan-ceo-review', source: 'gstack-checkout-hermes', path: path.join(gstackHomeDir(), '.hermes', 'skills', 'gstack-plan-ceo-review', 'SKILL.md') },
        { skill: 'plan-ceo-review', source: 'gstack-checkout-hermes', path: path.join(gstackHomeDir(), '.hermes', 'skills', 'plan-ceo-review', 'SKILL.md') },
        { skill: 'gstack-plan-ceo-review', source: 'gstack-checkout', path: gstackSkillCheckoutPath('gstack-plan-ceo-review') },
    ]);
}
function existingIdeaMethodologyCandidate() {
    return ideaMethodologyCandidates().find((entry) => existsSync(entry.path)) ?? null;
}
function superpowersSkillDir(methodologySkill) {
    if (methodologySkill === 'superpowers:brainstorm')
        return 'brainstorming';
    if (methodologySkill === 'superpowers:systematic-debugging')
        return 'systematic-debugging';
    return null;
}
async function superpowersMethodologyCandidates(methodologySkill) {
    const skillDir = superpowersSkillDir(methodologySkill);
    if (!skillDir)
        return [];
    const directSources = [
        { source: 'codex-superpowers', root: codexSuperpowersSkillRoot() },
        process.env.AXIS_CODEX_SUPERPOWERS_SOURCE ? { source: 'codex-superpowers-env', root: path.resolve(process.env.AXIS_CODEX_SUPERPOWERS_SOURCE) } : null,
        { source: 'codex-superpowers-cache', root: path.join(homeDir(), '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills') },
        { source: 'codex-superpowers-cache', root: path.join(homeDir(), '.codex', 'plugins', 'superpowers', 'skills') },
    ].filter((entry) => Boolean(entry));
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
async function methodologyCandidatesForPool(pool, methodologySkill) {
    if (pool.kind === 'idea')
        return ideaMethodologyCandidates();
    if (methodologySkill.startsWith('superpowers:'))
        return superpowersMethodologyCandidates(methodologySkill);
    return [{ skill: methodologySkill, source: 'hermes', path: hermesSkillPath(methodologySkill) }];
}
function resolvePoolMethodologySkill(pool) {
    if (pool.kind !== 'idea')
        return POOL_METHODOLOGY_BY_KIND[pool.kind];
    const candidate = existingIdeaMethodologyCandidate();
    if (candidate)
        return candidate.skill;
    return POOL_METHODOLOGY_BY_KIND.idea;
}
function redactSensitiveSkillContent(content) {
    return content
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted private key]')
        .replace(/\b(token|password|passwd|secret|session|api[_-]?key|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}["']?/gi, '$1: [redacted by axis-tools]');
}
async function readMethodologyCandidate(candidate) {
    if (!existsSync(candidate.path))
        return null;
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
    }
    catch (error) {
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
async function resolvePoolMethodologyInjection(pool) {
    const methodologySkill = resolvePoolMethodologySkill(pool);
    const candidates = await methodologyCandidatesForPool(pool, methodologySkill);
    const checkedPaths = candidates.map((candidate) => candidate.path);
    let firstReadFailure = null;
    for (const candidate of candidates) {
        const injection = await readMethodologyCandidate(candidate);
        if (!injection)
            continue;
        if (injection.injected)
            return injection;
        firstReadFailure ??= injection;
    }
    if (firstReadFailure)
        return firstReadFailure;
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
function localPoolTemplate(pool, source = 'local-fallback') {
    const sectionsByKind = {
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
function compactDocument(document) {
    const source = isJson(document.source) ? document.source : {};
    return {
        id: safeString(document.id),
        title: safeString(document.title) ?? safeString(document.name),
        status: safeString(document.status),
        kind: safeString(source.type) ?? safeString(source.kind) ?? safeString(document.kind),
        summary: safeString(document.summary),
    };
}
function compactWorkItem(item) {
    return {
        id: safeString(item.id),
        title: safeString(item.title) ?? safeString(item.name),
        type: safeString(item.type),
        pool: safeString(item.pool) ?? safeString(item.category),
        status: safeString(item.status),
        sourceArtifactId: safeString(item.sourceArtifactId),
    };
}
async function fetchPoolTemplateContext(pool, repoPath) {
    const binding = await readProjectBinding(repoPath);
    const projectContext = {
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
    let warning = null;
    let template = localPoolTemplate(pool);
    try {
        const payload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/pool-templates?kind=${encodeURIComponent(pool.kind)}`, token);
        template = isJson(payload) ? { source: 'hub', ...payload } : localPoolTemplate(pool);
        if (isJson(payload) && isJson(payload.project))
            projectContext.project = payload.project;
    }
    catch (error) {
        warning = `AxisNode template fetch failed; using local fallback template. ${error instanceof Error ? error.message : String(error)}`;
    }
    try {
        const docsPayload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/documents?page=1&pageSize=10`, token);
        projectContext.documents = documentArray(docsPayload).slice(0, 10).map(compactDocument);
    }
    catch (error) {
        warning = warning ?? `AxisNode project documents fetch failed; context is partial. ${error instanceof Error ? error.message : String(error)}`;
    }
    try {
        const itemsPayload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/work-items?page=1&pageSize=10`, token);
        projectContext.workItems = documentArray(itemsPayload).slice(0, 10).map(compactWorkItem);
    }
    catch (error) {
        warning = warning ?? `AxisNode project workItems fetch failed; context is partial. ${error instanceof Error ? error.message : String(error)}`;
    }
    return { template, projectContext, warning };
}
async function preparePool(pool) {
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
function firstMarkdownTitle(markdown) {
    const line = markdown.split(/\r?\n/).find((entry) => /^#\s+/.test(entry.trim()));
    return line ? line.replace(/^#\s+/, '').trim() || null : null;
}
function localDateStamp(date = new Date()) {
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}
function poolArtifactFromMarkdown(pool, markdown) {
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
function poolArtifactFromText(pool, text) {
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
function normalizePoolArtifact(pool, input) {
    const trimmed = input.trim();
    if (!trimmed)
        return poolArtifactFromText(pool, '');
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
    if (/^#\s+/m.test(trimmed))
        return poolArtifactFromMarkdown(pool, input);
    return poolArtifactFromText(pool, input);
}
async function readStdinText() {
    let input = '';
    for await (const chunk of process.stdin) {
        input += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
    return input;
}
async function readPoolInput(args) {
    const fromFile = getArg('--from') ?? getArg('--file');
    if (fromFile)
        return readFile(path.resolve(fromFile), 'utf8');
    if (hasFlag('--stdin'))
        return readStdinText();
    return collectFreeText(args);
}
function collectFreeText(args) {
    const flagsWithValue = new Set(['--repo', '--from', '--file', '--agent', '--page', '--page-size', '--delete']);
    const text = [];
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (flagsWithValue.has(arg)) {
            index++;
            continue;
        }
        if (arg === '--save' || arg === '--local' || arg === '--save-local' || arg === '--no-doc' || arg === '--dry-run' || arg === '--stdin' || arg === '--json' || arg === '--list' || arg === '--yes' || arg === '--help' || arg === '-h')
            continue;
        if (arg.startsWith('--'))
            continue;
        text.push(arg);
    }
    return text.join(' ').trim();
}
function yamlScalar(value) {
    if (value && /^[A-Za-z0-9_./:@ -]+$/.test(value))
        return value;
    return JSON.stringify(value);
}
async function savePoolArtifact(pool, artifact, repoPath, source) {
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
function shouldUseLocalOnly() {
    return hasFlag('--local') || hasFlag('--save-local') || hasFlag('--save');
}
function shouldSkipHubCache() {
    return hasFlag('--no-doc');
}
function buildPoolPayload(pool, artifact, repoPath) {
    return {
        kind: artifact.kind,
        title: artifact.title,
        summary: artifact.summary,
        status: artifact.status,
        markdown: artifact.markdown,
        sections: artifact.sections,
        workItems: artifact.workItems,
        sourceId: pool.command,
        source: 'CLI',
        artifact,
        repo: repoPath,
    };
}
function poolSeedTitle(pool, seed) {
    return seed.trim().split(/\r?\n/)[0]?.trim() || `${pool.displayName} ${localDateStamp()}`;
}
function buildPoolSeedPayload(pool, seed, repoPath) {
    const trimmed = seed.trim();
    const title = poolSeedTitle(pool, trimmed);
    return {
        kind: pool.kind,
        title,
        seed: trimmed,
        summary: trimmed,
        status: 'pending-confirmation',
        source: 'CLI',
        sourceId: pool.command,
        repo: repoPath,
    };
}
function canPromptForPoolSeedTarget() {
    return process.stdin.isTTY === true && !hasFlag('--json');
}
function shouldScanPoolSeedDir(entryName) {
    if (POOL_SEED_DISCOVERY_EXCLUDED_DIRS.has(entryName))
        return false;
    if (entryName.startsWith('.') || entryName === '')
        return false;
    return true;
}
function bindingDisplayName(binding) {
    const product = binding.productLineName ?? binding.productLineUuid ?? binding.productLineId ?? 'Unknown product line';
    const project = binding.projectName ?? binding.projectUuid ?? binding.projectId ?? 'Unknown project';
    return `${product} / ${project}`;
}
function productLineDisplayName(binding) {
    return binding.productLineName ?? binding.productLineUuid ?? binding.productLineId ?? 'Unknown product line';
}
function describeDiscoveredProject(candidate) {
    return `${bindingDisplayName(candidate.binding)} - ${candidate.repoPath}`;
}
function describeDiscoveredProductLine(candidate) {
    return `${productLineDisplayName(candidate.binding)} - ${candidate.rootPath}`;
}
function discoveryList(items, describe, limit = 8) {
    const shown = items.slice(0, limit).map(describe);
    const hidden = items.length - shown.length;
    return hidden > 0 ? `${shown.join('; ')}; and ${hidden} more` : shown.join('; ');
}
async function discoverPoolSeedBindings(rootPath) {
    const projects = [];
    const productLines = [];
    const seenProjectConfigs = new Set();
    const seenProductLineConfigs = new Set();
    const queue = [{ dirPath: rootPath, depth: 0 }];
    let scannedDirs = 0;
    let capped = false;
    while (queue.length > 0) {
        if (scannedDirs >= POOL_SEED_DISCOVERY_MAX_DIRS) {
            capped = true;
            break;
        }
        const current = queue.shift();
        if (!current)
            break;
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
        if (depth >= POOL_SEED_DISCOVERY_MAX_DEPTH)
            continue;
        let entries;
        try {
            entries = await readdir(dirPath, { withFileTypes: true });
        }
        catch {
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
function multiplePoolSeedTargetsWarning(repoPath, discovery) {
    const capText = discovery.capped ? ` Discovery was capped after scanning ${discovery.scannedDirs} directories.` : '';
    return [
        `Multiple AxisNode project bindings found under ${repoPath}; seed saved locally instead.`,
        'Run inside a specific project or pass --repo <project-path>.',
        `Candidates: ${discoveryList(discovery.projects, describeDiscoveredProject)}.`,
        capText.trim(),
    ].filter(Boolean).join(' ');
}
function cappedPoolSeedDiscoveryWarning(repoPath, discovery) {
    const candidateText = discovery.projects.length > 0
        ? ` Discovered candidates: ${discoveryList(discovery.projects, describeDiscoveredProject)}.`
        : '';
    return `AxisNode project binding discovery under ${repoPath} was capped after scanning ${discovery.scannedDirs} directories; seed saved locally instead. Run inside a specific project or pass --repo <project-path>.${candidateText}`;
}
function productLineOnlyPoolSeedWarning(repoPath, discovery) {
    const productLines = discoveryList(discovery.productLines, describeDiscoveredProductLine);
    const capText = discovery.capped ? ` Discovery was capped after scanning ${discovery.scannedDirs} directories.` : '';
    return [
        `AxisNode product-line binding found under ${repoPath}, but no project binding was discovered; seed saved locally instead.`,
        `Product lines: ${productLines}.`,
        'Run inside a project directory or pass --repo <project-path>.',
        capText.trim(),
    ].filter(Boolean).join(' ');
}
async function promptPoolSeedTarget(discovery) {
    const prompt = await createPromptSession();
    try {
        if (discovery.capped) {
            console.log(`AxisNode project discovery was capped after scanning ${discovery.scannedDirs} directories.`);
        }
        return await promptSelect(prompt, 'Select AxisNode project for this seed:', discovery.projects, describeDiscoveredProject);
    }
    finally {
        prompt.close();
    }
}
async function resolvePoolSeedTarget(repoPath) {
    const direct = await readProjectBinding(repoPath);
    if (direct)
        return { repoPath, binding: direct, warning: null };
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
function localPoolSeedDir(repoPath) {
    return path.join(repoPath, '.axis', 'pool-seeds');
}
async function savePoolSeed(pool, payload, repoPath) {
    const dir = localPoolSeedDir(repoPath);
    ensureDir(dir);
    const title = safeString(payload.title) ?? poolSeedTitle(pool, '');
    const filePath = path.join(dir, `${localDateStamp()}-${pool.pool}-${safeSlug(title, 'axis-seed')}.json`);
    await writeFile(filePath, `${JSON.stringify({ ...payload, savedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
    return filePath;
}
async function submitPoolSeedToHub(pool, binding, token, payload) {
    const projectId = projectApiId(binding);
    if (!projectId)
        throw new Error('project binding has no projectId/projectUuid');
    if (!token)
        throw new Error('project binding has no token and no cached login session');
    return postOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/pool-seeds`, payload, token);
}
function extractStatus(payload) {
    if (!isJson(payload))
        return null;
    return safeString(payload.status)
        ?? (isJson(payload.seed) ? extractStatus(payload.seed) : null)
        ?? (isJson(payload.data) ? extractStatus(payload.data) : null);
}
async function submitPoolSeed(pool, repoPath, seed) {
    const initialPayload = buildPoolSeedPayload(pool, seed, repoPath);
    const title = safeString(initialPayload.title) ?? poolSeedTitle(pool, seed);
    const summary = safeString(initialPayload.summary) ?? seed.trim();
    const status = safeString(initialPayload.status) ?? 'pending-confirmation';
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
        }
        catch (error) {
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
function printPoolSeed(result) {
    if (hasFlag('--json')) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`${result.kind}: ${result.title}`);
    console.log(`mode: ${result.mode}`);
    if (result.id)
        console.log(`id: ${result.id}`);
    console.log(`status: ${result.status}`);
    if (result.url)
        console.log(`url: ${result.url}`);
    if (result.savedPath)
        console.log(`savedPath: ${result.savedPath}`);
    if (result.warning)
        console.log(`warning: ${result.warning}`);
}
async function submitRequirementToHub(pool, binding, token, artifact, repoPath) {
    const projectId = projectApiId(binding);
    if (!projectId)
        throw new Error('project binding has no projectId/projectUuid');
    if (!token)
        throw new Error('project binding has no token and no cached login session');
    return postOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/requirements`, buildPoolPayload(pool, artifact, repoPath), token);
}
async function submitPoolDocumentToHub(pool, binding, token, artifact, repoPath) {
    const projectId = projectApiId(binding);
    if (!projectId)
        throw new Error('project binding has no projectId/projectUuid');
    if (!token)
        throw new Error('project binding has no token and no cached login session');
    return postOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/pool-documents`, buildPoolPayload(pool, artifact, repoPath), token);
}
async function submitPoolArtifact(pool, repoPath, artifact, source) {
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
            let response;
            let warning = null;
            try {
                response = await submitPoolDocumentToHub(pool, binding, token, artifact, repoPath);
            }
            catch (error) {
                if (pool.kind === 'requirement' && error instanceof OrbitHttpError && error.status === 404) {
                    response = await submitRequirementToHub(pool, binding, token, artifact, repoPath);
                    warning = 'Hub /pool-documents endpoint returned 404; submitted requirement through legacy /requirements endpoint.';
                }
                else {
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
        }
        catch (error) {
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
function printPoolSubmit(result) {
    if (hasFlag('--json')) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`${result.artifact.kind}: ${result.artifact.title}`);
    console.log(`mode: ${result.mode}`);
    if (result.id)
        console.log(`id: ${result.id}`);
    if (result.url)
        console.log(`url: ${result.url}`);
    if (typeof result.itemsCount === 'number')
        console.log(`items: ${result.itemsCount}`);
    if (result.savedPath)
        console.log(`savedPath: ${result.savedPath}`);
    if (result.warning)
        console.log(`warning: ${result.warning}`);
}
async function importPoolArtifact(pool, args, source = `${pool.command} import`) {
    const repoPath = resolveRepoArg();
    const input = await readPoolInput(args);
    const artifact = normalizePoolArtifact(pool, input);
    printPoolSubmit(await submitPoolArtifact(pool, repoPath, artifact, source));
}
function parsePoolAgentArg(value) {
    if (!value)
        return null;
    if (value === 'current' || value === 'codex' || value === 'claude-code' || value === 'none')
        return value;
    if (value === 'cc')
        return 'claude-code';
    throw new Error('--agent must be one of: codex, claude-code, current, none');
}
async function commandAvailable(command) {
    try {
        await execFileAsync('sh', ['-c', `command -v ${command}`]);
        return true;
    }
    catch {
        return false;
    }
}
async function runPoolAgent(agent, repoPath, prompt, options = {}) {
    const command = agent === 'codex' ? 'codex' : 'claude';
    if (!await commandAvailable(command)) {
        throw new Error(`agent not found: ${command}`);
    }
    const args = agent === 'codex' ? ['exec', prompt] : ['-p', prompt];
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
            if (!hasFlag('--json'))
                process.stdout.write(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
            if (!hasFlag('--json')) {
                process.stderr.write(chunk);
            }
            else if (chunk.trim()) {
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
async function runPool(pool, args) {
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
function poolDocumentMatches(pool, document) {
    const source = isJson(document.source) ? document.source : {};
    const sourceType = safeString(source.type) ?? safeString(document.sourceType);
    const kind = safeString(source.kind) ?? safeString(document.kind) ?? safeString(document.type);
    if (pool.kind === 'requirement') {
        return sourceType === 'requirement' || kind === 'requirement';
    }
    return sourceType === pool.kind || kind === pool.kind;
}
function asPoolListItem(document) {
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
function documentArray(payload) {
    if (Array.isArray(payload))
        return payload.filter(isJson);
    if (!isJson(payload))
        return [];
    for (const key of ['items', 'documents', 'data', 'rows', 'results']) {
        const value = payload[key];
        if (Array.isArray(value))
            return value.filter(isJson);
    }
    return [];
}
async function listLocalPoolItems(pool, repoPath) {
    const dir = path.join(repoPath, pool.defaultDir);
    let names;
    try {
        names = await readdir(dir);
    }
    catch {
        return [];
    }
    const items = [];
    for (const name of names.filter((entry) => entry.endsWith('.md')).sort()) {
        const filePath = path.join(dir, name);
        const fallbackId = name.replace(/\.md$/, '');
        let id = fallbackId;
        let title = name.replace(/\.md$/, '');
        let status = null;
        try {
            const content = await readFile(filePath, 'utf8');
            const frontmatter = parseSimpleFrontmatter(content);
            id = frontmatter.id ?? fallbackId;
            title = frontmatter.title ?? firstMarkdownTitle(content) ?? title;
            status = frontmatter.status ?? null;
        }
        catch {
            // Keep filename fallback when a local item cannot be read.
        }
        items.push({ id, title, kind: pool.kind, sourceType: 'local', path: filePath, status });
    }
    return items;
}
function parseSimpleFrontmatter(content) {
    if (!content.startsWith('---\n'))
        return {};
    const end = content.indexOf('\n---', 4);
    if (end === -1)
        return {};
    const values = {};
    for (const line of content.slice(4, end).split(/\r?\n/)) {
        const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
        if (!match)
            continue;
        values[match[1]] = match[2].replace(/^"(.*)"$/, '$1').trim();
    }
    return values;
}
async function loadPoolItems(pool, repoPath, page, pageSize) {
    const binding = await readProjectBinding(repoPath);
    let mode = 'local';
    let warning = null;
    let items = [];
    if (binding && pool.kind === 'requirement') {
        const projectId = projectApiId(binding);
        if (projectId) {
            try {
                const query = `?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`;
                const payload = await fetchOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/documents${query}`, await tokenForBinding(binding));
                items = documentArray(payload).filter((entry) => poolDocumentMatches(pool, entry)).map(asPoolListItem);
                mode = 'hub';
            }
            catch (error) {
                warning = `Hub list failed; showing local items instead. ${error instanceof Error ? error.message : String(error)}`;
                items = await listLocalPoolItems(pool, repoPath);
            }
        }
        else {
            warning = 'Project binding has no projectId/projectUuid; showing local items instead.';
            items = await listLocalPoolItems(pool, repoPath);
        }
    }
    else {
        warning = binding ? `Hub pool endpoint for ${pool.kind} is not available in this CLI; showing local items.` : null;
        items = await listLocalPoolItems(pool, repoPath);
    }
    if (mode === 'local') {
        items = items.slice((page - 1) * pageSize, page * pageSize);
    }
    return { mode, warning, items, bound: Boolean(binding) };
}
function poolItemDisplayId(item) {
    if (item.id)
        return item.id;
    if (item.path)
        return path.basename(item.path, '.md');
    return 'unknown';
}
function formatPoolItemLine(item, index) {
    const status = item.status ? ` — ${item.status}` : '';
    return `${index}. [${poolItemDisplayId(item)}] ${item.title}${status}`;
}
async function listPoolItems(pool) {
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
async function interactivePoolList(pool, repoPath, startPage, pageSize, initialItems, initialWarning) {
    let page = startPage;
    let items = initialItems;
    let warning = initialWarning;
    const prompt = await createPromptSession();
    try {
        while (true) {
            if (items.length === 0) {
                console.log(`${pool.displayName}暂无条目`);
            }
            else {
                console.log(`${pool.displayName} 第 ${page} 页，每页 ${pageSize} 条`);
                items.forEach((item, index) => console.log(formatPoolItemLine(item, index + 1)));
            }
            if (warning)
                console.log(`warning: ${warning}`);
            console.log('操作: [n]下一页 [p]上一页 [d]删除 [q]退出');
            const answer = (await prompt.question('> ')).trim().toLowerCase();
            if (answer === 'q' || answer === '')
                return;
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
    }
    finally {
        prompt.close();
    }
}
function findPoolItem(items, input) {
    const value = input.trim();
    const index = Number.parseInt(value, 10);
    if (Number.isInteger(index) && index >= 1 && index <= items.length)
        return items[index - 1];
    return items.find((item) => poolItemDisplayId(item) === value || item.id === value || item.path === value) ?? null;
}
async function confirmDelete(pool, id, prompt) {
    if (hasFlag('--yes'))
        return true;
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
        if (answer === 'yes')
            return true;
        if (!process.stdin.isTTY && answer === '') {
            throw new Error('Delete requires --yes or an interactive terminal confirmation.');
        }
        console.log('已取消删除');
        return false;
    }
    finally {
        if (ownsPrompt)
            session.close();
    }
}
function printDeletePayload(payload) {
    if (hasFlag('--json')) {
        console.log(JSON.stringify(payload, null, 2));
    }
    else if (isJson(payload.error)) {
        console.error(safeString(payload.error.message) ?? 'Delete failed');
    }
}
async function deletePoolItem(pool, id, options = {}) {
    const repoPath = resolveRepoArg();
    const localItems = options.item ? [options.item] : await listLocalPoolItems(pool, repoPath);
    const localItem = localItems.find((item) => poolItemDisplayId(item) === id || item.id === id || item.path === id) ?? null;
    const confirmed = await confirmDelete(pool, id, options.prompt);
    if (!confirmed)
        return false;
    if (localItem?.path) {
        await unlink(localItem.path);
        const payload = { ok: true, mode: 'local', repo: repoPath, pool: pool.pool, id: poolItemDisplayId(localItem), deletedPath: localItem.path };
        if (hasFlag('--json'))
            console.log(JSON.stringify(payload, null, 2));
        else
            console.log(`deleted: ${localItem.path}`);
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
    }
    else {
        console.error(payload.error.message);
    }
    process.exit(2);
}
function integerArg(flag, fallback, max) {
    const value = Number.parseInt(getArg(flag) ?? String(fallback), 10);
    if (!Number.isFinite(value) || value < 1)
        return fallback;
    return Math.min(value, max);
}
function integerArgAny(flags, fallback, max) {
    for (const flag of flags) {
        const raw = getArg(flag);
        if (raw === null)
            continue;
        const value = Number.parseInt(raw, 10);
        if (!Number.isFinite(value) || value < 1)
            return fallback;
        return Math.min(value, max);
    }
    return fallback;
}
function secondsArgAny(flags, fallback, max) {
    for (const flag of flags) {
        const raw = getArg(flag);
        if (raw === null)
            continue;
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value) || value < 0)
            return fallback;
        return Math.min(value, max);
    }
    return fallback;
}
async function probeHubQueue(binding, routePath) {
    try {
        const payload = await fetchOrbitJson(binding.backendUrl, routePath, await tokenForBinding(binding));
        return { items: documentArray(payload), warning: null };
    }
    catch (error) {
        return { items: [], warning: error instanceof Error ? error.message : String(error) };
    }
}
function prerequisiteEnv() {
    return {
        ...process.env,
        HTTP_PROXY: process.env.HTTP_PROXY ?? 'http://127.0.0.1:7890',
        HTTPS_PROXY: process.env.HTTPS_PROXY ?? 'http://127.0.0.1:7890',
        ALL_PROXY: process.env.ALL_PROXY ?? 'socks5://127.0.0.1:7891',
    };
}
function logWorkPrerequisite(message) {
    console.error(`[axis work prerequisite] ${message}`);
}
function commandText(command, args) {
    return [command, ...args].map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(' ');
}
async function runPrerequisiteCommand(command, args, options = {}) {
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
    }
    catch (error) {
        const warning = summarizeCommandError(error);
        logWorkPrerequisite(`warning: ${display} failed: ${warning}`);
        return { name: display, ok: false, status: 'failed', command: display, warning };
    }
}
async function copyGstackHermesSkills(gstackDir) {
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
    }
    catch (error) {
        return {
            name: 'gstack hermes skills',
            ok: false,
            status: 'copy-failed',
            path: target,
            warning: summarizeCommandError(error),
        };
    }
}
async function linkOrCopyGstackAsset(source, target) {
    if (existsSync(target) || !existsSync(source))
        return;
    try {
        await symlink(source, target);
        return;
    }
    catch {
        const sourceStat = await stat(source);
        if (sourceStat.isDirectory()) {
            await cp(source, target, { recursive: true, force: false, errorOnExist: false });
        }
        else {
            await copyFile(source, target);
        }
    }
}
async function linkGstackAssets(gstackDir) {
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
            if (!entry.isDirectory() || !entry.name.startsWith('gstack'))
                continue;
            const skillDir = path.join(skillsDir, entry.name);
            if (!existsSync(path.join(skillDir, 'SKILL.md')))
                continue;
            for (const asset of assets) {
                await linkOrCopyGstackAsset(asset.source, path.join(skillDir, asset.name));
            }
            linked++;
        }
        return { name: 'gstack skill assets', ok: linked > 0, status: linked > 0 ? 'linked' : 'no-gstack-skills', path: skillsDir };
    }
    catch (error) {
        return { name: 'gstack skill assets', ok: false, status: 'failed', path: skillsDir, warning: summarizeCommandError(error) };
    }
}
async function writeGstackWrapper(gstackDir) {
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
    }
    catch (error) {
        return { name: 'gstack user command', ok: false, status: 'failed', path: target, warning: summarizeCommandError(error) };
    }
}
async function ensureGstackPrerequisite() {
    const steps = [];
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
    }
    else {
        steps.push(await runPrerequisiteCommand('git', ['clone', repoUrl, gstackDir]));
    }
    if (await directoryExists(gstackDir)) {
        if (await commandAvailable('bun')) {
            steps.push(await runPrerequisiteCommand('bun', ['install'], { cwd: gstackDir }));
            steps.push(await runPrerequisiteCommand('bun', ['run', 'gen:skill-docs', '--host', 'hermes'], { cwd: gstackDir }));
        }
        else {
            const warning = 'bun was not found on PATH; skipped gstack dependency install and Hermes skill generation.';
            logWorkPrerequisite(`warning: ${warning}`);
            steps.push({ name: 'bun', ok: false, status: 'missing', warning });
        }
        steps.push(await copyGstackHermesSkills(gstackDir));
        steps.push(await linkGstackAssets(gstackDir));
        steps.push(await writeGstackWrapper(gstackDir));
    }
    else {
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
async function superpowersSkillEvidence() {
    const root = codexSuperpowersSkillRoot();
    const required = [
        path.join(root, 'brainstorming', 'SKILL.md'),
        path.join(root, 'systematic-debugging', 'SKILL.md'),
    ];
    return required.every((filePath) => existsSync(filePath)) ? root : null;
}
async function findSuperpowersCacheSource() {
    const explicit = process.env.AXIS_CODEX_SUPERPOWERS_SOURCE;
    const candidates = [
        explicit ? path.resolve(explicit) : null,
        path.join(homeDir(), '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills'),
        path.join(homeDir(), '.codex', 'plugins', 'superpowers', 'skills'),
    ].filter((entry) => Boolean(entry));
    for (const candidate of candidates) {
        if (existsSync(path.join(candidate, 'brainstorming', 'SKILL.md')) || existsSync(path.join(candidate, 'systematic-debugging', 'SKILL.md'))) {
            return candidate;
        }
    }
    return null;
}
async function linkOrCopySuperpowersSkills(source, target) {
    ensureDir(path.dirname(target));
    if (path.resolve(source) === path.resolve(target)) {
        return { name: 'codex superpowers skills', ok: true, status: 'same-path', path: target };
    }
    try {
        if (!existsSync(target)) {
            try {
                await symlink(source, target);
                return { name: 'codex superpowers skills', ok: true, status: 'linked', path: target };
            }
            catch {
                await cp(source, target, { recursive: true, force: false, errorOnExist: false });
                return { name: 'codex superpowers skills', ok: true, status: 'copied', path: target };
            }
        }
        await cp(source, target, { recursive: true, force: false, errorOnExist: false });
        return { name: 'codex superpowers skills', ok: true, status: 'merged', path: target };
    }
    catch (error) {
        return { name: 'codex superpowers skills', ok: false, status: 'failed', path: target, warning: summarizeCommandError(error) };
    }
}
async function ensureCodexSuperpowersPrerequisite() {
    const steps = [];
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
    }
    else {
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
async function ensureWorkThreadPrerequisites() {
    const steps = [
        ...await ensureGstackPrerequisite(),
        ...await ensureCodexSuperpowersPrerequisite(),
    ];
    const warnings = steps.map((step) => step.warning).filter((entry) => Boolean(entry));
    return {
        ok: steps.every((step) => step.ok),
        steps,
        warnings,
    };
}
function poolKindFromSeed(seed) {
    const raw = (safeString(seed.kind) ?? safeString(seed.pool) ?? safeString(seed.sourceType) ?? '').toLowerCase();
    if (raw === 'idea' || raw === 'ide')
        return 'idea';
    if (raw === 'requirement' || raw === 'req')
        return 'requirement';
    if (raw === 'bug')
        return 'bug';
    if (raw === 'suggestion' || raw === 'sug' || raw === 'improvement')
        return 'suggestion';
    return null;
}
function poolSeedId(seed) {
    return safeString(seed.id) ?? safeString(seed.uuid) ?? safeString(seed.seedId) ?? safeString(seed.documentId);
}
function poolSeedText(seed) {
    return safeString(seed.seed)
        ?? safeString(seed.summary)
        ?? safeString(seed.title)
        ?? JSON.stringify(seed);
}
function poolSeedReviewContext(seed) {
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
    const context = {};
    for (const key of contextKeys) {
        if (seed[key] !== undefined && seed[key] !== null)
            context[key] = seed[key];
    }
    return Object.keys(context).length > 0 ? context : null;
}
function methodologyPromptBlock(methodology) {
    if (!methodology.injected) {
        return [
            'Methodology skill content was not injected.',
            methodology.warning ? `Warning: ${methodology.warning}` : null,
            'Use the methodologySkill name as fallback guidance, and still follow the non-interactive decision rules below.',
        ].filter((line) => Boolean(line)).join('\n');
    }
    return [
        'Injected methodology skill content from local filesystem:',
        '```markdown',
        methodology.content,
        '```',
    ].join('\n');
}
function buildWorkRefineAgentPrompt(pool, seed, prepare, methodology) {
    const reviewContext = poolSeedReviewContext(seed);
    return [
        'You are an Axis work refine Agent converting one pending pool seed into an Orbit/Axis pool artifact.',
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
async function resolveWorkAgent(repoPath) {
    const explicit = parsePoolAgentArg(getArg('--agent'));
    if (explicit === 'current')
        throw new Error('--agent current is not supported for axis work; use codex, claude-code, or none.');
    if (explicit === 'none')
        return null;
    if (explicit === 'codex' || explicit === 'claude-code')
        return explicit;
    const binding = await readProjectBinding(repoPath);
    if (binding?.selectedAgent && binding.selectedAgent !== 'none')
        return binding.selectedAgent;
    if (await commandAvailable('codex'))
        return 'codex';
    if (await commandAvailable('claude'))
        return 'claude-code';
    return null;
}
async function convertPoolSeedWithAgent(agent, repoPath, seed, options = {}) {
    const kind = poolKindFromSeed(seed);
    const seedId = poolSeedId(seed);
    if (!kind) {
        return { ok: false, seedId, kind: null, error: 'Seed has no supported kind.' };
    }
    const pool = AXIS_POOLS_BY_KIND[kind];
    const methodology = await resolvePoolMethodologyInjection(pool);
    const methodologySkill = methodology.skill;
    options.progress?.(`methodology: ${seedId ?? '(unknown seed)'} -> ${methodologySkill}${methodology.injected ? ' injected' : ' not injected'}`);
    const binding = await readProjectBinding(repoPath);
    const cloud = await fetchPoolTemplateContext(pool, repoPath);
    const prepare = {
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
        return {
            ok: true,
            seedId,
            kind,
            pool: pool.pool,
            methodologySkill,
            methodologySource: methodology.source,
            methodologyPath: methodology.path,
            methodologyInjected: methodology.injected,
            methodologyWarning: methodology.warning,
            methodologyTruncated: methodology.truncated,
            artifactTitle: artifact.title,
            submit,
            warning: combineWarnings(cloud.warning, methodology.warning),
        };
    }
    catch (error) {
        return {
            ok: false,
            seedId,
            kind,
            pool: pool.pool,
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
function poolSeedDisplayTitle(seed) {
    return safeString(seed.title) ?? poolSeedText(seed).slice(0, 120);
}
function workItemId(item) {
    return safeString(item.id) ?? safeString(item.uuid) ?? safeString(item.workItemId) ?? safeString(item.itemId);
}
function workItemKind(item) {
    return safeString(item.kind) ?? safeString(item.type) ?? safeString(item.sourceType);
}
function workItemTitle(item) {
    return safeString(item.title) ?? safeString(item.name) ?? safeString(item.summary) ?? 'Untitled work item';
}
async function buildReviewWorkerIteration(repoPath, options = {}) {
    const probe = await buildWorkProbe(repoPath, options);
    const lanes = isJson(probe.lanes) ? probe.lanes : {};
    const refineLane = isJson(lanes.refine) ? lanes.refine : {};
    const seeds = Array.isArray(refineLane.items) ? refineLane.items.filter(isJson) : [];
    options.progress?.(`queue: review pending ${seeds.length}`);
    const binding = await readProjectBinding(repoPath);
    const projectId = binding ? projectApiId(binding) : null;
    const review = {
        agent: null,
        prerequisites: null,
        results: [],
        warning: null,
    };
    const payload = {
        ...probe,
        mode: options.mode ?? 'work-review-iteration',
        workerType: 'review',
        warning: null,
        review,
        refine: review,
        plan: [
            'Run review worker for pending-confirmation pool seeds.',
            'Map each seed kind to its methodology skill, inject the skill, launch the selected Agent, and submit a pool document.',
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
        review.warning = 'No pending-confirmation pool seeds found; review worker is idle.';
        options.progress?.('idle: no pending-confirmation pool seeds');
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
    const results = [];
    for (const seed of seeds) {
        const seedId = poolSeedId(seed) ?? '(unknown seed)';
        const kind = poolKindFromSeed(seed) ?? 'unknown';
        options.progress?.(`seed: ${seedId} kind=${kind} title=${poolSeedDisplayTitle(seed)}`);
        options.progress?.(`agent: launching ${agent} for ${seedId}`);
        const result = await convertPoolSeedWithAgent(agent, repoPath, seed, { progress: options.progress });
        results.push(result);
        if (result.ok === true) {
            const submit = isJson(result.submit) ? result.submit : {};
            options.progress?.(`upload: ${seedId} ${safeString(submit.mode) ?? 'unknown'} id=${safeString(submit.id) ?? 'n/a'}`);
        }
        else {
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
async function buildWorkRun(repoPath, options = {}) {
    return buildReviewWorkerIteration(repoPath, { ...options, spawn: true, mode: 'work-once' });
}
async function buildCodingWorkerIteration(repoPath, options = {}) {
    const probe = await buildWorkProbe(repoPath, { ...options, spawn: false });
    const lanes = isJson(probe.lanes) ? probe.lanes : {};
    const executeLane = isJson(lanes.execute) ? lanes.execute : {};
    const workItems = Array.isArray(executeLane.items) ? executeLane.items.filter(isJson) : [];
    options.progress?.(`queue: coding ready ${workItems.length}`);
    const binding = await readProjectBinding(repoPath);
    const projectId = binding ? projectApiId(binding) : null;
    const coding = {
        ok: true,
        status: 'idle',
        readyCount: workItems.length,
        items: workItems,
        warning: null,
        todo: null,
    };
    const payload = {
        ...probe,
        mode: options.mode ?? 'work-coding-iteration',
        workerType: 'coding',
        spawn: false,
        warning: null,
        coding,
        plan: [
            'Probe confirmed/ready WorkItems from the execute lane.',
            'Do not claim, execute, or write back WorkItems until Hub lifecycle APIs are available.',
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
        coding.warning = 'No ready coding WorkItems found; coding worker is idle.';
        options.progress?.('idle: no ready coding WorkItems');
        return payload;
    }
    for (const item of workItems) {
        options.progress?.(`workitem: ${workItemId(item) ?? '(unknown workitem)'} kind=${workItemKind(item) ?? 'unknown'} title=${workItemTitle(item)}`);
    }
    const warning = `TODO: Hub claim/execute/writeback APIs are not implemented in axis-tools yet; probed ${workItems.length} ready coding WorkItem(s) and did not launch a coding agent or mark work complete.`;
    coding.ok = false;
    coding.status = 'blocked';
    coding.warning = warning;
    coding.todo = 'Implement Hub WorkItem claim, execution handoff, verification, and writeback APIs before enabling coding execution.';
    payload.warning = warning;
    options.progress?.(`blocked: ${warning}`);
    return payload;
}
async function buildWorkProbe(repoPath, options = {}) {
    const binding = await readProjectBinding(repoPath);
    const spawn = options.spawn ?? hasFlag('--spawn');
    const lanes = {
        refine: {
            description: 'Refine pending-confirmation pool seeds into confirmed requirements/work-items.',
            query: 'pool-seeds?status=pending-confirmation',
            methodologyByKind: poolMethodologyMap(),
            items: [],
            warning: null,
        },
        execute: {
            description: 'Execute confirmed/ready requirements and work-items.',
            query: 'work-items?status=ready',
            items: [],
            warning: null,
        },
    };
    if (binding) {
        const projectId = projectApiId(binding);
        if (projectId) {
            const refine = await probeHubQueue(binding, `/api/projects/${encodeURIComponent(projectId)}/pool-seeds?status=pending-confirmation&page=1&pageSize=10`);
            const execute = await probeHubQueue(binding, `/api/projects/${encodeURIComponent(projectId)}/work-items?status=ready&page=1&pageSize=10`);
            lanes.refine.items = refine.items;
            lanes.refine.warning = refine.warning;
            lanes.execute.items = execute.items;
            lanes.execute.warning = execute.warning;
        }
        else {
            lanes.refine.warning = 'Project binding has no projectId/projectUuid; Hub queues were not probed.';
            lanes.execute.warning = 'Project binding has no projectId/projectUuid; Hub queues were not probed.';
        }
    }
    else {
        lanes.refine.warning = 'No AxisNode project binding found; Hub queues were not probed.';
        lanes.execute.warning = 'No AxisNode project binding found; Hub queues were not probed.';
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
            'Review worker: convert pending-confirmation seeds into confirmed documents/work-items with the mapped methodology skill.',
            'Coding worker: probe confirmed/ready work-items and report blocked until Hub claim/execute/writeback APIs are stable.',
            'TODO: implement Hub WorkItem claim, execution handoff, verification, and writeback APIs before coding execution.',
        ],
        warning: spawn ? '--spawn requested; deprecated review alias launches only when pending pool seeds exist.' : null,
    };
}
function printWorkProbe(payload) {
    if (hasFlag('--json')) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    console.log(`repo: ${payload.repo}`);
    console.log(`mode: ${payload.mode}`);
    console.log(`spawn: ${payload.spawn ? 'requested-not-started' : 'false'}`);
    const lanes = isJson(payload.lanes) ? payload.lanes : {};
    for (const laneName of ['refine', 'execute']) {
        const lane = isJson(lanes[laneName]) ? lanes[laneName] : {};
        const items = Array.isArray(lane.items) ? lane.items : [];
        console.log(`${laneName}: ${items.length} item(s)`);
        if (safeString(lane.warning))
            console.log(`${laneName} warning: ${lane.warning}`);
    }
    const refine = isJson(payload.refine) ? payload.refine : null;
    if (refine) {
        const results = Array.isArray(refine.results) ? refine.results : [];
        if (safeString(refine.agent))
            console.log(`refine agent: ${refine.agent}`);
        console.log(`refine converted: ${results.filter((entry) => isJson(entry) && entry.ok === true).length}/${results.length}`);
        if (safeString(refine.warning))
            console.log(`refine warning: ${refine.warning}`);
    }
    if (safeString(payload.warning))
        console.log(`warning: ${payload.warning}`);
}
function pushUniqueWarning(warnings, value) {
    const warning = safeString(value);
    if (warning && !warnings.includes(warning))
        warnings.push(warning);
}
function numericValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function summarizeWorkIteration(payload) {
    const lanes = isJson(payload.lanes) ? payload.lanes : {};
    const refineLane = isJson(lanes.refine) ? lanes.refine : {};
    const executeLane = isJson(lanes.execute) ? lanes.execute : {};
    const review = isJson(payload.review)
        ? payload.review
        : isJson(payload.refine)
            ? payload.refine
            : {};
    const coding = isJson(payload.coding) ? payload.coding : {};
    const workerType = safeString(payload.workerType);
    const pending = Array.isArray(refineLane.items) ? refineLane.items.length : 0;
    const ready = Array.isArray(executeLane.items) ? executeLane.items.length : 0;
    const results = Array.isArray(review.results) ? review.results.filter(isJson) : [];
    const converted = results.filter((entry) => entry.ok === true).length;
    const blocked = safeString(coding.status) === 'blocked' ? 1 : 0;
    const idle = workerType === 'coding'
        ? ready === 0 && blocked === 0 ? 1 : 0
        : pending === 0 && results.length === 0 ? 1 : 0;
    const warnings = [];
    pushUniqueWarning(warnings, payload.warning);
    pushUniqueWarning(warnings, refineLane.warning);
    pushUniqueWarning(warnings, executeLane.warning);
    pushUniqueWarning(warnings, review.warning);
    pushUniqueWarning(warnings, coding.warning);
    for (const result of results)
        pushUniqueWarning(warnings, result.warning);
    return {
        pending,
        ready,
        conversions: results.length,
        converted,
        failed: results.length - converted,
        blocked,
        idle,
        warnings,
    };
}
function summarizeWorkLoop(iterations, requested) {
    const summary = {
        requested: requested ?? iterations.length,
        attempted: iterations.length,
        pending: 0,
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
            ? iteration.summary
            : summarizeWorkIteration(iteration);
        summary.pending += numericValue(iterationSummary.pending);
        summary.ready += numericValue(iterationSummary.ready);
        summary.conversions += numericValue(iterationSummary.conversions);
        summary.converted += numericValue(iterationSummary.converted);
        summary.failed += numericValue(iterationSummary.failed);
        summary.blocked += numericValue(iterationSummary.blocked);
        summary.idle += numericValue(iterationSummary.idle);
        const warnings = Array.isArray(iterationSummary.warnings) ? iterationSummary.warnings : [];
        for (const warning of warnings)
            pushUniqueWarning(summary.warnings, warning);
    }
    return summary;
}
function baseWorkLanes() {
    return {
        refine: {
            description: 'Refine pending-confirmation pool seeds into confirmed requirements/work-items.',
            query: 'pool-seeds?status=pending-confirmation',
            methodologyByKind: poolMethodologyMap(),
            items: [],
            warning: null,
        },
        execute: {
            description: 'Execute confirmed/ready requirements and work-items.',
            query: 'work-items?status=ready',
            items: [],
            warning: null,
        },
    };
}
function appendLaneItemsAndWarnings(targetLanes, sourcePayload, warnings) {
    const sourceLanes = isJson(sourcePayload.lanes) ? sourcePayload.lanes : {};
    for (const laneName of ['refine', 'execute']) {
        const sourceLane = isJson(sourceLanes[laneName]) ? sourceLanes[laneName] : {};
        const targetLane = isJson(targetLanes[laneName]) ? targetLanes[laneName] : {};
        const targetItems = Array.isArray(targetLane.items) ? targetLane.items : [];
        const sourceItems = Array.isArray(sourceLane.items) ? sourceLane.items.filter(isJson) : [];
        targetLane.items = [...targetItems, ...sourceItems];
        pushUniqueWarning(warnings, sourceLane.warning);
        targetLanes[laneName] = targetLane;
    }
}
function summarizeWorkspaceIteration(projectPayloads, workerType, warnings) {
    const summary = {
        pending: 0,
        ready: 0,
        conversions: 0,
        converted: 0,
        failed: 0,
        blocked: 0,
        idle: projectPayloads.length === 0 ? 1 : 0,
        warnings: [],
    };
    for (const warning of warnings)
        pushUniqueWarning(summary.warnings, warning);
    for (const projectPayload of projectPayloads) {
        const projectSummary = summarizeWorkIteration(projectPayload);
        summary.pending += projectSummary.pending;
        summary.ready += projectSummary.ready;
        summary.conversions += projectSummary.conversions;
        summary.converted += projectSummary.converted;
        summary.failed += projectSummary.failed;
        summary.blocked += projectSummary.blocked;
        summary.idle += projectSummary.idle;
        for (const warning of projectSummary.warnings)
            pushUniqueWarning(summary.warnings, warning);
    }
    if (workerType === 'coding' && summary.ready === 0 && summary.blocked === 0 && projectPayloads.length > 0) {
        summary.idle = Math.max(summary.idle, projectPayloads.length);
    }
    return summary;
}
function workspaceWorkLoopStopReason(workerType, payload, summary) {
    const review = isJson(payload.review) ? payload.review : {};
    if (workerType === 'review') {
        const reviewWarning = safeString(review.warning) ?? safeString(payload.warning);
        if (summary.conversions === 0 && reviewWarning?.includes('No worker Agent is available'))
            return 'no-worker-agent';
        if (summary.failed > 0)
            return 'worker-failure';
    }
    return null;
}
async function buildWorkspaceWorkerIteration(workspace, workerType, options = {}) {
    const projects = [];
    const lanes = baseWorkLanes();
    const warnings = [...workspace.warnings];
    const review = {
        agent: null,
        prerequisites: null,
        results: [],
        warning: null,
    };
    const coding = {
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
        if (workerType === 'review')
            review.warning = warning;
        else
            coding.warning = warning;
    }
    for (const project of workspace.projects) {
        const projectId = project.binding.projectId ?? project.binding.projectUuid ?? project.project.id;
        const projectName = project.binding.projectName ?? project.project.name;
        options.progress?.(`project: ${projectId} ${projectName} (${project.repoPath})`);
        if (project.warning)
            options.progress?.(`project warning: ${project.warning}`);
        const run = workerType === 'review'
            ? await buildReviewWorkerIteration(project.repoPath, { spawn: true, progress: options.progress, mode: options.mode ? `${options.mode}-project` : 'work-review-project-iteration' })
            : await buildCodingWorkerIteration(project.repoPath, { progress: options.progress, mode: options.mode ? `${options.mode}-project` : 'work-coding-project-iteration' });
        const projectPayload = {
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
        const projectReview = isJson(projectPayload.review) ? projectPayload.review : {};
        const projectCoding = isJson(projectPayload.coding) ? projectPayload.coding : {};
        const projectResults = Array.isArray(projectReview.results) ? projectReview.results.filter(isJson) : [];
        review.results = [...(Array.isArray(review.results) ? review.results : []), ...projectResults];
        if (!review.agent && safeString(projectReview.agent))
            review.agent = projectReview.agent;
        if (!review.prerequisites && isJson(projectReview.prerequisites))
            review.prerequisites = projectReview.prerequisites;
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
    }
    else {
        coding.warning = coding.warning ?? (summary.warnings.length > 0 ? summary.warnings.join(' ') : null);
    }
    const payload = {
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
                : 'Probe ready coding WorkItems for each accessible project queue without executing them.',
        ],
    };
    if (workerType === 'review') {
        payload.review = review;
        payload.refine = review;
    }
    else {
        payload.coding = coding;
    }
    return payload;
}
function workLoopStopReason(workerType, payload, summary) {
    const lanes = isJson(payload.lanes) ? payload.lanes : {};
    const refineLane = isJson(lanes.refine) ? lanes.refine : {};
    const executeLane = isJson(lanes.execute) ? lanes.execute : {};
    const refine = isJson(payload.refine) ? payload.refine : {};
    if (payload.bound !== true)
        return 'no-project-binding';
    if (!safeString(payload.projectId))
        return 'no-project-id';
    if (workerType === 'review') {
        if (summary.pending === 0 && safeString(refineLane.warning))
            return 'queue-warning';
        const refineWarning = safeString(refine.warning);
        if (summary.conversions === 0 && refineWarning?.includes('No worker Agent is available'))
            return 'no-worker-agent';
        if (summary.failed > 0)
            return 'worker-failure';
    }
    if (workerType === 'coding' && summary.ready === 0 && safeString(executeLane.warning))
        return 'queue-warning';
    return null;
}
let workLoopInterrupted = false;
let wakeWorkLoopSleep = null;
function installWorkLoopInterruptHandlers(progress) {
    workLoopInterrupted = false;
    const handler = (signal) => {
        if (!workLoopInterrupted)
            progress?.(`interrupt: received ${signal}; stopping after current step`);
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
function shouldSkipWorkLoopSleep() {
    return process.env.AXIS_WORK_LOOP_SKIP_SLEEP === '1';
}
async function sleepWorkLoop(seconds) {
    if (seconds <= 0 || workLoopInterrupted)
        return { skipped: false, interrupted: workLoopInterrupted };
    if (shouldSkipWorkLoopSleep())
        return { skipped: true, interrupted: workLoopInterrupted };
    await new Promise((resolve) => {
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
function printWorkLoop(payload) {
    if (hasFlag('--json')) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    if (safeString(payload.scope) === 'workspace') {
        console.log(`workspace root: ${payload.workspaceRoot}`);
        console.log(`projects: ${payload.projectCount ?? 0}`);
    }
    else {
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
        const summary = isJson(iteration.summary) ? iteration.summary : summarizeWorkIteration(iteration);
        if (workerType === 'coding') {
            const projectText = safeString(payload.scope) === 'workspace' ? `projects ${iteration.projectCount ?? payload.projectCount ?? 0}, ` : '';
            console.log(`iteration ${iteration.iteration}/${payload.maxIterations ?? 'unbounded'}: ${projectText}ready ${summary.ready}, blocked ${summary.blocked}, idle ${summary.idle}`);
        }
        else {
            const projectText = safeString(payload.scope) === 'workspace' ? `projects ${iteration.projectCount ?? payload.projectCount ?? 0}, ` : '';
            console.log(`iteration ${iteration.iteration}/${payload.maxIterations ?? 'unbounded'}: ${projectText}pending ${summary.pending}, converted ${summary.converted}/${summary.conversions}, idle ${summary.idle}`);
        }
        const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
        for (const warning of warnings)
            console.log(`iteration ${iteration.iteration} warning: ${warning}`);
    }
    const summary = isJson(payload.summary) ? payload.summary : {};
    if (workerType === 'coding') {
        console.log(`summary: iterations ${summary.attempted}/${summary.requested}, ready ${summary.ready}, blocked ${summary.blocked}, idle ${summary.idle}`);
    }
    else {
        console.log(`summary: iterations ${summary.attempted}/${summary.requested}, converted ${summary.converted}/${summary.conversions}, pending ${summary.pending}, idle ${summary.idle}`);
    }
    console.log(`stop reason: ${payload.stopReason}`);
    if (safeString(payload.warning))
        console.log(`warning: ${payload.warning}`);
}
function workLoopMaxIterationsArg() {
    if (hasFlag('--once'))
        return 1;
    for (const flag of ['--iterations', '--max-iterations']) {
        const raw = getArg(flag);
        if (raw === null)
            continue;
        const value = Number.parseInt(raw, 10);
        if (!Number.isFinite(value) || value < 1)
            return 1;
        return value;
    }
    return null;
}
function emitWorkProgress(message) {
    if (!hasFlag('--json'))
        console.log(message);
}
async function runWorkWorkerLoop(repoPath, workerType, options = {}) {
    const maxIterations = workLoopMaxIterationsArg();
    const bounded = maxIterations !== null;
    const intervalSeconds = secondsArgAny(['--interval', '--sleep'], 10, 3600);
    const iterations = [];
    const sleeps = [];
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
            const iteration = {
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
            }
            else {
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
    }
    finally {
        cleanup();
    }
    const summary = summarizeWorkLoop(iterations, maxIterations);
    const payload = {
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
async function runWorkspaceWorkWorkerLoop(workerType, options = {}) {
    const maxIterations = workLoopMaxIterationsArg();
    const bounded = maxIterations !== null;
    const intervalSeconds = secondsArgAny(['--interval', '--sleep'], 10, 3600);
    const iterations = [];
    const sleeps = [];
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
    for (const warning of workspace.warnings)
        emitWorkProgress(`workspace warning: ${warning}`);
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
            const iteration = {
                iteration: iterationNumber,
                startedAt,
                finishedAt: new Date().toISOString(),
                ...run,
            };
            const iterationSummary = isJson(iteration.summary) ? iteration.summary : summarizeWorkIteration(iteration);
            iteration.summary = iterationSummary;
            iterations.push(iteration);
            if (workerType === 'coding') {
                emitWorkProgress(`iteration ${iterationNumber}: projects ${workspace.projects.length}, ready ${iterationSummary.ready}, blocked ${iterationSummary.blocked}, idle ${iterationSummary.idle}`);
            }
            else {
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
    }
    finally {
        cleanup();
    }
    const summary = summarizeWorkLoop(iterations, maxIterations);
    const payload = {
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
async function handleWorkCommand(command) {
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
function getPoolDeleteId(args) {
    const index = args.indexOf('--delete');
    if (index === -1)
        return null;
    const next = args[index + 1];
    if (!next || next.startsWith('--'))
        return null;
    return next;
}
async function selectAndDeletePoolItem(pool) {
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
    }
    finally {
        prompt.close();
    }
}
async function handlePoolCommand(pool, args) {
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
        }
        else {
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
async function main() {
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
    if (group === 'work') {
        await handleWorkCommand(command);
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
    main().catch((error) => {
        if (error instanceof OrbitCliError) {
            console.error(error.message);
            process.exit(1);
        }
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exit(1);
    });
}
