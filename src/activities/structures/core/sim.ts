// StructuresSim: owns one PhysicsWorld built from a level's PlacedPart[], runs the fixed-step
// simulation (pre-roll, glue, then a test), and derives Metrics/Outcome.
import { buildGround, buildPart, groundRenderItem } from './build';
import { MATERIALS } from './catalog';
import { buildGlue, checkGlueSpeed, markBroken, type GlueLink } from './glue';
import { applyTest, type TestBody, type TestCtx } from './tests';
import type {
  Bounds,
  BodyId,
  BodyRole,
  CourseSim,
  Material,
  Metrics,
  Outcome,
  OverlayItem,
  PartHandle,
  PlacedPart,
  RenderItem,
  SimSnapshot,
  StructuresLevel,
  Vec2,
} from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { PhysicsWorld, Transform } from '../../../physics/types';

export const PRE_ROLL_TICKS = 90;
export const POST_GLUE_TICKS = 10;
export const MAX_PREROLL_SPEED = 2; // m/s
/** The speed clamp only guards the first ticks, when overlapping parts pop apart. After that the
 * pre-roll is free fall, so a part spawned high still lands within the pre-roll. */
export const CLAMP_TICKS = 15;
export const COLLAPSE_DELAY = 1.5; // seconds after the fuzz first drops below the line
/** Constant rolling resistance on the fuzz, m/s^2 (same trick as goldberg/core/sim.ts's
 * ROLL_DECEL): the fuzz is a circle with no rolling resistance of its own, so without this it
 * rolls away under any sustained lateral force (wind, a shake, post-blast drift) regardless of
 * the structure's material. */
export const ROLL_DECEL = 2.5;

const GLUE_TICK_LEN = 0.25; // meters
const GLUE_COLOR = 0xffb40f;
const GLUE_BROKEN_COLOR = 0x6b7190;

type ShapeInfo =
  | { kind: 'box'; hw: number; hh: number; height: number; symmetry: number }
  | { kind: 'circle'; r: number; height: number };

function wrapSym(angle: number, symmetry: number): number {
  let a = angle % symmetry;
  if (a > symmetry / 2) a -= symmetry;
  if (a < -symmetry / 2) a += symmetry;
  return a;
}

export class StructuresSim implements CourseSim<Metrics, Outcome> {
  private readonly partHandles: PartHandle[] = [];
  private readonly bodyRole = new Map<BodyId, BodyRole>();
  private readonly bodyPartIndex = new Map<BodyId, number>();
  private readonly bodyMaterial = new Map<BodyId, Material>();
  private readonly bodyShape = new Map<BodyId, ShapeInfo>();
  private readonly ground: BodyId;
  private readonly walls: BodyId[];
  private fuzzBody: BodyId | null = null;

  private links: GlueLink[] = [];
  private baseline = new Map<BodyId, Transform>();
  private settledAnchors = new Map<number, Vec2>();
  private testBodies: TestBody[] = [];
  private testCtx: TestCtx;

  private playing = false;
  private elapsed = 0;
  private currentOutcome: Outcome = 'running';
  private fuzzDropElapsed: number | null = null;
  private fallenParts = new Set<number>();
  private lastOverlay: OverlayItem[] = [];

  constructor(
    private readonly world: PhysicsWorld,
    private readonly level: StructuresLevel,
    private readonly parts: PlacedPart[],
  ) {
    const { ground, walls } = buildGround(world);
    this.ground = ground;
    this.walls = walls;

    parts.forEach((part, index) => {
      const handle = buildPart(world, part);
      this.partHandles.push(handle);
      const body = handle.bodies[0]!;
      this.bodyRole.set(body.id, body.role as BodyRole);
      this.bodyPartIndex.set(body.id, index);

      if (part.kind === 'fuzz') {
        this.fuzzBody = body.id;
      } else {
        this.bodyMaterial.set(body.id, (part.props.material as Material) ?? 'wood');
      }

      const visual = handle.visuals[0]!;
      if (visual.shape.kind === 'box') {
        const { w, h } = visual.shape;
        const symmetry = Math.abs(w - h) < 1e-6 ? Math.PI / 2 : Math.PI;
        this.bodyShape.set(body.id, { kind: 'box', hw: w / 2, hh: h / 2, height: h, symmetry });
      } else if (visual.shape.kind === 'circle') {
        this.bodyShape.set(body.id, { kind: 'circle', r: visual.shape.r, height: 0.8 });
      }
    });

    this.testCtx = { elapsed: 0, ground: this.ground, bodies: [], blastDone: false };
  }

