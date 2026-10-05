import { describe, expect, it } from 'vitest';
import type { CartSnapshot, LoopSpan, Outcome, Track, TrackSample, Vec2 } from './types';
import { DS } from './types';
import { seatG } from './sim';
import { RunMeters, isAtFinish, staticMetrics } from './meters';

// ---------------------------------------------------------------------------
// Analytic track helpers (private to this test file; do NOT import track.ts)
// ---------------------------------------------------------------------------

interface Piece {
  length: number;
  fn: (s: number) => { pos: Vec2; tangent: Vec2; kappa: number };
}

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
  // dyds is dy/ds = sin(theta), matching track.ts and sim.ts
  // for the derivation of why the sim formula requires this convention.
  const samples: TrackSample[] = raw.map((r) => {
    // See sim.test.ts for why this must be ty/|tx| (abs), not ty/tx.
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

/** Flat lead-in of `leadIn` meters, then a crest/valley circular arc of radius r. */
function leadInPlusArc(leadIn: number, r: number, sweepDeg: number, turn: 1 | -1) {
  const lead = straightPiece({ x: 0, y: 0 }, 0, leadIn);
  const arc = arcPiece({ x: leadIn, y: 0 }, 0, r, (sweepDeg * Math.PI) / 180, turn);
  return { track: composeTrack([lead, arc]), leadIn, arcLength: arc.length };
}

function makeSnap(
  track: Track,
  s: number,
  v: number,
  side: 1 | -1,
  outcome: Outcome,
  time: number
): CartSnapshot {
  const q = track.lookup(s);
  const gNormal = seatG(v, q.kappa, q.tangent, side);
  const up = { x: side * -q.tangent.y, y: side * q.tangent.x };
  return {
    s,
    v,
    pos: q.pos,
    theta: Math.atan2(q.tangent.y, q.tangent.x),
    up,
    gNormal,
    airborne: gNormal < 0.3,
    time,
    sMax: s,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('staticMetrics', () => {
  it('returns zeros for a null track', () => {
    expect(staticMetrics(null)).toEqual({
      maxDrop: 0,
      maxSpeed: 0,
      length: 0,
      hangTime: 0,
      loops: 0,
      loopsCompleted: 0,
      maxG: 0,
      reachedEnd: 0,
      atFinish: 0,
    });
  });

  it('returns atFinish 0 for a null track even with a finish zone', () => {
    expect(staticMetrics(null, { x: 0, y: 0, r: 1 }).atFinish).toBe(0);
  });

  it('pulls static fields from a track and zeros the run fields', () => {
    const track = straightTrack({ x: 0, y: 5 }, { x: 20, y: 0 });
    const withLoops = { ...track, maxDrop: 12, loops: [{ entryS: 1, exitS: 2 }] };
    const m = staticMetrics(withLoops);
    expect(m.maxDrop).toBe(12);
    expect(m.length).toBeCloseTo(withLoops.length, 6);
    expect(m.loops).toBe(1);
    expect(m.maxSpeed).toBe(0);
    expect(m.hangTime).toBe(0);
    expect(m.loopsCompleted).toBe(0);
    expect(m.maxG).toBe(0);
    expect(m.reachedEnd).toBe(0);
    expect(m.atFinish).toBe(0);
  });

  it('sets atFinish 1 when the track ends inside the finish zone', () => {
    const track = straightTrack({ x: 0, y: 5 }, { x: 20, y: 0 });
    const m = staticMetrics(track, { x: 20, y: 0, r: 2 });
    expect(m.atFinish).toBe(1);
  });

  it('sets atFinish 0 when the track ends outside the finish zone', () => {
    const track = straightTrack({ x: 0, y: 5 }, { x: 20, y: 0 });
    const m = staticMetrics(track, { x: 0, y: 0, r: 2 });
    expect(m.atFinish).toBe(0);
  });
});

describe('isAtFinish', () => {
  it('is 0 for a null track', () => {
    expect(isAtFinish(null, { x: 0, y: 0, r: 1 })).toBe(0);
  });

  it('is 0 when finish is undefined', () => {
    const track = straightTrack({ x: 0, y: 5 }, { x: 20, y: 0 });
    expect(isAtFinish(track, undefined)).toBe(0);
  });

  it('is 1 when the last sample lies within the finish radius', () => {
    const track = straightTrack({ x: 0, y: 5 }, { x: 20, y: 0 });
    expect(isAtFinish(track, { x: 21, y: 0.5, r: 2 })).toBe(1);
  });

  it('is 0 when the last sample lies outside the finish radius', () => {
    const track = straightTrack({ x: 0, y: 5 }, { x: 20, y: 0 });
    expect(isAtFinish(track, { x: 21, y: 0.5, r: 0.1 })).toBe(0);
  });
});

describe('RunMeters', () => {
  it('records hangTime > 0 and maxG < 1 over a crest at 12 m/s', () => {
    const { track, leadIn, arcLength } = leadInPlusArc(10, 8, 40, -1);
    const meters = new RunMeters();
    meters.reset();
    const dt = 1 / 60;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const s = leadIn + (arcLength * i) / steps;
      const snap = makeSnap(track, s, 12, 1, 'running', i * dt);
      meters.observe(snap, dt);
    }
    const m = meters.toMetrics(track);
    expect(m.hangTime).toBeGreaterThan(0);
    expect(m.maxG).toBeLessThan(1);
  });

  it('records maxG > 1 over a valley', () => {
    const { track, leadIn, arcLength } = leadInPlusArc(10, 8, 40, 1);
    const meters = new RunMeters();
    meters.reset();
    const dt = 1 / 60;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const s = leadIn + (arcLength * i) / steps;
      const snap = makeSnap(track, s, 12, 1, 'running', i * dt);
      meters.observe(snap, dt);
    }
    const m = meters.toMetrics(track);
    expect(m.maxG).toBeGreaterThan(1);
  });

  it('keeps maxG ~= 1 on a flat track', () => {
    const track = straightTrack({ x: 0, y: 0 }, { x: 50, y: 0 });
    const meters = new RunMeters();
    meters.reset();
    const dt = 1 / 60;
    for (let i = 0; i <= 20; i++) {
      const snap = makeSnap(track, i * 2, 7, 1, 'running', i * dt);
      meters.observe(snap, dt);
    }
    const m = meters.toMetrics(track);
    expect(m.maxG).toBeCloseTo(1, 5);
  });

  it('counts a loop as completed once sMax passes its exitS, unless the cart fell', () => {
    const track = straightTrack({ x: 0, y: 0 }, { x: 20, y: 0 });
    const withLoop = { ...track, loops: [{ entryS: 5, exitS: 10 }] as LoopSpan[] };

    const passed = new RunMeters();
    passed.reset();
    passed.observe(makeSnap(withLoop, 15, 5, 1, 'running', 1), 1 / 60);
    expect(passed.toMetrics(withLoop).loopsCompleted).toBe(1);

    const fell = new RunMeters();
    fell.reset();
    fell.observe(makeSnap(withLoop, 15, 5, 1, 'fell', 1), 1 / 60);
    expect(fell.toMetrics(withLoop).loopsCompleted).toBe(0);

    const notYet = new RunMeters();
    notYet.reset();
    notYet.observe(makeSnap(withLoop, 7, 5, 1, 'running', 1), 1 / 60);
    expect(notYet.toMetrics(withLoop).loopsCompleted).toBe(0);
  });

  it('maps outcome to reachedEnd 0/1', () => {
    const track = straightTrack({ x: 0, y: 0 }, { x: 20, y: 0 });

    const done = new RunMeters();
    done.reset();
    done.observe(makeSnap(track, 20, 0, 1, 'reachedEnd', 1), 1 / 60);
    expect(done.toMetrics(track).reachedEnd).toBe(1);

    const notDone = new RunMeters();
    notDone.reset();
    notDone.observe(makeSnap(track, 20, 0, 1, 'stuck', 1), 1 / 60);
    expect(notDone.toMetrics(track).reachedEnd).toBe(0);
  });
});
