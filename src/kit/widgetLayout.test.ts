import { describe, expect, it } from 'vitest';
import {
  BIG_GAP,
  BIG_HIT_PAD,
  BIG_MIN_W,
  BIG_PAD_X,
  BIG_PILL_H,
  DIAL_MIN_KNOB_PX,
  MIN_TOUCH_PX,
  MINI_TAP_PX,
  SLIDE_KNOB_PX,
  slidePointAt,
  slidePointT,
  slidePointToValue,
  slideTToValue,
  slideValuePoint,
  type SlideGeom,
  estimateBigTextWidth,
  widgetAnchor,
  type TapGeom,
  dialAngleToValue,
  dialValueToAngle,
  dialPoint,
  hitWidget,
  layoutWidgets,
  leverPointToValue,
  nextValue,
  type CycleGeom,
  type DialGeom,
  type LeverGeom,
  type RackGeom,
} from './widgetLayout';
import type { CycleWidget, DialWidget, LeverWidget, PullWidget, RackWidget, SlideWidget, TapWidget, Vec2 } from './types';

const toPx = (v: Vec2): Vec2 => ({ x: v.x * 10, y: 500 - v.y * 10 });

describe('layoutWidgets sizes', () => {
  it('never draws a tap/rack/pull control smaller than MIN_TOUCH_PX at pxScale 1', () => {
    const tap: TapWidget = { id: 't', kind: 'tap', at: { x: 1, y: 1 }, icon: '?', size: 10 };
    const rack: RackWidget = {
      id: 'r',
      kind: 'rack',
      at: { x: 1, y: 1 },
      items: [{ value: 'a', icon: 'a', label: 'A' }],
      value: 'a',
      size: 20,
    };
    const pull: PullWidget = { id: 'p', kind: 'pull', at: { x: 0, y: 0 }, to: { x: 2, y: 2 }, size: 5 };
    const geoms = layoutWidgets([tap, rack, pull], toPx, 1);
    const [tapG, rackG, pullG] = geoms as any[];
    expect(tapG.size).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    expect(rackG.cells[0].size).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    expect(pullG.handleSize).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  });

  it('scales sizes linearly with pxScale', () => {
    const tap: TapWidget = { id: 't', kind: 'tap', at: { x: 1, y: 1 }, icon: '?', size: 80 };
    const [g1] = layoutWidgets([tap], toPx, 1) as any[];
    const [g2] = layoutWidgets([tap], toPx, 2) as any[];
    expect(g2.size).toBeCloseTo(g1.size * 2, 9);
  });
});

describe('hitWidget', () => {
  const wA: TapWidget = { id: 'a', kind: 'tap', at: { x: 5, y: 5 }, icon: '?', size: 76 };
  const wB: TapWidget = { id: 'b', kind: 'tap', at: { x: 5, y: 5 }, icon: '?', size: 76 }; // same spot, drawn later

  it('picks the top-most (last in z-order) widget among overlapping hits', () => {
    const geoms = layoutWidgets([wA, wB], toPx, 1);
    const hit = hitWidget(geoms, toPx({ x: 5, y: 5 }).x, toPx({ x: 5, y: 5 }).y);
    expect(hit?.id).toBe('b');
  });

  it('returns null when nothing is hit', () => {
    const geoms = layoutWidgets([wA], toPx, 1);
    const hit = hitWidget(geoms, -9999, -9999);
    expect(hit).toBeNull();
  });

  it('hits the correct rack cell and reports its index/value', () => {
    const rack: RackWidget = {
      id: 'r',
      kind: 'rack',
      at: { x: 0, y: 0 },
      items: [
        { value: 'a', icon: 'a', label: 'A' },
        { value: 'b', icon: 'b', label: 'B' },
        { value: 'c', icon: 'c', label: 'C' },
      ],
      value: 'a',
      size: 56,
    };
    const [geom] = layoutWidgets([rack], toPx, 1) as any[];
    const cellB = geom.cells[1];
    const hit = hitWidget([geom], cellB.center.x, cellB.center.y);
    expect(hit).toEqual({ id: 'r', value: 'b', index: 1 });
  });

  it('still yields one hit per cell when labels is "none"', () => {
    const rack: RackWidget = {
      id: 'r',
      kind: 'rack',
      at: { x: 0, y: 0 },
      items: [
        { value: 'a', icon: 'a', label: 'A' },
        { value: 'b', icon: 'b', label: 'B' },
      ],
      value: 'a',
      labels: 'none',
    };
    const [geom] = layoutWidgets([rack], toPx, 1) as [RackGeom];
    expect(geom.hits.length).toBe(geom.cells.length);
    expect(geom.hits.map((h) => h.value)).toEqual(['a', 'b']);
  });
});

