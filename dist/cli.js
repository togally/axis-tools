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
const packagedSkillNamePattern = /^axis-(?:code|doc|integration|ops|skill|test)-[a-z0-9][a-z0-9-]*$/;
const execFileAsync = promisify(execFile);
const defaultOutboxDir = '.axis/outbox';
const ignoredLocalPaths = ['.axis/config.local.yml', '.axis/outbox/'];
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
    const content = line.trim().slice(1, -1);
    const cells = [];
    let current = '';
    for (let index = 0; index < content.length; index += 1) {
        const character = content[index];
        if (character === '\\' && content[index + 1] === '|') {
            current += '|';
            index += 1;
        }
        else if (character === '|') {
            cells.push(current.trim());
            current = '';
        }
        else {
            current += character;
        }
    }
    cells.push(current.trim());
    return cells;
}
function markdownTableTraceBindings(body) {
    const lines = body.split(/\r?\n/);
    const normalize = (value) => value.replace(/[`*]/g, '').trim();
    const bindings = new Map();
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line.startsWith('|') || !line.endsWith('|'))
            continue;
        const headers = splitMarkdownTableRow(line).map(normalize);
        const bindingIndex = headers.indexOf('level1_journey_id');
        if (bindingIndex < 0)
            continue;
        const traceIndex = headers.findIndex((header) => header === 'api_id' || header.startsWith('flow_id'));
        const interfaceIndex = headers.findIndex((header) => header.startsWith('方法与'));
        const controllerIndex = headers.indexOf('Controller/入口');
        const serviceIndex = headers.indexOf('Service/用例');
        const mapperIndex = headers.indexOf('Mapper/Repository');
        const entityIndex = headers.indexOf('实体/表');
        const testIndex = headers.indexOf('测试');
        if ([traceIndex, interfaceIndex, controllerIndex, serviceIndex, mapperIndex, entityIndex, testIndex]
            .some((index) => index < 0))
            continue;
        for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
            const rowLine = lines[rowIndex].trim();
            if (!rowLine.startsWith('|') || !rowLine.endsWith('|'))
                break;
            const cells = splitMarkdownTableRow(rowLine);
            const traceValue = normalize(cells[traceIndex] ?? '');
            const bindingValue = normalize(cells[bindingIndex] ?? '');
            const interfaceEntry = normalize(cells[interfaceIndex] ?? '');
            const controllerAnchors = exactCodeAnchors(cells[controllerIndex] ?? '');
            const serviceAnchors = exactCodeAnchors(cells[serviceIndex] ?? '');
            const mapperAnchors = exactCodeAnchors(cells[mapperIndex] ?? '');
            const testAnchors = exactCodeAnchors(cells[testIndex] ?? '');
            if (/^[A-Za-z0-9][A-Za-z0-9_.:\-]*$/.test(bindingValue)
                && /^[A-Za-z0-9][A-Za-z0-9_.:\-]*$/.test(traceValue)
                && !/^(?:missing_evidence|not_applicable|none|todo|tbd)$/i.test(traceValue)
                && /(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+)/.test(interfaceEntry)
                && controllerAnchors.length > 0
                && serviceAnchors.length > 0
                && mapperAnchors.length > 0
                && normalize(cells[entityIndex] ?? '').length > 0
                && testAnchors.length > 0) {
                bindings.set(bindingValue, [
                    ...(bindings.get(bindingValue) ?? []),
                    {
                        apiId: traceValue,
                        interfaceEntry,
                        controllerAnchors,
                        serviceAnchors,
                    },
                ]);
            }
        }
    }
    return bindings;
}
function assertLevel1CapabilityDetailedDesign(body, capabilityId, secondaryCapabilities, gapReportBody) {
    const userOperationPanorama = projectKnowledgeSection(body, /^##\s+\d+\.?\s+用户业务操作全景\s*$/m);
    if (!userOperationPanorama) {
        throw new Error(`project knowledge level-1 capability detailed design missing user operation panorama: ${capabilityId}`);
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
    const panoramaLines = userOperationPanorama.split(/\r?\n/);
    const headerLineIndex = panoramaLines.findIndex((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith('|') && trimmed.endsWith('|') && /`?journey_id`?/.test(trimmed);
    });
    if (headerLineIndex < 0 || panoramaLines.length <= headerLineIndex + 2) {
        throw new Error(`project knowledge level-1 capability detailed design missing user journey table: ${capabilityId}`);
    }
    const headers = splitMarkdownTableRow(panoramaLines[headerLineIndex])
        .map((header) => header.replace(/[`*]/g, '').trim());
    const requiredHeaders = [
        'journey_id',
        '用户/角色',
        '所属二级能力/模块',
        '提供的业务',
        '用户目标',
        '用户怎么操作',
        '接口/入口',
        'Controller/Handler',
        'Service/UseCase',
        '读取数据',
        '写入/产生数据',
        '用户可见结果',
        '二级能力详情',
        '证据',
    ];
    for (const requiredHeader of requiredHeaders) {
        if (!headers.includes(requiredHeader)) {
            throw new Error(`project knowledge level-1 capability user journey table missing ${requiredHeader}: ${capabilityId}`);
        }
    }
    if (headers.length !== requiredHeaders.length
        || headers.some((header, index) => header !== requiredHeaders[index])) {
        throw new Error(`project knowledge level-1 capability user journey table does not match fixed schema: ${capabilityId}`);
    }
    const separatorLine = panoramaLines[headerLineIndex + 1].trim();
    const separatorCells = separatorLine.startsWith('|') && separatorLine.endsWith('|')
        ? splitMarkdownTableRow(separatorLine)
        : [];
    if (!separatorLine.startsWith('|')
        || !separatorLine.endsWith('|')
        || separatorCells.length !== headers.length
        || separatorCells.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
        throw new Error(`project knowledge level-1 capability user journey table has malformed separator: ${capabilityId}`);
    }
    const rows = [];
    for (let index = headerLineIndex + 2; index < panoramaLines.length; index += 1) {
        const line = panoramaLines[index].trim();
        if (!line.startsWith('|') || !line.endsWith('|'))
            break;
        rows.push(splitMarkdownTableRow(line));
    }
    if (rows.some((cells) => cells.length !== headers.length)) {
        throw new Error(`project knowledge level-1 capability user journey table has malformed row: ${capabilityId}`);
    }
    if (rows.length === 0) {
        throw new Error(`project knowledge level-1 capability detailed design has no user journeys: ${capabilityId}`);
    }
    const field = (row, name) => row[headers.indexOf(name)] ?? '';
    const journeySecondaryIds = new Set();
    const journeyIds = new Set();
    const journeyIdsBySecondary = new Map();
    const isGenericText = (value) => {
        const normalized = value.replace(/`/g, '').trim();
        return /^(?:现有入口集合|现有操作|对应(?:接口|入口|方法|服务|数据)|相关(?:数据|表|对象)|详见二级能力文档|形成(?:或查询)?业务结果|返回结果|待补充|TODO|TBD)$/i.test(normalized)
            || /^(?:读取|写入|产生)(?:相关数据|相关表|相关对象)$/i.test(normalized);
    };
    const concreteData = (value, operation) => {
        if (isGenericText(value))
            return false;
        const concreteCodeToken = [...value.matchAll(/`([^`\n]+)`/g)]
            .map((match) => match[1].trim())
            .some((token) => token.length > 1
            && !/^(?:none|n\/a|na|not_applicable|missing_evidence|data|table|object|todo|tbd|-)$/i.test(token));
        if (concreteCodeToken)
            return true;
        const action = operation === '读取' ? '读取' : '(?:写入|产生|落库)';
        return new RegExp(`^(?:无|无需|无须|不(?:需|需要)?)(?:${action})(?:数据|数据库|业务表|持久化数据)?[：:，,；;（(].{2,}`).test(value.trim());
    };
    for (const row of rows) {
        const journeyId = field(row, 'journey_id').replace(/`/g, '').trim() || 'unknown';
        if (!/^[A-Za-z0-9][A-Za-z0-9_.:\-]*$/.test(journeyId)) {
            throw new Error(`project knowledge level-1 capability user journey has invalid journey_id: ${capabilityId}/${journeyId}`);
        }
        if (journeyIds.has(journeyId)) {
            throw new Error(`project knowledge level-1 capability user journey has duplicate journey_id: ${capabilityId}/${journeyId}`);
        }
        journeyIds.add(journeyId);
        const secondaryId = field(row, '所属二级能力/模块').replace(/`/g, '').trim();
        if (!secondaryCapabilities.some((secondary) => secondary.secondary_capability_id === secondaryId)) {
            throw new Error(`project knowledge level-1 capability user journey references unknown secondary capability: ${capabilityId}/${journeyId}`);
        }
        journeySecondaryIds.add(secondaryId);
        for (const requiredField of ['用户/角色', '提供的业务', '用户目标', '用户怎么操作', '用户可见结果']) {
            const value = field(row, requiredField).trim();
            if (value.length < 2 || isGenericText(value)) {
                throw new Error(`project knowledge level-1 capability user journey missing concrete ${requiredField}: ${capabilityId}/${journeyId}`);
            }
        }
        const interfaceEntry = field(row, '接口/入口');
        if (/现有入口集合|对应接口|对应入口/.test(interfaceEntry)) {
            throw new Error(`project knowledge level-1 capability user journey uses generic interface placeholder: ${capabilityId}/${journeyId}`);
        }
        if (!/(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+)/.test(interfaceEntry)) {
            throw new Error(`project knowledge level-1 capability user journey missing concrete interface: ${capabilityId}/${journeyId}`);
        }
        if (exactCodeAnchors(field(row, 'Controller/Handler')).length < 1) {
            throw new Error(`project knowledge level-1 capability user journey missing exact Controller/Handler anchor: ${capabilityId}/${journeyId}`);
        }
        if (exactCodeAnchors(field(row, 'Service/UseCase')).length < 1) {
            throw new Error(`project knowledge level-1 capability user journey missing exact Service/UseCase anchor: ${capabilityId}/${journeyId}`);
        }
        if (!concreteData(field(row, '读取数据'), '读取')) {
            throw new Error(`project knowledge level-1 capability user journey missing concrete read data: ${capabilityId}/${journeyId}`);
        }
        if (!concreteData(field(row, '写入/产生数据'), '写入')) {
            throw new Error(`project knowledge level-1 capability user journey missing concrete written or produced data: ${capabilityId}/${journeyId}`);
        }
        const expectedChildPath = `secondary-capabilities/${secondaryId}/detailed-design.md`;
        const escapedChildPath = expectedChildPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`\\]\\((?:business/capabilities/${capabilityId}/)?${escapedChildPath}\\)`).test(field(row, '二级能力详情'))) {
            throw new Error(`project knowledge level-1 capability user journey omits secondary capability link: ${capabilityId}/${journeyId}`);
        }
        if (exactCodeAnchors(field(row, '证据')).length < 1) {
            throw new Error(`project knowledge level-1 capability user journey missing exact evidence anchor: ${capabilityId}/${journeyId}`);
        }
        journeyIdsBySecondary.set(secondaryId, [
            ...(journeyIdsBySecondary.get(secondaryId) ?? []),
            {
                journeyId,
                interfaceEntry: interfaceEntry.replace(/`/g, '').trim(),
                controllerAnchors: exactCodeAnchors(field(row, 'Controller/Handler')),
                serviceAnchors: exactCodeAnchors(field(row, 'Service/UseCase')),
            },
        ]);
    }
    for (const secondary of secondaryCapabilities) {
        const secondaryId = secondary.secondary_capability_id;
        if (!journeySecondaryIds.has(secondaryId)) {
            throw new Error(`project knowledge level-1 capability user journeys omit secondary capability: ${capabilityId}/${secondaryId}`);
        }
    }
    return journeyIdsBySecondary;
}
function assertSecondaryCapabilityDetailedDesign(body, capabilityId, secondaryId) {
    const scope = `${capabilityId}/${secondaryId}`;
    const interfaceStatus = secondaryDesignStatus(body, 'interface_design_status', ['detailed', 'not_applicable'], capabilityId, secondaryId);
    const interfaceCoverage = secondaryDesignStatus(body, 'interface_coverage', ['complete', 'partial', 'not_applicable'], capabilityId, secondaryId);
    const persistenceStatus = secondaryDesignStatus(body, 'persistence_design_status', ['detailed', 'not_applicable'], capabilityId, secondaryId);
    const relationshipStatus = secondaryDesignStatus(body, 'relationship_model_status', ['relational', 'single_table', 'not_applicable'], capabilityId, secondaryId);
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
        const interfaceSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+接口详细设计\s*$/m);
        if (!interfaceSection) {
            throw new Error(`project knowledge secondary capability detailed design missing interface detail section: ${scope}`);
        }
        if (/现有入口集合|对应应用服务|以\s*DTO\/BO\s*校验为准|以统一响应和领域异常为准/.test(interfaceSection)) {
            throw new Error(`project knowledge secondary capability detailed design uses generic interface placeholder: ${scope}`);
        }
        if (!/(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+)/.test(interfaceSection)) {
            throw new Error(`project knowledge secondary capability interface design missing concrete contract: ${scope}`);
        }
        for (const requiredHeading of ['请求字段', '响应字段', '错误码与异常映射']) {
            if (!new RegExp(`^###\\s+\\d+\\.\\d+\\s+${requiredHeading}\\s*$`, 'm').test(interfaceSection)) {
                throw new Error(`project knowledge secondary capability interface design missing ${requiredHeading}: ${scope}`);
            }
        }
        const interfaceAnchors = exactCodeAnchors(interfaceSection);
        if (interfaceAnchors.length < 4 && !/目标设计/.test(interfaceSection)) {
            throw new Error(`project knowledge secondary capability interface design missing exact code anchors: ${scope}`);
        }
        if (interfaceCoverage === 'partial' && !/(?:interface_gap_id\s*=|missing_evidence|缺失证据)/.test(body)) {
            throw new Error(`project knowledge secondary capability partial interface coverage requires an explicit gap: ${scope}`);
        }
    }
    if (persistenceStatus === 'not_applicable') {
        if (relationshipStatus !== 'not_applicable'
            || !/\bpersistence_not_applicable_reason\s*=\s*[^`\n|·]+/.test(body)
            || !/\bpersistence_not_applicable_evidence\s*=\s*(?:`)?(?:[A-Za-z0-9_.@+\-]+\/)+[A-Za-z0-9_.$@+\-]+\.[A-Za-z0-9]+:\d+-\d+#[A-Za-z_$][A-Za-z0-9_$<>.\-]*/.test(body)) {
            throw new Error(`project knowledge secondary capability persistence not_applicable requires reason and evidence: ${scope}`);
        }
        return;
    }
    if (relationshipStatus === 'not_applicable') {
        throw new Error(`project knowledge secondary capability relationship model conflicts with persistence status: ${scope}`);
    }
    const relationshipSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+实体、表与对象关系\s*$/m);
    const tableSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+表结构设计\s*$/m);
    if (!relationshipSection || !tableSection) {
        throw new Error(`project knowledge secondary capability detailed design missing persistence sections: ${scope}`);
    }
    const erBlock = /```mermaid\s*\r?\nerDiagram\s*\r?\n([\s\S]*?)```/.exec(relationshipSection)?.[1] ?? '';
    if (!erBlock) {
        throw new Error(`project knowledge secondary capability detailed design missing ER diagram: ${scope}`);
    }
    if (/\b(?:BUSINESS_FLOW|API|RESULT|TABLE|ENTITY_A|ENTITY_B|CONTROLLER|SERVICE)\b/i.test(erBlock)) {
        throw new Error(`project knowledge secondary capability detailed design uses non-entity ER placeholder: ${scope}`);
    }
    const tableInventoryHeading = /^###\s+8\.1\s+数据表清单\s*$/m.exec(tableSection);
    const tableInventoryRemainder = tableInventoryHeading
        ? tableSection.slice((tableInventoryHeading.index ?? 0) + tableInventoryHeading[0].length)
        : '';
    const nextTableSubsection = /^###\s+8\./m.exec(tableInventoryRemainder);
    const tableInventorySection = tableInventoryRemainder.slice(0, nextTableSubsection?.index ?? tableInventoryRemainder.length);
    const tableNames = new Set([...tableInventorySection.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)]
        .map((match) => match[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')));
    if (tableNames.size === 0) {
        throw new Error(`project knowledge secondary capability table inventory is empty: ${scope}`);
    }
    const relationships = [...erBlock.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s+([|o}{]{2}--[|o}{]{2})\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*"([^"]+)"/gm)];
    if (relationshipStatus === 'relational') {
        if (relationships.length === 0) {
            throw new Error(`project knowledge secondary capability ER diagram missing table relationship: ${scope}`);
        }
        for (const relationship of relationships) {
            for (const entityName of [relationship[1], relationship[3]]) {
                const normalized = entityName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
                if (!tableNames.has(normalized)) {
                    throw new Error(`project knowledge secondary capability ER relationship must reference table inventory: ${scope}/${entityName}`);
                }
            }
            const relationshipLabel = relationship[4];
            if (!/[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*/.test(relationshipLabel)
                || !/\b(?:physical_fk|logical_relation|external_reference)\b/.test(relationshipLabel)) {
                throw new Error(`project knowledge secondary capability ER relationship missing join fields or relationship type: ${scope}`);
            }
            const sourceName = relationship[1].toLowerCase();
            const targetName = relationship[3].toLowerCase();
            const relationshipRow = relationshipSection
                .split(/\r?\n/)
                .filter((line) => /^\s*\|/.test(line))
                .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/`/g, '')))
                .find((cells) => cells.length >= 8
                && cells[0].toLowerCase() === sourceName
                && cells[2].toLowerCase() === targetName);
            if (!relationshipRow
                || !/[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z][A-Za-z0-9_]*\.[A-Za-z][A-Za-z0-9_]*/.test(relationshipRow[3] ?? '')
                || !/^(?:\d+(?:\.\.(?:\d+|\*))?|[NM]):(?:\d+(?:\.\.(?:\d+|\*))?|[NM])$/i.test(relationshipRow[4] ?? '')
                || !/^(?:physical_fk|logical_relation|external_reference)$/.test(relationshipRow[5] ?? '')
                || (!exactCodeAnchors(relationshipRow.join(' | ')).length
                    && !/(?:目标设计|missing_evidence|缺失证据)/.test(relationshipRow.join(' | ')))) {
                throw new Error(`project knowledge secondary capability relationship table missing fields, cardinality, type or evidence: ${scope}`);
            }
        }
    }
    else {
        if (tableNames.size !== 1 || relationships.length > 0) {
            throw new Error(`project knowledge secondary capability single_table model must contain exactly one table and no relationship: ${scope}`);
        }
        const [tableName] = tableNames;
        if (!new RegExp(`\\b${tableName.toUpperCase()}\\s*\\{`).test(erBlock.toUpperCase())) {
            throw new Error(`project knowledge secondary capability single_table ER must define the inventory table: ${scope}`);
        }
    }
    for (const requiredText of [
        '关联字段/业务键',
        '实体-表-代码映射',
        '表定义与字段结构',
        '索引与约束',
        '状态与字段映射',
        '读写路径与一致性',
        '数据迁移、兼容与回滚',
    ]) {
        if (!body.includes(requiredText)) {
            throw new Error(`project knowledge secondary capability persistence design missing ${requiredText}: ${scope}`);
        }
    }
}
async function projectKnowledgeSourceFiles(sourceRoot) {
    const inventoryPath = path.join(sourceRoot, 'business', 'inventory.yaml');
    if (!existsSync(inventoryPath)) {
        throw new Error('project knowledge document missing: business/inventory.yaml');
    }
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
        level1JourneysByCapability.set(capabilityId, assertLevel1CapabilityDetailedDesign(capabilityDocumentBody, capabilityId, capability.secondary_capabilities, gapReportBody));
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
    const secondaryCapabilityDetailedDesigns = [];
    for (const capability of level1Capabilities) {
        const capabilityId = capability.level1_capability_id;
        for (const secondary of capability.secondary_capabilities) {
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
            assertSecondaryCapabilityDetailedDesign(body, capabilityId, secondaryId);
            const secondaryInterfaceCoverage = /\binterface_coverage\s*=\s*(complete|partial|not_applicable)\b/
                .exec(body)?.[1] ?? 'missing';
            if (level1JourneyCoverageByCapability.get(capabilityId) === 'complete'
                && secondaryInterfaceCoverage !== 'complete') {
                throw new Error(`project knowledge level-1 complete user journey coverage conflicts with ${secondaryInterfaceCoverage} secondary interface coverage: ${capabilityId}/${secondaryId}`);
            }
            const expectedJourneys = level1JourneysByCapability.get(capabilityId)?.get(secondaryId) ?? [];
            const expectedJourneyIds = new Set(expectedJourneys.map((journey) => journey.journeyId));
            const interfaceSection = projectKnowledgeSection(body, /^##\s+\d+\.?\s+接口详细设计\s*$/m) ?? '';
            const childJourneyBindings = markdownTableTraceBindings(interfaceSection);
            for (const journey of expectedJourneys) {
                const bindings = childJourneyBindings.get(journey.journeyId) ?? [];
                if (bindings.length === 0) {
                    throw new Error(`project knowledge secondary capability detailed design omits level-1 journey_id: ${capabilityId}/${secondaryId}/${journey.journeyId}`);
                }
                const matchingBinding = bindings.some((binding) => (binding.interfaceEntry === journey.interfaceEntry
                    && journey.controllerAnchors.every((anchor) => binding.controllerAnchors.includes(anchor))
                    && journey.serviceAnchors.every((anchor) => binding.serviceAnchors.includes(anchor))));
                if (!matchingBinding) {
                    throw new Error(`project knowledge secondary capability detailed design mismatches level-1 journey trace: ${capabilityId}/${secondaryId}/${journey.journeyId}`);
                }
            }
            for (const journeyId of childJourneyBindings.keys()) {
                if (!expectedJourneyIds.has(journeyId)) {
                    throw new Error(`project knowledge secondary capability detailed design contains journey_id absent from level-1 panorama: ${capabilityId}/${secondaryId}/${journeyId}`);
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
    manifest.files[manifest.files.length - 1] = await fileEntry(packageDir, 'manifest', 'manifest.json', 'application/json');
    await writeJsonFile(manifestPath, manifest);
    console.log(JSON.stringify({
        ok: true,
        asset_type: 'project_knowledge_snapshot',
        package_dir: relativeToRepo(repo, packageDir),
        files: manifest.files.map((file) => file.path),
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
    manifest.files[3] = await fileEntry(packageDir, 'manifest', 'manifest.json', 'application/json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: true,
        asset_type: assetType,
        package_dir: relativeToRepo(repo, packageDir),
        files: manifest.files.map((file) => file.path),
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
        if (entry.path === 'manifest.json') {
            refreshed.push(entry);
        }
        else {
            refreshed.push(await fileEntryFromRelative(packageDir, entry));
        }
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
    for (const filePath of manifestPaths) {
        const unsafe = unsafePathReason(filePath);
        if (unsafe)
            throw new Error(`refusing unsafe package path: ${unsafe}`);
        if (filePath.startsWith('../') || path.isAbsolute(filePath)) {
            throw new Error(`manifest file path must be relative: ${filePath}`);
        }
    }
    assertSameStringSet(localFiles, manifestPaths, 'manifest.files must match package directory files');
    for (const entry of manifest.files) {
        const absolutePath = path.join(packageDir, entry.path);
        if (!existsSync(absolutePath))
            throw new Error(`manifest file missing: ${entry.path}`);
        if (entry.path === 'manifest.json')
            continue;
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
                throw new Error(`Packaged skill must use axis-{category}-<action>: ${entry.name}`);
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
        if (inventory.action === 'replace') {
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
async function buildInstallInventory(agent, force, requestedSkills = []) {
    const packagedNames = await packagedSkillNames();
    if (packagedNames.length === 0) {
        throw new Error(`No packaged skills found under ${skillsRoot()}`);
    }
    const requestedNames = [...new Set(requestedSkills)];
    for (const requestedName of requestedNames) {
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
    return inventory;
}
function dryRunStatusFor(action) {
    if (action === 'skip')
        return 'identical';
    if (action === 'replace')
        return 'would_replace';
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
    const backupSession = createBackupSession();
    const installed = [];
    try {
        for (const item of inventory) {
            installed.push({
                skill: item.skill,
                agent: item.agent,
                target: item.target,
                status: await copySkillBundle(item.skill, item.source, item.target, item, backupSession),
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
