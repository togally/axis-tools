import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cli = path.resolve('dist/cli.js');
const updateSkillsScript = path.resolve('scripts/axis-update-skills.mjs');
const repoRoot = path.resolve('.');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../skills/manifest.json', import.meta.url), 'utf8'));
const packagedSkillNames = manifest.skills.map((skill) => skill.name).sort();

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

async function runUpdateSkills(args, options = {}) {
  return execFileAsync(process.execPath, [updateSkillsScript, ...args], {
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
  assert.match(stdout, /install \[--agent <codex\|claude-code\|cc\|all>\] \[--dry-run\] \[--force\]/);
  assert.doesNotMatch(stdout, removedAliasPattern);
}

await withTempDir(async (home) => {
  await mkdir(home, { recursive: true });
  const { stdout } = await run(['install', '--agent', 'codex'], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: '',
    },
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.agent, 'codex');
  assert.equal(result.installed.length, packagedSkillNames.length);
  assert.deepEqual(result.installed.map((item) => item.skill).sort(), packagedSkillNames);
  assert.equal(result.installed.every((item) => item.target.includes(path.join(home, '.codex', 'skills'))), true);

  const dashboard = path.join(home, '.codex', 'skills', 'axis-ali-dashboard');
  assert.equal(await readFile(path.join(dashboard, 'SKILL.md'), 'utf8').then((text) => text.includes('axis-ali-dashboard')), true);
  assert.equal(await readFile(path.join(dashboard, 'references', 'aliyun-sls-drilldown.md'), 'utf8').then((text) => text.includes('SLS Drilldown')), true);
  assert.equal(await readFile(path.join(dashboard, 'scripts', 'validate_dashboard_json.py'), 'utf8').then((text) => text.includes('validate_logstore_drilldowns')), true);
});

await withTempDir(async (home) => {
  const codexHome = path.join(home, 'runtime-codex-home');
  const { stdout } = await run(['install', '--agent', 'codex', '--dry-run'], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
    },
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.installed.length, packagedSkillNames.length);
  assert.equal(result.installed.every((item) => item.status === 'would_copy'), true);
  assert.equal(result.inventory.every((item) => item.target_root === path.join(codexHome, 'skills')), true);
  assert.equal(result.inventory.every((item) => item.action === 'copy'), true);

  await assert.rejects(
    () => readFile(path.join(codexHome, 'skills', 'axis-ali-dashboard', 'SKILL.md'), 'utf8'),
    /ENOENT/,
  );
});

await withTempDir(async (home) => {
  const codexHome = path.join(home, '.codex');
  await run(['install', '--agent', 'codex'], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
    },
  });
  const dashboardSkill = path.join(codexHome, 'skills', 'axis-ali-dashboard', 'SKILL.md');
  await writeFile(dashboardSkill, '# local edit\n', 'utf8');

  await assert.rejects(
    () => run(['install', '--agent', 'codex'], {
      env: {
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: codexHome,
      },
    }),
    /Refusing to overwrite modified skill directory/,
  );
  assert.equal(await readFile(dashboardSkill, 'utf8'), '# local edit\n');
});

await withTempDir(async (home) => {
  const codexHome = path.join(home, '.codex');
  const backupDir = path.join(home, 'backups');
  await run(['install', '--agent', 'codex'], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
    },
  });
  const dashboardSkill = path.join(codexHome, 'skills', 'axis-ali-dashboard', 'SKILL.md');
  await writeFile(dashboardSkill, '# local edit before forced update\n', 'utf8');

  await assert.rejects(
    () => run(['install', '--agent', 'codex', '--force', '--backup-dir', backupDir], {
      env: {
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: codexHome,
        AXIS_INSTALL_FAIL_AFTER_BACKUP: 'axis-ali-dashboard',
      },
    }),
    /Simulated install failure after backup/,
  );
  assert.equal(await readFile(dashboardSkill, 'utf8'), '# local edit before forced update\n');
});

await withTempDir(async (home) => {
  const codexHome = path.join(home, '.codex');
  const backupDir = path.join(home, 'backups');
  await run(['install', '--agent', 'codex'], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
    },
  });
  const dashboardSkill = path.join(codexHome, 'skills', 'axis-ali-dashboard', 'SKILL.md');
  await writeFile(dashboardSkill, '# local edit for rollback\n', 'utf8');
  const forced = await run(['install', '--agent', 'codex', '--force', '--backup-dir', backupDir], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
    },
  });
  const forcedResult = JSON.parse(forced.stdout);
  assert.equal(forcedResult.backup_dir, backupDir);
  assert.equal(await readFile(dashboardSkill, 'utf8').then((text) => text.includes('axis-ali-dashboard')), true);

  const rollback = await run(['install', '--rollback', backupDir], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
    },
  });
  const rollbackResult = JSON.parse(rollback.stdout);
  assert.equal(rollbackResult.ok, true);
  assert.equal(rollbackResult.rollback.restored.length > 0, true);
  assert.equal(await readFile(dashboardSkill, 'utf8'), '# local edit for rollback\n');
});

await withTempDir(async (home) => {
  const { stdout } = await run(['install', '--agent', 'all'], {
    env: {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: '',
    },
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.agent, 'all');
  assert.equal(result.installed.length, packagedSkillNames.length * 2);
  assert.equal(result.installed.some((item) => item.target.includes(path.join(home, '.codex', 'skills'))), true);
  assert.equal(result.installed.some((item) => item.target.includes(path.join(home, '.claude', 'skills'))), true);
});

await withTempDir(async (home) => {
  const codexHome = path.join(home, '.codex');
  const dashboard = path.join(codexHome, 'skills', 'axis-ali-dashboard');
  await mkdir(dashboard, { recursive: true });
  await writeFile(path.join(dashboard, 'SKILL.md'), '# local edit\n', 'utf8');

  await assert.rejects(
    () => runUpdateSkills(['--repo', repoRoot, '--agent', 'codex', '--no-pull', '--no-validate', '--json'], {
      env: {
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: codexHome,
      },
    }),
    /Refusing to overwrite modified skill directory/,
  );
  assert.equal(await readFile(path.join(dashboard, 'SKILL.md'), 'utf8'), '# local edit\n');
});
