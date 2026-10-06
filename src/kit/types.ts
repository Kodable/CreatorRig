// FROZEN CONTRACT: owned by the orchestrator; agents do not modify it.
// The builder kit: the shared shape of every "place and tune parts, press Play, watch" course
// (Goldberg, Structures, later Catapult, Vehicle, Bridge). A course supplies a CourseSpec; the kit
// supplies the scene, the HUD, the controller and the boot. Units are meters, y up.
import type { BodyId, JointId, Transform, Vec2 } from '../physics/types';
import type { ActivityHost } from '../activities/types';

export type { BodyId, JointId, Transform, Vec2, ActivityHost };

// ---- parts -------------------------------------------------------------------------------

/** `image` is the URL of the part's own picture (an SVG under public/), shown in the properties
 * drawer instead of a text chip and reusable as a scene texture (see `CourseSpec.textures`). */
export interface PropertyOption { value: string; label: string; image?: string }
/** A choice property. Options are listed in their natural order (Low -> Max, 15 -> 75, S -> L).
 * `default` names the default value; when absent, options[0] is the default. */
export interface PropertyDescriptor { code: string; label: string; options: PropertyOption[]; default?: string }

/** One placed part. `locked` = the level placed it, the child cannot remove it.
 * `lockPosition` = the child cannot drag it either (tune only). */
export interface PlacedPart<K extends string = string> {
  id: number;
  kind: K;
  x: number;
  y: number;
  props: Record<string, string>;
  locked?: boolean;
  lockPosition?: boolean;
  /** Property codes the child cannot change on this part (chips shown but disabled). */
  lockedProps?: string[];
  /** Drag stays inside this rectangle (world meters, centre + size). */
  region?: Bounds;
}

// ---- rendering ---------------------------------------------------------------------------

/** A drawable shape in the body's local frame (meters). */
export type Shape =
  | { kind: 'circle'; r: number; cx?: number; cy?: number }
  | { kind: 'box'; w: number; h: number; cx?: number; cy?: number }
  | { kind: 'polygon'; vertices: Vec2[] };

/** What the scene draws: one item per collider, following its body's transform. */
export interface RenderItem {
  partId: number;
  body: BodyId;
  shape: Shape;
  color: number;
  role: string;
  locked: boolean;
  lockPosition: boolean;
  alpha?: number;
  /** Draw a texture-backed item level (no rotation) while its body turns: a character riding a
   * swinging arm keeps its head up. Position still follows the body. Default false. */
  upright?: boolean;
  /** A key from `CourseSpec.textures`: draws this item with that picture (scaled to the shape)
   * instead of the role's texture or a fill. Lets a swapped part show its real look. */
  textureKey?: string;
}

/** Axis-aligned box in world meters: centre + size. Used for hit tests in edit mode. */
export interface Bounds { x: number; y: number; w: number; h: number }

export interface PartHandle<K extends string = string> {
  partId: number;
  kind: K;
  bodies: { id: BodyId; role: string }[];
  joints: JointId[];
  visuals: RenderItem[];
  /** Reflects the settled pose (after the pre-roll), not the placed anchor. */
  bounds: Bounds;
  /** When present, the scene hit-tests this thick segment (world meters, half-width r) instead
   * of the bounds: a rod between two points. */
  hitSegment?: { a: Vec2; b: Vec2; r: number };
}

/** Decorations drawn on top of the items: static markers from the level, or per-frame overlay
 * from the sim (glue ticks, wind arrows, a blast flash). World meters. */
export type OverlayItem =
  | { kind: 'line'; a: Vec2; b: Vec2; color: number; width?: number; alpha?: number }
  | { kind: 'dot'; p: Vec2; r: number; color: number; alpha?: number }
  | { kind: 'hline'; y: number; color: number; label?: string }
  | { kind: 'flag'; p: Vec2 }
  | { kind: 'icon'; p: Vec2; text: string }
  /** A live readout pill (a speed, a distance). The scene caches its Text on `id`, not on the
   * text, so a value that changes every frame allocates nothing. `size` in stage px (default 16),
   * counter-scaled so it stays the same size on screen at any camera zoom. */
  | { kind: 'label'; id: string; p: Vec2; text: string; color?: number; bg?: number; size?: number;
      /** When set, the pill is placed at this body's DRAWN position plus `offset` (world m), so it
       * moves in lockstep with an interpolated body; `p` is the fallback when the body is gone. */
      body?: BodyId; offset?: Vec2 }
  /** A picture from `CourseSpec.textures` centred at `p`, `size` world meters wide (height from
   * the picture's aspect), for short-lived effects the sim animates itself (a BOOM burst on a
   * hit: the sim grows `size` and fades `alpha` over a few ticks). The scene caches one Image per
   * `id` and hides it when the id is absent from a frame. */
  | { kind: 'sprite'; id: string; textureKey: string; p: Vec2; size: number; alpha?: number; angle?: number };

