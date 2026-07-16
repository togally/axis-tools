import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const skillRoot = path.join(repoRoot, 'skills', 'axis-doc-dashboard');
const manifest = JSON.parse(await readFile(path.join(repoRoot, 'skills', 'manifest.json'), 'utf8'));
const entry = manifest.skills.find((skill) => skill.name === 'axis-doc-dashboard');

assert.ok(entry, 'axis-doc-dashboard should be packaged');
assert.deepEqual(entry.files.sort(), [
  'SKILL.md',
  'agents/openai.yaml',
  'assets/axis-doc-dashboard-template.tgz',
  'scripts/axis_doc_dashboard.py',
]);

const body = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
assert.match(body, /~\/Documents\/axis\/axis-document-review/);
for (const requiredText of [
  'Three-Step Work Contract',
  'repo_missing',
  'pull_public_repo',
  'build_local_template',
  'Do not clone before confirmation',
  'status',
  'clone',
  'scaffold',
  'start',
  'open',
  'http://127.0.0.1',
  'https://github.com/togally/axis-document-review',
  '/api/health',
  '/api/catalog',
  '历史追溯',
  '.axis/docs/_archive/orgs/',
  'archive_count',
  '_sync/manifest.json',
  'AXIS_DOC_DASHBOARD_DIR',
  'After Use Deposition',
]) {
  assert.match(body, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const openAiYaml = await readFile(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
assert.match(openAiYaml, /^\s*display_name: "axis-doc-dashboard"$/m);
assert.match(openAiYaml, /\$axis-doc-dashboard/);
assert.doesNotMatch(openAiYaml, /\$axis-document-review/);

const script = path.join(skillRoot, 'scripts', 'axis_doc_dashboard.py');
const scriptBody = await readFile(script, 'utf8');
assert.match(scriptBody, /~\/Documents\/axis\/axis-document-review/);
const missingTarget = await mkdtemp(path.join(tmpdir(), 'axis-doc-dashboard-status-'));
await rm(missingTarget, { recursive: true, force: true });
const scaffoldTarget = `${missingTarget}-scaffold`;
try {
  const { stdout } = await execFileAsync('python3', [script, 'status', '--target', missingTarget]);
  assert.equal(JSON.parse(stdout).state, 'repo_missing');

  const scaffolded = await execFileAsync('python3', [script, 'scaffold', '--target', scaffoldTarget]);
  assert.equal(JSON.parse(scaffolded.stdout).state, 'ready');
  const scaffoldPackage = JSON.parse(await readFile(path.join(scaffoldTarget, 'package.json'), 'utf8'));
  assert.equal(scaffoldPackage.name, 'axis-document-review');
  for (const dependency of ['dompurify', 'highlight.js', 'marked', 'mermaid']) {
    assert.ok(scaffoldPackage.dependencies?.[dependency], `${dependency} should be bundled in the local scaffold`);
  }
  const scaffoldDocumentReferencePath = path.join(scaffoldTarget, 'src', 'document-reference.mjs');
  const scaffoldDocumentReferenceTestPath = path.join(scaffoldTarget, 'tests', 'document-reference.test.mjs');
  assert.ok(
    existsSync(scaffoldDocumentReferencePath),
    'the local scaffold must include src/document-reference.mjs',
  );
  assert.ok(
    existsSync(scaffoldDocumentReferenceTestPath),
    'the local scaffold must include relative-link and compact-locator tests',
  );
  for (const excludedPath of ['.git', 'node_modules', '.axis-runtime', 'public/app.js']) {
    assert.equal(
      existsSync(path.join(scaffoldTarget, excludedPath)),
      false,
      `${excludedPath} must stay out of the bundled local scaffold`,
    );
  }
  const scaffoldDocumentReference = await readFile(scaffoldDocumentReferencePath, 'utf8');
  assert.match(scaffoldDocumentReference, /resolveProjectDocumentPath/);
  assert.match(scaffoldDocumentReference, /compactDocumentLocator/);
  assert.match(scaffoldDocumentReference, /compactEvidencePaths/);
  const scaffoldDocumentReferenceTest = await readFile(scaffoldDocumentReferenceTestPath, 'utf8');
  assert.match(scaffoldDocumentReferenceTest, /secondary-capabilities\/community_content_interaction\/detailed-design\.md/);
  assert.match(scaffoldDocumentReferenceTest, /community_engagement \/ community_content_interaction \/ detailed-design\.md/);
  assert.match(scaffoldDocumentReferenceTest, /AppPetFriendCircleControllerTest\.java:73-96#/);
  assert.match(scaffoldPackage.scripts?.test ?? '', /tests\/document-reference\.test\.mjs/);
  await execFileAsync(process.execPath, [scaffoldDocumentReferenceTestPath], { cwd: scaffoldTarget });
  const scaffoldBrowser = await readFile(path.join(scaffoldTarget, 'src', 'browser.mjs'), 'utf8');
  const scaffoldCore = await readFile(path.join(scaffoldTarget, 'src', 'core.mjs'), 'utf8');
  assert.match(scaffoldCore, /axis\.package\.manifest/);
  assert.match(scaffoldCore, /synchronizedProjectDocumentPaths/);
  assert.match(scaffoldBrowser, /mermaid\.run/);
  assert.match(scaffoldBrowser, /DEFAULT_DOCUMENT_TYPE\s*=\s*['"]MD['"]/);
  assert.match(scaffoldBrowser, /document-link/);
  assert.match(scaffoldBrowser, /requestFullscreen/);
  assert.match(scaffoldBrowser, /activeSourceId/);
  assert.match(scaffoldBrowser, /selectSource/);
  assert.match(scaffoldBrowser, /data-source-id/);
  assert.match(scaffoldBrowser, /bucket\.source_ids\.includes\(state\.activeSourceId\)/);
  assert.match(scaffoldBrowser, /class="project-context"/);
  assert.match(scaffoldBrowser, /historyPanel/);
  assert.match(scaffoldBrowser, /archivesForDocument/);
  assert.match(scaffoldBrowser, /renderDocumentNavigation/);
  assert.match(scaffoldBrowser, /capability-group/);
  assert.match(scaffoldBrowser, /返回业务架构/);
  assert.match(scaffoldBrowser, /返回能力总览/);
  assert.match(scaffoldBrowser, /上一个二级能力/);
  assert.match(scaffoldBrowser, /下一个二级能力/);
  assert.doesNotMatch(scaffoldBrowser, /organization-label|tree-icon|elements\.breadcrumb|elements\.projectTitle/);
  const scaffoldHtml = await readFile(path.join(scaffoldTarget, 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(scaffoldHtml, /overview-strip|data-drilldown|bucketMetric|organizationMetric|projectMetric|documentMetric/);
  assert.doesNotMatch(scaffoldHtml, /class="context-bar"|id="breadcrumb"|id="projectTitle"/);
  const scaffoldNavigation = scaffoldHtml.match(/<aside[^>]+class="navigation-panel"[\s\S]*?<\/aside>/)?.[0] ?? '';
  const scaffoldContent = scaffoldHtml.match(/<section class="content-panel">[\s\S]*?<\/section>\s*<\/main>/)?.[0] ?? '';
  assert.match(scaffoldNavigation, /class="document-list-panel navigation-documents"/);
  assert.doesNotMatch(scaffoldContent, /document-list-panel/);
  assert.match(scaffoldHtml, /id="fullscreenButton"/);
  assert.match(scaffoldHtml, /id="historyButton"/);
  assert.match(scaffoldHtml, /id="historyPanel"/);
  assert.match(scaffoldHtml, /历史追溯/);
  assert.match(scaffoldHtml, /返回当前版本/);
  assert.match(scaffoldHtml, /id="documentNavigation"/);
  const scaffoldCss = await readFile(path.join(scaffoldTarget, 'public', 'styles.css'), 'utf8');
  assert.match(scaffoldCss, /\.workspace\s*\{[^}]*grid-template-columns:\s*330px\s+minmax\(0,\s*1fr\)/s);
  assert.match(scaffoldCss, /\.history-panel/);
  assert.match(scaffoldCss, /\.archive-banner/);
  assert.match(scaffoldCss, /\.document-navigation/);
  assert.match(scaffoldCss, /\.capability-children/);
} finally {
  await Promise.all([
    rm(missingTarget, { recursive: true, force: true }),
    rm(scaffoldTarget, { recursive: true, force: true }),
  ]);
}
