// Dev-server-only guard: keeps the checkout on an up-to-date `main` and puts a
// red banner over the game whenever what you're looking at is NOT main
// (wrong branch, or GitHub has merges that couldn't be pulled automatically).
import { execFile } from 'node:child_process';
import path from 'node:path';
import type { Plugin } from 'vite';

const SYNC_SCRIPT = path.resolve(import.meta.dirname, '../../tools/git/sync.mjs');
const INTERVAL_MS = 60_000;

type Status = { branch?: string; synced?: number; problems: string[] };

export function devGitGuard(): Plugin {
  let status: Status = { problems: [] };
  let timer: ReturnType<typeof setInterval> | undefined;

  const check = () =>
    execFile('node', [SYNC_SCRIPT], { timeout: 30_000 }, (err, stdout) => {
      if (err) return;
      try {
        status = JSON.parse(stdout) as Status;
      } catch {
        return;
      }
      if (status.synced)
        console.log(`\n  [git-guard] pulled ${status.synced} merged commit(s) from GitHub into main\n`);
      for (const p of status.problems) console.warn(`\n  [git-guard] ${p}\n`);
    });

  return {
    name: 'dev-git-guard',
    apply: 'serve',
    configureServer(server) {
      check();
      timer = setInterval(check, INTERVAL_MS);
      server.httpServer?.once('close', () => clearInterval(timer));
      server.middlewares.use('/__git-guard', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(status));
      });
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          injectTo: 'body',
          children: `(() => {
  const show = (s) => {
    let el = document.getElementById('__git-guard');
    if (!s.problems || !s.problems.length) { el && el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = '__git-guard';
      el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#c62828;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:8px 12px;white-space:pre-wrap;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = 'DEV: not showing current main. ' + s.problems.join(' ');
  };
  const poll = () => fetch('/__git-guard').then((r) => r.json()).then(show).catch(() => {});
  poll();
  setInterval(poll, 15000);
})();`,
        },
      ];
    },
  };
}