// ---- camera and widgets ------------------------------------------------------------------

/** A camera frame in world meters. zoom 1 = the whole panel (the default fixed view); 2.2 = the
 * panel shown 2.2x bigger, clamped so the visible rectangle never leaves the panel. */
export interface CameraFrame { cx: number; cy: number; zoom: number }

/** Play mode: soft-follow the first live body whose RenderItem role is in `roles` (priority
 * order). `lerp` is the per-60 Hz-frame approach factor 0..1 (default 0.1); `offset` is added to
 * the followed body's position (lead the flight, sit above a rover). */
export interface FollowSpec { roles: string[]; zoom: number; lerp?: number; offset?: Vec2 }

/** What the controller does when a widget fires, before `CourseSpec.onWidget`.
 * Default: 'setProp' when the widget has a `code`, otherwise 'none'. */
/** 'select' (idle widgets only): selects `TapWidget.partId` (opens its drawer) - a BUILD button
 * floating over a machine. */
export type WidgetAction = 'setProp' | 'play' | 'select' | 'none';

interface WidgetBase {
  /** Stable and unique among the widgets of one selected part; keys drag and animation state. */
  id: string;
  /** The property this widget drives. The HUD hides that descriptor from the prop panel, and
   * the controller marks the widget `locked` when the code is in `part.lockedProps`. */
  code?: string;
  action?: WidgetAction;
  /** Control size in stage px, screen-constant (the scene divides by the camera zoom). The
   * scene never draws or hit-tests a control smaller than 64 px (children's fingers). Default 76. */
  size?: number;
  color?: number;
  /** Stamped by the controller from `part.lockedProps`; courses leave it undefined. */
  locked?: boolean;
}

/** A button anchored in the world. With `code` and `values`, each tap sets the next value in
 * `values` (wrapping). `texture` draws a role texture (tinted) instead of the glyph. `hopTo`
 * flies a copy of the icon/texture to a world point after a live tap (a fuzz hops into the
 * bucket). */
export interface TapWidget extends WidgetBase {
  kind: 'tap';
  at: Vec2;
  icon: string;
  label?: string;
  values?: string[];
  hopTo?: Vec2;
  texture?: { role: string; tint?: number };
  /** 'card' (default): the square icon card with a caption under it. 'big': a chunky rounded
   * pill with the label INSIDE in 24 px bold next to the icon, a soft pulse, and a wider hit area
   * (the one obvious start button, e.g. "▶ DRIVE"; or "🔧 BUILD"). */
  style?: 'card' | 'big';
  /** With `action: 'select'`: the part to select when tapped. */
  partId?: number;
}

/** A handle dragged along an arc around `pivot`, snapping to `options` on release. Option i sits
 * at `arcFrom + (arcTo - arcFrom) * i / (options.length - 1)` (radians, CCW, 0 = +x, world axes).
 * `radiusPx` in stage px, screen-constant. `size` is the handle diameter (default 72). The
 * traversed arc fills with the accent colour; `readout` 'value' (default) draws the current
 * option's label big (24 px bold) inside the arc. Pass `options` in visual order. */
export interface DialWidget extends WidgetBase {
  kind: 'dial';
  pivot: Vec2;
  radiusPx: number;
  /** Arc radius in WORLD meters. When set it overrides `radiusPx`: the handle then stays on a
   * machine part at any camera zoom (a lever's knob at the end of its stick). */
  radiusM?: number;
  /** 'arc' (default) draws the track band and its accent fill. 'none' draws only the notch ticks:
   * the machine part under the handle is the track (a lever stick). */
  track?: 'arc' | 'none';
  arcFrom: number;
  arcTo: number;
  options: PropertyOption[];
  value: string;
  /** 'knob' draws the current option's label (16 px bold) inside the handle itself. */
  readout?: 'value' | 'none' | 'knob';
  /** Commit every new notch while the handle is dragged (the controller sets the prop as the knob
   * snaps), so the machine part moves with the finger. One undo entry per drag. Default false:
   * the prop commits on release only. */
  live?: boolean;
  /** No longer drawn; kept for older specs. */
  label?: string;
}

