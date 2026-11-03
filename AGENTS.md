# AGENTS.md

## Git workflow (mandatory)

The dev server (`npm run dev` in `game/`) runs from this checkout, so **this
checkout must always be on an up-to-date `main`**. If it isn't, the game looks
"reverted" (missing art, old gameplay) even though nothing was lost.

1. **Never switch branches in this checkout.** No `git checkout <branch>`,
   `git switch`, or `git checkout -b` here. Do branch work in a worktree:
   ```
   git worktree add ../meta-hackathon-<name> -b <branch>
   ```
   Commit and push there, then merge via a PR.
2. **After any merge on GitHub, pull main here** (`git pull --ff-only`). A
   GitHub merge does not change local files on its own.
3. **Before telling the user to look at the game, confirm** that
   `git rev-parse --abbrev-ref HEAD` prints `main` and that
   `git status -sb` shows no `behind`.
4. Never leave this checkout on a feature branch at the end of a session.

### Enforcement

- `tools/git/sync.mjs`: fetches and fast-forwards `main`. It only runs
  `merge --ff-only`, only on `main`, and only with a clean tree, so it never
  discards anything.
- `game/scripts/devGitGuard.ts`: the dev server runs that sync every minute and
  puts a red banner over the game if the checkout isn't current `main`.
- `.claude/settings.json` hooks (Claude Code): sync at session start, sync after
  `gh pr merge`, and block branch switching in this checkout.
