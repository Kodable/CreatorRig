import type { CartSnapshot, Outcome, SimConstants, Track, Vec2 } from './types';
import { FIXED_DT } from './stepper';

/** STICK: the fuzz "sticks" to the rail up to this many g of pull-away while upside down. */
export const DEFAULTS: SimConstants = { G: 9.81, MU: 0.01, DRAG: 0.0015, V0: 2, STICK: 0.5 };

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/**
 * Seat-frame normal g-force, in units of g. `side` encodes which way the cart
 * seat faces relative to the track's local left-hand normal (see CartSim).
 */
export function seatG(v: number, kappa: number, tangent: Vec2, side: 1 | -1, G: number = DEFAULTS.G): number {
  return side * ((v * v * kappa) / G + tangent.x);
}

export class CartSim {
  private readonly c: SimConstants;
  private readonly side: 1 | -1;

  private s = 0;
  private v: number;
  private time = 0;
  private sMax = 0;
  private noProgressTimer = 0;
  private _outcome: Outcome = 'running';

  constructor(private readonly track: Track, c?: Partial<SimConstants>) {
    this.c = { ...DEFAULTS, ...c };
    this.v = this.c.V0;
    this.side = track.lookup(0).tangent.x >= 0 ? 1 : -1;
  }

  get outcome(): Outcome {
    return this._outcome;
  }

  step(): void {
    if (this._outcome !== 'running') return;
    const h = FIXED_DT / 4;
    for (let i = 0; i < 4; i++) {
      if (this._outcome !== 'running') break;
      this.subStep(h);
    }
  }

  private seatUp(tangent: Vec2): Vec2 {
    return { x: this.side * -tangent.y, y: this.side * tangent.x };
  }

  private subStep(h: number): void {
    const { G, MU, DRAG } = this.c;
    const q = this.track.lookup(this.s);
    // dyds is dy/ds = sin(theta) of the piecewise-linear track, so the gravity
    // component along the tangent is -G * dyds (downhill positive). Friction and drag oppose motion.
    const a = -G * q.dyds - sign(this.v) * (MU * G + DRAG * this.v * this.v);
    this.v += a * h;
    this.s += this.v * h;
    this.time += h;

    if (this.s >= this.track.length) {
      this._outcome = 'reachedEnd';
      this.s = this.track.length;
      this.v = 0;
      return;
    }
    if (this.s < 0) {
      this._outcome = 'rolledBack';
      this.s = 0;
      this.v = 0;
      return;
    }

    const q2 = this.track.lookup(this.s);
    const gNormal = seatG(this.v, q2.kappa, q2.tangent, this.side, G);
    const u = this.seatUp(q2.tangent);
    if (gNormal < -this.c.STICK && u.y < -0.2) {
      this._outcome = 'fell';
      return;
    }

    if (this.s > this.sMax + 1e-6) {
      this.sMax = this.s;
      this.noProgressTimer = 0;
    } else {
      this.noProgressTimer += h;
    }
    if (this.noProgressTimer >= 4) {
      this._outcome = 'stuck';
    }
    if (this.time >= 90) {
      this._outcome = 'stuck';
    }
  }

  snapshot(): CartSnapshot {
    const q = this.track.lookup(this.s);
    const u = this.seatUp(q.tangent);
    const gNormal = seatG(this.v, q.kappa, q.tangent, this.side, this.c.G);
    return {
      s: this.s,
      v: this.v,
      pos: q.pos,
      theta: Math.atan2(q.tangent.y, q.tangent.x),
      up: u,
      gNormal,
      airborne: gNormal < 0.3,
      time: this.time,
      sMax: this.sMax,
      outcome: this._outcome,
    };
  }
}
