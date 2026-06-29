import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cli = path.resolve('dist/cli.js');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-cli-install-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function run(args, options = {}) {
  return execFileAsync(process.execPath, [cli, ...args], {
    ...options,
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...(options.env ?? {}),
    },
  });
}

assert.deepEqual(Object.keys(packageJson.bin).sort(), ['axis', 'axis-tools']);
assert.equal(packageJson.bin.axis, './dist/cli.js');
assert.equal(packageJson.bin['axis-tools'], './dist/cli.js');

{
  const { stdout } = await run(['--help']);
  const removedAliasPattern = new RegExp([
    `axis-${'req'}`,
    `axis-${'bug'}`,
    `axis-${'sug'}`,
    `axis-${'ide'}`,
    `${'or'}${'bit'}`,
  ].join('|'));
  assert.match(stdout, /axis-tools/);
  assert.match(stdout, /install \[--agent <codex\|claude-code\|cc\|all>\]/);
  assert.doesNotMatch(stdout, removedAliasPattern);
}

await withTempDir(async (home) => {
  await mkdir(home, { recursive: true });
  const { stdout } = await run(['install', '--agent', 'codex', '--force'], {
    env: {
      HOME: home,
      USERPROFILE: home,
    },
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.agent, 'codex');
  assert.equal(result.installed.length, 4);
  assert.equal(result.installed.every((item) => item.target.includes(path.join(home, '.codex', 'skills'))), true);

  const dashboard = path.join(home, '.codex', 'skills', 'axis-ali-dashboard');
  assert.equal(await readFile(path.join(dashboard, 'SKILL.md'), 'utf8').then((text) => text.includes('axis-ali-dashboard')), true);
  assert.equal(await readFile(path.join(dashboard, 'references', 'aliyun-sls-drilldown.md'), 'utf8').then((text) => text.includes('SLS Drilldown')), true);
  assert.equal(await readFile(path.join(dashboard, 'scripts', 'validate_dashboard_json.py'), 'utf8').then((text) => text.includes('validate_logstore_drilldowns')), true);
});

await withTempDir(async (home) => {
  const { stdout } = await run(['install', '--agent', 'all', '--force'], {
    env: {
      HOME: home,
      USERPROFILE: home,
    },
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.agent, 'all');
  assert.equal(result.installed.length, 8);
  assert.equal(result.installed.some((item) => item.target.includes(path.join(home, '.codex', 'skills'))), true);
  assert.equal(result.installed.some((item) => item.target.includes(path.join(home, '.claude', 'skills'))), true);
});
