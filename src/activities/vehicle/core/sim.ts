// VehicleSim: owns one PhysicsWorld built from a level's parts, runs the fixed-step self-driving
// simulation (build -> Play -> drive -> outcome), and derives Metrics/Outcome.
//
// Driving: every wheel's motor turns it so the rover rolls toward +x at DRIVE.speed (torque
// capped at DRIVE.torque), and freewheels when the wheel already turns faster than that (a jet
// can push the rover past its wheels' speed). Each wheel's spin direction follows the motor sign
// rule (`driveSign`): re-chosen every step from where the wheel is, in world space, relative to
// the dome's centre (below: the normal spin; above: reversed; resting on the ground: always the
// normal spin), so the rover drives forward on its roof too. Every propulsion part pushes
// the dome away from itself along its outward axis: fan and jet steadily, the stove in puffs.
// Outcomes: finished (touched the beacon), fell, stuck (no progress for STUCK_WINDOW_S after
// STUCK_MIN_TIME), timeout. Upside down is not an outcome since 2026-10-05 (Gao: "Allow the car
// to be upside down. Kids should be able to place wheels all over the car and have it drive
// upside down"): a rover on its roof keeps driving if wheels touch the ground, and ends `stuck`
// if none do. Full turns are still counted (`flips`) for fun and for goals.
import { PICS, PART_PPM, POOF_ART, THRUST_ART } from './art';
import { buildPart, buildRover, buildTerrain, buildWalls, refreshBounds, SHADOW_LIFT } from './build';
import type { AttachmentHandle, RoverBuild } from './build';
import { DRIVE, POWER_FORCE, STOVE_ON, STOVE_PERIOD, WHEEL, isPower, isWheel } from './catalog';
import { normalizeRoverParts } from './geometry';
import { distanceToGround, heightAt } from './terrain';
import type {
  BodyId,
  CourseSim,
  Metrics,
  OverlayItem,
  Outcome,
  PartHandle,
  RenderItem,
  RoverPart,
  SimSnapshot,
  Vec2,
  VehicleLevel,
} from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { PhysicsWorld, Transform } from '../../../physics/types';

/** Ticks simulated before Play. 0: edit mode shows the rover exactly as built (a lopsided build
 * tips over when Play starts, not while the child is still building it, and a drag always
 * starts from where the part is drawn). The level places the build GROUND_CLEARANCE above the
 * ground (geometry.ts), so it only settles a couple of centimeters when Play starts. The Bridge
 * course keeps its own pre-roll. */
export const PRE_ROLL_TICKS = 0;

/** Motor speed sign that drives the rover in +x: at wheel radius r and target ground speed v the
 * motor target is `DRIVE_SIGN * v / r` (a clockwise turn). Measured against
 * `src/physics/smoke.test.ts`'s "wheel motor holds its target speed" test; the Bridge course
 * imports it for its buggy. */
export const DRIVE_SIGN = -1;

/** The `upsideDown` metric counts the meters the rover gains toward +x while the dome is turned
 * more than this far (radians, ~100 deg) from upright: driving on its roof, not just tipping. */
export const ROOF_ANGLE = 1.745;
/** `stuck` may fire once at least this much time has elapsed. */
export const STUCK_MIN_TIME = 4;
/** `stuck` compares the running-max x now against the running-max x this many seconds ago. */
export const STUCK_WINDOW_S = 3;
export const STUCK_DELTA = 0.2;
/** Seconds before `timeout`, unless the level sets its own (`VehicleLevel.timeout`). */
export const TIMEOUT_S = 30;
/** `fell` fires once the dome's centre drops below this (m): out of the bottom of the view (the
 * kit shows 1.5 m under y = 0). Every pit floor is at -3 (terrain.ts), so a rover standing on its
 * wheels at the bottom of one (dome ~1.15 m up, at -1.85) has fallen too, not just one that lands
 * on its roof. Real ground never dips below -1.2 (the Canyon climb's dip). Was -2 before
 * 2026-10-05. */
export const FALL_Y = -1.6;

/** Drawn width (m) of the jet's flame and the stove's puff of smoke. */
export const THRUST_W = 0.55;
export const POOF_W = 0.26;

