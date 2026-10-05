import { describe, it, expect } from 'vitest';
import { buildTrack, findLoops } from './track';
import type { Vec2 } from './types';

describe('buildTrack - straight flat track', () => {
  const points: Vec2[] = [
    { x: 0, y: 10 },
    { x: 10, y: 10 },
  ];
  const track = buildTrack(points)!;

  it('builds a track', () => {
    expect(track).not.toBeNull();
  });

  it('has length ~10', () => {
    expect(Math.abs(track.length - 10)).toBeLessThan(0.01);
  });

  it('has near-zero curvature everywhere', () => {
    for (const s of track.samples) {
      expect(Math.abs(s.kappa)).toBeLessThan(1e-6);
    }
  });

  it('has maxDrop 0', () => {
    // allow tiny floating point noise from arc-length resampling
    expect(track.maxDrop).toBeLessThan(1e-9);
  });

  it('lookup(5).pos ~ (5,10)', () => {
    const sample = track.lookup(5);
    expect(Math.abs(sample.pos.x - 5)).toBeLessThan(0.05);
    expect(Math.abs(sample.pos.y - 10)).toBeLessThan(0.05);
  });

  it('lookup(-1).s === 0', () => {
    expect(track.lookup(-1).s).toBe(0);
  });

  it('lookup(99).s === length', () => {
    expect(track.lookup(99).s).toBe(track.length);
  });
});

describe('buildTrack - straight downhill track', () => {
  const points: Vec2[] = [
    { x: 0, y: 10 },
    { x: 10, y: 0 },
  ];
  const track = buildTrack(points)!;

  it('has dyds ~ -1/sqrt(2) on every sample (dy/ds along a 45-degree line)', () => {
    // dyds is dy/ds where s is arc length, i.e. sin(trackAngle). For a straight
    // 45-degree downhill line dy/dx = -1, so dyds = -sin(45deg) = -0.7071, not -1.
    const expected = -Math.SQRT1_2;
    for (const s of track.samples) {
      expect(Math.abs(s.dyds - expected)).toBeLessThan(0.02);
    }
  });

  it('has maxDrop ~10', () => {
    expect(Math.abs(track.maxDrop - 10)).toBeLessThan(0.1);
  });
});

describe('buildTrack - self-intersecting circular loop', () => {
  const center = { x: 20, y: 10 };
  const radius = 5;
  const n = 16;
  const points: Vec2[] = [];
  // 16-point regular polygon starting at -pi/2, going CCW, continuing 3 points past the start
  for (let k = 0; k <= n + 3; k++) {
    const angle = -Math.PI / 2 + (k * (2 * Math.PI)) / n;
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  const track = buildTrack(points)!;

  it('has interior kappa ~ +0.2 on average (within 3%), consistently positive/CCW', () => {
    // Note: centripetal Catmull-Rom is only C1 (tangent-continuous) across knots,
    // not C2, so instantaneous curvature genuinely ripples by up to ~12% near each
    // control point even though position tracks the circle to within ~0.1%
    // (verified independently via fine-grained finite differences on the raw
    // spline, not a discretization bug in the kappa formula). We therefore check
    // sign/rough magnitude per-sample and the mean against the tight 3% bound.
    const expected = 1 / radius;
    const samples = track.samples;
    let sum = 0;
    let count = 0;
    // The reflected-phantom-endpoint distortion decays over roughly one full
    // segment (~2m / 20 samples at DS=0.1), longer than the spec's suggested
    // 10-sample skip, so skip 25 samples from each end here.
    for (let i = 25; i < samples.length - 25; i++) {
      const k = samples[i]!.kappa;
      expect(k).toBeGreaterThan(0);
      expect(Math.abs(k - expected) / expected).toBeLessThan(0.15);
      sum += k;
      count++;
    }
    const mean = sum / count;
    expect(Math.abs(mean - expected) / expected).toBeLessThan(0.03);
  });

  it('findLoops returns exactly 1 loop', () => {
    const loops = findLoops(track.samples);
    expect(loops.length).toBe(1);
  });

  it('track.loops matches findLoops result count', () => {
    expect(track.loops.length).toBe(1);
  });
});

describe('buildTrack - plain hill', () => {
  const points: Vec2[] = [
    { x: 0, y: 5 },
    { x: 10, y: 15 },
    { x: 20, y: 5 },
  ];
  const track = buildTrack(points)!;

  it('has 0 loops', () => {
    expect(track.loops.length).toBe(0);
  });
});

describe('buildTrack - W-shaped track', () => {
  const points: Vec2[] = [
    { x: 0, y: 20 },
    { x: 10, y: 5 },
    { x: 20, y: 15 },
    { x: 30, y: 2 },
    { x: 40, y: 10 },
  ];
  const track = buildTrack(points)!;

  it('has maxDrop ~18 within 0.3', () => {
    expect(Math.abs(track.maxDrop - 18)).toBeLessThan(0.3);
  });
});

describe('buildTrack - very short track', () => {
  const points: Vec2[] = [
    { x: 0, y: 0 },
    { x: 0.05, y: 0 },
  ];
  const track = buildTrack(points)!;

  it('returns a track with 2 or more samples', () => {
    expect(track).not.toBeNull();
    expect(track.samples.length).toBeGreaterThanOrEqual(2);
  });

  it('has no NaN anywhere', () => {
    for (const s of track.samples) {
      expect(Number.isNaN(s.pos.x)).toBe(false);
      expect(Number.isNaN(s.pos.y)).toBe(false);
      expect(Number.isNaN(s.tangent.x)).toBe(false);
      expect(Number.isNaN(s.tangent.y)).toBe(false);
      expect(Number.isNaN(s.kappa)).toBe(false);
      expect(Number.isNaN(s.dyds)).toBe(false);
    }
  });
});

describe('buildTrack - fewer than 2 points', () => {
  it('returns null for 0 points', () => {
    expect(buildTrack([])).toBeNull();
  });
  it('returns null for 1 point', () => {
    expect(buildTrack([{ x: 0, y: 0 }])).toBeNull();
  });
});
