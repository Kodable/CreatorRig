import type { CartSnapshot, CoachStep, EditTool, HudState, Level, Metrics, Mode, Outcome, Track, TrackPoint } from './core/types';
import { buildTrack } from './core/track';
import { CartSim } from './core/sim';
import { RunMeters, staticMetrics } from './core/meters';
import { allPass, evaluateGoals } from './core/goals';
import { LEVELS, findLevel } from './core/levels';
import { FIXED_DT, FixedStepper } from './core/stepper';
import { interpolateCart } from './core/interpolateCart';
import { clonePoints, expandTrackPoints } from './core/trackPoints';
import { editRules, startTool, toolAllowed } from './core/editRules';
import {
  DRAG_RISE_PX, DRAG_TOP_RISE_PX, LOOP_HAND_TAPS, TAP_PERIOD_MS,
  coachSteps, dragTopIndex, nextCoachStep, pointAdded, stationMoved, topMoved,
} from './core/coach';
import { airGoal, previewAir, showsAirPreview, type AirPreview } from './core/airPreview';
import { ENTRANCE_MS } from './core/entrance';
import type { Hud } from './ui/hud';
import type { CoasterScene } from './game/CoasterScene';
import { isSkinId, loadSkin, saveSkin, type SkinId } from './game/skins';
import { END_HOLD_MS } from './game/rideCamera';
import { makeDialogRunner, type BrunoDialogRunner } from './ui/brunoDialog';

/**
 * Controller: owns the level/run state machine and glues the editor scene,
 * the physics sim and the HUD together. Deliberately free of Phaser imports
 * (apart from the CoasterScene type) so it stays testable in isolation.
 */
/** The air preview's wait after a track change (ms), see App.previewDueMs. */
const PREVIEW_DELAY_MS = 100;

export class App {
  mode: Mode = 'edit';
  levelIndex = 0;
  track: Track | null = null;
  points: TrackPoint[] = [];
  tool: EditTool = 'point';
  sim: CartSim | null = null;
  readonly meters = new RunMeters();
  readonly stepper = new FixedStepper();
  lastSnap: CartSnapshot | null = null;
  /** The snapshot before the latest step (render interpolation); null between runs. */
  private prevSnap: CartSnapshot | null = null;
  outcome: Outcome | null = null;
  passed = false;
  /** The fuzz that rides (2026-10-12, skins.ts): this session's / the stored pick, Blue by default. */
  skin: SkinId = loadSkin();

  private level: Level;
  /** Bruno's lesson intro (src/ui/brunoDialog.ts): the scene's dim + big Bruno and the HUD's box.
   * Null when either lacks its half (a test fake): the goals intro then plays at once. */
  private readonly dialogs: BrunoDialogRunner | null;
  /** Bumped per level load, so a replaced lesson intro never plays the old level's goals intro. */
  private lessonGen = 0;

  // ---- the tutorial hand (2026-10-15, src/core/coach.ts) ----
  /** The level's hand steps the child has done on this level load (a fresh load starts over). */
  private coachDone = new Set<CoachStep>();
  /** Bruno's lesson intro and the goals intro are over: the hand may show. */
  private coachReady = false;
  /** The step on screen and how long it has shown (ms; the Loop hand leaves after its taps). */
  private coachStep: CoachStep | null = null;
  private coachStepMs = 0;

  // ---- the air time preview (2026-10-15, src/core/airPreview.ts) ----
  /** The latest dry run on the edited track (levels with an air time goal only), else null. */
  airPreview: AirPreview | null = null;
  /** ms until the pending dry run, or null when none is pending. A change schedules one
   * PREVIEW_DELAY_MS later and later changes ride along, so a drag recomputes about ten times a
   * second (a few ms each) and the glow keeps up with the finger. */
  private previewDueMs: number | null = null;

  // ---- the entrance (2026-10-15, src/core/entrance.ts) ----
  /** ms into the fuzz's hop from the station onto the rail, or null when it is not hopping. The sim
   * takes no step until the hop is over (ENTRANCE_MS, or a tap skips it): the ride itself, its
   * metrics and the pass rule are unchanged, it only starts a second later. */
  entranceMs: number | null = null;

  private readonly onVisibilityChange = (): void => {
    // A long background pause would otherwise accumulate a burst of steps.
    if (document.hidden) this.stepper.reset();
  };