/** A row (or column) of alternatives anchored at `at`; a tap on a cell sets the prop. Cells are
 * `size` px squares or circles ('shape'); `plate` draws one backing plate behind all cells (a
 * shelf). `labels` 'active' draws only the active cell's label (16 px); default 'none'. An item
 * `texture` draws that role's texture (tinted) in the cell instead of the icon; `hopTo` flies
 * a copy of the tapped cell's icon/texture to a world point. */
export interface RackWidget extends WidgetBase {
  kind: 'rack';
  at: Vec2;
  items: { value: string; icon: string; label: string; texture?: { role: string; tint?: number } }[];
  value: string;
  vertical?: boolean;
  labels?: 'none' | 'active';
  shape?: 'square' | 'circle';
  plate?: boolean;
  hopTo?: Vec2;
  /** No longer drawn; kept for older specs. */
  label?: string;
}

/** A notched lever: a straight track carrying `options`, dragged (or tapped) along its length.
 * The track is screen-constant: it starts at `at` (world meters, the FIRST option's notch) and
 * runs `lengthPx` stage px in `dir` ('up' = toward +y world, 'right' = toward +x). Option i sits
 * at i/(n-1) of the track. A drag snaps the knob to the nearest notch as it moves and commits on
 * release; a tap on the track jumps to the nearest notch. The track below the knob fills with
 * the accent colour (the readout). `size` is the knob width across the track (default 76). */
export interface LeverWidget extends WidgetBase {
  kind: 'lever';
  at: Vec2;
  lengthPx: number;
  dir?: 'up' | 'right';
  options: PropertyOption[];
  value: string;
  /** Glyph drawn in a round chip at the far (last-option) end of the track. */
  icon?: string;
  /** Draws the current option's label in a pill beside the knob. Default false. */
  showValue?: boolean;
  /** A pipe drawn from the track base to this world point: mounts the lever on its machine. */
  tether?: Vec2;
}

/** Tap to step one property through `options` (wrapping). Shows ONLY the current option's icon
 * plus a dot strip (one dot per option, the current one filled). 'ring' draws an open ring
 * around the machine part it sits on (the part stays visible and IS the readout); 'card'
 * (default) draws a filled rounded card with a small "change" badge. The single hit carries the
 * NEXT option's value, so the controller's setProp path needs nothing new. */
export interface CycleWidget extends WidgetBase {
  kind: 'cycle';
  at: Vec2;
  options: { value: string; icon: string; label?: string }[];
  value: string;
  style?: 'card' | 'ring';
  /** Hide the dot strip. Default false. */
  noDots?: boolean;
  /** Draw the current option's label in a pill under the control. Default false. */
  showValue?: boolean;
  /** Fly a copy of the current icon/texture to this world point after a live tap. */
  hopTo?: Vec2;
  texture?: { role: string; tint?: number };
}

/** A handle at `at` dragged toward `to` (world meters). Releasing past `threshold` (0..1 of the
 * distance, default 0.6) fires the action; releasing short springs back. `ring` draws the
 * handle as the big green pulsing "go" ring (the only green control on screen); `arrow` draws a
 * curved pulsing arrow toward `to`. `label` shows before the threshold, `releaseLabel` (default
 * 'LET GO!') after it. */
export interface PullWidget extends WidgetBase {
  kind: 'pull';
  at: Vec2;
  to: Vec2;
  threshold?: number;
  icon?: string;
  label?: string;
  releaseLabel?: string;
  ring?: boolean;
  arrow?: boolean;
}

export type Widget = TapWidget | DialWidget | RackWidget | LeverWidget | CycleWidget | PullWidget;

/** The HTML card shown in the dash after a run: what the child set, and what happened. */
export interface ResultRow { label: string; value: string }
export interface ResultCard { title: string; rows: ResultRow[]; outcome: string; tone: 'pass' | 'fail' | 'neutral' }

/** A 0..1 bar in the prop panel (Speed, Grip, ...), derived from the selected part's props. */
export interface StatBar { label: string; value: number; color?: number }

// ---- simulation --------------------------------------------------------------------------

export interface SimSnapshot<O extends string = string> {
  elapsed: number;
  outcome: O;
  /** Every live body. A body missing here was destroyed (for example an opened door). */
  transforms: Map<BodyId, Transform>;
  overlay?: OverlayItem[];
}

