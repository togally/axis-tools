#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);

function rounded(value) {
  return Math.round(value * 10_000) / 10_000;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function values(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedSet(value) {
  return new Set(values(value).filter(nonEmptyString).map((item) => item.trim()));
}

function duplicateStrings(value) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of values(value).filter(nonEmptyString).map((entry) => entry.trim())) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates].sort();
}

function difference(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

function sameSet(left, right) {
  return left.size === right.size && difference(left, right).length === 0;
}

function setF1(expected, actual) {
  if (expected.size === 0 && actual.size === 0) return 1;
  const matches = [...actual].filter((item) => expected.has(item)).length;
  const precision = actual.size === 0 ? 0 : matches / actual.size;
  const recall = expected.size === 0 ? 0 : matches / expected.size;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function addFailure(failures, code, detail = null) {
  if (!failures.has(code)) failures.set(code, []);
  if (detail !== null && !failures.get(code).includes(detail)) failures.get(code).push(detail);
}

function normalizedContract(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function semanticTokens(value) {
  return new Set(
    String(value ?? '')
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+/gu) ?? [],
  );
}

function semanticSimilarity(expected, actual) {
  return setF1(semanticTokens(expected), semanticTokens(actual));
}

function requireSemanticMatch(expected, actual, failures, code, scope) {
  const similarity = semanticSimilarity(expected, actual);
  if (similarity < 0.4) addFailure(failures, code, scope);
  return similarity;
}

function contractCount(value) {
  const body = normalizedContract(value);
  const matches = body.match(
    /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}?&=./:\-]+|\b(?:EVENT|TOPIC|JOB|COMMAND)\s+[A-Za-z0-9_.:/\-]+/g,
  );
  return matches?.length ?? 0;
}

function evidenceIds(testCase) {
  return new Set(values(testCase?.model_input?.evidence).map((item) => item?.id).filter(nonEmptyString));
}

function validateEvidenceRefs(refs, allowedEvidence, failures, scope) {
  if (!Array.isArray(refs) || refs.length === 0) {
    addFailure(failures, 'missing_evidence_reference', scope);
    return;
  }
  const duplicates = duplicateStrings(refs);
  if (duplicates.length > 0) addFailure(failures, 'duplicate_evidence_reference', `${scope}:${duplicates.join(',')}`);
  const invented = difference(normalizedSet(refs), allowedEvidence);
  if (invented.length > 0) addFailure(failures, 'invented_evidence_reference', `${scope}:${invented.join(',')}`);
}

function validateEvidenceBinding(expectedRefs, actualRefs, failures, code, scope) {
  if (!sameSet(normalizedSet(expectedRefs), normalizedSet(actualRefs))) {
    addFailure(failures, code, scope);
  }
}

function scopedStepKey(flowId, stepId) {
  return `${flowId}::${stepId}`;
}

function edgeKey(flowId, fromStepId, toStepId) {
  return `${flowId}::${fromStepId}->${toStepId}`;
}

function expectedFlowModel(testCase) {
  const flows = values(testCase?.oracle?.expected_flows);
  const flowIds = new Set();
  const steps = new Map();
  const edges = new Set();
  for (const flow of flows) {
    flowIds.add(flow.flow_id);
    for (const step of values(flow.steps)) {
      const key = scopedStepKey(flow.flow_id, step.step_id);
      steps.set(key, { ...step, flow_id: flow.flow_id });
      for (const target of values(step.next_step_ids)) {
        edges.add(edgeKey(flow.flow_id, step.step_id, target));
      }
    }
  }
  return { flows, flowIds, steps, edges };
}

