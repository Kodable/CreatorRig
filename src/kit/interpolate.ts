// Render interpolation between two physics snapshots ("Fix Your Timestep"): the sim steps at a
// fixed 60 Hz, the display may run at 120 Hz (or drift), so bodies are drawn at
// prev + alpha * (cur - prev), alpha = the stepper's accumulated fraction of the next tick. This
// removes the hold-then-jump alternation that reads as a doubled image on high-refresh screens.
import type { BodyId, SimSnapshot, Transform } from './types';

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/** Bodies missing from `prev` (spawned this tick) draw at their current pose; bodies missing from
 * `cur` (destroyed) are dropped. Everything else on the snapshot (outcome, overlay) is `cur`'s. */
export function interpolateSnapshot<O extends string>(
  prev: SimSnapshot<O> | null,
  cur: SimSnapshot<O>,
  alpha: number,
): SimSnapshot<O> {
  if (!prev || alpha >= 1) return cur;
  if (alpha <= 0) {
    // Draw the previous pose for bodies that still exist (one tick of latency, no jump).
    const t0 = new Map<BodyId, Transform>();
    for (const [id, c] of cur.transforms) t0.set(id, prev.transforms.get(id) ?? c);
    return { ...cur, transforms: t0 };
  }
  const transforms = new Map<BodyId, Transform>();
  for (const [id, c] of cur.transforms) {
    const p = prev.transforms.get(id);
    if (!p) {
      transforms.set(id, c);
      continue;
    }
    transforms.set(id, {
      position: { x: p.position.x + (c.position.x - p.position.x) * alpha, y: p.position.y + (c.position.y - p.position.y) * alpha },
      angle: lerpAngle(p.angle, c.angle, alpha),
    });
  }
  return { ...cur, transforms };
}