describe('dial angle <-> value round trip', () => {
  const dial: DialWidget = {
    id: 'd',
    kind: 'dial',
    pivot: { x: 0, y: 0 },
    radiusPx: 40,
    arcFrom: 0,
    arcTo: Math.PI,
    options: [
      { value: 'low', label: 'Low' },
      { value: 'mid', label: 'Mid' },
      { value: 'high', label: 'High' },
      { value: 'max', label: 'Max' },
    ],
    value: 'mid',
  };

  it('valueToAngle then angleToValue returns the same value for every option', () => {
    for (const opt of dial.options) {
      const angle = dialValueToAngle(dial, opt.value);
      expect(dialAngleToValue(dial, angle)).toBe(opt.value);
    }
  });

  it('angleToValue picks the nearest option for an in-between angle', () => {
    const lowAngle = dialValueToAngle(dial, 'low');
    const midAngle = dialValueToAngle(dial, 'mid');
    const between = (lowAngle + midAngle) / 2 - 0.01; // nudge toward low
    expect(dialAngleToValue(dial, between)).toBe('low');
  });

  it('clamps out-of-range angles to the nearest end option', () => {
    expect(dialAngleToValue(dial, -100)).toBe('low');
    expect(dialAngleToValue(dial, 100)).toBe('max');
  });
});