/** A wheel counts as ABOVE the dome (and spins the other way) only when it sits more than this
 * far (radians, 20 deg) above the level of the dome's centre: a nose or tail wheel near that
 * level keeps the normal spin (pressed against a step or a wall in front of it, that is the spin
 * that climbs). */
export const ABOVE_DEG = (20 * Math.PI) / 180;
/** A wheel whose outline is within this far (m) of the ground counts as resting on it. */
export const GROUND_TOUCH = 0.05;

/** The motor sign rule (2026-10-05, upside-down driving): the sign of a wheel's motor target,
 * chosen every step for every wheel, in WORLD space.
 *  1. A wheel BELOW the dome's centre (wheel.y < dome.y, with ABOVE_DEG of slack for side
 *     wheels) spins the normal way: DRIVE_SIGN, clockwise.
 *  2. A wheel ABOVE it spins the opposite way, counter-clockwise ...
 *  3. ... unless it is resting on the ground (`onGround`: within GROUND_TOUCH of the terrain),
 *     which always gets the normal spin.
 *
 * Why: a wheel pushes the rover toward +x through whatever it touches. Touching the ground under
 * it, it must turn clockwise; touching something over it, counter-clockwise. The wheels below the
 * dome are the ones on the ground, whichever way up the dome is: on its roof, the wheels the
 * child stuck on top are now underneath and drive it forward, while the ones from the bottom spin
 * the other way in the air. (A 2-D spin does not flip with the dome, so a ground wheel's target
 * is DRIVE_SIGN in every orientation.) Clause 3 covers a wheel that is above the dome's centre
 * yet on the ground: the front wheel of a rover tipped nose-up on a steep hill (the crater rim
 * pitches the dome ~50 deg, lifting a -45 deg wheel over the centre), or a rover that landed on
 * its tail. Without it that wheel would reverse and push the rover back down the hill. */
export function driveSign(wheel: Vec2, dome: Vec2, onGround: boolean): number {
  if (onGround) return DRIVE_SIGN;
  const dy = wheel.y - dome.y;
  return dy > Math.hypot(wheel.x - dome.x, dy) * Math.sin(ABOVE_DEG) ? -DRIVE_SIGN : DRIVE_SIGN;
}

/** Whether a stove is puffing `t` seconds into the run. */
export function stoveOn(t: number): boolean {
  return t % STOVE_PERIOD < STOVE_ON;
}

interface WheelDrive {
  joint: number;
  wheel: BodyId;
  parent: BodyId;
  /** Target relative angular speed (rad/s) without its sign: DRIVE.speed / r. */
  speed: number;
  /** How far the wheel reaches from its axle (m): `onGround` measures from there. */
  reach: number;
  /** The sign last applied (`driveSign`), 0 before the first drive step. */
  sign: number;
  /** Whether the motor is currently pushing (false = freewheeling or not driving). */
  on: boolean;
}

export class VehicleSim implements CourseSim<Metrics, Outcome> {
  private readonly otherHandles: PartHandle[] = [];
  private readonly terrainItems: RenderItem[];
  private readonly rover: RoverBuild | null;
  private readonly drives: WheelDrive[] = [];
  private readonly vehicleBodies = new Set<BodyId>();
  private readonly finishBodies = new Set<BodyId>();
  private readonly parts: RoverPart[];

  private playing = false;
  private currentOutcome: Outcome = 'running';

  private timeValue = 0;
  private ticks = 0;
  private startX = 0;
  private prevAngle = 0;
  private cumAngle = 0;
  private flipsValue = 0;
  private distanceValue = 0;
  private upsideDownValue = 0;
  private prevX = 0;
  private topSpeedValue = 0;

  private runningMaxX = -Infinity;
  private maxXSamples: number[] = [];

