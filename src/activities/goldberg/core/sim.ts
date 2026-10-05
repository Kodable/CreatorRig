// GoldbergSim: owns one PhysicsWorld built from a level's PlacedPart[], runs the fixed-step
// simulation, and derives Outcome/Metrics from body roles + contacts.
import { buildBounds, buildPart } from './build';
import { propNumber } from './catalog';
import type { BodyId, BodyRole, Metrics, Outcome, PartHandle, PlacedPart, RenderItem, SimSnapshot, Transform } from './types';
import type { CourseSim } from '../../../kit/types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { PhysicsWorld } from '../../../physics/types';

export const SETTLE_TICKS = 60;
export const TIMEOUT_S = 30;
/** Constant rolling resistance on fuzzes, m/s^2. Exponential damping alone leaves a long slow tail;
 * a constant deceleration makes a fuzz stop crisply so the 'settled' outcome comes quickly. */
export const ROLL_DECEL = 0.8;

/** Roles built as (or switched to) dynamic bodies; every other role is static for the whole run. */
const DYNAMIC_ROLES = new Set<BodyRole>(['fuzz', 'domino', 'plank', 'beam']);

const MOVE_DIST_EPS = 0.05; // meters
const MOVE_ANGLE_EPS = 0.05; // radians
const QUIET_LINEAR = 0.08; // m/s
const QUIET_ANGULAR = 0.2; // rad/s
const QUIET_DURATION = 1.5; // seconds
const SETTLE_MIN_ELAPSED = 1; // seconds

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

interface DoorState {
  body: BodyId;
  openTime: number;
  destroyed: boolean;
}

export class GoldbergSim implements CourseSim<Metrics, Outcome> {
  private readonly world: PhysicsWorld;
  private readonly parts: PlacedPart[];
  private readonly partHandles: PartHandle[] = [];
  private readonly bodyRole = new Map<BodyId, BodyRole>();
  private readonly bodyPartIndex = new Map<BodyId, number>();
  private readonly fuzzBodies: BodyId[] = [];
  private readonly doors: DoorState[] = [];
  private baseline = new Map<BodyId, Transform>();
  private movedParts = new Set<number>();

  private playing = false;
  private elapsed = 0;
  private quietTimer = 0;
  private maxSpeedSeen = 0;
  private currentOutcome: Outcome = 'running';
  private currentDoorOpen = true;

  constructor(world: PhysicsWorld, parts: PlacedPart[]) {
    this.world = world;
    this.parts = parts;

    buildBounds(world);

    parts.forEach((part, index) => {
      const handle = buildPart(world, part);
      this.partHandles.push(handle);
      for (const b of handle.bodies) {
        // The kit's PartHandle types a body's role as plain `string`; build.ts always assigns a
        // real BodyRole value, so this narrows it back for the maps below.
        this.bodyRole.set(b.id, b.role as BodyRole);
        this.bodyPartIndex.set(b.id, index);
        if (b.role === 'fuzz') this.fuzzBodies.push(b.id);
        if (b.role === 'door') {
          const openTime = propNumber('gate', 'openTime', part.props.openTime ?? '');
          this.doors.push({ body: b.id, openTime, destroyed: false });
        }
      }
    });

    this.currentDoorOpen = this.doors.length === 0;
  }

  /** Pre-roll: step SETTLE_TICKS ticks, then record the baseline transform of every body. */
  settle(): void {
    for (let i = 0; i < SETTLE_TICKS; i++) this.world.step(FIXED_DT, FIXED_SUBSTEPS);
    this.baseline = new Map();
    for (const id of this.world.bodies()) this.baseline.set(id, this.world.getTransform(id));
    this.movedParts = new Set();
  }

  play(): void {
    for (const id of this.fuzzBodies) this.world.setBodyType(id, 'dynamic');
    this.elapsed = 0;
    this.quietTimer = 0;
    this.maxSpeedSeen = 0;
    this.currentOutcome = 'running';
    this.playing = true;
  }

