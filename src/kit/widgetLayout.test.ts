import { describe, expect, it } from 'vitest';
import {
  BIG_GAP,
  BIG_HIT_PAD,
  BIG_MIN_W,
  BIG_PAD_X,
  BIG_PILL_H,
  MIN_TOUCH_PX,
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
import type { CycleWidget, DialWidget, LeverWidget, PullWidget, RackWidget, TapWidget, Vec2 } from './types';

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
    expect(g!.pill).toEqual({ w: 10 + BIG_GAP + 160 + 2 * BIG_PAD_X, h: BIG_PILL_H, iconW: 10, labelW: 160, gap: BIG_GAP, contentW: 180 });
    expect(g!.size).toBe(BIG_PILL_H);
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
  it("is a tap's centre, a dial's handle, a rack's middle cell and a lever's knob", () => {
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
    expect(widgetAnchor(tg!)).toEqual(toPx({ x: 2, y: 3 }));
    const pivot = toPx({ x: 5, y: 5 });
    const handle = widgetAnchor(dg!);
    expect(handle.x).toBeCloseTo(pivot.x, 6); // value 'b' sits at 90 degrees: straight up
    expect(handle.y).toBeCloseTo(pivot.y - 100, 6);
    expect(widgetAnchor(rg!)).toEqual((rg as RackGeom).cells[1]!.center);
    expect(widgetAnchor(lg!)).toEqual((lg as LeverGeom).knob);
  });
});