  constructor(
    private readonly world: PhysicsWorld,
    private readonly level: VehicleLevel,
    parts: RoverPart[],
  ) {
    // The app normalizes before every build; doing it again here is a no-op for it and keeps a
    // direct caller (the tests) honest.
    this.parts = normalizeRoverParts(parts, level.terrain);
    const { items } = buildTerrain(world, level.terrain);
    this.terrainItems = items;
    buildWalls(world);

    this.rover = buildRover(world, this.parts, level.terrain);
    if (this.rover) {
      this.vehicleBodies.add(this.rover.roverBody);
      for (const a of this.rover.attachments) {
        for (const b of a.bodies) if (b.role !== 'mount') this.vehicleBodies.add(b.id);
        if (a.wheelJoint !== undefined && a.wheelParent !== undefined && isWheel(a.kind)) {
          this.drives.push({
            joint: a.wheelJoint,
            wheel: a.main,
            parent: a.wheelParent,
            speed: DRIVE.speed / WHEEL[a.kind].r,
            reach: WHEEL[a.kind].reach,
            sign: 0,
            on: false,
          });
        }
      }
    }

    for (const part of this.parts) {
      if (part.kind !== 'block' && part.kind !== 'finish') continue;
      const handle = buildPart(world, part, level.terrain);
      this.otherHandles.push(handle);
      if (part.kind === 'finish') for (const b of handle.bodies) this.finishBodies.add(b.id);
    }

    for (let i = 0; i < PRE_ROLL_TICKS; i++) this.world.step(FIXED_DT, FIXED_SUBSTEPS);
    if (this.rover) refreshBounds(world, this.rover);

    const t = this.roverTransform();
    this.startX = t.position.x;
    this.prevAngle = t.angle;
  }

  private roverTransform(): Transform {
    return this.rover ? this.world.getTransform(this.rover.roverBody) : { position: { x: 0, y: 0 }, angle: 0 };
  }

  /** The dome's body (for tests and the follow camera); -1 without a dome. */
  get roverBody(): BodyId {
    return this.rover?.roverBody ?? -1;
  }

  /** The attachments as built (for tests). */
  attachmentHandles(): AttachmentHandle[] {
    return this.rover ? [...this.rover.attachments] : [];
  }

  play(): void {
    for (const d of this.drives) d.on = false;
    this.updateMotors(true);

    const t = this.roverTransform();
    this.startX = t.position.x;
    this.prevAngle = t.angle;
    this.cumAngle = 0;
    this.flipsValue = 0;
    this.distanceValue = 0;
    this.upsideDownValue = 0;
    this.prevX = t.position.x;
    this.topSpeedValue = 0;
    this.timeValue = 0;
    this.ticks = 0;
    this.runningMaxX = t.position.x;
    this.maxXSamples = [t.position.x];
    this.currentOutcome = 'running';
    this.playing = true;
  }

  /** Drive mode: each wheel motor pushes toward its target (its sign from `driveSign`, re-chosen
   * every step), or freewheels when the wheel already turns faster than the target in the driving
   * direction. `driving` false = every motor off. */
  private updateMotors(driving: boolean): void {
    const dome = this.rover ? this.world.getTransform(this.rover.roverBody).position : null;
    for (const d of this.drives) {
      let want = driving;
      let sign = d.sign;
      if (driving && dome) {
        const at = this.world.getTransform(d.wheel).position;
        const onGround = distanceToGround(this.level.terrain, at, d.reach + GROUND_TOUCH) <= d.reach + GROUND_TOUCH;
        sign = driveSign(at, dome, onGround);
        const rel = this.world.getAngularVelocity(d.wheel) - this.world.getAngularVelocity(d.parent);
        // Same sign as the target and faster: let it spin.
        want = !(rel * sign > d.speed);
      }
      const changed = want !== d.on || (want && sign !== d.sign);
      d.sign = sign;
      if (!changed) continue;
      d.on = want;
      if (want) this.world.setMotor(d.joint, sign * d.speed, DRIVE.torque);
      else this.world.setMotor(d.joint, 0, 0);
    }
  }

  /** The signed motor target (rad/s) each wheel is driven toward now, in attachment order, by
   * `driveSign` (a wheel may be freewheeling past it); 0 before Play (for tests). */
  motorTargets(): number[] {
    return this.drives.map((d) => d.sign * d.speed);
  }

  /** Whether propulsion part `a` pushes at this moment of the run. */
  private thrusting(a: AttachmentHandle): boolean {
    if (!this.playing || this.currentOutcome !== 'running') return false;
    // The stove pushes CONSTANTLY (Gao, 2026-10-05); `stoveOn` only times its smoke puffs now.
    return isPower(a.kind);
  }

