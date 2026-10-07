import Phaser from 'phaser';
import { COLORS, ORIGIN_X, GROUND_Y, PANEL_TOP_Y, PPM, WORLD_W, WORLD_H, STAGE_W, STAGE_H, RENDER_SCALE, toPx, toWorld } from './view';
import type { Vec2, Track, CartSnapshot, TrackPoint, PointKind, FinishZone, EditTool } from '../core/types';
import { insertionIndex, clonePoints, LOOP_RADIUS } from '../core/trackPoints';
import type { SpineGameObject } from '@esotericsoftware/spine-phaser-v4';

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
const DEPTH_GROUND = 1;
const DEPTH_SUPPORT = 1.5; // posts + ties
const DEPTH_TRACK = 2; // rail outline/rail/highlight
const DEPTH_POINTS = 3; // station house + control point handles + finish flag
const DEPTH_BRUNO_SHADOW = 3.4;
const DEPTH_BRUNO = 3.5;
/** Feet position of Bruno in stage pixels; the HTML top bar leaves a transparent 76x72 px slot
 * (stage x 32..108, y 0..72) open for him. */
const BRUNO_SLOT = { x: 70, y: 66 };
const DEPTH_FUZZ = 4;

// world panel: a single rounded sky/ground panel, x 32..992, y 78..700 (2026-10-07: was 210..700;
// the top follows WORLD_H, view.ts)
const PANEL_X0 = 32;
const PANEL_Y0 = WORLD_Y0;
const PANEL_X1 = 992;
const PANEL_Y1 = 700;
const PANEL_RADIUS = 12;
const SKY_TOP = 0x2a4aa6;
const SKY_BOTTOM = 0x4f7bd6;
const GRASS_Y0 = 686;
const EARTH_Y0 = 694;
const EARTH_COLOR = 0x3f6b2a;

