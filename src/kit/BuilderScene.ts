// Generic builder-kit scene: the world panel, Bruno, drag/tap gestures and rendering, driven by
// a WorldSpec (world size, meters-per-pixel) and a per-role RoleRenderer table instead of
// Goldberg's hardcoded 'fuzz' / 'sensor' / 'door' checks. Moved from
// activities/goldberg/game/GoldbergScene.ts.
import Phaser from 'phaser';
import { COLORS, STAGE_W, STAGE_H, RENDER_SCALE, makeView, PANEL_BOTTOM_Y } from './view';
import {
  FOCUS_MS,
  approachFrame,
  clampFrame,
  easeInOutCubic,
  fullFrame,
  lerpFrame,
  panelPxToStagePx,
  type FrameState,
  type WorldDims,
} from './camera';
import {
  dialAngleToValue,
  dialPoint,
  hitWidget,
  layoutWidgets,
  leverPointToValue,
  type CycleGeom,
  type DialGeom,
  type LeverGeom,
  type PullGeom,
  type RackGeom,
  type TapGeom,
  type WidgetGeom,
} from './widgetLayout';
import type {
  Bounds,
  BodyId,
  CameraFrame,
  LinkEnd,
  OverlayItem,
  RenderItem,
  RoleRenderer,
  Shape,
  SimSnapshot,
  Transform,
  Vec2,
  Widget,
  WorldSpec,
} from './types';
import type { SpineGameObject } from '@esotericsoftware/spine-phaser-v4';

interface Gesture {
  /** null when the pointer went down on empty space (still tracked, so pointerup can tell a tap
   * on nothing apart from a pan/drag over nothing). */
  partId: number | null;
  startWorld: Vec2;
  moved: boolean;
  /** true when the hit part may not be dragged (tap-to-select only). */
  lockedHit: boolean;
}

/** A tap-to-cycle or -fire widget hit, remembered from pointerdown to fire on pointerup (dial and
 * pull fire from `widgetDrag`/`widgetDragT` instead, since they're drag gestures). */
interface WidgetTap {
  id: string;
  value?: string;
}

/** A dial, pull or lever widget grabbed on pointerdown; released on pointerup. */
interface WidgetDrag {
  id: string;
  kind: 'dial' | 'pull' | 'lever';
}

/** A tap widget's icon/texture flying from `from` to `to` after a live tap with `hopTo` set. */
interface WidgetHop {
  id: string;
  icon?: string;
  textureKey?: string;
  tint?: number;
  from: Vec2;
  to: Vec2;
  start: number;
}

const HIT_MARGIN = 0.3; // meters, expands bounds so thin parts are easy to grab
const MOVE_THRESHOLD = 6; // px

const PANEL_RADIUS = 12;
const SKY_TOP = 0x2a4aa6;
const SKY_BOTTOM = 0x4f7bd6;
const STAR_COUNT = 60;
/** The panel's bottom edge sits this many px below `PANEL_BOTTOM_Y` (an earth strip beneath the
 * depth-0 ground line), independent of world scale — copied from CoasterScene/GoldbergScene. */
const PANEL_Y_MARGIN = 10;
const GRASS_INSET = 14; // px above the panel's bottom edge where grass begins (groundDepth 0)
const EARTH_INSET = 6; // px above the panel's bottom edge where dark earth begins (groundDepth 0)
const EARTH_COLOR = 0x3f6b2a;
const GROUND_GRASS_M = 0.3; // meters of grass right under world y = 0 when groundDepth > 0

/** Bruno's slot: the HTML top bar leaves a transparent 76x72 px hole (stage x 32..108, y 0..72). */
const BRUNO_SLOT = { x: 70, y: 66 };

// depth layering, back to front
const DEPTH_SKY = 0;
const DEPTH_GROUND = 1;
const DEPTH_GRID = 1.5; // above the panel backdrop (ground), below items
const DEPTH_ITEMS = 2;
const DEPTH_TEXTURE = 3; // role items rendered as a Phaser Image (e.g. the fuzz)
const DEPTH_MARKS = 3.5; // padlocks, selection ring, markers/overlay
const DEPTH_MARKS_TEXT = 3.6; // hline labels, icons
const DEPTH_BRUNO_SHADOW = 3.4;
const DEPTH_BRUNO = 3.6;
/** `OverlayItem` kind 'sprite': a picture-backed effect drawn above the items/marks layers but
 * strictly below the widget graphics (DEPTH_WIDGETS = 3.7) and its own text/image cache
 * (DEPTH_WIDGETS + 0.05); DEPTH_MARKS_TEXT + 0.05 sits just under that without tying depths. */
const DEPTH_OVERLAY_SPRITE = 3.65;
/** Text canvases render at this many texels per stage px. Overlay/widget text is counter-scaled
 * by 1/zoom and then zoomed by the camera, so its device size is always fontSize x RENDER_SCALE;
 * rendering at that same density keeps it crisp instead of upsampling a 1x canvas. */
const TEXT_RESOLUTION = RENDER_SCALE;
const DEPTH_WIDGETS = 3.7; // in-world widget controls, above everything else in the panel

/** Per-60 Hz-frame approach factor of a `glideTo` (the edit-mode scrollbar): ~90% of the way in
 * ~110 ms, smooth both for a jump (a tap on the track) and for a stream of retargets (a drag). */
const GLIDE_LERP = 0.3;
/** An intro pan's clock never advances more than this per frame, so the hitch of the level's
 * first build does not swallow the start of the pan. */
const INTRO_MAX_DT_MS = 50;

const WIDGET_HOP_MS = 350; // tap/cycle/rack hopTo icon/texture flight
const WIDGET_SPRING_MS = 150; // pull handle spring-back when released short of threshold
const WIDGET_POP_MS = 120; // tap-feedback pop animation

// ---- style tokens (children's builder kit) ----
const INK = 0x171e3a;
const CARD = 0x2c3560;
const EDGE = 0x3d4a80;
const MUTED = 0x9aa1c0;
const ACTIVE = 0x05aeed;
const GO = 0x61bb46;
const KNOB_COLOR = 0xf2f4f8;
const SHADOW_COLOR = 0x0b1030;
const SHADOW_ALPHA = 0.35;
const SHADOW_OFFSET = 4; // stage px, +y, before pxScale

/** Overshoot-then-settle ease for the tap-feedback "pop": `t` in [0, 1]. */
function easeOutBack(t: number): number {
  return 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
}

/** A control's scale during its 120 ms tap-feedback pop: squashes to 0.88x then springs past 1x
 * and settles. `p` is elapsed/WIDGET_POP_MS, in [0, 1]. */
function popScale(p: number): number {
  return p < 0.35 ? 1 - 0.12 * (p / 0.35) : 0.88 + 0.12 * easeOutBack((p - 0.35) / 0.65);
}

