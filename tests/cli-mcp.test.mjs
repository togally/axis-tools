import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

{
  assert.equal(packageJson.name, 'axis-tools');
  for (const bin of ['axis', 'axis-tools', 'axis-ide', 'axis-req', 'axis-bug', 'axis-sug']) {
    assert.equal(packageJson.bin[bin], './dist/cli.js');
  }
  for (const bin of ['orbit', 'orbit-tools', 'orbit-ide', 'orbit-req', 'orbit-bug', 'orbit-sug']) {
    assert.equal(packageJson.bin[bin], './dist/cli.js');
  }
}

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
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-tools-mcp-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeExecutable(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf8');
  await chmod(filePath, 0o755);
}

async function writeFakeCodex(binDir) {
  await writeExecutable(path.join(binDir, 'codex'), `#!/bin/sh
if [ -n "$AXIS_TEST_AGENT_PROMPT" ]; then
  if [ -n "$AXIS_TEST_AGENT_PROMPT_APPEND" ]; then
    printf '%s\\n---PROMPT---\\n' "$@" >> "$AXIS_TEST_AGENT_PROMPT"
  else
    printf '%s\\n' "$@" > "$AXIS_TEST_AGENT_PROMPT"
  fi
fi
if printf '%s\\n' "$@" | grep -q "Axis start-work task selection"; then
  if [ -n "$AXIS_TEST_AGENT_INVALID_SELECTION" ]; then
    printf 'not json\\n'
    exit 0
  fi
  if printf '%s\\n' "$@" | grep -q "wi-regression"; then
    printf '%s\\n' '{"selectedWorkItemId":"wi-regression","reason":"QA/testing responsibilities match the regression task."}'
    exit 0
  fi
  if printf '%s\\n' "$@" | grep -q "wi-visual-design"; then
    printf '%s\\n' '{"selectedWorkItemId":"wi-visual-design","reason":"Design/visual responsibilities match the UI design task."}'
    exit 0
  fi
  if printf '%s\\n' "$@" | grep -q "wi-start-work"; then
    printf '%s\\n' '{"selectedWorkItemId":"wi-start-work","reason":"Only candidate matches the employee context."}'
    exit 0
  fi
  printf '%s\\n' '{"selectedWorkItemId":null,"reason":"No candidate matches the employee responsibilities."}'
  exit 0
fi
printf 'fake codex completed\\n'
exit 0
`);
}

async function writeFakeSoulCodex(binDir) {
  await writeExecutable(path.join(binDir, 'codex'), `#!/bin/sh
if [ -n "$AXIS_TEST_AGENT_PROMPT" ]; then
  printf '%s\\n' "$@" > "$AXIS_TEST_AGENT_PROMPT"
fi
cat <<'EOF'
# Nova Vale

Name: Nova Vale
Gender: nonbinary
Role: Axis employee focused on high-signal execution.

Nova is careful, concise, and steady under ambiguous work.
EOF
exit 0
`);
}

async function writeFakeSoulCodexWithMarkdown(binDir, markdown) {
  await writeExecutable(path.join(binDir, 'codex'), `#!/bin/sh
if [ -n "$AXIS_TEST_AGENT_PROMPT" ]; then
  printf '%s\\n' "$@" > "$AXIS_TEST_AGENT_PROMPT"
fi
cat <<'EOF'
${markdown}
EOF
exit 0
`);
}

async function withEmployeeRegisterServer(fn) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/api/employees/register') {
        const body = raw ? JSON.parse(raw) : {};
        requests.push({ method: req.method, url: req.url, body, authorization: req.headers.authorization ?? '' });
        const payload = {
          employee: {
            id: body.employeeId ?? body.id,
            name: body.name,
            language: body.language,
            agentType: body.agentType,
            status: body.status,
            documents: {
              soul: { kind: 'soul', content: body.documents?.soul ?? '' },
              skill: { kind: 'skill', content: body.documents?.skill ?? '' },
              memory: { kind: 'memory', content: body.documents?.memory ?? '' },
            },
          },
          runtime: { store: 'test' },
        };
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    return await fn(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

{
  await withTempDir(async (dir) => {
    const home = path.join(dir, 'home');
    const binDir = path.join(dir, 'bin');
    const promptPath = path.join(dir, 'agent-prompt.txt');
    await mkdir(home, { recursive: true });
    await writeFakeSoulCodex(binDir);

    await withEmployeeRegisterServer(async (backendUrl, requests) => {
      const { stdout } = await run(['create-employee', '--agent', 'codex', '--language', 'en', '--backend-url', backendUrl, '--json'], {
        env: {
          HOME: home,
          AXIS_HOME: path.join(home, '.axis'),
          PATH: `${binDir}:${process.env.PATH}`,
          AXIS_TEST_AGENT_PROMPT: promptPath,
        },
      });

      const payload = JSON.parse(stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.mode, 'create-employee');
      assert.match(payload.employeeId, /^emp_[A-Za-z0-9_-]{20,40}$/);
      assert.equal(payload.name, 'Nova Vale');
      assert.equal(payload.language, 'en');
      assert.equal(payload.agent, 'codex');
      assert.equal(payload.cloud.ok, true);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body.employeeId, payload.employeeId);
      assert.equal(requests[0].body.agentType, 'codex');
      assert.equal(requests[0].body.name, 'Nova Vale');
      assert.equal(requests[0].body.language, 'en');
      assert.match(requests[0].body.documents.soul, /Nova Vale/);
      assert.match(requests[0].body.documents.skill, /Axis employee skills/);
      assert.match(requests[0].body.documents.memory, /Axis employee memory/);

      const employeeDir = path.join(home, '.axis', 'employees', payload.employeeId);
      assert.equal(payload.localPath, employeeDir);
      assert.match(await readFile(path.join(employeeDir, 'soul.md'), 'utf8'), /Nova Vale/);
      assert.match(await readFile(path.join(employeeDir, 'skill.md'), 'utf8'), /Axis employee skills/);
      assert.match(await readFile(path.join(employeeDir, 'memory.md'), 'utf8'), /Axis employee memory/);
      const config = JSON.parse(await readFile(path.join(employeeDir, 'config.json'), 'utf8'));
      assert.equal(config.employeeId, payload.employeeId);
      assert.equal(config.agentType, 'codex');
      assert.equal(config.name, 'Nova Vale');
      assert.equal(config.language, 'en');
      assert.equal(config.backendUrl, backendUrl);

      const prompt = await readFile(promptPath, 'utf8');
      assert.match(prompt, new RegExp(payload.employeeId));
      assert.match(prompt, /English/);
      assert.match(prompt, /natural human-like name|person-like/);
      assert.doesNotMatch(payload.employeeId, /127|localhost|jasper|axis/i);
    });
  });
}

{
  await withTempDir(async (dir) => {
    const home = path.join(dir, 'home');
    const binDir = path.join(dir, 'bin');
    const promptPath = path.join(dir, 'agent-prompt.txt');
    await mkdir(home, { recursive: true });
    await writeFakeSoulCodexWithMarkdown(binDir, `# emp_badtoken

Name: Agent 1
Display name: Evelyn Hart
Gender: unspecified
Role: Axis employee focused on careful delivery.
`);

    await withEmployeeRegisterServer(async (backendUrl, requests) => {
      const { stdout } = await run(['create-employee', '--agent', 'codex', '--language', 'en', '--backend-url', backendUrl, '--json'], {
        env: {
          HOME: home,
          AXIS_HOME: path.join(home, '.axis'),
          PATH: `${binDir}:${process.env.PATH}`,
          AXIS_TEST_AGENT_PROMPT: promptPath,
        },
      });

      const payload = JSON.parse(stdout);
      assert.equal(payload.language, 'en');
      assert.equal(payload.name, 'Evelyn Hart');
      assert.equal(requests[0].body.name, 'Evelyn Hart');
      assert.equal(requests[0].body.language, 'en');
      assert.doesNotMatch(requests[0].body.name, /^emp_|^Agent\s+\d+$/i);

      const employeeDir = path.join(home, '.axis', 'employees', payload.employeeId);
      const config = JSON.parse(await readFile(path.join(employeeDir, 'config.json'), 'utf8'));
      assert.equal(config.language, 'en');

      const prompt = await readFile(promptPath, 'utf8');
      assert.match(prompt, /English/);
      assert.match(prompt, /human-like English name/);
      assert.match(prompt, /soul\.md, skill\.md, and memory\.md must be written in English/);
    });
  });
}

