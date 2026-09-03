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
  private raf = 0;
  private resolve: ((stats: FrameStats) => void) | null = null;
  /** Live read for the HUD: intervals of the last second. */
  recent: number[] = [];

  start(warmupMs: number, durationMs: number): Promise<FrameStats> {
    const now = performance.now();
    this.last = now;
    this.warmupUntil = now + warmupMs;
    this.endAt = this.warmupUntil + durationMs;
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
      if (now >= this.endAt) {
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
