// CatapultSim: owns one PhysicsWorld built from a level's PlacedPart[], runs the fixed-step
// per-shot simulation (settle -> play -> swing -> fly -> quiet), and derives Metrics/Outcome.
import {
  armAngleFor,
  bandSegments,
  bandSprite,
  buildArm,
  buildGround,
  buildPart,
  catapultBaseBounds,
  catapultPocketAtRest,
  catapultRelease,
  fireSpot,
  fuzzTextureKey,
  hookSprite,
  isTarget,
  REST_ANGLE,
  STRING_HOOK_H,
  STRING_HOOK_SIZE,
  stringAnchor,
  FUZZ_PART_ID,
} from './build';
import { ARM, FUZZ, FUZZ_TINT, LAUNCH_SPEED, SPLIT_ANGLE_DEG, SPLIT_OFFSET, fuzzName, fuzzSpec } from './catalog';
import type {
  BodyId,
  BodyRole,
  CatapultLevel,
  CourseSim,
  Metrics,
  Outcome,
  OverlayItem,
  PartHandle,
  PlacedPart,
  RenderItem,
  SimSnapshot,
  Vec2,
} from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { PhysicsWorld, Transform } from '../../../physics/types';

/** Ticks the pre-roll runs before a shot may be fired, so cans settle onto their shelves. */
export const SETTLE_TICKS = 60;
/** Clamp on the arm's rest-to-release swing time (seconds); a very fast/slow implied speed from
 * REST_ANGLE, the release angle and the arm's own speed gets pulled back into this range. */
export const MIN_SWING_TIME = 0.12;
export const MAX_SWING_TIME = 0.6;
/** Constant rolling resistance on a flying fuzz, m/s^2 (same trick as structures/goldberg). */
export const ROLL_DECEL = 2.5;
/** Minimum time into a shot before it may end on quiet (seconds). */
export const MIN_SHOT_TIME = 1.0;
/** Continuous quiet time required to end a shot early (seconds). */
export const QUIET_TIME = 0.5;
/** Hard cap on a shot's duration (seconds). */
export const MAX_SHOT_TIME = 10;
const QUIET_LINEAR = 0.15;
const QUIET_ANGULAR = 0.3;

/** partId of the invisible 'impact' RenderItem (see `renderItems`). */
export const IMPACT_PART_ID = -3;
/** A target hitting the ground or a shelf faster than this (m/s) kicks up a dust puff. */
export const DUST_SPEED = 2;
/** Targets knocked down in ONE shot that earn the CRASH! burst. */
export const CRASH_COUNT = 3;
/** Sprite sizes (m) and lifetimes (s) of the payoff effects; hit bursts keep their 2.4 m / 0.7 s. */
export const DUST_SIZE = 1.0;
export const DUST_TIME = 0.5;
export const CRASH_SIZE = 2.8;
export const CRASH_TIME = 0.9;
export const SPLIT_PUFF_SIZE = 0.6;
export const SPLIT_PUFF_TIME = 0.3;
const HIT_BURST_SIZE = 2.4;
const HIT_BURST_TIME = 0.7;
/** Collision group for a splitting fuzz (the Donut): its pieces collide with everything except
 * each other, so the three fuzzes of a split (spawned 0.1 m apart, closer than their radii) never
 * shove each other apart. Every other fuzz keeps the default filter, so the shipped levels'
 * physics is untouched. */
const SPLIT_FILTER = { group: 0x4, mask: 0xfffb };

type ShapeInfo = { hw: number; hh: number; symmetry: number };

function wrapSym(angle: number, symmetry: number): number {
  let a = angle % symmetry;
  if (a > symmetry / 2) a -= symmetry;
  if (a < -symmetry / 2) a += symmetry;
  return a;
}

interface FuzzBody {
  id: BodyId;
  r: number;
  density: number;
  color: number;
  /** `fuzz-<fuzz>-excited`: the same fuzz as on the arm, with its excited face while it flies. */
  textureKey: string;
  /** True for a splitting fuzz (the Donut) that has not split yet (the spawned original only; its
   * two children never split again). */
  canSplit: boolean;
  /** Vertical velocity after the previous step, so the split sees the apex (vy from > 0 to <= 0). */
  prevVy: number;
  tipX: number;
  /** Other bodies currently touching this fuzz (ground, a shelf, a can, ...). Empty while
   * airborne, so rolling resistance only acts once something is actually being rolled against -
   * a freshly spawned fuzz flies a pure ballistic arc. */
  contacts: Set<BodyId>;
}

export class CatapultSim implements CourseSim<Metrics, Outcome> {
  private readonly partHandles: PartHandle[] = [];
  private readonly ground: BodyId;
  private readonly walls: BodyId[];

  private catapultPartId = -1;
  private catapultHandle!: PartHandle;
  private catapultPart!: PlacedPart;
  private armId!: BodyId;

  private readonly targetBodies: BodyId[] = [];
  private readonly shapeInfo = new Map<BodyId, ShapeInfo>();
  private readonly baseline = new Map<BodyId, Transform>();
  private readonly knockedBodies = new Set<BodyId>();
  private readonly bullseyeBodies = new Set<BodyId>();
  private readonly dynamicBodies = new Set<BodyId>();
  private readonly fuzzBodies: FuzzBody[] = [];
  /** Body id -> 'can'/'block', so a hit burst can pick the right texture (boom on a block, pow
   * on a can). Bullseye discs aren't in here; they always burst 'fx-pow' (never a block). */
  private readonly targetKind = new Map<BodyId, 'can' | 'block'>();