describe('dial layout: radiusM, track, readout, live', () => {
  const baseDial: DialWidget = {
    id: 'd',
    kind: 'dial',
    pivot: { x: 5, y: 5 },
    radiusPx: 999, // deliberately far from the radiusM-derived answer, to prove it's ignored
    arcFrom: 0,
    arcTo: Math.PI,
    options: [
      { value: 'low', label: 'Low' },
      { value: 'mid', label: 'Mid' },
      { value: 'high', label: 'High' },
    ],
    value: 'mid',
  };

  it('radiusM overrides radiusPx, mapped through toPx (world scale, not pxScale)', () => {
    const dial: DialWidget = { ...baseDial, radiusM: 2 };
    // toPx here is `x*10, 500 - y*10`: 2 world meters -> 20 stage px, at pxScale 1.
    const [g1] = layoutWidgets([dial], toPx, 1) as [DialGeom];
    expect(g1.radiusPx).toBeCloseTo(20, 6);

    // pxScale must NOT affect a radiusM-derived radius (unlike radiusPx, which scales linearly
    // with pxScale as covered by the "scales sizes linearly with pxScale" test above).
    const [g2] = layoutWidgets([dial], toPx, 2) as [DialGeom];
    expect(g2.radiusPx).toBeCloseTo(20, 6);
  });

  it('without radiusM, radiusPx still scales with pxScale as before', () => {
    const dial: DialWidget = { ...baseDial, radiusPx: 40 };
    const [g1] = layoutWidgets([dial], toPx, 1) as [DialGeom];
    const [g2] = layoutWidgets([dial], toPx, 2) as [DialGeom];
    expect(g1.radiusPx).toBeCloseTo(40, 6);
    expect(g2.radiusPx).toBeCloseTo(80, 6);
  });

  it('the handle and every option tick land exactly on the radiusM-derived arc', () => {
    const dial: DialWidget = { ...baseDial, radiusM: 3 };
    const [g] = layoutWidgets([dial], toPx, 1) as [DialGeom];
    const pivotPx = toPx(dial.pivot);
    // Handle: distance from the pivot equals the derived radius.
    const handlePt = dialPoint(pivotPx, g.radiusPx, g.handleAngle);
    expect(Math.hypot(handlePt.x - pivotPx.x, handlePt.y - pivotPx.y)).toBeCloseTo(g.radiusPx, 6);
    // Every hit shape (the handle grab circle, plus one per option tick) is centred on that arc.
    for (const hit of g.hits) {
      if (hit.shape.kind !== 'circle') continue;
      const dist = Math.hypot(hit.shape.x - pivotPx.x, hit.shape.y - pivotPx.y);
      expect(dist).toBeCloseTo(g.radiusPx, 6);
    }
  });

  it('defaults track to "arc", readout to "value" and live to false when absent', () => {
    const [g] = layoutWidgets([baseDial], toPx, 1) as [DialGeom];
    expect(g.track).toBe('arc');
    expect(g.readout).toBe('value');
    expect(g.live).toBe(false);
  });

  it('notches: default true (an option tick hit each); false (2026-10-15) drops the dots and their ' +
    'hit spots, leaving only the handle grab', () => {
    const [on] = layoutWidgets([baseDial], toPx, 1) as [DialGeom];
    expect(on.notches).toBe(true);
    expect(on.hits).toHaveLength(1 + baseDial.options.length);
    const [off] = layoutWidgets([{ ...baseDial, notches: false }], toPx, 1) as [DialGeom];
    expect(off.notches).toBe(false);
    expect(off.hits).toHaveLength(1);
    expect(off.hits[0]!.index).toBe(1); // 'mid'
  });

  it('size: the drawn handle may go under the 64 px control floor down to DIAL_MIN_KNOB_PX, the ' +
    'grab circle never under MIN_TOUCH_PX across', () => {
    const r = (size: number | undefined, pxScale = 1) => {
      const [g] = layoutWidgets([{ ...baseDial, size }], toPx, pxScale) as [DialGeom];
      const grab = g.hits[0]!.shape;
      return { drawn: g.handleR * 2, grab: grab.kind === 'circle' ? grab.r * 2 : 0 };
    };
    expect(r(undefined).drawn).toBe(72);
    expect(r(56).drawn).toBe(56);
    expect(r(30).drawn).toBe(DIAL_MIN_KNOB_PX);
    for (const size of [30, 44, 56, 72]) expect(r(size).grab).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    // Screen-constant: at zoom 2.8 (pxScale 1 / 2.8) both shrink in stage px by the same factor.
    expect(r(56, 1 / 2.8).drawn).toBeCloseTo(20, 9);
    expect(r(56, 1 / 2.8).grab * 2.8).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  });

  it('carries track, readout and live through from the widget spec', () => {
    const dial: DialWidget = { ...baseDial, track: 'none', readout: 'knob', live: true };
    const [g] = layoutWidgets([dial], toPx, 1) as [DialGeom];
    expect(g.track).toBe('none');
    expect(g.readout).toBe('knob');
    expect(g.live).toBe(true);
  });
});

describe('nextValue', () => {
  it('wraps from the last value back to the first', () => {
    expect(nextValue(['a', 'b', 'c'], 'c')).toBe('a');
  });

  it('advances to the following value otherwise', () => {
    expect(nextValue(['a', 'b', 'c'], 'a')).toBe('b');
  });

  it('falls back to the first value when current is undefined or unknown', () => {
    expect(nextValue(['a', 'b', 'c'], undefined)).toBe('a');
    expect(nextValue(['a', 'b', 'c'], 'zzz')).toBe('a');
  });
});

