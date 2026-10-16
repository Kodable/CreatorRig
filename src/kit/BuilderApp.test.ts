// BuilderApp's wide-world camera wiring (WorldSpec.worldW wider than the view): the edit-mode
// rest frame, `scrollTo` <-> `HudState.scroll`, the level-load intro pan sequencing, and what
// play/stop/done do to the rest frame; and the first-levels UX hooks: idle widgets ('select' /
// 'play'), the coach, `HudState.unlocked` and `dragSnap`. The scene and HUD are recording fakes
// (no Phaser).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BuilderApp } from './BuilderApp';
import type { BuilderScene } from './BuilderScene';
import type { BuilderHud } from './BuilderHud';
import type { CameraFrame, CoachContext, CourseSim, CourseSpec, HudState, Level, PartHandle, TapWidget, Vec2, Widget, WorldSpec } from './types';
import type { FrameState } from './camera';

type K = 'box';
type M = { parts: number };
type O = 'running' | 'done';
type L = Level<K, M, O>;

const LEVEL: L = {
  id: 'one',
  title: 'One',
  bruno: '',
  goals: [],
  parts: [{ id: 1, kind: 'box', x: 3, y: 1, props: {}, locked: true }],
  palette: ['box'],
  hints: [],
  failHints: {},
};

/** `extentW` 20 on a 90 m-wide/30 m-view world: the effective world (20) fits the view (30), so
 * this level shows no scrollbar. */
const SHORT_LEVEL: L = { ...LEVEL, id: 'short', extentW: 20 };
/** `extentW` 60: the effective world (60) is still wider than the 30 m view, so this level
 * scrolls, but only over its own 60 m, never the course's full 90 m. */
const LONG_LEVEL: L = { ...LEVEL, id: 'long', extentW: 60 };

class FakeSim implements CourseSim<M, O> {
  outcome: O = 'running';
  play(): void {}
  step(): void {}
  snapshot() {
    return { elapsed: 0, outcome: this.outcome, transforms: new Map() };
  }
  metrics(): M {
    return { parts: 1 };
  }
  renderItems() {
    return [];
  }
  handles(): PartHandle[] {
    return [];
  }
  destroy(): void {}
}

/** Records the camera calls the app makes; `cam` stands in for the live camera frame. */
class FakeScene {
  calls: { name: string; args: unknown[] }[] = [];
  cam: FrameState = { cx: 15, cy: 7.5, zoom: 1 };
  base: CameraFrame | null = null;
  rest: CameraFrame | null = null;
  intro = false;
  /** Last `setWorldExtent` argument: the EFFECTIVE world (`WorldSpec.worldW` narrowed by
   * `Level.extentW`) the controller handed the scene for the level now loaded. */
  worldExtent: WorldSpec | null = null;
  /** The widget list last sent (`setWidgets`), the selection, and the coach hand's target. */
  widgetsNow: Widget[] = [];
  selected: number | null = null;
  coach: { target: unknown; stepId: string; gesture?: unknown } | null = null;
  onUpdate?: (dt: number) => void;
  onPartTapped?: (id: number) => void;
  onEmptyTapped?: (at: Vec2) => void;
  onPartMoved?: (id: number, dx: number, dy: number) => void;
  onWidgetAction?: (id: string, value?: string, live?: boolean) => void;
  dragSnap?: (id: number, at: Vec2) => Vec2 | null;
  private rec(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args });
  }
  named(name: string): unknown[][] {
    return this.calls.filter((c) => c.name === name).map((c) => c.args);
  }
  setWorldExtent(world: WorldSpec): void {
    this.rec('setWorldExtent', world);
    this.worldExtent = world;
  }
  setLook(look: string | undefined): void {
    this.rec('setLook', look);
  }
  setTool(): void {}
  setGrid(): void {}
  setWidgets(ws: Widget[]): void {
    this.rec('setWidgets', ws);
    this.widgetsNow = ws;
  }
  setEditable(): void {}
  setMarkers(): void {}
  setItems(): void {}
  syncTransforms(): void {}
  setSelected(id: number | null): void {
    this.selected = id;
  }
  setCoachTarget(target: unknown, stepId: string, gesture?: unknown): void {
    this.coach = target ? (gesture ? { target, stepId, gesture } : { target, stepId }) : null;
  }
  celebrate(): void {}
  trackPoint(p: unknown): void {
    this.rec('trackPoint', p);
  }
  focusFrame(f: CameraFrame | null, ms?: number): void {
    this.rec('focusFrame', f, ms);
    this.rest = f ?? this.base;
  }
  setBaseFrame(f: CameraFrame | null): void {
    this.rec('setBaseFrame', f);
    this.base = f;
  }
  glideTo(f: CameraFrame): void {
    this.rec('glideTo', f);
    this.rest = f;
  }
  playIntro(from: CameraFrame, to: CameraFrame, ms: number): void {
    this.rec('playIntro', from, to, ms);
    this.intro = true;
    this.cam = { ...from };
    this.rest = to;
  }
  skipIntro(): void {
    this.rec('skipIntro');
    this.intro = false;
  }
  cancelIntro(): void {
    this.rec('cancelIntro');
    this.intro = false;
  }
  isIntroActive(): boolean {
    return this.intro;
  }
  isAtBase(): boolean {
    return !this.intro && !!this.rest && !!this.base && this.rest.cx === this.base.cx && this.rest.zoom === this.base.zoom;
  }
  cameraFrame(): FrameState {
    return { ...this.cam };
  }
  worldToStage(p?: Vec2) {
    return p ? { x: p.x * 10, y: 700 - p.y * 10 } : { x: 0, y: 0 };
  }
  /** The SUPPLY BIN's drop ring (`setDropZone`), last call. */
  dropZone: { zone: { at: Vec2; r: number } | null; hot: boolean } | null = null;
  setDropZone(zone: { at: Vec2; r: number } | null, hot = false): void {
    this.dropZone = { zone, hot };
  }
  stagePerMeter(): number {
    return 32;
  }
}

