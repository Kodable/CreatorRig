// BridgeSim: owns one PhysicsWorld built from a level's PlacedPart[] (anchors, joints, rods) plus
// a buggy driven in from the vehicle course, runs the fixed-step self-driving simulation
// (settle -> play -> cross -> outcome), and derives Metrics/Outcome.
import { MATERIALS, totalCost } from './catalog';
import { buildBanks, buildNode, buildRod, WORLD_H, WORLD_W } from './build';
import type { NodeRef } from './build';
import type {
  BodyId,
  BridgeLevel,
  CourseSim,
  Metrics,
  OverlayItem,
  Outcome,
  PartHandle,
  PlacedPart,
  RenderItem,
  RodHandle,
  SimSnapshot,
  Vec2,
} from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { PhysicsWorld, Transform } from '../../../physics/types';
import type { PartHandle as KitPartHandle } from '../../../kit/types';
import { buildPart as buildVehiclePart } from '../../vehicle/core/build';
import { POWER, WHEEL_R } from '../../vehicle/core/catalog';
import { DRIVE_SIGN } from '../../vehicle/core/sim';
import type { PlacedPart as VehiclePlacedPart } from '../../vehicle/core/types';

export { WORLD_W, WORLD_H };

/** Ticks the pre-roll runs before Play: the bridge sags under its own weight while the buggy
 * waits on the bank. Stress is checked every pre-roll tick too, so an absurd design can already
 * snap before the child presses Play. */
export const PRE_ROLL_TICKS = 60;

/** `crossed` fires once the chassis is this far past the right bank. */
export const CROSS_MARGIN = 1.5;
/** `fell` fires once the chassis drops below this world y (independent of bank height). */
export const FALL_Y = 2;
export const STUCK_MIN_TIME = 4;
export const STUCK_WINDOW_S = 3;
export const STUCK_DELTA = 0.2;
export const TIMEOUT_S = 30;

const WATER_COLOR = 0x05aeed;
const STRESS_GREEN = 0x61bb46;
const STRESS_ORANGE = 0xffb40f;
const STRESS_RED = 0xe0392f;

const BUGGY_X = 1.5;
/** Where the buggy is spawned on the left bank, per the vehicle course's own wheel-seating logic
 * (chassis rides `wheel radius + 0.02 + 0.2` above the ground it is built on). Kept only for
 * clarity; the real seating comes from the synthetic profile below plus `buildVehiclePart`. */
const BUGGY_CHASSIS_CLEARANCE = 0.65;

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function stressColor(stress: number): number {
  const s = Math.min(1, Math.max(0, stress));
  return s <= 0.5 ? lerpColor(STRESS_GREEN, STRESS_ORANGE, s / 0.5) : lerpColor(STRESS_ORANGE, STRESS_RED, (s - 0.5) / 0.5);
}

/** A flat profile at the banks' top, dropped to y 0 between leftX and rightX (the river bed),
 * used only so the vehicle course's `buildPart` can seat the buggy's wheels on the left bank via
 * `heightAt`. The near-vertical edges use a 0.01 m x offset (no duplicate x, matching the vehicle
 * course's own `withGap` convention) rather than a real terrain body - the actual bridge crossing
 * is carried entirely by the banks + deck bodies built below. */
function bankProfile(level: BridgeLevel): Vec2[] {
  const { leftX, rightX, y } = level.banks;
  const eps = 0.01;
  return [
    { x: -1, y },
    { x: leftX, y },
    { x: leftX + eps, y: 0 },
    { x: rightX - eps, y: 0 },
    { x: rightX, y },
    { x: 31, y },
  ];
}

export class BridgeSim implements CourseSim<Metrics, Outcome> {
  private readonly nodeHandles: PartHandle[] = [];
  private readonly nodes = new Map<number, { body: BodyId; kind: 'anchor' | 'joint' }>();
  private readonly rods = new Map<number, RodHandle>();
  private readonly brokenRodIds = new Set<number>();
  private readonly stressByPart = new Map<number, number>();
  private readonly bankItems: RenderItem[];
  /** The vehicle course's own `PartHandle` instantiation (kind: 'vehicle'), not the bridge's -
   * the buggy is not a bridge part and never appears in `handles()`. */
  private readonly buggyHandle: KitPartHandle;

  private readonly chassisBody: BodyId;
  private readonly wheelJoints: number[] = [];
  private readonly wheelR = WHEEL_R.M!;
  private readonly power = POWER.Medium!;