/** What the controller needs from a course simulation. `O` must include 'running'. */
export interface CourseSim<M, O extends string> {
  play(): void;
  step(): void;
  snapshot(): SimSnapshot<O>;
  metrics(): M;
  renderItems(): RenderItem[];
  handles(): PartHandle[];
  /** Settled anchor per part id, for courses that write the rest pose back into the parts. */
  settledPositions?(): Map<number, Vec2>;
  /** Apply a prop change or a move in place. Returns true when no world rebuild is needed;
   * renderItems() and handles() may have changed and the controller re-sends them. */
  updatePart?(part: PlacedPart): boolean;
  /** After a run ended: true when Play may run again on this same sim (a multi-shot course). */
  canReplay?(): boolean;
  readonly outcome: O;
  destroy(): void;
}

// ---- goals and levels --------------------------------------------------------------------

export interface Goal<M> { metric: keyof M & string; op: '>=' | '<=' | '=='; value: number; label: string }
export interface GoalResult<M> { goal: Goal<M>; current: number; pass: boolean }

export interface Level<K extends string, M, O extends string> {
  id: string;
  title: string;
  bruno: string;
  goals: Goal<M>[];
  /** Pre-placed parts. Ids unique and positive; the controller allocates new ids above them. */
  parts: PlacedPart<K>[];
  /** Kinds the child may add. Empty = tune only. */
  palette: K[];
  /** Escalating hints behind the Hint button. */
  hints: string[];
  failHints: Partial<Record<O, string>>;
  /** Static decorations (a keep-above line, a blast point, ...). */
  markers?: OverlayItem[];
  /** A part list that passes the level (tests prove it). */
  solution?: PlacedPart<K>[];
  /** Concept ids this level teaches (by convention the property codes they unlock: 'power',
   * 'angle', ...). A concept is known from the level that introduces it onward, in
   * `CourseSpec.levels` order. The kit HIDES drawer rows / prop chips and in-scene widgets whose
   * `code` is not yet known (their props stay at the default), so the child meets one mechanic
   * per intro level and the challenge levels after them have everything. A course that never
   * sets it shows everything (today's behaviour).
   * An entry of the form `code:value` (e.g. 'fuzz:Donut') gates ONE option: that option is hidden
   * from the drawer / prop chips (and refused by setProp) until the level that introduces it,
   * while a plain `code` entry unlocks the row with every option that is not individually gated
   * somewhere in the course. */
  introduces?: string[];
  /** Coins the child may spend on the parts they add (see `CourseSpec.partCost`). Level-placed
   * (`locked`) parts are free. Absent = no budget (today's `partLimit` rule only). */
  budget?: number;
  /** The width of the world this level actually uses (meters, from x 0). The camera clamp and
   * the edit-mode scrollbar use min(`WorldSpec.worldW`, `extentW`): a short level in a wide
   * course shows no scrollbar and never scrolls into its empty tail. Absent = the whole world. */
  extentW?: number;
}
// `Level.introduces` may also list `part:<kind>` entries: those kinds get the shelf unlock
// callout on that level (`HudState.unlocked`); they must also be in the level's `palette`.

export type Mode = 'edit' | 'play' | 'done';

