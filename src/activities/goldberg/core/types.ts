// Floof Goldberg Machines: the child places and tunes parts, presses Play, and a fuzz rolls
// through the machine into the gate. Units are meters, y up; the world is 30 x 15 m.
// Course-specific types live here; the shared shape (PlacedPart, RenderItem, Level, ...) is
// instantiated from the builder kit contract, re-exported under the same names the rest of
// Goldberg's core already imports.
import type {
  BodyId as KitBodyId,
  Bounds as KitBounds,
  Goal as KitGoal,
  GoalResult as KitGoalResult,
  HudState as KitHudState,
  JointId as KitJointId,
  Level as KitLevel,
  Mode as KitMode,
  PartHandle as KitPartHandle,
  PlacedPart as KitPlacedPart,
  PropertyDescriptor as KitPropertyDescriptor,
  PropertyOption as KitPropertyOption,
  RenderItem as KitRenderItem,
  Shape as KitShape,
  SimSnapshot as KitSimSnapshot,
  Transform as KitTransform,
  Vec2 as KitVec2,
} from '../../../kit/types';

export type BodyId = KitBodyId;
export type JointId = KitJointId;
export type Transform = KitTransform;
export type Vec2 = KitVec2;

export type PartKind = 'fuzz' | 'platform' | 'ramp' | 'domino' | 'seesaw' | 'lever' | 'gate';

export type PropertyOption = KitPropertyOption;
/** A choice property. options[0] is the default. */
export type PropertyDescriptor = KitPropertyDescriptor;

/** One placed part. `locked` = the level placed it, the child cannot remove it.
 * `lockPosition` = the child cannot drag it either (tune only). */
export type PlacedPart = KitPlacedPart<PartKind>;

export type BodyRole = 'fuzz' | 'solid' | 'domino' | 'plank' | 'beam' | 'fulcrum' | 'door' | 'sensor';

/** A drawable shape in the body's local frame (meters). */
export type Shape = KitShape;

/** What the scene draws: one item per collider, following its body's transform. */
export type RenderItem = KitRenderItem;

/** Axis-aligned box in world meters: centre + size. Used for hit tests in edit mode. */
export type Bounds = KitBounds;

export type PartHandle = KitPartHandle<PartKind>;

export type Outcome = 'running' | 'reachedGate' | 'tooEarly' | 'settled' | 'timeout';

/** The kit's base snapshot shape, plus two fields Goldberg's sim and tests still read directly:
 * `doorOpen` (false while the gate's door body still exists) and `partsMoved`. */
export type SimSnapshot = KitSimSnapshot<Outcome> & { doorOpen: boolean; partsMoved: number };

// A type alias (not an interface): CourseSpec's M extends Record<string, number>, and only
// object-literal type aliases get an implicit string index signature for that check to pass.
export type Metrics = {
  reachedGate: number;   // 0 or 1
  elapsed: number;       // seconds since Play (or 0 in edit mode)
  partsMoved: number;    // parts that left their rest pose during the run
  partCount: number;     // placed parts, locked ones included
  maxSpeed: number;      // fastest dynamic body during the run, m/s
};
export type Metric = keyof Metrics;
export type Goal = KitGoal<Metrics>;
export type GoalResult = KitGoalResult<Metrics>;

export type GoldbergLevel = KitLevel<PartKind, Metrics, Outcome>;

export type Mode = KitMode;

export type HudState = KitHudState<PartKind, Metrics, Outcome, GoldbergLevel>;
