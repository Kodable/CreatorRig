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

// Hash agreement: for every run that reports a hash, list the hash per device and say whether
// the devices agree. This is the CW-01.4 device matrix.
const groups = new Map();
for (const r of rows) {
  const hash = r.extra?.hash;
  if (typeof hash !== 'string' || hash === '') continue;
  const params = Object.entries(r.params)
    .filter(([k]) => !['duration', 'warmup'].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const key = `${r.scenario} | ${params} | ${r.adapter}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ device: r.device, hash, step: r.extra.hashStep, stable: r.extra.stable });
}
if (groups.size > 0) {
  console.log('');
  console.log('| scenario | params | adapter | step | devices → hash | agree |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const [key, runs] of [...groups.entries()].sort()) {
    const hashes = new Set(runs.map((x) => x.hash));
    const cells = runs
      .sort((a, b) => a.device.localeCompare(b.device))
      .map((x) => `${x.device}: ${x.hash}${x.stable === false ? ' (unstable)' : ''}`)
      .join('<br>');
    const agree = runs.length < 2 ? 'n/a (1 device)' : hashes.size === 1 ? 'yes' : `NO (${hashes.size} hashes)`;
    console.log(`| ${key} | ${runs[0].step ?? '-'} | ${cells} | ${agree} |`);
  }
}

// Particle budget: per device, the largest single-emitter count that held 30 fps (p95 under 33.4 ms)
// with the emitters at their target. Divided by 4 it is the proposed per-effect cap (CW-01.5).
const budget = new Map();
for (const r of rows) {
  if (r.scenario !== 'particles' || Number(r.extra?.emitters ?? 1) !== 1) continue;
  const count = Number(r.params.count);
  const held = r.p95 <= 33.4 && Number(r.extra?.particlesAliveMax ?? 0) >= count * 0.9;
  const entry = budget.get(r.device) ?? { held: 0, failed: Infinity };
  if (held) entry.held = Math.max(entry.held, count);
  else entry.failed = Math.min(entry.failed, count);
  budget.set(r.device, entry);
}
if (budget.size > 0) {
  console.log('');
  console.log('| device | largest particle count at 30 fps | first count that failed | per-effect cap (÷4) |');
  console.log('| --- | --- | --- | --- |');
  for (const [device, e] of [...budget.entries()].sort()) {
    console.log(`| ${device} | ${e.held || '-'} | ${Number.isFinite(e.failed) ? e.failed : '-'} | ${e.held ? Math.floor(e.held / 4) : '-'} |`);
  }
}