  /** One 'fx-boom'/'fx-pow' sprite per target/bullseye first touched by the flying fuzz this
   * shot (at most one per body per shot, tracked via `burstedBodies`). Cleared on a new shot; a
   * fresh sim (rebuild) starts empty. Sim-time (`shotElapsed`) stamped, not wall time, so ageing
   * is deterministic and testable. */
  private bursts: { id: string; key: string; p: Vec2; t0: number; size: number; dur: number; angle: number }[] = [];
  private readonly burstedBodies = new Set<BodyId>();
  private burstCounter = 0;
  /** Ground plus every shelf/wall body: what a falling target lands on to raise dust. */
  private readonly solidBodies = new Set<BodyId>();
  /** Each target's own RenderItem, so the 'impact' item can copy its shape. */
  private readonly targetVisual = new Map<BodyId, RenderItem>();
  /** Per-shot payoff state, reset by `play()`: the target the fuzz hit first (the camera swings
   * to it), targets that already puffed dust, targets knocked down this shot (for CRASH!). */
  private impactBody: BodyId | null = null;
  private readonly dustedBodies = new Set<BodyId>();
  private knockedThisShot: BodyId[] = [];
  private crashShown = false;
  /** Target speeds just before the current world step: the impact speed a landing is judged by
   * (after the step the contact has already slowed the body). */
  private readonly preStepSpeed = new Map<BodyId, number>();
  /** The fuzzes this shot launched (the original first, then a Donut split's two children). */
  private shotFuzzes: FuzzBody[] = [];

  private shotsLeftInternal: number;
  private shotsUsed = 0;
  private hits = 0;
  private maxRangeValue = 0;

  // `running` is reserved for an in-flight shot. The Outcome union has no "ready, never shot
  // yet" state, so edit-mode (before the first play()) reuses 'shot' - harmless, since
  // `canReplay()` (the only reader) only matters after a run has ended.
  private currentOutcome: Outcome = 'shot';
  /** True from `play()` until the arm reaches the release angle. Variant A (product direction
   * 2026-09-21): the crossbar sits at that same angle, so release and stop are the same instant -
   * the arm halts exactly there the moment it lets the fuzz go. */
  private swinging = false;
  /** The arm's tracked world-frame body angle (radians), stepped by `omegaAbs` each tick; the
   * kinematic body itself is driven by `setAngularVelocity` in lockstep. */
  private armAngle = REST_ANGLE;
  private omegaAbs = 0;
  private releaseArmAngle = 0;
  private released = false;
  /** The RenderItem (role 'fuzz') riding the arm while a shot is loaded; null once released (or
   * before the first `play()`/`updatePart()` populates it). Removed from `catapultHandle.visuals`
   * by reference, not by role, so it never collides with the flying fuzz's own RenderItem (which
   * lives in `fuzzBodies`, not `partHandles`). */
  private loadedFuzzVisual: RenderItem | null = null;
  /** The fuzz spawned by the current shot (set at release, cleared at the next `play()`), so the
   * live 'range' label reads this shot's fuzz and not some earlier shot's fuzz still on the
   * ground. */
  private activeFuzz: FuzzBody | null = null;
  private shotElapsed = 0;
  private quietElapsed = 0;
  private hitThisShot = false;
  /** True from the instant `play()` fires until the arm is reloaded (either by the next `play()`,
   * or right away by `finishShot()` on a 'shot' outcome): the trigger string is cut and the sim
   * draws the limp lower piece + a brief snip burst instead of the tied string (product direction
   * 2026-09-22: FIRE snips the string, the rubber bands do the flinging). */
  private stringCut = false;

  constructor(
    private readonly world: PhysicsWorld,
    private readonly level: CatapultLevel,
    private readonly parts: PlacedPart[],
  ) {
    this.shotsLeftInternal = level.shots > 0 ? level.shots : Infinity;

    const { ground, walls } = buildGround(world);
    this.ground = ground;
    this.walls = walls;
    this.solidBodies.add(ground);

    parts.forEach((part) => {
      const handle = buildPart(world, part);
      this.partHandles.push(handle);

      if (part.kind === 'catapult') {
        this.catapultPartId = part.id;
        this.catapultHandle = handle;
        this.catapultPart = { ...part, props: { ...part.props } };
        const armEntry = handle.bodies.find((b) => b.role === 'arm');
        if (armEntry) this.armId = armEntry.id;
        this.loadedFuzzVisual = handle.visuals.find((v) => v.role === 'fuzz') ?? null;
      } else if (isTarget(part)) {
        const body = handle.bodies[0]!;
        this.targetBodies.push(body.id);
        this.dynamicBodies.add(body.id);
        this.targetKind.set(body.id, part.kind === 'block' ? 'block' : 'can');
        const visual = handle.visuals[0]!;
        this.targetVisual.set(body.id, visual);
        if (visual.shape.kind === 'box') {
          const { w, h } = visual.shape;
          const symmetry = Math.abs(w - h) < 1e-6 ? Math.PI / 2 : Math.PI;
          this.shapeInfo.set(body.id, { hw: w / 2, hh: h / 2, symmetry });
        }
      } else if (part.kind === 'bullseye') {
        const disc = handle.bodies.find((b) => b.role === 'bullseye');
        if (disc) this.bullseyeBodies.add(disc.id);
      } else if (part.kind === 'shelf' || part.kind === 'wall') {
        for (const b of handle.bodies) this.solidBodies.add(b.id);
      }
    });
  }

