#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, readlink, readdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
const packagedSkillNamePattern = /^axis-(?:code|doc|integration|ops|test|tools|trade)-[a-z0-9][a-z0-9-]*$/;
const retiredPackagedSkills = new Map([
    ['axis-ali-dashboard', 'axis-ops-ali-dashboard'],
    ['axis-api-performance-tuning', 'axis-code-api-performance-tuning'],
    ['axis-arch-optimize', 'axis-code-arch-optimize'],
    ['axis-benchmark', 'axis-test-benchmark'],
    ['axis-bugfix', 'axis-code-bugfix'],
    ['axis-business-domain-doc', 'axis-doc-project-knowledge'],
    ['axis-coding-capture', 'axis-code-capture'],
    ['axis-create-skill', 'axis-tools-skill-create'],
    ['axis-db-design-doc', 'axis-doc-development'],
    ['axis-development-doc', 'axis-doc-development'],
    ['axis-doc-dashbord', 'axis-doc-dashboard'],
    ['axis-skill-create', 'axis-tools-skill-create'],
    ['axis-skill-update', 'axis-tools-skill-update'],
]);
const execFileAsync = promisify(execFile);
const defaultOutboxDir = '.axis/outbox';
const ignoredLocalPaths = ['.axis/config.local.yml', '.axis/docs/', '.axis/outbox/'];
const requiredEnvFields = ['endpoint_env', 'region_env', 'access_key_id_env', 'access_key_secret_env'];
const skillNames = {
    projectInit: 'axis-doc-project-init',
    codingCapture: 'axis-code-capture',
    testReport: 'axis-test-report',
    projectKnowledge: 'axis-doc-project-knowledge',
    ossPublish: 'axis-ops-oss-publish',
};
const protocolVersions = {
    document_protocol: '0.2',
    workflow_protocol: '0.2',
    experience_protocol: '0.2',
    agent_execution_protocol: '0.2',
};
const expiredV01Message = 'Axis v0.1 is expired; migrate with project-init --repo <path> --inspect --json, confirm the v0.2 answers, then apply them';
const publicSafetyValidators = [
    'deterministic_secret_scan',
    'private_url_scan',
    'manual_public_safe_review',
];
async function projectInitApi() {
    return import('./project-init/index.js');
}
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
  install [--agent <codex|claude-code|cc|all>] [--skill <skill-name>] [--dry-run] [--force] [--backup-dir <path>] [--rollback <backup-dir-or-manifest>]
  inventory [--agent <codex|claude-code|cc|all>] [--skill <skill-name>]
  project-init --repo <path> --inspect --json [--registry-path <relative-path>] [--organization-id <id>] [--oss-profile <name>]
  project-init --repo <path> --answers-file <path> --apply
  project-init --repo <path> --recover
  validate-config --repo <path>
  coding-capture --repo <path> --title <title> --summary <summary> --status <status> --report <markdown> [--experience <markdown>] [--tag <tag>] [--run-id <run-id>]
  test-report --repo <path> --title <title> --summary <summary> --status <status> --report <markdown> [--experience <markdown>] [--tag <tag>] [--run-id <run-id>]
  project-knowledge-capture --repo <path> [--run-id <run-id>] [--language <zh-CN>]
  oss-publish --repo <path> --run-id <run-id> [--dry-run | --local-only]

