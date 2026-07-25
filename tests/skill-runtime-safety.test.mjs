import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

const benchmarkScript = path.join(
  repoRoot,
  'skills',
  'axis-test-benchmark',
  'scripts',
  'core_api_benchmark.py',
);
const benchmarkBody = await readFile(benchmarkScript, 'utf8');
assert.match(benchmarkBody, /--scope[\s\S]{0,160}default=["']public["']/);
assert.doesNotMatch(benchmarkBody, /13800002002|13900000002|666666|--member-password|--admin-password/);
assert.doesNotMatch(benchmarkBody, /def\s+login\s*\(/, 'benchmark helper must not acquire credentials through built-in login');
assert.match(benchmarkBody, /--auth-sample/);
assert.match(benchmarkBody, /default=False|action=["']store_true["']/);

const codeupScript = path.join(
  repoRoot,
  'skills',
  'axis-integration-yunxiao-codeup',
  'scripts',
  'yunxiao_codeup.py',
);
const safeDryRun = await execFileAsync('python3', [
  codeupScript,
  'repos',
  '--domain',
  'https://openapi-rdc.aliyuncs.com',
  '--organization-id',
  'example-org',
  '--dry-run',
]);
assert.match(safeDryRun.stdout, /openapi-rdc\.aliyuncs\.com/);

for (const unsafeDomain of [
  'http://openapi-rdc.aliyuncs.com',
  'https://credentials.example.test',
  'https://openapi-rdc.aliyuncs.com.credentials.example.test',
]) {
  const error = await execFileAsync('python3', [
    codeupScript,
    'repos',
    '--domain',
    unsafeDomain,
    '--organization-id',
    'example-org',
    '--dry-run',
  ]).catch((caught) => caught);
  assert.equal(error.code, 1, `${unsafeDomain} must be rejected before any request`);
  assert.match(error.stderr, /HTTPS|allowlist|allowed host|trusted host/i);
}
const codeupBody = await readFile(codeupScript, 'utf8');
assert.match(codeupBody, /HTTPRedirectHandler|redirect/i);
assert.match(codeupBody, /x-yunxiao-token/);

const doudianSkillRoot = path.join(repoRoot, 'skills', 'axis-integration-doudian-merchandising');
const doudianSkillBody = await readFile(path.join(doudianSkillRoot, 'SKILL.md'), 'utf8');
const doudianOpenAiYaml = await readFile(path.join(doudianSkillRoot, 'agents', 'openai.yaml'), 'utf8');
const doudianJudgmentContract = await readFile(
  path.join(doudianSkillRoot, 'references', 'merchandising-judgment-contract.md'),
  'utf8',
);
const doudianMarketContract = await readFile(
  path.join(doudianSkillRoot, 'references', 'market-and-pricing-evidence.md'),
  'utf8',
);
assert.match(doudianSkillBody, /\$computer-use:computer-use/);
assert.match(doudianSkillBody, /automatically discover.+operated categories|自动.+经营类目/i);
assert.match(doudianSkillBody, /商机中心[\s\S]+追抖音热词[\s\S]+跟潜力爆品[\s\S]+找货源/);
assert.match(doudianSkillBody, /商品管理[\s\S]+发布潜力商品[\s\S]+找货源/);
assert.match(doudianSkillBody, /源头好货[\s\S]+抖音爆款榜[\s\S]+热搜商机/);
assert.doesNotMatch(doudianSkillBody, /逗你爆款榜/);
assert.match(doudianSkillBody, /No user confirmation is required/);
assert.match(doudianSkillBody, /Publish automatically only when[\s\S]+supplier gate[\s\S]+profit buffer/);
assert.match(doudianSkillBody, /re-read the page[\s\S]+product ID\/status/);
assert.match(doudianSkillBody, /filters[\s\S]+exact user-specified order[\s\S]+re-read the active selection/);
assert.match(doudianSkillBody, /source_batch[\s\S]+post-action status read-back[\s\S]+before opening or preparing the next selected source/);
assert.match(doudianSkillBody, /ineligible_by_metric_unavailable/);
assert.match(doudianSkillBody, /metric-capable/);
assert.match(doudianSkillBody, /Do not paginate that route merely to establish the absence/);
assert.match(doudianSkillBody, /User-authorized automatic traffic-price exception/);
assert.match(doudianSkillBody, /nominal_spread = proposed_price - supply_price/);
assert.match(doudianSkillBody, /current-run explicit automatic-publication authorization/);
assert.match(doudianSkillBody, /do not ask again per source/);
assert.doesNotMatch(doudianSkillBody, /current-turn user approval after its final warning/);
assert.match(doudianOpenAiYaml, /allow_implicit_invocation: false/);
assert.match(doudianJudgmentContract, /`model`: `gpt-5\.6-sol`/);
assert.match(doudianJudgmentContract, /`reasoning_effort`: `xhigh`/);
assert.match(doudianJudgmentContract, /fallback: forbidden/);
assert.match(doudianMarketContract, /Unknown required cost[\s\S]+not silently set to zero/);
assert.match(doudianMarketContract, /minimum stress-case buffer[\s\S]+CNY 3[\s\S]+10%/);
assert.match(doudianMarketContract, /Source merchant gate/);
assert.match(doudianMarketContract, /lowest displayed price[\s\S]+in-stock[\s\S]+complete/);
assert.match(doudianMarketContract, /automatic unit-economics gate is unchanged/);
assert.match(doudianMarketContract, /return `block`, not `auto_publish`/);
assert.match(doudianJudgmentContract, /automatic traffic-price exception[\s\S]+`block`[\s\S]+no per-source confirmation/);
assert.match(doudianJudgmentContract, /ineligible_by_metric_unavailable/);
assert.match(doudianJudgmentContract, /metric-capable/);

const { evaluatePromptResults, rankPromptResults } = await import(
  new URL('../skills/axis-tools-prompt-create/scripts/rank_prompt_results.mjs', import.meta.url)
);
const exactModelPlan = [
  { model_id: 'small-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1 },
  { model_id: 'small-b', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1 },
];
const ranking = rankPromptResults([
  { prompt_id: 'tier-average-hides-failure', model_id: 'small-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 1, hard_fail: false, prompt_length: 100, estimated_cost: 1 },
  { prompt_id: 'tier-average-hides-failure', model_id: 'small-b', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0, hard_fail: false, prompt_length: 100, estimated_cost: 1 },
  { prompt_id: 'stable', model_id: 'small-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.7, hard_fail: false, prompt_length: 100, estimated_cost: 1 },
  { prompt_id: 'stable', model_id: 'small-b', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.7, hard_fail: false, prompt_length: 100, estimated_cost: 1 },
], exactModelPlan, ['tier-average-hides-failure', 'stable']);
assert.equal(ranking[0].prompt_id, 'stable');
assert.deepEqual(
  ranking[0].cells.map((cell) => [cell.model_id, cell.source_kind]),
  [['small-a', 'code'], ['small-b', 'code']],
  'worst cells must preserve exact model IDs rather than hiding them inside a tier average',
);

const tieBreak = rankPromptResults([
  { prompt_id: 'long', model_id: 'model-a', model_tier: 'standard', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.9, hard_fail: false, prompt_length: 200, estimated_cost: 2 },
  { prompt_id: 'short', model_id: 'model-a', model_tier: 'standard', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.9, hard_fail: false, prompt_length: 100, estimated_cost: 1 },
], [
  { model_id: 'model-a', model_tier: 'standard', source_kind: 'code', case_id: 'case-a', repeat: 1 },
], ['long', 'short']);
assert.equal(tieBreak[0].prompt_id, 'short', 'prompt length and measured cost must break otherwise equal rankings');

const frozenPlan = [
  { model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1 },
  { model_id: 'model-b', model_tier: 'standard', source_kind: 'code', case_id: 'case-a', repeat: 1 },
];
assert.throws(() => rankPromptResults([
  { prompt_id: 'candidate-a', model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.9, hard_fail: false },
  { prompt_id: 'candidate-b', model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 1, hard_fail: false },
], frozenPlan, ['candidate-a', 'candidate-b']), /incomplete planned matrix/i, 'a frozen plan must expose cells missing from every candidate');

assert.throws(() => rankPromptResults([
  { prompt_id: 'baseline', model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.9, hard_fail: false },
], [frozenPlan[0]], ['baseline', 'zero-observation-challenger']), /incomplete planned matrix.*zero-observation-challenger/i);

assert.throws(() => rankPromptResults([
  { prompt_id: 'duplicate', model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.9, hard_fail: false },
  { prompt_id: 'duplicate', model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.9, hard_fail: false },
], [frozenPlan[0]], ['duplicate']), /duplicate planned matrix observation/i);

assert.throws(() => rankPromptResults([
  { prompt_id: 'failed-but-scored', model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 1, hard_fail: true },
], [frozenPlan[0]], ['failed-but-scored']), /hard_fail observations must have score 0/i);

assert.throws(() => rankPromptResults([
  { prompt_id: 'partial-metadata', model_id: 'small-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.8, hard_fail: false, prompt_length: 10 },
  { prompt_id: 'partial-metadata', model_id: 'small-b', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.8, hard_fail: false },
], exactModelPlan, ['partial-metadata']), /prompt_length must be supplied for every observation/i);

const evaluationInput = {
  schema_version: 1,
  candidate_ids: ['below-threshold'],
  planned_units: [frozenPlan[0]],
  observations: [
    { prompt_id: 'below-threshold', model_id: 'model-a', model_tier: 'small', source_kind: 'code', case_id: 'case-a', repeat: 1, score: 0.7, hard_fail: false },
  ],
  thresholds: { max_hard_fail_count: 0, min_worst_cell_mean: 0.8, min_overall_mean: 0.8 },
};
const noWinner = evaluatePromptResults(evaluationInput);
assert.equal(noWinner.selected_prompt_id, null);
assert.equal(noWinner.ranking[0].passes_thresholds, false);

assert.throws(() => evaluatePromptResults({
  ...evaluationInput,
  thresholds: { ...evaluationInput.thresholds, min_worst_cell_meann: 0.9 },
}), /unknown threshold key/i);
assert.throws(() => evaluatePromptResults({ ...evaluationInput, thresholds: null }), /thresholds must be an object/i);
assert.throws(() => evaluatePromptResults(evaluationInput.observations), /schema-versioned object/i);

const tupleSafe = rankPromptResults([
  { prompt_id: 'tuple-safe', model_id: 'a::b', model_tier: 'small', source_kind: 'c', case_id: 'case-one', repeat: 1, score: 0.8, hard_fail: false },
  { prompt_id: 'tuple-safe', model_id: 'a', model_tier: 'small', source_kind: 'b::c', case_id: 'case-two', repeat: 1, score: 0.8, hard_fail: false },
], [
  { model_id: 'a::b', model_tier: 'small', source_kind: 'c', case_id: 'case-one', repeat: 1 },
  { model_id: 'a', model_tier: 'small', source_kind: 'b::c', case_id: 'case-two', repeat: 1 },
], ['tuple-safe']);
assert.equal(tupleSafe[0].observation_count, 2, 'tuple delimiters inside IDs must not collide');
assert.equal(new Set(tupleSafe[0].cells.map((cell) => JSON.stringify([cell.model_id, cell.source_kind]))).size, 2);

const rankerScript = path.join(
  repoRoot,
  'skills',
  'axis-tools-prompt-create',
  'scripts',
  'rank_prompt_results.mjs',
);
const promptTempRoot = await mkdtemp(path.join(tmpdir(), 'axis-prompt-ranker-'));
try {
  const validInputPath = path.join(promptTempRoot, 'evaluation.json');
  await writeFile(validInputPath, `${JSON.stringify(evaluationInput)}\n`);
  const cliResult = await execFileAsync(process.execPath, [rankerScript, '--input', validInputPath]);
  assert.equal(JSON.parse(cliResult.stdout).selected_prompt_id, null);

  const legacyInputPath = path.join(promptTempRoot, 'legacy-array.json');
  await writeFile(legacyInputPath, `${JSON.stringify(evaluationInput.observations)}\n`);
  const legacyError = await execFileAsync(process.execPath, [rankerScript, '--input', legacyInputPath])
    .catch((caught) => caught);
  assert.equal(legacyError.code, 1);
  assert.match(legacyError.stderr, /schema-versioned object/i);
} finally {
  await rm(promptTempRoot, { recursive: true, force: true });
}
