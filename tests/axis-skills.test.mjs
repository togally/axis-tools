import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const updateScript = path.join(repoRoot, 'scripts', 'axis-update-skills.mjs');
const createScript = path.join(repoRoot, 'scripts', 'axis-create-skill.mjs');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-skills-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeExecutable(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf8');
  await chmod(filePath, 0o755);
}

async function writePackagedSkill(repo, name = 'axis-demo-skill') {
  const skillDir = path.join(repo, 'skills', name);
  await mkdir(path.join(skillDir, 'references'), { recursive: true });
  await mkdir(path.join(skillDir, 'scripts'), { recursive: true });
  await mkdir(path.join(skillDir, 'agents'), { recursive: true });
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    ['---', `name: ${name}`, 'description: Use when testing packaged Axis skills. / 用于测试打包后的 Axis 技能。', '---', '', '# Demo', ''].join('\n'),
    'utf8',
  );
  await writeFile(path.join(skillDir, 'references', 'guide.md'), 'reference\n', 'utf8');
  await writeFile(path.join(skillDir, 'scripts', 'helper.py'), 'print("ok")\n', 'utf8');
  await writeFile(path.join(skillDir, 'agents', 'openai.yaml'), 'interface:\n  display_name: Demo\n', 'utf8');
}

async function writeFakeAxisCli(repo) {
  await writeExecutable(path.join(repo, 'dist', 'cli.js'), `#!/usr/bin/env node
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] !== 'install') throw new Error('expected install');
const agent = args[args.indexOf('--agent') + 1] || 'codex';
const repo = process.cwd();
const home = os.homedir();
const installed = [];
for (const entry of await readdir(path.join(repo, 'skills'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const source = path.join(repo, 'skills', entry.name);
  const target = path.join(home, agent === 'codex' ? '.codex' : '.claude', 'skills', entry.name);
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  installed.push({ skill: entry.name, target, status: 'copied' });
}
console.log(JSON.stringify({ ok: true, agent, installed }, null, 2));
`);
}

async function readTreeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readTreeFiles(filePath));
    } else if (entry.isFile()) {
      files.push(filePath);
    }
  }
  return files;
}

await withTempDir(async (tmp) => {
  const repo = path.join(tmp, 'axis-tools');
  const home = path.join(tmp, 'home');
  await mkdir(repo, { recursive: true });
  await mkdir(home, { recursive: true });
  await writePackagedSkill(repo);
  await writeFakeAxisCli(repo);

  const { stdout } = await execFileAsync(process.execPath, [
    updateScript,
    '--repo',
    repo,
    '--agent',
    'codex',
    '--no-pull',
    '--no-validate',
    '--json',
  ], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
    },
  });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.installed.some((item) => item.skill === 'axis-demo-skill'), true);
  const localSkill = path.join(home, '.codex', 'skills', 'axis-demo-skill');
  assert.equal(await readFile(path.join(localSkill, 'SKILL.md'), 'utf8').then((text) => text.includes('axis-demo-skill')), true);
  assert.equal(await readFile(path.join(localSkill, 'references', 'guide.md'), 'utf8'), 'reference\n');
  assert.equal(await readFile(path.join(localSkill, 'scripts', 'helper.py'), 'utf8'), 'print("ok")\n');
});

await withTempDir(async (tmp) => {
  const conversation = path.join(tmp, 'conversation.txt');
  await writeFile(
    conversation,
    '我们以后每次排查阿里云大屏都应该复用一套流程，可以沉淀一个 axis-dashboard-review skill。',
    'utf8',
  );
  const { stdout } = await execFileAsync(process.execPath, [
    createScript,
    '--scan-conversation',
    conversation,
    '--json',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].name, 'axis-dashboard-review');
  assert.match(result.candidates[0].reason, /沉淀|复用/);
});

