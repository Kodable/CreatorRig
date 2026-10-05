// BuilderApp's wide-world camera wiring (WorldSpec.worldW wider than the view): the edit-mode
// rest frame, `scrollTo` <-> `HudState.scroll`, the level-load intro pan sequencing, and what
// play/stop/done do to the rest frame. The scene and HUD are recording fakes (no Phaser).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BuilderApp } from './BuilderApp';
import type { BuilderScene } from './BuilderScene';
import type { BuilderHud } from './BuilderHud';
import type { CameraFrame, CourseSim, CourseSpec, HudState, Level, WorldSpec } from './types';
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
  handles() {
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
  onUpdate?: (dt: number) => void;
  private rec(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args });
  }
  named(name: string): unknown[][] {
    return this.calls.filter((c) => c.name === name).map((c) => c.args);
  }
  setTool(): void {}
  setGrid(): void {}
  setWidgets(): void {}
  setEditable(): void {}
  setMarkers(): void {}
  setItems(): void {}
  syncTransforms(): void {}
  setSelected(): void {}
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
  worldToStage() {
    return { x: 0, y: 0 };
  }
  stagePerMeter(): number {
    return 32;
  }
}

class FakeHud {
  last: HudState<K, M, O, L> | null = null;
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
