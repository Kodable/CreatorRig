// Generic builder-kit controller: owns the level/build/run state machine for any course built on
// a CourseSpec, and glues the editor scene, the (async, physics-backed) sim and the HUD together.
// Moved from activities/goldberg/app.ts.
import type {
  Bounds,
  CameraFrame,
  CoachStep,
  CourseSim,
  CourseSpec,
  HudState,
  Level,
  LinkEnd,
  Mode,
  PartHandle,
  PlacedPart,
  PropertyDescriptor,
  ResultCard,
  StatBar,
  Vec2,
  Widget,
  WidgetAction,
  WorldSpec,
 SimSnapshot } from './types';
import { gatedOptions, isKnown, isOptionKnown, knownConcepts } from './concepts';
import { hasShelfKinds } from './shelf';
import { allPass, evaluateGoals } from './goals';
import { FixedStepper } from '../core/stepper';
import { interpolateSnapshot } from './interpolate';
import { clampFrame, cxToScroll, fullFrame, isWideWorld, scrollToCx, viewWidth, type FrameState } from './camera';
import type { BuilderScene } from './BuilderScene';
import type { BuilderHud } from './BuilderHud';

const UNDO_CAP = 50;
const NUDGE_CAP = 7;
const WRITE_BACK_EPS = 0.02; // meters
/** Write-back is skipped beyond this distance (meters): the pre-roll misbehaved. */
const WRITE_BACK_MAX = 4;

