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

async function createBareGitFixture(dir) {
  const source = path.join(dir, 'source-repo');
  const bare = path.join(dir, 'source-repo.git');
  await mkdir(source, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: source });
  await execFileAsync('git', ['config', 'user.email', 'orbit-tools@example.com'], { cwd: source });
  await execFileAsync('git', ['config', 'user.name', 'Orbit Tools Test'], { cwd: source });
  await writeFile(path.join(source, 'README.md'), '# Fixture\n', 'utf8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: source });
  await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: source });
  await execFileAsync('git', ['clone', '--bare', source, bare]);
  return bare;
}

async function withProductServer(fn, options = {}) {
  const state = { loginCount: 0, requests: [], accountByToken: {} };
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
            repoPath: options.repoPath ?? '/tmp/hermes-console',
          },
          {
            id: 'mod_2',
            uuid: 'bd53b010-e6b3-4ac6-9df6-f7558d5c1189',
            productId: 'pl_2',
            projectId: 'proj_2',
            name: 'Hermes Docs',
            summary: 'Docs project',
            status: 'active',
          },
        ],
      },
    ],
    runtime: { store: 'test' },
  };

  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    state.requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization ?? null });
    const requireAuth = () => {
      if (req.headers.authorization !== 'Bearer orbit-dev-token') {
        res.statusCode = options.authStatus ?? 401;
        res.end(JSON.stringify({ error: 'auth required' }));
        return false;
      }
      return true;
    };
    if (req.method === 'GET' && req.url === '/api/products') {
      if (!requireAuth()) return;
      res.end(JSON.stringify(catalog));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/me') {
      if (!requireAuth()) return;
      const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const account = state.accountByToken[token] ?? 'orbit-user';
      res.end(JSON.stringify({
        user: {
          id: 'orbit-dev-user',
          account,
          displayName: 'Orbit User',
          name: 'Orbit User',
          role: 'admin',
          permissions: ['products:read', 'projects:bind'],
        },
      }));
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
        state.accountByToken['orbit-dev-token'] = payload.account;
        res.end(JSON.stringify({
          token: 'orbit-dev-token',
          key: 'orbit-dev-key',
          session: 'orbit-dev-session',
          user: {
            id: 'orbit-dev-user',
            account: payload.account,
            displayName: 'Orbit User',
            name: 'Orbit User',
            role: 'admin',
            permissions: ['products:read', 'projects:bind'],
          },
        }));
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/api/products/pl_2') {
      if (!requireAuth()) return;
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
  const longHelp = await run(['--help']);
  const shortHelp = await run(['-h']);
  assert.match(usage.stdout, /Commands:\n  login\n  me\n  init\n  bind\n  pull\n/);
  assert.equal(longHelp.stdout, usage.stdout);
  assert.equal(shortHelp.stdout, usage.stdout);
  assert.match(usage.stdout, /init = packaged skill setup only/);
  assert.match(usage.stdout, /login = create a local Orbit Hub session/);
  assert.match(usage.stdout, /me = show current Orbit Hub user/);
  assert.match(usage.stdout, /bind = bind a repo or product-line root/);
  assert.match(usage.stdout, /pull = create local folders from Orbit Hub/);
  assert.doesNotMatch(usage.stdout, /\bregister\b/);
  assert.doesNotMatch(usage.stdout, /  setup \[--repo <path>\]/);
  await assert.rejects(run(['definitely-unknown-command']), (error) => error.code === 1);
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
    const home = path.join(dir, 'home');
    const repo = path.join(dir, 'repo');
    await assert.rejects(
      run(['bind', '--repo', repo, '--backend-url', backendUrl], { env: { HOME: home } }),
      /请先登录 \/ Please login/,
    );
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const home = path.join(dir, 'home');
    await mkdir(path.join(home, '.orbit'), { recursive: true });
    await writeFile(path.join(home, '.orbit', 'config.json'), JSON.stringify({
      sessions: {
        [backendUrl]: {
          backendUrl,
          account: 'denied-user',
          token: 'bad-token',
          key: 'bad-key',
          user: { account: 'denied-user' },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }, null, 2));
    await assert.rejects(
      run(['me', '--backend-url', backendUrl], { env: { HOME: home } }),
      /请先登录 \/ Please login/,
    );
  }, { authStatus: 401 });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const home = path.join(dir, 'home');
    await mkdir(path.join(home, '.orbit'), { recursive: true });
    await writeFile(path.join(home, '.orbit', 'config.json'), JSON.stringify({
      sessions: {
        [backendUrl]: {
          backendUrl,
          account: 'denied-user',
          token: 'bad-token',
          key: 'bad-key',
          user: { account: 'denied-user' },
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }, null, 2));
    await assert.rejects(
      run(['me', '--backend-url', backendUrl], { env: { HOME: home } }),
      /权限不足 \/ Insufficient permission/,
    );
  }, { authStatus: 403 });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const repo = path.join(dir, 'repo');
    const home = path.join(dir, 'home');

    await runInteractive(['login', '--backend-url', backendUrl], 'orbit-user\nsecret\n', { env: { HOME: home } });

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
    assert.equal(project.mcpUrl, undefined);
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
      'login',
      '--backend-url',
      backendUrl,
    ], 'orbit-user\nsecret\n', { env: { HOME: home } });

    assert.equal(state.loginCount, 1);
    const config = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.equal(config.sessions[backendUrl].account, 'orbit-user');
    assert.equal(config.sessions[backendUrl].mcpUrl, undefined);
    assert.equal(config.sessions[backendUrl].token, 'orbit-dev-token');
    assert.equal(config.sessions[backendUrl].password, undefined);

    await runInteractive([
      'init',
      '--repo',
      repoOne,
      '--backend-url',
      backendUrl,
    ], '3\n', { env: { HOME: home } });
    assert.equal(state.loginCount, 1);
    await assert.rejects(readFile(path.join(repoOne, '.orbit', 'project.json'), 'utf8'));
    assert.match(await readFile(path.join(home, '.orbit', 'skills', 'orbit-workflow', 'SKILL.md'), 'utf8'), /Orbit/);

    await runInteractive([
      'init',
      '--repo',
      repoTwo,
      '--backend-url',
      backendUrl,
    ], '3\n', { env: { HOME: home } });

    assert.equal(state.loginCount, 1);
    await assert.rejects(readFile(path.join(repoTwo, '.orbit', 'project.json'), 'utf8'));

    await run(['logout'], { env: { HOME: home } });
    const loggedOutConfig = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.deepEqual(loggedOutConfig.sessions, {});
    assert.equal(loggedOutConfig.token, undefined);
    assert.equal(loggedOutConfig.session, undefined);
  });
});

