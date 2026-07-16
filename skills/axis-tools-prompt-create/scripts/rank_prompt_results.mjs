#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const INPUT_SCHEMA_VERSION = 1;
const THRESHOLD_KEYS = [
  'max_hard_fail_count',
  'min_worst_cell_mean',
  'min_overall_mean',
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function tupleKey(...values) {
  return JSON.stringify(values);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateThresholds(thresholds) {
  if (thresholds === null || Array.isArray(thresholds) || typeof thresholds !== 'object') {
    throw new Error('thresholds must be an object');
  }
  for (const key of Object.keys(thresholds)) {
    if (!THRESHOLD_KEYS.includes(key)) {
      throw new Error(`unknown threshold key: ${key}`);
    }
  }
  for (const key of THRESHOLD_KEYS) {
    if (!Object.hasOwn(thresholds, key)) {
      throw new Error(`thresholds.${key} is required`);
    }
  }
  if (!Number.isInteger(thresholds.max_hard_fail_count) || thresholds.max_hard_fail_count < 0) {
    throw new Error('thresholds.max_hard_fail_count must be a non-negative integer');
  }
  for (const key of ['min_worst_cell_mean', 'min_overall_mean']) {
    if (!Number.isFinite(thresholds[key]) || thresholds[key] < 0 || thresholds[key] > 1) {
      throw new Error(`thresholds.${key} must be between 0 and 1`);
    }
  }
  return { ...thresholds };
}

function validatePlannedUnits(plannedUnits) {
  if (!Array.isArray(plannedUnits) || plannedUnits.length === 0) {
    throw new Error('planned_units must be a non-empty array');
  }

  const units = new Map();
  const modelTiers = new Map();
  const caseSources = new Map();
  for (const [index, unit] of plannedUnits.entries()) {
    for (const key of ['model_id', 'model_tier', 'source_kind', 'case_id']) {
      if (typeof unit?.[key] !== 'string' || unit[key].length === 0) {
        throw new Error(`planned_units[${index}].${key} must be a non-empty string`);
      }
    }
    if (!Number.isInteger(unit.repeat) || unit.repeat < 1) {
      throw new Error(`planned_units[${index}].repeat must be a positive integer`);
    }

    const knownTier = modelTiers.get(unit.model_id);
    if (knownTier !== undefined && knownTier !== unit.model_tier) {
      throw new Error(`model_id ${unit.model_id} maps to multiple model_tier values in planned_units`);
    }
    modelTiers.set(unit.model_id, unit.model_tier);

    const knownSource = caseSources.get(unit.case_id);
    if (knownSource !== undefined && knownSource !== unit.source_kind) {
      throw new Error(`case_id ${unit.case_id} maps to multiple source_kind values in planned_units`);
    }
    caseSources.set(unit.case_id, unit.source_kind);

    const key = tupleKey(unit.model_id, unit.source_kind, unit.case_id, unit.repeat);
    if (units.has(key)) {
      throw new Error(`duplicate planned_units entry at index ${index}`);
    }
    units.set(key, unit);
  }
  return { units, modelTiers };
}

function validateCandidateIds(candidateIds) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    throw new Error('candidate_ids must be a non-empty array');
  }
  const candidates = new Set();
  for (const [index, candidateId] of candidateIds.entries()) {
    if (typeof candidateId !== 'string' || candidateId.length === 0) {
      throw new Error(`candidate_ids[${index}] must be a non-empty string`);
    }
    if (candidates.has(candidateId)) {
      throw new Error(`duplicate candidate_ids entry: ${candidateId}`);
    }
    candidates.add(candidateId);
  }
  return candidates;
}

function validateObservations(observations, plan, candidateIds) {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('observations must be a non-empty array');
  }

  const candidates = validateCandidateIds(candidateIds);
  const byPrompt = new Map([...candidates].map((candidateId) => [candidateId, {
    rows: [],
    units: new Set(),
  }]));
  for (const [index, item] of observations.entries()) {
    for (const key of ['prompt_id', 'model_id', 'model_tier', 'source_kind', 'case_id']) {
      if (typeof item?.[key] !== 'string' || item[key].length === 0) {
        throw new Error(`observations[${index}].${key} must be a non-empty string`);
      }
    }
    if (!Number.isInteger(item.repeat) || item.repeat < 1) {
      throw new Error(`observations[${index}].repeat must be a positive integer`);
    }
    if (!Number.isFinite(item.score) || item.score < 0 || item.score > 1) {
      throw new Error(`observations[${index}].score must be between 0 and 1`);
    }
    if (typeof item.hard_fail !== 'boolean') {
      throw new Error(`observations[${index}].hard_fail must be boolean`);
    }
    if (item.hard_fail && item.score !== 0) {
      throw new Error(`observations[${index}] hard_fail observations must have score 0`);
    }
    for (const key of ['prompt_length', 'estimated_cost']) {
      if (item[key] !== undefined && (!Number.isFinite(item[key]) || item[key] < 0)) {
        throw new Error(`observations[${index}].${key} must be a non-negative number when supplied`);
      }
    }

    const unitKey = tupleKey(item.model_id, item.source_kind, item.case_id, item.repeat);
    if (!plan.units.has(unitKey)) {
      throw new Error(`observations[${index}] is outside the frozen planned matrix`);
    }
    if (plan.modelTiers.get(item.model_id) !== item.model_tier) {
      throw new Error(`observations[${index}].model_tier does not match planned_units`);
    }
    if (!candidates.has(item.prompt_id)) {
      throw new Error(`observations[${index}].prompt_id is not in candidate_ids`);
    }

    const prompt = byPrompt.get(item.prompt_id);
    if (prompt.units.has(unitKey)) {
      throw new Error(`duplicate planned matrix observation for prompt ${item.prompt_id}`);
    }
    prompt.rows.push(item);
    prompt.units.add(unitKey);
    byPrompt.set(item.prompt_id, prompt);
  }

  for (const [promptId, prompt] of byPrompt) {
    const missing = [...plan.units.keys()].filter((unitKey) => !prompt.units.has(unitKey));
    if (missing.length > 0) {
      throw new Error(`incomplete planned matrix for prompt ${promptId}; missing ${missing.length} unit(s)`);
    }
  }
  return new Map([...byPrompt].map(([promptId, prompt]) => [promptId, prompt.rows]));
}