const FUZZ_R_PX = 11; // screen-space radius of the rolling fuzz
const FUZZ_R = FUZZ_R_PX / PPM; // world-space radius, meters

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

  private bruno: SpineGameObject | null = null;

  constructor() {
    super('coaster');
  }

  preload(): void {
    // Loader failures (missing/renamed files) surface as a synchronous throw
    // from `this.add.spine(...)` in create(), which we catch there so the
    // rest of the scene keeps working without Bruno.
    this.load.spineAtlas('floofs', 'spine/FloofFamily01.atlas', true);
    this.load.spineJson('engineer', 'spine/Engineer_skeleton.json');
    this.load.image('fuzz', 'blueFuzz_idle.png');
  }

  create(): void {
    // High-DPI: the canvas is RENDER_SCALE times the stage; zoom the camera so stage
    // coordinates (1024x768) stay valid for every game object and for the HTML HUD.
    this.cameras.main.setZoom(RENDER_SCALE);
    this.cameras.main.centerOn(STAGE_W / 2, STAGE_H / 2);

    this.createPanel();

    this.supportGfx = this.add.graphics();
    this.supportGfx.setDepth(DEPTH_SUPPORT);

    this.trackGfx = this.add.graphics();
    this.trackGfx.setDepth(DEPTH_TRACK);

    this.pointsGfx = this.add.graphics();
    this.pointsGfx.setDepth(DEPTH_POINTS);

    this.finishGfx = this.add.graphics();
    this.finishGfx.setDepth(DEPTH_POINTS);

    this.createFuzz();
    this.createBruno();

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);

    this.trackDirty = true;
    this.pointsDirty = true;
    this.finishDirty = true;
  }

  override update(time: number, delta: number): void {
    this.onUpdate?.(delta);
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

  /**
   * The world panel: a rounded sky/ground shape, x 32..992, y 78..700, radius 12. The sky gradient
   * spans the whole panel height (SKY_TOP at the panel top, SKY_BOTTOM at the grass).
   *
   * Phaser 4 has no WebGL geometry mask (GeometryMask is Canvas-only) and `fillGradientStyle`
   * only maps correctly onto `fillRect`. So the panel is built from plain rectangles: one gradient
   * rect for the sky body, solid rects for the grass and earth, and 1 px rows with a circular
   * inset for the top and bottom corner zones. No mask, no rounded-rect path.
   */
  private createPanel(): void {
    const x0 = PANEL_X0;
    const w = PANEL_X1 - PANEL_X0;
    const h = PANEL_Y1 - PANEL_Y0;
    const r = PANEL_RADIUS;
    const skyAt = (y: number): number => lerpColor(SKY_TOP, SKY_BOTTOM, (y - PANEL_Y0) / h);
    /** Horizontal inset of a row that is `d` px away from the panel's top or bottom edge. */
    const insetAt = (d: number): number => r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));

    const sky = this.add.graphics();
    sky.setDepth(DEPTH_SKY);
    // Top corner zone: 1 px rows with the circular inset.
    for (let y = PANEL_Y0; y < PANEL_Y0 + r; y++) {
      const inset = insetAt(y - PANEL_Y0 + 0.5);
      sky.fillStyle(skyAt(y), 1);
      sky.fillRect(x0 + inset, y, w - 2 * inset, 1);
    }
    // Sky body: one gradient rect down to the grass.
    sky.fillGradientStyle(skyAt(PANEL_Y0 + r), skyAt(PANEL_Y0 + r), skyAt(GRASS_Y0), skyAt(GRASS_Y0), 1);
    sky.fillRect(x0, PANEL_Y0 + r, w, GRASS_Y0 - (PANEL_Y0 + r));

    const ground = this.add.graphics();
    ground.setDepth(DEPTH_GROUND);
    ground.fillStyle(COLORS.green, 1);
    ground.fillRect(x0, GRASS_Y0, w, PANEL_Y1 - r - GRASS_Y0);
    // Bottom corner zone: grass rows, then earth rows, each with the circular inset.
    for (let y = PANEL_Y1 - r; y < PANEL_Y1; y++) {
      const inset = insetAt(PANEL_Y1 - y - 0.5);
      ground.fillStyle(y >= EARTH_Y0 ? EARTH_COLOR : COLORS.green, 1);
      ground.fillRect(x0 + inset, y, w - 2 * inset, 1);
    }
  }

  private createFuzz(): void {
    // The blue fuzz image (570x590). The fluff reaches past the rolling radius, so the
    // image is drawn a little larger than the ball that touches the rail.
    const body = this.add.image(0, 0, 'fuzz');
    const fluff = 1.25;
    body.setDisplaySize(FUZZ_R_PX * 2 * fluff, FUZZ_R_PX * 2 * fluff * (590 / 570));

    // The face rolls with the ball; the outer container handles position, orientation and squash.
    this.fuzzSpin = this.add.container(0, 0, [body]);
    this.fuzzBody = body;
    this.fuzz = this.add.container(0, 0, [this.fuzzSpin]);
    this.fuzz.setDepth(DEPTH_FUZZ);
    this.fuzz.setVisible(false);
  }

  private createBruno(): void {
    // A soft shadow under Bruno's feet, drawn once (he never moves) at a depth just below him.
    const shadow = this.add.graphics();
    shadow.setDepth(DEPTH_BRUNO_SHADOW);
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillEllipse(BRUNO_SLOT.x, BRUNO_SLOT.y + 1, 34, 8);

    try {
      const bruno = this.add.spine(BRUNO_SLOT.x, BRUNO_SLOT.y, 'engineer', 'floofs');
      bruno.setScale(0.084); // about 66 px tall
      bruno.setDepth(DEPTH_BRUNO);
      bruno.animationState.setAnimation(0, 'engineer_idle', true);
      bruno.setVisible(true); // Bruno is always visible, in edit and play mode alike
      this.bruno = bruno;
    } catch (err) {
      console.warn('CoasterScene: Bruno (Spine) failed to load; continuing without Bruno.', err);
      this.bruno = null;
    }
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
      return;
    }
    this.fuzz.setVisible(true);

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

  private resetFuzzFallState(): void {
    if (this.fuzzFellStarted) {
      this.tweens.killTweensOf(this.fuzz);
      this.tweens.killTweensOf(this.fuzzSpin);
      this.fuzzFellStarted = false;
    }
    this.fuzzBody.clearTint();
    this.fuzz.setScale(1, 1);
  }

  /** Plays Bruno's wave once, then returns to the idle loop. No-op if Bruno failed to load. */
  brunoWave(): void {
    const bruno = this.bruno;
    if (!bruno) return;
    bruno.animationState.setAnimation(0, 'engineer_wave', false);
    bruno.animationState.addAnimation(0, 'engineer_idle', true, 0);
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

    const sx = pointer.worldX;
    const sy = pointer.worldY;
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

    const sx = pointer.worldX;
    const sy = pointer.worldY;
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
    if (this.points.length === 0) return;

    const station = toPx(this.points[0]!);
    this.drawStation(station);

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
