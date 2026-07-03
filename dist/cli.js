#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const defaultOutboxDir = '.axis/outbox';
const ignoredLocalPaths = ['.axis/config.local.yml', '.axis/outbox/'];
const requiredEnvFields = ['endpoint_env', 'region_env', 'access_key_id_env', 'access_key_secret_env'];
const skillNames = {
    projectInit: 'axis-project-init',
    codingCapture: 'axis-coding-capture',
    testReport: 'axis-test-report',
    ossPublish: 'axis-oss-publish',
};
function repoRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
function skillsRoot() {
    return path.join(repoRoot(), 'skills');
}
function homeDir() {
    return os.homedir();
}
function getArg(flag) {
    const index = process.argv.indexOf(flag);
    if (index === -1)
        return null;
    return process.argv[index + 1] ?? null;
}
function getArgs(flag) {
    const values = [];
    for (let index = 0; index < process.argv.length; index += 1) {
        if (process.argv[index] === flag && process.argv[index + 1]) {
            values.push(process.argv[index + 1]);
        }
    }
    return values;
}
function hasFlag(flag) {
    return process.argv.includes(flag);
}
function isHelpFlag(value) {
    return value === '--help' || value === '-h';
}
function printUsage() {
    console.log(`axis-tools

Commands:
  install [--agent <codex|claude-code|cc|all>] [--force]
  project-init --repo <path> --project-slug <slug> --display-name <name> [--force]
  validate-config --repo <path>
  coding-capture --repo <path> --title <title> --summary <summary> --status <status> --report <markdown> [--experience <markdown>] [--tag <tag>] [--run-id <run-id>]
  test-report --repo <path> --title <title> --summary <summary> --status <status> --report <markdown> [--experience <markdown>] [--tag <tag>] [--run-id <run-id>]

Skill helper scripts:
  node scripts/axis-update-skills.mjs --repo <axis-tools> --agent codex --json
  node scripts/axis-create-skill.mjs --scan-conversation <conversation.txt> --json
  node scripts/axis-skill-deposit.mjs --skill <skill-name> --commit --push --branch main

Purpose:
  Install and maintain the public Axis packaged skills in this repository.
`);
}
function requireArg(flag) {
    const value = getArg(flag);
    if (!value || value.startsWith('--')) {
        throw new Error(`${flag} is required`);
    }
    return value;
}
function repoArg() {
    return path.resolve(getArg('--repo') ?? process.cwd());
}
function toPosix(relativePath) {
    return relativePath.split(path.sep).join('/');
}
function relativeToRepo(repo, target) {
    return toPosix(path.relative(repo, target));
}
function assertSlug(slug) {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
        throw new Error('--project-slug must match ^[a-z0-9][a-z0-9-]{1,62}$');
    }
}
function defaultConfigYaml(slug, displayName) {
    return [
        'contract_version: "0.1"',
        'project:',
        `  slug: ${slug}`,
        `  display_name: ${displayName}`,
        'package:',
        `  outbox_dir: ${defaultOutboxDir}`,
        'release:',
        '  channel: private_beta',
        '  gate: not_requested',
        'oss:',
        '  provider: aliyun-oss',
        '  bucket: axis-v01-beta-packages-example',
        '  prefix: axis/v0.1/private-beta/packages',
        '  endpoint_env: ALIYUN_OSS_ENDPOINT',
        '  region_env: ALIYUN_OSS_REGION',
        '  access_key_id_env: ALIYUN_OSS_ACCESS_KEY_ID',
        '  access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET',
        '  security_token_env: ALIYUN_OSS_SECURITY_TOKEN',
        'skills:',
        `  project_init: ${skillNames.projectInit}`,
        `  coding_capture: ${skillNames.codingCapture}`,
        `  test_report: ${skillNames.testReport}`,
        `  oss_publish: ${skillNames.ossPublish}`,
        '',
    ].join('\n');
}
function parseScalar(value) {
    const trimmed = value.trim();
    if (trimmed === 'true')
        return true;
    if (trimmed === 'false')
        return false;
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function parseSimpleYaml(text) {
    const root = {};
    const stack = [{ indent: -1, value: root }];
    for (const rawLine of text.split(/\r?\n/)) {
        if (!rawLine.trim() || rawLine.trimStart().startsWith('#'))
            continue;
        const indent = rawLine.match(/^ */)?.[0].length ?? 0;
        const line = rawLine.trim();
        const separator = line.indexOf(':');
        if (separator === -1) {
            throw new Error(`Unsupported config line: ${line}`);
        }
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1);
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].value;
        if (!rawValue.trim()) {
            const child = {};
            parent[key] = child;
            stack.push({ indent, value: child });
        }
        else {
            parent[key] = parseScalar(rawValue);
        }
    }
    return root;
}
async function readAxisConfig(repo) {
    const configPath = path.join(repo, '.axis', 'config.yml');
    if (!existsSync(configPath)) {
        throw new Error('Missing .axis/config.yml. Run project-init first.');
    }
    return parseSimpleYaml(await readFile(configPath, 'utf8'));
}
function requireString(errors, value, field) {
    if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`${field} is required`);
        return null;
    }
    return value;
}
function validateAxisConfig(config) {
    const errors = [];
    if (config.contract_version !== '0.1')
        errors.push('contract_version must be "0.1"');
    const slug = requireString(errors, config.project?.slug, 'project.slug');
    if (slug && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
        errors.push('project.slug must match ^[a-z0-9][a-z0-9-]{1,62}$');
    }
    requireString(errors, config.project?.display_name, 'project.display_name');
    if (config.package?.outbox_dir !== defaultOutboxDir) {
        errors.push(`package.outbox_dir must be ${defaultOutboxDir}`);
    }
    const channel = config.release?.channel;
    const gate = config.release?.gate;
    if (channel !== 'private_beta' && channel !== 'public') {
        errors.push('release.channel must be private_beta or public');
    }
    if (gate !== 'not_requested' && gate !== 'pending' && gate !== 'passed' && gate !== 'failed') {
        errors.push('release.gate must be not_requested, pending, passed, or failed');
    }
    if (channel === 'public' && gate !== 'passed') {
        errors.push('public release requires release.gate: passed');
    }
    if (config.oss?.provider !== 'aliyun-oss')
        errors.push('oss.provider must be aliyun-oss');
    requireString(errors, config.oss?.bucket, 'oss.bucket');
    const prefix = requireString(errors, config.oss?.prefix, 'oss.prefix');
    if (prefix && (prefix.startsWith('/') || prefix.endsWith('/'))) {
        errors.push('oss.prefix must not start or end with /');
    }
    const requiredEnv = [];
    for (const field of requiredEnvFields) {
        const envName = requireString(errors, config.oss?.[field], `oss.${field}`);
        if (!envName)
            continue;
        if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) {
            errors.push(`oss.${field} must be an environment variable name`);
        }
        requiredEnv.push(envName);
    }
    const securityTokenEnv = config.oss?.security_token_env;
    if (securityTokenEnv && !/^[A-Z_][A-Z0-9_]*$/.test(securityTokenEnv)) {
        errors.push('oss.security_token_env must be an environment variable name');
    }
    if (config.skills?.project_init !== skillNames.projectInit)
        errors.push(`skills.project_init must be ${skillNames.projectInit}`);
    if (config.skills?.coding_capture !== skillNames.codingCapture)
        errors.push(`skills.coding_capture must be ${skillNames.codingCapture}`);
    if (config.skills?.test_report !== skillNames.testReport)
        errors.push(`skills.test_report must be ${skillNames.testReport}`);
    if (config.skills?.oss_publish !== skillNames.ossPublish)
        errors.push(`skills.oss_publish must be ${skillNames.ossPublish}`);
    return { errors, requiredEnv };
}
async function ensureGitignore(repo) {
    const gitignorePath = path.join(repo, '.gitignore');
    let existing = '';
    if (existsSync(gitignorePath)) {
        existing = await readFile(gitignorePath, 'utf8');
    }
    const lines = existing.split(/\r?\n/).filter((line) => line.length > 0);
    for (const ignoredPath of ignoredLocalPaths) {
        if (!lines.includes(ignoredPath))
            lines.push(ignoredPath);
    }
    await writeFile(gitignorePath, `${lines.join('\n')}\n`, 'utf8');
}
async function projectInitCommand() {
    const repo = repoArg();
    const slug = requireArg('--project-slug');
    const displayName = requireArg('--display-name');
    assertSlug(slug);
    const configPath = path.join(repo, '.axis', 'config.yml');
    await mkdir(path.dirname(configPath), { recursive: true });
    if (existsSync(configPath) && !hasFlag('--force')) {
        throw new Error('.axis/config.yml already exists. Re-run with --force to overwrite it.');
    }
    await writeFile(configPath, defaultConfigYaml(slug, displayName), 'utf8');
    await ensureGitignore(repo);
    console.log(JSON.stringify({
        ok: true,
        config_path: '.axis/config.yml',
        ignored_paths: ignoredLocalPaths,
        release: {
            channel: 'private_beta',
            gate: 'not_requested',
        },
    }, null, 2));
}
async function validateConfigCommand() {
    const repo = repoArg();
    const config = await readAxisConfig(repo);
    const { errors, requiredEnv } = validateAxisConfig(config);
    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
    console.log(JSON.stringify({
        ok: true,
        project: {
            slug: config.project?.slug,
            display_name: config.project?.display_name,
        },
        release: {
            channel: config.release?.channel,
            gate: config.release?.gate,
        },
        required_env: requiredEnv,
    }, null, 2));
}
function parseArtifactStatus() {
    const status = requireArg('--status');
    if (status !== 'passed' && status !== 'failed' && status !== 'partial' && status !== 'informational') {
        throw new Error('--status must be passed, failed, partial, or informational');
    }
    return status;
}
function buildRunId(assetType) {
    const provided = getArg('--run-id');
    if (provided) {
        if (!/^\d{8}T\d{6}Z-[a-z0-9-]+-[a-f0-9]{8}$/.test(provided)) {
            throw new Error('--run-id must match YYYYMMDDThhmmssZ-name-8hex');
        }
        return provided;
    }
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `${timestamp}-${assetType.replace('_', '-')}-${randomBytes(4).toString('hex')}`;
}
async function readTextArg(flag, fileFlag, fallback = null) {
    const filePath = getArg(fileFlag);
    if (filePath)
        return readFile(path.resolve(filePath), 'utf8');
    const value = getArg(flag);
    if (value)
        return value;
    if (fallback !== null)
        return fallback;
    throw new Error(`${flag} or ${fileFlag} is required`);
}
function defaultExperience(title) {
    return [
        '# Experience',
        '',
        '## Context',
        `${title} was generated as a local-only Axis v0.1 package.`,
        '',
        '## Decision',
        'Write public-safe package files to the local outbox before any OSS upload.',
        '',
        '## Steps',
        'Validate configuration, write metadata, write report, write experience, then write manifest.',
        '',
        '## Validation',
        'Package files were written locally with manifest checksums and byte counts.',
        '',
        '## Reuse Notes',
        'Reuse this pattern for local package creation before a release gate or OSS publish step.',
        '',
        '## Public Safety',
        'Reviewed; no credentials or private URLs are included.',
        '',
    ].join('\n');
}
async function gitValue(repo, args, fallback) {
    try {
        const { stdout } = await execFileAsync('git', args, { cwd: repo });
        return stdout.trim() || fallback;
    }
    catch {
        return fallback;
    }
}
async function gitInfo(repo) {
    const branch = await gitValue(repo, ['branch', '--show-current'], 'unknown');
    const commit = await gitValue(repo, ['rev-parse', 'HEAD'], 'unknown');
    const statusText = await gitValue(repo, ['status', '--short'], '');
    return {
        branch,
        commit: /^[a-f0-9]{40}$/.test(commit) ? commit : 'unknown',
        dirty: statusText.length > 0,
    };
}
async function fileEntry(packageDir, kind, fileName, mediaType) {
    const filePath = path.join(packageDir, fileName);
    const content = await readFile(filePath);
    const stats = await stat(filePath);
    return {
        kind,
        path: fileName,
        media_type: mediaType,
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: stats.size,
    };
}
function skillNameForAsset(assetType) {
    return assetType === 'test_report' ? skillNames.testReport : skillNames.codingCapture;
}
function skillResponsibilityForAsset(assetType) {
    if (assetType === 'test_report') {
        return 'Run configured validation commands and write a public-safe report.';
    }
    return 'Convert coding work into a public-safe local package.';
}
async function writePackageCommand(assetType) {
    const repo = repoArg();
    const config = await readAxisConfig(repo);
    const { errors } = validateAxisConfig(config);
    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
    const slug = config.project?.slug;
    const displayName = config.project?.display_name;
    const outboxDir = config.package?.outbox_dir;
    const releaseChannel = config.release?.channel;
    const releaseGate = config.release?.gate;
    const title = requireArg('--title');
    const summary = requireArg('--summary');
    if (summary.length > 500) {
        throw new Error('--summary must be 500 characters or less');
    }
    const artifactStatus = parseArtifactStatus();
    const tags = getArgs('--tag').map((tag) => tag.toLowerCase());
    const report = await readTextArg('--report', '--report-file');
    const experience = await readTextArg('--experience', '--experience-file', defaultExperience(title));
    const runId = buildRunId(assetType);
    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const packageDir = path.join(repo, outboxDir, 'v0.1', slug, runId);
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });
    const metadata = {
        schema: 'axis.package.metadata',
        schema_version: '0.1',
        title,
        summary,
        tags,
        artifact: {
            type: assetType,
            status: artifactStatus,
            started_at: createdAt,
            finished_at: createdAt,
        },
        skill: {
            name: skillNameForAsset(assetType),
            responsibility: skillResponsibilityForAsset(assetType),
        },
        public_safety: {
            reviewed: true,
            contains_credentials: false,
            contains_private_urls: false,
            redaction_notes: 'No credentials, private URLs, or customer-specific identifiers were included.',
        },
        links: {
            manifest_path: 'manifest.json',
            report_path: 'report.md',
            experience_path: 'experience.md',
        },
    };
    await writeFile(path.join(packageDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    await writeFile(path.join(packageDir, 'report.md'), report.endsWith('\n') ? report : `${report}\n`, 'utf8');
    await writeFile(path.join(packageDir, 'experience.md'), experience.endsWith('\n') ? experience : `${experience}\n`, 'utf8');
    const git = await gitInfo(repo);
    const baseUri = `oss://${config.oss?.bucket}/${config.oss?.prefix}/${slug}/${runId}/`;
    const manifest = {
        schema: 'axis.package.manifest',
        schema_version: '0.1',
        package_id: `${slug}__${runId}`,
        created_at: createdAt,
        project: {
            slug,
            display_name: displayName,
        },
        producer: {
            skill: skillNameForAsset(assetType),
            agent: 'codex',
        },
        run: {
            run_id: runId,
            git,
        },
        release: {
            channel: releaseChannel,
            gate: releaseGate,
        },
        files: [
            await fileEntry(packageDir, 'metadata', 'metadata.json', 'application/json'),
            await fileEntry(packageDir, 'report', 'report.md', 'text/markdown'),
            await fileEntry(packageDir, 'experience', 'experience.md', 'text/markdown'),
            {
                kind: 'manifest',
                path: 'manifest.json',
                media_type: 'application/json',
                sha256: '0'.repeat(64),
                bytes: 0,
            },
        ],
        publish: {
            provider: 'aliyun-oss',
            status: 'local_ready',
            bucket: config.oss?.bucket,
            prefix: config.oss?.prefix,
            base_uri: baseUri,
        },
    };
    const manifestPath = path.join(packageDir, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    manifest.files[3] = await fileEntry(packageDir, 'manifest', 'manifest.json', 'application/json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: true,
        asset_type: assetType,
        package_dir: relativeToRepo(repo, packageDir),
        files: manifest.files.map((file) => file.path),
    }, null, 2));
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
function selectedAgents(agent) {
    if (agent === 'all')
        return ['codex', 'claude-code'];
    return [agent];
}
function agentSkillDir(agent, skillName) {
    if (agent === 'codex')
        return path.join(homeDir(), '.codex', 'skills', skillName);
    return path.join(homeDir(), '.claude', 'skills', skillName);
}
async function packagedSkillNames() {
    const root = skillsRoot();
    const entries = await readdir(root, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (existsSync(path.join(root, entry.name, 'SKILL.md'))) {
            names.push(entry.name);
        }
    }
    return names.sort();
}
async function collectRelativeFiles(root) {
    const files = [];
    async function visit(current) {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === '__pycache__' || entry.name === '.DS_Store' || entry.name === '.git')
                continue;
            const child = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await visit(child);
            }
            else if (entry.isFile() && !entry.name.endsWith('.pyc')) {
                files.push(path.relative(root, child));
            }
        }
    }
    await visit(root);
    return files.sort();
}
async function directoriesIdentical(sourceDir, targetDir) {
    if (!existsSync(targetDir))
        return false;
    const sourceFiles = await collectRelativeFiles(sourceDir);
    const targetFiles = await collectRelativeFiles(targetDir);
    if (sourceFiles.length !== targetFiles.length)
        return false;
    for (let index = 0; index < sourceFiles.length; index += 1) {
        if (sourceFiles[index] !== targetFiles[index])
            return false;
        const [sourceText, targetText] = await Promise.all([
            readFile(path.join(sourceDir, sourceFiles[index])),
            readFile(path.join(targetDir, targetFiles[index])),
        ]);
        if (!sourceText.equals(targetText))
            return false;
    }
    return true;
}
async function copySkillBundle(sourceDir, targetDir, force) {
    await mkdir(path.dirname(targetDir), { recursive: true });
    if (existsSync(targetDir)) {
        if (await directoriesIdentical(sourceDir, targetDir))
            return 'identical';
        if (!force) {
            throw new Error(`Refusing to overwrite modified skill directory at ${targetDir}. Re-run with --force to replace it.`);
        }
        await rm(targetDir, { recursive: true, force: true });
    }
    await cp(sourceDir, targetDir, { recursive: true });
    return 'copied';
}
async function installPackagedSkills(agent, force) {
    const names = await packagedSkillNames();
    if (names.length === 0) {
        throw new Error(`No packaged skills found under ${skillsRoot()}`);
    }
    const installed = [];
    for (const skillName of names) {
        const source = path.join(skillsRoot(), skillName);
        for (const selectedAgent of selectedAgents(agent)) {
            const target = agentSkillDir(selectedAgent, skillName);
            installed.push({
                skill: skillName,
                target,
                status: await copySkillBundle(source, target, force),
            });
        }
    }
    return installed;
}
async function installCommand() {
    const agent = parseInstallAgentArg(getArg('--agent'));
    const installed = await installPackagedSkills(agent, hasFlag('--force'));
    console.log(JSON.stringify({ ok: true, agent, installed }, null, 2));
}
async function main() {
    const command = process.argv[2];
    if (!command || isHelpFlag(command)) {
        printUsage();
        return;
    }
    if (command === 'install') {
        if (isHelpFlag(process.argv[3])) {
            printUsage();
            return;
        }
        await installCommand();
        return;
    }
    if (command === 'project-init') {
        if (isHelpFlag(process.argv[3])) {
            printUsage();
            return;
        }
        await projectInitCommand();
        return;
    }
    if (command === 'validate-config') {
        if (isHelpFlag(process.argv[3])) {
            printUsage();
            return;
        }
        await validateConfigCommand();
        return;
    }
    if (command === 'coding-capture') {
        await writePackageCommand('coding_capture');
        return;
    }
    if (command === 'test-report') {
        await writePackageCommand('test_report');
        return;
    }
    printUsage();
    process.exitCode = 1;
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
