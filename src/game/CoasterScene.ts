import Phaser from 'phaser';
import { COLORS, ORIGIN_X, GROUND_Y, PANEL_TOP_Y, PPM, WORLD_W, WORLD_H, STAGE_W, STAGE_H, RENDER_SCALE, toPx, toWorld } from './view';
import type { Vec2, Track, CartSnapshot, TrackPoint, PointKind, FinishZone, EditTool } from '../core/types';
import { insertionIndex, clonePoints, openGapIndex } from '../core/trackPoints';
import { OPEN_RULES, canAppend, canDeletePoint, canGrab, clearedPoints, dragTarget, samePoints, type EditRules } from '../core/editRules';
import { dragHandPose, tapHandFrame } from '../core/coach';
import { airCounterText, type AirPreview, type AirStretch } from '../core/airPreview';
import { entrancePose } from '../core/entrance';
import { FlipTrigger, flipPose, happyBounce, landingHit, landingSquish, speedStretch } from '../core/rideJuice';
import {
  BUILD_TOTAL_MS, GHOST_MS, INSERT_DROP_PX, animDone, beamDelay, beamRise, ghostBeam, ghostRetract, ghostSink, knot,
  knotArcLengths, pointScale, railOffset, railReveal, type BuildAnim,
} from '../core/buildJuice';
import { BrunoStage } from '../ui/brunoStage';
import type { FrameState, WorldDims } from '../kit/camera';
import { clampToWorld } from '../core/world';
import { DEFAULT_SKIN, FUZZ_SKINS, SKIN_CANVAS_K, excitedPose, type SkinId } from './skins';
import {
  COASTER_CAM_WORLD, FOLLOW_LERP, FULL_FRAME, RIDE_ZOOM, SCROLL_LERP, backdropSpanPx, coasterCamWorld, edgeScrollSpeed,
  editFrame, editFrameAt, frameCentrePx, inPanel, introFrame, parallaxOffset, rideTarget, screenToStage, scrollOf,
  stepCamera, type IntroPan,
} from './rideCamera';
import { PARALLAX } from '../kit/parallax';

interface Gesture {
  index: number;
  startPx: Vec2;
  moved: boolean;
  isNew: boolean;
}

const WORLD_X0 = ORIGIN_X;
const WORLD_Y0 = PANEL_TOP_Y; // GROUND_Y - WORLD_H * PPM: stage y 78
const WORLD_Y1 = GROUND_Y;

/* Points stay 0.5 m inside the world's edges (src/core/world.ts clampToWorld). A loop point is the
   loop's bottom and the loop rises 2 radii above it, so its point stops lower: the whole loop stays
   in the sky (2026-10-07: with the 38.25 m world a loop point may sit at 29.75 m). 2026-10-15: the
   right edge is the level's own (`Level.worldW`, wide levels). */

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
/** The tutorial hand: over the handles and the fuzz, under the confetti. */
const DEPTH_COACH = 4.3;

/** The tutorial hand (2026-10-15): the builder kit's 3-frame glove (public/ui/hand_0N.png, 310x360,
 * white glove, index finger up-left), same size and anchor as the kit's (BuilderScene
 * COACH_HAND_FRAMES): every frame is placed by its fingertip (108/310, 2/360), so the glove holds
 * still and only the finger bends. */
const COACH_HAND_H_PX = 64;
const COACH_HAND_W_PX = COACH_HAND_H_PX * (310 / 360);
const COACH_HAND_FX = 108 / 310;
const COACH_HAND_FY = 2 / 360;
const COACH_HAND_KEYS = ['ui-hand-1', 'ui-hand-2', 'ui-hand-3'] as const;
const COACH_IN_MS = 300;
/** The fingertip sits this far down-right of the target's centre (stage px), so the glove hangs
 * off the handle's bottom-right and the handle stays visible. */
const COACH_TIP_OFFSET = { x: 5, y: 5 };

/** What the scene's tutorial hand shows: the drag-up stroke on point `index` (the station, or the
 * air time lesson's hilltop) rising `risePx` stage px, a tap on a world spot (m), or nothing. */
export type SceneCoach = { kind: 'drag'; index: number; risePx: number } | { kind: 'tap'; at: Vec2 } | null;

/* 2026-10-15 (Gao: level 5 "too hard, kids won't understand hang time"): air time made visible.
   Edit mode, on the air time lesson only (2026-10-15 later, Jon: no spoiler on the Thrill ride; no
   number anywhere): the stretches of rail where a dry run of the sim floats the fuzz
   (src/core/airPreview.ts) glow light blue. The ride, every level: while the fuzz is
   airborne (seat g under 0.3) it eases up off the rail with a soft shadow left on the rail and a
   trail of sparkles; on levels with an air time goal a counter over it counts the ride's air time
   up and pops (gold, a sparkle burst) the moment the goal is met. Cosmetic: the sim and the
   metrics never see any of it. */
const AIR_GLOW = 0xffffff;       // the soft halo under the floaty stretch
const AIR_EDGE = 0x1f6fc2;       // the floaty stretch's rail: a blue edge...
const AIR_RAIL = 0x7fd8ff;       // ...a light-blue rail...
const AIR_SHINE = 0xe9fbff;      // ...and a bright shine line
const AIR_TEXT_STROKE = '#1b2a5c';
const AIR_FONT = '"Nunito", "Arial Rounded MT Bold", ui-rounded, -apple-system, "Segoe UI", Roboto, sans-serif';
/** The float's ease (ms time constants): up quickly, down a little slower, so it never pops. */
const FLOAT_IN_MS = 70;
const FLOAT_OUT_MS = 150;
/** The lift off the rail while airborne, stage px: LIFT_MIN at the 0.3 g threshold, up to LIFT_MAX
 * when weightless or pulled up (a fuzz radius or more: readable in the full view and doubled by the
 * ride camera's zoom). */
const LIFT_MIN_PX = 12;
const LIFT_MAX_PX = 24;
/** The counter waits this long after the float ends, then fades (ms). */
const COUNTER_HOLD_MS = 700;
const COUNTER_FADE_MS = 250;
/** The counter stays gold this long after the goal is met (ms). */
const GOAL_POP_HOLD_MS = 1300;

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
/** Parallax depth factors, across (x) and up/down (y): 1 moves with the track, 0 stays put.
 * 2026-10-15: the values live in the builder kit (PARALLAX, src/kit/parallax.ts), shared with the
 * catapult's theme park. */
const PX_SKY = PARALLAX.sky;
const PX_FLYERS = PARALLAX.flyers;
const PX_FAR = PARALLAX.far;
const PX_WHEEL = PARALLAX.wheel;
const PX_MID = PARALLAX.mid;
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

/** Rail that was just removed, still drawn while it goes: the tail retracts (the last point was
 * deleted) or the stretch sinks and fades (a middle point). Stage px, every other sample. */
interface TrackGhost {
  kind: 'retract' | 'sink';
  t0: number;
  rail: Vec2[];
  lower: Vec2[];
  beams: { x: number; y: number; u: number }[];
}

/** The rail's lower rail sits this far under the main rail (stage px). */
const RAIL_GAP = 8;

/** The "▶" bubble: radius, and its centre's height over the station deck (stage px). */
const PLAY_BUBBLE_R = 13;
const PLAY_BUBBLE_RISE = 58;
/** The goals panel covers the scene's top-left down to about stage y 215: a bubble whose top would
 * be above this hangs under the station deck instead. */
const PLAY_BUBBLE_MIN_Y = 228;

/* 2026-10-15 (Jon: "finish line hard to see"): a tall pole with a big waving checkered flag and a
   glowing ring on the ground zone. */
const FINISH_POLE_H = 92;
const FINISH_CELL = 7;
const FINISH_COLS = 6;
const FINISH_ROWS = 4;
const FINISH_GOLD = 0xffd23d;

