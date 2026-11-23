import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const assets = [
  'index.html', 'asset-guide-lessons.js', 'equity-news.js',
  'equity-research.css', '_routes.json',
];
await Promise.all(assets.map(name => copyFile(join(root, name), join(dist, name))));
console.log(`Prepared ${assets.length} Cloudflare Pages assets in dist/.`);
