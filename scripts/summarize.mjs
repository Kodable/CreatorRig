// Prints a Markdown table from results/*.json, ready to paste into the Notion results page.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'results');
let files = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'playwright.json');
} catch {
  console.error('no results/ folder yet; run npm run bench or paste device reports into results/');
  process.exit(1);
}

const rows = files
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .sort((a, b) => a.scenario.localeCompare(b.scenario) || a.device.localeCompare(b.device));

const header = ['scenario', 'params', 'adapter', 'device', 'fps', 'p50 ms', 'p95 ms', 'dropped', 'heap MB', 'pass', 'extra'];
console.log(`| ${header.join(' | ')} |`);
console.log(`| ${header.map(() => '---').join(' | ')} |`);
for (const r of rows) {
  const params = Object.entries(r.params)
    .filter(([k]) => !['duration', 'warmup', 'seed'].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const extra = Object.entries(r.extra ?? {})
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  const pass = r.pass === null ? 'n/a' : r.pass ? 'pass' : 'FAIL';
  console.log(
    `| ${r.scenario} | ${params} | ${r.adapter} | ${r.device} | ${r.fps} | ${r.p50} | ${r.p95} | ${r.dropped}/${r.frames} | ${r.heapMB ?? '-'} | ${pass} | ${extra} |`,
  );
}