export interface HudState<K extends string, M, O extends string, L> {
  mode: Mode;
  level: L;
  metrics: M;
  goals: GoalResult<M>[];
  outcome: O | null;
  passed: boolean;
  canPlay: boolean;
  canUndo: boolean;
  /** Selection, the property panel and drags are allowed (edit mode, or done mode when the
   * course tunes between runs). */
  canTune: boolean;
  palette: K[];
  paletteFull: boolean;
  /** `optionCosts[code][value]` = the EXTRA coins that option adds over the cheapest option of
   * its row for this part (from `CourseSpec.partCost`; the drawer badges values > 0, e.g. a
   * spring mount "+1"). Empty when the course has no `partCost`. */
  selected: { part: PlacedPart<K>; descriptors: PropertyDescriptor[]; optionCosts: Record<string, Record<string, number>> } | null;
  hintIndex: number;
  hintCount: number;
  /** The active tool id (from `CourseSpec.tools`), or null when the course has no tools. */
  tool: string | null;
  /** End-of-run card for the dash (done mode, from `CourseSpec.resultCard`), or null. */
  result: ResultCard | null;
  /** Stat bars for the selected part (from `CourseSpec.stats`); empty when none. */
  stats: StatBar[];
  /** Property codes this level introduces (`Level.introduces`): the drawer/prop panel marks those
   * rows NEW; a `code:value` entry marks that one option NEW. Empty on courses without intro
   * levels. */
  introduced: string[];
  /** Coins spent on the child's (non-locked) parts vs the level's `budget`; null when the level
   * has no budget. */
  budget: { used: number; total: number } | null;
  /** Cost of one palette part with its default props, per kind, for the palette chips (from
   * `CourseSpec.partCost`); empty when the course has no `partCost`. */
  paletteCosts: Partial<Record<K, number>>;
  /** Edit-mode horizontal scroll for a world wider than the view (`WorldSpec.worldW`): the
   * camera window's left edge as 0..1 of the scrollable range; null when the world fits the view
   * or in play mode (the follow camera scrolls by itself, the HUD may show the bar read-only). */
  scroll: number | null;
  /** The coach's current step (see `CourseSpec.coach`), or null. */
  coach: CoachStep<K> | null;
  /** Kinds this level unlocks on the shelf (`Level.introduces` entries `part:<kind>`): the HUD
   * plays the unlock callout (the button pops in with NEW and its blurb) once per level load. */
  unlocked: K[];
}

export interface HudCallbacks<K extends string = string> {
  play(): void;
  stop(): void;
  undo(): void;
  clear(): void;
  next(): void;
  selectLevel(id: string): void;
  addPart(kind: K): void;
  setProp(code: string, value: string): void;
  removeSelected(): void;
  hint(): void;
  exit(): void;
  setTool(id: string): void;
  /** Where the part for `code = value` of the selected part sits on screen, in stage px (centre
   * and on-screen size), so the drawer can fly the option's picture there before committing the
   * change. Empty = no flight (the change commits at once). */
  flyTargets(code: string, value: string): { x: number; y: number; size: number }[];
  /** Edit mode, wide worlds: scroll the camera window so its left edge sits at `t` (0..1 of the
   * scrollable range). Ignored when the world fits the view. */
  scrollTo(t: number): void;
  /** Hides the win banner and leaves the done-mode dash (its Next button calls `next`, its
   * Try-again button calls `stop`). */
  dismissWin(): void;
}

// ---- coach (tap tutorials) ---------------------------------------------------------------

/** Where the coach's pointer hand goes. 'widget' = an in-scene widget by id (idle or selected);
 * 'part' = a placed part (the hand hovers over it); 'shelf' = the drawer's shelf button for a
 * kind; 'drawer' = a property row (and one option when `value` is set); 'bar' = a bottom-bar
 * button; 'none' = text only. */
export type CoachTarget<K extends string = string> =
  | { type: 'widget'; id: string }
  | { type: 'part'; partId: number }
  | { type: 'shelf'; kind: K }
  | { type: 'drawer'; code: string; value?: string }
  | { type: 'bar'; button: 'play' | 'next' | 'undo' | 'clear' }
  | { type: 'none' };

export interface CoachStep<K extends string = string> {
  /** Stable id: the HUD animates the hand in again only when it changes. */
  id: string;
  text: string;
  target: CoachTarget<K>;
}

export interface CoachContext<K extends string, L> {
  level: L;
  parts: PlacedPart<K>[];
  selectedId: number | null;
  mode: Mode;
  passed: boolean;
  /** How many runs were started on this level load. */
  runs: number;
}

// ---- course spec -------------------------------------------------------------------------

/** World size in meters. The panel is 960 stage px wide at origin x 32 with its bottom at y 690,
 * so ppm = 960 / worldW (a single-screen world), and `worldH * ppm` px tall: 480 by default
 * (worldH = 480 / ppm, the panel's top at y 210 under the dash). A course without the dash
 * (`HudSpec.goalsOverlay`) may make it taller, so the panel grows upward to just under the top
 * bar (2026-10-06: the rover, 19.125 m at ppm 32 = 612 px, top at y 78; see view.ts
 * `panelTopY`). */