class FakeHud {
  last: HudState<K, M, O, L> | null = null;
  dismissed = 0;
  dismissWin(): void {
    this.dismissed++;
  }
  setLevel(): void {}
  update(state: HudState<K, M, O, L>): void {
    this.last = state;
  }
}

const WIDE: WorldSpec = { worldW: 90, worldH: 15, ppm: 32 };
const SINGLE: WorldSpec = { worldW: 30, worldH: 15, ppm: 32 };

function makeSpec(world: WorldSpec, extra: Partial<CourseSpec<K, M, O, L>> = {}): CourseSpec<K, M, O, L> {
  return {
    id: 'test',
    levels: [LEVEL],
    catalog: { box: { label: 'Box', icon: '■', descriptors: [] } },
    defaultProps: () => ({}),
    partLimit: 5,
    createSim: async () => new FakeSim(),
    editMetrics: () => ({ parts: 1 }),
    canPlay: () => true,
    passed: () => false,
    spawn: { x: 5, y: 2 },
    world,
    roles: {},
    hud: {
      partInfo: { box: { label: 'Box', icon: '■' } },
      meters: [],
      goalValueText: () => '',
      barlessMetrics: [],
      lines: { play: '', pass: '', doneNotPassed: '', freePlay: '' },
      failOutcomes: [],
    },
    ...extra,
  };
}

function boot(spec: CourseSpec<K, M, O, L>): { app: BuilderApp<K, M, O, L>; scene: FakeScene; hud: FakeHud } {
  const scene = new FakeScene();
  const hud = new FakeHud();
  const app = new BuilderApp<K, M, O, L>(scene as unknown as BuilderScene, hud as unknown as BuilderHud<K, M, O, L>, spec);
  return { app, scene, hud };
}