  private rodsBrokenCount = 0;
  private maxStressValue = 0;

  private playing = false;
  private currentOutcome: Outcome = 'running';
  private timeValue = 0;
  private runningMaxX = -Infinity;
  private maxXSamples: number[] = [];

  constructor(
    private readonly world: PhysicsWorld,
    private readonly level: BridgeLevel,
    private readonly parts: PlacedPart[],
  ) {
    const banks = buildBanks(world, level);
    this.bankItems = banks.items;

    for (const part of parts) {
      if (part.kind !== 'anchor' && part.kind !== 'joint') continue;
      const handle = buildNode(world, part);
      this.nodeHandles.push(handle);
      this.nodes.set(part.id, { body: handle.bodies[0]!.id, kind: part.kind });
    }

    const nodeRefs = new Map<number, NodeRef>();
    for (const [id, n] of this.nodes) nodeRefs.set(id, { body: n.body, static: n.kind === 'anchor' });

    for (const part of parts) {
      if (part.kind !== 'rod') continue;
      const rod = buildRod(world, part, nodeRefs);
      this.rods.set(part.id, rod);
    }

    // Edit mode does not simulate the bridge: every joint is held static until Play, so a
    // half-built shape (one rod on a pin, a flat road with a free middle joint) stays where the
    // child drew it instead of swinging or sagging during the pre-roll. Play releases the joints.
    for (const n of this.nodes.values()) {
      if (n.kind === 'joint') world.setBodyType(n.body, 'static');
    }

    const vehiclePart: VehiclePlacedPart = {
      id: -2,
      kind: 'vehicle',
      x: BUGGY_X,
      y: level.banks.y + BUGGY_CHASSIS_CLEARANCE,
      props: {
        wheelShape: 'round',
        wheelSize: 'M',
        power: 'Medium',
        suspension: 'None',
        weight: level.load.weight,
      },
    };
    this.buggyHandle = buildVehiclePart(world, vehiclePart, bankProfile(level));
    this.chassisBody = this.buggyHandle.bodies.find((b) => b.role === 'chassis')!.id;
    this.wheelJoints.push(...this.buggyHandle.joints);
    for (const j of this.wheelJoints) this.world.setMotor(j, 0, 0);

    for (let i = 0; i < PRE_ROLL_TICKS; i++) {
      this.world.step(FIXED_DT, FIXED_SUBSTEPS);
      this.checkStress();
    }
  }

  /** The settled centre of every joint (child-placed node), so the app can write the post-sag
   * pose back into the parts. Anchors and rods are never written back. */
  settledPositions(): Map<number, Vec2> {
    const map = new Map<number, Vec2>();
    for (const [id, n] of this.nodes) {
      if (n.kind !== 'joint') continue;
      const t = this.world.getTransform(n.body);
      map.set(id, { x: t.position.x, y: t.position.y });
    }
    return map;
  }

  /** Live stress (0..1) per rod part id, for a HUD or debug readout. */
  rodStress(): Map<number, number> {
    return new Map(this.stressByPart);
  }

  play(): void {
    for (const n of this.nodes.values()) {
      if (n.kind === 'joint') this.world.setBodyType(n.body, 'dynamic');
    }
    for (const j of this.wheelJoints) {
      this.world.setMotor(j, (DRIVE_SIGN * this.power.speed) / this.wheelR, this.power.torque);
    }
    const t = this.world.getTransform(this.chassisBody);
    this.timeValue = 0;
    this.runningMaxX = t.position.x;
    this.maxXSamples = [this.runningMaxX];
    this.currentOutcome = 'running';
    this.playing = true;
  }

  step(): void {
    if (!this.playing || this.currentOutcome !== 'running') return;

    this.timeValue += FIXED_DT;
    this.world.step(FIXED_DT, FIXED_SUBSTEPS);
    this.checkStress();

    const t = this.world.getTransform(this.chassisBody);
    this.runningMaxX = Math.max(this.runningMaxX, t.position.x);
    const bucket = Math.floor(this.timeValue);
    this.maxXSamples[bucket] = this.runningMaxX;

    if (t.position.x > this.level.banks.rightX + CROSS_MARGIN) {
      this.endRun('crossed');
    } else if (t.position.y < FALL_Y) {
      this.endRun('fell');
    } else if (this.timeValue >= STUCK_MIN_TIME && this.isStuck(bucket)) {
      this.endRun('stuck');
    } else if (this.timeValue >= TIMEOUT_S) {
      this.endRun('timeout');
    }
  }

