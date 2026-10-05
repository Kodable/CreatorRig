// Per-tick test effects: shake (kinematic ground), wind (applyForce), blast (applyImpulse +
// castRay shielding). Called once per tick, before world.step().
import { WORLD_W } from './build';
import type { BodyId, BodyRole, OverlayItem, TestSpec } from './types';
import type { PhysicsWorld } from '../../../physics/types';

export interface TestBody {
  id: BodyId;
  role: BodyRole;
  /** Shape height in meters (box height; 0.8 — the diameter — for the fuzz). */
  height: number;
}

export interface TestCtx {
  elapsed: number;
  ground: BodyId;
  bodies: TestBody[];
  /** Owned by the sim, persisted across ticks. applyTest sets this true once a blast has fired. */
  blastDone: boolean;
}

const BLAST_FADE = 0.3; // seconds
// Colours are cosmetic and unspecified by the plan; chosen to read clearly against the sky/ground.
const WIND_COLOR = 0xcfe8ff;
const BLAST_COLOR = 0xff6a2b;

export function applyTest(world: PhysicsWorld, test: TestSpec, ctx: TestCtx): OverlayItem[] {
  if (test.kind === 'shake') return applyShake(world, test, ctx);

  // Every other test keeps the (kinematic) ground still.
  world.setLinearVelocity(ctx.ground, { x: 0, y: 0 });
  if (test.kind === 'wind') return applyWind(world, test, ctx);
  if (test.kind === 'blast') return applyBlast(world, test, ctx);
  return [];
}

function applyShake(world: PhysicsWorld, test: Extract<TestSpec, { kind: 'shake' }>, ctx: TestCtx): OverlayItem[] {
  const omega = 2 * Math.PI * test.frequency;
  const t = ctx.elapsed;
  const vx = test.amplitude * omega * Math.sin(omega * t) * Math.min(1, t);
  world.setLinearVelocity(ctx.ground, { x: vx, y: 0 });
  return [];
}

function applyWind(world: PhysicsWorld, test: Extract<TestSpec, { kind: 'wind' }>, ctx: TestCtx): OverlayItem[] {
  const sign = test.from === 'left' ? 1 : -1;
  const ramp = Math.min(1, ctx.elapsed / Math.max(test.ramp, 1e-6));
  for (const body of ctx.bodies) {
    // Wind applies no force to the fuzz (0%) — with no rolling resistance of its own (see
    // sim.ts's ROLL_DECEL), any nonzero sustained force would eventually roll it off any finite
    // perch regardless of the structure's material, which isn't what wind is meant to test.
    if (body.role === 'fuzz') continue;
    const fx = sign * test.strength * body.height * ramp;
    world.applyForce(body.id, { x: fx, y: 0 });
  }

  // 3 short arrow lines at the windward edge (the side the wind blows from).
  const edgeX = test.from === 'left' ? 1 : WORLD_W - 1;
  const overlay: OverlayItem[] = [];
  for (const y of [3, 6, 9]) {
    overlay.push({
      kind: 'line',
      a: { x: edgeX - sign * 0.5, y },
      b: { x: edgeX + sign * 0.5, y },
      color: WIND_COLOR,
      width: 3,
    });
  }
  return overlay;
}

function applyBlast(world: PhysicsWorld, test: Extract<TestSpec, { kind: 'blast' }>, ctx: TestCtx): OverlayItem[] {
  if (ctx.elapsed >= test.delay && !ctx.blastDone) {
    ctx.blastDone = true;
    for (const body of ctx.bodies) {
      const centre = world.getTransform(body.id).position;
      const dx = centre.x - test.at.x;
      const dy = centre.y - test.at.y;
      const rawDist = Math.hypot(dx, dy);
      const dist = Math.max(rawDist, 1);
      let J = test.impulse / dist;

      const hit = world.castRay(test.at, { x: dx, y: dy });
      if (hit && hit.body !== body.id) J *= 0.3;
      if (body.role === 'fuzz') J *= 0.2; // the fuzz gets 20% of the blast impulse

      const dirLen = rawDist || 1;
      world.applyImpulse(body.id, { x: (dx / dirLen) * J, y: (dy / dirLen) * J });
    }
  }

  const overlay: OverlayItem[] = [];
  if (ctx.elapsed >= test.delay && ctx.elapsed <= test.delay + BLAST_FADE) {
    const alpha = Math.max(0, 1 - (ctx.elapsed - test.delay) / BLAST_FADE);
    overlay.push({ kind: 'dot', p: test.at, r: 1.5, color: BLAST_COLOR, alpha });
  }
  return overlay;
}
