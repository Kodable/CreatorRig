// Load measurement under a throttle profile, with a fresh browser context per target.
//   node scripts/load-time.mjs [--url https://kodable.github.io/CreatorRig/] [--profile slow4g|none]
// Cold visit: ?sw=0 keeps the service worker out, so every byte crosses the page's throttled
// network and is counted (the worker claims the page mid-load and fetches later chunks itself,
// unthrottled and uncounted). Then a warm visit in the same context with the worker installed.
// Reports bytes, requests and time to the scenario's first frame (performance mark
// "rig:first-frame"); writes results/load-<label>-<profile>.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : [])).filter((e) => e.length));
const BASE = args.url ?? 'https://kodable.github.io/CreatorRig/';
const PROFILE = args.profile ?? 'slow4g';

// Chrome DevTools "Slow 4G" preset values.
const PROFILES = {
  slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  none: null,
};

const TARGETS = [
  { label: 'index', q: '' },
  { label: 'baseline-200', q: 'scenario=baseline&count=200' },
  { label: 'bodies-box2d', q: 'scenario=bodies&adapter=box2d&count=200' },
  { label: 'bodies-rapier', q: 'scenario=bodies&adapter=rapier&count=200' },
  { label: 'sprites-500', q: 'scenario=sprites&count=500' },
  { label: 'spine-10', q: 'scenario=spine&count=10' },
  { label: 'overlay-robot', q: 'scenario=overlay&count=60&robot=1' },
];

mkdirSync('results', { recursive: true });
const browser = await chromium.launch();
const rows = [];
for (const t of TARGETS) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const profile = PROFILES[PROFILE];
  if (profile) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile });

  const sizes = new Map();
  const urls = new Map();
  cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));

  const visit = async (url) => {
    sizes.clear();
    await page.goto(url, { waitUntil: 'commit' });
    const ms = t.q
      ? await page
          .waitForFunction(() => performance.getEntriesByName('rig:first-frame').length > 0, null, { timeout: 180_000 })
          .then(() => page.evaluate(() => Math.round(performance.getEntriesByName('rig:first-frame')[0].startTime)))
      : await page.waitForFunction(() => document.querySelector('.scenario') !== null, null, { timeout: 180_000 }).then(() => page.evaluate(() => Math.round(performance.now())));
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined);
    return { ms, sw };
  };
  const qs = `${t.q}${t.q ? '&' : ''}duration=1&warmup=0&device=load-test`;
  const started = Date.now();
  const cold = await visit(`${BASE}?${qs}&sw=0`);
  const firstFrameMs = cold.ms;
  const coldSizes = new Map(sizes);
  // Warm: install the worker on one visit, then measure the next, which the worker serves.
  await visit(`${BASE}?${qs}`);
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => r?.active !== undefined && r?.active !== null), null, { timeout: 60_000 }).catch(() => undefined);
  const warm = await visit(`${BASE}?${qs}`);
  sizes.clear();
  for (const [k, v] of coldSizes) sizes.set(k, v);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? { responseStart: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd) } : null;
  });
  let bytes = 0;
  const biggest = [];
  for (const [id, size] of sizes) {
    bytes += size;
    biggest.push({ url: (urls.get(id) ?? '').replace(BASE, ''), kb: Math.round(size / 1024) });
  }
  biggest.sort((a, b) => b.kb - a.kb);
  const row = { label: t.label, profile: PROFILE, base: BASE, url: `${BASE}?${qs}`, firstFrameMs, warmFirstFrameMs: warm.ms, warmServedByWorker: warm.sw, responseStartMs: nav?.responseStart ?? null, domContentLoadedMs: nav?.domContentLoaded ?? null, requests: sizes.size, transferredKB: Math.round(bytes / 1024), biggest: biggest.slice(0, 4), wallMs: Date.now() - started };
  rows.push(row);
  writeFileSync(`results/load-${t.label}-${PROFILE}.json`, JSON.stringify(row, null, 2));
  console.error(`${t.label}: cold ${row.firstFrameMs} ms to first frame, ${row.transferredKB} KB over ${row.requests} requests; warm ${row.warmFirstFrameMs} ms${warm.sw ? ' via service worker' : ''}`);
  await context.close();
}
await browser.close();

const p = PROFILES[PROFILE];
console.log(`\nProfile ${PROFILE}${p ? ` (${Math.round((p.downloadThroughput * 8) / 1024)} kbps down, ${Math.round((p.uploadThroughput * 8) / 1024)} kbps up, ${p.latency} ms RTT)` : ' (no throttle)'}, cache disabled, base ${BASE}\n`);
console.log('| target | cold first frame | transferred | requests | warm first frame (worker) | biggest files |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.label} | ${(r.firstFrameMs / 1000).toFixed(2)} s | ${r.transferredKB} KB | ${r.requests} | ${(r.warmFirstFrameMs / 1000).toFixed(2)} s${r.warmServedByWorker ? '' : ' (no worker)'} | ${r.biggest.filter((b) => !b.url.startsWith('data:') && !b.url.startsWith('?')).slice(0, 3).map((b) => `${b.url} ${b.kb} KB`).join('<br>')} |`);
