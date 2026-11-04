import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
rmSync('dist-assets', { recursive: true, force: true });
rmSync('dist-root', { recursive: true, force: true });
mkdirSync('dist-assets', { recursive: true });
mkdirSync('dist-root', { recursive: true });
if (existsSync('dist/assets')) cpSync('dist/assets', 'dist-assets/assets', { recursive: true });
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'workbox-']) {
  // handled below for files; workbox chunk stays in assets if hashed
  void f;
}
import { readdirSync } from 'node:fs';
for (const name of readdirSync('dist')) {
  if (name === 'assets') continue;
  const src = `dist/${name}`;
  // The manifest and named voice files can change between releases, so ship
  // them with the root deployment's no-cache policy rather than immutable assets.
  if (['index.html', 'sw.js', 'manifest.webmanifest', 'audio'].includes(name)) {
    cpSync(src, `dist-root/${name}`, { recursive: true });
  }
}
console.log('split dist -> dist-assets/, dist-root/');
