#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const skillNamePattern = /^axis-(?:code|doc|integration|ops|skill|test)-[a-z0-9][a-z0-9-]*$/;

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function defaultValidator() {
  return path.join(defaultCodexHome(), 'skills', '.system', 'skill-creator', 'scripts', 'quick_validate.py');
}

function ensureSkillName(name) {
  if (!skillNamePattern.test(name)) {
    throw new Error(`Skill name must use axis-{category}-<action>: ${name}`);
  }
  return name;
}

function ensureBilingualDescription(description) {
  if (!/^Use when\b/.test(description)) {
    throw new Error('Skill description must start with "Use when".');
  }
  if (!/[A-Za-z]/.test(description) || !/[\u3400-\u9FFF]/.test(description)) {
    throw new Error('Skill description must be bilingual English and Chinese.');
  }
  return description;
}

async function parseSkillMetadata(skillDir) {
  const skillMd = path.join(skillDir, 'SKILL.md');
  const text = await readFile(skillMd, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') {
    throw new Error(`${skillMd} must start with YAML frontmatter`);
  }
  const metadata = new Map();
  for (const line of lines.slice(1)) {
    if (line === '---') break;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    metadata.set(key, value);
  }
  const name = metadata.get('name');
  const description = metadata.get('description');
  if (!name) throw new Error(`${skillMd} frontmatter must include name`);
  if (!description) throw new Error(`${skillMd} frontmatter must include description`);
  ensureSkillName(name);
  return { name, description: ensureBilingualDescription(description) };
}

async function collectFiles(root) {
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '__pycache__' || entry.name === '.DS_Store' || entry.name === '.git') continue;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile() && !entry.name.endsWith('.pyc')) {
        files.push(path.relative(root, child).split(path.sep).join('/'));
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function validateSkill(skillDir, validator) {
  if (!existsSync(validator)) {
    throw new Error(`Skill validator not found: ${validator}`);
  }
  const { stdout } = await execFileAsync('python3', [validator, skillDir]);
  if (stdout.trim()) {
    process.stdout.write(stdout);
  }
}

async function copySkillBundle({ repo, sourceRoot, destRoot, skill, validate, validator }) {
  ensureSkillName(skill);
  const source = path.resolve(sourceRoot, skill);
  const destination = path.resolve(repo, destRoot, skill);
  if (!existsSync(source)) {
    throw new Error(`Skill source not found: ${source}`);
  }
  const metadata = await parseSkillMetadata(source);
  if (metadata.name !== skill) {
    throw new Error(`Requested ${skill}, but SKILL.md name is ${metadata.name}`);
  }
  if (validate) {
    await validateSkill(source, validator);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== '__pycache__' && base !== '.DS_Store' && !base.endsWith('.pyc');
    },
  });
  return {
    name: skill,
    description: metadata.description,
    source,
    destination,
    files: await collectFiles(destination),
  };
}

async function writeManifest(repo, destRoot) {
  const root = path.resolve(repo, destRoot);
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(root, entry.name);
    if (!existsSync(path.join(skillDir, 'SKILL.md'))) continue;
    const metadata = await parseSkillMetadata(skillDir);
    skills.push({
      name: metadata.name,
      description: metadata.description,
      path: path.join(destRoot, entry.name).split(path.sep).join('/'),
      files: await collectFiles(skillDir),
    });
  }
  skills.sort((left, right) => left.name.localeCompare(right.name));
  const manifest = {
    version: 1,
    description: 'Axis packaged skill bundles captured by scripts/axis-skill-deposit.mjs',
    skills,
  };
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

async function git(repo, args, options = {}) {
  return execFileAsync('git', args, { cwd: repo, ...options });
}

async function commitAndMaybePush(repo, paths, message, push, branch) {
  await git(repo, ['add', ...paths]);
  const diff = await git(repo, ['diff', '--cached', '--quiet']).catch((error) => error);
  if (diff.code !== 1) {
    console.log('No staged skill changes to commit.');
    return false;
  }
  await git(repo, ['commit', '-m', message]);
  console.log(`Committed: ${message}`);
  if (push) {
    const target = branch || (await git(repo, ['branch', '--show-current'])).stdout.trim() || 'main';
    await git(repo, ['push', 'origin', `HEAD:${target}`]);
    console.log(`Pushed HEAD to origin/${target}`);
  }
  return true;
}

async function main() {
  const repo = path.resolve(argValue('--repo') || process.cwd());
  const sourceRoot = path.resolve(argValue('--source-root') || path.join(defaultCodexHome(), 'skills'));
  const destRoot = argValue('--dest-root') || 'skills';
  const validator = path.resolve(argValue('--validator') || defaultValidator());
  const skills = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === '--skill' && process.argv[i + 1]) skills.push(process.argv[i + 1]);
  }
  if (skills.length === 0) {
    throw new Error('Pass at least one --skill <name>');
  }

  console.log(`Repo: ${repo}`);
  console.log(`Source root: ${sourceRoot}`);
  console.log(`Destination root: ${destRoot}`);
  console.log(`Skills: ${skills.join(', ')}`);

  const deposited = [];
  for (const skill of skills) {
    const result = await copySkillBundle({
      repo,
      sourceRoot,
      destRoot,
      skill,
      validate: !hasFlag('--no-validate'),
      validator,
    });
    deposited.push(result);
    console.log(`Deposited ${result.name}: ${result.files.length} files`);
  }
  await writeManifest(repo, destRoot);
  console.log(`Updated ${path.join(destRoot, 'manifest.json')}`);

  if (hasFlag('--commit') || hasFlag('--push')) {
    const paths = deposited.map((skill) => path.join(destRoot, skill.name));
    paths.push(path.join(destRoot, 'manifest.json'));
    await commitAndMaybePush(
      repo,
      paths,
      argValue('--message') || 'chore: deposit axis packaged skills',
      hasFlag('--push'),
      argValue('--branch'),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