function clone<K extends string>(parts: PlacedPart<K>[]): PlacedPart<K>[] {
  return parts.map((p) => ({ ...p, props: { ...p.props } }));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** The next value in `values` after `current`, wrapping to the first entry. Undefined when
 * there is no values list to wrap through. */
function nextWidgetValue(values: string[] | undefined, current: string | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  const idx = current != null ? values.indexOf(current) : -1;
  return values[(idx + 1) % values.length];
}

export class BuilderApp<
  K extends string,
  M extends Record<string, number>,
  O extends string,
  L extends Level<K, M, O>,
> {
  mode: Mode = 'edit';
  levelIndex = 0;
  level: L;
  parts: PlacedPart<K>[] = [];
  sim: CourseSim<M, O> | null = null;
  readonly stepper = new FixedStepper();
  /** Physics pose before the most recent step, for render interpolation (play mode only). */
  private prevSnap: SimSnapshot<O> | null = null;
  outcome: O | null = null;
  passed = false;
  selectedId: number | null = null;
  hintIndex = -1;
  undoStack: PlacedPart<K>[][] = [];
  nextId = 1;
  tool: string | null;
  /** Concept codes known as of `this.level` (`Level.introduces`, unioned up to and including it);
   * null = every level's `introduces` is empty/unset, so nothing is gated. Recomputed on
   * `loadLevel` only: it never changes within a level. */
  private known: Set<string> | null = null;
  /** Every `code:value` entry anywhere in `spec.levels` (option-level gates); course-wide, so
   * computed once and never recomputed per level. */
  private readonly gated: Set<string>;

  private buildGen = 0;
  /** Timestamp (ms) until which the HUD shows `lines.refused`, set by a failed `canAdd`. */
  private refusedUntil = 0;
  /** Timestamp (ms) until which the HUD shows `lines.locked`, set by a blocked widget tap. */
  private lockedUntil = 0;

  /** Key of the item set last sent to the scene (partId:body pairs). */

  private itemsKey = '';
  /** Widgets last sent to the scene, and the key they were computed from. */
  private widgets: Widget[] = [];
  private widgetKey = '';
  /** Cached `spec.resultCard()` output, keyed on outcome+passed so it is not recomputed every
   * frame while sitting in done mode. */
  private resultCardCache: { key: string; card: ResultCard | null } = { key: '', card: null };
  /** Bumped on every `play()`, so the result card is recomputed per run (the same outcome on
   * a later run carries different metrics: the time, the distance). */
  private runCounter = 0;
  /** Runs started since the level loaded (`CoachContext.runs`). */
  private runsThisLevel = 0;
  /** The coach's step this frame (`spec.coach`), or null; sent in `HudState.coach`. */
  private coach: CoachStep<K> | null = null;
  /** `HudState.unlocked`: this level's `part:<kind>` introduces entries that are in its palette.
   * Recomputed on `loadLevel` only. */
  private unlocked: K[] = [];
  /** Id of the dial mid-live-drag (its first live commit pushed the drag's one undo entry), or
   * null when no live drag is in progress. Lets the release commit that follows tell it already
   * applied this exact value and skip re-doing the work. */
  private liveDragId: string | null = null;
  private destroyed = false;

  // ---- wide worlds: the edit-mode rest frame and the level-load intro pan ----
  /** The EFFECTIVE world every camera clamp (and the scrollbar) is bounded to for `this.level`:
   * `{ ...spec.world, worldW: min(spec.world.worldW, level.extentW ?? Infinity) }`. Recomputed on
   * `loadLevel` and handed to the scene via `scene.setWorldExtent`, so a short level in a wide
   * course shows no scrollbar and the camera never strays into its empty tail. Drawing (the kit
   * draws sky/ground/terrain for the whole `spec.world.worldW` regardless) and part drag/placement
   * clamps keep using `spec.world` directly. */
  private effWorld: WorldSpec;
  /** Meters the panel shows across at zoom 1 (`effWorld.worldW` when the world fits). */
  private viewW: number;
  /** `effWorld.worldW` exceeds the view width: the edit-mode window scrolls (`scrollTo`). */
  private wide: boolean;
  /** The edit-mode rest frame (`restCx` = its cx): what deselecting, `stop()` and the end of a
   * run return to. The world's left view window by default, `CourseSpec.intro`'s `to` after a pan,
   * moved by the scrollbar. In done mode on a wide world it sits where the run ended. */
  private restFrame: FrameState;
  /** The edit rest frame saved at `play()` (wide worlds move `restFrame` to where the run ends),
   * restored by `stop()`. */
  private editRest: FrameState | null = null;
  /** `CourseSpec.intro`'s pan for the level being loaded, played once its first build is ready. */
  private pendingIntro: { from: CameraFrame; to: CameraFrame; ms: number } | null = null;

  private readonly onVisibilityChange = (): void => {
    // A long background pause would otherwise accumulate a burst of steps.
    if (document.hidden) this.stepper.reset();
    this.prevSnap = null;
  };

  constructor(
    private readonly scene: BuilderScene,
    private readonly hud: BuilderHud<K, M, O, L>,
    private readonly spec: CourseSpec<K, M, O, L>,
    startLevelId?: string,
  ) {
    const first = spec.levels[0];
    if (!first) throw new Error('BuilderApp: spec.levels is empty');
    const level = (startLevelId ? this.findLevel(startLevelId) : undefined) ?? first;
    this.level = level;
    this.tool = spec.tools?.[0]?.id ?? null;
    this.gated = gatedOptions(spec.levels);
    // Placeholders (the full world): `loadLevel` below recomputes all four from the first
    // level's `extentW` before the scene ever reads them.
    this.effWorld = spec.world;
    this.viewW = viewWidth(spec.world);
    this.wide = isWideWorld(spec.world);
    this.restFrame = fullFrame(spec.world);

    this.scene.onUpdate = (dt: number): void => this.frame(dt);
    this.scene.onPartTapped = (id: number): void => this.onPartTapped(id);
    this.scene.onPartMoved = (id: number, dx: number, dy: number): void => this.onPartMoved(id, dx, dy);
    this.scene.onEmptyTapped = (at: Vec2): void => this.onEmptyTapped(at);
    this.scene.onLinkDrawn = (from: LinkEnd, to: LinkEnd): void => this.onLinkDrawn(from, to);
    this.scene.onWidgetAction = (id: string, value?: string, live?: boolean): void => this.onWidgetAction(id, value, live);
    this.scene.onWidgetBlocked = (id: string): void => this.onWidgetBlocked(id);
    this.scene.onWidgetDrag = (): void => {
      // The scene owns the widget's visual while dragging; the controller has nothing to do.
    };
    if (spec.dragSnap) this.scene.dragSnap = (id: number, at: Vec2): Vec2 | null => this.dragSnapDelta(id, at);
    this.scene.setTool(this.toolKind());
    this.scene.setGrid(spec.grid ?? null);

    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.loadLevel(level);
  }

  private findLevel(id: string): L | undefined {
    return this.spec.levels.find((l) => l.id === id);
  }

  private toolKind(): 'move' | 'place' | 'link' {
    const spec = this.spec.tools?.find((t) => t.id === this.tool);
    return spec?.kind ?? 'move';
  }

  /** Sets the active editor tool; ignored for an id not in `spec.tools`. */
  setTool(id: string): void {
    if (!this.spec.tools?.some((t) => t.id === id)) return;
    this.tool = id;
    this.scene.setTool(this.toolKind());
  }

  // ---- level lifecycle ---------------------------------------------------

  loadLevel(level: L): void {
    this.level = level;
    const idx = this.spec.levels.indexOf(level);
    this.levelIndex = idx >= 0 ? idx : 0;
    this.known = knownConcepts(this.spec.levels, level.id);

    // The effective world for THIS level: min(spec.world.worldW, level.extentW ?? Infinity). A
    // short level in a wide course then shows no scrollbar (viewW covers the whole effective
    // world) and the camera (focus, follow, the scrollbar, the intro pan) never strays past its
    // own content into the course's empty tail.
    const eff = Math.min(this.spec.world.worldW, level.extentW ?? Infinity);
    this.effWorld = { ...this.spec.world, worldW: eff };
    this.viewW = viewWidth(this.effWorld);
    this.wide = isWideWorld(this.effWorld);
    this.scene.setWorldExtent(this.effWorld);

    this.mode = 'edit';
    this.outcome = null;
    this.passed = false;
    this.selectedId = null;
    this.hintIndex = -1;
    this.undoStack = [];
    this.liveDragId = null;
    this.runsThisLevel = 0;
    this.coach = null;
    this.unlocked = (level.introduces ?? [])
      .filter((e) => e.startsWith('part:'))
      .map((e) => e.slice('part:'.length) as K)
      .filter((k, i, all) => level.palette.includes(k) && all.indexOf(k) === i);
    this.parts = clone(level.parts);
    this.nextId = this.parts.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    this.tool = this.spec.tools?.[0]?.id ?? null;
    this.scene.setTool(this.toolKind());
    this.scene.setGrid(this.spec.grid ?? null);

    if (this.widgets.length > 0) this.scene.setWidgets([]);
    this.widgets = [];
    this.widgetKey = '';
    // The rest frame: the world's left view window, or the intro pan's end frame. A pan holds
    // its opening frame until the level's first build is ready (see `rebuild`), so it never
    // pans over the previous level's parts.
    const intro = this.spec.intro?.(level) ?? null;
    this.restFrame = intro ? clampFrame(intro.to, this.effWorld) : fullFrame(this.effWorld);
    this.editRest = null;
    this.pendingIntro = intro;
    this.scene.cancelIntro();
    this.scene.setBaseFrame(this.restFrame);
    if (intro) {
      this.scene.trackPoint(null);
      this.scene.focusFrame(intro.from, 0);
    } else if (this.spec.follow || this.spec.focusFrame || this.wide) {
      this.scene.trackPoint(null);
      this.scene.focusFrame(null);
    }

    this.hud.setLevel(level, this.spec.levels);
    this.scene.setEditable(true);
    this.scene.setMarkers(level.markers ?? []);
    void this.rebuild();

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

  /** Rebuilds the sim from `this.parts`. Async (awaits physics init); guarded by a generation
   * counter so a stale rebuild started before a newer one can't clobber it. The old sim keeps
   * drawing until the new one is ready. */
  private async rebuild(): Promise<void> {
    if (this.spec.normalizeParts) {
      this.parts = this.spec.normalizeParts(this.parts, this.level);
      if (this.selectedId != null && !this.parts.some((p) => p.id === this.selectedId)) this.selectedId = null;
    }
    const gen = ++this.buildGen;
    const sim = await this.spec.createSim(clone(this.parts), this.level);
    if (gen !== this.buildGen || this.destroyed) {
      sim.destroy();
      return;
    }
    this.sim?.destroy();
    this.sim = sim;
    this.scene.setItems(sim.renderItems(), this.boundsOf(sim.handles()), this.regionsOf(), this.segmentsOf(sim.handles()));
    this.scene.syncTransforms(sim.snapshot());
    this.scene.setSelected(this.selectedId);
    if (this.pendingIntro && this.mode === 'edit') {
      const intro = this.pendingIntro;
      this.pendingIntro = null;
      this.scene.playIntro(intro.from, intro.to, intro.ms);
    }

    if (this.spec.writeBackSettled && sim.settledPositions) {
      const settled = sim.settledPositions();
      for (const part of this.parts) {
        const pos = settled.get(part.id);
        if (!pos) continue;
        // A settled pose far from the anchor means the pre-roll went wrong (a part flung away);
        // keep the child's anchor in that case.
        if (Math.abs(pos.x - part.x) > WRITE_BACK_MAX || Math.abs(pos.y - part.y) > WRITE_BACK_MAX) continue;
        if (Math.abs(pos.x - part.x) > WRITE_BACK_EPS || Math.abs(pos.y - part.y) > WRITE_BACK_EPS) {
          part.x = pos.x;
          part.y = pos.y;
        }
      }
    }
  }

  // ---- editing (edit mode only) ------------------------------------------

  private pushUndo(): void {
    this.undoStack.push(clone(this.parts));
    if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
  }

  /** Rounds a world point to `spec.grid` when set; otherwise returns it unchanged. */
  private snapToGrid(v: Vec2): Vec2 {
    const g = this.spec.grid;
    if (!g) return v;
    return { x: Math.round(v.x / g) * g, y: Math.round(v.y / g) * g };
  }

  private overlapsAnyPart(x: number, y: number): boolean {
    if (!this.sim) return false;
    return this.sim.handles().some((h) => {
      const b = h.bounds;
      return Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;
    });
  }

  /** Pushes `partId` out of every other part's bounds (from the last build) along the
   * least-penetration axis, preferring +y, up to 8 iterations. No-op unless
   * `spec.resolveOverlaps` is set, and until the part has a known footprint (a part just
   * added has none until its first build). */
  private resolveOverlap(partId: number): void {
    if (!this.spec.resolveOverlaps || !this.sim) return;
    const part = this.parts.find((p) => p.id === partId);
    if (!part) return;
    const handles = this.sim.handles();
    const self = handles.find((h) => h.partId === partId);
    if (!self) return;
    const halfW = self.bounds.w / 2;
    const halfH = self.bounds.h / 2;

    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const h of handles) {
        if (h.partId === partId) continue;
        const b = h.bounds;
        const dx = part.x - b.x;
        const dy = part.y - b.y;
        const overlapX = halfW + b.w / 2 - Math.abs(dx);
        const overlapY = halfH + b.h / 2 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue; // no overlap on some axis: not overlapping

        if (overlapY <= overlapX) {
          // least-penetration axis is y, or a tie: prefer +y (pop the part up and out).
          part.y = b.y + b.h / 2 + halfH;
        } else {
          part.x += dx >= 0 ? overlapX : -overlapX;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  private boundsOf(handles: PartHandle[]): { partId: number; bounds: Bounds }[] {
    return handles.map((h) => ({ partId: h.partId, bounds: h.bounds }));
  }

  private regionsOf(): { partId: number; region: Bounds }[] {
    return this.parts.filter((p) => p.region).map((p) => ({ partId: p.id, region: p.region! }));
  }

  private segmentsOf(handles: PartHandle[]): { partId: number; segment: { a: Vec2; b: Vec2; r: number } }[] {
    return handles
      .filter((h): h is PartHandle & { hitSegment: { a: Vec2; b: Vec2; r: number } } => !!h.hitSegment)
      .map((h) => ({ partId: h.partId, segment: h.hitSegment }));
  }

  /** Selection, the property panel and moves are allowed: edit mode, or done mode when the
   * course tunes between runs. */
  private canTune(): boolean {
    return this.mode === 'edit' || (this.mode === 'done' && !!this.spec.tuneBetweenRuns);
  }

  /** Tweens the camera to the selected part's focus frame, or back to the full field when
   * nothing is selected (or the course has no `focusFrame`). Called on every selection change. */
  private focusSelection(): void {
    const part = this.selectedId != null ? this.parts.find((p) => p.id === this.selectedId) : undefined;
    this.scene.focusFrame(part ? (this.spec.focusFrame?.(part, this.level) ?? null) : null);
  }

  /** Applies a prop change or a move already written onto `part`. When the sim can update in
   * place, re-sends the (possibly changed) render items/handles/regions instead of a full
   * rebuild; otherwise rebuilds, but only in edit mode (in done mode a sim that refuses does
   * nothing: the world stays as it was between shots). */
  private applyTuneUpdate(part: PlacedPart<K>): void {
    if (this.sim?.updatePart?.(part)) {
      this.scene.setItems(
        this.sim.renderItems(),
        this.boundsOf(this.sim.handles()),
        this.regionsOf(),
        this.segmentsOf(this.sim.handles()),
      );
      this.scene.syncTransforms(this.sim.snapshot());
      this.scene.setSelected(this.selectedId);
    } else if (this.mode === 'edit') {
      void this.rebuild();
    }
  }

  /** A palette/tool-added part's props for codes not yet known are pinned to the catalog's
   * default, regardless of `spec.defaultProps`: the child never sees a locked mechanic set to
   * anything but its neutral value. A level's own placed parts are never passed through this
   * (they may pin a locked prop on purpose). */
  private applyConceptDefaults(part: PlacedPart<K>): void {
    if (!this.known) return;
    for (const d of this.spec.catalog[part.kind].descriptors) {
      if (isKnown(this.known, d.code)) continue;
      const def = d.default ?? d.options[0]?.value;
      if (def !== undefined) part.props[d.code] = def;
    }
  }

  /** Coins spent on the child's own (non-locked) parts, via `spec.partCost`; 0 when the course has
   * no `partCost` (a level's `budget`, if any, is then meaningless and never checked). */
  private usedCoins(): number {
    const partCost = this.spec.partCost;
    if (!partCost) return 0;
    return this.parts.reduce((sum, p) => sum + (p.locked ? 0 : partCost(p)), 0);
  }

  /** True when adding `added` (fresh parts, none locked) on top of the current build would push
   * the child's spent coins past `level.budget`. Always false without a budget or a `partCost`. */
  private wouldExceedBudget(added: PlacedPart<K>[]): boolean {
    const budget = this.level.budget;
    const partCost = this.spec.partCost;
    if (budget === undefined || !partCost) return false;
    const addedCost = added.reduce((sum, p) => sum + partCost(p), 0);
    return this.usedCoins() + addedCost > budget;
  }

  addPart(kind: K): void {
    if (this.mode !== 'edit') return;
    const unlockedCount = this.parts.filter((p) => !p.locked).length;
    if (unlockedCount >= this.spec.partLimit) return;
    if (!this.level.palette.includes(kind)) return;

    let x = this.spec.spawn.x;
    let y = this.spec.spawn.y;
    // A wide world: `spawn` is a point in the VIEW window, so a part never appears off screen
    // after the child scrolled (the window's left edge is restCx - viewW / 2).
    if (this.wide) x = clamp(x + this.restFrame.cx - this.viewW / 2, 0.5, this.spec.world.worldW - 0.5);
    for (let i = 0; i < NUDGE_CAP && this.overlapsAnyPart(x, y); i++) y += 1;
    const snapped = this.snapToGrid({ x, y });
    const part: PlacedPart<K> = { id: this.nextId, kind, x: snapped.x, y: snapped.y, props: this.spec.defaultProps(kind) };
    this.applyConceptDefaults(part);
    if (this.spec.canAdd?.(part, this.parts, this.level) === false || this.wouldExceedBudget([part])) {
      this.refusedUntil = Date.now() + 2000;
      return;
    }
    this.nextId++;
    this.pushUndo();
    this.parts.push(part);
    this.selectedId = part.id;
    this.resolveOverlap(part.id);
    this.focusSelection();
    void this.rebuild();
  }

  /** Adds a part built by `placeWithTool`/`linkWithTool`, applying `canAdd` and id assignment. */
  private tryAdd(part: PlacedPart<K> | null): void {
    if (!part) return;
    if (this.spec.canAdd?.(part, this.parts, this.level) === false || this.wouldExceedBudget([part])) {
      this.refusedUntil = Date.now() + 2000;
      return;
    }
    this.pushUndo();
    if (!part.id) part.id = this.nextId++;
    this.parts.push(part);
    this.selectedId = part.id;
    this.focusSelection();
    void this.rebuild();
  }

  /** Adds a batch of parts built by `linkWithTool` (a rod plus the joints it names). `canAdd`
   * runs for every part in order against `this.parts` plus the earlier parts of the batch; any
   * failure refuses the whole batch and adds nothing. */
  private tryAddMany(parts: PlacedPart<K>[]): void {
    if (this.wouldExceedBudget(parts)) {
      this.refusedUntil = Date.now() + 2000;
      return;
    }
    const combined = [...this.parts];
    for (const part of parts) {
      if (this.spec.canAdd?.(part, combined, this.level) === false) {
        this.refusedUntil = Date.now() + 2000;
        return;
      }
      combined.push(part);
    }
    this.pushUndo();
    for (const part of parts) {
      if (!part.id) part.id = this.nextId++;
    }
    this.parts.push(...parts);
    const last = parts[parts.length - 1];
    if (last) this.selectedId = last.id;
    this.focusSelection();
    void this.rebuild();
  }

  setProp(code: string, value: string): void {
    this.setPropInternal(code, value, this.mode === 'edit');
  }

  /** Shared by `setProp` and the live-dial drag path (`onWidgetAction`): applies a prop change,
   * pushing one undo entry first when `pushUndo` is true. Same `canTune`/selection guards as
   * `setProp`. */
  private setPropInternal(code: string, value: string, pushUndo: boolean): void {
    if (!this.canTune() || this.selectedId == null) return;
    if (!isKnown(this.known, code)) return; // a locked mechanic: refuse the change
    if (!isOptionKnown(this.known, this.gated, code, value)) return; // a locked option on a known row
    const part = this.parts.find((p) => p.id === this.selectedId);
    if (!part) return;
    const budget = this.level.budget;
    const partCost = this.spec.partCost;
    if (budget !== undefined && partCost && !part.locked) {
      // Swap this part's own cost out of the running total, then back in at the new props: a
      // prop change is not an add, so it refuses quietly (no undo entry, no `lines.refused` flash)
      // the same way a not-yet-known mechanic refuses above.
      const otherUsed = this.usedCoins() - partCost(part);
      const newCost = partCost({ ...part, props: { ...part.props, [code]: value } });
      if (otherUsed + newCost > budget) return;
    }
    if (pushUndo) this.pushUndo();
    part.props = { ...part.props, [code]: value };
    this.applyTuneUpdate(part);
  }

  /** `optionCosts[code][value]` for one part: the EXTRA coins that option adds over the cheapest
   * option of its row, from `spec.partCost` (e.g. a spring mount costs 1 more than a suction cup
   * -> `{ mount: { suction: 0, spring: 1 } }`). `descriptors` is the already-visible/filtered list
   * (gated options and claimed-by-widget codes dropped), so a row the child can't see never gets a
   * cost entry either. A row omitted entirely when every option in it costs the same (nothing to
   * badge). Empty when the course has no `partCost`. */
  private computeOptionCosts(part: PlacedPart<K>, descriptors: PropertyDescriptor[]): Record<string, Record<string, number>> {
    const partCost = this.spec.partCost;
    const result: Record<string, Record<string, number>> = {};
    if (!partCost) return result;
    for (const d of descriptors) {
      const costs = d.options.map((o) => partCost({ ...part, props: { ...part.props, [d.code]: o.value } }));
      const min = costs.length > 0 ? Math.min(...costs) : 0;
      const row: Record<string, number> = {};
      let hasExtra = false;
      d.options.forEach((o, i) => {
        const extra = costs[i]! - min;
        row[o.value] = extra;
        if (extra > 0) hasExtra = true;
      });
      if (hasExtra) result[d.code] = row;
    }
    return result;
  }

  /** Where the part for `code = value` of the selected part sits on screen right now (stage px,
   * centre + on-screen size), for the drawer's "part flies to the machine" animation. Empty when
   * nothing is selected or the course has no `partTargets` (no flight; the drawer commits the
   * prop change at once). */
  flyTargets(code: string, value: string): { x: number; y: number; size: number }[] {
    if (this.selectedId == null || !this.spec.partTargets) return [];
    const part = this.parts.find((p) => p.id === this.selectedId);
    if (!part) return [];
    const perMeter = this.scene.stagePerMeter();
    return this.spec.partTargets(part, code, value, this.level).map(({ at, size }) => {
      const stage = this.scene.worldToStage(at);
      return { x: stage.x, y: stage.y, size: size * perMeter };
    });
  }

  removeSelected(): void {
    if (this.mode !== 'edit' || this.selectedId == null) return;
    const part = this.parts.find((p) => p.id === this.selectedId);
    if (!part || part.locked) return;
    this.pushUndo();
    this.parts = this.parts.filter((p) => p.id !== part.id);
    this.selectedId = null;
    this.focusSelection();
    void this.rebuild();
  }

  private onPartMoved(id: number, dx: number, dy: number): void {
    if (!this.canTune()) return;
    const part = this.parts.find((p) => p.id === id);
    if (!part || part.lockPosition) return;
    const inEdit = this.mode === 'edit';
    if (inEdit) this.pushUndo();
    if (part.region) {
      const r = part.region;
      part.x = clamp(part.x + dx, r.x - r.w / 2, r.x + r.w / 2);
      part.y = clamp(part.y + dy, r.y - r.h / 2, r.y + r.h / 2);
    } else {
      // The visible top is worldH - groundDepth; a part still never moves below world y = 0.
      const depth = this.spec.world.groundDepth ?? 0;
      part.x = clamp(part.x + dx, 0.5, this.spec.world.worldW - 0.5);
      part.y = clamp(part.y + dy, 0, this.spec.world.worldH - depth - 0.5);
    }
    if (this.spec.grid) {
      const snapped = this.snapToGrid({ x: part.x, y: part.y });
      part.x = snapped.x;
      part.y = snapped.y;
    }
    this.selectedId = id;
    if (inEdit) this.resolveOverlap(id);
    this.applyTuneUpdate(part);
  }

  /** `spec.dragSnap` for the scene's drag ghost: the world-meter delta from part `id`'s stored
   * anchor to the point the course snaps the pointer position `at` to. The scene shows the ghost
   * there and the drop hands exactly this delta to `onPartMoved`, so the part lands where its
   * ghost was. null (today's offset drag) without `dragSnap`, for an unknown part, or outside
   * tune mode. */
  private dragSnapDelta(id: number, at: Vec2): Vec2 | null {
    if (!this.spec.dragSnap || !this.canTune()) return null;
    const part = this.parts.find((p) => p.id === id);
    if (!part || part.lockPosition) return null;
    const snapped = this.spec.dragSnap(part, at, this.parts, this.level);
    return { x: snapped.x - part.x, y: snapped.y - part.y };
  }

  private onPartTapped(id: number): void {
    if (!this.canTune()) return;
    const part = this.parts.find((p) => p.id === id);
    if (part && this.spec.catalog[part.kind].descriptors.length === 0) {
      // A part with nothing to tune only opens on a tap when its drawer would show something:
      // its own widgets, or the course's parts shelf (the rover's dome has no rows, but a tap
      // on it must open the shelf just like the BUILD pill does).
      const hasWidgets = (this.spec.widgets?.(part, this.parts, this.level).length ?? 0) > 0;
      const hasShelf = !!this.spec.drawer && hasShelfKinds(this.level.palette, this.spec.hud.partInfo);
      if (!hasWidgets && !hasShelf) return;
    }
    this.selectPart(id);
  }

  /** Selects part `id` (focus frame, drawer, its widgets). The tail of a tap on a part, and what
   * a 'select' widget (a BUILD button) does: that one selects even a part with no rows and no
   * widgets, since opening the drawer's shelf on it is the point. */
  private selectPart(id: number): void {
    if (!this.canTune() || !this.parts.some((p) => p.id === id)) return;
    // A new selection means any earlier live drag is over (and its id may be reused by a widget
    // on this other part), so the next live drag must push its own undo entry.
    this.liveDragId = null;
    this.selectedId = id;
    this.scene.setSelected(id);
    this.focusSelection();
  }

  private onEmptyTapped(at: Vec2): void {
    if (this.mode !== 'edit') return;
    const toolSpec = this.spec.tools?.find((t) => t.id === this.tool);
    if (toolSpec?.kind === 'place' && this.spec.placeWithTool) {
      const part = this.spec.placeWithTool(this.tool!, this.snapToGrid(at), this.parts, this.level);
      this.tryAdd(part);
      return;
    }
    this.liveDragId = null;
    this.selectedId = null;
    this.scene.setSelected(null);
    this.focusSelection();
  }

  private onLinkDrawn(from: LinkEnd, to: LinkEnd): void {
    if (this.mode !== 'edit') return;
    const toolSpec = this.spec.tools?.find((t) => t.id === this.tool);
    if (toolSpec?.kind !== 'link' || !this.spec.linkWithTool) return;
    const reserved: number[] = [];
    const allocId = (): number => {
      const id = this.nextId++;
      reserved.push(id);
      return id;
    };
    const parts = this.spec.linkWithTool(this.tool!, from, to, this.parts, this.level, allocId);
    if (!parts || parts.length === 0) return;
    this.tryAddMany(parts);
  }

  undo(): void {
    if (this.mode !== 'edit') return;
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.parts = prev;
    this.selectedId = null;
    this.focusSelection();
    void this.rebuild();
  }

  clear(): void {
    if (this.mode !== 'edit') return;
    const kept = this.parts.filter((p) => p.locked);
    if (kept.length === this.parts.length) return;
    this.pushUndo();
    this.parts = kept;
    this.selectedId = null;
    this.focusSelection();
    void this.rebuild();
  }

  hint(): void {
    if (this.level.hints.length === 0) return;
    this.hintIndex = (this.hintIndex + 1) % this.level.hints.length;
  }

  // ---- public commands (wired to the HUD) --------------------------------

  play(): void {
    if (!this.sim) return;
    const canReplay = this.mode === 'done' && !!this.sim.canReplay?.();
    if (this.mode !== 'edit' && !canReplay) return;
    if (this.mode === 'edit') this.editRest = { ...this.restFrame };
    this.pendingIntro = null;
    this.scene.skipIntro();
    this.mode = 'play';
    this.outcome = 'running' as O;
    this.passed = false;
    this.selectedId = null;
    this.scene.setSelected(null);
    this.scene.setEditable(false);
    this.stepper.reset();
    this.prevSnap = null;
    this.runCounter++;
    this.runsThisLevel++;
    this.sim.play();
  }

  stop(): void {
    if (this.mode === 'edit') return;
    this.mode = 'edit';
    this.outcome = null;
    this.passed = false;
    this.scene.setEditable(true);
    if (this.editRest) {
      this.restFrame = this.editRest;
      this.editRest = null;
      this.scene.setBaseFrame(this.restFrame);
    }
    if (this.spec.follow || this.spec.focusFrame || this.wide) {
      this.scene.trackPoint(null);
      this.scene.focusFrame(null);
    }
    // The world must go back to the rest pose.
    void this.rebuild();
  }

  next(): void {
    if (!this.passed) return;
    const nextLevel = this.spec.levels[this.levelIndex + 1];
    if (!nextLevel) return;
    this.loadLevel(nextLevel);
  }

  /** Hides the HUD's win banner (its close button routes here). The done-mode dash stays. */
  dismissWin(): void {
    this.hud.dismissWin();
  }

  selectLevel(id: string): void {
    const level = this.findLevel(id);
    if (!level) return;
    this.stop();
    this.loadLevel(level);
  }

  /** Wide worlds, edit and done mode: moves the rest frame so the view window's left edge sits
   * at `t` (0..1 of the scrollable range; restCx = viewW / 2 + t * (worldW - viewW) at zoom 1)
   * and glides the camera there (out of any selection focus). Ends an intro pan. Ignored when
   * the world fits the view, and in play mode (the follow camera owns the view). */
  scrollTo(t: number): void {
    if (!this.wide || this.mode === 'play' || !Number.isFinite(t)) return;
    this.pendingIntro = null;
    this.scene.cancelIntro();
    const cx = scrollToCx(t, this.viewW, this.effWorld.worldW, this.restFrame.zoom);
    this.restFrame = clampFrame({ ...this.restFrame, cx }, this.effWorld);
    this.scene.setBaseFrame(this.restFrame);
    this.scene.glideTo(this.restFrame);
  }

  /** Ends the level's intro pan at once (the camera jumps to its rest frame). No-op otherwise. */
  skipIntro(): void {
    if (this.pendingIntro) {
      this.pendingIntro = null;
      this.scene.focusFrame(this.restFrame, 0);
      return;
    }
    this.scene.skipIntro();
  }

  /** `HudState.scroll`: the camera window's left edge as 0..1 of the scrollable range. The rest
   * frame's (restCx) while the camera rests on it or heads there (so the thumb lands where the
   * finger let go, never trailing the glide); the live camera's while an intro pan or a selection
   * focus frame shows somewhere else (the bar follows the pan, and tells where a zoomed focus is).
   * Null when the world fits the view, and in play mode. */
  private scrollState(): number | null {
    if (!this.wide || this.mode === 'play') return null;
    const f = !this.pendingIntro && this.scene.isAtBase() ? this.restFrame : this.scene.cameraFrame();
    return cxToScroll(f.cx, this.viewW, this.effWorld.worldW, f.zoom);
  }

  // ---- widgets --------------------------------------------------------------

  /** Handles a tap/drag-release on an in-scene widget, or (for a `live` dial) a mid-drag commit.
   * `action` defaults to 'setProp' when the widget names a prop code, otherwise 'none'. */
  private onWidgetAction(id: string, value?: string, live?: boolean): void {
    const widget = this.widgets.find((w) => w.id === id);
    if (!widget) return;
    const action: WidgetAction = widget.action ?? (widget.code ? 'setProp' : 'none');
    // 'select' and 'play' need no selected part: both work from an idle widget (a BUILD button
    // over the machine, a big DRIVE button) as well as from a selected part's widgets.
    if (action === 'select') {
      const target = widget.kind === 'tap' ? widget.partId : undefined;
      if (target != null) this.selectPart(target);
      return;
    }
    if (action === 'play') {
      this.play();
      return;
    }
    const selected = this.selectedId != null ? this.parts.find((p) => p.id === this.selectedId) : undefined;
    // An idle widget (nothing selected) acts on its own `partId` part, when it names one.
    const ownId = widget.kind === 'tap' ? widget.partId : undefined;
    const part = selected ?? (ownId != null ? this.parts.find((p) => p.id === ownId) : undefined);
    if (!part) return;
    if (action === 'setProp') {
      if (!selected) return; // setProp always targets the selection
      if (!widget.code) return;
      const values = widget.kind === 'tap' ? widget.values : undefined;
      const next = value ?? nextWidgetValue(values, part.props[widget.code]);
      if (next === undefined) return;
      if (live) {
        // The first notch of the drag pushes the drag's ONE undo entry; later notches (and the
        // final release commit below) only update the prop.
        const first = this.liveDragId !== id;
        if (first) this.liveDragId = id;
        this.setPropInternal(widget.code, next, first && this.mode === 'edit');
      } else {
        const wasLive = this.liveDragId === id;
        this.liveDragId = null;
        // The release commit re-sends the value the last live notch already applied: skip it so
        // it isn't treated as a second change (no undo entry, no redundant sim update).
        if (wasLive && part.props[widget.code] === next) return;
        this.setProp(widget.code, next);
      }
    } else {
      const result = this.spec.onWidget?.(id, part, this.parts, this.level);
      if (result) {
        this.pushUndo();
        this.parts = result;
        void this.rebuild();
      }
    }
  }

  /** Drops a widget's own gated options (dial/lever/rack/cycle carry a copy of the descriptor's
   * options; a widget with no `code`, or a tap/pull widget, has none to filter and passes through
   * unchanged). Copies the widget, never mutates the one `spec.widgets` returned. Cheap: these are
   * the only four kinds that carry a per-option list. */
  private filterWidgetOptions(w: Widget): Widget {
    if (!w.code) return w;
    const code = w.code;
    switch (w.kind) {
      case 'dial':
      case 'lever':
        return { ...w, options: w.options.filter((o) => isOptionKnown(this.known, this.gated, code, o.value)) };
      case 'cycle':
        return { ...w, options: w.options.filter((o) => isOptionKnown(this.known, this.gated, code, o.value)) };
      case 'rack':
        return { ...w, items: w.items.filter((it) => isOptionKnown(this.known, this.gated, code, it.value)) };
      default:
        return w;
    }
  }

  /** A tap on a widget the controller marked `locked` (its `code` is in `part.lockedProps`). */
  private onWidgetBlocked(_id: string): void {
    this.lockedUntil = Date.now() + 2000;
  }

  /** Re-asks `spec.widgets` for the selected part when its key changes (selection, props,
   * position or canTune all invalidate it), and sends the result to the scene. Never calls
   * `spec.widgets` more than once per key change. */
  private updateWidgets(): void {
    const part = this.selectedId != null ? this.parts.find((p) => p.id === this.selectedId) : undefined;
    const canTune = this.canTune();
    // Idle widgets (nothing selected) depend on the whole build, so their key folds in every
    // part's id, kind, anchor and props (a handful of parts: cheap enough per frame).
    const idle = canTune && !part && !!this.spec.idleWidgets;
    const key = part
      ? `${this.mode}:${this.selectedId}:${JSON.stringify(part.props)}:${part.x},${part.y}:${canTune}`
      : idle
        ? `${this.mode}:idle:${this.level.id}:${this.parts.map((p) => `${p.id}:${p.kind}:${p.x},${p.y}:${JSON.stringify(p.props)}`).join(';')}`
        : `${this.mode}:${this.selectedId}:${canTune}`;
    if (key === this.widgetKey) return;
    this.widgetKey = key;
    if (canTune && part && this.spec.widgets) {
      // A widget without a code (the FIRE button) always shows; one that drives a not-yet-known
      // concept is dropped entirely, not merely disabled.
      const list: Widget[] = this.spec.widgets(part, this.parts, this.level)
        .filter((w) => !w.code || isKnown(this.known, w.code))
        .map((w) => this.filterWidgetOptions({
          ...w,
          locked: !!(w.code && part.lockedProps?.includes(w.code)),
        }));
      this.widgets = list;
      this.scene.setWidgets(list);
    } else if (idle && this.spec.idleWidgets) {
      // Same concept gate; a widget is locked by the `lockedProps` of the part it names, if any.
      const list: Widget[] = this.spec.idleWidgets(this.parts, this.level)
        .filter((w) => !w.code || isKnown(this.known, w.code))
        .map((w) => {
          const ownId = w.kind === 'tap' ? w.partId : undefined;
          const own = ownId != null ? this.parts.find((p) => p.id === ownId) : undefined;
          return this.filterWidgetOptions({ ...w, locked: !!(w.code && own?.lockedProps?.includes(w.code)) });
        });
      this.widgets = list;
      this.scene.setWidgets(list);
    } else {
      if (this.widgets.length > 0) this.scene.setWidgets([]);
      this.widgets = [];
    }
  }

  // ---- per-frame ----------------------------------------------------------

  private frame(deltaMs: number): void {
    const sim = this.sim;
    if (this.mode === 'play' && sim) {
      // Remember the pose before the LAST step of this frame; the draw below interpolates from it.
      this.stepper.update(deltaMs, () => {
        this.prevSnap = sim.snapshot();
        sim.step();
      });
    }
    if (sim) {
      // A sim may create or destroy bodies during a run (a launched projectile, a rebuilt arm).
      // The scene draws by body id, so re-send the items whenever their set changes.
      const items = sim.renderItems();
      let key = '';
      for (const it of items) key += it.partId + ':' + it.body + ',';
      if (key !== this.itemsKey) {
        this.itemsKey = key;
        this.scene.setItems(items, this.boundsOf(sim.handles()), this.regionsOf(), this.segmentsOf(sim.handles()));
      }
      const cur = sim.snapshot();
      // Render interpolation: at 120 Hz the sim steps every other frame; drawing prev->cur by the
      // stepper's alpha keeps the fuzz/rover (and the camera that follows them) moving every frame.
      const snap = this.mode === 'play' ? interpolateSnapshot(this.prevSnap, cur, this.stepper.alpha) : cur;
      this.scene.syncTransforms(snap);

      if (this.spec.follow && this.mode === 'play') {
        const f = this.spec.follow(this.level, sim.outcome, snap.elapsed);
        let tracked = false;
        if (f) {
          for (const role of f.roles) {
            const item = items.find((it) => it.role === role && snap.transforms.has(it.body));
            if (!item) continue;
            const t = snap.transforms.get(item.body)!;
            this.scene.trackPoint(
              { x: t.position.x + (f.offset?.x ?? 0), y: t.position.y + (f.offset?.y ?? 0) },
              f.zoom,
              f.lerp,
            );
            tracked = true;
            break;
          }
        }
        if (!tracked) this.scene.trackPoint(null);
      }
    }
    if (this.mode === 'play' && sim && sim.outcome !== ('running' as O)) {
      this.mode = 'done';
      this.outcome = sim.outcome;
      const metrics = sim.metrics();
      const goalsPass = allPass(evaluateGoals(this.level.goals, metrics));
      this.passed = this.spec.passed(this.outcome, goalsPass, this.level);
      if (this.passed) this.scene.celebrate();
      if (this.spec.tuneBetweenRuns) this.scene.setEditable(true);
      if (this.wide) {
        // A wide world stays where the run ended (zoomed back out to the rest zoom): the child
        // sees how far the run got, and can scroll from there. `stop()` restores the edit rest.
        const cur = this.scene.cameraFrame();
        this.restFrame = clampFrame({ ...this.restFrame, cx: cur.cx }, this.effWorld);
        this.scene.setBaseFrame(this.restFrame);
      }
      if (this.spec.follow || this.spec.focusFrame || this.wide) {
        this.scene.trackPoint(null);
        this.scene.focusFrame(null);
      }
    }

    this.updateWidgets();
    this.updateCoach();
    this.hud.update(this.hudState(), {
      refused: Date.now() < this.refusedUntil,
      locked: Date.now() < this.lockedUntil,
    });
  }

  /** Asks `spec.coach` for this frame's step (edit/tune mode, and done mode for the win step;
   * never while a run plays) and points the scene's hand at an in-scene target. The HUD draws
   * the hand for shelf/drawer/bar targets and puts the text in Bruno's bubble. */
  private updateCoach(): void {
    if (!this.spec.coach) return;
    const ask = this.canTune() || this.mode === 'done';
    this.coach = ask
      ? this.spec.coach({
          level: this.level,
          parts: this.parts,
          selectedId: this.selectedId,
          mode: this.mode,
          passed: this.passed,
          runs: this.runsThisLevel,
        }) ?? null
      : null;
    const t = this.coach?.target;
    this.scene.setCoachTarget(t && (t.type === 'widget' || t.type === 'part') ? t : null, this.coach?.id ?? '');
  }

  private hudState(): HudState<K, M, O, L> {
    const metrics: M =
      this.sim && this.mode !== 'edit' ? this.sim.metrics() : this.spec.editMetrics(this.parts, this.level, this.sim);
    const goals = evaluateGoals(this.level.goals, metrics);
    const canUndo = this.undoStack.length > 0;
    const canTune = this.canTune();
    const canPlay =
      (this.mode === 'edit' && this.sim !== null && this.spec.canPlay(this.parts, this.level, this.sim)) ||
      (this.mode === 'done' && !!this.sim?.canReplay?.());
    const unlockedCount = this.parts.filter((p) => !p.locked).length;
    const budget = this.level.budget !== undefined ? { used: this.usedCoins(), total: this.level.budget } : null;
    const paletteCosts: Partial<Record<K, number>> = {};
    if (this.spec.partCost) {
      for (const kind of this.level.palette) {
        paletteCosts[kind] = this.spec.partCost({ id: 0, kind, x: 0, y: 0, props: this.spec.defaultProps(kind) });
      }
    }
    // Full either by count (partLimit) or, with a budget, because even the cheapest palette part
    // no longer fits the coins left: either way the palette dims and nothing more can be added.
    let paletteFull = unlockedCount >= this.spec.partLimit;
    if (!paletteFull && budget) {
      const costs = Object.values(paletteCosts) as number[];
      if (costs.length > 0 && Math.min(...costs) > budget.total - budget.used) paletteFull = true;
    }
    const selectedPart = this.selectedId != null ? this.parts.find((p) => p.id === this.selectedId) : undefined;
    const claimedCodes = new Set(this.widgets.map((w) => w.code).filter((c): c is string => !!c));
    const selected = selectedPart && canTune
      ? (() => {
          const descriptors = this.spec.catalog[selectedPart.kind].descriptors
            .filter((d) => !claimedCodes.has(d.code) && isKnown(this.known, d.code))
            // Copy the descriptor (never mutate the catalog): drop options gated by a later level.
            .map((d) => ({ ...d, options: d.options.filter((o) => isOptionKnown(this.known, this.gated, d.code, o.value)) }));
          return { part: selectedPart, descriptors, optionCosts: this.computeOptionCosts(selectedPart, descriptors) };
        })()
      : null;

    let result: ResultCard | null = null;
    if (this.mode === 'done' && this.spec.resultCard) {
      const key = `${this.runCounter}:${this.level.id}:${this.outcome}:${this.passed}`;
      if (key !== this.resultCardCache.key) {
        this.resultCardCache = {
          key,
          card: this.spec.resultCard(this.parts, this.level, metrics, this.outcome as O, this.passed),
        };
      }
      result = this.resultCardCache.card;
    }
    const stats: StatBar[] = canTune && selectedPart && this.spec.stats ? this.spec.stats(selectedPart, this.level) : [];

    return {
      mode: this.mode,
      level: this.level,
      metrics,
      goals,
      outcome: this.outcome,
      passed: this.passed,
      canPlay,
      canUndo,
      canTune,
      palette: this.level.palette,
      paletteFull,
      selected,
      hintIndex: this.hintIndex,
      hintCount: this.level.hints.length,
      tool: this.tool,
      result,
      stats,
      introduced: this.level.introduces ?? [],
      budget,
      paletteCosts,
      scroll: this.scrollState(),
      coach: this.coach,
      unlocked: this.unlocked,
    };
  }

  destroy(): void {
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.scene.onUpdate = undefined;
    this.scene.onPartTapped = undefined;
    this.scene.onPartMoved = undefined;
    this.scene.onEmptyTapped = undefined;
    this.scene.onLinkDrawn = undefined;
    this.scene.onWidgetAction = undefined;
    this.scene.onWidgetBlocked = undefined;
    this.scene.onWidgetDrag = undefined;
    this.scene.dragSnap = undefined;
    this.sim?.destroy();
  }
}
