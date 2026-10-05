// Structural Stability: course-specific types instantiating the builder kit's generics.
// Units are meters, y up. World is 24 x 12 m (see build.ts).
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

export type PartKind = 'block' | 'beam' | 'fuzz';
export type Material = 'wood' | 'brick' | 'steel';
/** Rapier body roles. Ground/wall bodies belong to the world, not a placed part. */
export type BodyRole = 'block' | 'beam' | 'fuzz' | 'ground' | 'wall';

export interface Metrics {
  /** Fuzz centre y, meters. 0 when the level has no fuzz. */
  fuzzHeight: number;
  /** Seconds the fuzz has stayed above `level.keepAbove`, latched once it drops below. */
  survivalTime: number;
  /** Parts (block/beam) that fell, latched. */
  partsFell: number;
  /** All placed parts, locked ones included. */
  partCount: number;
  /** Highest rotated corner among non-fallen block/beam parts. 0 if none. */
  topHeight: number;
  // Index signature (not in the plan's literal template) so `Metrics` satisfies the kit's
  // `CourseSpec<K, M extends Record<string, number>, ...>` constraint used by spec.ts.
  [key: string]: number;
}

export type Outcome = 'running' | 'survived' | 'collapsed';

export type TestSpec =
  | { kind: 'none'; duration: number }
  | { kind: 'shake'; duration: number; amplitude: number; frequency: number }
  | { kind: 'wind'; duration: number; strength: number; from: 'left' | 'right'; ramp: number }
  | { kind: 'blast'; duration: number; at: Vec2; impulse: number; delay: number };

export interface StructuresLevel extends Level<PartKind, Metrics, Outcome> {
  test: TestSpec;
  /** The keep-above line: the fuzz must stay above this y (world meters). */
  keepAbove: number;
  /** Default true. false falls back to plain stacking (no glue built). */
  glue?: boolean;
}

export type PlacedPart = KitPlacedPart<PartKind>;
export type PartHandle = KitPartHandle<PartKind>;
