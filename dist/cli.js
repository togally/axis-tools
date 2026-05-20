#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { appendFile, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
const SHARED_BACKEND_URL = 'http://117.72.14.134:18081';
function printUsage() {
    console.log(`orbit-tools\n\nCommands:\n  init\n  init-product-line\n  install [--agent <codex|claude-code|cc|all>] [--force]\n  logout [--backend-url <url>]\n  codex-hook ingest [--file <json-file>] [--repo <path>]\n  codex-status current [--repo <path>] [--json]\n  codex-status tail [--repo <path>] [--limit <n>]\n  codex-status summary [--repo <path>]\n  codex-run once --repo <path> --prompt <text> [--json] [--model <model>]\n  mcp install [--repo <path>] [--config <hermes-config>] [--backend-url <url>] [--mcp-url <url>] [--server-name <name>]\n  project bind --interactive [--repo <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project bind [--repo <path>] --product-line-uuid <uuid> --project-uuid <uuid> [--product-line-id <id>] [--project-id <id>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>]\n  project show [--repo <path>] [--json]\n\nAdvanced init overrides:\n  init [--repo <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--login] [--force-login]\n  init-product-line [--root <path>] [--owner <name>] [--backend-url <url>] [--mcp-url <url>] [--agent <codex|claude-code|none>] [--login] [--force-login]\n`);
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
    await writeFile(filePath, `${JSON.stringify({ ...current, ...values, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
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
function asOrbitUser(value, account) {
    if (!isJson(value))
        return { account, name: account };
    return {
        id: safeString(value.id),
        account: safeString(value.account) ?? account,
        name: safeString(value.name) ?? safeString(value.account) ?? account,
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
        user: asOrbitUser(value.user, account),
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
async function cachedLoginSession(backendUrl) {
    const config = await readGlobalOrbitConfig();
    return asCachedLoginSession(globalSessions(config)[normalizeBackendUrl(backendUrl)]);
}
async function writeGlobalOrbitConfigObject(config) {
    const filePath = globalOrbitConfigPath();
    ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}
async function saveLoginSession(backendUrl, mcpUrl, account, login) {
    const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
    const cached = {
        backendUrl: normalizedBackendUrl,
        mcpUrl,
        account,
        token: login.token,
        key: login.key,
        session: login.session,
        user: login.user,
        updatedAt: new Date().toISOString(),
    };
    const config = await readGlobalOrbitConfig();
    config.sessions = {
        ...globalSessions(config),
        [normalizedBackendUrl]: cached,
    };
    config.backendUrl = normalizedBackendUrl;
    config.mcpUrl = mcpUrl;
    config.token = cached.token;
    config.key = cached.key;
    config.session = cached.session;
    config.account = cached.account;
    config.user = cached.user;
    await writeGlobalOrbitConfigObject(config);
    return cached;
}
async function acquireLoginSession(prompt, backendUrl, mcpUrl, forceLogin) {
    if (!forceLogin) {
        const cached = await cachedLoginSession(backendUrl);
        if (cached) {
            return { login: cached, account: cached.account, fromCache: true };
        }
    }
    const account = (await prompt.question('Orbit account: ')).trim();
    const password = (await prompt.question('Orbit password: ')).trim();
    if (!account || !password) {
        throw new Error('Orbit account and password are required');
    }
    const login = await loginOrbitHub(backendUrl, account, password);
    const cached = await saveLoginSession(backendUrl, mcpUrl, account, login);
    return { login: cached, account, fromCache: false };
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
async function loginOrbitHub(backendUrl, account, password) {
    const payload = await postOrbitJson(backendUrl, '/api/login', { account, password });
    const session = asLoginSession(payload, account);
    if (!session) {
        throw new Error('Orbit Hub backend response for /api/login did not include token/key/user data');
    }
    return session;
}
async function fetchProductLines(backendUrl, token) {
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
        throw new Error(`No product lines found in Orbit Hub at ${normalizeBackendUrl(backendUrl)}. Create a product line first.`);
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
    const repo = module.githubRepo ?? module.sourceRepo ?? module.repoPath;
    if (repo)
        parts.push(`- ${repo}`);
    return parts.join(' ');
}
async function createPromptSession() {
    if (process.stdin.isTTY) {
        return createInterface({ input: process.stdin, output: process.stdout });
    }
    let input = '';
    for await (const chunk of process.stdin) {
        input += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    }
    const answers = input.split(/\r?\n/);
    return {
        async question(prompt) {
            process.stdout.write(prompt);
            const answer = answers.shift();
            if (answer === undefined) {
                throw new Error('No input received for interactive project bind selection');
            }
            process.stdout.write(`${answer}\n`);
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
    await writeGlobalOrbitConfig({
        backendUrl: binding.backendUrl,
        mcpUrl: binding.mcpUrl,
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
    });
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
    return {
        backendUrl: values.backendUrl,
        mcpUrl: values.mcpUrl,
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
    return {
        backendUrl: values.backendUrl,
        mcpUrl: values.mcpUrl,
        token: values.login.token,
        key: values.login.key,
        session: values.login.session,
        account: values.account,
        user: values.login.user,
        productLineUuid: values.productDetail.product.uuid,
        productLineId: values.productDetail.product.id,
        productLineName: values.productDetail.product.name,
        rootPath: values.rootPath,
        selectedAgent: values.selectedAgent,
        skillPath: values.skillPath,
        agentSkillPath: values.agentSkillPath,
        updatedAt: new Date().toISOString(),
    };
}
async function writeProductLineBinding(rootPath, binding) {
    ensureDir(orbitDir(rootPath));
    await writeFile(productLineConfigPath(rootPath), `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
    await writeGlobalOrbitConfig({
        backendUrl: binding.backendUrl,
        mcpUrl: binding.mcpUrl,
        token: binding.token,
        key: binding.key,
        session: binding.session,
        account: binding.account,
        user: binding.user,
        productLineUuid: binding.productLineUuid,
        productLineId: binding.productLineId,
        productLineName: binding.productLineName,
        selectedAgent: binding.selectedAgent,
        skillPath: binding.skillPath,
        agentSkillPath: binding.agentSkillPath,
        lastProductLineRoot: rootPath,
    });
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
    try {
        ({ productDetail, selectedProject } = await promptProjectSelection(prompt, backendUrl));
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
description: Dependency skill for running gstack office-hours discussions used by Orbit Office Idea.
---

# Gstack Office Hours

Use this dependency skill when another skill asks for gstack's \`office-hours\` capability/skill.

Run the office-hours discussion with:

\`\`\`bash
gstack office-hours
\`\`\`

The \`orbit-office-idea\` skill uses this dependency to incubate ideas through an office-hours discussion, then turns the resulting notes into Orbit-ready artifacts.
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
    const existing = await readProjectBinding(repoPath);
    const backendUrl = getArg('--backend-url') ?? existing?.backendUrl ?? defaultBackendUrl();
    const mcpUrl = getArg('--mcp-url') ?? existing?.mcpUrl ?? defaultMcpUrl(backendUrl);
    const ownerArg = getArg('--owner');
    const forceLogin = hasFlag('--login') || hasFlag('--force-login');
    const prompt = await createPromptSession();
    let account = '';
    let login;
    let productDetail;
    let selectedProject;
    let selectedAgent;
    try {
        ({ login, account } = await acquireLoginSession(prompt, backendUrl, mcpUrl, forceLogin));
        ({ productDetail, selectedProject } = await promptProjectSelection(prompt, backendUrl, login.token));
        selectedAgent = await promptAgent(prompt);
    }
    finally {
        prompt.close();
    }
    const owner = ownerArg ?? login.user.account ?? account;
    const install = await installPackagedSkills(selectedAgent, true);
    const binding = buildProjectBinding({
        repoPath,
        backendUrl,
        mcpUrl,
        owner,
        productDetail,
        selectedProject,
        login,
        account,
        selectedAgent,
        skillPath: install.skillPath,
        agentSkillPath: install.agentSkillPath,
    });
    await writeProjectBinding(repoPath, binding);
    console.log(JSON.stringify({ ok: true, config: projectConfigPath(repoPath), binding }, null, 2));
}
async function setupProductLineRoot() {
    const rootPath = resolveProductLineRootArg();
    const backendUrl = getArg('--backend-url') ?? defaultBackendUrl();
    const mcpUrl = getArg('--mcp-url') ?? defaultMcpUrl(backendUrl);
    const ownerArg = getArg('--owner');
    const selectedAgent = parseAgentArg(getArg('--agent'));
    const forceLogin = hasFlag('--login') || hasFlag('--force-login');
    const prompt = await createPromptSession();
    let account = '';
    let login;
    let productDetail;
    const bound = [];
    const skipped = [];
    try {
        ({ login, account } = await acquireLoginSession(prompt, backendUrl, mcpUrl, forceLogin));
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
async function bindProject() {
    const repoPath = resolveRepoArg();
    const existing = await readProjectBinding(repoPath);
    const backendUrl = getArg('--backend-url') ?? existing?.backendUrl ?? defaultBackendUrl();
    const mcpUrl = getArg('--mcp-url') ?? existing?.mcpUrl ?? defaultMcpUrl(backendUrl);
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
        mcpUrl,
        productLineUuid,
        projectUuid,
        owner,
        repo: repoPath,
        updatedAt: new Date().toISOString(),
    };
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
async function main() {
    const [, , group, command] = process.argv;
    if (!group) {
        printUsage();
        process.exit(0);
    }
    if (group === 'init' || group === 'setup') {
        await setupRepo();
        return;
    }
    if (group === 'init-product-line') {
        await setupProductLineRoot();
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
main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
