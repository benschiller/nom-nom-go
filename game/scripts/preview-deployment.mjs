import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { preview } from 'vite';

// Serve exactly the two upload packages, never the original dist directory.
const directory = mkdtempSync(path.join(tmpdir(), 'nom-nom-preview-'));
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
cpSync('dist-assets', directory, { recursive: true });
cpSync('dist-root', directory, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: directory },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true },
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.httpServer.close(() => process.exit(0)));
}
server.printUrls();
