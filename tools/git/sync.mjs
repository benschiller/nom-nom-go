// Keeps the main checkout (the one the dev server runs from) on `main` and
// level with GitHub. Shared by the Vite dev server and the agent hooks.
//
// Safety: the only write this ever does is `git merge --ff-only origin/main`,
// and only when the checkout is on main with a clean working tree. It never
// discards or rewrites anything; anything unusual is reported, not "fixed".
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function git(args, { cwd = REPO_ROOT, timeout = 15000 } = {}) {
  return execFileSync('git', args, {
    cwd,
    timeout,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** True when `cwd` is the primary checkout, not a linked `git worktree`. */
export function isMainWorktree(cwd = REPO_ROOT) {
  try {
    const gitDir = path.resolve(cwd, git(['rev-parse', '--git-dir'], { cwd }));
    const common = path.resolve(cwd, git(['rev-parse', '--git-common-dir'], { cwd }));
    return gitDir === common;
  } catch {
    return false;
  }
}

/**
 * Fetch origin, fast-forward main if it's safe, and describe anything wrong.
 * Returns { branch, behind, ahead, dirty, synced, problems: string[] }.
 */
export function syncMain({ fetch = true } = {}) {
  const problems = [];
  let fetched = false;
  if (fetch) {
    try {
      git(['fetch', '--quiet', 'origin', 'main']);
      fetched = true;
    } catch {
      /* offline: still check local branch state below */
    }
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  let behind = 0;
  let ahead = 0;
  try {
    const [b, a] = git(['rev-list', '--left-right', '--count', 'origin/main...HEAD']).split(/\s+/);
    behind = Number(b);
    ahead = Number(a);
  } catch {
    /* no origin/main yet */
  }

  let synced = 0;
  if (branch !== 'main') {
    problems.push(
      `This checkout is on branch "${branch}", not main, so you are NOT seeing main. ` +
        'Run: git switch main',
    );
  } else if (behind > 0 && ahead === 0 && !dirty) {
    git(['merge', '--ff-only', '--quiet', 'origin/main']);
    synced = behind;
    behind = 0;
  } else if (behind > 0) {
    problems.push(
      `main is ${behind} commit(s) behind GitHub and could not be updated automatically ` +
        `(${dirty ? 'uncommitted changes' : `${ahead} local commit(s) not on GitHub`}). Run: git pull`,
    );
  }

  return { branch, behind, ahead, dirty, synced, fetched, problems };
}

// CLI: `node tools/git/sync.mjs` prints the result as JSON (used by the dev
// server so a slow fetch never blocks it).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(syncMain()));
  } catch (e) {
    console.log(JSON.stringify({ problems: [`git check failed: ${e.message}`] }));
  }
}
