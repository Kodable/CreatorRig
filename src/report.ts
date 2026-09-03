import type { RigParams } from './params';

export const RIG_VERSION = '0.1.0';

/** One JSON object per run. Every scenario on every device produces exactly this shape. */
export interface Report {
  rig: 'kodable-creator-rig';
  version: string;
  scenario: string;
  adapter: string;
  device: string;
  ua: string;
  viewport: { width: number; height: number; dpr: number };
  params: Record<string, string | number>;
  startedAt: string;
  /** Measured window only, warm-up excluded. */
  durationMs: number;
  frames: number;
  fps: number;
  /** Frame-to-frame intervals in ms. */
  p50: number;
  p95: number;
  max: number;
  /** Frames longer than 33.4 ms (missed a 30 fps deadline). */
  dropped: number;
  /** Frames longer than 16.8 ms (missed a 60 fps deadline). */
  slow: number;
  /** JS heap in MB where the browser exposes it (Chromium only), else null. */
  heapMB: number | null;
  /** true = target met, false = target missed, null = scenario has no automatic pass rule. */
  pass: boolean | null;
  notes: string[];
  /** Scenario-specific numbers: hashes, counts at 30 fps, latencies. */
  extra: Record<string, unknown>;
}

/** Longest the measured window may extend past `duration` while a scenario is busy. */
export const MAX_EXTEND_MS = 120_000;

/**
 * Whether the measured window ends now. It ends at `endAt`, unless the scenario is busy, in which
 * case it ends when the scenario is done or at `capAt`, whichever comes first.
 */
export function windowEnds(now: number, endAt: number, capAt: number, busy: boolean): boolean {
  if (now < endAt) return false;
  return !busy || now >= capAt;
}

export interface FrameStats {
  durationMs: number;
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  max: number;
  dropped: number;
  slow: number;
}

/** Nearest-rank percentile over an ascending-sorted array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}

export function summarize(intervalsMs: readonly number[]): FrameStats {
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const durationMs = intervalsMs.reduce((a, b) => a + b, 0);
  const frames = intervalsMs.length;
  return {
    durationMs,
    frames,
    fps: durationMs > 0 ? (frames * 1000) / durationMs : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    dropped: intervalsMs.filter((ms) => ms > 33.4).length,
    slow: intervalsMs.filter((ms) => ms > 16.8).length,
  };
}

/**
 * Collects frame intervals from requestAnimationFrame, independent of the renderer,
 * so the same sampler works for Phaser now and for Pixi if the overlay test forces a switch.
 */
export class FrameSampler {
  private intervals: number[] = [];
  private last = 0;
  private warmupUntil = 0;
  private endAt = 0;
  private capAt = 0;
  private busy: () => boolean = () => false;
  private raf = 0;
  private resolve: ((stats: FrameStats) => void) | null = null;
  /** Live read for the HUD: intervals of the last second. */
  recent: number[] = [];
  /** How far the window ran past `duration` because the scenario was still busy. */
  extendedMs = 0;

