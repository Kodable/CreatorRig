import { describe, expect, it } from 'vitest';
import type { LoopSpan, Track, TrackSample, Vec2 } from './types';
import { DS } from './types';
import { CartSim, DEFAULTS, seatG } from './sim';

// ---------------------------------------------------------------------------
// Analytic track helpers (private to this test file; do NOT import track.ts)
// ---------------------------------------------------------------------------

interface Piece {
  length: number;
  fn: (s: number) => { pos: Vec2; tangent: Vec2; kappa: number };
}

/** Build a Track by sampling `fn(s)` at DS spacing (last sample at s = length). */
function analyticTrack(
  fn: (s: number) => { pos: Vec2; tangent: Vec2; kappa: number },
  length: number,
  maxDrop = 0,
  loops: LoopSpan[] = []
): Track {
  const ss: number[] = [];
  const n = Math.floor(length / DS + 1e-9);
  for (let i = 0; i <= n; i++) ss.push(i * DS);
  const lastSs = ss[ss.length - 1] ?? 0;
  if (lastSs < length - 1e-9) ss.push(length);

  const raw = ss.map((s) => ({ s, ...fn(s) }));
  // dyds is dy/ds = sin(theta): the sim uses a = -G * dyds along the tangent.
  const samples: TrackSample[] = raw.map((r) => {
    const dyds = r.tangent.y; // dy/ds = sin(theta), matching track.ts
    return { pos: r.pos, s: r.s, tangent: r.tangent, kappa: r.kappa, dyds };
  });

  const lookup = (s: number): TrackSample => {
    const clamped = Math.max(0, Math.min(length, s));
    const idx = Math.max(0, Math.min(samples.length - 2, Math.floor(clamped / DS + 1e-9)));
    const a = samples[idx]!;
    const b = samples[idx + 1]!;
    const span = b.s - a.s;
    const t = span > 1e-12 ? (clamped - a.s) / span : 0;
    return {
      pos: { x: a.pos.x + (b.pos.x - a.pos.x) * t, y: a.pos.y + (b.pos.y - a.pos.y) * t },
      s: clamped,
      tangent: a.tangent,
      kappa: a.kappa,
      dyds: a.dyds,
    };
  };

  return { length, samples, maxDrop, loops, lookup };
}

function composeTrack(pieces: Piece[], maxDrop = 0, loops: LoopSpan[] = []): Track {
  const total = pieces.reduce((acc, p) => acc + p.length, 0);
  const fn = (s: number) => {
    let acc = 0;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      const isLast = i === pieces.length - 1;
      // Prefer the *next* piece exactly at a boundary (a piece owns [acc, acc+length)),
      // so a boundary sample picks up the incoming segment's geometry, not the outgoing one.
      if (s < acc + p.length - 1e-9 || isLast) {
        const local = Math.min(Math.max(s - acc, 0), p.length);
        return p.fn(local);
      }
      acc += p.length;
    }
    const last = pieces[pieces.length - 1]!;
    return last.fn(last.length);
  };
  return analyticTrack(fn, total, maxDrop, loops);
}

function straightPiece(p0: Vec2, dirAngle: number, length: number): Piece {
  const t = { x: Math.cos(dirAngle), y: Math.sin(dirAngle) };
  return {
    length,
    fn: (s: number) => ({ pos: { x: p0.x + t.x * s, y: p0.y + t.y * s }, tangent: t, kappa: 0 }),
  };
}

/** Circular arc piece. turn = +1 is CCW (kappa > 0), -1 is CW (kappa < 0). */
function arcPiece(p0: Vec2, phi0: number, r: number, sweep: number, turn: 1 | -1): Piece {
  const left = { x: -Math.sin(phi0), y: Math.cos(phi0) };
  const center =
    turn === 1
      ? { x: p0.x + r * left.x, y: p0.y + r * left.y }
      : { x: p0.x - r * left.x, y: p0.y - r * left.y };
  const theta0 = Math.atan2(p0.y - center.y, p0.x - center.x);
  const length = r * sweep;
  return {
    length,
    fn: (s: number) => {
      const theta = theta0 + (turn * s) / r;
      return {
        pos: { x: center.x + r * Math.cos(theta), y: center.y + r * Math.sin(theta) },
        tangent: { x: turn * -Math.sin(theta), y: turn * Math.cos(theta) },
        kappa: turn / r,
      };
    },
  };
}

function straightTrack(p0: Vec2, p1: Vec2, maxDrop = 0): Track {
  const length = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  return composeTrack([straightPiece(p0, angle, length)], maxDrop);
}

