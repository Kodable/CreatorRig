// CatapultSim: owns one PhysicsWorld built from a level's PlacedPart[], runs the fixed-step
// per-shot simulation (settle -> play -> swing -> fly -> quiet), and derives Metrics/Outcome.
//
// 2026-10-16 (huddle with Jon): rubber bands are unlimited ("45 bands launches into space and
// fails"), so a shot over catalog.ts SPACE_SPEED is a SPACE SHOT here: the fuzz rockets out of the
// top of the world with a sparkle trail, touching nothing, and the shot ends 'space'. The knock-down
// check is smarter (Jon: the "moved from start" check could be better): a target is down once it
// has tipped past its balance point (at least 45 degrees) or dropped more than half its own height,
// or broke - sliding along its shelf no longer counts as anything (`updateLatches`). And every
// target a goal needs wears a small bobbing marker until it is down, then a green check pops there
// (Jon: the two-target "Heavy or light" level did not read as two targets; `markerOverlay`).
import {
  armAngleFor,
  bandBundleAt,
  bandSegments,
  bandSprite,
  bandThickness,
  buildArm,
  buildGround,
  buildPart,
  catapultBaseBounds,
  catapultPocketAtRest,
  catapultRelease,
  fireSpot,
  fuzzTextureKey,
  hookSprite,
  isCrate,
  isTarget,
  REST_ANGLE,
  STRING_HOOK_H,
  STRING_HOOK_SIZE,
  stringAnchor,
  FUZZ_PART_ID,
  WORLD_H,
  WORLD_W,
} from './build';
import {
  CRATE_BREAK,
  FUZZ,
  FUZZ_TINT,
  MAX_VISIBLE_BANDS,
  SPLIT_ANGLE_DEG,
  SPLIT_OFFSET,
  armLength,
  bandCount,
  fuzzName,
  fuzzSpec,
  isSpaceShot,
  launchSpeed,
} from './catalog';
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
import { dotsAlong, flightPath, previewAlpha, previewOverlay } from './preview';
import type { ImpactEvent, PhysicsWorld, Transform } from '../../../physics/types';

/** Ticks the pre-roll runs before a shot may be fired, so cans settle onto their shelves. */
export const SETTLE_TICKS = 60;
/** The world's gravity (m/s^2, y up); the shot preview flies under the same pull. */
export const GRAVITY_Y = -10;
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
/** A crate breaking (catalog.ts `CRATE_BREAK`): a SMASH! burst over where it was, and
 * CRATE_DEBRIS cosmetic planks (overlay sprites, no physics) that tumble out and fade. */
export const SMASH_SIZE = 2.4;
export const SMASH_TIME = 0.8;
export const CRATE_DEBRIS = 5;
export const DEBRIS_TIME = 0.9;
/** The debris planks' pictures (spec.ts `textures`), used in turn. */
export const DEBRIS_TEXTURES = ['crate-debris-1', 'crate-debris-2', 'crate-debris-3'] as const;
/** Collision group for a splitting fuzz (the Donut): its pieces collide with everything except
 * each other, so the three fuzzes of a split (spawned 0.1 m apart, closer than their radii) never
 * shove each other apart. Every other fuzz keeps the default filter, so the shipped levels'
 * physics is untouched. */
const SPLIT_FILTER = { group: 0x4, mask: 0xfffb };

type ShapeInfo = { hw: number; hh: number; symmetry: number };