describe('lever layout and leverPointToValue', () => {
  const lever: LeverWidget = {
    id: 'l',
    kind: 'lever',
    at: { x: 0, y: 0 },
    lengthPx: 100,
    dir: 'right',
    options: [
      { value: 'lo', label: 'Lo' },
      { value: 'mid', label: 'Mid' },
      { value: 'hi', label: 'Hi' },
      { value: 'max', label: 'Max' },
    ],
    value: 'lo',
  };

  it('spaces notches evenly along the track from base to tip', () => {
    const [geom] = layoutWidgets([lever], toPx, 1) as [LeverGeom];
    expect(geom.notches.length).toBe(4);
    expect(geom.notches[0]).toEqual(geom.base);
    expect(geom.notches[3]).toEqual(geom.tip);
    // stage px: base -> tip is a straight line, so notch 1 and 2 sit at 1/3 and 2/3.
    const third = geom.notches[1]!;
    expect(third.x).toBeCloseTo(geom.base.x + (geom.tip.x - geom.base.x) / 3, 6);
  });

  it('leverPointToValue clamps to the first option at or before the base', () => {
    const [geom] = layoutWidgets([lever], toPx, 1) as [LeverGeom];
    expect(leverPointToValue(geom, geom.base.x - 1000, geom.base.y)).toBe('lo');
  });

  it('leverPointToValue clamps to the last option at or beyond the tip', () => {
    const [geom] = layoutWidgets([lever], toPx, 1) as [LeverGeom];
    expect(leverPointToValue(geom, geom.tip.x + 1000, geom.tip.y)).toBe('max');
  });

  it('leverPointToValue snaps to the nearest notch in between', () => {
    const [geom] = layoutWidgets([lever], toPx, 1) as [LeverGeom];
    const mid = geom.notches[1]!; // 'mid' notch
    expect(leverPointToValue(geom, mid.x + 1, mid.y)).toBe('mid');
  });
});

describe('cycle layout', () => {
  const cycle: CycleWidget = {
    id: 'c',
    kind: 'cycle',
    at: { x: 0, y: 0 },
    options: [
      { value: 'a', icon: 'a' },
      { value: 'b', icon: 'b' },
      { value: 'c', icon: 'c' },
    ],
    value: 'b',
  };

  it("the single hit carries the NEXT option's value", () => {
    const [geom] = layoutWidgets([cycle], toPx, 1) as [CycleGeom];
    expect(geom.nextValue).toBe('c');
    expect(geom.hits[0]!.value).toBe('c');
  });

  it('wraps from the last option back to the first', () => {
    const wrapped: CycleWidget = { ...cycle, value: 'c' };
    const [geom] = layoutWidgets([wrapped], toPx, 1) as [CycleGeom];
    expect(geom.nextValue).toBe('a');
  });
});

