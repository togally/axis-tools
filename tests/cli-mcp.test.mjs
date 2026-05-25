import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { readHiddenLine } from '../dist/cli.js';

const execFileAsync = promisify(execFile);
const cli = path.resolve('dist/cli.js');
const TEST_PASSWORD = 'test-password-for-hidden-prompt';

class FakeTtyInput extends EventEmitter {
  constructor() {
    super();
    this.isRaw = false;
    this.resumed = false;
    this.paused = false;
    this.rawModes = [];
  }

  resume() {
    this.resumed = true;
  }

  pause() {
    this.paused = true;
  }

  setRawMode(value) {
    this.rawModes.push(value);
    this.isRaw = value;
  }
}

class FakeOutput {
  constructor() {
    this.text = '';
  }

  write(chunk) {
    this.text += String(chunk);
    return true;
  }
}

{
  const input = new FakeTtyInput();
  const output = new FakeOutput();
  const answer = readHiddenLine('Orbit password: ', input, output);
  input.emit('data', Buffer.from(`${TEST_PASSWORD}\n`));

  assert.equal(await answer, TEST_PASSWORD);
  assert.equal(input.resumed, true);
  assert.equal(input.paused, true);
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.listenerCount('data'), 0);
  assert.equal(output.text, 'Orbit password: \n');
}

{
  const input = new FakeTtyInput();
  const output = new FakeOutput();
  const answer = readHiddenLine('Orbit password: ', input, output);
  input.emit('data', Buffer.from('\u0003'));

  await assert.rejects(answer, /Interrupted/);
  assert.equal(input.paused, true);
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.listenerCount('data'), 0);
  assert.equal(output.text, 'Orbit password: \n');
}

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
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runViaLinkedBin(args) {
  return withTempDir(async (dir) => {
    const binPath = path.join(dir, 'orbit');
    await symlink(cli, binPath);
    return execFileAsync(binPath, args, {
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    });
  });
}

async function runViaLinkedAlias(args) {
  return withTempDir(async (dir) => {
    const binPath = path.join(dir, 'orbit-tools');
    await symlink(cli, binPath);
    return execFileAsync(binPath, args, {
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    });
  });
}

