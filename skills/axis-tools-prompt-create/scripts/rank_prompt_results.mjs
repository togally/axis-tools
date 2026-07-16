#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function rankPromptResults(observations) {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('observations must be a non-empty array');
  }

  const byPrompt = new Map();
  for (const [index, item] of observations.entries()) {
    for (const key of ['prompt_id', 'model_tier', 'source_kind']) {
      if (typeof item?.[key] !== 'string' || item[key].length === 0) {
        throw new Error(`observations[${index}].${key} must be a non-empty string`);
      }
    }
    if (!Number.isFinite(item.score) || item.score < 0 || item.score > 1) {
      throw new Error(`observations[${index}].score must be between 0 and 1`);
    }
    if (typeof item.hard_fail !== 'boolean') {
      throw new Error(`observations[${index}].hard_fail must be boolean`);
    }
    const prompt = byPrompt.get(item.prompt_id) ?? [];
    prompt.push(item);
    byPrompt.set(item.prompt_id, prompt);
  }

  const ranking = [];
  for (const [promptId, rows] of byPrompt) {
    const cells = new Map();
    for (const row of rows) {
      const key = `${row.model_tier}::${row.source_kind}`;
      const scores = cells.get(key) ?? [];
      scores.push(row.score);
      cells.set(key, scores);
    }
    const cellMeans = [...cells.entries()].map(([cell, scores]) => ({ cell, mean_score: mean(scores) }));
    const values = cellMeans.map((cell) => cell.mean_score);
    ranking.push({
      prompt_id: promptId,
      hard_fail_count: rows.filter((row) => row.hard_fail).length,
      worst_cell_mean: Math.min(...values),
      overall_mean: mean(rows.map((row) => row.score)),
      cell_spread: Math.max(...values) - Math.min(...values),
      observation_count: rows.length,
      cells: cellMeans.sort((a, b) => a.cell.localeCompare(b.cell)),
    });
  }

  return ranking.sort((a, b) =>
    a.hard_fail_count - b.hard_fail_count
    || b.worst_cell_mean - a.worst_cell_mean
    || b.overall_mean - a.overall_mean
    || a.cell_spread - b.cell_spread
    || a.prompt_id.localeCompare(b.prompt_id));
}

async function main() {
  const inputPath = argValue('--input');
  if (!inputPath) throw new Error('Usage: rank_prompt_results.mjs --input <observations.json>');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const observations = Array.isArray(input) ? input : input.observations;
  process.stdout.write(`${JSON.stringify({ ranking: rankPromptResults(observations) }, null, 2)}\n`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
