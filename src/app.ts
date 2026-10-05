import type { CartSnapshot, EditTool, HudState, Level, Metrics, Mode, Outcome, Track, TrackPoint } from './core/types';
import { buildTrack } from './core/track';
import { CartSim } from './core/sim';
import { RunMeters, staticMetrics } from './core/meters';
import { allPass, evaluateGoals } from './core/goals';
import { LEVELS, findLevel } from './core/levels';
import { FIXED_DT, FixedStepper } from './core/stepper';
import { clonePoints, expandTrackPoints } from './core/trackPoints';
import type { Hud } from './ui/hud';
import type { CoasterScene } from './game/CoasterScene';

/**
 * Controller: owns the level/run state machine and glues the editor scene,
 * the physics sim and the HUD together. Deliberately free of Phaser imports
 * (apart from the CoasterScene type) so it stays testable in isolation.
 */
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
  outcome: Outcome | null = null;
  passed = false;

  private level: Level;

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

    document.addEventListener('visibilitychange', this.onVisibilityChange);

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
    this.tool = 'point';
    this.meters.reset();
    this.stepper.reset();

    this.hud.setLevel(level, LEVELS);
    this.scene.setEditable(true);
    this.scene.setTool('point');
    this.scene.drawCart(null);
    this.scene.setFinish(level.finish ?? null);
    // Fires onPointsChanged, which rebuilds the track.
    this.scene.setPoints(clonePoints(level.preset ?? []));

    this.syncUrl(level.id);
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
  }

  // ---- public commands (wired to the HUD) ------------------------------

  setTool(tool: EditTool): void {
    if (this.mode !== 'edit') return;
    this.tool = tool;
    this.scene.setTool(tool);
  }

  play(): void {
    if (this.mode !== 'edit' || !this.track) return;
    this.mode = 'play';
    this.outcome = 'running';
    this.passed = false;
    this.sim = new CartSim(this.track);
    this.meters.reset();
    this.stepper.reset();
    this.scene.setEditable(false);
  }

  stop(): void {
    if (this.mode === 'edit') return;
    this.mode = 'edit';
    this.sim = null;
    this.lastSnap = null;
    this.outcome = null;
    this.passed = false;
    this.stepper.reset();
    this.scene.setEditable(true);
    this.scene.drawCart(null);
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
    if (this.mode === 'play' && sim) {
      this.stepper.update(deltaMs, () => {
        sim.step();
        this.meters.observe(sim.snapshot(), FIXED_DT);
      });
      this.lastSnap = sim.snapshot();
      this.scene.drawCart(this.lastSnap);

      if (sim.outcome !== 'running') {
        this.mode = 'done';
        this.outcome = sim.outcome;
        const metrics = this.currentMetrics();
        this.passed = this.outcome !== 'fell' && allPass(evaluateGoals(this.level.goals, metrics));
        if (this.passed) this.scene.brunoWave();
      }
    }

    this.hud.update(this.hudState());
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

  private hudState(): HudState {
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
    };
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.scene.onPointsChanged = undefined;
    this.scene.onUpdate = undefined;
  }
}