  /** The force every propulsion part puts on the dome now: away from the part, along its
   * outward axis as the dome is turned. The axis runs through the dome's centre, which is the
   * dome body's centre of mass, so a centre-of-mass force is exactly the push at the rim point. */
  thrustForce(): Vec2 {
    if (!this.rover) return { x: 0, y: 0 };
    const angle = this.roverTransform().angle;
    let fx = 0;
    let fy = 0;
    for (const a of this.rover.attachments) {
      if (!isPower(a.kind) || !this.thrusting(a)) continue;
      const f = POWER_FORCE[a.kind];
      const dir = a.geometry.theta + angle;
      fx -= f * Math.cos(dir);
      fy -= f * Math.sin(dir);
    }
    return { x: fx, y: fy };
  }

  step(): void {
    if (!this.playing || this.currentOutcome !== 'running') return;

    if (this.rover) {
      const force = this.thrustForce();
      if (force.x !== 0 || force.y !== 0) this.world.applyForce(this.rover.roverBody, force);
      this.updateMotors(true);
      this.moveShadow();
    }

    this.timeValue += FIXED_DT;
    this.ticks++;
    const result = this.world.step(FIXED_DT, FIXED_SUBSTEPS);

    const t = this.roverTransform();

    // Unwrap the dome angle to count full flips.
    let d = t.angle - this.prevAngle;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d <= -Math.PI) d += 2 * Math.PI;
    this.cumAngle += d;
    this.prevAngle = t.angle;
    this.flipsValue = Math.floor(Math.abs(this.cumAngle) / (2 * Math.PI));

    this.distanceValue = Math.max(this.distanceValue, t.position.x - this.startX);
    // Meters gained toward the beacon while on the roof (the dome turned more than ROOF_ANGLE).
    if (Math.cos(t.angle) < Math.cos(ROOF_ANGLE)) this.upsideDownValue += Math.max(0, t.position.x - this.prevX);
    this.prevX = t.position.x;
    const v = this.rover ? this.world.getLinearVelocity(this.rover.roverBody) : { x: 0, y: 0 };
    this.topSpeedValue = Math.max(this.topSpeedValue, Math.hypot(v.x, v.y));

    // Sample the running max x once per whole second, into a ring long enough for the stuck
    // check's 3 s lookback.
    this.runningMaxX = Math.max(this.runningMaxX, t.position.x);
    const bucket = Math.floor(this.timeValue);
    this.maxXSamples[bucket] = this.runningMaxX;

    let finished = false;
    for (const c of result.contacts) {
      if (!c.began) continue;
      const aFinish = this.finishBodies.has(c.bodyA);
      const bFinish = this.finishBodies.has(c.bodyB);
      const aVehicle = this.vehicleBodies.has(c.bodyA);
      const bVehicle = this.vehicleBodies.has(c.bodyB);
      if ((aFinish && bVehicle) || (bFinish && aVehicle)) {
        finished = true;
        break;
      }
    }

