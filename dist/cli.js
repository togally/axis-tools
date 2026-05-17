#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
function printUsage() {
    console.log(`orbit-tools\n\nCommands:\n  codex-hook ingest [--file <json-file>] [--repo <path>]\n  codex-status current [--repo <path>] [--json]\n  codex-status tail [--repo <path>] [--limit <n>]\n  codex-status summary [--repo <path>]\n  codex-run once --repo <path> --prompt <text> [--json] [--model <model>]\n`);
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
async function main() {
    const [, , group, command] = process.argv;
    if (!group) {
        printUsage();
        process.exit(0);
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
    printUsage();
    process.exit(1);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
