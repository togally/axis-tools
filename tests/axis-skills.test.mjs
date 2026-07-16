import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const updateScript = path.join(repoRoot, 'scripts', 'axis-skill-update.mjs');
const createScript = path.join(repoRoot, 'scripts', 'axis-skill-create.mjs');

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

async function writePackagedSkill(repo, name = 'axis-tools-skill-demo') {
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
const { cp, mkdir, readdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
(async () => {
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
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
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
  assert.equal(result.installed.some((item) => item.skill === 'axis-tools-skill-demo'), true);
  const localSkill = path.join(home, '.codex', 'skills', 'axis-tools-skill-demo');
  assert.equal(await readFile(path.join(localSkill, 'SKILL.md'), 'utf8').then((text) => text.includes('axis-tools-skill-demo')), true);
  assert.equal(await readFile(path.join(localSkill, 'references', 'guide.md'), 'utf8'), 'reference\n');
  assert.equal(await readFile(path.join(localSkill, 'scripts', 'helper.py'), 'utf8'), 'print("ok")\n');
});

await withTempDir(async (tmp) => {
  const conversation = path.join(tmp, 'conversation.txt');
  await writeFile(
    conversation,
    '我们以后每次排查阿里云大屏都应该复用一套流程，可以沉淀一个 axis-ops-dashboard-review skill。',
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
  assert.equal(result.candidates[0].name, 'axis-ops-dashboard-review');
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
    'axis-code-demo-created',
    '--description',
    'Use when testing Axis-created skills. / 用于测试 Axis 自动创建技能流程。',
    '--body',
    '# Axis Demo Created\\n\\nUse this skill for the test workflow.\\n',
    '--display-name',
    'Axis Demo Created',
    '--short-description',
    'Create demo Axis skill / 创建演示 Axis 技能',
    '--default-prompt',
    'Use $axis-code-demo-created to run the demo workflow.',
    '--no-validate',
    '--deposit',
    '--commit',
    '--message',
    'chore: add generated demo skill',
  ]);

  assert.match(stdout, /Created local skill axis-code-demo-created/);
  assert.match(stdout, /Deposited axis-code-demo-created/);
  const localSkill = path.join(sourceRoot, 'axis-code-demo-created');
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
  assert.match(createdOpenAiYaml, /^\s*display_name: "axis-code-demo-created"$/m);
  assert.doesNotMatch(createdOpenAiYaml, /^\s*display_name: "Axis Demo Created"$/m);
  assert.match(createdOpenAiYaml, /Create demo Axis skill \/ 创建演示 Axis 技能/);

  const manifest = JSON.parse(await readFile(path.join(repo, 'skills', 'manifest.json'), 'utf8'));
  assert.equal(manifest.skills[0].name, 'axis-code-demo-created');
  const { stdout: committed } = await execFileAsync('git', ['show', '--name-only', '--pretty=format:', 'HEAD'], { cwd: repo });
  assert.match(committed, /skills\/axis-code-demo-created\/SKILL.md/);
  assert.match(committed, /skills\/manifest.json/);
});

await withTempDir(async (tmp) => {
  const sourceRoot = path.join(tmp, 'local-skills');
  await mkdir(sourceRoot, { recursive: true });
  for (const name of ['axis-demo-created', 'axis-project-demo-created', 'axis-review-demo-created']) {
    const error = await execFileAsync(process.execPath, [
      createScript,
      '--source-root',
      sourceRoot,
      '--name',
      name,
      '--description',
      'Use when testing legacy Axis names. / 用于测试旧式 Axis 名称。',
      '--body',
      '# Legacy Axis Name\n',
      '--no-validate',
    ]).catch((caught) => caught);

    assert.equal(error.code, 1);
    assert.match(error.stderr, /axis-\{category\}-/);
  }
});

await withTempDir(async (tmp) => {
  const sourceRoot = path.join(tmp, 'local-skills');
  await mkdir(sourceRoot, { recursive: true });
  const error = await execFileAsync(process.execPath, [
    createScript,
    '--source-root',
    sourceRoot,
    '--name',
    'axis-doc-english-only',
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
  'axis-code-api-performance-tuning',
  'axis-code-arch-optimize',
  'axis-code-bugfix',
  'axis-code-capture',
  'axis-doc-dashboard',
  'axis-doc-development',
  'axis-doc-drift-capture',
  'axis-doc-project-init',
  'axis-doc-project-knowledge',
  'axis-integration-yunxiao-codeup',
  'axis-ops-ali-dashboard',
  'axis-ops-oss-publish',
  'axis-test-benchmark',
  'axis-test-report',
  'axis-test-side-effects',
  'axis-test-tdd',
  'axis-tools-prompt-create',
  'axis-tools-skill-create',
  'axis-tools-skill-update',
];
const skillNamePattern = /^axis-(?:code|doc|integration|ops|test|tools|trade)-[a-z0-9][a-z0-9-]*$/;
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
  'Consolidated Decision',
  'Rename Guard',
  'axis-doc-development',
  'axis-doc-tech-design',
  'axis-doc-db-design',
  'axis-doc-project-knowledge',
  'axis-doc-business-domain',
  'axis-doc-drift-capture',
  'Consolidate now',
]) {
  assert.match(consolidationAudit, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.equal(manifest.skills.some((skill) => /petmall/i.test(skill.name) || /PetMall/i.test(skill.description)), false);
assert.deepEqual(manifest.skills.map((skill) => skill.name).sort(), packagedSkillNames);

const v01CaptureSkills = [
  'axis-code-capture',
  'axis-test-report',
  'axis-ops-oss-publish',
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
  assert.match(body, /axis oss-publish|axis-ops-oss-publish/);
  assert.match(body, /After Use Deposition/);

  const openAiYaml = await readFile(path.join(repoRoot, 'skills', skillName, 'agents', 'openai.yaml'), 'utf8');
  if (skillName === 'axis-ops-oss-publish') assert.match(openAiYaml, /allow_implicit_invocation: true/);
  else assert.match(openAiYaml, /allow_implicit_invocation: false/);
}

const projectInitBody = await readFile(path.join(repoRoot, 'skills', 'axis-doc-project-init', 'SKILL.md'), 'utf8');
const projectInitConfirmationBundle = await readFile(
  path.join(repoRoot, 'skills', 'axis-doc-project-init', 'references', 'confirmation-bundle.md'),
  'utf8',
);
const projectInitContract = `${projectInitBody}\n${projectInitConfirmationBundle}`;
assert.match(projectInitBody, /axis project-init/);
assert.match(projectInitBody, /\.axis\/config\.yml/);
const projectInitSkill = manifest.skills.find((skill) => skill.name === 'axis-doc-project-init');
assert.ok(projectInitSkill);
assert.match(projectInitSkill.description, /v0\.2/);
assert.match(projectInitSkill.description, /[\u3400-\u9FFF]/);
for (const requiredText of [
  'Confirmation Workflow',
  'confirmation_bundle',
  'single_confirmation',
  'max_confirmation_rounds: 1',
  'final_confirmation: true',
  'rather than one field per turn',
  'one compact batch',
  'organization.id',
  'organization ID/registry',
  'project.slug',
  'display_name',
  'oss.profile',
  'release.channel',
  'release channel/gate',
  'package.outbox_dir',
  'document_language',
  'required_env',
  'presence booleans',
]) {
  assert.match(projectInitContract, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(projectInitBody, /Show every `fields\[\]` entry in order, one at a time/i);

const projectKnowledge = manifest.skills.find((skill) => skill.name === 'axis-doc-project-knowledge');
assert.ok(projectKnowledge);
for (const requiredFile of [
  'SKILL.md',
  'agents/openai.yaml',
  'quick_validate.py',
  'references/project-knowledge-contracts.md',
  'references/business-capability-detailed-design-template.md',
  'references/secondary-capability-boundary-matrix-v3.1.md',
  'references/secondary-capability-detailed-design-template.md',
  'references/secondary-capability-eval-cases.json',
  'scripts/evaluate_secondary_capability_prompts.mjs',
]) assert.ok(projectKnowledge.files.includes(requiredFile), `missing project-knowledge bundle file: ${requiredFile}`);
assert.match(projectKnowledge.description, /^Use when/);
assert.match(projectKnowledge.description, /[\u3400-\u9FFF]/);
const projectKnowledgeBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-doc-project-knowledge', 'SKILL.md'),
  'utf8',
);
const projectKnowledgeContracts = await readFile(
  path.join(repoRoot, 'skills', 'axis-doc-project-knowledge', 'references', 'project-knowledge-contracts.md'),
  'utf8',
);
const projectKnowledgeCore = `${projectKnowledgeBody}\n${projectKnowledgeContracts}`;
for (const requiredText of [
  'Three-Step Work Contract',
  'bootstrap',
  'scan_and_reconcile',
  'project_technical_architecture',
  'project_business_architecture',
  'business_inventory',
  'level1_capability_id',
  'secondary_capability_id',
  'business_id',
  'approved',
  'supersedes',
  'architecture/technical.md',
  'architecture/business.md',
  'business/capabilities/{level1_capability_id}/detailed-design.md',
  'business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md',
  'business/level1-capability-dependency-graph.yaml',
  'one independently reviewable business outcome',
  'secondary-capability-boundary-matrix-v3.1.md',
  'Run the project-wide inventory granularity gate before selecting affected documents',
  'Do not generate or reconcile detailed-design documents until the secondary-capability boundary inventory is locked',
  '$axis-tools-prompt-create',
  'reader_profile=compact',
  'does **not** require `3.N`',
  'FileName:begin-end#symbol',
  'one semantic layer',
  'gaps/doc-gap-report.md',
  'axis-doc-development',
  'OSS Upload Confirmation Gate',
  'oss_upload_readiness=unavailable|ready',
  'oss_upload_decision=pending|approved|declined',
  'axis validate-config --repo <repo>',
  'axis-ops-oss-publish',
  'exact pair',
  '_archive',
]) {
  assert.match(projectKnowledgeCore, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(projectKnowledgeBody, /requirement_design/);
assert.doesNotMatch(projectKnowledgeBody, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);
assert.doesNotMatch(projectKnowledgeBody, /\b(PetMall|petmall|owh-test|whalecloud|jiazhiwei|aliyuncs|codeup)\b/i);
assert.doesNotMatch(projectKnowledgeBody, /project_business_detailed_design|architecture\/business-detailed-design\.md/);
const businessCapabilityDetailedDesignTemplate = await readFile(
  path.join(
    repoRoot,
    'skills',
    'axis-doc-project-knowledge',
    'references',
    'business-capability-detailed-design-template.md',
  ),
  'utf8',
);
const assertNoNestedHtmlComments = (body, label) => {
  let inComment = false;
  for (const token of body.matchAll(/<!--|-->/g)) {
    if (token[0] === '<!--') {
      assert.equal(inComment, false, `${label} must not nest HTML comments`);
      inComment = true;
    } else {
      assert.equal(inComment, true, `${label} has an unmatched HTML comment close`);
      inComment = false;
    }
  }
  assert.equal(inComment, false, `${label} has an unclosed HTML comment`);
};
assertNoNestedHtmlComments(
  businessCapabilityDetailedDesignTemplate,
  'business capability detailed-design template',
);
for (const requiredText of [
  '# {project_name} · {level1_capability_name} 一级能力接口详情设计',
  'level1_capability_id',
  'secondary_capabilities',
  'user_journey_design_status=detailed',
  'user_journey_coverage',
  'complete|partial',
  'user_journey_gap_id',
  '对外业务能力与接口实现',
  'journey_id',
  '用户/角色',
  '提供的业务',
  '用户目标',
  '用户怎么操作',
  '接口/入口',
  'Controller/Handler',
  'Service/UseCase',
  '读取数据',
  '写入/产生数据',
  '用户可见结果',
  '二级能力详情',
  '证据',
  'level1_journey_id',
  'flow_id',
  'api_id',
  '二级能力与接口实现逻辑',
  '```mermaid',
  'flowchart',
  '业务语义',
  '专业术语',
  '表结构设计',
  'table_design_status',
  'table_design_coverage',
  'table_design_gap_id',
  'erDiagram',
  '字段',
  '类型',
  '键/约束',
  '不得遗漏任何二级能力',
  '返回业务架构',
  '上一个能力',
  '下一个能力',
]) {
  assert.match(
    businessCapabilityDetailedDesignTemplate,
    new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
}
assert.doesNotMatch(businessCapabilityDetailedDesignTemplate, /一级能力详细设计说明书/);
assert.doesNotMatch(
  businessCapabilityDetailedDesignTemplate,
  /^##\s+\d+\.?\s+用户旅程覆盖契约\s*$/m,
);
assert.doesNotMatch(
  businessCapabilityDetailedDesignTemplate,
  /^##\s+\d+\.?\s+(?:用户业务操作全景|跨二级能力用户旅程|共享业务语义与一级治理)\s*$/m,
);
assert.doesNotMatch(
  businessCapabilityDetailedDesignTemplate,
  /^\|\s*`journey_id`\s*\|\s*用户\/角色\s*\|\s*所属二级能力\/模块\s*\|/m,
);
assert.match(businessCapabilityDetailedDesignTemplate, /<!-- axis-document-metadata/);
assert.match(businessCapabilityDetailedDesignTemplate, /<!-- axis-evidence:/);
assert.match(businessCapabilityDetailedDesignTemplate, /每个节点只能表达一个最小业务动作、业务判断、业务状态或用户可见结果/);
assert.match(businessCapabilityDetailedDesignTemplate, /同一张图不得混用业务节点与代码方法节点/);
assert.doesNotMatch(businessCapabilityDetailedDesignTemplate, /^>\s*文档状态：/m);
assert.doesNotMatch(businessCapabilityDetailedDesignTemplate, /^>\s*文档版本：/m);
assert.match(
  businessCapabilityDetailedDesignTemplate,
  /^\| 二级能力 \| 业务摘要 \| 详情 \|$/m,
);
for (const requiredHeading of [
  '## 2. 二级能力完整性与导航',
  '## 3. 对外业务能力与接口实现',
  '## 4. 业务语义',
  '## 5. 表结构设计',
  '## 6. 缺口与覆盖说明',
  '## 7. 文档完整性校验',
  '## 8. 文档导航与证据索引',
]) {
  assert.match(businessCapabilityDetailedDesignTemplate, new RegExp(`^${requiredHeading}$`, 'm'));
}

const level1CapabilityDependencyGraphTemplate = await readFile(
  path.join(
    repoRoot,
    'skills',
    'axis-doc-project-knowledge',
    'references',
    'level1-capability-dependency-graph-template.yaml',
  ),
  'utf8',
);
for (const requiredText of [
  'axis.level1_capability_dependency_graph',
  'pending_level1_completion',
  'model_synthesis',
  'not_derived',
  'from_level1_capability_id',
  'to_level1_capability_id',
  'relation_type',
  'stage',
  'journey_ids',
  'api_ids',
  'evidence_refs',
]) {
  assert.match(level1CapabilityDependencyGraphTemplate, new RegExp(requiredText));
}

const secondaryCapabilityDetailedDesignTemplate = await readFile(
  path.join(
    repoRoot,
    'skills',
    'axis-doc-project-knowledge',
    'references',
    'secondary-capability-detailed-design-template.md',
  ),
  'utf8',
);
assertNoNestedHtmlComments(
  secondaryCapabilityDetailedDesignTemplate,
  'secondary capability detailed-design template',
);
for (const requiredText of [
  '详细设计说明书',
  'secondary_capability_id',
  '返回能力总览',
  '上一个二级能力',
  '下一个二级能力',
  'interface_design_status',
  'interface_coverage',
  '能力定位与边界',
  '调用主体、权限与接口矩阵',
  '主体/角色',
  '所需权限/策略',
  '可调用接口/能力',
  '数据范围',
  '授权证据',
  '接口清单与代码追溯',
  '5.1.2 内部处理逻辑',
  '5.1.6 认证与授权执行',
  '5.1.7 事务、并发、性能与容错',
  '5.1.8 安全、测试与验收',
  '5.2.6 认证与授权执行',
  '5.2.7 事务、并发、性能与容错',
  '5.2.8 安全、测试与验收',
  '能力级流程与跨接口关系',
  '接口详细设计',
  '接口清单与代码追溯',
  '请求字段',
  '响应字段',
  '错误码与异常映射',
  '项目 | 内容',
  '实现层 | 精确定位 | 职责',
  'HTTP / EVENT / TOPIC / JOB / COMMAND',
  'interface_not_applicable_reason',
  'interface_not_applicable_evidence',
  '业务相关字段',
  '文件名:起始行-结束行#符号',
  '<!-- axis-document-metadata',
  '<!-- axis-evidence:',
]) {
  assert.match(secondaryCapabilityDetailedDesignTemplate, new RegExp(requiredText));
}
assert.doesNotMatch(
  secondaryCapabilityDetailedDesignTemplate,
  /^##\s+\d+\.?\s+(?:身份、职责与 business_id 映射|参与者、权限与数据范围)\s*$/m,
);
assert.doesNotMatch(secondaryCapabilityDetailedDesignTemplate, /^>\s*文档状态：/m);
assert.doesNotMatch(secondaryCapabilityDetailedDesignTemplate, /^>\s*文档版本：/m);
assert.doesNotMatch(secondaryCapabilityDetailedDesignTemplate, /^##\s+\d+\.?\s+代码对象与关系\s*$/m);
assert.match(secondaryCapabilityDetailedDesignTemplate, /同一张图只选择一种视角：业务或方法/);
assert.match(secondaryCapabilityDetailedDesignTemplate, /每个方法节点只写一个具体方法调用/);
for (const legacyTopLevelTitle of [
  '实体、表与对象关系',
  '表结构设计',
  '事务、并发、性能与容错',
  '安全、测试与验收',
  '端到端追溯矩阵',
]) {
  assert.doesNotMatch(
    secondaryCapabilityDetailedDesignTemplate,
    new RegExp(`^##\\s+\\d+\\.?\\s+${legacyTopLevelTitle}\\s*$`, 'm'),
  );
}
assert.doesNotMatch(businessCapabilityDetailedDesignTemplate, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);

const docDriftCapture = manifest.skills.find((skill) => skill.name === 'axis-doc-drift-capture');
assert.ok(docDriftCapture);
for (const requiredFile of [
  'SKILL.md',
  'agents/openai.yaml',
  'quick_validate.py',
  'references/drift-classification.md',
  'references/record-schemas.md',
]) assert.ok(docDriftCapture.files.includes(requiredFile), `missing drift-capture bundle file: ${requiredFile}`);
assert.match(docDriftCapture.description, /^Use when/);
assert.match(docDriftCapture.description, /[\u3400-\u9FFF]/);
const docDriftCaptureBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-doc-drift-capture', 'SKILL.md'),
  'utf8',
);
const docDriftCaptureContracts = `${await readFile(
  path.join(repoRoot, 'skills', 'axis-doc-drift-capture', 'references', 'record-schemas.md'),
  'utf8',
)}\n${await readFile(
  path.join(repoRoot, 'skills', 'axis-doc-drift-capture', 'references', 'drift-classification.md'),
  'utf8',
)}`;
const docDriftCaptureBundle = `${docDriftCaptureBody}\n${docDriftCaptureContracts}`;
for (const requiredText of [
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
  'Never mutate an `approved` document in place',
  'doc_update_authorization',
  'raw logs',
  'credentials',
  'connection strings',
  'customer/account data',
]) {
  assert.match(docDriftCaptureBundle, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(docDriftCaptureBody, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);
assert.doesNotMatch(docDriftCaptureBody, /\b(PetMall|petmall|owh-test|whalecloud|jiazhiwei|aliyuncs|codeup)\b/i);

const codingCaptureBody = await readFile(path.join(repoRoot, 'skills', 'axis-code-capture', 'SKILL.md'), 'utf8');
for (const requiredSection of [
  'requirement',
  'implementation',
  'changed scope',
  'API/data/config impact',
  'verification',
  'risk',
  'reusable lessons',
  'manifest.json',
  'experience.md',
]) {
  assert.match(codingCaptureBody, new RegExp(requiredSection, 'i'));
}

const testReportBody = await readFile(path.join(repoRoot, 'skills', 'axis-test-report', 'SKILL.md'), 'utf8');
for (const requiredSection of [
  'build, lint, test, benchmark',
  'workload or inputs',
  'results',
  'failures',
  'skipped checks',
  'retest guidance',
]) {
  assert.match(testReportBody, new RegExp(requiredSection, 'i'));
}

const ossPublishBody = await readFile(path.join(repoRoot, 'skills', 'axis-ops-oss-publish', 'SKILL.md'), 'utf8');
assert.match(ossPublishBody, /manifest\.json.*last/i);
assert.match(ossPublishBody, /--dry-run/);
assert.match(ossPublishBody, /--local-only/);

const publicCatalog = await readFile(path.join(repoRoot, 'catalog', 'skills.public.yaml'), 'utf8');
for (const skillName of v01CaptureSkills) {
  assert.doesNotMatch(publicCatalog, new RegExp(skillName), `${skillName} should stay out of the public catalog before the release gate passes`);
}

const benchmarkSkill = manifest.skills.find((skill) => skill.name === 'axis-test-benchmark');
assert.ok(benchmarkSkill);
const benchmarkScript = path.join(repoRoot, 'skills', 'axis-test-benchmark', 'scripts', 'core_api_benchmark.py');
const benchmarkBody = await readFile(path.join(repoRoot, 'skills', 'axis-test-benchmark', 'SKILL.md'), 'utf8');
assert.match(benchmarkBody, /Three-Step Work Contract/);
assert.match(benchmarkBody, /Scope Clarification Gate/);
assert.match(benchmarkBody, /Module Benchmark Workflow/);
assert.match(benchmarkBody, /local module -> remote dependency/i);
assert.match(benchmarkBody, /Process Failure Guard/);
assert.match(benchmarkBody, /Deposition Gate/i);
assert.match(benchmarkBody, /Do not treat "the benchmark finished" as complete/i);
const apiPerformanceTuning = manifest.skills.find((skill) => skill.name === 'axis-code-api-performance-tuning');
assert.ok(apiPerformanceTuning);
const apiPerformanceTuningBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-code-api-performance-tuning', 'SKILL.md'),
  'utf8',
);
assert.match(apiPerformanceTuningBody, /Plan Confirmation Gate/i);
assert.match(apiPerformanceTuningBody, /Do not write RED tests, edit code, change schema, or run implementation benchmarks/i);
assert.match(apiPerformanceTuningBody, /only after implementation and verification/i);
assert.match(apiPerformanceTuningBody, /update the relevant skill bundle/i);
assert.doesNotMatch(apiPerformanceTuningBody, /\b(petmall|petmallplatform|owh|whalecloud|jiazhiwei|aliyuncs\.com)\b/i);

const architectureOptimization = manifest.skills.find((skill) => skill.name === 'axis-code-arch-optimize');
assert.ok(architectureOptimization);
assert.equal(architectureOptimization.files.includes('SKILL.md'), true);
assert.equal(architectureOptimization.files.includes('agents/openai.yaml'), true);

const bugfixMethod = manifest.skills.find((skill) => skill.name === 'axis-code-bugfix');
assert.ok(bugfixMethod);

assert.equal(bugfixMethod.files.includes('SKILL.md'), true);
assert.equal(bugfixMethod.files.includes('agents/openai.yaml'), true);
const bugfixMethodBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-code-bugfix', 'SKILL.md'),
  'utf8',
);
assert.match(bugfixMethodBody, /Evidence First/i);
assert.match(bugfixMethodBody, /classify.*external dependency.*application code/is);
assert.match(bugfixMethodBody, /RED.*GREEN/is);
assert.match(bugfixMethodBody, /Do not fix by theory alone/i);
assert.doesNotMatch(bugfixMethodBody, /\b(petmall|petmallplatform|owh|whalecloud|jiazhiwei|aliyuncs\.com)\b/i);
const architectureOptimizationBody = await readFile(path.join(repoRoot, 'skills', 'axis-code-arch-optimize', 'SKILL.md'), 'utf8');
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

const axisTesting = manifest.skills.find((skill) => skill.name === 'axis-test-side-effects');
assert.ok(axisTesting);
assert.equal(axisTesting.files.includes('SKILL.md'), true);
assert.equal(axisTesting.files.includes('agents/openai.yaml'), true);
const axisTestingBody = await readFile(path.join(repoRoot, 'skills', 'axis-test-side-effects', 'SKILL.md'), 'utf8');
assert.match(axisTestingBody, /real side effects/i);
assert.match(axisTestingBody, /precondition/i);
assert.match(axisTestingBody, /status boundary/i);
assert.match(axisTestingBody, /progress/i);
assert.match(axisTestingBody, /cleanup/i);

const allSkillFiles = await readTreeFiles(path.join(repoRoot, 'skills'));
const manifestPath = path.join(repoRoot, 'skills', 'manifest.json');
const routingPath = path.join(repoRoot, 'skills', 'routing.json');
const yunxiaoCodeupFiles = allSkillFiles.filter((filePath) => filePath.includes(`${path.sep}axis-integration-yunxiao-codeup${path.sep}`));
const publicSkillText = (await Promise.all(
  allSkillFiles
    .filter((filePath) => ![manifestPath, routingPath].includes(filePath) && !yunxiaoCodeupFiles.includes(filePath))
    .map(async (filePath) => `${path.relative(repoRoot, filePath)}\n${await readFile(filePath, 'utf8')}`),
)).join('\n');
assert.doesNotMatch(publicSkillText, /PetMall|petmall|PETMALL|owh-test|whalecloud|jiazhiwei|aliyuncs|codeup/);
assert.ok(yunxiaoCodeupFiles.length > 0, 'axis-integration-yunxiao-codeup should be packaged');
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

const createSkillMd = await readFile(path.join(repoRoot, 'skills', 'axis-tools-skill-create', 'SKILL.md'), 'utf8');
assert.match(createSkillMd, /scan.+whether/i);
assert.match(createSkillMd, /Bilingual Description Rule/);
assert.match(createSkillMd, /Three-Step Work Contract/);
assert.match(createSkillMd, /co-create the requirement with the user/i);
assert.match(createSkillMd, /Light Adversarial Review/);
assert.match(createSkillMd, /Coding\/design-type skills should include/i);
assert.match(createSkillMd, /Unified Skill Creation/);
assert.match(createSkillMd, /orbit-xxx/);
assert.match(createSkillMd, /Naming Taxonomy/);
assert.match(createSkillMd, /axis-doc-xxx/);
assert.match(createSkillMd, /axis-code-xxx/);
assert.match(createSkillMd, /axis-doc-project-init/);
assert.doesNotMatch(createSkillMd, /\| Project \|/);
assert.match(createSkillMd, /Mandatory Before-Use Experience Application/);
assert.match(createSkillMd, /Model Reasoning Level/);
assert.doesNotMatch(createSkillMd.split('\n').find((line) => line.startsWith('description:')) ?? '', /create a new/i);

const developmentDocMd = await readFile(path.join(repoRoot, 'skills', 'axis-doc-development', 'SKILL.md'), 'utf8');
assert.match(developmentDocMd, /development_document_set/);
assert.match(developmentDocMd, /project_knowledge_change_set/);
assert.match(developmentDocMd, /Document Production/);
assert.match(developmentDocMd, /master_draft/);
assert.match(developmentDocMd, /database_design/);
assert.match(developmentDocMd, /archive_document\.py/);
assert.match(developmentDocMd, /Never call a real OSS upload/);
assert.match(developmentDocMd, /\$axis-doc-project-knowledge/);
assert.doesNotMatch(developmentDocMd, /Mandatory OSS Synchronization Gate|OSS-first|axis project-knowledge-capture|axis oss-publish/);
assert.match(developmentDocMd, /Three-Step Work Contract/);
assert.match(developmentDocMd, /light adversarial review/i);

for (const skillName of [
  'axis-code-api-performance-tuning',
  'axis-test-benchmark',
  'axis-code-arch-optimize',
  'axis-code-bugfix',
  'axis-tools-skill-create',
  'axis-doc-development',
  'axis-doc-project-knowledge',
  'axis-test-tdd',
]) {
  const skillMd = await readFile(path.join(repoRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
  assert.match(skillMd, /Three-Step Work Contract/);
  assert.match(skillMd, /30%/);
}
