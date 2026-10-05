// Phaser-free layout math for the widget layer: turns a course's `Widget[]` (world meters, sizes
// in screen-constant stage px) into stage-px geometry BuilderScene draws from and hit-tests
// against. Kept free of Phaser so it is unit-testable without a canvas.
import type { CycleWidget, DialWidget, LeverWidget, PullWidget, RackWidget, TapWidget, Vec2, Widget } from './types';

/** The scene never draws or hit-tests a control smaller than this (on-screen px). */
export const MIN_TOUCH_PX = 64;

/** A hit-test shape in stage px (the same coordinate space `toPx` produces, i.e. before
 * RENDER_SCALE and before the camera's zoom — the space the pointer handlers already compute via
 * `worldCam.getWorldPoint`). Circle/rect are both centre-based. */
export type HitShape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

export interface WidgetHit {
  shape: HitShape;
  /** The value a hit on this shape would set (rack cells, dial ticks, a cycle's next value);
   * undefined when the widget resolves its own value (a lever/dial/pull from the drag). */
  value?: string;
  /** Index within the widget's own list (rack cell index, dial option index); 0 for widgets
   * with a single hit shape. */
  index: number;
}

interface WidgetGeomBase {
  id: string;
  hits: WidgetHit[];
  locked: boolean;
  label?: string;
}

export interface TapGeom extends WidgetGeomBase {
  kind: 'tap';
  center: Vec2;
  size: number;
  icon: string;
  /** Accent colour (stroke, label) from the widget; the kit's active colour when absent. */
  color?: number;
  texture?: { role: string; tint?: number };
  hopTo?: Vec2;
}

export interface DialGeom extends WidgetGeomBase {
  kind: 'dial';
  pivot: Vec2;
  radiusPx: number;
  arcFrom: number;
  arcTo: number;
  options: DialWidget['options'];
  value: string;
  /** World-axis angle (radians, CCW, 0 = +x) of the handle at the widget's current value. */
  handleAngle: number;
  handleR: number;
  readout: 'value' | 'none' | 'knob';
  /** 'arc' (default) draws the track band and its accent fill; 'none' draws only the notch ticks
   * (the machine part under the handle is the track). */
  track: 'arc' | 'none';
  /** Commit every new notch while dragging (one undo entry per drag). Default false. */
  live: boolean;
}

export interface RackCell {
  center: Vec2;
  size: number;
  value: string;
  icon: string;
  label: string;
  active: boolean;
  texture?: { role: string; tint?: number };
}
export interface RackGeom extends WidgetGeomBase {
  kind: 'rack';
  cells: RackCell[];
  shape: 'square' | 'circle';
  plate: boolean;
  labels: 'none' | 'active';
  vertical: boolean;
  hopTo?: Vec2;
}

/** A notched lever's track, in stage px. `base`/`tip` are the track's two ends (option 0 and the
 * last option); `notches` is one stage point per option, in order. `knob` is the current
 * option's notch. */
export interface LeverGeom extends WidgetGeomBase {
  kind: 'lever';
  base: Vec2;
  tip: Vec2;
  /** Track width, screen-constant (22 * pxScale). */
  trackW: number;
  notches: Vec2[];
  knob: Vec2;
  knobW: number;
  knobH: number;
  options: LeverWidget['options'];
  value: string;
  icon?: string;
  showValue: boolean;
  tether?: Vec2;
  color?: number;
}

export interface CycleGeom extends WidgetGeomBase {
  kind: 'cycle';
  center: Vec2;
  size: number;
  style: 'card' | 'ring';
  icon: string;
  valueLabel?: string;
  dots: { center: Vec2; r: number; active: boolean }[];
  texture?: { role: string; tint?: number };
  hopTo?: Vec2;
  color?: number;
  /** The value the single hit would set (the NEXT option, wrapping). */
  nextValue: string;
}

export interface PullGeom extends WidgetGeomBase {
  kind: 'pull';
  at: Vec2;
  to: Vec2;
  handleSize: number;
  threshold: number;
  icon?: string;
  releaseLabel?: string;
  ring: boolean;
  arrow: boolean;
}

