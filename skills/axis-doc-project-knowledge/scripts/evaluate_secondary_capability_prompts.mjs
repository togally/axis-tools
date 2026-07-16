#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const skillRoot = path.resolve(path.dirname(scriptPath), '..');

function rounded(value) {
  return Math.round(value * 10_000) / 10_000;
}

function pairKey(left, right) {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function groupKey(ids) {
  return [...new Set(ids)].sort().join('\u0000');
}

function predictionGroups(prediction) {
  if (Array.isArray(prediction?.groups)) return prediction.groups;
  if (Array.isArray(prediction?.secondary_capabilities)) return prediction.secondary_capabilities;
  return [];
}

export function scoreCapabilityPartition(testCase, prediction) {
  const evidenceIds = testCase.evidence.map((item) => item.id);
  const evidenceSet = new Set(evidenceIds);
  const goldGroups = testCase.expected_groups.map((group) => [...group.evidence_ids]);
  const goldByEvidence = new Map();
  goldGroups.forEach((group, index) => group.forEach((id) => goldByEvidence.set(id, index)));

  const rawGroups = predictionGroups(prediction);
  const validGroups = [];
  const assignmentCount = new Map(evidenceIds.map((id) => [id, 0]));
  const inventedEvidence = [];
  let emptyGroupCount = 0;
  let compoundAggregateCount = 0;

  for (const group of rawGroups) {
    const ids = Array.isArray(group?.evidence_ids) ? group.evidence_ids.map(String) : [];
    const validIds = [];
    for (const id of ids) {
      if (!evidenceSet.has(id)) {
        inventedEvidence.push(id);
        continue;
      }
      validIds.push(id);
      assignmentCount.set(id, (assignmentCount.get(id) ?? 0) + 1);
    }
    const uniqueIds = [...new Set(validIds)];
    if (uniqueIds.length === 0) {
      emptyGroupCount += 1;
      continue;
    }
    const goldMemberships = new Set(uniqueIds.map((id) => goldByEvidence.get(id)));
    const compoundName = /(?:、|\/|\band\b|与|及|和)/i.test(String(group?.name ?? ''));
    if (goldMemberships.size > 1 && compoundName) compoundAggregateCount += 1;
    validGroups.push({ ...group, evidence_ids: uniqueIds });
  }

  const missingEvidence = evidenceIds.filter((id) => (assignmentCount.get(id) ?? 0) === 0);
  const duplicateEvidence = evidenceIds.filter((id) => (assignmentCount.get(id) ?? 0) > 1);
  const predictedByEvidence = new Map();
  validGroups.forEach((group, index) => {
    group.evidence_ids.forEach((id) => {
      if (!predictedByEvidence.has(id)) predictedByEvidence.set(id, index);
    });
  });

  let bPrecision = 0;
  let bRecall = 0;
  for (const id of evidenceIds) {
    const goldIndex = goldByEvidence.get(id);
    const predictedIndex = predictedByEvidence.get(id);
    if (goldIndex === undefined || predictedIndex === undefined) continue;
    const gold = new Set(goldGroups[goldIndex]);
    const predicted = new Set(validGroups[predictedIndex].evidence_ids);
    const intersection = [...predicted].filter((candidate) => gold.has(candidate)).length;
    bPrecision += intersection / predicted.size;
    bRecall += intersection / gold.size;
  }
  bPrecision /= Math.max(1, evidenceIds.length);
  bRecall /= Math.max(1, evidenceIds.length);
  const bF1 = bPrecision + bRecall === 0 ? 0 : (2 * bPrecision * bRecall) / (bPrecision + bRecall);

  const goldKeys = new Set(goldGroups.map(groupKey));
  const predictedKeys = new Set(validGroups.map((group) => groupKey(group.evidence_ids)));
  const exactMatches = [...predictedKeys].filter((key) => goldKeys.has(key)).length;
  const exactGroupF1 = goldKeys.size + predictedKeys.size === 0
    ? 1
    : (2 * exactMatches) / (goldKeys.size + predictedKeys.size);

  let differentGoldPairs = 0;
  let mergedDifferentPairs = 0;
  let sameGoldPairs = 0;
  let splitSamePairs = 0;
  for (let left = 0; left < evidenceIds.length; left += 1) {
    for (let right = left + 1; right < evidenceIds.length; right += 1) {
      const leftId = evidenceIds[left];
      const rightId = evidenceIds[right];
      const sameGold = goldByEvidence.get(leftId) === goldByEvidence.get(rightId);
      const leftPredicted = predictedByEvidence.get(leftId);
      const rightPredicted = predictedByEvidence.get(rightId);
      const samePredicted = leftPredicted !== undefined && leftPredicted === rightPredicted;
      if (sameGold) {
        sameGoldPairs += 1;
        if (!samePredicted) splitSamePairs += 1;
      } else {
        differentGoldPairs += 1;
        if (samePredicted) mergedDifferentPairs += 1;
      }
    }
  }

  const coverage = evidenceIds.length === 0
    ? 1
    : (evidenceIds.length - missingEvidence.length) / evidenceIds.length;
  const duplicateRate = evidenceIds.length === 0 ? 0 : duplicateEvidence.length / evidenceIds.length;
  const inventedRate = evidenceIds.length === 0
    ? 0
    : new Set(inventedEvidence).size / evidenceIds.length;
  const rawScore = 100 * ((0.65 * bF1) + (0.25 * exactGroupF1) + (0.10 * coverage));
  const penalty = 100 * Math.min(0.25, (duplicateRate * 0.5) + (inventedRate * 0.5));

  return {
    score: rounded(Math.max(0, rawScore - penalty)),
    bcubed_precision: rounded(bPrecision),
    bcubed_recall: rounded(bRecall),
    bcubed_f1: rounded(bF1),
    exact_group_f1: rounded(exactGroupF1),
    coverage: rounded(coverage),
    under_merge_rate: rounded(differentGoldPairs === 0 ? 0 : mergedDifferentPairs / differentGoldPairs),
    over_split_rate: rounded(sameGoldPairs === 0 ? 0 : splitSamePairs / sameGoldPairs),
    missing_evidence: missingEvidence,
    duplicate_evidence: duplicateEvidence,
    invented_evidence: [...new Set(inventedEvidence)].sort(),
    empty_group_count: emptyGroupCount,
    compound_aggregate_count: compoundAggregateCount,
    predicted_group_count: validGroups.length,
    expected_group_count: goldGroups.length,
    compared_pair_count: new Set(
      evidenceIds.flatMap((left) => evidenceIds.filter((right) => left !== right).map((right) => pairKey(left, right))),
    ).size,
  };
}

export function rankPromptCandidates(records) {
  const byPrompt = new Map();
  for (const record of records.filter((item) => Number.isFinite(item.score))) {
    if (!byPrompt.has(record.prompt_id)) byPrompt.set(record.prompt_id, []);
    byPrompt.get(record.prompt_id).push(record);
  }
  return [...byPrompt.entries()].map(([promptId, promptRecords]) => {
    const byModel = new Map();
    const byEvaluationUnit = new Map();
    for (const record of promptRecords) {
      if (!byModel.has(record.model)) byModel.set(record.model, []);
      byModel.get(record.model).push(record.score);
      const sourceUnit = record.source_kind ?? record.case_id ?? 'all-sources';
      const unitKey = `${record.model}::${sourceUnit}`;
      if (!byEvaluationUnit.has(unitKey)) byEvaluationUnit.set(unitKey, []);
      byEvaluationUnit.get(unitKey).push(record.score);
    }
    const modelScores = Object.fromEntries([...byModel.entries()].map(([model, values]) => [
      model,
      rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    ]));
    const unitScores = Object.fromEntries([...byEvaluationUnit.entries()].map(([unit, values]) => [
      unit,
      rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    ]));
    const scores = promptRecords.map((record) => record.score);
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    const variance = scores.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / scores.length;
    return {
      prompt_id: promptId,
      worst_unit_score: rounded(Math.min(...Object.values(unitScores))),
      mean_score: rounded(mean),
      stability_score: rounded(Math.max(0, 100 - Math.sqrt(variance))),
      model_scores: modelScores,
      model_source_scores: unitScores,
      evaluated_units: promptRecords.length,
    };
  }).sort((left, right) => (
    right.worst_unit_score - left.worst_unit_score
    || right.mean_score - left.mean_score
    || right.stability_score - left.stability_score
    || left.prompt_id.localeCompare(right.prompt_id)
  ));
}

export function modelInputCase(testCase) {
  const {
    expected_groups: _expectedGroups,
    evaluation_stage: _evaluationStage,
    ...inputCase
  } = testCase;
  return inputCase;
}

export function buildModelInput(promptBody, testCase) {
  return [
    promptBody,
    '',
    'Treat this case independently. Do not inspect files, call tools, or use outside knowledge.',
    'Partition only the supplied evidence IDs. Return JSON that matches the provided schema.',
    '',
    'INPUT CASE:',
    JSON.stringify(modelInputCase(testCase), null, 2),
  ].join('\n');
}

function argValue(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function csv(value) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function outputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['case_id', 'groups', 'boundary_decisions', 'quality_gate'],
    properties: {
      case_id: { type: 'string' },
      groups: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'evidence_ids', 'cohesion_statement', 'boundary_dimensions'],
          properties: {
            name: { type: 'string' },
            evidence_ids: { type: 'array', items: { type: 'string' } },
            cohesion_statement: { type: 'string' },
            boundary_dimensions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      boundary_decisions: {
        type: 'object',
        additionalProperties: false,
        required: ['must_split', 'must_merge'],
        properties: {
          must_split: { type: 'array', items: { type: 'string' } },
          must_merge: { type: 'array', items: { type: 'string' } },
        },
      },
      quality_gate: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'unassigned', 'duplicate', 'invented'],
        properties: {
          status: { type: 'string', enum: ['pass', 'fail'] },
          unassigned: { type: 'array', items: { type: 'string' } },
          duplicate: { type: 'array', items: { type: 'string' } },
          invented: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  };
}

async function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.end(input);
  });
}