  constructor(
    private readonly scene: CoasterScene,
    private readonly hud: Hud,
    startLevelId?: string,
  ) {
    const first = LEVELS[0];
    if (!first) throw new Error('App: LEVELS is empty');
    const level = (startLevelId ? findLevel(startLevelId) : undefined) ?? first;
    this.level = level;

    this.scene.onPointsChanged = (pts: TrackPoint[]): void => this.onPoints(pts);
    this.scene.onUpdate = (dt: number): void => this.frame(dt);
    this.scene.onEntranceSkip = (): void => this.skipEntrance();
    this.scene.onPlayTap = (): void => this.play();

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.dialogs = makeDialogRunner(this.scene, this.hud.brunoDialog);

    this.scene.setSkin(this.skin);
    this.hud.setSkin(this.skin);
    this.loadLevel(level);
  }

  // ---- level lifecycle -------------------------------------------------

  loadLevel(level: Level): void {
    this.level = level;
    const idx = LEVELS.indexOf(level);
    this.levelIndex = idx >= 0 ? idx : 0;

    this.mode = 'edit';
    this.outcome = null;
    this.passed = false;
    this.sim = null;
    this.lastSnap = null;
    this.prevSnap = null;
    this.entranceMs = null;
    this.tool = startTool(level);
    this.meters.reset();
    this.stepper.reset();
    this.coachDone = new Set();
    this.coachReady = false;
    this.coachStep = null;
    this.coachStepMs = 0;
    this.scene.setCoach(null);
    this.previewDueMs = null;
    this.airPreview = null;
    this.scene.setAirGoal(airGoal(level));
    this.scene.setAirPreview(null);

    this.hud.setLevel(level, LEVELS);
    this.scene.setRideCamera(false);
    this.scene.setEditable(true);
    this.scene.setRules(editRules(level));
    this.scene.setTool(this.tool);
    this.scene.drawCart(null);
    this.scene.setFinish(level.finish ?? null);
    // Fires onPointsChanged, which rebuilds the track.
    this.scene.setPoints(clonePoints(level.preset ?? []));
    // 2026-10-15 (Jon: "the placement needs a lot more juice"): the preset track stays hidden behind
    // Bruno's intro and builds in (segments drop in, beams rise) the moment he leaves.
    this.scene.holdBuild();
    // The level's first preview is there from the start (no wait).
    this.refreshAirPreview();

    this.syncUrl(level.id);

    // 2026-10-12: every level load (not Stop/replay) opens with Bruno's lesson intro: the
    // viewport dims, he slides in from the left, the box types his line; the goals intro plays
    // once the child taps it closed.
    // 2026-10-15: the tutorial hand waits until the goals intro has glided home too.
    const gen = ++this.lessonGen;
    const goalsThenCoach = (): void => {
      void Promise.resolve(this.hud.playGoalsIntro?.()).then(() => {
        if (gen === this.lessonGen) this.coachReady = true;
      });
    };
    if (!this.dialogs) {
      this.scene.buildIn();
      goalsThenCoach();
      return;
    }
    void this.dialogs.play({ label: level.title, text: level.bruno }).then((done) => {
      if (gen !== this.lessonGen) return;
      this.scene.buildIn();
      if (done) goalsThenCoach();
    });
  }

  /** The child did a hand step's action (any time: a step done early never shows). */
  private markCoach(step: CoachStep): void {
    this.coachDone.add(step);
  }

  /** The child opened the fuzz picker's tray (HUD). */
  skinTrayOpened(): void {
    this.markCoach('skin');
  }

