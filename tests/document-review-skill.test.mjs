import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const skillRoot = path.join(repoRoot, 'skills', 'axis-document-review');
const manifest = JSON.parse(await readFile(path.join(repoRoot, 'skills', 'manifest.json'), 'utf8'));
const entry = manifest.skills.find((skill) => skill.name === 'axis-document-review');

assert.ok(entry, 'axis-document-review should be packaged');
assert.deepEqual(entry.files.sort(), [
  'SKILL.md',
  'agents/openai.yaml',
  'assets/axis-document-review-template.tgz',
  'scripts/axis_document_review.py',
]);

const body = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
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
  'AXIS_DOCUMENT_REVIEW_DIR',
  'After Use Deposition',
]) {
  assert.match(body, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const script = path.join(skillRoot, 'scripts', 'axis_document_review.py');
const missingTarget = await mkdtemp(path.join(tmpdir(), 'axis-document-review-status-'));
await rm(missingTarget, { recursive: true, force: true });
try {
  const { stdout } = await execFileAsync('python3', [script, 'status', '--target', missingTarget]);
  assert.equal(JSON.parse(stdout).state, 'repo_missing');

  const scaffoldTarget = `${missingTarget}-scaffold`;
  const scaffolded = await execFileAsync('python3', [script, 'scaffold', '--target', scaffoldTarget]);
  assert.equal(JSON.parse(scaffolded.stdout).state, 'ready');
  const scaffoldPackage = JSON.parse(await readFile(path.join(scaffoldTarget, 'package.json'), 'utf8'));
  assert.equal(scaffoldPackage.name, 'axis-document-review');
  for (const dependency of ['dompurify', 'highlight.js', 'marked', 'mermaid']) {
    assert.ok(scaffoldPackage.dependencies?.[dependency], `${dependency} should be bundled in the local scaffold`);
  }
  const scaffoldBrowser = await readFile(path.join(scaffoldTarget, 'src', 'browser.mjs'), 'utf8');
  assert.match(scaffoldBrowser, /mermaid\.run/);
  assert.match(scaffoldBrowser, /DEFAULT_DOCUMENT_TYPE\s*=\s*['"]MD['"]/);
  assert.match(scaffoldBrowser, /document-link/);
  assert.match(scaffoldBrowser, /requestFullscreen/);
  assert.match(scaffoldBrowser, /activeSourceId/);
  assert.match(scaffoldBrowser, /selectSource/);
  assert.match(scaffoldBrowser, /data-source-id/);
  assert.match(scaffoldBrowser, /bucket\.source_ids\.includes\(state\.activeSourceId\)/);
  assert.match(scaffoldBrowser, /class="project-context"/);
  assert.doesNotMatch(scaffoldBrowser, /organization-label|tree-icon|elements\.breadcrumb|elements\.projectTitle/);
  const scaffoldHtml = await readFile(path.join(scaffoldTarget, 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(scaffoldHtml, /overview-strip|data-drilldown|bucketMetric|organizationMetric|projectMetric|documentMetric/);
  assert.doesNotMatch(scaffoldHtml, /class="context-bar"|id="breadcrumb"|id="projectTitle"/);
  const scaffoldNavigation = scaffoldHtml.match(/<aside[^>]+class="navigation-panel"[\s\S]*?<\/aside>/)?.[0] ?? '';
  const scaffoldContent = scaffoldHtml.match(/<section class="content-panel">[\s\S]*?<\/section>\s*<\/main>/)?.[0] ?? '';
  assert.match(scaffoldNavigation, /class="document-list-panel navigation-documents"/);
  assert.doesNotMatch(scaffoldContent, /document-list-panel/);
  assert.match(scaffoldHtml, /id="fullscreenButton"/);
  const scaffoldCss = await readFile(path.join(scaffoldTarget, 'public', 'styles.css'), 'utf8');
  assert.match(scaffoldCss, /\.workspace\s*\{[^}]*grid-template-columns:\s*330px\s+minmax\(0,\s*1fr\)/s);
  await rm(scaffoldTarget, { recursive: true, force: true });
} finally {
  await rm(missingTarget, { recursive: true, force: true });
}