  start(warmupMs: number, durationMs: number, busy?: () => boolean): Promise<FrameStats> {
    const now = performance.now();
    this.last = now;
    this.warmupUntil = now + warmupMs;
    this.endAt = this.warmupUntil + durationMs;
    this.capAt = this.endAt + MAX_EXTEND_MS;
    this.busy = busy ?? (() => false);
    this.intervals = [];
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.raf = requestAnimationFrame(this.tick);
    });
  }

  private tick = (now: number): void => {
    const dt = now - this.last;
    this.last = now;
    this.recent.push(dt);
    if (this.recent.length > 60) this.recent.shift();
    if (now >= this.warmupUntil) {
      this.intervals.push(dt);
      if (windowEnds(now, this.endAt, this.capAt, this.busy())) {
        this.extendedMs = Math.max(0, now - this.endAt);
        const stats = summarize(this.intervals);
        this.resolve?.(stats);
        this.resolve = null;
        return;
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.resolve = null;
  }

  liveFps(): number {
    const sum = this.recent.reduce((a, b) => a + b, 0);
    return sum > 0 ? (this.recent.length * 1000) / sum : 0;
  }
}

export function readHeapMB(): number | null {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  const used = perf.memory?.usedJSHeapSize;
  return typeof used === 'number' ? Math.round((used / 1048576) * 10) / 10 : null;
}

export function buildReport(
  params: RigParams,
  device: string,
  stats: FrameStats,
  startedAt: string,
  pass: boolean | null,
  notes: string[],
  extra: Record<string, unknown>,
): Report {
  return {
    rig: 'kodable-creator-rig',
    version: RIG_VERSION,
    scenario: params.scenario,
    adapter: params.adapter,
    device,
    ua: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    params: {
      count: params.count,
      duration: params.duration,
      warmup: params.warmup,
      seed: params.seed,
      ...params.extra,
    },
    startedAt,
    durationMs: Math.round(stats.durationMs),
    frames: stats.frames,
    fps: round1(stats.fps),
    p50: round2(stats.p50),
    p95: round2(stats.p95),
    max: round2(stats.max),
    dropped: stats.dropped,
    slow: stats.slow,
    heapMB: readHeapMB(),
    pass,
    notes,
    extra,
  };
}

declare global {
  interface Window {
    __rig?: { done: boolean; report?: Report; error?: string };
  }
}

/** Writes the report to the page, to the console as one line, and to window.__rig for Playwright. */
export function emitReport(report: Report): void {
  const pre = document.getElementById('report');
  if (pre) {
    pre.textContent = JSON.stringify(report, null, 2);
    pre.className = report.pass === null ? 'na' : report.pass ? 'pass' : 'fail';
    pre.style.display = 'block';
  }
  console.log('RIG_REPORT ' + JSON.stringify(report));
  window.__rig = { done: true, report };
  addReportActions(report);
}

const COLLECTOR_KEY = 'rig-collector';

/**
 * Where reports are posted: the page's own origin, or the address saved from the index page's
 * "Collector" field (needed inside the Capacitor shell, whose origin is capacitor://localhost).
 */
export function collectorUrl(): string {
  let saved = '';
  try {
    saved = localStorage.getItem(COLLECTOR_KEY) ?? '';
  } catch {
    // no storage
  }
  const base = saved !== '' ? saved.replace(/\/?$/, '/') : window.location.href;
  return new URL('report', base).toString();
}

export function saveCollector(url: string): void {
  try {
    if (url.trim() === '') localStorage.removeItem(COLLECTOR_KEY);
    else localStorage.setItem(COLLECTOR_KEY, url.trim());
  } catch {
    // no storage
  }
}

export function savedCollector(): string {
  try {
    return localStorage.getItem(COLLECTOR_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Params that do not distinguish a variant and stay out of the file name. */
const RUN_ONLY_PARAMS = new Set(['count', 'duration', 'warmup', 'seed', 'send']);

/**
 * File name a device report gets in results/: scenario-count[-key-value...][-adapter]-device.json.
 * Variant params such as substeps=8 or format=S3TC are part of the name, so variants of one
 * scenario from one device do not overwrite each other.
 */
export function reportFileName(report: Pick<Report, 'scenario' | 'adapter' | 'device' | 'params'>): string {
  const safe = (s: string): string => s.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const adapter = report.adapter === 'none' ? '' : `-${report.adapter}`;
  const variant = Object.entries(report.params)
    .filter(([k]) => !RUN_ONLY_PARAMS.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `-${safe(k)}-${safe(String(v))}`)
    .join('');
  return `${report.scenario}-${report.params['count']}${variant}${adapter}-${safe(report.device)}.json`;
}

/**
 * Copy and Share buttons, so a report leaves an iPad in one tap. Copy uses the clipboard API
 * (HTTPS or localhost only) and falls back to selecting the text. Share hands the JSON file
 * to the system share sheet where the browser supports files (iOS Safari does).
 */
function addReportActions(report: Report): void {
  const bar = document.getElementById('report-actions');
  const pre = document.getElementById('report');
  if (!bar || !pre) return;
  const json = JSON.stringify(report, null, 2);
  const name = reportFileName(report);
  bar.innerHTML = '';

  const flash = (button: HTMLButtonElement, text: string): void => {
    const label = button.textContent;
    button.textContent = text;
    setTimeout(() => (button.textContent = label), 1500);
  };

  const copy = document.createElement('button');
  copy.textContent = 'Copy JSON';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(json);
      flash(copy, 'Copied');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      flash(copy, 'Selected: copy by hand');
    }
  });
  bar.appendChild(copy);

  // The Vite dev and preview servers accept POST /report (scripts/collector.ts). On GitHub Pages
  // there is no collector, so the button reports the failure and the copy path remains.
  const send = document.createElement('button');
  send.textContent = 'Send to rig server';
  const post = async (): Promise<void> => {
    send.disabled = true;
    try {
      const res = await fetch(collectorUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
      const data = (await res.json().catch(() => ({}))) as { saved?: string; error?: string };
      send.textContent = res.ok ? `Saved results/${data.saved ?? name}` : `Rejected: ${data.error ?? res.status}`;
    } catch {
      send.textContent = 'No rig server reachable: set the Collector field on the index page to http://<mac-ip>:5173';
    }
  };
  send.addEventListener('click', () => void post());
  bar.appendChild(send);
  if (report.params['send'] === '1') void post();

  // Download: for browsers on the deployed page, where no collector answers.
  const download = document.createElement('a');
  download.textContent = `Download ${name}`;
  download.className = 'button';
  download.download = name;
  download.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  bar.appendChild(download);

  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function') {
    const share = document.createElement('button');
    share.textContent = `Share ${name}`;
    share.addEventListener('click', async () => {
      const withFile = nav.canShare?.({ files: [file] }) === true;
      try {
        await nav.share(withFile ? { files: [file], title: name } : { title: name, text: json });
      } catch {
        // The user closed the share sheet; nothing to do.
      }
    });
    bar.appendChild(share);
  }
  bar.style.display = 'flex';
}

export function emitError(message: string): void {
  const pre = document.getElementById('report');
  if (pre) {
    pre.textContent = `ERROR ${message}`;
    pre.className = 'fail';
    pre.style.display = 'block';
  }
  console.log('RIG_ERROR ' + message);
  window.__rig = { done: true, error: message };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
