#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

function defaultRepo() {
  return process.env.AXIS_TOOLS_DIR || process.env.ORBIT_TOOLS_DIR || path.join(os.homedir(), 'axis-tools');
}

function defaultValidator() {
  return path.join(defaultCodexHome(), 'skills', '.system', 'skill-creator', 'scripts', 'quick_validate.py');
}

function normalizeSkillTarget(target) {
  if (path.basename(target) === 'SKILL.md') {
    return path.dirname(target);
  }
  return target;
}

function parseJsonOutput(stdout) {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error(`Command did not produce JSON: ${text}`);
  }
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

async function main() {
  const repo = path.resolve(argValue('--repo') || defaultRepo());
  const agent = argValue('--agent') || 'codex';
  const validator = path.resolve(argValue('--validator') || defaultValidator());
  const outputJson = hasFlag('--json');
  const result = {
    ok: false,
    repo,
    agent,
    pulled: false,
    installed: [],
    validated: [],
  };

  if (!existsSync(repo)) {
    throw new Error(`Axis tools repo not found: ${repo}`);
  }

  if (!hasFlag('--no-pull')) {
    await run('git', ['pull', '--ff-only'], { cwd: repo });
    result.pulled = true;
  }

  const cli = path.join(repo, 'dist', 'cli.js');
  if (!existsSync(cli)) {
    await run('npm', ['run', 'build'], { cwd: repo });
  }
  if (!existsSync(cli)) {
    throw new Error(`Axis CLI entry not found after build: ${cli}`);
  }

  const install = await run(process.execPath, [cli, 'install', '--agent', agent, '--force'], { cwd: repo });
  const installResult = parseJsonOutput(install.stdout);
  result.installed = Array.isArray(installResult.installed) ? installResult.installed : [];

  if (!hasFlag('--no-validate')) {
    const seenTargets = new Set();
    for (const item of result.installed) {
      if (!item?.target) continue;
      const skillDir = normalizeSkillTarget(item.target);
      if (seenTargets.has(skillDir)) continue;
      seenTargets.add(skillDir);
      await validateSkill(skillDir, validator);
      result.validated.push({ skill: item.skill, target: skillDir, status: 'validated' });
    }
  }

  result.ok = true;

  if (outputJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`Updated Axis skills from ${repo}`);
  console.log(`Installed targets: ${result.installed.length}`);
  if (result.validated.length > 0) {
    console.log(`Validated targets: ${result.validated.length}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