export type WidgetGeom = TapGeom | DialGeom | RackGeom | LeverGeom | CycleGeom | PullGeom;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function hitsShape(shape: HitShape, sx: number, sy: number): boolean {
  if (shape.kind === 'circle') return Math.hypot(sx - shape.x, sy - shape.y) <= shape.r;
  return Math.abs(sx - shape.x) <= shape.w / 2 && Math.abs(sy - shape.y) <= shape.h / 2;
}

/** Last-drawn-wins: scans back to front so a widget drawn on top of another (later in the
 * array) is hit before the one underneath. */
export function hitWidget(
  geoms: WidgetGeom[],
  sx: number,
  sy: number,
): { id: string; value?: string; index: number } | null {
  for (let i = geoms.length - 1; i >= 0; i--) {
    const geom = geoms[i]!;
    for (let j = geom.hits.length - 1; j >= 0; j--) {
      const hit = geom.hits[j]!;
      if (hitsShape(hit.shape, sx, sy)) return { id: geom.id, value: hit.value, index: hit.index };
    }
  }
  return null;
}

/** The option index nearest `value` (0 when not found — the arc's start). */
function optionIndex(w: DialWidget, value: string): number {
  const i = w.options.findIndex((o) => o.value === value);
  return i === -1 ? 0 : i;
}

function angleForIndex(w: DialWidget, i: number): number {
  const n = w.options.length;
  if (n <= 1) return w.arcFrom;
  return w.arcFrom + ((w.arcTo - w.arcFrom) * i) / (n - 1);
}

/** Nearest option to a drag angle (world-axis radians, same convention as `arcFrom`/`arcTo`). */
export function dialAngleToValue(w: DialWidget, angle: number): string {
  const n = w.options.length;
  if (n === 0) return w.value;
  if (n === 1) return w.options[0]!.value;
  const span = w.arcTo - w.arcFrom;
  const frac = span === 0 ? 0 : (angle - w.arcFrom) / span;
  const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
  return w.options[idx]!.value;
}

/** The angle (world-axis radians) of the handle at `value`. */
export function dialValueToAngle(w: DialWidget, value: string): number {
  return angleForIndex(w, optionIndex(w, value));
}

/** Wraps to the next value in `values`; falls back to the first value when `current` is absent
 * or unknown. */
export function nextValue(values: string[], current: string | undefined): string {
  if (values.length === 0) return current ?? '';
  const i = current === undefined ? -1 : values.indexOf(current);
  const next = i === -1 ? 0 : (i + 1) % values.length;
  return values[next]!;
}