function predictedFlowModel(prediction, failures, allowedEvidence) {
  const flows = values(prediction?.flows);
  if (!Array.isArray(prediction?.flows) || flows.length === 0) addFailure(failures, 'missing_flow');
  const flowIdsList = flows.map((flow) => flow?.flow_id).filter(nonEmptyString);
  for (const duplicate of duplicateStrings(flowIdsList)) addFailure(failures, 'duplicate_flow_id', duplicate);

  const flowIds = new Set(flowIdsList);
  const steps = new Map();
  const stepKeys = [];
  const edges = new Set();
  const actorRefs = new Set();
  const apiRefs = new Set();
  const connectedFlows = new Set();

  for (const flow of flows) {
    const flowId = flow?.flow_id;
    if (!nonEmptyString(flowId)) {
      addFailure(failures, 'invalid_flow_id');
      continue;
    }
    const flowSteps = values(flow.steps);
    if (!Array.isArray(flow.steps) || flowSteps.length === 0) addFailure(failures, 'empty_flow', flowId);
    const localStepIds = flowSteps.map((step) => step?.step_id).filter(nonEmptyString);
    for (const duplicate of duplicateStrings(localStepIds)) {
      addFailure(failures, 'duplicate_flow_step', `${flowId}:${duplicate}`);
    }
    const localStepSet = new Set(localStepIds);
    for (const step of flowSteps) {
      const stepId = step?.step_id;
      if (!nonEmptyString(stepId)) {
        addFailure(failures, 'invalid_flow_step', flowId);
        continue;
      }
      const key = scopedStepKey(flowId, stepId);
      stepKeys.push(key);
      if (steps.has(key)) addFailure(failures, 'duplicate_flow_step', key);
      steps.set(key, { ...step, flow_id: flowId });

      if (!nonEmptyString(step.actor_id)) addFailure(failures, 'flow_step_missing_actor', key);
      else actorRefs.add(step.actor_id.trim());
      if (!nonEmptyString(step.api_id)) addFailure(failures, 'flow_step_missing_api', key);
      else if (step.api_id.trim() !== 'not_applicable') apiRefs.add(step.api_id.trim());
      for (const field of ['action', 'input_state', 'output_state']) {
        if (!nonEmptyString(step[field])) addFailure(failures, `flow_step_missing_${field}`, key);
      }
      validateEvidenceRefs(step.evidence_ids, allowedEvidence, failures, `flow:${key}`);
      for (const target of values(step.next_step_ids)) {
        if (!nonEmptyString(target) || !localStepSet.has(target)) {
          addFailure(failures, 'flow_edge_unknown_target', `${key}->${String(target)}`);
          continue;
        }
        edges.add(edgeKey(flowId, stepId, target));
      }
    }

    const startIds = normalizedSet(flow.start_step_ids);
    const terminalIds = normalizedSet(flow.terminal_step_ids);
    if (startIds.size === 0 || difference(startIds, localStepSet).length > 0) {
      addFailure(failures, 'invalid_flow_start', flowId);
    }
    if (terminalIds.size === 0 || difference(terminalIds, localStepSet).length > 0) {
      addFailure(failures, 'invalid_flow_terminal', flowId);
    }

    const adjacency = new Map([...localStepSet].map((stepId) => [stepId, []]));
    const reverse = new Map([...localStepSet].map((stepId) => [stepId, []]));
    for (const step of flowSteps) {
      if (!nonEmptyString(step?.step_id)) continue;
      for (const target of values(step.next_step_ids).filter((candidate) => localStepSet.has(candidate))) {
        adjacency.get(step.step_id).push(target);
        reverse.get(target).push(step.step_id);
      }
    }
    const visit = (roots, graph) => {
      const reached = new Set();
      const queue = [...roots];
      while (queue.length > 0) {
        const current = queue.shift();
        if (reached.has(current) || !graph.has(current)) continue;
        reached.add(current);
        queue.push(...graph.get(current));
      }
      return reached;
    };
    const reachableFromStart = visit(startIds, adjacency);
    const canReachTerminal = visit(terminalIds, reverse);
    if (reachableFromStart.size !== localStepSet.size || canReachTerminal.size !== localStepSet.size) {
      addFailure(failures, 'disconnected_flow', flowId);
    } else if (localStepSet.size > 0 && startIds.size > 0 && terminalIds.size > 0) {
      connectedFlows.add(flowId);
    }
  }

  return {
    flows,
    flowIds,
    steps,
    stepKeys,
    edges,
    actorRefs,
    apiRefs,
    connectedFlows,
  };
}

