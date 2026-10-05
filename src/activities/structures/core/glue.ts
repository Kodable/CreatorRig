// Breakable "glue" between touching block/beam boxes: two spring distance joints per seam.
// DEVIATION (per the coordinator, 2026-09-15): the primary break rule is no longer the joints'
// own `breakDistance` (BaseWorld.checkBreakables) — that rule is kept only as a rarely-firing
// fallback (a large 0.3 m distance). The real rule is relative SPEED at the seam, checked in
// sim.ts every tick via `seamRelativeSpeed`/`checkGlueSpeed`: a glue link snaps once the two
// bodies' velocities at the seam point diverge by more than `breakSpeed` (per material, the
// weaker of the two). This is what lets a blast (a sharp velocity spike) break wood glue while a
// gentle shake (which the seam mostly rides out as one rigid unit, per the plan's own physics
// note) does not.
import { MATERIALS } from './catalog';
import type { BodyId, JointId, Material, PartHandle, Vec2 } from './types';
import type { PhysicsWorld, Transform } from '../../../physics/types';

export interface GlueLink {
  a: BodyId;
  b: BodyId;
  /** Seam midpoint, world meters — where the overlay draws its tick. */
  p: Vec2;
  joints: JointId[];
  broken: boolean;
  /** Fallback distance-break threshold (see the file header). Not the primary break rule. */
  breakDistance: number;
  /** Primary break rule: relative speed at the seam (m/s), the weaker of the two materials'. */
  breakSpeed: number;
  // Local anchors (added beyond the plan's literal GlueLink template) — the seam midpoint `p`
  // in each body's own local frame at build time, needed to track the seam point as each body
  // moves/rotates, for the relative-speed break check.
  localA: Vec2;
  localB: Vec2;
}

const GAP_EPS = 0.05; // meters: max gap between edges to count as "touching"
const MIN_SEAM = 0.3; // meters: minimum shared segment to glue
const INSET = 0.05; // meters: anchors sit this far in from the segment's ends
const ANGLE_EPS = 0.05; // radians: boxes rotated past this are skipped (not axis-aligned)
const SPRING = { hertz: 12, dampingRatio: 1 };
/** Fallback joint breakDistance: large enough that BaseWorld.checkBreakables practically never
 * fires on its own — the relative-speed rule (checkGlueSpeed) is what actually snaps a link. */
const FALLBACK_BREAK_DISTANCE = 0.3;

interface Box {
  id: BodyId;
  hw: number;
  hh: number;
  pos: Vec2;
  angle: number;
}