describe("tap widget style 'big' (the one obvious start button)", () => {
  const big: TapWidget = { id: 'go', kind: 'tap', at: { x: 5, y: 5 }, icon: '▶', label: 'DRIVE', style: 'big' };
  /** 10 px per code unit: '▶' = 10, 'DRIVE' = 50. */
  const measure = (t: string): number => t.length * 10;

  it('sizes the pill from the measured icon + label, BIG_PILL_H tall, centred on `at`', () => {
    const [g] = layoutWidgets([{ ...big, label: 'LAUNCH THE ROVER' }], toPx, 1, measure) as TapGeom[];
    expect(g!.style).toBe('big');
    expect(g!.center).toEqual(toPx({ x: 5, y: 5 }));
    // icon 10 + gap + label 160, padded on both sides.
    expect(g!.pill).toEqual({ w: 10 + BIG_GAP + 160 + 2 * BIG_PAD_X, h: BIG_PILL_H, iconW: 10, labelW: 160, gap: BIG_GAP, contentW: 180, scale: 1 });
    expect(g!.size).toBe(BIG_PILL_H);
  });

  it('bigScale scales every pill dimension (2026-10-15: the catapult BUILD under the machine)', () => {
    const [g] = layoutWidgets([{ ...big, label: 'LAUNCH THE ROVER', bigScale: 0.75 }], toPx, 1, measure) as TapGeom[];
    expect(g!.pill!.h).toBeCloseTo(BIG_PILL_H * 0.75, 9);
    expect(g!.pill!.contentW).toBeCloseTo(180 * 0.75, 9);
    expect(g!.pill!.w).toBeCloseTo(180 * 0.75 + 2 * BIG_PAD_X * 0.75, 9);
    expect(g!.pill!.scale).toBe(0.75);
  });

  it('never gets narrower than BIG_MIN_W', () => {
    const [g] = layoutWidgets([{ ...big, label: 'GO' }], toPx, 1, measure) as TapGeom[];
    expect(g!.pill!.w).toBe(BIG_MIN_W);
    expect(g!.pill!.contentW).toBe(10 + BIG_GAP + 20);
  });

  it('drops the gap when there is no label (icon only)', () => {
    const [g] = layoutWidgets([{ ...big, label: undefined }], toPx, 1, measure) as TapGeom[];
    expect(g!.pill!.gap).toBe(0);
    expect(g!.pill!.contentW).toBe(10);
  });

  it('hits the pill plus BIG_HIT_PAD on every side, and nothing past that', () => {
    const [g] = layoutWidgets([big], toPx, 1, measure) as TapGeom[];
    const pill = g!.pill!;
    expect(g!.hits[0]!.shape).toEqual({ kind: 'rect', x: g!.center.x, y: g!.center.y, w: pill.w + 2 * BIG_HIT_PAD, h: pill.h + 2 * BIG_HIT_PAD });
    const edgeX = g!.center.x + pill.w / 2;
    expect(hitWidget([g!], edgeX + BIG_HIT_PAD - 1, g!.center.y)?.id).toBe('go');
    expect(hitWidget([g!], edgeX + BIG_HIT_PAD + 1, g!.center.y)).toBeNull();
    expect(hitWidget([g!], g!.center.x, g!.center.y - pill.h / 2 - BIG_HIT_PAD + 1)?.id).toBe('go');
  });

  it('is screen-constant: the pill, its metrics and its hit area all scale with pxScale', () => {
    const [g1] = layoutWidgets([big], toPx, 1, measure) as TapGeom[];
    const [g2] = layoutWidgets([big], toPx, 0.5, measure) as TapGeom[];
    expect(g2!.pill!.w).toBeCloseTo(g1!.pill!.w / 2, 9);
    expect(g2!.pill!.h).toBeCloseTo(BIG_PILL_H / 2, 9);
    expect(g2!.pill!.labelW).toBeCloseTo(25, 9);
    expect((g2!.hits[0]!.shape as { h: number }).h).toBeCloseTo((BIG_PILL_H + 2 * BIG_HIT_PAD) / 2, 9);
  });

  it('ignores `size` (the pill height is fixed)', () => {
    const [g] = layoutWidgets([{ ...big, size: 200 }], toPx, 1, measure) as TapGeom[];
    expect(g!.pill!.h).toBe(BIG_PILL_H);
  });

  it('measures with estimateBigTextWidth by default; an emoji gets more room than a letter', () => {
    const [g] = layoutWidgets([big], toPx, 1) as TapGeom[];
    expect(g!.pill!.labelW).toBeCloseTo(estimateBigTextWidth('DRIVE'), 9);
    expect(estimateBigTextWidth('🚀')).toBeGreaterThan(estimateBigTextWidth('D'));
    expect(estimateBigTextWidth('🔧\uFE0F')).toBeCloseTo(estimateBigTextWidth('🔧'), 9);
  });

  it("leaves a plain tap widget a 'card' with its square hit (as before)", () => {
    const [g] = layoutWidgets([{ id: 't', kind: 'tap', at: { x: 1, y: 1 }, icon: '?', size: 80 }], toPx, 1) as TapGeom[];
    expect(g!.style).toBe('card');
    expect(g!.pill).toBeUndefined();
    expect(g!.hits[0]!.shape).toEqual({ kind: 'rect', x: g!.center.x, y: g!.center.y, w: 80, h: 80 });
  });
});