await withTempDir(async (tmp) => {
  const conversation = path.join(tmp, 'conversation.txt');
  await writeFile(
    conversation,
    '这个 PetMall 专用流程以后也许可以沉淀一个 axis-petmall-cache skill。',
    'utf8',
  );
  const { stdout } = await execFileAsync(process.execPath, [
    createScript,
    '--scan-conversation',
    conversation,
    '--json',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.candidates.length, 0);
});

await withTempDir(async (tmp) => {
  const repo = path.join(tmp, 'axis-tools');
  const sourceRoot = path.join(tmp, 'local-skills');
  await mkdir(repo, { recursive: true });
  await mkdir(sourceRoot, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.email', 'axis@example.test'], { cwd: repo });
  await execFileAsync('git', ['config', 'user.name', 'Axis Test'], { cwd: repo });
  await mkdir(path.join(repo, 'scripts'), { recursive: true });
  await cp(path.join(repoRoot, 'scripts', 'axis-skill-deposit.mjs'), path.join(repo, 'scripts', 'axis-skill-deposit.mjs'), { recursive: true });

  const { stdout } = await execFileAsync(process.execPath, [
    createScript,
    '--repo',
    repo,
    '--source-root',
    sourceRoot,
    '--name',
    'axis-demo-created',
    '--description',
    'Use when testing Axis-created skills. / 用于测试 Axis 自动创建技能流程。',
    '--body',
    '# Axis Demo Created\\n\\nUse this skill for the test workflow.\\n',
    '--display-name',
    'Axis Demo Created',
    '--short-description',
    'Create demo Axis skill / 创建演示 Axis 技能',
    '--default-prompt',
    'Use $axis-demo-created to run the demo workflow.',
    '--no-validate',
    '--deposit',
    '--commit',
    '--message',
    'chore: add generated demo skill',
  ]);

  assert.match(stdout, /Created local skill axis-demo-created/);
  assert.match(stdout, /Deposited axis-demo-created/);
  const localSkill = path.join(sourceRoot, 'axis-demo-created');
  const localSkillBody = await readFile(path.join(localSkill, 'SKILL.md'), 'utf8');
  assert.equal(localSkillBody.includes('Use when testing Axis-created skills'), true);
  assert.equal(localSkillBody.includes('用于测试 Axis 自动创建技能流程'), true);
  assert.equal(localSkillBody.includes('Three-Step Work Contract'), true);
  assert.equal(localSkillBody.includes('Co-create with the user'), true);
  assert.equal(localSkillBody.includes('no more than 30%'), true);
  assert.equal(localSkillBody.includes('Light Adversarial Review'), true);
  assert.equal(localSkillBody.includes('challenge unsafe shortcuts'), true);
  assert.equal(localSkillBody.includes('After Use Deposition'), true);
  assert.equal(localSkillBody.includes('push to the remote repository when permissions allow'), true);
  const createdOpenAiYaml = await readFile(path.join(localSkill, 'agents', 'openai.yaml'), 'utf8');
  assert.match(createdOpenAiYaml, /^\s*display_name: "axis-demo-created"$/m);
  assert.doesNotMatch(createdOpenAiYaml, /^\s*display_name: "Axis Demo Created"$/m);
  assert.match(createdOpenAiYaml, /Create demo Axis skill \/ 创建演示 Axis 技能/);

  const manifest = JSON.parse(await readFile(path.join(repo, 'skills', 'manifest.json'), 'utf8'));
  assert.equal(manifest.skills[0].name, 'axis-demo-created');
  const { stdout: committed } = await execFileAsync('git', ['show', '--name-only', '--pretty=format:', 'HEAD'], { cwd: repo });
  assert.match(committed, /skills\/axis-demo-created\/SKILL.md/);
  assert.match(committed, /skills\/manifest.json/);
});

await withTempDir(async (tmp) => {
  const sourceRoot = path.join(tmp, 'local-skills');
  await mkdir(sourceRoot, { recursive: true });
  const error = await execFileAsync(process.execPath, [
    createScript,
    '--source-root',
    sourceRoot,
    '--name',
    'axis-english-only',
    '--description',
    'Use when testing English-only descriptions.',
    '--body',
    '# Axis English Only\\n',
    '--no-validate',
  ]).catch((caught) => caught);

  assert.equal(error.code, 1);
  assert.match(error.stderr, /bilingual English and Chinese/);
});

await withTempDir(async (tmp) => {
  const sourceRoot = path.join(tmp, 'orbit-skills');
  await mkdir(sourceRoot, { recursive: true });
  await execFileAsync(process.execPath, [
    createScript,
    '--source-root',
    sourceRoot,
    '--name',
    'orbit-demo-created',
    '--description',
    'Use when testing Orbit skill creation. / 用于测试 Orbit 技能创建。',
    '--body',
    '# Orbit Demo Created\n',
    '--no-validate',
  ]);

  const created = await readFile(path.join(sourceRoot, 'orbit-demo-created', 'SKILL.md'), 'utf8');
  assert.match(created, /^name: orbit-demo-created$/m);
  assert.match(created, /After Use Deposition/);
});

const manifest = JSON.parse(await readFile(path.join(repoRoot, 'skills', 'manifest.json'), 'utf8'));
const packagedSkillNames = [
  'axis-ali-dashboard',
  'axis-api-performance-tuning',
  'axis-arch-optimize',
  'axis-benchmark',
  'axis-bugfix',
  'axis-business-domain-doc',
  'axis-coding-capture',
  'axis-create-skill',
  'axis-db-design-doc',
  'axis-development-doc',
  'axis-doc-drift-capture',
  'axis-oss-publish',
  'axis-project-init',
  'axis-project-knowledge-bootstrap',
  'axis-review-summary',
  'axis-tech-design-doc',
  'axis-test-driven-development',
  'axis-test-report',
  'axis-testing',
  'axis-update',
  'axis-yunxiao-codeup',
];
const skillNamePattern = /^axis-[a-z0-9][a-z0-9-]*$/;
const packagedSkillDirs = (await readdir(path.join(repoRoot, 'skills'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(packagedSkillDirs, packagedSkillNames, 'packaged skill directories should match the manifest-backed skill list');
for (const skillName of packagedSkillDirs) {
  assert.match(skillName, skillNamePattern, `${skillName} should use axis-xxx naming`);
  const manifestEntry = manifest.skills.find((skill) => skill.name === skillName);
  assert.ok(manifestEntry, `${skillName} should be listed in the manifest`);
  assert.equal(manifestEntry.path, `skills/${skillName}`);
  assert.match(manifestEntry.name, skillNamePattern);

  const skillMd = await readFile(path.join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
  assert.match(skillMd, new RegExp(`^name: ${skillName}$`, 'm'));
  const openAiYaml = await readFile(path.join(repoRoot, 'skills', skillName, 'agents', 'openai.yaml'), 'utf8');
  assert.match(openAiYaml, new RegExp(`\\$${skillName}\\b`));
}

const consolidationAudit = await readFile(path.join(repoRoot, 'docs', 'axis-skill-consolidation-audit.md'), 'utf8');
for (const requiredText of [
  'Axis Skill Consolidation Audit',
  'Current Decision',
  'Rename Guard',
  'axis-development-doc',
  'axis-tech-design-doc',
  'axis-db-design-doc',
  'axis-project-knowledge-bootstrap',
  'axis-business-domain-doc',
  'axis-doc-drift-capture',
  'axis-coding-capture',
  'axis-test-report',
  'axis-oss-publish',
  'axis-create-skill',
  'axis-update',
  'Do not merge now',
]) {
  assert.match(consolidationAudit, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.equal(manifest.skills.some((skill) => /petmall/i.test(skill.name) || /PetMall/i.test(skill.description)), false);
assert.deepEqual(manifest.skills.map((skill) => skill.name).sort(), packagedSkillNames);

const v01CaptureSkills = [
  'axis-project-init',
  'axis-coding-capture',
  'axis-test-report',
  'axis-oss-publish',
];
for (const skillName of v01CaptureSkills) {
  const skill = manifest.skills.find((entry) => entry.name === skillName);
  assert.ok(skill, `${skillName} should be packaged`);
  assert.deepEqual(skill.files.sort(), ['SKILL.md', 'agents/openai.yaml']);
  assert.match(skill.description, /^Use when\b/);
  assert.match(skill.description, /[\u3400-\u9FFF]/);

  const body = await readFile(path.join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
  assert.match(body, new RegExp(`name: ${skillName}`));
  assert.match(body, /\.axis\/outbox/);
  assert.match(body, /release\.channel/);
  assert.match(body, /release\.gate/);
  assert.match(body, /private_beta/);
  assert.match(body, /axis oss-publish|axis-oss-publish/);
  assert.match(body, /After Use Deposition/);

  const openAiYaml = await readFile(path.join(repoRoot, 'skills', skillName, 'agents', 'openai.yaml'), 'utf8');
  assert.match(openAiYaml, /allow_implicit_invocation: true/);
}

const projectInitBody = await readFile(path.join(repoRoot, 'skills', 'axis-project-init', 'SKILL.md'), 'utf8');
assert.match(projectInitBody, /axis project-init/);
assert.match(projectInitBody, /\.axis\/config\.yml/);

const projectKnowledgeBootstrap = manifest.skills.find((skill) => skill.name === 'axis-project-knowledge-bootstrap');
assert.ok(projectKnowledgeBootstrap);
assert.deepEqual(projectKnowledgeBootstrap.files.sort(), ['SKILL.md', 'agents/openai.yaml']);
assert.match(projectKnowledgeBootstrap.description, /^Use when/);
assert.match(projectKnowledgeBootstrap.description, /[\u3400-\u9FFF]/);
const projectKnowledgeBootstrapBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-project-knowledge-bootstrap', 'SKILL.md'),
  'utf8',
);
for (const requiredText of [
  'Three-Step Work Contract',
  'Evidence Collection Rules',
  'routes',
  'controllers',
  'pages',
  'menus',
  'services',
  'entities',
  'migrations',
  'tests',
  'config',
  'docs',
  'project_technical_architecture',
  'project_business_architecture',
  'business_inventory',
  'doc_gap_report',
  'business_id',
  'aliases',
  'actors',
  'critical / high / medium / low',
  'active / deprecated / prototype / external_only / unknown',
  'missing / draft / review / approved / low_confidence / stale / blocked / not_applicable',
  'generate_domain_docs / review_evidence / mark_not_applicable / refresh_stale_docs / manual_confirm',
]) {
  assert.match(projectKnowledgeBootstrapBody, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(projectKnowledgeBootstrapBody, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);
assert.doesNotMatch(projectKnowledgeBootstrapBody, /\b(PetMall|petmall|owh-test|whalecloud|jiazhiwei|aliyuncs|codeup)\b/i);

const docDriftCapture = manifest.skills.find((skill) => skill.name === 'axis-doc-drift-capture');
assert.ok(docDriftCapture);
assert.deepEqual(docDriftCapture.files.sort(), ['SKILL.md', 'agents/openai.yaml', 'quick_validate.py']);
assert.match(docDriftCapture.description, /^Use when/);
assert.match(docDriftCapture.description, /[\u3400-\u9FFF]/);
const docDriftCaptureBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-doc-drift-capture', 'SKILL.md'),
  'utf8',
);
for (const requiredText of [
  'Three-Step Work Contract',
  'task_execution_record',
  'version_iteration_record',
  'affected_docs',
  'issue_id',
  'pr_url',
  'commit_sha',
  'changed_files',
  'verification',
  'completed_at',
  'risk_items',
  'follow_up_items',
  'code',
  'api',
  'schema',
  'cache',
  'permission',
  'business_flow',
  'unchanged',
  'needs_revision',
  'stale',
  'missing',
  'conflict',
  'No Silent Approved-Doc Rewrite',
  'doc_update_authorization',
  'raw logs',
  'credentials',
  'connection strings',
  'customer data',
]) {
  assert.match(docDriftCaptureBody, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(docDriftCaptureBody, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);
assert.doesNotMatch(docDriftCaptureBody, /\b(PetMall|petmall|owh-test|whalecloud|jiazhiwei|aliyuncs|codeup)\b/i);

const businessDomainDoc = manifest.skills.find((skill) => skill.name === 'axis-business-domain-doc');
assert.ok(businessDomainDoc);
assert.deepEqual(businessDomainDoc.files.sort(), ['SKILL.md', 'agents/openai.yaml', 'quick_validate.py']);
assert.match(businessDomainDoc.description, /^Use when/);
assert.match(businessDomainDoc.description, /[\u3400-\u9FFF]/);
const businessDomainDocBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-business-domain-doc', 'SKILL.md'),
  'utf8',
);
for (const requiredText of [
  'Three-Step Work Contract',
  'business_id',
  'business_inventory',
  'project_technical_architecture',
  'project_business_architecture',
  'domain_business_spec',
  'domain_technical_design',
  'business flow',
  'state model',
  'permissions',
  'table structure',
  'interfaces',
  'code locations',
  'test points',
  'axis-development-doc',
  'axis-tech-design-doc',
  'axis-db-design-doc',
  'missing_evidence',
  'assumptions',
  'doc_gap_report',
  'gap_items',
  'low_confidence',
  'conflict',
  'do not invent',
  'public-safe',
]) {
  assert.match(businessDomainDocBody, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(businessDomainDocBody, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);
assert.doesNotMatch(businessDomainDocBody, /\b(PetMall|petmall|owh-test|whalecloud|jiazhiwei|aliyuncs|codeup)\b/i);

const codingCaptureBody = await readFile(path.join(repoRoot, 'skills', 'axis-coding-capture', 'SKILL.md'), 'utf8');
for (const requiredSection of [
  '需求理解摘要',
  '实现摘要',
  '文件改动摘要',
  'API/数据模型变化',
  '验证命令',
  '风险和后续事项',
  '可复用经验卡片',
]) {
  assert.match(codingCaptureBody, new RegExp(requiredSection));
}

const testReportBody = await readFile(path.join(repoRoot, 'skills', 'axis-test-report', 'SKILL.md'), 'utf8');
for (const requiredSection of [
  'build/lint/test',
  '压测输入和结果摘要',
  '原始日志附件',
  '失败原因分析',
  '复测建议',
]) {
  assert.match(testReportBody, new RegExp(requiredSection));
}

const ossPublishBody = await readFile(path.join(repoRoot, 'skills', 'axis-oss-publish', 'SKILL.md'), 'utf8');
assert.match(ossPublishBody, /manifest\.json.*last/i);
assert.match(ossPublishBody, /--dry-run/);
assert.match(ossPublishBody, /--local-only/);

const publicCatalog = await readFile(path.join(repoRoot, 'catalog', 'skills.public.yaml'), 'utf8');
for (const skillName of v01CaptureSkills) {
  assert.doesNotMatch(publicCatalog, new RegExp(skillName), `${skillName} should stay out of the public catalog before the release gate passes`);
}

const benchmarkSkill = manifest.skills.find((skill) => skill.name === 'axis-benchmark');
assert.ok(benchmarkSkill);
const benchmarkScript = path.join(repoRoot, 'skills', 'axis-benchmark', 'scripts', 'core_api_benchmark.py');
const benchmarkBody = await readFile(path.join(repoRoot, 'skills', 'axis-benchmark', 'SKILL.md'), 'utf8');
assert.match(benchmarkBody, /Three-Step Work Contract/);
assert.match(benchmarkBody, /Scope Clarification Gate/);
assert.match(benchmarkBody, /Module Benchmark Workflow/);
assert.match(benchmarkBody, /local module -> remote dependency/i);
assert.match(benchmarkBody, /Process Failure Guard/);
assert.match(benchmarkBody, /Deposition Gate/i);
assert.match(benchmarkBody, /Do not treat "the benchmark finished" as complete/i);
const apiPerformanceTuning = manifest.skills.find((skill) => skill.name === 'axis-api-performance-tuning');
assert.ok(apiPerformanceTuning);
const apiPerformanceTuningBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-api-performance-tuning', 'SKILL.md'),
  'utf8',
);
assert.match(apiPerformanceTuningBody, /Plan Confirmation Gate/i);
assert.match(apiPerformanceTuningBody, /Do not write RED tests, edit code, change schema, or run implementation benchmarks/i);
assert.match(apiPerformanceTuningBody, /only after implementation and verification/i);
assert.match(apiPerformanceTuningBody, /update the relevant skill bundle/i);
assert.doesNotMatch(apiPerformanceTuningBody, /\b(petmall|petmallplatform|owh|whalecloud|jiazhiwei|aliyuncs\.com)\b/i);

const architectureOptimization = manifest.skills.find((skill) => skill.name === 'axis-arch-optimize');
assert.ok(architectureOptimization);
assert.equal(architectureOptimization.files.includes('SKILL.md'), true);
assert.equal(architectureOptimization.files.includes('agents/openai.yaml'), true);

const bugfixMethod = manifest.skills.find((skill) => skill.name === 'axis-bugfix');
assert.ok(bugfixMethod);

const reviewSummary = manifest.skills.find((skill) => skill.name === 'axis-review-summary');
assert.ok(reviewSummary);
assert.match(reviewSummary.description, /review a PR, change set, or document set/i);
assert.match(reviewSummary.description, /审核 PR、变更集或文档/);
assert.equal(reviewSummary.files.includes('SKILL.md'), true);
assert.equal(reviewSummary.files.includes('agents/openai.yaml'), true);
const reviewSummaryBody = await readFile(path.join(repoRoot, 'skills', 'axis-review-summary', 'SKILL.md'), 'utf8');
assert.match(reviewSummaryBody, /Review Brief/i);
assert.match(reviewSummaryBody, /待审文件清单/);
assert.match(reviewSummaryBody, /每个文件摘要/);
assert.match(reviewSummaryBody, /风险点/);
assert.match(reviewSummaryBody, /建议细查位置/);
assert.match(reviewSummaryBody, /原始路径/);
assert.match(reviewSummaryBody, /public-safe/i);
assert.match(reviewSummaryBody, /credential|secret|token/i);
assert.equal(bugfixMethod.files.includes('SKILL.md'), true);
assert.equal(bugfixMethod.files.includes('agents/openai.yaml'), true);
const bugfixMethodBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-bugfix', 'SKILL.md'),
  'utf8',
);
assert.match(bugfixMethodBody, /Evidence First/i);
assert.match(bugfixMethodBody, /classify.*external dependency.*application code/is);
assert.match(bugfixMethodBody, /RED.*GREEN/is);
assert.match(bugfixMethodBody, /Do not fix by theory alone/i);
assert.doesNotMatch(bugfixMethodBody, /\b(petmall|petmallplatform|owh|whalecloud|jiazhiwei|aliyuncs\.com)\b/i);
const architectureOptimizationBody = await readFile(path.join(repoRoot, 'skills', 'axis-arch-optimize', 'SKILL.md'), 'utf8');
assert.match(architectureOptimizationBody, /architecture boundary/i);
assert.match(architectureOptimizationBody, /cross-cutting/i);
assert.match(architectureOptimizationBody, /contract tests/i);
assert.match(architectureOptimizationBody, /migration/i);
assert.doesNotMatch(architectureOptimizationBody, /\b(petmall|petmallplatform|owh|whalecloud|jiazhiwei|aliyuncs\.com)\b/i);
assert.equal(benchmarkSkill.files.includes('scripts/core_api_benchmark.py'), true);

await withTempDir(async (tmp) => {
  let authCalls = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/auth/login' || request.url === '/app/auth/login') {
      authCalls += 1;
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 500, msg: 'auth should not be called' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 200, data: { ok: true } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    const endpointFile = path.join(tmp, 'public-endpoints.json');
    await writeFile(endpointFile, JSON.stringify({ endpoints: [{ name: 'health', path: '/health', auth: 'public' }] }), 'utf8');
    const { stdout } = await execFileAsync('python3', [
      benchmarkScript,
      '--base-url',
      `http://127.0.0.1:${address.port}`,
      '--endpoint-file',
      endpointFile,
      '--steps',
      '1',
      '--duration',
      '0.2',
      '--no-baseline',
      '--no-auth-sample',
    ]);
    assert.match(stdout, /PROFILE custom/);
    assert.equal(authCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

const axisTesting = manifest.skills.find((skill) => skill.name === 'axis-testing');
assert.ok(axisTesting);
assert.equal(axisTesting.files.includes('SKILL.md'), true);
assert.equal(axisTesting.files.includes('agents/openai.yaml'), true);
const axisTestingBody = await readFile(path.join(repoRoot, 'skills', 'axis-testing', 'SKILL.md'), 'utf8');
assert.match(axisTestingBody, /real side effects/i);
assert.match(axisTestingBody, /precondition/i);
assert.match(axisTestingBody, /status boundary/i);
assert.match(axisTestingBody, /progress/i);
assert.match(axisTestingBody, /cleanup/i);

const allSkillFiles = await readTreeFiles(path.join(repoRoot, 'skills'));
const manifestPath = path.join(repoRoot, 'skills', 'manifest.json');
const yunxiaoCodeupFiles = allSkillFiles.filter((filePath) => filePath.includes(`${path.sep}axis-yunxiao-codeup${path.sep}`));
const publicSkillText = (await Promise.all(
  allSkillFiles
    .filter((filePath) => filePath !== manifestPath && !yunxiaoCodeupFiles.includes(filePath))
    .map(async (filePath) => `${path.relative(repoRoot, filePath)}\n${await readFile(filePath, 'utf8')}`),
)).join('\n');
assert.doesNotMatch(publicSkillText, /PetMall|petmall|PETMALL|owh-test|whalecloud|jiazhiwei|aliyuncs|codeup/);
assert.ok(yunxiaoCodeupFiles.length > 0, 'axis-yunxiao-codeup should be packaged');
const yunxiaoCodeupText = (await Promise.all(
  yunxiaoCodeupFiles.map(async (filePath) => `${path.relative(repoRoot, filePath)}\n${await readFile(filePath, 'utf8')}`),
)).join('\n');
assert.match(yunxiaoCodeupText, /CODE_UP_API_TOKEN/);
assert.match(yunxiaoCodeupText, /x-yunxiao-token/);
assert.doesNotMatch(yunxiaoCodeupText, /PetMall|petmall|PETMALL|owh-test|whalecloud|jiazhiwei|66f37335691d6fdafb3ccf4e|114\.55\.114\.219/);

for (const skillName of packagedSkillNames) {
  const skillDir = path.join(repoRoot, 'skills', skillName);
  const skillMd = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  assert.match(skillMd, new RegExp(`name: ${skillName}`));
  assert.match(skillMd, /description: Use when/);
  const descriptionLine = skillMd.split('\n').find((line) => line.startsWith('description:')) ?? '';
  assert.match(descriptionLine, /[A-Za-z]/);
  assert.match(descriptionLine, /[\u3400-\u9FFF]/);
  assert.match(skillMd, /## After Use Deposition/);
  const openAiYaml = await readFile(path.join(skillDir, 'agents', 'openai.yaml'), 'utf8');
  assert.match(openAiYaml, new RegExp(`^\\s*display_name: "${skillName}"$`, 'm'));
  assert.equal(openAiYaml.includes(`$${skillName}`), true);
  const shortDescriptionLine = openAiYaml.split('\n').find((line) => line.trim().startsWith('short_description:')) ?? '';
  assert.match(shortDescriptionLine, /[A-Za-z]/);
  assert.match(shortDescriptionLine, /[\u3400-\u9FFF]/);
}

for (const skill of manifest.skills) {
  assert.match(skill.description, /^Use when/);
  assert.match(skill.description, /[A-Za-z]/);
  assert.match(skill.description, /[\u3400-\u9FFF]/);
}

const createSkillMd = await readFile(path.join(repoRoot, 'skills', 'axis-create-skill', 'SKILL.md'), 'utf8');
assert.match(createSkillMd, /scan.+whether/i);
assert.match(createSkillMd, /Bilingual Description Rule/);
assert.match(createSkillMd, /Three-Step Work Contract/);
assert.match(createSkillMd, /co-create the requirement with the user/i);
assert.match(createSkillMd, /Light Adversarial Review/);
assert.match(createSkillMd, /Coding\/design-type skills should include/i);
assert.match(createSkillMd, /Unified Skill Creation/);
assert.match(createSkillMd, /orbit-xxx/);
assert.match(createSkillMd, /Mandatory Before-Use Experience Application/);
assert.match(createSkillMd, /Model Reasoning Level/);
assert.doesNotMatch(createSkillMd.split('\n').find((line) => line.startsWith('description:')) ?? '', /create a new/i);

const techDesignDocMd = await readFile(path.join(repoRoot, 'skills', 'axis-tech-design-doc', 'SKILL.md'), 'utf8');
assert.match(techDesignDocMd, /Three-Step Work Contract/);
assert.match(techDesignDocMd, /Light Adversarial Review/);
assert.match(techDesignDocMd, /boundary risks/i);

const dbDesignDocMd = await readFile(path.join(repoRoot, 'skills', 'axis-db-design-doc', 'SKILL.md'), 'utf8');
assert.match(dbDesignDocMd, /Three-Step Work Contract/);
assert.match(dbDesignDocMd, /Light Adversarial Schema Review/);
assert.match(dbDesignDocMd, /derived display fields/i);

const developmentDocMd = await readFile(path.join(repoRoot, 'skills', 'axis-development-doc', 'SKILL.md'), 'utf8');
assert.match(developmentDocMd, /概要设计/);
assert.match(developmentDocMd, /详细设计/);
assert.match(developmentDocMd, /Document Selection Matrix/);
assert.match(developmentDocMd, /axis-tech-design-doc/);
assert.match(developmentDocMd, /axis-db-design-doc/);
assert.match(developmentDocMd, /Word\/DOCX/i);
assert.match(developmentDocMd, /Three-Step Work Contract/);
assert.match(developmentDocMd, /Light Adversarial Review/);

for (const skillName of [
  'axis-api-performance-tuning',
  'axis-benchmark',
  'axis-arch-optimize',
  'axis-bugfix',
  'axis-business-domain-doc',
  'axis-create-skill',
  'axis-development-doc',
  'axis-db-design-doc',
  'axis-doc-drift-capture',
  'axis-project-knowledge-bootstrap',
  'axis-tech-design-doc',
  'axis-test-driven-development',
]) {
  const skillMd = await readFile(path.join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
  assert.match(skillMd, /Three-Step Work Contract/);
  assert.match(skillMd, /30%/);
}
