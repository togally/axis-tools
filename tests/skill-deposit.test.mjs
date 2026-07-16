import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const script = path.join(repoRoot, 'scripts', 'axis-skill-deposit.mjs');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-skill-deposit-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeDemoSkill(sourceRoot, name = 'axis-tools-skill-demo') {
  const skillDir = path.join(sourceRoot, name);
  await mkdir(path.join(skillDir, 'references'), { recursive: true });
  await mkdir(path.join(skillDir, 'scripts'), { recursive: true });
  await mkdir(path.join(skillDir, 'agents'), { recursive: true });
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      'description: Use when testing Axis skill deposition. / 用于测试 Axis 技能沉淀。',
      '---',
      '',
      '# Demo',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(path.join(skillDir, 'references', 'guide.md'), 'reference\n', 'utf8');
  await writeFile(path.join(skillDir, 'scripts', 'helper.py'), 'print("ok")\n', 'utf8');
  await writeFile(path.join(skillDir, 'agents', 'openai.yaml'), 'interface:\n  display_name: Demo\n', 'utf8');
  return skillDir;
}

await withTempDir(async (tmp) => {
  const sourceRoot = path.join(tmp, 'source-skills');
  const repo = path.join(tmp, 'repo');
  await mkdir(repo, { recursive: true });
  await writeDemoSkill(sourceRoot);

  await execFileAsync(process.execPath, [
    script,
    '--repo',
    repo,
    '--source-root',
    sourceRoot,
    '--skill',
    'axis-tools-skill-demo',
    '--no-validate',
  ]);

  assert.equal(await readFile(path.join(repo, 'skills', 'axis-tools-skill-demo', 'SKILL.md'), 'utf8').then((text) => text.includes('axis-tools-skill-demo')), true);
  assert.equal(await readFile(path.join(repo, 'skills', 'axis-tools-skill-demo', 'references', 'guide.md'), 'utf8'), 'reference\n');
  assert.equal(await readFile(path.join(repo, 'skills', 'axis-tools-skill-demo', 'scripts', 'helper.py'), 'utf8'), 'print("ok")\n');

  const manifest = JSON.parse(await readFile(path.join(repo, 'skills', 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.skills[0].name, 'axis-tools-skill-demo');
  assert.match(manifest.skills[0].description, /用于测试 Axis 技能沉淀/);
  assert.equal(manifest.skills[0].path, 'skills/axis-tools-skill-demo');
  assert.deepEqual(manifest.skills[0].files.sort(), [
    'SKILL.md',
    'agents/openai.yaml',
    'references/guide.md',
    'scripts/helper.py',
  ]);
});

await withTempDir(async (tmp) => {
  const sourceRoot = path.join(tmp, 'source-skills');
  const repo = path.join(tmp, 'repo');
  await mkdir(repo, { recursive: true });
  await writeDemoSkill(sourceRoot, 'axis-demo-skill');

  const error = await execFileAsync(process.execPath, [
    script,
    '--repo',
    repo,
    '--source-root',
    sourceRoot,
    '--skill',
    'axis-demo-skill',
    '--no-validate',
  ]).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /axis-\{category\}-/);
});

await withTempDir(async (tmp) => {
  const sourceRoot = path.join(tmp, 'source-skills');
  const repo = path.join(tmp, 'repo');
  await mkdir(repo, { recursive: true });
  await writeDemoSkill(sourceRoot);
  await writeFile(path.join(repo, 'unrelated.txt'), 'do not stage\n', 'utf8');
  await execFileAsync('git', ['init'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.email', 'axis@example.test'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.name', 'Axis Test'], { cwd: repo });

  const { stdout } = await execFileAsync(process.execPath, [
    script,
    '--repo',
    repo,
    '--source-root',
    sourceRoot,
    '--skill',
    'axis-tools-skill-demo',
    '--no-validate',
    '--commit',
    '--message',
    'chore: deposit axis demo skill',
  ]);

  assert.match(stdout, /Committed: chore: deposit axis demo skill/);
  const { stdout: committed } = await execFileAsync('git', ['show', '--name-only', '--pretty=format:', 'HEAD'], { cwd: repo });
  assert.match(committed, /skills\/axis-tools-skill-demo\/SKILL.md/);
  assert.match(committed, /skills\/manifest.json/);
  assert.doesNotMatch(committed, /unrelated.txt/);
  const { stdout: status } = await execFileAsync('git', ['status', '--short'], { cwd: repo });
  assert.match(status, /\?\? unrelated.txt/);
});