function interfaceModel(testCase, prediction, failures, allowedEvidence) {
  const expectedRows = values(testCase?.oracle?.expected_interfaces);
  const expected = new Map(expectedRows.map((row) => [row.api_id, row]));
  const rows = values(prediction?.interfaces);
  if (!Array.isArray(prediction?.interfaces) || rows.length === 0) addFailure(failures, 'missing_interface_inventory');

  const apiIdList = rows.map((row) => row?.api_id).filter(nonEmptyString);
  const blockIdList = rows.map((row) => row?.block_id).filter(nonEmptyString);
  for (const duplicate of duplicateStrings(apiIdList)) addFailure(failures, 'duplicate_interface_api_id', duplicate);
  for (const duplicate of duplicateStrings(blockIdList)) addFailure(failures, 'duplicate_interface_block_id', duplicate);

  const actualApiIds = new Set(apiIdList);
  const expectedApiIds = new Set(expected.keys());
  for (const missing of difference(expectedApiIds, actualApiIds)) addFailure(failures, 'missing_interface', missing);
  for (const invented of difference(actualApiIds, expectedApiIds)) addFailure(failures, 'invented_interface', invented);

  const actorRefs = new Set();
  let exactContractCount = 0;
  let exactActorMappingCount = 0;
  let independentBlockCount = 0;
  let semanticSimilarityTotal = 0;
  for (const [index, row] of rows.entries()) {
    const apiId = row?.api_id;
    const scope = nonEmptyString(apiId) ? apiId.trim() : `index-${index}`;
    if (!nonEmptyString(row?.block_id) || !/^5\.[1-9]\d*$/.test(row.block_id.trim())) {
      addFailure(failures, 'invalid_interface_block_id', scope);
    }
    const contracts = contractCount(row?.contract);
    if (contracts > 1) addFailure(failures, 'merged_interface_block', scope);
    if (contracts === 0) addFailure(failures, 'missing_concrete_interface_contract', scope);
    if (!nonEmptyString(row?.business_purpose)) addFailure(failures, 'missing_interface_business_purpose', scope);
    if (!nonEmptyString(row?.visible_result)) addFailure(failures, 'missing_interface_visible_result', scope);
    validateEvidenceRefs(row?.evidence_ids, allowedEvidence, failures, `interface:${scope}`);

    const actualActors = normalizedSet(row?.actor_ids);
    for (const actorId of actualActors) actorRefs.add(actorId);
    const expectedRow = expected.get(apiId);
    if (expectedRow) {
      if (normalizedContract(row.contract) === normalizedContract(expectedRow.contract)) exactContractCount += 1;
      else addFailure(failures, 'interface_contract_mismatch', apiId);
      const expectedActors = normalizedSet(expectedRow.actor_ids);
      if (sameSet(actualActors, expectedActors)) exactActorMappingCount += 1;
      else addFailure(failures, 'interface_actor_mismatch', apiId);
      if (contracts === 1
        && apiIdList.filter((candidate) => candidate === apiId).length === 1
        && blockIdList.filter((candidate) => candidate === row.block_id).length === 1) {
        independentBlockCount += 1;
      }
      const inputRow = values(testCase?.model_input?.interface_inventory)
        .find((candidate) => candidate?.api_id === apiId);
      if (inputRow) {
        validateEvidenceBinding(
          inputRow.evidence_ids,
          row.evidence_ids,
          failures,
          'interface_evidence_binding_mismatch',
          apiId,
        );
        semanticSimilarityTotal += requireSemanticMatch(
          inputRow.business_purpose,
          row.business_purpose,
          failures,
          'interface_business_purpose_semantics_mismatch',
          apiId,
        );
        semanticSimilarityTotal += requireSemanticMatch(
          inputRow.visible_result,
          row.visible_result,
          failures,
          'interface_visible_result_semantics_mismatch',
          apiId,
        );
      }
    }
  }

  const expectedBlockIds = rows.map((_, index) => `5.${index + 1}`);
  if (blockIdList.length !== rows.length
    || blockIdList.some((blockId, index) => blockId !== expectedBlockIds[index])) {
    addFailure(failures, 'interface_block_numbering_mismatch');
  }

  return {
    expected,
    expectedApiIds,
    actualApiIds,
    actorRefs,
    exactContractCount,
    exactActorMappingCount,
    independentBlockCount,
    semanticSimilarityTotal,
  };
}