/** Linear blend of two 0xRRGGBB colors, t in [0, 1]. */
function lerpColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k) & 0xff;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Darkens a 0xRRGGBB color by `amt` (0..1), for a shape's outline. */
function darken(color: number, amt = 0.25): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (c: number): number => Math.max(0, Math.round(c * (1 - amt)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** A 0xRRGGBB color as a CSS hex string, for Phaser Text style. */
function colorHex(c: number): string {
  return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Shortest distance from point `p` to the segment a-b (world meters). */
function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq > 0 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1) : 0;
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Rotates a body-local point (meters, y-up) by the body's angle and adds its world position
 * (plus an optional visual drag offset, world meters). */
function localToWorld(local: Vec2, t: Transform, extra: Vec2): Vec2 {
  const cos = Math.cos(t.angle);
  const sin = Math.sin(t.angle);
  return {
    x: t.position.x + extra.x + local.x * cos - local.y * sin,
    y: t.position.y + extra.y + local.x * sin + local.y * cos,
  };
}

/** A shape's local offset (meters): circle/box `cx`/`cy`, or the origin for a polygon (whose
 * vertices already carry any offset). */
function shapeOffset(shape: Shape): Vec2 {
  if (shape.kind === 'polygon') return { x: 0, y: 0 };
  return { x: shape.cx ?? 0, y: shape.cy ?? 0 };
}

function boxCorners(shape: Extract<Shape, { kind: 'box' }>): Vec2[] {
  const cx = shape.cx ?? 0;
  const cy = shape.cy ?? 0;
  const hw = shape.w / 2;
  const hh = shape.h / 2;
  return [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ];
}

function shapeCorners(shape: Shape): Vec2[] {
  if (shape.kind === 'box') return boxCorners(shape);
  if (shape.kind === 'polygon') return shape.vertices;
  // circle: approximate as a small square so callers that expect a quad still work
  return boxCorners({ kind: 'box', w: shape.r * 2, h: shape.r * 2, cx: shape.cx, cy: shape.cy });
}

function pathFrom(g: Phaser.GameObjects.Graphics, pts: Vec2[]): void {
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
}

/** Half-extent (local meters, along local x) of a shape's mid-line stripe/grain decoration. */
function stripeHalf(shape: Shape): number {
  if (shape.kind === 'box') return shape.w / 2;
  if (shape.kind === 'polygon') {
    let max = 0;
    for (const v of shape.vertices) max = Math.max(max, Math.abs(v.x));
    return max;
  }
  return shape.r;
}

/** The stage-pixel size of a texture-backed item, from its shape. Circles use the diameter;
 * boxes use w x h; polygons use their bounding box. All scaled by `scale`. */
function textureSize(shape: Shape, ppm: number, scale: number): { w: number; h: number } {
  if (shape.kind === 'circle') {
    const d = 2 * shape.r * ppm * scale;
    return { w: d, h: d };
  }
  if (shape.kind === 'box') {
    return { w: shape.w * ppm * scale, h: shape.h * ppm * scale };
  }
  let maxX = 0;
  let maxY = 0;
  for (const v of shape.vertices) {
    maxX = Math.max(maxX, Math.abs(v.x));
    maxY = Math.max(maxY, Math.abs(v.y));
  }
  return { w: 2 * maxX * ppm * scale, h: 2 * maxY * ppm * scale };
}

export class BuilderScene extends Phaser.Scene {
  onUpdate?: (deltaMs: number) => void;
  onPartTapped?: (partId: number) => void;
  /** dx, dy: world-meter delta to add to the part's stored anchor. */
  onPartMoved?: (partId: number, dx: number, dy: number) => void;
  /** at: the tap's world point. Fired on empty space in 'move' and 'place' tool kinds. */
  onEmptyTapped?: (at: Vec2) => void;
  /** A 'link' tool gesture ended (pointer moved past the threshold). */
  onLinkDrawn?: (from: LinkEnd, to: LinkEnd) => void;
  /** A widget fired: a tap/rack cell, a released pull, or a dial/lever snapping to a new value.
   * `value` is the resolved value for rack/dial/lever; undefined for a plain tap (the controller
   * resolves the next value itself, e.g. via `nextValue` in widgetLayout.ts). `live` is true for a
   * `DialWidget.live` mid-drag commit (one call per new notch); undefined/false for the final
   * commit sent on release. */
  onWidgetAction?: (id: string, value?: string, live?: boolean) => void;
  /** A locked widget was tapped. */
  onWidgetBlocked?: (id: string) => void;
  /** A pull widget is being dragged; `t` is live 0..1. */
  onWidgetDrag?: (id: string, t: number) => void;

  private readonly view: ReturnType<typeof makeView>;

  private items: RenderItem[] = [];
  private boundsList: { partId: number; bounds: Bounds }[] = [];
  private boundsByPart = new Map<number, Bounds>();
  private regionByPart = new Map<number, Bounds>();
  private itemsByPart = new Map<number, RenderItem[]>();
  private lockedParts = new Set<number>();
  private lockPositionParts = new Set<number>();
  private markers: OverlayItem[] = [];

  private segments: { partId: number; segment: { a: Vec2; b: Vec2; r: number } }[] = [];
  private segmentByPart = new Map<number, { a: Vec2; b: Vec2; r: number }>();

  private editable = true;
  private selectedPartId: number | null = null;

  private toolKind: 'move' | 'place' | 'link' = 'move';

  private gesture: Gesture | null = null;
  private activePointerId: number | null = null;
  private dragPartId: number | null = null;
  private dragOffset: Vec2 = { x: 0, y: 0 };

  /** 'link' tool gesture state: dragging a rubber band from `linkFrom.at` to the snapped
   * current pointer position. */
  private linking = false;
  private linkFrom: LinkEnd | null = null;
  /** Raw (unsnapped) pointer-down and current world points, for the MOVE_THRESHOLD check. */
  private linkStartWorld: Vec2 | null = null;
  private linkCurrentWorld: Vec2 | null = null;
  private linkMoved = false;

  /** Grid snap size in world meters, or null when the course has no grid. */
  private grid: number | null = null;
  private gridGfx?: Phaser.GameObjects.Graphics;
  /** Camera zoom the grid was last drawn at; dot radius is screen-constant so the grid must be
   * rebuilt whenever the zoom changes. */
  private lastGridZoom = 1;

  private itemsGfx!: Phaser.GameObjects.Graphics;
  private marksGfx!: Phaser.GameObjects.Graphics;
  /** Texture-backed items, keyed by the item's index in `items` (NOT by body: one body can carry
   * several items, e.g. a frame polygon plus a textured power pack riding the same body). */
  private roleImages = new Map<number, Phaser.GameObjects.Image>();
  /** The transforms drawn this frame (possibly interpolated), for overlay labels that ride a body. */
  private drawnTransforms: SimSnapshot['transforms'] | null = null;
  private readonly overlayTextCache = new Map<string, Phaser.GameObjects.Text>();
  /** `OverlayItem` kind 'sprite', one Image per `id`, same cache/hide-when-unseen pattern as
   * `overlayTextCache` (see `drawOverlay` and its caller in `syncTransforms`). */
  private readonly overlaySpriteCache = new Map<string, Phaser.GameObjects.Image>();

  private bruno: SpineGameObject | null = null;

  // panel geometry: the fixed 960 x 480 (+ earth margin) stage-px window the world camera draws
  // into. `panelX1` is the VIEW's right edge (originX + viewW * ppm); `worldX1` is the stage x of
  // world x = worldW, the right end of the world's own extent (the same as panelX1 unless the
  // world is wider than the view and scrolls).
  private readonly panelX0: number;
  private readonly panelY0: number;
  private readonly panelX1: number;
  private readonly panelY1: number;
  private readonly worldX1: number;
  /** The world is wider than the view (`WorldSpec.worldW` > 960 / ppm): the camera scrolls. */
  private readonly wide: boolean;

  // ---- camera: worldCam shows the panel (clipped to its viewport, bounded to its rect) and
  // pans/zooms per the CameraFrame state machine below; uiCam always shows the whole stage
  // (Bruno, and anything else that must ignore the camera's zoom/pan) at RENDER_SCALE only.
  private worldCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  /** 'glide' = an exponential approach to `camTo` (the edit-mode scrollbar, see `glideTo`). */
  private camMode: 'idle' | 'tween' | 'track' | 'glide' = 'idle';
  private camFrom: FrameState;
  private camTo: FrameState;
  private camT = 0;
  private camDurMs = FOCUS_MS;
  private camCur: FrameState;
  private camRest: FrameState;
  /** What `focusFrame(null)` means: the edit-mode rest frame (the scrolled view window of a wide
   * world; the full field otherwise). Set by the controller via `setBaseFrame`. */
  private baseFrame: FrameState;
  /** The EFFECTIVE world every camera clamp (focus, follow/track, the edit-mode rest frame and
   * the intro pan) is bounded to: `min(WorldSpec.worldW, Level.extentW ?? Infinity)` for the
   * level now loaded, set by the controller via `setWorldExtent` on every `loadLevel`. Drawing
   * (sky, ground, terrain) and gesture hit-testing keep using the full `world` passed to the
   * constructor regardless — only where the camera is ALLOWED TO SIT shrinks for a short level in
   * a wide course, so no scrollbar shows and the camera never pans into the level's empty tail.
   * Defaults to the full world until the first `setWorldExtent` call. */
  private camWorld: WorldDims;
  /** A level-load intro pan (`playIntro`) is running: focus requests wait for it (the last one
   * is kept in `introDeferred` and applied when the pan ends), and a tap skips it. */
  private introActive = false;
  private introDeferred: FrameState | null = null;
  private trackTarget: { p: Vec2; zoom: number; lerp: number } | null = null;
  /** 1 / camera zoom: counter-scales screen-sized chrome (selection rings, marks, overlay and
   * widget text/graphics) so it stays a constant on-screen size while item fills/strokes (which
   * are world-sized) scale with the zoom like everything else in the panel. */
  private pxScale = 1;
  /** Set at the top of every `update(time, delta)` from Phaser's own clock; used to time widget
   * animations (slam / hop / spring) drawn later in the same frame by `syncTransforms`. */
  private nowMs = 0;

  // ---- widgets ----
  private widgetSpecs: Widget[] = [];
  private widgetsById = new Map<string, Widget>();
  private widgetGeoms: WidgetGeom[] = [];
  private widgetGfx!: Phaser.GameObjects.Graphics;
  private readonly widgetTextCache = new Map<string, Phaser.GameObjects.Text>();
  private readonly widgetImageCache = new Map<string, Phaser.GameObjects.Image>();
  private widgetTap: WidgetTap | null = null;
  private widgetDrag: WidgetDrag | null = null;
  private widgetDragAngle = 0;
  private widgetDragValue: string | undefined;
  private widgetDragT = 0;
  /** id -> {from, start}: a released pull under threshold springs its handle back to 0. */
  private readonly widgetSpring = new Map<string, { from: number; start: number }>();
  private widgetHops: WidgetHop[] = [];
  /** Tap-feedback "pop": key -> scene-clock ms the pop started. Key is the widget id for
   * tap/cycle/lever/dial, or `id:value` for an individual rack cell. */
  private readonly widgetPop = new Map<string, number>();

  /** Keys already warned about (missing/failed texture); each is logged once, not once per
   * frame/setItems call. */
  private readonly warnedTextureKeys = new Set<string>();

  constructor(
    key: string,
    private readonly world: WorldSpec,
    private readonly roles: Record<string, RoleRenderer>,
    /** `spec.textures`: pictures preloaded by key, for `RenderItem.textureKey`. Named
     * `textureDefs` (not `textures`) to avoid shadowing Phaser's own `Scene.textures` (the
     * texture manager). */
    private readonly textureDefs: Record<string, { url: string; scale?: number }> = {},
  ) {
    super(key);
    this.view = makeView(world);
    // Fixed panel geometry (never shifts with `groundDepth` — only the world<->stage mapping
    // inside `view` does that): worldH * ppm is always 480 and viewW * ppm 960 (see WorldSpec),
    // so this is the same 960x480 (plus the earth-bleed margin) rect for every course, wide
    // (scrolling) worlds included.
    this.panelX0 = this.view.originX;
    this.panelY0 = PANEL_BOTTOM_Y - world.worldH * world.ppm;
    this.panelX1 = this.view.originX + this.view.viewW * world.ppm;
    this.panelY1 = PANEL_BOTTOM_Y + PANEL_Y_MARGIN;
    this.worldX1 = this.view.originX + world.worldW * world.ppm;
    this.wide = this.view.viewW < world.worldW;
    this.camWorld = world;

    const initial = fullFrame(world);
    this.camCur = initial;
    this.camRest = initial;
    this.camFrom = initial;
    this.camTo = initial;
    this.baseFrame = initial;
  }

  preload(): void {
    // Loader failures (missing/renamed files) surface as a synchronous throw from
    // `this.add.spine(...)` in create(), which we catch there so the rest of the scene keeps
    // working without Bruno.
    this.load.spineAtlas('floofs', 'spine/FloofFamily01.atlas', true);
    this.load.spineJson('engineer', 'spine/Engineer_skeleton.json');
    for (const role of Object.values(this.roles)) {
      if (role.texture) this.load.image(role.texture.key, role.texture.url);
    }
    // `spec.textures`: pictures a swapped part's RenderItem.textureKey draws instead of the
    // role's texture or a fill. Phaser 4 has a dedicated `load.svg` (rasterizes via an XML parse
    // + resize step), but the plain `load.image` loader already rasterizes an SVG URL correctly
    // through the browser's native <img> decoding as long as the SVG carries width/height (or a
    // viewBox) attributes — true of every part SVG here — so `load.image` is used uniformly for
    // both role and per-item textures instead of mixing loader types.
    for (const [key, tex] of Object.entries(this.textureDefs)) {
      this.load.image(key, tex.url);
    }
    // `world.backgrounds`: picture layers behind the panel content (a scenery backdrop, a
    // planet). Keyed by index since a course may reuse the same URL twice at different sizes.
    (this.world.backgrounds ?? []).forEach((bg, i) => this.load.image(`bg-${i}`, bg.url));
  }

  create(): void {
    // High-DPI + camera zoom/pan: the world camera's viewport is clipped to the panel (in canvas
    // px) and its bounds are the panel's stage-px rect, so a camera zoom > 1 pans within the
    // panel instead of spilling into the HUD. The HTML chrome and Bruno live on a second,
    // unclipped camera that always shows the whole 1024x768 stage at RENDER_SCALE only.
    const RS = RENDER_SCALE;
    this.worldCam = this.cameras.main;
    this.worldCam.setViewport(
      this.panelX0 * RS,
      this.panelY0 * RS,
      (this.panelX1 - this.panelX0) * RS,
      (this.panelY1 - this.panelY0) * RS,
    );
    // Bounds = the whole world's extent (the panel itself for a single-screen world), so a wide
    // world's camera may scroll across it while the viewport stays the 960 px panel.
    this.worldCam.setBounds(this.panelX0, this.panelY0, this.worldX1 - this.panelX0, this.panelY1 - this.panelY0);
    this.worldCam.setZoom(RS);
    this.worldCam.centerOn((this.panelX0 + this.panelX1) / 2, (this.panelY0 + this.panelY1) / 2);

    this.uiCam = this.cameras.add(0, 0, STAGE_W * RS, STAGE_H * RS, false, 'ui');
    this.uiCam.setZoom(RS);
    this.uiCam.centerOn(STAGE_W / 2, STAGE_H / 2);
    this.uiCam.inputEnabled = false;

    this.createPanel();
    this.createBackgrounds();
    if (this.wide) this.createCornerCaps();

    this.itemsGfx = this.onWorld(this.add.graphics());
    this.itemsGfx.setDepth(DEPTH_ITEMS);

    this.marksGfx = this.onWorld(this.add.graphics());
    this.marksGfx.setDepth(DEPTH_MARKS);

    this.widgetGfx = this.onWorld(this.add.graphics());
    this.widgetGfx.setDepth(DEPTH_WIDGETS);

    this.createBruno();

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
  }

  override update(time: number, delta: number): void {
    this.nowMs = time;
    // The app steps the sim, calls trackPoint with the followed body's NEW position and draws
    // (syncTransforms) inside onUpdate; the camera is applied after that so it frames this
    // frame's positions, not last frame's. Applying it first made the camera lag the body by one
    // frame, which showed as a jitter on everything it followed. Phaser renders after update(),
    // so the scroll/zoom set here is what this frame shows; pxScale (counter-scaling of chrome)
    // lags by one frame only while a zoom tween runs, which is invisible.
    this.onUpdate?.(delta);
    this.updateCamera(delta);
  }

  // ---------------- camera assignment ----------------

  /** Assigns a game object to the world camera only (the UI camera ignores it). Call once at
   * creation time — `Camera.ignore` on a Group/Layer snapshots `getChildren()` immediately, so
   * this is always called per-object, never on a container. */
  private onWorld<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiCam.ignore(o);
    return o;
  }

  /** Assigns a game object to the UI camera only (the world camera ignores it). Spine's
   * SpineGameObject honours the same `cameraFilter` bitmask `ignore` sets on ordinary objects. */
  private onUi<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.worldCam.ignore(o);
    return o;
  }

  // ---------------- setup helpers ----------------

  /**
   * The world panel: a rounded sky/ground shape. Copied verbatim from CoasterScene/
   * GoldbergScene — Phaser 4 has no WebGL geometry mask and `fillGradientStyle` only maps
   * correctly onto `fillRect`, so the panel is built from plain rectangles. With `groundDepth` >
   * 0 the grass/earth boundary moves up to world y = 0 (`view.originY`) and earth fills the rest
   * of the band down to the panel's (fixed) bottom edge; at depth 0 this is today's fixed-pixel
   * strip, kept byte for byte.
   */
  private createPanel(): void {
    // World objects under the scrolling camera: the sky and ground band span the whole world
    // (world x 0..worldW), not just the first view window.
    const x0 = this.panelX0;
    const w = this.worldX1 - this.panelX0;
    const h = this.panelY1 - this.panelY0;
    const r = PANEL_RADIUS;
    const depth = this.world.groundDepth ?? 0;
    // `groundBand: false`: the course draws its own ground below y = 0 (terrain that dips, pits),
    // so the sky runs down to the panel's rounded bottom edge and the kit draws no band.
    const band = !(depth > 0 && this.world.groundBand === false);
    const grassTopY = !band ? this.panelY1 - r : depth > 0 ? this.view.originY : this.panelY1 - GRASS_INSET;
    const earthTopY =
      depth > 0
        ? Math.min(this.view.originY + GROUND_GRASS_M * this.world.ppm, this.panelY1)
        : this.panelY1 - EARTH_INSET;
    const skyTop = this.world.sky?.top ?? SKY_TOP;
    const skyBottom = this.world.sky?.bottom ?? SKY_BOTTOM;
    const skyAt = (y: number): number => lerpColor(skyTop, skyBottom, (y - this.panelY0) / h);
    const insetAt = (d: number): number => r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));

    const sky = this.onWorld(this.add.graphics());
    sky.setDepth(DEPTH_SKY);
    for (let y = this.panelY0; y < this.panelY0 + r; y++) {
      const inset = insetAt(y - this.panelY0 + 0.5);
      sky.fillStyle(skyAt(y), 1);
      sky.fillRect(x0 + inset, y, w - 2 * inset, 1);
    }
    sky.fillGradientStyle(skyAt(this.panelY0 + r), skyAt(this.panelY0 + r), skyAt(grassTopY), skyAt(grassTopY), 1);
    sky.fillRect(x0, this.panelY0 + r, w, Math.max(0, grassTopY - (this.panelY0 + r)));

    // A picture backdrop carries its own sky detail; the procedural stars would show through/over it.
    if (this.world.sky?.stars && !this.world.backgrounds?.length) this.drawStars(sky, x0, w, grassTopY);

    if (!band) {
      for (let y = this.panelY1 - r; y < this.panelY1; y++) {
        const inset = insetAt(this.panelY1 - y - 0.5);
        sky.fillStyle(skyAt(y), 1);
        sky.fillRect(x0 + inset, y, w - 2 * inset, 1);
      }
      return;
    }

    const ground = this.onWorld(this.add.graphics());
    ground.setDepth(DEPTH_GROUND);
    const stripTop = this.world.groundStrip?.top ?? COLORS.green;
    const stripBottom = this.world.groundStrip?.bottom ?? EARTH_COLOR;

    // Flat grass above the rounded corner zone, stopping where earth begins (at depth 0 this is
    // always the same 2 px sliver as before — earthTopY there sits inside the corner zone).
    const flatGrassBottom = Math.min(earthTopY, this.panelY1 - r);
    ground.fillStyle(stripTop, 1);
    ground.fillRect(x0, grassTopY, w, Math.max(0, flatGrassBottom - grassTopY));

    // Flat earth reached before the rounded corner zone — only happens with real ground depth.
    if (earthTopY < this.panelY1 - r) {
      ground.fillStyle(stripBottom, 1);
      ground.fillRect(x0, earthTopY, w, this.panelY1 - r - earthTopY);
    }

    for (let y = this.panelY1 - r; y < this.panelY1; y++) {
      const inset = insetAt(this.panelY1 - y - 0.5);
      ground.fillStyle(y >= earthTopY ? stripBottom : stripTop, 1);
      ground.fillRect(x0 + inset, y, w - 2 * inset, 1);
    }

    // A subtle darker seam at the grass/earth boundary, only where there's a real band to show.
    if (depth > 0) {
      ground.fillStyle(darken(stripBottom, 0.3), 0.35);
      ground.fillRect(x0, Math.round(Math.min(earthTopY, this.panelY1 - 1)), w, 1);
    }
  }

  /** `world.backgrounds`: static picture layers over the sky and under the ground strip/items
   * (depth 0.2 + i*0.01, between DEPTH_SKY and DEPTH_GROUND). World objects (drawn via
   * `onWorld`), positioned/sized in world meters, so they pan and zoom with the world camera —
   * never counter-scaled. A texture that failed to load is skipped with one warning. */
  private createBackgrounds(): void {
    const bgs = this.world.backgrounds ?? [];
    for (let i = 0; i < bgs.length; i++) {
      const bg = bgs[i]!;
      const key = `bg-${i}`;
      if (!this.textures.exists(key)) {
        console.warn(`BuilderScene: background "${bg.url}" failed to load; skipping.`);
        continue;
      }
      const img = this.onWorld(this.add.image(0, 0, key));
      const p = this.view.toPx({ x: bg.x, y: bg.y });
      img.setPosition(p.x, p.y);
      img.setDisplaySize(bg.w * this.world.ppm, bg.h * this.world.ppm);
      img.setAlpha(bg.alpha ?? 1);
      img.setDepth(0.2 + i * 0.01);
    }
  }

  /** Wide worlds only: the world camera scrolls, so the panel's rounded corners (drawn into the
   * sky/ground graphics at world x 0 and worldW) would scroll away. Four navy caps on the UI
   * camera (the canvas background colour) round the 960 px viewport itself instead, with the same
   * per-row insets the sky uses, so at either end of the world they coincide with the drawn
   * corners. Never created for a single-screen world (its picture stays exactly as before). */
  private createCornerCaps(): void {
    const caps = this.onUi(this.add.graphics());
    caps.setDepth(DEPTH_SKY);
    caps.fillStyle(COLORS.navy, 1);
    const r = PANEL_RADIUS;
    const insetAt = (d: number): number => r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
    for (let i = 0; i < r; i++) {
      const inset = insetAt(i + 0.5);
      if (inset <= 0) continue;
      const top = this.panelY0 + i;
      const bottom = this.panelY1 - 1 - i;
      caps.fillRect(this.panelX0, top, inset, 1);
      caps.fillRect(this.panelX1 - inset, top, inset, 1);
      caps.fillRect(this.panelX0, bottom, inset, 1);
      caps.fillRect(this.panelX1 - inset, bottom, inset, 1);
    }
  }

  /** ~60 small white dots, deterministic from a fixed seed (xorshift32) so the pattern doesn't
   * change as the scene rebuilds. Sprinkled in the sky area above the ground line only. */
  private drawStars(g: Phaser.GameObjects.Graphics, x0: number, w: number, bottomY: number): void {
    let seed = 0x9e3779b9;
    const rnd = (): number => {
      seed ^= seed << 13;
      seed |= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed |= 0;
      return ((seed >>> 0) % 100000) / 100000;
    };
    const topY = this.panelY0;
    // Same density on a wide world: STAR_COUNT per 960 px panel width (exactly STAR_COUNT, and
    // the same seeded pattern, on a single-screen world).
    const count = Math.round((STAR_COUNT * w) / (this.panelX1 - this.panelX0));
    for (let i = 0; i < count; i++) {
      const x = x0 + rnd() * w;
      const y = topY + rnd() * (bottomY - topY);
      const alpha = 0.5 + rnd() * 0.4;
      g.fillStyle(COLORS.white, alpha);
      g.fillCircle(x, y, 1);
    }
  }

  private createBruno(): void {
    const shadow = this.onUi(this.add.graphics());
    shadow.setDepth(DEPTH_BRUNO_SHADOW);
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillEllipse(BRUNO_SLOT.x, BRUNO_SLOT.y + 1, 34, 8);

    try {
      const bruno = this.add.spine(BRUNO_SLOT.x, BRUNO_SLOT.y, 'engineer', 'floofs');
      bruno.setScale(0.084); // about 66 px tall
      bruno.setDepth(DEPTH_BRUNO);
      bruno.animationState.setAnimation(0, 'engineer_idle', true);
      bruno.setVisible(true);
      this.bruno = this.onUi(bruno);
    } catch (err) {
      console.warn('BuilderScene: Bruno (Spine) failed to load; continuing without Bruno.', err);
      this.bruno = null;
    }
  }

  /** Plays Bruno's wave once, then returns to the idle loop. No-op if Bruno failed to load. */
  celebrate(): void {
    const bruno = this.bruno;
    if (!bruno) return;
    bruno.animationState.setAnimation(0, 'engineer_wave', false);
    bruno.animationState.addAnimation(0, 'engineer_idle', true, 0);
  }

  // ---------------- camera controller ----------------

  private updateCamera(dtMs: number): void {
    if (this.camMode === 'tween') {
      this.camT += this.introActive ? Math.min(dtMs, INTRO_MAX_DT_MS) : dtMs;
      const t = this.camDurMs > 0 ? Math.min(1, this.camT / this.camDurMs) : 1;
      this.camCur = lerpFrame(this.camFrom, this.camTo, easeInOutCubic(t));
      if (t >= 1) {
        this.camCur = this.camTo;
        this.camMode = 'idle';
        if (this.introActive) this.endIntro();
      }
    } else if (this.camMode === 'glide') {
      this.camCur = approachFrame(this.camCur, this.camTo, GLIDE_LERP, dtMs);
      if (
        Math.abs(this.camCur.cx - this.camTo.cx) < 1e-3 &&
        Math.abs(this.camCur.cy - this.camTo.cy) < 1e-3 &&
        Math.abs(this.camCur.zoom - this.camTo.zoom) < 1e-4
      ) {
        this.camCur = this.camTo;
        this.camMode = 'idle';
      }
    } else if (this.camMode === 'track' && this.trackTarget) {
      const target = clampFrame(
        { cx: this.trackTarget.p.x, cy: this.trackTarget.p.y, zoom: this.trackTarget.zoom },
        this.camWorld,
      );
      this.camCur = approachFrame(this.camCur, target, this.trackTarget.lerp, dtMs);
    }
    this.camCur = clampFrame(this.camCur, this.camWorld);

    const px = this.view.toPx({ x: this.camCur.cx, y: this.camCur.cy });
    this.worldCam.setZoom(RENDER_SCALE * this.camCur.zoom);
    this.worldCam.centerOn(px.x, px.y);

    this.pxScale = 1 / this.camCur.zoom;
    if (Math.abs(this.camCur.zoom - this.lastGridZoom) > 1e-3) {
      this.lastGridZoom = this.camCur.zoom;
      this.redrawGrid();
    }
  }

  /** Tweens to `frame` (null = the base frame: the edit-mode rest frame set by `setBaseFrame`,
   * the full field by default) over `ms`. Also becomes the rest frame a released `trackPoint`
   * returns to. While a `trackPoint` follow is active the tween itself is deferred until release
   * — calling this only updates the rest frame in the meantime. While an intro pan runs it is
   * deferred until the pan ends (the latest request wins). */
  focusFrame(frame: CameraFrame | null, ms = FOCUS_MS): void {
    const target = clampFrame(frame ?? this.baseFrame, this.camWorld);
    this.camRest = target;
    if (this.introActive) {
      this.introDeferred = target;
      return;
    }
    if (this.camMode === 'track') return;
    this.camFrom = { ...this.camCur };
    this.camTo = target;
    this.camT = 0;
    this.camDurMs = Math.max(0, ms);
    if (this.camDurMs <= 0) {
      this.camCur = target;
      this.camMode = 'idle';
    } else {
      this.camMode = 'tween';
    }
  }

  /** Play mode: call every frame with the world point to soft-follow, or null to release (the
   * camera then tweens back to the last `focusFrame` rest frame over FOCUS_MS). `zoom` defaults
   * to the zoom last used for this track (or the current frame's zoom, the first time); `lerp`
   * is the per-60 Hz approach factor (default 0.1). Clamped to stay inside the panel. */
  trackPoint(p: Vec2 | null, zoom?: number, lerp = 0.1): void {
    if (p !== null) this.cancelIntro();
    if (p === null) {
      if (this.camMode === 'track') {
        this.trackTarget = null;
        this.camFrom = { ...this.camCur };
        this.camTo = this.camRest;
        this.camT = 0;
        this.camDurMs = FOCUS_MS;
        this.camMode = 'tween';
      }
      return;
    }
    this.trackTarget = { p, zoom: zoom ?? this.trackTarget?.zoom ?? this.camCur.zoom, lerp };
    this.camMode = 'track';
  }

  /** What `focusFrame(null)` returns to: the edit-mode rest frame (null = the full field, the
   * world's left view window at zoom 1). Does not move the camera by itself. */
  setBaseFrame(frame: CameraFrame | null): void {
    this.baseFrame = clampFrame(frame ?? fullFrame(this.camWorld), this.camWorld);
  }

  /** Sets the EFFECTIVE world (see `camWorld`'s doc) every camera clamp bounds itself to, for the
   * level now loading: `min(WorldSpec.worldW, Level.extentW ?? Infinity)`. Called by
   * `BuilderApp.loadLevel` before it recomputes the rest frame, so a short level in a wide course
   * never lets the camera (or the edit-mode scrollbar) wander into its empty tail. Does not move
   * the camera by itself — the next `setBaseFrame`/`focusFrame`/`glideTo` call does. */
  setWorldExtent(world: WorldDims): void {
    this.camWorld = world;
  }

  /** Glides (an exponential approach, no fixed duration) to `frame`, which also becomes the rest
   * frame. For the edit-mode scrollbar: a drag retargets it every pointer move without the
   * restart stutter a fixed-length eased tween would have. Ends an intro pan where it is; while
   * a `trackPoint` follow is active only the rest frame changes. */
  glideTo(frame: CameraFrame): void {
    const target = clampFrame(frame, this.camWorld);
    this.cancelIntro();
    this.camRest = target;
    if (this.camMode === 'track') return;
    this.camTo = target;
    this.camMode = 'glide';
  }

  /** A level-load intro pan: jumps to `from` and tweens (ease in-out) to `to` over `ms`, both
   * clamped to the world. `to` becomes the rest frame. Until the pan ends, `focusFrame` requests
   * wait (the latest one is applied when it ends) and a tap on the canvas skips to the end. */
  playIntro(from: CameraFrame, to: CameraFrame, ms: number): void {
    const a = clampFrame(from, this.camWorld);
    const b = clampFrame(to, this.camWorld);
    this.trackTarget = null;
    this.introDeferred = null;
    this.camFrom = a;
    this.camTo = b;
    this.camRest = b;
    this.camT = 0;
    this.camDurMs = Math.max(0, ms);
    if (this.camDurMs <= 0) {
      this.camCur = b;
      this.camMode = 'idle';
      this.introActive = false;
      return;
    }
    this.camCur = a;
    this.camMode = 'tween';
    this.introActive = true;
  }

  /** Jumps a running intro pan to its end frame, then applies any focus request it held back.
   * No-op when no intro is running. */
  skipIntro(): void {
    if (!this.introActive) return;
    this.camCur = { ...this.camTo };
    this.camMode = 'idle';
    this.endIntro();
  }

  /** Forgets a running intro pan without moving the camera (a new level is loading, a follow
   * took over, the scrollbar moved). */
  cancelIntro(): void {
    this.introActive = false;
    this.introDeferred = null;
  }

  /** An intro pan is running (see `playIntro`). */
  isIntroActive(): boolean {
    return this.introActive;
  }

  /** The camera frame shown right now (world meters). */
  cameraFrame(): FrameState {
    return { ...this.camCur };
  }

  /** The camera rests on (or is heading for) the base frame: no intro pan, no focus frame or
   * follow elsewhere. The HUD's scrollbar then shows the rest frame rather than the live camera. */
  isAtBase(): boolean {
    if (this.introActive || this.camMode === 'track') return false;
    const a = this.camRest;
    const b = this.baseFrame;
    return Math.abs(a.cx - b.cx) < 1e-6 && Math.abs(a.cy - b.cy) < 1e-6 && Math.abs(a.zoom - b.zoom) < 1e-6;
  }

  private endIntro(): void {
    this.introActive = false;
    const deferred = this.introDeferred;
    this.introDeferred = null;
    if (deferred) this.focusFrame(deferred);
  }

  /** Stage-px (the 1024x768 space the HTML HUD is laid out in) position of a world-meter point
   * under the CURRENT world camera (zoom + scroll + the viewport's own panel offset). For the
   * drawer's "part flies to the machine" animation: where a machine part sits on screen right
   * now, so a flying picture can land on it. */
  worldToStage(p: Vec2): Vec2 {
    return panelPxToStagePx(this.view.toPx(p), this.worldCam, RENDER_SCALE);
  }

  /** On-screen stage px per world meter at the CURRENT camera zoom (ppm at zoom 1, scaled by
   * how zoomed-in the world camera is right now). Sizes a flying part's picture to match how
   * big that part actually looks on the machine. */
  stagePerMeter(): number {
    return this.world.ppm * this.camCur.zoom;
  }

  // ---------------- public API ----------------

  /** Logs a missing/failed texture key once (not once per setItems call/frame). */
  private warnMissingTexture(key: string): void {
    if (this.warnedTextureKeys.has(key)) return;
    this.warnedTextureKeys.add(key);
    console.warn(`BuilderScene: texture "${key}" is not loaded; drawing a fill instead.`);
  }

  setItems(
    items: RenderItem[],
    bounds: { partId: number; bounds: Bounds }[],
    regions: { partId: number; region: Bounds }[] = [],
    segments: { partId: number; segment: { a: Vec2; b: Vec2; r: number } }[] = [],
  ): void {
    this.items = items;
    this.boundsList = bounds;

    this.boundsByPart = new Map(bounds.map((b) => [b.partId, b.bounds]));
    this.regionByPart = new Map(regions.map((r) => [r.partId, r.region]));
    this.segments = segments;
    this.segmentByPart = new Map(segments.map((s) => [s.partId, s.segment]));
    this.itemsByPart = new Map();
    this.lockedParts = new Set();
    this.lockPositionParts = new Set();
    for (const item of items) {
      const arr = this.itemsByPart.get(item.partId);
      if (arr) arr.push(item);
      else this.itemsByPart.set(item.partId, [item]);
      if (item.locked) this.lockedParts.add(item.partId);
      if (item.lockPosition) this.lockPositionParts.add(item.partId);
    }

    // rebuild role/texture images: one per texture-backed item, sized from its shape. An item's
    // own `textureKey` (a swapped part's real look) takes priority over the role's texture; the
    // cache key folds in the resolved texture key so a body whose textureKey changed between
    // calls never keeps showing the old picture (moot in practice since every call above already
    // destroys and rebuilds the whole map, but keeps this loop correct if that ever changes).
    for (const img of this.roleImages.values()) img.destroy();
    this.roleImages.clear();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const roleDef = this.roles[item.role];
      let key: string | undefined;
      let scale: number;
      if (item.textureKey !== undefined) {
        const tex = this.textureDefs[item.textureKey];
        if (!tex) {
          this.warnMissingTexture(item.textureKey);
          continue; // fall back to the fill path in syncTransforms/drawItem
        }
        key = item.textureKey;
        scale = tex.scale ?? 1;
      } else if (roleDef?.texture) {
        key = roleDef.texture.key;
        scale = roleDef.texture.scale;
      } else {
        continue;
      }
      if (!this.textures.exists(key)) {
        this.warnMissingTexture(key);
        continue; // the image failed to load (or was never queued): fall back to the fill path
      }
      const img = this.onWorld(this.add.image(0, 0, key));
      const size = textureSize(item.shape, this.world.ppm, scale);
      img.setDisplaySize(size.w, size.h);
      img.setDepth(DEPTH_TEXTURE);
      if (roleDef?.tint) img.setTint(item.color);
      else img.clearTint();
      this.roleImages.set(i, img);
    }

    // Clear any part gesture referring to a part that may no longer exist. A widget drag/tap in
    // progress is left alone: a live dial commits mid-drag (see DialWidget.live), which re-sends
    // items right here, and resetting the active pointer would silently kill the gesture — the
    // handle would stop following the finger and the eventual pointerup would be ignored.
    if (!this.widgetDrag && !this.widgetTap) {
      this.gesture = null;
      this.activePointerId = null;
      this.dragPartId = null;
      this.dragOffset = { x: 0, y: 0 };
    }
  }

  setMarkers(items: OverlayItem[]): void {
    this.markers = items;
  }

  /** Sets the snap grid (world meters), drawing grid dots once on a static Graphics above the
   * panel backdrop and below items. Pass null to disable the grid (no dots, no snapping). */
  setGrid(size: number | null): void {
    this.grid = size != null && size > 0 ? size : null;
    if (!this.gridGfx) {
      this.gridGfx = this.onWorld(this.add.graphics());
      this.gridGfx.setDepth(DEPTH_GRID);
    }
    this.redrawGrid();
  }

  /** Rebuilds the grid dots at the current pxScale (their radius is screen-constant); called
   * from `setGrid` and whenever the camera zoom changes. */
  private redrawGrid(): void {
    if (!this.gridGfx) return;
    this.gridGfx.clear();
    if (this.grid === null) return;
    const g = this.grid;
    const eps = g / 1000;
    // Dots stop at the visible top (worldH - groundDepth), not worldH: a part never sits below
    // world y = 0, so the grid never needs to show past what a below-zero ground band exposes.
    const topY = this.world.worldH - (this.world.groundDepth ?? 0);
    this.gridGfx.fillStyle(COLORS.white, 0.25);
    for (let x = 0; x <= this.world.worldW + eps; x += g) {
      for (let y = 0; y <= topY + eps; y += g) {
        const p = this.view.toPx({ x, y });
        this.gridGfx.fillCircle(p.x, p.y, 1.5 * this.pxScale);
      }
    }
  }

  /** Rounds a world point to the grid when one is set; otherwise returns it unchanged. */
  private snap(w: Vec2): Vec2 {
    const g = this.grid;
    if (!g) return w;
    return { x: Math.round(w.x / g) * g, y: Math.round(w.y / g) * g };
  }

  /** Bounds centre of a placed part, or null when its bounds are unknown. */
  private centreOf(partId: number): Vec2 | null {
    const b = this.boundsByPart.get(partId);
    return b ? { x: b.x, y: b.y } : null;
  }

  /** The `LinkEnd` for a world point: a hit part's bounds centre, or the snapped point. */
  private linkEndAt(w: Vec2): LinkEnd {
    const partId = this.hitTest(w.x, w.y);
    const at = partId !== null ? (this.centreOf(partId) ?? this.snap(w)) : this.snap(w);
    return { partId, at };
  }

  syncTransforms(snap: SimSnapshot): void {
    this.drawnTransforms = snap.transforms;
    this.itemsGfx.clear();
    this.marksGfx.clear();
    this.widgetGfx.clear();

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const t = snap.transforms.get(item.body);
      if (!t) {
        this.roleImages.get(i)?.setVisible(false); // destroyed body (e.g. an opened door)
        continue;
      }

      const extra = item.partId === this.dragPartId ? this.dragOffset : { x: 0, y: 0 };
      const roleDef = this.roles[item.role];

      // An image exists only for items that resolved to a loaded texture in setItems (role
      // texture or `textureKey`); everything else (including a missing/failed textureKey) falls
      // through to the fill path below.
      const img = this.roleImages.get(i);
      if (img) {
        img.setVisible(true);
        const p = this.view.toPx(localToWorld(shapeOffset(item.shape), t, extra));
        img.setPosition(p.x, p.y);
        img.setRotation(item.upright ? 0 : -t.angle);
        continue;
      }

      this.drawItem(item, t, extra, roleDef);
    }

    const seen = new Set<string>();
    this.drawOverlay(this.markers, seen);
    if (snap.overlay) this.drawOverlay(snap.overlay, seen);
    for (const [key, text] of this.overlayTextCache) {
      if (!seen.has(key)) text.setVisible(false);
    }
    for (const [id, img] of this.overlaySpriteCache) {
      if (!seen.has(`sprite:${id}`)) img.setVisible(false);
    }

    // Padlocks and the selection ring are edit-mode chrome: in play mode parts move away from
    // their rest bounds, and a mark left behind at the old position reads as a rendering bug.
    if (this.editable) {
      for (const { partId, bounds } of this.boundsList) {
        const extra = partId === this.dragPartId ? this.dragOffset : { x: 0, y: 0 };
        const seg = this.segmentByPart.get(partId);
        if (seg) {
          // Segment parts (rods) get a line-shaped selection ring and no padlock.
          if (partId === this.selectedPartId) this.drawSegmentSelectionRing(seg, extra);
          continue;
        }
        const b = { x: bounds.x + extra.x, y: bounds.y + extra.y, w: bounds.w, h: bounds.h };
        // Level-placed (locked) parts no longer carry a padlock mark: too distracting (2026-10-01).
        if (partId === this.selectedPartId && this.widgetGeoms.length === 0) this.drawSelectionRing(b); // widgets replace the box
      }

      if (this.linking && this.linkFrom && this.linkCurrentWorld) {
        this.drawLinkRubberBand(this.linkFrom.at, this.snap(this.linkCurrentWorld));
      }
    }

    if (this.editable && this.widgetSpecs.length > 0) {
      this.drawWidgets();
    } else {
      this.widgetGeoms = [];
      for (const text of this.widgetTextCache.values()) text.setVisible(false);
      for (const img of this.widgetImageCache.values()) img.setVisible(false);
    }
  }

  setSelected(partId: number | null): void {
    this.selectedPartId = partId;
  }

  setEditable(on: boolean): void {
    this.editable = on;
    if (!on) {
      this.gesture = null;
      this.activePointerId = null;
      this.dragPartId = null;
      this.dragOffset = { x: 0, y: 0 };
      this.linking = false;
      this.linkFrom = null;
      this.linkStartWorld = null;
      this.linkCurrentWorld = null;
      this.linkMoved = false;
      this.widgetTap = null;
      this.widgetDrag = null;
      this.widgetDragT = 0;
      this.widgetDragValue = undefined;
    }
  }

  /** Switches the active editor gesture mode; clears any in-flight gesture. */
  setTool(kind: 'move' | 'place' | 'link'): void {
    this.toolKind = kind;
    this.gesture = null;
    this.activePointerId = null;
    this.dragPartId = null;
    this.dragOffset = { x: 0, y: 0 };
    this.linking = false;
    this.linkFrom = null;
    this.linkStartWorld = null;
    this.linkCurrentWorld = null;
    this.linkMoved = false;
    this.widgetTap = null;
    this.widgetDrag = null;
    this.widgetDragT = 0;
    this.widgetDragValue = undefined;
  }

  /** Replaces the widget list; clears drag/animation state for ids that vanished. */
  setWidgets(widgets: Widget[]): void {
    this.widgetSpecs = widgets;
    this.widgetsById = new Map(widgets.map((w) => [w.id, w]));
    const ids = new Set(widgets.map((w) => w.id));
    if (this.widgetTap && !ids.has(this.widgetTap.id)) this.widgetTap = null;
    if (this.widgetDrag && !ids.has(this.widgetDrag.id)) {
      this.widgetDrag = null;
      this.widgetDragT = 0;
      this.widgetDragValue = undefined;
    }
    for (const id of [...this.widgetSpring.keys()]) if (!ids.has(id)) this.widgetSpring.delete(id);
    for (const key of [...this.widgetPop.keys()]) if (!ids.has(key.split(':')[0]!)) this.widgetPop.delete(key);
  }

  // ---------------- drawing ----------------

  private drawItem(item: RenderItem, t: Transform, extra: Vec2, roleDef: RoleRenderer | undefined): void {
    const g = this.itemsGfx;
    const shape = item.shape;
    const fillSpec = roleDef?.fill?.(item) ?? { color: item.color, alpha: item.alpha ?? 1 };
    // A translucent fill (e.g. a sensor zone) draws with no stroke; an opaque fill gets one.
    const opaque = fillSpec.alpha >= 1;
    const corners = shapeCorners(shape);
    const stage = corners.map((c) => this.view.toPx(localToWorld(c, t, extra)));

    if (shape.kind === 'circle') {
      const p = this.view.toPx(localToWorld(shapeOffset(shape), t, extra));
      const r = shape.r * this.world.ppm;
      g.fillStyle(fillSpec.color, fillSpec.alpha);
      g.fillCircle(p.x, p.y, r);
      if (opaque) {
        g.lineStyle(2, darken(fillSpec.color), 1);
        g.strokeCircle(p.x, p.y, r);
      }
    } else {
      pathFrom(g, stage);
      g.fillStyle(fillSpec.color, fillSpec.alpha);
      g.fillPath();
      if (opaque) {
        g.lineStyle(2, darken(fillSpec.color), 1);
        g.strokePath();
      }
    }

    switch (roleDef?.decorate) {
      case 'flag':
        this.drawFlagDecoration(stage);
        break;
      case 'stripe':
        this.drawStripe(g, shape, t, extra);
        break;
      case 'brick':
        this.drawBoxLines(g, shape, t, extra, fillSpec.color, 0.35, 2);
        break;
      case 'plank':
        this.drawBoxLines(g, shape, t, extra, fillSpec.color, 0.18, 1);
        break;
      case 'rings':
        if (shape.kind === 'circle') this.drawRings(g, shape, t, extra);
        break;
      default:
        break;
    }
  }

  /** Three concentric rings on a circle shape (a bullseye): outer white, middle pink, inner
   * white, drawn on top of the fill. */
  private drawRings(
    g: Phaser.GameObjects.Graphics,
    shape: Extract<Shape, { kind: 'circle' }>,
    t: Transform,
    extra: Vec2,
  ): void {
    const p = this.view.toPx(localToWorld(shapeOffset(shape), t, extra));
    const r = shape.r * this.world.ppm;
    g.fillStyle(COLORS.white, 0.9);
    g.fillCircle(p.x, p.y, r);
    g.fillStyle(COLORS.pink, 0.9);
    g.fillCircle(p.x, p.y, (r * 2) / 3);
    g.fillStyle(COLORS.white, 0.9);
    g.fillCircle(p.x, p.y, r / 3);
  }

  /** The door's thin light stripe across the mid-line of a box/polygon shape. */
  private drawStripe(g: Phaser.GameObjects.Graphics, shape: Shape, t: Transform, extra: Vec2): void {
    const half = stripeHalf(shape);
    const left = this.view.toPx(localToWorld({ x: -half, y: 0 }, t, extra));
    const right = this.view.toPx(localToWorld({ x: half, y: 0 }, t, extra));
    g.lineStyle(2, COLORS.white, 0.6);
    g.beginPath();
    g.moveTo(left.x, left.y);
    g.lineTo(right.x, right.y);
    g.strokePath();
  }

  /** Two horizontal lines across a box's interior (brick mortar / plank grain). No-op on
   * non-box shapes. */
  private drawBoxLines(
    g: Phaser.GameObjects.Graphics,
    shape: Shape,
    t: Transform,
    extra: Vec2,
    baseColor: number,
    darkenAmt: number,
    width: number,
  ): void {
    if (shape.kind !== 'box') return;
    const color = darken(baseColor, darkenAmt);
    const cx = shape.cx ?? 0;
    const cy = shape.cy ?? 0;
    const halfW = shape.w / 2;
    const halfH = shape.h / 2;
    g.lineStyle(width, color, 1);
    for (const frac of [-1 / 3, 1 / 3]) {
      const y = cy + frac * halfH;
      const left = this.view.toPx(localToWorld({ x: cx - halfW, y }, t, extra));
      const right = this.view.toPx(localToWorld({ x: cx + halfW, y }, t, extra));
      g.beginPath();
      g.moveTo(left.x, left.y);
      g.lineTo(right.x, right.y);
      g.strokePath();
    }
  }

  /** A small checkered flag on a pole, planted at stage point (x, y). Pole/cell size is
   * screen-constant (counter-scaled). */
  private drawFlagAt(x: number, y: number): void {
    const g = this.marksGfx;
    const s = this.pxScale;
    const poleH = 14 * s;
    const poleTopY = y - poleH;
    g.lineStyle(2 * s, 0x1f2430, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, poleTopY);
    g.strokePath();
    const cell = 4 * s;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const even = (row + col) % 2 === 0;
        g.fillStyle(even ? COLORS.white : 0x1f2430, 1);
        g.fillRect(x + col * cell, poleTopY + row * cell, cell, cell);
      }
    }
  }

  /** Plants the flag at the top-center of a stage quad (average of the two "highest" —
   * smallest stage-y — corners). */
  private drawFlagDecoration(stageQuad: Vec2[]): void {
    const sorted = [...stageQuad].sort((a, b) => a.y - b.y);
    const topCx = (sorted[0]!.x + sorted[1]!.x) / 2;
    const topY = sorted[0]!.y;
    this.drawFlagAt(topCx, topY);
  }

  /** A white rounded-rect outline around a selected part's (possibly drag-shifted) bounds. The
   * rect itself is world-sized (follows the part at whatever zoom); only the line width and
   * corner radius are counter-scaled. */
  private drawSelectionRing(b: Bounds): void {
    const topLeft = this.view.toPx({ x: b.x - b.w / 2, y: b.y + b.h / 2 });
    const w = b.w * this.world.ppm;
    const h = b.h * this.world.ppm;
    const g = this.marksGfx;
    const s = this.pxScale;
    g.lineStyle(2 * s, COLORS.white, 0.9);
    g.strokeRoundedRect(topLeft.x, topLeft.y, w, h, 4 * s);
  }

  /** A thick translucent line along a segment part's (a, b), used as its selection ring instead
   * of a bounds box. The segment's own radius is world-sized; only the +6px margin around it is
   * counter-scaled. */
  private drawSegmentSelectionRing(seg: { a: Vec2; b: Vec2; r: number }, extra: Vec2): void {
    const a = this.view.toPx({ x: seg.a.x + extra.x, y: seg.a.y + extra.y });
    const b = this.view.toPx({ x: seg.b.x + extra.x, y: seg.b.y + extra.y });
    const g = this.marksGfx;
    g.lineStyle(seg.r * 2 * this.world.ppm + 6 * this.pxScale, COLORS.white, 0.35);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.strokePath();
  }

  /** The 'link' tool's rubber band: a line from `from` (world) to `end` (world, already
   * snapped), plus a small hollow circle at the end. Screen-constant width/radius. */
  private drawLinkRubberBand(from: Vec2, end: Vec2): void {
    const a = this.view.toPx(from);
    const b = this.view.toPx(end);
    const g = this.marksGfx;
    const s = this.pxScale;
    g.lineStyle(3 * s, COLORS.white, 0.8);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.strokePath();
    g.lineStyle(2 * s, COLORS.white, 0.8);
    g.strokeCircle(b.x, b.y, 6 * s);
  }

  /** Draws static markers and/or per-frame overlay items onto marksGfx. `seen` collects the
   * cache keys of any text objects used, so callers can hide ones that were not this pass. */
  private drawOverlay(items: OverlayItem[], seen: Set<string>): void {
    const g = this.marksGfx;
    for (const item of items) {
      switch (item.kind) {
        case 'line': {
          const a = this.view.toPx(item.a);
          const b = this.view.toPx(item.b);
          g.lineStyle(item.width ?? 2, item.color, item.alpha ?? 1);
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.strokePath();
          break;
        }
        case 'dot': {
          const p = this.view.toPx(item.p);
          g.fillStyle(item.color, item.alpha ?? 1);
          g.fillCircle(p.x, p.y, item.r);
          break;
        }
        case 'hline': {
          const y = this.view.toPx({ x: 0, y: item.y }).y;
          // Across the whole world (it scrolls under the camera on a wide world).
          const x0 = this.panelX0;
          const x1 = this.worldX1;
          const dash = 8 * this.pxScale;
          g.lineStyle(2 * this.pxScale, item.color, 1);
          for (let x = x0; x < x1; x += dash * 2) {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(Math.min(x + dash, x1), y);
            g.strokePath();
          }
          if (item.label) {
            const key = `hline:${item.label}`;
            seen.add(key);
            const text = this.overlayText(key, item.label, 11, '#ffffff', false);
            // A wide world keeps the label at the visible window's left edge, not at world x 0.
            const labelX = this.wide
              ? Math.max(x0, this.view.toPx({ x: this.camCur.cx - this.view.viewW / this.camCur.zoom / 2, y: 0 }).x)
              : x0;
            text.setPosition(labelX + 4 * this.pxScale, y - 14 * this.pxScale);
          }
          break;
        }
        case 'flag': {
          const p = this.view.toPx(item.p);
          this.drawFlagAt(p.x, p.y);
          break;
        }
        case 'icon': {
          const p = this.view.toPx(item.p);
          const key = `icon:${item.text}`;
          seen.add(key);
          const text = this.overlayText(key, item.text, 20, '#ffffff', true);
          text.setPosition(p.x, p.y);
          break;
        }
        case 'label': {
          const ride = item.body !== undefined ? this.drawnTransforms?.get(item.body) : undefined;
          const worldP = ride
            ? { x: ride.position.x + (item.offset?.x ?? 0), y: ride.position.y + (item.offset?.y ?? 0) }
            : item.p;
          const p = this.view.toPx(worldP);
          const key = `label:${item.id}`;
          seen.add(key);
          const text = this.overlayText(key, item.text, item.size ?? 16, colorHex(item.color ?? 0xffffff), true);
          const padX = 8 * this.pxScale;
          const padY = 4 * this.pxScale;
          const w = text.displayWidth + padX * 2;
          const h = text.displayHeight + padY * 2;
          g.fillStyle(item.bg ?? 0x171e3a, 0.85);
          g.fillRoundedRect(p.x - w / 2, p.y - h / 2, w, h, 6 * this.pxScale);
          text.setPosition(p.x, p.y);
          break;
        }
        case 'sprite': {
          if (!this.textures.exists(item.textureKey)) {
            this.warnMissingTexture(item.textureKey);
            break;
          }
          const key = `sprite:${item.id}`;
          seen.add(key);
          let img = this.overlaySpriteCache.get(item.id);
          if (!img) {
            img = this.onWorld(this.add.image(0, 0, item.textureKey));
            img.setDepth(DEPTH_OVERLAY_SPRITE);
            this.overlaySpriteCache.set(item.id, img);
          }
          if (img.texture.key !== item.textureKey) img.setTexture(item.textureKey);
          // World-sized (not counter-scaled by pxScale), like a RenderItem texture: it zooms with
          // the camera along with everything else in the panel.
          const w = item.size * this.world.ppm;
          const h = w * (img.frame.height / img.frame.width);
          img.setDisplaySize(w, h);
          const p = this.view.toPx(item.p);
          img.setPosition(p.x, p.y);
          img.setAlpha(item.alpha ?? 1);
          img.setRotation(-(item.angle ?? 0));
          img.setVisible(true);
          break;
        }
        default:
          break;
      }
    }
  }

  private overlayText(key: string, content: string, fontSize: number, color: string, centered: boolean): Phaser.GameObjects.Text {
    let text = this.overlayTextCache.get(key);
    if (!text) {
      text = this.onWorld(this.add.text(0, 0, content, { fontSize: `${fontSize}px`, color, resolution: TEXT_RESOLUTION }));
      if (centered) text.setOrigin(0.5, 0.5);
      text.setDepth(DEPTH_MARKS_TEXT);
      this.overlayTextCache.set(key, text);
    } else if (text.text !== content) {
      text.setText(content);
    }
    // Screen-constant size regardless of the camera's zoom (item fills/strokes are the only
    // things that should visually scale with zoom).
    text.setScale(this.pxScale);
    text.setVisible(true);
    return text;
  }

  // ---------------- widget drawing ----------------

  private drawWidgets(): void {
    const toPx = (v: Vec2): Vec2 => this.view.toPx(v);
    this.widgetGeoms = layoutWidgets(this.widgetSpecs, toPx, this.pxScale);
    const seenText = new Set<string>();
    const seenImg = new Set<string>();

    for (const geom of this.widgetGeoms) {
      switch (geom.kind) {
        case 'tap':
          this.drawTapWidget(geom, seenText, seenImg);
          break;
        case 'dial':
          this.drawDialWidget(geom, seenText);
          break;
        case 'rack':
          this.drawRackWidget(geom, seenText, seenImg);
          break;
        case 'lever':
          this.drawLeverWidget(geom, seenText);
          break;
        case 'cycle':
          this.drawCycleWidget(geom, seenText, seenImg);
          break;
        case 'pull':
          this.drawPullWidget(geom, seenText);
          break;
      }
      // A locked widget is drawn muted only; the padlock badge was dropped as too distracting.
    }

    this.drawWidgetHops(seenText, seenImg);

    for (const [key, text] of this.widgetTextCache) if (!seenText.has(key)) text.setVisible(false);
    for (const [key, img] of this.widgetImageCache) if (!seenImg.has(key)) img.setVisible(false);
  }

  private widgetText(
    key: string,
    content: string,
    fontSize: number,
    color: string,
    centered: boolean,
    bold = false,
  ): Phaser.GameObjects.Text {
    let text = this.widgetTextCache.get(key);
    if (!text) {
      text = this.onWorld(
        this.add.text(0, 0, content, { fontSize: `${fontSize}px`, color, fontStyle: bold ? 'bold' : 'normal', resolution: TEXT_RESOLUTION }),
      );
      if (centered) text.setOrigin(0.5, 0.5);
      text.setDepth(DEPTH_WIDGETS + 0.05);
      this.widgetTextCache.set(key, text);
    } else {
      if (text.text !== content) text.setText(content);
      text.setFontStyle(bold ? 'bold' : 'normal');
    }
    text.setScale(this.pxScale);
    text.setVisible(true);
    return text;
  }

  /** Current tap-feedback pop scale for `key` (a widget id, or `id:value` for a rack cell);
   * 1 when there is no active pop. Deletes the entry once the animation completes. */
  private popFor(key: string): number {
    const start = this.widgetPop.get(key);
    if (start === undefined) return 1;
    const p = (this.nowMs - start) / WIDGET_POP_MS;
    if (p >= 1) {
      this.widgetPop.delete(key);
      return 1;
    }
    return popScale(p);
  }

  /** Only the widget style tokens' small captions/readouts are gated by zoom (icons and the
   * control body are always drawn); this avoids label flicker while the focus camera tweens. */
  private get labelsVisible(): boolean {
    return this.camCur.zoom >= 2.0;
  }

  /** A shadow (offset 0,+4 px, ink @0.35) under every filled control, drawn before its body. */
  private shadowRoundedRect(cx: number, cy: number, w: number, h: number, r: number): void {
    const s = this.pxScale;
    this.widgetGfx.fillStyle(SHADOW_COLOR, SHADOW_ALPHA);
    this.widgetGfx.fillRoundedRect(cx - w / 2, cy - h / 2 + SHADOW_OFFSET * s, w, h, r);
  }

  private shadowCircle(cx: number, cy: number, r: number): void {
    const s = this.pxScale;
    this.widgetGfx.fillStyle(SHADOW_COLOR, SHADOW_ALPHA);
    this.widgetGfx.fillCircle(cx, cy + SHADOW_OFFSET * s, r);
  }

  /** 14 px for a control whose authored (pre-pxScale) size is >= 72 px, 10 px below. */
  private cornerRadius(sizePx: number): number {
    const raw = sizePx / this.pxScale;
    return (raw >= 72 ? 14 : 10) * this.pxScale;
  }

  private drawTapWidget(geom: TapGeom, seenText: Set<string>, seenImg: Set<string>): void {
    const g = this.widgetGfx;
    const s = this.pxScale;
    const locked = geom.locked;
    const alpha = locked ? 0.45 : 1;
    const accent = locked ? MUTED : geom.color ?? ACTIVE;
    const pop = this.popFor(geom.id);
    const size = geom.size * pop;
    const half = size / 2;
    const r = this.cornerRadius(geom.size);

    this.shadowRoundedRect(geom.center.x, geom.center.y, size, size, r);
    g.fillStyle(CARD, alpha);
    g.fillRoundedRect(geom.center.x - half, geom.center.y - half, size, size, r);
    g.lineStyle((geom.color !== undefined ? 4 : 2) * s, accent, alpha);
    g.strokeRoundedRect(geom.center.x - half, geom.center.y - half, size, size, r);

    const texKey = geom.texture ? this.roles[geom.texture.role]?.texture?.key : undefined;
    if (geom.texture && texKey) {
      const key = `tap:${geom.id}:img`;
      seenImg.add(key);
      let img = this.widgetImageCache.get(key);
      if (!img) {
        img = this.onWorld(this.add.image(0, 0, texKey));
        img.setDepth(DEPTH_WIDGETS + 0.05);
        this.widgetImageCache.set(key, img);
      }
      img.setTexture(texKey);
      img.setDisplaySize(size * 0.7, size * 0.7);
      img.setPosition(geom.center.x, geom.center.y);
      img.setAlpha(alpha);
      if (geom.texture.tint !== undefined) img.setTint(geom.texture.tint);
      else img.clearTint();
      img.setVisible(true);
    } else {
      const key = `tap:${geom.id}:icon`;
      seenText.add(key);
      const text = this.widgetText(key, geom.icon, 20, '#ffffff', true);
      text.setAlpha(alpha);
      text.setScale(s * pop);
      text.setPosition(geom.center.x, geom.center.y);
    }

    if (geom.label && this.labelsVisible) {
      const key = `tap:${geom.id}:label`;
      seenText.add(key);
      const text = this.widgetText(key, geom.label, 16, '#ffffff', true);
      text.setAlpha(alpha);
      text.setPosition(geom.center.x, geom.center.y + half + 12 * s);
    }
  }

  private drawDialWidget(geom: DialGeom, seenText: Set<string>): void {
    const g = this.widgetGfx;
    const s = this.pxScale;
    const locked = geom.locked;
    const alpha = locked ? 0.45 : 1;
    const accent = locked ? MUTED : ACTIVE;
    const dragging = this.widgetDrag?.id === geom.id && this.widgetDrag.kind === 'dial';
    const handleAngle = dragging ? this.widgetDragAngle : geom.handleAngle;
    const value = dragging ? this.widgetDragValue ?? geom.value : geom.value;
    const pop = this.popFor(geom.id);

    // World-axis angle (CCW, 0 = +x) -> stage offset: stage y is flipped relative to world y-up.
    const at = (angle: number, r: number): Vec2 => ({
      x: geom.pivot.x + r * Math.cos(angle),
      y: geom.pivot.y - r * Math.sin(angle),
    });
    const arcPath = (from: number, to: number): void => {
      g.beginPath();
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const a = from + (to - from) * (i / steps);
        const p = at(a, geom.radiusPx);
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
      g.strokePath();
    };

    // 'none': the machine part under the handle IS the track (a lever stick); only the notch
    // ticks are drawn, and outlined so they read on top of a busy part instead of a flat band.
    if (geom.track !== 'none') {
      g.lineStyle(10 * s, CARD, alpha);
      arcPath(geom.arcFrom, geom.arcTo);
      g.lineStyle(10 * s, accent, alpha);
      arcPath(geom.arcFrom, handleAngle);
    }

    const n = geom.options.length;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? geom.arcFrom + ((geom.arcTo - geom.arcFrom) * i) / (n - 1) : geom.arcFrom;
      const p = at(a, geom.radiusPx);
      if (geom.track === 'none') {
        g.fillStyle(KNOB_COLOR, alpha);
        g.fillCircle(p.x, p.y, 3.5 * s);
        g.lineStyle(1.5 * s, INK, alpha);
        g.strokeCircle(p.x, p.y, 3.5 * s);
      } else {
        g.fillStyle(MUTED, alpha);
        g.fillCircle(p.x, p.y, 2.5 * s);
      }
    }

    const handlePos = at(handleAngle, geom.radiusPx);
    const handleR = geom.handleR * (dragging ? 1.08 : 1) * pop;
    this.shadowCircle(handlePos.x, handlePos.y, handleR);
    g.fillStyle(KNOB_COLOR, alpha);
    g.fillCircle(handlePos.x, handlePos.y, handleR);
    g.lineStyle(4 * s, accent, alpha);
    g.strokeCircle(handlePos.x, handlePos.y, handleR);
    const pivotDx = geom.pivot.x - handlePos.x;
    const pivotDy = geom.pivot.y - handlePos.y;
    const pivotLen = Math.hypot(pivotDx, pivotDy) || 1;
    g.lineStyle(3 * s, accent, alpha);
    g.beginPath();
    g.moveTo(handlePos.x, handlePos.y);
    g.lineTo(handlePos.x + (pivotDx / pivotLen) * handleR * 0.8, handlePos.y + (pivotDy / pivotLen) * handleR * 0.8);
    g.strokePath();

    const opt = geom.options.find((o) => o.value === value);
    if (opt && geom.readout === 'knob') {
      // The current option's label lives inside the handle itself; no arc pill.
      if (this.labelsVisible) {
        const key = `dial:${geom.id}:knob`;
        seenText.add(key);
        const text = this.widgetText(key, opt.label, 16, colorHex(INK), true, true);
        text.setAlpha(alpha);
        text.setPosition(handlePos.x, handlePos.y);
      }
    } else if (opt && geom.readout !== 'none' && this.labelsVisible) {
      const key = `dial:${geom.id}:readout`;
      seenText.add(key);
      const mid = (geom.arcFrom + geom.arcTo) / 2;
      const pos = dialPoint(geom.pivot, geom.radiusPx * 0.45, mid);
      const text = this.widgetText(key, opt.label, 24, '#ffffff', true, true);
      text.setAlpha(alpha);
      const padX = 12 * s;
      const padY = 12 * s;
      const w = text.displayWidth + padX * 2;
      const h = text.displayHeight + padY * 2;
      g.fillStyle(INK, alpha);
      g.fillRoundedRect(pos.x - w / 2, pos.y - h / 2, w, h, 10 * s);
      g.lineStyle(2 * s, accent, alpha);
      g.strokeRoundedRect(pos.x - w / 2, pos.y - h / 2, w, h, 10 * s);
      text.setPosition(pos.x, pos.y);
    }
  }

  private drawRackWidget(geom: RackGeom, seenText: Set<string>, seenImg: Set<string>): void {
    const g = this.widgetGfx;
    const s = this.pxScale;
    const locked = geom.locked;
    const alpha = locked ? 0.45 : 1;
    const edgeColor = locked ? MUTED : EDGE;
    const accent = locked ? MUTED : ACTIVE;
    const first = geom.cells[0];
    const last = geom.cells[geom.cells.length - 1];

    if (geom.plate && first && last) {
      const inset = 10 * s;
      const half = first.size / 2;
      const x0 = Math.min(first.center.x, last.center.x) - half - inset;
      const x1 = Math.max(first.center.x, last.center.x) + half + inset;
      const y0 = Math.min(first.center.y, last.center.y) - half - inset;
      const y1 = Math.max(first.center.y, last.center.y) + half + inset;
      g.fillStyle(INK, 0.85 * alpha);
      g.fillRoundedRect(x0, y0, x1 - x0, y1 - y0, 16 * s);
      g.lineStyle(2 * s, edgeColor, alpha);
      g.strokeRoundedRect(x0, y0, x1 - x0, y1 - y0, 16 * s);
    }

    for (const cell of geom.cells) {
      const popKey = `${geom.id}:${cell.value}`;
      const pop = this.popFor(popKey);
      const activeScale = cell.active && !locked ? 1.06 : 1;
      const size = cell.size * activeScale * pop;
      const half = size / 2;
      const r = this.cornerRadius(cell.size);
      const isCircle = geom.shape === 'circle';

      if (isCircle) this.shadowCircle(cell.center.x, cell.center.y, half);
      else this.shadowRoundedRect(cell.center.x, cell.center.y, size, size, r);

      g.fillStyle(CARD, alpha);
      if (isCircle) g.fillCircle(cell.center.x, cell.center.y, half);
      else g.fillRoundedRect(cell.center.x - half, cell.center.y - half, size, size, r);

      if (cell.active && !locked) {
        g.lineStyle(3 * s, ACTIVE, 0.25);
        if (isCircle) g.strokeCircle(cell.center.x, cell.center.y, half + 6 * s);
        else g.strokeRoundedRect(cell.center.x - half - 6 * s, cell.center.y - half - 6 * s, size + 12 * s, size + 12 * s, r);
        g.lineStyle(4 * s, accent, alpha);
      } else {
        g.lineStyle(2 * s, edgeColor, alpha * (cell.active ? 1 : 0.8));
      }
      if (isCircle) g.strokeCircle(cell.center.x, cell.center.y, half);
      else g.strokeRoundedRect(cell.center.x - half, cell.center.y - half, size, size, r);

      const texKey = cell.texture ? this.roles[cell.texture.role]?.texture?.key : undefined;
      if (cell.texture && texKey) {
        const key = `rack:${geom.id}:${cell.value}:img`;
        seenImg.add(key);
        let img = this.widgetImageCache.get(key);
        if (!img) {
          img = this.onWorld(this.add.image(0, 0, texKey));
          img.setDepth(DEPTH_WIDGETS + 0.05);
          this.widgetImageCache.set(key, img);
        }
        img.setTexture(texKey);
        img.setDisplaySize(size * 0.78, size * 0.78);
        img.setPosition(cell.center.x, cell.center.y);
        img.setAlpha(alpha);
        if (cell.texture.tint !== undefined) img.setTint(cell.texture.tint);
        else img.clearTint();
        img.setVisible(true);
      } else {
        const iconKey = `rack:${geom.id}:${cell.value}:icon`;
        seenText.add(iconKey);
        const iconText = this.widgetText(iconKey, cell.icon, 18, '#ffffff', true);
        iconText.setAlpha(alpha);
        iconText.setScale(s * activeScale * pop);
        iconText.setPosition(cell.center.x, cell.center.y);
      }

      if (geom.labels === 'active' && cell.active && this.labelsVisible) {
        const labelKey = `rack:${geom.id}:${cell.value}:label`;
        seenText.add(labelKey);
        const text = this.widgetText(labelKey, cell.label, 16, '#ffffff', true);
        text.setAlpha(alpha);
        const padX = 8 * s;
        const padY = 6 * s;
        const w = text.displayWidth + padX * 2;
        const h = text.displayHeight + padY * 2;
        const pos = geom.vertical
          ? { x: cell.center.x - half - 10 * s - w / 2, y: cell.center.y }
          : { x: cell.center.x, y: cell.center.y + half + 10 * s + h / 2 };
        g.fillStyle(INK, alpha);
        g.fillRoundedRect(pos.x - w / 2, pos.y - h / 2, w, h, 8 * s);
        text.setPosition(pos.x, pos.y);
      }
    }
  }

  private drawLeverWidget(geom: LeverGeom, seenText: Set<string>): void {
    const g = this.widgetGfx;
    const s = this.pxScale;
    const locked = geom.locked;
    const alpha = locked ? 0.45 : 1;
    const accent = locked ? MUTED : geom.color ?? ACTIVE;
    const edgeColor = locked ? MUTED : EDGE;
    const dragging = this.widgetDrag?.id === geom.id && this.widgetDrag.kind === 'lever';
    const pop = this.popFor(geom.id);
    const horizontal = Math.abs(geom.tip.y - geom.base.y) < 1e-6;
    const along = horizontal ? geom.knobW : geom.knobH;

    if (geom.tether) {
      g.lineStyle(8 * s, edgeColor, alpha);
      g.beginPath();
      g.moveTo(geom.base.x, geom.base.y);
      g.lineTo(geom.tether.x, geom.tether.y);
      g.strokePath();
      // Phaser Graphics has no round line-cap option; fake one with filled circles at both ends.
      g.fillStyle(edgeColor, alpha);
      g.fillCircle(geom.base.x, geom.base.y, 4 * s);
      g.fillCircle(geom.tether.x, geom.tether.y, 10 * s);
    }

    const trackR = 11 * s;
    let tx0: number, ty0: number, tw: number, th: number;
    if (horizontal) {
      tx0 = Math.min(geom.base.x, geom.tip.x) - along / 2;
      tw = Math.abs(geom.tip.x - geom.base.x) + along;
      ty0 = geom.base.y - geom.trackW / 2;
      th = geom.trackW;
    } else {
      tx0 = geom.base.x - geom.trackW / 2;
      tw = geom.trackW;
      ty0 = Math.min(geom.base.y, geom.tip.y) - along / 2;
      th = Math.abs(geom.tip.y - geom.base.y) + along;
    }
    this.shadowRoundedRect(tx0 + tw / 2, ty0 + th / 2, tw, th, trackR);
    g.fillStyle(INK, alpha);
    g.fillRoundedRect(tx0, ty0, tw, th, trackR);
    g.lineStyle(2 * s, edgeColor, alpha);
    g.strokeRoundedRect(tx0, ty0, tw, th, trackR);

    if (!locked) {
      g.fillStyle(accent, 1);
      if (horizontal) {
        const fx0 = Math.min(geom.base.x, geom.knob.x);
        const fw = Math.max(1, Math.abs(geom.knob.x - geom.base.x));
        g.fillRoundedRect(fx0, geom.base.y - geom.trackW / 2, fw, geom.trackW, trackR);
      } else {
        const fy0 = Math.min(geom.base.y, geom.knob.y);
        const fh = Math.max(1, Math.abs(geom.knob.y - geom.base.y));
        g.fillRoundedRect(geom.base.x - geom.trackW / 2, fy0, geom.trackW, fh, trackR);
      }
    }

    for (let i = 1; i < geom.notches.length - 1; i++) {
      const p = geom.notches[i]!;
      g.fillStyle(MUTED, alpha);
      if (horizontal) g.fillRect(p.x - 1.5 * s, p.y - 7 * s, 3 * s, 14 * s);
      else g.fillRect(p.x - 7 * s, p.y - 1.5 * s, 14 * s, 3 * s);
    }

    if (geom.icon) {
      const chipR = 15 * s;
      const chipCenter = horizontal
        ? { x: geom.tip.x + 26 * s + chipR, y: geom.tip.y }
        : { x: geom.tip.x, y: geom.tip.y - 26 * s - chipR };
      this.shadowCircle(chipCenter.x, chipCenter.y, chipR);
      g.fillStyle(CARD, alpha);
      g.fillCircle(chipCenter.x, chipCenter.y, chipR);
      g.lineStyle(2 * s, edgeColor, alpha);
      g.strokeCircle(chipCenter.x, chipCenter.y, chipR);
      const key = `lever:${geom.id}:icon`;
      seenText.add(key);
      const text = this.widgetText(key, geom.icon, 18, '#ffffff', true);
      text.setAlpha(alpha);
      text.setPosition(chipCenter.x, chipCenter.y);
    }

    const knobScale = (dragging ? 1.06 : 1) * pop;
    const knobW = geom.knobW * knobScale;
    const knobH = geom.knobH * knobScale;
    this.shadowRoundedRect(geom.knob.x, geom.knob.y, knobW, knobH, 12 * s);
    g.fillStyle(KNOB_COLOR, alpha);
    g.fillRoundedRect(geom.knob.x - knobW / 2, geom.knob.y - knobH / 2, knobW, knobH, 12 * s);
    g.lineStyle((dragging ? 4 : 3) * s, accent, alpha);
    g.strokeRoundedRect(geom.knob.x - knobW / 2, geom.knob.y - knobH / 2, knobW, knobH, 12 * s);
    g.lineStyle(2 * s, MUTED, alpha);
    for (const frac of [-0.25, 0, 0.25]) {
      if (horizontal) {
        const x = geom.knob.x + frac * knobW * 0.6;
        g.beginPath();
        g.moveTo(x, geom.knob.y - knobH * 0.3);
        g.lineTo(x, geom.knob.y + knobH * 0.3);
        g.strokePath();
      } else {
        const y = geom.knob.y + frac * knobH * 0.6;
        g.beginPath();
        g.moveTo(geom.knob.x - knobW * 0.3, y);
        g.lineTo(geom.knob.x + knobW * 0.3, y);
        g.strokePath();
      }
    }

    if (geom.showValue && this.labelsVisible) {
      const opt = geom.options.find((o) => o.value === geom.value);
      if (opt) {
        const key = `lever:${geom.id}:value`;
        seenText.add(key);
        const text = this.widgetText(key, opt.label, 16, '#ffffff', true);
        text.setAlpha(alpha);
        const padX = 8 * s;
        const padY = 6 * s;
        const w = text.displayWidth + padX * 2;
        const h = text.displayHeight + padY * 2;
        const pos = horizontal
          ? { x: geom.knob.x, y: geom.knob.y - knobH / 2 - 10 * s - h / 2 }
          : { x: geom.knob.x + knobW / 2 + 10 * s + w / 2, y: geom.knob.y };
        g.fillStyle(INK, alpha);
        g.fillRoundedRect(pos.x - w / 2, pos.y - h / 2, w, h, 8 * s);
        text.setPosition(pos.x, pos.y);
      }
    }
  }

  private drawCycleWidget(geom: CycleGeom, seenText: Set<string>, seenImg: Set<string>): void {
    const g = this.widgetGfx;
    const s = this.pxScale;
    const locked = geom.locked;
    const alpha = locked ? 0.45 : 1;
    const accent = locked ? MUTED : geom.color ?? ACTIVE;
    const pop = this.popFor(geom.id);
    const size = geom.size * pop;
    const half = size / 2;
    const rawSize = geom.size / s;

    if (geom.style === 'card') {
      const r = this.cornerRadius(geom.size);
      this.shadowRoundedRect(geom.center.x, geom.center.y, size, size, r);
      g.fillStyle(CARD, alpha);
      g.fillRoundedRect(geom.center.x - half, geom.center.y - half, size, size, r);
      g.lineStyle(3 * s, accent, alpha);
      g.strokeRoundedRect(geom.center.x - half, geom.center.y - half, size, size, r);
    } else {
      // Phaser has no dashed-stroke primitive; approximate a rotating 6-on/6-off dash by
      // stroking short arcs with gaps between them.
      const dashLen = 6 * s;
      const gapLen = 6 * s;
      const period = dashLen + gapLen;
      const circumference = 2 * Math.PI * half;
      const rot = locked ? 0 : (this.nowMs / 1000) * 12 * (Math.PI / 180);
      const count = Math.max(1, Math.floor(circumference / period));
      g.lineStyle(5 * s, accent, alpha);
      for (let i = 0; i < count; i++) {
        const a0 = rot + (i * period) / half;
        const a1 = a0 + dashLen / half;
        g.beginPath();
        g.arc(geom.center.x, geom.center.y, half, a0, a1, false);
        g.strokePath();
      }
    }

    const texKey = geom.texture ? this.roles[geom.texture.role]?.texture?.key : undefined;
    if (geom.texture && texKey) {
      const key = `cycle:${geom.id}:img`;
      seenImg.add(key);
      let img = this.widgetImageCache.get(key);
      if (!img) {
        img = this.onWorld(this.add.image(0, 0, texKey));
        img.setDepth(DEPTH_WIDGETS + 0.05);
        this.widgetImageCache.set(key, img);
      }
      img.setTexture(texKey);
      img.setDisplaySize(size * 0.7, size * 0.7);
      img.setPosition(geom.center.x, geom.center.y);
      img.setAlpha(alpha);
      if (geom.texture.tint !== undefined) img.setTint(geom.texture.tint);
      else img.clearTint();
      img.setVisible(true);
    } else if (geom.style === 'card') {
      const key = `cycle:${geom.id}:icon`;
      seenText.add(key);
      const text = this.widgetText(key, geom.icon, Math.round(0.42 * rawSize), '#ffffff', true);
      text.setAlpha(alpha);
      text.setScale(s * pop);
      text.setPosition(geom.center.x, geom.center.y);
    } else {
      const chipR = 15 * s;
      const chipAngle = -Math.PI / 4; // "up-right" at 45deg; stage y is down.
      const chipCenter = {
        x: geom.center.x + half * Math.cos(chipAngle),
        y: geom.center.y + half * Math.sin(chipAngle),
      };
      g.fillStyle(INK, alpha);
      g.fillCircle(chipCenter.x, chipCenter.y, chipR);
      const key = `cycle:${geom.id}:icon`;
      seenText.add(key);
      const text = this.widgetText(key, geom.icon, 18, '#ffffff', true);
      text.setAlpha(alpha);
      text.setPosition(chipCenter.x, chipCenter.y);
    }

    if (geom.style === 'card') {
      const badgeR = 10 * s;
      const bx = geom.center.x + half - badgeR * 0.6;
      const by = geom.center.y - half + badgeR * 0.6;
      g.fillStyle(INK, alpha);
      g.fillCircle(bx, by, badgeR);
      g.lineStyle(2 * s, accent, alpha);
      g.strokeCircle(bx, by, badgeR);
      const key = `cycle:${geom.id}:badge`;
      seenText.add(key);
      const text = this.widgetText(key, '↻', 14, '#ffffff', true);
      text.setAlpha(alpha);
      text.setPosition(bx, by);
    }

    for (const dot of geom.dots) {
      if (dot.active) {
        g.fillStyle(accent, alpha);
        g.fillCircle(dot.center.x, dot.center.y, dot.r);
      } else {
        g.fillStyle(EDGE, alpha);
        g.fillCircle(dot.center.x, dot.center.y, dot.r);
        g.lineStyle(1 * s, MUTED, alpha);
        g.strokeCircle(dot.center.x, dot.center.y, dot.r);
      }
    }

    if (geom.valueLabel && this.labelsVisible) {
      const key = `cycle:${geom.id}:value`;
      seenText.add(key);
      const text = this.widgetText(key, geom.valueLabel, 16, '#ffffff', true);
      text.setAlpha(alpha);
      const padX = 8 * s;
      const padY = 6 * s;
      const w = text.displayWidth + padX * 2;
      const h = text.displayHeight + padY * 2;
      const lastDot = geom.dots[geom.dots.length - 1];
      const topY = lastDot ? lastDot.center.y + lastDot.r + 10 * s : geom.center.y + half + 10 * s;
      g.fillStyle(INK, alpha);
      g.fillRoundedRect(geom.center.x - w / 2, topY, w, h, 8 * s);
      text.setPosition(geom.center.x, topY + h / 2);
    }
  }

  private drawPullWidget(geom: PullGeom, seenText: Set<string>): void {
    const g = this.widgetGfx;
    const s = this.pxScale;
    const locked = geom.locked;
    const alpha = locked ? 0.45 : 1;
    const accent = locked ? MUTED : ACTIVE;
    const dragging = this.widgetDrag?.id === geom.id && this.widgetDrag.kind === 'pull';
    const spring = this.widgetSpring.get(geom.id);
    let t = 0;
    if (dragging) {
      t = this.widgetDragT;
    } else if (spring) {
      const p = Math.min(1, (this.nowMs - spring.start) / WIDGET_SPRING_MS);
      t = spring.from * (1 - p);
      if (p >= 1) this.widgetSpring.delete(geom.id);
    }
    const released = t >= geom.threshold;
    // 1.2 Hz pulse, -1..1.
    const pulse = Math.sin((this.nowMs / 1000) * 2 * Math.PI * 1.2);

    const dx = geom.to.x - geom.at.x;
    const dy = geom.to.y - geom.at.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    // Dashed path: Phaser Graphics has no dash primitive, so it's stroked as short segments.
    const dash = 6 * s;
    g.lineStyle(3 * s, COLORS.white, alpha * 0.5);
    const steps = Math.floor(len / (dash * 2));
    for (let i = 0; i < steps; i++) {
      const t0 = (i * dash * 2) / len;
      const t1 = Math.min(1, (i * dash * 2 + dash) / len);
      g.beginPath();
      g.moveTo(geom.at.x + dx * t0, geom.at.y + dy * t0);
      g.lineTo(geom.at.x + dx * t1, geom.at.y + dy * t1);
      g.strokePath();
    }

    const hx = geom.at.x + dx * t;
    const hy = geom.at.y + dy * t;

    if (geom.arrow) {
      const arrowAlpha = (0.55 + 0.225 * (pulse + 1)) * alpha;
      const midX = (hx + geom.to.x) / 2 - uy * 20 * s;
      const midY = (hy + geom.to.y) / 2 + ux * 20 * s;
      g.lineStyle(4 * s, COLORS.white, arrowAlpha);
      g.beginPath();
      g.moveTo(hx, hy);
      const segs = 16;
      for (let i = 1; i <= segs; i++) {
        const tt = i / segs;
        const qx = (1 - tt) * (1 - tt) * hx + 2 * (1 - tt) * tt * midX + tt * tt * geom.to.x;
        const qy = (1 - tt) * (1 - tt) * hy + 2 * (1 - tt) * tt * midY + tt * tt * geom.to.y;
        g.lineTo(qx, qy);
      }
      g.strokePath();
      const tanX = geom.to.x - midX;
      const tanY = geom.to.y - midY;
      const tanLen = Math.hypot(tanX, tanY) || 1;
      const hux = tanX / tanLen;
      const huy = tanY / tanLen;
      const headLen = 14 * s;
      const perpX = -huy;
      const perpY = hux;
      const backX = geom.to.x - hux * headLen;
      const backY = geom.to.y - huy * headLen;
      g.fillStyle(COLORS.white, arrowAlpha);
      pathFrom(g, [
        { x: geom.to.x, y: geom.to.y },
        { x: backX + perpX * headLen * 0.5, y: backY + perpY * headLen * 0.5 },
        { x: backX - perpX * headLen * 0.5, y: backY - perpY * headLen * 0.5 },
      ]);
      g.fillPath();
    }

    if (geom.ring) {
      const r = geom.handleSize / 2;
      // No icon => a hollow ring: the thing it surrounds (the loaded fuzz) stays visible.
      if (geom.icon) {
        this.shadowCircle(hx, hy, r);
        g.fillStyle(INK, alpha);
        g.fillCircle(hx, hy, r);
      }
      const solid = released && !locked;
      const ringColor = locked ? MUTED : solid ? 0xc8ffc0 : GO;
      g.lineStyle(6 * s, ringColor, alpha);
      g.strokeCircle(hx, hy, r);
      const outerBase = r + 8 * s;
      const outerFactor = 1 + 0.06 * (pulse + 1); // 1.0 .. 1.12
      g.lineStyle(3 * s, ringColor, alpha * (solid ? 0.5 : 0.25));
      g.strokeCircle(hx, hy, outerBase * (locked ? 1 : outerFactor));
      if (geom.icon) {
        const key = `pull:${geom.id}:icon`;
        seenText.add(key);
        const text = this.widgetText(key, geom.icon, 26, '#ffffff', true);
        text.setAlpha(alpha);
        text.setPosition(hx, hy);
      }
    } else {
      this.shadowCircle(hx, hy, geom.handleSize / 2);
      g.fillStyle(accent, alpha);
      g.fillCircle(hx, hy, geom.handleSize / 2);
      if (geom.icon) {
        const key = `pull:${geom.id}:icon`;
        seenText.add(key);
        const text = this.widgetText(key, geom.icon, 18, '#ffffff', true);
        text.setAlpha(alpha);
        text.setPosition(hx, hy);
      }
    }

    const labelStr = released ? geom.releaseLabel ?? 'LET GO!' : geom.label;
    if (labelStr && this.labelsVisible) {
      const key = `pull:${geom.id}:label`;
      seenText.add(key);
      const color = released && !locked ? '#61bb46' : '#ffffff';
      const text = this.widgetText(key, labelStr, 18, color, true, true);
      text.setAlpha(alpha);
      const padX = 10 * s;
      const padY = 8 * s;
      const w = text.displayWidth + padX * 2;
      const h = text.displayHeight + padY * 2;
      const px = geom.to.x + ux * 14 * s;
      const py = geom.to.y + uy * 14 * s;
      g.fillStyle(INK, alpha);
      g.fillRoundedRect(px - w / 2, py - h / 2, w, h, 8 * s);
      text.setPosition(px, py);
    }
  }

  /** Flies each in-flight tap/cycle/rack hopTo copy from `from` to `to` with a small upward arc
   * over WIDGET_HOP_MS, then drops it. */
  private drawWidgetHops(seenText: Set<string>, seenImg: Set<string>): void {
    const s = this.pxScale;
    const remaining: WidgetHop[] = [];
    for (const hop of this.widgetHops) {
      const p = Math.min(1, (this.nowMs - hop.start) / WIDGET_HOP_MS);
      const x = hop.from.x + (hop.to.x - hop.from.x) * p;
      const y = hop.from.y + (hop.to.y - hop.from.y) * p - Math.sin(p * Math.PI) * 20 * s;
      const key = `hop:${hop.id}`;
      if (hop.textureKey) {
        seenImg.add(key);
        let img = this.widgetImageCache.get(key);
        if (!img) {
          img = this.onWorld(this.add.image(0, 0, hop.textureKey));
          img.setDepth(DEPTH_WIDGETS + 0.1);
          this.widgetImageCache.set(key, img);
        }
        img.setTexture(hop.textureKey);
        if (hop.tint !== undefined) img.setTint(hop.tint);
        else img.clearTint();
        img.setDisplaySize(28 * s, 28 * s);
        img.setPosition(x, y);
        img.setVisible(true);
      } else if (hop.icon) {
        seenText.add(key);
        const text = this.widgetText(key, hop.icon, 20, '#ffffff', true);
        text.setPosition(x, y);
      }
      if (p < 1) remaining.push(hop);
    }
    this.widgetHops = remaining;
  }

  // ---------------- gestures ----------------

  /** `sx/sy`: the pointer in world-camera (panel px) space; `px` its canvas-px x. Inside the
   * world's own extent (the panel, for a single-screen world). A wide world also requires the
   * pointer to be inside the camera's viewport horizontally: past the panel's right edge the
   * camera still maps the pointer onto world that merely is not shown there. */
  private insidePanel(sx: number, sy: number, px: number): boolean {
    if (!(sx >= this.panelX0 && sx <= this.worldX1 && sy >= this.panelY0 && sy <= this.panelY1)) return false;
    if (!this.wide) return true;
    return px >= this.worldCam.x && px <= this.worldCam.x + this.worldCam.width;
  }

  /** Last match wins (topmost), expanded by HIT_MARGIN so thin parts are easy to grab. A part
   * with `hitSegment` is hit by point-to-segment distance instead of its AABB. */
  /** Point-like parts (bounds) win over segment parts (rods): a rod passes through the very
   * points it connects, so a tap at a joint must select the joint, not the rod. Within each
   * group the last match wins. */
  private hitTest(wx: number, wy: number): number | null {
    let hitPoint: number | null = null;
    let hitSegment: number | null = null;
    for (const { partId, bounds } of this.boundsList) {
      const seg = this.segmentByPart.get(partId);
      if (seg) {
        if (pointSegmentDistance({ x: wx, y: wy }, seg.a, seg.b) <= seg.r + HIT_MARGIN) hitSegment = partId;
        continue;
      }
      const x0 = bounds.x - bounds.w / 2 - HIT_MARGIN;
      const x1 = bounds.x + bounds.w / 2 + HIT_MARGIN;
      const y0 = bounds.y - bounds.h / 2 - HIT_MARGIN;
      const y1 = bounds.y + bounds.h / 2 + HIT_MARGIN;
      if (wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1) hitPoint = partId;
    }
    return hitPoint ?? hitSegment;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // A tap while the level's intro pan runs skips it (and does nothing else).
    if (this.introActive && pointer.isDown) {
      this.skipIntro();
      return;
    }
    if (!this.editable) return;
    if (!pointer.isDown) return;
    if (this.activePointerId !== null) return; // primary pointer only

    // Two cameras means `pointer.worldX/worldY` (set from whichever camera last hit-tested the
    // pointer) is unreliable outside the panel; ask the world camera directly.
    const stage = this.worldCam.getWorldPoint(pointer.x, pointer.y);
    const sx = stage.x;
    const sy = stage.y;
    if (!this.insidePanel(sx, sy, pointer.x)) return;

    if (this.widgetGeoms.length > 0) {
      const hit = hitWidget(this.widgetGeoms, sx, sy);
      if (hit) {
        const geom = this.widgetGeoms.find((gm) => gm.id === hit.id);
        this.activePointerId = pointer.id;
        if (geom?.locked) {
          this.onWidgetBlocked?.(hit.id);
          return;
        }
        if (geom?.kind === 'dial' || geom?.kind === 'pull' || geom?.kind === 'lever') {
          this.widgetDrag = { id: hit.id, kind: geom.kind };
          this.widgetDragT = 0;
          if (geom.kind === 'dial') {
            this.widgetDragValue = geom.value;
            this.widgetDragAngle = geom.handleAngle;
          } else if (geom.kind === 'lever') {
            // A plain tap on the track therefore jumps straight to the nearest notch.
            this.widgetDragValue = leverPointToValue(geom, sx, sy);
            this.widgetDragAngle = 0;
          } else {
            this.widgetDragValue = undefined;
            this.widgetDragAngle = 0;
          }
          return;
        }
        this.widgetTap = { id: hit.id, value: hit.value };
        return;
      }
    }

    const w = this.view.toWorld({ x: sx, y: sy });

    if (this.toolKind === 'link') {
      // A pointerdown anywhere inside the panel starts a link, not only on a part.
      this.activePointerId = pointer.id;
      this.linking = true;
      this.linkFrom = this.linkEndAt(w);
      this.linkStartWorld = w;
      this.linkCurrentWorld = w;
      this.linkMoved = false;
      return;
    }

    const partId = this.hitTest(w.x, w.y);
    const lockedHit = partId !== null && this.lockPositionParts.has(partId);

    this.activePointerId = pointer.id;
    this.gesture = { partId, startWorld: w, moved: false, lockedHit };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.editable) return;
    if (pointer.id !== this.activePointerId) return;

    const stage = this.worldCam.getWorldPoint(pointer.x, pointer.y);

    if (this.widgetDrag) {
      const geom = this.widgetGeoms.find((gm) => gm.id === this.widgetDrag!.id);
      if (geom?.kind === 'dial') {
        // World-axis angle (CCW, 0 = +x); stage y is flipped relative to world y-up.
        const angle = Math.atan2(geom.pivot.y - stage.y, stage.x - geom.pivot.x);
        const lo = Math.min(geom.arcFrom, geom.arcTo);
        const hi = Math.max(geom.arcFrom, geom.arcTo);
        this.widgetDragAngle = Math.max(lo, Math.min(hi, angle));
        const spec = this.widgetsById.get(geom.id);
        if (spec && spec.kind === 'dial') {
          const next = dialAngleToValue(spec, this.widgetDragAngle);
          const changed = next !== this.widgetDragValue;
          this.widgetDragValue = next;
          // `live`: commit every new notch as the knob snaps, so the machine part moves with the
          // finger; the final value still goes out on pointerup below.
          if (spec.live && changed) this.onWidgetAction?.(geom.id, next, true);
        }
      } else if (geom?.kind === 'pull') {
        const abx = geom.to.x - geom.at.x;
        const aby = geom.to.y - geom.at.y;
        const lenSq = abx * abx + aby * aby;
        const apx = stage.x - geom.at.x;
        const apy = stage.y - geom.at.y;
        const t = lenSq > 0 ? clamp((apx * abx + apy * aby) / lenSq, 0, 1) : 0;
        this.widgetDragT = t;
        this.onWidgetDrag?.(geom.id, t);
      } else if (geom?.kind === 'lever') {
        // The knob follows the snapped notch as the pointer moves.
        this.widgetDragValue = leverPointToValue(geom, stage.x, stage.y);
      }
      return;
    }

    if (this.linking) {
      const w = this.view.toWorld({ x: stage.x, y: stage.y });
      this.linkCurrentWorld = w;
      if (this.linkStartWorld) {
        const startPx = this.view.toPx(this.linkStartWorld);
        const dist = Math.hypot(stage.x - startPx.x, stage.y - startPx.y);
        if (dist > MOVE_THRESHOLD) this.linkMoved = true;
      }
      return;
    }

    if (!this.gesture) return;

    const sx = stage.x;
    const sy = stage.y;
    const startPx = this.view.toPx(this.gesture.startWorld);
    const dist = Math.hypot(sx - startPx.x, sy - startPx.y);
    if (dist > MOVE_THRESHOLD) this.gesture.moved = true;

    if (this.gesture.partId === null || this.gesture.lockedHit) return;
    // The 'place' tool never drags parts: a drag over a part is treated as a tap on pointerup.
    if (this.toolKind === 'place') return;

    const w = this.view.toWorld({ x: sx, y: sy });
    const dx = w.x - this.gesture.startWorld.x;
    const dy = w.y - this.gesture.startWorld.y;
    this.dragPartId = this.gesture.partId;
    this.dragOffset = this.clampDrag(this.gesture.partId, dx, dy);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;

    if (this.widgetDrag) {
      const drag = this.widgetDrag;
      this.widgetDrag = null;
      this.activePointerId = null;
      if (drag.kind === 'dial' || drag.kind === 'lever') {
        this.widgetPop.set(drag.id, this.nowMs);
        this.onWidgetAction?.(drag.id, this.widgetDragValue);
      } else {
        const spec = this.widgetsById.get(drag.id);
        const threshold = spec && spec.kind === 'pull' ? spec.threshold ?? 0.6 : 0.6;
        if (this.widgetDragT >= threshold) {
          this.onWidgetAction?.(drag.id, undefined);
        } else {
          this.widgetSpring.set(drag.id, { from: this.widgetDragT, start: this.nowMs });
        }
      }
      this.widgetDragT = 0;
      this.widgetDragAngle = 0;
      this.widgetDragValue = undefined;
      return;
    }

    if (this.widgetTap) {
      const tap = this.widgetTap;
      this.widgetTap = null;
      this.activePointerId = null;
      const spec = this.widgetsById.get(tap.id);
      const popKey = spec?.kind === 'rack' ? `${tap.id}:${tap.value}` : tap.id;
      this.widgetPop.set(popKey, this.nowMs);

      if (spec?.kind === 'tap' && spec.hopTo) {
        const geom = this.widgetGeoms.find((gm): gm is TapGeom => gm.id === tap.id && gm.kind === 'tap');
        if (geom?.hopTo) {
          this.widgetHops.push({
            id: tap.id,
            icon: spec.texture ? undefined : spec.icon,
            textureKey: spec.texture ? this.roles[spec.texture.role]?.texture?.key : undefined,
            tint: spec.texture?.tint,
            from: geom.center,
            to: geom.hopTo,
            start: this.nowMs,
          });
        }
      } else if (spec?.kind === 'cycle' && spec.hopTo) {
        const geom = this.widgetGeoms.find((gm): gm is CycleGeom => gm.id === tap.id && gm.kind === 'cycle');
        if (geom?.hopTo) {
          this.widgetHops.push({
            id: tap.id,
            icon: spec.texture ? undefined : geom.icon,
            textureKey: spec.texture ? this.roles[spec.texture.role]?.texture?.key : undefined,
            tint: spec.texture?.tint,
            from: geom.center,
            to: geom.hopTo,
            start: this.nowMs,
          });
        }
      } else if (spec?.kind === 'rack' && spec.hopTo) {
        const geom = this.widgetGeoms.find((gm): gm is RackGeom => gm.id === tap.id && gm.kind === 'rack');
        const cell = geom?.cells.find((c) => c.value === tap.value);
        if (geom?.hopTo && cell) {
          this.widgetHops.push({
            id: tap.id,
            icon: cell.texture ? undefined : cell.icon,
            textureKey: cell.texture ? this.roles[cell.texture.role]?.texture?.key : undefined,
            tint: cell.texture?.tint,
            from: cell.center,
            to: geom.hopTo,
            start: this.nowMs,
          });
        }
      }
      this.onWidgetAction?.(tap.id, tap.value);
      return;
    }

    if (this.linking) {
      const from = this.linkFrom;
      const moved = this.linkMoved;
      this.linking = false;
      this.linkFrom = null;
      this.linkStartWorld = null;
      this.linkCurrentWorld = null;
      this.linkMoved = false;
      this.activePointerId = null;
      if (!from || !moved) return; // a tap in link mode does nothing
      const stage = this.worldCam.getWorldPoint(pointer.x, pointer.y);
      const w = this.view.toWorld({ x: stage.x, y: stage.y });
      const to = this.linkEndAt(w);
      this.onLinkDrawn?.(from, to);
      return;
    }

    if (!this.gesture) {
      // A refused (locked) widget tap set the active pointer without a gesture: release it here,
      // or every later pointerdown would return early and the scene would go dead.
      this.activePointerId = null;
      return;
    }
    const g = this.gesture;

    if (this.toolKind === 'place') {
      if (g.partId === null) {
        if (!g.moved) this.onEmptyTapped?.(g.startWorld);
      } else {
        this.onPartTapped?.(g.partId);
      }
    } else if (g.partId === null) {
      if (!g.moved) this.onEmptyTapped?.(g.startWorld);
    } else if (g.lockedHit || !g.moved) {
      this.onPartTapped?.(g.partId);
    } else {
      this.onPartMoved?.(g.partId, this.dragOffset.x, this.dragOffset.y);
    }

    this.gesture = null;
    this.activePointerId = null;
    this.dragPartId = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  /** Clamps a candidate world-meter drag delta so the part's bounds stay inside its region when
   * one exists, otherwise inside the world. */
  private clampDrag(partId: number, dx: number, dy: number): Vec2 {
    const b = this.boundsByPart.get(partId);
    if (!b) return { x: dx, y: dy };
    const region = this.regionByPart.get(partId);
    if (region) {
      const minDx = region.x - region.w / 2 - (b.x - b.w / 2);
      const maxDx = region.x + region.w / 2 - (b.x + b.w / 2);
      const minDy = region.y - region.h / 2 - (b.y - b.h / 2);
      const maxDy = region.y + region.h / 2 - (b.y + b.h / 2);
      return { x: clamp(dx, minDx, maxDx), y: clamp(dy, minDy, maxDy) };
    }
    const minDx = -(b.x - b.w / 2);
    const maxDx = this.world.worldW - (b.x + b.w / 2);
    const minDy = -(b.y - b.h / 2);
    // The visible top is worldH - groundDepth; a part still never drags below world y = 0.
    const maxDy = this.world.worldH - (this.world.groundDepth ?? 0) - (b.y + b.h / 2);
    return { x: clamp(dx, minDx, maxDx), y: clamp(dy, minDy, maxDy) };
  }
}