function rotate(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** World point to a box's local frame, using its own (small) settled angle. */
function toLocal(box: Box, world: Vec2): Vec2 {
  const dx = world.x - box.pos.x;
  const dy = world.y - box.pos.y;
  return rotate({ x: dx, y: dy }, -box.angle);
}

/** Axis-aligned (|angle| < ANGLE_EPS) block/beam boxes from the settled handles. */
function collectBoxes(handles: PartHandle[], transforms: Map<BodyId, Transform>): Box[] {
  const boxes: Box[] = [];
  for (const h of handles) {
    if (h.kind !== 'block' && h.kind !== 'beam') continue;
    const body = h.bodies[0];
    const visual = h.visuals[0];
    if (!body || !visual || visual.shape.kind !== 'box') continue;
    const t = transforms.get(body.id);
    if (!t) continue;
    if (Math.abs(t.angle) >= ANGLE_EPS) continue;
    boxes.push({ id: body.id, hw: visual.shape.w / 2, hh: visual.shape.h / 2, pos: t.position, angle: t.angle });
  }
  return boxes;
}

/** The two anchor points (inset from the shared segment's ends) if `a` and `b` touch along a
 * horizontal or vertical seam; null otherwise. Boxes are treated as axis-aligned. */
function findSeam(a: Box, b: Box): [Vec2, Vec2] | null {
  const aLeft = a.pos.x - a.hw;
  const aRight = a.pos.x + a.hw;
  const aBottom = a.pos.y - a.hh;
  const aTop = a.pos.y + a.hh;
  const bLeft = b.pos.x - b.hw;
  const bRight = b.pos.x + b.hw;
  const bBottom = b.pos.y - b.hh;
  const bTop = b.pos.y + b.hh;

  // Horizontal seam: one box's bottom rests on the other's top (stacked).
  const gapATopB = Math.abs(bBottom - aTop);
  const gapBTopA = Math.abs(aBottom - bTop);
  if (Math.min(gapATopB, gapBTopA) <= GAP_EPS) {
    const seamY = gapATopB <= gapBTopA ? (aTop + bBottom) / 2 : (bTop + aBottom) / 2;
    const x0 = Math.max(aLeft, bLeft);
    const x1 = Math.min(aRight, bRight);
    if (x1 - x0 >= MIN_SEAM) {
      return [
        { x: x0 + INSET, y: seamY },
        { x: x1 - INSET, y: seamY },
      ];
    }
  }

  // Vertical seam: one box's right edge rests on the other's left edge (side by side).
  const gapARightB = Math.abs(bLeft - aRight);
  const gapBRightA = Math.abs(aLeft - bRight);
  if (Math.min(gapARightB, gapBRightA) <= GAP_EPS) {
    const seamX = gapARightB <= gapBRightA ? (aRight + bLeft) / 2 : (bRight + aLeft) / 2;
    const y0 = Math.max(aBottom, bBottom);
    const y1 = Math.min(aTop, bTop);
    if (y1 - y0 >= MIN_SEAM) {
      return [
        { x: seamX, y: y0 + INSET },
        { x: seamX, y: y1 - INSET },
      ];
    }
  }

  return null;
}

export function buildGlue(
  world: PhysicsWorld,
  handles: PartHandle[],
  materialOf: (body: BodyId) => Material,
  transforms: Map<BodyId, Transform>,
): GlueLink[] {
  const boxes = collectBoxes(handles, transforms);
  const links: GlueLink[] = [];

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const seam = findSeam(a, b);
      if (!seam) continue;

      const breakSpeed = Math.min(MATERIALS[materialOf(a.id)].breakSpeed, MATERIALS[materialOf(b.id)].breakSpeed);

      const joints: JointId[] = seam.map((p) =>
        world.createJoint({
          kind: 'distance',
          bodyA: a.id,
          bodyB: b.id,
          anchorA: toLocal(a, p),
          anchorB: toLocal(b, p),
          length: 0,
          spring: SPRING,
          breakDistance: FALLBACK_BREAK_DISTANCE,
        }),
      );

      const p = { x: (seam[0]!.x + seam[1]!.x) / 2, y: (seam[0]!.y + seam[1]!.y) / 2 };
      links.push({
        a: a.id,
        b: b.id,
        p,
        joints,
        broken: false,
        breakDistance: FALLBACK_BREAK_DISTANCE,
        breakSpeed,
        localA: toLocal(a, p),
        localB: toLocal(b, p),
      });
    }
  }

  return links;
}

export function markBroken(links: GlueLink[], brokenJointIds: JointId[]): void {
  if (brokenJointIds.length === 0) return;
  const broken = new Set(brokenJointIds);
  for (const link of links) {
    if (!link.broken && link.joints.some((j) => broken.has(j))) link.broken = true;
  }
}

/** Relative speed (m/s) between the two bodies at the seam point: each body's linear velocity
 * plus omega x r, where r is the seam point (tracked via the link's local anchors) minus that
 * body's current centre. */
export function seamRelativeSpeed(world: PhysicsWorld, link: GlueLink): number {
  const ta = world.getTransform(link.a);
  const tb = world.getTransform(link.b);
  const rA = rotate(link.localA, ta.angle);
  const rB = rotate(link.localB, tb.angle);
  const va = world.getLinearVelocity(link.a);
  const vb = world.getLinearVelocity(link.b);
  const wa = world.getAngularVelocity(link.a);
  const wb = world.getAngularVelocity(link.b);
  // 2D: omega x r = omega * (-r.y, r.x)
  const pointVelA = { x: va.x - wa * rA.y, y: va.y + wa * rA.x };
  const pointVelB = { x: vb.x - wb * rB.y, y: vb.y + wb * rB.x };
  return Math.hypot(pointVelA.x - pointVelB.x, pointVelA.y - pointVelB.y);
}

/** Primary break rule: snap any unbroken link whose seam relative speed exceeds its
 * (material-derived) breakSpeed. Call once per tick, right after the test (shake/wind/blast)
 * applies its velocity/impulse change and BEFORE world.step(). DEVIATION from the original
 * "check after world.step" instruction: measured, the two hertz-12/dampingRatio-1 spring joints
 * absorb ~94% of any instantaneous relative velocity within that very step (a 4 m/s kick reads
 * back at ~0.23 m/s one step later, and never climbs past ~0.09 over the following 29 ticks) —
 * so checking after world.step effectively never crosses a 3-9 m/s breakSpeed for any realistic
 * kick or blast. Checking here, before the joint has a step to react, reads the true imparted
 * speed (a 4 m/s kick or an equivalent applyImpulse both read back as exactly 4 m/s). */
export function checkGlueSpeed(world: PhysicsWorld, links: GlueLink[]): void {
  for (const link of links) {
    if (link.broken) continue;
    if (seamRelativeSpeed(world, link) > link.breakSpeed) {
      for (const j of link.joints) world.destroyJoint(j);
      link.broken = true;
    }
  }
}
