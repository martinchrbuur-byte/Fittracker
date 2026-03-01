import { execFileSync } from 'node:child_process';

function canRunGit(binary) {
  try {
    execFileSync(binary, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function resolveGitBinary() {
  const explicitBinary = process.env.GIT_BIN;
  if (explicitBinary && canRunGit(explicitBinary)) {
    return explicitBinary;
  }

  if (canRunGit('git')) {
    return 'git';
  }

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\bin\\git.exe',
    ];

    for (const candidate of candidates) {
      if (canRunGit(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}