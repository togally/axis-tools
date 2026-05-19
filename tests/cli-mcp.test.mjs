import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
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

async function runInteractive(args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      ...options,
      env: {
        ...process.env,
        NO_COLOR: '1',
        ...(options.env ?? {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`Command failed with exit code ${code}: ${stderr}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
    child.stdin.end(input);
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

async function withProductServer(fn) {
  const state = { loginCount: 0 };
  const catalog = {
    products: [
      {
        product: {
          id: 'pl_1',
          uuid: '5b7a1d2e-8f31-4a4a-9c12-7f0a9d1b42c6',
          name: 'Orbit',
          summary: 'Orbit product line',
          status: 'active',
        },
        modules: [],
      },
      {
        product: {
          id: 'pl_check',
          uuid: '0dd55fdc-54d2-4dcb-97bb-b8cab2969239',
          name: 'Orbit Check Product',
          summary: 'Non-destructive create/read contract product.',
          status: 'active',
        },
        modules: [],
      },
      {
        product: {
          id: 'pl_2',
          uuid: '8f938fdc-f2be-44d6-8c48-91bc9156836d',
          name: 'Hermes',
          summary: 'Hermes product line',
          status: 'active',
        },
        modules: [
          {
            id: 'mod_1',
            uuid: '71533d74-80e3-4e7e-adbb-69c42a25db0c',
            productId: 'pl_2',
            projectId: 'proj_1',
            name: 'Hermes Console',
            summary: 'Console project',
            status: 'active',
            repoPath: '/tmp/hermes-console',
          },
        ],
      },
    ],
    runtime: { store: 'test' },
  };

  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/api/products') {
      res.end(JSON.stringify(catalog));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/login') {
      state.loginCount++;
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        const payload = JSON.parse(body);
        if (!payload.account || !payload.password) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'account and password are required' }));
          return;
        }
        res.end(JSON.stringify({
          token: 'orbit-dev-token',
          key: 'orbit-dev-key',
          session: 'orbit-dev-session',
          user: {
            id: 'orbit-dev-user',
            account: payload.account,
            name: payload.account,
          },
        }));
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/api/products/pl_2') {
      res.end(JSON.stringify({ ...catalog.products.find((entry) => entry.product.id === 'pl_2'), runtime: catalog.runtime }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`, state);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

{
  const usage = await run([]);
  assert.match(usage.stdout, /Commands:\n  init\n  init-product-line\n/);
  assert.match(usage.stdout, /Advanced init overrides:\n  init \[--repo <path>\]/);
  assert.match(usage.stdout, /  init-product-line \[--root <path>\]/);
  assert.doesNotMatch(usage.stdout, /  setup \[--repo <path>\]/);
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
  await withProductServer(async (backendUrl) => {
    const repo = path.join(dir, 'repo');
    const home = path.join(dir, 'home');

    const result = await runInteractive([
      'project',
      'bind',
      '--interactive',
      '--repo',
      repo,
      '--backend-url',
      backendUrl,
      '--owner',
      'interactive-owner',
    ], '2\n1\n', { env: { HOME: home } });

    assert.match(result.stdout, /Select product line/);
    assert.match(result.stdout, /Select project/);

    const project = JSON.parse(await readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
    assert.equal(project.backendUrl, backendUrl);
    assert.equal(project.mcpUrl, `${backendUrl}/api/mcp`);
    assert.equal(project.productLineUuid, '8f938fdc-f2be-44d6-8c48-91bc9156836d');
    assert.equal(project.projectUuid, '71533d74-80e3-4e7e-adbb-69c42a25db0c');
    assert.equal(project.productLineId, 'pl_2');
    assert.equal(project.projectId, 'proj_1');
    assert.equal(project.owner, 'interactive-owner');
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl, state) => {
    const repoOne = path.join(dir, 'repo-one');
    const repoTwo = path.join(dir, 'repo-two');
    const home = path.join(dir, 'home');

    await runInteractive([
      'init',
      '--repo',
      repoOne,
      '--backend-url',
      backendUrl,
    ], 'orbit-user\nsecret\n2\n1\n3\n', { env: { HOME: home } });

    assert.equal(state.loginCount, 1);
    const firstProject = JSON.parse(await readFile(path.join(repoOne, '.orbit', 'project.json'), 'utf8'));
    assert.equal(firstProject.account, 'orbit-user');
    assert.equal(firstProject.owner, 'orbit-user');
    assert.equal(firstProject.token, 'orbit-dev-token');

    await runInteractive([
      'init',
      '--repo',
      repoTwo,
      '--backend-url',
      backendUrl,
    ], '2\n1\n3\n', { env: { HOME: home } });

    assert.equal(state.loginCount, 1);
    const secondProject = JSON.parse(await readFile(path.join(repoTwo, '.orbit', 'project.json'), 'utf8'));
    assert.equal(secondProject.account, 'orbit-user');
    assert.equal(secondProject.owner, 'orbit-user');
    assert.equal(secondProject.token, 'orbit-dev-token');

    const config = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.equal(config.sessions[backendUrl].account, 'orbit-user');

    await run(['logout'], { env: { HOME: home } });
    const loggedOutConfig = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.deepEqual(loggedOutConfig.sessions, {});
    assert.equal(loggedOutConfig.token, undefined);
    assert.equal(loggedOutConfig.session, undefined);
  });
});

await withTempDir(async (dir) => {
  const home = path.join(dir, 'home');

  const install = await run(['install', '--agent', 'all'], { env: { HOME: home } });
  const installJson = JSON.parse(install.stdout);
  assert.equal(installJson.ok, true);
  assert.equal(installJson.installed.length, 6);

  for (const skill of ['orbit-workflow', 'orbit-office-hours']) {
    const orbitSkill = await readFile(path.join(home, '.orbit', 'skills', skill, 'SKILL.md'), 'utf8');
    const codexSkill = await readFile(path.join(home, '.codex', 'skills', skill, 'SKILL.md'), 'utf8');
    const claudeSkill = await readFile(path.join(home, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    assert.match(orbitSkill, new RegExp(`# ${skill.replace(/-/g, ' ')}`, 'i'));
    assert.equal(codexSkill, orbitSkill);
    assert.equal(claudeSkill, orbitSkill);
  }

  const modified = path.join(home, '.codex', 'skills', 'orbit-workflow', 'SKILL.md');
  await writeFile(modified, 'locally modified\n', 'utf8');
  await assert.rejects(
    run(['install', '--agent', 'codex'], { env: { HOME: home } }),
    /Refusing to overwrite modified skill/,
  );
  assert.equal(await readFile(modified, 'utf8'), 'locally modified\n');

  await run(['install', '--agent', 'codex', '--force'], { env: { HOME: home } });
  assert.notEqual(await readFile(modified, 'utf8'), 'locally modified\n');
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const repo = path.join(dir, 'repo');
    const home = path.join(dir, 'home');

    const result = await runInteractive([
      'init',
      '--repo',
      repo,
      '--backend-url',
      backendUrl,
      '--owner',
      'init-owner',
    ], 'jasper\nsecret\n2\n1\n1\n', { env: { HOME: home } });

    assert.match(result.stdout, /Orbit account/);
    assert.match(result.stdout, /Select product line/);
    assert.match(result.stdout, /Select project/);
    assert.match(result.stdout, /Select agent/);

    const project = JSON.parse(await readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
    assert.equal(project.backendUrl, backendUrl);
    assert.equal(project.mcpUrl, `${backendUrl}/api/mcp`);
    assert.equal(project.token, 'orbit-dev-token');
    assert.equal(project.key, 'orbit-dev-key');
    assert.equal(project.account, 'jasper');
    assert.equal(project.user.id, 'orbit-dev-user');
    assert.equal(project.productLineUuid, '8f938fdc-f2be-44d6-8c48-91bc9156836d');
    assert.equal(project.productLineId, 'pl_2');
    assert.equal(project.productLineName, 'Hermes');
    assert.equal(project.projectUuid, '71533d74-80e3-4e7e-adbb-69c42a25db0c');
    assert.equal(project.projectId, 'proj_1');
    assert.equal(project.projectName, 'Hermes Console');
    assert.equal(project.owner, 'init-owner');
    assert.equal(project.selectedAgent, 'codex');
    assert.equal(project.skillPath, path.join(home, '.orbit', 'skills', 'orbit-workflow', 'SKILL.md'));
    assert.equal(project.agentSkillPath, path.join(home, '.codex', 'skills', 'orbit-workflow', 'SKILL.md'));
    assert.match(await readFile(project.skillPath, 'utf8'), /Orbit/);
    assert.match(await readFile(project.agentSkillPath, 'utf8'), /Orbit/);

    const globalConfig = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.equal(globalConfig.selectedAgent, 'codex');
    assert.equal(globalConfig.skillPath, project.skillPath);
    assert.equal(globalConfig.agentSkillPath, project.agentSkillPath);
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const repo = path.join(dir, 'repo');
    const home = path.join(dir, 'home');
    await mkdir(repo, { recursive: true });

    await runInteractive([
      'init',
      '--backend-url',
      backendUrl,
    ], 'orbit-account\nsecret\n2\n1\n3\n', { cwd: repo, env: { HOME: home, USER: 'system-user' } });

    const project = JSON.parse(await readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
    assert.equal(project.repo, repo);
    assert.equal(project.owner, 'orbit-account');
    assert.equal(project.backendUrl, backendUrl);
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'product-root');
    const home = path.join(dir, 'home');
    await mkdir(path.join(root, 'console'), { recursive: true });
    await writeFile(path.join(root, 'console', 'package.json'), JSON.stringify({ name: 'console' }, null, 2));
    await mkdir(path.join(root, 'notes'), { recursive: true });
    await mkdir(path.join(root, '.hidden'), { recursive: true });
    await mkdir(path.join(root, 'node_modules'), { recursive: true });

    const result = await runInteractive([
      'init-product-line',
      '--root',
      root,
      '--backend-url',
      backendUrl,
      '--owner',
      'product-owner',
    ], 'jasper\nsecret\n2\n1\n2\n', { env: { HOME: home } });

    assert.match(result.stdout, /Select product line/);
    assert.doesNotMatch(result.stdout, /Orbit Check Product/);
    assert.doesNotMatch(result.stdout, /Non-destructive create\/read contract product/);
    assert.match(result.stdout, /console \(package.json\)/);
    assert.match(result.stdout, /notes \(plain folder\)/);
    assert.doesNotMatch(result.stdout, /\.hidden/);
    assert.doesNotMatch(result.stdout, /node_modules/);
    assert.match(result.stdout, /Summary:/);
    assert.match(result.stdout, /bound: 1/);
    assert.match(result.stdout, /skipped: 1/);

    const rootConfigPath = path.join(root, '.orbit', 'product-line.json');
    const rootConfig = JSON.parse(await readFile(rootConfigPath, 'utf8'));
    assert.equal(rootConfig.backendUrl, backendUrl);
    assert.equal(rootConfig.mcpUrl, `${backendUrl}/api/mcp`);
    assert.equal(rootConfig.token, 'orbit-dev-token');
    assert.equal(rootConfig.key, 'orbit-dev-key');
    assert.equal(rootConfig.account, 'jasper');
    assert.equal(rootConfig.user.id, 'orbit-dev-user');
    assert.equal(rootConfig.productLineUuid, '8f938fdc-f2be-44d6-8c48-91bc9156836d');
    assert.equal(rootConfig.productLineId, 'pl_2');
    assert.equal(rootConfig.productLineName, 'Hermes');
    assert.equal(rootConfig.rootPath, root);

    const consoleProject = JSON.parse(await readFile(path.join(root, 'console', '.orbit', 'project.json'), 'utf8'));
    assert.equal(consoleProject.backendUrl, backendUrl);
    assert.equal(consoleProject.token, 'orbit-dev-token');
    assert.equal(consoleProject.key, 'orbit-dev-key');
    assert.equal(consoleProject.account, 'jasper');
    assert.equal(consoleProject.productLineUuid, '8f938fdc-f2be-44d6-8c48-91bc9156836d');
    assert.equal(consoleProject.projectUuid, '71533d74-80e3-4e7e-adbb-69c42a25db0c');
    assert.equal(consoleProject.projectName, 'Hermes Console');
    assert.equal(consoleProject.repo, path.join(root, 'console'));
    assert.equal(consoleProject.owner, 'product-owner');
    assert.equal(consoleProject.selectedAgent, undefined);
    assert.equal(consoleProject.skillPath, undefined);
    await assert.rejects(readFile(path.join(root, 'notes', '.orbit', 'project.json'), 'utf8'));
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'product-root');
    const home = path.join(dir, 'home');
    await mkdir(path.join(root, 'console'), { recursive: true });
    await writeFile(path.join(root, 'console', 'package.json'), JSON.stringify({ name: 'console' }, null, 2));

    await runInteractive([
      'init-product-line',
      '--backend-url',
      backendUrl,
    ], 'orbit-account\nsecret\n2\n1\n', { cwd: root, env: { HOME: home, USER: 'system-user' } });

    const rootConfig = JSON.parse(await readFile(path.join(root, '.orbit', 'product-line.json'), 'utf8'));
    assert.equal(rootConfig.rootPath, root);

    const consoleProject = JSON.parse(await readFile(path.join(root, 'console', '.orbit', 'project.json'), 'utf8'));
    assert.equal(consoleProject.repo, path.join(root, 'console'));
    assert.equal(consoleProject.owner, 'orbit-account');
    assert.equal(consoleProject.backendUrl, backendUrl);
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'product-root');
    const home = path.join(dir, 'home');
    await mkdir(root, { recursive: true });

    await runInteractive([
      'init-product-line',
      '--repo',
      root,
      '--backend-url',
      backendUrl,
    ], 'jasper\nsecret\n2\n', { env: { HOME: home } });

    const rootConfig = JSON.parse(await readFile(path.join(root, '.orbit', 'product-line.json'), 'utf8'));
    assert.equal(rootConfig.rootPath, root);
  });
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