export interface WorldSpec {
  /** World width in meters. The panel always shows a window of 960 / ppm meters (the "view
   * width"); a world WIDER than that scrolls: the camera (follow, focus, the edit-mode scrollbar)
   * clamps to [0, worldW] while the panel stays 960 px wide. Equal to 960 / ppm = today's fixed
   * single-screen world. */
  worldW: number;
  worldH: number;
  ppm: number;
  /** Sky gradient colours (top, bottom) and optional stars; default: the daytime park sky. */
  sky?: { top: number; bottom: number; stars?: boolean };
  /** Colours of the thin ground strip along the bottom edge of the panel (top band and the band
   * under it); default the park's grass green over earth brown. */
  groundStrip?: { top: number; bottom: number };
  /** Meters of ground shown BELOW world y = 0 (the physics ground top). Drawing only: bodies,
   * coordinates and levels do not move. The panel then shows world y from -groundDepth to
   * worldH - groundDepth, the ground strip fills that whole band (a `top` grass band, then
   * `bottom` earth), and camera frames may centre lower, so a focus zoom can put a machine
   * standing on the ground mid-screen instead of on the panel's bottom edge. Default 0. */
  groundDepth?: number;
  /** With `groundDepth` > 0: false = the kit draws NO ground band; the sky runs down to the
   * panel bottom and the course's own items draw the ground (terrain that dips below y = 0, pits,
   * a landing lower than the start). Default true (the flat band under y = 0). */
  groundBand?: boolean;
  /** Picture layers drawn in order over the sky and under everything else (the ground strip,
   * items, grid). Each covers a world-meter rectangle (centre + size, like `Bounds`), so it
   * zooms and pans with the world camera. A scenery backdrop is typically the whole world
   * (x 15, y 7.5, w 30, h 15); a planet hanging in the sky is a small rectangle. */
  backgrounds?: { url: string; x: number; y: number; w: number; h: number; alpha?: number }[];
}

/** How the scene draws one body role. A role with `texture` is drawn as a Phaser Image scaled
 * to the shape (circle diameter x scale), tinted with the item colour when `tint` is true.
 * Otherwise the shape is filled with the item colour (or `fill`'s colour and alpha). `decorate`
 * adds a detail on top. */
export interface RoleRenderer {
  texture?: { key: string; url: string; scale: number };
  tint?: boolean;
  fill?: (item: RenderItem) => { color: number; alpha: number };
  /** 'rings' = three concentric rings on a circle shape (a bullseye). */
  decorate?: 'flag' | 'stripe' | 'brick' | 'plank' | 'rings';
}

export interface MeterSpec<M> {
  id: string;
  label: string;
  metric: keyof M & string;
  /** `live` is true in play mode. */
  format: (value: number, metrics: M, live: boolean) => string;
}

export interface HudSpec<K extends string, M, O extends string> {
  /** `image` (a URL under public/) and `group` (a section title such as 'Wheels') put the kind
   * on the PARTS SHELF: with `drawer` on, kinds that have an image are offered in the drawer as
   * big picture buttons grouped by `group` (in first-seen order), each with its coin cost, in a
   * scrollable list; a tap adds the part. The bottom-bar chip palette then shows only kinds
   * without an image (none for a course that gives every palette kind an image). */
  partInfo: Record<K, { label: string; icon: string; image?: string; group?: string;
    /** One kid-friendly sentence on what the part does ("Pushes the rover. Stick it on the
     * back!"). Shown in the shelf's unlock callout and as the shelf button's title. */
    blurb?: string }>;
  /** Display-only overrides for long option labels (value or label -> shown text). */
  chipLabels?: Record<string, string>;
  meters: MeterSpec<M>[];
  goalValueText: (goal: Goal<M>, current: number) => string;
  /** Metrics whose goals show no progress bar (booleans). */
  barlessMetrics: (keyof M & string)[];
  lines: {
    play: string; pass: string; doneNotPassed: string; freePlay: string;
    /** Play button label in edit mode (default '▶ Play'). */
    launch?: string;
    /** Play button label in done mode when the sim can replay (default: launch). */
    playAgain?: string;
    /** Stop button label (default '■ Stop'). */
    reset?: string;
    /** Bruno's line in done mode when not passed, no fail outcome, and a replay is possible. */
    shotDone?: string;
    /** Bruno's line for 2 s after `canAdd` refused a part (too long, over budget, ...). */
    refused?: string;
    /** Bruno's line for 2 s after the child tapped a locked widget. */
    locked?: string;
  };
  /** Outcomes that read `level.failHints[outcome]` in Bruno's bubble with the fail colour. */
  failOutcomes: O[];
  /** Hide the bottom bar's Play/Start button (the course offers its own start control in the
   * scene, e.g. the big DRIVE button). Stop/Reset, Undo, Clear stay. Default false. */
  playInBar?: false;
  /** A "Level complete!" banner over the world panel on a pass (confetti, the result card's
   * outcome line, a big "Next level ▶" button and "Try again"). Default false: today's behaviour
   * (Bruno waves, the dash shows the result card). */
  winBanner?: boolean;
  /** true: the meters leave the dash and show as a small translucent panel in the top-right
   * corner of the world panel, in play and done mode only (hidden while the child builds). The
   * goals column then fills the dash whenever its right column is empty (the result card and the
   * stat bars still use it). Default false: the meters sit in the dash's right column. */
  metersOverlay?: boolean;
  /** true: no dash at all. The goals show as a small translucent panel in the top-left corner of
   * the world panel, in every mode, with the result card under them in done mode; the meters go
   * to their own overlay (implies `metersOverlay`). Meant for a `drawer` course whose parts have
   * no `stats`: the dash's chip panel and stat bars have nowhere to show without it. Pair it with
   * a taller world (`WorldSpec`: worldH * ppm > 480) so the panel takes the dash's room. Default
   * false: the dash under the top bar (2026-10-06: the rover uses it). */
  goalsOverlay?: boolean;
}