/**
 * A "valley"-shaped arc built as a circular arc (center above the path) so
 * the s-parameterization is exact. `startDeg`/`endDeg` are angles (degrees,
 * standard math convention) measured from the arc's center; the bottom of a
 * full circle sits at -90deg. An asymmetric range around -90 (e.g. -120 to
 * -30) yields an exit that is higher than the entry, since sin(-30) >
 * sin(-120). A short flat lead-in (tangent-matched) precedes the arc so a
 * backward roll never approaches s=0.
 */
function valleyArcTrack(r: number, startDeg: number, endDeg: number, leadIn = 5, maxDrop = 0): Track {
  const p0 = { x: 0, y: 0 };
  const phi0 = (startDeg + 90) * (Math.PI / 180); // tangent angle at the arc's start, turn=+1
  const lead = straightPiece({ x: p0.x - leadIn * Math.cos(phi0), y: p0.y - leadIn * Math.sin(phi0) }, phi0, leadIn);
  const sweep = ((endDeg - startDeg) * Math.PI) / 180;
  const arc = arcPiece(p0, phi0, r, sweep, 1);
  return composeTrack([lead, arc], maxDrop);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CartSim', () => {
  it('conserves energy on a frictionless valley', () => {
    // y = 10 + 9*cos(pi*x/20) over x in [0,40]: height 19 -> 1 -> 19, both
    // ends flat (dy/dx = 0), so it starts and ends at the same height as the
    // track's own s=0 edge. A flat run is appended past x=40 so the cart,
    // which crests back to the starting height with residual speed, cruises
    // there instead of immediately hitting the end-of-track boundary --
    // giving room to integrate for the full 15 simulated seconds.
    const N = 20000;
    const xStart = 0;
    const xEnd = 40;
    const dx = (xEnd - xStart) / N;
    const pts: Vec2[] = [];
    for (let i = 0; i <= N; i++) {
      const x = xStart + i * dx;
      pts.push({ x, y: 10 + 9 * Math.cos((Math.PI * x) / 20) });
    }
    const arclen: number[] = [0];
    for (let i = 1; i <= N; i++) {
      const p0 = pts[i - 1]!;
      const p1 = pts[i]!;
      arclen.push(arclen[i - 1]! + Math.hypot(p1.x - p0.x, p1.y - p0.y));
    }
    const curveLength = arclen[N]!;
    const curvePiece: Piece = {
      length: curveLength,
      fn: (s: number) => {
        const clamped = Math.max(0, Math.min(curveLength, s));
        let lo = 0;
        let hi = N;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (arclen[mid]! <= clamped) lo = mid;
          else hi = mid;
        }
        const a = pts[lo]!;
        const b = pts[hi]!;
        const segLen = arclen[hi]! - arclen[lo]!;
        const t = segLen > 1e-12 ? (clamped - arclen[lo]!) / segLen : 0;
        const pos = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const tangent =
          segLen > 1e-12 ? { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen } : { x: 1, y: 0 };
        return { pos, tangent, kappa: 0 };
      },
    };
    const tail = straightPiece({ x: xEnd, y: 19 }, 0, 30);
    const track = composeTrack([curvePiece, tail]);

    const sim = new CartSim(track, { MU: 0, DRAG: 0, V0: 0.5 });
    const G = DEFAULTS.G;
    const s0 = sim.snapshot();
    const e0 = (s0.v * s0.v) / 2 + G * s0.pos.y;

    const totalSteps = Math.round(15 / (1 / 60));
    let maxDrift = 0;
    for (let i = 0; i < totalSteps; i++) {
      sim.step();
      if (sim.outcome !== 'running') break;
      const snap = sim.snapshot();
      const e = (snap.v * snap.v) / 2 + G * snap.pos.y;
      const drift = Math.abs(e - e0) / Math.abs(e0);
      maxDrift = Math.max(maxDrift, drift);
    }
    expect(maxDrift).toBeLessThan(0.005);
  });

  it('keeps gNormal ~1 and grounded on a flat track heading right', () => {
    const track = straightTrack({ x: 0, y: 0 }, { x: 100, y: 0 });
    const sim = new CartSim(track, { V0: 5 });
    for (let i = 0; i < 120; i++) {
      sim.step();
      const snap = sim.snapshot();
      expect(snap.gNormal).toBeCloseTo(1, 5);
      expect(snap.airborne).toBe(false);
    }
  });

  it('rolls back on an uphill first segment', () => {
    const track = straightTrack({ x: 0, y: 0 }, { x: 10, y: 10 });
    const sim = new CartSim(track, { V0: 2 });
    const maxSteps = Math.round(5 / (1 / 60));
    for (let i = 0; i < maxSteps && sim.outcome === 'running'; i++) {
      sim.step();
    }
    expect(sim.outcome).toBe('rolledBack');
  });

  it('reaches the end on a frictionless downhill straight near free-fall speed', () => {
    const track = straightTrack({ x: 0, y: 10 }, { x: 20, y: 0 });
    const sim = new CartSim(track, { MU: 0, DRAG: 0 });
    let maxSpeed = 0;
    const maxSteps = Math.round(10 / (1 / 60));
    for (let i = 0; i < maxSteps && sim.outcome === 'running'; i++) {
      sim.step();
      maxSpeed = Math.max(maxSpeed, Math.abs(sim.snapshot().v));
    }
    expect(sim.outcome).toBe('reachedEnd');
    const expected = Math.sqrt(2 * DEFAULTS.G * 10);
    expect(Math.abs(maxSpeed - expected) / expected).toBeLessThan(0.05);
  });

  describe('loop of radius 5', () => {
    function loopTrack(H: number, r: number, tailLength: number) {
      // Straight 45deg ramp descending from height H down to the loop bottom.
      const rampP0 = { x: -H, y: H };
      const rampP1 = { x: 0, y: 0 };
      const rampLen = Math.hypot(rampP1.x - rampP0.x, rampP1.y - rampP0.y);
      const rampAngle = Math.atan2(rampP1.y - rampP0.y, rampP1.x - rampP0.x);
      const ramp = straightPiece(rampP0, rampAngle, rampLen);
      const loop = arcPiece({ x: 0, y: 0 }, 0, r, 2 * Math.PI, 1);
      const tail = straightPiece({ x: 0, y: 0 }, 0, tailLength);
      const entryS = ramp.length;
      const exitS = ramp.length + loop.length;
      const loops: LoopSpan[] = [{ entryS, exitS }];
      return composeTrack([ramp, loop, tail], H, loops);
    }

    it('falls when height is below the no-friction threshold (H=11, no stick)', () => {
      const track = loopTrack(11, 5, 10);
      const sim = new CartSim(track, { MU: 0, DRAG: 0, STICK: 0 });
      const maxSteps = Math.round(15 / (1 / 60));
      let fellWithGoodUp = false;
      for (let i = 0; i < maxSteps && sim.outcome === 'running'; i++) {
        sim.step();
        const outcome: string = sim.outcome;
        if (outcome === 'fell') {
          fellWithGoodUp = sim.snapshot().up.y < -0.2;
        }
      }
      expect(sim.outcome).toBe('fell');
      expect(fellWithGoodUp).toBe(true);
    });

    it('sticks to the rail up to STICK g of pull-away when upside down', () => {
      // Default STICK = 0.5: the fall needs v^2 < 0.5 g r at the top, i.e. H < 2r + r/4 = 11.25 (plus V0).
      const holds = new CartSim(loopTrack(11.2, 5, 10), { MU: 0, DRAG: 0 });
      for (let i = 0; i < 20 * 60 && holds.outcome === 'running'; i++) holds.step();
      expect(holds.outcome).toBe('reachedEnd');
      const falls = new CartSim(loopTrack(10.5, 5, 10), { MU: 0, DRAG: 0 });
      for (let i = 0; i < 20 * 60 && falls.outcome === 'running'; i++) falls.step();
      expect(falls.outcome).toBe('fell');
    });

    it('passes the loop and reaches the end when height clears the threshold (H=16)', () => {
      const track = loopTrack(16, 5, 10);
      const sim = new CartSim(track, { MU: 0, DRAG: 0 });
      const maxSteps = Math.round(20 / (1 / 60));
      for (let i = 0; i < maxSteps && sim.outcome === 'running'; i++) {
        sim.step();
      }
      expect(sim.outcome).toBe('reachedEnd');
    });
  });

  it('gets stuck in a valley whose exit is higher than its entry', () => {
    // Circular-arc valley: entry at theta=-120deg, bottom at -90deg, exit at
    // -30deg -- exit sits higher than entry since sin(-30) > sin(-120).
    const r = 10;
    const track = valleyArcTrack(r, -120, -30);
    const sim = new CartSim(track);
    const maxSteps = Math.round(30 / (1 / 60));
    for (let i = 0; i < maxSteps && sim.outcome === 'running'; i++) {
      sim.step();
    }
    expect(sim.outcome).toBe('stuck');
  });

  it('seatG matches the documented sanity checks', () => {
    const G = DEFAULTS.G;
    expect(seatG(5, 0, { x: 1, y: 0 }, 1, G)).toBeCloseTo(1, 10);
    expect(seatG(5, 0.1, { x: 1, y: 0 }, 1, G)).toBeGreaterThan(1);
    expect(seatG(5, -0.1, { x: 1, y: 0 }, 1, G)).toBeLessThan(1);
    const r = 5;
    const vSlow = 5; // v^2 < G*r (=49.05)
    expect(seatG(vSlow, 1 / r, { x: -1, y: 0 }, 1, G)).toBeLessThan(0);
  });
});
