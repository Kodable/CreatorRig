// Bridge Builder: course-specific types instantiating the builder kit's generics. Units are
// meters, y up. World is 30 x 15 m (see build.ts).
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

export type PartKind = 'anchor' | 'joint' | 'rod';

export type Material = 'road' | 'wood' | 'steel' | 'cable';

/** Rapier body roles used by this course (plus the buggy's own roles from the vehicle course:
 * chassis, wheel, axle, rider). */
export type BodyRole = 'anchor' | 'joint' | 'deck' | 'slider' | 'bank' | 'chassis' | 'rider' | 'wheel' | 'axle';

export type Outcome = 'running' | 'crossed' | 'fell' | 'stuck' | 'timeout';

export type Metrics = {
  /** 1 once the buggy has reached the far bank, else 0. */
  crossed: number;
  rodsBroken: number;
  cost: number;
  maxStress: number;
  time: number;
  // Index signature so `Metrics` satisfies the kit's `CourseSpec<K, M extends Record<string, number>, ...>`.
  [key: string]: number;
};

export interface BridgeLevel extends Level<PartKind, Metrics, Outcome> {
  /** Static banks: left slab x 0..leftX, right slab x rightX..30, both from y 0 to `y` (bank top,
   * where anchors and the buggy sit). */
  banks: { leftX: number; rightX: number; y: number };
  /** The buggy's weight class for this level (built via the vehicle course's `buildPart`). */
  load: { weight: 'Light' | 'Medium' | 'Heavy' };
  /** Total cost of all rods may not exceed this. */
  budget: number;
}

export type PlacedPart = KitPlacedPart<PartKind>;
export type PartHandle = KitPartHandle<PartKind>;

/** Everything `sim.ts` needs to track one live rod: its physics joint (null once broken, or
 * always null between two static anchors, which need no spring), the deck/slider bodies a road
 * rod adds (empty otherwise), its rest length and material for the strain check, the two node
 * bodies it joins, and the kit-facing `PartHandle` the controller uses for hit-testing/rendering. */
export interface RodHandle {
  part: PlacedPart;
  joint: JointId | null;
  bodies: BodyId[];
  restLength: number;
  material: Material;
  nodeA: BodyId;
  nodeB: BodyId;
  handle: PartHandle;
}