  private isStuck(bucket: number): boolean {
    if (bucket < STUCK_WINDOW_S) return false;
    const now = this.maxXSamples[bucket];
    const past = this.maxXSamples[bucket - STUCK_WINDOW_S];
    if (now === undefined || past === undefined) return false;
    return now - past < STUCK_DELTA;
  }

  private endRun(outcome: Outcome): void {
    this.currentOutcome = outcome;
    for (const j of this.wheelJoints) this.world.setMotor(j, 0, 0);
  }

  /** Strain check for every live rod with a spring (anchor-to-anchor rods have none and never
   * break): `gap` between the two node world points vs. the rod's rest length, `stress` clamped
   * 0..1 (tension and compression use the material's own limits). At 1 the spring - and, for a
   * road rod, its deck and slider - are destroyed and `rodsBroken` counts it. Runs during the
   * pre-roll too so an absurd dead-load design can already snap before Play. */
  private checkStress(): void {
    for (const rod of this.rods.values()) {
      if (this.brokenRodIds.has(rod.part.id)) continue;
      if (rod.joint === null) {
        this.stressByPart.set(rod.part.id, 0);
        continue;
      }

      const pa = this.world.worldPoint(rod.nodeA, { x: 0, y: 0 });
      const pb = this.world.worldPoint(rod.nodeB, { x: 0, y: 0 });
      const gap = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const strain = (gap - rod.restLength) / rod.restLength;
      const spec = MATERIALS[rod.material];
      const raw = strain > 0 ? strain / spec.tension : -strain / spec.compression;
      const stress = Math.min(1, Math.max(0, raw));
      this.stressByPart.set(rod.part.id, stress);
      if (stress > this.maxStressValue) this.maxStressValue = stress;

      if (stress >= 1) {
        this.world.destroyJoint(rod.joint);
        for (const b of rod.bodies) this.world.destroyBody(b);
        rod.joint = null;
        rod.bodies = [];
        this.brokenRodIds.add(rod.part.id);
        this.rodsBrokenCount++;
      }
    }
  }

  metrics(): Metrics {
    return {
      crossed: this.currentOutcome === 'crossed' ? 1 : 0,
      rodsBroken: this.rodsBrokenCount,
      cost: totalCost(this.parts),
      maxStress: this.maxStressValue,
      time: this.timeValue,
    };
  }

  snapshot(): SimSnapshot<Outcome> {
    const transforms = new Map<BodyId, Transform>();
    for (const id of this.world.bodies()) transforms.set(id, this.world.getTransform(id));

    const overlay: OverlayItem[] = [];
    const { leftX, rightX } = this.level.banks;
    overlay.push({
      kind: 'line',
      a: { x: leftX, y: 0.5 },
      b: { x: rightX, y: 0.5 },
      color: WATER_COLOR,
      width: 32,
      alpha: 0.5,
    });

    for (const rod of this.rods.values()) {
      if (this.brokenRodIds.has(rod.part.id)) continue;
      const pa = this.world.getTransform(rod.nodeA).position;
      const pb = this.world.getTransform(rod.nodeB).position;
      const stress = this.stressByPart.get(rod.part.id) ?? 0;
      overlay.push({
        kind: 'line',
        a: pa,
        b: pb,
        color: stressColor(stress),
        width: rod.material === 'cable' ? 3 : 5,
        alpha: rod.material === 'road' ? 0.9 : 1,
      });
    }

    return { elapsed: this.timeValue, outcome: this.currentOutcome, transforms, overlay };
  }

  renderItems(): RenderItem[] {
    const items: RenderItem[] = [...this.bankItems];
    for (const h of this.nodeHandles) items.push(...h.visuals);
    for (const rod of this.rods.values()) items.push(...rod.handle.visuals);
    items.push(...this.buggyHandle.visuals);
    return items;
  }

  handles(): PartHandle[] {
    return [...this.nodeHandles, ...[...this.rods.values()].map((r) => r.handle)];
  }

  get outcome(): Outcome {
    return this.currentOutcome;
  }

  destroy(): void {
    this.world.destroy();
  }
}

export async function createBridgeSim(parts: PlacedPart[], level: BridgeLevel): Promise<BridgeSim> {
  const world = await createWorld({ gravity: { x: 0, y: -10 } });
  return new BridgeSim(world, level, parts);
}
