#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type InstallAgentChoice = 'codex' | 'claude-code' | 'all';
type InstallStatus = 'copied' | 'identical';

interface InstalledSkill {
  skill: string;
  target: string;
  status: InstallStatus;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function skillsRoot(): string {
  return path.join(repoRoot(), 'skills');
}

function homeDir(): string {
  return os.homedir();
}

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function isHelpFlag(value: string | undefined): boolean {
  return value === '--help' || value === '-h';
}

function printUsage(): void {
  console.log(`axis-tools

Commands:
  install [--agent <codex|claude-code|cc|all>] [--force]

Skill helper scripts:
  node scripts/axis-update-skills.mjs --repo <axis-tools> --agent codex --json
  node scripts/axis-create-skill.mjs --scan-conversation <conversation.txt> --json
  node scripts/axis-skill-deposit.mjs --skill <skill-name> --commit --push --branch main

Purpose:
  Install and maintain the public Axis packaged skills in this repository.
`);
}

function parseInstallAgentArg(value: string | null): InstallAgentChoice {
  if (!value || value === 'all') return 'all';
  if (value === 'codex') return 'codex';
  if (value === 'claude-code' || value === 'cc') return 'claude-code';
  throw new Error('--agent must be one of: codex, claude-code, cc, all');
}

function selectedAgents(agent: InstallAgentChoice): Exclude<InstallAgentChoice, 'all'>[] {
  if (agent === 'all') return ['codex', 'claude-code'];
  return [agent];
}

function agentSkillDir(agent: Exclude<InstallAgentChoice, 'all'>, skillName: string): string {
  if (agent === 'codex') return path.join(homeDir(), '.codex', 'skills', skillName);
  return path.join(homeDir(), '.claude', 'skills', skillName);
}

async function packagedSkillNames(): Promise<string[]> {
  const root = skillsRoot();
  const entries = await readdir(root, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (existsSync(path.join(root, entry.name, 'SKILL.md'))) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

async function collectRelativeFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '__pycache__' || entry.name === '.DS_Store' || entry.name === '.git') continue;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile() && !entry.name.endsWith('.pyc')) {
        files.push(path.relative(root, child));
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function directoriesIdentical(sourceDir: string, targetDir: string): Promise<boolean> {
  if (!existsSync(targetDir)) return false;
  const sourceFiles = await collectRelativeFiles(sourceDir);
  const targetFiles = await collectRelativeFiles(targetDir);
  if (sourceFiles.length !== targetFiles.length) return false;
  for (let index = 0; index < sourceFiles.length; index += 1) {
    if (sourceFiles[index] !== targetFiles[index]) return false;
    const [sourceText, targetText] = await Promise.all([
      readFile(path.join(sourceDir, sourceFiles[index])),
      readFile(path.join(targetDir, targetFiles[index])),
    ]);
    if (!sourceText.equals(targetText)) return false;
  }
  return true;
}

async function copySkillBundle(sourceDir: string, targetDir: string, force: boolean): Promise<InstallStatus> {
  await mkdir(path.dirname(targetDir), { recursive: true });
  if (existsSync(targetDir)) {
    if (await directoriesIdentical(sourceDir, targetDir)) return 'identical';
    if (!force) {
      throw new Error(`Refusing to overwrite modified skill directory at ${targetDir}. Re-run with --force to replace it.`);
    }
    await rm(targetDir, { recursive: true, force: true });
  }
  await cp(sourceDir, targetDir, { recursive: true });
  return 'copied';
}

async function installPackagedSkills(agent: InstallAgentChoice, force: boolean): Promise<InstalledSkill[]> {
  const names = await packagedSkillNames();
  if (names.length === 0) {
    throw new Error(`No packaged skills found under ${skillsRoot()}`);
  }

  const installed: InstalledSkill[] = [];
  for (const skillName of names) {
    const source = path.join(skillsRoot(), skillName);
    for (const selectedAgent of selectedAgents(agent)) {
      const target = agentSkillDir(selectedAgent, skillName);
      installed.push({
        skill: skillName,
        target,
        status: await copySkillBundle(source, target, force),
      });
    }
  }
  return installed;
}

async function installCommand(): Promise<void> {
  const agent = parseInstallAgentArg(getArg('--agent'));
  const installed = await installPackagedSkills(agent, hasFlag('--force'));
  console.log(JSON.stringify({ ok: true, agent, installed }, null, 2));
}

async function main(): Promise<void> {
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

  printUsage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
