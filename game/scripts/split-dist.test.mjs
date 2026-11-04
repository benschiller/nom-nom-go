import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

function files(root, prefix = '') {
  return readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? files(root, relative) : [relative];
  });
}

function assertComplete(root) {
  const built = files(path.join(root, 'dist'));
  const packaged = ['dist-assets', 'dist-root'].flatMap((dir) => files(path.join(root, dir)));
  assert.deepEqual(packaged.sort(), built.sort(), 'Every built file must ship exactly once');
  for (const file of built) {
    const destination = file.startsWith('assets/') ? 'dist-assets' : 'dist-root';
    assert.deepEqual(
      readFileSync(path.join(root, destination, file)),
      readFileSync(path.join(root, 'dist', file)),
      `Packaged bytes and cache group must match: ${file}`,
    );
  }
}

test('split preserves all files, including new public directories, and removes stale output', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'nom-nom-package-'));
  try {
    for (const file of ['index.html', 'assets/app-hash.js', 'art/chef.webp', 'fonts/font.woff2',
      'audio/clips/voice.m4a', 'pwa-192x192.png', 'sw.js', 'workbox-hash.js', 'future/data.bin']) {
      mkdirSync(path.dirname(path.join(root, 'dist', file)), { recursive: true });
      writeFileSync(path.join(root, 'dist', file), `fixture:${file}`);
    }
    const script = fileURLToPath(new URL('./split-dist.mjs', import.meta.url));
    execFileSync(process.execPath, [script], { cwd: root });
    assertComplete(root);
    writeFileSync(path.join(root, 'dist-root', 'stale.txt'), 'old');
    writeFileSync(path.join(root, 'dist-assets', 'stale.js'), 'old');
    execFileSync(process.execPath, [script], { cwd: root });
    assertComplete(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('actual production build is completely packaged with unchanged contents', () => {
  assertComplete(fileURLToPath(new URL('../', import.meta.url)));
});