Skill helper scripts:
  node scripts/axis-skill-update.mjs --repo <axis-tools> --agent codex --json
  node scripts/axis-skill-create.mjs --scan-conversation <conversation.txt> --json
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
function inlineYamlScalarItems(value) {
    const items = [];
    let current = '';
    let quote = null;
    for (const character of value) {
        if (quote !== null) {
            current += character;
            if (character === quote)
                quote = null;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            current += character;
            continue;
        }
        if (character === ',') {
            items.push(current.trim());
            current = '';
            continue;
        }
        current += character;
    }
    if (quote !== null)
        throw new Error(`Unsupported unterminated inline YAML string: ${value}`);
    items.push(current.trim());
    return items;
}
function parseScalar(value) {
    const trimmed = value.trim();
    if (trimmed === 'true')
        return true;
    if (trimmed === 'false')
        return false;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const content = trimmed.slice(1, -1).trim();
        if (!content)
            return [];
        const items = inlineYamlScalarItems(content);
        if (items.some((item) => !item || /^(?:\[|\{|\]|\})/.test(item))) {
            throw new Error(`Unsupported inline YAML array: ${trimmed}`);
        }
        return items.map((item) => parseScalar(item));
    }
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function isSimpleYamlObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function parseKeyValue(line) {
    const separator = line.indexOf(':');
    if (separator === -1) {
        throw new Error(`Unsupported config line: ${line}`);
    }
    return {
        key: line.slice(0, separator).trim(),
        rawValue: line.slice(separator + 1),
    };
}
function parseSimpleYaml(text) {
    const lines = text.split(/\r?\n/)
        .filter((rawLine) => rawLine.trim() && !rawLine.trimStart().startsWith('#'))
        .map((rawLine) => ({
        indent: rawLine.match(/^ */)?.[0].length ?? 0,
        content: rawLine.trim(),
    }));
    let index = 0;
    const parseBlock = (indent) => {
        if (index >= lines.length || lines[index].indent < indent)
            return {};
        if (lines[index].indent !== indent) {
            throw new Error(`Unsupported config indentation: ${lines[index].content}`);
        }
        return lines[index].content.startsWith('- ') ? parseArray(indent) : parseMap(indent);
    };
    const parseMap = (indent) => {
        const object = {};
        while (index < lines.length) {
            const line = lines[index];
            if (line.indent < indent)
                break;
            if (line.indent !== indent || line.content.startsWith('- '))
                break;
            const { key, rawValue } = parseKeyValue(line.content);
            index += 1;
            if (rawValue.trim()) {
                object[key] = parseScalar(rawValue);
            }
            else if (index < lines.length
                && (lines[index].indent > indent
                    || (lines[index].indent === indent && lines[index].content.startsWith('- ')))) {
                object[key] = parseBlock(lines[index].indent);
            }
            else {
                object[key] = {};
            }
        }
        return object;
    };
    const parseArray = (indent) => {
        const values = [];
        while (index < lines.length && lines[index].indent === indent && lines[index].content.startsWith('- ')) {
            const itemText = lines[index].content.slice(2).trim();
            index += 1;
            if (!itemText) {
                values.push(index < lines.length && lines[index].indent > indent ? parseBlock(lines[index].indent) : {});
                continue;
            }
            if (itemText.includes(':')) {
                const { key, rawValue } = parseKeyValue(itemText);
                const object = {};
                if (rawValue.trim()) {
                    object[key] = parseScalar(rawValue);
                }
                else if (index < lines.length && lines[index].indent > indent) {
                    object[key] = parseBlock(lines[index].indent);
                }
                else {
                    object[key] = {};
                }
                if (index < lines.length && lines[index].indent > indent) {
                    const rest = parseBlock(lines[index].indent);
                    if (!isSimpleYamlObject(rest)) {
                        throw new Error(`Unsupported array item continuation: ${itemText}`);
                    }
                    Object.assign(object, rest);
                }
                values.push(object);
            }
            else {
                values.push(parseScalar(itemText));
            }
        }
        return values;
    };
    if (lines.length === 0)
        return {};
    const parsed = parseBlock(lines[0].indent);
    if (!isSimpleYamlObject(parsed)) {
        throw new Error('Root YAML value must be a mapping');
    }
    return parsed;
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
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function collectionRecords(value, keyField) {
    if (Array.isArray(value)) {
        return value.filter(isRecord);
    }
    if (!isRecord(value))
        return [];
    return Object.entries(value)
        .filter((entry) => isRecord(entry[1]))
        .map(([key, record]) => ({
        ...record,
        [keyField]: typeof record[keyField] === 'string' ? record[keyField] : key,
    }));
}
function validateProjectReleaseSkills(config, errors) {
    const slug = requireString(errors, config.project?.slug, 'project.slug');
    if (slug && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
        errors.push('project.slug must match ^[a-z0-9][a-z0-9-]{1,62}$');
    }
    const displayName = requireString(errors, config.project?.display_name, 'project.display_name');
    if (config.package?.outbox_dir !== defaultOutboxDir) {
        errors.push(`package.outbox_dir must be ${defaultOutboxDir}`);
    }
    const channel = config.release?.channel;
    const gate = config.release?.gate;
    let releaseChannel = null;
    let releaseGate = null;
    if (channel !== 'private_beta' && channel !== 'public') {
        errors.push('release.channel must be private_beta or public');
    }
    else {
        releaseChannel = channel;
    }
    if (gate !== 'not_requested' && gate !== 'pending' && gate !== 'passed' && gate !== 'failed') {
        errors.push('release.gate must be not_requested, pending, passed, or failed');
    }
    else {
        releaseGate = gate;
    }
    if (channel === 'public' && gate !== 'passed') {
        errors.push('public release requires release.gate: passed');
    }
    if (config.skills?.project_init !== skillNames.projectInit)
        errors.push(`skills.project_init must be ${skillNames.projectInit}`);
    if (config.skills?.coding_capture !== skillNames.codingCapture)
        errors.push(`skills.coding_capture must be ${skillNames.codingCapture}`);
    if (config.skills?.test_report !== skillNames.testReport)
        errors.push(`skills.test_report must be ${skillNames.testReport}`);
    if (config.skills?.oss_publish !== skillNames.ossPublish)
        errors.push(`skills.oss_publish must be ${skillNames.ossPublish}`);
    return { slug, displayName, channel: releaseChannel, gate: releaseGate };
}
function validateOssTarget(errors, source, fieldPrefix) {
    const provider = source?.provider;
    if (provider !== 'aliyun-oss')
        errors.push(`${fieldPrefix}.provider must be aliyun-oss`);
    const bucket = requireString(errors, source?.bucket, `${fieldPrefix}.bucket`);
    const prefix = requireString(errors, source?.prefix, `${fieldPrefix}.prefix`);
    if (prefix && (prefix.startsWith('/') || prefix.endsWith('/'))) {
        errors.push(`${fieldPrefix}.prefix must not start or end with /`);
    }
    const requiredEnv = [];
    for (const field of requiredEnvFields) {
        const envName = requireString(errors, source?.[field], `${fieldPrefix}.${field}`);
        if (!envName)
            continue;
        if (!/^[A-Z_][A-Z0-9_]*$/.test(envName)) {
            errors.push(`${fieldPrefix}.${field} must be an environment variable name`);
        }
        requiredEnv.push(envName);
    }
    const securityTokenEnv = source?.security_token_env;
    if (securityTokenEnv && typeof securityTokenEnv !== 'string') {
        errors.push(`${fieldPrefix}.security_token_env must be an environment variable name`);
    }
    if (typeof securityTokenEnv === 'string' && !/^[A-Z_][A-Z0-9_]*$/.test(securityTokenEnv)) {
        errors.push(`${fieldPrefix}.security_token_env must be an environment variable name`);
    }
    if (errors.length > 0 || provider !== 'aliyun-oss' || !bucket || !prefix) {
        return { oss: null, requiredEnv };
    }
    return {
        oss: {
            provider,
            bucket,
            prefix,
            endpoint_env: source?.endpoint_env,
            region_env: source?.region_env,
            access_key_id_env: source?.access_key_id_env,
            access_key_secret_env: source?.access_key_secret_env,
            security_token_env: typeof securityTokenEnv === 'string' ? securityTokenEnv : undefined,
        },
        requiredEnv,
    };
}
function withLocalOssEnvOverrides(profile, overrides) {
    if (!overrides)
        return profile;
    const merged = { ...profile };
    for (const field of requiredEnvFields) {
        if (overrides[field])
            merged[field] = overrides[field];
    }
    if (overrides.security_token_env)
        merged.security_token_env = overrides.security_token_env;
    return merged;
}
function findDuplicateProjectSlugs(organization) {
    const slugs = [];
    const collect = (projects) => {
        for (const project of collectionRecords(projects, 'slug')) {
            if (typeof project.slug === 'string')
                slugs.push(project.slug);
        }
    };
    collect(organization.projects);
    for (const product of collectionRecords(organization.products, 'slug')) {
        collect(product.projects);
    }
    const seen = new Set();
    const duplicates = new Set();
    for (const slug of slugs) {
        if (seen.has(slug))
            duplicates.add(slug);
        seen.add(slug);
    }
    return [...duplicates].sort();
}
async function readOrganizationRegistry(repo, registryPath) {
    if (path.isAbsolute(registryPath) || registryPath.split(/[\\/]+/).includes('..')) {
        throw new Error('organization.registry must be a relative path inside the repo');
    }
    const absolutePath = path.resolve(repo, registryPath);
    const repoWithSeparator = repo.endsWith(path.sep) ? repo : `${repo}${path.sep}`;
    if (!absolutePath.startsWith(repoWithSeparator)) {
        throw new Error('organization.registry must be a relative path inside the repo');
    }
    if (!existsSync(absolutePath)) {
        throw new Error(`organization registry file not found: ${registryPath}`);
    }
    return parseSimpleYaml(await readFile(absolutePath, 'utf8'));
}
async function resolveAxisConfig(repo, config, options = {}) {
    const errors = [];
    if (config.contract_version === '0.1') {
        return { errors: [expiredV01Message], requiredEnv: [], effectiveConfig: null };
    }
    if (config.contract_version !== '0.2') {
        errors.push('contract_version must be "0.2"');
    }
    const common = validateProjectReleaseSkills(config, errors);
    const baseConfig = {
        project: {
            slug: common.slug ?? '',
            display_name: common.displayName ?? '',
        },
        package: {
            outbox_dir: defaultOutboxDir,
        },
        release: {
            channel: common.channel ?? 'private_beta',
            gate: common.gate ?? 'not_requested',
        },
        skills: {
            project_init: skillNames.projectInit,
            coding_capture: skillNames.codingCapture,
            test_report: skillNames.testReport,
            oss_publish: skillNames.ossPublish,
        },
    };
    if (config.oss?.provider !== 'aliyun-oss')
        errors.push('oss.provider must be aliyun-oss');
    if (config.oss?.bucket)
        errors.push('oss.bucket is not allowed for contract_version "0.2"; use oss.profile');
    if (config.oss?.prefix)
        errors.push('oss.prefix is not allowed for contract_version "0.2"; use oss.profile');
    const organizationId = requireString(errors, config.organization?.id, 'organization.id');
    if (organizationId && !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(organizationId)) {
        errors.push('organization.id must match ^[a-z0-9][a-z0-9_-]{1,62}$');
    }
    const registryPath = requireString(errors, config.organization?.registry, 'organization.registry');
    const profileName = requireString(errors, config.oss?.profile, 'oss.profile');
    if (profileName && !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(profileName)) {
        errors.push('oss.profile must match ^[a-z0-9][a-z0-9_-]{1,62}$');
    }
    if (!organizationId || !registryPath || !profileName) {
        return { errors, requiredEnv: [], effectiveConfig: null };
    }
    let registry = null;
    if (options.registryOverride) {
        registry = options.registryOverride;
    }
    else {
        try {
            registry = await readOrganizationRegistry(repo, registryPath);
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }
    if (!registry)
        return { errors, requiredEnv: [], effectiveConfig: null };
    if (registry.schema && registry.schema !== 'axis.organization_registry') {
        errors.push('organization registry schema must be axis.organization_registry');
    }
    if (registry.schema_version !== '0.2') {
        errors.push('organization registry schema_version must be "0.2"');
    }
    const organization = collectionRecords(registry.organizations, 'id')
        .find((candidate) => candidate.id === organizationId);
    if (!organization) {
        errors.push('organization.id is not declared in the organization registry');
        return { errors, requiredEnv: [], effectiveConfig: null };
    }
    const organizationSlug = requireString(errors, organization.slug, 'organization registry organization.slug');
    const organizationDisplayName = requireString(errors, organization.display_name, 'organization registry organization.display_name');
    const duplicateSlugs = findDuplicateProjectSlugs(organization);
    if (duplicateSlugs.length > 0) {
        errors.push(`project.slug is duplicated inside organization.id ${organizationId}: ${duplicateSlugs.join(', ')}`);
    }
    const profile = collectionRecords(organization.oss_profiles, 'name')
        .find((candidate) => candidate.name === profileName);
    if (!profile) {
        errors.push('oss.profile is not declared for organization.id');
        return { errors, requiredEnv: [], effectiveConfig: null };
    }
    const resolvedProfile = withLocalOssEnvOverrides(profile, options.localOssEnvOverrides);
    const { oss, requiredEnv } = validateOssTarget(errors, resolvedProfile, 'organization registry oss_profile');
    if (oss) {
        oss.profile = profileName;
    }
    return {
        errors,
        requiredEnv,
        effectiveConfig: errors.length === 0 && oss && organizationSlug && organizationDisplayName ? {
            contract_version: '0.2',
            organization: {
                id: organizationId,
                slug: organizationSlug,
                display_name: organizationDisplayName,
            },
            ...baseConfig,
            oss,
        } : null,
    };
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
async function readProjectInitFile(repo, relativePath) {
    const absolutePath = path.join(repo, relativePath);
    if (!existsSync(absolutePath))
        return null;
    return readFile(absolutePath, 'utf8');
}
function localOssEnvOverrides(localConfig) {
    if (!localConfig?.oss)
        return undefined;
    const overrides = {};
    for (const field of requiredEnvFields) {
        if (localConfig.oss[field])
            overrides[field] = localConfig.oss[field];
    }
    if (localConfig.oss.security_token_env)
        overrides.security_token_env = localConfig.oss.security_token_env;
    return Object.keys(overrides).length > 0 ? overrides : undefined;
}
function assertResolvedProjectInitConfig(repo, config, registry, localConfig) {
    return resolveAxisConfig(repo, config, {
        registryOverride: registry,
        localOssEnvOverrides: localOssEnvOverrides(localConfig),
    }).then(({ errors, effectiveConfig }) => {
        if (errors.length > 0)
            throw new Error(errors.join('\n'));
        if (!effectiveConfig || effectiveConfig.contract_version !== '0.2') {
            throw new Error('generated project configuration did not resolve to v0.2');
        }
    });
}
async function applyProjectInitCommand(repo, answersFile) {
    const { inspectProjectInit, renderProjectFiles, validateAnswers, applyTransaction } = await projectInitApi();
    const input = await readJsonFile(path.resolve(answersFile));
    const answersMetadata = input && typeof input === 'object' ? input : {};
    const inspection = await inspectProjectInit({
        repo,
        registryPath: answersMetadata.selectors?.registry_path,
        organizationId: answersMetadata.selectors?.organization_id,
        ossProfile: answersMetadata.selectors?.oss_profile,
    });
    if (inspection.recovery_required) {
        throw new Error('project-init recovery is required; run project-init --repo <path> --recover first');
    }
    const answers = validateAnswers(inspection, input);
    const missingEnvironment = inspection.environment
        .filter((entry) => entry.required && (!entry.name || !process.env[entry.name]))
        .map((entry) => entry.name ?? entry.field);
    if (missingEnvironment.length > 0) {
        throw new Error(`required project-init environment variables are missing: ${missingEnvironment.join(', ')}`);
    }
    const targetRegistryPath = inspection.selectors.registry_path;
    const sourceFiles = {
        main_config: await readProjectInitFile(repo, '.axis/config.yml'),
        local_config: await readProjectInitFile(repo, '.axis/config.local.yml'),
        target_registry: await readProjectInitFile(repo, targetRegistryPath),
        gitignore: await readProjectInitFile(repo, '.gitignore'),
        source_registry: inspection.files.find((file) => file.role === 'source_registry')
            ? await readProjectInitFile(repo, inspection.files.find((file) => file.role === 'source_registry').path)
            : null,
    };
    const rendered = renderProjectFiles({ inspection, answers, sourceFiles });
    const renderedConfig = parseSimpleYaml(rendered.main_config);
    const renderedRegistry = parseSimpleYaml(rendered.target_registry);
    const renderedLocal = rendered.local_config === null ? null : parseSimpleYaml(rendered.local_config);
    const targetFiles = [
        { role: 'main_config', path: '.axis/config.yml', originalText: sourceFiles.main_config, nextText: rendered.main_config },
        ...(sourceFiles.local_config !== null || rendered.local_config !== null
            ? [{ role: 'local_config', path: '.axis/config.local.yml', originalText: sourceFiles.local_config, nextText: rendered.local_config }]
            : []),
        { role: 'target_registry', path: targetRegistryPath, originalText: sourceFiles.target_registry, nextText: rendered.target_registry },
        { role: 'gitignore', path: '.gitignore', originalText: sourceFiles.gitignore, nextText: rendered.gitignore },
    ];
    await applyTransaction({
        repo,
        files: targetFiles,
        validateBefore: async () => assertResolvedProjectInitConfig(repo, renderedConfig, renderedRegistry, renderedLocal),
        validateAfter: async () => {
            const persistedConfig = await readAxisConfig(repo);
            const persistedLocal = await readOptionalLocalConfig(repo);
            const persistedRegistry = await readOrganizationRegistry(repo, targetRegistryPath);
            await assertResolvedProjectInitConfig(repo, persistedConfig, persistedRegistry, persistedLocal);
        },
    });
    console.log(JSON.stringify({
        ok: true,
        contract_version: '0.2',
        config_path: '.axis/config.yml',
        registry_path: targetRegistryPath,
        files: targetFiles.map((file) => file.path),
    }, null, 2));
}
async function recoverProjectInitCommand(repo) {
    const { recoverTransaction } = await projectInitApi();
    await recoverTransaction(repo);
    console.log(JSON.stringify({ ok: true, recovered: true }, null, 2));
}
async function projectInitCommand() {
    const repo = repoArg();
    const inspect = hasFlag('--inspect');
    const apply = hasFlag('--apply');
    const recover = hasFlag('--recover');
    const hasSelector = Boolean(getArg('--registry-path') || getArg('--organization-id') || getArg('--oss-profile'));
    const hasAnswersFile = Boolean(getArg('--answers-file'));
    if (inspect && apply)
        throw new Error('--inspect and --apply cannot combine');
    if (recover && (hasAnswersFile || inspect || apply))
        throw new Error('--recover cannot combine with other project-init modes');
    if (hasSelector && !inspect)
        throw new Error('project-init selectors are only valid with --inspect');
    if (apply && !hasAnswersFile)
        throw new Error('--answers-file is required with --apply');
    if (hasFlag('--json') && !inspect)
        throw new Error('--json is only valid with --inspect');
    if (inspect) {
        if (!hasFlag('--json'))
            throw new Error('--json is required with --inspect');
        const { inspectProjectInit } = await projectInitApi();
        const result = await inspectProjectInit({
            repo,
            registryPath: getArg('--registry-path'),
            organizationId: getArg('--organization-id'),
            ossProfile: getArg('--oss-profile'),
        });
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (recover) {
        await recoverProjectInitCommand(repo);
        return;
    }
    if (apply) {
        await applyProjectInitCommand(repo, getArg('--answers-file'));
        return;
    }
    if (getArg('--project-slug') || getArg('--display-name') || hasFlag('--force')) {
        throw new Error('Axis v0.1 project-init is expired; use project-init --inspect --json and the v0.2 answers-file flow');
    }
    throw new Error('project-init requires --inspect --json for v0.2 configuration');
}
async function validateConfigCommand() {
    const repo = repoArg();
    const config = await readAxisConfig(repo);
    const { errors, requiredEnv, effectiveConfig } = await resolveAxisConfig(repo, config);
    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
    if (!effectiveConfig)
        throw new Error('Unable to resolve Axis config');
    console.log(JSON.stringify({
        ok: true,
        contract_version: effectiveConfig.contract_version,
        organization: effectiveConfig.organization,
        project: {
            slug: effectiveConfig.project.slug,
            display_name: effectiveConfig.project.display_name,
        },
        release: {
            channel: effectiveConfig.release.channel,
            gate: effectiveConfig.release.gate,
        },
        oss_profile: effectiveConfig.oss.profile ? {
            name: effectiveConfig.oss.profile,
            provider: effectiveConfig.oss.provider,
            bucket: effectiveConfig.oss.bucket,
            prefix: effectiveConfig.oss.prefix,
        } : undefined,
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
    return `${timestamp}-${assetType.replaceAll('_', '-')}-${randomBytes(4).toString('hex')}`;
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
        `${title} was generated as a local-only Axis v0.2 package.`,
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
function projectKnowledgeSourceRoot(repo, config) {
    if (config.contract_version !== '0.2' || !config.organization) {
        throw new Error('project-knowledge-capture requires a resolved v0.2 organization configuration');
    }
    return path.join(repo, '.axis', 'docs', 'orgs', config.organization.id, 'projects', config.project.slug);
}
const projectKnowledgeTraceIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:\-]*$/;
const invalidProjectKnowledgeTraceIdentifierPattern = /^(?:missing_evidence|not_applicable|none|todo|tbd)$/i;
const maxReadableMarkdownTableColumns = 6;
function secondaryDesignStatus(body, key, allowed, capabilityId, secondaryId) {
    const match = new RegExp(`\\b${key}\\s*=\\s*(${allowed.join('|')})\\b`).exec(body);
    if (!match) {
        throw new Error(`project knowledge secondary capability detailed design missing ${key}: ${capabilityId}/${secondaryId}`);
    }
    return match[1];
}
function exactCodeAnchors(body) {
    return [...body.matchAll(/(?<![A-Za-z0-9_./:@+\-])(?:[A-Za-z0-9_@+\-][A-Za-z0-9_.@+\-]*\/)+[A-Za-z0-9_$@+\-][A-Za-z0-9_.$@+\-]*\.[A-Za-z0-9]+:([1-9]\d*)-([1-9]\d*)#[A-Za-z_$][A-Za-z0-9_$<>.\-]*(?![A-Za-z0-9_$<>.()\/\-])/g)]
        .filter((match) => Number(match[1]) <= Number(match[2]))
        .map((match) => match[0]);
}
function projectKnowledgeSection(body, heading) {
    const match = heading.exec(body);
    if (!match || match.index === undefined)
        return null;
    const sectionStart = match.index + match[0].length;
    const nextHeading = /^##\s+/m.exec(body.slice(sectionStart));
    return body.slice(sectionStart, nextHeading ? sectionStart + nextHeading.index : body.length);
}
function splitMarkdownTableRow(line) {
    let content = line.trim();
    if (content.startsWith('|'))
        content = content.slice(1);
    if (hasUnescapedTrailingPipe(content))
        content = content.slice(0, -1);
    const cells = [];
    let current = '';
    for (let index = 0; index < content.length; index += 1) {
        const character = content[index];
        if (character !== '|') {
            current += character;
            continue;
        }
        let backslashCount = 0;
        for (let previous = index - 1; previous >= 0 && content[previous] === '\\'; previous -= 1) {
            backslashCount += 1;
        }
        if (backslashCount % 2 === 1) {
            current = `${current.slice(0, -1)}|`;
        }
        else {
            cells.push(current.trim());
            current = '';
        }
    }
    cells.push(current.trim());
    return cells;
}
function hasUnescapedTrailingPipe(line) {
    if (!line.endsWith('|'))
        return false;
    let backslashCount = 0;
    for (let index = line.length - 2; index >= 0 && line[index] === '\\'; index -= 1) {
        backslashCount += 1;
    }
    return backslashCount % 2 === 0;
}
function looksLikeMarkdownTableRow(line) {
    const trimmed = line.trim();
    if (!trimmed)
        return false;
    return trimmed.startsWith('|')
        || hasUnescapedTrailingPipe(trimmed)
        || splitMarkdownTableRow(trimmed).length > 1;
}
function markdownLineContext(line) {
    let content = line;
    let blockquoteDepth = 0;
    while (true) {
        const prefix = /^ {0,3}>[ \t]?/.exec(content);
        if (!prefix)
            return { content, blockquoteDepth };
        content = content.slice(prefix[0].length);
        blockquoteDepth += 1;
    }
}
function isIndentedMarkdownCode(line) {
    return /^(?: {4}|\t)/.test(line);
}
function markdownFenceMatch(line) {
    return /^ {0,3}(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/.exec(line);
}
function inlineCodeSpanEnd(line, start) {
    let delimiterLength = 1;
    while (line[start + delimiterLength] === '`')
        delimiterLength += 1;
    const delimiter = '`'.repeat(delimiterLength);
    let candidate = line.indexOf(delimiter, start + delimiterLength);
    while (candidate >= 0) {
        if (line[candidate - 1] !== '`' && line[candidate + delimiterLength] !== '`') {
            return candidate + delimiterLength;
        }
        candidate = line.indexOf(delimiter, candidate + delimiterLength);
    }
    return null;
}
function stripMarkdownHtmlComments(line, initialCommentState = false) {
    let content = '';
    let cursor = 0;
    let inComment = initialCommentState;
    while (cursor < line.length) {
        if (inComment) {
            const commentEnd = line.indexOf('-->', cursor);
            if (commentEnd < 0)
                return { content, inComment: true };
            inComment = false;
            cursor = commentEnd + 3;
            continue;
        }
        const commentStart = line.indexOf('<!--', cursor);
        const codeSpanStart = line.indexOf('`', cursor);
        if (codeSpanStart >= 0 && (commentStart < 0 || codeSpanStart < commentStart)) {
            const codeSpanEnd = inlineCodeSpanEnd(line, codeSpanStart);
            if (codeSpanEnd !== null) {
                content += line.slice(cursor, codeSpanEnd);
                cursor = codeSpanEnd;
            }
            else {
                content += line.slice(cursor, codeSpanStart + 1);
                cursor = codeSpanStart + 1;
            }
            continue;
        }
        if (commentStart < 0) {
            content += line.slice(cursor);
            break;
        }
        content += line.slice(cursor, commentStart);
        inComment = true;
        cursor = commentStart + 4;
    }
    return { content, inComment };
}
function isMarkdownBlockBoundary(line) {
    return /^#{1,6}(?:\s|$)/.test(line.trimStart()) || markdownFenceMatch(line) !== null;
}
function normalizeMarkdownCell(value) {
    return value.replace(/[`*]/g, '').trim();
}
function markdownTables(body) {
    const lines = body.split(/\r?\n/);
    const tables = [];
    for (let index = 0; index < lines.length - 1; index += 1) {
        const headerLine = lines[index].trim();
        const separatorLine = lines[index + 1].trim();
        if (!looksLikeMarkdownTableRow(headerLine) || !looksLikeMarkdownTableRow(separatorLine))
            continue;
        const headers = splitMarkdownTableRow(headerLine);
        const separators = splitMarkdownTableRow(separatorLine);
        if (headers.length === 0
            || headers.length !== separators.length
            || !separators.every((cell) => /^:?-{3,}:?$/.test(cell.trim())))
            continue;
        const rows = [];
        let rowIndex = index + 2;
        for (; rowIndex < lines.length; rowIndex += 1) {
            const rowLine = lines[rowIndex].trim();
            if (!looksLikeMarkdownTableRow(rowLine))
                break;
            const cells = splitMarkdownTableRow(rowLine);
            if (cells.length !== headers.length)
                break;
            rows.push(cells);
        }
        tables.push({ headers, rows });
        index = rowIndex - 1;
    }
    return tables;
}
function assertReadableMarkdownTables(body, scope) {
    const lines = body.split(/\r?\n/);
    let fence = null;
    let inHtmlComment = false;
    let htmlCommentBlockquoteDepth = 0;
    for (let index = 0; index < lines.length - 1; index += 1) {
        const context = markdownLineContext(lines[index]);
        if (fence !== null && context.blockquoteDepth < fence.blockquoteDepth)
            fence = null;
        if (inHtmlComment && context.blockquoteDepth < htmlCommentBlockquoteDepth) {
            inHtmlComment = false;
            htmlCommentBlockquoteDepth = 0;
        }
        const unstrippedFenceMatch = markdownFenceMatch(context.content);
        if (fence !== null) {
            if (unstrippedFenceMatch) {
                const marker = unstrippedFenceMatch[1][0];
                if (marker === fence.marker
                    && context.blockquoteDepth === fence.blockquoteDepth
                    && unstrippedFenceMatch[1].length >= fence.length
                    && unstrippedFenceMatch[2].trim() === '') {
                    fence = null;
                }
            }
            continue;
        }
        if (!inHtmlComment && isIndentedMarkdownCode(context.content))
            continue;
        const wasInHtmlComment = inHtmlComment;
        const strippedLine = stripMarkdownHtmlComments(context.content, inHtmlComment);
        inHtmlComment = strippedLine.inComment;
        if (!wasInHtmlComment && inHtmlComment)
            htmlCommentBlockquoteDepth = context.blockquoteDepth;
        if (!inHtmlComment)
            htmlCommentBlockquoteDepth = 0;
        const rawLine = strippedLine.content;
        const fenceMatch = markdownFenceMatch(rawLine);
        if (fenceMatch) {
            fence = {
                marker: fenceMatch[1][0],
                length: fenceMatch[1].length,
                blockquoteDepth: context.blockquoteDepth,
            };
            continue;
        }
        if (inHtmlComment)
            continue;
        const headerLine = rawLine.trim();
        const separatorContext = markdownLineContext(lines[index + 1]);
        if (separatorContext.blockquoteDepth !== context.blockquoteDepth
            || isIndentedMarkdownCode(separatorContext.content))
            continue;
        const separatorLine = stripMarkdownHtmlComments(separatorContext.content).content.trim();
        if (!looksLikeMarkdownTableRow(headerLine) || !looksLikeMarkdownTableRow(separatorLine))
            continue;
        const headers = splitMarkdownTableRow(headerLine);
        const separators = splitMarkdownTableRow(separatorLine);
        const validSeparatorCells = separators.map((cell) => /^:?-{3,}:?$/.test(cell.trim()));
        const separatorLike = separators.length > 0
            && separators.every((cell) => /^:?-+:?$/.test(cell.trim()));
        if (!separatorLike && !validSeparatorCells.some(Boolean))
            continue;
        const lineNumber = index + 1;
        if (!validSeparatorCells.every(Boolean)) {
            throw new Error(`project knowledge Markdown table has an invalid separator: ${scope}:${lineNumber + 1}`);
        }
        if (headers.length !== separators.length) {
            throw new Error(`project knowledge Markdown table header/separator column mismatch: ${scope}:${lineNumber} `
                + `(header=${headers.length}, separator=${separators.length})`);
        }
        const emptyHeaderIndex = headers.findIndex((header) => !normalizeMarkdownCell(header));
        if (emptyHeaderIndex >= 0) {
            throw new Error(`project knowledge Markdown table has an empty header cell: ${scope}:${lineNumber} `
                + `(column ${emptyHeaderIndex + 1})`);
        }
        if (headers.length > maxReadableMarkdownTableColumns) {
            throw new Error(`project knowledge Markdown table exceeds ${maxReadableMarkdownTableColumns} columns: `
                + `${scope}:${lineNumber} (${headers.length} columns)`);
        }
        let rowIndex = index + 2;
        for (; rowIndex < lines.length; rowIndex += 1) {
            const rowContext = markdownLineContext(lines[rowIndex]);
            if (rowContext.blockquoteDepth !== context.blockquoteDepth
                || isIndentedMarkdownCode(rowContext.content))
                break;
            const rowLine = stripMarkdownHtmlComments(rowContext.content).content.trim();
            if (!rowLine || isMarkdownBlockBoundary(rowLine))
                break;
            if (!looksLikeMarkdownTableRow(rowLine))
                break;
            const row = splitMarkdownTableRow(rowLine);
            if (row.length !== headers.length) {
                throw new Error(`project knowledge Markdown table data row column mismatch: ${scope}:${rowIndex + 1} `
                    + `(header=${headers.length}, row=${row.length})`);
            }
        }
        index = rowIndex - 1;
    }
}
async function assertReadableProjectKnowledgeMarkdownFiles(sourceRoot) {
    const visit = async (directory) => {
        const entries = (await readdir(directory, { withFileTypes: true }))
            .sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '_archive')
                    continue;
                await visit(absolutePath);
                continue;
            }
            if (!entry.isFile() || !/^\.(?:md|markdown)$/i.test(path.extname(entry.name)))
                continue;
            const relativePath = path.relative(sourceRoot, absolutePath).split(path.sep).join('/');
            assertReadableMarkdownTables(await readFile(absolutePath, 'utf8'), relativePath);
        }
    };
    await visit(sourceRoot);
}
function numberedMarkdownSubsections(body, chapterNumber) {
    const matches = [...body.matchAll(/^###(?!#)\s+(\d+)\.(\d+)\s+(.+?)\s*$/gm)]
        .filter((match) => Number(match[1]) === chapterNumber);
    return matches.map((match, index) => {
        const start = (match.index ?? 0) + match[0].length;
        const end = index + 1 < matches.length ? (matches[index + 1].index ?? body.length) : body.length;
        return {
            index: Number(match[2]),
            title: match[3].trim(),
            body: body.slice(start, end),
        };
    });
}
function numberedMarkdownSubsubsections(body, chapterNumber, sectionNumber) {
    const matches = [...body.matchAll(/^####(?!#)\s+(\d+)\.(\d+)\.(\d+)\s+(.+?)\s*$/gm)]
        .filter((match) => Number(match[1]) === chapterNumber && Number(match[2]) === sectionNumber);
    return matches.map((match, index) => {
        const start = (match.index ?? 0) + match[0].length;
        const end = index + 1 < matches.length ? (matches[index + 1].index ?? body.length) : body.length;
        return {
            index: Number(match[3]),
            title: match[4].trim(),
            body: body.slice(start, end),
        };
    });
}
function verticalMarkdownTableFields(table) {
    const headers = table.headers.map(normalizeMarkdownCell);
    if (headers.length !== 2 || headers[0] !== '项目' || headers[1] !== '内容')
        return null;
    return new Map(table.rows.map((row) => [normalizeMarkdownCell(row[0] ?? ''), row[1] ?? '']));
}
function exactVerticalMarkdownTableFields(table, expectedFields, scope) {
    const fields = verticalMarkdownTableFields(table);
    if (!fields)
        throw new Error(`project knowledge vertical table has invalid header: ${scope}`);
    const actualFields = table.rows.map((row) => normalizeMarkdownCell(row[0] ?? ''));
    if (actualFields.length !== expectedFields.length
        || new Set(actualFields).size !== actualFields.length
        || actualFields.some((field, index) => field !== expectedFields[index])) {
        throw new Error(`project knowledge vertical table does not match fixed schema: ${scope}`);
    }
    return fields;
}
function markdownTableMatchesExactVerticalFields(table, expectedFields) {
    const fields = verticalMarkdownTableFields(table);
    if (!fields)
        return false;
    const actualFields = table.rows.map((row) => normalizeMarkdownCell(row[0] ?? ''));
    return actualFields.length === expectedFields.length
        && new Set(actualFields).size === actualFields.length
        && actualFields.every((field, index) => field === expectedFields[index]);
}
function hasGenericInterfaceLogicPlaceholder(body) {
    return /\{(?:actor|api(?:_id)?|application_service|business_rule|entity_or_table|outcome_or_state)\}/i.test(body)
        || /\b(?:actor|application_service|business_rule|entity_or_table|outcome_or_state)\b/i.test(body)
        || /(?:^|\n)\s*api\s*(?:-->|---|-\.->|==>)/i.test(body);
}
function hasConcreteInterfaceLogicSummary(body) {
    const prose = body
        .replace(/```[\s\S]*?```/g, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line
        && !line.startsWith('|')
        && !line.startsWith('#')
        && !/^<!--.*-->$/.test(line))
        .join(' ')
        .replace(/[`*_>]/g, '')
        .trim();
    return prose.length >= 20;
}
function hasInterfaceLogicDiagramOrStepTable(body) {
    const hasDiagram = /```mermaid\s*[\s\S]*?\b(?:flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?)\b[\s\S]*?(?:-->|->>|-->>|==>)[\s\S]*?```/i.test(body);
    if (hasDiagram)
        return true;
    return markdownTables(body).some((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return table.rows.length > 0
            && headers.includes('步骤')
            && headers.some((header) => /^(?:内部处理|处理逻辑|判断或动作|判断\/动作|执行动作)$/.test(header))
            && headers.some((header) => /^(?:代码对象|执行对象|执行对象\/方法|方法)$/.test(header));
    });
}
function mermaidDiagramBodies(body) {
    return [...body.matchAll(/(`{3,}|~{3,})mermaid\s*([\s\S]*?)\1/gi)]
        .map((match) => match[2]);
}
function flowchartNodeLabelMap(diagram) {
    const labels = new Map();
    for (const nodeMatch of diagram.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*(?:\["([^"]+)"\]|\[([^\]]+)\]|\("([^"]+)"\)|\(([^)]+)\)|\{"([^"]+)"\}|\{([^}]+)\})/g)) {
        labels.set(nodeMatch[1], normalizeMarkdownCell(nodeMatch[2] ?? nodeMatch[3] ?? nodeMatch[4] ?? nodeMatch[5] ?? nodeMatch[6] ?? nodeMatch[7] ?? ''));
    }
    return labels;
}
function flowchartEdgeEndpoints(diagram) {
    const endpointIds = new Set();
    let edgeCount = 0;
    let traceable = true;
    for (const rawLine of diagram.split(/\r?\n/)) {
        if (rawLine.trimStart().startsWith('%%'))
            continue;
        for (const statement of rawLine.split(';')) {
            const normalizedLine = statement
                .replace(/-\.\s*(?:"[^"]*"|'[^']*'|[^\n]*?)\s*\.->/g, ' __AXIS_EDGE__ ')
                .replace(/-\.->/g, ' __AXIS_EDGE__ ')
                .replace(/-->|==>/g, ' __AXIS_EDGE__ ');
            if (!normalizedLine.includes('__AXIS_EDGE__'))
                continue;
            const parts = normalizedLine.split('__AXIS_EDGE__');
            for (let index = 0; index < parts.length - 1; index += 1) {
                const sourcePart = parts[index]
                    .replace(/^\s*\|[^|]*\|\s*/, '')
                    .trim();
                const targetPart = parts[index + 1]
                    .replace(/^\s*\|[^|]*\|\s*/, '')
                    .trim();
                const sourceId = /^([A-Za-z][A-Za-z0-9_]*)/.exec(sourcePart)?.[1];
                const targetId = /^([A-Za-z][A-Za-z0-9_]*)/.exec(targetPart)?.[1];
                edgeCount += 1;
                if (!sourceId || !targetId) {
                    traceable = false;
                    continue;
                }
                endpointIds.add(sourceId);
                endpointIds.add(targetId);
            }
        }
    }
    return { edgeCount, endpointIds, traceable };
}
function assertAtomicInterfaceLogicDiagrams(body, scope) {
    const diagrams = mermaidDiagramBodies(body)
        .filter((diagram) => /\b(?:flowchart|graph)\b/i.test(diagram));
    const exactMethodCallPattern = /^(?:[A-Za-z_$][A-Za-z0-9_$]*\.)+[A-Za-z_$][A-Za-z0-9_$]*\(\)$/;
    for (const diagram of diagrams) {
        const nodeLabels = flowchartNodeLabelMap(diagram);
        const edges = flowchartEdgeEndpoints(diagram);
        if (!edges.traceable
            || edges.edgeCount === 0
            || [...edges.endpointIds].some((nodeId) => !nodeLabels.has(nodeId))
            || [...nodeLabels.values()].some((label) => !exactMethodCallPattern.test(label))) {
            throw new Error(`project knowledge secondary capability interface method node is not atomic: ${scope}`);
        }
    }
}
function assertCompactPartialMethodDiagrams(body, scope) {
    const diagrams = mermaidDiagramBodies(body)
        .filter((diagram) => /\b(?:flowchart|graph)\b/i.test(diagram));
    const exactMethodCallPattern = /^(?:[A-Za-z_$][A-Za-z0-9_$]*\.)+[A-Za-z_$][A-Za-z0-9_$]*\(\)$/;
    if (diagrams.length === 0) {
        throw new Error(`project knowledge compact partial method diagram missing: ${scope}`);
    }
    for (const diagram of diagrams) {
        const nodeLabels = flowchartNodeLabelMap(diagram);
        const edges = flowchartEdgeEndpoints(diagram);
        if (nodeLabels.size < 2 || edges.edgeCount === 0) {
            throw new Error(`project knowledge compact partial method diagram is empty: ${scope}`);
        }
        if (!edges.traceable
            || [...edges.endpointIds].some((nodeId) => !nodeLabels.has(nodeId))
            || [...nodeLabels.values()].some((label) => !exactMethodCallPattern.test(label))) {
            throw new Error(`project knowledge compact partial method diagram contains a non-atomic node: ${scope}`);
        }
    }
}
function axisDocumentMetadata(body, scope) {
    const matches = [...body.matchAll(/<!--\s*axis-document-metadata\b([\s\S]*?)-->/gi)];
    if (matches.length !== 1) {
        throw new Error(`project knowledge compact partial document requires one metadata block: ${scope}`);
    }
    return matches[0][1];
}
function metadataScalar(metadata, key) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escapedKey}\\s*=\\s*([^\\s]+)`, 'm').exec(metadata)?.[1] ?? '';
}
function metadataIdentifierList(metadata, key) {
    const raw = metadataScalar(metadata, key).replace(/^\[|\]$/g, '');
    return raw.split(/[,，、;；]+/).map((value) => value.trim()).filter(Boolean);
}
function visibleMarkdownBody(body) {
    return body.replace(/<!--[\s\S]*?-->/g, '');
}
function markdownLocalLinkTargets(body) {
    return [...visibleMarkdownBody(body).matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)]
        .map((match) => match[1].trim())
        .filter((target) => (target.length > 0
        && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)));
}
function assertSecondaryNavigationLinks(body, documentPath, sourceRoot, expectedRelativeTargets, scope) {
    const documentDirectory = path.dirname(documentPath);
    const resolvedSourceRoot = path.resolve(sourceRoot);
    const resolvedTargets = new Set();
    for (const rawTarget of markdownLocalLinkTargets(body)) {
        const target = rawTarget.split(/[?#]/, 1)[0];
        const resolved = path.resolve(documentDirectory, target);
        if (!(resolved === resolvedSourceRoot || resolved.startsWith(`${resolvedSourceRoot}${path.sep}`))
            || !existsSync(resolved)) {
            throw new Error(`project knowledge secondary capability navigation link does not resolve: ${scope}/${rawTarget}`);
        }
        resolvedTargets.add(resolved);
    }
    for (const expectedRelativeTarget of expectedRelativeTargets) {
        const expected = path.resolve(sourceRoot, expectedRelativeTarget);
        if (!resolvedTargets.has(expected)) {
            throw new Error(`project knowledge secondary capability navigation omits expected document: ${scope}/${expectedRelativeTarget}`);
        }
    }
}
function compactCodeAnchor(raw, filePath, lineStart, lineEnd, symbol) {
    return {
        raw,
        path: filePath,
        fileName: path.basename(filePath),
        lineStart: Number(lineStart),
        lineEnd: Number(lineEnd),
        symbol,
    };
}
function shortCodeAnchors(body) {
    return [...body.matchAll(/(?<![A-Za-z0-9_./:@+\-])([A-Za-z0-9_$@+\-][A-Za-z0-9_.$@+\-]*\.[A-Za-z0-9]+):([1-9]\d*)-([1-9]\d*)#([A-Za-z_$][A-Za-z0-9_$<>.\-]*)(?![A-Za-z0-9_$<>.()\/\-])/g)]
        .filter((match) => Number(match[2]) <= Number(match[3]))
        .map((match) => compactCodeAnchor(match[0], match[1], match[2], match[3], match[4]));
}
function apparentVisibleCodeLocators(body) {
    return [...visibleMarkdownBody(body).matchAll(/`([^`\n]*\.[A-Za-z0-9]+:[1-9]\d*-[1-9]\d*#[^`\n]+)`/g)].map((match) => match[1].trim());
}
function apparentCodeLocators(body) {
    return [...body.matchAll(/`([^`\n]*\.[A-Za-z0-9]+:[1-9]\d*-[1-9]\d*#[^`\n]+)`/g)].map((match) => match[1].trim());
}
function assertCompactCodeLocatorAtomicity(body, scope) {
    for (const locator of apparentCodeLocators(body)) {
        const anchors = [...shortCodeAnchors(locator), ...exactCodeAnchors(locator)];
        if (anchors.length !== 1
            || (typeof anchors[0] === 'string' ? anchors[0] : anchors[0].raw) !== locator) {
            throw new Error(`project knowledge compact partial locator is malformed or combines symbols: ${scope}`);
        }
    }
}
function axisEvidenceAnchors(body) {
    return [...body.matchAll(/<!--\s*axis-evidence:\s*([\s\S]*?)\s*-->/gi)]
        .flatMap((match) => exactCodeAnchors(match[1]))
        .map((anchor) => {
        const parsed = /^(.+):([1-9]\d*)-([1-9]\d*)#([A-Za-z_$][A-Za-z0-9_$<>.\-]*)$/.exec(anchor);
        return parsed
            ? compactCodeAnchor(anchor, parsed[1], parsed[2], parsed[3], parsed[4])
            : null;
    })
        .filter((anchor) => anchor !== null);
}
function hiddenExactCodeAnchors(body) {
    return [...body.matchAll(/<!--([\s\S]*?)-->/g)]
        .flatMap((match) => exactCodeAnchors(match[1]))
        .map((anchor) => {
        const parsed = /^(.+):([1-9]\d*)-([1-9]\d*)#([A-Za-z_$][A-Za-z0-9_$<>.\-]*)$/.exec(anchor);
        return parsed
            ? compactCodeAnchor(anchor, parsed[1], parsed[2], parsed[3], parsed[4])
            : null;
    })
        .filter((anchor) => anchor !== null);
}
function assertCompactEvidenceLocators(body, shortLocatorBodies, scope) {
    for (const locator of apparentVisibleCodeLocators(body)) {
        const anchors = shortCodeAnchors(locator);
        if (anchors.length !== 1 || anchors[0].raw !== locator) {
            throw new Error(`project knowledge compact partial visible locator is malformed or combines symbols: ${scope}`);
        }
    }
    if (axisEvidenceAnchors(body).length === 0) {
        throw new Error(`project knowledge compact partial document missing axis-evidence: ${scope}`);
    }
    const evidenceAnchors = hiddenExactCodeAnchors(body);
    if (shortLocatorBodies.length === 0) {
        throw new Error(`project knowledge compact partial document missing exact short locator: ${scope}`);
    }
    for (const locatorBody of shortLocatorBodies) {
        const anchors = shortCodeAnchors(locatorBody);
        if (anchors.length === 0) {
            throw new Error(`project knowledge compact partial document missing exact short locator: ${scope}`);
        }
        for (const anchor of anchors) {
            const exactMatches = new Set(evidenceAnchors.filter((evidence) => (evidence.fileName === anchor.fileName
                && evidence.lineStart === anchor.lineStart
                && evidence.lineEnd === anchor.lineEnd
                && evidence.symbol === anchor.symbol)).map((evidence) => evidence.raw));
            if (exactMatches.size === 0) {
                throw new Error(`project knowledge compact partial short locator does not exactly match path evidence: ${scope}`);
            }
            if (exactMatches.size > 1) {
                throw new Error(`project knowledge compact partial short locator is ambiguous: ${scope}`);
            }
        }
    }
    if (exactCodeAnchors(visibleMarkdownBody(body)).length > 0) {
        throw new Error(`project knowledge compact partial document exposes a full code path: ${scope}`);
    }
}
function compactTopLevelSections(body, expected, scope) {
    const visibleBody = visibleMarkdownBody(body);
    const headings = [...visibleBody.matchAll(/^##(?!#)\s+(\d+)\.?\s+(.+?)\s*$/gm)];
    if (headings.length !== expected.length
        || headings.some((heading, index) => (Number(heading[1]) !== index + 1
            || !(Array.isArray(expected[index]) ? expected[index] : [expected[index]])
                .includes(heading[2].trim())))) {
        throw new Error(`project knowledge compact partial document has invalid six-section structure: ${scope}`);
    }
    return new Map(headings.map((heading, index) => {
        const start = (heading.index ?? 0) + heading[0].length;
        const end = index + 1 < headings.length
            ? (headings[index + 1].index ?? visibleBody.length)
            : visibleBody.length;
        return [index + 1, visibleBody.slice(start, end)];
    }));
}
function axisNamedCommentBodies(body, name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...body.matchAll(new RegExp(`<!--\\s*${escapedName}\\b([\\s\\S]*?)-->`, 'gi'))]
        .map((match) => match[1]);
}
function assertCompactSingleLayerDiagrams(body, scope) {
    const diagrams = mermaidDiagramBodies(body)
        .filter((diagram) => /\b(?:flowchart|graph)\b/i.test(diagram));
    const exactMethodCallPattern = /^(?:[A-Za-z_$][A-Za-z0-9_$]*\.)+[A-Za-z_$][A-Za-z0-9_$]*\(\)$/;
    if (diagrams.length === 0) {
        throw new Error(`project knowledge compact partial diagram missing: ${scope}`);
    }
    for (const diagram of diagrams) {
        const nodeLabels = flowchartNodeLabelMap(diagram);
        const edges = flowchartEdgeEndpoints(diagram);
        const methodNodeCount = [...nodeLabels.values()]
            .filter((label) => exactMethodCallPattern.test(label)).length;
        if (nodeLabels.size < 2
            || edges.edgeCount === 0
            || !edges.traceable
            || [...edges.endpointIds].some((nodeId) => !nodeLabels.has(nodeId))
            || (methodNodeCount > 0 && methodNodeCount !== nodeLabels.size)) {
            throw new Error(`project knowledge compact partial diagram mixes semantic layers or is empty: ${scope}`);
        }
    }
}
const compactConcreteContractPattern = /^(?:(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+)$/;
const compactGenericFlowTextPattern = /^(?:发起(?:能力)?请求|校验(?:主体与)?权威边界|形成(?:可验收)?业务结果|执行(?:业务)?操作|处理请求|返回结果|完成流程)$/;
const compactPlaceholderEvidencePattern = /(?:\bmissing_evidence\b|\bTODO\b|\bTBD\b)/i;
function compactCanonicalContract(value) {
    return normalizeMarkdownCell(value).replace(/\s+/g, ' ');
}
function compactDelimitedValues(value) {
    return normalizeMarkdownCell(value)
        .split(/[,，、;；]+/)
        .map((item) => item.trim().replace(/[。.]+$/g, ''))
        .filter(Boolean);
}
function compactContractMatchesType(contract, contractType) {
    return contractType === 'HTTP'
        ? /^(?:GET|POST|PUT|PATCH|DELETE)\s+\//.test(contract)
        : contract.startsWith(`${contractType} `);
}
function compactStepIds(value) {
    const steps = [];
    for (const match of normalizeMarkdownCell(value).matchAll(/\bS([1-9]\d*)(?:\s*[-–—~至]\s*S?([1-9]\d*))?\b/g)) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : start;
        if (end < start || end - start > 100)
            return [];
        for (let index = start; index <= end; index += 1)
            steps.push(`S${index}`);
    }
    return steps;
}
function compactNextStepTargets(value) {
    const tokens = normalizeMarkdownCell(value)
        .split(/[,，、;；]+/)
        .map((token) => token.trim())
        .filter(Boolean);
    const nextSteps = [];
    let canTerminate = false;
    let valid = tokens.length > 0;
    for (const token of tokens) {
        if (/^(?:结束|终止|无后续|not_applicable)$/i.test(token)) {
            if (canTerminate)
                valid = false;
            canTerminate = true;
        }
        else if (/^S[1-9]\d*$/.test(token)) {
            if (nextSteps.includes(token))
                valid = false;
            nextSteps.push(token);
        }
        else {
            valid = false;
        }
    }
    return { valid, nextSteps, canTerminate };
}
function sameStringSet(left, right) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}
function assertCompactBusinessDiagrams(body, scope) {
    const diagrams = mermaidDiagramBodies(body)
        .filter((diagram) => /\b(?:flowchart|graph)\b/i.test(diagram));
    const exactMethodCallPattern = /^(?:[A-Za-z_$][A-Za-z0-9_$]*\.)+[A-Za-z_$][A-Za-z0-9_$]*\(\)$/;
    for (const diagram of diagrams) {
        const nodeLabels = flowchartNodeLabelMap(diagram);
        const edges = flowchartEdgeEndpoints(diagram);
        if (nodeLabels.size < 2
            || edges.edgeCount === 0
            || !edges.traceable
            || [...edges.endpointIds].some((nodeId) => !nodeLabels.has(nodeId))
            || [...nodeLabels.values()].some((label) => (exactMethodCallPattern.test(label)
                || compactGenericFlowTextPattern.test(label)
                || /(?:Controller|Service|Repository|Mapper|\.java\b|\bapi_id\b)/i.test(label)))) {
            throw new Error(`project knowledge compact secondary capability business diagram is generic or mixes semantic layers: ${scope}`);
        }
    }
}
function compactVisibleLocatorLines(body) {
    return visibleMarkdownBody(body)
        .split(/\r?\n/)
        .filter((line) => shortCodeAnchors(line).length > 0);
}
function declaresCompactReaderProfile(body) {
    const metadata = /<!--\s*axis-document-metadata\b([\s\S]*?)-->/i.exec(body)?.[1] ?? '';
    return /\breader_profile\s*=\s*compact\b/.test(metadata);
}
function usesParticipantFlowInterfaceContract(body) {
    const metadata = /<!--\s*axis-document-metadata\b([\s\S]*?)-->/i.exec(body)?.[1] ?? '';
    return /\bsecondary_reader_contract\s*=\s*participant_flow_interface_v1\b/.test(metadata);
}
function compactSecondaryReaderContract(body) {
    const metadata = /<!--\s*axis-document-metadata\b([\s\S]*?)-->/i.exec(body)?.[1] ?? '';
    return /\bsecondary_reader_contract\s*=\s*([^\s|`]+)/.exec(metadata)?.[1] ?? '';
}
function resemblesParticipantFlowInterfaceContract(body) {
    const visibleBody = visibleMarkdownBody(body);
    return /^##\s+2\.?\s+参与者、职责与权限\s*$/m.test(visibleBody)
        || /<!--\s*axis-flow-step-machine-table\b/i.test(body);
}
function rawNumberedTopLevelSection(body, sectionNumber) {
    const headings = [...body.matchAll(/^##(?!#)\s+(\d+)\.?\s+.+?\s*$/gm)];
    const index = headings.findIndex((heading) => Number(heading[1]) === sectionNumber);
    if (index < 0)
        return '';
    const start = (headings[index].index ?? 0) + headings[index][0].length;
    const end = index + 1 < headings.length ? (headings[index + 1].index ?? body.length) : body.length;
    return body.slice(start, end);
}
function visibleNumberedLevel2Headings(body) {
    return [...visibleMarkdownBody(body).matchAll(/^##(?!#)\s+(\d+)\.?\s+(.+?)\s*$/gm)]
        .map((heading) => `${heading[1]}.${heading[2].trim()}`);
}
function isCompactPartialSecondaryCapabilityDetailedDesign(body) {
    const visibleBody = visibleMarkdownBody(body);
    const headings = visibleNumberedLevel2Headings(body);
    return declaresCompactReaderProfile(body)
        || (headings.length === 6
            && /^##\s+1\.?\s+能力定位与边界\s*$/m.test(visibleBody)
            && /^##\s+2\.?\s+调用主体、权限与接口矩阵\s*$/m.test(visibleBody)
            && /^##\s+6\.?\s+(?:缺口|覆盖缺口)\s*$/m.test(visibleBody));
}
function assertCompactPartialSecondaryCapabilityDetailedDesign(body, capabilityId, secondary, gapReportBody, requiresCurrentReaderContract = false) {
    const secondaryId = secondary.secondary_capability_id;
    const scope = `${capabilityId}/${secondaryId}`;
    const sections = compactTopLevelSections(body, [
        '能力定位与边界',
        ['参与者、职责与权限', '调用主体、权限与接口矩阵'],
        ['能力流程', '能力级流程与跨接口关系'],
        ['对象与规则', '业务对象、状态与规则'],
        ['接口摘要', '接口详细设计'],
        ['缺口', '覆盖缺口'],
    ], scope);
    const metadata = axisDocumentMetadata(body, scope);
    const readerContract = compactSecondaryReaderContract(body);
    if (readerContract && readerContract !== 'participant_flow_interface_v1') {
        throw new Error(`project knowledge compact secondary capability has unsupported secondary_reader_contract: ${scope}/${readerContract}`);
    }
    if ((requiresCurrentReaderContract || resemblesParticipantFlowInterfaceContract(body))
        && readerContract !== 'participant_flow_interface_v1') {
        throw new Error(`project knowledge compact secondary capability requires secondary_reader_contract=participant_flow_interface_v1: ${scope}`);
    }
    const currentCompactProfile = readerContract === 'participant_flow_interface_v1';
    if (metadataScalar(metadata, 'reader_profile') !== 'compact') {
        throw new Error(`project knowledge compact partial secondary capability requires reader_profile=compact: ${scope}`);
    }
    if (metadataScalar(metadata, 'level1_capability_id') !== capabilityId
        || metadataScalar(metadata, 'secondary_capability_id') !== secondaryId) {
        throw new Error(`project knowledge compact partial secondary capability metadata identity mismatch: ${scope}`);
    }
    const expectedBusinessIds = new Set(secondary.business_ids ?? []);
    const metadataBusinessIds = metadataIdentifierList(metadata, 'business_ids');
    if (expectedBusinessIds.size === 0
        || metadataBusinessIds.length !== expectedBusinessIds.size
        || new Set(metadataBusinessIds).size !== metadataBusinessIds.length
        || metadataBusinessIds.some((businessId) => !expectedBusinessIds.has(businessId))) {
        throw new Error(`project knowledge compact partial secondary capability metadata business_ids mismatch: ${scope}`);
    }
    const interfaceStatus = metadataScalar(metadata, 'interface_design_status');
    const interfaceCoverage = metadataScalar(metadata, 'interface_coverage');
    const interfaceNotApplicable = interfaceStatus === 'not_applicable'
        && interfaceCoverage === 'not_applicable';
    if (!interfaceNotApplicable
        && (interfaceStatus !== 'detailed' || !/^(?:complete|partial)$/.test(interfaceCoverage))) {
        throw new Error(`project knowledge compact secondary capability requires detailed complete-or-partial coverage or evidenced not_applicable: ${scope}`);
    }
    const gapId = metadataScalar(metadata, 'interface_gap_id');
    if (interfaceNotApplicable) {
        const notApplicableReason = metadataScalar(metadata, 'interface_not_applicable_reason');
        const notApplicableEvidence = metadataScalar(metadata, 'interface_not_applicable_evidence');
        if (gapId !== 'not_applicable'
            || notApplicableReason.length < 4
            || compactPlaceholderEvidencePattern.test(notApplicableReason)
            || exactCodeAnchors(notApplicableEvidence).length !== 1) {
            throw new Error(`project knowledge compact secondary capability interface not_applicable requires reason and exact evidence: ${scope}`);
        }
    }
    else if (interfaceCoverage === 'partial') {
        if (!projectKnowledgeTraceIdentifierPattern.test(gapId)
            || invalidProjectKnowledgeTraceIdentifierPattern.test(gapId)) {
            throw new Error(`project knowledge compact partial secondary capability requires an explicit interface gap: ${scope}`);
        }
        const escapedGapId = gapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const gapPattern = new RegExp(`(^|[^A-Za-z0-9_.:\\-])${escapedGapId}([^A-Za-z0-9_.:\\-]|$)`);
        const localGapTrace = [
            sections.get(6) ?? '',
            ...axisNamedCommentBodies(body, 'axis-gap-machine-table'),
        ].join('\n');
        if (!gapPattern.test(localGapTrace) || !gapPattern.test(gapReportBody)) {
            throw new Error(`project knowledge compact partial secondary capability gap is not traced: ${scope}/${gapId}`);
        }
    }
    else if (gapId !== 'not_applicable') {
        throw new Error(`project knowledge compact complete secondary capability must not declare an interface gap: ${scope}`);
    }
    if (normalizeMarkdownCell(sections.get(1) ?? '').length < 10) {
        throw new Error(`project knowledge compact partial secondary capability boundary is empty: ${scope}`);
    }
    if (currentCompactProfile) {
        assertCompactCodeLocatorAtomicity(body, scope);
        const visibleParticipantTable = markdownTables(sections.get(2) ?? '').find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 5
                && headers.every((header, index) => header === [
                    '参与者',
                    '参与类型',
                    '业务职责',
                    '参与步骤',
                    '权限与数据范围',
                ][index]);
        });
        if (!visibleParticipantTable || visibleParticipantTable.rows.length === 0
            || visibleParticipantTable.rows.some((row) => row.some((cell) => !normalizeMarkdownCell(cell)))) {
            throw new Error(`project knowledge compact secondary capability participant table is empty: ${scope}`);
        }
        const participantSteps = new Map();
        for (const row of visibleParticipantTable.rows) {
            const participant = normalizeMarkdownCell(row[0] ?? '');
            const participantType = normalizeMarkdownCell(row[1] ?? '');
            const responsibility = normalizeMarkdownCell(row[2] ?? '');
            const steps = compactStepIds(row[3] ?? '');
            const permissionAndScope = normalizeMarkdownCell(row[4] ?? '');
            if (participant.length < 2
                || /^(?:actor|user|caller|参与者|调用方|用户|角色|系统|平台)$/i.test(participant)
                || /(?:Controller|Service|Listener|Repository|Mapper|状态机|监听器|调度器|接收器|消费者|服务)$/i.test(participant)
                || !/^(?:业务角色|外部系统|内部业务能力|自动任务)$/.test(participantType)
                || responsibility.length < 4
                || /^(?:参与业务|处理业务|执行流程|完成职责)$/i.test(responsibility)
                || steps.length === 0
                || new Set(steps).size !== steps.length
                || permissionAndScope.length < 4
                || row.some((cell) => compactPlaceholderEvidencePattern.test(normalizeMarkdownCell(cell)))) {
                throw new Error(`project knowledge compact secondary capability participant responsibility is generic or incomplete: ${scope}/${participant || 'unknown'}`);
            }
            if (participantSteps.has(participant)) {
                throw new Error(`project knowledge compact secondary capability duplicates participant: ${scope}/${participant}`);
            }
            participantSteps.set(participant, new Set(steps));
        }
        const visibleFlowTable = markdownTables(sections.get(3) ?? '').find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 6
                && headers.every((header, index) => header === [
                    '步骤',
                    '参与者',
                    '业务动作',
                    '前置状态/条件',
                    '结果/下一状态与下一步',
                    '失败/补偿',
                ][index]);
        });
        if (!visibleFlowTable || visibleFlowTable.rows.length === 0
            || visibleFlowTable.rows.some((row) => row.some((cell) => !normalizeMarkdownCell(cell)))) {
            throw new Error(`project knowledge compact secondary capability atomic business flow is empty: ${scope}`);
        }
        const visibleFlowByStep = new Map();
        const actualStepsByParticipant = new Map();
        for (let index = 0; index < visibleFlowTable.rows.length; index += 1) {
            const row = visibleFlowTable.rows[index];
            const stepId = normalizeMarkdownCell(row[0] ?? '');
            const participant = normalizeMarkdownCell(row[1] ?? '');
            const action = normalizeMarkdownCell(row[2] ?? '');
            const resultAndNextStep = normalizeMarkdownCell(row[4] ?? '');
            const nextStepMatch = /(?:^|[；;])\s*下一步[:：]\s*(.+)$/.exec(resultAndNextStep);
            const nextStepText = normalizeMarkdownCell(nextStepMatch?.[1] ?? '');
            const resultText = nextStepMatch
                ? resultAndNextStep.slice(0, nextStepMatch.index).trim()
                : '';
            const nextTargets = compactNextStepTargets(nextStepText);
            if (stepId !== `S${index + 1}`) {
                throw new Error(`project knowledge compact secondary capability flow steps must be consecutive: ${scope}/${stepId || 'unknown'}`);
            }
            if (!participantSteps.has(participant)) {
                throw new Error(`project knowledge compact secondary capability flow references unknown participant: ${scope}/${participant || 'unknown'}`);
            }
            if (action.length < 4
                || compactGenericFlowTextPattern.test(action)
                || /(?:Controller|Service|Repository|Mapper|\.java\b|\bapi_id\b)/i.test(action)
                || !nextStepMatch
                || resultText.length < 4
                || !nextTargets.valid
                || row.some((cell) => compactPlaceholderEvidencePattern.test(normalizeMarkdownCell(cell)))) {
                throw new Error(`project knowledge compact secondary capability flow action is generic or technical: ${scope}/${stepId}`);
            }
            visibleFlowByStep.set(stepId, {
                participant,
                action,
                nextSteps: nextTargets.nextSteps,
                canTerminate: nextTargets.canTerminate,
            });
            const steps = actualStepsByParticipant.get(participant) ?? new Set();
            steps.add(stepId);
            actualStepsByParticipant.set(participant, steps);
        }
        if (!sameStringSet(participantSteps.keys(), actualStepsByParticipant.keys())) {
            throw new Error(`project knowledge compact secondary capability participants do not close over the business flow: ${scope}`);
        }
        for (const [participant, declaredSteps] of participantSteps) {
            if (!sameStringSet(declaredSteps, actualStepsByParticipant.get(participant) ?? [])) {
                throw new Error(`project knowledge compact secondary capability participant step declaration mismatches flow: ${scope}/${participant}`);
            }
        }
        const incomingSteps = new Map([...visibleFlowByStep.keys()].map((stepId) => [stepId, new Set()]));
        for (const [stepId, step] of visibleFlowByStep) {
            for (const nextStepId of step.nextSteps) {
                if (!visibleFlowByStep.has(nextStepId)) {
                    throw new Error(`project knowledge compact secondary capability flow references unknown next step: ${scope}/${stepId}/${nextStepId}`);
                }
                incomingSteps.get(nextStepId)?.add(stepId);
            }
        }
        const rootSteps = [...incomingSteps]
            .filter(([, incoming]) => incoming.size === 0)
            .map(([stepId]) => stepId);
        const terminalSteps = [...visibleFlowByStep]
            .filter(([, step]) => step.canTerminate)
            .map(([stepId]) => stepId);
        const reachable = (roots, reverse = false) => {
            const reached = new Set();
            const queue = [...roots];
            while (queue.length > 0) {
                const stepId = queue.shift();
                if (reached.has(stepId))
                    continue;
                reached.add(stepId);
                const adjacent = reverse
                    ? [...(incomingSteps.get(stepId) ?? [])]
                    : (visibleFlowByStep.get(stepId)?.nextSteps ?? []);
                queue.push(...adjacent);
            }
            return reached;
        };
        if (rootSteps.length === 0
            || terminalSteps.length === 0
            || reachable(rootSteps).size !== visibleFlowByStep.size
            || reachable(terminalSteps, true).size !== visibleFlowByStep.size) {
            throw new Error(`project knowledge compact secondary capability business flow is disconnected or has no reachable terminal: ${scope}`);
        }
        assertCompactBusinessDiagrams(sections.get(3) ?? '', `${scope}/3`);
        const machineAccessTables = axisNamedCommentBodies(body, 'axis-access-matrix-machine-table')
            .flatMap((commentBody) => markdownTables(commentBody))
            .filter((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 6
                && headers.every((header, index) => header === [
                    '主体/角色',
                    '所需权限/策略',
                    'api_id',
                    '可调用接口/能力',
                    '数据范围',
                    '授权证据',
                ][index]);
        });
        if (interfaceNotApplicable && machineAccessTables.length > 0) {
            throw new Error(`project knowledge compact secondary capability interface not_applicable must not declare an access matrix: ${scope}`);
        }
        if (!interfaceNotApplicable && (machineAccessTables.length !== 1
            || machineAccessTables[0].rows.length === 0
            || machineAccessTables[0].rows.some((row) => (row.slice(0, 5).some((cell) => !normalizeMarkdownCell(cell))
                || exactCodeAnchors(row[5] ?? '').length === 0)))) {
            throw new Error(`project knowledge compact partial secondary capability machine access matrix is empty: ${scope}`);
        }
        const accessApiIds = new Set();
        const accessActorsByApi = new Map();
        const accessContractByApi = new Map();
        const accessApiByContract = new Map();
        const accessActorApiPairs = new Set();
        for (const row of machineAccessTables[0]?.rows ?? []) {
            const participant = normalizeMarkdownCell(row[0] ?? '');
            const apiId = normalizeMarkdownCell(row[2] ?? '');
            const contract = compactCanonicalContract(row[3] ?? '');
            if (!participantSteps.has(participant)) {
                throw new Error(`project knowledge compact secondary capability access matrix references unknown participant: ${scope}/${participant || 'unknown'}`);
            }
            if (!projectKnowledgeTraceIdentifierPattern.test(apiId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(apiId)
                || !compactConcreteContractPattern.test(contract)) {
                throw new Error(`project knowledge compact secondary capability access matrix aggregates or omits a concrete interface: ${scope}/${apiId || 'unknown'}`);
            }
            const previousContract = accessContractByApi.get(apiId);
            if (previousContract && previousContract !== contract) {
                throw new Error(`project knowledge compact secondary capability api_id maps to multiple contracts: ${scope}/${apiId}`);
            }
            const previousApiId = accessApiByContract.get(contract);
            if (previousApiId && previousApiId !== apiId) {
                throw new Error(`project knowledge compact secondary capability concrete contract maps to multiple api_id values: ${scope}/${contract}`);
            }
            const actorApiPair = `${participant}::${apiId}`;
            if (accessActorApiPairs.has(actorApiPair)) {
                throw new Error(`project knowledge compact secondary capability duplicates actor-interface access: ${scope}/${participant}/${apiId}`);
            }
            accessActorApiPairs.add(actorApiPair);
            accessApiIds.add(apiId);
            accessContractByApi.set(apiId, contract);
            accessApiByContract.set(contract, apiId);
            const actors = accessActorsByApi.get(apiId) ?? new Set();
            actors.add(participant);
            accessActorsByApi.set(apiId, actors);
        }
        const flowMachineTables = axisNamedCommentBodies(body, 'axis-flow-step-machine-table')
            .flatMap((commentBody) => markdownTables(commentBody))
            .filter((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 5
                && headers.every((header, index) => header === ['步骤', '参与者', 'api_id', '契约关系', '证据'][index]);
        });
        if (flowMachineTables.length !== 1 || flowMachineTables[0].rows.length < visibleFlowTable.rows.length) {
            throw new Error(`project knowledge compact secondary capability flow machine trace is incomplete: ${scope}`);
        }
        const flowApiIds = new Set();
        const flowStepsByApi = new Map();
        const tracedFlowSteps = new Set();
        const flowMappingsByStep = new Map();
        const flowParticipantsByApi = new Map();
        const flowAuthorizedActorsByApi = new Map();
        const flowRelationsByApi = new Map();
        for (const row of flowMachineTables[0].rows) {
            const stepId = normalizeMarkdownCell(row[0] ?? '');
            const participant = normalizeMarkdownCell(row[1] ?? '');
            const apiId = normalizeMarkdownCell(row[2] ?? '');
            const contractRelation = normalizeMarkdownCell(row[3] ?? '');
            const visibleStep = visibleFlowByStep.get(stepId);
            if (!visibleStep || visibleStep.participant !== participant
                || exactCodeAnchors(row[4] ?? '').length === 0) {
                throw new Error(`project knowledge compact secondary capability flow machine trace mismatches visible step: ${scope}/${stepId || 'unknown'}`);
            }
            tracedFlowSteps.add(stepId);
            const stepMappings = flowMappingsByStep.get(stepId) ?? new Set();
            if (stepMappings.has(apiId)) {
                throw new Error(`project knowledge compact secondary capability duplicates flow-interface mapping: ${scope}/${stepId}/${apiId}`);
            }
            stepMappings.add(apiId);
            flowMappingsByStep.set(stepId, stepMappings);
            if (apiId === 'not_applicable') {
                if (contractRelation !== 'not_applicable') {
                    throw new Error(`project knowledge compact secondary capability internal step requires contract relation not_applicable: ${scope}/${stepId}`);
                }
                continue;
            }
            if (!projectKnowledgeTraceIdentifierPattern.test(apiId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(apiId)
                || !/^(?:caller|producer|consumer|handler)$/.test(contractRelation)) {
                throw new Error(`project knowledge compact secondary capability flow references invalid api_id: ${scope}/${apiId || 'unknown'}`);
            }
            flowApiIds.add(apiId);
            const mappedSteps = flowStepsByApi.get(apiId) ?? new Set();
            mappedSteps.add(stepId);
            flowStepsByApi.set(apiId, mappedSteps);
            const participants = flowParticipantsByApi.get(apiId) ?? new Set();
            participants.add(participant);
            flowParticipantsByApi.set(apiId, participants);
            const relations = flowRelationsByApi.get(apiId) ?? new Set();
            relations.add(contractRelation);
            flowRelationsByApi.set(apiId, relations);
            if (/^(?:caller|producer)$/.test(contractRelation)) {
                const authorizedActors = flowAuthorizedActorsByApi.get(apiId) ?? new Set();
                authorizedActors.add(participant);
                flowAuthorizedActorsByApi.set(apiId, authorizedActors);
                if (!accessActorsByApi.get(apiId)?.has(participant)) {
                    throw new Error(`project knowledge compact secondary capability flow caller or producer lacks access evidence: ${scope}/${stepId}/${apiId}`);
                }
            }
            else if (accessActorsByApi.get(apiId)?.has(participant)) {
                throw new Error(`project knowledge compact secondary capability consumer or handler must not be represented as a caller: ${scope}/${stepId}/${apiId}`);
            }
        }
        if (!sameStringSet(tracedFlowSteps, visibleFlowByStep.keys())) {
            throw new Error(`project knowledge compact secondary capability flow machine trace omits a visible step: ${scope}`);
        }
        for (const [stepId, mappings] of flowMappingsByStep) {
            if (mappings.has('not_applicable') && mappings.size > 1) {
                throw new Error(`project knowledge compact secondary capability mixes interface and non-interface mappings: ${scope}/${stepId}`);
            }
        }
        if (interfaceNotApplicable && flowApiIds.size > 0) {
            throw new Error(`project knowledge compact secondary capability interface not_applicable flow must contain only internal steps: ${scope}`);
        }
        for (const [apiId, accessActors] of accessActorsByApi) {
            if (!sameStringSet(accessActors, flowAuthorizedActorsByApi.get(apiId) ?? [])) {
                throw new Error(`project knowledge compact secondary capability access evidence mismatches flow callers and producers: ${scope}/${apiId}`);
            }
        }
        if (normalizeMarkdownCell(sections.get(4) ?? '').length < 10) {
            throw new Error(`project knowledge compact partial secondary capability rules are empty: ${scope}`);
        }
        const rawInterfaceSection = rawNumberedTopLevelSection(body, 5);
        const interfaceGroups = numberedMarkdownSubsections(rawInterfaceSection, 5);
        const visibleInterfaceGroups = numberedMarkdownSubsections(sections.get(5) ?? '', 5);
        if (interfaceNotApplicable) {
            if (interfaceGroups.length > 0
                || axisNamedCommentBodies(body, 'axis-interface-machine-table').length > 0
                || axisNamedCommentBodies(body, 'axis-implementation-machine-table').length > 0
                || compactConcreteContractPattern.test(normalizeMarkdownCell(sections.get(5) ?? ''))
                || normalizeMarkdownCell(sections.get(5) ?? '').length < 10) {
                throw new Error(`project knowledge compact secondary capability interface not_applicable must not contain interface blocks: ${scope}`);
            }
            assertCompactEvidenceLocators(rawInterfaceSection, compactVisibleLocatorLines(rawInterfaceSection), `${scope}/5`);
            assertCompactEvidenceLocators([rawNumberedTopLevelSection(body, 1), rawNumberedTopLevelSection(body, 3)].join('\n'), compactVisibleLocatorLines([sections.get(1) ?? '', sections.get(3) ?? ''].join('\n')), scope);
            return;
        }
        const interfaceFields = [
            '接口/触发',
            '业务目的',
            '调用方/参与者',
            '前置条件/权限',
            '关键输入',
            '业务结果/状态变化',
            '失败/拒绝条件',
            '对应流程步骤',
            '实现定位',
        ];
        if (visibleInterfaceGroups.length === 0
            || visibleInterfaceGroups.some((group, index) => (group.index !== index + 1
                || group.title.length < 2
                || /^(?:代表入口|接口摘要|接口)$/.test(group.title)))) {
            throw new Error(`project knowledge compact secondary capability must group each concrete interface: ${scope}`);
        }
        if (interfaceGroups.length !== visibleInterfaceGroups.length
            || interfaceGroups.some((group, index) => (group.index !== visibleInterfaceGroups[index].index
                || normalizeMarkdownCell(group.title) !== normalizeMarkdownCell(visibleInterfaceGroups[index].title)))) {
            throw new Error(`project knowledge compact secondary capability interface headings must remain reader-visible: ${scope}`);
        }
        const interfaceSummaries = interfaceGroups.map((group, groupIndex) => {
            const visibleGroup = visibleInterfaceGroups[groupIndex];
            const matchingTables = markdownTables(visibleGroup.body)
                .filter((table) => markdownTableMatchesExactVerticalFields(table, interfaceFields));
            if (matchingTables.length !== 1) {
                throw new Error(`project knowledge compact secondary capability interface summary does not match fixed schema: ${scope}/5.${group.index}`);
            }
            const fields = exactVerticalMarkdownTableFields(matchingTables[0], interfaceFields, `${scope}/5.${group.index}`);
            if (interfaceFields.some((field) => !normalizeMarkdownCell(fields.get(field) ?? ''))
                || interfaceFields.some((field) => compactPlaceholderEvidencePattern.test(normalizeMarkdownCell(fields.get(field) ?? '')))
                || !compactConcreteContractPattern.test(normalizeMarkdownCell(fields.get('接口/触发') ?? ''))) {
                throw new Error(`project knowledge compact secondary capability interface summary aggregates or omits a concrete contract: ${scope}/5.${group.index}`);
            }
            const interfaceMachines = axisNamedCommentBodies(group.body, 'axis-interface-machine-table')
                .flatMap((commentBody) => markdownTables(commentBody))
                .map((table) => verticalMarkdownTableFields(table))
                .filter((machine) => machine !== null);
            if (interfaceMachines.length !== 1
                || ['level1_journey_id', 'flow_id', 'api_id', '契约类型', '方法与完整路径或主题', '请求模型', '响应模型', '状态']
                    .some((field) => !normalizeMarkdownCell(interfaceMachines[0].get(field) ?? ''))) {
                throw new Error(`project knowledge compact secondary capability interface block requires one scoped machine trace: ${scope}/5.${group.index}`);
            }
            assertCompactEvidenceLocators(group.body, compactVisibleLocatorLines(group.body), `${scope}/5.${group.index}`);
            const implementationTables = axisNamedCommentBodies(group.body, 'axis-implementation-machine-table')
                .flatMap((commentBody) => markdownTables(commentBody));
            if (implementationTables.length !== 1
                || implementationTables.some((table) => {
                    const headers = table.headers.map(normalizeMarkdownCell);
                    return headers.length !== 3
                        || headers.some((header, index) => header !== ['实现层', '精确定位', '职责'][index])
                        || table.rows.length === 0
                        || table.rows.some((row) => (row.some((cell) => !normalizeMarkdownCell(cell))
                            || exactCodeAnchors(row[1] ?? '').length !== 1));
                })) {
                throw new Error(`project knowledge compact secondary capability interface block requires one scoped implementation trace: ${scope}/5.${group.index}`);
            }
            const implementationAnchors = implementationTables[0].rows
                .flatMap((row) => exactCodeAnchors(row[1] ?? ''))
                .map((anchor) => {
                const parsed = /^(.+):([1-9]\d*)-([1-9]\d*)#([A-Za-z_$][A-Za-z0-9_$<>.\-]*)$/.exec(anchor);
                return parsed
                    ? compactCodeAnchor(anchor, parsed[1], parsed[2], parsed[3], parsed[4])
                    : null;
            })
                .filter((anchor) => anchor !== null);
            const visibleImplementationLocators = compactVisibleLocatorLines(visibleGroup.body)
                .flatMap((line) => shortCodeAnchors(line));
            if (visibleImplementationLocators.length === 0
                || visibleImplementationLocators.some((locator) => (implementationAnchors.filter((anchor) => (anchor.fileName === locator.fileName
                    && anchor.lineStart === locator.lineStart
                    && anchor.lineEnd === locator.lineEnd
                    && anchor.symbol === locator.symbol)).length !== 1))) {
                throw new Error(`project knowledge compact secondary capability visible implementation locator does not match its scoped implementation trace: ${scope}/5.${group.index}`);
            }
            return { fields, machine: interfaceMachines[0] };
        });
        const allInterfaceMachineComments = axisNamedCommentBodies(body, 'axis-interface-machine-table');
        const allImplementationMachineComments = axisNamedCommentBodies(body, 'axis-implementation-machine-table');
        if (allInterfaceMachineComments.length !== interfaceGroups.length
            || allImplementationMachineComments.length !== interfaceGroups.length) {
            throw new Error(`project knowledge compact secondary capability interface traces must stay inside their 5.N blocks: ${scope}`);
        }
        const interfaceApiIds = new Set();
        const interfaceApiByContract = new Map();
        for (let index = 0; index < interfaceSummaries.length; index += 1) {
            const { machine, fields: summary } = interfaceSummaries[index];
            const apiId = normalizeMarkdownCell(machine.get('api_id') ?? '');
            const contract = compactCanonicalContract(machine.get('方法与完整路径或主题') ?? '');
            const contractType = normalizeMarkdownCell(machine.get('契约类型') ?? '');
            const callers = compactDelimitedValues(summary.get('调用方/参与者') ?? '');
            const correspondingSteps = compactStepIds(summary.get('对应流程步骤') ?? '');
            const allowedRelations = contractType === 'HTTP'
                ? new Set(['caller', 'handler'])
                : /^(?:EVENT|TOPIC)$/.test(contractType)
                    ? new Set(['producer', 'consumer'])
                    : new Set(['caller', 'handler']);
            const contractRelations = flowRelationsByApi.get(apiId) ?? new Set();
            if (!projectKnowledgeTraceIdentifierPattern.test(apiId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(apiId)
                || interfaceApiIds.has(apiId)
                || !compactConcreteContractPattern.test(contract)
                || contract !== compactCanonicalContract(summary.get('接口/触发') ?? '')
                || !compactContractMatchesType(contract, contractType)
                || contractRelations.size === 0
                || [...contractRelations].some((relation) => !allowedRelations.has(relation))
                || callers.length === 0
                || !sameStringSet(callers, flowParticipantsByApi.get(apiId) ?? [])
                || correspondingSteps.length === 0
                || new Set(correspondingSteps).size !== correspondingSteps.length
                || !sameStringSet(correspondingSteps, flowStepsByApi.get(apiId) ?? [])) {
                throw new Error(`project knowledge compact secondary capability interface block is not one-to-one with its api_id, contract and callers: ${scope}/5.${index + 1}/${apiId || 'unknown'}`);
            }
            interfaceApiIds.add(apiId);
            const previousApiId = interfaceApiByContract.get(contract);
            if (previousApiId && previousApiId !== apiId) {
                throw new Error(`project knowledge compact secondary capability concrete interface contract maps to multiple api_id values: ${scope}/${contract}`);
            }
            interfaceApiByContract.set(contract, apiId);
            if (accessContractByApi.get(apiId) !== contract) {
                throw new Error(`project knowledge compact secondary capability access matrix mismatches interface block: ${scope}/${apiId}`);
            }
        }
        if (!sameStringSet(interfaceApiIds, accessApiIds)
            || !sameStringSet(interfaceApiIds, flowApiIds)) {
            throw new Error(`project knowledge compact secondary capability api_id sets do not close across access, flow and interface blocks: ${scope}`);
        }
        assertCompactEvidenceLocators([rawNumberedTopLevelSection(body, 1), rawNumberedTopLevelSection(body, 3)].join('\n'), compactVisibleLocatorLines([sections.get(1) ?? '', sections.get(3) ?? ''].join('\n')), scope);
        return;
    }
    const legacyAccessTables = markdownTables(sections.get(2) ?? '');
    const accessTable = legacyAccessTables.find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === 5
            && headers.every((header, index) => header === ['主体', '策略', '真实入口', '结果', '定位'][index]);
    });
    const legacyReaderAccessTable = legacyAccessTables.find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === 4
            && headers.every((header, index) => header === [
                '主体/角色',
                '所需权限/策略',
                '可调用接口/能力',
                '数据范围',
            ][index]);
    });
    const selectedLegacyAccessTable = accessTable ?? legacyReaderAccessTable;
    if (!selectedLegacyAccessTable || selectedLegacyAccessTable.rows.length === 0
        || selectedLegacyAccessTable.rows.some((row) => row.some((cell) => !normalizeMarkdownCell(cell)))) {
        throw new Error(`project knowledge compact partial secondary capability access matrix is empty: ${scope}`);
    }
    if (accessTable) {
        assertCompactPartialMethodDiagrams(sections.get(3) ?? '', `${scope}/3`);
    }
    else {
        const legacyDiagrams = mermaidDiagramBodies(sections.get(3) ?? '')
            .filter((diagram) => /\b(?:flowchart|graph)\b/i.test(diagram));
        if (legacyDiagrams.length === 0 || legacyDiagrams.some((diagram) => {
            const nodes = flowchartNodeLabelMap(diagram);
            const edges = flowchartEdgeEndpoints(diagram);
            return nodes.size < 2
                || edges.edgeCount === 0
                || !edges.traceable
                || [...edges.endpointIds].some((nodeId) => !nodes.has(nodeId));
        })) {
            throw new Error(`project knowledge compact partial legacy capability flow is empty: ${scope}`);
        }
    }
    if (normalizeMarkdownCell(sections.get(4) ?? '').length < 10) {
        throw new Error(`project knowledge compact partial secondary capability rules are empty: ${scope}`);
    }
    const legacyInterfaceTables = markdownTables(sections.get(5) ?? '');
    const interfaceTable = legacyInterfaceTables.find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === 4
            && headers.every((header, index) => header === ['入口', '处理方法', '成功结果', '边界'][index]);
    });
    const legacyReaderInterfaceTables = numberedMarkdownSubsections(sections.get(5) ?? '', 5)
        .flatMap((group) => markdownTables(group.body))
        .filter((table) => markdownTableMatchesExactVerticalFields(table, [
        '入口',
        '业务目的',
        '调用方',
        '用户/调用方可见结果',
        '方法定位',
    ]));
    if ((!interfaceTable || interfaceTable.rows.length === 0
        || interfaceTable.rows.some((row) => row.some((cell) => !normalizeMarkdownCell(cell))))
        && legacyReaderInterfaceTables.length === 0) {
        throw new Error(`project knowledge compact partial secondary capability interface summary is empty: ${scope}`);
    }
    const locatorBodies = accessTable
        ? accessTable.rows.map((row) => row[4] ?? '')
        : compactVisibleLocatorLines(body);
    assertCompactEvidenceLocators(body, locatorBodies, scope);
}
function isCompactPartialLevel1CapabilityDetailedDesign(body) {
    const visibleBody = visibleMarkdownBody(body);
    const headings = visibleNumberedLevel2Headings(body);
    return declaresCompactReaderProfile(body)
        || (headings.length === 6
            && /^##\s+1\.?\s+(?:设计结论与能力边界|能力边界)\s*$/m.test(visibleBody)
            && /^##\s+2\.?\s+(?:二级能力完整性与导航|二级能力)\s*$/m.test(visibleBody)
            && /^##\s+6\.?\s+(?:缺口与覆盖说明|证据与缺口)\s*$/m.test(visibleBody));
}
function assertCompactPartialLevel1CapabilityDetailedDesign(body, capabilityId, secondaryCapabilities, gapReportBody) {
    const sections = compactTopLevelSections(body, [
        ['设计结论与能力边界', '能力边界'],
        ['二级能力完整性与导航', '二级能力'],
        ['对外业务能力与接口实现', '对外业务入口'],
        ['业务语义', '原子流程'],
        ['表结构设计', '关键规则'],
        ['缺口与覆盖说明', '证据与缺口'],
    ], capabilityId);
    const currentCompactProfile = /^##\s+3\.?\s+对外业务能力与接口实现\s*$/m
        .test(visibleMarkdownBody(body));
    const metadata = axisDocumentMetadata(body, capabilityId);
    if (metadataScalar(metadata, 'reader_profile') !== 'compact') {
        throw new Error(`project knowledge compact partial level-1 capability requires reader_profile=compact: ${capabilityId}`);
    }
    if (metadataScalar(metadata, 'level1_capability_id') !== capabilityId) {
        throw new Error(`project knowledge compact partial level-1 metadata identity mismatch: ${capabilityId}`);
    }
    const coverageControls = [
        ['user_journey_design_status', 'detailed'],
        ['user_journey_coverage', 'partial'],
        ['table_design_status', 'detailed'],
        ['table_design_coverage', 'partial'],
        ['dependency_graph_status', 'pending_level1_completion'],
        ['dependency_graph_revision', 'not_derived'],
    ];
    if (coverageControls.some(([key, expected]) => metadataScalar(metadata, key) !== expected)) {
        throw new Error(`project knowledge compact partial level-1 metadata coverage is invalid: ${capabilityId}`);
    }
    const gapIds = [
        metadataScalar(metadata, 'user_journey_gap_id'),
        metadataScalar(metadata, 'table_design_gap_id'),
        metadataScalar(metadata, 'dependency_graph_gap_id'),
    ];
    if (gapIds.some((gapId) => !projectKnowledgeTraceIdentifierPattern.test(gapId)
        || invalidProjectKnowledgeTraceIdentifierPattern.test(gapId))) {
        throw new Error(`project knowledge compact partial level-1 requires explicit gaps: ${capabilityId}`);
    }
    for (const gapId of gapIds.slice(0, 2)) {
        const escapedGapId = gapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const gapPattern = new RegExp(`(^|[^A-Za-z0-9_.:\\-])${escapedGapId}([^A-Za-z0-9_.:\\-]|$)`);
        if (!gapPattern.test(gapReportBody)) {
            throw new Error(`project knowledge compact partial level-1 gap is not traced: ${capabilityId}/${gapId}`);
        }
    }
    const visibleGapSection = sections.get(6) ?? '';
    const gapMachineTrace = axisNamedCommentBodies(body, 'axis-gap-machine-table').join('\n');
    if ((currentCompactProfile
        && (!/(?:缺口|未覆盖|仍需|补齐|补证)/.test(visibleGapSection)
            || gapIds.some((gapId) => !gapMachineTrace.includes(gapId))))
        || (!currentCompactProfile
            && (!/\bpartial\b/.test(visibleGapSection)
                || !/(?:缺口|未覆盖|仍需|补齐|补证)/.test(visibleGapSection)))) {
        throw new Error(`project knowledge compact partial level-1 evidence gap is empty: ${capabilityId}`);
    }
    if (normalizeMarkdownCell(sections.get(1) ?? '').length < 10) {
        throw new Error(`project knowledge compact partial level-1 boundary is empty: ${capabilityId}`);
    }
    const navigationTable = markdownTables(sections.get(2) ?? '').find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === 3
            && headers.every((header, index) => (header === [
                '二级能力',
                currentCompactProfile ? '业务摘要' : '最小业务结果',
                '详情',
            ][index]));
    });
    if (!navigationTable || navigationTable.rows.length !== secondaryCapabilities.length) {
        throw new Error(`project knowledge compact partial level-1 secondary capability navigation is incomplete: ${capabilityId}`);
    }
    const linkedSecondaryIds = new Set();
    for (const row of navigationTable.rows) {
        if (normalizeMarkdownCell(row[0] ?? '').length < 2
            || normalizeMarkdownCell(row[1] ?? '').length < 2) {
            throw new Error(`project knowledge compact partial level-1 has an empty minimum business outcome: ${capabilityId}`);
        }
        const link = /secondary-capabilities\/([a-z][a-z0-9_]*)\/detailed-design\.md/.exec(row[2] ?? '');
        if (!link || linkedSecondaryIds.has(link[1])) {
            throw new Error(`project knowledge compact partial level-1 secondary capability navigation is invalid: ${capabilityId}`);
        }
        linkedSecondaryIds.add(link[1]);
    }
    for (const secondary of secondaryCapabilities) {
        const secondaryId = secondary.secondary_capability_id;
        if (!linkedSecondaryIds.has(secondaryId)) {
            throw new Error(`project knowledge compact partial level-1 overview omits secondary capability link: ${capabilityId}/${secondaryId}`);
        }
    }
    if (currentCompactProfile) {
        const journeyTables = axisNamedCommentBodies(body, 'axis-journey-machine-table')
            .flatMap((commentBody) => markdownTables(commentBody))
            .map((table) => verticalMarkdownTableFields(table))
            .filter((fields) => fields !== null);
        const journeySecondaryIds = journeyTables.map((fields) => (normalizeMarkdownCell(fields.get('secondary_capability_id') ?? '')));
        if (journeyTables.length < secondaryCapabilities.length
            || journeyTables.some((fields) => (['level1_journey_id', 'flow_id', 'secondary_capability_id', 'api_id', '代表入口']
                .some((field) => !normalizeMarkdownCell(fields.get(field) ?? ''))))) {
            throw new Error(`project knowledge compact partial level-1 business entry coverage is incomplete: ${capabilityId}`);
        }
        for (const secondary of secondaryCapabilities) {
            const secondaryId = secondary.secondary_capability_id;
            if (journeySecondaryIds.filter((value) => value === secondaryId).length !== 1) {
                throw new Error(`project knowledge compact partial level-1 business entry omits secondary capability: ${capabilityId}/${secondaryId}`);
            }
        }
        assertCompactSingleLayerDiagrams(sections.get(3) ?? '', `${capabilityId}/3`);
        if (normalizeMarkdownCell(sections.get(4) ?? '').length < 10) {
            throw new Error(`project knowledge compact partial level-1 business semantics are empty: ${capabilityId}`);
        }
        const tableSummary = markdownTables(sections.get(5) ?? '').find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 5 && table.rows.length > 0;
        });
        const tableInventory = axisNamedCommentBodies(body, 'axis-table-inventory-machine-table')
            .flatMap((commentBody) => markdownTables(commentBody))
            .find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 6
                && headers.every((header, index) => header === [
                    'table_id',
                    '物理表名',
                    '业务实体/用途',
                    '所属二级能力',
                    '读写 api_id',
                    '证据',
                ][index]);
        });
        if (!tableSummary || !tableInventory || tableInventory.rows.length === 0) {
            throw new Error(`project knowledge compact partial level-1 table summary is empty: ${capabilityId}`);
        }
        assertCompactEvidenceLocators(body, compactVisibleLocatorLines([
            sections.get(1) ?? '',
            sections.get(3) ?? '',
            sections.get(5) ?? '',
        ].join('\n')), capabilityId);
        return new Map(secondaryCapabilities.map((secondary) => [
            secondary.secondary_capability_id,
            [],
        ]));
    }
    const entryTable = markdownTables(sections.get(3) ?? '').find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === 4
            && headers.every((header, index) => header === ['业务', '代表入口', '原子能力', '用户结果'][index]);
    });
    if (!entryTable || entryTable.rows.length < secondaryCapabilities.length
        || entryTable.rows.some((row) => row.some((cell) => !normalizeMarkdownCell(cell)))) {
        throw new Error(`project knowledge compact partial level-1 business entry coverage is incomplete: ${capabilityId}`);
    }
    const entryCapabilityNames = new Set(entryTable.rows.map((row) => normalizeMarkdownCell(row[2] ?? '')));
    for (const secondary of secondaryCapabilities) {
        const expectedName = secondary.secondary_capability_name ?? secondary.name;
        if (expectedName && !entryCapabilityNames.has(expectedName)) {
            throw new Error(`project knowledge compact partial level-1 business entry omits secondary capability: ${capabilityId}/${secondary.secondary_capability_id}`);
        }
    }
    assertCompactPartialMethodDiagrams(sections.get(4) ?? '', `${capabilityId}/4`);
    if (normalizeMarkdownCell(sections.get(5) ?? '').length < 10) {
        throw new Error(`project knowledge compact partial level-1 rules are empty: ${capabilityId}`);
    }
    const visibleEvidenceLines = (sections.get(6) ?? '')
        .split(/\r?\n/)
        .filter((line) => shortCodeAnchors(line).length > 0);
    assertCompactEvidenceLocators(body, visibleEvidenceLines, capabilityId);
    return new Map(secondaryCapabilities.map((secondary) => [
        secondary.secondary_capability_id,
        [],
    ]));
}
function assertSecondaryAccessMatrix(body, scope, journeyBindings) {
    if (/^##\s+\d+\.?\s+(?:身份、职责与 business_id 映射|参与者、权限与数据范围)\s*$/m.test(body)) {
        throw new Error(`project knowledge secondary capability detailed design uses legacy duplicate access sections: ${scope}`);
    }
    const boundarySection = projectKnowledgeSection(body, /^##\s+1\.?\s+能力定位与边界\s*$/m);
    if (!boundarySection || normalizeMarkdownCell(boundarySection).length < 10) {
        throw new Error(`project knowledge secondary capability detailed design missing capability boundary: ${scope}`);
    }
    const accessSection = projectKnowledgeSection(body, /^##\s+2\.?\s+调用主体、权限与接口矩阵\s*$/m);
    if (!accessSection) {
        throw new Error(`project knowledge secondary capability detailed design missing subject-permission-interface matrix: ${scope}`);
    }
    const expectedHeaders = [
        '主体/角色',
        '所需权限/策略',
        'api_id',
        '可调用接口/能力',
        '数据范围',
        '授权证据',
    ];
    const accessTable = markdownTables(accessSection).find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === expectedHeaders.length
            && headers.every((header, index) => header === expectedHeaders[index]);
    });
    if (!accessTable || accessTable.rows.length === 0) {
        throw new Error(`project knowledge secondary capability access matrix missing fixed schema or rows: ${scope}`);
    }
    const normalizedHeaders = accessTable.headers.map(normalizeMarkdownCell);
    const apiIdColumn = normalizedHeaders.indexOf('api_id');
    const subjectColumn = normalizedHeaders.indexOf('主体/角色');
    const interfaceColumn = normalizedHeaders.indexOf('可调用接口/能力');
    const permissionColumn = normalizedHeaders.indexOf('所需权限/策略');
    const dataScopeColumn = normalizedHeaders.indexOf('数据范围');
    const evidenceColumn = normalizedHeaders.indexOf('授权证据');
    const interfaceBindingsByApi = new Map([...journeyBindings.values()].flat().map((binding) => [binding.apiId, binding]));
    const coveredApiIds = new Set();
    for (const row of accessTable.rows) {
        const apiId = normalizeMarkdownCell(row[apiIdColumn] ?? '');
        const subject = normalizeMarkdownCell(row[subjectColumn] ?? '');
        const interfaceEntry = normalizeMarkdownCell(row[interfaceColumn] ?? '');
        const permission = normalizeMarkdownCell(row[permissionColumn] ?? '');
        const dataScope = normalizeMarkdownCell(row[dataScopeColumn] ?? '');
        const evidence = row[evidenceColumn] ?? '';
        if (subject.length < 2 || /^(?:actor|user|caller|参与者|调用方|用户|角色)$/i.test(subject)) {
            throw new Error(`project knowledge secondary capability access matrix has generic subject: ${scope}/${apiId || 'unknown'}`);
        }
        if (permission.length < 2 || /^(?:执行已授权流程|已授权|有权限|按权限控制|具备对应权限|具备相应权限|权限校验|根据权限)$/i.test(permission)) {
            throw new Error(`project knowledge secondary capability access matrix has generic permission: ${scope}/${apiId || 'unknown'}`);
        }
        if (dataScope.length < 2 || /^(?:当前租户及业务归属|当前范围|相关数据|业务数据|按权限范围|数据范围)$/i.test(dataScope)) {
            throw new Error(`project knowledge secondary capability access matrix has generic data scope: ${scope}/${apiId || 'unknown'}`);
        }
        if (exactCodeAnchors(evidence).length === 0 && !/(?:missing_evidence|缺失证据)/.test(evidence)) {
            throw new Error(`project knowledge secondary capability access matrix missing authorization evidence: ${scope}/${apiId || 'unknown'}`);
        }
        const binding = interfaceBindingsByApi.get(apiId);
        if (binding && interfaceEntry !== binding.interfaceEntry) {
            throw new Error(`project knowledge secondary capability access matrix mismatches interface: ${scope}/${apiId}`);
        }
        coveredApiIds.add(apiId);
    }
    const interfaceApiIds = new Set(interfaceBindingsByApi.keys());
    for (const apiId of coveredApiIds) {
        if (!interfaceApiIds.has(apiId)) {
            throw new Error(`project knowledge secondary capability access matrix references unknown api_id: ${scope}/${apiId || 'unknown'}`);
        }
    }
    for (const apiId of interfaceApiIds) {
        if (!coveredApiIds.has(apiId)) {
            throw new Error(`project knowledge secondary capability access matrix omits api_id: ${scope}/${apiId}`);
        }
    }
}
function secondaryInterfaceTraceBindings(interfaceSection, chapterNumber, scope, enforceAtomicMethodDiagrams = false) {
    const groupPattern = /^###(?!#)\s+(\d+)\.(\d+)\s+(.+?)\s*$/gm;
    const groupMatches = [...interfaceSection.matchAll(groupPattern)];
    const legacyGroupTitles = new Set([
        '接口清单与代码追踪',
        '接口清单与代码追溯',
        '请求字段',
        '响应字段',
        '错误码与异常映射',
    ]);
    if (groupMatches.length === 0
        || groupMatches.some((match) => legacyGroupTitles.has(match[3].trim()))) {
        throw new Error(`project knowledge secondary capability interface design must group each interface: ${scope}`);
    }
    const expectedSubsections = [
        '接口清单与代码追溯',
        '内部处理逻辑',
        '请求字段',
        '响应字段',
        '错误码与异常映射',
        '认证与授权执行',
        '事务、并发、性能与容错',
        '安全、测试与验收',
    ];
    const bindings = new Map();
    const apiIds = new Set();
    const concreteInterfacePattern = /(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+)/;
    const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:\-]*$/;
    const invalidIdentifierPattern = /^(?:missing_evidence|not_applicable|none|todo|tbd)$/i;
    for (let groupIndex = 0; groupIndex < groupMatches.length; groupIndex += 1) {
        const groupMatch = groupMatches[groupIndex];
        const groupChapter = Number(groupMatch[1]);
        const groupNumber = Number(groupMatch[2]);
        const groupTitle = groupMatch[3].trim();
        const groupPrefix = `${chapterNumber}.${groupNumber}`;
        if (groupChapter !== chapterNumber || groupNumber !== groupIndex + 1) {
            throw new Error(`project knowledge secondary capability interface group numbering mismatch: ${scope}/${groupMatch[1]}.${groupMatch[2]}`);
        }
        if (!/(?:接口|事件|任务|命令)$/.test(groupTitle)) {
            throw new Error(`project knowledge secondary capability interface group missing contract title: ${scope}/${groupPrefix}`);
        }
        const groupStart = (groupMatch.index ?? 0) + groupMatch[0].length;
        const groupEnd = groupIndex + 1 < groupMatches.length
            ? (groupMatches[groupIndex + 1].index ?? interfaceSection.length)
            : interfaceSection.length;
        const groupBody = interfaceSection.slice(groupStart, groupEnd);
        const subsectionPattern = /^####(?!#)\s+(\d+)\.(\d+)\.(\d+)\s+(.+?)\s*$/gm;
        const subsectionMatches = [...groupBody.matchAll(subsectionPattern)];
        if (subsectionMatches.some((match) => (Number(match[1]) !== chapterNumber || Number(match[2]) !== groupNumber))) {
            throw new Error(`project knowledge secondary capability interface group subsection numbering mismatch: ${scope}/${groupPrefix}`);
        }
        const subsectionByNumber = new Map();
        for (const subsectionMatch of subsectionMatches) {
            const subsectionNumber = Number(subsectionMatch[3]);
            if (subsectionByNumber.has(subsectionNumber)) {
                throw new Error(`project knowledge secondary capability interface group subsection numbering mismatch: ${scope}/${groupPrefix}`);
            }
            subsectionByNumber.set(subsectionNumber, subsectionMatch);
        }
        for (let subsectionIndex = 0; subsectionIndex < expectedSubsections.length; subsectionIndex += 1) {
            const subsectionNumber = subsectionIndex + 1;
            const expectedTitle = expectedSubsections[subsectionIndex];
            const subsectionMatch = subsectionByNumber.get(subsectionNumber);
            if (!subsectionMatch || subsectionMatch[4].trim() !== expectedTitle) {
                throw new Error(`project knowledge secondary capability interface group missing ${groupPrefix}.${subsectionNumber} ${expectedTitle}: ${scope}`);
            }
        }
        if (subsectionMatches.length !== expectedSubsections.length) {
            throw new Error(`project knowledge secondary capability interface group subsection numbering mismatch: ${scope}/${groupPrefix}`);
        }
        const subsectionBodies = new Map();
        for (let subsectionIndex = 0; subsectionIndex < subsectionMatches.length; subsectionIndex += 1) {
            const subsectionMatch = subsectionMatches[subsectionIndex];
            const subsectionNumber = Number(subsectionMatch[3]);
            const subsectionStart = (subsectionMatch.index ?? 0) + subsectionMatch[0].length;
            const subsectionEnd = subsectionIndex + 1 < subsectionMatches.length
                ? (subsectionMatches[subsectionIndex + 1].index ?? groupBody.length)
                : groupBody.length;
            subsectionBodies.set(subsectionNumber, groupBody.slice(subsectionStart, subsectionEnd));
        }
        const traceTables = markdownTables(subsectionBodies.get(1) ?? '');
        const requiredContractFields = [
            'level1_journey_id',
            'api_id',
            '业务目的',
            '调用方',
            '请求模型',
            '响应模型',
            '状态',
        ];
        const contractTable = traceTables.find((table) => {
            const fields = verticalMarkdownTableFields(table);
            return fields
                && requiredContractFields.every((field) => normalizeMarkdownCell(fields.get(field) ?? ''))
                && [...fields.keys()].some((key) => key.startsWith('方法与完整路径'));
        });
        const implementationTable = traceTables.find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            const entityRow = table.rows.find((row) => normalizeMarkdownCell(row[0] ?? '') === '实体/表');
            return headers.length === 3
                && headers[0] === '实现层'
                && headers[1] === '精确定位'
                && headers[2] === '职责'
                && /\btable_id\s*=/.test(entityRow?.[1] ?? '');
        });
        if (!contractTable || !implementationTable) {
            throw new Error(`project knowledge secondary capability interface group missing compact contract tables: ${scope}/${groupPrefix}`);
        }
        const contractFields = new Map();
        for (const row of contractTable.rows) {
            const key = normalizeMarkdownCell(row[0] ?? '');
            if (contractFields.has(key)) {
                throw new Error(`project knowledge secondary capability interface group duplicates contract field ${key}: ${scope}/${groupPrefix}`);
            }
            contractFields.set(key, row[1] ?? '');
        }
        for (const field of requiredContractFields) {
            if (!normalizeMarkdownCell(contractFields.get(field) ?? '')) {
                throw new Error(`project knowledge secondary capability interface group missing contract field ${field}: ${scope}/${groupPrefix}`);
            }
        }
        const interfaceField = [...contractFields.entries()].find(([key]) => key.startsWith('方法与完整路径'));
        if (!interfaceField || !normalizeMarkdownCell(interfaceField[1])) {
            throw new Error(`project knowledge secondary capability interface group missing contract field 方法与完整路径或主题: ${scope}/${groupPrefix}`);
        }
        const apiId = normalizeMarkdownCell(contractFields.get('api_id') ?? '');
        const interfaceEntry = normalizeMarkdownCell(interfaceField[1]);
        const status = normalizeMarkdownCell(contractFields.get('状态') ?? '');
        if (!identifierPattern.test(apiId) || invalidIdentifierPattern.test(apiId)) {
            throw new Error(`project knowledge secondary capability interface group has invalid api_id: ${scope}/${groupPrefix}`);
        }
        if (apiIds.has(apiId)) {
            throw new Error(`project knowledge secondary capability interface design has duplicate api_id: ${scope}/${apiId}`);
        }
        apiIds.add(apiId);
        if (!concreteInterfacePattern.test(interfaceEntry)) {
            throw new Error(`project knowledge secondary capability interface group missing concrete contract: ${scope}/${groupPrefix}`);
        }
        if (!/^(?:已实现|目标设计|缺失证据)$/.test(status)) {
            throw new Error(`project knowledge secondary capability interface group has invalid status: ${scope}/${groupPrefix}`);
        }
        const implementationRows = new Map();
        for (const row of implementationTable.rows) {
            const implementationLayer = normalizeMarkdownCell(row[0] ?? '');
            if (implementationRows.has(implementationLayer)) {
                throw new Error(`project knowledge secondary capability interface group duplicates implementation trace ${implementationLayer}: ${scope}/${groupPrefix}`);
            }
            implementationRows.set(implementationLayer, row);
        }
        const requiredImplementationRows = [
            'Controller/入口',
            'Service/用例',
            'Mapper/Repository',
            '实体/表',
            '测试',
        ];
        for (const rowName of requiredImplementationRows) {
            const row = implementationRows.get(rowName);
            if (!row || !normalizeMarkdownCell(row[1] ?? '') || !normalizeMarkdownCell(row[2] ?? '')) {
                throw new Error(`project knowledge secondary capability interface group missing implementation trace ${rowName}: ${scope}/${groupPrefix}`);
            }
        }
        const controllerAnchors = exactCodeAnchors(implementationRows.get('Controller/入口')?.[1] ?? '');
        const serviceAnchors = exactCodeAnchors(implementationRows.get('Service/用例')?.[1] ?? '');
        const mapperAnchors = exactCodeAnchors(implementationRows.get('Mapper/Repository')?.[1] ?? '');
        const testAnchors = exactCodeAnchors(implementationRows.get('测试')?.[1] ?? '');
        if (status === '已实现'
            && [controllerAnchors, serviceAnchors, mapperAnchors, testAnchors].some((anchors) => anchors.length === 0)) {
            throw new Error(`project knowledge secondary capability interface design missing exact code anchors: ${scope}`);
        }
        const entityTableTrace = normalizeMarkdownCell(implementationRows.get('实体/表')?.[1] ?? '');
        if (exactCodeAnchors(implementationRows.get('实体/表')?.[1] ?? '').length === 0) {
            throw new Error(`project knowledge secondary capability interface group entity/table trace missing exact evidence: ${scope}/${groupPrefix}`);
        }
        const rawTableIds = [...entityTableTrace.matchAll(/\btable_id\s*=\s*([A-Za-z_][A-Za-z0-9_]*|not_applicable)\b/g)]
            .map((match) => match[1]);
        if (rawTableIds.length === 0
            || new Set(rawTableIds).size !== rawTableIds.length
            || (rawTableIds.includes('not_applicable') && rawTableIds.length > 1)) {
            throw new Error(`project knowledge secondary capability interface group has invalid parent table_id trace: ${scope}/${groupPrefix}`);
        }
        const tableIds = rawTableIds.filter((tableId) => tableId !== 'not_applicable');
        const physicalTableMatch = /(?:^|[;；])\s*物理表\s+([^;；]+)\s*$/.exec(entityTableTrace);
        const physicalTableTokens = physicalTableMatch
            ? traceIdentifierList(physicalTableMatch[1])
            : [];
        const physicalTableNames = new Map();
        if (tableIds.length === 0) {
            if (physicalTableTokens.length !== 1 || physicalTableTokens[0] !== 'not_applicable') {
                throw new Error(`project knowledge secondary capability interface group has invalid no-persistence physical table trace: ${scope}/${groupPrefix}`);
            }
        }
        else {
            if (physicalTableTokens.length !== tableIds.length
                || physicalTableTokens.some((physicalTableName) => !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(physicalTableName))) {
                throw new Error(`project knowledge secondary capability interface group has invalid physical table trace: ${scope}/${groupPrefix}`);
            }
            tableIds.forEach((tableId, tableIndex) => {
                physicalTableNames.set(tableId, physicalTableTokens[tableIndex]);
            });
        }
        const internalLogic = subsectionBodies.get(2) ?? '';
        if (hasGenericInterfaceLogicPlaceholder(internalLogic)) {
            throw new Error(`project knowledge secondary capability interface internal logic uses generic placeholder: ${scope}/${groupPrefix}`);
        }
        if (!hasConcreteInterfaceLogicSummary(internalLogic)) {
            throw new Error(`project knowledge secondary capability interface internal logic missing concrete summary: ${scope}/${groupPrefix}`);
        }
        if (enforceAtomicMethodDiagrams) {
            assertAtomicInterfaceLogicDiagrams(internalLogic, `${scope}/${groupPrefix}`);
        }
        if (!hasInterfaceLogicDiagramOrStepTable(internalLogic)) {
            throw new Error(`project knowledge secondary capability interface internal logic missing flow diagram or step table: ${scope}/${groupPrefix}`);
        }
        for (const subsectionNumber of [3, 4, 5]) {
            if (!markdownTables(subsectionBodies.get(subsectionNumber) ?? '').some((table) => table.rows.length > 0)) {
                throw new Error(`project knowledge secondary capability interface group ${groupPrefix}.${subsectionNumber} has no field contract: ${scope}`);
            }
        }
        const accessControlTable = markdownTables(subsectionBodies.get(6) ?? '').find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 3 && headers[0] === '维度' && headers[1] === '设计' && headers[2] === '证据';
        });
        const accessControlDimensions = new Map();
        for (const row of accessControlTable?.rows ?? []) {
            accessControlDimensions.set(normalizeMarkdownCell(row[0] ?? ''), row);
        }
        for (const dimension of ['认证', '授权']) {
            const accessControlRow = accessControlDimensions.get(dimension);
            if (!accessControlRow
                || !normalizeMarkdownCell(accessControlRow[1] ?? '')
                || !normalizeMarkdownCell(accessControlRow[2] ?? '')) {
                throw new Error(`project knowledge secondary capability interface group missing ${dimension} design: ${scope}/${groupPrefix}`);
            }
            if (status === '已实现'
                && exactCodeAnchors(accessControlRow[2] ?? '').length === 0
                && !/(?:missing_evidence|缺失证据)/.test(accessControlRow[2] ?? '')) {
                throw new Error(`project knowledge secondary capability interface group ${dimension} design missing exact evidence: ${scope}/${groupPrefix}`);
            }
        }
        const operationalTable = markdownTables(subsectionBodies.get(7) ?? '').find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 3 && headers[0] === '维度' && headers[1] === '设计' && headers[2] === '证据';
        });
        const operationalDimensions = new Map();
        for (const row of operationalTable?.rows ?? []) {
            operationalDimensions.set(normalizeMarkdownCell(row[0] ?? ''), row);
        }
        for (const dimension of [
            '事务/一致性',
            '幂等',
            '并发',
            '超时/重试/补偿',
            '性能/容量',
            '降级/可观测性',
        ]) {
            const operationalRow = operationalDimensions.get(dimension);
            if (!operationalRow
                || !normalizeMarkdownCell(operationalRow[1] ?? '')
                || !normalizeMarkdownCell(operationalRow[2] ?? '')) {
                throw new Error(`project knowledge secondary capability interface group missing ${dimension} design: ${scope}/${groupPrefix}`);
            }
            if (status === '已实现'
                && exactCodeAnchors(operationalRow[2] ?? '').length === 0
                && !/(?:missing_evidence|缺失证据)/.test(operationalRow[2] ?? '')) {
                throw new Error(`project knowledge secondary capability interface group ${dimension} design missing exact evidence: ${scope}/${groupPrefix}`);
            }
        }
        const securityAcceptanceTable = markdownTables(subsectionBodies.get(8) ?? '').find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === 3
                && headers[0] === '维度'
                && headers[1] === '设计/验收标准'
                && headers[2] === '证据/计划';
        });
        const securityAcceptanceDimensions = new Map();
        for (const row of securityAcceptanceTable?.rows ?? []) {
            securityAcceptanceDimensions.set(normalizeMarkdownCell(row[0] ?? ''), row);
        }
        for (const dimension of ['安全', '测试', '验收']) {
            const securityAcceptanceRow = securityAcceptanceDimensions.get(dimension);
            if (!securityAcceptanceRow
                || !normalizeMarkdownCell(securityAcceptanceRow[1] ?? '')
                || !normalizeMarkdownCell(securityAcceptanceRow[2] ?? '')) {
                throw new Error(`project knowledge secondary capability interface group missing ${dimension} evidence: ${scope}/${groupPrefix}`);
            }
            if (status === '已实现'
                && exactCodeAnchors(securityAcceptanceRow[2] ?? '').length === 0
                && !/(?:missing_evidence|缺失证据)/.test(securityAcceptanceRow[2] ?? '')) {
                throw new Error(`project knowledge secondary capability interface group ${dimension} evidence missing exact anchor: ${scope}/${groupPrefix}`);
            }
        }
        const journeyValue = normalizeMarkdownCell(contractFields.get('level1_journey_id') ?? '');
        const journeyIds = journeyValue.split(/[,，、;；\s]+/).filter(Boolean);
        if (journeyIds.length === 0
            || journeyIds.some((journeyId) => !identifierPattern.test(journeyId) || invalidIdentifierPattern.test(journeyId))) {
            throw new Error(`project knowledge secondary capability interface group has invalid level1_journey_id: ${scope}/${groupPrefix}`);
        }
        for (const journeyId of journeyIds) {
            bindings.set(journeyId, [
                ...(bindings.get(journeyId) ?? []),
                {
                    apiId,
                    interfaceEntry,
                    controllerAnchors,
                    serviceAnchors,
                    tableIds,
                    physicalTableNames,
                },
            ]);
        }
    }
    return bindings;
}
function traceIdentifierList(value) {
    return normalizeMarkdownCell(value).split(/[,，、;；\s]+/).filter(Boolean);
}
function assertLevel1BusinessSemantics(body, capabilityId, secondaryCapabilities) {
    const semanticsSection = projectKnowledgeSection(body, /^##\s+4\.?\s+业务语义\s*$/m);
    if (!semanticsSection) {
        throw new Error(`project knowledge level-1 capability detailed design missing business semantics: ${capabilityId}`);
    }
    const expectedHeaders = [
        '专业术语',
        '定义',
        '适用场景与边界',
        '易混淆术语及区别',
        '关联二级能力',
        '权威来源/证据',
    ];
    const semanticsTables = markdownTables(semanticsSection);
    const terminologyTable = semanticsTables.find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === expectedHeaders.length
            && headers.every((header, index) => header === expectedHeaders[index]);
    });
    if (semanticsTables.length !== 1 || !terminologyTable || terminologyTable.rows.length === 0) {
        throw new Error(`project knowledge level-1 capability business semantics missing terminology rows: ${capabilityId}`);
    }
    if (/^#{3,6}\s+/m.test(semanticsSection)) {
        throw new Error(`project knowledge level-1 capability business semantics contains a governance subsection: ${capabilityId}`);
    }
    const knownSecondaryIds = new Set(secondaryCapabilities.map((secondary) => secondary.secondary_capability_id));
    const terms = new Set();
    for (const row of terminologyTable.rows) {
        const term = normalizeMarkdownCell(row[0] ?? '');
        if (term.length < 2 || terms.has(term) || /^(?:术语|专业术语|term|TODO|TBD)$/i.test(term)) {
            throw new Error(`project knowledge level-1 capability business semantics has generic term: ${capabilityId}`);
        }
        terms.add(term);
        for (const value of row.slice(1, 4)) {
            const normalized = normalizeMarkdownCell(value ?? '');
            if (normalized.length < 2 || /\{[^}]+\}|TODO|TBD|待补|待定/i.test(normalized)) {
                throw new Error(`project knowledge level-1 capability business semantics is incomplete: ${capabilityId}/${term}`);
            }
        }
        const relatedSecondaryIds = traceIdentifierList(row[4] ?? '');
        if (relatedSecondaryIds.length === 0
            || relatedSecondaryIds.some((secondaryId) => !knownSecondaryIds.has(secondaryId))) {
            throw new Error(`project knowledge level-1 capability business semantics references unknown secondary capability: ${capabilityId}/${term}`);
        }
        const evidence = normalizeMarkdownCell(row[5] ?? '');
        if (evidence.length < 3 || /\{[^}]+\}|TODO|TBD|待补|待定/i.test(evidence)) {
            throw new Error(`project knowledge level-1 capability business semantics missing evidence: ${capabilityId}/${term}`);
        }
    }
}
function assertLevel1CapabilityTableDesign(body, capabilityId, secondaryCapabilities, knownApiIds, stepTableIds, apiSecondaryIds, stepTableApiIds, stepTableSecondaryIds, gapReportBody) {
    const tableDesignSection = projectKnowledgeSection(body, /^##\s+5\.?\s+表结构设计\s*$/m);
    if (!tableDesignSection) {
        throw new Error(`project knowledge level-1 capability detailed design missing table design: ${capabilityId}`);
    }
    const controlLines = tableDesignSection.split(/\r?\n/).filter((line) => (/\btable_design_status\s*=/.test(line)
        && /\btable_design_coverage\s*=/.test(line)
        && /\btable_design_gap_id\s*=/.test(line)));
    if (controlLines.length !== 1) {
        throw new Error(`project knowledge level-1 capability table design requires one control line: ${capabilityId}`);
    }
    const controlLine = controlLines[0];
    const status = /\btable_design_status\s*=\s*(detailed|not_applicable)\b/.exec(controlLine)?.[1];
    const coverage = /\btable_design_coverage\s*=\s*(complete|partial|not_applicable)\b/.exec(controlLine)?.[1];
    const gapId = /\btable_design_gap_id\s*=\s*([A-Za-z0-9][A-Za-z0-9_.:\-]*)\b/.exec(controlLine)?.[1];
    if (!status || !coverage || !gapId) {
        throw new Error(`project knowledge level-1 capability table design has invalid control values: ${capabilityId}`);
    }
    if (status === 'not_applicable') {
        if (coverage !== 'not_applicable' || gapId !== 'not_applicable') {
            throw new Error(`project knowledge level-1 capability table design not_applicable state is inconsistent: ${capabilityId}`);
        }
        const reasonTables = markdownTables(tableDesignSection);
        const reasonFields = reasonTables.length === 1
            ? exactVerticalMarkdownTableFields(reasonTables[0], ['table_design_status', '原因', '证据'], `${capabilityId}/table-design-not-applicable`)
            : null;
        if (!reasonFields
            || normalizeMarkdownCell(reasonFields.get('table_design_status') ?? '') !== 'not_applicable'
            || normalizeMarkdownCell(reasonFields.get('原因') ?? '').length < 4
            || exactCodeAnchors(reasonFields.get('证据') ?? '').length === 0) {
            throw new Error(`project knowledge level-1 capability table design not_applicable lacks reason or evidence: ${capabilityId}`);
        }
        if (stepTableIds.size > 0
            || /^\|\s*`?table_id`?\s*\|\s*物理表名\s*\|/m.test(tableDesignSection)
            || /\berDiagram\b/.test(tableDesignSection)
            || /\btable_id\s*=\s*[A-Za-z_][A-Za-z0-9_]*\b/.test(tableDesignSection)) {
            throw new Error(`project knowledge level-1 capability table design not_applicable conflicts with persisted table trace: ${capabilityId}`);
        }
        return new Map();
    }
    if (coverage === 'not_applicable') {
        throw new Error(`project knowledge level-1 capability detailed table design cannot use not_applicable coverage: ${capabilityId}`);
    }
    if (coverage === 'complete' && gapId !== 'not_applicable') {
        throw new Error(`project knowledge level-1 capability complete table design requires table_design_gap_id=not_applicable: ${capabilityId}`);
    }
    if (coverage === 'partial') {
        if (gapId === 'not_applicable') {
            throw new Error(`project knowledge level-1 capability partial table design requires an explicit gap: ${capabilityId}`);
        }
        const escapedGapId = gapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`(^|[^A-Za-z0-9_.:\\-])${escapedGapId}([^A-Za-z0-9_.:\\-]|$)`).test(gapReportBody)) {
            throw new Error(`project knowledge level-1 capability table design gap is not tracked: ${capabilityId}/${gapId}`);
        }
    }
    const tableDesignSubsections = numberedMarkdownSubsections(tableDesignSection, 5);
    const allTableDesignSubsectionHeadings = [...tableDesignSection.matchAll(/^###(?!#)\s+/gm)];
    if (tableDesignSubsections.length < 3
        || allTableDesignSubsectionHeadings.length !== tableDesignSubsections.length
        || tableDesignSubsections.some((subsection, index) => subsection.index !== index + 1)
        || tableDesignSubsections[0].title !== '表清单'
        || tableDesignSubsections[1].title !== 'ER 图') {
        throw new Error(`project knowledge level-1 capability table design has invalid fixed subsection structure: ${capabilityId}`);
    }
    const inventorySubsection = tableDesignSubsections[0];
    const erSubsection = tableDesignSubsections[1];
    const fieldSubsections = tableDesignSubsections.slice(2);
    const erRelationshipSubsections = numberedMarkdownSubsubsections(erSubsection.body, 5, 2);
    const allErSubsubsectionHeadings = [...erSubsection.body.matchAll(/^####(?!#)\s+/gm)];
    if (erRelationshipSubsections.length !== 1
        || allErSubsubsectionHeadings.length !== erRelationshipSubsections.length
        || erRelationshipSubsections[0].index !== 1
        || erRelationshipSubsections[0].title !== 'ER 关系证据') {
        throw new Error(`project knowledge level-1 capability table design requires fixed 5.2.1 ER relationship evidence: ${capabilityId}`);
    }
    const erRelationshipSubsection = erRelationshipSubsections[0];
    const inventoryHeaders = [
        'table_id',
        '物理表名',
        '业务实体/用途',
        '所属二级能力',
        '读写 api_id',
        '证据',
    ];
    const inventoryTables = markdownTables(inventorySubsection.body);
    const inventoryTable = inventoryTables.find((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === inventoryHeaders.length
            && headers.every((header, index) => header === inventoryHeaders[index]);
    });
    if (inventoryTables.length !== 1 || !inventoryTable || inventoryTable.rows.length === 0) {
        throw new Error(`project knowledge level-1 capability table design missing table inventory: ${capabilityId}`);
    }
    const knownSecondaryIds = new Set(secondaryCapabilities.map((secondary) => secondary.secondary_capability_id));
    const tableIds = new Set();
    const physicalTableNames = new Map();
    const tableApiIds = new Map();
    for (const row of inventoryTable.rows) {
        const tableId = normalizeMarkdownCell(row[0] ?? '');
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableId) || tableIds.has(tableId)) {
            throw new Error(`project knowledge level-1 capability table inventory has invalid or duplicate table_id: ${capabilityId}/${tableId || 'missing'}`);
        }
        tableIds.add(tableId);
        const physicalTableName = normalizeMarkdownCell(row[1] ?? '');
        if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(physicalTableName)
            || [...physicalTableNames.values()].includes(physicalTableName)
            || normalizeMarkdownCell(row[2] ?? '').length < 2) {
            throw new Error(`project knowledge level-1 capability table inventory is incomplete: ${capabilityId}/${tableId}`);
        }
        physicalTableNames.set(tableId, physicalTableName);
        const secondaryIds = traceIdentifierList(row[3] ?? '');
        if (secondaryIds.length === 0 || secondaryIds.some((secondaryId) => !knownSecondaryIds.has(secondaryId))) {
            throw new Error(`project knowledge level-1 capability table inventory references unknown secondary capability: ${capabilityId}/${tableId}`);
        }
        const apiIds = traceIdentifierList(row[4] ?? '');
        if (apiIds.length === 0 || apiIds.some((apiId) => !knownApiIds.has(apiId))) {
            throw new Error(`project knowledge level-1 capability table inventory references unknown api_id: ${capabilityId}/${tableId}`);
        }
        const secondaryIdSet = new Set(secondaryIds);
        if (!sameIdentifierSet(secondaryIdSet, stepTableSecondaryIds.get(tableId) ?? new Set())
            || !sameIdentifierSet(new Set(apiIds), stepTableApiIds.get(tableId) ?? new Set())) {
            throw new Error(`project knowledge level-1 capability table inventory mismatches implementation steps: ${capabilityId}/${tableId}`);
        }
        if (apiIds.some((apiId) => {
            const owners = apiSecondaryIds.get(apiId) ?? new Set();
            return ![...owners].some((owner) => secondaryIdSet.has(owner));
        }) || secondaryIds.some((secondaryId) => !apiIds.some((apiId) => apiSecondaryIds.get(apiId)?.has(secondaryId)))) {
            throw new Error(`project knowledge level-1 capability table inventory mismatches api and secondary ownership: ${capabilityId}/${tableId}`);
        }
        tableApiIds.set(tableId, new Set(apiIds));
        if (exactCodeAnchors(row[5] ?? '').length === 0) {
            throw new Error(`project knowledge level-1 capability table inventory missing exact evidence: ${capabilityId}/${tableId}`);
        }
    }
    if (!sameIdentifierSet(tableIds, stepTableIds)) {
        throw new Error(`project knowledge level-1 capability step table_id set and table inventory differ: ${capabilityId}`);
    }
    const erBlocks = [...erSubsection.body.matchAll(/```mermaid\s*([\s\S]*?)```/gi)]
        .map((match) => match[1])
        .filter((diagram) => /\berDiagram\b/.test(diagram));
    if (erBlocks.length !== 1) {
        throw new Error(`project knowledge level-1 capability table design requires one ER diagram: ${capabilityId}`);
    }
    const erLines = erBlocks[0].split(/\r?\n/);
    const erEntityNames = new Set();
    const erRelationships = [];
    for (const rawLine of erLines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('%%') || /^erDiagram\b/.test(line))
            continue;
        const relationshipMatch = /^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.]*))\s+([|o}{]+(?:--|\.\.)[|o}{]+)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.]*))\s*:\s*(?:"([^"]+)"|(.+?))\s*$/.exec(line);
        if (relationshipMatch) {
            const source = relationshipMatch[1] ?? relationshipMatch[2];
            const target = relationshipMatch[4] ?? relationshipMatch[5];
            erEntityNames.add(source);
            erEntityNames.add(target);
            erRelationships.push({
                source,
                target,
                operator: relationshipMatch[3],
                label: normalizeMarkdownCell(relationshipMatch[6] ?? relationshipMatch[7] ?? ''),
            });
            continue;
        }
        const entityMatch = /^(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.]*))\s*\{\s*$/.exec(line);
        if (entityMatch)
            erEntityNames.add(entityMatch[1] ?? entityMatch[2]);
    }
    for (const tableId of tableIds) {
        const physicalTableName = physicalTableNames.get(tableId);
        if (!erEntityNames.has(physicalTableName)) {
            throw new Error(`project knowledge level-1 capability ER diagram omits table: ${capabilityId}/${tableId}`);
        }
    }
    if (!sameIdentifierSet(erEntityNames, new Set(physicalTableNames.values()))) {
        throw new Error(`project knowledge level-1 capability ER diagram contains an entity absent from table inventory: ${capabilityId}`);
    }
    const fieldHeaders = [
        '字段',
        '类型/可空/默认值',
        '键/约束',
        '业务语义',
        '读写 api_id',
        '证据',
    ];
    const fieldTableIds = new Set();
    const fieldNamesByTable = new Map();
    if (fieldSubsections.length !== tableIds.size) {
        throw new Error(`project knowledge level-1 capability table inventory and field structures differ: ${capabilityId}`);
    }
    const inventoryTableIdOrder = [...tableIds];
    for (const [fieldSubsectionIndex, subsection] of fieldSubsections.entries()) {
        const tableIdMatches = [...subsection.body.matchAll(/\btable_id\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\b/g)];
        if (tableIdMatches.length === 0)
            continue;
        if (tableIdMatches.length !== 1) {
            throw new Error(`project knowledge level-1 capability table field section has duplicate table_id: ${capabilityId}/${subsection.index}`);
        }
        const tableId = tableIdMatches[0][1];
        if (!tableIds.has(tableId) || fieldTableIds.has(tableId)) {
            throw new Error(`project knowledge level-1 capability table field section has unknown or duplicate table_id: ${capabilityId}/${tableId}`);
        }
        if (tableId !== inventoryTableIdOrder[fieldSubsectionIndex]) {
            throw new Error(`project knowledge level-1 capability table field sections do not follow inventory order: ${capabilityId}/${tableId}`);
        }
        fieldTableIds.add(tableId);
        if (normalizeMarkdownCell(subsection.title) !== physicalTableNames.get(tableId)) {
            throw new Error(`project knowledge level-1 capability table field section title mismatches physical table: ${capabilityId}/${tableId}`);
        }
        const fieldTables = markdownTables(subsection.body);
        const fieldTable = fieldTables.find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === fieldHeaders.length
                && headers.every((header, index) => header === fieldHeaders[index]);
        });
        if (fieldTables.length !== 1 || !fieldTable || fieldTable.rows.length === 0) {
            throw new Error(`project knowledge level-1 capability table field structure is missing: ${capabilityId}/${tableId}`);
        }
        const fieldNames = new Set();
        for (const row of fieldTable.rows) {
            const fieldName = normalizeMarkdownCell(row[0] ?? '');
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName) || fieldNames.has(fieldName)) {
                throw new Error(`project knowledge level-1 capability table field is invalid or duplicate: ${capabilityId}/${tableId}/${fieldName || 'missing'}`);
            }
            fieldNames.add(fieldName);
            for (const column of [1, 2, 3, 4, 5]) {
                if (!normalizeMarkdownCell(row[column] ?? '')) {
                    throw new Error(`project knowledge level-1 capability table field structure is incomplete: ${capabilityId}/${tableId}/${fieldName}`);
                }
            }
            const apiIds = traceIdentifierList(row[4] ?? '');
            const inventoryApiIds = tableApiIds.get(tableId) ?? new Set();
            if (apiIds.length === 0 || apiIds.some((apiId) => !inventoryApiIds.has(apiId))) {
                throw new Error(`project knowledge level-1 capability table field references unknown api_id: ${capabilityId}/${tableId}/${fieldName}`);
            }
            if (exactCodeAnchors(row[5] ?? '').length === 0) {
                throw new Error(`project knowledge level-1 capability table field missing exact evidence: ${capabilityId}/${tableId}/${fieldName}`);
            }
        }
        fieldNamesByTable.set(tableId, fieldNames);
    }
    if (!sameIdentifierSet(tableIds, fieldTableIds)) {
        throw new Error(`project knowledge level-1 capability table inventory and field structures differ: ${capabilityId}`);
    }
    if (tableIds.size > 1) {
        const relationshipHeaders = [
            'relation_id',
            '表关系（主 -> 从）',
            '关系/基数',
            '关联键',
            '业务语义',
            '证据',
        ];
        const relationshipTables = markdownTables(erRelationshipSubsection.body);
        const relationshipTable = relationshipTables.find((table) => {
            const headers = table.headers.map(normalizeMarkdownCell);
            return headers.length === relationshipHeaders.length
                && headers.every((header, index) => header === relationshipHeaders[index]);
        });
        if (relationshipTables.length !== 1 || !relationshipTable || relationshipTable.rows.length === 0) {
            throw new Error(`project knowledge level-1 capability table design missing ER relationship evidence: ${capabilityId}`);
        }
        const relationIds = new Set();
        const relatedTableIds = new Set();
        const matchedErRelationshipIndexes = new Set();
        for (const row of relationshipTable.rows) {
            const relationId = normalizeMarkdownCell(row[0] ?? '');
            const tableRelationship = normalizeMarkdownCell(row[1] ?? '');
            const tableRelationshipMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:->|→)\s*([A-Za-z_][A-Za-z0-9_]*)$/
                .exec(tableRelationship);
            const sourceTableId = tableRelationshipMatch?.[1] ?? '';
            const targetTableId = tableRelationshipMatch?.[2] ?? '';
            const cardinality = normalizeMarkdownCell(row[2] ?? '');
            const relationKey = normalizeMarkdownCell(row[3] ?? '');
            const semantics = normalizeMarkdownCell(row[4] ?? '');
            if (!projectKnowledgeTraceIdentifierPattern.test(relationId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(relationId)
                || relationIds.has(relationId)
                || !tableIds.has(sourceTableId)
                || !tableIds.has(targetTableId)
                || sourceTableId === targetTableId
                || !/^(?:1:1|1:N|N:1|N:M|无直接关系)$/.test(cardinality)
                || relationKey.length < 2
                || semantics.length < 2
                || exactCodeAnchors(row[5] ?? '').length === 0) {
                throw new Error(`project knowledge level-1 capability has invalid ER relationship evidence: ${capabilityId}/${relationId || 'missing'}`);
            }
            relationIds.add(relationId);
            relatedTableIds.add(sourceTableId);
            relatedTableIds.add(targetTableId);
            if (cardinality !== '无直接关系') {
                const relationKeyMatch = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:->|→)\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/
                    .exec(relationKey);
                if (!relationKeyMatch
                    || relationKeyMatch[1] !== sourceTableId
                    || relationKeyMatch[3] !== targetTableId
                    || !fieldNamesByTable.get(sourceTableId)?.has(relationKeyMatch[2])
                    || !fieldNamesByTable.get(targetTableId)?.has(relationKeyMatch[4])) {
                    throw new Error(`project knowledge level-1 capability ER relationship key mismatches fields: ${capabilityId}/${relationId}`);
                }
                const sourcePhysicalName = physicalTableNames.get(sourceTableId);
                const targetPhysicalName = physicalTableNames.get(targetTableId);
                const evidencedRelationshipIndex = erRelationships.findIndex((relationship, relationshipIndex) => {
                    if (matchedErRelationshipIndexes.has(relationshipIndex))
                        return false;
                    const isForward = relationship.source === sourcePhysicalName
                        && relationship.target === targetPhysicalName;
                    const isReverse = relationship.source === targetPhysicalName
                        && relationship.target === sourcePhysicalName;
                    if (!isForward && !isReverse)
                        return false;
                    const operatorParts = relationship.operator.split(/--|\.\./);
                    const leftIsMany = /[{}]/.test(operatorParts[0] ?? '');
                    const rightIsMany = /[{}]/.test(operatorParts[1] ?? '');
                    const renderedCardinality = leftIsMany
                        ? (rightIsMany ? 'N:M' : 'N:1')
                        : (rightIsMany ? '1:N' : '1:1');
                    const relationshipCardinality = isReverse
                        ? (renderedCardinality === '1:N'
                            ? 'N:1'
                            : (renderedCardinality === 'N:1' ? '1:N' : renderedCardinality))
                        : renderedCardinality;
                    return relationshipCardinality === cardinality && relationship.label === semantics;
                });
                if (evidencedRelationshipIndex < 0) {
                    throw new Error(`project knowledge level-1 capability ER diagram omits evidenced relationship: ${capabilityId}/${relationId}`);
                }
                matchedErRelationshipIndexes.add(evidencedRelationshipIndex);
            }
            else if (relationKey !== 'not_applicable') {
                throw new Error(`project knowledge level-1 capability unrelated table pair requires relation key not_applicable: ${capabilityId}/${relationId}`);
            }
            else {
                const sourcePhysicalName = physicalTableNames.get(sourceTableId);
                const targetPhysicalName = physicalTableNames.get(targetTableId);
                if (erRelationships.some((relationship) => ((relationship.source === sourcePhysicalName && relationship.target === targetPhysicalName)
                    || (relationship.source === targetPhysicalName && relationship.target === sourcePhysicalName)))) {
                    throw new Error(`project knowledge level-1 capability unrelated table pair conflicts with ER diagram: ${capabilityId}/${relationId}`);
                }
            }
        }
        if (!sameIdentifierSet(tableIds, relatedTableIds)) {
            throw new Error(`project knowledge level-1 capability ER relationship evidence omits table: ${capabilityId}`);
        }
        if (matchedErRelationshipIndexes.size !== erRelationships.length) {
            throw new Error(`project knowledge level-1 capability ER diagram contains an unevidenced relationship: ${capabilityId}`);
        }
    }
    else {
        if (erRelationships.length > 0
            || markdownTables(erRelationshipSubsection.body).length > 0
            || !/ER\s*关系证据\s*[:：]\s*not_applicable\s*[（(]单表，无需跨表关系[）)]/.test(erRelationshipSubsection.body)) {
            throw new Error(`project knowledge level-1 capability single-table design must declare ER relationship not_applicable: ${capabilityId}`);
        }
    }
    return physicalTableNames;
}
function assertLevel1CapabilityDetailedDesign(body, capabilityId, secondaryCapabilities, gapReportBody) {
    const enforceAtomicGraphNodes = /\breader_profile\s*=\s*strict_full\b/.test(body);
    if (/^##\s+\d+\.?\s+(?:用户业务操作全景|跨二级能力用户旅程|跨模块协作|共享业务语义与一级治理)\s*$/m.test(body)) {
        throw new Error(`project knowledge level-1 capability detailed design uses a legacy flat or separate cross-capability section: ${capabilityId}`);
    }
    const outwardCapabilitiesSection = projectKnowledgeSection(body, /^##\s+3\.?\s+对外业务能力与接口实现\s*$/m);
    if (!outwardCapabilitiesSection) {
        throw new Error(`project knowledge level-1 capability detailed design missing outward capability implementation: ${capabilityId}`);
    }
    for (const requiredHeading of [
        '1. 设计结论与能力边界',
        '2. 二级能力完整性与导航',
        '3. 对外业务能力与接口实现',
        '4. 业务语义',
        '5. 表结构设计',
        '6. 缺口与覆盖说明',
        '7. 文档完整性校验',
        '8. 文档导航与证据索引',
    ]) {
        const escapedHeading = requiredHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`^##\\s+${escapedHeading}\\s*$`, 'm').test(body)) {
            throw new Error(`project knowledge level-1 capability detailed design missing fixed section ${requiredHeading}: ${capabilityId}`);
        }
    }
    const journeyControlLines = body.split(/\r?\n/).filter((line) => (/\buser_journey_design_status\s*=/.test(line)
        && /\buser_journey_coverage\s*=/.test(line)
        && /\buser_journey_gap_id\s*=/.test(line)));
    if (journeyControlLines.length !== 1) {
        throw new Error(`project knowledge level-1 capability detailed design requires one user journey control line: ${capabilityId}`);
    }
    const journeyControlLine = journeyControlLines[0];
    if (!/\buser_journey_design_status\s*=\s*detailed\b/.test(journeyControlLine)) {
        throw new Error(`project knowledge level-1 capability detailed design missing user_journey_design_status: ${capabilityId}`);
    }
    if (!/\buser_journey_coverage\s*=\s*(?:complete|partial)\b/.test(journeyControlLine)) {
        throw new Error(`project knowledge level-1 capability detailed design missing user_journey_coverage: ${capabilityId}`);
    }
    const journeyCoverage = /\buser_journey_coverage\s*=\s*(complete|partial)\b/.exec(journeyControlLine)?.[1];
    const journeyGapId = /\buser_journey_gap_id\s*=\s*([A-Za-z0-9][A-Za-z0-9_.:\-]*)\b/
        .exec(journeyControlLine)?.[1];
    if (journeyCoverage === 'partial' && (!journeyGapId || journeyGapId === 'not_applicable')) {
        throw new Error(`project knowledge level-1 capability partial user journey coverage requires an explicit gap: ${capabilityId}`);
    }
    if (journeyCoverage === 'complete' && journeyGapId !== 'not_applicable') {
        throw new Error(`project knowledge level-1 capability complete user journey coverage requires user_journey_gap_id=not_applicable: ${capabilityId}`);
    }
    if (journeyCoverage === 'partial' && journeyGapId) {
        const gapSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+(?:缺口与覆盖说明|验收、证据与缺口)\s*$/m);
        const escapedGapId = journeyGapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const gapIdPattern = new RegExp(`(^|[^A-Za-z0-9_.:\\-])${escapedGapId}([^A-Za-z0-9_.:\\-]|$)`);
        if (!gapSection
            || !gapIdPattern.test(gapSection)
            || !/未覆盖/.test(gapSection)
            || !/(?:补齐|补证|所需证据|修复)/.test(gapSection)
            || !gapIdPattern.test(gapReportBody)) {
            throw new Error(`project knowledge level-1 capability partial user journey gap is not traced in overview and gap report: ${capabilityId}/${journeyGapId}`);
        }
    }
    const outwardCapabilities = numberedMarkdownSubsections(outwardCapabilitiesSection, 3);
    const allOutwardCapabilityHeadings = [...outwardCapabilitiesSection.matchAll(/^###(?!#)\s+/gm)];
    if (outwardCapabilities.length === 0) {
        throw new Error(`project knowledge level-1 capability detailed design has no outward capabilities: ${capabilityId}`);
    }
    if (allOutwardCapabilityHeadings.length !== outwardCapabilities.length
        || outwardCapabilities.some((section, index) => section.index !== index + 1)) {
        throw new Error(`project knowledge level-1 outward capability sections are not sequential: ${capabilityId}`);
    }
    const knownSecondaryIds = new Set(secondaryCapabilities.map((secondary) => secondary.secondary_capability_id));
    const journeySecondaryIds = new Set();
    const journeyIds = new Set();
    const stepIds = new Set();
    const apiIds = new Set();
    const stepTableIds = new Set();
    const apiSecondaryIds = new Map();
    const stepTableApiIds = new Map();
    const stepTableSecondaryIds = new Map();
    const journeyIdsBySecondary = new Map();
    const isGenericText = (value) => {
        const normalized = normalizeMarkdownCell(value);
        return /^(?:现有入口集合|现有操作|对应(?:接口|入口|方法|服务|数据)|相关(?:数据|表|对象)|详见二级能力文档|形成(?:或查询)?业务结果|返回结果|待补充|TODO|TBD)$/i.test(normalized)
            || /^(?:读取|写入|产生)(?:相关数据|相关表|相关对象)$/i.test(normalized);
    };
    const concreteData = (value, operation) => {
        const normalized = normalizeMarkdownCell(value);
        if (isGenericText(value)
            || /\{[^}]+\}|TODO|TBD|待补|待定/i.test(normalized))
            return false;
        const concreteCodeToken = [...value.matchAll(/`([^`\n]+)`/g)]
            .map((match) => match[1].trim())
            .some((token) => token.length > 1
            && !/^(?:none|n\/a|na|not_applicable|missing_evidence|data|table|object|todo|tbd|-)$/i.test(token));
        if (concreteCodeToken)
            return true;
        const action = operation === '读取' ? '读取' : '(?:写入|产生|落库)';
        if (new RegExp(`^(?:无|无需|无须|不(?:需|需要)?)(?:${action})(?:数据|数据库|业务表|持久化数据)?[：:，,；;（(].{2,}`).test(value.trim())) {
            return true;
        }
        const meaningfulSummary = normalized
            .replace(/^(?:读取|查询|获取|加载|写入|产生|更新|删除|发送|发布|返回|记录)+/, '')
            .replace(/^(?:当前|目标|对应|相关|业务)+/, '')
            .replace(/(?:相关|对应|业务)?(?:数据|对象|记录|信息|状态|结果)$/, '')
            .trim();
        return meaningfulSummary.length >= 2
            && !/^(?:none|n\/a|na|not_applicable|missing_evidence|data|table|object|todo|tbd|-)$/i.test(meaningfulSummary);
    };
    const section3Tables = markdownTables(outwardCapabilitiesSection);
    if (section3Tables.some((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length !== 2 || headers[0] !== '项目' || headers[1] !== '内容';
    })) {
        throw new Error(`project knowledge level-1 outward capability section contains a legacy flat list: ${capabilityId}`);
    }
    for (const outwardCapability of outwardCapabilities) {
        if (outwardCapability.title.length < 2 || /\{[^}]+\}|TODO|TBD|待补|待定/i.test(outwardCapability.title)) {
            throw new Error(`project knowledge level-1 outward capability has invalid title: ${capabilityId}/${outwardCapability.index}`);
        }
        const subsubsections = numberedMarkdownSubsubsections(outwardCapability.body, 3, outwardCapability.index);
        const expectedSubsubsectionTitles = [
            '业务说明',
            '二级能力与接口实现逻辑',
            '实现步骤',
        ];
        const allSubsubsectionHeadings = [...outwardCapability.body.matchAll(/^####(?!#)\s+/gm)];
        if (subsubsections.length !== expectedSubsubsectionTitles.length
            || allSubsubsectionHeadings.length !== subsubsections.length
            || subsubsections.some((subsection, index) => (subsection.index !== index + 1
                || subsection.title !== expectedSubsubsectionTitles[index]))) {
            throw new Error(`project knowledge level-1 outward capability has invalid fixed subsection structure: ${capabilityId}/${outwardCapability.index}`);
        }
        const [businessSubsection, graphSubsection, stepsSubsection] = subsubsections;
        const summaryFields = [
            'journey_id',
            '用户/角色',
            '提供的业务',
            '用户目标',
            '用户怎么操作',
            '用户可见结果',
            '参与二级能力',
            '证据',
        ];
        const summaryTables = markdownTables(businessSubsection.body)
            .filter((table) => markdownTableMatchesExactVerticalFields(table, summaryFields));
        if (summaryTables.length !== 1) {
            throw new Error(`project knowledge level-1 outward capability requires one business summary: ${capabilityId}/${outwardCapability.index}`);
        }
        const summary = exactVerticalMarkdownTableFields(summaryTables[0], summaryFields, `${capabilityId}/3.${outwardCapability.index}.1`);
        const journeyId = normalizeMarkdownCell(summary.get('journey_id') ?? '') || 'unknown';
        if (!projectKnowledgeTraceIdentifierPattern.test(journeyId)
            || invalidProjectKnowledgeTraceIdentifierPattern.test(journeyId)) {
            throw new Error(`project knowledge level-1 capability user journey has invalid journey_id: ${capabilityId}/${journeyId}`);
        }
        if (journeyIds.has(journeyId)) {
            throw new Error(`project knowledge level-1 capability user journey has duplicate journey_id: ${capabilityId}/${journeyId}`);
        }
        journeyIds.add(journeyId);
        for (const requiredField of ['用户/角色', '提供的业务', '用户目标', '用户怎么操作', '用户可见结果']) {
            const value = summary.get(requiredField) ?? '';
            if (normalizeMarkdownCell(value).length < 2 || isGenericText(value)) {
                throw new Error(`project knowledge level-1 capability user journey missing concrete ${requiredField}: ${capabilityId}/${journeyId}`);
            }
        }
        if (exactCodeAnchors(summary.get('证据') ?? '').length < 1) {
            throw new Error(`project knowledge level-1 capability user journey missing exact evidence anchor: ${capabilityId}/${journeyId}`);
        }
        const implementationStepFields = [
            'step_id',
            'secondary_capability_id',
            'api_id',
            '接口/入口',
            'Controller/Handler',
            'Service/UseCase',
            '读取数据',
            '写入/产生数据',
            '读写 table_id',
            '二级能力详情',
            '证据',
        ];
        const implementationStepTables = markdownTables(stepsSubsection.body)
            .filter((table) => markdownTableMatchesExactVerticalFields(table, implementationStepFields));
        if (implementationStepTables.length === 0) {
            throw new Error(`project knowledge level-1 outward capability has no interface implementation steps: ${capabilityId}/${journeyId}`);
        }
        const implementationSteps = implementationStepTables.map((table, index) => (exactVerticalMarkdownTableFields(table, implementationStepFields, `${capabilityId}/3.${outwardCapability.index}.3/step-${index + 1}`)));
        const mermaidBlocks = [...graphSubsection.body.matchAll(/```mermaid\s*([\s\S]*?)```/gi)]
            .map((match) => match[1]);
        const diagrams = mermaidBlocks.filter((diagram) => /\b(?:flowchart|graph)\b/i.test(diagram));
        if (mermaidBlocks.length !== 1
            || diagrams.length !== 1
            || !/(?:-->|==>)/.test(diagrams[0])) {
            throw new Error(`project knowledge level-1 outward capability requires one connected implementation diagram: ${capabilityId}/${journeyId}`);
        }
        const diagram = diagrams[0];
        const nodeLabels = new Map();
        for (const nodeMatch of diagram.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*(?:\["([^"]+)"\]|\[([^\]]+)\]|\("([^"]+)"\)|\(([^)]+)\))/g)) {
            const nodeId = nodeMatch[1];
            const label = normalizeMarkdownCell(nodeMatch[2] ?? nodeMatch[3] ?? nodeMatch[4] ?? nodeMatch[5] ?? '');
            const existing = nodeLabels.get(nodeId);
            if (existing && existing !== label) {
                throw new Error(`project knowledge level-1 outward capability diagram redefines node: ${capabilityId}/${journeyId}/${nodeId}`);
            }
            nodeLabels.set(nodeId, label);
        }
        const methodOrTechnicalNodePattern = /(?:\b(?:Controller|Handler|Service|UseCase|Mapper|Repository|DTO|Entity|table_id|api_id)\b|\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/|\b[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*\s*\(\s*\))/;
        const nodeMatchesIdentifier = (nodeId, label, identifier) => {
            const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(?:^|[^A-Za-z0-9_])${escapedIdentifier}(?:[^A-Za-z0-9_]|$)`).test(`${nodeId} ${label}`)
                || nodeId.includes(identifier);
        };
        const allDiagramEdges = diagram.split(/\r?\n/).flatMap((line, lineIndex) => {
            const edgeMatch = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*(?:-->|==>)\s*(?:\|"?([^|]+?)"?\|\s*)?([A-Za-z][A-Za-z0-9_]*)/.exec(line);
            if (!edgeMatch)
                return [];
            return [{
                    lineIndex,
                    sourceNodeId: edgeMatch[1],
                    targetNodeId: edgeMatch[3],
                    label: edgeMatch[2]
                        ? normalizeMarkdownCell(edgeMatch[2]).replace(/^"|"$/g, '').trim()
                        : null,
                }];
        });
        const edgeLikeLineCount = diagram.split(/\r?\n/).filter((line) => (!line.trim().startsWith('%%') && /(?:-->|==>|-\.->)/.test(line))).length;
        if (edgeLikeLineCount !== allDiagramEdges.length) {
            throw new Error(`project knowledge level-1 outward capability diagram contains an unsupported or untraceable edge: ${capabilityId}/${journeyId}`);
        }
        const diagramEdges = allDiagramEdges.filter((edge) => edge.label !== null);
        const stepSecondaryIds = new Set();
        let previousSecondaryId = null;
        let previousTargetNodeId = null;
        let entryNodeId = null;
        let previousEdgeLineIndex = -1;
        const implementationEdgeLineIndexes = new Set();
        for (const step of implementationSteps) {
            const stepId = normalizeMarkdownCell(step.get('step_id') ?? '');
            if (!projectKnowledgeTraceIdentifierPattern.test(stepId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(stepId)
                || stepIds.has(stepId)) {
                throw new Error(`project knowledge level-1 outward capability has invalid or duplicate step_id: ${capabilityId}/${journeyId}/${stepId || 'missing'}`);
            }
            stepIds.add(stepId);
            const secondaryId = normalizeMarkdownCell(step.get('secondary_capability_id') ?? '');
            if (!knownSecondaryIds.has(secondaryId)) {
                throw new Error(`project knowledge level-1 capability user journey references unknown secondary capability: ${capabilityId}/${journeyId}`);
            }
            stepSecondaryIds.add(secondaryId);
            journeySecondaryIds.add(secondaryId);
            const apiId = normalizeMarkdownCell(step.get('api_id') ?? '');
            if (!projectKnowledgeTraceIdentifierPattern.test(apiId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(apiId)) {
                throw new Error(`project knowledge level-1 outward capability has invalid api_id: ${capabilityId}/${journeyId}/${apiId || 'missing'}`);
            }
            apiIds.add(apiId);
            const interfaceEntry = step.get('接口/入口') ?? '';
            if (/现有入口集合|对应接口|对应入口/.test(interfaceEntry)) {
                throw new Error(`project knowledge level-1 capability user journey uses generic interface placeholder: ${capabilityId}/${journeyId}`);
            }
            if (!/(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+)/.test(interfaceEntry)) {
                throw new Error(`project knowledge level-1 capability user journey missing concrete interface: ${capabilityId}/${journeyId}`);
            }
            const controllerAnchors = exactCodeAnchors(step.get('Controller/Handler') ?? '');
            if (controllerAnchors.length < 1) {
                throw new Error(`project knowledge level-1 capability user journey missing exact Controller/Handler anchor: ${capabilityId}/${journeyId}`);
            }
            const serviceAnchors = exactCodeAnchors(step.get('Service/UseCase') ?? '');
            if (serviceAnchors.length < 1) {
                throw new Error(`project knowledge level-1 capability user journey missing exact Service/UseCase anchor: ${capabilityId}/${journeyId}`);
            }
            if (!concreteData(step.get('读取数据') ?? '', '读取')) {
                throw new Error(`project knowledge level-1 capability user journey missing concrete read data: ${capabilityId}/${journeyId}`);
            }
            if (!concreteData(step.get('写入/产生数据') ?? '', '写入')) {
                throw new Error(`project knowledge level-1 capability user journey missing concrete written or produced data: ${capabilityId}/${journeyId}`);
            }
            const tableIdValue = normalizeMarkdownCell(step.get('读写 table_id') ?? '');
            const tableIds = traceIdentifierList(tableIdValue);
            if (tableIds.length === 0
                || new Set(tableIds).size !== tableIds.length
                || tableIds.some((tableId) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableId))
                || (tableIds.includes('not_applicable') && tableIds.length > 1)) {
                throw new Error(`project knowledge level-1 capability user journey has invalid table_id trace: ${capabilityId}/${journeyId}/${stepId}`);
            }
            if (tableIds.includes('not_applicable')) {
                const noPersistenceStatement = normalizeMarkdownCell([
                    step.get('读取数据') ?? '',
                    step.get('写入/产生数据') ?? '',
                ].join(' '));
                if (!/(?:无|无需|无须|不需要|不读写|不涉及).{0,12}(?:持久化|数据库|业务表|落库|表)/.test(noPersistenceStatement)) {
                    throw new Error(`project knowledge level-1 capability user journey table_id not_applicable lacks no-persistence statement: ${capabilityId}/${journeyId}/${stepId}`);
                }
            }
            const persistedTableIds = tableIds.filter((tableId) => tableId !== 'not_applicable');
            for (const tableId of persistedTableIds) {
                stepTableIds.add(tableId);
                stepTableApiIds.set(tableId, new Set([
                    ...(stepTableApiIds.get(tableId) ?? []),
                    apiId,
                ]));
                stepTableSecondaryIds.set(tableId, new Set([
                    ...(stepTableSecondaryIds.get(tableId) ?? []),
                    secondaryId,
                ]));
            }
            const expectedChildPath = `secondary-capabilities/${secondaryId}/detailed-design.md`;
            const escapedChildPath = expectedChildPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (!new RegExp(`\\]\\((?:business/capabilities/${capabilityId}/)?${escapedChildPath}\\)`).test(step.get('二级能力详情') ?? '')) {
                throw new Error(`project knowledge level-1 capability user journey omits secondary capability link: ${capabilityId}/${journeyId}`);
            }
            if (exactCodeAnchors(step.get('证据') ?? '').length < 1) {
                throw new Error(`project knowledge level-1 capability user journey missing exact evidence anchor: ${capabilityId}/${journeyId}`);
            }
            const normalizedInterfaceEntry = normalizeMarkdownCell(interfaceEntry);
            if ([...nodeLabels.values()].some((label) => (label.includes(apiId) || label.includes(normalizedInterfaceEntry)))) {
                throw new Error(`project knowledge level-1 outward capability diagram uses api_id or interface as a node: ${capabilityId}/${journeyId}/${stepId}`);
            }
            const matchingEdge = diagramEdges.find((edge) => (!implementationEdgeLineIndexes.has(edge.lineIndex)
                && edge.lineIndex > previousEdgeLineIndex
                && edge.label.includes(apiId)
                && edge.label.includes(normalizedInterfaceEntry)));
            if (!matchingEdge) {
                throw new Error(`project knowledge level-1 outward capability diagram must place api_id and interface on one edge: ${capabilityId}/${journeyId}/${stepId}`);
            }
            const targetLabel = nodeLabels.get(matchingEdge.targetNodeId) ?? '';
            const sourceLabel = nodeLabels.get(matchingEdge.sourceNodeId) ?? '';
            const legacyJourneyEntryNode = sourceLabel.includes(normalizeMarkdownCell(summary.get('用户/角色') ?? '')) && sourceLabel.includes(normalizeMarkdownCell(summary.get('用户怎么操作') ?? ''));
            if (!nodeMatchesIdentifier(matchingEdge.targetNodeId, targetLabel, secondaryId)
                || (previousTargetNodeId === null
                    && !nodeMatchesIdentifier(matchingEdge.sourceNodeId, sourceLabel, journeyId)
                    && !legacyJourneyEntryNode)
                || (previousTargetNodeId !== null && matchingEdge.sourceNodeId !== previousTargetNodeId)
                || (previousSecondaryId !== null
                    && previousSecondaryId !== secondaryId
                    && !nodeMatchesIdentifier(matchingEdge.sourceNodeId, sourceLabel, previousSecondaryId))
                || matchingEdge.lineIndex <= previousEdgeLineIndex) {
                throw new Error(`project knowledge level-1 outward capability diagram step order or secondary nodes mismatch: ${capabilityId}/${journeyId}/${stepId}`);
            }
            if (entryNodeId === null)
                entryNodeId = matchingEdge.sourceNodeId;
            previousSecondaryId = secondaryId;
            previousTargetNodeId = matchingEdge.targetNodeId;
            previousEdgeLineIndex = matchingEdge.lineIndex;
            implementationEdgeLineIndexes.add(matchingEdge.lineIndex);
            apiSecondaryIds.set(apiId, new Set([
                ...(apiSecondaryIds.get(apiId) ?? []),
                secondaryId,
            ]));
            journeyIdsBySecondary.set(secondaryId, [
                ...(journeyIdsBySecondary.get(secondaryId) ?? []),
                {
                    journeyId,
                    apiId,
                    interfaceEntry: normalizedInterfaceEntry,
                    controllerAnchors,
                    serviceAnchors,
                    tableIds: persistedTableIds,
                    physicalTableNames: new Map(),
                },
            ]);
        }
        if (enforceAtomicGraphNodes
            && [...nodeLabels.values()].some((label) => methodOrTechnicalNodePattern.test(label))) {
            throw new Error(`project knowledge level-1 outward capability diagram mixes business and method nodes: ${capabilityId}/${journeyId}`);
        }
        const visibleResult = normalizeMarkdownCell(summary.get('用户可见结果') ?? '');
        const visibleResultEdge = previousTargetNodeId === null
            ? undefined
            : allDiagramEdges.find((edge) => (edge.sourceNodeId === previousTargetNodeId
                && edge.lineIndex > previousEdgeLineIndex
                && (nodeLabels.get(edge.targetNodeId) ?? '').includes(visibleResult)));
        if (!visibleResultEdge) {
            throw new Error(`project knowledge level-1 outward capability diagram does not end at the user-visible result: ${capabilityId}/${journeyId}`);
        }
        if (diagramEdges.some((edge) => (!implementationEdgeLineIndexes.has(edge.lineIndex)
            && /(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+)/.test(edge.label)))) {
            throw new Error(`project knowledge level-1 outward capability diagram contains an untraced interface edge: ${capabilityId}/${journeyId}`);
        }
        const diagramNodeIds = new Set();
        const adjacency = new Map();
        for (const edge of allDiagramEdges) {
            diagramNodeIds.add(edge.sourceNodeId);
            diagramNodeIds.add(edge.targetNodeId);
            adjacency.set(edge.sourceNodeId, new Set([
                ...(adjacency.get(edge.sourceNodeId) ?? []),
                edge.targetNodeId,
            ]));
            adjacency.set(edge.targetNodeId, new Set([
                ...(adjacency.get(edge.targetNodeId) ?? []),
                edge.sourceNodeId,
            ]));
        }
        if (!entryNodeId
            || [...diagramNodeIds].some((nodeId) => !nodeLabels.has(nodeId))
            || [...nodeLabels.keys()].some((nodeId) => !diagramNodeIds.has(nodeId))) {
            throw new Error(`project knowledge level-1 outward capability diagram contains an undefined or disconnected node: ${capabilityId}/${journeyId}`);
        }
        const visitedNodeIds = new Set();
        const pendingNodeIds = [entryNodeId];
        while (pendingNodeIds.length > 0) {
            const nodeId = pendingNodeIds.pop();
            if (visitedNodeIds.has(nodeId))
                continue;
            visitedNodeIds.add(nodeId);
            for (const neighbor of adjacency.get(nodeId) ?? []) {
                if (!visitedNodeIds.has(neighbor))
                    pendingNodeIds.push(neighbor);
            }
        }
        if (!sameIdentifierSet(visitedNodeIds, diagramNodeIds)) {
            throw new Error(`project knowledge level-1 outward capability diagram contains a disconnected branch: ${capabilityId}/${journeyId}`);
        }
        const declaredSecondaryIds = new Set(traceIdentifierList(summary.get('参与二级能力') ?? ''));
        if (!sameIdentifierSet(declaredSecondaryIds, stepSecondaryIds)) {
            throw new Error(`project knowledge level-1 outward capability secondary capability summary mismatches steps: ${capabilityId}/${journeyId}`);
        }
    }
    for (const secondary of secondaryCapabilities) {
        const secondaryId = secondary.secondary_capability_id;
        if (!journeySecondaryIds.has(secondaryId)) {
            throw new Error(`project knowledge level-1 capability user journeys omit secondary capability: ${capabilityId}/${secondaryId}`);
        }
    }
    assertLevel1BusinessSemantics(body, capabilityId, secondaryCapabilities);
    const physicalTableNames = assertLevel1CapabilityTableDesign(body, capabilityId, secondaryCapabilities, apiIds, stepTableIds, apiSecondaryIds, stepTableApiIds, stepTableSecondaryIds, gapReportBody);
    for (const journeys of journeyIdsBySecondary.values()) {
        for (const journey of journeys) {
            journey.physicalTableNames = new Map(journey.tableIds.map((tableId) => [tableId, physicalTableNames.get(tableId)]));
        }
    }
    return journeyIdsBySecondary;
}
function level1DependencyProjectionIds(rawValue, capabilityId, direction) {
    const value = normalizeMarkdownCell(rawValue);
    if (value === 'not_derived')
        return 'not_derived';
    if (value === '[]')
        return new Set();
    const ids = value.split(/[,，、;；\s]+/).filter(Boolean);
    if (ids.length === 0
        || ids.some((id) => !/^[a-z][a-z0-9_]*$/.test(id))
        || new Set(ids).size !== ids.length) {
        throw new Error(`project knowledge level-1 capability has invalid ${direction} dependency projection: ${capabilityId}`);
    }
    return new Set(ids);
}
function level1CapabilityDependencyProjection(body, capabilityId, compactPartial = false) {
    const control = dependencyGraphControl(body, `level-1 capability ${capabilityId}`);
    if (compactPartial) {
        if (control.status !== 'pending_level1_completion'
            || control.revision !== 'not_derived'
            || control.gapId === 'not_applicable') {
            throw new Error(`project knowledge compact partial level-1 dependency projection is invalid: ${capabilityId}`);
        }
        return {
            ...control,
            upstream: 'not_derived',
            downstream: 'not_derived',
        };
    }
    const dependencyRows = markdownTables(body)
        .filter((table) => {
        const headers = table.headers.map(normalizeMarkdownCell);
        return headers.length === 3
            && headers[0] === '字段'
            && headers[1] === '内容'
            && headers[2] === '来源';
    })
        .flatMap((table) => table.rows)
        .filter((row) => ['上游能力', '下游能力'].includes(normalizeMarkdownCell(row[0] ?? '')));
    const upstreamRows = dependencyRows.filter((row) => normalizeMarkdownCell(row[0] ?? '') === '上游能力');
    const downstreamRows = dependencyRows.filter((row) => normalizeMarkdownCell(row[0] ?? '') === '下游能力');
    if (upstreamRows.length !== 1 || downstreamRows.length !== 1) {
        throw new Error(`project knowledge level-1 capability requires one upstream and downstream dependency projection: ${capabilityId}`);
    }
    const expectedSource = 'business/level1-capability-dependency-graph.yaml';
    for (const row of [upstreamRows[0], downstreamRows[0]]) {
        if (normalizeMarkdownCell(row[2] ?? '') !== expectedSource) {
            throw new Error(`project knowledge level-1 capability dependency projection has wrong graph source: ${capabilityId}`);
        }
    }
    return {
        ...control,
        upstream: level1DependencyProjectionIds(upstreamRows[0][1] ?? '', capabilityId, 'upstream'),
        downstream: level1DependencyProjectionIds(downstreamRows[0][1] ?? '', capabilityId, 'downstream'),
    };
}
function dependencyGraphControl(body, scope) {
    const controlLines = body.split(/\r?\n/).filter((line) => (/\bdependency_graph_status\s*=/.test(line)
        && /\bdependency_graph_revision\s*=/.test(line)
        && /\bdependency_graph_gap_id\s*=/.test(line)));
    if (controlLines.length !== 1) {
        throw new Error(`project knowledge ${scope} requires one dependency graph projection control line`);
    }
    const controlLine = controlLines[0];
    const status = /\bdependency_graph_status\s*=\s*(pending_level1_completion|derived)\b/
        .exec(controlLine)?.[1];
    const revision = /\bdependency_graph_revision\s*=\s*([A-Za-z0-9][A-Za-z0-9_.:\-]*)\b/
        .exec(controlLine)?.[1];
    const gapId = /\bdependency_graph_gap_id\s*=\s*([A-Za-z0-9][A-Za-z0-9_.:\-]*)\b/
        .exec(controlLine)?.[1];
    if (!status || !revision || !gapId) {
        throw new Error(`project knowledge ${scope} has invalid dependency graph projection control line`);
    }
    return {
        status,
        revision,
        gapId,
    };
}
function sameIdentifierSet(left, right) {
    return left.size === right.size && [...left].every((value) => right.has(value));
}
function graphArray(value, field) {
    if (Array.isArray(value))
        return value;
    if (value === '[]')
        return [];
    throw new Error(`project knowledge level-1 capability dependency graph has invalid ${field}`);
}
function optionalGraphArray(value, field) {
    if (value === undefined)
        return [];
    return graphArray(value, field);
}
function assertLevel1CapabilityDependencyGraph(graphBody, capabilities, coverageByCapability, journeysByCapability, apiIdsByCapability, allSecondaryInterfacesComplete, projectionsByCapability, businessArchitectureBody, sourceRoot, gapReportBody) {
    let parsedGraph;
    try {
        parsedGraph = parseYaml(graphBody);
    }
    catch (error) {
        throw new Error(`project knowledge level-1 capability dependency graph is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsedGraph || typeof parsedGraph !== 'object' || Array.isArray(parsedGraph)) {
        throw new Error('project knowledge level-1 capability dependency graph root must be a mapping');
    }
    const graph = parsedGraph;
    if (graph.schema !== 'axis.level1_capability_dependency_graph' || graph.schema_version !== '0.2') {
        throw new Error('project knowledge level-1 capability dependency graph has invalid schema');
    }
    if (graph.derivation_method !== 'model_synthesis') {
        throw new Error('project knowledge level-1 capability dependency graph requires derivation_method=model_synthesis');
    }
    const status = graph.derivation_status;
    if (status !== 'pending_level1_completion' && status !== 'derived') {
        throw new Error('project knowledge level-1 capability dependency graph has invalid derivation_status');
    }
    const revision = typeof graph.derivation_revision === 'string' || typeof graph.derivation_revision === 'number'
        ? String(graph.derivation_revision)
        : '';
    const gapId = typeof graph.gap_id === 'string' ? graph.gap_id : '';
    if (!revision || !gapId) {
        throw new Error('project knowledge level-1 capability dependency graph is missing revision or gap_id');
    }
    const expectedNames = new Map(capabilities.map((capability) => [
        capability.level1_capability_id,
        capability.level1_capability_name,
    ]));
    const nodes = graphArray(graph.nodes, 'nodes');
    const nodeIds = nodes.map((node) => node.level1_capability_id ?? '');
    if (new Set(nodeIds).size !== nodeIds.length
        || nodeIds.length !== expectedNames.size
        || nodeIds.some((nodeId) => !expectedNames.has(nodeId))
        || nodes.some((node) => expectedNames.get(node.level1_capability_id ?? '') !== node.level1_capability_name)) {
        throw new Error('project knowledge level-1 capability dependency graph nodes do not match inventory');
    }
    const edges = graphArray(graph.edges, 'edges');
    const assertBusinessArchitectureState = () => {
        const architectureControl = dependencyGraphControl(businessArchitectureBody, 'business architecture');
        if (!businessArchitectureBody.includes('business/level1-capability-dependency-graph.yaml')) {
            throw new Error('project knowledge business architecture omits canonical level-1 dependency graph source');
        }
        if (architectureControl.status !== status
            || architectureControl.revision !== revision
            || architectureControl.gapId !== gapId) {
            throw new Error('project knowledge business architecture dependency graph state mismatches canonical graph');
        }
    };
    const allComplete = allSecondaryInterfacesComplete
        && [...coverageByCapability.values()].every((coverage) => coverage === 'complete');
    if (!allComplete) {
        if (status !== 'pending_level1_completion') {
            throw new Error('project knowledge level-1 capability dependency graph requires all level-1 coverage complete before derivation');
        }
        if (revision !== 'not_derived' || gapId === 'not_applicable') {
            throw new Error('project knowledge pending level-1 capability dependency graph requires not_derived revision and explicit gap');
        }
        if (edges.length !== 0) {
            throw new Error('project knowledge pending level-1 capability dependency graph must not contain derived edges');
        }
        assertBusinessArchitectureState();
        const escapedGapId = gapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`(^|[^A-Za-z0-9_.:\\-])${escapedGapId}([^A-Za-z0-9_.:\\-]|$)`).test(gapReportBody)) {
            throw new Error(`project knowledge pending level-1 capability dependency graph gap is not tracked: ${gapId}`);
        }
        for (const [capabilityId, projection] of projectionsByCapability) {
            if (projection.status !== 'pending_level1_completion'
                || projection.revision !== 'not_derived'
                || projection.gapId !== gapId
                || projection.upstream !== 'not_derived'
                || projection.downstream !== 'not_derived') {
                throw new Error(`project knowledge level-1 capability must keep dependency projection not_derived until global analysis: ${capabilityId}`);
            }
        }
        return;
    }
    if (status !== 'derived') {
        throw new Error('project knowledge complete level-1 capability set requires a derived dependency graph');
    }
    if (revision === 'not_derived' || gapId !== 'not_applicable') {
        throw new Error('project knowledge derived level-1 capability dependency graph requires a revision and gap_id=not_applicable');
    }
    assertBusinessArchitectureState();
    const incoming = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
    const outgoing = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
    const edgeIds = new Set();
    const edgeKeys = new Set();
    const journeyIdsByCapability = new Map([...journeysByCapability].map(([capabilityId, journeysBySecondary]) => [
        capabilityId,
        new Set([...journeysBySecondary.values()].flat().map((journey) => journey.journeyId)),
    ]));
    for (const edge of edges) {
        const edgeId = edge.edge_id ?? '';
        const from = edge.from_level1_capability_id ?? '';
        const to = edge.to_level1_capability_id ?? '';
        const relationType = edge.relation_type ?? '';
        const stage = edge.stage ?? '';
        if (!/^[a-z][a-z0-9_]*$/.test(edgeId) || edgeIds.has(edgeId)) {
            throw new Error(`project knowledge level-1 capability dependency graph has invalid or duplicate edge_id: ${edgeId || 'missing'}`);
        }
        if (!expectedNames.has(from) || !expectedNames.has(to)) {
            throw new Error(`project knowledge level-1 capability dependency graph edge references unknown node: ${edgeId}`);
        }
        if (from === to) {
            throw new Error(`project knowledge level-1 capability dependency graph contains a self edge: ${edgeId}`);
        }
        if (!/^[a-z][a-z0-9_]*$/.test(relationType) || !/^[a-z][a-z0-9_]*$/.test(stage)) {
            throw new Error(`project knowledge level-1 capability dependency graph edge has invalid relation type or stage: ${edgeId}`);
        }
        const edgeKey = `${from}\u0000${to}\u0000${relationType}\u0000${stage}`;
        if (edgeKeys.has(edgeKey)) {
            throw new Error(`project knowledge level-1 capability dependency graph contains a duplicate staged relation: ${edgeId}`);
        }
        const evidenceRefs = graphArray(edge.evidence_refs, `evidence_refs for ${edgeId}`);
        const journeyIds = optionalGraphArray(edge.journey_ids, `journey_ids for ${edgeId}`);
        const apiIds = optionalGraphArray(edge.api_ids, `api_ids for ${edgeId}`);
        const endpointJourneyIds = new Set([
            ...(journeyIdsByCapability.get(from) ?? []),
            ...(journeyIdsByCapability.get(to) ?? []),
        ]);
        const endpointApiIds = new Set([
            ...(apiIdsByCapability.get(from) ?? []),
            ...(apiIdsByCapability.get(to) ?? []),
        ]);
        for (const journeyId of journeyIds) {
            if (typeof journeyId !== 'string'
                || !projectKnowledgeTraceIdentifierPattern.test(journeyId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(journeyId)
                || !endpointJourneyIds.has(journeyId)) {
                throw new Error(`project knowledge level-1 capability dependency graph edge references unknown journey_id: ${edgeId}/${String(journeyId)}`);
            }
        }
        for (const apiId of apiIds) {
            if (typeof apiId !== 'string'
                || !projectKnowledgeTraceIdentifierPattern.test(apiId)
                || invalidProjectKnowledgeTraceIdentifierPattern.test(apiId)
                || !endpointApiIds.has(apiId)) {
                throw new Error(`project knowledge level-1 capability dependency graph edge references unknown api_id: ${edgeId}/${String(apiId)}`);
            }
        }
        const hasTraceableEvidence = evidenceRefs.every((ref) => {
            if (typeof ref !== 'string'
                || !ref.trim()
                || /\{[^}]+\}|TODO|TBD|待补|待定|missing_evidence/i.test(ref)) {
                return false;
            }
            if (exactCodeAnchors(ref).length > 0)
                return true;
            const documentReference = /^((?:architecture|business|gaps)\/[^#\s]+)#[^#\s]+$/.exec(ref);
            return Boolean(documentReference && existsSync(path.join(sourceRoot, documentReference[1])));
        });
        if (!edge.summary?.trim()
            || evidenceRefs.length === 0
            || !hasTraceableEvidence
            || (journeyIds.length === 0 && apiIds.length === 0)
            || !['high', 'medium'].includes(edge.confidence ?? '')) {
            throw new Error(`project knowledge level-1 capability dependency graph edge lacks traceable evidence: ${edgeId}`);
        }
        edgeIds.add(edgeId);
        edgeKeys.add(edgeKey);
        outgoing.get(from)?.add(to);
        incoming.get(to)?.add(from);
    }
    if (edges.length > 0) {
        if (!/```mermaid[\s\S]*?flowchart[\s\S]*?```/.test(businessArchitectureBody)
            || [...edgeIds].some((edgeId) => !businessArchitectureBody.includes(edgeId))) {
            throw new Error('project knowledge business architecture dependency tree view mismatches canonical graph edges');
        }
    }
    for (const [capabilityId, projection] of projectionsByCapability) {
        if (projection.status !== 'derived'
            || projection.revision !== revision
            || projection.gapId !== 'not_applicable') {
            throw new Error(`project knowledge level-1 capability dependency projection is not derived from current graph: ${capabilityId}`);
        }
        if (projection.upstream === 'not_derived'
            || !sameIdentifierSet(projection.upstream, incoming.get(capabilityId) ?? new Set())) {
            throw new Error(`project knowledge level-1 capability upstream projection mismatches canonical graph: ${capabilityId}`);
        }
        if (projection.downstream === 'not_derived'
            || !sameIdentifierSet(projection.downstream, outgoing.get(capabilityId) ?? new Set())) {
            throw new Error(`project knowledge level-1 capability downstream projection mismatches canonical graph: ${capabilityId}`);
        }
    }
}
function assertSecondaryCapabilityDetailedDesign(body, capabilityId, secondaryId) {
    const scope = `${capabilityId}/${secondaryId}`;
    const legacyTopLevelTitles = [
        '实体、表与对象关系',
        '表结构设计',
        '事务、并发、性能与容错',
        '安全、测试与验收',
        '端到端追溯矩阵',
    ];
    for (const sectionTitle of legacyTopLevelTitles) {
        const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`^##\\s+\\d+\\.?\\s+${escapedTitle}\\s*$`, 'm').test(body)) {
            throw new Error(`project knowledge secondary capability detailed design uses legacy top-level interface-local section: ${scope}/${sectionTitle}`);
        }
    }
    const interfaceStatus = secondaryDesignStatus(body, 'interface_design_status', ['detailed', 'not_applicable'], capabilityId, secondaryId);
    const interfaceCoverage = secondaryDesignStatus(body, 'interface_coverage', ['complete', 'partial', 'not_applicable'], capabilityId, secondaryId);
    if (interfaceStatus === 'not_applicable') {
        if (interfaceCoverage !== 'not_applicable'
            || !/\binterface_not_applicable_reason\s*=\s*[^`\n|·]+/.test(body)
            || !/\binterface_not_applicable_evidence\s*=\s*(?:`)?(?:[A-Za-z0-9_.@+\-]+\/)+[A-Za-z0-9_.$@+\-]+\.[A-Za-z0-9]+:\d+-\d+#[A-Za-z_$][A-Za-z0-9_$<>.\-]*/.test(body)) {
            throw new Error(`project knowledge secondary capability interface not_applicable requires reason and evidence: ${scope}`);
        }
    }
    else {
        if (interfaceCoverage === 'not_applicable') {
            throw new Error(`project knowledge secondary capability interface coverage conflicts with detailed status: ${scope}`);
        }
        const interfaceHeading = /^##\s+(\d+)\.?\s+接口详细设计\s*$/m.exec(body);
        const interfaceSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+接口详细设计\s*$/m);
        if (!interfaceHeading || !interfaceSection) {
            throw new Error(`project knowledge secondary capability detailed design missing interface detail section: ${scope}`);
        }
        if (/现有入口集合|对应应用服务|以\s*DTO\/BO\s*校验为准|以统一响应和领域异常为准/.test(interfaceSection)) {
            throw new Error(`project knowledge secondary capability detailed design uses generic interface placeholder: ${scope}`);
        }
        const interfaceBindings = secondaryInterfaceTraceBindings(interfaceSection, Number(interfaceHeading[1]), scope, /\breader_profile\s*=\s*strict_full\b/.test(body));
        assertSecondaryAccessMatrix(body, scope, interfaceBindings);
        if (interfaceCoverage === 'partial' && !/(?:interface_gap_id\s*=|missing_evidence|缺失证据)/.test(body)) {
            throw new Error(`project knowledge secondary capability partial interface coverage requires an explicit gap: ${scope}`);
        }
    }
}
async function projectKnowledgeSourceFiles(sourceRoot) {
    const inventoryPath = path.join(sourceRoot, 'business', 'inventory.yaml');
    if (!existsSync(inventoryPath)) {
        throw new Error('project knowledge document missing: business/inventory.yaml');
    }
    await assertReadableProjectKnowledgeMarkdownFiles(sourceRoot);
    const inventory = parseSimpleYaml(await readFile(inventoryPath, 'utf8'));
    const gapReportPath = path.join(sourceRoot, 'gaps', 'doc-gap-report.md');
    const gapReportBody = existsSync(gapReportPath) ? await readFile(gapReportPath, 'utf8') : '';
    const level1Capabilities = Array.isArray(inventory.level1_capabilities)
        ? inventory.level1_capabilities
        : [];
    if (level1Capabilities.length === 0) {
        throw new Error('project knowledge inventory must contain at least one level1_capability_id');
    }
    const capabilityIdPattern = /^[a-z][a-z0-9_]*$/;
    const level1CapabilityIds = level1Capabilities.map((capability) => capability.level1_capability_id ?? '');
    if (level1CapabilityIds.some((capabilityId) => !capabilityIdPattern.test(capabilityId))) {
        throw new Error('project knowledge inventory contains an invalid level1_capability_id');
    }
    if (new Set(level1CapabilityIds).size !== level1CapabilityIds.length) {
        throw new Error('project knowledge inventory contains duplicate level1_capability_id values');
    }
    const businessArchitecturePath = path.join(sourceRoot, 'architecture', 'business.md');
    if (!existsSync(businessArchitecturePath)) {
        throw new Error('project knowledge document missing: architecture/business.md');
    }
    const businessArchitectureBody = await readFile(businessArchitecturePath, 'utf8');
    for (const capabilityId of level1CapabilityIds) {
        const overviewPath = `business/capabilities/${capabilityId}/detailed-design.md`;
        if (!businessArchitectureBody.includes(overviewPath)) {
            throw new Error(`project knowledge business architecture omits capability overview link: ${capabilityId}`);
        }
    }
    const assignedBusinessIds = new Set();
    for (const capability of level1Capabilities) {
        const capabilityId = capability.level1_capability_id;
        const secondaryCapabilities = Array.isArray(capability.secondary_capabilities)
            ? capability.secondary_capabilities
            : [];
        if (secondaryCapabilities.length === 0) {
            throw new Error(`project knowledge level-1 capability has no secondary capabilities: ${capabilityId}`);
        }
        const secondaryIds = secondaryCapabilities.map((secondary) => secondary.secondary_capability_id ?? '');
        if (secondaryIds.some((secondaryId) => !capabilityIdPattern.test(secondaryId))) {
            throw new Error(`project knowledge inventory contains an invalid secondary_capability_id: ${capabilityId}`);
        }
        if (new Set(secondaryIds).size !== secondaryIds.length) {
            throw new Error(`project knowledge inventory contains duplicate secondary_capability_id values: ${capabilityId}`);
        }
        for (const secondary of secondaryCapabilities) {
            const businessIds = Array.isArray(secondary.business_ids) ? secondary.business_ids : [];
            if (businessIds.length === 0 || businessIds.some((businessId) => !capabilityIdPattern.test(businessId))) {
                throw new Error(`project knowledge secondary capability must contain valid business_ids: ${capabilityId}/${secondary.secondary_capability_id}`);
            }
            for (const businessId of businessIds) {
                if (assignedBusinessIds.has(businessId)) {
                    throw new Error(`project knowledge business_id is assigned to multiple secondary capabilities: ${businessId}`);
                }
                assignedBusinessIds.add(businessId);
            }
        }
    }
    const capabilityDetailedDesigns = level1CapabilityIds.map((capabilityId) => ({
        source: `business/capabilities/${capabilityId}/detailed-design.md`,
        target: `documents/business/capabilities/${capabilityId}/detailed-design.md`,
        docType: 'business_capability_detailed_design',
        docId: `business_capability_detailed_design_${capabilityId}`,
        mediaType: 'text/markdown',
    }));
    const level1JourneysByCapability = new Map();
    const level1JourneyCoverageByCapability = new Map();
    const level1DependencyProjectionsByCapability = new Map();
    const compactPartialLevel1CapabilityIds = new Set();
    const participantReaderContractLevel1CapabilityIds = new Set();
    for (const capability of level1Capabilities) {
        const capabilityId = capability.level1_capability_id;
        const capabilityDocument = capabilityDetailedDesigns.find((document) => document.docId === `business_capability_detailed_design_${capabilityId}`);
        const capabilityDocumentPath = path.join(sourceRoot, capabilityDocument.source);
        if (!existsSync(capabilityDocumentPath)) {
            throw new Error(`project knowledge level-1 capability detailed design missing: ${capabilityId}`);
        }
        const capabilityDocumentBody = await readFile(capabilityDocumentPath, 'utf8');
        const capabilityCoverage = /\buser_journey_coverage\s*=\s*(complete|partial)\b/
            .exec(capabilityDocumentBody)?.[1];
        level1JourneyCoverageByCapability.set(capabilityId, capabilityCoverage);
        const compactPartial = isCompactPartialLevel1CapabilityDetailedDesign(capabilityDocumentBody);
        if (compactPartial) {
            compactPartialLevel1CapabilityIds.add(capabilityId);
            const readerContract = compactSecondaryReaderContract(capabilityDocumentBody);
            if (readerContract && readerContract !== 'participant_flow_interface_v1') {
                throw new Error(`project knowledge compact level-1 capability has unsupported secondary_reader_contract: ${capabilityId}/${readerContract}`);
            }
            if (readerContract === 'participant_flow_interface_v1') {
                participantReaderContractLevel1CapabilityIds.add(capabilityId);
            }
        }
        level1JourneysByCapability.set(capabilityId, compactPartial
            ? assertCompactPartialLevel1CapabilityDetailedDesign(capabilityDocumentBody, capabilityId, capability.secondary_capabilities, gapReportBody)
            : assertLevel1CapabilityDetailedDesign(capabilityDocumentBody, capabilityId, capability.secondary_capabilities, gapReportBody));
        level1DependencyProjectionsByCapability.set(capabilityId, level1CapabilityDependencyProjection(capabilityDocumentBody, capabilityId, compactPartial));
        for (const secondary of capability.secondary_capabilities) {
            const secondaryId = secondary.secondary_capability_id;
            const escapedSecondaryId = secondaryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const secondaryIdPattern = new RegExp(`(^|[^a-z0-9_])${escapedSecondaryId}([^a-z0-9_]|$)`);
            if (!secondaryIdPattern.test(capabilityDocumentBody)) {
                throw new Error(`project knowledge level-1 capability detailed design omits secondary_capability_id: ${capabilityId}/${secondaryId}`);
            }
            const childPath = `business/capabilities/${capabilityId}/secondary-capabilities/${secondaryId}/detailed-design.md`;
            const relativeChildPath = `secondary-capabilities/${secondaryId}/detailed-design.md`;
            if (!capabilityDocumentBody.includes(childPath) && !capabilityDocumentBody.includes(relativeChildPath)) {
                throw new Error(`project knowledge capability overview omits secondary capability link: ${capabilityId}/${secondaryId}`);
            }
        }
    }
    const capabilityDependencyGraphRelativePath = 'business/level1-capability-dependency-graph.yaml';
    const capabilityDependencyGraphPath = path.join(sourceRoot, capabilityDependencyGraphRelativePath);
    const secondaryCapabilityDetailedDesigns = [];
    const apiIdsByCapability = new Map(level1CapabilityIds.map((capabilityId) => [capabilityId, new Set()]));
    let allSecondaryInterfacesComplete = true;
    for (const capability of level1Capabilities) {
        const capabilityId = capability.level1_capability_id;
        const secondaries = capability.secondary_capabilities;
        for (let secondaryIndex = 0; secondaryIndex < secondaries.length; secondaryIndex += 1) {
            const secondary = secondaries[secondaryIndex];
            const secondaryId = secondary.secondary_capability_id;
            const relativePath = `business/capabilities/${capabilityId}/secondary-capabilities/${secondaryId}/detailed-design.md`;
            const absolutePath = path.join(sourceRoot, relativePath);
            if (!existsSync(absolutePath)) {
                throw new Error(`project knowledge secondary capability detailed design missing: ${capabilityId}/${secondaryId}`);
            }
            const body = await readFile(absolutePath, 'utf8');
            const escapedSecondaryId = secondaryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const secondaryIdPattern = new RegExp(`(^|[^a-z0-9_])${escapedSecondaryId}([^a-z0-9_]|$)`);
            if (!secondaryIdPattern.test(body)) {
                throw new Error(`project knowledge secondary capability detailed design has wrong identity: ${capabilityId}/${secondaryId}`);
            }
            const compactPartial = isCompactPartialSecondaryCapabilityDetailedDesign(body);
            const secondaryReaderContract = compactSecondaryReaderContract(body);
            if (secondaryReaderContract
                && secondaryReaderContract !== 'participant_flow_interface_v1') {
                throw new Error(`project knowledge compact secondary capability has unsupported secondary_reader_contract: ${capabilityId}/${secondaryId}/${secondaryReaderContract}`);
            }
            if (participantReaderContractLevel1CapabilityIds.has(capabilityId)
                && !usesParticipantFlowInterfaceContract(body)) {
                throw new Error(`project knowledge compact level-1 capability requires all secondary documents to use secondary_reader_contract=participant_flow_interface_v1: ${capabilityId}/${secondaryId}`);
            }
            if (compactPartial && usesParticipantFlowInterfaceContract(body)) {
                const expectedNavigationTargets = [
                    `business/capabilities/${capabilityId}/detailed-design.md`,
                ];
                if (secondaryIndex > 0) {
                    expectedNavigationTargets.push(`business/capabilities/${capabilityId}/secondary-capabilities/${secondaries[secondaryIndex - 1].secondary_capability_id}/detailed-design.md`);
                }
                if (secondaryIndex + 1 < secondaries.length) {
                    expectedNavigationTargets.push(`business/capabilities/${capabilityId}/secondary-capabilities/${secondaries[secondaryIndex + 1].secondary_capability_id}/detailed-design.md`);
                }
                assertSecondaryNavigationLinks(body, absolutePath, sourceRoot, expectedNavigationTargets, `${capabilityId}/${secondaryId}`);
            }
            if (compactPartial !== compactPartialLevel1CapabilityIds.has(capabilityId)) {
                throw new Error(`project knowledge compact partial document profile mismatch: ${capabilityId}/${secondaryId}`);
            }
            if (compactPartial) {
                assertCompactPartialSecondaryCapabilityDetailedDesign(body, capabilityId, secondary, gapReportBody, participantReaderContractLevel1CapabilityIds.has(capabilityId));
            }
            else {
                assertSecondaryCapabilityDetailedDesign(body, capabilityId, secondaryId);
            }
            const secondaryInterfaceCoverage = /\binterface_coverage\s*=\s*(complete|partial|not_applicable)\b/
                .exec(body)?.[1] ?? 'missing';
            if (secondaryInterfaceCoverage !== 'complete')
                allSecondaryInterfacesComplete = false;
            if (level1JourneyCoverageByCapability.get(capabilityId) === 'complete'
                && secondaryInterfaceCoverage !== 'complete') {
                throw new Error(`project knowledge level-1 complete user journey coverage conflicts with ${secondaryInterfaceCoverage} secondary interface coverage: ${capabilityId}/${secondaryId}`);
            }
            if (compactPartial) {
                secondaryCapabilityDetailedDesigns.push({
                    source: relativePath,
                    target: `documents/${relativePath}`,
                    docType: 'secondary_capability_detailed_design',
                    docId: `secondary_capability_detailed_design_${capabilityId}_${secondaryId}`,
                    mediaType: 'text/markdown',
                });
                continue;
            }
            const expectedJourneys = level1JourneysByCapability.get(capabilityId)?.get(secondaryId) ?? [];
            const expectedJourneyIds = new Set(expectedJourneys.map((journey) => journey.journeyId));
            const interfaceHeading = /^##\s+(\d+)\.?\s+接口详细设计\s*$/m.exec(body);
            const interfaceSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+接口详细设计\s*$/m) ?? '';
            const childJourneyBindings = secondaryInterfaceTraceBindings(interfaceSection, Number(interfaceHeading?.[1] ?? 5), `${capabilityId}/${secondaryId}`);
            for (const bindings of childJourneyBindings.values()) {
                for (const binding of bindings)
                    apiIdsByCapability.get(capabilityId)?.add(binding.apiId);
            }
            for (const journey of expectedJourneys) {
                const bindings = childJourneyBindings.get(journey.journeyId) ?? [];
                if (bindings.length === 0) {
                    throw new Error(`project knowledge secondary capability detailed design omits level-1 journey_id: ${capabilityId}/${secondaryId}/${journey.journeyId}`);
                }
                const matchingBinding = bindings.some((binding) => (binding.apiId === journey.apiId
                    && binding.interfaceEntry === journey.interfaceEntry
                    && journey.controllerAnchors.every((anchor) => binding.controllerAnchors.includes(anchor))
                    && journey.serviceAnchors.every((anchor) => binding.serviceAnchors.includes(anchor))
                    && sameIdentifierSet(new Set(binding.tableIds), new Set(journey.tableIds))
                    && journey.tableIds.every((tableId) => (binding.physicalTableNames.get(tableId) === journey.physicalTableNames.get(tableId)))));
                if (!matchingBinding) {
                    throw new Error(`project knowledge secondary capability detailed design mismatches level-1 journey trace: ${capabilityId}/${secondaryId}/${journey.journeyId}`);
                }
            }
            for (const [journeyId, bindings] of childJourneyBindings) {
                if (!expectedJourneyIds.has(journeyId)) {
                    throw new Error(`project knowledge secondary capability detailed design contains journey_id absent from level-1 outward capabilities: ${capabilityId}/${secondaryId}/${journeyId}`);
                }
                const expectedBindings = expectedJourneys.filter((journey) => journey.journeyId === journeyId);
                for (const binding of bindings) {
                    const matchesParentBinding = expectedBindings.some((journey) => (binding.apiId === journey.apiId
                        && binding.interfaceEntry === journey.interfaceEntry
                        && journey.controllerAnchors.every((anchor) => binding.controllerAnchors.includes(anchor))
                        && journey.serviceAnchors.every((anchor) => binding.serviceAnchors.includes(anchor))
                        && sameIdentifierSet(new Set(binding.tableIds), new Set(journey.tableIds))
                        && journey.tableIds.every((tableId) => (binding.physicalTableNames.get(tableId) === journey.physicalTableNames.get(tableId)))));
                    if (!matchesParentBinding) {
                        throw new Error(`project knowledge secondary capability detailed design contains interface binding absent from level-1 outward capability: ${capabilityId}/${secondaryId}/${journeyId}/${binding.apiId}`);
                    }
                }
            }
            secondaryCapabilityDetailedDesigns.push({
                source: relativePath,
                target: `documents/${relativePath}`,
                docType: 'secondary_capability_detailed_design',
                docId: `secondary_capability_detailed_design_${capabilityId}_${secondaryId}`,
                mediaType: 'text/markdown',
            });
        }
    }
    if (!existsSync(capabilityDependencyGraphPath)) {
        throw new Error(`project knowledge level-1 capability dependency graph missing: ${capabilityDependencyGraphRelativePath}`);
    }
    assertLevel1CapabilityDependencyGraph(await readFile(capabilityDependencyGraphPath, 'utf8'), level1Capabilities, level1JourneyCoverageByCapability, level1JourneysByCapability, apiIdsByCapability, allSecondaryInterfacesComplete, level1DependencyProjectionsByCapability, businessArchitectureBody, sourceRoot, gapReportBody);
    const requirementDetailedDesigns = [];
    for (const capabilityId of level1CapabilityIds) {
        const requirementsRoot = path.join(sourceRoot, 'business', 'capabilities', capabilityId, 'requirements');
        if (!existsSync(requirementsRoot))
            continue;
        const requirementDirectories = (await readdir(requirementsRoot, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .sort((left, right) => left.name.localeCompare(right.name));
        for (const requirementDirectory of requirementDirectories) {
            const requirementId = requirementDirectory.name;
            if (!/^[a-z0-9][a-z0-9-]*$/.test(requirementId)) {
                throw new Error(`project knowledge requirement_id is invalid: ${capabilityId}/${requirementId}`);
            }
            const relativePath = `business/capabilities/${capabilityId}/requirements/${requirementId}/detailed-design.md`;
            if (!existsSync(path.join(sourceRoot, relativePath))) {
                throw new Error(`project knowledge requirement detailed design missing: ${capabilityId}/${requirementId}`);
            }
            requirementDetailedDesigns.push({
                source: relativePath,
                target: `documents/${relativePath}`,
                docType: 'requirement_detailed_design',
                docId: `requirement_detailed_design_${capabilityId}_${requirementId}`,
                mediaType: 'text/markdown',
            });
        }
    }
    return [
        {
            source: 'metadata.yaml',
            target: 'documents/metadata.yaml',
            docType: 'project_knowledge_metadata',
            mediaType: 'application/yaml',
        },
        {
            source: 'architecture/technical.md',
            target: 'documents/architecture/technical.md',
            docType: 'project_technical_architecture',
            mediaType: 'text/markdown',
        },
        {
            source: 'architecture/business.md',
            target: 'documents/architecture/business.md',
            docType: 'project_business_architecture',
            mediaType: 'text/markdown',
        },
        {
            source: 'business/inventory.yaml',
            target: 'documents/business/inventory.yaml',
            docType: 'business_inventory',
            mediaType: 'application/yaml',
        },
        {
            source: capabilityDependencyGraphRelativePath,
            target: `documents/${capabilityDependencyGraphRelativePath}`,
            docType: 'level1_capability_dependency_graph',
            mediaType: 'application/yaml',
        },
        ...capabilityDetailedDesigns,
        ...secondaryCapabilityDetailedDesigns,
        ...requirementDetailedDesigns,
        {
            source: 'gaps/doc-gap-report.md',
            target: 'documents/gaps/doc-gap-report.md',
            docType: 'doc_gap_report',
            mediaType: 'text/markdown',
        },
    ];
}
async function projectKnowledgeArchiveSourceFiles(repo, config) {
    if (!config.organization?.id)
        return [];
    const archiveRoot = path.join(repo, '.axis', 'docs', '_archive', 'orgs', config.organization.id, 'projects', config.project.slug);
    if (!existsSync(archiveRoot))
        return [];
    const supportedExtensions = new Set(['.md', '.markdown', '.yaml', '.yml', '.json', '.txt', '.html', '.csv']);
    const archiveMediaType = (filePath) => {
        const extension = path.extname(filePath).toLowerCase();
        if (extension === '.md' || extension === '.markdown')
            return 'text/markdown';
        if (extension === '.yaml' || extension === '.yml')
            return 'application/yaml';
        if (extension === '.json')
            return 'application/json';
        if (extension === '.html')
            return 'text/html';
        if (extension === '.csv')
            return 'text/csv';
        return 'text/plain';
    };
    const files = [];
    const visit = async (directory) => {
        const entries = (await readdir(directory, { withFileTypes: true }))
            .sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
                continue;
            }
            if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase()))
                continue;
            const relativePath = path.relative(archiveRoot, absolutePath).split(path.sep).join('/');
            files.push({
                source: relativePath,
                sourceRoot: archiveRoot,
                target: `documents/_archive/${relativePath}`,
                docType: entry.name === 'metadata.json' ? 'document_archive_metadata' : 'document_archive',
                docId: `document_archive_${createHash('sha256').update(relativePath).digest('hex').slice(0, 16)}`,
                mediaType: archiveMediaType(relativePath),
            });
        }
    };
    await visit(archiveRoot);
    return files;
}
async function assertPublicSafeProjectKnowledgeSources(sourceRoot, sourceFiles) {
    for (const sourceFile of sourceFiles) {
        const sourcePath = path.join(sourceFile.sourceRoot ?? sourceRoot, sourceFile.source);
        if (!existsSync(sourcePath)) {
            throw new Error(`project knowledge document missing: ${sourceFile.source}`);
        }
        const scan = redactSensitiveText(await readFile(sourcePath, 'utf8'));
        if (scan.redactions > 0) {
            throw new Error(`project knowledge document contains credential-like content: ${sourceFile.source}`);
        }
    }
}
async function projectKnowledgeCaptureCommand() {
    const repo = repoArg();
    const rawConfig = await readAxisConfig(repo);
    const { errors, effectiveConfig: config } = await resolveAxisConfig(repo, rawConfig);
    if (errors.length > 0)
        throw new Error(errors.join('\n'));
    if (!config)
        throw new Error('Unable to resolve Axis config');
    if (config.contract_version !== '0.2') {
        throw new Error('project-knowledge-capture requires contract_version: "0.2"');
    }
    const language = getArg('--language') ?? 'zh-CN';
    if (language !== 'zh-CN') {
        throw new Error('--language currently supports only zh-CN');
    }
    const runId = buildRunId('project_knowledge_snapshot');
    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const sourceRoot = projectKnowledgeSourceRoot(repo, config);
    const sourceFiles = [
        ...await projectKnowledgeSourceFiles(sourceRoot),
        ...await projectKnowledgeArchiveSourceFiles(repo, config),
    ];
    await assertPublicSafeProjectKnowledgeSources(sourceRoot, sourceFiles);
    const packageDir = packageDirFor(repo, config, runId);
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });
    for (const sourceFile of sourceFiles) {
        const targetPath = path.join(packageDir, sourceFile.target);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await cp(path.join(sourceFile.sourceRoot ?? sourceRoot, sourceFile.source), targetPath);
    }
    const organization = organizationSnapshot(config);
    const project = projectSnapshot(config);
    const ossProfile = ossProfileSnapshot(config);
    const git = await gitInfo(repo);
    const publicSafetyValidation = {
        status: 'passed',
        validators: [...publicSafetyValidators, 'project_knowledge_source_scan'],
        findings_count: 0,
        validated_at: createdAt,
        validated_by: { role: 'producing_skill' },
    };
    const documentRefs = await Promise.all(sourceFiles.map(async (sourceFile) => {
        const entry = await fileEntry(packageDir, 'document', sourceFile.target, sourceFile.mediaType);
        return {
            doc_id: sourceFile.docId ?? sourceFile.docType,
            doc_type: sourceFile.docType,
            status: 'review',
            revision: 1,
            source_path: sourceFile.target,
            content_sha256: entry.sha256,
        };
    }));
    const metadata = {
        schema: 'axis.package.metadata',
        schema_version: config.contract_version,
        title: `${config.project.display_name} 项目知识快照`,
        summary: '项目知识启动文档的可发布快照。',
        tags: ['project-knowledge', language.toLowerCase()],
        organization,
        project,
        source_evidence: {
            repo_ref: path.basename(repo),
            commit: git.commit,
            run_id: runId,
        },
        index_refs: {
            organization_index: `${normalizeOssPrefix(config.oss.prefix)}/orgs/${organization?.id}/index/projects.jsonl`,
            project_document_path: projectDocumentsOssPath(config),
        },
        artifact: {
            type: 'project_knowledge_snapshot',
            status: 'passed',
            started_at: createdAt,
            finished_at: createdAt,
        },
        skill: {
            name: skillNames.projectKnowledge,
            responsibility: 'Package the reviewed project knowledge source documents for explicit OSS publishing.',
        },
        public_safety: {
            reviewed: true,
            contains_credentials: false,
            contains_private_urls: false,
            validation: publicSafetyValidation,
            redaction_notes: 'Credential-like content is rejected before the snapshot is created.',
        },
        document: {
            doc_id: `project_knowledge_snapshot_${runId.replace(/[^A-Za-z0-9]+/g, '_')}`,
            doc_type: 'project_knowledge_snapshot',
            status: 'review',
            revision: 1,
            language,
            source_root: relativeToRepo(repo, sourceRoot),
            documents: documentRefs,
        },
    };
    await writeJsonFile(path.join(packageDir, 'metadata.json'), metadata);
    const documentEntries = await Promise.all(sourceFiles.map((sourceFile) => (fileEntry(packageDir, 'document', sourceFile.target, sourceFile.mediaType))));
    const manifest = {
        schema: 'axis.package.manifest',
        schema_version: config.contract_version,
        package_id: packageIdFor(config, runId),
        created_at: createdAt,
        organization,
        project,
        oss_profile: ossProfile,
        producer: { skill: skillNames.projectKnowledge, agent: 'codex' },
        run: { run_id: runId, git },
        release: config.release,
        files: [
            await fileEntry(packageDir, 'metadata', 'metadata.json', 'application/json'),
            ...documentEntries,
        ],
        publish: {
            provider: 'aliyun-oss',
            status: 'local_ready',
            bucket: config.oss.bucket,
            prefix: config.oss.prefix,
            base_uri: projectDocumentsBaseUri(config),
        },
        protocols: protocolVersions,
        document_refs: documentRefs,
        skill_refs: [{
                skill_id: skillNames.projectKnowledge,
                canonical_family: 'project_knowledge',
                status: 'active',
            }],
        tool_refs: [],
        public_safety_validation: publicSafetyValidation,
    };
    const manifestPath = path.join(packageDir, 'manifest.json');
    await writeJsonFile(manifestPath, manifest);
    console.log(JSON.stringify({
        ok: true,
        asset_type: 'project_knowledge_snapshot',
        package_dir: relativeToRepo(repo, packageDir),
        files: [...manifest.files.map((file) => file.path), 'manifest.json'],
    }, null, 2));
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
function packageDirFor(repo, config, runId) {
    const organizationId = config.organization?.id;
    if (!organizationId)
        throw new Error('organization.id is required for v0.2 package path');
    return path.join(repo, config.package.outbox_dir, 'v0.2', organizationId, config.project.slug, runId);
}
function packageIdFor(config, runId) {
    return `${config.organization?.id}__${config.project.slug}__${runId}`;
}
function ossPackagePath(config, runId) {
    if (config.contract_version === '0.2') {
        if (!config.organization?.id)
            throw new Error('organization.id is required for v0.2 OSS package path');
        return `${normalizeOssPrefix(config.oss.prefix)}/orgs/${config.organization.id}/projects/${config.project.slug}/packages/${runId}/`;
    }
    return `${normalizeOssPrefix(config.oss.prefix)}/${config.project.slug}/${runId}/`;
}
function projectDocumentsOssPath(config) {
    if (config.contract_version !== '0.2' || !config.organization?.id) {
        throw new Error('project document sync requires contract_version "0.2" and organization.id');
    }
    return `${normalizeOssPrefix(config.oss.prefix)}/orgs/${config.organization.id}/projects/${config.project.slug}/`;
}
function projectDocumentArchivesOssPath(config) {
    if (config.contract_version !== '0.2' || !config.organization?.id) {
        throw new Error('project document archive sync requires contract_version "0.2" and organization.id');
    }
    return `${normalizeOssPrefix(config.oss.prefix)}/_archive/orgs/${config.organization.id}/projects/${config.project.slug}/`;
}
function baseUriFor(config, runId) {
    return `oss://${config.oss.bucket}/${ossPackagePath(config, runId)}`;
}
function projectDocumentsBaseUri(config) {
    return `oss://${config.oss.bucket}/${projectDocumentsOssPath(config)}`;
}
function organizationSnapshot(config) {
    if (config.contract_version !== '0.2')
        return undefined;
    if (!config.organization)
        throw new Error('organization.id is required for v0.2 package snapshot');
    return config.organization;
}
function projectSnapshot(config) {
    return {
        slug: config.project.slug,
        display_name: config.project.display_name,
    };
}
function ossProfileSnapshot(config) {
    return {
        name: config.oss.profile,
        provider: config.oss.provider,
        bucket: config.oss.bucket,
        prefix: config.oss.prefix,
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
function documentTypeForAsset(assetType) {
    return assetType === 'test_report' ? 'test_report' : 'execution_report';
}
function canonicalFamilyForAsset(assetType) {
    return assetType === 'test_report' ? 'test_verify_benchmark' : 'fix_optimize';
}
function protocolDocId(runId) {
    return `report_${runId.replace(/[^A-Za-z0-9]+/g, '_')}`;
}
function workflowStatusForArtifact(status) {
    return status === 'failed' || status === 'partial' ? 'blocked' : 'completed';
}
async function writePackageCommand(assetType) {
    const repo = repoArg();
    const rawConfig = await readAxisConfig(repo);
    const { errors, effectiveConfig: config } = await resolveAxisConfig(repo, rawConfig);
    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
    if (!config)
        throw new Error('Unable to resolve Axis config');
    const slug = config.project.slug;
    const displayName = config.project.display_name;
    const releaseChannel = config.release.channel;
    const releaseGate = config.release.gate;
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
    const packageDir = packageDirFor(repo, config, runId);
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, 'report.md'), report.endsWith('\n') ? report : `${report}\n`, 'utf8');
    await writeFile(path.join(packageDir, 'experience.md'), experience.endsWith('\n') ? experience : `${experience}\n`, 'utf8');
    const reportEntry = await fileEntry(packageDir, 'report', 'report.md', 'text/markdown');
    const experienceEntry = await fileEntry(packageDir, 'experience', 'experience.md', 'text/markdown');
    const docId = protocolDocId(runId);
    const documentType = documentTypeForAsset(assetType);
    const workflowStatus = workflowStatusForArtifact(artifactStatus);
    const git = await gitInfo(repo);
    const organization = organizationSnapshot(config);
    const project = projectSnapshot(config);
    const ossProfile = ossProfileSnapshot(config);
    const publicSafetyValidation = {
        status: 'passed',
        validators: [...publicSafetyValidators],
        findings_count: 0,
        validated_at: createdAt,
        validated_by: {
            role: 'producing_skill',
        },
    };
    const metadata = {
        schema: 'axis.package.metadata',
        schema_version: config.contract_version,
        title,
        summary,
        tags,
        ...(organization ? { organization } : {}),
        ...(config.contract_version === '0.2' ? {
            project,
            source_evidence: {
                repo_ref: path.basename(repo),
                commit: git.commit,
                run_id: runId,
            },
            index_refs: {
                organization_index: `${normalizeOssPrefix(config.oss.prefix)}/orgs/${organization?.id}/index/projects.jsonl`,
                project_package_path: ossPackagePath(config, runId).replace(/\/$/, '/'),
            },
        } : {}),
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
            validation: publicSafetyValidation,
            redaction_notes: 'No credentials, private URLs, or customer-specific identifiers were included.',
        },
        document: {
            doc_id: docId,
            doc_type: documentType,
            status: 'completed',
            revision: 1,
            storage: {
                path: 'report.md',
                content_sha256: reportEntry.sha256,
            },
        },
        workflow: {
            workflow_run_id: null,
            workflow_step: null,
            status: workflowStatus,
            blocked_reason: workflowStatus === 'blocked' ? 'partial_execution' : null,
            checkpoint_ref: docId,
        },
        experience: {
            scope: 'task',
            related_skill: skillNameForAsset(assetType),
            candidate_path: 'experience.md',
            confidence: 'medium',
            quality: {
                evidence_count: 1,
                novelty: 'unknown',
            },
        },
        agent_execution: {
            pack_id: null,
            run_id: runId,
            expected_outputs: {
                execution_report: {
                    doc_type: documentType,
                    required: true,
                },
                experience_candidates: {
                    doc_type: 'experience_card',
                    required: assetType === 'coding_capture',
                },
            },
        },
        links: {
            manifest_path: 'manifest.json',
            report_path: 'report.md',
            experience_path: 'experience.md',
        },
    };
    await writeFile(path.join(packageDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    const manifest = {
        schema: 'axis.package.manifest',
        schema_version: config.contract_version,
        package_id: packageIdFor(config, runId),
        created_at: createdAt,
        organization,
        project,
        oss_profile: ossProfile,
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
            reportEntry,
            experienceEntry,
        ],
        publish: {
            provider: 'aliyun-oss',
            status: 'local_ready',
            bucket: config.oss.bucket,
            prefix: config.oss.prefix,
            base_uri: baseUriFor(config, runId),
        },
        protocols: protocolVersions,
        document_refs: [
            {
                doc_id: docId,
                doc_type: documentType,
                status: 'completed',
                revision: 1,
                source_path: 'report.md',
                content_sha256: reportEntry.sha256,
            },
        ],
        skill_refs: [
            {
                skill_id: skillNameForAsset(assetType),
                canonical_family: canonicalFamilyForAsset(assetType),
                status: 'active',
            },
        ],
        tool_refs: [],
        execution: {
            pack_id: null,
            report_doc_id: docId,
            retry_of_run_id: null,
            resume_from_report_id: null,
        },
        experience_refs: [],
        workflow_recovery: {
            workflow_run_id: null,
            status: workflowStatus,
            blocked_reason: workflowStatus === 'blocked' ? 'partial_execution' : null,
            checkpoint_ref: docId,
        },
        public_safety_validation: publicSafetyValidation,
    };
    const manifestPath = path.join(packageDir, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: true,
        asset_type: assetType,
        package_dir: relativeToRepo(repo, packageDir),
        files: [...manifest.files.map((file) => file.path), 'manifest.json'],
    }, null, 2));
}
async function readJsonFile(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}
async function writeJsonFile(filePath, value) {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
async function readOptionalLocalConfig(repo) {
    const configPath = path.join(repo, '.axis', 'config.local.yml');
    if (!existsSync(configPath))
        return null;
    return parseSimpleYaml(await readFile(configPath, 'utf8'));
}
async function readPublishConfig(repo) {
    const config = await readAxisConfig(repo);
    const localConfig = await readOptionalLocalConfig(repo);
    if (!localConfig)
        return { config, localDryRun: false };
    if (localConfig.contract_version && localConfig.contract_version !== config.contract_version) {
        throw new Error('contract_version in .axis/config.local.yml must match .axis/config.yml');
    }
    const localOssEnvOverrides = {};
    for (const field of requiredEnvFields) {
        if (localConfig.oss?.[field])
            localOssEnvOverrides[field] = localConfig.oss[field];
    }
    if (localConfig.oss?.security_token_env) {
        localOssEnvOverrides.security_token_env = localConfig.oss.security_token_env;
    }
    const hasLocalOssEnvOverrides = Object.keys(localOssEnvOverrides).length > 0;
    return {
        config: {
            ...config,
            package: {
                ...config.package,
                outbox_dir: localConfig.local?.outbox_dir ?? config.package?.outbox_dir,
            },
            oss: config.oss,
        },
        localDryRun: localConfig.local?.dry_run === true,
        localOssEnvOverrides: hasLocalOssEnvOverrides ? localOssEnvOverrides : undefined,
    };
}
function assertReleaseChannel(value, source) {
    if (value !== 'private_beta' && value !== 'public') {
        throw new Error(`${source} must be private_beta or public`);
    }
}
function assertReleaseGate(value, source) {
    if (value !== 'not_requested' && value !== 'pending' && value !== 'passed' && value !== 'failed') {
        throw new Error(`${source} must be not_requested, pending, passed, or failed`);
    }
}
function assertPublishStatus(value) {
    if (value !== 'local_ready' && value !== 'uploading' && value !== 'published' && value !== 'failed') {
        throw new Error('manifest.publish.status must be local_ready, uploading, published, or failed');
    }
}
function normalizeOssPrefix(prefix) {
    return prefix.replace(/^\/+|\/+$/g, '');
}
function objectKeyForConfig(config, runId, relativePath) {
    if (config.contract_version === '0.2') {
        return `${ossPackagePath(config, runId)}${relativePath}`;
    }
    return `${normalizeOssPrefix(config.oss.prefix)}/${config.project.slug}/${runId}/${relativePath}`;
}
function projectKnowledgeSyncedRelativePath(packagePath) {
    if (packagePath.startsWith('documents/'))
        return packagePath.slice('documents/'.length);
    if (packagePath === 'metadata.json')
        return '_sync/metadata.json';
    if (packagePath === 'manifest.json')
        return '_sync/manifest.json';
    throw new Error(`unsupported project knowledge sync path: ${packagePath}`);
}
function objectKeyForPublish(config, runId, relativePath, assetType) {
    if (assetType === 'project_knowledge_snapshot') {
        if (relativePath.startsWith('documents/_archive/')) {
            return `${projectDocumentArchivesOssPath(config)}${relativePath.slice('documents/_archive/'.length)}`;
        }
        return `${projectDocumentsOssPath(config)}${projectKnowledgeSyncedRelativePath(relativePath)}`;
    }
    return objectKeyForConfig(config, runId, relativePath);
}
function ossUri(bucket, objectKey) {
    return `oss://${bucket}/${objectKey}`;
}
function redactSensitiveText(text) {
    let redactions = 0;
    const replaceAll = (pattern, replacement) => {
        text = text.replace(pattern, () => {
            redactions += 1;
            return replacement;
        });
    };
    const redactAfterPrefix = (pattern) => {
        text = text.replace(pattern, (_match, prefix) => {
            redactions += 1;
            return `${prefix}[REDACTED]`;
        });
    };
    redactAfterPrefix(/(ALIYUN_OSS_ACCESS_KEY_SECRET\s*=\s*)[^\s`'"]+/gi);
    redactAfterPrefix(/(ALIYUN_OSS_ACCESS_KEY_ID\s*=\s*)[^\s`'"]+/gi);
    redactAfterPrefix(/\b(access[_-]?key[_-]?secret\s*[:=]\s*)[^\s`'"]+/gi);
    redactAfterPrefix(/\b(secret[_-]?access[_-]?key\s*[:=]\s*)[^\s`'"]+/gi);
    redactAfterPrefix(/(authorization:\s*bearer\s+)[A-Za-z0-9._~+/=-]+/gi);
    replaceAll(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]');
    replaceAll(/\b(?:AKIA|LTAI)[A-Za-z0-9]{8,}\b/g, '[REDACTED]');
    replaceAll(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');
    return { text, redactions };
}
function unsafePathReason(relativePath) {
    if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
        return relativePath || '(empty)';
    }
    const segments = relativePath.split('/');
    const unsafeDirs = new Set([
        '.git',
        '.hg',
        '.svn',
        '.cache',
        '.next',
        '.nuxt',
        '.turbo',
        '.vite',
        '.parcel-cache',
        '__pycache__',
        '.pytest_cache',
        '.mypy_cache',
        'node_modules',
        'coverage',
        'dist',
        'build',
        'out',
        'target',
    ]);
    for (const segment of segments.slice(0, -1)) {
        if (unsafeDirs.has(segment))
            return relativePath;
    }
    const fileName = segments[segments.length - 1];
    if (/^\.env(?:\.|$)/i.test(fileName))
        return relativePath;
    if (/^(?:\.npmrc|\.pypirc|\.netrc|\.dockerconfigjson)$/i.test(fileName))
        return relativePath;
    if (/\.(?:pem|key|p12|pfx|crt|cer)$/i.test(fileName))
        return relativePath;
    if (/(^|[._-])(?:cookie|cookies|token|tokens|secret|secrets|credential|credentials)([._-]|$)/i.test(fileName)) {
        return relativePath;
    }
    return null;
}
async function collectPackageRelativePaths(packageDir) {
    const files = [];
    async function visit(current) {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const child = path.join(current, entry.name);
            const relativePath = toPosix(path.relative(packageDir, child));
            const unsafe = unsafePathReason(relativePath);
            if (unsafe)
                throw new Error(`refusing unsafe package path: ${unsafe}`);
            if (entry.isSymbolicLink()) {
                throw new Error(`refusing symlink in package path: ${relativePath}`);
            }
            if (entry.isDirectory()) {
                await visit(child);
            }
            else if (entry.isFile()) {
                files.push(relativePath);
            }
        }
    }
    await visit(packageDir);
    return files.sort();
}
async function fileEntryFromRelative(packageDir, existing) {
    const absolutePath = path.join(packageDir, existing.path);
    const content = await readFile(absolutePath);
    const stats = await stat(absolutePath);
    return {
        ...existing,
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: stats.size,
    };
}
async function refreshManifestFileEntries(packageDir, manifest) {
    if (!manifest.files)
        return;
    const refreshed = [];
    for (const entry of manifest.files) {
        refreshed.push(await fileEntryFromRelative(packageDir, entry));
    }
    manifest.files = refreshed;
}
async function persistManifest(packageDir, manifest, status) {
    if (!manifest.publish)
        manifest.publish = {};
    if (status)
        manifest.publish.status = status;
    await refreshManifestFileEntries(packageDir, manifest);
    await writeJsonFile(path.join(packageDir, 'manifest.json'), manifest);
}
function sortedCopy(values) {
    return [...values].sort();
}
function assertSameStringSet(actual, expected, message) {
    const actualSorted = sortedCopy(actual);
    const expectedSorted = sortedCopy(expected);
    if (actualSorted.length !== expectedSorted.length || actualSorted.some((value, index) => value !== expectedSorted[index])) {
        throw new Error(`${message}: expected ${expectedSorted.join(', ')}; got ${actualSorted.join(', ')}`);
    }
}
async function validatePackageManifest(repo, packageDir, runId, config, localFiles) {
    const manifestPath = path.join(packageDir, 'manifest.json');
    const metadataPath = path.join(packageDir, 'metadata.json');
    if (!existsSync(manifestPath))
        throw new Error('manifest.json is required');
    if (!existsSync(metadataPath))
        throw new Error('metadata.json is required');
    const manifest = await readJsonFile(manifestPath);
    const metadata = await readJsonFile(metadataPath);
    if (manifest.schema !== 'axis.package.manifest')
        throw new Error('manifest.schema must be axis.package.manifest');
    if (manifest.schema_version !== config.contract_version) {
        throw new Error(`manifest.schema_version must be "${config.contract_version}"`);
    }
    if (manifest.project?.slug !== config.project.slug)
        throw new Error('manifest.project.slug must match .axis/config.yml');
    if (manifest.project?.display_name !== config.project.display_name) {
        throw new Error('manifest.project.display_name must match .axis/config.yml');
    }
    if (manifest.run?.run_id !== runId)
        throw new Error('manifest.run.run_id must match --run-id');
    if (manifest.package_id !== packageIdFor(config, runId))
        throw new Error('manifest.package_id does not match resolved config and run id');
    if (config.contract_version === '0.2') {
        const expectedOrganization = organizationSnapshot(config);
        const expectedOssProfile = ossProfileSnapshot(config);
        if (manifest.organization?.id !== expectedOrganization?.id
            || manifest.organization?.slug !== expectedOrganization?.slug
            || manifest.organization?.display_name !== expectedOrganization?.display_name
            || metadata.organization?.id !== expectedOrganization?.id
            || metadata.organization?.slug !== expectedOrganization?.slug
            || metadata.organization?.display_name !== expectedOrganization?.display_name
            || metadata.project?.slug !== config.project.slug
            || metadata.project?.display_name !== config.project.display_name
            || manifest.oss_profile?.name !== expectedOssProfile?.name
            || manifest.oss_profile?.provider !== expectedOssProfile?.provider
            || manifest.oss_profile?.bucket !== expectedOssProfile?.bucket
            || manifest.oss_profile?.prefix !== expectedOssProfile?.prefix) {
            throw new Error('manifest organization/project/oss snapshot does not match resolved config');
        }
        const isProjectKnowledgeSync = metadata.artifact?.type === 'project_knowledge_snapshot';
        const expectedOrganizationIndex = `${normalizeOssPrefix(config.oss.prefix)}/orgs/${expectedOrganization?.id}/index/projects.jsonl`;
        if (metadata.source_evidence?.run_id !== runId) {
            throw new Error('metadata.source_evidence.run_id must match --run-id');
        }
        if (metadata.index_refs?.organization_index !== expectedOrganizationIndex) {
            throw new Error('metadata.index_refs.organization_index must match resolved OSS target');
        }
        if (isProjectKnowledgeSync) {
            if (metadata.index_refs?.project_document_path !== projectDocumentsOssPath(config)) {
                throw new Error('metadata.index_refs.project_document_path must match resolved OSS target');
            }
        }
        else if (metadata.index_refs?.project_package_path !== ossPackagePath(config, runId)) {
            throw new Error('metadata.index_refs.project_package_path must match resolved OSS target');
        }
    }
    assertReleaseChannel(manifest.release?.channel, 'manifest.release.channel');
    assertReleaseGate(manifest.release?.gate, 'manifest.release.gate');
    if (manifest.release.channel === 'public' && manifest.release.gate !== 'passed') {
        throw new Error('public release requires release.gate: passed');
    }
    if (manifest.release.channel !== config.release.channel)
        throw new Error('manifest.release.channel must match .axis/config.yml');
    if (manifest.release.gate !== config.release.gate)
        throw new Error('manifest.release.gate must match .axis/config.yml');
    if (manifest.publish?.provider !== 'aliyun-oss')
        throw new Error('manifest.publish.provider must be aliyun-oss');
    assertPublishStatus(manifest.publish?.status);
    if (manifest.publish.bucket !== config.oss.bucket)
        throw new Error('manifest.publish.bucket must match resolved config');
    if (manifest.publish.prefix !== config.oss.prefix)
        throw new Error('manifest.publish.prefix must match resolved config');
    const expectedBaseUri = metadata.artifact?.type === 'project_knowledge_snapshot'
        ? projectDocumentsBaseUri(config)
        : baseUriFor(config, runId);
    if (manifest.publish.base_uri !== expectedBaseUri)
        throw new Error('manifest.publish.base_uri does not match configured OSS target');
    if (!Array.isArray(manifest.files) || manifest.files.length === 0)
        throw new Error('manifest.files is required');
    const manifestPaths = manifest.files.map((file) => file.path);
    if (manifestPaths.includes('manifest.json')) {
        throw new Error('manifest.files must not include manifest.json');
    }
    for (const filePath of manifestPaths) {
        const unsafe = unsafePathReason(filePath);
        if (unsafe)
            throw new Error(`refusing unsafe package path: ${unsafe}`);
        if (filePath.startsWith('../') || path.isAbsolute(filePath)) {
            throw new Error(`manifest file path must be relative: ${filePath}`);
        }
    }
    const localContentFiles = localFiles.filter((filePath) => filePath !== 'manifest.json');
    assertSameStringSet(localContentFiles, manifestPaths, 'manifest.files must match package content files');
    for (const entry of manifest.files) {
        const absolutePath = path.join(packageDir, entry.path);
        if (!existsSync(absolutePath))
            throw new Error(`manifest file missing: ${entry.path}`);
        const actual = await fileEntryFromRelative(packageDir, entry);
        if (actual.sha256 !== entry.sha256)
            throw new Error(`manifest checksum mismatch: ${entry.path}`);
        if (actual.bytes !== entry.bytes)
            throw new Error(`manifest byte count mismatch: ${entry.path}`);
    }
    if (metadata.public_safety?.reviewed !== true)
        throw new Error('metadata.public_safety.reviewed must be true');
    if (metadata.public_safety.contains_credentials !== false) {
        throw new Error('metadata.public_safety.contains_credentials must be false');
    }
    if (metadata.public_safety.contains_private_urls !== false) {
        throw new Error('metadata.public_safety.contains_private_urls must be false');
    }
    if (metadata.public_safety.validation?.status !== 'passed') {
        throw new Error('metadata.public_safety.validation.status must be passed');
    }
    if (manifest.public_safety_validation?.status !== 'passed') {
        throw new Error('manifest.public_safety_validation.status must be passed');
    }
    return { manifest, metadata };
}
async function redactMarkdownFiles(packageDir, manifest, mutate) {
    let redactions = 0;
    for (const entry of manifest.files ?? []) {
        if (!entry.path.endsWith('.md'))
            continue;
        const absolutePath = path.join(packageDir, entry.path);
        const original = await readFile(absolutePath, 'utf8');
        const redacted = redactSensitiveText(original);
        redactions += redacted.redactions;
        if (mutate && redacted.text !== original) {
            await writeFile(absolutePath, redacted.text, 'utf8');
        }
    }
    if (mutate && redactions > 0) {
        await persistManifest(packageDir, manifest, 'local_ready');
    }
    return redactions;
}
function readOssCredentials(config) {
    const envMap = {
        endpoint: config.oss.endpoint_env,
        region: config.oss.region_env,
        accessKeyId: config.oss.access_key_id_env,
        accessKeySecret: config.oss.access_key_secret_env,
        securityToken: config.oss.security_token_env,
    };
    const missing = [];
    const readEnv = (name, required) => {
        if (!name) {
            if (required)
                missing.push('(unconfigured)');
            return undefined;
        }
        const value = process.env[name];
        if (!value && required)
            missing.push(name);
        return value;
    };
    const credentials = {
        endpoint: readEnv(envMap.endpoint, true),
        region: readEnv(envMap.region, true),
        accessKeyId: readEnv(envMap.accessKeyId, true),
        accessKeySecret: readEnv(envMap.accessKeySecret, true),
        securityToken: readEnv(envMap.securityToken, false),
    };
    if (missing.length > 0) {
        throw new Error(`missing required OSS environment variables: ${missing.join(', ')}`);
    }
    return credentials;
}
class LocalMockOssStorage {
    root;
    bucket;
    constructor(root, bucket) {
        this.root = root;
        this.bucket = bucket;
    }
    objectPath(key) {
        return path.join(this.root, this.bucket, ...key.split('/'));
    }
    async headObject(key) {
        const objectPath = this.objectPath(key);
        if (!existsSync(objectPath))
            return null;
        const sidecarPath = `${objectPath}.sha256`;
        if (existsSync(sidecarPath)) {
            return { sha256: (await readFile(sidecarPath, 'utf8')).trim() || null };
        }
        return {
            sha256: createHash('sha256').update(await readFile(objectPath)).digest('hex'),
        };
    }
    async putObject(key, filePath, metadata) {
        const objectPath = this.objectPath(key);
        await mkdir(path.dirname(objectPath), { recursive: true });
        await writeFile(objectPath, await readFile(filePath));
        await writeFile(`${objectPath}.sha256`, `${metadata.sha256}\n`, 'utf8');
    }
}
class AliyunOssStorage {
    client;
    constructor(config, credentials) {
        const require = createRequire(import.meta.url);
        const OSS = require('ali-oss');
        this.client = new OSS({
            region: credentials.region,
            endpoint: credentials.endpoint,
            accessKeyId: credentials.accessKeyId,
            accessKeySecret: credentials.accessKeySecret,
            stsToken: credentials.securityToken,
            bucket: config.oss.bucket,
        });
    }
    async headObject(key) {
        try {
            const result = await this.client.head(key);
            return { sha256: result.meta?.sha256 ?? null };
        }
        catch (error) {
            if (isNotFoundError(error))
                return null;
            throw error;
        }
    }
    async putObject(key, filePath, metadata) {
        await this.client.put(key, filePath, {
            meta: {
                sha256: metadata.sha256,
            },
        });
    }
}
function isNotFoundError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const maybe = error;
    return maybe.status === 404 || maybe.code === 'NoSuchKey' || maybe.name === 'NoSuchKeyError';
}
function storageAdapter(config, credentials) {
    const mockRoot = process.env.AXIS_OSS_MOCK_DIR;
    if (mockRoot) {
        return new LocalMockOssStorage(path.resolve(mockRoot), config.oss.bucket);
    }
    return new AliyunOssStorage(config, credentials);
}
function mediaTypeForPath(filePath, fallback) {
    if (fallback)
        return fallback;
    if (filePath.endsWith('.json'))
        return 'application/json';
    if (filePath.endsWith('.md'))
        return 'text/markdown';
    return 'application/octet-stream';
}
async function buildPublishFiles(packageDir, manifest, config, runId, assetType) {
    const bucket = config.oss.bucket;
    const files = [];
    for (const entry of manifest.files ?? []) {
        const absolutePath = path.join(packageDir, entry.path);
        const content = await readFile(absolutePath);
        const stats = await stat(absolutePath);
        const objectKey = objectKeyForPublish(config, runId, entry.path, assetType);
        files.push({
            path: entry.path,
            absolutePath,
            media_type: mediaTypeForPath(entry.path, entry.media_type),
            sha256: createHash('sha256').update(content).digest('hex'),
            bytes: stats.size,
            object_key: objectKey,
            target_uri: ossUri(bucket, objectKey),
        });
    }
    const manifestPath = path.join(packageDir, 'manifest.json');
    const manifestContent = await readFile(manifestPath);
    const manifestStats = await stat(manifestPath);
    const manifestObjectKey = objectKeyForPublish(config, runId, 'manifest.json', assetType);
    files.push({
        path: 'manifest.json',
        absolutePath: manifestPath,
        media_type: 'application/json',
        sha256: createHash('sha256').update(manifestContent).digest('hex'),
        bytes: manifestStats.size,
        object_key: manifestObjectKey,
        target_uri: ossUri(bucket, manifestObjectKey),
    });
    return files.sort((left, right) => {
        if (left.path === 'manifest.json')
            return 1;
        if (right.path === 'manifest.json')
            return -1;
        return left.path.localeCompare(right.path);
    });
}
async function uploadPublishFiles(adapter, files, allowOverwrite) {
    const uploaded = [];
    for (const file of files) {
        const existing = await adapter.headObject(file.object_key);
        if (existing) {
            if (existing.sha256 !== file.sha256) {
                if (!allowOverwrite)
                    throw new Error(`remote object differs: ${file.object_key}`);
                await adapter.putObject(file.object_key, file.absolutePath, { sha256: file.sha256 });
                uploaded.push({ ...file, status: 'updated' });
                continue;
            }
            uploaded.push({ ...file, status: 'already_present' });
            continue;
        }
        await adapter.putObject(file.object_key, file.absolutePath, { sha256: file.sha256 });
        uploaded.push({ ...file, status: 'uploaded' });
    }
    return uploaded;
}
function publishSummary(mode, uploaded, metadata, manifest, files, redactions) {
    return {
        ok: true,
        mode,
        uploaded,
        organization: manifest.organization,
        project: {
            slug: manifest.project?.slug,
            display_name: manifest.project?.display_name,
        },
        oss_profile: manifest.oss_profile,
        asset_type: metadata.artifact?.type,
        run_id: manifest.run?.run_id,
        release: {
            channel: manifest.release?.channel,
            gate: manifest.release?.gate,
        },
        publish: {
            status: manifest.publish?.status,
            bucket: manifest.publish?.bucket,
            prefix: manifest.publish?.prefix,
            base_uri: manifest.publish?.base_uri,
        },
        target_prefix: manifest.publish?.base_uri,
        files: files.map((file) => ({
            path: file.path,
            media_type: file.media_type,
            bytes: file.bytes,
            sha256: file.sha256,
            target_uri: file.target_uri,
            status: file.status,
        })),
        upload_order: files.map((file) => ({
            path: file.path,
            target_uri: file.target_uri,
            status: file.status,
        })),
        redactions,
    };
}
async function ossPublishCommand() {
    const repo = repoArg();
    const runId = requireArg('--run-id');
    if (!/^\d{8}T\d{6}Z-[a-z0-9-]+-[a-f0-9]{8}$/.test(runId)) {
        throw new Error('--run-id must match YYYYMMDDThhmmssZ-name-8hex');
    }
    const { config: rawConfig, localDryRun, localOssEnvOverrides } = await readPublishConfig(repo);
    const { errors, effectiveConfig: config } = await resolveAxisConfig(repo, rawConfig, { localOssEnvOverrides });
    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
    if (!config)
        throw new Error('Unable to resolve Axis config');
    const dryRun = hasFlag('--dry-run') || localDryRun;
    const localOnly = hasFlag('--local-only');
    if (dryRun && localOnly)
        throw new Error('--dry-run and --local-only cannot be combined');
    const mode = dryRun ? 'dry_run' : localOnly ? 'local_only' : 'upload';
    const packageDir = packageDirFor(repo, config, runId);
    if (!existsSync(packageDir)) {
        throw new Error(`outbox run not found: ${relativeToRepo(repo, packageDir)}`);
    }
    const localFiles = await collectPackageRelativePaths(packageDir);
    const { manifest, metadata } = await validatePackageManifest(repo, packageDir, runId, config, localFiles);
    const redactions = await redactMarkdownFiles(packageDir, manifest, mode !== 'dry_run');
    if (mode !== 'dry_run') {
        await persistManifest(packageDir, manifest, manifest.publish?.status);
    }
    const assetType = metadata.artifact?.type;
    const projectDocumentSync = assetType === 'project_knowledge_snapshot';
    const plannedFiles = await buildPublishFiles(packageDir, manifest, config, runId, assetType);
    if (mode === 'dry_run' || mode === 'local_only') {
        console.log(JSON.stringify(publishSummary(mode, false, metadata, manifest, plannedFiles, redactions), null, 2));
        return;
    }
    const credentials = readOssCredentials(config);
    const adapter = storageAdapter(config, credentials);
    try {
        await persistManifest(packageDir, manifest, 'uploading');
        const uploadFiles = await buildPublishFiles(packageDir, manifest, config, runId, assetType);
        const manifestUploadFile = uploadFiles.find((file) => file.path === 'manifest.json');
        if (!manifestUploadFile)
            throw new Error('manifest.json is required');
        const contentUploadFiles = uploadFiles.filter((file) => file.path !== 'manifest.json');
        const uploadedFiles = await uploadPublishFiles(adapter, contentUploadFiles, projectDocumentSync);
        await persistManifest(packageDir, manifest, 'published');
        const finalFiles = await buildPublishFiles(packageDir, manifest, config, runId, assetType);
        const finalManifestUploadFile = finalFiles.find((file) => file.path === 'manifest.json');
        if (!finalManifestUploadFile)
            throw new Error('manifest.json is required');
        const manifestUploadedFiles = await uploadPublishFiles(adapter, [finalManifestUploadFile], projectDocumentSync);
        const statuses = new Map([...uploadedFiles, ...manifestUploadedFiles].map((file) => [file.path, file.status]));
        console.log(JSON.stringify(publishSummary(mode, true, metadata, manifest, finalFiles.map((file) => ({ ...file, status: statuses.get(file.path) ?? 'uploaded' })), redactions), null, 2));
    }
    catch (error) {
        await persistManifest(packageDir, manifest, 'failed');
        throw new Error(error instanceof Error ? error.message : String(error));
    }
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
function agentSkillRoot(agent) {
    if (agent === 'codex') {
        return path.join(process.env.CODEX_HOME || path.join(homeDir(), '.codex'), 'skills');
    }
    return path.join(homeDir(), '.claude', 'skills');
}
function agentSkillDir(agent, skillName) {
    return path.join(agentSkillRoot(agent), skillName);
}
async function packagedSkillNames() {
    const root = skillsRoot();
    const entries = await readdir(root, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (existsSync(path.join(root, entry.name, 'SKILL.md'))) {
            if (!packagedSkillNamePattern.test(entry.name)) {
                throw new Error(`Packaged skill must use an approved axis-{category}-<action> prefix, including axis-tools- for meta-tools: ${entry.name}`);
            }
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
async function lstatIfExists(target) {
    try {
        return await lstat(target);
    }
    catch (error) {
        const fsError = error;
        if (fsError.code === 'ENOENT')
            return null;
        throw error;
    }
}
async function directoryFingerprint(root) {
    const hash = createHash('sha256');
    const files = await collectRelativeFiles(root);
    for (const file of files) {
        hash.update(file);
        hash.update('\0');
        hash.update(await readFile(path.join(root, file)));
        hash.update('\0');
    }
    return hash.digest('hex');
}
async function directoriesIdentical(sourceDir, targetDir) {
    const targetStats = await lstatIfExists(targetDir);
    if (!targetStats || targetStats.isSymbolicLink())
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
async function inventorySkillBundle(skillName, agent, sourceDir, targetDir, force) {
    const targetStats = await lstatIfExists(targetDir);
    const exists = targetStats !== null;
    const identical = exists && !targetStats.isSymbolicLink() && await directoriesIdentical(sourceDir, targetDir);
    const source_sha256 = await directoryFingerprint(sourceDir);
    const target_sha256 = exists && !targetStats.isSymbolicLink() && targetStats.isDirectory()
        ? await directoryFingerprint(targetDir)
        : null;
    let action = 'copy';
    let reason;
    if (identical) {
        action = 'skip';
        reason = 'target is identical';
    }
    else if (exists && force) {
        action = 'replace';
        reason = 'force requested and backup will be created before replacement';
    }
    else if (exists) {
        action = 'block';
        reason = 'target exists and differs from packaged bundle';
    }
    return {
        skill: skillName,
        agent,
        source: sourceDir,
        target: targetDir,
        target_root: agentSkillRoot(agent),
        exists,
        identical,
        action,
        source_sha256,
        target_sha256,
        ...(reason ? { reason } : {}),
    };
}
async function inventoryRetiredSkillBundle(retiredName, replacementName, agent, force) {
    const targetDir = agentSkillDir(agent, retiredName);
    const targetStats = await lstatIfExists(targetDir);
    if (!targetStats)
        return null;
    const sourceDir = path.join(skillsRoot(), replacementName);
    const targetSha256 = !targetStats.isSymbolicLink() && targetStats.isDirectory()
        ? await directoryFingerprint(targetDir)
        : null;
    return {
        skill: retiredName,
        agent,
        source: sourceDir,
        target: targetDir,
        target_root: agentSkillRoot(agent),
        exists: true,
        identical: false,
        action: force ? 'retire' : 'block',
        source_sha256: await directoryFingerprint(sourceDir),
        target_sha256: targetSha256,
        renamed_to: replacementName,
        reason: force
            ? `retired skill will be backed up and removed; use ${replacementName}`
            : `retired skill exists; re-run with --force to back it up and remove it, then use ${replacementName}`,
    };
}
function timestampForPath(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function backupManifestPath(backupDirOrManifest) {
    return path.basename(backupDirOrManifest) === 'manifest.json'
        ? backupDirOrManifest
        : path.join(backupDirOrManifest, 'manifest.json');
}
function backupRoot() {
    const provided = getArg('--backup-dir');
    if (provided)
        return path.resolve(provided);
    return path.join(homeDir(), '.axis', 'backups', 'axis-tools', timestampForPath());
}
function createBackupSession() {
    return {
        version: 1,
        created_at: new Date().toISOString(),
        dir: backupRoot(),
        entries: [],
    };
}
async function persistBackupManifest(session) {
    await mkdir(session.dir, { recursive: true });
    const manifest = {
        version: 1,
        created_at: session.created_at,
        entries: session.entries,
    };
    await writeJsonFile(path.join(session.dir, 'manifest.json'), manifest);
}
async function backupExistingTarget(target, session) {
    const targetStats = await lstatIfExists(target);
    if (!targetStats) {
        session.entries.push({ target, backup_path: null, type: 'missing' });
        await persistBackupManifest(session);
        return;
    }
    await mkdir(session.dir, { recursive: true });
    const backupPath = path.join(session.dir, `${String(session.entries.length).padStart(3, '0')}-${path.basename(target)}`);
    if (targetStats.isSymbolicLink()) {
        session.entries.push({
            target,
            backup_path: null,
            type: 'symlink',
            symlink_target: await readlink(target),
        });
    }
    else if (targetStats.isDirectory()) {
        await cp(target, backupPath, { recursive: true });
        session.entries.push({ target, backup_path: backupPath, type: 'directory' });
    }
    else {
        await cp(target, backupPath);
        session.entries.push({ target, backup_path: backupPath, type: 'file' });
    }
    await persistBackupManifest(session);
}
async function restoreBackupEntry(entry) {
    await mkdir(path.dirname(entry.target), { recursive: true });
    await rm(entry.target, { recursive: true, force: true });
    if (entry.type === 'missing')
        return;
    if (entry.type === 'symlink') {
        if (!entry.symlink_target)
            throw new Error(`Backup entry missing symlink target for ${entry.target}`);
        await symlink(entry.symlink_target, entry.target);
        return;
    }
    if (!entry.backup_path)
        throw new Error(`Backup entry missing backup path for ${entry.target}`);
    await cp(entry.backup_path, entry.target, { recursive: entry.type === 'directory' });
}
async function rollbackBackupEntries(entries) {
    const restored = [];
    for (const entry of [...entries].reverse()) {
        await restoreBackupEntry(entry);
        restored.push(entry);
    }
    return restored;
}
async function copySkillBundle(skillName, sourceDir, targetDir, inventory, backupSession) {
    await mkdir(path.dirname(targetDir), { recursive: true });
    if (inventory.action === 'skip')
        return 'identical';
    if (inventory.action === 'block') {
        throw new Error(`Refusing to overwrite modified skill directory at ${targetDir}. Re-run with --force to replace it.`);
    }
    const tempTarget = path.join(path.dirname(targetDir), `.axis-install-${path.basename(targetDir)}-${randomBytes(4).toString('hex')}`);
    try {
        if (inventory.action === 'copy' || inventory.action === 'replace') {
            await backupExistingTarget(targetDir, backupSession);
            if (process.env.AXIS_INSTALL_FAIL_AFTER_BACKUP === skillName) {
                throw new Error(`Simulated install failure after backup for ${skillName}`);
            }
        }
        await cp(sourceDir, tempTarget, { recursive: true });
        await rm(targetDir, { recursive: true, force: true });
        await rename(tempTarget, targetDir);
    }
    catch (error) {
        await rm(tempTarget, { recursive: true, force: true });
        throw error;
    }
    return 'copied';
}
async function retireSkillBundle(inventory, backupSession) {
    if (inventory.action === 'block') {
        throw new Error(`Refusing to remove retired skill directory at ${inventory.target}. ` +
            `Re-run with --force to back it up and retire it; use ${inventory.renamed_to}.`);
    }
    if (inventory.action !== 'retire') {
        throw new Error(`Invalid retired skill action for ${inventory.skill}: ${inventory.action}`);
    }
    await backupExistingTarget(inventory.target, backupSession);
    if (process.env.AXIS_INSTALL_FAIL_AFTER_BACKUP === inventory.skill) {
        throw new Error(`Simulated install failure after backup for ${inventory.skill}`);
    }
    await rm(inventory.target, { recursive: true, force: true });
    return 'retired';
}
async function buildInstallInventory(agent, force, requestedSkills = []) {
    const packagedNames = await packagedSkillNames();
    if (packagedNames.length === 0) {
        throw new Error(`No packaged skills found under ${skillsRoot()}`);
    }
    const requestedNames = [...new Set(requestedSkills)];
    for (const requestedName of requestedNames) {
        const replacement = retiredPackagedSkills.get(requestedName);
        if (replacement) {
            throw new Error(`Packaged skill ${requestedName} was renamed to ${replacement}; request the new name explicitly.`);
        }
        if (!packagedNames.includes(requestedName)) {
            throw new Error(`Unknown packaged skill: ${requestedName}`);
        }
    }
    const names = requestedNames.length > 0 ? requestedNames.sort() : packagedNames;
    const inventory = [];
    for (const skillName of names) {
        const source = path.join(skillsRoot(), skillName);
        for (const selectedAgent of selectedAgents(agent)) {
            const target = agentSkillDir(selectedAgent, skillName);
            inventory.push(await inventorySkillBundle(skillName, selectedAgent, source, target, force));
        }
    }
    for (const [retiredName, replacementName] of retiredPackagedSkills) {
        if (!names.includes(replacementName))
            continue;
        for (const selectedAgent of selectedAgents(agent)) {
            const retired = await inventoryRetiredSkillBundle(retiredName, replacementName, selectedAgent, force);
            if (retired)
                inventory.push(retired);
        }
    }
    return inventory;
}
function dryRunStatusFor(action) {
    if (action === 'skip')
        return 'identical';
    if (action === 'replace')
        return 'would_replace';
    if (action === 'retire')
        return 'would_retire';
    if (action === 'block')
        return 'blocked';
    return 'would_copy';
}
async function installPackagedSkills(agent, force, dryRun, requestedSkills = []) {
    const inventory = await buildInstallInventory(agent, force, requestedSkills);
    if (dryRun) {
        return {
            inventory,
            installed: inventory.map((item) => ({
                skill: item.skill,
                agent: item.agent,
                target: item.target,
                status: dryRunStatusFor(item.action),
            })),
            backup_dir: null,
        };
    }
    const blocked = inventory.find((item) => item.action === 'block');
    if (blocked) {
        if (blocked.renamed_to) {
            throw new Error(`Refusing to remove retired skill directory at ${blocked.target}. ` +
                `Re-run with --force to back it up and retire it; use ${blocked.renamed_to}.`);
        }
        throw new Error(`Refusing to overwrite modified skill directory at ${blocked.target}. Re-run with --force to replace it.`);
    }
    const backupSession = createBackupSession();
    const installed = [];
    try {
        for (const item of inventory) {
            const status = item.action === 'retire'
                ? await retireSkillBundle(item, backupSession)
                : await copySkillBundle(item.skill, item.source, item.target, item, backupSession);
            installed.push({
                skill: item.skill,
                agent: item.agent,
                target: item.target,
                status,
            });
        }
    }
    catch (error) {
        await rollbackBackupEntries(backupSession.entries);
        throw error;
    }
    if (backupSession.entries.length > 0) {
        await persistBackupManifest(backupSession);
    }
    return {
        inventory,
        installed,
        backup_dir: backupSession.entries.length > 0 ? backupSession.dir : null,
    };
}
async function installCommand() {
    const rollbackTarget = getArg('--rollback');
    if (rollbackTarget) {
        await rollbackCommand(path.resolve(rollbackTarget));
        return;
    }
    const agent = parseInstallAgentArg(getArg('--agent'));
    const dryRun = hasFlag('--dry-run');
    const force = hasFlag('--force');
    const requestedSkills = getArgs('--skill');
    const result = await installPackagedSkills(agent, force, dryRun, requestedSkills);
    console.log(JSON.stringify({ ok: true, agent, skills: requestedSkills, dry_run: dryRun, force, ...result }, null, 2));
}
async function inventoryCommand() {
    const agent = parseInstallAgentArg(getArg('--agent'));
    const requestedSkills = getArgs('--skill');
    const inventory = await buildInstallInventory(agent, hasFlag('--force'), requestedSkills);
    console.log(JSON.stringify({ ok: true, agent, skills: requestedSkills, inventory }, null, 2));
}
async function rollbackCommand(backupDirOrManifest) {
    const manifestPath = backupManifestPath(backupDirOrManifest);
    const manifest = await readJsonFile(manifestPath);
    if (manifest.version !== 1 || !Array.isArray(manifest.entries)) {
        throw new Error(`Invalid backup manifest: ${manifestPath}`);
    }
    const restored = await rollbackBackupEntries(manifest.entries);
    console.log(JSON.stringify({
        ok: true,
        rollback: {
            manifest: manifestPath,
            restored,
        },
    }, null, 2));
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
    if (command === 'inventory') {
        if (isHelpFlag(process.argv[3])) {
            printUsage();
            return;
        }
        await inventoryCommand();
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
    if (command === 'project-knowledge-capture') {
        await projectKnowledgeCaptureCommand();
        return;
    }
    if (command === 'oss-publish') {
        await ossPublishCommand();
        return;
    }
    printUsage();
    process.exitCode = 1;
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