  step(): void {
    if (!this.playing) return;

    // Rolling resistance: a constant deceleration opposing each fuzz's velocity.
    for (const id of this.fuzzBodies) {
      const v = this.world.getLinearVelocity(id);
      const speed = Math.hypot(v.x, v.y);
      if (speed < 0.05) continue;
      const m = this.world.getMass(id);
      const f = (m * ROLL_DECEL) / speed;
      this.world.applyForce(id, { x: -v.x * f, y: -v.y * f });
    }

    const result = this.world.step(FIXED_DT, FIXED_SUBSTEPS);
    this.elapsed += FIXED_DT;

    // (1) contacts: tooEarly wins over reachedGate in the same tick.
    if (this.currentOutcome === 'running') {
      let tooEarly = false;
      let reachedGate = false;
      for (const c of result.contacts) {
        if (!c.began) continue;
        const roleA = this.bodyRole.get(c.bodyA);
        const roleB = this.bodyRole.get(c.bodyB);
        const dynA = this.isDynamic(roleA);
        const dynB = this.isDynamic(roleB);
        if ((roleA === 'door' && dynB) || (roleB === 'door' && dynA)) tooEarly = true;
        if ((roleA === 'sensor' && dynB) || (roleB === 'sensor' && dynA)) {
          if (this.currentDoorOpen) reachedGate = true;
          else tooEarly = true;
        }
      }
      if (tooEarly) this.currentOutcome = 'tooEarly';
      else if (reachedGate) this.currentOutcome = 'reachedGate';
    }

    // (2) door: destroy once elapsed reaches openTime; doorOpen once no door body remains.
    for (const door of this.doors) {
      if (!door.destroyed && this.elapsed >= door.openTime) {
        this.world.destroyBody(door.body);
        door.destroyed = true;
      }
    }
    this.currentDoorOpen = this.doors.every(d => d.destroyed);

    // (3) timeout.
    if (this.currentOutcome === 'running' && this.elapsed >= TIMEOUT_S) {
      this.currentOutcome = 'timeout';
    }

    // (4) settled: quiet for QUIET_DURATION seconds continuously, after SETTLE_MIN_ELAPSED.
    if (this.currentOutcome === 'running') {
      const quietNow = this.allDynamicBodiesQuiet();
      this.quietTimer = quietNow ? this.quietTimer + FIXED_DT : 0;
      if (this.elapsed > SETTLE_MIN_ELAPSED && this.quietTimer >= QUIET_DURATION) {
        this.currentOutcome = 'settled';
      }
    }

    // (5) latches: a part counts as moved once any dynamic-role body strays from its baseline.
    for (const id of this.world.bodies()) {
      const role = this.bodyRole.get(id);
      if (!role || !DYNAMIC_ROLES.has(role)) continue;
      const base = this.baseline.get(id);
      if (!base) continue;
      const t = this.world.getTransform(id);
      const dx = t.position.x - base.position.x;
      const dy = t.position.y - base.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dAngle = Math.abs(wrapAngle(t.angle - base.angle));
      if (dist > MOVE_DIST_EPS || dAngle > MOVE_ANGLE_EPS) {
        const partIndex = this.bodyPartIndex.get(id);
        if (partIndex !== undefined) this.movedParts.add(partIndex);
      }
    }

    // (6) maxSpeed over dynamic bodies, across the whole run.
    for (const id of this.world.bodies()) {
      const role = this.bodyRole.get(id);
      if (!role || !DYNAMIC_ROLES.has(role)) continue;
      const v = this.world.getLinearVelocity(id);
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);
      if (speed > this.maxSpeedSeen) this.maxSpeedSeen = speed;
    }
  }

  snapshot(): SimSnapshot {
    const transforms = new Map<BodyId, Transform>();
    for (const id of this.world.bodies()) transforms.set(id, this.world.getTransform(id));
    return {
      elapsed: this.elapsed,
      outcome: this.currentOutcome,
      transforms,
      partsMoved: this.movedParts.size,
      doorOpen: this.currentDoorOpen,
    };
  }

  metrics(): Metrics {
    return {
      reachedGate: this.currentOutcome === 'reachedGate' ? 1 : 0,
      elapsed: this.elapsed,
      partsMoved: this.movedParts.size,
      partCount: this.parts.length,
      maxSpeed: this.maxSpeedSeen,
    };
  }

  renderItems(): RenderItem[] {
    return this.partHandles.flatMap(h => h.visuals);
  }

  handles(): PartHandle[] {
    return [...this.partHandles];
  }

  get outcome(): Outcome {
    return this.currentOutcome;
  }

  destroy(): void {
    this.world.destroy();
  }

  private isDynamic(role: BodyRole | undefined): boolean {
    return role !== undefined && DYNAMIC_ROLES.has(role);
  }

  private allDynamicBodiesQuiet(): boolean {
    for (const id of this.world.bodies()) {
      const role = this.bodyRole.get(id);
      if (!role || !DYNAMIC_ROLES.has(role)) continue;
      const v = this.world.getLinearVelocity(id);
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);
      if (speed >= QUIET_LINEAR) return false;
      if (Math.abs(this.world.getAngularVelocity(id)) >= QUIET_ANGULAR) return false;
    }
    return true;
  }
}

export async function createGoldbergSim(parts: PlacedPart[]): Promise<GoldbergSim> {
  const world = await createWorld({ gravity: { x: 0, y: -10 } });
  const sim = new GoldbergSim(world, parts);
  sim.settle();
  return sim;
}
