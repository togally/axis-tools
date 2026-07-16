import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  buildDetailedDesignModelInput,
  referenceDetailedDesign,
  scoreDetailedDesign,
} from '../skills/axis-doc-project-knowledge/scripts/score_secondary_capability_detailed_design.mjs';
import {
  evaluatePromptResults,
} from '../skills/axis-tools-prompt-create/scripts/rank_prompt_results.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const projectKnowledgeSkillDir = path.join(
  here,
  '..',
  'skills',
  'axis-doc-project-knowledge',
);
const casesPath = path.join(
  projectKnowledgeSkillDir,
  'references',
  'secondary-capability-detailed-design-eval-cases.json',
);
const casesBody = await readFile(casesPath, 'utf8');
const casesDocument = JSON.parse(casesBody);
const cases = casesDocument.cases;

function cloned(value) {
  return JSON.parse(JSON.stringify(value));
}

function caseById(caseId) {
  const item = cases.find((candidate) => candidate.case_id === caseId);
  assert.ok(item, `missing detailed-design evaluation case: ${caseId}`);
  return item;
}

function assertFailure(result, failureKind) {
  assert.equal(result.hard_fail, true);
  assert.equal(result.score, 0);
  assert.ok(
    result.failure_kinds.includes(failureKind),
    `expected ${failureKind}; got ${result.failure_kinds.join(', ')}`,
  );
}

test('Gate B cases are public-safe, multi-source, and keep evaluator truth out of model input', () => {
  assert.equal(casesDocument.schema_version, 1);
  assert.ok(cases.length >= 3);
  assert.ok(new Set(cases.map((item) => item.source_kind)).size >= 3);
  assert.ok(cases.some((item) => item.evaluation_stage === 'final_holdout'));
  assert.doesNotMatch(
    casesBody,
    /PetMall|whalecloud|aliyuncs|codeup|\/Users\/|127\.0\.0\.1|localhost|Bearer\s+[A-Za-z0-9._-]+/i,
  );

  const testCase = cloned(caseById('commerce_return_refund_handoff_document'));
  testCase.oracle.evaluator_only_sentinel = 'ORACLE_MUST_NOT_LEAK_7f42';
  const modelInput = buildDetailedDesignModelInput('render the locked detailed design', testCase);
  assert.match(modelInput, /"case_id": "commerce_return_refund_handoff_document"/);
  assert.match(modelInput, /return_refund_after_sale/);
  assert.match(modelInput, /RETURN_RECEIPT_CONFIRM/);
  assert.doesNotMatch(modelInput, /ORACLE_MUST_NOT_LEAK_7f42/);
  assert.doesNotMatch(modelInput, /"oracle"|"evaluation_stage"/);
});

test('all reference detailed designs satisfy participant, flow, and interface closure exactly', () => {
  for (const testCase of cases) {
    const result = scoreDetailedDesign(testCase, referenceDetailedDesign(testCase));
    assert.equal(result.hard_fail, false, `${testCase.case_id}: ${result.failure_kinds.join(', ')}`);
    assert.equal(result.score, 1, testCase.case_id);
    assert.equal(result.raw_score, 1, testCase.case_id);
    assert.equal(result.participant_score, 1, testCase.case_id);
    assert.equal(result.flow_score, 1, testCase.case_id);
    assert.equal(result.interface_score, 1, testCase.case_id);
  }
});

test('missing and invented participants are hard failures', () => {
  const testCase = caseById('commerce_return_refund_handoff_document');

  const missing = referenceDetailedDesign(testCase);
  missing.participants = missing.participants.filter((item) => item.actor_id !== 'merchant');
  assertFailure(scoreDetailedDesign(testCase, missing), 'missing_participant');

  const invented = referenceDetailedDesign(testCase);
  invented.participants.push({
    actor_id: 'platform_supervisor',
    role: 'Invented supervisor',
    responsibility: 'Not supported by supplied evidence.',
    evidence_ids: ['R-P01'],
  });
  assertFailure(scoreDetailedDesign(testCase, invented), 'invented_participant');
});

test('nonempty but meaningless reader-facing semantics are hard failures', () => {
  const testCase = caseById('commerce_order_query_document');
  const prediction = referenceDetailedDesign(testCase);
  for (const participant of prediction.participants) {
    participant.role = 'x';
    participant.responsibility = 'x';
  }
  for (const flow of prediction.flows) {
    for (const step of flow.steps) {
      step.action = 'x';
      step.input_state = 'x';
      step.output_state = 'x';
    }
  }
  for (const interfaceBlock of prediction.interfaces) {
    interfaceBlock.business_purpose = 'x';
    interfaceBlock.visible_result = 'x';
  }

  const result = scoreDetailedDesign(testCase, prediction);
  assertFailure(result, 'participant_role_semantics_mismatch');
  assert.ok(result.failure_kinds.includes('participant_responsibility_semantics_mismatch'));
  assert.ok(result.failure_kinds.includes('flow_step_action_semantics_mismatch'));
  assert.ok(result.failure_kinds.includes('interface_business_purpose_semantics_mismatch'));
});