/** Fills the quad x0,y0 .. x3,y3 (the waving flag's cells). */
function fillQuad(g: Phaser.GameObjects.Graphics, q: readonly number[]): void {
  g.beginPath();
  g.moveTo(q[0]!, q[1]!);
  g.lineTo(q[2]!, q[3]!);
  g.lineTo(q[4]!, q[5]!);
  g.lineTo(q[6]!, q[7]!);
  g.closePath();
  g.fillPath();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class CoasterScene extends Phaser.Scene {
  onPointsChanged?: (pts: TrackPoint[]) => void;
  onUpdate?: (deltaMs: number) => void;
  /** A tap while the fuzz hops onto the rail (the App starts the ride at once). */
  onEntranceSkip?: () => void;
  /** A tap on the "▶" bubble over the waiting fuzz (the App's Play). */
  onPlayTap?: () => void;

  private points: TrackPoint[] = [];
  private undoStack: TrackPoint[][] = [];
  private editable = true;
  private tool: EditTool = 'point';
  private rules: EditRules = OPEN_RULES;
  private track: Track | null = null;

  // 2026-10-15: the tutorial hand (src/core/coach.ts), see setCoach.
  private coach: SceneCoach = null;
  private coachKey = '';
  private coachStart = 0;
  private coachHand?: Phaser.GameObjects.Image;
  private coachHandShadow?: Phaser.GameObjects.Image;
  private coachArrow?: Phaser.GameObjects.Graphics;

  // 2026-10-15: air time made visible (see AIR_GLOW).
  private airGoal: number | null = null;
  private airPreview: AirPreview | null = null;
  private airDirty = false;
  private airGfx!: Phaser.GameObjects.Graphics;
  private airCoreGfx!: Phaser.GameObjects.Graphics;
  /** 0 on the rail, 1 fully floating (eased, FLOAT_IN_MS / FLOAT_OUT_MS). */
  private floatK = 0;
  private lastCartMs: number | null = null;
  private rideAir = 0;
  private prevRideAir = 0;
  private floatShadow!: Phaser.GameObjects.Image;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private airCounter!: Phaser.GameObjects.Text;
  /** Scene time the counter was last needed (floating, or the goal pop), for its hold and fade. */
  private counterSeenAt = -Infinity;
  /** Scene time the goal words popped (-Infinity: not this ride). */
  private goalPopAt = -Infinity;

  private finish: FinishZone | null = null;
  private finishReached = false;

  // ---- 2026-10-15 track-building juice (src/core/buildJuice.ts) ----
  /** The running build animations (drawing only: the track data is already final). */
  private buildAnims: BuildAnim[] = [];
  /** Removed rail still on screen (retracting or sinking away), in stage px. */
  private ghosts: TrackGhost[] = [];
  /** The s of each control point on the current track (for the animations' index ranges). */
  private knotS: number[] = [];
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;

  // ---- 2026-10-15 the entrance and the ride's juice (src/core/entrance.ts, rideJuice.ts) ----
  /** Hopping from the station onto the rail (the App holds the sim meanwhile). */
  private entering = false;
  private entranceFrom: Vec2 = { x: 0, y: 0 };
  private entranceTo: Vec2 = { x: 0, y: 0 };
  private entranceUp: Vec2 = { x: 0, y: -1 };
  private entranceTheta = 0;
  /** The drawn fuzz before the juice: centre (stage px), rotation, scale, its up (stage), face roll. */
  private base = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, upX: 0, upY: -1 };
  private rollAngle = 0;
  /** +1 when rolling forward turns the face clockwise on screen. */
  private rollDir = 1;
  /** Added to the roll after a backflip, so the face carries on from where the flip left it. */
  private spinOffset = 0;
  private readonly flipTrigger = new FlipTrigger();
  private flipAt = -Infinity;
  private flipRoll = 0;
  private flipBaked = true;
  private landAt = -Infinity;
  private landK = 0;
  private prevG = 1;
  private prevAirborne = false;
  private happyAt = -Infinity;
  /** The "▶" bubble over the waiting fuzz (Jon: "put the play button where the fuzz is"). */
  private playBubble!: Phaser.GameObjects.Container;
  private playBubbleAt: Vec2 = { x: 0, y: 0 };
  private playBubbleBelow = false;
  private finishTime = 0;

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
  // camera always shows the whole stage at RENDER_SCALE, for the panel's corner caps (Bruno's dialog stage rides the world camera, src/ui/brunoStage.ts).
  private worldCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private camCur: FrameState = { ...FULL_FRAME };
  private camFollow = false;
  /** Scene time (ms) at which a pending follow release happens (the end-of-ride hold), or null. */
  private camReleaseAt: number | null = null;
  private nowMs = 0;

  private backdrop: BackdropPiece[] = [];
  private drifters: Drifter[] = [];
  /** The backdrop's tiled pictures (sky, hills, trees, grass) and clouds for the current world
   * width, rebuilt by `setWorld` (the ferris wheel is built once: one landmark). */
  private backdropTiles: Phaser.GameObjects.GameObject[] = [];

  // ---- 2026-10-15 wide levels (src/core/world.ts, rideCamera.ts) ----
  /** The level's world width (m) and the camera's clamp band for it. */
  private worldW = WORLD_W;
  private camWorld: WorldDims = COASTER_CAM_WORLD;
  /** The edit view's centre across (m): where the scrollbar / edge scroll put it. */
  private editCx = FULL_FRAME.cx;
  /** The opening pan from the flag back to the station: waiting behind Bruno's intro (t < 0), or
   * running (t ms in); `done` resolves when it ends or a tap skips it. */
  private intro: { pan: IntroPan; t: number; done: (() => void) | null } | null = null;
  /** The dragging finger's last screen position (stage px), for the edge scroll. */
  private dragScreen: Vec2 | null = null;
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
    COACH_HAND_KEYS.forEach((key, i) => this.load.image(key, `ui/hand_0${i + 1}.png`));
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
    // stage at RENDER_SCALE only (the corner caps). Taps map through the world camera
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

    // The air preview: a glow under the rail and a bright core line over it.
    this.airGfx = this.onWorld(this.add.graphics());
    this.airGfx.setDepth(DEPTH_TRACK - 0.05);
    this.airCoreGfx = this.onWorld(this.add.graphics());
    this.airCoreGfx.setDepth(DEPTH_TRACK + 0.05);

    this.pointsGfx = this.onWorld(this.add.graphics());
    this.pointsGfx.setDepth(DEPTH_POINTS);

    // The finish flag stands under the point handles, so the end point stays grabbable-looking.
    this.finishGfx = this.onWorld(this.add.graphics());
    this.finishGfx.setDepth(DEPTH_POINTS - 0.2);

    // A soft puff for the dust at a rising beam's foot.
    const puff = this.add.graphics();
    for (let i = 0; i < 4; i++) {
      puff.fillStyle(0xffffff, 0.3);
      puff.fillCircle(8, 8, 8 - i * 2);
    }
    puff.generateTexture('build-dust', 16, 16);
    puff.destroy();
    this.dust = this.onWorld(this.add.particles(0, 0, 'build-dust', {
      emitting: false,
      speed: { min: 14, max: 46 },
      angle: { min: 195, max: 345 },
      gravityY: 40,
      lifespan: { min: 320, max: 520 },
      scale: { start: 0.45, end: 1.1 },
      alpha: { start: 0.75, end: 0 },
      tint: [0xf3e6cf, 0xe2d2b4, 0xffffff],
    }));
    this.dust.setDepth(DEPTH_SUPPORT + 0.05);

    this.createPlayBubble();

    this.createFuzz();
    // 2026-10-12: Bruno left the top bar; he slides in over a dimmed stage when he talks.
    // 2026-10-12 (later): on the world camera, so the dim and Bruno stay inside the game frame.
    this.brunoStage = new BrunoStage(this, (o) => this.onWorld(o), this.worldCam, { x0: PANEL_X0, y0: PANEL_Y0, x1: PANEL_X1, y1: PANEL_Y1 }, 'CoasterScene');

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
    // The juice on the drawn fuzz (the entrance hop, a backflip, a landing squish, the happy bounce)
    // goes on before the camera reads where the fuzz is.
    this.applyFuzzPose();
    this.updateCamera(delta);
    this.brunoStage.sync(); // after the camera moved: the dialog stage stays put in the frame
    this.updateBackdrop(delta);
    this.updateStationPulse(time);
    this.updateBuildAnims(time);
    this.updatePlayBubble(time);
    this.finishTime = time;
    if (this.finish) this.finishDirty = true; // the flag waves and the ring glows
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
    if (this.airDirty) {
      this.redrawAirPreview();
      this.airDirty = false;
    }
    this.updateAirCounter();
    this.drawCoach();
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
    this.buildBackdropTiles();
    this.createFerrisWheel();
  }

  /**
   * The backdrop's pictures for the current world width (2026-10-15: wide levels). Each layer is
   * laid side by side, every other copy mirrored so the seams match, as far as the camera can ever
   * show it for this world (`backdropSpanPx`: one copy on a one-screen level, exactly as before);
   * one more set of three clouds per extra screen. The ferris wheel stays one landmark.
   */
  private buildBackdropTiles(): void {
    for (const o of this.backdropTiles) {
      this.backdrop = this.backdrop.filter((p) => p.obj !== (o as unknown as BackdropPiece['obj']));
      o.destroy();
    }
    this.backdropTiles = [];
    this.drifters = [];

    const w = PANEL_X1 - PANEL_X0;
    const addLayer = (key: string, y: number, h: number, depth: number, px: { x: number; y: number }): void => {
      const n = Math.max(1, Math.ceil(backdropSpanPx(this.worldW, px.x) / w - 1e-6));
      for (let k = 0; k < n; k++) {
        const img = this.onWorld(this.add.image(PANEL_X0 + k * w, y, key));
        img.setOrigin(0, 0);
        img.setDisplaySize(w, h);
        img.setFlipX(k % 2 === 1);
        img.setDepth(depth);
        this.backdropTiles.push(img);
        this.backdrop.push({ obj: img, x: PANEL_X0 + k * w, y, px });
      }
    };
    addLayer('cb-sky', PANEL_Y0, PANEL_Y1 - PANEL_Y0, DEPTH_SKY, PX_SKY);
    addLayer('cb-far', PANEL_Y1 - FAR_H, FAR_H, DEPTH_FAR, PX_FAR);
    addLayer('cb-mid', PANEL_Y1 - MID_H, MID_H, DEPTH_MID, PX_MID);
    // The ground strip moves with the track (factor 1): the supports stand on it.
    addLayer('cb-ground', PANEL_Y1 - GROUND_STRIP_H, GROUND_STRIP_H, DEPTH_GROUND, { x: 1, y: 1 });

    // Sky drifters: three clouds per screen creep left to right and wrap (the textures are 2x).
    const drifter = (key: string, x: number, y: number, speed: number, bob: number, depth: number): void => {
      const img = this.onWorld(this.add.image(x, y, key));
      img.setScale(0.5);
      img.setDepth(depth);
      this.backdropTiles.push(img);
      this.drifters.push({ img, x, y, speed, bob, phase: x * 0.01 });
    };
    const screens = Math.max(1, Math.ceil(backdropSpanPx(this.worldW, PX_FLYERS.x) / w - 1e-6));
    for (let k = 0; k < screens; k++) {
      const dx = k * w;
      // Later screens get their clouds a little shuffled, so the sky does not repeat.
      const jig = k === 0 ? 0 : ((k * 137) % 90) - 45;
      drifter('cb-cloud1', 300 + dx + jig, 300 - (k % 2) * 40, 5, 0, DEPTH_CLOUDS);
      drifter('cb-cloud2', 720 + dx - jig, 175 + (k % 2) * 30, 3.5, 0, DEPTH_CLOUDS);
      drifter('cb-cloud3', 860 + dx + jig / 2, 420 - (k % 3) * 25, 6, 0, DEPTH_CLOUDS);
    }
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

    // The float (2026-10-15): a four-point sparkle for the trail, a soft oval for the shadow the
    // floating fuzz leaves on the rail.
    const spark = this.add.graphics();
    spark.fillStyle(0xffffff, 1);
    const star: [number, number][] = [[8, 0], [10, 6], [16, 8], [10, 10], [8, 16], [6, 10], [0, 8], [6, 6]];
    spark.beginPath();
    spark.moveTo(star[0]![0], star[0]![1]);
    for (const [x, y] of star.slice(1)) spark.lineTo(x, y);
    spark.closePath();
    spark.fillPath();
    spark.generateTexture('air-sparkle', 16, 16);
    spark.destroy();
    const oval = this.add.graphics();
    for (let i = 0; i < 4; i++) {
      oval.fillStyle(0x000000, 0.25);
      oval.fillEllipse(16, 5, 32 - i * 6, 10 - i * 2);
    }
    oval.generateTexture('air-shadow', 32, 10);
    oval.destroy();

    this.floatShadow = this.onWorld(this.add.image(0, 0, 'air-shadow'));
    this.floatShadow.setDepth(DEPTH_TRACK + 0.1);
    this.floatShadow.setVisible(false);

    this.sparkles = this.onWorld(
      this.add.particles(0, 0, 'air-sparkle', {
        emitting: false,
        frequency: 40,
        quantity: 1,
        lifespan: { min: 450, max: 750 },
        speed: { min: 8, max: 34 },
        angle: { min: 0, max: 360 },
        // Born anywhere on the fuzz (a 10 px disc), not all from its centre.
        emitZone: {
          type: 'random',
          source: {
            getRandomPoint: (pt: Phaser.Types.Math.Vector2Like): void => {
              const a = Math.random() * Math.PI * 2;
              const r = 10 * Math.sqrt(Math.random());
              pt.x = Math.cos(a) * r;
              pt.y = Math.sin(a) * r;
            },
          },
        },
        rotate: { min: 0, max: 360 },
        scale: { start: 0.85, end: 0.1 },
        alpha: { start: 0.95, end: 0 },
        tint: [0xffffff, 0xc9efff, 0xfff1a8],
      }),
    );
    this.sparkles.setDepth(DEPTH_FUZZ - 0.05);
    // The emitter stays at the origin and fires at the fuzz, so the sparkles stay where they were
    // born and the moving fuzz leaves them behind as a trail.
    this.sparkles.startFollow(this.fuzz);

    this.airCounter = this.onWorld(this.add.text(0, 0, '', {
      fontFamily: AIR_FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffffff',
      stroke: AIR_TEXT_STROKE, strokeThickness: 4,
    }));
    this.airCounter.setOrigin(0.5, 1);
    this.airCounter.setResolution(RENDER_SCALE * 2);
    this.airCounter.setDepth(DEPTH_FUZZ + 0.1);
    this.airCounter.setVisible(false);
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
      this.releaseFollow();
    }
    // 2026-10-15: the opening pan on a wide level (held at its start behind Bruno's intro).
    const intro = this.intro;
    if (intro) {
      if (intro.t >= 0) intro.t += Math.min(dtMs, 50);
      this.camCur = introFrame(intro.pan, Math.max(0, intro.t));
      this.applyCamera();
      if (intro.t >= intro.pan.ms) this.endIntro();
      return;
    }
    // While a point is dragged near the panel's edge on a wide level, the edit view scrolls.
    const dt = Math.min(dtMs, 100) / 1000;
    if (this.gesture?.moved && this.dragScreen && this.editable && !this.camFollow) {
      const v = edgeScrollSpeed(this.dragScreen.x);
      if (v !== 0) this.editCx = editFrame(this.editCx + v * dt, this.camWorld).cx;
    }
    let target = editFrame(this.editCx, this.camWorld);
    let lerp = SCROLL_LERP;
    if (this.camFollow && this.fuzz.visible) {
      target = rideTarget(toWorld({ x: this.fuzz.x, y: this.fuzz.y }), this.fuzzVel, RIDE_ZOOM, this.camWorld);
    }
    // The ride's zoom in and out keeps its own pace; a pure scroll at zoom 1 glides quicker.
    if (this.camFollow || Math.abs(this.camCur.zoom - 1) > 1e-4) lerp = FOLLOW_LERP;
    // A long frame (tab switch) must not overshoot or stall: approach maths are exponential, so a
    // clamp on dt only bounds the jump.
    const before = this.camCur.cx;
    this.camCur = stepCamera(this.camCur, target, Math.min(dtMs, 100), this.camWorld, lerp);
    this.applyCamera();
    // The view moved under a dragging finger: the dragged point follows the finger.
    if (this.gesture?.moved && this.dragScreen && Math.abs(this.camCur.cx - before) > 1e-6) this.dragTo(this.dragScreen);
  }

  /** The ride camera lets go: the edit view takes over where the ride left it (the fuzz's spot,
   * clamped), so on a wide level the child sees where the run ended. */
  private releaseFollow(): void {
    if (this.camFollow) this.editCx = editFrame(this.camCur.cx, this.camWorld).cx;
    this.camFollow = false;
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
    // The clouds' own span for this world (one panel on a one-screen level).
    const flyRight = PANEL_X0 + backdropSpanPx(this.worldW, PX_FLYERS.x);
    for (const d of this.drifters) {
      d.x += d.speed * dt;
      const half = d.img.displayWidth / 2;
      // wrap well outside the panel, past the largest parallax shift, so no cloud pops in view
      if (d.x - half > flyRight + 220) d.x = PANEL_X0 - 220 - half;
      const bob = d.bob ? Math.sin(t * 0.9 + d.phase) * d.bob : 0;
      d.img.setPosition(d.x + fly.x, d.y + bob + fly.y);
    }
    this.wheelAngle = (this.wheelAngle + WHEEL_SPEED * dt) % (Math.PI * 2);
    this.wheel.setRotation(this.wheelAngle);
    this.placeWheelCars(parallaxOffset(f, PX_WHEEL.x, PX_WHEEL.y));
  }

  /** A pointer's position on the screen, in stage px (the canvas is RENDER_SCALE x the stage). */
  private screenPoint(pointer: Phaser.Input.Pointer): Vec2 {
    return { x: pointer.x / RENDER_SCALE, y: pointer.y / RENDER_SCALE };
  }

  /** A screen point (stage px) in the world camera's space (zoom and scroll included). The same
   * maths as the camera's own transform (rideCamera.ts screenToStage), applied to the frame the
   * camera shows, so it holds right after a scroll in the same frame. */
  private stagePoint(screen: Vec2): Vec2 {
    return screenToStage(screen, this.camCur);
  }

  /** A world point clamped into the level's world for a point of `kind` (src/core/world.ts). */
  private clampPoint(x: number, y: number, kind: PointKind): Vec2 {
    return clampToWorld({ x, y }, kind, this.worldW, WORLD_H);
  }

  // ---------------- wide levels (2026-10-15) ----------------

  /**
   * The level's world width (src/core/world.ts levelWorldW): the camera's clamp band, the points'
   * clamp and the backdrop's tiles follow it. The edit view goes to the left end (the station) and
   * any opening pan is dropped. Called on every level load.
   */
  setWorld(worldW: number): void {
    const changed = Math.abs(worldW - this.worldW) > 1e-9;
    this.worldW = worldW;
    this.camWorld = coasterCamWorld(worldW);
    this.editCx = editFrameAt(0, this.camWorld).cx;
    this.cancelIntro();
    this.camFollow = false;
    this.camReleaseAt = null;
    this.camCur = editFrame(this.editCx, this.camWorld);
    this.applyCamera();
    if (changed) this.buildBackdropTiles();
  }

  /** The level's world width (m). */
  worldWidth(): number {
    return this.worldW;
  }

  /** Holds the camera on the opening pan's first frame (the flag), behind Bruno's intro; null
   * drops it. `playIntro` starts it. */
  prepareIntro(pan: IntroPan | null): void {
    this.cancelIntro();
    if (!pan) return;
    this.intro = { pan, t: -1, done: null };
    this.camCur = { ...pan.from };
    this.applyCamera();
  }

  /** Starts the held opening pan (flag -> station, a tap skips it); resolves when it is over.
   * Resolves at once when no pan is held. */
  playIntro(): Promise<void> {
    const intro = this.intro;
    if (!intro) return Promise.resolve();
    return new Promise((resolve) => {
      const prev = intro.done;
      intro.done = (): void => {
        prev?.();
        resolve();
      };
      if (intro.t < 0) intro.t = 0;
    });
  }

  /** Jumps a running (or held) opening pan to its end: the station's view. */
  skipIntro(): void {
    if (this.intro) this.endIntro();
  }

  /** The opening pan is held or running (dev checks; taps only skip it meanwhile). */
  isIntroActive(): boolean {
    return this.intro !== null;
  }

  private endIntro(): void {
    const intro = this.intro;
    if (!intro) return;
    this.intro = null;
    this.editCx = intro.pan.to.cx;
    this.camCur = { ...intro.pan.to };
    this.applyCamera();
    intro.done?.();
  }

  /** Drops the opening pan without moving the camera (a new level loads); a waiting promise still
   * resolves, so nothing hangs on it. */
  private cancelIntro(): void {
    const intro = this.intro;
    this.intro = null;
    intro?.done?.();
  }

  /** The scrollbar moved: the edit view glides to `t` of the scrollable range (0 = the left end).
   * Ends an opening pan where it is. No-op on a one-screen level or while the ride camera follows. */
  scrollTo(t: number): void {
    if (this.camFollow || !scrollOf(this.camCur, this.camWorld)) return;
    // A drag on the scrollbar during the opening pan ends it where it is (the child took over).
    this.cancelIntro();
    this.editCx = editFrameAt(t, this.camWorld).cx;
  }

  /** The scrollbar's state (HudState.scroll): where the view the camera is heading for sits and
   * how much it shows; null on a one-screen level and while the ride camera follows the fuzz. */
  scrollState(): { t: number; view: number } | null {
    if (this.camFollow) return null;
    const f = this.intro ? this.camCur : editFrame(this.editCx, this.camWorld);
    return scrollOf(f, this.camWorld);
  }

  /** The camera frame on screen (dev checks: world m centre and zoom). */
  cameraFrame(): FrameState {
    return { ...this.camCur };
  }

  // ---------------- public API ----------------

  getPoints(): TrackPoint[] {
    return clonePoints(this.points);
  }

  setPoints(pts: TrackPoint[]): void {
    this.points = clonePoints(pts);
    this.stopBuildAnims();
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
      this.dragScreen = null;
      this.gestureBefore = null;
      this.activePointerId = null;
      // the ride shows the whole track, settled
      this.stopBuildAnims();
    }
    this.pointsDirty = true;
    this.airDirty = true;
  }

  setTool(tool: EditTool): void {
    this.tool = tool;
  }

  /** The level's editor rules (src/core/editRules.ts): may a tap add or delete, does the station
   * only slide up and down, what Clear goes back to. */
  setRules(rules: EditRules): void {
    this.rules = rules;
  }

  /**
   * The tutorial hand (src/core/coach.ts): the glove drags the station straight up, or taps a world
   * spot; null hides it. In the world (it follows the station under the edit camera), never
   * interactive, and hidden while the child drags or taps. The stroke restarts (with a pop-in)
   * whenever the step changes.
   */
  setCoach(coach: SceneCoach): void {
    const key = coach ? JSON.stringify(coach) : '';
    this.coach = coach;
    if (key !== this.coachKey) {
      this.coachKey = key;
      this.coachStart = this.nowMs;
    }
  }

  /** A finger is down on a point (a drag, or a tap not yet let go). */
  isGestureActive(): boolean {
    return this.gesture !== null;
  }

  /** Where the scene's tutorial hand's fingertip is right now (stage px), or null when it is not
   * drawn (dev checks). */
  coachHandAt(): Vec2 | null {
    const h = this.coachHand;
    return h && h.visible && h.alpha > 0 ? { x: h.x, y: h.y } : null;
  }

  /** The kind of point the current tool places: 'point' -> 'curve', 'loop' -> 'loop'. */
  private toolKind(): PointKind {
    return this.tool === 'loop' ? 'loop' : 'curve';
  }

  setTrack(t: Track | null): void {
    this.track = t;
    this.knotS = t ? knotArcLengths(t.samples, this.points) : [];
    this.trackDirty = true;
    this.airDirty = true;
  }

  // ---------------- track-building juice (2026-10-15) ----------------

  /** Hides the track (rail, beams, handles; the station and the flag stay) until `buildIn`: the
   * level's preset waits behind Bruno's intro. */
  holdBuild(): void {
    this.stopBuildAnims();
    this.buildAnims = [{ kind: 'build', t0: Infinity }];
    this.trackDirty = true;
    this.pointsDirty = true;
    this.airDirty = true;
  }

  /** The held track builds in from the station (about 0.6 s, BUILD_TOTAL_MS). No-op when not held. */
  buildIn(): void {
    const held = this.buildAnims.find((a) => a.kind === 'build' && !Number.isFinite(a.t0));
    if (!held) return;
    held.t0 = this.nowMs;
    this.schedulePuffs(held);
  }

  /** The track is building in or held hidden (dev checks: the build-in's progress, 0..1, or null). */
  buildProgress(): number | null {
    const b = this.buildAnims.find((a) => a.kind === 'build');
    if (!b) return null;
    return Number.isFinite(b.t0) ? Math.min(1, (this.nowMs - b.t0) / BUILD_TOTAL_MS) : 0;
  }

  /** How many build animations and ghosts are running (dev checks). */
  buildAnimCount(): number {
    return this.buildAnims.length + this.ghosts.length;
  }

  private stopBuildAnims(): void {
    this.buildAnims = [];
    this.ghosts = [];
    this.trackDirty = true;
    this.pointsDirty = true;
  }

  private isBuilding(): boolean {
    return this.buildAnims.some((a) => a.kind === 'build');
  }

  private addAnim(a: BuildAnim): void {
    this.buildAnims.push(a);
    this.trackDirty = true;
    this.pointsDirty = true;
  }

  /** Renumbers the running animations after a point was inserted at `at` (delta +1) or deleted from
   * it (delta -1; animations about the deleted point end). */
  private shiftAnims(at: number, delta: 1 | -1): void {
    const sh = (i: number): number => (i >= at ? i + delta : i);
    this.buildAnims = this.buildAnims.flatMap((a): BuildAnim[] => {
      switch (a.kind) {
        case 'build': return [a];
        case 'pop': return delta < 0 && a.index === at ? [] : [{ ...a, index: sh(a.index) }];
        case 'extend': return delta < 0 && a.from >= at - 1 ? [] : [{ ...a, from: sh(a.from) }];
        case 'drop':
        case 'wobble': return delta < 0 && a.a <= at && a.b >= at ? [] : [{ ...a, a: sh(a.a), peak: sh(a.peak), b: sh(a.b) }];
      }
    });
  }

  /** Per frame: drops finished animations; while any run, the track and the handles redraw. */
  private updateBuildAnims(now: number): void {
    if (this.buildAnims.length === 0 && this.ghosts.length === 0) return;
    const wasBuilding = this.isBuilding();
    this.buildAnims = this.buildAnims.filter((a) => !animDone(a, now));
    this.ghosts = this.ghosts.filter((g) => now - g.t0 < GHOST_MS);
    this.trackDirty = true;
    this.pointsDirty = true;
    if (wasBuilding && !this.isBuilding()) this.airDirty = true;
  }

  /** Where a support beam stands at s (the rail's stage point), or null: a post every 4 m where the
   * rail's ride side points mostly up and the rail is more than 1.2 m above the ground. */
  private beamSpot(track: Track, s: number, side: number): Vec2 | null {
    const sample = track.lookup(Math.min(s, track.length));
    const up = { x: -sample.tangent.y * side, y: sample.tangent.x * side };
    if (up.y > 0.6 && sample.pos.y > 1.2) return toPx(sample.pos);
    return null;
  }

  private trackSide(track: Track): number {
    return track.lookup(0).tangent.x >= 0 ? 1 : -1;
  }

  /** A little dust puff at the foot of each beam animation `a` raises, when it starts to rise. */
  private schedulePuffs(a: BuildAnim): void {
    const track = this.track;
    if (!track || !Number.isFinite(a.t0)) return;
    const side = this.trackSide(track);
    for (let s = 0; s <= track.length + 1e-6; s += 4) {
      const spot = this.beamSpot(track, s, side);
      if (!spot) continue;
      const d = beamDelay(a, this.knotS, track.length, s);
      if (d === null) continue;
      const wait = Math.max(0, a.t0 + d - this.nowMs);
      this.time.delayedCall(wait, () => {
        if (this.editable) this.dust.explode(4, spot.x, GROUND_Y - 1);
      });
    }
  }

  /** The tap added point `index` at the end of the rail. */
  private animAppend(index: number): void {
    const now = this.nowMs;
    this.addAnim({ kind: 'pop', index, t0: now });
    if (index > 0) {
      const a: BuildAnim = { kind: 'extend', from: index - 1, t0: now };
      this.addAnim(a);
      this.schedulePuffs(a);
    }
  }

  /** The tap inserted point `index` into the rail. */
  private animInsert(index: number): void {
    const now = this.nowMs;
    this.shiftAnims(index, 1);
    this.addAnim({ kind: 'pop', index, t0: now });
    const a: BuildAnim = { kind: 'drop', a: index - 1, peak: index, b: index + 1, px: INSERT_DROP_PX, t0: now };
    this.addAnim(a);
    this.schedulePuffs(a);
  }

  /** Before point `index` is deleted: the rail it shapes, kept on screen while it goes. */
  private captureGhost(index: number): void {
    const track = this.track;
    if (!track || this.points.length < 2) return;
    const len = track.length;
    const last = index === this.points.length - 1;
    const sA = knot(this.knotS, index - 1, len);
    const sB = last ? len : knot(this.knotS, index + 1, len);
    if (sB - sA < 1e-3) return;
    const side = this.trackSide(track);
    const rail: Vec2[] = [];
    const lower: Vec2[] = [];
    const n = Math.max(2, Math.ceil((sB - sA) / 0.2));
    for (let i = 0; i <= n; i++) {
      const sample = track.lookup(sA + ((sB - sA) * i) / n);
      const up = { x: -sample.tangent.y * side, y: sample.tangent.x * side };
      const p = toPx(sample.pos);
      rail.push(p);
      lower.push({ x: p.x - up.x * RAIL_GAP, y: p.y + up.y * RAIL_GAP });
    }
    const beams: TrackGhost['beams'] = [];
    for (let s = Math.ceil(sA / 4) * 4; s <= sB + 1e-6; s += 4) {
      const spot = this.beamSpot(track, s, side);
      if (spot) beams.push({ x: spot.x, y: spot.y, u: (s - sA) / (sB - sA) });
    }
    this.ghosts.push({ kind: last ? 'retract' : 'sink', t0: this.nowMs, rail, lower, beams });
  }

  /** After point `index` was deleted: the merged rail between its neighbours drops into place. */
  private animDeleted(index: number): void {
    this.shiftAnims(index, -1);
    if (index > 0 && index < this.points.length) {
      const a: BuildAnim = { kind: 'drop', a: index - 1, peak: index - 0.5, b: index, px: INSERT_DROP_PX, t0: this.nowMs };
      this.addAnim(a);
      this.schedulePuffs(a);
    }
    this.trackDirty = true;
  }

  // ---------------- the entrance (2026-10-15) ----------------

  /** Where the waiting fuzz sits on the station deck for a station point at stage `p`. */
  private stationFuzzSpot(p: Vec2): Vec2 {
    const r = FUZZ_R_PX * FUZZ_FUR;
    return { x: Math.max(PANEL_X0 + r - 1, p.x - 24), y: p.y + 10 - FUZZ_R_PX };
  }

  /** Play pressed: the fuzz leaves the deck for the start of the rail (`snap0`, the sim at s = 0). */
  startEntrance(snap0: CartSnapshot): void {
    const first = this.points[0];
    if (!first || !this.track) return;
    this.resetFuzzFallState();
    this.resetFloat();
    this.entering = true;
    this.entranceFrom = this.stationFuzzSpot(toPx(first));
    this.entranceTo = toPx({ x: snap0.pos.x + snap0.up.x * FUZZ_R, y: snap0.pos.y + snap0.up.y * FUZZ_R });
    this.entranceUp = { x: snap0.up.x, y: -snap0.up.y };
    this.entranceTheta = snap0.theta;
    const tx = Math.cos(snap0.theta);
    const ty = Math.sin(snap0.theta);
    this.rollDir = tx * snap0.up.y - ty * snap0.up.x >= 0 ? 1 : -1;
    this.fuzzVel = { x: 0, y: 0 };
    this.fuzz.setVisible(true);
    this.drawEntrance(0);
  }

  /** The entrance `t` ms in (src/core/entrance.ts). */
  drawEntrance(t: number): void {
    if (!this.entering) return;
    const pose = entrancePose(t, this.entranceFrom, this.entranceTo, FUZZ_R_PX, this.entranceUp);
    this.base = {
      x: pose.x, y: pose.y, rot: -this.entranceTheta * pose.tilt, sx: pose.sx, sy: pose.sy,
      upX: this.entranceUp.x, upY: this.entranceUp.y,
    };
    this.rollAngle = this.rollDir * Math.PI * 2 * pose.spin;
    this.setExcited(pose.excited);
  }

  /** The fuzz is hopping onto the rail (dev checks). */
  isEntering(): boolean {
    return this.entering;
  }


  /** The level's air time goal in seconds (the counter's goal pop; the preview shows only when
   * there is one), or null. */
  setAirGoal(goal: number | null): void {
    this.airGoal = goal;
    this.airDirty = true;
  }

  /** The latest air time dry run on the edited track (App, src/core/airPreview.ts), or null. Drawn
   * in edit mode on levels with an air time goal. */
  setAirPreview(p: AirPreview | null): void {
    this.airPreview = p;
    this.airDirty = true;
  }

  /** The ride's air time so far (seconds), for the float counter; set before drawCart each frame. */
  setRideAir(seconds: number): void {
    this.rideAir = seconds;
  }

  /** The air preview's state (dev checks): the stretches drawn, or null when nothing is drawn (no
   * number is ever shown since 2026-10-15). */
  airPreviewShown(): { stretches: AirStretch[] } | null {
    if (!this.airGfx?.visible || !this.airPreview) return null;
    return { stretches: this.airPreview.stretches.map((st) => ({ ...st })) };
  }

  /** The float's state (dev checks): how far the fuzz floats (0..1) and the counter's text. */
  floatShown(): { floatK: number; counter: string | null } {
    return { floatK: this.floatK, counter: this.airCounter.visible && this.airCounter.alpha > 0 ? this.airCounter.text : null };
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
      this.entering = false;
      this.fuzz.setVisible(false);
      this.resetFuzzFallState();
      this.fuzzVel = { x: 0, y: 0 };
      this.setExcited(false);
      this.resetFloat();
      return;
    }
    this.entering = false;
    this.fuzz.setVisible(true);
    this.fuzzVel = snap.outcome === 'running'
      ? { x: snap.v * Math.cos(snap.theta), y: snap.v * Math.sin(snap.theta) }
      : { x: 0, y: 0 };
    // Excited while fast or flying; a fall keeps the excited (alarmed) face, a calm stop the normal one.
    this.setExcited(snap.outcome === 'fell' || excitedPose(this.excited, snap.v, snap.airborne));

    if (snap.outcome === 'running') this.resetFuzzFallState();

    const center = { x: snap.pos.x + snap.up.x * FUZZ_R, y: snap.pos.y + snap.up.y * FUZZ_R };
    const centerPx = toPx(center);

    // Gentle squash: 6 g squashes to 0.85, weightless stretches to 1.08; and (2026-10-15) a stretch
    // along the rail with speed, up to 1.14 long at 26 m/s.
    const gSquash = clamp(1 / (0.9 + 0.1 * Math.max(snap.gNormal, 0)), 0.85, 1.08);
    const stretch = speedStretch(snap.v);
    const sy = gSquash / stretch;
    const sx = stretch / gSquash;

    // The float: eased up off the rail while airborne, back down after (never a pop).
    const dtMs = this.lastCartMs === null ? 16 : clamp(this.nowMs - this.lastCartMs, 0, 100);
    this.lastCartMs = this.nowMs;
    const floating = snap.airborne && snap.outcome === 'running';
    const tau = floating ? FLOAT_IN_MS : FLOAT_OUT_MS;
    this.floatK += ((floating ? 1 : 0) - this.floatK) * (1 - Math.exp(-dtMs / tau));
    if (this.floatK < 0.01 && !floating) this.floatK = 0;
    const liftTarget = LIFT_MIN_PX + (LIFT_MAX_PX - LIFT_MIN_PX) * clamp((0.3 - snap.gNormal) / 0.5, 0, 1);
    const liftPx = this.floatK * liftTarget;
    const stageUpX = snap.up.x;
    const stageUpY = -snap.up.y;

    // The pose before the juice; applyFuzzPose adds the flip, the landing squish and the happy bounce.
    this.base = { x: centerPx.x + stageUpX * liftPx, y: centerPx.y + stageUpY * liftPx, rot: -snap.theta, sx, sy, upX: stageUpX, upY: stageUpY };

    // The shadow it leaves on the rail, fainter and smaller the higher it floats; the sparkle trail.
    const railPx = toPx(snap.pos);
    const showShadow = this.floatK > 0.05 && !this.fuzzFellStarted && snap.outcome === 'running';
    this.floatShadow.setVisible(showShadow);
    if (showShadow) {
      const k = liftPx / LIFT_MAX_PX;
      this.floatShadow.setPosition(railPx.x, railPx.y);
      this.floatShadow.setRotation(-snap.theta);
      this.floatShadow.setScale(1 - 0.3 * k, 1 - 0.3 * k);
      this.floatShadow.setAlpha(this.floatK * (1 - 0.4 * k));
    }
    this.sparkles.emitting = floating && this.floatK > 0.4;

    // The counter's goal pop: the ride's air time just crossed the level's goal.
    const goal = this.airGoal;
    if (goal !== null && this.prevRideAir < goal - 1e-9 && this.rideAir >= goal - 1e-9) this.popAirGoal();
    this.prevRideAir = this.rideAir;
    if (floating) this.counterSeenAt = this.nowMs;

    // Rolling: moving forward along s, a ball on top of the rail turns clockwise on screen
    // (positive rotation in Phaser). When the ride side is the right normal it turns the other way.
    const tx = Math.cos(snap.theta);
    const ty = Math.sin(snap.theta);
    const onLeftNormal = tx * snap.up.y - ty * snap.up.x >= 0;
    this.rollDir = onLeftNormal ? 1 : -1;
    this.rollAngle = this.rollDir * (snap.s / FUZZ_R);

    // 2026-10-15 (Jon: "when it jumps, the fuzz squishes a bit ... maybe a little backflip if it
    // reaches a second in the air"): a hard landing squishes it, one second of air in one go earns a
    // backflip, and the end of the track a happy bounce. Cosmetic (src/core/rideJuice.ts).
    if (snap.outcome === 'running') {
      const hit = landingHit(this.prevG, snap.gNormal, this.prevAirborne);
      if (hit > 0 && this.nowMs - this.landAt > 220) {
        this.landAt = this.nowMs;
        this.landK = hit;
      }
      if (this.flipTrigger.update(floating, dtMs / 1000) && !flipPose(this.nowMs - this.flipAt).active) {
        this.flipAt = this.nowMs;
        this.flipRoll = this.rollAngle + this.spinOffset;
        this.flipBaked = false;
        this.sparkles.explode(12);
      }
    }
    this.prevG = snap.gNormal;
    this.prevAirborne = snap.airborne;
    if (snap.outcome === 'reachedEnd' && this.happyAt === -Infinity) this.happyAt = this.nowMs;

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

  /**
   * Puts the drawn fuzz where it goes this frame: the base pose (the ride's drawCart or the entrance)
   * plus the juice: a backflip (the face's roll held while it turns once backwards, with a little
   * extra lift), the landing squish and the happy bounce at the end. The fall's tumble owns the fuzz
   * once it starts.
   */
  private applyFuzzPose(): void {
    if (!this.fuzz.visible || this.fuzzFellStarted) return;
    const b = this.base;
    const now = this.nowMs;
    let lift = 0;
    /** The happy bounce hops straight up the screen, whatever the rail's slope at the end. */
    let hop = 0;
    let squish = 1;
    let spin = this.rollAngle + this.spinOffset;
    if (!this.entering) {
      const f = flipPose(now - this.flipAt);
      if (f.active) {
        spin = this.flipRoll - this.rollDir * Math.PI * 2 * f.turns;
        lift += f.liftPx;
      } else if (!this.flipBaked) {
        // The flip is over: roll on from where it left the face (a whole turn, so no jump).
        this.spinOffset = this.flipRoll - this.rollAngle;
        this.flipBaked = true;
        spin = this.rollAngle + this.spinOffset;
      }
      squish *= landingSquish(now - this.landAt, this.landK);
      const h = happyBounce(now - this.happyAt);
      hop = h.liftPx;
      squish *= h.sy;
    }
    this.fuzz.setPosition(b.x + b.upX * lift, b.y + b.upY * lift - hop);
    this.fuzz.setRotation(b.rot);
    this.fuzz.setScale(b.sx / squish, b.sy * squish);
    this.fuzzSpin.rotation = spin;
  }

  /** Back on the rail, no trail, no counter (a new ride, Stop, or the next level). */
  private resetFloat(): void {
    this.flipTrigger.reset();
    this.flipAt = -Infinity;
    this.flipBaked = true;
    this.spinOffset = 0;
    this.landAt = -Infinity;
    this.landK = 0;
    this.prevG = 1;
    this.prevAirborne = false;
    this.happyAt = -Infinity;
    this.floatK = 0;
    this.lastCartMs = null;
    this.rideAir = 0;
    this.prevRideAir = 0;
    this.counterSeenAt = -Infinity;
    this.goalPopAt = -Infinity;
    this.floatShadow?.setVisible(false);
    if (this.sparkles) this.sparkles.emitting = false;
    if (this.airCounter) {
      this.tweens.killTweensOf(this.airCounter);
      this.airCounter.setVisible(false);
      this.airCounter.setScale(1);
    }
  }

  /** The goal met mid-ride: the counter (still the time) grows and settles in gold, and a little
   * burst of sparkles goes off around the fuzz. */
  private popAirGoal(): void {
    this.goalPopAt = this.nowMs;
    this.counterSeenAt = this.nowMs;
    this.tweens.killTweensOf(this.airCounter);
    this.airCounter.setScale(0.6);
    this.tweens.add({ targets: this.airCounter, scaleX: 1.25, scaleY: 1.25, duration: 220, ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({ targets: this.airCounter, scaleX: 1, scaleY: 1, duration: 260, ease: 'Quad.easeInOut' }) });
    this.sparkles.explode(18);
  }

  /**
   * The float counter over the fuzz (levels with an air time goal): shown while floating and for a
   * beat after, counting the ride's air time in tenths; then it fades. White on navy while it counts,
   * gold while the goal pop holds, green once the goal is met.
   */
  private updateAirCounter(): void {
    const c = this.airCounter;
    if (!c) return;
    if (this.airGoal === null || !this.fuzz.visible || this.fuzzFellStarted) {
      c.setVisible(false);
      return;
    }
    const popping = this.nowMs - this.goalPopAt < GOAL_POP_HOLD_MS;
    const since = this.nowMs - this.counterSeenAt;
    const alpha = popping || since <= COUNTER_HOLD_MS ? 1 : 1 - (since - COUNTER_HOLD_MS) / COUNTER_FADE_MS;
    if (alpha <= 0) {
      c.setVisible(false);
      return;
    }
    const text = airCounterText(this.rideAir);
    if (c.text !== text) c.setText(text);
    const met = this.rideAir >= this.airGoal - 1e-9;
    c.setColor(popping ? '#ffd23d' : met ? '#b8f59a' : '#ffffff');
    c.setPosition(this.fuzz.x, this.fuzz.y - FUZZ_R_PX - 10);
    c.setAlpha(alpha);
    c.setVisible(true);
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
      // Play during a wide level's opening pan: the pan ends on the station, the ride takes over.
      this.skipIntro();
      this.camFollow = true;
      this.camReleaseAt = null;
    } else if (holdMs > 0 && this.camFollow) {
      this.camReleaseAt = this.nowMs + holdMs;
    } else {
      this.releaseFollow();
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
    this.stopBuildAnims();
    this.points = prev;
    this.pointsDirty = true;
    this.emitPointsChanged();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Removes only unlocked points, leaving locked (level-placed) points in place; on a level where
   * nothing may be added it resets to the preset instead (clearedPoints). No-op (and no undo push)
   * when nothing would change. */
  clear(): void {
    const kept = clearedPoints(this.rules, this.points);
    if (samePoints(kept, this.points)) return;
    this.pushUndo(clonePoints(this.points));
    this.stopBuildAnims();
    this.points = kept;
    this.pointsDirty = true;
    this.emitPointsChanged();
  }

  // ---------------- gestures ----------------

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // 2026-10-15: a tap during a wide level's opening pan skips it (and does nothing else).
    if (this.intro && this.intro.t >= 0 && pointer.isDown) {
      this.skipIntro();
      return;
    }
    if (!this.editable) {
      // A tap while the fuzz hops on skips the hop.
      if (this.entering) this.onEntranceSkip?.();
      return;
    }
    if (!pointer.isDown) return;
    if (this.activePointerId !== null) return; // ignore a second concurrent pointer

    // Only inside the world panel on the screen, and inside the level's world (it may scroll).
    const screen = this.screenPoint(pointer);
    if (!inPanel(screen)) return;
    const { x: sx, y: sy } = this.stagePoint(screen);
    if (sx < WORLD_X0 || sx > ORIGIN_X + this.worldW * PPM || sy < WORLD_Y0 || sy > WORLD_Y1) return;
    this.dragScreen = screen;

    // The "▶" bubble over the waiting fuzz starts the ride, like the bar's Play.
    if (this.playBubble.visible && Math.hypot(sx - this.playBubbleAt.x, sy - this.playBubbleAt.y) <= PLAY_BUBBLE_R + 6) {
      this.onPlayTap?.();
      return;
    }

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
      if (!canGrab(this.points, bestIdx)) return; // locked: no gesture, no delete
      this.activePointerId = pointer.id;
      this.gestureBefore = clonePoints(this.points);
      this.gesture = { index: bestIdx, startPx: { x: sx, y: sy }, moved: false, isNew: false };
      return;
    }

    // A level where nothing may be added (level 1): a tap off the points does nothing.
    if (!this.rules.canAdd) return;

    const w = toWorld({ x: sx, y: sy });
    const { x: wx, y: wy } = this.clampPoint(w.x, w.y, this.toolKind());

    if (this.track) {
      // A tap on the rail goes into the rail there; on a prebuilt-track level a tap on the sky over
      // the open stretch goes into that stretch (src/core/trackPoints.ts openGapIndex).
      const i = insertionIndex(this.points, { x: wx, y: wy }, HIT_RADIUS / PPM) ?? openGapIndex(this.points, wx);
      if (i !== null) {
        this.activePointerId = pointer.id;
        this.gestureBefore = clonePoints(this.points);
        const insertAt = i + 1;
        this.points.splice(insertAt, 0, { x: wx, y: wy, kind: this.toolKind() });
        this.gesture = { index: insertAt, startPx: { x: sx, y: sy }, moved: false, isNew: true };
        this.pointsDirty = true;
        this.emitPointsChanged();
        this.animInsert(insertAt);
        return;
      }
    }

    // The track already ends on the flag at a locked point (a prebuilt finale): nothing to append.
    if (!canAppend(this.points, this.finish)) return;

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
    this.animAppend(this.points.length - 1);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.editable) return;
    if (!this.gesture || pointer.id !== this.activePointerId) return;
    const screen = this.screenPoint(pointer);
    this.dragScreen = screen;
    this.dragTo(screen);
  }

  /** The dragged point goes under the finger at `screen` (a pointer move, or the view scrolled
   * under a still finger on a wide level). */
  private dragTo(screen: Vec2): void {
    if (!this.gesture) return;
    const { x: sx, y: sy } = this.stagePoint(screen);
    // The threshold is measured on the screen-side stage point (a scroll moves it too).
    const dist = Math.hypot(sx - this.gesture.startPx.x, sy - this.gesture.startPx.y);
    if (dist > MOVE_THRESHOLD) this.gesture.moved = true;

    // Dragging a loop point moves the whole loop: the loop shape is expanded from this single
    // point (its bottom) by the app before buildTrack, so moving the point is all that's needed.
    const prevKind = this.points[this.gesture.index]!.kind;
    // A vertical-only station (level 1) or hilltop (the air time lesson) keeps its x (dragTarget).
    const w = dragTarget(this.rules, this.points, this.gesture.index, toWorld({ x: sx, y: sy }));
    const { x: wx, y: wy } = this.clampPoint(w.x, w.y, prevKind);
    // Keeps the point's flags (a vertical-only hilltop stays vertical-only).
    this.points[this.gesture.index] = { ...this.points[this.gesture.index]!, x: wx, y: wy, kind: prevKind };
    this.pointsDirty = true;
    this.emitPointsChanged();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.gesture || pointer.id !== this.activePointerId) return;

    const g = this.gesture;
    this.dragScreen = null;
    let deleted = -1;
    if (!g.moved && !g.isNew && canDeletePoint(this.rules, this.points, g.index)) {
      // The rail it shaped stays on screen a moment, retracting or sinking away (drawing only).
      this.captureGhost(g.index);
      this.points.splice(g.index, 1);
      deleted = g.index;
    }
    // A tap that changed nothing (a no-delete level) leaves no undo step behind.
    const before = this.gestureBefore ?? [];
    if (!samePoints(before, this.points)) this.pushUndo(before);

    this.gesture = null;
    this.gestureBefore = null;
    this.activePointerId = null;

    this.pointsDirty = true;
    this.emitPointsChanged();
    if (deleted >= 0) this.animDeleted(deleted);
    else if (g.moved) this.addAnim({ kind: 'wobble', a: g.index - 1, peak: g.index, b: g.index + 1, t0: this.nowMs });
  }

  // ---------------- helpers ----------------

  private pushUndo(snapshot: TrackPoint[]): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
  }

  private emitPointsChanged(): void {
    this.onPointsChanged?.(clonePoints(this.points));
  }

  // ---------------- the tutorial hand ----------------

  /**
   * Draws this frame's tutorial hand (setCoach). 'drag': the glove presses on the point's handle
   * (the station, or the air time lesson's hilltop), slides straight up `risePx` while pressed, lets go and fades (dragHandPose), with
   * a faint dotted arrow showing the way up. 'tap': the glove taps the spot (tapHandFrame). Hidden
   * in play mode and while a gesture is in progress.
   */
  private drawCoach(): void {
    const c = this.coach;
    const target = c && c.kind === 'drag' ? this.points[c.index] : undefined;
    const risePx = c && c.kind === 'drag' ? c.risePx : 0;
    let tip: Vec2 | null = null;
    let frame: 0 | 1 | 2 = 0;
    let alpha = 1;
    let arrowFrom: Vec2 | null = null;
    /** The ghost station handle the glove carries up while pressed (-1: none). */
    let ghostRise = -1;
    const t = this.nowMs - this.coachStart;
    const visible = !!c && this.editable && !this.gesture;
    if (visible && c.kind === 'drag' && target) {
      const p = toPx(target);
      const pose = dragHandPose(t);
      tip = { x: p.x + COACH_TIP_OFFSET.x, y: p.y + COACH_TIP_OFFSET.y - pose.rise * risePx };
      frame = pose.frame;
      alpha = pose.alpha;
      arrowFrom = p;
      if (pose.frame === 2 || pose.rise > 0) ghostRise = pose.rise;
    } else if (visible && c.kind === 'tap') {
      const p = toPx(c.at);
      tip = { x: p.x, y: p.y };
      frame = tapHandFrame(t);
    }

    if (!tip || alpha <= 0) {
      this.coachHand?.setVisible(false);
      this.coachHandShadow?.setVisible(false);
      this.coachArrow?.setVisible(false);
      if (!tip) return;
    }
    let hand = this.coachHand;
    let shadow = this.coachHandShadow;
    let arrow = this.coachArrow;
    if (!hand || !shadow || !arrow) {
      // The kit's recipe: a darker, fainter copy of the glove drawn first, 4 px lower.
      arrow = this.onWorld(this.add.graphics());
      arrow.setDepth(DEPTH_COACH - 0.02);
      shadow = this.onWorld(this.add.image(0, 0, COACH_HAND_KEYS[0]));
      shadow.setTint(0x000000);
      shadow.setDepth(DEPTH_COACH - 0.01);
      hand = this.onWorld(this.add.image(0, 0, COACH_HAND_KEYS[0]));
      hand.setDepth(DEPTH_COACH);
      this.coachHand = hand;
      this.coachHandShadow = shadow;
      this.coachArrow = arrow;
    }

    // The faint dotted arrow up from the station (drag step only), drawn whenever the step is on,
    // even in the pause between strokes.
    arrow.clear();
    if (arrowFrom) {
      const x = arrowFrom.x;
      const y0 = arrowFrom.y - 20;
      const y1 = arrowFrom.y - risePx;
      arrow.fillStyle(COLORS.white, 0.55);
      for (let y = y0; y > y1 + 10; y -= 10) arrow.fillCircle(x, y, 2.2);
      arrow.fillTriangle(x - 8, y1 + 10, x + 8, y1 + 10, x, y1 - 2);
      if (ghostRise >= 0 && alpha > 0) {
        const gy = arrowFrom.y - ghostRise * risePx;
        arrow.fillStyle(COLORS.orange, 0.5 * alpha);
        arrow.fillCircle(x, gy, 13);
        arrow.lineStyle(2, COLORS.white, 0.7 * alpha);
        arrow.strokeCircle(x, gy, 13);
      }
      arrow.setVisible(true);
    } else {
      arrow.setVisible(false);
    }
    if (alpha <= 0) return;

    // Pop in when the step starts (the kit's 300 ms grow).
    const tIn = Math.min(1, Math.max(0, t / COACH_IN_MS));
    const grow = tIn >= 1 ? 1 : 0.3 + 0.7 * Phaser.Math.Easing.Back.Out(tIn);
    const key = COACH_HAND_KEYS[frame];
    for (const img of [shadow, hand]) {
      img.setTexture(key);
      img.setDisplaySize(COACH_HAND_W_PX * grow, COACH_HAND_H_PX * grow);
      img.setOrigin(COACH_HAND_FX, COACH_HAND_FY);
    }
    const a = alpha * Math.min(1, tIn * 1.5);
    shadow.setPosition(tip.x, tip.y + 4);
    shadow.setAlpha(0.35 * a);
    shadow.setVisible(true);
    hand.setPosition(tip.x, tip.y);
    hand.setAlpha(a);
    hand.setVisible(true);
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

  /**
   * The air preview (edit mode, the air time lesson only): each floaty stretch of rail turns light
   * blue (a blue-edged light-blue rail with a shine line over the red one, a soft white halo under
   * it). No number (2026-10-15). The stretches come from the latest dry run, which trails a drag by
   * up to 100 ms. Hidden while the track builds in.
   */
  private redrawAirPreview(): void {
    const g = this.airGfx;
    const core = this.airCoreGfx;
    g.clear();
    core.clear();
    const track = this.track;
    const pv = this.airPreview;
    const show = this.editable && !this.isBuilding() && !!track && !!pv && pv.stretches.length > 0;
    g.setVisible(show);
    core.setVisible(show);
    if (!show || !track || !pv) return;

    for (const st of pv.stretches) {
      const pts: Vec2[] = [];
      const s1 = Math.min(st.s1, track.length);
      for (let s = Math.max(0, st.s0); s < s1; s += 0.25) pts.push(toPx(track.lookup(s).pos));
      pts.push(toPx(track.lookup(s1).pos));
      if (pts.length < 2) {
        const p = pts[0]!;
        pts.push({ x: p.x + 0.5, y: p.y });
      }
      // A soft white halo under the rail, then the stretch of rail itself repainted light blue
      // over the red one (light blue alone vanishes against the sky; the rail turning blue reads).
      this.strokePolyline(g, pts, 30, AIR_GLOW, 0.18);
      this.strokePolyline(g, pts, 20, AIR_GLOW, 0.32);
      this.strokePolyline(core, pts, 10, AIR_EDGE, 1);
      this.strokePolyline(core, pts, 6, AIR_RAIL, 1);
      this.strokePolyline(core, pts, 2, AIR_SHINE, 0.9, -1.5);
    }
  }

  /**
   * The rail, its lower rail and ties, and the support posts. While a build animation runs
   * (src/core/buildJuice.ts) only the revealed part is drawn, each part lifted by its drop offset,
   * and each post as high as it has risen; removed rail (ghosts) is drawn going away underneath.
   */
  private redrawTrack(): void {
    this.supportGfx.clear();
    this.trackGfx.clear();
    const now = this.nowMs;
    this.drawGhosts(now);
    const track = this.track;
    if (!track) return;

    const samples = track.samples;
    if (samples.length === 0) return;
    const len = track.length;
    const anims = this.buildAnims;
    const juiced = anims.length > 0;
    const knots = this.knotS;
    const reveal = juiced ? railReveal(anims, knots, len, now) : len;
    if (reveal <= 1e-3) return;
    const off = (s: number): number => (juiced ? railOffset(anims, knots, len, s, now) : 0);

    // ---- supports: a post every 4m where the rail normal points mostly up
    // and the rail sits more than 1.2m above the ground ----
    // The ride side follows the start direction (same rule as the sim), so the top of a
    // loop, where the fuzz hangs upside down, gets no post.
    const side = this.trackSide(track);
    this.supportGfx.lineStyle(3, POST_COLOR, 0.6);
    for (let s = 0; s <= Math.min(len, reveal) + 1e-6; s += 4) {
      const p = this.beamSpot(track, s, side);
      if (!p) continue;
      const rise = juiced ? Math.min(1, beamRise(anims, knots, len, s, now)) : 1;
      if (rise <= 0) continue;
      const top = p.y + off(s);
      this.supportGfx.lineBetween(p.x, GROUND_Y, p.x, GROUND_Y - (GROUND_Y - top) * rise);
    }

    // ---- lower rail and ties: a thin second rail 8 px under the main rail (along -up),
    // with a cream tie between the two rails every 1 m ----
    const under = (sample: { s: number; pos: Vec2; tangent: Vec2 }): { p: Vec2; q: Vec2 } => {
      const up = { x: -sample.tangent.y * side, y: sample.tangent.x * side };
      const p = toPx(sample.pos);
      p.y += off(sample.s);
      // stage direction of world "up" is (up.x, -up.y)
      return { p, q: { x: p.x - up.x * RAIL_GAP, y: p.y + up.y * RAIL_GAP } };
    };
    this.supportGfx.lineStyle(2, TIE_COLOR, 0.9);
    for (let s = 0; s <= reveal + 1e-6; s += 1) {
      const { p, q } = under(track.lookup(Math.min(s, len)));
      this.supportGfx.lineBetween(p.x, p.y, q.x, q.y);
    }
    const lowerPts: Vec2[] = [];
    const stagePts: Vec2[] = [];
    for (let i = 0; i < samples.length; i += 2) {
      const sample = samples[i]!;
      if (sample.s > reveal) break;
      const u = under(sample);
      lowerPts.push(u.q);
      stagePts.push(u.p);
    }
    // ---- the rail ends exactly at the reveal (the last sample when it is all shown) ----
    const end = under(reveal >= len ? samples[samples.length - 1]! : track.lookup(reveal));
    lowerPts.push(end.q);
    stagePts.push(end.p);
    this.strokePolyline(this.supportGfx, lowerPts, 3, TRACK_DARK_RED, 1);

    this.strokePolyline(this.trackGfx, stagePts, 9, TRACK_DARK_RED, 1);
    this.strokePolyline(this.trackGfx, stagePts, 5, TRACK_RED, 1);
    this.strokePolyline(this.trackGfx, stagePts, 1.5, TRACK_HIGHLIGHT, 0.6, -1.5);
  }

  /** Removed rail going away: a removed tail retracts toward the rail that stays, a removed middle
   * stretch sinks and fades; their posts sink into the ground. */
  private drawGhosts(now: number): void {
    for (const g of this.ghosts) {
      const t = now - g.t0;
      let rail = g.rail;
      let lower = g.lower;
      let alpha = 1;
      let dy = 0;
      if (g.kind === 'retract') {
        const n = Math.max(1, Math.round((rail.length - 1) * ghostRetract(t)));
        rail = rail.slice(0, n + 1);
        lower = lower.slice(0, n + 1);
      } else {
        const k = ghostSink(t);
        alpha = k.alpha;
        dy = k.offsetPx;
      }
      if (alpha <= 0.01) continue;
      this.supportGfx.lineStyle(3, POST_COLOR, 0.6 * alpha);
      for (const b of g.beams) {
        const h = ghostBeam(t, g.kind === 'retract' ? 1 - b.u : b.u);
        if (h <= 0) continue;
        this.supportGfx.lineBetween(b.x, GROUND_Y, b.x, GROUND_Y - (GROUND_Y - b.y - dy) * h);
      }
      const shift = (pts: Vec2[]): Vec2[] => (dy ? pts.map((p) => ({ x: p.x, y: p.y + dy })) : pts);
      if (rail.length < 2) continue;
      this.strokePolyline(this.supportGfx, shift(lower), 3, TRACK_DARK_RED, alpha);
      const r = shift(rail);
      this.strokePolyline(this.trackGfx, r, 9, TRACK_DARK_RED, alpha);
      this.strokePolyline(this.trackGfx, r, 5, TRACK_RED, alpha);
      this.strokePolyline(this.trackGfx, r, 1.5, TRACK_HIGHLIGHT, 0.6 * alpha, -1.5);
    }
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
    const at = this.stationFuzzSpot(p);
    this.stationFuzz.setPosition(at.x, at.y);
    this.stationFuzz.setDepth(this.points[0]?.locked ? DEPTH_POINTS + 0.1 : DEPTH_STATION_FUZZ);
    this.stationFuzz.setVisible(true);
    // The "▶" bubble floats over the canopy, above the waiting fuzz; for a station high in the sky
    // (where the goals panel sits over the scene's top-left) it hangs under the deck instead,
    // pointing up at the fuzz.
    const x = Math.max(PANEL_X0 + PLAY_BUBBLE_R + 3, at.x);
    const over = at.y + FUZZ_R_PX - PLAY_BUBBLE_RISE;
    this.playBubbleBelow = over - PLAY_BUBBLE_R < PLAY_BUBBLE_MIN_Y;
    this.playBubbleAt = { x, y: this.playBubbleBelow ? p.y + 10 + 34 : over };
  }

  /**
   * The "▶" bubble over the waiting fuzz (2026-10-15, Jon: "put the play button where the fuzz is"):
   * a small green speech bubble with a white play triangle, pointing down at the fuzz. A tap starts
   * the ride like the bar's Play (which stays). Shown in edit mode once the track has built in, and
   * not while a finger is on the track or the tutorial hand is out.
   */
  private createPlayBubble(): void {
    const g = this.add.graphics();
    const r = PLAY_BUBBLE_R;
    g.fillStyle(0x000000, 0.22);
    g.fillCircle(0, 2.5, r + 1.5);
    g.fillStyle(COLORS.white, 1);
    g.fillCircle(0, 0, r + 2);
    g.fillTriangle(-5, r - 1, 5, r - 1, 0, r + 7);
    g.fillStyle(0x3f9e2c, 1);
    g.fillCircle(0, 0, r);
    g.fillTriangle(-3.5, r - 2, 3.5, r - 2, 0, r + 4.5);
    g.fillStyle(COLORS.white, 1);
    g.fillTriangle(-3.5, -6.5, -3.5, 6.5, 7.5, 0);
    this.playBubble = this.onWorld(this.add.container(0, 0, [g]));
    this.playBubble.setDepth(DEPTH_POINTS + 0.15);
    this.playBubble.setVisible(false);
  }

  private updatePlayBubble(time: number): void {
    const show = this.editable && !!this.track && this.points.length > 0 && this.buildAnims.length === 0 &&
      !this.gesture && this.coach === null;
    this.playBubble.setVisible(show);
    if (!show) return;
    // A gentle bob and breathe, so it reads as something to tap.
    const ph = (time / 900) * Math.PI * 2;
    this.playBubble.setPosition(this.playBubbleAt.x, this.playBubbleAt.y + Math.sin(ph) * 2);
    const k = 1 + 0.05 * Math.sin(ph + Math.PI / 2);
    // Upside down under the deck: the tail points up at the fuzz (the ▶ is symmetric top to bottom).
    this.playBubble.setScale(k, this.playBubbleBelow ? -k : k);
  }

  /** Where the "▶" bubble is (stage px), or null when hidden (dev checks). */
  playBubbleShown(): Vec2 | null {
    return this.playBubble.visible ? { ...this.playBubbleAt } : null;
  }

  /**
   * A vertical-only handle (the air time lesson's hilltop): the station's orange handle with its
   * pulsing halo (it is the one thing to drag), and a small white chevron above and below it that
   * say "up and down".
   */
  private drawVerticalHandle(p: Vec2): void {
    const g = this.pointsGfx;
    g.fillStyle(COLORS.orange, 1);
    g.fillCircle(p.x, p.y, 12);
    g.lineStyle(2, COLORS.white, 1);
    g.strokeCircle(p.x, p.y, this.stationRingR - 1);
    for (const dir of [-1, 1]) {
      const tipY = p.y + dir * 25;
      const baseY = p.y + dir * 18;
      g.fillStyle(LOCKED_COLOR, 0.55);
      g.fillTriangle(p.x - 7, baseY + dir * 1.5, p.x + 7, baseY + dir * 1.5, p.x, tipY + dir * 1.5);
      g.fillStyle(COLORS.white, 1);
      g.fillTriangle(p.x - 6, baseY, p.x + 6, baseY, p.x, tipY);
    }
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

    // 2026-10-15: while a build animation runs, each handle rides its rail's drop offset and pops
    // in (src/core/buildJuice.ts); every handle is drawn at the origin of a translated canvas.
    const anims = this.buildAnims;
    const juiced = anims.length > 0;
    const len = this.track?.length ?? 0;
    const now = this.nowMs;
    const g = this.pointsGfx;
    const p = { x: 0, y: 0 };
    for (let i = 0; i < this.points.length; i++) {
      const pt = this.points[i]!;
      const at = toPx(pt);
      const k = juiced && this.track ? pointScale(anims, this.knotS, len, i, now) : 1;
      if (k <= 0.02) continue;
      const dy = juiced && this.track ? railOffset(anims, this.knotS, len, knot(this.knotS, i, len), now) : 0;
      g.save();
      g.translateCanvas(at.x, at.y + dy);
      if (k !== 1) g.scaleCanvas(k, k);
      this.drawHandle(i, pt, p);
      g.restore();
    }
  }

  /** One control point's handle, drawn around `p`. */
  private drawHandle(i: number, pt: TrackPoint, p: Vec2): void {
    const g = this.pointsGfx;
    const isStation = i === 0;
    const locked = !!pt.locked;

    if (pt.kind === 'loop') {
      const ringColor = locked ? LOCKED_COLOR : COLORS.orange;
      g.lineStyle(4, ringColor, 1);
      g.strokeCircle(p.x, p.y, 11);
      g.fillStyle(ringColor, 1);
      g.fillCircle(p.x, p.y, 3);
      g.lineStyle(1.5, COLORS.white, 1);
      g.strokeCircle(p.x, p.y, 13);
      if (locked) this.drawPadlockMark(p);
      return;
    }

    if (pt.vertical && !locked) {
      this.drawVerticalHandle(p);
      return;
    }

    const r = isStation ? 13 : 9;
    if (locked) {
      g.fillStyle(LOCKED_COLOR, 1);
      g.fillCircle(p.x, p.y, r);
      g.lineStyle(2, COLORS.white, 1);
      g.strokeCircle(p.x, p.y, r);
      this.drawPadlockMark(p);
    } else if (isStation) {
      g.fillStyle(COLORS.orange, 1);
      g.fillCircle(p.x, p.y, 13);
      g.lineStyle(2, COLORS.white, 1);
      g.strokeCircle(p.x, p.y, this.stationRingR); // pulsing halo, 13..15px
    } else {
      g.fillStyle(COLORS.blue, 1);
      g.fillCircle(p.x, p.y, 9);
      g.lineStyle(2, COLORS.white, 1);
      g.strokeCircle(p.x, p.y, 9);
    }
  }

  /**
   * The finish (2026-10-15, Jon: "finish line hard to see"): a glowing ring on the ground zone that
   * breathes, a tall pole (5.75 m) with a gold knob, and a big checkered flag (6 x 4 cells of 7 px)
   * waving gently from it, drawn under the point handles so the end point stays on top. Redrawn every
   * frame (a few dozen shapes). Turns green once `finishReached` is set.
   */
  private redrawFinish(): void {
    const g = this.finishGfx;
    g.clear();
    const zone = this.finish;
    if (!zone) return;

    const center = toPx(zone);
    const rPx = zone.r * PPM;
    const reached = this.finishReached;
    const t = this.finishTime / 1000;
    const ring = reached ? COLORS.green : FINISH_GOLD;

    // The zone: a soft glow disc, a breathing outer halo and a solid ring.
    const breathe = (Math.sin(t * 3.2) + 1) / 2;
    g.fillStyle(reached ? COLORS.green : COLORS.white, reached ? 0.2 : 0.14);
    g.fillCircle(center.x, center.y, rPx);
    g.lineStyle(6, ring, 0.18 + 0.2 * breathe);
    g.strokeCircle(center.x, center.y, rPx + 4 + 3 * breathe);
    g.lineStyle(3, COLORS.white, 0.85);
    g.strokeCircle(center.x, center.y, rPx);
    g.lineStyle(2, ring, 1);
    g.strokeCircle(center.x, center.y, rPx - 2.5);

    // The pole: a dark outline, a white pole, a gold knob.
    const poleTopY = center.y - FINISH_POLE_H;
    g.fillStyle(FLAG_DARK, 0.9);
    g.fillRect(center.x - 3, poleTopY, 6, FINISH_POLE_H);
    g.fillStyle(reached ? COLORS.green : COLORS.white, 1);
    g.fillRect(center.x - 1.5, poleTopY, 3, FINISH_POLE_H);
    g.fillStyle(FLAG_DARK, 0.9);
    g.fillCircle(center.x, poleTopY - 1, 5.5);
    g.fillStyle(FINISH_GOLD, 1);
    g.fillCircle(center.x, poleTopY - 1, 4);

    // The flag: columns of cells, each column edge riding a travelling wave that grows away from
    // the pole (the pole side holds still).
    const flagX = center.x + 3;
    const flagY = poleTopY + 3;
    const h = FINISH_ROWS * FINISH_CELL;
    const edgeX: number[] = [];
    const edgeY: number[] = [];
    for (let c = 0; c <= FINISH_COLS; c++) {
      const u = c / FINISH_COLS;
      edgeX.push(flagX + c * FINISH_CELL * (1 - 0.03 * u));
      edgeY.push(flagY + Math.sin(t * 5 - c * 0.9) * 3.2 * u);
    }
    // A dark backing one px bigger all round, so the white cells read against a pale sky.
    g.fillStyle(FLAG_DARK, 0.9);
    fillQuad(g, [
      edgeX[0]! - 1, edgeY[0]! - 1.5,
      edgeX[FINISH_COLS]! + 1.5, edgeY[FINISH_COLS]! - 1.5,
      edgeX[FINISH_COLS]! + 1.5, edgeY[FINISH_COLS]! + h + 1.5,
      edgeX[0]! - 1, edgeY[0]! + h + 1.5,
    ]);
    for (let c = 0; c < FINISH_COLS; c++) {
      for (let r = 0; r < FINISH_ROWS; r++) {
        g.fillStyle((r + c) % 2 === 0 ? COLORS.white : FLAG_DARK, 1);
        fillQuad(g, [
          edgeX[c]!, edgeY[c]! + r * FINISH_CELL,
          edgeX[c + 1]!, edgeY[c + 1]! + r * FINISH_CELL,
          edgeX[c + 1]!, edgeY[c + 1]! + (r + 1) * FINISH_CELL,
          edgeX[c]!, edgeY[c]! + (r + 1) * FINISH_CELL,
        ]);
      }
    }
  }
}
