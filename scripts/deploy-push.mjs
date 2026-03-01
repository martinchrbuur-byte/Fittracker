import { execFileSync } from 'node:child_process';
import { resolveGitBinary } from './git-utils.mjs';

function runGit(gitBinary, args) {
  execFileSync(gitBinary, args, {
    stdio: 'inherit',
  });
}

function checkGitAvailable() {
  const gitBinary = resolveGitBinary();
  if (!gitBinary) {
    console.error('Deploy push failed: git is not available. Install Git or set GIT_BIN to your git executable.');
    process.exit(1);
  }

  return gitBinary;
}

try {
  const gitBinary = checkGitAvailable();
  runGit(gitBinary, ['push', 'origin', 'main']);
  console.log('Deploy push complete. GitHub Actions will publish the .site artifact to Pages.');
} catch (error) {
  console.error('Deploy push failed.');
  process.exit(error.status || 1);
}
