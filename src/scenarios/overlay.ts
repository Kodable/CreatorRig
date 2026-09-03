import type Phaser from 'phaser';
import { createElement, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/profiling';
import type { RigParams } from '../params';
import { percentile, type FrameStats } from '../report';
import { round2 } from './physicsCommon';
import { DrawCallCounter, loadAll } from './renderCommon';
import { ITEM_ATLAS } from './sprites';
import { EditorStore, type ObjectProps } from './overlay/store';
import { App, type Project, type UiMetrics } from './overlay/ui';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

/** The editor world is 3 stages wide and tall, so pan and zoom have room. */
const WORLD = { width: 3072, height: 2304 };
const SPRITE = { w: 148, h: 118 };
const STAGE = { w: 1024, h: 768 };
const ROBOT = { dragMs: 5000, zoomMs: 3000, typeMs: 2000, listMs: 2000 };

type GizmoMode = 'react' | 'imperative';

interface Drag {
  pointerId: number;
  mode: 'move' | 'pan' | 'resize' | 'rotate';
  id: number | null;
  grab: { x: number; y: number };
  start: ObjectProps | null;
  startDist: number;
  startAngle: number;
  last: { x: number; y: number };
}

interface Pinch {
  ids: [number, number];
  dist0: number;
  zoom0: number;
  mid0: { x: number; y: number };
  scroll0: { x: number; y: number };
}

/**
 * Overlay: a React editor shell (rail, 20-input properties panel, object list, DOM gizmo) over
 * 60 Phaser sprites. React owns selection, properties and camera state; Phaser renders. The
 * report says whether the two loops fight: frame time while dragging, pointer-to-frame latency,
 * gizmo-to-sprite drift during zoom and pan, React commits per second, long tasks.
 * ?robot=1 drives it with synthetic events through the same handlers; otherwise a human does.
 * ?gizmo=imperative moves the gizmo element directly during a drag and tells React at the end.
 * ?flush=0 lets React schedule input-driven renders itself; the default wraps them in flushSync
 * so the DOM gizmo commits in the same frame as the Phaser camera and sprite.
 */
const overlay: Scenario = {
  id: 'overlay',
  defaultCount: 60,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    const count = params.count > 0 ? params.count : this.defaultCount;
    const robot = (params.extra['robot'] ?? '0') === '1';
    const gizmoMode: GizmoMode = params.extra['gizmo'] === 'imperative' ? 'imperative' : 'react';
    const flush = (params.extra['flush'] ?? '1') !== '0';
    /** Runs input-driven store changes; with flush, React commits before the handler returns. */
    const mutate = (fn: () => void): void => {
      if (flush) flushSync(fn);
      else fn();
    };
    const random = makeRandom(params.seed);
    await loadAll(scene, (load) => load.atlas(ITEM_ATLAS.key, ITEM_ATLAS.png, ITEM_ATLAS.json));
    const frames = scene.textures.get(ITEM_ATLAS.key).getFrameNames();
    const draws = new DrawCallCounter(scene);
    const cam = scene.cameras.main;

    // Objects: 60 tinted atlas sprites spread over the world; React state is the source of truth.
    const objects: ObjectProps[] = [];
    const images = new Map<number, Phaser.GameObjects.Image>();
    for (let i = 0; i < count; i++) {
      const o: ObjectProps = {
        id: i + 1,
        name: `object-${i + 1}`,
        frame: frames[Math.floor(random() * frames.length)]!,
        x: 200 + random() * (WORLD.width - 400),
        y: 200 + random() * (WORLD.height - 400),
        rotation: (random() - 0.5) * 0.6,
        scaleX: 0.6 + random() * 0.6,
        scaleY: 0.6 + random() * 0.6,
        alpha: 1,
        depth: i,
        tintR: 120 + Math.floor(random() * 135),
        tintG: 120 + Math.floor(random() * 135),
        tintB: 120 + Math.floor(random() * 135),
        mass: round2(1 + random() * 9),
        friction: round2(random()),
        bounce: round2(random() * 0.8),
        density: 1,
        layer: Math.floor(random() * 4),
        tag: ['prop', 'goal', 'hazard', 'deco'][i % 4]!,
        speed: Math.floor(random() * 200),
        hp: Math.floor(1 + random() * 10),
        points: Math.floor(random() * 100),
      };
      objects.push(o);
      images.set(o.id, scene.add.image(o.x, o.y, ITEM_ATLAS.key, o.frame));
    }
    const store = new EditorStore(objects, { zoom: 1, scrollX: WORLD.width / 2 - STAGE.w / 2, scrollY: WORLD.height / 2 - STAGE.h / 2 });
    const applied: Record<number, number> = {};
    /** Imperative gizmo mode: positions that Phaser draws and the gizmo shows before React hears of them. */
    const live = new Map<number, { x: number; y: number }>();

    /**
     * Store to Phaser, synchronously on every change: camera and the objects whose version moved.
     * Waiting for the next update() would let the DOM gizmo lead the sprite by one frame.
     */
    const applyState = (): void => {
      const state = store.getState();
      for (const o of state.objects) {
        const v = state.objectVersion[o.id] ?? 0;
        if (applied[o.id] === v) continue;
        applied[o.id] = v;
        const img = images.get(o.id)!;
        img.setPosition(o.x, o.y).setRotation(o.rotation).setScale(o.scaleX, o.scaleY).setAlpha(o.alpha).setDepth(o.depth);
        img.setTint((o.tintR << 16) | (o.tintG << 8) | o.tintB);
      }
      cam.setZoom(state.camera.zoom);
      cam.setScroll(state.camera.scrollX, state.camera.scrollY);
    };
    store.subscribe(applyState);
    applyState();

    // Coordinate helpers. Game pixels are the 1024x768 stage; CSS pixels are the page. The canvas
    // rectangle is read live: Phaser's cached canvasBounds went stale on the iPad when Safari's
    // toolbar moved, and every DOM position was off by a constant 18 px.
    const canvasRect = (): { x: number; y: number; sx: number; sy: number } => {
      const r = scene.sys.game.canvas.getBoundingClientRect();
      return { x: r.left, y: r.top, sx: STAGE.w / Math.max(1, r.width), sy: STAGE.h / Math.max(1, r.height) };
    };
    const view = (): { x: number; y: number } => {
      const c = store.getState().camera;
      return { x: c.scrollX + (STAGE.w / 2) * (1 - 1 / c.zoom), y: c.scrollY + (STAGE.h / 2) * (1 - 1 / c.zoom) };
    };
    const toGame = (clientX: number, clientY: number): { x: number; y: number } => {
      const b = canvasRect();
      return { x: (clientX - b.x) * b.sx, y: (clientY - b.y) * b.sy };
    };
    const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
      const g = toGame(clientX, clientY);
      const v = view();
      const z = store.getState().camera.zoom;
      return { x: v.x + g.x / z, y: v.y + g.y / z };
    };
    /** World to canvas-layer pixels: no page offset, the layer already sits on the canvas. */
    const project: Project = (wx, wy) => {
      const b = canvasRect();
      const v = view();
      const z = store.getState().camera.zoom;
      return { x: ((wx - v.x) * z) / b.sx, y: ((wy - v.y) * z) / b.sy, scale: z / b.sx };
    };
    const zoomAt = (clientX: number, clientY: number, factor: number): void => {
      const c = store.getState().camera;
      const zoom = Math.min(4, Math.max(0.25, c.zoom * factor));
      const g = toGame(clientX, clientY);
      const w = toWorld(clientX, clientY);
      // Keep the world point under the cursor fixed.
      const vx = w.x - g.x / zoom;
      const vy = w.y - g.y / zoom;
      store.setCamera({ zoom, scrollX: vx - (STAGE.w / 2) * (1 - 1 / zoom), scrollY: vy - (STAGE.h / 2) * (1 - 1 / zoom) });
    };
    const reveal = (id: number): void => {
      const o = store.object(id);
      if (o) mutate(() => store.setCamera({ scrollX: o.x - STAGE.w / 2, scrollY: o.y - STAGE.h / 2 }));
    };
    const hitTest = (wx: number, wy: number): ObjectProps | null => {
      const list = store.getState().objects;
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i]!;
        if (Math.abs(wx - o.x) <= (SPRITE.w * o.scaleX) / 2 && Math.abs(wy - o.y) <= (SPRITE.h * o.scaleY) / 2) return o;
      }
      return null;
    };

    // DOM: one root for React and for pointer input over the whole stage, plus a layer kept
    // exactly over the canvas. The gizmo lives in that layer, so its position is in canvas pixels
    // and no page or viewport offset can separate it from the sprites (iPad Safari moved the
    // canvas under a page-positioned gizmo by a constant 6 to 77 px).
    // createRoot empties its container on the first render, so the canvas layer and the React
    // container are siblings inside the input shell (`root`), which holds the pointer handlers.
    const stage = document.getElementById('stage') ?? document.body;
    const root = document.createElement('div');
    root.className = 'ov-root';
    const canvasLayer = document.createElement('div');
    canvasLayer.className = 'ov-canvas-layer';
    const reactRoot = document.createElement('div');
    reactRoot.className = 'ov-react';
    root.append(canvasLayer, reactRoot);
    stage.appendChild(root);
    const canvas = scene.sys.game.canvas;
    const layerBox = { left: -1, top: -1, width: 0, height: 0 };
    const syncLayer = (): void => {
      const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = canvas;
      if (left === layerBox.left && top === layerBox.top && width === layerBox.width && height === layerBox.height) return;
      Object.assign(layerBox, { left, top, width, height });
      canvasLayer.style.transform = `translate(${left}px, ${top}px)`;
      canvasLayer.style.width = `${width}px`;
      canvasLayer.style.height = `${height}px`;
    };
    syncLayer();
    const gizmoRef: RefObject<HTMLDivElement | null> = { current: null };
    const uiMetrics: UiMetrics = { commits: 0, commitMs: [] };
    createRoot(reactRoot).render(createElement(App, { store, project, metrics: uiMetrics, onReveal: reveal, gizmoRef, canvasLayer }));

    // Robot state (declared here so the metrics can name the phase of an outlier).
    const bot = { phase: 'drag' as 'drag' | 'zoom' | 'type' | 'list', t: 0, cycle: 0, frame: 0, down: false, origin: { x: 0, y: 0 } };

    // Metrics.
    const dragFrames: number[] = [];
    const latency: number[] = [];
    const typingLatency: number[] = [];
    const drift: number[] = [];
    const driftByMode: Record<string, number[]> = {};
    let driftMaxAt = '';
    let inputPending: number | null = null;
    let typingPending: number | null = null;
    let pointerMoves = 0;
    let longTasks = 0;
    let longTaskMax = 0;
    try {
      // From here on only: buffered entries would count the page load and the atlas decode.
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          longTasks++;
          if (e.duration > longTaskMax) longTaskMax = e.duration;
        }
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      // Not in this browser.
    }
    root.addEventListener('input', (e) => (typingPending = typingPending ?? e.timeStamp), true);

    // Pointer input: move, resize, rotate, pan, pinch, wheel. Panel and rail keep their own events.
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: Drag | null = null;
    let pinch: Pinch | null = null;
    const inUi = (t: EventTarget | null): boolean => t instanceof Element && t.closest('.ov-panel, .ov-rail') !== null;
    const setLive = (id: number, x: number, y: number): void => {
      live.set(id, { x, y });
      images.get(id)?.setPosition(x, y);
      const g = gizmoRef.current;
      const o = store.object(id);
      if (g && o) {
        const p = project(x, y);
        const w = SPRITE.w * o.scaleX * p.scale;
        const h = SPRITE.h * o.scaleY * p.scale;
        g.style.transform = `translate(${p.x - w / 2}px, ${p.y - h / 2}px) rotate(${o.rotation}rad)`;
      }
    };

    root.addEventListener('pointerdown', (e) => {
      if (inUi(e.target)) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.entries()];
        const c = store.getState().camera;
        drag = null;
        pinch = {
          ids: [a![0], b![0]],
          dist0: Math.hypot(a![1].x - b![1].x, a![1].y - b![1].y),
          zoom0: c.zoom,
          mid0: { x: (a![1].x + b![1].x) / 2, y: (a![1].y + b![1].y) / 2 },
          scroll0: { x: c.scrollX, y: c.scrollY },
        };
        return;
      }
      const handle = e.target instanceof HTMLElement ? e.target.dataset['handle'] : undefined;
      const w = toWorld(e.clientX, e.clientY);
      const selectedId = store.getState().selected;
      const selected = selectedId === null ? null : store.object(selectedId) ?? null;
      if (handle && selected) {
        drag = {
          pointerId: e.pointerId,
          mode: handle === 'rotate' ? 'rotate' : 'resize',
          id: selected.id,
          grab: { x: 0, y: 0 },
          start: selected,
          startDist: Math.hypot(w.x - selected.x, w.y - selected.y),
          startAngle: Math.atan2(w.y - selected.y, w.x - selected.x),
          last: { x: e.clientX, y: e.clientY },
        };
        return;
      }
      const hit = e.shiftKey ? null : hitTest(w.x, w.y);
      mutate(() => {
        if (hit) {
          store.select(hit.id);
          drag = { pointerId: e.pointerId, mode: 'move', id: hit.id, grab: { x: w.x - hit.x, y: w.y - hit.y }, start: hit, startDist: 0, startAngle: 0, last: { x: e.clientX, y: e.clientY } };
        } else {
          if (!e.shiftKey) store.select(null);
          drag = { pointerId: e.pointerId, mode: 'pan', id: null, grab: { x: 0, y: 0 }, start: null, startDist: 0, startAngle: 0, last: { x: e.clientX, y: e.clientY } };
        }
      });
    });

    root.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pointerMoves++;
      inputPending = inputPending ?? e.timeStamp;
      if (pinch) {
        const a = pointers.get(pinch.ids[0]);
        const b = pointers.get(pinch.ids[1]);
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoom = Math.min(4, Math.max(0.25, (pinch.zoom0 * dist) / Math.max(1, pinch.dist0)));
        const rect = canvasRect();
        const p = pinch;
        mutate(() =>
          store.setCamera({
            zoom,
            scrollX: p.scroll0.x - ((mid.x - p.mid0.x) * rect.sx) / zoom,
            scrollY: p.scroll0.y - ((mid.y - p.mid0.y) * rect.sy) / zoom,
          }),
        );
        return;
      }
      if (!drag || drag.pointerId !== e.pointerId) return;
      const w = toWorld(e.clientX, e.clientY);
      const d = drag;
      mutate(() => {
        if (d.mode === 'move' && d.id !== null) {
          const x = w.x - d.grab.x;
          const y = w.y - d.grab.y;
          if (gizmoMode === 'react') store.setProps(d.id, { x, y });
          else setLive(d.id, x, y);
        } else if (d.mode === 'pan') {
          const c = store.getState().camera;
          const b = canvasRect();
          store.setCamera({ scrollX: c.scrollX - ((e.clientX - d.last.x) * b.sx) / c.zoom, scrollY: c.scrollY - ((e.clientY - d.last.y) * b.sy) / c.zoom });
        } else if (d.mode === 'resize' && d.id !== null && d.start) {
          const f = Math.max(0.1, Math.hypot(w.x - d.start.x, w.y - d.start.y) / Math.max(1, d.startDist));
          store.setProps(d.id, { scaleX: d.start.scaleX * f, scaleY: d.start.scaleY * f });
        } else if (d.mode === 'rotate' && d.id !== null && d.start) {
          store.setProps(d.id, { rotation: d.start.rotation + Math.atan2(w.y - d.start.y, w.x - d.start.x) - d.startAngle });
        }
      });
      d.last = { x: e.clientX, y: e.clientY };
    });

    const endPointer = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
      if (pinch && (pinch.ids[0] === e.pointerId || pinch.ids[1] === e.pointerId)) pinch = null;
      if (drag && drag.pointerId === e.pointerId) {
        if (drag.mode === 'move' && drag.id !== null && gizmoMode === 'imperative') {
          const id = drag.id;
          const p = live.get(id);
          if (p) mutate(() => store.setProps(id, p));
          live.delete(id);
        }
        drag = null;
      }
    };
    root.addEventListener('pointerup', endPointer);
    root.addEventListener('pointercancel', endPointer);
    root.addEventListener(
      'wheel',
      (e) => {
        if (inUi(e.target)) return;
        e.preventDefault();
        inputPending = inputPending ?? e.timeStamp;
        mutate(() => zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002)));
      },
      { passive: false },
    );

    // After each render: latency from the earliest unrendered input, and gizmo drift.
    scene.sys.game.events.on('postrender', () => {
      const now = performance.now();
      if (inputPending !== null) {
        latency.push(now - inputPending);
        inputPending = null;
      }
      if (typingPending !== null) {
        typingLatency.push(now - typingPending);
        typingPending = null;
      }
      const g = gizmoRef.current;
      const selectedId = store.getState().selected;
      const img = selectedId === null ? undefined : images.get(selectedId);
      if (g && img) {
        const r = g.getBoundingClientRect();
        const gp = toGame(r.left + r.width / 2, r.top + r.height / 2);
        const wp = cam.getWorldPoint(gp.x, gp.y);
        const d = (Math.hypot(wp.x - img.x, wp.y - img.y) * cam.zoom) / canvasRect().sx;
        if (d > (drift.length > 0 ? Math.max(...drift) : -1)) driftMaxAt = `${bot.phase} t=${Math.round(bot.t)} frame=${bot.frame} selected=${selectedId}`;
        drift.push(d);
        const mode = pinch ? 'pinch' : drag ? drag.mode : 'idle';
        (driftByMode[mode] ??= []).push(d);
      }
    });

    // Robot: the same handlers, driven by synthetic events on a fixed schedule.
    const dispatchPointer = (type: string, x: number, y: number, target: Element = root, init: PointerEventInit = {}): void => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, ...init }));
    };
    const setInput = (name: string, value: string): void => {
      const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const center = (): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    /** World to page pixels, for aiming synthetic pointer events. */
    const toPage = (wx: number, wy: number): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      const p = project(wx, wy);
      return { x: r.left + p.x, y: r.top + p.y };
    };
    const robotStep = (dt: number): void => {
      bot.t += dt;
      bot.frame++;
      const state = store.getState();
      if (bot.phase === 'drag') {
        const target = state.objects[bot.cycle % state.objects.length]!;
        if (!bot.down) {
          reveal(target.id);
          const p = toPage(target.x, target.y);
          bot.origin = { x: p.x, y: p.y };
          dispatchPointer('pointerdown', p.x, p.y);
          bot.down = true;
        } else if (bot.t < ROBOT.dragMs * 0.6) {
          const a = (bot.t / 1000) * Math.PI;
          dispatchPointer('pointermove', bot.origin.x + Math.cos(a) * 120, bot.origin.y + Math.sin(a) * 80);
        } else if (bot.t < ROBOT.dragMs * 0.62) {
          // Switch to the south-east resize handle for the rest of the phase.
          dispatchPointer('pointerup', bot.origin.x, bot.origin.y);
          const handle = root.querySelector('[data-handle="se"]');
          const r = handle?.getBoundingClientRect();
          if (handle && r) {
            bot.origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            dispatchPointer('pointerdown', bot.origin.x, bot.origin.y, handle);
          }
          bot.t = ROBOT.dragMs * 0.62;
        } else if (bot.t < ROBOT.dragMs) {
          const k = 1 + Math.sin((bot.t / 400) * Math.PI) * 0.4;
          dispatchPointer('pointermove', bot.origin.x * k + center().x * (1 - k), bot.origin.y * k + center().y * (1 - k));
        } else {
          dispatchPointer('pointerup', bot.origin.x, bot.origin.y);
          bot.down = false;
          bot.phase = 'zoom';
          bot.t = 0;
        }
      } else if (bot.phase === 'zoom') {
        const c = center();
        if (!bot.down) {
          dispatchPointer('pointerdown', c.x, c.y, root, { shiftKey: true });
          bot.origin = c;
          bot.down = true;
        } else if (bot.t < ROBOT.zoomMs) {
          root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y, deltaY: Math.sin((bot.t / 1500) * Math.PI) * 60 }));
          const a = (bot.t / 1000) * Math.PI;
          dispatchPointer('pointermove', bot.origin.x + Math.cos(a) * 60, bot.origin.y + Math.sin(a) * 40, root, { shiftKey: true });
        } else {
          dispatchPointer('pointerup', bot.origin.x, bot.origin.y);
          bot.down = false;
          mutate(() => store.select(state.objects[bot.cycle % state.objects.length]!.id));
          bot.phase = 'type';
          bot.t = 0;
        }
      } else if (bot.phase === 'type') {
        if (bot.t < ROBOT.typeMs) {
          if (bot.frame % 6 === 0 && state.selected !== null) {
            const o = store.object(state.selected)!;
            setInput(bot.frame % 12 === 0 ? 'x' : 'rotation', bot.frame % 12 === 0 ? String(Math.round(o.x + 3)) : String(round2(o.rotation + 0.05)));
          }
        } else {
          bot.phase = 'list';
          bot.t = 0;
        }
      } else if (bot.phase === 'list') {
        if (bot.t < ROBOT.listMs) {
          if (bot.frame % 30 === 0) root.querySelector<HTMLButtonElement>(`[data-object-id="${state.objects[(bot.cycle + 7) % state.objects.length]!.id}"].ov-row`)?.click();
        } else {
          bot.phase = 'drag';
          bot.t = 0;
          bot.cycle++;
        }
      }
    };

    return {
      update(deltaMs: number): void {
        syncLayer();
        if (robot) robotStep(deltaMs);
        if (drag || pinch) dragFrames.push(deltaMs);
        // State reaches Phaser in the store listener; live drag positions win until the pointer lifts.
        for (const [id, l] of live) images.get(id)?.setPosition(l.x, l.y);
        draws.frame();
      },
      pass(_stats: FrameStats): boolean | null {
        if (dragFrames.length < 30 || latency.length < 10) return null;
        const sortedDrag = [...dragFrames].sort((a, b) => a - b);
        const sortedLat = [...latency].sort((a, b) => a - b);
        const sortedDrift = [...drift].sort((a, b) => a - b);
        // "60 fps drag": no dropped frames (over 33.4 ms) beyond 1 percent, and the frame callback
        // at most about 3 ms late at p95. Real input events land between frames and delay the
        // callback by 1 to 2 ms on both devices without dropping a frame; the robot, whose events
        // fire inside the frame, shows a clean 16.7 ms.
        const dropped = dragFrames.filter((ms) => ms > 33.4).length;
        return percentile(sortedDrag, 95) <= 20 && dropped <= dragFrames.length * 0.01 && percentile(sortedLat, 95) < 50 && percentile(sortedDrift, 95) <= 2;
      },
      extra(): Record<string, unknown> {
        const stats = (xs: number[]): { p50: number; p95: number; max: number; n: number } => {
          const s = [...xs].sort((a, b) => a - b);
          return { p50: round2(percentile(s, 50)), p95: round2(percentile(s, 95)), max: round2(s[s.length - 1] ?? 0), n: s.length };
        };
        return {
          objects: count,
          mode: robot ? 'robot' : 'manual',
          gizmo: gizmoMode,
          flushSync: flush,
          dragFrames: stats(dragFrames),
          dragDropped: dragFrames.filter((ms) => ms > 33.4).length,
          dragSlow: dragFrames.filter((ms) => ms > 16.8).length,
          latencyMs: stats(latency),
          typingLatencyMs: stats(typingLatency),
          driftPx: stats(drift),
          driftByMode: Object.fromEntries(Object.entries(driftByMode).map(([k, v]) => [k, stats(v)])),
          driftMaxAt,
          driftOutliers: drift.filter((d) => d > 5).length,
          pointerMoves,
          reactCommits: uiMetrics.commits,
          reactCommitMs: stats(uiMetrics.commitMs),
          storeNotifies: store.notifies,
          longTasks,
          longTaskMaxMs: round2(longTaskMax),
          ...draws.stats(),
        };
      },
      notes(): string[] {
        const notes: string[] = [];
        if (!robot && pointerMoves === 0) notes.push('manual mode: no pointer input during the window; drag, pinch and pan on the device, then read the report');
        if (dragFrames.length < 30) notes.push('not enough drag frames for a verdict');
        const driftMax = drift.length > 0 ? Math.max(...drift) : 0;
        if (driftMax > 5) notes.push(`gizmo drift max ${round2(driftMax)} px (p95 is the pass value; a max of one screen is a one-frame flash on a camera jump)`);
        return notes;
      },
    };
  },
};

export default overlay;
