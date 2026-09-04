// Renders results/*.json as Notion enhanced-markdown tables for the CW-01 results page.
//   node scripts/results-notion.mjs > /tmp/results.md
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'results');
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'playwright.json');
const all = files.map((f) => ({ f, r: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
const rows = all.filter((x) => x.r.rig === 'kodable-creator-rig').map((x) => x.r);
const loads = all.filter((x) => x.f.startsWith('load-')).map((x) => x.r);

const DEVICE_ORDER = ['chromebook', 'ipad', 'iphone', 'capacitor-ipad', 'capacitor-sim', 'mac-chrome', 'mac-safari', 'playwright-chromium', 'playwright-webkit'];
const dev = (d) => d.replace(/-guess$/, '');
const devRank = (d) => {
  const i = DEVICE_ORDER.indexOf(dev(d));
  return i < 0 ? 99 : i;
};
const variant = (r) =>
  Object.entries(r.params)
    .filter(([k]) => !['duration', 'warmup', 'seed', 'send', 'device'].includes(k))
    .map(([k, v]) => (k === 'count' ? String(v) : `${k}=${v}`))
    .join(' ');
const origin = (r) => (r.origin ?? '').replace('capacitor://localhost', 'shell, bundled').replace(/^http:\/\/[\d.]+:5173$/, 'shell, dev server').replace(/^http:\/\/localhost:5173$/, 'simulator, dev server').replace(/^https?:\/\//, '') || '';
const pass = (r) => (r.pass === null ? 'n/a' : r.pass ? 'pass' : 'FAIL');
const cell = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));
const table = (header, body) => `<table fit-page-width="true" header-row="true">\n<tr>\n${header.map((h) => `<td>${h}</td>`).join('\n')}\n</tr>\n${body.map((cells) => `<tr>\n${cells.map((c) => `<td>${cell(c)}</td>`).join('\n')}\n</tr>`).join('\n')}\n</table>`;

const SCENARIO_ORDER = ['baseline', 'bodies', 'stack', 'joints', 'ccd', 'catapult', 'determinism', 'particles', 'sprites', 'spine', 'textures', 'overlay', 'soak', 'fonts', 'audio', 'pwa', 'purchase', 'textinput', 'jettison', 'physics-smoke'];
const byScenario = new Map();
for (const r of rows) (byScenario.get(r.scenario) ?? byScenario.set(r.scenario, []).get(r.scenario)).push(r);

const out = [];
out.push('One row per run. Device tags ending in "guess" came from the browser\'s user agent; "shell" rows ran inside the Capacitor app on the iPad. Headless rows (playwright) are harness checks, not device numbers. p50 and p95 are frame intervals in ms; dropped counts frames over 33.4 ms.');
// Headless rows are harness checks; keep them only for variants no device ran.
if (!process.env['ALL_ROWS']) {
  for (const [scenario, list] of byScenario) {
    const deviceKeys = new Set(list.filter((r) => !r.device.startsWith('playwright-')).map((r) => `${variant(r)}|${r.adapter}`));
    byScenario.set(scenario, list.filter((r) => !r.device.startsWith('playwright-') || !deviceKeys.has(`${variant(r)}|${r.adapter}`)));
  }
}
out[0] = out[0].replace('Headless rows (playwright) are harness checks, not device numbers.', 'Headless rows (playwright, Mac Chromium and WebKit) appear only for variants no device ran; they are harness checks, not device numbers. ALL_ROWS=1 npm run results:notion prints every row.');
for (const scenario of [...byScenario.keys()].sort((a, b) => (SCENARIO_ORDER.indexOf(a) + 100) % 200 - (SCENARIO_ORDER.indexOf(b) + 100) % 200)) {
  const list = byScenario.get(scenario).sort((a, b) => variant(a).localeCompare(variant(b), undefined, { numeric: true }) || a.adapter.localeCompare(b.adapter) || devRank(a.device) - devRank(b.device));
  out.push(`## ${scenario}`);
  const body = list.map((r) => {
    const e = r.extra ?? {};
    const key = [];
    if (e.hash) key.push(`hash ${e.hash}`);
    if (e.stable !== undefined && e.stable !== null) key.push(`stable ${e.stable}`);
    if (e.particlesAliveMax !== undefined) key.push(`alive ${e.particlesAliveMax}`);
    if (e.drawCallsP50 !== undefined) key.push(`draws ${e.drawCallsP50}`);
    if (e.dragFrames) key.push(`drag p95 ${e.dragFrames.p95} ms, latency p95 ${e.latencyMs?.p95} ms, drift p95 ${e.driftPx?.p95} px`);
    if (e.heapPeakMB !== undefined && e.heapPeakMB !== null) key.push(`heap peak ${e.heapPeakMB} MB`);
    if (e.tunnels !== undefined) key.push(`tunnels ${e.tunnels}`);
    if (e.drift !== undefined && typeof e.drift === 'number') key.push(`drift ${e.drift}`);
    if (e.maxWheelGap !== undefined) key.push(`wheel gap ${e.maxWheelGap} m`);
    if (e.compressedBytesTotal) key.push(`ktx ${(e.compressedBytesTotal / 1048576).toFixed(1)} MB vs raw ${(e.rawBytesTotal / 1048576).toFixed(1)} MB`);
    if (e.killedAtMB) key.push(`killed at ${e.killedAtMB} MB, recovered`);
    if (e.transactionId) key.push(`tx ${e.transactionId}, ${e.subscriptionState}`);
    if (e.keyboardHeight) key.push(`keyboard ${e.keyboardHeight} px, canvas resized ${e.canvasResized}`);
    if (e.firstTapPlayed !== undefined) key.push(`first tap ${e.firstTapPlayed}, after resume ${e.playedAfterResume}, frozen after interruption ${e.frozenClockDetected ?? 0}`);
    if (e.fallbackBaked !== undefined) key.push(`fallback baked ${e.fallbackBaked}`);
    if (e.standalone !== undefined) key.push(`standalone ${e.standalone}, worker ${e.swState}`);
    if (e.recovered === false && e.allocatedMB) key.push(`allocated ${e.allocatedMB} MB, no kill`);
    return [variant(r) || '-', r.adapter === 'none' ? '-' : r.adapter, dev(r.device), origin(r), r.p50, r.p95, `${r.dropped}/${r.frames}`, r.heapMB ?? '-', key.join('; '), pass(r)];
  });
  out.push(table(['variant', 'adapter', 'device', 'origin', 'p50 ms', 'p95 ms', 'dropped', 'heap MB', 'key numbers', 'pass'], body));
}

if (loads.length > 0) {
  out.push('## Cold load (deployed site, fresh browser, cache disabled)');
  const l = loads.sort((a, b) => a.profile.localeCompare(b.profile) || a.label.localeCompare(b.label));
  out.push(table(['target', 'profile', 'cold first frame', 'transferred', 'requests', 'warm via service worker', 'largest file'], l.map((r) => [r.label, r.profile, `${(r.firstFrameMs / 1000).toFixed(2)} s`, `${r.transferredKB} KB`, r.requests, r.warmFirstFrameMs ? `${(r.warmFirstFrameMs / 1000).toFixed(2)} s` : '-', (r.biggest ?? []).filter((b) => !b.url.startsWith('data:') && !b.url.startsWith('?'))[0]?.url ?? '-'])));
}
console.log(out.join('\n'));