describe('widgetAnchor (where the coach hand points)', () => {
  it("is a tap's lower-right, a dial's handle, a rack's middle cell and a lever's knob", () => {
    const tap: TapWidget = { id: 't', kind: 'tap', at: { x: 2, y: 3 }, icon: '?' };
    const dial: DialWidget = {
      id: 'd', kind: 'dial', pivot: { x: 5, y: 5 }, radiusPx: 100, arcFrom: 0, arcTo: Math.PI / 2,
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'b',
    };
    const rack: RackWidget = {
      id: 'r', kind: 'rack', at: { x: 10, y: 10 }, value: 'a',
      items: ['a', 'b', 'c'].map((v) => ({ value: v, icon: v, label: v })),
    };
    const lever: LeverWidget = {
      id: 'l', kind: 'lever', at: { x: 1, y: 1 }, lengthPx: 100, value: 'hi',
      options: [{ value: 'lo', label: 'Lo' }, { value: 'hi', label: 'Hi' }],
    };
    const [tg, dg, rg, lg] = layoutWidgets([tap, dial, rack, lever], toPx, 1);
    // A tap's anchor sits toward its bottom-right corner so the glove does not cover the label.
    const tc = toPx({ x: 2, y: 3 });
    const ta = widgetAnchor(tg!);
    expect(ta.x).toBeGreaterThan(tc.x);
    expect(ta.y).toBeGreaterThan(tc.y);
    expect(ta.x - tc.x).toBeLessThan((tg as TapGeom).size / 2);
    expect(ta.y - tc.y).toBeLessThan((tg as TapGeom).size / 2);
    const pivot = toPx({ x: 5, y: 5 });
    const handle = widgetAnchor(dg!);
    expect(handle.x).toBeCloseTo(pivot.x, 6); // value 'b' sits at 90 degrees: straight up
    expect(handle.y).toBeCloseTo(pivot.y - 100, 6);
    expect(widgetAnchor(rg!)).toEqual((rg as RackGeom).cells[1]!.center);
    expect(widgetAnchor(lg!)).toEqual((lg as LeverGeom).knob);
  });
});