await withTempDir(async (dir) => {
  const home = path.join(dir, 'home');
  const hermesDependency = path.join(home, '.hermes', 'skills', 'gstack-office-hours', 'SKILL.md');
  const hermesDependencyText = '# Gstack Office Hours\n\nRun `gstack office-hours` for idea discussions.\n';
  await mkdir(path.dirname(hermesDependency), { recursive: true });
  await writeFile(hermesDependency, hermesDependencyText, 'utf8');

  const install = await run(['install', '--agent', 'all'], { env: { HOME: home } });
  const installJson = JSON.parse(install.stdout);
  assert.equal(installJson.ok, true);
  assert.equal(installJson.installed.length, 8);

  for (const skill of ['orbit-workflow', 'oribit-idea']) {
    const orbitSkill = await readFile(path.join(home, '.orbit', 'skills', skill, 'SKILL.md'), 'utf8');
    const codexSkill = await readFile(path.join(home, '.codex', 'skills', skill, 'SKILL.md'), 'utf8');
    const claudeSkill = await readFile(path.join(home, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    assert.match(orbitSkill, new RegExp(`# ${skill.replace(/-/g, ' ')}`, 'i'));
    assert.equal(codexSkill, orbitSkill);
    assert.equal(claudeSkill, orbitSkill);
  }

  const codexDependency = await readFile(path.join(home, '.codex', 'skills', 'gstack-office-hours', 'SKILL.md'), 'utf8');
  const claudeDependency = await readFile(path.join(home, '.claude', 'skills', 'gstack-office-hours', 'SKILL.md'), 'utf8');
  assert.equal(codexDependency, hermesDependencyText);
  assert.equal(claudeDependency, codexDependency);

  const modified = path.join(home, '.codex', 'skills', 'orbit-workflow', 'SKILL.md');
  await writeFile(modified, 'locally modified\n', 'utf8');
  await assert.rejects(
    run(['install', '--agent', 'codex'], { env: { HOME: home } }),
    /Refusing to overwrite modified skill/,
  );
  assert.equal(await readFile(modified, 'utf8'), 'locally modified\n');

  await run(['install', '--agent', 'codex', '--force'], { env: { HOME: home } });
  assert.notEqual(await readFile(modified, 'utf8'), 'locally modified\n');

  const modifiedDependency = path.join(home, '.codex', 'skills', 'gstack-office-hours', 'SKILL.md');
  await writeFile(modifiedDependency, 'locally modified dependency\n', 'utf8');
  await assert.rejects(
    run(['install', '--agent', 'codex'], { env: { HOME: home } }),
    /Refusing to overwrite modified skill/,
  );
  assert.equal(await readFile(modifiedDependency, 'utf8'), 'locally modified dependency\n');

  await run(['install', '--agent', 'codex', '--force'], { env: { HOME: home } });
  assert.notEqual(await readFile(modifiedDependency, 'utf8'), 'locally modified dependency\n');
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
    ], '1\n', { env: { HOME: home } });

    assert.doesNotMatch(result.stdout, /Orbit account/);
    assert.doesNotMatch(result.stdout, /Select product line/);
    assert.doesNotMatch(result.stdout, /Select project/);
    assert.match(result.stdout, /Select agent/);

    await assert.rejects(readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
    const skillPath = path.join(home, '.orbit', 'skills', 'orbit-workflow', 'SKILL.md');
    const agentSkillPath = path.join(home, '.codex', 'skills', 'orbit-workflow', 'SKILL.md');
    assert.match(await readFile(skillPath, 'utf8'), /Orbit/);
    assert.match(await readFile(agentSkillPath, 'utf8'), /Orbit/);

    const globalConfig = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.equal(globalConfig.selectedAgent, 'codex');
    assert.equal(globalConfig.skillPath, skillPath);
    assert.equal(globalConfig.agentSkillPath, agentSkillPath);
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
    ], '3\n', { cwd: repo, env: { HOME: home, USER: 'system-user' } });

    await assert.rejects(readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
    const globalConfig = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.equal(globalConfig.backendUrl, backendUrl);
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
    await runInteractive(['login', '--backend-url', backendUrl], 'jasper\nsecret\n', { env: { HOME: home } });

    const result = await runInteractive([
      'bind',
      '--root',
      root,
      '--backend-url',
      backendUrl,
      '--owner',
      'product-owner',
    ], '2\n2\n1\n3\n', { env: { HOME: home } });

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
    assert.equal(rootConfig.mcpUrl, undefined);
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
    assert.equal(consoleProject.mcpUrl, undefined);
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
    await runInteractive(['login', '--backend-url', backendUrl], 'orbit-account\nsecret\n', { env: { HOME: home } });

    await runInteractive([
      'bind',
      '--backend-url',
      backendUrl,
    ], '2\n2\n1\n', { cwd: root, env: { HOME: home, USER: 'system-user' } });

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
    await runInteractive(['login', '--backend-url', backendUrl], 'jasper\nsecret\n', { env: { HOME: home } });

    await runInteractive([
      'init-product-line',
      '--repo',
      root,
      '--backend-url',
      backendUrl,
    ], '2\n', { env: { HOME: home } });

    const rootConfig = JSON.parse(await readFile(path.join(root, '.orbit', 'product-line.json'), 'utf8'));
    assert.equal(rootConfig.rootPath, root);
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const repo = path.join(dir, 'repo');
    const home = path.join(dir, 'home');
    await runInteractive(['login', '--backend-url', backendUrl], 'orbit-account\nsecret\n', { env: { HOME: home } });

    const result = await runInteractive([
      'bind',
      '--repo',
      repo,
      '--backend-url',
      backendUrl,
      '--owner',
      'bind-owner',
    ], '1\n2\n1\n', { env: { HOME: home } });

    assert.match(result.stdout, /Bind target:/);
    assert.match(result.stdout, /Select product line/);
    assert.match(result.stdout, /Select project/);

    const project = JSON.parse(await readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
    assert.equal(project.backendUrl, backendUrl);
    assert.equal(project.mcpUrl, undefined);
    assert.equal(project.productLineUuid, '8f938fdc-f2be-44d6-8c48-91bc9156836d');
    assert.equal(project.projectUuid, '71533d74-80e3-4e7e-adbb-69c42a25db0c');
    assert.equal(project.owner, 'bind-owner');
  });
});

