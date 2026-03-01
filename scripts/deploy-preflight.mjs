import { execFileSync } from 'node:child_process';
import { resolveGitBinary } from './git-utils.mjs';

function runGit(gitBinary, args) {
  return execFileSync(gitBinary, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function fail(message) {
  console.error(`Preflight failed: ${message}`);
  process.exit(1);
}

function checkGitAvailable() {
  const gitBinary = resolveGitBinary();
  if (!gitBinary) {
    fail('git is not available. Install Git or set GIT_BIN to your git executable (for example C:\\Program Files\\Git\\cmd\\git.exe), then restart your terminal.');
  }

  return gitBinary;
}

function checkCleanWorkingTree(gitBinary) {
  const status = runGit(gitBinary, ['status', '--porcelain']);
  if (status) {
    fail('working tree is not clean. Commit or stash changes before deploy.');
  }
}

function checkCurrentBranch(gitBinary) {
  const branch = runGit(gitBinary, ['branch', '--show-current']);
  if (branch !== 'main') {
    fail(`current branch is "${branch}". Deploys are only allowed from main.`);
  }
}

function checkRemote(gitBinary) {
  const remotes = runGit(gitBinary, ['remote']);
  if (!remotes.split(/\r?\n/).includes('origin')) {
    fail('git remote "origin" is missing.');
  }
}

function checkUpstreamState(gitBinary) {
  runGit(gitBinary, ['fetch', 'origin', 'main', '--quiet']);
  const aheadBehind = runGit(gitBinary, ['rev-list', '--left-right', '--count', 'origin/main...HEAD']);
  const [behind, ahead] = aheadBehind.split(/\s+/).map((value) => Number(value || '0'));

  if (behind > 0) {
    fail('local main is behind origin/main. Pull/rebase before deploy.');
  }

  if (ahead === 0) {
    console.log('No new commits to deploy (HEAD matches origin/main).');
  }
}

function main() {
  const gitBinary = checkGitAvailable();
  checkCleanWorkingTree(gitBinary);
  checkCurrentBranch(gitBinary);
  checkRemote(gitBinary);
  checkUpstreamState(gitBinary);
  console.log('Preflight checks passed.');
}

try {
  main();
} catch (error) {
  fail(error.message || String(error));
}
