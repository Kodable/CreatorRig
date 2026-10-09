// Planet Rover (Vehicle Obstacle Course; the Marstopia Rover until 2026-10-09): course-specific types instantiating the builder
// kit's generics. Units are meters, y up. World is 90 m wide since 2026-10-05 (the panel shows a
// 30 m window of it and the kit scrolls, see terrain.ts WORLD_W / VIEW_W) and 19.125 m tall since
// 2026-10-06 (build.ts WORLD_H).
//
// Stakeholder direction 2026-10-02: the child builds the rover. The level places the glass dome
// (`rover`, Kevin inside); the child adds attachments from the palette (wheels, propulsion,
// weights), each its own kind with its own cost, and drags them anywhere around the dome's rim.
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
  Transform,
  Vec2,
} from '../../../kit/types';
import type { PlanetId } from './planets';
import type { Rock, SurfaceRange } from './surfaces';

export type { Bounds, BodyId, CourseSim, Goal, GoalResult, JointId, OverlayItem, RenderItem, Shape, SimSnapshot, Transform, Vec2 };

export type WheelKind = 'wheelCircle' | 'wheelSquare' | 'wheelStar';
export type PowerKind = 'fan' | 'stove' | 'jet';
export type WeightKind = 'feather' | 'beans' | 'watermelon';
/** Everything the child may add to the dome. */
export type AttachmentKind = WheelKind | PowerKind | WeightKind;

/** The course's part kinds: the level-placed dome, the attachments, and level-placed scenery
 * (a pushable boulder `block`, the `finish` beacon). */
export type PartKind = 'rover' | AttachmentKind | 'block' | 'finish';

/** The Bridge course's load: the old two-wheel buggy (core/buggy.ts), still built through this
 * course's `buildPart`. Not a kind of this course (no catalog entry, never in a level). */
export type LegacyKind = 'vehicle';

/** Rapier body roles. Terrain/wall bodies belong to the world, not a placed part. */
export type BodyRole =
  | 'rover'
  | 'kevin'
  | 'shadow'
  | 'wheel'
  | 'axle'
  | 'slider'
  | 'mount'
  | 'power'
  | 'weight'
  | 'block'
  | 'finish'
  | 'terrain';

/** How a run ends. No `flipped` since 2026-10-05 (Gao: "Allow the car to be upside down"): a rover
 * on its roof keeps driving on whatever wheels touch the ground, and one that cannot ends up
 * `stuck`. */
export type Outcome = 'running' | 'finished' | 'fell' | 'stuck' | 'timeout';

export type Metrics = {
  /** 1 once the rover has reached the finish, else 0. */
  reachedFinish: number;
  time: number;
  flips: number;
  distance: number;
  /** Meters driven toward the beacon on the roof (sim.ts ROOF_ANGLE). */
  upsideDown: number;
  topSpeed: number;
  // Index signature so `Metrics` satisfies the kit's `CourseSpec<K, M extends Record<string, number>, ...>`.
  [key: string]: number;
};

export interface VehicleLevel extends Level<PartKind, Metrics, Outcome> {
  /** Where the level is (2026-10-09): the planet's gravity runs the sim, its ground is the
   * level's ground wherever `surfaces` say nothing, and its look draws the sky (planets.ts). */
  planet: PlanetId;
  /** Ground profile: x ascending from -1 to WORLD_W + 1, no duplicate x (see terrain.ts). */
  terrain: Vec2[];
  /** Stretches of other ground (x ranges, m; later ranges paint over earlier ones): sand, ice,
   * rock, grass. Outside them, the planet's ground (surfaces.ts). */
  surfaces?: SurfaceRange[];
  /** Rocks standing in the ground (Mars "sand + rocks"): already raised into `terrain` (terrain.ts
   * `withRocks`) and covered by rock `surfaces`; listed here so build.ts draws each with a rock
   * picture. levels/shared.ts `level()` does all three from one `rocks` list. */
  rocks?: Rock[];
  /** Seconds before a run ends as `timeout` (default sim.ts TIMEOUT_S): the long levels allow
   * more. */
  timeout?: number;
  /** More part lists that pass the level (levels.test.ts proves each one), besides `solution`. */
  altSolutions?: RoverPart[][];
}

/** A part of this course. */
export type RoverPart = KitPlacedPart<PartKind>;
/** A part of this course or the Bridge course's legacy buggy (what `buildPart` accepts). The
 * Bridge course imports this name. */
export type PlacedPart = KitPlacedPart<PartKind | LegacyKind>;
export type PartHandle = KitPartHandle<PartKind | LegacyKind>;