  /** Pre-roll so cans settle onto shelves, then baseline transforms + settled bounds for
   * targets. Called once by `createCatapultSim`. */
  settle(): void {
    for (let i = 0; i < SETTLE_TICKS; i++) this.world.step(FIXED_DT, FIXED_SUBSTEPS);

    for (const id of this.targetBodies) this.baseline.set(id, this.world.getTransform(id));

    this.partHandles.forEach((handle) => {
      if (handle.partId === this.catapultPartId) return;
      const body = handle.bodies[0];
      if (!body) return;
      const info = this.shapeInfo.get(body.id);
      if (!info) return;
      const t = this.world.getTransform(body.id);
      handle.bounds = this.rotatedBoxBounds(t, info);
    });
  }

  /** `updatePart` only ever recreates the catapult; other kinds trigger a full rebuild (return
   * false) since their body/shape depends on props the kit doesn't ask us to hot-swap. */
  updatePart(part: PlacedPart): boolean {
    if (part.kind !== 'catapult' || part.id !== this.catapultPartId) return false;

    for (const b of this.catapultHandle.bodies) this.world.destroyBody(b.id);
    const rebuilt = buildPart(this.world, part);
    this.catapultHandle.bodies = rebuilt.bodies;
    this.catapultHandle.visuals = rebuilt.visuals;
    this.catapultHandle.bounds = rebuilt.bounds;

    this.catapultPart = { ...part, props: { ...part.props } };
    const armEntry = rebuilt.bodies.find((b) => b.role === 'arm');
    if (armEntry) this.armId = armEntry.id;
    this.loadedFuzzVisual = rebuilt.visuals.find((v) => v.role === 'fuzz') ?? null;
    // A full rebuild always lands the arm loaded at rest (buildCatapult's default), so the string
    // is tied again regardless of whatever state it was in before (only edit/done mode calls this,
    // never mid-swing).
    this.stringCut = false;

    return true;
  }

  /** Rebuilds the kinematic arm at REST with a freshly loaded fuzz (its gear and cup cover ride
   * along, all role 'arm'), without touching the base/frame/wheels. Shared by `play()` (every shot starts here) and `finishShot()`
   * (a 'shot' outcome reloads right away, so the machine looks ready between shots instead of
   * sitting stopped on the crossbar) - the arm carries no collider, so either call site is
   * physics-neutral; `levels.test.ts` proves it. */
  private reloadArm(): void {
    const fresh = buildArm(this.world, this.catapultPart);
    this.world.destroyBody(this.armId);
    this.armId = fresh.id;
    this.catapultHandle.bodies = this.catapultHandle.bodies
      .filter((b) => b.role !== 'arm')
      .concat({ id: fresh.id, role: 'arm' });
    this.catapultHandle.visuals = this.catapultHandle.visuals
      .filter((v) => v.role !== 'arm' && v.role !== 'fuzz')
      .concat(fresh.visuals);
    this.catapultHandle.bounds = this.unionBounds(catapultBaseBounds(this.catapultPart), fresh.bounds);
    this.loadedFuzzVisual = this.catapultHandle.visuals.find((v) => v.role === 'fuzz') ?? null;
  }

  play(): void {
    if (this.level.shots > 0 && this.shotsLeftInternal === 0) return;

    this.shotsUsed++;
    this.shotsLeftInternal--;
    this.reloadArm();

    const armSpec = ARM[this.catapultPart.props.arm ?? 'Short'] ?? ARM.Short!;
    const angleDeg = Number(this.catapultPart.props.angle ?? '45') || 45;
    const releaseArmAngle = armAngleFor(angleDeg);
    const speedBase = LAUNCH_SPEED[this.catapultPart.props.power ?? 'Medium'] ?? LAUNCH_SPEED.Medium!;
    const speed = speedBase * armSpec.factor;

    // The arm sweeps clockwise (ω < 0) from REST_ANGLE down to the release angle, where it
    // releases the fuzz and halts (variant A: the crossbar sits at that same angle). |ω| = speed
    // / L would fire true to the tangential-velocity model, but that swing can be uncomfortably
    // fast or slow at the extremes, so the swing TIME is clamped instead and ω re-derived from
    // the clamped time (angle traveled stays exact; only the rate changes).
    const swingSpan = REST_ANGLE - releaseArmAngle; // > 0 for every angle option (15..75)
    const rawOmega = speed / armSpec.length;
    const rawSwingTime = swingSpan / rawOmega;
    const swingTime = Math.min(Math.max(rawSwingTime, MIN_SWING_TIME), MAX_SWING_TIME);
    this.omegaAbs = swingSpan / swingTime;
    this.releaseArmAngle = releaseArmAngle;
    this.armAngle = REST_ANGLE;
    this.released = false;
    this.world.setAngularVelocity(this.armId, -this.omegaAbs);

    this.swinging = true;
    this.currentOutcome = 'running';
    this.stringCut = true; // FIRE snips the string the instant the shot starts
    this.hitThisShot = false;
    this.shotElapsed = 0;
    this.quietElapsed = 0;
    this.activeFuzz = null;
    this.bursts = [];
    this.burstedBodies.clear();
    this.impactBody = null;
    this.dustedBodies.clear();
    this.knockedThisShot = [];
    this.crashShown = false;
    this.shotFuzzes = [];
  }

