import type { CartSnapshot, FinishZone, Metrics, Outcome, Track } from './types';

/** 1 when `track` is non-null, `finish` is defined and the track's last sample lies within
 * `finish.r` of (finish.x, finish.y), else 0. */
export function isAtFinish(track: Track | null, finish: FinishZone | undefined): number {
  if (!track || !finish) return 0;
  const last = track.samples[track.samples.length - 1];
  if (!last) return 0;
  const dx = last.pos.x - finish.x;
  const dy = last.pos.y - finish.y;
  return Math.hypot(dx, dy) <= finish.r ? 1 : 0;
}

export function staticMetrics(track: Track | null, finish?: FinishZone): Metrics {
  return {
    maxDrop: track?.maxDrop ?? 0,
    maxSpeed: 0,
    length: track?.length ?? 0,
    hangTime: 0,
    loops: track?.loops.length ?? 0,
    loopsCompleted: 0,
    maxG: 0,
    reachedEnd: 0,
    atFinish: isAtFinish(track, finish),
  };
}

export class RunMeters {
  private maxSpeed = 0;
  private hangTime = 0;
  private maxG = 0;
  private sMax = 0;
  private outcome: Outcome = 'running';

  reset(): void {
    this.maxSpeed = 0;
    this.hangTime = 0;
    this.maxG = 0;
    this.sMax = 0;
    this.outcome = 'running';
  }

  observe(snap: CartSnapshot, dt: number): void {
    this.maxSpeed = Math.max(this.maxSpeed, Math.abs(snap.v));
    if (snap.airborne) this.hangTime += dt;
    this.maxG = Math.max(this.maxG, snap.gNormal);
    this.sMax = snap.sMax;
    this.outcome = snap.outcome;
  }

  toMetrics(track: Track, finish?: FinishZone): Metrics {
    const loopsCompleted =
      this.outcome === 'fell' ? 0 : track.loops.filter((l) => l.exitS <= this.sMax).length;
    return {
      maxDrop: track.maxDrop,
      maxSpeed: this.maxSpeed,
      length: track.length,
      hangTime: this.hangTime,
      loops: track.loops.length,
      loopsCompleted,
      maxG: this.maxG,
      reachedEnd: this.outcome === 'reachedEnd' ? 1 : 0,
      atFinish: isAtFinish(track, finish),
    };
  }
}