export function modelInputCase(testCase) {
  if (testCase === null || Array.isArray(testCase) || typeof testCase !== 'object') {
    throw new Error('test case must be an object');
  }
  if (testCase.model_input === null || Array.isArray(testCase.model_input)
    || typeof testCase.model_input !== 'object') {
    throw new Error('test case model_input must be an object');
  }
  if (!nonEmptyString(testCase.case_id)) throw new Error('test case requires case_id');
  return {
    case_id: testCase.case_id,
    ...clone(testCase.model_input),
  };
}

export function buildDetailedDesignModelInput(promptBody, testCase) {
  return [
    String(promptBody ?? ''),
    '',
    'The secondary-capability boundary is locked. Do not split or merge it.',
    'Assess and render the supplied evidence only as directed by the candidate prompt.',
    'Return only the requested structured detailed-design schema. Do not use outside knowledge or tools.',
    '',
    'INPUT CASE:',
    JSON.stringify(modelInputCase(testCase), null, 2),
  ].join('\n');
}

export function referenceDetailedDesign(testCase) {
  const input = modelInputCase(testCase);
  const renderStatus = testCase?.oracle?.expected_render_status ?? 'ready';
  const blockingGapCodes = clone(testCase?.oracle?.expected_blocking_gap_codes ?? []);
  if (renderStatus === 'blocked') {
    return {
      case_id: testCase.case_id,
      secondary_capability_id: input.locked_secondary_capability.secondary_capability_id,
      render_status: 'blocked',
      blocking_gap_codes: blockingGapCodes,
      participants: [],
      flows: [],
      interfaces: [],
    };
  }
  return {
    case_id: testCase.case_id,
    secondary_capability_id: input.locked_secondary_capability.secondary_capability_id,
    render_status: 'ready',
    blocking_gap_codes: [],
    participants: clone(input.participant_inventory),
    flows: clone(input.flow_inventory),
    interfaces: input.interface_inventory.map((item, index) => ({
      block_id: `5.${index + 1}`,
      ...clone(item),
    })),
  };
}