test('a broken or disconnected business flow is a hard failure', () => {
  const testCase = caseById('commerce_return_refund_handoff_document');
  const prediction = referenceDetailedDesign(testCase);
  prediction.flows[0].steps[0].next_step_ids = [];

  const result = scoreDetailedDesign(testCase, prediction);
  assertFailure(result, 'missing_flow_edge');
  assert.ok(result.failure_kinds.includes('disconnected_flow'));
});

test('an evidence ID must remain bound to its supplied participant, flow step, and interface', () => {
  const testCase = caseById('commerce_return_refund_handoff_document');

  const participantSwap = referenceDetailedDesign(testCase);
  [participantSwap.participants[0].evidence_ids, participantSwap.participants[1].evidence_ids] = [
    participantSwap.participants[1].evidence_ids,
    participantSwap.participants[0].evidence_ids,
  ];
  assertFailure(
    scoreDetailedDesign(testCase, participantSwap),
    'participant_evidence_binding_mismatch',
  );

  const flowSteps = referenceDetailedDesign(testCase).flows.flatMap((flow) => flow.steps);
  assert.ok(flowSteps.length >= 2);
  const flowSwap = referenceDetailedDesign(testCase);
  const swappedFlowSteps = flowSwap.flows.flatMap((flow) => flow.steps);
  [swappedFlowSteps[0].evidence_ids, swappedFlowSteps[1].evidence_ids] = [
    swappedFlowSteps[1].evidence_ids,
    swappedFlowSteps[0].evidence_ids,
  ];
  assertFailure(scoreDetailedDesign(testCase, flowSwap), 'flow_step_evidence_binding_mismatch');

  const interfaceSwap = referenceDetailedDesign(testCase);
  assert.ok(interfaceSwap.interfaces.length >= 2);
  [interfaceSwap.interfaces[0].evidence_ids, interfaceSwap.interfaces[1].evidence_ids] = [
    interfaceSwap.interfaces[1].evidence_ids,
    interfaceSwap.interfaces[0].evidence_ids,
  ];
  assertFailure(
    scoreDetailedDesign(testCase, interfaceSwap),
    'interface_evidence_binding_mismatch',
  );
});

test('a supported internal flow step may use api_id=not_applicable without inventing an interface', () => {
  const testCase = cloned(caseById('commerce_order_query_document'));
  testCase.model_input.evidence.push({
    id: 'Q-F-INTERNAL',
    kind: 'flow',
    summary: 'The buyer compares the returned orders before selecting one.',
  });
  testCase.model_input.flow_inventory.push({
    flow_id: 'internal_order_comparison',
    start_step_ids: ['compare_returned_orders'],
    terminal_step_ids: ['compare_returned_orders'],
    steps: [{
      step_id: 'compare_returned_orders',
      actor_id: 'buyer',
      action: 'Compare the returned orders',
      api_id: 'not_applicable',
      input_state: 'Visible order list returned',
      output_state: 'One order selected for a later action',
      next_step_ids: [],
      evidence_ids: ['Q-F-INTERNAL'],
    }],
  });
  testCase.oracle.expected_flows.push({
    flow_id: 'internal_order_comparison',
    start_step_ids: ['compare_returned_orders'],
    terminal_step_ids: ['compare_returned_orders'],
    steps: [{
      step_id: 'compare_returned_orders',
      actor_id: 'buyer',
      api_id: 'not_applicable',
      next_step_ids: [],
    }],
  });

  const result = scoreDetailedDesign(testCase, referenceDetailedDesign(testCase));
  assert.equal(result.hard_fail, false, result.failure_kinds.join(', '));
  assert.equal(result.score, 1);
});

test('merging multiple HTTP contracts into one interface block is a hard failure', () => {
  const testCase = caseById('commerce_order_query_document');
  const prediction = referenceDetailedDesign(testCase);
  prediction.interfaces = [{
    ...prediction.interfaces[0],
    api_id: 'ORDER_LIST_AND_DETAIL',
    contract: 'GET /trade/orders; GET /trade/orders/{orderId}',
    business_purpose: 'Combined list and detail block.',
    visible_result: 'Either a list or a detail.',
    evidence_ids: ['Q-I01', 'Q-I02'],
  }];

  const result = scoreDetailedDesign(testCase, prediction);
  assertFailure(result, 'merged_interface_block');
  assert.ok(result.failure_kinds.includes('missing_interface'));
});

