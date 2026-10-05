// Static file server for the playtest build on Heroku: serves ./dist (Vite output) with no
// dependencies. Every path without a file falls back to index.html (the app routes by query
// string, so there are no deep paths to rewrite). Hashed assets get a long cache; index.html none.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('dist');
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.atlas': 'text/plain; charset=utf-8',
  '.skel': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function fileFor(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(ROOT, clean);
  if (!candidate.startsWith(ROOT)) return null;
  try {
    const st = statSync(candidate);
    if (st.isFile()) return candidate;
    if (st.isDirectory()) {
      const index = join(candidate, 'index.html');
      if (statSync(index).isFile()) return index;
    }
  } catch {
    // fall through to the SPA fallback
  }
  return null;
}

createServer((req, res) => {
  const path = fileFor(req.url ?? '/') ?? join(ROOT, 'index.html');
  const ext = extname(path).toLowerCase();
  const isIndex = path.endsWith('index.html');
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', isIndex ? 'no-cache' : 'public, max-age=31536000, immutable');
  createReadStream(path)
    .on('error', () => {
      res.statusCode = 404;
      res.end('Not found');
    })
    .pipe(res);
}).listen(PORT, () => {
  console.log(`Bruno's Theme Park playtest build on http://localhost:${PORT}/`);
});
