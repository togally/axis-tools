#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const skillNamePattern = /^axis-[a-z0-9][a-z0-9-]*$/;

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
    throw new Error(`Skill name must look like axis-example-skill: ${name}`);
  }
  return name;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function normalizeBody(body) {
  const text = body.trimEnd();
  return `${text}\n`;
}

function createSkillMarkdown({ name, description, body }) {
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    normalizeBody(body).trimEnd(),
    '',
  ].join('\n');
}

function createOpenAiYaml({ name, displayName, shortDescription, defaultPrompt }) {
  return [
    'interface:',
    `  display_name: ${yamlString(displayName)}`,
    `  short_description: ${yamlString(shortDescription)}`,
    `  default_prompt: ${yamlString(defaultPrompt || `Use $${name} to run this Axis skill workflow.`)}`,
    '',
    'policy:',
    '  allow_implicit_invocation: true',
    '',
  ].join('\n');
}

function sentenceAround(text, start, end) {
  const before = text.slice(0, start).search(/[^。！？!?;\n]*$/);
  const left = before === -1 ? 0 : before;
  const afterText = text.slice(end);
  const afterMatch = afterText.search(/[。！？!?;\n]/);
  const right = afterMatch === -1 ? text.length : end + afterMatch + 1;
  return text.slice(left, right).trim();
}

function scanConversation(text) {
  const candidates = [];
  const seen = new Set();
  const pattern = /\b(axis-[a-z0-9][a-z0-9-]*)\b(?:\s*(?:skill|技能))?/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (seen.has(name)) continue;
    const reason = sentenceAround(text, match.index, match.index + match[0].length);
    const localContext = reason || text.slice(Math.max(0, match.index - 80), match.index + 120);
    if (!/(skill|技能|沉淀|复用|固化|流程|方法|模板)/i.test(localContext)) continue;
    seen.add(name);
    candidates.push({
      name,
      reason: localContext,
    });
  }
  return candidates;
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

async function validateSkill(skillDir, validator) {
  if (!existsSync(validator)) {
    throw new Error(`Skill validator not found: ${validator}`);
  }
  await run('python3', [validator, skillDir]);
}

async function createLocalSkill() {
  const name = ensureSkillName(argValue('--name') || '');
  const description = argValue('--description') || `Use when the user asks for the ${name} Axis workflow.`;
  const bodyArg = argValue('--body');
  const bodyFile = argValue('--body-file');
  const body = bodyArg ?? (bodyFile ? await readFile(path.resolve(bodyFile), 'utf8') : `# ${name}\n\nUse this skill for the Axis workflow.\n`);
  const sourceRoot = path.resolve(argValue('--source-root') || path.join(defaultCodexHome(), 'skills'));
  const skillDir = path.join(sourceRoot, name);
  const agentsDir = path.join(skillDir, 'agents');
  const displayName = argValue('--display-name') || name;
  const shortDescription = argValue('--short-description') || description.slice(0, 78);
  const defaultPrompt = argValue('--default-prompt') || `Use $${name} to run this Axis workflow.`;
  const validator = path.resolve(argValue('--validator') || defaultValidator());

  if (existsSync(skillDir) && !hasFlag('--force')) {
    throw new Error(`Local skill already exists: ${skillDir}. Pass --force to overwrite.`);
  }

  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), createSkillMarkdown({ name, description, body }), 'utf8');
  await writeFile(path.join(agentsDir, 'openai.yaml'), createOpenAiYaml({ name, displayName, shortDescription, defaultPrompt }), 'utf8');

  if (!hasFlag('--no-validate')) {
    await validateSkill(skillDir, validator);
  }

  return { name, sourceRoot, skillDir };
}

async function depositSkill({ name, sourceRoot }) {
  const repo = path.resolve(argValue('--repo') || process.cwd());
  const script = path.join(repo, 'scripts', 'axis-skill-deposit.mjs');
  if (!existsSync(script)) {
    throw new Error(`Deposit script not found: ${script}`);
  }
  const args = [
    script,
    '--repo',
    repo,
    '--source-root',
    sourceRoot,
    '--skill',
    name,
  ];
  if (hasFlag('--no-validate')) args.push('--no-validate');
  if (hasFlag('--commit')) args.push('--commit');
  if (hasFlag('--push')) args.push('--push');
  const branch = argValue('--branch');
  if (branch) args.push('--branch', branch);
  const message = argValue('--message');
  if (message) args.push('--message', message);

  return run(process.execPath, args, { cwd: repo });
}

async function main() {
  const scanPath = argValue('--scan-conversation');
  const outputJson = hasFlag('--json');
  if (scanPath) {
    const text = await readFile(path.resolve(scanPath), 'utf8');
    const result = { candidates: scanConversation(text) };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const created = await createLocalSkill();
  const messages = [`Created local skill ${created.name}: ${created.skillDir}`];
  const result = {
    ok: true,
    created,
    deposited: false,
  };

  if (hasFlag('--deposit') || hasFlag('--commit') || hasFlag('--push')) {
    const deposit = await depositSkill(created);
    result.deposited = true;
    result.depositStdout = deposit.stdout;
    result.depositStderr = deposit.stderr;
  }

  if (outputJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  for (const message of messages) {
    console.log(message);
  }
  if (result.depositStdout) process.stdout.write(result.depositStdout);
  if (result.depositStderr) process.stderr.write(result.depositStderr);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