/** Runs one controller frame and returns the HUD state it produced. */
function frame(scene: FakeScene, hud: FakeHud): HudState<K, M, O, L> {
  scene.onUpdate?.(16.667);
  return hud.last!;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// BuilderApp listens for visibilitychange on `document`; the node test environment has none.
const g = globalThis as unknown as { document?: unknown };
let hadDocument = false;
beforeAll(() => {
  hadDocument = 'document' in g;
  if (!hadDocument) g.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
});
afterAll(() => {
  if (!hadDocument) delete g.document;
});

describe('BuilderApp on a single-screen world', () => {
  it('reports no scroll and ignores scrollTo', async () => {
    const { app, scene, hud } = boot(makeSpec(SINGLE));
    await flush();
    expect(frame(scene, hud).scroll).toBeNull();
    app.scrollTo(0.5);
    expect(scene.named('glideTo')).toHaveLength(0);
  });

  it('keeps the camera still in edit mode when the course has no focusFrame/follow (as before)', async () => {
    const { scene } = boot(makeSpec(SINGLE));
    await flush();
    expect(scene.named('focusFrame')).toHaveLength(0);
    expect(scene.named('trackPoint')).toHaveLength(0);
    expect(scene.named('playIntro')).toHaveLength(0);
  });
});

describe('BuilderApp on a wide world: rest frame and scrollbar', () => {
  it('starts on the left window: base frame cx = viewW / 2, scroll 0', async () => {
    const { scene, hud } = boot(makeSpec(WIDE));
    await flush();
    expect(scene.base).toEqual({ cx: 15, cy: 7.5, zoom: 1 });
    expect(frame(scene, hud).scroll).toBe(0);
  });

  it('scrollTo(t) moves the rest frame to viewW / 2 + t * (worldW - viewW) and glides there', async () => {
    const { app, scene, hud } = boot(makeSpec(WIDE));
    await flush();
    app.scrollTo(1);
    expect(scene.named('glideTo').at(-1)![0]).toEqual({ cx: 75, cy: 7.5, zoom: 1 });
    expect(scene.base).toEqual({ cx: 75, cy: 7.5, zoom: 1 });
    expect(frame(scene, hud).scroll).toBeCloseTo(1, 9);
    app.scrollTo(0.25);
    expect((scene.named('glideTo').at(-1)![0] as CameraFrame).cx).toBeCloseTo(30, 9);
    expect(frame(scene, hud).scroll).toBeCloseTo(0.25, 9);
  });

  it('clamps scrollTo to 0..1', async () => {
    const { app, scene } = boot(makeSpec(WIDE));
    await flush();
    app.scrollTo(-3);
    expect((scene.named('glideTo').at(-1)![0] as CameraFrame).cx).toBe(15);
    app.scrollTo(9);
    expect((scene.named('glideTo').at(-1)![0] as CameraFrame).cx).toBe(75);
  });

  it('while a focus frame shows elsewhere, scroll reports the live camera', async () => {
    const { app, scene, hud } = boot(makeSpec(WIDE));
    await flush();
    app.scrollTo(0.5);
    scene.focusFrame({ cx: 5, cy: 2, zoom: 2.8 }); // what selecting a part does
    scene.cam = { cx: 15 / 2.8, cy: 2, zoom: 2.8 }; // the clamped focus at the world start
    expect(frame(scene, hud).scroll).toBe(0);
  });

  it('a palette part spawns in the visible window', async () => {
    const { app } = boot(makeSpec(WIDE));
    await flush();
    app.scrollTo(1); // window 60..90
    app.addPart('box');
    expect(app.parts.at(-1)!.x).toBeCloseTo(60 + 5, 9);
  });

  it('play hides the scroll; stop returns to the edit rest frame', async () => {
    const { app, scene, hud } = boot(makeSpec(WIDE));
    await flush();
    app.scrollTo(0.5);
    app.play();
    expect(frame(scene, hud).scroll).toBeNull();
    app.stop();
    expect(scene.base).toEqual({ cx: 45, cy: 7.5, zoom: 1 });
    expect(scene.named('focusFrame').at(-1)![0]).toBeNull(); // null = the base (rest) frame
    expect(frame(scene, hud).scroll).toBeCloseTo(0.5, 9);
  });

  it('a finished run keeps the view where it ended; stop restores the edit rest frame', async () => {
    const { app, scene, hud } = boot(makeSpec(WIDE));
    await flush();
    app.play();
    (app.sim as FakeSim).outcome = 'done';
    scene.cam = { cx: 70, cy: 4, zoom: 1.6 }; // where the follow camera got to
    const done = frame(scene, hud);
    expect(done.mode).toBe('done');
    expect(scene.base).toEqual({ cx: 70, cy: 7.5, zoom: 1 });
    expect(done.scroll).toBeCloseTo((70 - 15) / 60, 9);
    app.stop();
    expect(scene.base).toEqual({ cx: 15, cy: 7.5, zoom: 1 });
  });
});

describe('BuilderApp: the level-load intro pan', () => {
  const FROM = { cx: 75, cy: 7.5, zoom: 1 };
  const TO = { cx: 20, cy: 7.5, zoom: 1 };
  const withIntro = (): CourseSpec<K, M, O, L> => makeSpec(WIDE, { intro: () => ({ from: FROM, to: TO, ms: 3000 }) });

  it('holds the opening frame until the first build is ready, then pans from -> to over ms', async () => {
    const { scene } = boot(withIntro());
    expect(scene.named('focusFrame').at(-1)).toEqual([FROM, 0]);
    expect(scene.named('playIntro')).toHaveLength(0);
    await flush();
    expect(scene.named('playIntro')).toEqual([[FROM, TO, 3000]]);
  });

  it('the rest frame is `to`; the bar follows the pan, then sits at `to`', async () => {
    const { scene, hud } = boot(withIntro());
    await flush();
    expect(scene.base).toEqual(TO);
    scene.cam = { cx: 45, cy: 7.5, zoom: 1 };
    expect(frame(scene, hud).scroll).toBeCloseTo(0.5, 9); // mid-pan: the live camera
    scene.intro = false; // the pan ended
    expect(frame(scene, hud).scroll).toBeCloseTo((20 - 15) / 60, 9);
  });

  it('scrolling during the pan ends it and glides from where it is', async () => {
    const { app, scene } = boot(withIntro());
    await flush();
    app.scrollTo(0);
    expect(scene.named('cancelIntro').length).toBeGreaterThan(0);
    expect(scene.intro).toBe(false);
    expect((scene.named('glideTo').at(-1)![0] as CameraFrame).cx).toBe(15);
  });

  it('skipIntro before the first build jumps to `to` and never plays the pan', () => {
    const { app, scene } = boot(withIntro());
    app.skipIntro();
    expect(scene.named('focusFrame').at(-1)).toEqual([TO, 0]);
    return flush().then(() => expect(scene.named('playIntro')).toHaveLength(0));
  });

  it('a level without a pan (intro returns null) starts on the left window', async () => {
    const { scene } = boot(makeSpec(WIDE, { intro: () => null }));
    await flush();
    expect(scene.named('playIntro')).toHaveLength(0);
    expect(scene.base).toEqual({ cx: 15, cy: 7.5, zoom: 1 });
  });
});

describe('BuilderApp: Level.extentW (a short level in a wide course)', () => {
  it('hands the scene the effective world: min(WorldSpec.worldW, Level.extentW)', async () => {
    const { scene } = boot(makeSpec(WIDE, { levels: [SHORT_LEVEL, LONG_LEVEL] }));
    await flush();
    expect(scene.worldExtent).toEqual({ ...WIDE, worldW: 20 });
  });

  it('scroll is null (no scrollbar) when extentW fits the view, even on a wide-world course', async () => {
    const { scene, hud } = boot(makeSpec(WIDE, { levels: [SHORT_LEVEL, LONG_LEVEL] }));
    await flush();
    expect(frame(scene, hud).scroll).toBeNull();
  });

  it('the rest frame is the full-field frame of the EFFECTIVE world, not the course worldW', async () => {
    const { scene } = boot(makeSpec(WIDE, { levels: [SHORT_LEVEL] }));
    await flush();
    // fullFrame of a 20 m world (which fits its own 20 m view): cx = 10, not 15 (90 m world).
    expect(scene.base).toEqual({ cx: 10, cy: 7.5, zoom: 1 });
  });

  it('scroll is non-null, and its range uses extentW, for a level still wider than the view', async () => {
    const { app, scene, hud } = boot(makeSpec(WIDE, { levels: [SHORT_LEVEL, LONG_LEVEL] }));
    await flush();
    app.selectLevel('long');
    await flush();
    expect(scene.worldExtent).toEqual({ ...WIDE, worldW: 60 });
    expect(frame(scene, hud).scroll).toBe(0);
    app.scrollTo(1);
    // viewW / 2 + 1 * (extentW 60 - viewW 30) = 45, never 75 (the course's full 90 m worldW).
    expect((scene.named('glideTo').at(-1)![0] as CameraFrame).cx).toBeCloseTo(45, 9);
    expect(frame(scene, hud).scroll).toBeCloseTo(1, 9);
  });

  it('a palette part still spawns inside the scrolled (effective-world) view window', async () => {
    const { app, scene } = boot(makeSpec(WIDE, { levels: [SHORT_LEVEL, LONG_LEVEL] }));
    await flush();
    app.selectLevel('long');
    await flush();
    app.scrollTo(1); // window 30..60 of the 60 m effective world
    expect(scene.base!.cx).toBeCloseTo(45, 9);
    app.addPart('box');
    expect(app.parts.at(-1)!.x).toBeCloseTo(30 + 5, 9);
  });
});

describe('BuilderApp: Level.look (2026-10-09)', () => {
  const MARS_LEVEL: L = { ...LEVEL, id: 'mars', look: 'mars' };
  const MOON_LEVEL: L = { ...LEVEL, id: 'moon' }; // no look: the world's own

  it('passes the level look to the scene', async () => {
    const { scene } = boot(makeSpec(SINGLE, { levels: [MARS_LEVEL, MOON_LEVEL] }));
    await flush();
    expect(scene.named('setLook')).toEqual([['mars']]);
  });

  it('passes undefined for a level without a look', async () => {
    const { scene } = boot(makeSpec(SINGLE, { levels: [MOON_LEVEL, MARS_LEVEL] }));
    await flush();
    expect(scene.named('setLook')).toEqual([[undefined]]);
  });

  it('passes the next level own look when advancing', async () => {
    const { app, scene } = boot(makeSpec(SINGLE, { levels: [MOON_LEVEL, MARS_LEVEL] }));
    await flush();
    app.selectLevel('mars');
    await flush();
    expect(scene.named('setLook')).toEqual([[undefined], ['mars']]);
  });
});

describe('BuilderApp: idle widgets (nothing selected)', () => {
  const BUILD: TapWidget = { kind: 'tap', id: 'build', action: 'select', partId: 1, at: { x: 3, y: 2 }, icon: '🔧', label: 'BUILD', style: 'big' };
  const DRIVE: TapWidget = { kind: 'tap', id: 'drive', action: 'play', at: { x: 6, y: 2 }, icon: '▶', label: 'DRIVE', style: 'big' };

  it("shows idleWidgets while nothing is selected; 'select' selects its part like a tap on it", async () => {
    const selected: Widget[] = [{ kind: 'tap', id: 'own', at: { x: 3, y: 3 }, icon: '?' }];
    const { app, scene, hud } = boot(makeSpec(SINGLE, { idleWidgets: () => [BUILD, DRIVE], widgets: () => selected }));
    await flush();
    frame(scene, hud);
    expect(scene.widgetsNow.map((w) => w.id)).toEqual(['build', 'drive']);
    scene.onWidgetAction!('build');
    expect(app.selectedId).toBe(1);
    expect(scene.selected).toBe(1);
    frame(scene, hud);
    expect(scene.widgetsNow.map((w) => w.id)).toEqual(['own']); // the selected part's widgets
  });

  it("'select' opens even a part with no rows and no widgets (the shelf is the point)", async () => {
    const { app, scene, hud } = boot(makeSpec(SINGLE, { idleWidgets: () => [BUILD] }));
    await flush();
    frame(scene, hud);
    scene.onPartTapped!(1); // a plain tap on that bare part does nothing, as before
    expect(app.selectedId).toBeNull();
    scene.onWidgetAction!('build');
    expect(app.selectedId).toBe(1);
    expect(frame(scene, hud).selected?.part.id).toBe(1);
  });

  it("'play' from an idle widget starts a run, and idle widgets hide in play mode", async () => {
    const { app, scene, hud } = boot(makeSpec(SINGLE, { idleWidgets: () => [BUILD, DRIVE] }));
    await flush();
    frame(scene, hud);
    scene.onWidgetAction!('drive');
    expect(app.mode).toBe('play');
    frame(scene, hud);
    expect(scene.widgetsNow).toEqual([]);
  });

  it('re-asks idleWidgets when the build changes, not every frame', async () => {
    let calls = 0;
    const { app, scene, hud } = boot(makeSpec(SINGLE, { idleWidgets: () => (calls++, [BUILD]) }));
    await flush();
    frame(scene, hud);
    frame(scene, hud);
    expect(calls).toBe(1);
    app.addPart('box'); // selects the new part: no idle widgets
    frame(scene, hud);
    expect(calls).toBe(1);
    scene.onEmptyTapped!({ x: 0, y: 0 });
    await flush();
    frame(scene, hud);
    expect(calls).toBe(2); // deselected with one more part: asked again
    frame(scene, hud);
    expect(calls).toBe(2);
  });
});

describe('BuilderApp: the coach', () => {
  it('asks spec.coach each frame and sends the step to the HUD and in-scene targets to the scene', async () => {
    const seen: CoachContext<K, L>[] = [];
    const spec = makeSpec(SINGLE, {
      idleWidgets: () => [{ kind: 'tap', id: 'build', action: 'select', partId: 1, at: { x: 3, y: 2 }, icon: '🔧' }],
      coach: (ctx) => {
        seen.push(ctx);
        if (ctx.mode === 'done') return { id: 'win', text: 'You did it!', target: { type: 'bar', button: 'next' } };
        return ctx.selectedId == null
          ? { id: 'tap-build', text: 'Tap BUILD', target: { type: 'widget', id: 'build' } }
          : { id: 'add-box', text: 'Add a box', target: { type: 'shelf', kind: 'box' } };
      },
    });
    const { app, scene, hud } = boot(spec);
    await flush();
    let st = frame(scene, hud);
    expect(st.coach).toEqual({ id: 'tap-build', text: 'Tap BUILD', target: { type: 'widget', id: 'build' } });
    expect(scene.coach).toEqual({ target: { type: 'widget', id: 'build' }, stepId: 'tap-build' });
    expect(seen.at(-1)).toMatchObject({ mode: 'edit', selectedId: null, passed: false, runs: 0 });

    scene.onWidgetAction!('build');
    st = frame(scene, hud);
    expect(st.coach?.id).toBe('add-box');
    expect(scene.coach).toBeNull(); // a shelf target is the HUD's to draw

    app.play();
    const asked = seen.length;
    st = frame(scene, hud);
    expect(st.coach).toBeNull(); // never while a run plays
    expect(seen.length).toBe(asked);

    (app.sim as FakeSim).outcome = 'done';
    st = frame(scene, hud);
    expect(st.mode).toBe('done');
    expect(st.coach?.id).toBe('win');
    expect(seen.at(-1)).toMatchObject({ mode: 'done', runs: 1 });
  });

  it('counts runs per level load', async () => {
    const seen: number[] = [];
    const { app, scene, hud } = boot(makeSpec(SINGLE, { coach: (ctx) => (seen.push(ctx.runs), null) }));
    await flush();
    app.play();
    (app.sim as FakeSim).outcome = 'done';
    frame(scene, hud);
    app.stop();
    await flush();
    app.play();
    (app.sim as FakeSim).outcome = 'done';
    frame(scene, hud);
    expect(seen.at(-1)).toBe(2);
    app.selectLevel('one');
    await flush();
    frame(scene, hud);
    expect(seen.at(-1)).toBe(0);
  });

  it('reports no coach without spec.coach', async () => {
    const { scene, hud } = boot(makeSpec(SINGLE));
    await flush();
    expect(frame(scene, hud).coach).toBeNull();
    expect(scene.coach).toBeNull();
  });

  it('CoachContext.changed: each prop code the child set (once, in order) and move after a drag; a level load clears it', async () => {
    const seen: CoachContext<K, L>[] = [];
    const rows = [
      { code: 'color', label: 'Color', options: [{ value: 'red', label: 'Red' }] },
      { code: 'size', label: 'Size', options: [{ value: 'big', label: 'Big' }] },
    ];
    const { app, scene, hud } = boot(makeSpec(SINGLE, {
      catalog: { box: { label: 'Box', icon: '■', descriptors: rows } },
      coach: (ctx) => (seen.push(ctx), null),
    }));
    await flush();
    frame(scene, hud);
    expect(seen.at(-1)!.changed).toEqual([]);
    scene.onPartTapped!(1);
    app.setProp('color', 'red');
    app.setProp('color', 'red'); // the same value again: still the one entry
    frame(scene, hud);
    expect(seen.at(-1)!.changed).toEqual(['color']);
    scene.onPartMoved!(1, 0, 0); // no real move
    frame(scene, hud);
    expect(seen.at(-1)!.changed).toEqual(['color']);
    scene.onPartMoved!(1, 1, 0);
    app.setProp('size', 'big');
    frame(scene, hud);
    expect(seen.at(-1)!.changed).toEqual(['color', 'move', 'size']);
    app.selectLevel('one');
    await flush();
    frame(scene, hud);
    expect(seen.at(-1)!.changed).toEqual([]);
  });

  it("waits for Bruno's lesson intro to close: no step (and no hand) while the dialog is up", async () => {
    let asked = 0;
    const spec = makeSpec(SINGLE, {
      coach: () => (asked++, { id: 'tap', text: 'Tap it', target: { type: 'part', partId: 1 } }),
    });
    const { scene, hud, tap } = bootWithDialog(spec);
    await flush();
    expect(frame(scene, hud).coach).toBeNull();
    expect(scene.coach).toBeNull();
    expect(asked).toBe(0);
    await tap();
    expect(frame(scene, hud).coach?.id).toBe('tap');
    expect(scene.coach).toEqual({ target: { type: 'part', partId: 1 }, stepId: 'tap' });
  });
});

describe('BuilderApp: the coach gesture', () => {
  it("passes a step's drag gesture (CoachStep.gesture) on to the scene with its widget target", async () => {
    const spec = makeSpec(SINGLE, {
      coach: () => ({ id: 'angle', text: 'Drag it', target: { type: 'widget', id: 'angle' }, gesture: { kind: 'drag', toValue: '60' } }),
    });
    const { scene, hud } = boot(spec);
    await flush();
    expect(frame(scene, hud).coach?.gesture).toEqual({ kind: 'drag', toValue: '60' });
    expect(scene.coach).toEqual({ target: { type: 'widget', id: 'angle' }, stepId: 'angle', gesture: { kind: 'drag', toValue: '60' } });
  });
});

describe('BuilderApp: CourseSim.showPreview', () => {
  it("is called once per level load, after Bruno's lesson intro closes (never under it), and again after Stop/Reset rebuilds the level", async () => {
    let calls = 0;
    class PreviewSim extends FakeSim {
      showPreview(): void {
        calls++;
      }
    }
    const spec = makeSpec(SINGLE, { createSim: async () => new PreviewSim() });
    const { app, tap } = bootWithDialog(spec);
    await flush();
    expect(calls).toBe(0);
    await tap();
    expect(calls).toBe(1);
    app.play();
    app.stop();
    await flush();
    expect(calls).toBe(2);
    app.selectLevel('one');
    await flush();
    expect(calls).toBe(2);
    await tap();
    expect(calls).toBe(3);
  });

  it('waits for the first build when the dialog closes before it is ready', async () => {
    let calls = 0;
    let release: (() => void) | null = null;
    class PreviewSim extends FakeSim {
      showPreview(): void {
        calls++;
      }
    }
    const spec = makeSpec(SINGLE, {
      createSim: () => new Promise((r) => {
        release = () => r(new PreviewSim());
      }),
    });
    const { tap } = bootWithDialog(spec);
    await flush();
    await tap();
    expect(calls).toBe(0);
    release!();
    await flush();
    expect(calls).toBe(1);
  });
});

describe('BuilderApp: HudState.unlocked', () => {
  it("lists the level's `part:<kind>` introduces entries that are in its palette, once each", async () => {
    const level: L = { ...LEVEL, introduces: ['part:box', 'power', 'part:ghost', 'part:box'] };
    const { scene, hud } = boot(makeSpec(SINGLE, { levels: [level] }));
    await flush();
    expect(frame(scene, hud).unlocked).toEqual(['box']);
  });

  it('is empty on a level without such entries', async () => {
    const { scene, hud } = boot(makeSpec(SINGLE));
    await flush();
    expect(frame(scene, hud).unlocked).toEqual([]);
  });
});

describe('BuilderApp: dragSnap', () => {
  it("gives the scene the course's snapped ghost delta, and the drop lands the part on it", async () => {
    const spec = makeSpec(SINGLE, { dragSnap: (_part, at) => ({ x: Math.round(at.x), y: 1.5 }) });
    const { app, scene } = boot(spec);
    await flush();
    // Part 1 sits at (3, 1); the pointer at (6.4, 4) snaps to (6, 1.5).
    const delta = scene.dragSnap!(1, { x: 6.4, y: 4 });
    expect(delta!.x).toBeCloseTo(3, 9);
    expect(delta!.y).toBeCloseTo(0.5, 9);
    scene.onPartMoved!(1, delta!.x, delta!.y);
    const part = app.parts.find((p) => p.id === 1)!;
    expect(part.x).toBeCloseTo(6, 9);
    expect(part.y).toBeCloseTo(1.5, 9);
  });

  it('leaves the offset drag alone without spec.dragSnap, and for a lockPosition part', async () => {
    const { scene } = boot(makeSpec(SINGLE));
    await flush();
    expect(scene.dragSnap).toBeUndefined();
    const pinned: L = { ...LEVEL, parts: [{ ...LEVEL.parts[0]!, lockPosition: true }] };
    const b = boot(makeSpec(SINGLE, { levels: [pinned], dragSnap: (_p, at) => at }));
    await flush();
    expect(b.scene.dragSnap!(1, { x: 5, y: 5 })).toBeNull();
  });
});

describe('BuilderApp: dismissWin', () => {
  it('routes to the HUD', async () => {
    const { app, hud } = boot(makeSpec(SINGLE));
    await flush();
    app.dismissWin();
    expect(hud.dismissed).toBe(1);
  });
});

// ---- Bruno's modal dialog (2026-10-12, src/ui/brunoDialog.ts) ------------------------------------

/** A scene with Bruno's stage and a HUD with a dialog box, recording everything in one `log` (in
 * order) so the tests can check that the goals intro and the camera pan wait for the dialog. The
 * box's `say` stays open until `tap()` closes it. */
function bootWithDialog(spec: CourseSpec<K, M, O, L>) {
  const log: string[] = [];
  const said: { label: string; text: string }[] = [];
  let close: (() => void) | null = null;
  const scene = new FakeScene() as FakeScene & { showBrunoStage(): Promise<void>; hideBrunoStage(): Promise<void> };
  scene.showBrunoStage = async () => void log.push('stage-in');
  scene.hideBrunoStage = async () => void log.push('stage-out');
  const origPlayIntro = scene.playIntro.bind(scene);
  scene.playIntro = (from, to, ms) => {
    log.push('pan');
    origPlayIntro(from, to, ms);
  };
  const hud = new FakeHud() as FakeHud & { brunoDialog: unknown; playGoalsIntro(): void };
  hud.playGoalsIntro = () => void log.push('goals-intro');
  hud.brunoDialog = {
    begin: () => log.push('dim'),
    say: (line: { label: string; text: string }) => {
      log.push('say');
      said.push(line);
      return new Promise<void>((r) => {
        close = r;
      });
    },
    undim: () => log.push('undim'),
    end: () => log.push('end'),
    cancel: () => {
      const c = close;
      close = null;
      c?.();
    },
  };
  const app = new BuilderApp<K, M, O, L>(scene as unknown as BuilderScene, hud as unknown as BuilderHud<K, M, O, L>, spec);
  const tap = async (): Promise<void> => {
    const c = close;
    close = null;
    c?.();
    await flush();
  };
  return { app, scene, hud, log, said, tap };
}

describe("BuilderApp: Bruno's lesson intro on level load", () => {
  const FROM = { cx: 75, cy: 7.5, zoom: 1 };
  const TO = { cx: 20, cy: 7.5, zoom: 1 };
  const LEVELS: L[] = [
    { ...LEVEL, id: 'one', title: 'One', bruno: 'Welcome to the park.', hints: ['Try a box.', 'Two boxes.'] },
    { ...LEVEL, id: 'two', title: 'Two', bruno: 'Now a harder one.' },
  ];
  const withIntro = (): CourseSpec<K, M, O, L> =>
    makeSpec(WIDE, { levels: LEVELS, intro: () => ({ from: FROM, to: TO, ms: 3000 }) });

  it('says the level title and line, and runs the goals intro and the pan only after the tap', async () => {
    const { app, log, said, tap } = bootWithDialog(withIntro());
    await flush(); // the first build is ready, the dialog still open
    expect(said).toEqual([{ label: 'One', text: 'Welcome to the park.' }]);
    expect(log).toEqual(['dim', 'stage-in', 'say']);
    expect(app.isDialogOpen()).toBe(true);
    await tap();
    expect(log).toEqual(['dim', 'stage-in', 'say', 'undim', 'stage-out', 'end', 'goals-intro', 'pan']);
    expect(app.isDialogOpen()).toBe(false);
  });

  it('a dialog closed before the first build is ready: the pan starts when the build lands', async () => {
    let release: (() => void) | null = null;
    const spec = withIntro();
    const createSim = spec.createSim;
    spec.createSim = (parts, level) =>
      new Promise((r) => {
        release = () => r(createSim(parts, level) as unknown as FakeSim);
      });
    const { log, tap } = bootWithDialog(spec);
    await flush();
    await tap();
    expect(log.slice(-2)).toEqual(['end', 'goals-intro']);
    expect(log).not.toContain('pan');
    release!();
    await flush();
    await flush();
    expect(log.at(-1)).toBe('pan');
  });

  it('plays again for the next level, the picker and a reload, but not for stop/replay', async () => {
    const { app, scene, hud, said, tap } = bootWithDialog(makeSpec(SINGLE, { levels: LEVELS, passed: () => true }));
    await flush();
    await tap();
    app.play();
    (app.sim as FakeSim).outcome = 'done';
    frame(scene, hud);
    app.stop();
    await flush();
    expect(said).toHaveLength(1);
    app.play();
    (app.sim as FakeSim).outcome = 'done';
    frame(scene, hud);
    app.next();
    await flush();
    expect(said.at(-1)).toEqual({ label: 'Two', text: 'Now a harder one.' });
    await tap();
    app.selectLevel('one');
    await flush();
    expect(said.at(-1)).toEqual({ label: 'One', text: 'Welcome to the park.' });
    expect(said).toHaveLength(3);
  });

  it('a level loaded while the previous intro is open replaces it (no goals intro for the old one)', async () => {
    const { app, log, said, tap } = bootWithDialog(makeSpec(SINGLE, { levels: LEVELS }));
    await flush();
    app.selectLevel('two');
    await flush();
    expect(said.map((l) => l.label)).toEqual(['One', 'Two']);
    expect(log.filter((e) => e === 'goals-intro')).toHaveLength(0);
    await tap();
    expect(log.filter((e) => e === 'goals-intro')).toHaveLength(1);
  });
});

describe('BuilderApp: hints play in the same dialog', () => {
  const LEVELS: L[] = [{ ...LEVEL, title: 'One', bruno: 'Hi.', hints: ['Try a box.', 'Two boxes.'] }];

  it('cycles the hint ladder with a "Hint N of M" label, and no goals intro follows', async () => {
    const { app, scene, hud, log, said, tap } = bootWithDialog(makeSpec(SINGLE, { levels: LEVELS }));
    await flush();
    await tap();
    const goalsAfterIntro = log.filter((e) => e === 'goals-intro').length;
    app.hint();
    await flush();
    expect(said.at(-1)).toEqual({ label: 'Hint 1 of 2', text: 'Try a box.' });
    expect(frame(scene, hud).hintIndex).toBe(0);
    app.hint(); // ignored while the hint is still open
    await flush();
    expect(said).toHaveLength(2);
    await tap();
    app.hint();
    await flush();
    expect(said.at(-1)).toEqual({ label: 'Hint 2 of 2', text: 'Two boxes.' });
    await tap();
    app.hint();
    await flush();
    expect(said.at(-1)).toEqual({ label: 'Hint 1 of 2', text: 'Try a box.' });
    await tap();
    expect(log.filter((e) => e === 'goals-intro')).toHaveLength(goalsAfterIntro);
  });

  it('is ignored during a run', async () => {
    const { app, said, tap } = bootWithDialog(makeSpec(SINGLE, { levels: LEVELS }));
    await flush();
    await tap();
    app.play();
    app.hint();
    await flush();
    expect(said).toHaveLength(1);
  });

  it('without dialog support (plain fakes) a hint still advances the ladder', async () => {
    const { app, scene, hud } = boot(makeSpec(SINGLE, { levels: LEVELS }));
    await flush();
    app.hint();
    expect(frame(scene, hud).hintIndex).toBe(0);
    app.hint();
    expect(frame(scene, hud).hintIndex).toBe(1);
  });
});

// 2026-10-16: the SUPPLY BIN (`CourseSpec.bin`): the controller gates and stamps the tiles, hides
// the rows they drive, and applies a tile through the ordinary setProp path.
describe('BuilderApp: the SUPPLY BIN', () => {
  const BANDS = { code: 'bands', label: 'Rubber bands', options: Array.from({ length: 60 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })), default: '2' };
  const FUZZ = { code: 'fuzz', label: 'Fuzz', options: ['Flower', 'Donut', 'Fur'].map((v) => ({ value: v, label: v })), default: 'Flower' };
  const ANGLE = { code: 'angle', label: 'Angle', options: ['30', '45'].map((v) => ({ value: v, label: v })) };
  const binLevel = (o: Partial<L> = {}): L => ({
    ...LEVEL,
    id: 'bin',
    parts: [{ id: 1, kind: 'box', x: 3, y: 1, props: { bands: '2', fuzz: 'Flower', angle: '30' }, locked: true }],
    ...o,
  });
  class BoundsSim extends FakeSim {
    override handles(): PartHandle[] {
      return [{ partId: 1, kind: 'box', bodies: [], joints: [], visuals: [], bounds: { x: 3, y: 1, w: 2, h: 1 } }];
    }
  }
  const binSpec = (levels: L[], extra: Partial<CourseSpec<K, M, O, L>> = {}): CourseSpec<K, M, O, L> =>
    makeSpec(SINGLE, {
      levels,
      drawer: true,
      createSim: async () => new BoundsSim(),
      catalog: { box: { label: 'Box', icon: '■', descriptors: [BANDS, FUZZ, ANGLE] } },
      bin: (part) => [
        { id: 'band', image: 'ui/bin/band.svg', label: 'Rubber band', group: 'Rubber bands', code: 'bands', step: 1, badge: '∞', drop: { at: { x: 2, y: 2 }, r: 0.5 } },
        ...['Flower', 'Donut', 'Fur'].map((v) => ({ id: v, image: `${v}.png`, label: v, group: 'Fuzzes', code: 'fuzz', value: v, active: part.props.fuzz === v })),
      ],
      ...extra,
    });
  const select = (app: BuilderApp<K, M, O, L>, scene: FakeScene): void => {
    scene.onPartTapped?.(1);
    expect(app.selectedId).toBe(1);
  };

  it('sends the bin for the selected part and hides the rows its items drive (others stay)', async () => {
    const { app, scene, hud } = boot(binSpec([binLevel()]));
    await flush();
    expect(frame(scene, hud).bin).toBeNull(); // nothing selected
    select(app, scene);
    const st = frame(scene, hud);
    expect(st.bin!.map((it) => it.id)).toEqual(['band', 'Flower', 'Donut', 'Fur']);
    expect(st.bin!.find((it) => it.id === 'Flower')!.active).toBe(true);
    expect(st.selected!.descriptors.map((d) => d.code)).toEqual(['angle']);
  });

  it('no bin without the drawer: the rows stay as they were', async () => {
    const { app, scene, hud } = boot(binSpec([binLevel()], { drawer: false }));
    await flush();
    select(app, scene);
    const st = frame(scene, hud);
    expect(st.bin).toBeNull();
    expect(st.selected!.descriptors.map((d) => d.code)).toEqual(['bands', 'fuzz', 'angle']);
  });

  it('gates tiles by Level.introduces and stamps NEW and locked', async () => {
    const first = binLevel({ id: 'a', introduces: ['bands'] });
    const second = binLevel({ id: 'b', introduces: ['fuzz', 'fuzz:Donut'] });
    const spec = binSpec([first, second, binLevel({ id: 'c', introduces: ['fuzz:Fur'] })]);
    const { app, scene, hud } = boot(spec);
    await flush();
    select(app, scene);
    let st = frame(scene, hud);
    expect(st.bin!.map((it) => [it.id, it.isNew])).toEqual([['band', true]]);
    // The fuzz row is hidden too (not known yet): a bin-driven code never comes back as a row.
    expect(st.selected!.descriptors.map((d) => d.code)).toEqual([]);
    app.selectLevel('b');
    await flush();
    app.loadLevel({ ...second, parts: [{ ...second.parts[0]!, lockedProps: ['bands'] }] });
    await flush();
    select(app, scene);
    st = frame(scene, hud);
    expect(st.bin!.map((it) => [it.id, !!it.isNew, !!it.locked])).toEqual([
      ['band', false, true],
      ['Flower', true, false],
      ['Donut', true, false],
    ]);
  });

  it('applyBin goes through setProp: a step adds to the prop, one undo entry, CoachContext.changed', async () => {
    const seen: CoachContext<K, L>[] = [];
    const { app, scene, hud } = boot(binSpec([binLevel()], { coach: (c) => (seen.push(c), null) }));
    await flush();
    select(app, scene);
    expect(app.binValue('band')).toEqual({ code: 'bands', value: '3' });
    app.applyBin('band');
    expect(app.parts[0]!.props.bands).toBe('3');
    expect(app.undoStack).toHaveLength(1);
    app.applyBin('band');
    expect(app.parts[0]!.props.bands).toBe('4');
    app.applyBin('Donut');
    expect(app.parts[0]!.props.fuzz).toBe('Donut');
    frame(scene, hud);
    expect(seen.at(-1)!.changed).toEqual(['bands', 'fuzz']);
    app.undo();
    expect(app.parts[0]!.props.fuzz).toBe('Flower');
  });

  it('the active tile and a step past the row do nothing; a locked tile refuses and flashes the locked line', async () => {
    const lv = binLevel();
    const { app, scene, hud } = boot(binSpec([{ ...lv, parts: [{ ...lv.parts[0]!, props: { ...lv.parts[0]!.props, bands: '60' } }] }]));
    await flush();
    select(app, scene);
    app.applyBin('Flower');
    app.applyBin('band');
    expect(app.parts[0]!.props).toMatchObject({ bands: '60', fuzz: 'Flower' });
    expect(app.undoStack).toHaveLength(0);
    expect(app.binValue('band')).toBeNull();

    const locked = boot(binSpec([{ ...lv, parts: [{ ...lv.parts[0]!, lockedProps: ['fuzz'] }] }]));
    await flush();
    select(locked.app, locked.scene);
    locked.app.applyBin('Donut');
    expect(locked.app.parts[0]!.props.fuzz).toBe('Flower');
    expect(locked.app.binValue('Donut')).toBeNull();
    let flagged = false;
    (locked.hud as unknown as { update: (s: unknown, f?: { locked?: boolean }) => void }).update = (_s, f) => {
      flagged = !!f?.locked;
    };
    locked.scene.onUpdate?.(16);
    expect(flagged).toBe(true);
  });

  it('refuses a bin change over the budget like any prop change', async () => {
    const lv = binLevel({ budget: 3 });
    const spec = binSpec([{ ...lv, parts: [{ ...lv.parts[0]!, locked: false }] }], { partCost: (p) => Number(p.props.bands) });
    const { app, scene } = boot(spec);
    await flush();
    select(app, scene);
    app.applyBin('band');
    expect(app.parts[0]!.props.bands).toBe('3');
    app.applyBin('band');
    expect(app.parts[0]!.props.bands).toBe('3');
  });

  it("drop zones: the item's own, else the selected part's bounds; on screen through the scene camera", async () => {
    const { app, scene } = boot(binSpec([binLevel()]));
    await flush();
    expect(app.binDropZone('band')).toBeNull(); // nothing selected
    select(app, scene);
    expect(app.binDropZone('band')).toEqual({ x: 20, y: 680, r: 0.5 * 32 });
    expect(app.binDropZone('Donut')).toEqual({ x: 30, y: 690, r: 1 * 32 });
    expect(app.binDropZone('nope')).toBeNull();
    app.binDrag('band', true);
    expect(scene.dropZone).toEqual({ zone: { at: { x: 2, y: 2 }, r: 0.5 }, hot: true });
    app.binDrag(null, false);
    expect(scene.dropZone).toEqual({ zone: null, hot: false });
  });
});

