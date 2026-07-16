import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const createScript = path.join(repoRoot, 'scripts', 'axis-skill-create.mjs');

const tradeSkills = {
  'axis-trade-system-governance': {
    files: [
      'SKILL.md',
      'agents/openai.yaml',
      'references/system-governance-contract.md',
    ],
    required: [
      'Parameter Change Approval Gate',
      'base_system_hash',
      'awaiting_user_approval',
      'approved paths',
      'rollback',
      'explicit approval',
      'risk-increasing',
      'affected plans',
    ],
  },
  'axis-trade-portfolio-ledger': {
    files: [
      'SKILL.md',
      'agents/openai.yaml',
      'references/portfolio-ledger-contract.md',
    ],
    required: [
      'append-only',
      'staged',
      'reconciled',
      'posted',
      'valuation_as_of',
      'base_currency',
      'A-share',
      'crypto',
      'family reserve',
      'private keys',
    ],
  },
  'axis-trade-risk-research': {
    files: [
      'SKILL.md',
      'agents/openai.yaml',
      'references/risk-research-matrix.md',
    ],
    required: [
      'official primary sources',
      'no_blocking_red_flags_observed',
      'blocking_red_flags_observed',
      'unknown_or_incomplete',
      'reporting period',
      'protocol security',
      'tokenomics',
      'custody',
      'does not prove risk absence',
    ],
  },
  'axis-trade-plan-gate': {
    files: [
      'SKILL.md',
      'agents/openai.yaml',
      'references/investment-plan-contract.md',
    ],
    required: [
      'eligible_for_user_approval',
      'blocked_nonconforming',
      'blocked_insufficient_evidence',
      'system_hash',
      'research_hash',
      'portfolio capacity',
      'required corrections',
      'manual_risk_reduction',
      'no order execution',
    ],
  },
  'axis-trade-daily-brief': {
    files: [
      'SKILL.md',
      'agents/openai.yaml',
      'references/daily-brief-contract.md',
    ],
    required: [
      'read-only',
      'COMPLETE',
      'PARTIAL',
      'FAILED',
      'event_time',
      'published_at',
      'retrieved_at',
      'idempotency',
      'PLAN_REVIEW_REQUIRED',
      'delivery_not_configured',
      'run-once',
      'configure-automation',
    ],
  },
};

const tempRoot = await mkdtemp(path.join(tmpdir(), 'axis-trade-create-'));
try {
  await execFileAsync(process.execPath, [
    createScript,
    '--source-root',
    tempRoot,
    '--name',
    'axis-trade-demo',
    '--description',
    'Use when testing the Axis trade category. / 用于测试 Axis 交易分类。',
    '--body',
    '# Axis Trade Demo\n',
    '--no-validate',
  ]);
  const created = await readFile(path.join(tempRoot, 'axis-trade-demo', 'SKILL.md'), 'utf8');
  assert.match(created, /^name: axis-trade-demo$/m);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

const manifest = JSON.parse(await readFile(path.join(repoRoot, 'skills', 'manifest.json'), 'utf8'));
const packagedDirs = (await readdir(path.join(repoRoot, 'skills'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const [skillName, contract] of Object.entries(tradeSkills)) {
  assert.ok(packagedDirs.includes(skillName), `${skillName} should be a packaged skill directory`);
  const manifestEntry = manifest.skills.find((entry) => entry.name === skillName);
  assert.ok(manifestEntry, `${skillName} should be listed in the manifest`);
  assert.deepEqual(manifestEntry.files.sort(), contract.files.sort());
  assert.match(manifestEntry.description, /^Use when\b/);
  assert.match(manifestEntry.description, /[\u3400-\u9FFF]/);

  const root = path.join(repoRoot, 'skills', skillName);
  const body = await readFile(path.join(root, 'SKILL.md'), 'utf8');
  assert.match(body, new RegExp(`^name: ${skillName}$`, 'm'));
  assert.match(body, /\.axis\/trade/);
  assert.match(body, /After Use Deposition/);
  assert.match(body, /Model Reasoning Level/);
  assert.match(body, /never (?:execute|place).*trade|no order execution/i);
  for (const requiredText of contract.required) {
    assert.match(body, new RegExp(requiredText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }

  const openAi = await readFile(path.join(root, 'agents', 'openai.yaml'), 'utf8');
  assert.match(openAi, new RegExp(`^\\s*display_name: "${skillName}"$`, 'm'));
  assert.match(openAi, new RegExp(`\\$${skillName}\\b`));
  assert.match(openAi, /[A-Za-z]/);
  assert.match(openAi, /[\u3400-\u9FFF]/);
}

const allTradeSkillText = (await Promise.all(
  Object.keys(tradeSkills).map((name) => readFile(path.join(repoRoot, 'skills', name, 'SKILL.md'), 'utf8')),
)).join('\n');

for (const forbidden of [
  /保证收益/,
  /稳赚/,
  /guaranteed returns/i,
]) {
  assert.doesNotMatch(allTradeSkillText, forbidden);
}

for (const requiredSafetyText of [
  'Never store credentials',
  'personal financial data',
  'structured state is canonical',
  'decimal strings',
  'ISO 8601',
]) {
  assert.match(allTradeSkillText, new RegExp(requiredSafetyText, 'i'));
}

const dailyBriefReference = await readFile(
  path.join(repoRoot, 'skills', 'axis-trade-daily-brief', 'references', 'daily-brief-contract.md'),
  'utf8',
);
const riskResearchReference = await readFile(
  path.join(repoRoot, 'skills', 'axis-trade-risk-research', 'references', 'risk-research-matrix.md'),
  'utf8',
);
const portfolioLedgerReference = await readFile(
  path.join(repoRoot, 'skills', 'axis-trade-portfolio-ledger', 'references', 'portfolio-ledger-contract.md'),
  'utf8',
);
const planGateReference = await readFile(
  path.join(repoRoot, 'skills', 'axis-trade-plan-gate', 'references', 'investment-plan-contract.md'),
  'utf8',
);
for (const sharedResearchField of [
  '.axis/trade/research/index.yaml',
  'research_status',
  'fundamental_status',
  'review_scope',
  'valid_until',
]) {
  assert.match(dailyBriefReference, new RegExp(sharedResearchField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(riskResearchReference, new RegExp(sharedResearchField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(dailyBriefReference, /research\/baselines/);
assert.match(portfolioLedgerReference, /a_share:<exchange>:<ticker>/);
assert.match(dailyBriefReference, /asset_id: a_share:SSE:600000/);
assert.doesNotMatch(dailyBriefReference, /asset_id: equity:CN:/);
assert.match(riskResearchReference, /content_hash: <sha256-of-exact-snapshot-bytes>/);
assert.match(riskResearchReference, /exact UTF-8 bytes of the immutable snapshot/i);
assert.match(planGateReference, /research_hash.*content_hash/i);
assert.match(dailyBriefReference, /content_hash.? lives only in the research index/i);
assert.match(dailyBriefReference, /immutable snapshot must not contain.*content_hash/i);
assert.match(planGateReference, /research_id: <research-id-or-null-only-for-risk-reduction-exception>/);
assert.match(planGateReference, /Missing, stale, or incomplete research.*must not block/i);
assert.match(planGateReference, /research reference, when present, resolves.*when absent.*risk_reduction_exception/is);

const planGateBody = await readFile(
  path.join(repoRoot, 'skills', 'axis-trade-plan-gate', 'SKILL.md'),
  'utf8',
);
assert.match(planGateBody, /risk_reduction_exception/);
assert.match(planGateBody, /missing, stale, or incomplete research.*must not block/i);

console.log('axis trade skill contracts passed');
