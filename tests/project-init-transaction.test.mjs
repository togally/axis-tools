import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { applyTransaction, recoverTransaction, journalRelativePath } = await import('../dist/project-init/transaction.js');

async function withTempDir(fn) {
  const repo = await mkdtemp(path.join(tmpdir(), 'axis-project-init-transaction-'));
  try {
    return await fn(repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function optional(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

await withTempDir(async (repo) => {
  const config = path.join(repo, '.axis', 'config.yml');
  const gitignore = path.join(repo, '.gitignore');
  await mkdir(path.join(repo, '.axis'), { recursive: true });
  await writeFile(config, 'old-config\n', 'utf8');
  await writeFile(gitignore, 'old-gitignore\n', 'utf8');
  let before = 0;
  let after = 0;
  await applyTransaction({
    repo,
    files: [
      { role: 'main_config', path: '.axis/config.yml', originalText: 'old-config\n', nextText: 'new-config\n' },
      { role: 'gitignore', path: '.gitignore', originalText: 'old-gitignore\n', nextText: 'new-gitignore\n' },
      { role: 'local_config', path: '.axis/config.local.yml', originalText: null, nextText: null },
    ],
    validateBefore: async () => { before += 1; },
    validateAfter: async () => { after += 1; },
  });
  assert.equal(before, 1);
  assert.equal(after, 1);
  assert.equal(await readFile(config, 'utf8'), 'new-config\n');
  assert.equal(await readFile(gitignore, 'utf8'), 'new-gitignore\n');
  assert.equal(await optional(path.join(repo, journalRelativePath)), null);
});

await withTempDir(async (repo) => {
  const config = path.join(repo, '.axis', 'config.yml');
  await mkdir(path.join(repo, '.axis'), { recursive: true });
  await writeFile(config, 'old-config\n', 'utf8');
  await assert.rejects(
    () => applyTransaction({
      repo,
      files: [{ role: 'main_config', path: '.axis/config.yml', originalText: 'old-config\n', nextText: 'new-config\n' }],
      validateAfter: async () => { throw new Error('post-validation failed'); },
    }),
    /post-validation failed/,
  );
  assert.equal(await readFile(config, 'utf8'), 'old-config\n');
  assert.equal(await optional(path.join(repo, journalRelativePath)), null);
});

await withTempDir(async (repo) => {
  const config = path.join(repo, '.axis', 'config.yml');
  const backup = path.join(repo, '.axis', '.project-init-tx', 'recover-test', '0.bak');
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(config, 'new-config\n', 'utf8');
  await writeFile(backup, 'old-config\n', 'utf8');
  await writeFile(path.join(repo, journalRelativePath), `${JSON.stringify({
    schema: 'axis.project_init_journal',
    schema_version: 1,
    transaction_id: 'recover-test',
    state: 'replacing',
    replaced_count: 1,
    files: [{
      role: 'main_config',
      path: '.axis/config.yml',
      original: { state: 'present', sha256: sha256('old-config\n'), backup: '.axis/.project-init-tx/recover-test/0.bak' },
      next: { state: 'present', sha256: sha256('new-config\n') },
      temp: null,
    }],
  }, null, 2)}\n`, 'utf8');
  await recoverTransaction(repo);
  assert.equal(await readFile(config, 'utf8'), 'old-config\n');
  assert.equal(await optional(path.join(repo, journalRelativePath)), null);
});

console.log('project-init transaction tests passed');