function sizeOf(size: number | undefined, fallback: number, pxScale: number): number {
  return Math.max(MIN_TOUCH_PX, size ?? fallback) * pxScale;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function layoutTap(w: TapWidget, toPx: (v: Vec2) => Vec2, pxScale: number): TapGeom {
  const size = sizeOf(w.size, 76, pxScale);
  const center = toPx(w.at);
  return {
    id: w.id,
    kind: 'tap',
    center,
    size,
    icon: w.icon,
    color: w.color,
    label: w.label,
    texture: w.texture,
    hopTo: w.hopTo ? toPx(w.hopTo) : undefined,
    locked: w.locked ?? false,
    hits: [{ shape: { kind: 'rect', x: center.x, y: center.y, w: size, h: size }, index: 0 }],
  };
}

function layoutDial(w: DialWidget, toPx: (v: Vec2) => Vec2, pxScale: number): DialGeom {
  const pivot = toPx(w.pivot);
  // `radiusM` (world meters) overrides `radiusPx` (screen-constant stage px): mapping both the
  // pivot and a point `radiusM` out along +x through the same `toPx` and measuring the stage-px
  // distance between them keeps the handle glued to a machine part at any camera zoom, instead of
  // staying a fixed on-screen size like every other widget dimension.
  const radiusPx =
    w.radiusM !== undefined
      ? (() => {
          const edge = toPx({ x: w.pivot.x + w.radiusM!, y: w.pivot.y });
          return Math.hypot(edge.x - pivot.x, edge.y - pivot.y);
        })()
      : w.radiusPx * pxScale;
  const handleR = sizeOf(w.size, 72, pxScale) / 2;
  const idx = optionIndex(w, w.value);
  const handleAngle = angleForIndex(w, idx);
  const handlePt = dialPoint(pivot, radiusPx, handleAngle);
  return {
    id: w.id,
    kind: 'dial',
    pivot,
    radiusPx,
    arcFrom: w.arcFrom,
    arcTo: w.arcTo,
    options: w.options,
    value: w.value,
    handleAngle,
    handleR,
    readout: w.readout ?? 'value',
    track: w.track ?? 'arc',
    live: w.live ?? false,
    label: w.label,
    locked: w.locked ?? false,
    // Grab the handle (with a generous radius) or any option tick on the arc. Never the whole
    // disc around the pivot: neighbouring widgets (a pump next to the angle dial) sit inside it.
    hits: [
      { shape: { kind: 'circle', x: handlePt.x, y: handlePt.y, r: Math.max(handleR * 1.4, MIN_TOUCH_PX * 0.6 * pxScale) }, index: idx },
      ...w.options.map((opt, i) => {
        const p = dialPoint(pivot, radiusPx, angleForIndex(w, i));
        return { shape: { kind: 'circle' as const, x: p.x, y: p.y, r: handleR * 0.9 }, value: opt.value, index: i };
      }),
    ],
  };
}

/** Stage-px point on a dial arc: world-axis angle (CCW, 0 = +x) with stage y pointing down. */
export function dialPoint(pivot: Vec2, r: number, angle: number): Vec2 {
  return { x: pivot.x + r * Math.cos(angle), y: pivot.y - r * Math.sin(angle) };
}

function layoutRack(w: RackWidget, toPx: (v: Vec2) => Vec2, pxScale: number): RackGeom {
  const size = sizeOf(w.size, 84, pxScale);
  const gap = 12 * pxScale;
  const at = toPx(w.at);
  const n = w.items.length;
  const cells: RackCell[] = w.items.map((item, i) => {
    const offset = (i - (n - 1) / 2) * (size + gap);
    const center = w.vertical ? { x: at.x, y: at.y + offset } : { x: at.x + offset, y: at.y };
    return {
      center,
      size,
      value: item.value,
      icon: item.icon,
      label: item.label,
      active: item.value === w.value,
      texture: item.texture,
    };
  });
  return {
    id: w.id,
    kind: 'rack',
    cells,
    shape: w.shape ?? 'square',
    plate: w.plate ?? false,
    labels: w.labels ?? 'none',
    vertical: w.vertical ?? false,
    hopTo: w.hopTo ? toPx(w.hopTo) : undefined,
    label: w.label,
    locked: w.locked ?? false,
    hits: cells.map((c, i) => ({ shape: { kind: 'rect', x: c.center.x, y: c.center.y, w: size, h: size }, value: c.value, index: i })),
  };
}

function layoutLever(w: LeverWidget, toPx: (v: Vec2) => Vec2, pxScale: number): LeverGeom {
  const len = w.lengthPx * pxScale;
  const base = toPx(w.at);
  const dir = w.dir ?? 'up';
  const tip = dir === 'right' ? { x: base.x + len, y: base.y } : { x: base.x, y: base.y - len };
  const n = w.options.length;
  const notches: Vec2[] = Array.from({ length: n }, (_, i) => lerpVec(base, tip, n > 1 ? i / (n - 1) : 0));
  const idx = Math.max(0, w.options.findIndex((o) => o.value === w.value));
  const knob = notches[idx] ?? base;

  const size = w.size ?? 76;
  const across = Math.max(MIN_TOUCH_PX, size) * pxScale;
  const along = Math.max(MIN_TOUCH_PX, 0.6 * size) * pxScale;
  const knobW = dir === 'right' ? along : across;
  const knobH = dir === 'right' ? across : along;

  const hitShort = Math.max(64 * pxScale, across);
  const hitLong = len + along;
  const hitShape: HitShape =
    dir === 'right'
      ? { kind: 'rect', x: (base.x + tip.x) / 2, y: base.y, w: hitLong, h: hitShort }
      : { kind: 'rect', x: base.x, y: (base.y + tip.y) / 2, w: hitShort, h: hitLong };

  return {
    id: w.id,
    kind: 'lever',
    base,
    tip,
    trackW: 22 * pxScale,
    notches,
    knob,
    knobW,
    knobH,
    options: w.options,
    value: w.value,
    icon: w.icon,
    showValue: w.showValue ?? false,
    tether: w.tether ? toPx(w.tether) : undefined,
    color: w.color,
    locked: w.locked ?? false,
    hits: [{ shape: hitShape, index: idx }],
  };
}

/** The value nearest a stage point `(sx, sy)` projected onto the lever's track: clamps to the
 * track's ends and snaps to the nearest notch. Pure (no Phaser) so it's unit-testable. */
export function leverPointToValue(g: LeverGeom, sx: number, sy: number): string {
  const n = g.options.length;
  if (n === 0) return g.value;
  const dx = g.tip.x - g.base.x;
  const dy = g.tip.y - g.base.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? clamp(((sx - g.base.x) * dx + (sy - g.base.y) * dy) / lenSq, 0, 1) : 0;
  const idx = n > 1 ? Math.round(t * (n - 1)) : 0;
  return g.options[idx]!.value;
}

function layoutCycle(w: CycleWidget, toPx: (v: Vec2) => Vec2, pxScale: number): CycleGeom {
  const size = sizeOf(w.size, 76, pxScale);
  const center = toPx(w.at);
  const style = w.style ?? 'card';
  const n = w.options.length;
  const curIdx = Math.max(0, w.options.findIndex((o) => o.value === w.value));
  const cur = w.options[curIdx];
  const nextIdx = n > 0 ? (curIdx + 1) % n : curIdx;
  const nextOpt = w.options[nextIdx];

  const hitShape: HitShape =
    style === 'ring'
      ? { kind: 'circle', x: center.x, y: center.y, r: size / 2 }
      : { kind: 'rect', x: center.x, y: center.y, w: size, h: size };

  const dotGap = 12 * pxScale;
  const dots = w.noDots
    ? []
    : w.options.map((_, i) => {
        const totalW = (n - 1) * dotGap;
        const x = center.x - totalW / 2 + i * dotGap;
        const y = center.y + size / 2 + 14 * pxScale;
        return { center: { x, y }, r: 4 * pxScale, active: i === curIdx };
      });

  return {
    id: w.id,
    kind: 'cycle',
    center,
    size,
    style,
    icon: cur?.icon ?? '',
    valueLabel: w.showValue ? cur?.label : undefined,
    dots,
    texture: w.texture,
    hopTo: w.hopTo ? toPx(w.hopTo) : undefined,
    color: w.color,
    nextValue: nextOpt?.value ?? w.value,
    locked: w.locked ?? false,
    hits: [{ shape: hitShape, value: nextOpt?.value, index: curIdx }],
  };
}

function layoutPull(w: PullWidget, toPx: (v: Vec2) => Vec2, pxScale: number): PullGeom {
  const handleSize = sizeOf(w.size, 96, pxScale);
  const at = toPx(w.at);
  const to = toPx(w.to);
  const threshold = w.threshold ?? 0.6;
  return {
    id: w.id,
    kind: 'pull',
    at,
    to,
    handleSize,
    threshold,
    icon: w.icon,
    label: w.label,
    releaseLabel: w.releaseLabel,
    ring: w.ring ?? false,
    arrow: w.arrow ?? false,
    locked: w.locked ?? false,
    // Rest position (t = 0): a pull always springs back to `at` once released.
    hits: [{ shape: { kind: 'circle', x: at.x, y: at.y, r: handleSize / 2 }, index: 0 }],
  };
}

/** Lays out every widget in stage px. `toPx` converts world meters (a widget's `at`/`pivot`/`to`)
 * to stage px; `pxScale` (= 1 / camera zoom) keeps on-screen control size constant. Array order
 * is z-order: later entries draw on top and are hit first. */
export function layoutWidgets(ws: Widget[], toPx: (v: Vec2) => Vec2, pxScale: number): WidgetGeom[] {
  return ws.map((w): WidgetGeom => {
    switch (w.kind) {
      case 'tap':
        return layoutTap(w, toPx, pxScale);
      case 'dial':
        return layoutDial(w, toPx, pxScale);
      case 'rack':
        return layoutRack(w, toPx, pxScale);
      case 'lever':
        return layoutLever(w, toPx, pxScale);
      case 'cycle':
        return layoutCycle(w, toPx, pxScale);
      case 'pull':
        return layoutPull(w, toPx, pxScale);
    }
  });
}
