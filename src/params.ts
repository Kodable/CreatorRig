/**
 * URL parameters drive every run. Nothing in a scenario reads window.location directly.
 *
 *   ?scenario=baseline&count=500&adapter=box2d&duration=20&warmup=3&device=chromebook&seed=1
 */
export interface RigParams {
  /** Scenario id from src/scenarios/matrix.ts. Empty means: show the index page. */
  scenario: string;
  /** Physics adapter id (CW-01.2). Ignored by scenarios that do not simulate. */
  adapter: string;
  /** Scenario-specific size knob (bodies, particles, sprites, skeletons). */
  count: number;
  /** Seconds of measurement after warm-up. */
  duration: number;
  /** Seconds ignored at the start, so shader compiles and JIT do not count. */
  warmup: number;
  /** Human-supplied device tag, e.g. chromebook, ipad, iphone, mac-chrome, capacitor-ipad. */
  device: string;
  /** Seed for every random choice a scenario makes. */
  seed: number;
  /** Any extra key=value pairs, passed through to the scenario and the report. */
  extra: Record<string, string>;
}

const KNOWN = new Set(['scenario', 'adapter', 'count', 'duration', 'warmup', 'device', 'seed']);

export function parseParams(search: string): RigParams {
  const q = new URLSearchParams(search);
  const num = (key: string, fallback: number): number => {
    const raw = q.get(key);
    if (raw === null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const extra: Record<string, string> = {};
  q.forEach((value, key) => {
    if (!KNOWN.has(key)) extra[key] = value;
  });
  return {
    scenario: q.get('scenario') ?? '',
    adapter: q.get('adapter') ?? 'none',
    count: num('count', 0),
    duration: num('duration', 20),
    warmup: num('warmup', 3),
    device: q.get('device') ?? '',
    seed: num('seed', 1),
    extra,
  };
}

/** Builds a scenario URL from a base path and a param object. */
export function buildUrl(base: string, params: Record<string, string | number>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  return `${base}?${q.toString()}`;
}

/**
 * A stable device guess for when no ?device= tag was supplied. It is only a hint;
 * device runs by hand must pass an explicit tag so results are labeled correctly.
 */
export function guessDevice(ua: string, maxTouchPoints: number): string {
  if (/iPhone/.test(ua)) return 'iphone-guess';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ipad-guess';
  if (/CrOS/.test(ua)) return 'chromebook-guess';
  if (/Android/.test(ua)) return 'android-guess';
  if (/Macintosh/.test(ua)) return /Safari/.test(ua) && !/Chrome/.test(ua) ? 'mac-safari-guess' : 'mac-chrome-guess';
  return 'unknown';
}
