import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
rmSync('dist-assets', { recursive: true, force: true });
rmSync('dist-root', { recursive: true, force: true });
mkdirSync('dist-assets', { recursive: true });
mkdirSync('dist-root', { recursive: true });
for (const name of readdirSync('dist')) {
  // Vite's assets directory uses content hashes and can be cached immutably.
  // Everything else must ship too, including public art, fonts, icons and the
  // service worker's root-level Workbox helper. Revalidate stable filenames.
  const destination = name === 'assets' ? 'dist-assets' : 'dist-root';
  cpSync(`dist/${name}`, `${destination}/${name}`, { recursive: true });
}
console.log('split dist -> dist-assets/, dist-root/');