  /** This frame's tutorial hand step (null: none, or not now), advancing the timed Loop hand. */
  private updateCoach(deltaMs: number): CoachStep | null {
    const level = this.level;
    // No hand while a finger is on the track; a drag or an added point counts once it is let go,
    // so the next step's hand never shows up in the middle of the drag.
    if (this.scene.isGestureActive()) return null;
    const preset = level.preset ?? [];
    if (stationMoved(preset, this.points)) this.markCoach('drag-station');
    if (topMoved(preset, this.points)) this.markCoach('drag-top');
    if (pointAdded(preset, this.points)) this.markCoach('add-point');
    // The drop goal met counts as the station dragged (the drag step's purpose).
    if (this.mode === 'edit' && level.goals.some((g) => g.metric === 'maxDrop')) {
      const drop = evaluateGoals(level.goals.filter((g) => g.metric === 'maxDrop'), staticMetrics(this.track, level.finish));
      if (allPass(drop)) this.markCoach('drag-station');
    }
    let step = nextCoachStep(coachSteps(level), this.coachDone);
    if (step !== this.coachStep) {
      this.coachStep = step;
      this.coachStepMs = 0;
    }
    if (!this.coachReady || this.mode !== 'edit' || this.isDialogOpen()) return null;
    if (step === 'loop-tool') {
      this.coachStepMs += deltaMs;
      if (this.coachStepMs >= LOOP_HAND_TAPS * TAP_PERIOD_MS) {
        this.markCoach('loop-tool');
        step = nextCoachStep(coachSteps(level), this.coachDone);
        this.coachStep = step;
        this.coachStepMs = 0;
      }
    }
    return step;
  }

  /** Bruno's lesson intro is on screen. */
  isDialogOpen(): boolean {
    return this.dialogs?.open ?? false;
  }