/** One end of a link drag: an existing part, or a point in empty space. */
export interface LinkEnd { partId: number | null; at: Vec2 }

/** An editor tool shown in the bottom bar. 'move' = the default gestures (tap to select, drag to
 * move); 'place' = a tap on empty space calls `placeWithTool`; 'link' = a drag from one part to
 * another calls `linkWithTool` (a rubber band shows while dragging). */
export interface ToolSpec { id: string; label: string; icon: string; kind: 'move' | 'place' | 'link' }

export interface CourseSpec<
  K extends string,
  M extends Record<string, number>,
  O extends string,
  L extends Level<K, M, O>,
> {
  id: string;
  levels: L[];
  catalog: Record<K, { label: string; icon: string; descriptors: PropertyDescriptor[] }>;
  defaultProps: (kind: K) => Record<string, string>;
  partLimit: number;
  createSim: (parts: PlacedPart<K>[], level: L) => Promise<CourseSim<M, O>>;
  /** Metrics shown in edit mode (part count and the like). */
  editMetrics: (parts: PlacedPart<K>[], level: L, sim: CourseSim<M, O> | null) => M;
  canPlay: (parts: PlacedPart<K>[], level: L, sim: CourseSim<M, O> | null) => boolean;
  passed: (outcome: O, goalsPass: boolean, level: L) => boolean;
  /** Where a palette part appears (world meters); nudged up by 1 m while it overlaps a part. */
  spawn: Vec2;
  /** Before a rebuild, push the moved or added part out of other parts' bounds along the
   * least-penetration axis (prefer +y, up to 8 iterations). Default false. */
  resolveOverlaps?: boolean;
  /** After a rebuild, copy `settledPositions()` into part x/y when the delta exceeds 2 cm.
   * Never triggers another rebuild. Default false. */
  writeBackSettled?: boolean;
  /** Selection, the property panel and moves stay allowed in done mode (between shots);
   * Undo and Clear stay edit-only. Default false. */
  tuneBetweenRuns?: boolean;
  /** Editor tools; the first is the default. Without tools the editor behaves as 'move'. */
  tools?: ToolSpec[];
  /** A 'place' tool tapped empty space: return the part to add, or null. */
  placeWithTool?: (tool: string, at: Vec2, parts: PlacedPart<K>[], level: L) => PlacedPart<K> | null;
  /** A 'link' tool was dragged from one place to another. Either end may be an existing part
   * (`partId`) or empty space (`partId` null); `at` is the world point, snapped to `grid` when set.
   * Return every part to add (for example two new joints and the rod between them) or null.
   * Use `allocId()` for ids the new parts must reference (a rod naming a joint created in the
   * same batch); the controller keeps those ids. */
  linkWithTool?: (tool: string, from: LinkEnd, to: LinkEnd, parts: PlacedPart<K>[], level: L, allocId: () => number) => PlacedPart<K>[] | null;
  /** Snap size in meters for placed and dragged parts and link ends; the scene draws the grid. */
  grid?: number;
  /** Runs before every rebuild and its result replaces the part list: derive fields (a rod's
   * midpoint), drop parts that lost a dependency (a rod whose point is gone). */
  normalizeParts?: (parts: PlacedPart<K>[], level: L) => PlacedPart<K>[];
  /** Rules for adding a part (length caps, budgets). false = refuse; the HUD shows `lines.refused`.
   * Applies to palette parts, placed parts and links. */
  canAdd?: (part: PlacedPart<K>, parts: PlacedPart<K>[], level: L) => boolean;
  /** Edit/done mode: the camera frame to tween to while this part is selected; null = the full
   * field. Without it the camera never moves in edit mode. */
  focusFrame?: (part: PlacedPart<K>, level: L) => CameraFrame | null;
  /** Play mode, asked every frame: the body to follow, or null to return to the full field. */
  follow?: (level: L, outcome: O, elapsed: number) => FollowSpec | null;
  /** In-scene controls for the selected part; re-asked whenever the part or its props change.
   * Shown only while `canTune` and the part is selected. */
  widgets?: (part: PlacedPart<K>, parts: PlacedPart<K>[], level: L) => Widget[];
  /** In-scene controls shown in edit/tune mode while NOTHING is selected (a BUILD button floating
   * over the machine with `action: 'select'` + `partId`, a big DRIVE button). Hidden in play mode
   * and while a part is selected (then `widgets` of that part show). */
  idleWidgets?: (parts: PlacedPart<K>[], level: L) => Widget[];
  /** While a part is DRAGGED, where its ghost should sit for the pointer position `at` (world m):
   * a rim-snapping course returns the snapped point so the child sees where the part will land
   * before releasing. Default: the pointer position. */
  dragSnap?: (part: PlacedPart<K>, at: Vec2, parts: PlacedPart<K>[], level: L) => Vec2;
  /** The "coach": the one tap the child should do next, re-asked every frame in edit/tune mode
   * (and in done mode for the win step). The HUD/scene draw a bouncing pointer hand at the
   * target and put `text` in Bruno's bubble (it wins over the level's `bruno` line while set).
   * Return null when the child is on their own. Keep steps to the first levels. */
  coach?: (ctx: CoachContext<K, L>) => CoachStep<K> | null;
  /** A widget the controller could not resolve itself (`action: 'none'`, or a tap with no
   * `code`). Return a replacement part list (undo + rebuild follow) or nothing. */
  onWidget?: (id: string, part: PlacedPart<K>, parts: PlacedPart<K>[], level: L) => PlacedPart<K>[] | void;
  /** The end-of-run card shown in the dash in done mode. */
  resultCard?: (parts: PlacedPart<K>[], level: L, metrics: M, outcome: O, passed: boolean) => ResultCard | null;
  /** Stat bars shown in the prop panel for the selected part (Speed, Grip, ...). */
  stats?: (part: PlacedPart<K>, level: L) => StatBar[];
  /** Where the part that a property value swaps in lives on the machine, in world meters (centre
   * and width), for the drawer's "part flies to the machine" animation. Several targets = several
   * copies fly (two wheels). Omit or return [] for no flight. */
  partTargets?: (part: PlacedPart<K>, code: string, value: string, level: L) => { at: Vec2; size: number }[];
  /** Pictures preloaded by key (SVG or PNG URLs under public/). Used by `RenderItem.textureKey`.
   * `scale` multiplies the shape-derived draw size (default 1). */
  textures?: Record<string, { url: string; scale?: number }>;
  /** Show the selected part's properties in a drawer that slides in from the right edge of the
   * world panel (big picture buttons from `PropertyOption.image`, one row per descriptor) instead
   * of the chip panel in the dash. Default false. */
  drawer?: boolean;
  /** Coins one part costs, by kind and props (a spring mount costs more than a suction cup).
   * With `Level.budget` set, the controller refuses an add or a prop change that would push the
   * sum over the child's non-locked parts past the budget (the HUD shows `lines.refused`), and
   * reports `HudState.budget`. Locked parts never count. */
  partCost?: (part: PlacedPart<K>) => number;
  /** A camera pan to show a level when it loads (edit mode): the controller tweens the camera
   * from `from` to `to` over `ms` (frames in world meters, clamped to the world), then leaves it
   * at `to` as the edit-mode rest frame. A wide level pans from the finish back to the start so
   * the child sees the whole course once. null/absent = no pan (today). */
  intro?: (level: L) => { from: CameraFrame; to: CameraFrame; ms: number } | null;
  world: WorldSpec;
  roles: Record<string, RoleRenderer>;
  hud: HudSpec<K, M, O>;
}

export interface BootOptions { sceneKey: string; devGlobal: string }
