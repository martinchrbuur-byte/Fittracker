import { execSync } from 'node:child_process';

const DEFAULT_TARGET = 'backup/pre-security-hardening-2026-03-02';
const targetRef = process.env.ROLLBACK_TARGET || DEFAULT_TARGET;
const mode = process.argv[2] || 'run';

function run(cmd, options = {}) {
  return execSync(cmd, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
}

function runPassthrough(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function fail(message) {
  console.error(`[rollback] ${message}`);
  process.exit(1);
}

try {
  run('git rev-parse --is-inside-work-tree');
} catch {
  fail('Not inside a Git repository.');
}

try {
  run(`git rev-parse --verify ${targetRef}`);
} catch {
  fail(`Target ref '${targetRef}' was not found.`);
}

if (mode === 'preview') {
  const current = run('git rev-parse --abbrev-ref HEAD').trim();
  const currentSha = run('git rev-parse --short HEAD').trim();
  const targetSha = run(`git rev-parse --short ${targetRef}`).trim();
  let dirty = false;
  try {
    const status = run('git status --porcelain').trim();
    dirty = status.length > 0;
  } catch {}

  console.log(`[rollback] Current branch: ${current} (${currentSha})`);
  console.log(`[rollback] Target ref:    ${targetRef} (${targetSha})`);
  console.log(`[rollback] Working tree dirty: ${dirty ? 'yes' : 'no'}`);
  console.log('[rollback] Run: npm run rollback:security');
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

let hasChanges = false;
try {
  hasChanges = run('git status --porcelain').trim().length > 0;
} catch {}

if (hasChanges) {
  const stashMessage = `pre-rollback-${timestamp}`;
  runPassthrough(`git stash push -u -m "${stashMessage}"`);
  console.log(`[rollback] Saved current work to stash: ${stashMessage}`);
}

runPassthrough(`git reset --hard ${targetRef}`);
runPassthrough('git clean -fd');

console.log(`[rollback] Done. Repository reset to ${targetRef}.`);