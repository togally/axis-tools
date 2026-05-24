#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { appendFile, copyFile, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
const SHARED_BACKEND_URL = 'http://117.72.14.134:18081';
const execFileAsync = promisify(execFile);
const POOLS = {
    'orbit-ide': { command: 'orbit-ide', pool: 'ide', kind: 'idea', displayName: '想法池', skill: 'oribit-idea', defaultDir: 'docs/ideas' },
    'orbit-req': { command: 'orbit-req', pool: 'req', kind: 'requirement', displayName: '需求池', skill: 'orbit-requirement', defaultDir: 'docs/requirements' },
    'orbit-bug': { command: 'orbit-bug', pool: 'bug', kind: 'bug', displayName: 'Bug池', skill: 'orbit-bug', defaultDir: 'docs/bugs' },
    'orbit-sug': { command: 'orbit-sug', pool: 'sug', kind: 'suggestion', displayName: '优化池', skill: 'orbit-suggestion', defaultDir: 'docs/suggestions' },
};
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
    console.log(`orbit\n\nAlias: orbit-tools\n\nCommands:\n  login\n  me\n  init\n  bind\n  pull\n  init-product-line\n  install [--agent <codex|claude-code|cc|all>] [--force]\n  logout [--backend-url <url>]\n  orbit-req <text> [--repo <path>] [--agent <codex|claude-code|current|none>] [--json]\n  orbit-req --list [--repo <path>] [--page <n>] [--page-size <n>] [--json]\n  orbit-req --delete <id> [--repo <path>] [--yes] [--json]\n  orbit-ide|orbit-bug|orbit-sug use the same create/list/delete flags\n  codex-hook ingest [--file <json-file>] [--repo <path>]\n  codex-status current [--repo <path>] [--json]\n  codex-status tail [--repo <path>] [--limit <n>]\n  codex-status summary [--repo <path>]\n  codex-run once --repo <path> --prompt <text> [--json] [--model <model>]\n  mcp install [--repo <path>] [--config <hermes-config>] [--backend-url <url>] [--mcp-url <url>] [--server-name <name>]\n  project bind --interactive [--repo <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project bind [--repo <path>] --product-line-uuid <uuid> --project-uuid <uuid> [--product-line-id <id>] [--project-id <id>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project show [--repo <path>] [--json]\n\nMain flow:\n  login = prompt for Orbit account and hidden password; cache session\n  me = show current Orbit Hub user\n  init = packaged skill setup only\n  bind = bind a repo or product-line root to Orbit Hub\n  pull = clone/pull maintained repos from Orbit Hub\n\nPool examples:\n  orbit-req "商品评价支持图片"\n  orbit-bug "登录失败" --agent none --local\n  orbit-sug "优化按钮文案" --dry-run --json\n  orbit-req --list --page 1 --page-size 20\n\nPool flags:\n  --local / --save-local = force local save instead of Hub submit\n  --save = deprecated alias for --local\n  --dry-run = generate artifact only; do not submit or save\n  --from <file> / --stdin = read input from file or stdin\n  --json = machine-readable output\n\nAdvanced agent protocol:\n  orbit-ide prepare|import|run\n  orbit-req prepare|import|run\n  orbit-bug prepare|import|run\n  orbit-sug prepare|import|run\n\nAdvanced overrides:\n  init [--repo <path>] [--backend-url <url>] [--agent <codex|claude-code|none>]\n  bind [--repo <path>] [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n  pull [--root <path>] [--backend-url <url>]\n  init-product-line [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>]\n`);
    console.log(`Pool interactive defaults:\n  orbit-req --list = interactive pagination, default 10 items/page\n  orbit-req --delete = choose an item interactively, then type yes to confirm\n  --yes is for scripts/CI; --json keeps machine-readable non-interactive output\n`);
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
function projectConfigPath(repoPath) {
    return path.join(orbitDir(repoPath), 'project.json');
}
function productLineConfigPath(rootPath) {
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
    try {
        return JSON.parse(await readFile(projectConfigPath(repoPath), 'utf8'));
    }
    catch {
        return null;
    }
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
    return `请先登录 / Please login: run orbit login --backend-url ${normalizeBackendUrl(backendUrl)}; verify account has product/project access.`;
}
function insufficientPermissionMessage(backendUrl) {
    return `权限不足 / Insufficient permission: run orbit login --backend-url ${normalizeBackendUrl(backendUrl)} with the correct account; verify account has product/project access.`;
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
        const account = (await prompt.question('Orbit account: ')).trim();
        const password = (await prompt.question('Orbit password: ', { hidden: true })).trim();
        if (!account || !password)
            throw new Error('Orbit account and password are required');
        const login = await loginOrbitHub(backendUrl, account, password);
        await saveLoginSession(backendUrl, mcpUrl, account, login);
        console.log(`Logged in to Orbit Hub as ${login.user.account ?? account}.`);
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
        || name.startsWith('orbit codex product')
        || name.startsWith('orbit codex product line')
        || name.startsWith('orbit codex module')
        || name.startsWith('orbit codex project');
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
        throw new Error(`Cannot reach Orbit Hub backend at ${url}: ${message}`);
    }
    if (!response.ok) {
        if (response.status === 401)
            throw new OrbitCliError(loginRequiredMessage(backendUrl));
        if (response.status === 403)
            throw new OrbitCliError(insufficientPermissionMessage(backendUrl));
        throw new Error(`Orbit Hub backend returned HTTP ${response.status} for ${url}`);
    }
    try {
        return await response.json();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Orbit Hub backend returned invalid JSON for ${url}: ${message}`);
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
        throw new Error(`Cannot reach Orbit Hub backend at ${url}: ${message}`);
    }
    if (!response.ok) {
        if (response.status === 401)
            throw new OrbitCliError(loginRequiredMessage(backendUrl));
        if (response.status === 403)
            throw new OrbitCliError(insufficientPermissionMessage(backendUrl));
        throw new Error(`Orbit Hub backend returned HTTP ${response.status} for ${url}`);
    }
    try {
        return await response.json();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Orbit Hub backend returned invalid JSON for ${url}: ${message}`);
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
        ?? (isJson(payload.data) ? extractId(payload.data) : null);
}
function extractUrl(payload) {
    if (!isJson(payload))
        return null;
    return safeString(payload.url)
        ?? safeString(payload.webUrl)
        ?? safeString(payload.href)
        ?? (isJson(payload.data) ? extractUrl(payload.data) : null);
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
        throw new Error('Orbit Hub backend response for /api/login did not include token/key/user data');
    }
    return session;
}
async function fetchCurrentUser(backendUrl, token) {
    const payload = await fetchOrbitJson(backendUrl, '/api/me', token);
    const rawUser = isJson(payload) && isJson(payload.user) ? payload.user : payload;
    const user = asOrbitUser(rawUser, '', isJson(payload) ? asPermissionList(payload.permissions) : []);
    if (!user.account) {
        throw new Error('Orbit Hub backend response for /api/me did not include user.account');
    }
    return user;
}
async function fetchProductLines(backendUrl, token, options = {}) {
    const payload = await fetchOrbitJson(backendUrl, '/api/products', token);
    if (!isJson(payload) || !Array.isArray(payload.products)) {
        throw new Error('Orbit Hub backend response for /api/products did not include a products array');
    }
    const products = payload.products
        .map(asProductDetail)
        .filter((entry) => Boolean(entry))
        .map(visibleProductDetail)
        .filter((entry) => Boolean(entry));
    if (products.length === 0) {
        const account = options.account ? ` for account "${options.account}"` : ' for this account';
        throw new Error(`No accessible product lines${account} at ${normalizeBackendUrl(backendUrl)}. Verify this account has product/project access for this backend.`);
    }
    return products;
}
async function fetchProductDetail(backendUrl, productLineId, token, options = {}) {
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
    ensureDir(orbitDir(repoPath));
    await writeFile(projectConfigPath(repoPath), `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
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
    ensureDir(orbitDir(rootPath));
    await writeFile(productLineConfigPath(rootPath), `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
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
    console.log(JSON.stringify({ ok: true, config: projectConfigPath(repoPath), binding }, null, 2));
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

The \`oribit-idea\` skill uses this dependency to incubate ideas through an office-hours discussion, then turns the resulting notes into Orbit-ready artifacts.
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
    }
    finally {
        prompt.close();
    }
}
function safeSlug(name) {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug || 'orbit-item';
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
async function pullCloudStructure() {
    const rootPath = path.resolve(getArg('--root') ?? process.cwd());
    const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
    const mcpUrl = resolveMcpUrl(getArg('--mcp-url'));
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
    console.log(JSON.stringify({ ok: true, config: projectConfigPath(repoPath), binding }, null, 2));
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
        console.error(`No Orbit project binding found at ${projectConfigPath(repoPath)}`);
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
async function preparePool(pool) {
    const repoPath = resolveRepoArg();
    const binding = await readProjectBinding(repoPath);
    const payload = {
        schemaVersion: 'orbit.pool.prepare.v1',
        pool: pool.pool,
        kind: pool.kind,
        displayName: pool.displayName,
        repo: repoPath,
        bound: Boolean(binding),
        binding: safeProjectBinding(binding, repoPath),
        skill: pool.skill,
        expectedArtifactSchema: 'orbit.pool.artifact.v1',
        instructions: [
            `Use ${pool.skill} when available; otherwise produce orbit.pool.artifact.v1 JSON.`,
            `Artifact kind must be ${pool.kind}.`,
            `When already running inside an Agent/Skill, generate the artifact yourself and call ${pool.command} import --stdin. This import will try Orbit Hub first; pass --local for local-only fallback/debug output.`,
            'Do not include credentials, tokens, passwords, sessions, or private keys in artifacts.',
        ],
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
        text.trim() || 'Draft artifact generated by Orbit Tools.',
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
        if (arg === '--save' || arg === '--local' || arg === '--save-local' || arg === '--dry-run' || arg === '--stdin' || arg === '--json' || arg === '--list' || arg === '--yes')
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
    const fileName = `${localDateStamp()}-${pool.pool}-${safeSlug(artifact.title)}.md`;
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
function buildRequirementPayload(artifact, repoPath) {
    return {
        title: artifact.title,
        summary: artifact.summary,
        markdown: artifact.markdown,
        content: artifact.markdown,
        artifact,
        source: {
            type: 'requirement',
            kind: artifact.kind,
            command: 'orbit-req',
            repo: repoPath,
        },
        workItems: artifact.workItems,
        sections: artifact.sections,
    };
}
async function submitRequirementToHub(binding, token, artifact, repoPath) {
    const projectId = projectApiId(binding);
    if (!projectId)
        throw new Error('project binding has no projectId/projectUuid');
    if (!token)
        throw new Error('project binding has no token and no cached login session');
    return postOrbitJson(binding.backendUrl, `/api/projects/${encodeURIComponent(projectId)}/requirements`, buildRequirementPayload(artifact, repoPath), token);
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
    if (binding && pool.kind === 'requirement') {
        try {
            const response = await submitRequirementToHub(binding, await tokenForBinding(binding), artifact, repoPath);
            return {
                ok: true,
                mode: 'hub',
                repo: repoPath,
                pool: pool.pool,
                artifact,
                id: extractId(response),
                url: extractUrl(response),
                savedPath: null,
                warning: null,
                response,
            };
        }
        catch (error) {
            const warning = `Hub submit failed; saved locally instead. ${error instanceof Error ? error.message : String(error)}`;
            const savedPath = await savePoolArtifact(pool, artifact, repoPath, source);
            return { ok: true, mode: 'local', repo: repoPath, pool: pool.pool, artifact, id: null, url: null, savedPath, warning };
        }
    }
    const reason = !binding
        ? 'No Orbit project binding found; saved locally instead.'
        : `Hub pool endpoint for ${pool.kind} is not available in this CLI; saved locally instead.`;
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
        await execFileAsync('sh', ['-lc', `command -v ${command}`]);
        return true;
    }
    catch {
        return false;
    }
}
async function resolvePoolAgent(repoPath) {
    const explicit = parsePoolAgentArg(getArg('--agent'));
    if (explicit)
        return explicit;
    const binding = await readProjectBinding(repoPath);
    if (binding?.selectedAgent)
        return binding.selectedAgent;
    const [codex, claude] = await Promise.all([commandAvailable('codex'), commandAvailable('claude')]);
    if (codex && !claude)
        return 'codex';
    if (claude && !codex)
        return 'claude-code';
    if (codex && claude && process.stdin.isTTY) {
        const prompt = await createPromptSession();
        try {
            return await promptAgent(prompt);
        }
        finally {
            prompt.close();
        }
    }
    if (codex && claude) {
        console.error('Both codex and claude are available; non-TTY defaulting to --agent none. Pass --agent to choose.');
    }
    return 'none';
}
function buildPoolAgentPrompt(pool, prepare, userInput) {
    const fallback = pool.kind === 'bug' || pool.kind === 'suggestion'
        ? `If packaged skill ${pool.skill} is unavailable, output only valid orbit.pool.artifact.v1 JSON for kind ${pool.kind}.`
        : `Use packaged skill ${pool.skill} when available and output only valid orbit.pool.artifact.v1 JSON.`;
    return [
        `You are generating an Orbit ${pool.displayName} artifact.`,
        fallback,
        'Do not write files directly. Return only the final JSON artifact.',
        '',
        'Prepare context:',
        prepare,
        '',
        'User input:',
        userInput,
    ].join('\n');
}
async function runPoolAgent(agent, repoPath, prompt) {
    const command = agent === 'codex' ? 'codex' : 'claude';
    if (!await commandAvailable(command)) {
        throw new Error(`agent not found: ${command}`);
    }
    const args = agent === 'codex' ? ['exec', prompt] : ['-p', prompt];
    try {
        const result = await execFileAsync(command, args, { cwd: repoPath, maxBuffer: 20 * 1024 * 1024 });
        return result.stdout.trim();
    }
    catch (error) {
        const message = summarizeCommandError(error);
        throw new Error(`${command} command failed: ${message}`);
    }
}
async function runPool(pool, args) {
    const repoPath = resolveRepoArg();
    const input = await readPoolInput(args);
    const agent = await resolvePoolAgent(repoPath);
    if (agent === 'none' || agent === 'current') {
        if (agent === 'current' && input.trim() && !input.trim().startsWith('{') && !/^#\s+/m.test(input)) {
            console.error('--agent current received natural language; generated a template artifact. current mode is intended for Agent-produced artifacts.');
        }
        const artifact = normalizePoolArtifact(pool, input);
        const result = await submitPoolArtifact(pool, repoPath, artifact, `${pool.command} run`);
        printPoolSubmit({ ...result, response: result.response ?? { agent } });
        return;
    }
    const binding = await readProjectBinding(repoPath);
    const prepare = JSON.stringify({
        schemaVersion: 'orbit.pool.prepare.v1',
        pool: pool.pool,
        kind: pool.kind,
        displayName: pool.displayName,
        repo: repoPath,
        bound: Boolean(binding),
        binding: safeProjectBinding(binding, repoPath),
        skill: pool.skill,
        expectedArtifactSchema: 'orbit.pool.artifact.v1',
    }, null, 2);
    const output = await runPoolAgent(agent, repoPath, buildPoolAgentPrompt(pool, prepare, input));
    const artifact = normalizePoolArtifact(pool, output);
    const result = await submitPoolArtifact(pool, repoPath, artifact, `${pool.command} run`);
    printPoolSubmit({ ...result, response: result.response ?? { agent } });
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
            message: `Delete is not supported yet for ${pool.displayName}; Orbit Hub has no confirmed pool/document delete API in this CLI.`,
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
    await runPool(pool, args);
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
