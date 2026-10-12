import Phaser from 'phaser';
import { COLORS, ORIGIN_X, GROUND_Y, PANEL_TOP_Y, PPM, WORLD_W, WORLD_H, STAGE_W, STAGE_H, RENDER_SCALE, toPx, toWorld } from './view';
import type { Vec2, Track, CartSnapshot, TrackPoint, PointKind, FinishZone, EditTool } from '../core/types';
import { insertionIndex, clonePoints, LOOP_RADIUS } from '../core/trackPoints';
import { BrunoStage } from '../ui/brunoStage';
import type { FrameState } from '../kit/camera';
import { DEFAULT_SKIN, FUZZ_SKINS, SKIN_CANVAS_K, excitedPose, type SkinId } from './skins';
import { FULL_FRAME, RIDE_ZOOM, frameCentrePx, parallaxOffset, rideTarget, stepCamera } from './rideCamera';

interface Gesture {
  index: number;
  startPx: Vec2;
  moved: boolean;
  isNew: boolean;
}

const WORLD_X0 = ORIGIN_X;
const WORLD_X1 = ORIGIN_X + WORLD_W * PPM;
const WORLD_Y0 = PANEL_TOP_Y; // GROUND_Y - WORLD_H * PPM: stage y 78
const WORLD_Y1 = GROUND_Y;

/** Points stay this far (m) inside the world's edges. A loop point is the loop's bottom and the
 * loop rises 2 radii above it, so its point stops lower: the whole loop stays in the sky
 * (2026-10-07: with the 38.25 m world a loop point may sit at 29.75 m, still above the 29.5 m
 * every point had in the 30 m world, and the loop no longer leaves the picture at the top). */
const EDGE = 0.5;
const POINT_X_MAX = WORLD_W - EDGE;
const POINT_Y_MAX = WORLD_H - EDGE;
const LOOP_Y_MAX = WORLD_H - EDGE - 2 * LOOP_RADIUS;

const HIT_RADIUS = 20;
const MOVE_THRESHOLD = 6;
const MIN_POINT_GAP = 0.3;
const UNDO_CAP = 50;

// depth layering, back to front
const DEPTH_SKY = 0;
// 2026-10-12: the theme-park backdrop between the sky and the ground strip (createBackdrop)
const DEPTH_CLOUDS = 0.1;
const DEPTH_FAR = 0.2;
const DEPTH_WHEEL = 0.3;
const DEPTH_MID = 0.4;
const DEPTH_GROUND = 1;
const DEPTH_SUPPORT = 1.5; // posts + ties
const DEPTH_TRACK = 2; // rail outline/rail/highlight
const DEPTH_POINTS = 3; // station house + control point handles + finish flag
const DEPTH_FUZZ = 4;
/** The fuzz waiting in the station (edit mode): under the control-point handles, so the station
 * handle stays on top and draggable-looking. */
const DEPTH_STATION_FUZZ = 2.9;
const DEPTH_CONFETTI = 4.5;

// world panel: a single rounded sky/ground panel, x 32..992, y 78..700 (2026-10-07: was 210..700;
// the top follows WORLD_H, view.ts)
const PANEL_X0 = 32;
const PANEL_Y0 = WORLD_Y0;
const PANEL_X1 = 992;
const PANEL_Y1 = 700;
const PANEL_RADIUS = 12;

/* 2026-10-12 (Gao: "make the background more engaging"): a theme park instead of the plain blue
   gradient. Layers composed from the Kodable Marketing Library into public/bg/coaster/ at 2x stage
   px (README "Fuzz Rollercoaster"), back to front: the sky (HighFlyer sky clouds over a deep-to-pale
   gradient), drifting clouds, two hazy hill ranges with a tree line, a turning ferris wheel (drawn
   here: the library has none), a row of trees (softened a little toward the horizon colour so the
   track stays the boldest thing on screen) and a grass strip at the ground line. Later the same day
   (Gao: "wayyy too many decorations in the back. keep the trees and the ferris wheel and clouds, get
   rid of everything else") the blimp, the hot-air balloon and the fairground props went. While the ride camera
   moves, each layer lags it by its depth factor (parallaxOffset); the ground-standing layers only
   across, so nothing sinks into the grass. Static pictures, no tweens: the clouds and the wheel
   are moved by hand once a frame (a handful of setPosition calls). */
const BG_DIR = 'bg/coaster/';
/** Parallax depth factors, across (x) and up/down (y): 1 moves with the track, 0 stays put. */
const PX_SKY = { x: 0.15, y: 0.15 };
const PX_FLYERS = { x: 0.3, y: 0.3 };
const PX_FAR = { x: 0.35, y: 1 };
const PX_WHEEL = { x: 0.55, y: 1 };
const PX_MID = { x: 0.75, y: 1 };
/** Band heights (stage px) of the bottom-anchored layers; each ends at the panel's bottom. */
const FAR_H = 300;
const MID_H = 230;
const GROUND_STRIP_H = 30;
/** The ferris wheel, between the trees. */
const WHEEL_X = 604;
const WHEEL_Y = 586;
const WHEEL_R = 84;
const WHEEL_CARS = 10;
const WHEEL_SPEED = 0.12; // rad/s: a calm turn
/** The horizon colour the fairground is hazed toward (by 0.22 in the compose step). The wheel stands
 * further back (and loops often pass in front of it), so it gets more haze: a loop never reads as a
 * second wheel. */
const HAZE_COLOR = 0xc4e2f8;
const WHEEL_HAZE_K = 0.42;

/** Screen-space radius of the rolling fuzz (2026-10-12: 14, was 11 — Jon and Greg asked for a
 * bigger fuzz). Cosmetic: the sim rides a point on the rail; this only offsets the drawn ball. */
const FUZZ_R_PX = 14;
const FUZZ_R = FUZZ_R_PX / PPM; // world-space radius, meters
/** The fur reaches a little past the rolling radius (it overlaps the rail by a hair, as before). */
const FUZZ_FUR = 1.12;
/** Display size of a skin picture: the body (2 R x fur) is 1 / SKIN_CANVAS_K of its canvas. */
const FUZZ_IMG_PX = FUZZ_R_PX * 2 * FUZZ_FUR * SKIN_CANVAS_K;