  step(): void {
    if (this.currentOutcome !== 'running') return;

    this.shotElapsed += FIXED_DT;

    if (this.swinging) {
      this.armAngle -= this.omegaAbs * FIXED_DT;
      if (this.armAngle <= this.releaseArmAngle) {
        if (!this.released) {
          this.released = true;
          this.dropLoadedFuzzVisual();
          this.spawnFuzz();
        }
        // Variant A: the stop pose IS the release pose, so the arm halts the instant it lets go -
        // snap it exactly onto the crossbar (a fresh kinematic body, no residual velocity) rather
        // than zeroing `setAngularVelocity` and letting the next world.step() land close-but-not-
        // exact.
        this.stopArmAtRelease();
        this.swinging = false;
      }
    }

    this.applyRollingResistance();
    this.recordPreStepSpeeds();

    const result = this.world.step(FIXED_DT, FIXED_SUBSTEPS);

    this.updateFuzzContacts(result.contacts);
    this.handleContacts(result.contacts);
    this.updateLatches();
    this.updateSplits();
    this.updateMaxRange();

    const quiet = this.allQuiet();
    this.quietElapsed = quiet ? this.quietElapsed + FIXED_DT : 0;

    if ((this.shotElapsed >= MIN_SHOT_TIME && this.quietElapsed >= QUIET_TIME) || this.shotElapsed >= MAX_SHOT_TIME) {
      this.finishShot();
    }
  }

  canReplay(): boolean {
    return this.currentOutcome === 'shot';
  }

  snapshot(): SimSnapshot<Outcome> {
    const transforms = new Map<BodyId, Transform>();
    for (const id of this.world.bodies()) transforms.set(id, this.world.getTransform(id));

    const overlay: OverlayItem[] = [];
    if (this.currentOutcome === 'running' && this.activeFuzz) {
      const t = transforms.get(this.activeFuzz.id);
      if (t) {
        const range = t.position.x - this.activeFuzz.tipX;
        overlay.push({
          kind: 'label',
          id: 'range',
          p: { x: t.position.x, y: t.position.y + 0.8 },
          body: this.activeFuzz.id,
          offset: { x: 0, y: 0.8 },
          text: `${range.toFixed(1)} m`,
        });
      }
    }
    // The loaded fuzz's name is shown by the fuzz shelf widget (spec.ts), not by a label here.
    if (this.level.showPreview && this.currentOutcome !== 'running') {
      overlay.push(...this.trajectoryOverlay());
    }
    overlay.push(...this.burstOverlay());
    overlay.push(...this.bandOverlay());
    overlay.push(...this.stringOverlay());

    return { elapsed: this.shotElapsed, outcome: this.currentOutcome, transforms, overlay };
  }

  metrics(): Metrics {
    return {
      knockedDown: this.knockedBodies.size,
      hits: this.hits,
      shotsUsed: this.shotsUsed,
      shotsLeft: this.level.shots > 0 ? this.shotsLeftInternal : 0,
      targetsLeft: this.targetBodies.length - this.knockedBodies.size,
      maxRange: this.maxRangeValue,
      aboveLine: this.countAboveLine(),
    };
  }