await withTempDir(async (dir) => {
  const bareRepo = await createBareGitFixture(dir);
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'pull-root');
    const home = path.join(dir, 'home');
    await runInteractive(['login', '--backend-url', backendUrl], 'orbit-account\nsecret\n', { env: { HOME: home } });

    const result = await runInteractive([
      'pull',
      '--root',
      root,
      '--backend-url',
      backendUrl,
    ], '1\n2\n', { env: { HOME: home } });

    assert.match(result.stdout, /Pull product lines:/);
    assert.match(result.stdout, /cloned:/);
    const productConfig = JSON.parse(await readFile(path.join(root, 'hermes', '.orbit', 'product-line.json'), 'utf8'));
    assert.equal(productConfig.backendUrl, backendUrl);
    assert.equal(productConfig.mcpUrl, undefined);
    assert.equal(productConfig.productLineId, 'pl_2');
    assert.equal(productConfig.owner, 'orbit-account');

    const consoleProject = JSON.parse(await readFile(path.join(root, 'hermes', 'hermes-console', '.orbit', 'project.json'), 'utf8'));
    assert.equal(consoleProject.backendUrl, backendUrl);
    assert.equal(consoleProject.mcpUrl, undefined);
    assert.equal(consoleProject.productLineName, 'Hermes');
    assert.equal(consoleProject.projectName, 'Hermes Console');
    assert.equal(consoleProject.owner, 'orbit-account');
    assert.equal(consoleProject.repoPath, bareRepo);
    assert.match(await readFile(path.join(root, 'hermes', 'hermes-console', 'README.md'), 'utf8'), /Fixture/);

    const docsProject = JSON.parse(await readFile(path.join(root, 'hermes', 'hermes-docs', '.orbit', 'project.json'), 'utf8'));
    assert.equal(docsProject.projectName, 'Hermes Docs');
    assert.equal(docsProject.repoPath, undefined);
  }, { repoPath: bareRepo });
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
