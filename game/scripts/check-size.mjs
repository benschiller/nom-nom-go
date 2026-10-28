import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const html = readFileSync('dist/index.html', 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
let total = 0;
for (const f of files) { if (existsSync(`dist/${f}`)) total += gzipSync(readFileSync(`dist/${f}`)).length; }
console.log(`Initial JS/CSS: ${(total / 1024).toFixed(1)} KB gzipped (${files.join(', ')})`);
if (total > 250 * 1024) { console.error('Over 250 KB budget'); process.exit(1); }