export function scoreDetailedDesign(testCase, prediction) {
  if (!testCase?.oracle || !testCase?.model_input) throw new Error('test case requires model_input and oracle');
  const failures = new Map();
  const allowedEvidence = evidenceIds(testCase);
  if (prediction === null || Array.isArray(prediction) || typeof prediction !== 'object') {
    addFailure(failures, 'invalid_prediction_schema');
    return {
      score: 0,
      raw_score: 0,
      hard_fail: true,
      failure_kinds: [...failures.keys()],
      failure_details: Object.fromEntries(failures),
      participant_score: 0,
      flow_score: 0,
      interface_score: 0,
    };
  }

  if (prediction.case_id !== testCase.case_id) addFailure(failures, 'case_identity_mismatch');
  const expectedSecondaryId = testCase.model_input.locked_secondary_capability.secondary_capability_id;
  if (prediction.secondary_capability_id !== expectedSecondaryId) {
    addFailure(failures, 'secondary_capability_identity_mismatch');
  }

  const expectedRenderStatus = testCase.oracle.expected_render_status ?? 'ready';
  const expectedBlockingGapCodes = normalizedSet(
    testCase.oracle.expected_blocking_gap_codes ?? [],
  );
  const allowedBlockingGapCodes = normalizedSet(
    testCase.oracle.allowed_blocking_gap_codes
      ?? testCase.oracle.expected_blocking_gap_codes
      ?? [],
  );
  const actualBlockingGapCodes = normalizedSet(prediction.blocking_gap_codes);
  if (!/^(?:ready|blocked)$/.test(String(prediction.render_status ?? ''))) {
    addFailure(failures, 'invalid_render_status');
  } else if (prediction.render_status !== expectedRenderStatus) {
    addFailure(failures, 'render_status_mismatch');
  }
  if (!Array.isArray(prediction.blocking_gap_codes)) {
    addFailure(failures, 'invalid_blocking_gap_codes');
  }
  for (const duplicate of duplicateStrings(prediction.blocking_gap_codes)) {
    addFailure(failures, 'duplicate_blocking_gap_code', duplicate);
  }
  if (difference(expectedBlockingGapCodes, actualBlockingGapCodes).length > 0
    || difference(actualBlockingGapCodes, allowedBlockingGapCodes).length > 0) {
    addFailure(failures, 'blocking_gap_codes_mismatch');
  }

  if (expectedRenderStatus === 'blocked') {
    if (values(prediction.participants).length > 0
      || values(prediction.flows).length > 0
      || values(prediction.interfaces).length > 0) {
      addFailure(failures, 'blocked_output_contains_detailed_design');
    }
    const hardFail = failures.size > 0;
    return {
      score: hardFail ? 0 : 1,
      raw_score: hardFail ? 0 : 1,
      hard_fail: hardFail,
      failure_kinds: [...failures.keys()].sort(),
      failure_details: Object.fromEntries(
        [...failures.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
      participant_score: hardFail ? 0 : 1,
      flow_score: hardFail ? 0 : 1,
      interface_score: hardFail ? 0 : 1,
      expected_actor_count: 0,
      expected_flow_count: 0,
      expected_step_count: 0,
      expected_interface_count: 0,
    };
  }

  const expectedActors = normalizedSet(testCase.oracle.required_actor_ids);
  const expectedParticipantRows = new Map(
    values(testCase.model_input.participant_inventory).map((row) => [row?.actor_id, row]),
  );
  const participantRows = values(prediction.participants);
  if (!Array.isArray(prediction.participants) || participantRows.length === 0) {
    addFailure(failures, 'missing_participant_inventory');
  }
  const participantIdsList = participantRows.map((row) => row?.actor_id).filter(nonEmptyString);
  const actualActors = new Set(participantIdsList);
  for (const duplicate of duplicateStrings(participantIdsList)) addFailure(failures, 'duplicate_participant', duplicate);
  for (const missing of difference(expectedActors, actualActors)) addFailure(failures, 'missing_participant', missing);
  for (const invented of difference(actualActors, expectedActors)) addFailure(failures, 'invented_participant', invented);
  for (const [index, row] of participantRows.entries()) {
    const scope = nonEmptyString(row?.actor_id) ? row.actor_id : `index-${index}`;
    if (!nonEmptyString(row?.actor_id)) addFailure(failures, 'invalid_participant', scope);
    if (!nonEmptyString(row?.role)) addFailure(failures, 'missing_participant_role', scope);
    if (!nonEmptyString(row?.responsibility)) addFailure(failures, 'missing_participant_responsibility', scope);
    validateEvidenceRefs(row?.evidence_ids, allowedEvidence, failures, `participant:${scope}`);
    const expectedRow = expectedParticipantRows.get(row?.actor_id);
    if (expectedRow) {
      validateEvidenceBinding(
        expectedRow.evidence_ids,
        row.evidence_ids,
        failures,
        'participant_evidence_binding_mismatch',
        scope,
      );
    }
  }
  let participantSemanticSimilarityTotal = 0;
  for (const actorId of expectedActors) {
    const expectedRow = expectedParticipantRows.get(actorId);
    const actualRow = participantRows.find((row) => row?.actor_id === actorId);
    if (!expectedRow || !actualRow) continue;
    participantSemanticSimilarityTotal += requireSemanticMatch(
      expectedRow.role,
      actualRow.role,
      failures,
      'participant_role_semantics_mismatch',
      actorId,
    );
    participantSemanticSimilarityTotal += requireSemanticMatch(
      expectedRow.responsibility,
      actualRow.responsibility,
      failures,
      'participant_responsibility_semantics_mismatch',
      actorId,
    );
  }

  const expectedFlow = expectedFlowModel(testCase);
  const actualFlow = predictedFlowModel(prediction, failures, allowedEvidence);
  for (const missing of difference(expectedFlow.flowIds, actualFlow.flowIds)) addFailure(failures, 'missing_flow', missing);
  for (const invented of difference(actualFlow.flowIds, expectedFlow.flowIds)) addFailure(failures, 'invented_flow', invented);

  const expectedStepKeys = new Set(expectedFlow.steps.keys());
  const actualStepKeys = new Set(actualFlow.steps.keys());
  for (const missing of difference(expectedStepKeys, actualStepKeys)) addFailure(failures, 'missing_flow_step', missing);
  for (const invented of difference(actualStepKeys, expectedStepKeys)) addFailure(failures, 'invented_flow_step', invented);
  for (const missing of difference(expectedFlow.edges, actualFlow.edges)) addFailure(failures, 'missing_flow_edge', missing);
  for (const invented of difference(actualFlow.edges, expectedFlow.edges)) addFailure(failures, 'invented_flow_edge', invented);

  let exactStepMappingCount = 0;
  let flowSemanticSimilarityTotal = 0;
  const modelInputSteps = new Map();
  for (const flow of values(testCase.model_input.flow_inventory)) {
    for (const step of values(flow?.steps)) {
      modelInputSteps.set(scopedStepKey(flow.flow_id, step.step_id), step);
    }
  }
  for (const [key, expectedStep] of expectedFlow.steps) {
    const actualStep = actualFlow.steps.get(key);
    if (!actualStep) continue;
    if (actualStep.actor_id === expectedStep.actor_id && actualStep.api_id === expectedStep.api_id) {
      exactStepMappingCount += 1;
    } else {
      addFailure(failures, 'flow_step_binding_mismatch', key);
    }
    const inputStep = modelInputSteps.get(key);
    if (inputStep) {
      validateEvidenceBinding(
        inputStep.evidence_ids,
        actualStep.evidence_ids,
        failures,
        'flow_step_evidence_binding_mismatch',
        key,
      );
      for (const field of ['action', 'input_state', 'output_state']) {
        flowSemanticSimilarityTotal += requireSemanticMatch(
          inputStep[field],
          actualStep[field],
          failures,
          `flow_step_${field}_semantics_mismatch`,
          key,
        );
      }
    }
  }
  for (const expected of expectedFlow.flows) {
    const actual = actualFlow.flows.find((flow) => flow?.flow_id === expected.flow_id);
    if (!actual) continue;
    if (!sameSet(normalizedSet(actual.start_step_ids), normalizedSet(expected.start_step_ids))
      || !sameSet(normalizedSet(actual.terminal_step_ids), normalizedSet(expected.terminal_step_ids))) {
      addFailure(failures, 'flow_boundary_mismatch', expected.flow_id);
    }
  }

  const interfaceResult = interfaceModel(testCase, prediction, failures, allowedEvidence);
  const referencedActors = new Set([...actualFlow.actorRefs, ...interfaceResult.actorRefs]);
  for (const actorId of referencedActors) {
    if (!actualActors.has(actorId) || !expectedActors.has(actorId)) {
      addFailure(failures, 'unknown_actor_reference', actorId);
    }
  }
  for (const actorId of expectedActors) {
    if (!referencedActors.has(actorId)) addFailure(failures, 'unconnected_participant', actorId);
  }
  for (const apiId of actualFlow.apiRefs) {
    if (!interfaceResult.actualApiIds.has(apiId)) addFailure(failures, 'flow_references_unknown_interface', apiId);
  }
  for (const apiId of interfaceResult.expectedApiIds) {
    if (!actualFlow.apiRefs.has(apiId)) addFailure(failures, 'interface_missing_from_flow', apiId);
  }

  const actorSetF1 = setF1(expectedActors, actualActors);
  const actorConnectionCoverage = ratio(
    [...expectedActors].filter((actorId) => referencedActors.has(actorId)).length,
    expectedActors.size,
  );
  const participantSemanticAccuracy = ratio(participantSemanticSimilarityTotal, expectedActors.size * 2);
  const participantScore = (0.35 * actorSetF1)
    + (0.25 * actorConnectionCoverage)
    + (0.4 * participantSemanticAccuracy);

  const stepSetF1 = setF1(expectedStepKeys, actualStepKeys);
  const edgeSetF1 = setF1(expectedFlow.edges, actualFlow.edges);
  const stepBindingAccuracy = ratio(exactStepMappingCount, expectedFlow.steps.size);
  const connectivityCoverage = ratio(actualFlow.connectedFlows.size, expectedFlow.flowIds.size);
  const flowSemanticAccuracy = ratio(flowSemanticSimilarityTotal, expectedFlow.steps.size * 3);
  const flowScore = (0.25 * stepSetF1)
    + (0.25 * edgeSetF1)
    + (0.15 * stepBindingAccuracy)
    + (0.1 * connectivityCoverage)
    + (0.25 * flowSemanticAccuracy);

  const apiSetF1 = setF1(interfaceResult.expectedApiIds, interfaceResult.actualApiIds);
  const expectedInterfaceCount = interfaceResult.expectedApiIds.size;
  const contractAccuracy = ratio(interfaceResult.exactContractCount, expectedInterfaceCount);
  const interfaceActorAccuracy = ratio(interfaceResult.exactActorMappingCount, expectedInterfaceCount);
  const independentBlockCoverage = ratio(interfaceResult.independentBlockCount, expectedInterfaceCount);
  const interfaceSemanticAccuracy = ratio(
    interfaceResult.semanticSimilarityTotal,
    expectedInterfaceCount * 2,
  );
  const interfaceScore = (0.3 * apiSetF1)
    + (0.2 * contractAccuracy)
    + (0.15 * interfaceActorAccuracy)
    + (0.15 * independentBlockCoverage)
    + (0.2 * interfaceSemanticAccuracy);

  const rawScore = (0.3 * participantScore) + (0.35 * flowScore) + (0.35 * interfaceScore);
  const hardFail = failures.size > 0;
  return {
    score: hardFail ? 0 : rounded(rawScore),
    raw_score: rounded(rawScore),
    hard_fail: hardFail,
    failure_kinds: [...failures.keys()].sort(),
    failure_details: Object.fromEntries(
      [...failures.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    participant_score: rounded(participantScore),
    flow_score: rounded(flowScore),
    interface_score: rounded(interfaceScore),
    expected_actor_count: expectedActors.size,
    expected_flow_count: expectedFlow.flowIds.size,
    expected_step_count: expectedFlow.steps.size,
    expected_interface_count: expectedInterfaceCount,
  };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main() {
  const casesPath = argValue('--cases');
  const caseId = argValue('--case-id');
  const predictionPath = argValue('--prediction');
  if (!casesPath || !caseId || !predictionPath) {
    throw new Error('Usage: score_secondary_capability_detailed_design.mjs --cases <cases.json> --case-id <id> --prediction <prediction.json>');
  }
  const casesDocument = JSON.parse(await readFile(path.resolve(casesPath), 'utf8'));
  const testCase = values(casesDocument.cases).find((item) => item.case_id === caseId);
  if (!testCase) throw new Error(`unknown case_id: ${caseId}`);
  const prediction = JSON.parse(await readFile(path.resolve(predictionPath), 'utf8'));
  process.stdout.write(`${JSON.stringify(scoreDetailedDesign(testCase, prediction), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
