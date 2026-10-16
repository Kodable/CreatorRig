// Fuzz Fling (Catapults): course-specific types instantiating the builder kit's generics.
// Units are meters, y up. World is 30 x 19.125 m (see build.ts WORLD_H; 15 m until 2026-10-07).
import type {
  Bounds,
  BodyId,
  CourseSim,
  Goal,
  GoalResult,
  JointId,
  Level,
  OverlayItem,
  PartHandle as KitPartHandle,
  PlacedPart as KitPlacedPart,
  RenderItem,
  Shape,
  SimSnapshot,
  Vec2,
} from '../../../kit/types';

export type { Bounds, BodyId, CourseSim, Goal, GoalResult, JointId, OverlayItem, RenderItem, Shape, SimSnapshot, Vec2 };

export type PartKind = 'catapult' | 'can' | 'block' | 'shelf' | 'wall' | 'bullseye';
export type Material = 'wood' | 'brick' | 'steel' | 'crate';
/** Rapier body roles. Ground/wall bodies belong to the world, not a placed part. */
export type BodyRole = 'base' | 'wheel' | 'frame' | 'arm' | 'can' | 'block' | 'solid' | 'bullseye' | 'post' | 'fuzz' | 'ground' | 'wall';

/** 'space' (2026-10-16): the shot just fired was a space shot (catalog.ts SPACE_SPEED) - the fuzz
 * left the world and hit nothing. The child may fire again while shots are left (`canReplay`). */
export type Outcome = 'running' | 'shot' | 'cleared' | 'outOfShots' | 'space';

export type Metrics = {
  /** Targets (can/block) latched as knocked down (dropped or tipped past the threshold). */
  knockedDown: number;
  /** Bullseye contacts, counted once per shot. */
  hits: number;
  shotsUsed: number;
  /** `level.shots > 0 ? shotsLeft : 0` (unlimited shots report 0, never blocking Play). */
  shotsLeft: number;
  /** Targets (can/block parts) not yet knocked down. */
  targetsLeft: number;
  /** Running max of any fuzz's x minus the release tip's x, meters. */
  maxRange: number;
  /** Targets whose live AABB top is above `level.line`; 0 when the level has no line. */
  aboveLine: number;
  /** Crates broken so far (2026-10-15: a crate hit hard enough breaks; catalog.ts CRATE_BREAK).
   * Each also counts in `knockedDown`. */
  smashed: number;
  // Index signature so `Metrics` satisfies the kit's `CourseSpec<K, M extends Record<string, number>, ...>`.
  [key: string]: number;
};

export interface CatapultLevel extends Level<PartKind, Metrics, Outcome> {
  /** Projectiles allowed per level. 0 = unlimited. */
  shots: number;
  /** Per-shot catapult prop overrides, applied via `updatePart` before each `play()`, for
   * levels where one tuning cannot pass alone. */
  solutionShots?: Record<string, string>[];
  /** Other catapult tunings (prop overrides onto `solution`'s catapult) that each pass on their
   * own, for lenient levels where many settings work. Proven by levels.test.ts. */
  altSolutions?: Record<string, string>[];
  /** World y of a "nothing may stay above this" line (huddle 2026-09-22: once there are real
   * structures, knock them below the line any way you like). Drives the `aboveLine` metric; the
   * level draws it with an 'hline' marker. */
  line?: number;
}

export type PlacedPart = KitPlacedPart<PartKind>;
export type PartHandle = KitPartHandle<PartKind>;