async function runViaLinkedAxisPool(alias, args) {
  return withTempDir(async (dir) => {
    const binPath = path.join(dir, alias);
    await symlink(cli, binPath);
    return execFileAsync(binPath, args, {
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    });
  });
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

async function assertGlobalConfigHasNoLocalBindingKeys(home) {
  const config = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
  const forbiddenKeys = [
    'productLineUuid',
    'projectUuid',
    'productLineId',
    'projectId',
    'productLineName',
    'projectName',
    'owner',
    'repo',
    'repoPath',
    'repositoryUrl',
    'gitUrl',
    'remoteUrl',
    'lastRepo',
    'lastProductLineRoot',
  ];
  for (const key of forbiddenKeys) {
    assert.equal(config[key], undefined, `global config should not contain ${key}`);
  }
  return config;
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
            repositoryUrl: options.repositoryUrl,
            githubRepo: options.githubRepo,
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
      if (options.emptyProducts) {
        res.end(JSON.stringify({ products: [], runtime: catalog.runtime }));
        return;
      }
      res.end(JSON.stringify(catalog));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/me') {
      if (!requireAuth()) return;
      const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const account = state.accountByToken[token] ?? 'orbit-user';
      const user = {
        id: 'orbit-dev-user',
        account,
        displayName: 'Orbit User',
        name: 'Orbit User',
        role: options.meRole ?? 'admin',
      };
      if (!options.meTopLevelPermissions) {
        user.permissions = ['products:read', 'projects:bind'];
      }
      res.end(JSON.stringify({
        ...(options.meTopLevelPermissions ? { permissions: options.meTopLevelPermissions } : {}),
        user,
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
        const user = {
          id: 'orbit-dev-user',
          account: payload.account,
          displayName: 'Orbit User',
          name: 'Orbit User',
          role: 'admin',
        };
        if (!options.loginTopLevelPermissions) {
          user.permissions = ['products:read', 'projects:bind'];
        }
        res.end(JSON.stringify({
          ...(options.loginTopLevelPermissions ? { permissions: options.loginTopLevelPermissions } : {}),
          token: 'orbit-dev-token',
          key: 'orbit-dev-key',
          session: 'orbit-dev-session',
          user,
        }));
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/api/products/pl_2') {
      if (!requireAuth()) return;
      if (options.detailAuthStatus) {
        res.statusCode = options.detailAuthStatus;
        res.end(JSON.stringify({ error: 'detail auth required' }));
        return;
      }
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

async function writeProjectBinding(repo, backendUrl, extra = {}) {
  await mkdir(path.join(repo, '.orbit'), { recursive: true });
  await writeFile(path.join(repo, '.orbit', 'project.json'), JSON.stringify({
    backendUrl,
    token: 'orbit-dev-token',
    key: 'orbit-dev-key',
    session: 'orbit-dev-session',
    productLineId: 'pl_2',
    productLineUuid: '8f938fdc-f2be-44d6-8c48-91bc9156836d',
    productLineName: 'Hermes',
    projectId: 'proj_1',
    projectUuid: '71533d74-80e3-4e7e-adbb-69c42a25db0c',
    projectName: 'Hermes Console',
    owner: 'orbit-user',
    repo,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }, null, 2));
}

async function withPoolServer(fn, options = {}) {
  const state = { requests: [], documents: [], poolDocuments: 0, requirements: 0 };
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    state.requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization ?? null });
    const requireAuth = () => {
      if (req.headers.authorization !== 'Bearer orbit-dev-token') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'auth required' }));
        return false;
      }
      return true;
    };
    const readJson = () => new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    });

    if (req.method === 'GET' && req.url.startsWith('/api/projects/proj_1/pool-templates')) {
      if (!requireAuth()) return;
      const url = new URL(req.url, 'http://127.0.0.1');
      const kind = url.searchParams.get('kind') ?? 'requirement';
      res.end(JSON.stringify({
        schemaVersion: 'orbit.pool.template.v1',
        kind,
        displayName: kind === 'bug' ? 'Bug池' : '需求池',
        templateVersion: 'test-template',
        markdownTemplate: `# {{title}}\n\n## 云端模板 ${kind}\n`,
        artifactSchema: 'orbit.pool.artifact.v1',
        requiredSections: ['云端模板'],
        instructions: ['用 seed 生成标准文档 artifact'],
        project: { id: 'proj_1', name: 'Hermes Console', summary: 'Console project' },
        runtime: { store: 'mock' },
      }));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/api/projects/proj_1/documents')) {
      if (!requireAuth()) return;
      res.end(JSON.stringify({
        documents: [
          { id: 'doc-old', title: 'Existing requirement', source: { type: 'requirement' }, status: 'draft' },
        ],
        runtime: { store: 'mock' },
      }));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/api/projects/proj_1/work-items')) {
      if (!requireAuth()) return;
      res.end(JSON.stringify({
        items: [
          { id: 'wi-old', title: 'Existing item', type: 'requirement', status: 'ready' },
        ],
        runtime: { store: 'mock' },
      }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/projects/proj_1/pool-documents') {
      if (!requireAuth()) return;
      if (options.poolDocuments404) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      readJson().then((payload) => {
        state.poolDocuments++;
        state.lastPoolDocument = payload;
        const document = { id: 'doc-pool-1', title: payload.title, source: { type: payload.kind }, status: payload.status };
        state.documents.push(document);
        res.statusCode = 201;
        res.end(JSON.stringify({
          document,
          items: [{ id: 'wi-pool-1', title: payload.workItems?.[0]?.title ?? 'Generated item', sourceArtifactId: document.id }],
          project: { id: 'proj_1', name: 'Hermes Console' },
          runtime: { store: 'mock' },
        }));
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/projects/proj_1/requirements') {
      if (!requireAuth()) return;
      readJson().then((payload) => {
        state.requirements++;
        state.lastRequirement = payload;
        res.statusCode = 201;
        res.end(JSON.stringify({
          document: { id: 'doc-req-1', title: payload.title, source: { type: 'requirement' }, status: payload.status ?? 'draft' },
          items: [],
          project: { id: 'proj_1', name: 'Hermes Console' },
          runtime: { store: 'mock' },
        }));
      });
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
  const linkedHelp = await runViaLinkedBin(['--help']);
  const aliasHelp = await runViaLinkedAlias(['--help']);
  assert.match(usage.stdout, /^axis\n/);
  assert.match(usage.stdout, /Aliases: axis-tools, orbit, orbit-tools/);
  assert.match(usage.stdout, /Commands:\n  login\n  me\n  init\n  bind\n  pull\n/);
  assert.equal(longHelp.stdout, usage.stdout);
  assert.equal(shortHelp.stdout, usage.stdout);
  assert.equal(linkedHelp.stdout, usage.stdout);
  assert.equal(aliasHelp.stdout, usage.stdout);
  assert.match(usage.stdout, /init = packaged skill setup only/);
  assert.match(usage.stdout, /login = prompt for AxisNode account and hidden password; cache session/);
  assert.match(usage.stdout, /me = show current AxisNode user/);
  assert.match(usage.stdout, /bind = bind a repo or product-line root/);
  assert.match(usage.stdout, /pull = clone\/pull maintained repos from AxisNode/);
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
  await assertGlobalConfigHasNoLocalBindingKeys(home);

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
    const home = path.join(dir, 'home');

    await runInteractive(['login', '--backend-url', backendUrl], `jzw\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    const loggedInConfig = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.deepEqual(loggedInConfig.sessions[backendUrl].user.permissions, ['login:top-level']);

    const result = await run(['me', '--backend-url', backendUrl], { env: { HOME: home } });
    assert.match(result.stdout, /account: jzw/);
    assert.match(result.stdout, /displayName: Orbit User/);
    assert.match(result.stdout, /role: member/);
    assert.match(result.stdout, /permissions: products:read, projects:bind/);

    const refreshedConfig = JSON.parse(await readFile(path.join(home, '.orbit', 'config.json'), 'utf8'));
    assert.deepEqual(refreshedConfig.sessions[backendUrl].user.permissions, ['products:read', 'projects:bind']);
  }, {
    loginTopLevelPermissions: ['login:top-level'],
    meRole: 'member',
    meTopLevelPermissions: ['products:read', 'projects:bind'],
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const repo = path.join(dir, 'repo');
    const home = path.join(dir, 'home');

    await runInteractive(['login', '--backend-url', backendUrl], `orbit-user\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

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
    await assertGlobalConfigHasNoLocalBindingKeys(home);
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl, state) => {
    const repoOne = path.join(dir, 'repo-one');
    const repoTwo = path.join(dir, 'repo-two');
    const home = path.join(dir, 'home');

    const loginResult = await runInteractive([
      'login',
      '--backend-url',
      backendUrl,
    ], `orbit-user\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    assert.equal(state.loginCount, 1);
    assert.doesNotMatch(loginResult.stdout, new RegExp(TEST_PASSWORD));
    assert.match(loginResult.stdout, /AxisNode password: \n/);
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
    assert.match(await readFile(path.join(home, '.orbit', 'skills', 'orbit-workflow', 'SKILL.md'), 'utf8'), /AxisNode/);

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
  assert.equal(installJson.installed.length, 17);

  const expectedSkillHeadings = new Map([
    ['orbit-bug', /# AxisNode Bug/i],
    ['orbit-requirement', /# AxisNode Requirement/i],
    ['orbit-suggestion', /# AxisNode Suggestion/i],
    ['orbit-workflow', /# AxisNode Workflow/i],
    ['oribit-idea', /# Oribit Idea/i],
  ]);
  for (const [skill, heading] of expectedSkillHeadings) {
    const orbitSkill = await readFile(path.join(home, '.orbit', 'skills', skill, 'SKILL.md'), 'utf8');
    const codexSkill = await readFile(path.join(home, '.codex', 'skills', skill, 'SKILL.md'), 'utf8');
    const claudeSkill = await readFile(path.join(home, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    assert.match(orbitSkill, heading);
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

    assert.doesNotMatch(result.stdout, /AxisNode account/);
    assert.doesNotMatch(result.stdout, /Select product line/);
    assert.doesNotMatch(result.stdout, /Select project/);
    assert.match(result.stdout, /Select agent/);

    await assert.rejects(readFile(path.join(repo, '.orbit', 'project.json'), 'utf8'));
    const skillPath = path.join(home, '.orbit', 'skills', 'orbit-workflow', 'SKILL.md');
    const agentSkillPath = path.join(home, '.codex', 'skills', 'orbit-workflow', 'SKILL.md');
    assert.match(await readFile(skillPath, 'utf8'), /AxisNode/);
    assert.match(await readFile(agentSkillPath, 'utf8'), /AxisNode/);
    assert.match(await readFile(path.join(home, '.orbit', 'skills', 'orbit-requirement', 'SKILL.md'), 'utf8'), /AxisNode Requirement/);
    assert.match(await readFile(path.join(home, '.codex', 'skills', 'orbit-requirement', 'SKILL.md'), 'utf8'), /AxisNode Requirement/);

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
    await runInteractive(['login', '--backend-url', backendUrl], `jasper\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

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
    await assertGlobalConfigHasNoLocalBindingKeys(home);
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'product-root');
    const home = path.join(dir, 'home');
    await mkdir(path.join(root, 'console'), { recursive: true });
    await writeFile(path.join(root, 'console', 'package.json'), JSON.stringify({ name: 'console' }, null, 2));
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

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
    await runInteractive(['login', '--backend-url', backendUrl], `jasper\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

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
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

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
    await assertGlobalConfigHasNoLocalBindingKeys(home);
  });
});

await withTempDir(async (dir) => {
  const bareRepo = await createBareGitFixture(dir);
  await withProductServer(async (backendUrl, state) => {
    const root = path.join(dir, 'pull-root');
    const home = path.join(dir, 'home');
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

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
    assert.equal(consoleProject.repoPath, '/tmp/hermes-console');
    assert.equal(consoleProject.repositoryUrl, bareRepo);
    assert.match(await readFile(path.join(root, 'hermes', 'hermes-console', 'README.md'), 'utf8'), /Fixture/);

    assert.match(result.stdout, /skipped-no-repo: 1/);
    await assert.rejects(readFile(path.join(root, 'hermes', 'hermes-docs', '.orbit', 'project.json'), 'utf8'));
    await assert.rejects(readFile(path.join(root, 'hermes', 'hermes-docs', 'README.md'), 'utf8'));
    const productRequest = state.requests.find((request) => request.method === 'GET' && request.url === '/api/products');
    const detailRequest = state.requests.find((request) => request.method === 'GET' && request.url === '/api/products/pl_2');
    assert.equal(productRequest.authorization, 'Bearer orbit-dev-token');
    assert.equal(detailRequest.authorization, 'Bearer orbit-dev-token');
    await assertGlobalConfigHasNoLocalBindingKeys(home);
  }, { repositoryUrl: bareRepo });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'pull-root');
    const home = path.join(dir, 'home');

    await assert.rejects(
      runInteractive([
        'pull',
        '--root',
        root,
        '--backend-url',
        backendUrl,
      ], '1\n', { env: { HOME: home } }),
      /run axis login --backend-url/,
    );

    await assert.rejects(readFile(path.join(root, 'hermes', '.orbit', 'product-line.json'), 'utf8'));
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'pull-root');
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
      runInteractive([
        'pull',
        '--root',
        root,
        '--backend-url',
        backendUrl,
      ], '1\n', { env: { HOME: home } }),
      (error) => /run axis login --backend-url/.test(error.stderr)
        && /verify account has product\/project access/.test(error.stderr)
        && !/Create a product line first/.test(error.stderr),
    );

    await assert.rejects(readFile(path.join(root, 'hermes', '.orbit', 'product-line.json'), 'utf8'));
  }, { authStatus: 401 });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'pull-root');
    const home = path.join(dir, 'home');
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    await assert.rejects(
      runInteractive([
        'pull',
        '--root',
        root,
        '--backend-url',
        backendUrl,
      ], '1\n', { env: { HOME: home } }),
      (error) => /No accessible product lines/.test(error.stderr)
        && /orbit-account/.test(error.stderr)
        && /Create a product line first/.test(error.stderr) === false,
    );

    await assert.rejects(readFile(path.join(root, 'hermes', '.orbit', 'product-line.json'), 'utf8'));
  }, { emptyProducts: true });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'pull-root');
    const home = path.join(dir, 'home');
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    await assert.rejects(
      runInteractive([
        'pull',
        '--root',
        root,
        '--backend-url',
        backendUrl,
      ], '1\n', { env: { HOME: home } }),
      /权限不足 \/ Insufficient permission/,
    );

    await assert.rejects(readFile(path.join(root, 'hermes', '.orbit', 'product-line.json'), 'utf8'));
    await assert.rejects(readFile(path.join(root, 'hermes', 'hermes-console', '.orbit', 'project.json'), 'utf8'));
  }, { detailAuthStatus: 403 });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'pull-root');
    const home = path.join(dir, 'home');
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    const result = await runInteractive([
      'pull',
      '--root',
      root,
      '--backend-url',
      backendUrl,
    ], '3\n', { env: { HOME: home } });

    assert.match(result.stdout, /skipped-no-repo: 2/);
    assert.doesNotMatch(result.stderr, /git clone \/home\/jasperWei\/orbit\/orbit-flow/);

    const consoleProjectPath = path.join(root, 'hermes', 'hermes-console');
    await assert.rejects(readFile(path.join(consoleProjectPath, '.orbit', 'project.json'), 'utf8'));
    await assert.rejects(readFile(path.join(root, 'hermes', '.orbit', 'product-line.json'), 'utf8'));
  }, { repoPath: '/home/jasperWei/orbit/orbit-flow' });
});

await withTempDir(async (dir) => {
  const bareRepo = await createBareGitFixture(dir);
  await withProductServer(async (backendUrl) => {
    const root = path.join(dir, 'pull-root');
    const home = path.join(dir, 'home');
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    const result = await runInteractive([
      'pull',
      '--root',
      root,
      '--backend-url',
      backendUrl,
    ], '3\n', { env: { HOME: home } });

    assert.match(result.stdout, /cloned: 1/);
    const consoleProjectPath = path.join(root, 'hermes', 'hermes-console');
    const consoleProject = JSON.parse(await readFile(path.join(consoleProjectPath, '.orbit', 'project.json'), 'utf8'));
    assert.equal(consoleProject.repoPath, '/home/jasperWei/orbit/orbit-flow');
    assert.equal(consoleProject.repositoryUrl, bareRepo);
    assert.match(await readFile(path.join(consoleProjectPath, 'README.md'), 'utf8'), /Fixture/);
  }, { repoPath: '/home/jasperWei/orbit/orbit-flow', repositoryUrl: bareRepo });
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  await mkdir(path.join(repo, '.orbit'), { recursive: true });
  await writeFile(path.join(repo, '.orbit', 'project.json'), JSON.stringify({
    backendUrl: 'https://orbit.example.com',
    mcpUrl: 'https://orbit.example.com/api/mcp',
    token: 'secret-token',
    key: 'secret-key',
    session: 'secret-session',
    password: 'secret-password',
    productLineUuid: 'pl-uuid',
    projectUuid: 'proj-uuid',
    productLineId: 'pl-id',
    projectId: 'proj-id',
    productLineName: 'Orbit',
    projectName: 'Orbit Tools',
    selectedAgent: 'codex',
    repo,
  }, null, 2));

  const result = await run(['orbit-req', 'prepare', '--repo', repo, '--json']);
  const prepare = JSON.parse(result.stdout);
  assert.equal(prepare.schemaVersion, 'orbit.pool.prepare.v1');
  assert.equal(prepare.pool, 'req');
  assert.equal(prepare.kind, 'requirement');
  assert.equal(prepare.displayName, '需求池');
  assert.equal(prepare.bound, true);
  assert.equal(prepare.skill, 'orbit-requirement');
  assert.equal(prepare.binding.backendUrl, 'https://orbit.example.com');
  assert.equal(prepare.binding.productLineUuid, 'pl-uuid');
  assert.equal(prepare.binding.projectUuid, 'proj-uuid');
  assert.equal(prepare.binding.selectedAgent, 'codex');
  assert.equal(prepare.binding.token, undefined);
  assert.equal(prepare.binding.key, undefined);
  assert.equal(prepare.binding.session, undefined);
  assert.equal(prepare.template.kind, 'requirement');
  assert.equal(prepare.template.source, 'local-fallback');
  assert.equal(prepare.projectContext.bound, true);
  assert.equal(prepare.projectContext.token, undefined);
  assert.doesNotMatch(result.stdout, /secret-/);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  await mkdir(path.join(repo, '.axis'), { recursive: true });
  await mkdir(path.join(repo, '.orbit'), { recursive: true });
  await writeFile(path.join(repo, '.axis', 'project.json'), JSON.stringify({
    backendUrl: 'https://axis.example.com',
    mcpUrl: 'https://axis.example.com/api/mcp',
    token: 'axis-secret-token',
    key: 'axis-secret-key',
    session: 'axis-secret-session',
    productLineUuid: 'axis-pl-uuid',
    projectUuid: 'axis-proj-uuid',
    productLineId: 'axis-pl-id',
    projectId: 'axis-proj-id',
    productLineName: 'AxisNode',
    projectName: 'Axis Tools',
    selectedAgent: 'codex',
    repo,
  }, null, 2));
  await writeFile(path.join(repo, '.orbit', 'project.json'), JSON.stringify({
    backendUrl: 'https://orbit.example.com',
    productLineUuid: 'orbit-pl-uuid',
    projectUuid: 'orbit-proj-uuid',
    repo,
  }, null, 2));

  const result = await runViaLinkedAxisPool('axis-req', ['prepare', '--repo', repo, '--json']);
  const prepare = JSON.parse(result.stdout);
  assert.equal(prepare.schemaVersion, 'orbit.pool.prepare.v1');
  assert.equal(prepare.pool, 'req');
  assert.equal(prepare.bound, true);
  assert.equal(prepare.binding.backendUrl, 'https://axis.example.com');
  assert.equal(prepare.binding.productLineUuid, 'axis-pl-uuid');
  assert.equal(prepare.binding.projectUuid, 'axis-proj-uuid');
  assert.equal(prepare.binding.token, undefined);
  assert.equal(prepare.binding.key, undefined);
  assert.equal(prepare.binding.session, undefined);
  assert.doesNotMatch(result.stdout, /axis-secret-/);
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run(['orbit-bug', 'prepare', '--repo', repo, '--json']);
    const prepare = JSON.parse(result.stdout);
    assert.equal(prepare.template.source, 'hub');
    assert.equal(prepare.template.kind, 'bug');
    assert.match(prepare.template.markdownTemplate, /云端模板 bug/);
    assert.equal(prepare.projectContext.project.name, 'Hermes Console');
    assert.equal(prepare.projectContext.documents.length, 1);
    assert.equal(prepare.projectContext.workItems.length, 1);
    assert.doesNotMatch(result.stdout, /orbit-dev-token|orbit-dev-key|orbit-dev-session/);
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run(['orbit-bug', '登录失败', '--repo', repo, '--agent', 'none', '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.ok, true);
    assert.equal(created.mode, 'hub');
    assert.equal(created.id, 'doc-pool-1');
    assert.equal(created.itemsCount, 1);
    assert.match(created.savedPath, /docs\/bugs\/\d{8}-bug-orbit-item\.md$/);
    assert.equal(state.poolDocuments, 1);
    assert.equal(state.lastPoolDocument.kind, 'bug');
    assert.equal(state.lastPoolDocument.sourceId, 'orbit-bug');
    const saved = await readFile(created.savedPath, 'utf8');
    assert.match(saved, /source: hub-cache/);
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const input = '{"schemaVersion":"orbit.pool.artifact.v1","kind":"suggestion","title":"Button Copy","markdown":"# Button Copy\\n","workItems":[{"title":"Update copy"}]}';
    const result = await runInteractive(['orbit-sug', 'import', '--repo', repo, '--stdin', '--json'], `${input}\n`);
    const imported = JSON.parse(result.stdout);
    assert.equal(imported.mode, 'hub');
    assert.equal(imported.id, 'doc-pool-1');
    assert.match(imported.savedPath, /docs\/suggestions\/\d{8}-sug-button-copy\.md$/);
    assert.equal(state.poolDocuments, 1);
    assert.equal(state.lastPoolDocument.kind, 'suggestion');
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run(['orbit-bug', '登录失败', '--repo', repo, '--agent', 'none', '--no-doc', '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.mode, 'hub');
    assert.equal(created.savedPath, null);
    assert.equal(state.poolDocuments, 1);
    await assert.rejects(readFile(path.join(repo, 'docs', 'bugs', `${new Date().getFullYear()}-unused.md`), 'utf8'));
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run(['orbit-req', '商品评价支持图片', '--repo', repo, '--agent', 'none', '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.mode, 'hub');
    assert.equal(created.id, 'doc-req-1');
    assert.equal(state.poolDocuments, 0);
    assert.equal(state.requirements, 1);
    assert.equal(state.lastRequirement.title, '商品评价支持图片');
  }, { poolDocuments404: true });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run(['orbit-sug', '优化按钮文案', '--repo', repo, '--agent', 'none', '--local', '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.mode, 'local');
    assert.equal(state.poolDocuments, 0);
    assert.match(created.savedPath, /docs\/suggestions\/\d{8}-sug-orbit-item\.md$/);
  });
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const input = '{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Smoke Test","markdown":"# Smoke Test\\n"}';
  const result = await runInteractive(['orbit-req', 'import', '--repo', repo, '--stdin', '--local', '--json'], `${input}\n`);
  const imported = JSON.parse(result.stdout);
  assert.equal(imported.ok, true);
  assert.equal(imported.mode, 'local');
  assert.equal(imported.artifact.kind, 'requirement');
  assert.match(imported.savedPath, /docs\/requirements\/\d{8}-req-smoke-test\.md$/);
  const saved = await readFile(imported.savedPath, 'utf8');
  assert.match(saved, /kind: requirement/);
  assert.match(saved, /source: orbit-req import/);
  assert.match(saved, /command: orbit-req/);
  assert.match(saved, /# Smoke Test/);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const result = await run(['orbit-bug', '登录失败', '--repo', repo, '--agent', 'none', '--local', '--json']);
  const imported = JSON.parse(result.stdout);
  assert.equal(imported.ok, true);
  assert.equal(imported.mode, 'local');
  assert.equal(imported.artifact.kind, 'bug');
  assert.equal(imported.artifact.title, '登录失败');
  assert.match(imported.savedPath, /docs\/bugs\/\d{8}-bug-orbit-item\.md$/);
  const saved = await readFile(imported.savedPath, 'utf8');
  assert.match(saved, /kind: bug/);
  assert.match(saved, /source: orbit-bug run/);
  assert.match(saved, /# 登录失败/);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const result = await runViaLinkedAxisPool('axis-bug', ['登录失败', '--repo', repo, '--agent', 'none', '--local', '--json']);
  const imported = JSON.parse(result.stdout);
  assert.equal(imported.ok, true);
  assert.equal(imported.mode, 'local');
  assert.equal(imported.artifact.kind, 'bug');
  assert.equal(imported.artifact.title, '登录失败');
  assert.match(imported.savedPath, /docs\/bugs\/\d{8}-bug-axis-item\.md$/);
  const saved = await readFile(imported.savedPath, 'utf8');
  assert.match(saved, /source: axis-bug run/);
  assert.match(saved, /command: axis-bug/);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const result = await run(['orbit-req', 'Smoke', '--repo', repo, '--agent', 'none', '--local', '--json']);
  const created = JSON.parse(result.stdout);
  assert.equal(created.ok, true);
  assert.equal(created.mode, 'local');
  assert.equal(created.pool, 'req');
  assert.equal(created.artifact.kind, 'requirement');
  assert.equal(created.artifact.title, 'Smoke');
  assert.match(created.savedPath, /docs\/requirements\/\d{8}-req-smoke\.md$/);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'bound-repo');
  await mkdir(path.join(repo, '.orbit'), { recursive: true });
  await writeFile(path.join(repo, '.orbit', 'project.json'), JSON.stringify({
    backendUrl: 'https://orbit.example.com',
    projectId: 'proj-id',
    token: 'secret-token',
    repo,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, null, 2));

  const result = await run(['orbit-req', 'Smoke', '--repo', repo, '--agent', 'none', '--dry-run', '--json']);
  const created = JSON.parse(result.stdout);
  assert.equal(created.ok, true);
  assert.equal(created.mode, 'dry-run');
  assert.equal(created.savedPath, null);
  await assert.rejects(readFile(path.join(repo, 'docs', 'requirements', `${new Date().getFullYear()}-unused.md`), 'utf8'));
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'unbound-repo');
  const result = await run(['orbit-req', '--list', '--repo', repo, '--json']);
  const listed = JSON.parse(result.stdout);
  assert.equal(listed.ok, true);
  assert.equal(listed.mode, 'local');
  assert.equal(listed.pool, 'req');
  assert.equal(listed.bound, false);
  assert.deepEqual(listed.items, []);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const created = JSON.parse((await run(['orbit-req', 'Interactive list item', '--repo', repo, '--agent', 'none', '--local', '--json'])).stdout);
  const result = await runInteractive(['orbit-req', '--list', '--repo', repo], 'q\n');

  assert.match(result.stdout, /需求池 第 1 页，每页 10 条/);
  assert.match(result.stdout, /1\. \[[^\]]+\] Interactive list item/);
  assert.match(result.stdout, /操作: \[n\]下一页 \[p\]上一页 \[d\]删除 \[q\]退出/);
  assert.equal(await readFile(created.savedPath, 'utf8').then(() => true), true);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const created = JSON.parse((await run(['orbit-req', 'Keep me', '--repo', repo, '--agent', 'none', '--local', '--json'])).stdout);
  const id = path.basename(created.savedPath, '.md');
  const result = await runInteractive(['orbit-req', '--delete', id, '--repo', repo], 'no\n');

  assert.match(result.stdout, /确认删除\？输入 yes 确认:/);
  assert.match(result.stdout, /已取消删除/);
  assert.equal(await readFile(created.savedPath, 'utf8').then(() => true), true);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const created = JSON.parse((await run(['orbit-req', 'Delete me', '--repo', repo, '--agent', 'none', '--local', '--json'])).stdout);
  const id = path.basename(created.savedPath, '.md');
  const result = await runInteractive(['orbit-req', '--delete', id, '--repo', repo], 'yes\n');

  assert.match(result.stdout, /deleted:/);
  await assert.rejects(readFile(created.savedPath, 'utf8'));
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  await assert.rejects(
    run(['orbit-bug', '--delete', 'bug-1', '--repo', repo, '--json']),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.error.code, 'confirmation_required');
      assert.equal(payload.pool, 'bug');
      assert.equal(payload.id, 'bug-1');
      return true;
    },
  );
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