function safeSlug(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '_');
}

async function runEvaluationTask(task, context) {
  const stem = [
    task.prompt.prompt_id,
    task.model,
    task.testCase.case_id,
    `r${task.repeat}`,
  ].map(safeSlug).join('__');
  const outputPath = path.join(context.runDir, `${stem}.output.json`);
  const eventsPath = path.join(context.runDir, `${stem}.events.jsonl`);
  const errorPath = path.join(context.runDir, `${stem}.stderr.log`);
  const promptBody = await readFile(path.join(skillRoot, 'references', task.prompt.prompt_file), 'utf8');
  const input = buildModelInput(promptBody, task.testCase);

  const args = [
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    '-C', context.runDir,
    '--sandbox', 'read-only',
    '-m', task.model,
    '-c', `model_reasoning_effort="${context.effort}"`,
    '--output-schema', context.schemaPath,
    '--json',
    '-o', outputPath,
    '-',
  ];
  const processResult = await runProcess(context.codex, args, input, context.timeoutMs);
  await writeFile(eventsPath, processResult.stdout, 'utf8');
  await writeFile(errorPath, processResult.stderr, 'utf8');

  let prediction;
  let parseError;
  try {
    const raw = await readFile(outputPath, 'utf8');
    prediction = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const metrics = prediction
    ? scoreCapabilityPartition(task.testCase, prediction)
    : { score: 0, parse_error: parseError ?? 'missing model output' };
  return {
    prompt_id: task.prompt.prompt_id,
    model: task.model,
    reasoning_effort: context.effort,
    case_id: task.testCase.case_id,
    source_kind: task.testCase.source_kind,
    repeat: task.repeat,
    process_exit_code: processResult.code,
    process_signal: processResult.signal,
    timed_out: processResult.timedOut,
    output_file: outputPath,
    events_file: eventsPath,
    stderr_file: errorPath,
    ...metrics,
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
      const result = results[index];
      process.stdout.write(
        `[${index + 1}/${items.length}] ${result.prompt_id} ${result.model} ${result.case_id} score=${result.score}\n`,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

async function main() {
  const casesDocument = JSON.parse(await readFile(
    path.join(skillRoot, 'references', 'secondary-capability-eval-cases.json'),
    'utf8',
  ));
  const candidatesDocument = JSON.parse(await readFile(
    path.join(skillRoot, 'references', 'secondary-capability-prompt-candidates.json'),
    'utf8',
  ));
  const requestedCases = new Set(csv(argValue('--case-ids')));
  const stage = argValue('--stage', 'selection');
  const testCases = casesDocument.cases.filter((item) => (
    requestedCases.size > 0 ? requestedCases.has(item.case_id) : item.evaluation_stage === stage
  ));
  const requestedCandidates = new Set(csv(argValue('--candidate-ids')));
  const prompts = candidatesDocument.candidates.filter((item) => (
    requestedCandidates.size === 0 || requestedCandidates.has(item.prompt_id)
  ));
  const models = csv(argValue('--models', 'gpt-5.4-mini,gpt-5.4,gpt-5.5'));
  const repeats = Number(argValue('--repeats', '1'));
  const effort = argValue('--effort', 'medium');
  const concurrency = Number(argValue('--concurrency', '3'));
  const timeoutMs = Number(argValue('--timeout-ms', '240000'));
  const codex = argValue('--codex', 'codex');
  if (testCases.length === 0 || prompts.length === 0 || models.length === 0) {
    throw new Error('evaluation matrix is empty');
  }

  const runDir = argValue('--out')
    ? path.resolve(argValue('--out'))
    : await mkdtemp(path.join(os.tmpdir(), 'axis-secondary-capability-eval-'));
  await mkdir(runDir, { recursive: true });
  const schemaPath = path.join(runDir, 'output.schema.json');
  await writeFile(schemaPath, `${JSON.stringify(outputSchema(), null, 2)}\n`, 'utf8');

  const tasks = [];
  for (const prompt of prompts) {
    for (const model of models) {
      for (const testCase of testCases) {
        for (let repeat = 1; repeat <= repeats; repeat += 1) {
          tasks.push({ prompt, model, testCase, repeat });
        }
      }
    }
  }
  const plan = {
    run_dir: runDir,
    calls: tasks.length,
    candidates: prompts.map((item) => item.prompt_id),
    models,
    effort,
    cases: testCases.map((item) => item.case_id),
    repeats,
  };
  await writeFile(path.join(runDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (process.argv.includes('--dry-run')) return;

  const records = await mapWithConcurrency(tasks, concurrency, (task) => runEvaluationTask(task, {
    runDir,
    schemaPath,
    effort,
    codex,
    timeoutMs,
  }));
  const ranking = rankPromptCandidates(records);
  const report = {
    ...plan,
    completed_at: new Date().toISOString(),
    records,
    ranking,
  };
  const reportPath = path.join(runDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`report=${reportPath}\n${JSON.stringify(ranking, null, 2)}\n`);
  if (records.some((record) => record.process_exit_code !== 0 || record.parse_error)) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