{
  await withTempDir(async (dir) => {
    const home = path.join(dir, 'home');
    await mkdir(home, { recursive: true });

    await withEmployeeRegisterServer(async (backendUrl, requests) => {
      const { stdout } = await run(['create-employee', '--agent', 'codex', '--language', 'zh', '--backend-url', backendUrl, '--json'], {
        env: {
          HOME: home,
          AXIS_HOME: path.join(home, '.axis'),
          PATH: '/usr/bin:/bin',
          AXIS_EMPLOYEE_AGENT_TIMEOUT_MS: '5000',
        },
      });

      const payload = JSON.parse(stdout);
      assert.equal(payload.language, 'zh');
      assert.match(payload.name, /^[\u4e00-\u9fff]{2,4}$/);
      assert.equal(requests[0].body.language, 'zh');
      assert.equal(requests[0].body.name, payload.name);

      const employeeDir = path.join(home, '.axis', 'employees', payload.employeeId);
      assert.match(await readFile(path.join(employeeDir, 'soul.md'), 'utf8'), /# 林知远|姓名：林知远|工作原则/);
      assert.match(await readFile(path.join(employeeDir, 'skill.md'), 'utf8'), /# Axis 员工技能|员工：|验证变更/);
      assert.match(await readFile(path.join(employeeDir, 'memory.md'), 'utf8'), /# Axis 员工记忆|暂无持久/);
    });
  });
}

{
  await withTempDir(async (dir) => {
    const home = path.join(dir, 'home');
    await mkdir(home, { recursive: true });

    await withEmployeeRegisterServer(async (backendUrl, requests) => {
      const { stdout } = await run(['create-employee', '--agent', 'codex', '--language', 'english', '--backend-url', backendUrl, '--json'], {
        env: {
          HOME: home,
          AXIS_HOME: path.join(home, '.axis'),
          PATH: '/usr/bin:/bin',
          AXIS_EMPLOYEE_AGENT_TIMEOUT_MS: '5000',
        },
      });

      const payload = JSON.parse(stdout);
      assert.equal(payload.language, 'en');
      assert.equal(payload.name, 'Evelyn Hart');
      assert.equal(requests[0].body.language, 'en');

      const employeeDir = path.join(home, '.axis', 'employees', payload.employeeId);
      assert.match(await readFile(path.join(employeeDir, 'soul.md'), 'utf8'), /# Evelyn Hart|Name: Evelyn Hart|Operating principles/);
      assert.match(await readFile(path.join(employeeDir, 'skill.md'), 'utf8'), /# Axis employee skills|verify changed behavior/);
      assert.match(await readFile(path.join(employeeDir, 'memory.md'), 'utf8'), /# Axis employee memory|No durable project-specific memory/);
    });
  });
}

async function runViaLinkedBin(args) {
  return withTempDir(async (dir) => {
    const binPath = path.join(dir, 'axis');
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
    const binPath = path.join(dir, 'axis-tools');
    await symlink(cli, binPath);
    return execFileAsync(binPath, args, {
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    });
  });
}

async function runViaLinkedLegacyAlias(args) {
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

async function writeProductLineBinding(root, backendUrl, extra = {}) {
  await mkdir(path.join(root, '.orbit'), { recursive: true });
  await writeFile(path.join(root, '.orbit', 'product-line.json'), JSON.stringify({
    backendUrl,
    token: 'orbit-dev-token',
    key: 'orbit-dev-key',
    session: 'orbit-dev-session',
    productLineId: 'pl_2',
    productLineUuid: '8f938fdc-f2be-44d6-8c48-91bc9156836d',
    productLineName: 'Hermes',
    owner: 'orbit-user',
    rootPath: root,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }, null, 2));
}

async function writeWorkPrerequisites(home) {
  await writeExecutable(path.join(home, '.local', 'bin', 'gstack'), '#!/bin/sh\nexit 0\n');
  await mkdir(path.join(home, '.hermes', 'skills', 'gstack-plan-ceo-review'), { recursive: true });
  await writeFile(path.join(home, '.hermes', 'skills', 'gstack-plan-ceo-review', 'SKILL.md'), '# Plan CEO Review\n', 'utf8');
  await mkdir(path.join(home, '.codex', 'skills', 'superpowers', 'brainstorming'), { recursive: true });
  await mkdir(path.join(home, '.codex', 'skills', 'superpowers', 'systematic-debugging'), { recursive: true });
  await writeFile(path.join(home, '.codex', 'skills', 'superpowers', 'brainstorming', 'SKILL.md'), '# Brainstorm Method\n\nAsk one question at a time.\n', 'utf8');
  await writeFile(path.join(home, '.codex', 'skills', 'superpowers', 'systematic-debugging', 'SKILL.md'), '# Debug Method\n\nFind the root cause before fixes.\n', 'utf8');
}

function canonicalLifecycleStatus(status) {
  const value = String(status ?? '').trim();
  const lower = value.toLowerCase();
  if (lower === 'pending-confirmation') return 'NEW';
  if (lower === 'ready') return 'WAIT_CODE';
  if (['new', 'wait_review', 'wait_user_confirm', 'wait_code'].includes(lower)) return value.toUpperCase();
  return value;
}

function statusMatches(actual, requested) {
  return canonicalLifecycleStatus(actual) === canonicalLifecycleStatus(requested);
}

async function withPoolServer(fn, options = {}) {
  const state = {
    requests: [],
    documents: [],
    poolDocuments: 0,
    requirements: 0,
    poolSeeds: 0,
    loginCount: 0,
    accountByToken: {},
    workItemUpdates: [],
    documentUpdates: [],
    heartbeats: [],
    claims: [],
    lifecycleActions: [],
  };
  const catalog = {
    products: [
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
    runtime: { store: 'mock' },
  };
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
    const workItems = () => options.workItems ?? [
      { id: 'wi-old', title: 'Existing item', type: 'requirement', pool: 'requirement', status: 'ready' },
    ];
    const workItemMatches = (item, url) => {
      const pool = url.searchParams.get('pool') ?? url.searchParams.get('category');
      const status = url.searchParams.get('status');
      const kind = url.searchParams.get('kind');
      const type = url.searchParams.get('type');
      if (pool && item.pool !== pool) return false;
      if (status && !statusMatches(item.status, status)) return false;
      if (type && item.type !== type) return false;
      if (kind) {
        if (item.kind === kind || item.type === kind) return true;
        if (kind === 'suggestion' && (item.pool === 'improvement' || item.type === 'improvement')) return true;
        if (item.pool === kind) return true;
        return false;
      }
      return true;
    };

    if (req.method === 'POST' && req.url === '/api/login') {
      state.loginCount++;
      readJson().then((payload) => {
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
    if (req.method === 'GET' && req.url === '/api/products') {
      if (!requireAuth()) return;
      if (options.emptyProducts) {
        res.end(JSON.stringify({ products: [], runtime: catalog.runtime }));
        return;
      }
      res.end(JSON.stringify(catalog));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/products/pl_2') {
      if (!requireAuth()) return;
      res.end(JSON.stringify({ ...catalog.products[0], runtime: catalog.runtime }));
      return;
    }
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
      const url = new URL(req.url, 'http://127.0.0.1');
      res.end(JSON.stringify({
        items: workItems().filter((item) => workItemMatches(item, url)),
        runtime: { store: 'mock' },
      }));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/api/agent-context')) {
      if (!requireAuth()) return;
      const url = new URL(req.url, 'http://127.0.0.1');
      const projectId = url.searchParams.get('projectId');
      if (projectId !== 'proj_1') {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'project not found' }));
        return;
      }
      const documents = options.agentContextDocuments ?? {
        'soul.md': { key: 'soul.md', found: true, content: '# Soul\n\nBuild useful software.', markdown: '# Soul\n\nBuild useful software.' },
        'skill.md': { key: 'skill.md', found: true, content: '# Skill\n\nUse TDD.', markdown: '# Skill\n\nUse TDD.' },
        'memory.md': { key: 'memory.md', found: true, content: '# Memory\n\nNo recent notes.', markdown: '# Memory\n\nNo recent notes.' },
      };
      const warnings = Object.values(documents)
        .map((document) => document.warning)
        .filter(Boolean);
      res.end(JSON.stringify({
        projectId,
        documents,
        warning: warnings.join(' '),
        runtime: { store: 'mock' },
      }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/agent-workers/heartbeat') {
      if (!requireAuth()) return;
      readJson().then((payload) => {
        state.heartbeats.push(payload);
        res.end(JSON.stringify({
          worker: {
            ...payload,
            heartbeatCount: state.heartbeats.filter((entry) => entry.sessionId === payload.sessionId).length,
            lastHeartbeatAt: new Date().toISOString(),
          },
          runtime: { store: 'mock' },
        }));
      });
      return;
    }
    {
      const claimMatch = req.url.match(/^\/api\/work-items\/([^/]+)\/claim$/);
      if ((req.method === 'POST' || req.method === 'PATCH') && claimMatch) {
        if (!requireAuth()) return;
        readJson().then((payload) => {
          const workItemId = claimMatch[1];
          state.claims.push({ id: workItemId, payload });
          if (options.claimConflict) {
            res.statusCode = 409;
            res.end(JSON.stringify({ error: 'work item already claimed' }));
            return;
          }
          const item = workItems().find((entry) => entry.id === workItemId);
          if (!item) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'work item not found' }));
            return;
          }
          item.status = 'claimed';
          item.claimedBy = payload.agentId ?? payload.owner;
          item.claimedBySessionId = payload.sessionId;
          res.end(JSON.stringify({
            item,
            project: { id: 'proj_1', name: 'Hermes Console' },
            runtime: { store: 'mock' },
          }));
        });
        return;
      }
    }
    {
      const lifecycleMatch = req.url.match(/^\/api\/work-items\/([^/]+)\/(start|complete|release|unclaim)$/);
      if ((req.method === 'POST' || req.method === 'PATCH') && lifecycleMatch) {
        if (!requireAuth()) return;
        readJson().then((payload) => {
          const [, workItemId, action] = lifecycleMatch;
          state.lifecycleActions.push({ id: workItemId, action, payload });
          const item = workItems().find((entry) => entry.id === workItemId) ?? { id: workItemId, title: 'Unknown item', type: 'requirement' };
          if (action === 'start') item.status = 'in-progress';
          if (action === 'complete') item.status = 'done';
          res.end(JSON.stringify({
            item,
            project: { id: 'proj_1', name: 'Hermes Console' },
            runtime: { store: 'mock' },
          }));
        });
        return;
      }
    }
    if (req.method === 'GET' && req.url.startsWith('/api/projects/proj_1/pool-seeds')) {
      if (!requireAuth()) return;
      const url = new URL(req.url, 'http://127.0.0.1');
      const status = url.searchParams.get('status');
      const items = options.poolSeeds ?? [
        { id: 'seed-old', kind: 'idea', title: 'Existing idea seed', status: 'pending-confirmation' },
      ];
      res.end(JSON.stringify({
        items: items.filter((item) => !status || statusMatches(item.status, status)),
        runtime: { store: 'mock' },
      }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/projects/proj_1/pool-seeds') {
      if (!requireAuth()) return;
      readJson().then((payload) => {
        state.poolSeeds++;
        state.lastPoolSeed = payload;
        res.statusCode = 201;
        res.end(JSON.stringify({
          id: 'seed-1',
          title: payload.title,
          kind: payload.kind,
          status: payload.status,
          url: `/projects/proj_1/pool/seeds/seed-1`,
          runtime: { store: 'mock' },
        }));
      });
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
    if (req.method === 'PATCH' && req.url.startsWith('/api/projects/proj_1/documents/')) {
      if (!requireAuth()) return;
      const documentId = req.url.split('/').pop();
      readJson().then((payload) => {
        state.documentUpdates.push({ id: documentId, payload });
        if (Array.isArray(options.poolSeeds)) {
          for (const item of options.poolSeeds) {
            if (item.id === documentId || item.documentId === documentId) item.status = payload.status;
          }
        }
        res.end(JSON.stringify({
          document: { id: documentId, title: 'Updated document', source: { type: 'requirement' }, status: payload.status },
          items: [],
          runtime: { store: 'mock' },
        }));
      });
      return;
    }
    if (req.method === 'PATCH' && req.url.startsWith('/api/work-items/')) {
      if (!requireAuth()) return;
      const workItemId = req.url.split('/').pop();
      readJson().then((payload) => {
        state.workItemUpdates.push({ id: workItemId, payload });
        if (Array.isArray(options.workItems)) {
          for (const item of options.workItems) {
            if (item.id === workItemId) {
              if (payload.status) item.status = payload.status;
              if (payload.sourceArtifactId) item.sourceArtifactId = payload.sourceArtifactId;
            }
          }
        }
        res.end(JSON.stringify({
          item: {
            id: workItemId,
            title: workItems().find((item) => item.id === workItemId)?.title ?? 'Updated item',
            type: workItems().find((item) => item.id === workItemId)?.type ?? 'requirement',
            status: payload.status ?? 'done',
            notes: payload.notes ?? '',
            completedAt: payload.completedAt ?? '',
          },
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
  const legacyHelp = await runViaLinkedLegacyAlias(['--help']);
  assert.match(usage.stdout, /^axis\n/);
  assert.match(usage.stdout, /Aliases: axis-tools, orbit, orbit-tools/);
  assert.match(usage.stdout, /Commands:\n  login\n  me\n  init\n  bind\n  pull\n/);
  assert.match(usage.stdout, /axis start-work \[--agent <codex\|claude-code\|claude>\]/);
  assert.match(usage.stdout, /axis work-review \[--repo <path>\]/);
  assert.match(usage.stdout, /axis work-coding \[--repo <path>\]/);
  assert.match(usage.stdout, /Deprecated worker commands:/);
  assert.match(usage.stdout, /work-review and work-coding are deprecated; use axis start-work/);
  assert.equal(longHelp.stdout, usage.stdout);
  assert.equal(shortHelp.stdout, usage.stdout);
  assert.equal(linkedHelp.stdout, usage.stdout);
  assert.equal(aliasHelp.stdout, usage.stdout);
  assert.equal(legacyHelp.stdout, usage.stdout);
  assert.match(usage.stdout, /init = packaged skill setup only/);
  assert.match(usage.stdout, /login = prompt for AxisNode account and hidden password; cache session/);
  assert.match(usage.stdout, /me = show current AxisNode user/);
  assert.match(usage.stdout, /bind = bind a repo or product-line root/);
  assert.match(usage.stdout, /pull = clone\/pull maintained repos from AxisNode/);
  assert.match(usage.stdout, /create-employee \[--agent <codex\|claude-code\|cc>\] \[--language <zh\|en>\]/);
  assert.doesNotMatch(usage.stdout, /\n  register(\s|\n)/);
  assert.doesNotMatch(usage.stdout, /  setup \[--repo <path>\]/);
  await assert.rejects(run(['definitely-unknown-command']), (error) => error.code === 1);
}

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    for (const [command, flag] of [
      ['work-review', '--help'],
      ['work-review', '-h'],
      ['work-coding', '--help'],
      ['work-coding', '-h'],
    ]) {
      const result = await run([command, flag], { cwd: repo, timeout: 2000 });
      assert.match(result.stdout, new RegExp(`axis ${command}`));
      assert.doesNotMatch(result.stdout, /\bstarting\b/);
      assert.doesNotMatch(result.stdout, /iteration 1/);
      assert.doesNotMatch(result.stdout, /stop reason/);
      assert.equal(result.stderr, '');
      assert.equal(state.requests.length, 0);
    }
  }, { poolSeeds: [] });
});

{
  const result = await run(['start-work', '--help'], { timeout: 2000 });
  assert.match(result.stdout, /axis start-work/);
  assert.match(result.stdout, /--agent <codex\|claude-code\|claude>/);
  assert.match(result.stdout, /--foreground/);
  assert.match(result.stdout, /--heartbeat-interval <seconds>/);
  assert.doesNotMatch(result.stdout, /\bstarting\b/);
  assert.equal(result.stderr, '');
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
  await withPoolServer(async (backendUrl, state) => {
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
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const promptLog = path.join(dir, 'start-work-prompt.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeFakeCodex(fakeBin);

    const result = await run([
      'start-work',
      '--repo',
      repo,
      '--foreground',
      '--heartbeat-interval',
      '1',
      '--interval',
      '0',
      '--iterations',
      '1',
      '--json',
    ], {
      timeout: 5000,
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_TEST_AGENT_PROMPT: promptLog,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'start-work');
    assert.equal(payload.background, false);
    assert.equal(payload.agent, 'codex');
    assert.equal(payload.heartbeatIntervalSeconds, 1);
    assert.equal(payload.intervalSeconds, 0);
    assert.equal(payload.maxIterations, 1);
    assert.equal(payload.iterations.length, 1);
    assert.equal(payload.summary.claimed, 1);
    assert.equal(payload.summary.executed, 1);
    assert.equal(payload.stopReason, 'max-iterations');
    assert.equal(payload.sessionId.startsWith('axis-'), true);

    const workerState = JSON.parse(await readFile(path.join(home, '.axis', 'workers', payload.sessionId, 'state.json'), 'utf8'));
    assert.equal(workerState.sessionId, payload.sessionId);
    assert.equal(workerState.agent, 'codex');

    assert.ok(state.heartbeats.length >= 1);
    assert.equal(state.heartbeats[0].sessionId, payload.sessionId);
    assert.equal(state.heartbeats[0].agentType, 'codex');
    assert.ok(state.requests.some((entry) => entry.method === 'GET' && entry.url.startsWith('/api/agent-context?')));
    assert.ok(state.requests.some((entry) => entry.url.includes('/work-items?status=WAIT_CODE')));
    assert.deepEqual(state.claims.map((entry) => entry.id), ['wi-start-work']);
    assert.deepEqual(state.lifecycleActions.map((entry) => entry.action), ['start', 'complete']);

    const prompt = await readFile(promptLog, 'utf8');
    assert.match(prompt, /# Soul/);
    assert.match(prompt, /Build reliable workers/);
    assert.match(prompt, /# skill.md/);
    assert.match(prompt, /Implement start-work execution/);
  }, {
    workItems: [
      { id: 'wi-start-work', title: 'Implement start-work execution', type: 'requirement', pool: 'requirement', status: 'WAIT_CODE', notes: 'Run the coding agent with Axis context.' },
    ],
    agentContextDocuments: {
      'soul.md': { key: 'soul.md', found: true, content: '# Soul\n\nBuild reliable workers.', markdown: '# Soul\n\nBuild reliable workers.' },
      'skill.md': { key: 'skill.md', found: false, content: '# skill.md\n\nAgent context document skill.md was not found; using empty fallback.', markdown: '# skill.md\n\nAgent context document skill.md was not found; using empty fallback.', warning: 'Agent context document skill.md was not found; using empty fallback.' },
      'memory.md': { key: 'memory.md', found: true, content: '# Memory\n\nPrevious queue was idle.', markdown: '# Memory\n\nPrevious queue was idle.' },
    },
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const promptLog = path.join(dir, 'start-work-selection-prompts.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeFakeCodex(fakeBin);

    const result = await run([
      'start-work',
      '--repo',
      repo,
      '--foreground',
      '--heartbeat-interval',
      '1',
      '--interval',
      '0',
      '--iterations',
      '1',
      '--json',
    ], {
      timeout: 5000,
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_TEST_AGENT_PROMPT: promptLog,
        AXIS_TEST_AGENT_PROMPT_APPEND: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.claimed, 1);
    assert.equal(payload.summary.executed, 1);
    assert.deepEqual(state.claims.map((entry) => entry.id), ['wi-regression']);
    assert.deepEqual(state.lifecycleActions.map((entry) => entry.id), ['wi-regression', 'wi-regression']);

    const projectResult = payload.iterations[0].results[0];
    assert.equal(projectResult.status, 'executed');
    assert.equal(projectResult.workItemId, 'wi-regression');
    assert.equal(projectResult.selection.selectedWorkItemId, 'wi-regression');
    assert.match(projectResult.selection.reason, /QA\/testing responsibilities/);
    assert.match(result.stderr, /selection: selected wi-regression/);

    const prompts = await readFile(promptLog, 'utf8');
    assert.match(prompts, /# Axis start-work task selection/);
    assert.match(prompts, /QA testing engineer/);
    assert.match(prompts, /wi-development/);
    assert.match(prompts, /Implement billing calculation module/);
    assert.match(prompts, /Development work/);
    assert.match(prompts, /doc-development/);
    assert.match(prompts, /wi-regression/);
    assert.match(prompts, /Add checkout regression coverage/);
    assert.match(prompts, /Testing work/);
    assert.match(prompts, /doc-testing/);
  }, {
    workItems: [
      {
        id: 'wi-development',
        title: 'Implement billing calculation module',
        type: 'requirement',
        pool: 'requirement',
        status: 'WAIT_CODE',
        notes: 'Development work: implement service logic and persistence.',
        sourceArtifactId: 'doc-development',
      },
      {
        id: 'wi-regression',
        title: 'Add checkout regression coverage',
        type: 'requirement',
        pool: 'requirement',
        status: 'WAIT_CODE',
        notes: 'Testing work: add QA regression tests for checkout failure paths.',
        sourceArtifactId: 'doc-testing',
      },
    ],
    agentContextDocuments: {
      'soul.md': { key: 'soul.md', found: true, content: '# Soul\n\nQA testing engineer for Axis release quality.', markdown: '# Soul\n\nQA testing engineer for Axis release quality.' },
      'skill.md': { key: 'skill.md', found: true, content: '# Skill\n\nRegression testing, test automation, Playwright, and release verification.', markdown: '# Skill\n\nRegression testing, test automation, Playwright, and release verification.' },
      'memory.md': { key: 'memory.md', found: true, content: '# Memory\n\nPrefer testing tasks over general development work.', markdown: '# Memory\n\nPrefer testing tasks over general development work.' },
    },
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const promptLog = path.join(dir, 'start-work-design-selection-prompts.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeFakeCodex(fakeBin);

    const result = await run([
      'start-work',
      '--repo',
      repo,
      '--foreground',
      '--heartbeat-interval',
      '1',
      '--interval',
      '0',
      '--iterations',
      '1',
      '--json',
    ], {
      timeout: 5000,
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_TEST_AGENT_PROMPT: promptLog,
        AXIS_TEST_AGENT_PROMPT_APPEND: '1',
        AXIS_TEST_AGENT_INVALID_SELECTION: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.claimed, 1);
    assert.equal(payload.summary.executed, 1);
    assert.deepEqual(state.claims.map((entry) => entry.id), ['wi-visual-design']);
    assert.deepEqual(state.lifecycleActions.map((entry) => entry.id), ['wi-visual-design', 'wi-visual-design']);

    const projectResult = payload.iterations[0].results[0];
    assert.equal(projectResult.status, 'executed');
    assert.equal(projectResult.workItemId, 'wi-visual-design');
    assert.equal(projectResult.selection.selectedWorkItemId, 'wi-visual-design');
    assert.equal(projectResult.selection.source, 'fallback');
    assert.match(projectResult.selection.reason, /design\/visual|美工/);
    assert.match(projectResult.selection.warning, /invalid JSON/);
    assert.match(result.stderr, /selection: selected wi-visual-design/);

    const prompts = await readFile(promptLog, 'utf8');
    assert.match(prompts, /# Axis start-work task selection/);
    assert.match(prompts, /美工/);
    assert.match(prompts, /wi-deploy/);
    assert.match(prompts, /Prepare production deployment runbook/);
    assert.match(prompts, /DevOps work/);
    assert.match(prompts, /doc-deploy/);
    assert.match(prompts, /wi-visual-design/);
    assert.match(prompts, /Polish checkout visual design/);
    assert.match(prompts, /Visual design work/);
    assert.match(prompts, /doc-design/);
  }, {
    workItems: [
      {
        id: 'wi-deploy',
        title: 'Prepare production deployment runbook',
        type: 'requirement',
        pool: 'requirement',
        status: 'WAIT_CODE',
        notes: 'DevOps work: deployment checklist, release rollback, observability.',
        sourceArtifactId: 'doc-deploy',
      },
      {
        id: 'wi-visual-design',
        title: 'Polish checkout visual design',
        type: 'requirement',
        pool: 'requirement',
        status: 'WAIT_CODE',
        notes: 'Visual design work: UI composition, color, typography, and interaction states.',
        sourceArtifactId: 'doc-design',
      },
    ],
    agentContextDocuments: {
      'soul.md': { key: 'soul.md', found: true, content: '# Soul\n\n美工 / visual design employee for Axis product interfaces.', markdown: '# Soul\n\n美工 / visual design employee for Axis product interfaces.' },
      'skill.md': { key: 'skill.md', found: true, content: '# Skill\n\nUI visual design, color systems, typography, and high-fidelity product polish.', markdown: '# Skill\n\nUI visual design, color systems, typography, and high-fidelity product polish.' },
      'memory.md': { key: 'memory.md', found: true, content: '# Memory\n\nChoose visual and design work over deployment operations.', markdown: '# Memory\n\nChoose visual and design work over deployment operations.' },
    },
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const promptLog = path.join(dir, 'start-work-no-match-prompts.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeFakeCodex(fakeBin);

    const result = await run([
      'start-work',
      '--repo',
      repo,
      '--foreground',
      '--heartbeat-interval',
      '1',
      '--interval',
      '0',
      '--iterations',
      '1',
      '--json',
    ], {
      timeout: 5000,
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_TEST_AGENT_PROMPT: promptLog,
        AXIS_TEST_AGENT_PROMPT_APPEND: '1',
        AXIS_TEST_AGENT_INVALID_SELECTION: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.ready, 2);
    assert.equal(payload.summary.claimed, 0);
    assert.equal(payload.summary.executed, 0);
    assert.equal(payload.summary.idle, 1);
    assert.deepEqual(state.claims, []);
    assert.deepEqual(state.lifecycleActions, []);

    const projectResult = payload.iterations[0].results[0];
    assert.equal(projectResult.status, 'idle');
    assert.equal(projectResult.ready, 2);
    assert.equal(projectResult.selection.selectedWorkItemId, null);
    assert.equal(projectResult.selection.source, 'fallback');
    assert.match(projectResult.selection.reason, /No WorkItem matched/);
    assert.match(projectResult.selection.warning, /invalid JSON/);
    assert.match(result.stderr, /selection: skipped/);

    const prompts = await readFile(promptLog, 'utf8');
    assert.match(prompts, /# Axis start-work task selection/);
    assert.match(prompts, /Product manager/);
    assert.doesNotMatch(prompts, /# Axis start-work coding execution/);
  }, {
    workItems: [
      {
        id: 'wi-development-api',
        title: 'Create billing API endpoint',
        type: 'requirement',
        pool: 'requirement',
        status: 'WAIT_CODE',
        notes: 'Development-only task: REST API handlers, database schema, service validation.',
        sourceArtifactId: 'doc-api',
      },
      {
        id: 'wi-devops-worker',
        title: 'Implement queue worker retry policy',
        type: 'requirement',
        pool: 'requirement',
        status: 'WAIT_CODE',
        notes: 'DevOps-only task: worker leases, retry state, server-side scheduling.',
        sourceArtifactId: 'doc-worker',
      },
    ],
    agentContextDocuments: {
      'soul.md': { key: 'soul.md', found: true, content: '# Soul\n\nProduct manager responsible for product requirements and acceptance scope.', markdown: '# Soul\n\nProduct manager responsible for product requirements and acceptance scope.' },
      'skill.md': { key: 'skill.md', found: true, content: '# Skill\n\nPRD writing, product planning, acceptance criteria, and roadmap tradeoffs.', markdown: '# Skill\n\nPRD writing, product planning, acceptance criteria, and roadmap tradeoffs.' },
      'memory.md': { key: 'memory.md', found: true, content: '# Memory\n\nSkip implementation tasks when no product planning work is available.', markdown: '# Memory\n\nSkip implementation tasks when no product planning work is available.' },
    },
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');

    await writeProjectBinding(repo, backendUrl);
    await writeFakeCodex(fakeBin);

    const result = await run([
      'start-work',
      '--repo',
      repo,
      '--agent',
      'codex',
      '--heartbeat-interval',
      '1',
      '--interval',
      '0',
      '--iterations',
      '1',
      '--json',
    ], {
      timeout: 3000,
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'start-work');
    assert.equal(payload.background, true);
    assert.equal(payload.agent, 'codex');
    assert.equal(typeof payload.pid, 'number');
    assert.equal(payload.sessionId.startsWith('axis-'), true);
    assert.match(payload.logPath, /worker\.log$/);

    const config = JSON.parse(await readFile(path.join(home, '.axis', 'workers', payload.sessionId, 'config.json'), 'utf8'));
    const state = JSON.parse(await readFile(path.join(home, '.axis', 'workers', payload.sessionId, 'state.json'), 'utf8'));
    assert.equal(config.sessionId, payload.sessionId);
    assert.equal(config.agent, 'codex');
    assert.equal(config.background, true);
    assert.equal(state.pid, payload.pid);
    assert.equal(state.background, true);
  }, { workItems: [] });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run(['orbit-bug', 'run', '登录失败', '--repo', repo, '--agent', 'none', '--json']);
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
    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });

    const result = await runViaLinkedAxisPool('axis-ide', ['测试想法', '--repo', repo, '--agent', 'codex', '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.ok, true);
    assert.equal(created.mode, 'hub-seed');
    assert.equal(created.id, 'seed-1');
    assert.equal(created.status, 'NEW');
    assert.equal(created.kind, 'idea');
    assert.equal(created.title, '测试想法');
    assert.equal(state.poolSeeds, 1);
    assert.equal(state.poolDocuments, 0);
    assert.equal(state.lastPoolSeed.kind, 'idea');
    assert.equal(state.lastPoolSeed.title, '测试想法');
    assert.equal(state.lastPoolSeed.seed, '测试想法');
    assert.equal(state.lastPoolSeed.status, 'NEW');
    assert.equal(state.lastPoolSeed.source, 'CLI');
    assert.equal(state.lastPoolSeed.sourceId, 'axis-ide');
    assert.equal(state.lastPoolSeed.repo, repo);
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeWorkPrerequisites(home);
    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Work review converts seed","summary":"Converted by work-review","status":"draft","markdown":"# Work review converts seed\\n","sections":[],"workItems":[{"title":"Build work-review worker"}]}
JSON
`);

    const result = await run([
      'work-review',
      '--repo',
      repo,
      '--agent',
      'codex',
      '--iterations',
      '1',
      '--json',
    ], {
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-review');
    assert.notEqual(payload.mode, 'loop-skeleton');
    assert.equal(payload.workerType, 'review');
    assert.equal(payload.bounded, true);
    assert.equal(payload.maxIterations, 1);
    assert.equal(payload.iterations.length, 1);
    assert.equal(payload.iterations[0].mode, 'work-review-iteration');
    assert.equal(payload.iterations[0].workerType, 'review');
    assert.equal(payload.iterations[0].review.agent, 'codex');
    assert.equal(payload.iterations[0].review.results.length, 1);
    assert.equal(payload.iterations[0].review.results[0].seedId, 'seed-work-review');
    assert.equal(payload.iterations[0].review.results[0].candidateSource, 'pool-seed');
    assert.equal(payload.iterations[0].review.results[0].candidateType, 'requirement');
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.poolSeed, 1);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.workItem, 0);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.candidates, 1);
    assert.equal(payload.iterations[0].review.results[0].submit.mode, 'hub');
    assert.equal(payload.iterations[0].review.results[0].handled.status, 'WAIT_USER_CONFIRM');
    assert.equal(state.poolDocuments, 1);
    assert.equal(state.lastPoolDocument.kind, 'requirement');
    assert.deepEqual(state.documentUpdates.map((entry) => entry.id), ['seed-work-review']);
    assert.deepEqual(state.documentUpdates.map((entry) => entry.payload.status), ['WAIT_USER_CONFIRM']);
  }, {
    poolSeeds: [
      { id: 'seed-work-review', kind: 'requirement', title: 'Work review converts seed', seed: 'Convert this in work-review', status: 'NEW' },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const promptLog = path.join(dir, 'codex-prompts.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeWorkPrerequisites(home);
    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
printf '%s\\n---PROMPT---\\n' "$2" >> "$AXIS_FAKE_PROMPT"
case "$2" in
  *"Pool kind: bug"*)
    cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"bug","title":"Pending bug WorkItem","summary":"Converted bug work item","status":"draft","markdown":"# Pending bug WorkItem\\n","sections":[],"workItems":[{"title":"Fix pending bug"}]}
JSON
    ;;
  *)
    cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Pending requirement WorkItem","summary":"Converted requirement work item","status":"draft","markdown":"# Pending requirement WorkItem\\n","sections":[],"workItems":[{"title":"Build pending requirement"}]}
JSON
    ;;
esac
`);

    const result = await run([
      'work-review',
      '--repo',
      repo,
      '--iterations',
      '1',
      '--json',
    ], {
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_FAKE_PROMPT: promptLog,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.iterations[0].summary.pending, 2);
    assert.deepEqual(payload.iterations[0].summary.pendingBySource, { 'work-item': 2 });
    assert.deepEqual(payload.iterations[0].summary.candidatesByType, { requirement: 1, bug: 1 });
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.poolSeed, 0);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.workItem, 2);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.candidates, 2);
    assert.equal(payload.iterations[0].review.results.length, 2);
    assert.deepEqual(payload.iterations[0].review.results.map((entry) => entry.candidateSource), ['work-item', 'work-item']);
    assert.deepEqual(payload.iterations[0].review.results.map((entry) => entry.candidateType), ['requirement', 'bug']);
    assert.equal(payload.iterations[0].review.results[0].handled.status, 'WAIT_USER_CONFIRM');
    assert.equal(payload.iterations[0].review.results[1].handled.status, 'WAIT_USER_CONFIRM');
    assert.equal(payload.summary.pending, 2);
    assert.equal(payload.summary.converted, 2);
    assert.deepEqual(payload.summary.pendingBySource, { 'work-item': 2 });
    assert.equal(state.poolDocuments, 2);
    assert.deepEqual(state.workItemUpdates.map((entry) => entry.id), ['wi-pending-req', 'wi-pending-bug']);
    assert.deepEqual(state.workItemUpdates.map((entry) => entry.payload.status), ['WAIT_USER_CONFIRM', 'WAIT_USER_CONFIRM']);
    assert.deepEqual(state.workItemUpdates.map((entry) => entry.payload.sourceArtifactId), ['doc-pool-1', 'doc-pool-1']);

    const prompts = await readFile(promptLog, 'utf8');
    assert.match(prompts, /Pending requirement WorkItem/);
    assert.match(prompts, /Convert pending requirement from WorkItem notes/);
    assert.match(prompts, /Pending bug WorkItem/);
    assert.match(prompts, /Convert pending bug from WorkItem notes/);
  }, {
    poolSeeds: [],
    workItems: [
      {
        id: 'wi-pending-req',
        type: 'requirement',
        pool: 'requirement',
        title: 'Pending requirement WorkItem',
        notes: 'Convert pending requirement from WorkItem notes',
        status: 'WAIT_REVIEW',
        sourceArtifactId: 'doc-pending-req',
      },
      {
        id: 'wi-pending-bug',
        type: 'bug',
        pool: 'bug',
        title: 'Pending bug WorkItem',
        notes: 'Convert pending bug from WorkItem notes',
        status: 'WAIT_REVIEW',
        sourceArtifactId: 'doc-pending-bug',
      },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeWorkPrerequisites(home);
    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Duplicate source","summary":"Converted once","status":"draft","markdown":"# Duplicate source\\n","sections":[],"workItems":[{"title":"Build duplicate once"}]}
JSON
`);

    const result = await run([
      'work-review',
      '--repo',
      repo,
      '--iterations',
      '1',
      '--json',
    ], {
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.poolSeed, 1);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.workItem, 1);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.candidates, 1);
    assert.equal(payload.iterations[0].lanes.refine.sourceCounts.duplicates, 1);
    assert.equal(payload.iterations[0].review.results.length, 1);
    assert.equal(payload.iterations[0].review.results[0].candidateSource, 'pool-seed');
    assert.equal(payload.iterations[0].review.results[0].handled.status, 'WAIT_USER_CONFIRM');
    assert.equal(state.poolDocuments, 1);
    assert.equal(state.workItemUpdates.length, 1);
    assert.equal(state.workItemUpdates[0].id, 'wi-dupe');
    assert.equal(state.workItemUpdates[0].payload.status, 'WAIT_USER_CONFIRM');
    assert.equal(state.workItemUpdates[0].payload.sourceArtifactId, 'doc-pool-1');
    assert.deepEqual(state.documentUpdates.map((entry) => entry.id), ['doc-dupe']);
    assert.deepEqual(state.documentUpdates.map((entry) => entry.payload.status), ['WAIT_USER_CONFIRM']);
  }, {
    poolSeeds: [
      { id: 'doc-dupe', kind: 'requirement', title: 'Duplicate source', seed: 'Convert duplicate once', status: 'NEW' },
    ],
    workItems: [
      {
        id: 'wi-dupe',
        type: 'requirement',
        pool: 'requirement',
        title: 'Duplicate source',
        notes: 'This WorkItem points at the same raw seed document.',
        status: 'NEW',
        sourceArtifactId: 'doc-dupe',
      },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const root = path.join(dir, 'pull-root');
    const productRoot = path.join(root, 'hermes');
    const project = path.join(productRoot, 'hermes-console');
    await writeProductLineBinding(productRoot, backendUrl);
    await writeProjectBinding(project, backendUrl);

    const result = await runViaLinkedAxisPool('axis-bug', ['登录失败', '--repo', root, '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.ok, true);
    assert.equal(created.mode, 'hub-seed');
    assert.equal(created.repo, project);
    assert.equal(created.id, 'seed-1');
    assert.equal(created.kind, 'bug');
    assert.match(created.warning, /resolved/i);
    assert.equal(state.poolSeeds, 1);
    assert.equal(state.lastPoolSeed.kind, 'bug');
    assert.equal(state.lastPoolSeed.repo, project);
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const root = path.join(dir, 'pull-root');
    const first = path.join(root, 'hermes', 'hermes-console');
    const second = path.join(root, 'apollo', 'apollo-console');
    await writeProductLineBinding(path.join(root, 'hermes'), backendUrl, { productLineName: 'Hermes' });
    await writeProductLineBinding(path.join(root, 'apollo'), backendUrl, { productLineName: 'Apollo' });
    await writeProjectBinding(first, backendUrl, { productLineName: 'Hermes', projectName: 'Hermes Console' });
    await writeProjectBinding(second, backendUrl, { productLineName: 'Apollo', projectName: 'Apollo Console', projectId: 'proj_2' });

    const result = await runViaLinkedAxisPool('orbit-req', ['商品评价支持图片', '--repo', root, '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.ok, true);
    assert.equal(created.mode, 'local-seed');
    assert.equal(created.repo, root);
    assert.equal(created.id, null);
    assert.equal(state.poolSeeds, 0);
    assert.match(created.savedPath, /pull-root\/\.axis\/pool-seeds\/\d{8}-req-/);
    assert.match(created.warning, /Multiple AxisNode project bindings found/);
    assert.match(created.warning, /Hermes Console/);
    assert.match(created.warning, /Apollo Console/);
    assert.match(created.warning, /--repo/);
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const root = path.join(dir, 'product-root');
    await writeProductLineBinding(root, backendUrl);

    const result = await runViaLinkedAxisPool('axis-req', ['商品评价支持图片', '--repo', root, '--json']);
    const created = JSON.parse(result.stdout);
    assert.equal(created.ok, true);
    assert.equal(created.mode, 'local-seed');
    assert.equal(created.repo, root);
    assert.equal(state.poolSeeds, 0);
    assert.match(created.warning, /product-line binding/);
    assert.match(created.warning, /no project binding/);
    assert.match(created.warning, /Run inside a project directory/);
  });
});

await withTempDir(async (dir) => {
  const root = path.join(dir, 'empty-root');
  await mkdir(root, { recursive: true });

  const result = await runViaLinkedAxisPool('axis-sug', ['优化按钮文案', '--repo', root, '--json']);
  const created = JSON.parse(result.stdout);
  assert.equal(created.ok, true);
  assert.equal(created.mode, 'local-seed');
  assert.equal(created.repo, root);
  assert.match(created.savedPath, /empty-root\/\.axis\/pool-seeds\/\d{8}-sug-/);
  assert.match(created.warning, /No AxisNode project binding found/);
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run(['work', 'once', '--repo', repo, '--json']);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'probe');
    assert.equal(payload.repo, repo);
    assert.equal(payload.spawn, false);
    assert.equal(payload.lanes.refine.description, '整理 NEW/WAIT_REVIEW seeds and pool WorkItems into WAIT_USER_CONFIRM documents.');
    assert.deepEqual(payload.lanes.refine.methodologyByKind, {
      idea: 'plan-ceo-review',
      requirement: 'superpowers:brainstorm',
      bug: 'superpowers:systematic-debugging',
      suggestion: 'superpowers:brainstorm',
    });
    assert.equal(payload.lanes.execute.description, '开发 WAIT_CODE WorkItems.');
    assert.equal(payload.lanes.refine.items[0].id, 'seed-old');
    assert.equal(payload.lanes.execute.items[0].id, 'wi-old');
    assert.ok(state.requests.some((entry) => entry.url.includes('/pool-seeds?status=NEW')));
    assert.ok(state.requests.some((entry) => entry.url.includes('/pool-seeds?status=WAIT_REVIEW')));
    assert.ok(state.requests.some((entry) => entry.url.includes('/pool-seeds?status=pending-confirmation')));
    assert.ok(state.requests.some((entry) => entry.url.includes('/work-items?status=WAIT_CODE')));
    assert.ok(state.requests.some((entry) => entry.url.includes('/work-items?status=ready')));
    assert.match(payload.plan[0], /Probe Hub queues/);
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const fakeLog = path.join(dir, 'fake-tools.log');
    const promptLog = path.join(dir, 'codex-prompt.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await mkdir(path.join(home, 'gstack', '.git'), { recursive: true });
    await mkdir(path.join(home, 'gstack', 'bin'), { recursive: true });
    await mkdir(path.join(home, 'gstack', 'browse'), { recursive: true });
    await writeFile(path.join(home, 'gstack', 'ETHOS.md'), '# Ethos\n', 'utf8');
    await mkdir(path.join(home, '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills', 'brainstorming'), { recursive: true });
    await mkdir(path.join(home, '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills', 'systematic-debugging'), { recursive: true });
    await writeFile(path.join(home, '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills', 'brainstorming', 'SKILL.md'), '# Brainstorm Method\n\nAsk clarifying questions before planning.\n', 'utf8');
    await writeFile(path.join(home, '.codex', '.tmp', 'plugins', 'plugins', 'superpowers', 'skills', 'systematic-debugging', 'SKILL.md'), '# Debug Method\n\nTrace symptoms before fixing.\n', 'utf8');

    await writeExecutable(path.join(fakeBin, 'git'), `#!/bin/sh
printf 'git %s\\n' "$*" >> "$AXIS_FAKE_LOG"
exit 0
`);
    await writeExecutable(path.join(fakeBin, 'bun'), `#!/bin/sh
printf 'bun %s\\n' "$*" >> "$AXIS_FAKE_LOG"
if [ "$1" = "run" ]; then
  workdir="$(pwd)"
  mkdir -p "$workdir/.hermes/skills/gstack-plan-ceo-review"
  printf '# Plan CEO Review\\n\\nAsk the CEO to choose between paths before writing the plan.\\n' > "$workdir/.hermes/skills/gstack-plan-ceo-review/SKILL.md"
  mkdir -p "$workdir/.hermes/skills/gstack"
  printf '# Gstack\\n' > "$workdir/.hermes/skills/gstack/SKILL.md"
fi
exit 0
`);
    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
printf '%s' "$2" > "$AXIS_FAKE_PROMPT"
cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"idea","title":"Existing idea seed","summary":"Converted by fake Codex","status":"draft","markdown":"# Existing idea seed\\n","sections":[],"workItems":[{"title":"Review idea"}]}
JSON
`);

    const result = await run([
      'work',
      'once',
      '--repo',
      repo,
      '--spawn',
      '--agent',
      'codex',
      '--json',
    ], {
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_FAKE_LOG: fakeLog,
        AXIS_FAKE_PROMPT: promptLog,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-once');
    assert.equal(payload.spawn, true);
    assert.equal(payload.refine.agent, 'codex');
    assert.equal(payload.refine.prerequisites.ok, true);
    assert.equal(payload.refine.results.length, 1);
    assert.equal(payload.refine.results[0].seedId, 'seed-old');
    assert.equal(payload.refine.results[0].kind, 'idea');
    assert.equal(payload.refine.results[0].methodologySkill, 'gstack-plan-ceo-review');
    assert.equal(payload.refine.results[0].methodologyInjected, true);
    assert.match(payload.refine.results[0].methodologyPath, /gstack-plan-ceo-review\/SKILL\.md$/);
    assert.equal(payload.refine.results[0].methodologyWarning, null);
    assert.equal(payload.refine.results[0].submit.mode, 'hub');
    assert.equal(state.poolDocuments, 1);
    assert.equal(state.lastPoolDocument.kind, 'idea');
    assert.equal(state.lastPoolDocument.sourceId, 'axis-ide');

    const prompt = await readFile(promptLog, 'utf8');
    assert.match(prompt, /methodologySkill: gstack-plan-ceo-review/);
    assert.match(prompt, /# Plan CEO Review/);
    assert.match(prompt, /Ask the CEO to choose between paths/);
    assert.match(prompt, /MUST NOT ask the user questions/);
    assert.match(prompt, /Decision block/);
    assert.match(prompt, /recommended option/);
    assert.match(prompt, /continue generation in the same pass/);
    assert.match(prompt, /可选方案 \/ 推荐方案/);
    assert.match(prompt, /Existing edited document\/artifact context/);
    assert.match(prompt, /Treat any existing edited document or artifact as user feedback/);
    assert.match(prompt, /Launch MVP first/);
    assert.match(prompt, /Existing idea seed/);
    assert.match(prompt, /Return only the final JSON artifact/);

    const toolLog = await readFile(fakeLog, 'utf8');
    assert.match(toolLog, /git -C .*gstack pull --ff-only/);
    assert.match(toolLog, /bun install/);
    assert.match(toolLog, /bun run gen:skill-docs --host hermes/);
    assert.match(await readFile(path.join(home, '.hermes', 'skills', 'gstack-plan-ceo-review', 'SKILL.md'), 'utf8'), /Plan CEO Review/);
    assert.match(await readFile(path.join(home, '.codex', 'skills', 'superpowers', 'brainstorming', 'SKILL.md'), 'utf8'), /Brainstorm/);
    assert.match(await readFile(path.join(home, '.local', 'bin', 'gstack'), 'utf8'), /gstack/);
    assert.match(result.stderr, /axis work prerequisite/);
  }, {
    poolSeeds: [
      {
        id: 'seed-old',
        kind: 'idea',
        title: 'Existing idea seed',
        status: 'pending-confirmation',
        document: {
          id: 'doc-edited',
          title: 'Existing idea seed',
          markdown: '# Existing idea seed\n\n## 可选方案 / 推荐方案\n- [x] 推荐方案: Launch MVP first\n',
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const promptLog = path.join(dir, 'codex-prompts.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeExecutable(path.join(home, '.local', 'bin', 'gstack'), '#!/bin/sh\nexit 0\n');
    await mkdir(path.join(home, '.hermes', 'skills', 'gstack-plan-ceo-review'), { recursive: true });
    await writeFile(path.join(home, '.hermes', 'skills', 'gstack-plan-ceo-review', 'SKILL.md'), '# Plan CEO Review\n', 'utf8');
    await mkdir(path.join(home, '.codex', 'skills', 'superpowers', 'brainstorming'), { recursive: true });
    await mkdir(path.join(home, '.codex', 'skills', 'superpowers', 'systematic-debugging'), { recursive: true });
    await writeFile(path.join(home, '.codex', 'skills', 'superpowers', 'brainstorming', 'SKILL.md'), '# Brainstorm Method\n\nAsk one question at a time.\n', 'utf8');
    await writeFile(path.join(home, '.codex', 'skills', 'superpowers', 'systematic-debugging', 'SKILL.md'), '# Debug Method\n\nFind the root cause before fixes.\n', 'utf8');

    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
printf '%s\\n---PROMPT---\\n' "$2" >> "$AXIS_FAKE_PROMPT"
case "$2" in
  *"Pool kind: bug"*)
    cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"bug","title":"Crash on save","summary":"Converted bug","status":"draft","markdown":"# Crash on save\\n","sections":[],"workItems":[{"title":"Fix crash"}]}
JSON
    ;;
  *)
    cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Upload images","summary":"Converted requirement","status":"draft","markdown":"# Upload images\\n","sections":[],"workItems":[{"title":"Build upload"}]}
JSON
    ;;
esac
`);

    const result = await run([
      'work',
      'once',
      '--repo',
      repo,
      '--spawn',
      '--agent',
      'codex',
      '--json',
    ], {
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_FAKE_PROMPT: promptLog,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.refine.results.length, 2);
    assert.equal(payload.refine.results[0].methodologySkill, 'superpowers:brainstorm');
    assert.equal(payload.refine.results[0].methodologyInjected, true);
    assert.match(payload.refine.results[0].methodologyPath, /brainstorming\/SKILL\.md$/);
    assert.equal(payload.refine.results[1].methodologySkill, 'superpowers:systematic-debugging');
    assert.equal(payload.refine.results[1].methodologyInjected, true);
    assert.match(payload.refine.results[1].methodologyPath, /systematic-debugging\/SKILL\.md$/);
    assert.equal(state.poolDocuments, 2);

    const prompts = await readFile(promptLog, 'utf8');
    assert.match(prompts, /methodologySkill: superpowers:brainstorm/);
    assert.match(prompts, /# Brainstorm Method/);
    assert.match(prompts, /methodologySkill: superpowers:systematic-debugging/);
    assert.match(prompts, /# Debug Method/);
    assert.match(prompts, /MUST NOT ask the user questions/);
    assert.match(prompts, /recommended option/);
    assert.match(prompts, /continue generation in the same pass/);
  }, {
    poolSeeds: [
      { id: 'seed-req', kind: 'requirement', title: 'Upload images', seed: 'Support image uploads', status: 'NEW' },
      { id: 'seed-bug', kind: 'bug', title: 'Crash on save', seed: 'App crashes when saving', status: 'WAIT_REVIEW' },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');
    const promptLog = path.join(dir, 'codex-prompt.txt');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeWorkPrerequisites(home);
    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
printf '%s' "$2" > "$AXIS_FAKE_PROMPT"
cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Loop converts seed","summary":"Converted by loop","status":"draft","markdown":"# Loop converts seed\\n","sections":[],"workItems":[{"title":"Build loop worker"}]}
JSON
`);

    const result = await run([
      'work-review',
      '--repo',
      repo,
      '--iterations',
      '1',
      '--json',
    ], {
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_FAKE_PROMPT: promptLog,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-review');
    assert.equal(payload.workerType, 'review');
    assert.notEqual(payload.mode, 'loop-skeleton');
    assert.equal(payload.bounded, true);
    assert.equal(payload.infinite, false);
    assert.equal(payload.maxIterations, 1);
    assert.equal(payload.stopReason, 'max-iterations');
    assert.equal(payload.iterations.length, 1);
    assert.equal(payload.iterations[0].iteration, 1);
    assert.equal(payload.iterations[0].mode, 'work-review-iteration');
    assert.equal(payload.iterations[0].workerType, 'review');
    assert.equal(payload.iterations[0].spawn, true);
    assert.equal(payload.iterations[0].review.results.length, 1);
    assert.equal(payload.iterations[0].review.results[0].seedId, 'seed-loop');
    assert.equal(payload.iterations[0].review.results[0].methodologySkill, 'superpowers:brainstorm');
    assert.equal(payload.iterations[0].review.results[0].submit.mode, 'hub');
    assert.equal(payload.summary.converted, 1);
    assert.equal(payload.summary.conversions, 1);
    assert.equal(state.poolDocuments, 1);
    assert.equal(state.lastPoolDocument.kind, 'requirement');

    const prompt = await readFile(promptLog, 'utf8');
    assert.match(prompt, /methodologySkill: superpowers:brainstorm/);
    assert.match(prompt, /# Brainstorm Method/);
    assert.doesNotMatch(result.stdout, /loop-skeleton/);
  }, {
    poolSeeds: [
      { id: 'seed-loop', kind: 'requirement', title: 'Loop converts seed', seed: 'Convert this in loop', status: 'NEW' },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    const home = path.join(dir, 'home');
    const fakeBin = path.join(dir, 'fake-bin');

    await writeProjectBinding(repo, backendUrl, { selectedAgent: 'codex' });
    await writeWorkPrerequisites(home);
    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"bug","title":"Loop bug","summary":"Converted bug","status":"draft","markdown":"# Loop bug\\n","sections":[],"workItems":[{"title":"Fix loop bug"}]}
JSON
`);

    const result = await run([
      'work-review',
      '--repo',
      repo,
      '--max-iterations',
      '2',
      '--sleep',
      '60',
      '--json',
    ], {
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_WORK_LOOP_SKIP_SLEEP: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-review');
    assert.equal(payload.workerType, 'review');
    assert.equal(payload.bounded, true);
    assert.equal(payload.infinite, false);
    assert.equal(payload.maxIterations, 2);
    assert.equal(payload.intervalSeconds, 60);
    assert.equal(payload.stopReason, 'max-iterations');
    assert.equal(payload.iterations.length, 2);
    assert.deepEqual(payload.iterations.map((entry) => entry.iteration), [1, 2]);
    assert.equal(payload.iterations[0].review.results[0].seedId, 'seed-loop-bug');
    assert.equal(payload.iterations[1].review.results.length, 0);
    assert.equal(payload.sleeps.length, 1);
    assert.equal(payload.sleeps[0].afterIteration, 1);
    assert.equal(payload.sleeps[0].skipped, true);
    assert.equal(payload.summary.converted, 1);
    assert.equal(payload.summary.conversions, 1);
    assert.equal(state.poolDocuments, 1);
    assert.deepEqual(state.documentUpdates.map((entry) => entry.payload.status), ['WAIT_USER_CONFIRM']);
  }, {
    poolSeeds: [
      { id: 'seed-loop-bug', kind: 'bug', title: 'Loop bug', seed: 'Crash in loop mode', status: 'pending-confirmation' },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run([
      'work-review',
      '--repo',
      repo,
      '--iterations',
      '3',
      '--json',
    ], {
      env: {
        AXIS_WORK_LOOP_SKIP_SLEEP: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-review');
    assert.equal(payload.workerType, 'review');
    assert.equal(payload.bounded, true);
    assert.equal(payload.infinite, false);
    assert.equal(payload.maxIterations, 3);
    assert.equal(payload.stopReason, 'max-iterations');
    assert.equal(payload.iterations.length, 3);
    assert.deepEqual(payload.iterations.map((entry) => entry.review.results.length), [0, 0, 0]);
    assert.equal(payload.sleeps.length, 2);
    assert.equal(payload.sleeps[0].skipped, true);
    assert.match(payload.warning, /No NEW or WAIT_REVIEW pool seeds/);
    assert.equal(payload.summary.pending, 0);
    assert.equal(payload.summary.idle, 3);
    assert.equal(payload.summary.converted, 0);
    assert.equal(state.poolDocuments, 0);
  }, { poolSeeds: [] });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const repo = path.join(dir, 'bound-repo');
    await writeProjectBinding(repo, backendUrl);

    const result = await run([
      'work-coding',
      '--repo',
      repo,
      '--iterations',
      '1',
      '--json',
    ], {
      env: {
        AXIS_WORK_LOOP_SKIP_SLEEP: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-coding');
    assert.notEqual(payload.mode, 'loop-skeleton');
    assert.equal(payload.workerType, 'coding');
    assert.equal(payload.bounded, true);
    assert.equal(payload.maxIterations, 1);
    assert.equal(payload.stopReason, 'max-iterations');
    assert.equal(payload.iterations.length, 1);
    assert.equal(payload.iterations[0].mode, 'work-coding-iteration');
    assert.equal(payload.iterations[0].workerType, 'coding');
    assert.equal(payload.iterations[0].coding.status, 'blocked');
    assert.equal(payload.iterations[0].coding.readyCount, 1);
    assert.match(payload.iterations[0].coding.warning, /TODO/i);
    assert.match(payload.iterations[0].coding.warning, /Hub claim API is available/i);
    assert.match(payload.iterations[0].coding.todo, /claim handoff/i);
    assert.equal(payload.summary.ready, 1);
    assert.equal(payload.summary.blocked, 1);
    assert.ok(state.requests.some((entry) => entry.url.includes('/work-items?status=WAIT_CODE')));
    assert.ok(state.requests.some((entry) => entry.url.includes('/work-items?status=ready')));
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl, state) => {
    const home = path.join(dir, 'home');
    const unbound = path.join(dir, 'unbound-cwd');
    const fakeBin = path.join(dir, 'fake-bin');
    await mkdir(unbound, { recursive: true });
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });
    await writeWorkPrerequisites(home);
    await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Workspace review seed","summary":"Converted by workspace worker","status":"draft","markdown":"# Workspace review seed\\n","sections":[],"workItems":[{"title":"Build workspace review"}]}
JSON
`);

    const result = await run([
      'work-review',
      '--agent',
      'codex',
      '--iterations',
      '1',
      '--json',
      '--backend-url',
      backendUrl,
    ], {
      cwd: unbound,
      env: {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-review');
    assert.equal(payload.scope, 'workspace');
    assert.equal(payload.repo, null);
    assert.equal(payload.workspaceRoot, path.join(home, '.axis'));
    assert.equal(payload.catalogPath, path.join(home, '.axis', 'catalog.json'));
    assert.equal(payload.projectCount, 2);
    assert.notEqual(payload.stopReason, 'no-project-binding');
    assert.equal(payload.stopReason, 'max-iterations');
    assert.equal(payload.iterations.length, 1);
    assert.equal(payload.iterations[0].projects.length, 2);
    assert.equal(payload.iterations[0].projects[0].projectId, 'proj_1');
    assert.equal(payload.iterations[0].projects[0].review.results[0].seedId, 'seed-workspace-review');
    assert.equal(payload.iterations[0].projects[0].review.results[0].submit.mode, 'hub');
    assert.equal(payload.summary.converted, 1);
    const catalog = JSON.parse(await readFile(payload.catalogPath, 'utf8'));
    assert.equal(catalog.schemaVersion, 'axis.workspace.catalog.v1');
    assert.equal(catalog.workspaceRoot, path.join(home, '.axis'));
    assert.equal(catalog.projectCount, 2);
    assert.equal(state.poolDocuments, 1);
    assert.equal(state.lastPoolDocument.kind, 'requirement');
  }, {
    poolSeeds: [
      { id: 'seed-workspace-review', kind: 'requirement', title: 'Workspace review seed', seed: 'Convert from workspace mode', status: 'NEW' },
    ],
  });
});

await withTempDir(async (dir) => {
  await withPoolServer(async (backendUrl) => {
    const home = path.join(dir, 'home');
    const axisHome = path.join(dir, 'custom-axis-home');
    const unbound = path.join(dir, 'unbound-cwd');
    await mkdir(unbound, { recursive: true });
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    const result = await run([
      'work-coding',
      '--iterations',
      '1',
      '--json',
      '--backend-url',
      backendUrl,
    ], {
      cwd: unbound,
      env: {
        HOME: home,
        AXIS_HOME: axisHome,
        AXIS_WORK_LOOP_SKIP_SLEEP: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'work-coding');
    assert.equal(payload.scope, 'workspace');
    assert.equal(payload.repo, null);
    assert.equal(payload.workspaceRoot, axisHome);
    assert.equal(payload.catalogPath, path.join(axisHome, 'catalog.json'));
    assert.equal(payload.projectCount, 2);
    assert.notEqual(payload.stopReason, 'no-project-binding');
    assert.equal(payload.stopReason, 'max-iterations');
    assert.equal(payload.iterations.length, 1);
    assert.equal(payload.iterations[0].projects.length, 2);
    assert.deepEqual(payload.iterations[0].projects.map((project) => project.projectId), ['proj_1', 'proj_2']);
    assert.equal(payload.iterations[0].projects[0].coding.status, 'blocked');
    assert.equal(payload.iterations[0].projects[0].coding.readyCount, 1);
    assert.match(payload.iterations[0].projects[0].coding.warning, /TODO/i);
    assert.equal(payload.summary.ready, 1);
    assert.equal(payload.summary.blocked, 1);
    const catalog = JSON.parse(await readFile(payload.catalogPath, 'utf8'));
    assert.equal(catalog.workspaceRoot, axisHome);
    assert.equal(catalog.projectCount, 2);
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const home = path.join(dir, 'home');
    const unbound = path.join(dir, 'unbound-cwd');
    await mkdir(unbound, { recursive: true });

    await assert.rejects(
      run([
        'work-review',
        '--iterations',
        '1',
        '--json',
        '--backend-url',
        backendUrl,
      ], { cwd: unbound, env: { HOME: home } }),
      (error) => /Please login/.test(error.stderr)
        && !/no-project-binding|No AxisNode project binding/.test(error.stderr),
    );
  });
});

await withTempDir(async (dir) => {
  await withProductServer(async (backendUrl) => {
    const home = path.join(dir, 'home');
    const unbound = path.join(dir, 'unbound-cwd');
    await mkdir(unbound, { recursive: true });
    await runInteractive(['login', '--backend-url', backendUrl], `orbit-account\n${TEST_PASSWORD}\n`, { env: { HOME: home } });

    const result = await run([
      'work-coding',
      '--iterations',
      '1',
      '--json',
      '--backend-url',
      backendUrl,
    ], {
      cwd: unbound,
      env: {
        HOME: home,
        AXIS_WORK_LOOP_SKIP_SLEEP: '1',
      },
    });

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.scope, 'workspace');
    assert.equal(payload.projectCount, 0);
    assert.equal(payload.stopReason, 'max-iterations');
    assert.match(payload.warning, /No accessible AxisNode projects/);
    assert.equal(payload.summary.idle, 1);
  }, { emptyProducts: true });
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'unbound-repo');
  await mkdir(repo, { recursive: true });

  const result = await run([
    'work-review',
    '--repo',
    repo,
    '--json',
  ]);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'work-review');
  assert.equal(payload.workerType, 'review');
  assert.equal(payload.bounded, false);
  assert.equal(payload.infinite, true);
  assert.equal(payload.maxIterations, null);
  assert.equal(payload.stopReason, 'no-project-binding');
  assert.equal(payload.iterations.length, 1);
  assert.match(payload.warning, /No AxisNode project binding found/);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const result = await runViaLinkedAxisPool('axis-ide', ['--help', '--repo', repo]);

  assert.match(result.stdout, /axis-req <text>/);
  assert.doesNotMatch(result.stdout, /Select agent/);
  await assert.rejects(readFile(path.join(repo, '.axis', 'pool-seeds'), 'utf8'));
  await assert.rejects(readFile(path.join(repo, 'docs', 'ideas'), 'utf8'));
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

    const result = await run(['orbit-bug', 'run', '登录失败', '--repo', repo, '--agent', 'none', '--no-doc', '--json']);
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

    const result = await run(['orbit-req', 'run', '商品评价支持图片', '--repo', repo, '--agent', 'none', '--json']);
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

    const result = await run(['orbit-sug', 'run', '优化按钮文案', '--repo', repo, '--agent', 'none', '--local', '--json']);
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
  const result = await run(['orbit-bug', 'run', '登录失败', '--repo', repo, '--agent', 'none', '--local', '--json']);
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
  const result = await runViaLinkedAxisPool('axis-bug', ['run', '登录失败', '--repo', repo, '--agent', 'none', '--local', '--json']);
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
  const repo = path.join(dir, 'bound-repo');
  const fakeBin = path.join(dir, 'fake-bin');
  const fakeLog = path.join(dir, 'fake-agent.log');
  await writeProjectBinding(repo, 'http://127.0.0.1:1', { selectedAgent: 'codex' });
  await writeExecutable(path.join(fakeBin, 'codex'), `#!/bin/sh
printf 'codex launched\\n' >> "$AXIS_FAKE_LOG"
cat <<'JSON'
{"schemaVersion":"orbit.pool.artifact.v1","kind":"requirement","title":"Should Not Launch","summary":"Should not launch","status":"draft","markdown":"# Should Not Launch\\n","sections":[],"workItems":[]}
JSON
`);

  await assert.rejects(
    run([
      'axis-req',
      'run',
      'do not launch from pool command',
      '--repo',
      repo,
      '--agent',
      'codex',
      '--json',
    ], {
      env: {
        PATH: `${fakeBin}:${process.env.PATH}`,
        AXIS_FAKE_LOG: fakeLog,
      },
    }),
    /Pool run no longer launches Agents/,
  );
  await assert.rejects(readFile(fakeLog, 'utf8'));
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const result = await run(['orbit-req', 'run', 'Smoke', '--repo', repo, '--agent', 'none', '--local', '--json']);
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

  const result = await run(['orbit-req', 'run', 'Smoke', '--repo', repo, '--agent', 'none', '--dry-run', '--json']);
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
  const created = JSON.parse((await run(['orbit-req', 'run', 'Interactive list item', '--repo', repo, '--agent', 'none', '--local', '--json'])).stdout);
  const result = await runInteractive(['orbit-req', '--list', '--repo', repo], 'q\n');

  assert.match(result.stdout, /需求池 第 1 页，每页 10 条/);
  assert.match(result.stdout, /1\. \[[^\]]+\] Interactive list item/);
  assert.match(result.stdout, /操作: \[n\]下一页 \[p\]上一页 \[d\]删除 \[q\]退出/);
  assert.equal(await readFile(created.savedPath, 'utf8').then(() => true), true);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const created = JSON.parse((await run(['orbit-req', 'run', 'Keep me', '--repo', repo, '--agent', 'none', '--local', '--json'])).stdout);
  const id = path.basename(created.savedPath, '.md');
  const result = await runInteractive(['orbit-req', '--delete', id, '--repo', repo], 'no\n');

  assert.match(result.stdout, /确认删除\？输入 yes 确认:/);
  assert.match(result.stdout, /已取消删除/);
  assert.equal(await readFile(created.savedPath, 'utf8').then(() => true), true);
});

await withTempDir(async (dir) => {
  const repo = path.join(dir, 'repo');
  const created = JSON.parse((await run(['orbit-req', 'run', 'Delete me', '--repo', repo, '--agent', 'none', '--local', '--json'])).stdout);
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