describe('BuilderApp: a live SlideWidget drag', () => {
  it('commits each notch while dragged with ONE undo entry, and skips the matching release', async () => {
    const OPTS = ['1.5', '2', '2.5', '3'].map((v) => ({ value: v, label: v }));
    const lv: L = { ...LEVEL, parts: [{ id: 1, kind: 'box', x: 3, y: 1, props: { armLen: '2' } }] };
    const spec = makeSpec(SINGLE, {
      levels: [lv],
      catalog: { box: { label: 'Box', icon: '■', descriptors: [{ code: 'armLen', label: 'Arm', options: OPTS }] } },
      widgets: (part) => [{ id: 'arm', kind: 'slide', code: 'armLen', from: { x: 3, y: 2 }, to: { x: 0, y: 2 }, options: OPTS, value: part.props.armLen ?? '2', live: true }],
    });
    const { app, scene, hud } = boot(spec);
    await flush();
    scene.onPartTapped?.(1);
    frame(scene, hud);
    expect(scene.widgetsNow.map((w) => w.kind)).toEqual(['slide']);
    scene.onWidgetAction?.('arm', '2.5', true);
    scene.onWidgetAction?.('arm', '3', true);
    scene.onWidgetAction?.('arm', '3');
    expect(app.parts[0]!.props.armLen).toBe('3');
    expect(app.undoStack).toHaveLength(1);
    // The slide drives its row: no drawer/chip row for armLen.
    expect(frame(scene, hud).selected!.descriptors).toEqual([]);
  });
});
