import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

const requiredFiles = [
  '.axis/config.yml',
  '.axis/organizations.yml',
  'schemas/skill.meta.schema.json',
  'schemas/asset.meta.schema.json',
  'schemas/catalog.schema.json',
  'catalog/skills.public.yaml',
  'catalog/assets.public.yaml',
  'catalog/taxonomy.yaml',
  'docs/v0.2-project-knowledge-doc-protocol.md',
  'docs/v0.2-contract.md',
  'schemas/protocol-migration.schema.json',
  'schemas/project-init-inspection.schema.json',
  'schemas/project-init-answers.schema.json',
  'protocols/migrations/0.1-to-0.2.yml',
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
assert.match(skillTemplate, /^---\nname: axis-tools-skill-example\n/ms);
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
assert.match(skillsCatalog, /axis-tools-skill-example/);
assert.match(skillsCatalog, /mock/);

const assetsCatalog = await readRequired('catalog/assets.public.yaml');
assert.match(assetsCatalog, /asset\.example\.public-design-note/);
assert.match(assetsCatalog, /redacted/);

const taxonomy = await readRequired('catalog/taxonomy.yaml');
assert.match(taxonomy, /schema_version: 1/);
assert.match(taxonomy, /public_safe/);

const axisConfig = await readRequired('.axis/config.yml');
for (const requiredText of [
  'contract_version: "0.2"',
  'organization:',
  'id: org_axis_tools',
  'registry: .axis/organizations.yml',
  'slug: axis-tools',
  'display_name: axis-tools',
  'outbox_dir: .axis/outbox',
  'channel: private_beta',
  'gate: not_requested',
  'provider: aliyun-oss',
  'profile: default_jiazhiwei',
  'project_init: axis-doc-project-init',
  'coding_capture: axis-code-capture',
  'test_report: axis-test-report',
  'oss_publish: axis-ops-oss-publish',
]) {
  assert.match(axisConfig, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(axisConfig, /(?:access_key|secret|token|password)\s*:\s*[^_\s][^\n]+/i);

const registry = await readRequired('.axis/organizations.yml');
for (const requiredText of [
  'schema: axis.organization_registry',
  'schema_version: "0.2"',
  'id: org_axis_tools',
  'name: default_jiazhiwei',
  'bucket: ohw-jzw',
  'prefix: jasperWei',
  'endpoint_env: ALIYUN_OSS_ENDPOINT',
  'access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET',
]) {
  assert.match(registry, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const v02Protocol = await readRequired('docs/v0.2-project-knowledge-doc-protocol.md');
for (const requiredText of [
  'Axis v0.2 Project Knowledge Document Protocol',
  'axis-doc-project-knowledge',
  'axis-doc-development',
  'axis-doc-drift-capture',
  'project_technical_architecture',
  'project_business_architecture',
  'business_capability_detailed_design',
  'secondary_capability_detailed_design',
  'requirement_detailed_design',
  'business_inventory',
  'doc_gap_report',
  'business_id',
  'feature_detailed_design',
  'Feature Resolution Confirmation Gate',
  'zero_matches',
  'multiple_matches',
  'confirmed_feature',
  'confirmed_planned_feature',
  'master_draft',
  'planned_feature_generation',
  'implemented_feature_iteration',
  'task_execution_record',
  'version_iteration_record',
  'affected_docs',
  'document_status',
  'public-safe',
  'do not invent',
  '.axis/docs/orgs/{organization_id}/projects/{project_slug}',
  'ISO/IEC/IEEE 42010:2022',
  'arc42',
  'C4',
  'ISO/IEC 25010:2023',
  'GB/T 8567-2006',
  'IEEE 1016-2009',
  'business/capabilities/{level1_capability_id}/detailed-design.md',
  'business/capabilities/{level1_capability_id}/secondary-capabilities/{secondary_capability_id}/detailed-design.md',
  'business/capabilities/{level1_capability_id}/requirements/{requirement_id}/detailed-design.md',
  'one overview per `level1_capability_id`',
  'secondary_capabilities',
  'every secondary capability',
  '对外业务能力与接口实现',
  'user_journey_design_status=detailed',
  'user_journey_coverage=complete|partial',
  'user_journey_gap_id',
  'Controller/Handler',
  'Service/UseCase',
  '读取数据',
  '写入/产生数据',
  '用户可见结果',
  'level1_journey_id',
  'flow_id',
  'api_id',
  'scan_and_reconcile',
  'requirement_design',
  'axis.document_archive',
  '.axis/docs/_archive/',
  'projects/{project_slug}/_sync/manifest.json',
  'project_document_path',
  'projects/{project_slug}/packages/{run_id}',
]) {
  assert.match(v02Protocol, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(v02Protocol, /project_business_detailed_design|domain_business_spec|domain_technical_design|architecture\/business-detailed-design\.md|business-spec\.md|technical-design\.md/);
assert.doesNotMatch(v02Protocol, /TODO|TBD|待补|待定|xxx|XXX|\.\.\./);
assert.doesNotMatch(v02Protocol, /\b(PetMall|petmall|owh-test|whalecloud|jiazhiwei|codeup)\b/i);

const v02Contract = await readRequired('docs/v0.2-contract.md');
for (const requiredText of [
  'Axis v0.2 Contract',
  'v0.1 is expired',
  'project-init --inspect --json',
  'answers-file',
  'organization registry',
  'environment variable names',
  'adjacent',
  '0.1-to-0.2',
  'recovery',
]) {
  assert.match(v02Contract, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

for (const expiredDoc of ['docs/v0.1-contract.md', 'docs/v0.1-doc-as-code-protocols.md']) {
  assert.match(await readRequired(expiredDoc), /expired/i, `${expiredDoc} should be marked expired`);
}
const deprecation = await readRequired('governance/DEPRECATION.md');
assert.match(deprecation, /0\.1.*expired|expired.*0\.1/i);
assert.match(deprecation, /immediate predecessor|adjacent.*mapping|mapping.*adjacent/i);
const migration = await readRequired('protocols/migrations/0.1-to-0.2.yml');
assert.match(migration, /from_version:\s*["']0\.1["']/);
assert.match(migration, /to_version:\s*["']0\.2["']/);

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
