#!/usr/bin/env node
// Claude Code hooks that keep the main checkout on an up-to-date `main`.
//   session-start : fetch + fast-forward main, report problems into context
//   pre-bash      : block branch switching in the main checkout (use a worktree)
//   post-bash     : after `gh pr merge`, fast-forward local main
import { readFileSync } from 'node:fs';
import { isMainWorktree, syncMain } from '../../tools/git/sync.mjs';

const mode = process.argv[2];
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  /* no stdin */
}
const command = input?.tool_input?.command ?? '';
const cwd = input?.cwd || process.cwd();

function report(r) {
  const lines = [];
  if (r.synced) lines.push(`git-guard: fast-forwarded local main by ${r.synced} commit(s) from GitHub.`);
  for (const p of r.problems) lines.push(`git-guard WARNING: ${p}`);
  return lines.join('\n');
}

if (mode === 'session-start') {
  try {
    const out = report(syncMain());
    if (out) console.log(out);
  } catch (e) {
    console.log(`git-guard: could not check main (${e.message})`);
  }
  process.exit(0);
}

if (mode === 'pre-bash') {
  // Match `git checkout` / `git switch` anywhere in the command (after &&, ;, |, etc.),
  // including `git -C <dir> ...`.
  const re = /(?:^|[;&|(]\s*|\s)git\s+(?:-C\s+(\S+)\s+)?(checkout|switch)\b([^;&|]*)/g;
  for (const m of command.matchAll(re)) {
    const [, dashC, verb, rest] = m;
    // Restoring files (`git checkout -- path`, `git checkout HEAD -- path`) is not a branch switch.
    if (verb === 'checkout' && /\s--(\s|$)/.test(rest)) continue;
    const target = dashC ? (dashC.startsWith('/') ? dashC : `${cwd}/${dashC}`) : cwd;
    if (!isMainWorktree(target)) continue; // fine inside a linked worktree
    console.error(
      'Blocked by git-guard: never switch branches in the main checkout. The dev server runs ' +
        'from it, so switching makes the game look reverted. For branch work, use a worktree:\n' +
        '  git worktree add ../meta-hackathon-<name> -b <branch>\n' +
        'Then work and commit there, push, and merge via PR. See AGENTS.md "Git workflow".',
    );
    process.exit(2);
  }
  process.exit(0);
}

if (mode === 'post-bash') {
  if (/\bgh\s+pr\s+merge\b/.test(command)) {
    try {
      const out = report(syncMain());
      if (out) console.error(out);
    } catch (e) {
      console.error(`git-guard: could not sync main after merge (${e.message})`);
    }
    process.exit(2); // exit 2 on PostToolUse feeds stderr back to Claude
  }
  process.exit(0);
}