// 2026-10-16: the catapult rebuild's controls (Jon: "arm length fully customizable"; Gao: "take
// one band off").
describe('SlideWidget layout (a handle dragged along a world segment)', () => {
  const ARM = ['1.5', '1.75', '2', '2.25', '2.5', '2.75', '3', '3.25', '3.5', '3.75', '4'];
  const slide: SlideWidget = {
    id: 'arm',
    kind: 'slide',
    code: 'armLen',
    from: { x: 10, y: 10 },
    to: { x: 0, y: 10 }, // 100 stage px to the LEFT under toPx
    options: ARM.map((v) => ({ value: v, label: `${v} m` })),
    value: '2',
    live: true,
  };
  const [g] = layoutWidgets([slide], toPx, 1) as [SlideGeom];

  it('puts option i at from + (to - from) * i/(n-1), the knob on the current value', () => {
    expect(g.kind).toBe('slide');
    expect(g.from).toEqual({ x: 100, y: 400 });
    expect(g.to).toEqual({ x: 0, y: 400 });
    expect(g.notches).toHaveLength(11);
    expect(g.notches[0]).toEqual({ x: 100, y: 400 });
    expect(g.notches[10]!.x).toBeCloseTo(0, 9);
    expect(g.notches[2]!.x).toBeCloseTo(80, 9);
    expect(g.knob.x).toBeCloseTo(80, 9);
    expect(slideValuePoint(g, '3')!.x).toBeCloseTo(40, 9);
    expect(slideValuePoint(g, '9')).toBeNull();
    expect(g.live).toBe(true);
    expect(g.readout).toBe('knob');
    expect(g.guide).toBe(true);
  });

  it('draws the knob `size` px (default 56) and never grabs with less than a 64 px circle', () => {
    expect(g.knobR * 2).toBe(SLIDE_KNOB_PX);
    const small = layoutWidgets([{ ...slide, size: 20 }], toPx, 1)[0] as SlideGeom;
    expect(small.knobR * 2).toBe(DIAL_MIN_KNOB_PX);
    for (const geom of [g, small]) {
      expect(geom.hits).toHaveLength(1);
      const hit = geom.hits[0]!.shape;
      expect(hit.kind).toBe('circle');
      if (hit.kind === 'circle') {
        expect(hit.r * 2).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
        expect(hit.x).toBeCloseTo(geom.knob.x, 9);
      }
    }
    // Screen-constant: the knob halves (in panel px) at twice the zoom.
    const zoomed = layoutWidgets([slide], toPx, 0.5)[0] as SlideGeom;
    expect(zoomed.knobR).toBeCloseTo(g.knobR / 2, 9);
  });

  it('grabs only the knob (no hit along the track)', () => {
    expect(hitWidget([g], g.knob.x + 10, g.knob.y)?.id).toBe('arm');
    expect(hitWidget([g], 10, 400)).toBeNull();
  });

  it('projects a point onto the track and snaps to the nearest option', () => {
    expect(slidePointT(g, 100, 400)).toBe(0);
    expect(slidePointT(g, 50, 470)).toBeCloseTo(0.5, 9); // off the line: projected
    expect(slidePointT(g, 300, 400)).toBe(0); // past the ends: clamped
    expect(slidePointT(g, -50, 400)).toBe(1);
    expect(slidePointToValue(g, 50, 400)).toBe('2.75');
    expect(slidePointToValue(g, 57, 400)).toBe('2.5'); // t 0.43 -> notch 4
    expect(slidePointToValue(g, -999, 400)).toBe('4');
    expect(slideTToValue(g, 0.04)).toBe('1.5');
    expect(slideTToValue(g, 0.06)).toBe('1.75');
    expect(slidePointAt(g, 0.25)).toEqual({ x: 75, y: 400 });
  });

  it('anchors the coach hand on the knob', () => {
    expect(widgetAnchor(g)).toEqual(g.knob);
  });

  it('carries locked and the readout/icon choices through', () => {
    const lk = layoutWidgets([{ ...slide, locked: true, readout: 'none', icon: '↔', guide: false }], toPx, 1)[0] as SlideGeom;
    expect(lk).toMatchObject({ locked: true, readout: 'none', icon: '↔', guide: false });
  });
});

describe("TapWidget style 'mini' (a small round badge)", () => {
  const mini: TapWidget = { id: 'less', kind: 'tap', at: { x: 5, y: 5 }, icon: '−', style: 'mini' };
  it('draws 34 px by default (or `size`) but hits a circle at least 64 px across', () => {
    const [g] = layoutWidgets([mini], toPx, 1) as [TapGeom];
    expect(g.style).toBe('mini');
    expect(g.size).toBe(MINI_TAP_PX);
    const hit = g.hits[0]!.shape;
    expect(hit.kind).toBe('circle');
    if (hit.kind === 'circle') expect(hit.r * 2).toBe(MIN_TOUCH_PX);
    const big = layoutWidgets([{ ...mini, size: 90 }], toPx, 1)[0] as TapGeom;
    expect(big.size).toBe(90);
    const bigHit = big.hits[0]!.shape;
    if (bigHit.kind === 'circle') expect(bigHit.r).toBe(45);
  });
  it('is screen-constant and anchors the coach hand on its centre', () => {
    const [g] = layoutWidgets([mini], toPx, 0.5) as [TapGeom];
    expect(g.size).toBeCloseTo(MINI_TAP_PX / 2, 9);
    expect(widgetAnchor(g)).toEqual(g.center);
    expect(hitWidget([g], g.center.x + 15, g.center.y)?.id).toBe('less'); // inside the 32 px (x0.5) circle
  });
});
