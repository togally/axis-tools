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
const publicRepoSensitivePattern =
  /\b(petmall|petmallplatform|owh|whalecloud|jiazhiwei)\b/i;
const codingDesignSkillPattern =
  /\b(api|architecture|architectural|benchmark|bugfix|code|coding|database|dbdd|design|document|implementation|implementing|optimization|optimise|optimize|performance|refactor|schema|sql|tdd|test|testing|technical)\b/i;
const afterUseDepositionSection = `
## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
`;
const threeStepWorkContractSection = `
## Three-Step Work Contract

For coding and design work, run the workflow in three steps:

1. Co-create with the user: clarify what they want, preserve their exact business wording, identify acceptance criteria, and gather the code, schema, logs, docs, credentials, endpoints, or environment details needed to execute the next step.
2. Execute the result: implement the code change, write the design, or produce the requested artifact using the agreed scope and the repository's existing patterns.
3. Verify the result: run focused tests, validators, benchmarks, document checks, or review passes that prove the result matches the request, then report what passed and what remains unverified.

Keep light adversarial review to no more than 30% of the interaction. Calibrate it to the risk: challenge missing evidence, unsafe shortcuts, or unclear ownership, but do not let critique replace execution once the next step is sufficiently specified.
`;
const lightAdversarialReviewSection = `
## Light Adversarial Review

For coding, architecture, optimization, testing, database, or design-document workflows, use a lightly adversarial stance: verify the user's goal against code or evidence, surface hidden assumptions, name correctness and risk trade-offs, and challenge unsafe shortcuts before implementing or finalizing. Keep it constructive and below 30% of the interaction: preserve the user's explicit business wording, avoid debate for its own sake, and become decisive once evidence is sufficient.
`;

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

function ensureBilingualDescription(description) {
  if (!/^Use when\b/.test(description)) {
    throw new Error('Skill description must start with "Use when".');
  }
  if (!/[A-Za-z]/.test(description) || !/[\u3400-\u9FFF]/.test(description)) {
    throw new Error('Skill description must be bilingual English and Chinese.');
  }
  return description;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function normalizeBody(body) {
  const text = body.trimEnd();
  return `${text}\n`;
}

function withAfterUseDeposition(body) {
  if (/^## After Use Deposition\b/m.test(body)) {
    return body;
  }
  return `${body.trimEnd()}\n\n${afterUseDepositionSection.trim()}\n`;
}

function isCodingDesignSkill({ name, description, body }) {
  return codingDesignSkillPattern.test([name, description, body].join('\n'));
}

function withThreeStepWorkContract(body, context) {
  if (!isCodingDesignSkill({ ...context, body }) || /^## Three-Step Work Contract\b/m.test(body)) {
    return body;
  }
  return `${body.trimEnd()}\n\n${threeStepWorkContractSection.trim()}\n`;
}

function withLightAdversarialReview(body, context) {
  if (!isCodingDesignSkill({ ...context, body }) || /^## Light Adversarial Review\b/m.test(body)) {
    return body;
  }
  return `${body.trimEnd()}\n\n${lightAdversarialReviewSection.trim()}\n`;
}

function createSkillMarkdown({ name, description, body }) {
  const threeStepBody = withThreeStepWorkContract(body, { name, description });
  const enrichedBody = withLightAdversarialReview(threeStepBody, { name, description });
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    normalizeBody(withAfterUseDeposition(enrichedBody)).trimEnd(),
    '',
  ].join('\n');
}

function ensurePublicSafeSkill({ name, description, body }) {
  if (hasFlag('--private-ok')) return;
  const haystack = [name, description, body].join('\n');
  if (publicRepoSensitivePattern.test(haystack)) {
    throw new Error(
      'Skill content appears project-specific or sensitive for the public axis-tools repo. ' +
      'Use a generic public workflow or pass --private-ok for a private/local-only skill.',
    );
  }
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
    if (!hasFlag('--private-ok') && publicRepoSensitivePattern.test(`${name}\n${localContext}`)) continue;
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
  const description = ensureBilingualDescription(
    argValue('--description') || `Use when the user asks for the ${name} Axis workflow. / 用于处理 ${name} 对应的 Axis 工作流。`,
  );
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
  ensurePublicSafeSkill({ name, description, body });

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