  /** Pre-roll (speed-clamped), glue from the settled transforms, 10 more ticks, then the
   * baseline transforms and settled bounds. Called once by `createStructuresSim`. */
  settle(): void {
    const dynamicIds = [...this.bodyRole.keys()];

    for (let i = 0; i < PRE_ROLL_TICKS; i++) {
      this.world.step(FIXED_DT, FIXED_SUBSTEPS);
      if (i >= CLAMP_TICKS) continue;
      for (const id of dynamicIds) {
        const v = this.world.getLinearVelocity(id);
        const speed = Math.hypot(v.x, v.y);
        if (speed > MAX_PREROLL_SPEED) {
          const scale = MAX_PREROLL_SPEED / speed;
          this.world.setLinearVelocity(id, { x: v.x * scale, y: v.y * scale });
        }
      }
    }

    if (this.level.glue !== false) {
      const settledTransforms = new Map<BodyId, Transform>();
      for (const id of dynamicIds) settledTransforms.set(id, this.world.getTransform(id));
      this.links = buildGlue(this.world, this.partHandles, (id) => this.bodyMaterial.get(id) ?? 'wood', settledTransforms);
    }

    for (let i = 0; i < POST_GLUE_TICKS; i++) this.world.step(FIXED_DT, FIXED_SUBSTEPS);

    this.baseline = new Map();
    for (const id of dynamicIds) this.baseline.set(id, this.world.getTransform(id));

    this.partHandles.forEach((handle) => {
      const body = handle.bodies[0]!;
      const t = this.baseline.get(body.id);
      if (!t) return;
      this.settledAnchors.set(handle.partId, { x: t.position.x, y: t.position.y });
      handle.bounds = this.computeBounds(body.id, t);
    });

    this.testBodies = dynamicIds.map((id) => ({
      id,
      role: this.bodyRole.get(id)!,
      height: this.bodyShape.get(id)?.height ?? 1,
    }));
    this.testCtx.bodies = this.testBodies;
    this.lastOverlay = this.glueOverlay();
  }

  play(): void {
    this.elapsed = 0;
    this.currentOutcome = 'running';
    this.fuzzDropElapsed = null;
    this.fallenParts = new Set();
    this.testCtx = { elapsed: 0, ground: this.ground, bodies: this.testBodies, blastDone: false };
    this.playing = true;
    for (const id of this.bodyRole.keys()) this.world.setLinearVelocity(id, { x: 0, y: 0 });
    this.lastOverlay = this.glueOverlay();
  }

  step(): void {
    if (!this.playing || this.currentOutcome !== 'running') return;

    this.applyRollingResistance();

    this.testCtx.elapsed = this.elapsed;
    const testOverlay = applyTest(this.world, this.level.test, this.testCtx);

    // Primary break rule: relative speed at the seam, checked right after the test applies its
    // velocity/impulse change and BEFORE world.step() — see the note on checkGlueSpeed's call
    // site in glue.ts for why (measured: the two hertz-12 spring joints absorb ~94% of any
    // instantaneous relative velocity within the very next world.step(), so checking after it
    // — as originally specified — never sees enough speed to cross a 3-9 m/s threshold from a
    // realistic kick or blast; checking here reads the true imparted speed instead).
    checkGlueSpeed(this.world, this.links);

    const result = this.world.step(FIXED_DT, FIXED_SUBSTEPS);
    this.elapsed += FIXED_DT;

    markBroken(this.links, result.broken); // fallback: joint's own (large) breakDistance
    this.updateLatches();

    if (this.fuzzDropElapsed !== null && this.elapsed >= this.fuzzDropElapsed + COLLAPSE_DELAY) {
      this.currentOutcome = 'collapsed';
    } else if (this.elapsed >= this.level.test.duration) {
      this.currentOutcome = 'survived';
    }

    this.lastOverlay = this.glueOverlay().concat(testOverlay);
  }

  snapshot(): SimSnapshot<Outcome> {
    const transforms = new Map<BodyId, Transform>();
    for (const id of this.world.bodies()) transforms.set(id, this.world.getTransform(id));
    return { elapsed: this.elapsed, outcome: this.currentOutcome, transforms, overlay: this.lastOverlay };
  }

  metrics(): Metrics {
    const fuzzHeight = this.fuzzBody !== null ? this.world.getTransform(this.fuzzBody).position.y : 0;
    const survivalTime =
      this.fuzzDropElapsed !== null
        ? Math.min(this.fuzzDropElapsed, this.level.test.duration)
        : Math.min(this.elapsed, this.level.test.duration);
    return {
      fuzzHeight,
      survivalTime,
      partsFell: this.fallenParts.size,
      partCount: this.parts.length,
      topHeight: this.computeTopHeight(),
    };
  }