    if (finished) {
      this.endRun('finished');
    } else if (t.position.y < FALL_Y) {
      this.endRun('fell');
    } else if (this.timeValue >= STUCK_MIN_TIME && this.isStuck(bucket)) {
      this.endRun('stuck');
    } else if (this.timeValue >= (this.level.timeout ?? TIMEOUT_S)) {
      this.endRun('timeout');
    }
  }

  /** Keeps the kinematic shadow body on the ground under the dome: a velocity that lands it
   * there after this step (the dome's own velocity predicts where the dome will be). */
  private moveShadow(): void {
    if (!this.rover) return;
    const t = this.roverTransform();
    const v = this.world.getLinearVelocity(this.rover.roverBody);
    const x = t.position.x + v.x * FIXED_DT;
    const target = { x, y: heightAt(this.level.terrain, x) + SHADOW_LIFT };
    const cur = this.world.getTransform(this.rover.shadowBody).position;
    this.world.setLinearVelocity(this.rover.shadowBody, {
      x: (target.x - cur.x) / FIXED_DT,
      y: (target.y - cur.y) / FIXED_DT,
    });
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
    this.updateMotors(false);
    if (this.rover) this.world.setLinearVelocity(this.rover.shadowBody, { x: 0, y: 0 });
  }

  metrics(): Metrics {
    return {
      reachedFinish: this.currentOutcome === 'finished' ? 1 : 0,
      time: this.timeValue,
      flips: this.flipsValue,
      distance: this.distanceValue,
      upsideDown: this.upsideDownValue,
      topSpeed: this.topSpeedValue,
    };
  }

  /** Effects while driving: the jet's flame and the stove's puff of smoke. */
  private effects(): OverlayItem[] {
    if (!this.rover) return [];
    const out: OverlayItem[] = [];
    for (const a of this.rover.attachments) {
      if (!a.geometry.fx || !this.thrusting(a)) continue;
      const t = this.world.getTransform(a.main);
      const origin = this.world.worldPoint(a.main, a.geometry.fx.origin);
      const dir = t.angle + a.geometry.fx.dir;
      if (a.kind === 'jet') {
        // The flame picture points from its base (right edge, mid-height) to the left; turned so
        // it points along the jet's axis, away from the dome. A small flicker in its length.
        const size = THRUST_W * (1 + 0.08 * Math.sin(this.ticks * 1.7));
        const baseToCentre = (PICS.thrust.w / 2 - THRUST_ART.base.x) / PART_PPM; // ~ -half the width
        const along = -baseToCentre * (size / (PICS.thrust.w / PART_PPM));
        out.push({
          kind: 'sprite',
          id: `thrust-${a.partId}`,
          textureKey: PICS.thrust.key,
          p: { x: origin.x + Math.cos(dir) * along, y: origin.y + Math.sin(dir) * along },
          size,
          angle: dir - Math.PI,
        });
      } else if (a.kind === 'stove') {
        // One puff per stove cycle, rising and fading from the chimney (visual only: the stove's
        // push is constant, `stoveOn` only times this sprite).
        if (!stoveOn(this.timeValue)) continue;
        const phase = (this.timeValue % STOVE_PERIOD) / STOVE_ON;
        const size = POOF_W * (0.8 + 0.6 * phase);
        const attachToCentre = (PICS.poof.h / 2 - POOF_ART.attach.y) / PART_PPM;
        out.push({
          kind: 'sprite',
          id: `poof-${a.partId}`,
          textureKey: PICS.poof.key,
          p: { x: origin.x, y: origin.y - attachToCentre * (size / (PICS.poof.w / PART_PPM)) + 0.5 * phase },
          size,
          alpha: Math.max(0, 1 - phase),
        });
      }
    }
    return out;
  }

  snapshot(): SimSnapshot<Outcome> {
    const transforms = new Map<BodyId, Transform>();
    for (const id of this.world.bodies()) transforms.set(id, this.world.getTransform(id));

    let overlay: OverlayItem[] | undefined;
    if (this.playing && this.currentOutcome === 'running' && this.rover) {
      const t = this.roverTransform();
      const v = this.world.getLinearVelocity(this.rover.roverBody);
      const speed = Math.hypot(v.x, v.y);
      overlay = [
        ...this.effects(),
        {
          kind: 'label',
          id: 'speed',
          p: { x: t.position.x, y: t.position.y + 1.9 },
          body: this.rover.roverBody,
          offset: { x: 0, y: 1.9 },
          text: `${speed.toFixed(1)} m/s`,
        },
      ];
    }

    return { elapsed: this.timeValue, outcome: this.currentOutcome, transforms, overlay };
  }

  /** Back to front: terrain, the shadow, the scenery, every attachment (its mount, then the part),
   * then Kevin and the glass dome over him. */
  renderItems(): RenderItem[] {
    if (!this.rover) return [...this.terrainItems, ...this.otherHandles.flatMap((h) => h.visuals)];
    return [
      ...this.terrainItems,
      this.rover.shadowItem,
      ...this.otherHandles.flatMap((h) => h.visuals),
      ...this.rover.attachments.flatMap((a) => a.visuals),
      ...this.rover.rover.visuals,
    ];
  }

  /** The dome first, then the attachments in part order (the kit hit-tests the LAST box under
   * the finger, so a part stacked on another is picked before it, and any part before the
   * dome), then the scenery. */
  handles(): PartHandle[] {
    if (!this.rover) return [...this.otherHandles];
    return [this.rover.rover, ...this.rover.attachments, ...this.otherHandles];
  }

  get outcome(): Outcome {
    return this.currentOutcome;
  }

  destroy(): void {
    this.world.destroy();
  }
}

export async function createVehicleSim(parts: RoverPart[], level: VehicleLevel): Promise<VehicleSim> {
  const world = await createWorld({ gravity: { x: 0, y: -10 } });
  return new VehicleSim(world, level, parts);
}