  private syncUrl(id: string): void {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('level', id);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Non-fatal: URL syncing is a convenience only.
    }
  }

  // ---- editing ---------------------------------------------------------

  private onPoints(pts: TrackPoint[]): void {
    this.points = pts;
    this.track = buildTrack(expandTrackPoints(pts).pts);
    this.scene.setTrack(this.track);
    if (showsAirPreview(this.level) && this.previewDueMs === null) this.previewDueMs = PREVIEW_DELAY_MS;
  }

  /** Runs the air time dry run on the current track now (the air time lesson only,
   * `showsAirPreview`) and hands the floaty stretches to the scene. */
  private refreshAirPreview(): void {
    this.previewDueMs = null;
    this.airPreview = showsAirPreview(this.level) && this.track ? previewAir(this.track) : null;
    this.scene.setAirPreview(this.airPreview);
  }

  // ---- public commands (wired to the HUD) ------------------------------

  /** Picks the fuzz that rides (cosmetic: the sim never sees it). Remembered for the session and
   * in localStorage; the station fuzz pops so the swap is felt. */
  setSkin(id: string): void {
    if (!isSkinId(id)) return;
    this.skin = id;
    saveSkin(id);
    this.scene.setSkin(id, true);
    this.hud.setSkin(id);
  }

  setTool(tool: EditTool): void {
    if (this.mode !== 'edit' || !toolAllowed(this.level, tool)) return;
    if (tool === 'loop') this.markCoach('loop-tool');
    this.tool = tool;
    this.scene.setTool(tool);
  }

  play(): void {
    if (this.mode !== 'edit' || !this.track) return;
    this.markCoach('play');
    this.mode = 'play';
    this.outcome = 'running';
    this.passed = false;
    this.sim = new CartSim(this.track);
    this.meters.reset();
    this.stepper.reset();
    this.scene.setEditable(false);
    // 2026-10-12: the camera zooms in and follows the fuzz for the ride (rideCamera.ts).
    this.scene.setRideCamera(true);
    // 2026-10-15 (Jon: "the fuzz like jumps into the roller coaster ... like here I go"): first the
    // fuzz crouches on the deck and hops onto the rail while the camera zooms in; the sim starts
    // after (frame).
    this.entranceMs = 0;
    this.scene.startEntrance(this.sim.snapshot());
  }

  /** A tap during the entrance: the fuzz is on the rail at once and the ride starts. */
  skipEntrance(): void {
    if (this.mode === 'play' && this.entranceMs !== null) this.entranceMs = ENTRANCE_MS;
  }

  stop(): void {
    if (this.mode === 'edit') return;
    this.mode = 'edit';
    this.sim = null;
    this.lastSnap = null;
    this.prevSnap = null;
    this.entranceMs = null;
    this.outcome = null;
    this.passed = false;
    this.stepper.reset();
    this.scene.setEditable(true);
    this.scene.drawCart(null);
    this.scene.setRideCamera(false);
  }

  clear(): void {
    if (this.mode !== 'edit') return;
    this.scene.clear();
  }

  undo(): void {
    if (this.mode !== 'edit') return;
    this.scene.undo();
  }

  next(): void {
    if (!this.passed) return;
    const nextLevel = LEVELS[this.levelIndex + 1];
    if (!nextLevel) return;
    this.loadLevel(nextLevel);
  }

  selectLevel(id: string): void {
    const level = findLevel(id);
    if (!level) return;
    this.stop();
    this.loadLevel(level);
  }

  // ---- per-frame -------------------------------------------------------

  private frame(deltaMs: number): void {
    const sim = this.sim;
    if (this.mode === 'play' && sim && this.entranceMs !== null) {
      // The entrance: the scene draws the hop; the sim waits.
      this.entranceMs += deltaMs;
      if (this.entranceMs >= ENTRANCE_MS) {
        this.entranceMs = null;
        this.stepper.reset();
      } else {
        this.scene.drawEntrance(this.entranceMs);
      }
    }
    if (this.mode === 'play' && sim && this.entranceMs === null) {
      this.stepper.update(deltaMs, () => {
        // The pose before each step, for render interpolation (core/interpolateCart.ts).
        this.prevSnap = this.lastSnap ?? sim.snapshot();
        sim.step();
        this.lastSnap = sim.snapshot();
        this.meters.observe(this.lastSnap, FIXED_DT);
      });
      this.lastSnap = sim.snapshot();
      // The float counter over the fuzz counts the ride's air time so far (the hangTime meter).
      this.scene.setRideAir(this.meters.airTime());
      this.scene.drawCart(interpolateCart(this.prevSnap, this.lastSnap, this.stepper.alpha));

      if (sim.outcome !== 'running') {
        this.mode = 'done';
        this.outcome = sim.outcome;
        const metrics = this.currentMetrics();
        // A level with a finish flag passes only when the fuzz actually gets there: the HUD fits
        // three goals, so some flag levels have no room for a "reaches the end" goal of their own.
        const reached = !this.level.finish || this.outcome === 'reachedEnd';
        this.passed = this.outcome !== 'fell' && reached && allPass(evaluateGoals(this.level.goals, metrics));
        if (this.passed) {
          this.scene.brunoWave();
          this.scene.celebrate();
        }
        // Hold on the fuzz for a beat (the confetti at the flag, or the tumble), then glide out to
        // the whole track with the final numbers.
        this.scene.setRideCamera(false, END_HOLD_MS);
      }
    }

    if (this.previewDueMs !== null) {
      this.previewDueMs -= deltaMs;
      if (this.previewDueMs <= 0) this.refreshAirPreview();
    }

    const step = this.updateCoach(deltaMs);
    const topIndex = step === 'drag-top' ? dragTopIndex(this.points) : -1;
    this.scene.setCoach(
      step === 'drag-station'
        ? { kind: 'drag', index: 0, risePx: DRAG_RISE_PX }
        : topIndex >= 0
          ? { kind: 'drag', index: topIndex, risePx: DRAG_TOP_RISE_PX }
        : step === 'add-point' && this.level.coachSpot
          ? { kind: 'tap', at: this.level.coachSpot }
          : null,
    );
    this.hud.update(this.hudState(step === 'skin' || step === 'play' || step === 'loop-tool' ? step : null));
  }

  /** The tutorial hand step on screen (dev checks), or null. */
  coachStepNow(): CoachStep | null {
    return this.coachReady && this.mode === 'edit' ? this.coachStep : null;
  }

  private currentMetrics(): Metrics {
    const finish = this.level.finish;
    const metrics = this.mode === 'edit'
      ? staticMetrics(this.track, finish)
      : this.track
        ? this.meters.toMetrics(this.track, finish)
        : staticMetrics(null, finish);
    this.scene.setFinishReached(metrics.atFinish === 1);
    return metrics;
  }

  private hudState(coach: CoachStep | null = null): HudState {
    const metrics = this.currentMetrics();
    const snap = this.lastSnap;
    return {
      mode: this.mode,
      level: this.level,
      metrics,
      tool: this.tool,
      live: {
        speed: Math.abs(snap?.v ?? 0),
        g: snap?.gNormal ?? 0,
        airborne: snap?.airborne ?? false,
      },
      goals: evaluateGoals(this.level.goals, metrics),
      outcome: this.outcome,
      passed: this.passed,
      canPlay: this.mode === 'edit' && this.track !== null,
      canUndo: this.scene.canUndo(),
      coach,
    };
  }

  destroy(): void {
    this.lessonGen++;
    this.dialogs?.cancel();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.scene.onPointsChanged = undefined;
    this.scene.onUpdate = undefined;
  }
}
