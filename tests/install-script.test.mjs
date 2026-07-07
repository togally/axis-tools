import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const installScript = path.resolve('scripts/install-axis-tools.sh');
const repoRoot = path.resolve('.');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'axis-install-script-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeExecutable(file, body) {
  await writeFile(file, body, 'utf8');
  await chmod(file, 0o755);
}

await withTempDir(async (home) => {
  const fakeBin = path.join(home, 'bin');
  const npmPrefix = path.join(home, 'npm-prefix');
  const npmBin = path.join(npmPrefix, 'bin');
  const deletedCwd = path.join(home, 'deleted-cwd');
  const installTarget = path.join(home, 'axis-tools');
  const gitCwdFile = path.join(home, 'git-cwd.txt');
  const expectedSafeCwd = await realpath(home);

  await mkdir(fakeBin, { recursive: true });
  await mkdir(npmBin, { recursive: true });
  await mkdir(deletedCwd, { recursive: true });

  await writeExecutable(path.join(fakeBin, 'git'), `#!/usr/bin/env bash
set -euo pipefail

if [ "\${1:-}" = "clone" ]; then
  cwd="$(/bin/pwd -P 2>/dev/null)" || {
    echo "git inherited unavailable cwd" >&2
    exit 41
  }
  printf '%s\\n' "$cwd" > "$AXIS_FAKE_GIT_CWD_FILE"
  if [ "$cwd" != "$AXIS_EXPECTED_SAFE_CWD" ]; then
    echo "git inherited unexpected cwd: $cwd" >&2
    exit 42
  fi
  target="\${@: -1}"
  mkdir -p "$target"
  exit 0
fi

exit 0
`);

  await writeExecutable(path.join(fakeBin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail

if [ "\${1:-}" = "prefix" ] && [ "\${2:-}" = "-g" ]; then
  printf '%s\\n' "$AXIS_FAKE_NPM_PREFIX"
  exit 0
fi

exit 0
`);

  const helpScript = `#!/usr/bin/env bash
printf 'axis-tools\\nUsage: axis-tools install\\n'
`;
  await writeExecutable(path.join(fakeBin, 'axis'), helpScript);
  await writeExecutable(path.join(fakeBin, 'axis-tools'), helpScript);

  const { stdout } = await execFileAsync(
    'bash',
    ['-c', 'cd "$1" && rm -rf "$1" && bash "$2"', 'axis-test', deletedCwd, installScript],
    {
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
        AXIS_TOOLS_DIR: installTarget,
        AXIS_TOOLS_REPO: repoRoot,
        AXIS_TOOLS_BRANCH: 'main',
        AXIS_EXPECTED_SAFE_CWD: expectedSafeCwd,
        AXIS_FAKE_GIT_CWD_FILE: gitCwdFile,
        AXIS_FAKE_NPM_PREFIX: npmPrefix,
      },
      maxBuffer: 1024 * 1024,
    },
  );

  assert.match(stdout, /Installed Axis Tools/);
  assert.equal(await readFile(gitCwdFile, 'utf8'), `${expectedSafeCwd}\n`);
});