const TRACK_DARK_RED = 0x8c1f18;
const TRACK_RED = 0xe0392f;
const TRACK_HIGHLIGHT = 0xff8a7a;
const TIE_COLOR = 0xf7e7c6;
const POST_COLOR = 0x4a5680;
const STATION_DECK = 0xc98a4b;
const STATION_DECK_EDGE = 0xe2a865;
const STATION_ROOF = 0xffb40f;
const STATION_STRIPE = 0xf7e7c6;
const STATION_POST = 0x3a4470;
const HAIR_COLOR = 0xdb8b0a;
const PUPIL_COLOR = 0x1f2430;

const LOCKED_COLOR = 0x3a4470;
const FLAG_DARK = 0x1f2430;

// station point ring pulse: radius oscillates 13..15 px, cheap because a redraw is only
// requested when the rounded radius actually changes (a handful of times per pulse cycle),
// and only while editable (the ring is invisible in play mode anyway).
const STATION_RING_MIN = 13;
const STATION_RING_MAX = 15;
const STATION_RING_PERIOD_MS = 1400;

/** Blends a 0xRRGGBB colour toward the horizon haze (the ferris wheel's colours). */
function hazed(c: number, k = WHEEL_HAZE_K): number {
  const ch = (shift: number): number => {
    const a = (c >> shift) & 0xff;
    const b = (HAZE_COLOR >> shift) & 0xff;
    return Math.round(a + (b - a) * k) & 0xff;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A backdrop object and the stage position it sits at in the full view (before parallax). */
interface BackdropPiece {
  obj: Phaser.GameObjects.Components.Transform;
  x: number;
  y: number;
  px: { x: number; y: number };
}

/** A sky drifter (a cloud): its full-view x advances at `speed` px/s and wraps. */
interface Drifter {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  speed: number;
  bob: number; // bob amplitude, px (0 = none)
  phase: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class CoasterScene extends Phaser.Scene {
  onPointsChanged?: (pts: TrackPoint[]) => void;
  onUpdate?: (deltaMs: number) => void;

  private points: TrackPoint[] = [];
  private undoStack: TrackPoint[][] = [];
  private editable = true;
  private tool: EditTool = 'point';
  private track: Track | null = null;

  private finish: FinishZone | null = null;
  private finishReached = false;

  private trackDirty = false;
  private pointsDirty = false;
  private finishDirty = false;

  private gesture: Gesture | null = null;
  private gestureBefore: TrackPoint[] | null = null;
  private activePointerId: number | null = null;

  private supportGfx!: Phaser.GameObjects.Graphics;
  private trackGfx!: Phaser.GameObjects.Graphics;
  private pointsGfx!: Phaser.GameObjects.Graphics;
  private finishGfx!: Phaser.GameObjects.Graphics;

  private stationRingR = STATION_RING_MIN;

  private fuzz!: Phaser.GameObjects.Container;
  private fuzzBody!: Phaser.GameObjects.Image;
  private fuzzSpin!: Phaser.GameObjects.Container;
  private fuzzFellStarted = false;
  /** The riding fuzz's velocity (world m/s) for the camera's look-ahead; zero once the run ends. */
  private fuzzVel: Vec2 = { x: 0, y: 0 };

  // 2026-10-12: fuzz skins (skins.ts). The picked fuzz waits in the station in edit mode and rides
  // in play mode, with its excited face while fast or airborne.
  private skin: SkinId = DEFAULT_SKIN;
  private excited = false;
  private stationFuzz!: Phaser.GameObjects.Image;

  // 2026-10-12: two cameras, like the builder kit (src/kit/BuilderScene.ts). The world camera is
  // clipped to the world panel and zooms in to follow the fuzz in play mode (rideCamera.ts); the UI
  // camera always shows the whole stage at RENDER_SCALE, for Bruno and the panel's corner caps.
  private worldCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private camCur: FrameState = { ...FULL_FRAME };
  private camFollow = false;
  /** Scene time (ms) at which a pending follow release happens (the end-of-ride hold), or null. */
  private camReleaseAt: number | null = null;
  private nowMs = 0;

  private backdrop: BackdropPiece[] = [];
  private drifters: Drifter[] = [];
  private wheel!: Phaser.GameObjects.Graphics;
  private wheelCars: Phaser.GameObjects.Graphics[] = [];
  private wheelAngle = 0;

  /** Bruno's modal dialog on the canvas: the dim and the big Bruno (src/ui/brunoStage.ts). */
  private brunoStage!: BrunoStage;

  constructor() {
    super('coaster');
  }

  preload(): void {
    // Loader failures (missing/renamed files) surface as a synchronous throw
    // from `this.add.spine(...)` in create(), which we catch there so the
    // rest of the scene keeps working without Bruno (src/ui/brunoStage.ts).
    this.load.spineAtlas('floofs', 'spine/FloofFamily01.atlas', true);
    this.load.spineJson('engineer', 'spine/Engineer_skeleton.json');
    for (const s of FUZZ_SKINS) {
      this.load.image(`skin-${s.id}`, s.normal);
      this.load.image(`skin-${s.id}-excited`, s.excited);
    }
    this.load.image('cb-sky', `${BG_DIR}sky.jpg`);
    for (const k of ['far', 'mid', 'ground', 'cloud1', 'cloud2', 'cloud3']) {
      this.load.image(`cb-${k}`, `${BG_DIR}${k}.png`);
    }
  }

  create(): void {
    // High-DPI + ride camera: the canvas is RENDER_SCALE times the stage. The world camera's
    // viewport is clipped to the world panel (in canvas px) and zooms by RENDER_SCALE x the frame's
    // zoom, so stage coordinates (1024x768) stay valid for every game object and for the HTML HUD,
    // and a zoomed-in ride never spills over the top or bottom bar. The UI camera shows the whole
    // stage at RENDER_SCALE only (Bruno, the corner caps). Taps map through the world camera
    // (stagePoint), never pointer.worldX/worldY, which follow whichever camera hit-tested last.
    const RS = RENDER_SCALE;
    this.worldCam = this.cameras.main;
    this.worldCam.setViewport(PANEL_X0 * RS, PANEL_Y0 * RS, (PANEL_X1 - PANEL_X0) * RS, (PANEL_Y1 - PANEL_Y0) * RS);
    this.uiCam = this.cameras.add(0, 0, STAGE_W * RS, STAGE_H * RS, false, 'ui');
    this.uiCam.setZoom(RS);
    this.uiCam.centerOn(STAGE_W / 2, STAGE_H / 2);
    this.uiCam.inputEnabled = false;
    this.camCur = { ...FULL_FRAME };
    this.applyCamera();

    this.createBackdrop();
    this.createCornerCaps();

    this.supportGfx = this.onWorld(this.add.graphics());
    this.supportGfx.setDepth(DEPTH_SUPPORT);

    this.trackGfx = this.onWorld(this.add.graphics());
    this.trackGfx.setDepth(DEPTH_TRACK);

    this.pointsGfx = this.onWorld(this.add.graphics());
    this.pointsGfx.setDepth(DEPTH_POINTS);

    this.finishGfx = this.onWorld(this.add.graphics());
    this.finishGfx.setDepth(DEPTH_POINTS);

    this.createFuzz();
    // 2026-10-12: Bruno left the top bar; he slides in over a dimmed stage when he talks.
    this.brunoStage = new BrunoStage(this, (o) => this.onUi(o), 'CoasterScene');

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);

    this.trackDirty = true;
    this.pointsDirty = true;
    this.finishDirty = true;
  }

  override update(time: number, delta: number): void {
    this.nowMs = time;
    // The app steps the sim and draws the fuzz inside onUpdate; the camera follows after that so it
    // frames this frame's fuzz, not last frame's (the kit learned that the hard way: a one-frame lag
    // jitters everything it follows).
    this.onUpdate?.(delta);
    this.updateCamera(delta);
    this.updateBackdrop(delta);
    this.updateStationPulse(time);
    if (this.trackDirty) {
      this.redrawTrack();
      this.trackDirty = false;
    }
    if (this.pointsDirty) {
      this.redrawPoints();
      this.pointsDirty = false;
    }
    if (this.finishDirty) {
      this.redrawFinish();
      this.finishDirty = false;
    }
  }

  /**
   * Drives the station control point's pulsing ring. Cheap: only marks `pointsDirty` when the
   * rounded-to-the-pixel radius actually changes (a few times per pulse cycle), and only while
   * editable — in play mode the ring isn't drawn at all, so there is nothing to animate.
   */
  private updateStationPulse(time: number): void {
    if (!this.editable || this.points.length === 0) return;
    const phase = (Math.sin((time / STATION_RING_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
    const r = Math.round(STATION_RING_MIN + phase * (STATION_RING_MAX - STATION_RING_MIN));
    if (r !== this.stationRingR) {
      this.stationRingR = r;
      this.pointsDirty = true;
    }
  }

  // ---------------- setup helpers ----------------

  // ---------------- camera assignment ----------------

  /** Assigns a game object to the world camera only (the UI camera ignores it). */
  private onWorld<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiCam.ignore(o);
    return o;
  }

  /** Assigns a game object to the UI camera only. Spine's SpineGameObject honours the same
   * `cameraFilter` bitmask `ignore` sets on ordinary objects. */
  private onUi<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.worldCam.ignore(o);
    return o;
  }

  // ---------------- setup helpers ----------------

  /**
   * The theme-park backdrop filling the world panel (x 32..992, y 78..700), see BG_DIR. Every layer
   * is a plain rectangle; the panel's rounded corners come from the corner caps on the UI camera
   * (createCornerCaps), which stay put while the world camera zooms.
   */
  private createBackdrop(): void {
    const w = PANEL_X1 - PANEL_X0;
    const addLayer = (key: string, y: number, h: number, depth: number, px: { x: number; y: number }): void => {
      const img = this.onWorld(this.add.image(PANEL_X0, y, key));
      img.setOrigin(0, 0);
      img.setDisplaySize(w, h);
      img.setDepth(depth);
      this.backdrop.push({ obj: img, x: PANEL_X0, y, px });
    };
    addLayer('cb-sky', PANEL_Y0, PANEL_Y1 - PANEL_Y0, DEPTH_SKY, PX_SKY);
    addLayer('cb-far', PANEL_Y1 - FAR_H, FAR_H, DEPTH_FAR, PX_FAR);
    addLayer('cb-mid', PANEL_Y1 - MID_H, MID_H, DEPTH_MID, PX_MID);
    // The ground strip moves with the track (factor 1): the supports stand on it.
    const ground = this.onWorld(this.add.image(PANEL_X0, PANEL_Y1 - GROUND_STRIP_H, 'cb-ground'));
    ground.setOrigin(0, 0);
    ground.setDisplaySize(w, GROUND_STRIP_H);
    ground.setDepth(DEPTH_GROUND);

    // Sky drifters: three clouds creep left to right and wrap (the textures are 2x).
    const drifter = (key: string, x: number, y: number, speed: number, bob: number, depth: number): void => {
      const img = this.onWorld(this.add.image(x, y, key));
      img.setScale(0.5);
      img.setDepth(depth);
      this.drifters.push({ img, x, y, speed, bob, phase: x * 0.01 });
    };
    drifter('cb-cloud1', 300, 300, 5, 0, DEPTH_CLOUDS);
    drifter('cb-cloud2', 720, 175, 3.5, 0, DEPTH_CLOUDS);
    drifter('cb-cloud3', 860, 420, 6, 0, DEPTH_CLOUDS);

    this.createFerrisWheel();
  }

  /**
   * A ferris wheel behind the fairground (the library has none): white A-frame legs, a pink rim
   * with bulbs and spokes that turns, and cars that hang level as it turns. Coloured like the
   * hazed fairground. Vector graphics, so it stays crisp at the ride zoom.
   */
  private createFerrisWheel(): void {
    const legs = this.onWorld(this.add.graphics());
    legs.setDepth(DEPTH_WHEEL);
    const legColor = hazed(0xf3f5fb);
    const legEdge = hazed(0x9aa6c8);
    const foot = GROUND_Y + 2 - WHEEL_Y;
    legs.lineStyle(7, legEdge, 1);
    legs.lineBetween(0, 0, -46, foot);
    legs.lineBetween(0, 0, 46, foot);
    legs.lineStyle(5, legColor, 1);
    legs.lineBetween(0, 0, -46, foot);
    legs.lineBetween(0, 0, 46, foot);
    legs.lineStyle(3, legColor, 1);
    legs.lineBetween(-30, foot * 0.62, 30, foot * 0.62);
    legs.setPosition(WHEEL_X, WHEEL_Y);
    this.backdrop.push({ obj: legs, x: WHEEL_X, y: WHEEL_Y, px: PX_WHEEL });

    const wheel = this.onWorld(this.add.graphics());
    wheel.setDepth(DEPTH_WHEEL + 0.01);
    const rim = hazed(0xff6fa3);
    const spoke = hazed(0xf3f5fb);
    wheel.lineStyle(2, spoke, 1);
    for (let i = 0; i < WHEEL_CARS * 2; i++) {
      const a = (i / (WHEEL_CARS * 2)) * Math.PI * 2;
      wheel.lineBetween(0, 0, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R);
    }
    wheel.lineStyle(5, rim, 1);
    wheel.strokeCircle(0, 0, WHEEL_R);
    wheel.lineStyle(2.5, rim, 1);
    wheel.strokeCircle(0, 0, WHEEL_R * 0.8);
    const bulbs = [hazed(0xffd23d), hazed(0xffffff)];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      wheel.fillStyle(bulbs[i % 2]!, 1);
      wheel.fillCircle(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, 2);
    }
    wheel.fillStyle(hazed(0x3a4470), 1);
    wheel.fillCircle(0, 0, 9);
    wheel.fillStyle(hazed(0xffd23d), 1);
    wheel.fillCircle(0, 0, 4.5);
    wheel.setPosition(WHEEL_X, WHEEL_Y);
    this.wheel = wheel;
    this.backdrop.push({ obj: wheel, x: WHEEL_X, y: WHEEL_Y, px: PX_WHEEL });

    // Cars: a hanger and a little cabin under each pivot, placed on the rim every frame.
    const carColors = [0xe8574f, 0xffc43d, 0x3fb6ec, 0x76c75a, 0xd95aa8];
    for (let i = 0; i < WHEEL_CARS; i++) {
      const car = this.onWorld(this.add.graphics());
      car.setDepth(DEPTH_WHEEL + 0.02);
      const c = hazed(carColors[i % carColors.length]!);
      car.lineStyle(2, hazed(0x6b7190), 1);
      car.lineBetween(0, 0, 0, 5);
      car.fillStyle(c, 1);
      car.fillRoundedRect(-9, 5, 18, 13, 4);
      car.fillStyle(hazed(0xffffff), 1);
      car.fillRect(-6, 8, 12, 4); // window band
      car.fillStyle(c, 1);
      car.fillRoundedRect(-10, 3, 20, 4, 2); // roof
      this.wheelCars.push(car);
    }
    this.placeWheelCars({ x: 0, y: 0 });
  }

  private placeWheelCars(off: Vec2): void {
    for (let i = 0; i < this.wheelCars.length; i++) {
      const a = this.wheelAngle + (i / this.wheelCars.length) * Math.PI * 2;
      this.wheelCars[i]!.setPosition(WHEEL_X + off.x + Math.cos(a) * WHEEL_R, WHEEL_Y + off.y + Math.sin(a) * WHEEL_R);
    }
  }

  /** The world panel's rounded corners, drawn on the UI camera in the canvas colour over the world
   * camera's square viewport (same as the kit's wide worlds). */
  private createCornerCaps(): void {
    const caps = this.onUi(this.add.graphics());
    caps.setDepth(DEPTH_SKY);
    caps.fillStyle(COLORS.navy, 1);
    const r = PANEL_RADIUS;
    const insetAt = (d: number): number => r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
    for (let i = 0; i < r; i++) {
      const inset = insetAt(i + 0.5);
      if (inset <= 0) continue;
      const top = PANEL_Y0 + i;
      const bottom = PANEL_Y1 - 1 - i;
      caps.fillRect(PANEL_X0, top, inset, 1);
      caps.fillRect(PANEL_X1 - inset, top, inset, 1);
      caps.fillRect(PANEL_X0, bottom, inset, 1);
      caps.fillRect(PANEL_X1 - inset, bottom, inset, 1);
    }
  }

  private createFuzz(): void {
    // The picked fuzz's picture (skins.ts): the body is 1 / SKIN_CANVAS_K of the square canvas, so
    // the drawn body is the rolling ball plus a little fur.
    const body = this.add.image(0, 0, this.skinKey(false));
    body.setDisplaySize(FUZZ_IMG_PX, FUZZ_IMG_PX);

    // The face rolls with the ball; the outer container handles position, orientation and squash.
    this.fuzzSpin = this.add.container(0, 0, [body]);
    this.fuzzBody = body;
    this.fuzz = this.onWorld(this.add.container(0, 0, [this.fuzzSpin]));
    this.fuzz.setDepth(DEPTH_FUZZ);
    this.fuzz.setVisible(false);

    this.stationFuzz = this.onWorld(this.add.image(0, 0, this.skinKey(false)));
    this.stationFuzz.setDisplaySize(FUZZ_IMG_PX, FUZZ_IMG_PX);
    this.stationFuzz.setDepth(DEPTH_STATION_FUZZ);
    this.stationFuzz.setVisible(false);

    // A small white card for the confetti (tinted per particle).
    const card = this.add.graphics();
    card.fillStyle(0xffffff, 1);
    card.fillRect(0, 0, 6, 10);
    card.generateTexture('confetti', 6, 10);
    card.destroy();
  }

  private skinKey(excited: boolean): string {
    return `skin-${this.skin}${excited ? '-excited' : ''}`;
  }

  // ---------------- camera + backdrop (per frame) ----------------

  /** Applies `camCur` to the world camera: zoom RENDER_SCALE x frame zoom, centred on the frame. */
  private applyCamera(): void {
    const c = frameCentrePx(this.camCur);
    this.worldCam.setZoom(RENDER_SCALE * this.camCur.zoom);
    this.worldCam.centerOn(c.x, c.y);
  }

  /** Follow the fuzz at RIDE_ZOOM in play mode; otherwise glide to (and rest exactly on) the full
   * level view. */
  private updateCamera(dtMs: number): void {
    if (this.camReleaseAt !== null && this.nowMs >= this.camReleaseAt) {
      this.camReleaseAt = null;
      this.camFollow = false;
    }
    let target = FULL_FRAME;
    if (this.camFollow && this.fuzz.visible) {
      target = rideTarget(toWorld({ x: this.fuzz.x, y: this.fuzz.y }), this.fuzzVel, RIDE_ZOOM);
    }
    // A long frame (tab switch) must not overshoot or stall: approach maths are exponential, so a
    // clamp on dt only bounds the jump.
    this.camCur = stepCamera(this.camCur, target, Math.min(dtMs, 100));
    this.applyCamera();
  }

  /** Parallax, drifting clouds, the turning wheel. */
  private updateBackdrop(dtMs: number): void {
    const dt = Math.min(dtMs, 100) / 1000;
    const f = this.camCur;
    for (const p of this.backdrop) {
      const o = parallaxOffset(f, p.px.x, p.px.y);
      p.obj.setPosition(p.x + o.x, p.y + o.y);
    }
    const fly = parallaxOffset(f, PX_FLYERS.x, PX_FLYERS.y);
    const t = this.nowMs / 1000;
    for (const d of this.drifters) {
      d.x += d.speed * dt;
      const half = d.img.displayWidth / 2;
      // wrap well outside the panel, past the largest parallax shift, so no cloud pops in view
      if (d.x - half > PANEL_X1 + 220) d.x = PANEL_X0 - 220 - half;
      const bob = d.bob ? Math.sin(t * 0.9 + d.phase) * d.bob : 0;
      d.img.setPosition(d.x + fly.x, d.y + bob + fly.y);
    }
    this.wheelAngle = (this.wheelAngle + WHEEL_SPEED * dt) % (Math.PI * 2);
    this.wheel.setRotation(this.wheelAngle);
    this.placeWheelCars(parallaxOffset(f, PX_WHEEL.x, PX_WHEEL.y));
  }

  /** A pointer's position in stage px through the world camera (zoom and scroll included). */
  private stagePoint(pointer: Phaser.Input.Pointer): Vec2 {
    const p = this.worldCam.getWorldPoint(pointer.x, pointer.y);
    return { x: p.x, y: p.y };
  }

  // ---------------- public API ----------------

  getPoints(): TrackPoint[] {
    return clonePoints(this.points);
  }

  setPoints(pts: TrackPoint[]): void {
    this.points = clonePoints(pts);
    this.undoStack = [];
    this.gesture = null;
    this.gestureBefore = null;
    this.activePointerId = null;
    this.pointsDirty = true;
    this.emitPointsChanged();
  }

  setEditable(on: boolean): void {
    this.editable = on;
    if (!on) {
      // cancel any in-progress drag cleanly, without finalizing it (no delete, no undo push)
      this.gesture = null;
      this.gestureBefore = null;
      this.activePointerId = null;
    }
    this.pointsDirty = true;
  }

  setTool(tool: EditTool): void {
    this.tool = tool;
  }

  /** The kind of point the current tool places: 'point' -> 'curve', 'loop' -> 'loop'. */
  private toolKind(): PointKind {
    return this.tool === 'loop' ? 'loop' : 'curve';
  }

  setTrack(t: Track | null): void {
    this.track = t;
    this.trackDirty = true;
  }

  setFinish(zone: FinishZone | null): void {
    const same =
      (this.finish === null && zone === null) ||
      (this.finish !== null && zone !== null && this.finish.x === zone.x && this.finish.y === zone.y && this.finish.r === zone.r);
    if (same) return;
    this.finish = zone ? { x: zone.x, y: zone.y, r: zone.r } : null;
    this.finishDirty = true;
  }

  setFinishReached(on: boolean): void {
    if (this.finishReached === on) return;
    this.finishReached = on;
    this.finishDirty = true;
  }

  drawCart(snap: CartSnapshot | null): void {
    if (!snap || !this.track) {
      this.fuzz.setVisible(false);
      this.resetFuzzFallState();
      this.fuzzVel = { x: 0, y: 0 };
      this.setExcited(false);
      return;
    }
    this.fuzz.setVisible(true);
    this.fuzzVel = snap.outcome === 'running'
      ? { x: snap.v * Math.cos(snap.theta), y: snap.v * Math.sin(snap.theta) }
      : { x: 0, y: 0 };
    // Excited while fast or flying; a fall keeps the excited (alarmed) face, a calm stop the normal one.
    this.setExcited(snap.outcome === 'fell' || excitedPose(this.excited, snap.v, snap.airborne));

    if (snap.outcome === 'running') this.resetFuzzFallState();

    const center = { x: snap.pos.x + snap.up.x * FUZZ_R, y: snap.pos.y + snap.up.y * FUZZ_R };
    const centerPx = toPx(center);

    // Gentle squash: 6 g squashes to 0.85, weightless stretches to 1.08.
    const sy = clamp(1 / (0.9 + 0.1 * Math.max(snap.gNormal, 0)), 0.85, 1.08);
    const sx = 1 / sy;

    let liftPx = 0;
    if (snap.airborne) liftPx = clamp(8 * (0.3 - snap.gNormal), 0, 20);
    const stageUpX = snap.up.x;
    const stageUpY = -snap.up.y;

    if (!this.fuzzFellStarted) {
      this.fuzz.setPosition(centerPx.x + stageUpX * liftPx, centerPx.y + stageUpY * liftPx);
      this.fuzz.setRotation(-snap.theta);
      this.fuzz.setScale(sx, sy);
    }

    // Rolling: moving forward along s, a ball on top of the rail turns clockwise on screen
    // (positive rotation in Phaser). When the ride side is the right normal it turns the other way.
    const tx = Math.cos(snap.theta);
    const ty = Math.sin(snap.theta);
    const onLeftNormal = tx * snap.up.y - ty * snap.up.x >= 0;
    this.fuzzSpin.rotation = (onLeftNormal ? 1 : -1) * (snap.s / FUZZ_R);

    if (snap.outcome === 'fell') {
      this.fuzzBody.setTint(COLORS.pink);
      if (!this.fuzzFellStarted) {
        this.fuzzFellStarted = true;
        this.tweens.add({
          targets: this.fuzz,
          y: GROUND_Y - FUZZ_R_PX,
          duration: 600,
          ease: 'Bounce.easeOut',
        });
        this.tweens.add({
          targets: this.fuzzSpin,
          rotation: this.fuzzSpin.rotation + Math.PI * 4,
          duration: 600,
        });
      }
    } else {
      this.fuzzBody.clearTint();
    }
  }

  private setExcited(on: boolean): void {
    if (this.excited === on) return;
    this.excited = on;
    this.fuzzBody.setTexture(this.skinKey(on));
    this.fuzzBody.setDisplaySize(FUZZ_IMG_PX, FUZZ_IMG_PX);
  }

  private resetFuzzFallState(): void {
    if (this.fuzzFellStarted) {
      this.tweens.killTweensOf(this.fuzz);
      this.tweens.killTweensOf(this.fuzzSpin);
      this.fuzzFellStarted = false;
    }
    this.fuzzBody.clearTint();
    this.fuzz.setScale(1, 1);
  }

  /** Dims the canvas and slides Bruno in from the left (the lesson intro; src/ui/brunoStage.ts). */
  showBrunoStage(): Promise<void> {
    return this.brunoStage.show();
  }

  /** Slides Bruno back out and undims the canvas. */
  hideBrunoStage(): Promise<void> {
    return this.brunoStage.hide();
  }

  /** Plays Bruno's wave once, then returns to the idle loop. No-op while he is off stage (between
   * dialogs) or failed to load. */
  brunoWave(): void {
    this.brunoStage?.wave();
  }

  /** Swaps the fuzz picture (both the station fuzz and the rider). With `pop`, the station fuzz
   * does a little pop so the child sees the swap land. Cosmetic only. */
  setSkin(id: SkinId, pop = false): void {
    this.skin = id;
    this.fuzzBody.setTexture(this.skinKey(this.excited));
    this.fuzzBody.setDisplaySize(FUZZ_IMG_PX, FUZZ_IMG_PX);
    this.tweens.killTweensOf(this.stationFuzz);
    this.stationFuzz.setTexture(this.skinKey(false));
    this.stationFuzz.setDisplaySize(FUZZ_IMG_PX, FUZZ_IMG_PX);
    if (pop) {
      const base = this.stationFuzz.scaleX;
      this.tweens.add({
        targets: this.stationFuzz,
        scaleX: base * 1.4,
        scaleY: base * 1.4,
        duration: 130,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => this.stationFuzz.setScale(base),
      });
    }
  }

  /**
   * The ride camera: `true` follows the fuzz zoomed in (rideCamera.ts); `false` glides back out to
   * the full level view, after `holdMs` (the end-of-ride beat on the fuzz) when given.
   */
  setRideCamera(follow: boolean, holdMs = 0): void {
    if (follow) {
      this.camFollow = true;
      this.camReleaseAt = null;
    } else if (holdMs > 0 && this.camFollow) {
      this.camReleaseAt = this.nowMs + holdMs;
    } else {
      this.camFollow = false;
      this.camReleaseAt = null;
    }
  }

  /** The payoff of a passed level: three confetti bursts over the fuzz (at the flag). */
  celebrate(): void {
    const at = { x: this.fuzz.x, y: this.fuzz.y };
    const burst = (dx: number, dy: number, count: number): void => {
      const em = this.onWorld(
        this.add.particles(at.x + dx, at.y + dy, 'confetti', {
          emitting: false,
          speed: { min: 140, max: 360 },
          angle: { min: 200, max: 340 },
          gravityY: 420,
          lifespan: { min: 1400, max: 2200 },
          rotate: { min: 0, max: 360 },
          scale: { min: 0.6, max: 1.1 },
          alpha: { start: 1, end: 0.2 },
          tint: [0xe8574f, 0xffc43d, 0x3fb6ec, 0x76c75a, 0xd95aa8, 0xffffff],
        }),
      );
      em.setDepth(DEPTH_CONFETTI);
      em.explode(count);
      this.time.delayedCall(2600, () => em.destroy());
    };
    burst(0, -10, 70);
    this.time.delayedCall(260, () => burst(-30, -40, 45));
    this.time.delayedCall(480, () => burst(30, -40, 45));
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const prev = this.undoStack.pop()!;
    this.points = prev;
    this.pointsDirty = true;
    this.emitPointsChanged();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Removes only unlocked points, leaving locked (level-placed) points in place. No-op (and no
   * undo push) when there is nothing unlocked to remove. */
  clear(): void {
    const kept = this.points.filter((p) => p.locked);
    if (kept.length === this.points.length) return;
    this.pushUndo(clonePoints(this.points));
    this.points = kept;
    this.pointsDirty = true;
    this.emitPointsChanged();
  }

  // ---------------- gestures ----------------

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.editable) return;
    if (!pointer.isDown) return;
    if (this.activePointerId !== null) return; // ignore a second concurrent pointer

    const { x: sx, y: sy } = this.stagePoint(pointer);
    if (sx < WORLD_X0 || sx > WORLD_X1 || sy < WORLD_Y0 || sy > WORLD_Y1) return;

    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const px = toPx(this.points[i]!);
      const d = Math.hypot(px.x - sx, px.y - sy);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1 && bestDist <= HIT_RADIUS) {
      if (this.points[bestIdx]!.locked) return; // locked: no gesture, no delete
      this.activePointerId = pointer.id;
      this.gestureBefore = clonePoints(this.points);
      this.gesture = { index: bestIdx, startPx: { x: sx, y: sy }, moved: false, isNew: false };
      return;
    }

    const w = toWorld({ x: sx, y: sy });
    const wx = clamp(w.x, EDGE, POINT_X_MAX);
    const wy = clamp(w.y, EDGE, this.toolKind() === 'loop' ? LOOP_Y_MAX : POINT_Y_MAX);

    if (this.track) {
      const i = insertionIndex(this.points, { x: wx, y: wy }, HIT_RADIUS / PPM);
      if (i !== null) {
        this.activePointerId = pointer.id;
        this.gestureBefore = clonePoints(this.points);
        const insertAt = i + 1;
        this.points.splice(insertAt, 0, { x: wx, y: wy, kind: this.toolKind() });
        this.gesture = { index: insertAt, startPx: { x: sx, y: sy }, moved: false, isNew: true };
        this.pointsDirty = true;
        this.emitPointsChanged();
        return;
      }
    }

    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1]!;
      if (Math.hypot(last.x - wx, last.y - wy) < MIN_POINT_GAP) {
        return; // ignore; no gesture started
      }
    }

    this.activePointerId = pointer.id;
    this.gestureBefore = clonePoints(this.points);
    this.points.push({ x: wx, y: wy, kind: this.toolKind() });
    this.gesture = {
      index: this.points.length - 1,
      startPx: { x: sx, y: sy },
      moved: false,
      isNew: true,
    };
    this.pointsDirty = true;
    this.emitPointsChanged();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.editable) return;
    if (!this.gesture || pointer.id !== this.activePointerId) return;

    const { x: sx, y: sy } = this.stagePoint(pointer);
    const dist = Math.hypot(sx - this.gesture.startPx.x, sy - this.gesture.startPx.y);
    if (dist > MOVE_THRESHOLD) this.gesture.moved = true;

    // Dragging a loop point moves the whole loop: the loop shape is expanded from this single
    // point (its bottom) by the app before buildTrack, so moving the point is all that's needed.
    const prevKind = this.points[this.gesture.index]!.kind;
    const w = toWorld({ x: sx, y: sy });
    const wx = clamp(w.x, EDGE, POINT_X_MAX);
    const wy = clamp(w.y, EDGE, prevKind === 'loop' ? LOOP_Y_MAX : POINT_Y_MAX);
    this.points[this.gesture.index] = { x: wx, y: wy, kind: prevKind };
    this.pointsDirty = true;
    this.emitPointsChanged();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.gesture || pointer.id !== this.activePointerId) return;

    const g = this.gesture;
    if (!g.moved && !g.isNew) {
      this.points.splice(g.index, 1);
    }
    this.pushUndo(this.gestureBefore ?? []);

    this.gesture = null;
    this.gestureBefore = null;
    this.activePointerId = null;

    this.pointsDirty = true;
    this.emitPointsChanged();
  }

  // ---------------- helpers ----------------

  private pushUndo(snapshot: TrackPoint[]): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
  }

  private emitPointsChanged(): void {
    this.onPointsChanged?.(clonePoints(this.points));
  }

  // ---------------- rendering ----------------

  private strokePolyline(
    gfx: Phaser.GameObjects.Graphics,
    pts: readonly Vec2[],
    width: number,
    color: number,
    alpha: number,
    offsetY = 0,
  ): void {
    if (pts.length === 0) return;
    gfx.lineStyle(width, color, alpha);
    gfx.beginPath();
    const first = pts[0]!;
    gfx.moveTo(first.x, first.y + offsetY);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]!;
      gfx.lineTo(p.x, p.y + offsetY);
    }
    gfx.strokePath();
  }

  private redrawTrack(): void {
    this.supportGfx.clear();
    this.trackGfx.clear();
    const track = this.track;
    if (!track) return;

    const samples = track.samples;
    if (samples.length === 0) return;

    // ---- supports: a post every 4m where the rail normal points mostly up
    // and the rail sits more than 1.2m above the ground ----
    // The ride side follows the start direction (same rule as the sim), so the top of a
    // loop, where the fuzz hangs upside down, gets no post.
    const startT = track.lookup(0).tangent;
    const side = startT.x >= 0 ? 1 : -1;
    this.supportGfx.lineStyle(3, POST_COLOR, 0.6);
    for (let s = 0; s <= track.length + 1e-6; s += 4) {
      const sample = track.lookup(Math.min(s, track.length));
      const up = { x: -sample.tangent.y * side, y: sample.tangent.x * side };
      if (up.y > 0.6 && sample.pos.y > 1.2) {
        const p = toPx(sample.pos);
        this.supportGfx.lineBetween(p.x, p.y, p.x, GROUND_Y);
      }
    }

    // ---- lower rail and ties: a thin second rail 8 px under the main rail (along -up),
    // with a cream tie between the two rails every 1 m ----
    const RAIL_GAP = 8;
    const under = (sample: { pos: Vec2; tangent: Vec2 }): { p: Vec2; q: Vec2 } => {
      const up = { x: -sample.tangent.y * side, y: sample.tangent.x * side };
      const p = toPx(sample.pos);
      // stage direction of world "up" is (up.x, -up.y)
      return { p, q: { x: p.x - up.x * RAIL_GAP, y: p.y + up.y * RAIL_GAP } };
    };
    this.supportGfx.lineStyle(2, TIE_COLOR, 0.9);
    for (let s = 0; s <= track.length + 1e-6; s += 1) {
      const { p, q } = under(track.lookup(Math.min(s, track.length)));
      this.supportGfx.lineBetween(p.x, p.y, q.x, q.y);
    }
    const lowerPts: Vec2[] = [];
    for (let i = 0; i < samples.length; i += 2) lowerPts.push(under(samples[i]!).q);
    lowerPts.push(under(samples[samples.length - 1]!).q);
    this.strokePolyline(this.supportGfx, lowerPts, 3, TRACK_DARK_RED, 1);

    // ---- rail polyline: every 2nd sample, plus the last ----
    const stagePts: Vec2[] = [];
    stagePts.push(toPx(samples[0]!.pos));
    for (let i = 2; i < samples.length; i += 2) stagePts.push(toPx(samples[i]!.pos));
    stagePts.push(toPx(samples[samples.length - 1]!.pos));

    this.strokePolyline(this.trackGfx, stagePts, 9, TRACK_DARK_RED, 1);
    this.strokePolyline(this.trackGfx, stagePts, 5, TRACK_RED, 1);
    this.strokePolyline(this.trackGfx, stagePts, 1.5, TRACK_HIGHLIGHT, 0.6, -1.5);
  }

  /** A small station house under the first control point: cream wall, orange roof, dark door. */
  /**
   * The boarding station: a wooden deck under the rail where the fuzz gets on, a striped canopy on
   * two posts over it, and a little flag. The rail runs through the station at the point's height.
   */
  private drawStation(p: Vec2): void {
    const g = this.pointsGfx;
    const x0 = p.x - 40; // the station stretches to the left of the start point
    const w = 52;
    const deckY = p.y + 10; // just under the lower rail
    const roofY = p.y - 34;

    // posts (behind everything else)
    g.fillStyle(STATION_POST, 1);
    g.fillRect(x0 + 4, roofY + 4, 3, deckY - roofY - 4);
    g.fillRect(x0 + w - 7, roofY + 4, 3, deckY - roofY - 4);

    // deck with two short legs
    g.fillStyle(STATION_DECK, 1);
    g.fillRect(x0, deckY, w, 6);
    g.fillRect(x0 + 6, deckY + 6, 3, 8);
    g.fillRect(x0 + w - 9, deckY + 6, 3, 8);
    g.fillStyle(STATION_DECK_EDGE, 1);
    g.fillRect(x0, deckY, w, 2);

    // canopy: orange roof with cream stripes and a scalloped bottom edge
    g.fillStyle(STATION_ROOF, 1);
    g.fillRect(x0 - 2, roofY, w + 4, 7);
    g.fillStyle(STATION_STRIPE, 1);
    for (let sx = x0 - 2 + 7; sx < x0 + w + 2; sx += 14) g.fillRect(sx, roofY, 7, 7);
    for (let i = 0; i < 8; i++) {
      g.fillStyle(i % 2 === 0 ? STATION_ROOF : STATION_STRIPE, 1);
      g.fillTriangle(x0 - 2 + i * 7, roofY + 7, x0 - 2 + (i + 1) * 7, roofY + 7, x0 - 2 + i * 7 + 3.5, roofY + 11);
    }

    // flag on the right post
    g.fillStyle(STATION_POST, 1);
    g.fillRect(x0 + w - 6, roofY - 12, 2, 12);
    g.fillStyle(COLORS.pink, 1);
    g.fillTriangle(x0 + w - 4, roofY - 12, x0 + w + 8, roofY - 9, x0 + w - 4, roofY - 6);
  }

  /**
   * Edit mode: the picked fuzz waits on the station deck, left of the start point, kept inside the
   * panel for a station at the left edge (most levels: x 2 m). Behind a draggable station handle;
   * in front of a locked one (a padlock is only a label, and at the left edge the fuzz would
   * otherwise hide behind it), stopping just short of the padlock. Hidden while it rides.
   */
  private placeStationFuzz(p: Vec2): void {
    if (!this.editable) return;
    const r = FUZZ_R_PX * FUZZ_FUR;
    const deckY = p.y + 10; // drawStation's deck top
    const x = Math.max(PANEL_X0 + r - 1, p.x - 24);
    this.stationFuzz.setPosition(x, deckY - FUZZ_R_PX);
    this.stationFuzz.setDepth(this.points[0]?.locked ? DEPTH_POINTS + 0.1 : DEPTH_STATION_FUZZ);
    this.stationFuzz.setVisible(true);
  }

  /** A small white padlock mark (body + shackle), centred on `p`. Used on locked control points. */
  private drawPadlockMark(p: Vec2): void {
    const g = this.pointsGfx;
    const bodyTop = p.y - 0.5;
    g.lineStyle(2, COLORS.white, 1);
    g.beginPath();
    g.arc(p.x, bodyTop, 2.5, Math.PI, Math.PI * 2, false);
    g.strokePath();
    g.fillStyle(COLORS.white, 1);
    g.fillRect(p.x - 3, bodyTop, 6, 5);
  }

  private redrawPoints(): void {
    this.pointsGfx.clear();
    this.stationFuzz.setVisible(false);
    if (this.points.length === 0) return;

    const station = toPx(this.points[0]!);
    this.drawStation(station);
    this.placeStationFuzz(station);

    if (!this.editable) return;

    for (let i = 0; i < this.points.length; i++) {
      const pt = this.points[i]!;
      const p = toPx(pt);
      const isStation = i === 0;
      const locked = !!pt.locked;

      if (pt.kind === 'loop') {
        const ringColor = locked ? LOCKED_COLOR : COLORS.orange;
        this.pointsGfx.lineStyle(4, ringColor, 1);
        this.pointsGfx.strokeCircle(p.x, p.y, 11);
        this.pointsGfx.fillStyle(ringColor, 1);
        this.pointsGfx.fillCircle(p.x, p.y, 3);
        this.pointsGfx.lineStyle(1.5, COLORS.white, 1);
        this.pointsGfx.strokeCircle(p.x, p.y, 13);
        if (locked) this.drawPadlockMark(p);
        continue;
      }

      const r = isStation ? 13 : 9;
      if (locked) {
        this.pointsGfx.fillStyle(LOCKED_COLOR, 1);
        this.pointsGfx.fillCircle(p.x, p.y, r);
        this.pointsGfx.lineStyle(2, COLORS.white, 1);
        this.pointsGfx.strokeCircle(p.x, p.y, r);
        this.drawPadlockMark(p);
      } else if (isStation) {
        this.pointsGfx.fillStyle(COLORS.orange, 1);
        this.pointsGfx.fillCircle(p.x, p.y, 13);
        this.pointsGfx.lineStyle(2, COLORS.white, 1);
        this.pointsGfx.strokeCircle(p.x, p.y, this.stationRingR); // pulsing halo, 13..15px
      } else {
        this.pointsGfx.fillStyle(COLORS.blue, 1);
        this.pointsGfx.fillCircle(p.x, p.y, 9);
        this.pointsGfx.lineStyle(2, COLORS.white, 1);
        this.pointsGfx.strokeCircle(p.x, p.y, 9);
      }
    }
  }

  /**
   * The finish flag: a dashed-look ring at the finish radius, a pole planted at the zone centre,
   * and a small checkered flag at the top. Visible in edit and play mode alike. Turns green
   * (and gains an outer ring) once `finishReached` is set.
   */
  private redrawFinish(): void {
    const g = this.finishGfx;
    g.clear();
    const zone = this.finish;
    if (!zone) return;

    const center = toPx(zone);
    const rPx = zone.r * PPM;
    const reached = this.finishReached;

    g.lineStyle(2, reached ? COLORS.green : COLORS.white, reached ? 0.9 : 0.5);
    g.strokeCircle(center.x, center.y, rPx);
    if (reached) {
      g.lineStyle(3, COLORS.green, 1);
      g.strokeCircle(center.x, center.y, rPx + 4);
    }

    const poleColor = reached ? COLORS.green : STATION_POST;
    const poleH = 40;
    const poleTopY = center.y - poleH;
    g.fillStyle(poleColor, 1);
    g.fillRect(center.x - 1.5, poleTopY, 3, poleH);

    // checkered flag: 24x16 px, 4 columns x 2 rows of 6x8 cells, attached right of the pole
    const cellW = 6;
    const cellH = 8;
    const flagX = center.x + 1.5;
    const flagY = poleTopY;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const even = (row + col) % 2 === 0;
        g.fillStyle(even ? COLORS.white : FLAG_DARK, 1);
        g.fillRect(flagX + col * cellW, flagY + row * cellH, cellW, cellH);
      }
    }
  }
}