  renderItems(): RenderItem[] {
    return [groundRenderItem(this.ground), ...this.partHandles.flatMap((h) => h.visuals)];
  }

  handles(): PartHandle[] {
    return [...this.partHandles];
  }

  /** Settled anchor (body centre) per part id, for `writeBackSettled`. */
  settledPositions(): Map<number, Vec2> {
    return new Map(this.settledAnchors);
  }

  get outcome(): Outcome {
    return this.currentOutcome;
  }

  destroy(): void {
    this.world.destroy();
  }

  // ---- internals -----------------------------------------------------------------------

  /** A constant deceleration opposing the fuzz's velocity, so it doesn't roll away forever
   * under a sustained force (wind, post-blast drift) with nothing to stop it. */
  private applyRollingResistance(): void {
    if (this.fuzzBody === null) return;
    const v = this.world.getLinearVelocity(this.fuzzBody);
    const speed = Math.hypot(v.x, v.y);
    if (speed <= 0.05) return;
    const m = this.world.getMass(this.fuzzBody);
    const f = (m * ROLL_DECEL) / speed;
    this.world.applyForce(this.fuzzBody, { x: -v.x * f, y: -v.y * f });
  }

  private updateLatches(): void {
    if (this.fuzzBody !== null && this.fuzzDropElapsed === null) {
      const fuzzY = this.world.getTransform(this.fuzzBody).position.y;
      if (fuzzY < this.level.keepAbove) this.fuzzDropElapsed = this.elapsed;
    }

    for (const [id, index] of this.bodyPartIndex) {
      if (id === this.fuzzBody || this.fallenParts.has(index)) continue;
      const info = this.bodyShape.get(id);
      const base = this.baseline.get(id);
      if (!info || info.kind !== 'box' || !base) continue;
      const t = this.world.getTransform(id);
      const dropped = base.position.y - t.position.y > 0.5;
      const tipped = Math.abs(wrapSym(t.angle - base.angle, info.symmetry)) > Math.PI / 4;
      if (dropped || tipped) this.fallenParts.add(index);
    }
  }

  private computeTopHeight(): number {
    let top = 0;
    for (const [id, index] of this.bodyPartIndex) {
      if (id === this.fuzzBody || this.fallenParts.has(index)) continue;
      const info = this.bodyShape.get(id);
      if (!info || info.kind !== 'box') continue;
      const t = this.world.getTransform(id);
      const c = Math.cos(t.angle);
      const s = Math.sin(t.angle);
      for (const corner of [
        { x: -info.hw, y: -info.hh },
        { x: info.hw, y: -info.hh },
        { x: info.hw, y: info.hh },
        { x: -info.hw, y: info.hh },
      ]) {
        const wy = t.position.y + s * corner.x + c * corner.y;
        if (wy > top) top = wy;
      }
    }
    return top;
  }

  private computeBounds(id: BodyId, t: Transform): Bounds {
    const info = this.bodyShape.get(id);
    if (!info) return { x: t.position.x, y: t.position.y, w: 0, h: 0 };
    if (info.kind === 'circle') {
      return { x: t.position.x, y: t.position.y, w: info.r * 2, h: info.r * 2 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const c = Math.cos(t.angle);
    const s = Math.sin(t.angle);
    for (const corner of [
      { x: -info.hw, y: -info.hh },
      { x: info.hw, y: -info.hh },
      { x: info.hw, y: info.hh },
      { x: -info.hw, y: info.hh },
    ]) {
      const wx = t.position.x + c * corner.x - s * corner.y;
      const wy = t.position.y + s * corner.x + c * corner.y;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
  }

  /** A short tick per glue link, at its seam midpoint; grey once broken.
   * Deviation: GlueLink carries no seam-orientation field, so every tick is drawn horizontal
   * regardless of whether the seam itself is horizontal or vertical (cosmetic only). */
  private glueOverlay(): OverlayItem[] {
    return this.links.map((link) => ({
      kind: 'line' as const,
      a: { x: link.p.x - GLUE_TICK_LEN / 2, y: link.p.y },
      b: { x: link.p.x + GLUE_TICK_LEN / 2, y: link.p.y },
      color: link.broken ? GLUE_BROKEN_COLOR : GLUE_COLOR,
    }));
  }
}

export async function createStructuresSim(parts: PlacedPart[], level: StructuresLevel): Promise<StructuresSim> {
  const world = await createWorld({ gravity: { x: 0, y: -10 } });
  const sim = new StructuresSim(world, level, parts);
  sim.settle();
  return sim;
}

// Re-exported so glue.test.ts and sim.test.ts can build the same materials the sim uses.
export { MATERIALS };
