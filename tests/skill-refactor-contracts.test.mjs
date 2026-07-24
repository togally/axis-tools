import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const skillsRoot = path.join(repoRoot, 'skills');
const manifest = JSON.parse(await readFile(path.join(skillsRoot, 'manifest.json'), 'utf8'));
const routing = JSON.parse(await readFile(path.join(skillsRoot, 'routing.json'), 'utf8'));

const requiredSections = [
  'When to Use',
  'Do Not Use',
  'Inputs',
  'Outputs',
  'Safety and Boundaries',
  'Checks',
  'After Use Deposition',
];
const adversarialRequired = new Set([
  'axis-code-api-performance-tuning',
  'axis-code-arch-optimize',
  'axis-code-bugfix',
  'axis-doc-dashboard',
  'axis-doc-development',
  'axis-doc-project-init',
  'axis-doc-project-knowledge',
  'axis-integration-doudian-merchandising',
  'axis-integration-yunxiao-codeup',
  'axis-ops-ali-dashboard',
  'axis-test-benchmark',
  'axis-test-side-effects',
  'axis-test-tdd',
  'axis-tools-prompt-create',
  'axis-tools-skill-create',
]);

assert.equal(routing.version, 1);
assert.equal(Array.isArray(routing.skills), true);
const manifestNames = manifest.skills.map((skill) => skill.name).sort();
const routedNames = routing.skills.map((skill) => skill.name).sort();
assert.deepEqual(routedNames, manifestNames, 'routing registry must cover every packaged skill exactly once');
for (const retiredName of [
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
  'axis-doc-dashbord',
  'axis-skill-create',
  'axis-skill-update',
]) {
  assert.equal(manifestNames.includes(retiredName), false, `${retiredName} must not remain packaged`);
  assert.equal(routedNames.includes(retiredName), false, `${retiredName} must not remain routable`);
}

const uniqueOutcomes = new Set();
const routingByName = new Map(routing.skills.map((entry) => [entry.name, entry]));
for (const entry of routing.skills) {
  assert.match(entry.primary_outcome, /\S/);
  assert.match(entry.use_when, /\S/);
  assert.match(entry.do_not_use_when, /\S/);
  assert.equal(uniqueOutcomes.has(entry.primary_outcome), false, `duplicate primary outcome: ${entry.primary_outcome}`);
  uniqueOutcomes.add(entry.primary_outcome);
  assert.equal(Array.isArray(entry.handoffs), true);
  for (const handoff of entry.handoffs) {
    assert.ok(manifestNames.includes(handoff), `${entry.name} has unknown handoff ${handoff}`);
    assert.notEqual(handoff, entry.name, `${entry.name} must not hand off to itself`);
  }
}

const visiting = new Set();
const visited = new Set();
function assertNoHandoffCycle(name, chain = []) {
  if (visiting.has(name)) throw new Error(`routing handoff cycle: ${[...chain, name].join(' -> ')}`);
  if (visited.has(name)) return;
  visiting.add(name);
  const entry = routingByName.get(name);
  for (const handoff of entry.handoffs) assertNoHandoffCycle(handoff, [...chain, name]);
  visiting.delete(name);
  visited.add(name);
}
for (const name of manifestNames) assertNoHandoffCycle(name);

for (const skill of manifest.skills) {
  const skillDir = path.join(repoRoot, skill.path);
  const skillMd = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  const lines = skillMd.split('\n').length;
  assert.ok(lines <= 180, `${skill.name} SKILL.md should stay concise; move depth to references (found ${lines} lines)`);
  assert.match(skillMd, new RegExp(`^name: ${skill.name}$`, 'm'));
  assert.equal(skill.path, `skills/${skill.name}`);
  const description = skillMd.split('\n').find((line) => line.startsWith('description:')) ?? '';
  assert.match(description, /^description: Use when\b/);
  assert.match(description, /[A-Za-z]/);
  assert.match(description, /[\u3400-\u9FFF]/);
  assert.equal(skill.description, description.slice('description:'.length).trim(), `${skill.name} manifest description must match frontmatter`);
  for (const section of requiredSections) {
    assert.match(skillMd, new RegExp(`^## ${section}$`, 'm'), `${skill.name} missing ${section}`);
  }
  if (adversarialRequired.has(skill.name)) {
    assert.match(skillMd, /^## Three-Step Work Contract$/m, `${skill.name} missing Three-Step Work Contract`);
    assert.match(skillMd, /^## Light Adversarial Review$/m, `${skill.name} missing Light Adversarial Review`);
    assert.match(skillMd, /30%/);
  }

  const openAiYaml = await readFile(path.join(skillDir, 'agents', 'openai.yaml'), 'utf8');
  assert.match(openAiYaml, new RegExp(`^\\s*display_name: "${skill.name}"$`, 'm'));
  assert.match(openAiYaml, new RegExp(`\\$${skill.name}\\b`));
  const shortDescription = openAiYaml.split('\n').find((line) => line.trim().startsWith('short_description:')) ?? '';
  assert.match(shortDescription, /[A-Za-z]/);
  assert.match(shortDescription, /[\u3400-\u9FFF]/);

  async function bundleFiles(dir, prefix = '') {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store' || entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) files.push(...await bundleFiles(path.join(dir, entry.name), relative));
      else if (entry.isFile()) files.push(relative);
    }
    return files;
  }
  assert.deepEqual(
    [...skill.files].sort(),
    (await bundleFiles(skillDir)).sort(),
    `${skill.name} manifest files must exactly match its bundle`,
  );
}

for (const [from, to] of [
  ['axis-code-api-performance-tuning', 'axis-test-benchmark'],
  ['axis-code-bugfix', 'axis-test-tdd'],
  ['axis-doc-development', 'axis-doc-project-knowledge'],
  ['axis-doc-project-knowledge', 'axis-tools-prompt-create'],
  ['axis-doc-project-knowledge', 'axis-ops-oss-publish'],
  ['axis-integration-doudian-merchandising', 'axis-tools-prompt-create'],
  ['axis-tools-skill-create', 'axis-tools-prompt-create'],
  ['axis-tools-skill-create', 'axis-tools-skill-update'],
]) {
  assert.ok(routingByName.get(from).handoffs.includes(to), `${from} must declare handoff to ${to}`);
}

assert.equal(
  routingByName.get('axis-doc-development').handoffs.includes('axis-ops-oss-publish'),
  false,
  'feature development must hand project knowledge changes to the canonical knowledge owner before publishing',
);

for (const name of ['axis-code-capture', 'axis-test-report', 'axis-test-tdd']) {
  const skill = manifest.skills.find((entry) => entry.name === name);
  const openAiYaml = await readFile(path.join(repoRoot, skill.path, 'agents', 'openai.yaml'), 'utf8');
  assert.match(openAiYaml, /allow_implicit_invocation: false/, `${name} must require explicit selection or an owning-skill handoff`);
}
