import { describe, expect, it } from 'vitest';
import { percentile, reportFileName, summarize } from './report';
import { parseParams, buildUrl, guessDevice } from './params';
import { MATRIX, benchRuns } from './scenarios/matrix';

describe('percentile', () => {
  it('returns 0 for an empty series', () => {
    expect(percentile([], 50)).toBe(0);
  });
  it('uses nearest rank', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(s, 50)).toBe(5);
    expect(percentile(s, 95)).toBe(10);
    expect(percentile(s, 10)).toBe(1);
  });
});

describe('summarize', () => {
  it('computes fps, percentiles and dropped frames', () => {
    const intervals = [16, 16, 16, 16, 17, 40, 16, 16, 16, 16];
    const stats = summarize(intervals);
    expect(stats.frames).toBe(10);
    expect(stats.durationMs).toBe(185);
    expect(stats.fps).toBeCloseTo((10 * 1000) / 185, 3);
    expect(stats.p50).toBe(16);
    expect(stats.p95).toBe(40);
    expect(stats.max).toBe(40);
    expect(stats.dropped).toBe(1);
    expect(stats.slow).toBe(2);
  });
});

describe('reportFileName', () => {
  it('names a device report scenario-count-adapter-device.json', () => {
    expect(reportFileName({ scenario: 'determinism', adapter: 'rapier', device: 'ipad', params: { count: 200 } })).toBe('determinism-200-rapier-ipad.json');
    expect(reportFileName({ scenario: 'baseline', adapter: 'none', device: 'Mac Safari', params: { count: 1000 } })).toBe('baseline-1000-mac-safari.json');
  });
});

describe('params', () => {
  it('parses with defaults and keeps unknown keys as extra', () => {
    const p = parseParams('?scenario=baseline&count=500&foo=bar');
    expect(p.scenario).toBe('baseline');
    expect(p.count).toBe(500);
    expect(p.duration).toBe(20);
    expect(p.warmup).toBe(3);
    expect(p.adapter).toBe('none');
    expect(p.extra).toEqual({ foo: 'bar' });
  });
  it('falls back on bad numbers', () => {
    expect(parseParams('?count=abc').count).toBe(0);
  });
  it('builds URLs', () => {
    expect(buildUrl('./', { scenario: 'baseline', count: 10 })).toBe('./?scenario=baseline&count=10');
  });
  it('guesses devices', () => {
    expect(guessDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', 5)).toBe('iphone-guess');
    expect(guessDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Safari/605', 5)).toBe('ipad-guess');
    expect(guessDevice('Mozilla/5.0 (X11; CrOS x86_64) Chrome/140', 0)).toBe('chromebook-guess');
  });
});

describe('matrix', () => {
  it('every scenario has an id, title and at least one variant', () => {
    for (const s of MATRIX) {
      expect(s.id).toMatch(/^[a-z-]+$/);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.variants.length).toBeGreaterThan(0);
    }
  });
  it('bench runs are unique by key', () => {
    const keys = benchRuns().map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