test('missing and duplicate interface blocks are hard failures', () => {
  const testCase = caseById('commerce_order_query_document');

  const missing = referenceDetailedDesign(testCase);
  missing.interfaces = missing.interfaces.filter((item) => item.api_id !== 'ORDER_DETAIL');
  assertFailure(scoreDetailedDesign(testCase, missing), 'missing_interface');

  const duplicate = referenceDetailedDesign(testCase);
  duplicate.interfaces.push({ ...cloned(duplicate.interfaces[0]), block_id: '5.3' });
  assertFailure(scoreDetailedDesign(testCase, duplicate), 'duplicate_interface_api_id');
});

test('an interface path that differs from the frozen contract is a hard failure', () => {
  const testCase = caseById('commerce_order_query_document');
  const prediction = referenceDetailedDesign(testCase);
  prediction.interfaces[0].contract = 'GET /trade/all-orders';

  assertFailure(scoreDetailedDesign(testCase, prediction), 'interface_contract_mismatch');
});

test('Gate B normalized scores and hard failures plug into the generic worst-cell ranker', () => {
  const testCase = caseById('commerce_order_query_document');
  const exact = scoreDetailedDesign(testCase, referenceDetailedDesign(testCase));
  const mismatchedPrediction = referenceDetailedDesign(testCase);
  mismatchedPrediction.interfaces[0].contract = 'GET /trade/all-orders';
  const mismatched = scoreDetailedDesign(testCase, mismatchedPrediction);

  const plannedUnit = {
    model_id: 'public/model-small-v1',
    model_tier: 'small',
    source_kind: testCase.source_kind,
    case_id: testCase.case_id,
    repeat: 1,
  };
  const observation = (promptId, result) => ({
    prompt_id: promptId,
    ...plannedUnit,
    score: result.score,
    hard_fail: result.hard_fail,
  });
  const evaluation = evaluatePromptResults({
    schema_version: 1,
    candidate_ids: ['complete_reader_contract', 'collapsed_reader_contract'],
    planned_units: [plannedUnit],
    observations: [
      observation('complete_reader_contract', exact),
      observation('collapsed_reader_contract', mismatched),
    ],
    thresholds: {
      max_hard_fail_count: 0,
      min_worst_cell_mean: 0.9,
      min_overall_mean: 0.95,
    },
  });

  assert.equal(evaluation.selected_prompt_id, 'complete_reader_contract');
  assert.equal(evaluation.ranking[0].passes_thresholds, true);
  assert.equal(evaluation.ranking[1].passes_thresholds, false);
});

test('quick validation recomputes detailed-design counts, thresholds, and winner', async () => {
  const validatorPath = path.join(projectKnowledgeSkillDir, 'quick_validate.py');
  const pythonProgram = String.raw`
import json
import runpy
import sys
from pathlib import Path

validator_path = Path(sys.argv[1])
skill_dir = Path(sys.argv[2])
mutation = sys.argv[3]
module = runpy.run_path(str(validator_path))
selection = json.loads((skill_dir / "references" / "secondary-capability-detailed-design-prompt-selection.json").read_text(encoding="utf-8"))
cases = json.loads((skill_dir / "references" / "secondary-capability-detailed-design-eval-cases.json").read_text(encoding="utf-8"))

if mutation == "score":
    selection["diagnostic"]["candidate_results"]["detailed-design-baseline-v1"]["overall_mean"] = 0.5
elif mutation == "winner":
    selection["selected_prompt_id"] = "detailed-design-closure-first-v1"
    selection["selected_prompt_path"] = "secondary-capability-detailed-design-prompt-closure-first.md"
elif mutation == "count":
    selection["diagnostic"]["planned_observation_count"] -= 1
elif mutation == "hard_fail":
    selection["diagnostic"]["candidate_results"]["detailed-design-baseline-v1"]["hard_fail_count"] = 1
elif mutation == "prompt_length":
    selection["diagnostic"]["candidate_results"]["detailed-design-baseline-v1"]["prompt_length"] += 1

error = module["detailed_design_prompt_selection_error"](selection, cases, skill_dir)
print(error or "OK")
`;
  const validateMutation = async (mutation) => {
    const { stdout } = await execFileAsync('python3', [
      '-B',
      '-c',
      pythonProgram,
      validatorPath,
      projectKnowledgeSkillDir,
      mutation,
    ]);
    return stdout.trim();
  };

  assert.equal(await validateMutation('none'), 'OK');
  assert.match(await validateMutation('score'), /overall_mean is inconsistent/);
  assert.match(await validateMutation('winner'), /does not match recomputed winner/);
  assert.match(await validateMutation('count'), /planned_observation_count is inconsistent/);
  assert.match(await validateMutation('hard_fail'), /hard_fail_count is inconsistent/);
  assert.match(await validateMutation('prompt_length'), /prompt_length drifted/);
});