function summarizeOptionalMetric(rows, key, constant) {
  const supplied = rows.filter((row) => row[key] !== undefined);
  if (supplied.length === 0) return null;
  if (supplied.length !== rows.length) {
    throw new Error(`${key} must be supplied for every observation of a prompt or omitted entirely`);
  }
  const values = supplied.map((row) => row[key]);
  if (constant && values.some((value) => value !== values[0])) {
    throw new Error(`${key} must be constant for every observation of a prompt`);
  }
  return constant ? values[0] : mean(values);
}

export function rankPromptResults(observations, plannedUnits, candidateIds) {
  const plan = validatePlannedUnits(plannedUnits);
  const byPrompt = validateObservations(observations, plan, candidateIds);
  const ranking = [];
  for (const [promptId, rows] of byPrompt) {
    const cells = new Map();
    for (const row of rows) {
      const key = tupleKey(row.model_id, row.source_kind);
      const cell = cells.get(key) ?? {
        model_id: row.model_id,
        source_kind: row.source_kind,
        scores: [],
      };
      cell.scores.push(row.score);
      cells.set(key, cell);
    }
    const cellMeans = [...cells.values()].map((cell) => ({
      model_id: cell.model_id,
      source_kind: cell.source_kind,
      mean_score: mean(cell.scores),
    }));
    cellMeans.sort((left, right) =>
      compareText(left.model_id, right.model_id)
      || compareText(left.source_kind, right.source_kind));
    const values = cellMeans.map((cell) => cell.mean_score);
    ranking.push({
      prompt_id: promptId,
      hard_fail_count: rows.filter((row) => row.hard_fail).length,
      worst_cell_mean: Math.min(...values),
      overall_mean: mean(rows.map((row) => row.score)),
      cell_spread: Math.max(...values) - Math.min(...values),
      prompt_length: summarizeOptionalMetric(rows, 'prompt_length', true),
      estimated_cost: summarizeOptionalMetric(rows, 'estimated_cost', false),
      observation_count: rows.length,
      cells: cellMeans,
    });
  }

  const comparable = (value) => value === null ? Number.POSITIVE_INFINITY : value;
  return ranking.sort((left, right) =>
    left.hard_fail_count - right.hard_fail_count
    || right.worst_cell_mean - left.worst_cell_mean
    || right.overall_mean - left.overall_mean
    || left.cell_spread - right.cell_spread
    || comparable(left.prompt_length) - comparable(right.prompt_length)
    || comparable(left.estimated_cost) - comparable(right.estimated_cost)
    || compareText(left.prompt_id, right.prompt_id));
}

export function evaluatePromptResults(input) {
  if (input === null || Array.isArray(input) || typeof input !== 'object') {
    throw new Error('input must be a schema-versioned object');
  }
  const allowedKeys = new Set([
    'schema_version',
    'candidate_ids',
    'planned_units',
    'observations',
    'thresholds',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) throw new Error(`unknown input key: ${key}`);
  }
  if (input.schema_version !== INPUT_SCHEMA_VERSION) {
    throw new Error(`schema_version must be ${INPUT_SCHEMA_VERSION}`);
  }
  const thresholds = validateThresholds(input.thresholds);
  const ranking = rankPromptResults(
    input.observations,
    input.planned_units,
    input.candidate_ids,
  ).map((row) => ({
    ...row,
    passes_thresholds:
      row.hard_fail_count <= thresholds.max_hard_fail_count
      && row.worst_cell_mean >= thresholds.min_worst_cell_mean
      && row.overall_mean >= thresholds.min_overall_mean,
  }));
  return {
    schema_version: INPUT_SCHEMA_VERSION,
    candidate_count: input.candidate_ids.length,
    planned_unit_count: input.planned_units.length,
    ranking,
    selected_prompt_id: ranking.find((row) => row.passes_thresholds)?.prompt_id ?? null,
    thresholds,
  };
}

async function main() {
  const inputPath = argValue('--input');
  if (!inputPath) throw new Error('Usage: rank_prompt_results.mjs --input <evaluation.json>');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(evaluatePromptResults(input), null, 2)}\n`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
