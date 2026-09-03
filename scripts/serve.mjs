// Static host for the built rig (Heroku or any Node host): serves dist/ from the root, the AASA
// file with the JSON type iOS requires, and treats /creator-rig/* as the app (Universal Link paths).
//   PORT=8080 node scripts/serve.mjs
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const ROOT = join(process.cwd(), 'dist');
const PORT = Number(process.env['PORT'] ?? 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.ktx': 'application/octet-stream', '.atlas': 'text/plain; charset=utf-8', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  // Universal Link paths open the app itself.
  if (path === '/creator-rig' || path.startsWith('/creator-rig/')) path = '/';
  if (path.endsWith('/')) path += 'index.html';
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  const isAasa = path.endsWith('/.well-known/apple-app-site-association');
  const type = isAasa ? 'application/json' : TYPES[extname(file)] ?? 'application/octet-stream';
  const immutable = path.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': statSync(file).size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`rig static host on :${PORT}, serving ${ROOT}`));