  renderItems(): RenderItem[] {
    // The catapult no longer draws its own brown ground rectangle - the kit's thicker ground
    // strip (`world.groundDepth`/`groundStrip` in spec.ts) covers it now. The ground BODY (physics)
    // is unchanged; only this visual is gone.
    const items: RenderItem[] = [...this.partHandles.flatMap((h) => h.visuals)];
    // This shot's fuzzes first (the original leading), so the follow camera, which takes the
    // first live 'fuzz' item, tracks the fuzz in flight rather than one resting from an earlier
    // shot. Before release there are none, and the loaded fuzz on the arm (above) leads.
    const current = new Set(this.shotFuzzes);
    const ordered = [...this.shotFuzzes, ...this.fuzzBodies.filter((f) => !current.has(f))];
    for (const f of ordered) {
      items.push({
        partId: FUZZ_PART_ID,
        body: f.id,
        shape: { kind: 'circle', r: f.r },
        color: f.color,
        role: 'fuzz',
        locked: true,
        lockPosition: true,
        textureKey: f.textureKey,
      });
    }
    const impactVisual = this.impactBody !== null ? this.targetVisual.get(this.impactBody) : undefined;
    if (impactVisual) {
      // Invisible stand-in for the target the fuzz hit first: spec.ts's follow lists 'impact'
      // ahead of 'fuzz', so from the hit on the camera stays on the collapse, not the fuzz.
      items.push({ ...impactVisual, partId: IMPACT_PART_ID, role: 'impact', alpha: 0, locked: true, lockPosition: true });
    }
    return items;
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

  // ---- internals -----------------------------------------------------------------------

  /** Drops the loaded-fuzz RenderItem from the arm's visuals (by reference, so it can't be
   * confused with the flying fuzz's own RenderItem). No-op if already dropped. */
  private dropLoadedFuzzVisual(): void {
    const dropped = this.loadedFuzzVisual;
    if (!dropped) return;
    this.catapultHandle.visuals = this.catapultHandle.visuals.filter((v) => v !== dropped);
    this.loadedFuzzVisual = null;
  }

  private spawnFuzz(): void {
    const { tip, v } = catapultRelease(this.catapultPart);
    const spec = fuzzSpec(this.catapultPart.props);
    const splits = !!spec.splits;
    const fuzz = this.addFuzzBody(tip, v, {
      r: spec.r,
      density: spec.density,
      color: FUZZ_TINT[fuzzName(this.catapultPart.props)] ?? FUZZ_TINT.Fur!,
      textureKey: fuzzTextureKey(this.catapultPart.props, true),
      tipX: tip.x,
      splits,
    });
    fuzz.canSplit = splits;
    this.activeFuzz = fuzz;
  }

  /** Creates one flying fuzz body and registers it everywhere a fuzz counts (contacts, range,
   * quiet check, this shot's follow order). Shared by the launch and the Donut's split. */
  private addFuzzBody(
    position: Vec2,
    velocity: Vec2,
    o: { r: number; density: number; color: number; textureKey: string; tipX: number; splits: boolean },
  ): FuzzBody {
    const id = this.world.createBody({
      type: 'dynamic',
      position,
      linearVelocity: velocity,
      bullet: true,
      canSleep: true,
    });
    this.world.addShape(
      id,
      { kind: 'circle', radius: o.r },
      { density: o.density, friction: 0.5, restitution: 0.2, ...(o.splits ? { filter: SPLIT_FILTER } : {}) },
    );
    const fuzz: FuzzBody = {
      id,
      r: o.r,
      density: o.density,
      color: o.color,
      textureKey: o.textureKey,
      canSplit: false,
      prevVy: velocity.y,
      tipX: o.tipX,
      contacts: new Set(),
    };
    this.fuzzBodies.push(fuzz);
    this.shotFuzzes.push(fuzz);
    this.dynamicBodies.add(id);
    return fuzz;
  }

  /** The split (huddle 2026-09-22: "at the top of its arc, throws three fur babies"; the Donut
   * does it since 2026-10-01): the first step a still-airborne splitting fuzz's vertical velocity
   * turns from > 0 to <= 0, it keeps
   * flying and two more fuzzes leave from its position at the same speed, the direction turned
   * +/- SPLIT_ANGLE_DEG and offset SPLIT_OFFSET sideways (perpendicular to the flight). One split
   * per launch: touching anything before the apex cancels it, so a fuzz that clips a target on
   * the way up, or bounces along the ground, never splits late. */
  private updateSplits(): void {
    for (const f of [...this.fuzzBodies]) {
      if (!f.canSplit) continue;
      const v = this.world.getLinearVelocity(f.id);
      const prevVy = f.prevVy;
      f.prevVy = v.y;
      if (f.contacts.size > 0) {
        f.canSplit = false;
        continue;
      }
      if (!(prevVy > 0 && v.y <= 0)) continue;
      f.canSplit = false;

      const t = this.world.getTransform(f.id);
      const speed = Math.hypot(v.x, v.y);
      const dir = Math.atan2(v.y, v.x);
      const normal: Vec2 = { x: -Math.sin(dir), y: Math.cos(dir) };
      for (const sign of [1, -1]) {
        const a = dir + (sign * SPLIT_ANGLE_DEG * Math.PI) / 180;
        this.addFuzzBody(
          { x: t.position.x + sign * SPLIT_OFFSET * normal.x, y: t.position.y + sign * SPLIT_OFFSET * normal.y },
          { x: speed * Math.cos(a), y: speed * Math.sin(a) },
          { r: f.r, density: f.density, color: f.color, textureKey: f.textureKey, tipX: f.tipX, splits: true },
        );
      }
      this.pushBurst('fx-dust', { ...t.position }, SPLIT_PUFF_SIZE, SPLIT_PUFF_TIME, 0);
    }
  }

  /** Snaps the arm onto the crossbar the instant it releases the fuzz (variant A: the stop pose
   * IS the release pose). Destroys the swinging arm body and recreates it - via the same
   * `buildArm` helper `play()`/`updatePart()` use - at `releaseArmAngle` exactly, with no fuzz
   * visual (already dropped/spawned), so the drawn arm lands precisely on the bar rather than
   * drifting a step past it. */
  private stopArmAtRelease(): void {
    const stopped = buildArm(this.world, this.catapultPart, this.releaseArmAngle, false);
    this.world.destroyBody(this.armId);
    this.armId = stopped.id;
    this.catapultHandle.bodies = this.catapultHandle.bodies
      .filter((b) => b.role !== 'arm')
      .concat({ id: stopped.id, role: 'arm' });
    this.catapultHandle.visuals = this.catapultHandle.visuals
      .filter((v) => v.role !== 'arm')
      .concat(stopped.visuals);
    this.catapultHandle.bounds = this.unionBounds(catapultBaseBounds(this.catapultPart), stopped.bounds);
    this.armAngle = this.releaseArmAngle;
  }

  /** Coordinator correction (2026-09-15): rolling resistance must not act in flight. Only apply
   * it to a fuzz that is currently touching something (ground, a shelf, a can, ...); a freshly
   * spawned fuzz has an empty contact set, so it flies a pure ballistic arc. */
  private applyRollingResistance(): void {
    for (const f of this.fuzzBodies) {
      if (f.contacts.size === 0) continue;
      const v = this.world.getLinearVelocity(f.id);
      const speed = Math.hypot(v.x, v.y);
      if (speed <= 0.05) continue;
      const m = this.world.getMass(f.id);
      const force = (m * ROLL_DECEL) / speed;
      this.world.applyForce(f.id, { x: -v.x * force, y: -v.y * force });
    }
  }

  /** Tracks, per fuzz, the set of other bodies it's currently touching (from this step's raw
   * contact events): `began` adds, `!began` removes. Ground/shelf/can/block/wall/post/bullseye
   * all count - "anything" per the coordinator's correction. */
  private updateFuzzContacts(contacts: { bodyA: BodyId; bodyB: BodyId; began: boolean }[]): void {
    if (this.fuzzBodies.length === 0) return;
    const byId = new Map(this.fuzzBodies.map((f) => [f.id, f] as const));
    for (const c of contacts) {
      const fA = byId.get(c.bodyA);
      const fB = byId.get(c.bodyB);
      if (fA) {
        if (c.began) fA.contacts.add(c.bodyB);
        else fA.contacts.delete(c.bodyB);
      }
      if (fB) {
        if (c.began) fB.contacts.add(c.bodyA);
        else fB.contacts.delete(c.bodyA);
      }
    }
  }

  private handleContacts(contacts: { bodyA: BodyId; bodyB: BodyId; began: boolean }[]): void {
    const fuzzIds = new Set(this.fuzzBodies.map((f) => f.id));
    for (const c of contacts) {
      if (!c.began) continue;
      if (this.targetKind.has(c.bodyA) && this.solidBodies.has(c.bodyB)) this.recordDust(c.bodyA);
      else if (this.targetKind.has(c.bodyB) && this.solidBodies.has(c.bodyA)) this.recordDust(c.bodyB);
      const aIsFuzz = fuzzIds.has(c.bodyA);
      const bIsFuzz = fuzzIds.has(c.bodyB);
      if (!aIsFuzz && !bIsFuzz) continue;
      const fuzzId = aIsFuzz ? c.bodyA : c.bodyB;
      const otherId = aIsFuzz ? c.bodyB : c.bodyA;

      if (!this.hitThisShot && this.bullseyeBodies.has(otherId)) {
        this.hits++;
        this.hitThisShot = true;
      }

      this.recordBurst(otherId, fuzzId);
    }
  }

  /** First touch of the flying fuzz against a target (can/block) or a bullseye disc this shot:
   * records a hit-burst sprite (at most once per body per shot). Anything else (ground, a wall,
   * another fuzz) is ignored. */
  private recordBurst(otherId: BodyId, fuzzId: BodyId): void {
    if (this.burstedBodies.has(otherId)) return;
    const kind = this.targetKind.get(otherId);
    const isBullseye = this.bullseyeBodies.has(otherId);
    if (!kind && !isBullseye) return;

    this.burstedBodies.add(otherId);
    if (kind && this.impactBody === null) this.impactBody = otherId;
    const key = kind === 'block' ? 'fx-boom' : 'fx-pow';
    const fuzzT = this.world.getTransform(fuzzId);
    const p: Vec2 = { x: fuzzT.position.x, y: fuzzT.position.y + 1.3 }; // above the fuzz, so the fuzz stays visible
    this.pushBurst(key, p, HIT_BURST_SIZE, HIT_BURST_TIME, 0.12);
  }

  private pushBurst(key: string, p: Vec2, size: number, dur: number, angle: number): void {
    this.burstCounter++;
    this.bursts.push({ id: `burst-${this.burstCounter}`, key, p, t0: this.shotElapsed, size, dur, angle });
  }

  private recordPreStepSpeeds(): void {
    for (const id of this.targetBodies) {
      const v = this.world.getLinearVelocity(id);
      this.preStepSpeed.set(id, Math.hypot(v.x, v.y));
    }
  }

  /** A target landing on the ground or a shelf/wall faster than DUST_SPEED this shot: one dust
   * puff (at most one per body per shot) just above where it came down. */
  private recordDust(target: BodyId): void {
    if (this.dustedBodies.has(target)) return;
    if ((this.preStepSpeed.get(target) ?? 0) <= DUST_SPEED) return;
    const info = this.shapeInfo.get(target);
    if (!info) return;
    this.dustedBodies.add(target);
    const b = this.rotatedBoxBounds(this.world.getTransform(target), info);
    this.pushBurst('fx-dust', { x: b.x, y: b.y - b.h / 2 + 0.3 }, DUST_SIZE, DUST_TIME, 0);
  }

  /** CRASH! once per shot, the moment the shot's CRASH_COUNT-th target goes down, above the
   * middle of everything this shot knocked over. */
  private maybeCrash(): void {
    if (this.crashShown || this.knockedThisShot.length < CRASH_COUNT) return;
    this.crashShown = true;
    let sx = 0;
    let sy = 0;
    for (const id of this.knockedThisShot) {
      const t = this.world.getTransform(id);
      sx += t.position.x;
      sy += t.position.y;
    }
    const n = this.knockedThisShot.length;
    this.pushBurst('fx-crash', { x: sx / n, y: Math.min(sy / n + 2, 13) }, CRASH_SIZE, CRASH_TIME, -0.08);
  }

  /** Targets whose live AABB top (rotated box bounds) is above `level.line`; 0 without a line.
   * Live, so it reads the settled pose at rest and the wreck after a topple. */
  private countAboveLine(): number {
    const line = this.level.line;
    if (line === undefined) return 0;
    let n = 0;
    for (const id of this.targetBodies) {
      const info = this.shapeInfo.get(id);
      if (!info) continue;
      const b = this.rotatedBoxBounds(this.world.getTransform(id), info);
      if (b.y + b.h / 2 > line + 1e-3) n++;
    }
    return n;
  }

  /** `snapshot().overlay` sprites for every burst younger than its lifetime `dur`. A hit burst
   * (0.7 s): a quick "pop" (size overshoots to 1.15x by 0.12 s, settles to 1.0x by 0.25 s) then a
   * hold-then-fade (full alpha to 0.45 s, linear to 0 by 0.7 s). Dust, CRASH! and the split puff
   * use the same curve stretched to their own `dur`. Driven off `shotElapsed` (sim time), so it's
   * deterministic and keeps animating for a moment even after the shot outcome settles. */
  private burstOverlay(): OverlayItem[] {
    const items: OverlayItem[] = [];
    for (const b of this.bursts) {
      const age = this.shotElapsed - b.t0;
      if (age < 0 || age >= b.dur) continue;
      const k = b.dur / HIT_BURST_TIME;
      const popAt = 0.12 * k;
      const settleAt = 0.25 * k;
      const fadeAt = 0.45 * k;

      let pop: number;
      if (age < popAt) {
        pop = 1.15 * (age / popAt);
      } else if (age < settleAt) {
        pop = 1.15 + (1.0 - 1.15) * ((age - popAt) / (settleAt - popAt));
      } else {
        pop = 1.0;
      }

      const alpha = age < fadeAt ? 1 : 1 - (age - fadeAt) / (b.dur - fadeAt);

      items.push({ kind: 'sprite', id: b.id, textureKey: b.key, p: b.p, size: b.size * pop, alpha, angle: b.angle });
    }
    return items;
  }

  /** The rubber bands (`BAND_COUNT[power]` of them), drawn every frame regardless of mode - edit,
   * play and done - at the arm's CURRENT drawn angle, so they visibly stretch as the arm swings
   * and snap back once it stops. Each is the art lead's red strength band (a sprite stretched from
   * the arm to the lever, `bandSprite`) with a hook at each end, its arch toward the band. All the
   * bands come first, then the hooks, so a hook always sits on top of its band. */
  private bandOverlay(): OverlayItem[] {
    const segs = bandSegments(this.catapultPart, this.armAngle);
    const bands: OverlayItem[] = [];
    const hooks: OverlayItem[] = [];
    segs.forEach(({ a, b }, i) => {
      const band = bandSprite(`band-${i}`, a, b);
      if (band) bands.push(band);
      const theta = Math.atan2(b.y - a.y, b.x - a.x);
      hooks.push(hookSprite(`band-${i}-hook-a`, a, theta), hookSprite(`band-${i}-hook-b`, b, theta + Math.PI));
    });
    return [...bands, ...hooks];
  }

  /** The trigger string, drawn as a red strength band like the power bands: tied (cup underside ->
   * ground peg, a hook at each end) whenever the arm is loaded at rest - edit mode, and again once
   * `finishShot()` reloads between shots - or, from the instant `play()` cuts it, a short limp lower
   * piece left on the peg plus a brief 'fx-snip' burst at the cut point. The peg's hook stands on
   * the ground (its arch up, the band tied to the arch's top); the cup's hook hangs arch-down. */
  private stringOverlay(): OverlayItem[] {
    const { a, p } = stringAnchor(this.catapultPart);
    const pegTop: Vec2 = { x: p.x, y: p.y + STRING_HOOK_H * 0.8 };
    const pegHook = hookSprite('string-hook-p', { x: p.x, y: p.y + STRING_HOOK_H / 2 }, Math.PI / 2, STRING_HOOK_SIZE);

    if (!this.stringCut) {
      const band = bandSprite('string', a, pegTop);
      return [
        ...(band ? [band] : []),
        hookSprite('string-hook-a', a, -Math.PI / 2, STRING_HOOK_SIZE),
        pegHook,
      ];
    }

    // The limp piece keeps the old ~0.35 m length and tilt for the Short arm's longer string, but
    // must never overshoot the Long arm's shorter one (its cup hangs lower - see stringAnchor) -
    // capped at 0.6x the actual string length so it always reads as a short dangling stub, never as
    // long as the string itself.
    const stringLen = a.y - p.y;
    const limpLen = Math.min(0.35, 0.6 * stringLen);
    const limpScale = limpLen / 0.35; // (0.18, 0.3) is the old ~0.35 m limp piece's own tilt
    const limpEnd: Vec2 = { x: pegTop.x + 0.18 * limpScale, y: pegTop.y + 0.3 * limpScale };
    const limp = bandSprite('string-limp', pegTop, limpEnd);
    const items: OverlayItem[] = [...(limp ? [limp] : []), pegHook];
    // The string is always cut at the very start of a shot (in the same `play()` call that
    // resets `shotElapsed` to 0), so `shotElapsed` doubles as the snip burst's own age.
    if (this.shotElapsed < 0.6) {
      // Right where FIRE just was (stakeholder feedback 2026-09-22): the button and the string's
      // tie-down/cut point share the same spot (`fireSpot`), so the child sees the snip exactly
      // where they tapped instead of somewhere else on the machine.
      items.push(this.snipSprite(fireSpot(this.catapultPart), this.shotElapsed));
    }
    return items;
  }

  /** Same pop/hold/fade shape as `burstOverlay`'s hit bursts, scaled to a shorter ~0.6 s total
   * (a quick pop by 0.12 s, settle by 0.25 s, hold to 0.4 s, then fade to 0 by 0.6 s). */
  private snipSprite(p: Vec2, age: number): OverlayItem {
    let pop: number;
    if (age < 0.12) {
      pop = 1.15 * (age / 0.12);
    } else if (age < 0.25) {
      pop = 1.15 + (1.0 - 1.15) * ((age - 0.12) / (0.25 - 0.12));
    } else {
      pop = 1.0;
    }
    const alpha = age < 0.4 ? 1 : 1 - (age - 0.4) / (0.6 - 0.4);
    return { kind: 'sprite', id: 'snip', textureKey: 'fx-snip', p, size: 1.0 * pop, alpha };
  }

  private updateLatches(): void {
    for (const id of this.targetBodies) {
      if (this.knockedBodies.has(id)) continue;
      const info = this.shapeInfo.get(id);
      const base = this.baseline.get(id);
      if (!info || !base) continue;
      const t = this.world.getTransform(id);
      const dropped = base.position.y - t.position.y > 0.5;
      const tipped = Math.abs(wrapSym(t.angle - base.angle, info.symmetry)) > Math.PI / 4;
      if (dropped || tipped) {
        this.knockedBodies.add(id);
        this.knockedThisShot.push(id);
      }
    }
    this.maybeCrash();
  }

  private updateMaxRange(): void {
    for (const f of this.fuzzBodies) {
      const t = this.world.getTransform(f.id);
      const range = t.position.x - f.tipX;
      if (range > this.maxRangeValue) this.maxRangeValue = range;
    }
  }

  private allQuiet(): boolean {
    for (const id of this.dynamicBodies) {
      if (this.world.isSleeping(id)) continue;
      const v = this.world.getLinearVelocity(id);
      const w = this.world.getAngularVelocity(id);
      if (Math.hypot(v.x, v.y) >= QUIET_LINEAR || Math.abs(w) >= QUIET_ANGULAR) return false;
    }
    return true;
  }

  private finishShot(): void {
    const targetsLeft = this.targetBodies.length - this.knockedBodies.size;
    // A bullseye-only level has no knock-down targets, so "0 left" must not end the run: the
    // child keeps firing until the shot budget runs out (the goals decide the pass).
    if (this.targetBodies.length > 0 && targetsLeft === 0) {
      this.currentOutcome = 'cleared';
    } else if (this.level.shots > 0 && this.shotsLeftInternal === 0) {
      this.currentOutcome = 'outOfShots';
    } else {
      this.currentOutcome = 'shot';
      // The child may fire again: reload the arm and re-tie the string right away, so the machine
      // looks ready between shots instead of sitting stopped on the crossbar with a cut string.
      // 'cleared'/'outOfShots' leave the arm resting where it stopped, string cut, run over.
      this.reloadArm();
      this.stringCut = false;
    }
  }

  private trajectoryOverlay(): OverlayItem[] {
    const { tip, v } = catapultRelease(this.catapultPart);
    const dots: OverlayItem[] = [];
    for (let t = 0.1; t <= 4 + 1e-9; t += 0.12) {
      const p: Vec2 = { x: tip.x + v.x * t, y: tip.y + v.y * t - 5 * t * t };
      if (p.y < 0 || p.x > 30) break;
      dots.push({ kind: 'dot', p, r: 3, color: 0xffffff, alpha: 0.6 });
    }
    return dots;
  }

  private rotatedBoxBounds(t: Transform, info: ShapeInfo): { x: number; y: number; w: number; h: number } {
    const c = Math.cos(t.angle);
    const s = Math.sin(t.angle);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
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

  private unionBounds(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): { x: number; y: number; w: number; h: number } {
    const minX = Math.min(a.x - a.w / 2, b.x - b.w / 2);
    const maxX = Math.max(a.x + a.w / 2, b.x + b.w / 2);
    const minY = Math.min(a.y - a.h / 2, b.y - b.h / 2);
    const maxY = Math.max(a.y + a.h / 2, b.y + b.h / 2);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
  }
}

export async function createCatapultSim(parts: PlacedPart[], level: CatapultLevel): Promise<CatapultSim> {
  const world = await createWorld({ gravity: { x: 0, y: -10 } });
  const sim = new CatapultSim(world, level, parts);
  sim.settle();
  return sim;
}

// Re-exported so build.test.ts / sim.test.ts can build the same numbers the sim uses.
export { FUZZ };
