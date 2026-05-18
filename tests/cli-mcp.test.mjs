import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cli = path.resolve('dist/cli.js');

async function run(args, options = {}) {
  return execFileAsync(process.execPath, [cli, ...args], {
    ...options,
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...(options.env ?? {}),
    },
  });
}

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'orbit-tools-mcp-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const home = path.join(dir, 'home');
  const hermesConfig = path.join(dir, 'hermes.json');
  await writeFile(hermesConfig, JSON.stringify({ model: { default: 'test' } }, null, 2));

  const install = await run([
    'mcp',
    'install',
    '--repo',
    repo,
    '--config',
    hermesConfig,
    '--backend-url',
    'http://127.0.0.1:3000',
    '--mcp-url',
    'http://127.0.0.1:3000/api/mcp',
  ], { env: { HOME: home } });
  const installJson = JSON.parse(install.stdout);
  assert.equal(installJson.ok, true);
  assert.equal(installJson.server, 'orbit');

  const config = JSON.parse(await readFile(hermesConfig, 'utf8'));
  assert.equal(config.mcp_servers.orbit.enabled, true);
  assert.equal(config.mcp_servers.orbit.transport, 'http');
  assert.equal(config.mcp_servers.orbit.url, 'http://127.0.0.1:3000/api/mcp');
  assert.equal(config.mcp_servers.orbit.headers['x-orbit-backend-url'], 'http://127.0.0.1:3000');

  await run([
    'project',
    'bind',
    '--repo',
    repo,
    '--backend-url',
    'http://127.0.0.1:3000',
    '--mcp-url',
    'http://127.0.0.1:3000/api/mcp',
    '--product-line-uuid',
    '8f938fdc-f2be-44d6-8c48-91bc9156836d',
    '--project-uuid',
    '71533d74-80e3-4e7e-adbb-69c42a25db0c',
    '--owner',
    'office-hours',
  ], { env: { HOME: home } });

  const project = JSON.parse(await readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
  assert.equal(project.backendUrl, 'http://127.0.0.1:3000');
  assert.equal(project.mcpUrl, 'http://127.0.0.1:3000/api/mcp');
  assert.equal(project.productLineUuid, '8f938fdc-f2be-44d6-8c48-91bc9156836d');
  assert.equal(project.projectUuid, '71533d74-80e3-4e7e-adbb-69c42a25db0c');
  assert.equal(project.productLineId, undefined);
  assert.equal(project.projectId, undefined);
  assert.equal(project.owner, 'office-hours');

  const show = await run(['project', 'show', '--repo', repo, '--json'], { env: { HOME: home } });
  assert.deepEqual(JSON.parse(show.stdout), project);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const home = path.join(dir, 'home');
  const orbitDir = path.join(repo, '.orbit');
  await mkdir(orbitDir, { recursive: true });
  await writeFile(path.join(repo, '.orbit', 'project.json'), JSON.stringify({
    backendUrl: 'http://127.0.0.1:3000',
    mcpUrl: 'http://127.0.0.1:3000/api/mcp',
    productLineId: 'pl_legacy',
    projectId: 'proj_legacy',
    owner: 'legacy-owner',
    repo,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, null, 2));

  await run([
    'project',
    'bind',
    '--repo',
    repo,
    '--product-line-uuid',
    '0c9c796d-5bd6-4cce-ac7e-95ac0ddf71b9',
    '--project-uuid',
    '0e2e0978-c4b4-4acf-8fd9-b9fa31e00a7b',
  ], { env: { HOME: home } });

  const project = JSON.parse(await readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
  assert.equal(project.productLineUuid, '0c9c796d-5bd6-4cce-ac7e-95ac0ddf71b9');
  assert.equal(project.projectUuid, '0e2e0978-c4b4-4acf-8fd9-b9fa31e00a7b');
  assert.equal(project.productLineId, 'pl_legacy');
  assert.equal(project.projectId, 'proj_legacy');
  assert.equal(project.owner, 'legacy-owner');
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const home = path.join(dir, 'home');
  const hermesConfig = path.join(dir, 'config.yaml');
  await writeFile(hermesConfig, 'model:\n  default: test\n');

  await run([
    'mcp',
    'install',
    '--repo',
    repo,
    '--config',
    hermesConfig,
    '--mcp-url',
    'https://orbit.example.com/api/mcp',
  ], { env: { HOME: home } });

  const content = await readFile(hermesConfig, 'utf8');
  assert.match(content, /^mcp_servers:\n/m);
  assert.match(content, /  orbit:\n/);
  assert.match(content, /    enabled: true\n/);
  assert.match(content, /    transport: http\n/);
  assert.match(content, /    url: "https:\/\/orbit\.example\.com\/api\/mcp"\n/);
  assert.match(content, /model:\n  default: test\n/);
});
