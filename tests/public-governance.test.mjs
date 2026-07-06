import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

const requiredFiles = [
  '.axis/config.yml',
  'schemas/skill.meta.schema.json',
  'schemas/asset.meta.schema.json',
  'schemas/catalog.schema.json',
  'catalog/skills.public.yaml',
  'catalog/assets.public.yaml',
  'catalog/taxonomy.yaml',
  'docs/v0.2-project-knowledge-doc-protocol.md',
  'templates/skill/SKILL.md',
  'templates/skill/skill.meta.yaml',
  'templates/doc-asset/asset.md',
  'templates/doc-asset/asset.meta.yaml',
  'governance/CONTRIBUTING.md',
  'governance/SECURITY.md',
  'governance/REVIEW_CHECKLIST.md',
  'governance/DEPRECATION.md',
];

async function readRequired(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
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

for (const relativePath of requiredFiles) {
  const text = await readRequired(relativePath);
  assert.ok(text.trim().length > 0, `${relativePath} should not be empty`);
}

for (const schemaPath of requiredFiles.filter((file) => file.startsWith('schemas/'))) {
  const schema = JSON.parse(await readRequired(schemaPath));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
}

const skillTemplate = await readRequired('templates/skill/SKILL.md');
assert.match(skillTemplate, /^---\nname: axis-example-skill\n/ms);
assert.match(skillTemplate, /description: Use when/);
assert.match(skillTemplate, /## After Use Deposition/);

const skillMetaTemplate = await readRequired('templates/skill/skill.meta.yaml');
assert.match(skillMetaTemplate, /schema_version: 1/);
assert.match(skillMetaTemplate, /visibility: public/);
assert.match(skillMetaTemplate, /sensitivity: public/);

const assetTemplate = await readRequired('templates/doc-asset/asset.md');
assert.match(assetTemplate, /schema_version: 1/);
assert.match(assetTemplate, /visibility: public/);
assert.match(assetTemplate, /redaction_checked: true/);

const skillsCatalog = await readRequired('catalog/skills.public.yaml');
assert.match(skillsCatalog, /axis-example-skill/);
assert.match(skillsCatalog, /mock/);

const assetsCatalog = await readRequired('catalog/assets.public.yaml');
assert.match(assetsCatalog, /asset\.example\.public-design-note/);
assert.match(assetsCatalog, /redacted/);

const taxonomy = await readRequired('catalog/taxonomy.yaml');
assert.match(taxonomy, /schema_version: 1/);
assert.match(taxonomy, /public_safe/);

const axisConfig = await readRequired('.axis/config.yml');
for (const requiredText of [
  'contract_version: "0.1"',
  'slug: axis-tools',
  'display_name: axis-tools',
  'outbox_dir: .axis/outbox',
  'channel: private_beta',
  'gate: not_requested',
  'provider: aliyun-oss',
  'bucket: axis-v01-beta-packages-example',
  'prefix: axis/v0.1/private-beta/packages',
  'endpoint_env: ALIYUN_OSS_ENDPOINT',
  'region_env: ALIYUN_OSS_REGION',
  'access_key_id_env: ALIYUN_OSS_ACCESS_KEY_ID',
  'access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET',
  'security_token_env: ALIYUN_OSS_SECURITY_TOKEN',
  'project_init: axis-project-init',
  'coding_capture: axis-coding-capture',
  'test_report: axis-test-report',
  'oss_publish: axis-oss-publish',
]) {
  assert.match(axisConfig, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(axisConfig, /(?:access_key|secret|token|password)\s*:\s*[^_\s][^\n]+/i);

const v02Protocol = await readRequired('docs/v0.2-project-knowledge-doc-protocol.md');
for (const requiredText of [
  'Axis v0.2 Project Knowledge Document Protocol',
  'axis-project-knowledge-bootstrap',
  'axis-business-domain-doc',
  'axis-doc-drift-capture',
  'project_technical_architecture',
  'project_business_architecture',
  'business_inventory',
  'doc_gap_report',
  'business_id',
  'domain_business_spec',
  'domain_technical_design',
  'task_execution_record',
  'version_iteration_record',
  'affected_docs',
  'document_status',
  'public-safe',
  'do not invent',
  '.axis/docs/projects/{project_slug}',
]) {
  assert.match(v02Protocol, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(v02Protocol, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);
assert.doesNotMatch(v02Protocol, /\b(PetMall|petmall|owh-test|whalecloud|jiazhiwei|codeup)\b/i);

const publicSkeletonFiles = await Promise.all(
  (await Promise.all([
    readTreeFiles(path.join(repoRoot, 'schemas')),
    readTreeFiles(path.join(repoRoot, 'catalog')),
    readTreeFiles(path.join(repoRoot, 'templates')),
    readTreeFiles(path.join(repoRoot, 'governance')),
  ])).flat().map(async (filePath) => ({
    filePath,
    text: await readFile(filePath, 'utf8'),
  })),
);

for (const { filePath, text } of publicSkeletonFiles) {
  const relativePath = path.relative(repoRoot, filePath);
  assert.doesNotMatch(text, /mention:\/\/(?:member|agent)\//, `${relativePath} contains a side-effecting mention`);
  assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, `${relativePath} contains a UUID-like identifier`);
  assert.doesNotMatch(text, /(?:token|api[_-]?key|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}/i, `${relativePath} contains a credential-like assignment`);
  assert.doesNotMatch(text, /(?:customer|client|user)[-_ ]?(?:id|name)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{4,}/i, `${relativePath} contains a real-data-like field`);
  assert.doesNotMatch(text, /github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/\d+/i, `${relativePath} contains a real issue or PR URL`);
  assert.doesNotMatch(text, /codeup\.aliyun\.com|aliyuncs\.com|internal\.example/i, `${relativePath} contains a blocked host`);
}
