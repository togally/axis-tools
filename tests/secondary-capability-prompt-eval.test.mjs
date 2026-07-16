import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildModelInput,
  rankPromptCandidates,
  scoreCapabilityPartition,
} from '../skills/axis-doc-project-knowledge/scripts/evaluate_secondary_capability_prompts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.join(here, '..', 'skills', 'axis-doc-project-knowledge');
const cases = JSON.parse(await readFile(
  path.join(skillRoot, 'references', 'secondary-capability-eval-cases.json'),
  'utf8',
));
const candidates = JSON.parse(await readFile(
  path.join(skillRoot, 'references', 'secondary-capability-prompt-candidates.json'),
  'utf8',
));
const selectedCandidate = candidates.candidates.find(
  (candidate) => candidate.prompt_id === candidates.selected_prompt_id,
);
assert.ok(selectedCandidate, 'selected prompt must exist in the candidate manifest');
const selectedPrompt = await readFile(
  path.join(skillRoot, 'references', selectedCandidate.prompt_file),
  'utf8',
);
const skillBody = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');

assert.ok(cases.cases.length >= 12, 'prompt evaluation requires at least twelve cases');
assert.ok(
  new Set(cases.cases.map((item) => item.source_kind)).size >= 4,
  'prompt evaluation requires at least four source kinds',
);
assert.ok(cases.cases.some((item) => item.expected_groups.length === 1), 'requires a must-merge control');
assert.ok(cases.cases.some((item) => item.expected_groups.length >= 5), 'requires a compound split case');
assert.ok(
  cases.cases.filter((item) => item.evaluation_stage === 'final_holdout').length >= 3,
  'requires three frozen final holdout cases',
);
for (const item of cases.cases) {
  const evidenceIds = item.evidence.map((evidence) => evidence.id);
  const goldIds = item.expected_groups.flatMap((group) => group.evidence_ids);
  assert.deepEqual([...new Set(goldIds)].sort(), [...evidenceIds].sort(), `${item.case_id} gold coverage`);
  assert.equal(goldIds.length, new Set(goldIds).size, `${item.case_id} gold evidence must be unique`);
}

assert.ok(candidates.candidates.length >= 6, 'requires baseline and five challengers');
assert.equal(candidates.selected_prompt_id, 'boundary_matrix_v3_1');
assert.equal(candidates.acceptance_thresholds.diagnostic_worst_unit_score, 80);
assert.equal(candidates.acceptance_thresholds.final_holdout_worst_unit_score, 90);
for (const term of [
  'Atomic evidence census',
  'must_split',
  'must_merge',
  'exactly once',
  'one acceptance sentence',
  'Apply a merge veto',
  'independent reverse audit',
  'Do not split one cohesive result by method, layer, route alias, intermediate state, query variant or persistence table',
]) {
  assert.match(selectedPrompt, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
assert.match(skillBody, /secondary-capability-boundary-matrix-v3\.1\.md/);
assert.match(skillBody, /Run the project-wide inventory granularity gate before selecting affected documents/);
assert.match(skillBody, /Do not generate or reconcile detailed-design documents until the secondary-capability boundary inventory is locked/);

const goldCase = {
  case_id: 'scoring_contract',
  evidence: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  expected_groups: [
    { capability_id: 'first', evidence_ids: ['a', 'b'] },
    { capability_id: 'second', evidence_ids: ['c', 'd'] },
  ],
};
const exact = scoreCapabilityPartition(goldCase, {
  groups: [
    { name: '第一能力', evidence_ids: ['a', 'b'] },
    { name: '第二能力', evidence_ids: ['c', 'd'] },
  ],
});
const merged = scoreCapabilityPartition(goldCase, {
  groups: [{ name: '第一与第二能力', evidence_ids: ['a', 'b', 'c', 'd'] }],
});
const split = scoreCapabilityPartition(goldCase, {
  groups: [
    { name: 'A', evidence_ids: ['a'] },
    { name: 'B', evidence_ids: ['b'] },
    { name: 'C', evidence_ids: ['c'] },
    { name: 'D', evidence_ids: ['d'] },
  ],
});
assert.equal(exact.score, 100);
assert.ok(merged.under_merge_rate > 0);
assert.ok(split.over_split_rate > 0);
assert.ok(exact.score > merged.score);
assert.ok(exact.score > split.score);

const modelInput = buildModelInput('candidate prompt', {
  case_id: 'gold_isolation',
  evaluation_stage: 'hidden',
  evidence: [{ id: 'visible-evidence', statement: 'visible input' }],
  expected_groups: [{
    capability_id: 'gold-only-capability',
    name: 'gold-only-name',
    evidence_ids: ['visible-evidence'],
  }],
});
assert.match(modelInput, /visible-evidence/);
assert.doesNotMatch(modelInput, /expected_groups/);
assert.doesNotMatch(modelInput, /gold-only-capability/);
assert.doesNotMatch(modelInput, /gold-only-name/);
assert.doesNotMatch(modelInput, /evaluation_stage/);

const ranking = rankPromptCandidates([
  { prompt_id: 'mean_only', model: 'small', score: 70 },
  { prompt_id: 'mean_only', model: 'large', score: 100 },
  { prompt_id: 'robust', model: 'small', score: 84 },
  { prompt_id: 'robust', model: 'large', score: 86 },
]);
assert.equal(ranking[0].prompt_id, 'robust', 'ranking must maximize worst-model performance first');

const sourceRobustRanking = rankPromptCandidates([
  { prompt_id: 'masked_failure', model: 'small', source_kind: 'source-a', score: 0 },
  { prompt_id: 'masked_failure', model: 'small', source_kind: 'source-b', score: 100 },
  { prompt_id: 'masked_failure', model: 'small', source_kind: 'source-c', score: 100 },
  { prompt_id: 'source_robust', model: 'small', source_kind: 'source-a', score: 60 },
  { prompt_id: 'source_robust', model: 'small', source_kind: 'source-b', score: 60 },
  { prompt_id: 'source_robust', model: 'small', source_kind: 'source-c', score: 60 },
]);
assert.equal(
  sourceRobustRanking[0].prompt_id,
  'source_robust',
  'ranking must not let strong sources hide a model-by-source failure',
);
