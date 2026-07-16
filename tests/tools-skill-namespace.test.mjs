import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const skillRoot = path.join(repoRoot, 'skills');

const requiredToolSkills = [
  'axis-tools-prompt-create',
  'axis-tools-skill-create',
  'axis-tools-skill-update',
];
const retiredToolSkills = [
  'axis-skill-create',
  'axis-skill-update',
];

for (const name of requiredToolSkills) {
  await access(path.join(skillRoot, name, 'SKILL.md'));
  await access(path.join(skillRoot, name, 'agents', 'openai.yaml'));
}
for (const name of retiredToolSkills) {
  await assert.rejects(() => access(path.join(skillRoot, name, 'SKILL.md')), /ENOENT/);
}
const manifest = JSON.parse(await readFile(path.join(skillRoot, 'manifest.json'), 'utf8'));
const manifestNames = manifest.skills.map((skill) => skill.name);
for (const name of requiredToolSkills) assert.ok(manifestNames.includes(name), `${name} must be packaged`);
for (const name of retiredToolSkills) assert.ok(!manifestNames.includes(name), `${name} must be retired`);
assert.match(manifest.description, /axis-skill-deposit\.mjs/);

const creator = await readFile(path.join(skillRoot, 'axis-tools-skill-create', 'SKILL.md'), 'utf8');
assert.match(creator, /\$axis-tools-prompt-create/);
assert.match(creator, /single (?:creation|creator) entrypoint/i);
assert.match(creator, /axis-tools-[a-z0-9-]+/);
assert.doesNotMatch(creator, /\$axis-skill-(?:create|update)\b/);

const promptSkill = await readFile(path.join(skillRoot, 'axis-tools-prompt-create', 'SKILL.md'), 'utf8');
for (const requiredText of [
  'Prompt Creation',
  'Blind Evaluation',
  'Data Source Matrix',
  'Model Tier Matrix',
  'Worst-Cell Gate',
  'Frozen Holdout',
  'After Use Deposition',
]) {
  assert.match(promptSkill, new RegExp(requiredText));
}
assert.match(promptSkill.split('\n').find((line) => line.startsWith('description:')) ?? '', /[\u3400-\u9FFF]/);
assert.match(
  await readFile(path.join(skillRoot, 'axis-tools-prompt-create', 'agents', 'openai.yaml'), 'utf8'),
  /\$axis-tools-prompt-create\b/,
);

const { rankPromptResults } = await import(
  new URL('../skills/axis-tools-prompt-create/scripts/rank_prompt_results.mjs', import.meta.url)
);
const ranking = rankPromptResults([
  { prompt_id: 'high-average-unstable', model_tier: 'small', source_kind: 'code', score: 1, hard_fail: false },
  { prompt_id: 'high-average-unstable', model_tier: 'standard', source_kind: 'workflow', score: 0, hard_fail: false },
  { prompt_id: 'stable', model_tier: 'small', source_kind: 'code', score: 0.7, hard_fail: false },
  { prompt_id: 'stable', model_tier: 'standard', source_kind: 'workflow', score: 0.7, hard_fail: false },
]);
assert.equal(ranking[0].prompt_id, 'stable', 'worst-cell stability must outrank a higher but brittle maximum');

const tempRoot = await mkdtemp(path.join(tmpdir(), 'axis-tools-name-guard-'));
try {
  const sourceRoot = path.join(tempRoot, 'skills');
  await mkdir(sourceRoot, { recursive: true });
  const createScript = path.join(repoRoot, 'scripts', 'axis-skill-create.mjs');
  await execFileAsync(process.execPath, [
    createScript,
    '--source-root', sourceRoot,
    '--name', 'axis-tools-example-create',
    '--description', 'Use when testing the Axis tools namespace. / 用于测试 Axis 工具命名空间。',
    '--body', '# Tool Example\n',
    '--no-validate',
  ]);
  const legacyError = await execFileAsync(process.execPath, [
    createScript,
    '--source-root', sourceRoot,
    '--name', 'axis-skill-example',
    '--description', 'Use when testing a retired namespace. / 用于测试已退役命名空间。',
    '--body', '# Legacy Example\n',
    '--no-validate',
  ]).catch((error) => error);
  assert.equal(legacyError.code, 1);
  assert.match(legacyError.stderr, /axis-tools-/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