/** `angle` wrapped into (-pi, pi]. */
function wrapPi(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

// ---- the knock-down rule (2026-10-16) --------------------------------------------------------
// Jon: the "moved from start" win check could be better. A target (can or block) is DOWN, latched for
// good, once it has
//  - tipped: turned (in total, either way, since it settled) past its own balance point - the angle at
//    which it would fall over its bottom corner, atan(half width / half height) in its start pose - plus
//    TIP_MARGIN, and never less than TIP_MIN (45 degrees): a can or a domino at 45, a cube at 48, a 2x1
//    plank lying flat at 66 (a plank rocked to 50 degrees falls back flat, so it does not count);
//  - dropped: its centre has fallen more than half its own (start-pose) height below where it settled
//    (fell off a shelf or a stack, or the crate under it broke);
//  - or broke (a crate, `breakCrates`).
// Sliding along its support - however far - is none of these, so it never counts. The total turn is
// tracked step by step (`turned`), so a cube that tumbles onto its next face counts (until 2026-10-16
// a cube's turn was read modulo 90 degrees and never passed 45).
export const TIP_MIN = Math.PI / 4;
export const TIP_MARGIN = (3 * Math.PI) / 180;

// ---- the space shot (2026-10-16) -----------------------------------------------------------
/** The space shot's flight: the fuzz keeps its launch velocity, then rockets upward (SPACE_LIFT
 * m/s^2 up, no gravity) while its sideways speed bleeds off (SPACE_DRAG_X per second), so even a flat
 * shot curls up and out of the top of the world. No collider: it touches nothing. */
export const SPACE_LIFT = 30;
export const SPACE_DRAG_X = 1.5;
/** The fuzz is gone once its centre is this far over the top of the world (or past either side). */
export const SPACE_EXIT_MARGIN = 1;
/** The shot ends this long after the fuzz left the world (the trail fades), or at SPACE_MAX_TIME. */
export const SPACE_AFTER = 0.8;
export const SPACE_MAX_TIME = 4;
/** The sparkle trail: one sparkle every SPACE_TRAIL_EVERY ticks, each fading over SPACE_TRAIL_TIME s. */
export const SPACE_TRAIL_EVERY = 2;
export const SPACE_TRAIL_TIME = 0.7;
const SPARKLE_COLORS = [0xffffff, 0xffe066, 0xff9de2, 0x9fe8ff];

/** One fixed step of the space flight (semi-implicit Euler, the same update the sim drives the
 * fuzz's kinematic body with): the new velocity, then the position it moves to. */
export function spaceStep(p: Vec2, v: Vec2, dt: number): { p: Vec2; v: Vec2 } {
  const nv = { x: v.x * (1 - SPACE_DRAG_X * dt), y: v.y + SPACE_LIFT * dt };
  return { p: { x: p.x + nv.x * dt, y: p.y + nv.y * dt }, v: nv };
}

/** True once a space-shot fuzz at `p` has left the world (over the top, or past either side). */
export function outOfWorld(p: Vec2): boolean {
  return p.y > WORLD_H + SPACE_EXIT_MARGIN || p.x < -SPACE_EXIT_MARGIN || p.x > WORLD_W + SPACE_EXIT_MARGIN;
}

/** The space shot's whole path from the release point, one point per fixed step, until it leaves the
 * world (its last point is outside) - for the dotted preview. */
export function spacePath(tip: Vec2, v: Vec2, dt: number = FIXED_DT, maxT = SPACE_MAX_TIME): Vec2[] {
  const out: Vec2[] = [{ ...tip }];
  let state = { p: { ...tip }, v: { ...v } };
  for (let t = 0; t < maxT && !outOfWorld(state.p); t += dt) {
    state = spaceStep(state.p, state.v, dt);
    out.push(state.p);
  }
  return out;
}

// ---- target markers (2026-10-16) ------------------------------------------------------------
// Jon: the two-target "Heavy or light" level did not read as two targets. Every target a goal
// needs (a can or block for a knock-down goal, a crate for a smash goal, a piece over the line for a
// line goal, a bullseye for a hits goal) wears a small hot-pink marker over it, screen-sized so it
// reads at every zoom, bobbing gently, until it is down (or under the line, smashed, hit); then a
// green check pops there and fades. Numbered 1..N (left to right) on a level with 2..MARKER_NUMBER_MAX
// of them, an arrow beyond that. A target with another marked target resting on it (a tower) wears
// its marker on itself, not over the top, so a tower shows one small badge per piece, never a pile.
export const MARKER_COLOR = 0xff3b7f;
/** Where the "×n" band-count label sits relative to the middle of the band bundle (m). */
export const BAND_LABEL_OFFSET = { x: -0.55, y: 0.2 };
export const CHECK_COLOR = 0x2fb344;
export const MARKER_NUMBER_MAX = 5;
/** Marker label size (stage px), its height over the target's top (m) and its bob (m, s). */
export const MARKER_SIZE = 18;
export const MARKER_GAP = 0.55;
export const MARKER_BOB = 0.12;
export const MARKER_BOB_PERIOD = 1.2;
/** The check: pops to CHECK_SIZE, holds, then shrinks away by CHECK_TIME (page-clock seconds, like
 * the preview: cosmetic only, and it keeps animating after the shot has ended). */
export const CHECK_SIZE = 26;
export const CHECK_TIME = 1.4;

type MarkTarget = {
  /** A stable key (the part id) for the overlay ids. */
  key: number;
  body: BodyId;
  kind: 'knock' | 'smash' | 'line' | 'bullseye';
  /** 1-based number, or 0 for the arrow. */
  n: number;
  /** Whether a marked target sits on this one (the marker goes on the target itself). */
  covered: boolean;
  /** Page-clock time it went down; null while standing. */
  doneAt: number | null;
  /** Its last known centre and top (m), for where the check pops after a crate's body is gone. */
  at: Vec2;
  top: number;
};

/** The flying fuzz's cosmetic tumble rate (rad/s): about two-thirds of a turn a second. */
export const FLIGHT_SPIN = 4;

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
  /** Drawing only (2026-10-15, Gao: "the fuzz looks really static when thrown, make them spin a
   * little"): the extra angle the fuzz is drawn at. It grows by FLIGHT_SPIN rad/s while the fuzz
   * is in its first flight (nothing touched yet), tumbling forward the way it flies, then holds, so
   * the physics' own roll carries on from there. The body never spins: shots are unchanged. */
  spin: number;
  /** -1 flying right (a clockwise, forward tumble), +1 flying left. */
  spinDir: number;
  /** The fuzz has touched something: its cosmetic tumble stops growing. */
  landed: boolean;
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
  /** Breakable crates (blocks with `material: 'crate'`) still standing, and the ones broken so far
   * with where they were when they broke (their bodies are gone; a broken crate counts as knocked
   * down and is never above the line). */
  private readonly crateBodies = new Set<BodyId>();
  private readonly brokenCrates = new Map<BodyId, Vec2>();
  /** Crates that break at the end of the current step (`step()` fills it from the impacts before
   * the contact handlers run, so a breaking crate gets the SMASH! instead of a BOOM or dust). */
  private breakingNow = new Set<BodyId>();
  /** Every dynamic body's velocity just before the current step: how fast a body was closing on a
   * crate when it hit (`cratesToBreak`). Static bodies are absent (velocity 0). */
  private readonly preStepVel = new Map<BodyId, Vec2>();
  /** This shot's tumbling crate planks (cosmetic, `debrisOverlay`). Sim-time stamped. */
  private debris: { id: string; key: string; p0: Vec2; v: Vec2; a0: number; spin: number; size: number; t0: number }[] = [];
  private debrisCounter = 0;

  /** The knock-down rule's per-target numbers (see TIP_MIN): the total turn since the target settled
   * (radians, signed), its angle after the previous step, the turn that tips it, and the drop that
   * downs it (half its start-pose height). Filled by `settle()`. */
  private readonly turned = new Map<BodyId, number>();
  private readonly prevAngle = new Map<BodyId, number>();
  private readonly tipLimit = new Map<BodyId, number>();
  private readonly dropLimit = new Map<BodyId, number>();
  /** Body id -> part id, for the markers' stable overlay ids. */
  private readonly partOfBody = new Map<BodyId, number>();
  /** The targets the level's goals need, each with its marker state (see MARKER_COLOR). */
  private marks: MarkTarget[] = [];

  /** This shot's space flight (catalog.ts SPACE_SPEED), or null: the fuzz's kinematic body (no
   * collider), its velocity, when it left the world (sim time), and its sparkle trail. */
  private space: { id: BodyId; v: Vec2; exitAt: number | null; ticks: number; trail: { p: Vec2; t0: number; i: number }[] } | null = null;
  private spaceShotThisShot = false;
  private sparkleCounter = 0;

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
  /** The shot preview (preview.ts): its dots for the current settings, and when it was last shown
   * (`clock` seconds; -Infinity = not since the last shot). Cosmetic only. */
  private previewDots: Vec2[] = [];
  private previewShownAt = -Infinity;

  constructor(
    private readonly world: PhysicsWorld,
    private readonly level: CatapultLevel,
    private readonly parts: PlacedPart[],
    /** Seconds, for the preview's fade only (never the physics): the page clock by default, a
     * fake one in tests. */
    private readonly clock: () => number = () => performance.now() / 1000,
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
        this.partOfBody.set(body.id, part.id);
        this.dynamicBodies.add(body.id);
        this.targetKind.set(body.id, part.kind === 'block' ? 'block' : 'can');
        if (isCrate(part)) this.crateBodies.add(body.id);
        const visual = handle.visuals[0]!;
        this.targetVisual.set(body.id, visual);
        if (visual.shape.kind === 'box') {
          const { w, h } = visual.shape;
          const symmetry = Math.abs(w - h) < 1e-6 ? Math.PI / 2 : Math.PI;
          this.shapeInfo.set(body.id, { hw: w / 2, hh: h / 2, symmetry });
        }
      } else if (part.kind === 'bullseye') {
        const disc = handle.bodies.find((b) => b.role === 'bullseye');
        if (disc) {
          this.bullseyeBodies.add(disc.id);
          this.partOfBody.set(disc.id, part.id);
        }
      } else if (part.kind === 'shelf' || part.kind === 'wall') {
        for (const b of handle.bodies) this.solidBodies.add(b.id);
      }
    });
  }

  /** Pre-roll so cans settle onto shelves, then baseline transforms + settled bounds for
   * targets. Called once by `createCatapultSim`. */
  settle(): void {
    for (let i = 0; i < SETTLE_TICKS; i++) this.world.step(FIXED_DT, FIXED_SUBSTEPS);

    for (const id of this.targetBodies) {
      const t = this.world.getTransform(id);
      this.baseline.set(id, t);
      this.turned.set(id, 0);
      this.prevAngle.set(id, t.angle);
      const info = this.shapeInfo.get(id);
      if (info) {
        // The start pose's half extents across (horizontal) and up (vertical).
        const c = Math.abs(Math.cos(t.angle));
        const s = Math.abs(Math.sin(t.angle));
        const across = c * info.hw + s * info.hh;
        const up = s * info.hw + c * info.hh;
        this.tipLimit.set(id, Math.max(TIP_MIN, Math.atan2(across, up) + TIP_MARGIN));
        this.dropLimit.set(id, up);
      }
    }

    this.partHandles.forEach((handle) => {
      if (handle.partId === this.catapultPartId) return;
      const body = handle.bodies[0];
      if (!body) return;
      const info = this.shapeInfo.get(body.id);
      if (!info) return;
      const t = this.world.getTransform(body.id);
      handle.bounds = this.rotatedBoxBounds(t, info);
    });

    this.marks = this.pickMarks();
  }

  /** The targets the level's goals need (see MARKER_COLOR): every can/block for a knock-down goal,
   * the crates for a smash goal, the pieces over the line for a line goal, the bullseyes for a hits
   * goal. Numbered left to right when there are 2..MARKER_NUMBER_MAX. */
  private pickMarks(): MarkTarget[] {
    const metrics = new Set(this.level.goals.map((g) => g.metric));
    const picked: { body: BodyId; kind: MarkTarget['kind'] }[] = [];
    for (const id of this.targetBodies) {
      if (metrics.has('knockedDown') || metrics.has('targetsLeft')) picked.push({ body: id, kind: 'knock' });
      else if (metrics.has('smashed') && this.crateBodies.has(id)) picked.push({ body: id, kind: 'smash' });
      else if (metrics.has('aboveLine') && this.isAboveLine(id)) picked.push({ body: id, kind: 'line' });
    }
    if (metrics.has('hits')) for (const id of this.bullseyeBodies) picked.push({ body: id, kind: 'bullseye' });

    const boxes = new Map(picked.map((m) => [m.body, this.bodyBox(m.body)] as const));
    const sorted = [...picked].sort((a, b) => boxes.get(a.body)!.x - boxes.get(b.body)!.x || boxes.get(a.body)!.y - boxes.get(b.body)!.y);
    const numbered = sorted.length >= 2 && sorted.length <= MARKER_NUMBER_MAX;
    return sorted.map((m, i) => {
      const box = boxes.get(m.body)!;
      // Covered: another marked target rests on this one (its box starts within 0.2 m of this top and
      // overlaps it sideways).
      const covered = sorted.some((o) => {
        if (o.body === m.body) return false;
        const ob = boxes.get(o.body)!;
        const bottom = ob.y - ob.h / 2;
        return Math.abs(bottom - (box.y + box.h / 2)) < 0.2 && Math.abs(ob.x - box.x) < (ob.w + box.w) / 2 - 0.05;
      });
      return {
        key: this.partOfBody.get(m.body) ?? m.body,
        body: m.body,
        kind: m.kind,
        n: numbered ? i + 1 : 0,
        covered,
        doneAt: null,
        at: { x: box.x, y: box.y },
        top: box.y + box.h / 2,
      };
    });
  }

  /** A target's or bullseye disc's live world box (a bullseye: its 1.2 m disc). */
  private bodyBox(id: BodyId): { x: number; y: number; w: number; h: number } {
    const t = this.world.getTransform(id);
    const info = this.shapeInfo.get(id);
    if (info) return this.rotatedBoxBounds(t, info);
    return { x: t.position.x, y: t.position.y, w: 1.2, h: 1.2 };
  }

  /** Read-only view of the markers for tests and the course: each marked target's part id, kind,
   * number (0 = arrow) and whether it is down. */
  markedTargets(): { partId: number; kind: MarkTarget['kind']; n: number; done: boolean }[] {
    return this.marks.map((m) => ({ partId: m.key, kind: m.kind, n: m.n, done: m.doneAt !== null }));
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
    // Every change that moves the shot (power, angle - each notch of a live lever drag - fuzz,
    // arm, a drag of the catapult) lands here: show where it flies now.
    this.showPreview();

    return true;
  }

  /** `CourseSim.showPreview`: computes the dotted arc for the current settings and shows it from
   * now until FIRE. Called by `updatePart` and by the kit once Bruno's
   * lesson intro has closed on a level load. Not during a shot. */
  showPreview(): void {
    if (this.currentOutcome === 'running') return;
    const { tip, v } = catapultRelease(this.catapultPart);
    // A space shot's arc curls up and out of the world, through everything (it touches nothing).
    const path = isSpaceShot(this.catapultPart.props)
      ? spacePath(tip, v)
      : flightPath(tip, v, GRAVITY_Y, (a, b) => this.castFuzz(a, b));
    this.previewDots = dotsAlong(path);
    this.previewShownAt = this.clock();
  }

  /** First hit of the loaded fuzz moving a -> b against this world's colliders (0..1 of the way),
   * or null: three rays, its centre and both sides (+/- its radius across the motion), so a
   * grazing touch counts. The catapult's own bodies never stop it. */
  private castFuzz(a: Vec2, b: Vec2): number | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return null;
    const r = fuzzSpec(this.catapultPart.props).r;
    const n = { x: -dy / len, y: dx / len };
    let best: number | null = null;
    for (const off of [0, r, -r]) {
      const f = this.castPastCatapult({ x: a.x + n.x * off, y: a.y + n.y * off }, { x: dx, y: dy });
      if (f !== null && (best === null || f < best)) best = f;
    }
    return best;
  }

  /** `world.castRay` that looks through the catapult's own colliders (the arm, the base). */
  private castPastCatapult(origin: Vec2, tr: Vec2): number | null {
    const own = new Set(this.catapultHandle.bodies.map((b) => b.id));
    let from = 0;
    for (let i = 0; i < 4 && from < 1; i++) {
      const o = { x: origin.x + tr.x * from, y: origin.y + tr.y * from };
      const rest = 1 - from;
      const hit = this.world.castRay(o, { x: tr.x * rest, y: tr.y * rest });
      if (!hit) return null;
      const f = from + hit.fraction * rest;
      if (!own.has(hit.body)) return f;
      from = f + 1e-3;
    }
    return null;
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

    const armLen = armLength(this.catapultPart.props);
    const angleDeg = Number(this.catapultPart.props.angle ?? '45') || 45;
    const releaseArmAngle = armAngleFor(angleDeg);
    const speed = launchSpeed(this.catapultPart.props); // the same speed catapultRelease fires at

    // The arm sweeps clockwise (ω < 0) from REST_ANGLE down to the release angle, where it
    // releases the fuzz and halts (variant A: the crossbar sits at that same angle). |ω| = speed
    // / L would fire true to the tangential-velocity model, but that swing can be uncomfortably
    // fast or slow at the extremes, so the swing TIME is clamped instead and ω re-derived from
    // the clamped time (angle traveled stays exact; only the rate changes).
    const swingSpan = REST_ANGLE - releaseArmAngle; // > 0 for every angle option (15..75)
    const rawOmega = speed / armLen;
    const rawSwingTime = swingSpan / rawOmega;
    const swingTime = Math.min(Math.max(rawSwingTime, MIN_SWING_TIME), MAX_SWING_TIME);
    this.omegaAbs = swingSpan / swingTime;
    this.releaseArmAngle = releaseArmAngle;
    this.armAngle = REST_ANGLE;
    this.released = false;
    this.world.setAngularVelocity(this.armId, -this.omegaAbs);
    this.previewShownAt = -Infinity; // the arc is for planning, never shown over the flight

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
    this.debris = [];
    this.space = null;
    this.spaceShotThisShot = isSpaceShot(this.catapultPart.props);
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
          if (this.spaceShotThisShot) this.spawnSpaceFuzz();
          else this.spawnFuzz();
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
    this.driveSpaceFuzz();

    const result = this.world.step(FIXED_DT, FIXED_SUBSTEPS);
    this.trackSpaceFuzz();

    // Crates break after the step, never mid-step: the world is stepped whole, then the crates
    // that took a hard enough hit during it are taken out.
    this.breakingNow = this.cratesToBreak(result.impacts);
    this.updateFuzzContacts(result.contacts);
    this.updateFlightSpin();
    this.handleContacts(result.contacts);
    this.breakCrates();
    this.updateLatches();
    this.updateSplits();
    this.updateMaxRange();

    const quiet = this.allQuiet();
    this.quietElapsed = quiet ? this.quietElapsed + FIXED_DT : 0;

    // A shot does not end on quiet while a broken crate's planks are still tumbling, so the
    // effect plays out instead of freezing mid-air (the overlay ages on sim time).
    const settled = this.quietElapsed >= QUIET_TIME && !this.debrisBusy() && !this.spaceBusy();
    if ((this.shotElapsed >= MIN_SHOT_TIME && settled) || this.shotElapsed >= MAX_SHOT_TIME) {
      this.finishShot();
    }
  }

  /** Play may run again: after a plain 'shot', or after a 'space' shot while shots are left. */
  canReplay(): boolean {
    if (this.currentOutcome === 'shot') return true;
    return this.currentOutcome === 'space' && (this.level.shots === 0 || this.shotsLeftInternal > 0);
  }

  snapshot(): SimSnapshot<Outcome> {
    const transforms = new Map<BodyId, Transform>();
    for (const id of this.world.bodies()) transforms.set(id, this.world.getTransform(id));
    // The fuzzes are drawn with their cosmetic tumble added (FuzzBody.spin; physics untouched).
    for (const f of this.fuzzBodies) {
      const t = transforms.get(f.id);
      if (t && f.spin !== 0) transforms.set(f.id, { position: t.position, angle: t.angle + f.spin });
    }

    const overlay: OverlayItem[] = [];
    if (this.currentOutcome !== 'running') {
      // The shot preview first, under everything else in the overlay.
      overlay.push(...previewOverlay(this.previewDots, previewAlpha(this.clock() - this.previewShownAt)));
    }
    // No distance label over the flying fuzz any more (2026-10-15, Gao: "remove the meter tracker
    // on top of the fuzz"); the meters panel still shows the distance.
    // The loaded fuzz's name is shown by the fuzz shelf widget (spec.ts), not by a label here.
    overlay.push(...this.debrisOverlay());
    overlay.push(...this.sparkleOverlay());
    overlay.push(...this.burstOverlay());
    overlay.push(...this.bandOverlay());
    overlay.push(...this.stringOverlay());
    overlay.push(...this.markerOverlay());

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
      smashed: this.brokenCrates.size,
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
    if (this.space && this.space.exitAt === null) {
      // The space-shot fuzz (a kinematic body, no collider) is the first 'fuzz' item (right after the
      // parts, ahead of any fuzz resting from an earlier shot), so the camera follows it up.
      const spec = fuzzSpec(this.catapultPart.props);
      items.splice(this.partHandles.reduce((n, h) => n + h.visuals.length, 0), 0, {
        partId: FUZZ_PART_ID,
        body: this.space.id,
        shape: { kind: 'circle', r: spec.r },
        color: FUZZ_TINT[fuzzName(this.catapultPart.props)] ?? FUZZ_TINT.Fur!,
        role: 'fuzz',
        locked: true,
        lockPosition: true,
        textureKey: fuzzTextureKey(this.catapultPart.props, true),
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

  /** The space shot's fuzz (2026-10-16): a kinematic body with no collider at the release point,
   * flown by `driveSpaceFuzz` until it leaves the world. Not a FuzzBody: it never touches, rolls,
   * splits or counts for range. */
  private spawnSpaceFuzz(): void {
    const { tip, v } = catapultRelease(this.catapultPart);
    const id = this.world.createBody({ type: 'kinematic', position: tip, linearVelocity: v });
    this.space = { id, v: { ...v }, exitAt: null, ticks: 0, trail: [] };
  }

  /** Before the world step: the space fuzz's next velocity (`spaceStep`), which its kinematic body
   * then moves at for the step. */
  private driveSpaceFuzz(): void {
    const sp = this.space;
    if (!sp || sp.exitAt !== null) return;
    const t = this.world.getTransform(sp.id);
    sp.v = spaceStep(t.position, sp.v, FIXED_DT).v;
    this.world.setLinearVelocity(sp.id, sp.v);
  }

  /** After the world step: drops a sparkle every SPACE_TRAIL_EVERY ticks, and takes the fuzz out
   * once it has left the world. */
  private trackSpaceFuzz(): void {
    const sp = this.space;
    if (!sp || sp.exitAt !== null) return;
    const p = this.world.getTransform(sp.id).position;
    sp.ticks++;
    if (sp.ticks % SPACE_TRAIL_EVERY === 0) {
      this.sparkleCounter++;
      sp.trail.push({ p: { ...p }, t0: this.shotElapsed, i: this.sparkleCounter });
    }
    if (outOfWorld(p)) {
      sp.exitAt = this.shotElapsed;
      this.world.destroyBody(sp.id);
    }
  }

  /** A space shot keeps the shot open until the fuzz is gone and its trail has faded. */
  private spaceBusy(): boolean {
    const sp = this.space;
    if (!sp) return false;
    if (this.shotElapsed >= SPACE_MAX_TIME) return false;
    return sp.exitAt === null || this.shotElapsed - sp.exitAt < SPACE_AFTER;
  }

  /** The space shot's sparkle trail: each sparkle a twinkling screen-sized dot (a soft halo and a
   * bright core, in turn white, gold, pink and ice blue), scattered a little either side of the path,
   * shrinking and fading over SPACE_TRAIL_TIME. Sim time, so it replays the same. */
  private sparkleOverlay(): OverlayItem[] {
    const sp = this.space;
    if (!sp) return [];
    const out: OverlayItem[] = [];
    for (const s of sp.trail) {
      const age = this.shotElapsed - s.t0;
      if (age < 0 || age >= SPACE_TRAIL_TIME) continue;
      const k = 1 - age / SPACE_TRAIL_TIME;
      const side = ((s.i * 37) % 7) / 6 - 0.5; // -0.5 .. 0.5, a fixed scatter per sparkle
      const p = { x: s.p.x + side * 0.5, y: s.p.y - side * 0.2 };
      const color = SPARKLE_COLORS[s.i % SPARKLE_COLORS.length]!;
      const r = (s.i % 3 === 0 ? 6 : 4) * (0.5 + 0.5 * k);
      out.push({ kind: 'dot', p, r: r * 1.9, color, alpha: 0.25 * k, screen: true });
      out.push({ kind: 'dot', p, r, color, alpha: 0.95 * k, screen: true });
    }
    return out;
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
      spin: 0,
      spinDir: velocity.x >= 0 ? -1 : 1,
      landed: false,
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
  /** The cosmetic tumble (see `FuzzBody.spin`): sim time only, so it replays the same. */
  private updateFlightSpin(): void {
    for (const f of this.fuzzBodies) {
      if (f.landed) continue;
      if (f.contacts.size > 0) {
        f.landed = true;
        continue;
      }
      f.spin += f.spinDir * FLIGHT_SPIN * FIXED_DT;
    }
  }

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

      if (this.bullseyeBodies.has(otherId)) {
        if (!this.hitThisShot) {
          this.hits++;
          this.hitThisShot = true;
        }
        this.markDone(otherId);
      }

      this.recordBurst(otherId, fuzzId);
    }
  }

  /** First touch of the flying fuzz against a target (can/block) or a bullseye disc this shot:
   * records a hit-burst sprite (at most once per body per shot). Anything else (ground, a wall,
   * another fuzz) is ignored. */
  private recordBurst(otherId: BodyId, fuzzId: BodyId): void {
    if (this.burstedBodies.has(otherId) || this.breakingNow.has(otherId)) return;
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
      if (this.brokenCrates.has(id)) continue;
      const v = this.world.getLinearVelocity(id);
      this.preStepSpeed.set(id, Math.hypot(v.x, v.y));
    }
    this.preStepVel.clear();
    if (this.crateBodies.size === 0) return;
    for (const id of this.dynamicBodies) this.preStepVel.set(id, this.world.getLinearVelocity(id));
  }

  /** A target landing on the ground or a shelf/wall faster than DUST_SPEED this shot: one dust
   * puff (at most one per body per shot) just above where it came down. */
  private recordDust(target: BodyId): void {
    if (this.dustedBodies.has(target) || this.breakingNow.has(target)) return;
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
      const p = this.brokenCrates.get(id) ?? this.world.getTransform(id).position;
      sx += p.x;
      sy += p.y;
    }
    const n = this.knockedThisShot.length;
    this.pushBurst('fx-crash', { x: sx / n, y: Math.min(sy / n + 2, 13) }, CRASH_SIZE, CRASH_TIME, -0.08);
  }

  /** Targets whose live AABB top (rotated box bounds) is above `level.line`; 0 without a line.
   * Live, so it reads the settled pose at rest and the wreck after a topple. */
  private countAboveLine(): number {
    if (this.level.line === undefined) return 0;
    let n = 0;
    for (const id of this.targetBodies) if (this.isAboveLine(id)) n++;
    return n;
  }

  /** Whether a target's live box top is above `level.line` (false without a line, or once broken). */
  private isAboveLine(id: BodyId): boolean {
    const line = this.level.line;
    if (line === undefined || this.brokenCrates.has(id)) return false; // a broken crate is gone
    const info = this.shapeInfo.get(id);
    if (!info) return false;
    const b = this.rotatedBoxBounds(this.world.getTransform(id), info);
    return b.y + b.h / 2 > line + 1e-3;
  }

  /** The live crates hit hard this step (catalog.ts `CRATE_BREAK`): more than `impulse` N s from
   * one other body (the fuzz, a block, the ground, a shelf; one impact report per body pair from
   * the physics adapter) that was closing on it at `speed` m/s or more before the step. */
  private cratesToBreak(impacts: ImpactEvent[]): Set<BodyId> {
    const out = new Set<BodyId>();
    const zero = { x: 0, y: 0 };
    for (const imp of impacts) {
      if (imp.impulse <= CRATE_BREAK.impulse) continue;
      const va = this.preStepVel.get(imp.bodyA) ?? zero;
      const vb = this.preStepVel.get(imp.bodyB) ?? zero;
      if (Math.hypot(va.x - vb.x, va.y - vb.y) < CRATE_BREAK.speed) continue;
      for (const id of [imp.bodyA, imp.bodyB]) {
        if (this.crateBodies.has(id) && !this.brokenCrates.has(id)) out.add(id);
      }
    }
    return out;
  }

  /** Takes out every crate in `breakingNow`: a SMASH! burst and the tumbling planks where it was,
   * its body destroyed (after the step), its picture dropped, and it counts as knocked down. */
  private breakCrates(): void {
    for (const id of this.breakingNow) {
      const t = this.world.getTransform(id);
      const v = this.world.getLinearVelocity(id);
      const info = this.shapeInfo.get(id);
      this.spawnDebris(t, v, info ?? { hw: 0.5, hh: 0.5, symmetry: Math.PI / 2 });
      this.pushBurst('fx-smash', { x: t.position.x, y: t.position.y + 0.9 }, SMASH_SIZE, SMASH_TIME, -0.1);

      this.world.destroyBody(id);
      this.crateBodies.delete(id);
      this.brokenCrates.set(id, { ...t.position });
      this.dynamicBodies.delete(id);
      this.burstedBodies.add(id);
      for (const f of this.fuzzBodies) f.contacts.delete(id);
      if (!this.knockedBodies.has(id)) {
        this.knockedBodies.add(id);
        this.knockedThisShot.push(id);
      }
      this.markDone(id);
      const handle = this.partHandles.find((h) => h.bodies.some((b) => b.id === id));
      if (handle) {
        handle.bodies = [];
        handle.visuals = [];
        handle.bounds = { x: t.position.x, y: t.position.y, w: 0, h: 0 };
      }
    }
    this.breakingNow = new Set();
  }

  /** CRATE_DEBRIS planks flying out of a broken crate: spread across its box, thrown outward and up
   * (plus a share of the crate's own motion), each spinning its own way. Fixed numbers per piece,
   * no randomness, so a replay breaks the same way. */
  private spawnDebris(t: Transform, v: Vec2, info: ShapeInfo): void {
    const c = Math.cos(t.angle);
    const s = Math.sin(t.angle);
    // A plank most of the crate's longest side (0.8 m for a 1 x 1), within 0.5 .. 1.1 m.
    const size = Math.max(0.5, Math.min(1.1, 1.6 * Math.max(info.hw, info.hh)));
    for (let i = 0; i < CRATE_DEBRIS; i++) {
      const u = i / (CRATE_DEBRIS - 1) - 0.5; // -0.5 .. 0.5
      const lx = u * info.hw * 1.4;
      const ly = (i % 2 === 0 ? 0.3 : -0.3) * info.hh;
      const p0 = { x: t.position.x + c * lx - s * ly, y: t.position.y + s * lx + c * ly };
      this.debrisCounter++;
      this.debris.push({
        id: `debris-${this.debrisCounter}`,
        key: DEBRIS_TEXTURES[i % DEBRIS_TEXTURES.length]!,
        p0,
        v: { x: 0.35 * v.x + u * 5, y: 0.2 * Math.max(0, v.y) + 3 + (i % 3) * 0.9 },
        a0: t.angle + i * 1.1,
        spin: (i % 2 === 0 ? 1 : -1) * (5 + i * 1.5),
        size,
        t0: this.shotElapsed,
      });
    }
  }

  private debrisBusy(): boolean {
    return this.debris.some((d) => this.shotElapsed - d.t0 < DEBRIS_TIME);
  }

  /** The tumbling planks: ballistic under the world's gravity (sim time, so deterministic), full
   * alpha for the first half of DEBRIS_TIME, then fading out. */
  private debrisOverlay(): OverlayItem[] {
    const items: OverlayItem[] = [];
    for (const d of this.debris) {
      const age = this.shotElapsed - d.t0;
      if (age < 0 || age >= DEBRIS_TIME) continue;
      const p = { x: d.p0.x + d.v.x * age, y: d.p0.y + d.v.y * age + 0.5 * GRAVITY_Y * age * age };
      const half = DEBRIS_TIME / 2;
      const alpha = age < half ? 1 : 1 - (age - half) / half;
      items.push({ kind: 'sprite', id: d.id, textureKey: d.key, p, size: d.size, alpha, angle: d.a0 + d.spin * age });
    }
    return items;
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
    const n = bandCount(this.catapultPart.props);
    const thickness = bandThickness(n);
    const bands: OverlayItem[] = [];
    const hooks: OverlayItem[] = [];
    segs.forEach(({ a, b }, i) => {
      const band = bandSprite(`band-${i}`, a, b, thickness);
      if (band) bands.push(band);
      const theta = Math.atan2(b.y - a.y, b.x - a.x);
      hooks.push(hookSprite(`band-${i}-hook-a`, a, theta), hookSprite(`band-${i}-hook-b`, b, theta + Math.PI));
    });
    const out = [...bands, ...hooks];
    // 2026-10-16: past MAX_VISIBLE_BANDS the bundle carries its count ("×12"), riding the bands.
    // Beside the bundle (BAND_LABEL_OFFSET, up and back over the arm), not on it: the scene draws
    // overlay sprites (the bands) above overlay labels, so a label on the bundle would be hidden.
    if (n > MAX_VISIBLE_BANDS) {
      const mid = bandBundleAt(this.catapultPart, this.armAngle);
      const p = { x: mid.x + BAND_LABEL_OFFSET.x, y: mid.y + BAND_LABEL_OFFSET.y };
      out.push({ kind: 'label', id: 'band-count', p, text: `×${n}`, color: 0xffffff, bg: 0xc42b2b, size: 14 });
    }
    return out;
  }

  /** The target markers and check pops (see MARKER_COLOR). A standing target's marker bobs over its
   * live top (or sits on the target itself when another marked one rests on it); once down, a green
   * check pops where it was (a growing, fading ring under it) and is gone after CHECK_TIME. */
  private markerOverlay(): OverlayItem[] {
    if (this.marks.length === 0) return [];
    const now = this.clock();
    const out: OverlayItem[] = [];
    for (const m of this.marks) {
      if (m.doneAt === null) {
        if (this.world.bodies().includes(m.body)) {
          const box = this.bodyBox(m.body);
          m.at = { x: box.x, y: box.y };
          m.top = box.y + box.h / 2;
        }
        const bob = MARKER_BOB * Math.sin((2 * Math.PI * now) / MARKER_BOB_PERIOD + m.key);
        const p = m.covered ? { x: m.at.x, y: m.at.y + bob * 0.4 } : { x: m.at.x, y: m.top + MARKER_GAP + bob };
        const text = m.n > 0 ? String(m.n) : m.covered ? '●' : '▼';
        out.push({ kind: 'label', id: `mark-${m.key}`, p, text, color: 0xffffff, bg: MARKER_COLOR, size: MARKER_SIZE });
        continue;
      }
      const age = now - m.doneAt;
      if (age < 0 || age >= CHECK_TIME) continue;
      // Pop (0 -> 1.25 by 0.15 s), settle to 1 by 0.3 s, hold, shrink away over the last 0.4 s.
      let k: number;
      if (age < 0.15) k = 1.25 * (age / 0.15);
      else if (age < 0.3) k = 1.25 - 0.25 * ((age - 0.15) / 0.15);
      else if (age < CHECK_TIME - 0.4) k = 1;
      else k = (CHECK_TIME - age) / 0.4;
      const p = m.covered ? { ...m.at } : { x: m.at.x, y: m.top + MARKER_GAP };
      const ring = Math.min(1, age / 0.5);
      out.push({ kind: 'dot', p, r: 14 + 16 * ring, color: CHECK_COLOR, alpha: 0.45 * (1 - ring), screen: true });
      out.push({ kind: 'label', id: `mark-${m.key}`, p, text: '✓', color: 0xffffff, bg: CHECK_COLOR, size: Math.max(6, Math.round(CHECK_SIZE * k)) });
    }
    return out;
  }

  /** Latches a marked target (or bullseye) as done: its check pops from now. */
  private markDone(body: BodyId): void {
    for (const m of this.marks) {
      if (m.body === body && m.doneAt === null) m.doneAt = this.clock();
    }
  }

  /** The line-goal markers follow the live line: a piece that is no longer over the line is done. */
  private updateLineMarks(): void {
    for (const m of this.marks) {
      if (m.kind !== 'line' || m.doneAt !== null) continue;
      if (this.brokenCrates.has(m.body) || !this.isAboveLine(m.body)) m.doneAt = this.clock();
    }
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
      // By the string's tie-down/cut point (`fireSpot`; the in-scene FIRE button sat there until
      // 2026-10-15, FIRE is the bottom bar's button now), so the snip shows where the cut is.
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

  /** The knock-down rule (see TIP_MIN): tipped past its balance point, dropped more than half its
   * height, or broken (`breakCrates`). Latched for good: once down, a target stays counted. */
  private updateLatches(): void {
    for (const id of this.targetBodies) {
      if (this.knockedBodies.has(id) || this.brokenCrates.has(id)) continue;
      const base = this.baseline.get(id);
      const tipLimit = this.tipLimit.get(id);
      const dropLimit = this.dropLimit.get(id);
      if (!base || tipLimit === undefined || dropLimit === undefined) continue;
      const t = this.world.getTransform(id);
      const turned = (this.turned.get(id) ?? 0) + wrapPi(t.angle - (this.prevAngle.get(id) ?? t.angle));
      this.turned.set(id, turned);
      this.prevAngle.set(id, t.angle);
      const dropped = base.position.y - t.position.y > dropLimit;
      const tipped = Math.abs(turned) > tipLimit;
      if (dropped || tipped) {
        this.knockedBodies.add(id);
        this.knockedThisShot.push(id);
        this.markDone(id);
      }
    }
    this.updateLineMarks();
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
    } else if (this.spaceShotThisShot) {
      // The fuzz went to space (2026-10-16): this shot's outcome says so, whether or not shots are
      // left; with shots left the machine reloads below and FIRE works again (`canReplay`).
      this.currentOutcome = 'space';
      if (this.level.shots === 0 || this.shotsLeftInternal > 0) {
        this.reloadArm();
        this.stringCut = false;
        this.showPreview();
      }
    } else if (this.level.shots > 0 && this.shotsLeftInternal === 0) {
      this.currentOutcome = 'outOfShots';
    } else {
      this.currentOutcome = 'shot';
      // The child may fire again: reload the arm and re-tie the string right away, so the machine
      // looks ready between shots instead of sitting stopped on the crossbar with a cut string.
      // 'cleared'/'outOfShots' leave the arm resting where it stopped, string cut, run over.
      this.reloadArm();
      this.stringCut = false;
      // The arc for the next shot, from the settled world (it stays until FIRE).
      this.showPreview();
    }
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

export async function createCatapultSim(parts: PlacedPart[], level: CatapultLevel, clock?: () => number): Promise<CatapultSim> {
  const world = await createWorld({ gravity: { x: 0, y: GRAVITY_Y } });
  const sim = new CatapultSim(world, level, parts, clock);
  sim.settle();
  return sim;
}

// Re-exported so build.test.ts / sim.test.ts can build the same numbers the sim uses.
export { FUZZ };
