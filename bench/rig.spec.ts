import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { benchRuns } from '../src/scenarios/matrix';
import type { Report } from '../src/report';

/**
 * Opens every run in the matrix, waits for the report, and writes results/<key>-<browser>.json.
 * Headless numbers are not device numbers. They catch regressions and check the harness.
 * Device runs are done by hand from the index page with a real device tag.
 */
const DURATION = Number(process.env.RIG_DURATION ?? '5');
const WARMUP = Number(process.env.RIG_WARMUP ?? '2');
const RESULTS_DIR = join(process.cwd(), 'results');

mkdirSync(RESULTS_DIR, { recursive: true });

for (const run of benchRuns()) {
  test(run.key, async ({ page, browserName }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(run.params)) q.set(k, String(v));
    // A variant may need a fixed run length (determinism steps 6,000 times); RIG_DURATION covers the rest.
    q.set('duration', String(run.params['duration'] ?? DURATION));
    q.set('warmup', String(WARMUP));
    q.set('device', `playwright-${browserName}`);

    const logs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.startsWith('RIG_')) logs.push(text);
    });

    await page.goto(`/?${q.toString()}`);
    await page.waitForFunction(() => window.__rig?.done === true, null, {
      timeout: (DURATION + WARMUP + 30) * 1000,
    });
    const rig = await page.evaluate(() => window.__rig);
    expect(rig?.error, rig?.error ?? '').toBeUndefined();
    const report = rig?.report as Report;
    expect(report.frames).toBeGreaterThan(0);

    const file = join(RESULTS_DIR, `${run.key}-${browserName}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    test.info().annotations.push({ type: 'report', description: `${report.fps} fps, p95 ${report.p95} ms, pass=${report.pass}` });
  });
}
