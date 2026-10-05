import { describe, expect, it } from 'vitest';
import {
  approachFrame,
  clampFrame,
  cxToScroll,
  easeInOutCubic,
  fullFrame,
  isWideWorld,
  lerpFrame,
  panelPxToStagePx,
  scrollToCx,
  viewWidth,
  type CamLike,
} from './camera';

const WORLD = { worldW: 60, worldH: 30 };

describe('fullFrame', () => {
  it('centres the panel at zoom 1', () => {
    expect(fullFrame(WORLD)).toEqual({ cx: 30, cy: 15, zoom: 1 });
  });
});

describe('fullFrame with groundDepth', () => {
  it('centres the visible band, groundDepth below worldH / 2', () => {
    expect(fullFrame({ ...WORLD, groundDepth: 6 })).toEqual({ cx: 30, cy: 15 - 6, zoom: 1 });
  });

  it('treats an absent groundDepth the same as 0', () => {
    expect(fullFrame({ ...WORLD, groundDepth: 0 })).toEqual(fullFrame(WORLD));
  });
});

describe('easeInOutCubic', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeInOutCubic(0)).toBeCloseTo(0, 9);
    expect(easeInOutCubic(1)).toBeCloseTo(1, 9);
  });

  it('is symmetric about the midpoint', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75), 9);
  });
});

describe('lerpFrame', () => {
  it('blends componentwise', () => {
    const a = { cx: 0, cy: 0, zoom: 1 };
    const b = { cx: 10, cy: 20, zoom: 2 };
    expect(lerpFrame(a, b, 0.5)).toEqual({ cx: 5, cy: 10, zoom: 1.5 });
    expect(lerpFrame(a, b, 0)).toEqual(a);
    expect(lerpFrame(a, b, 1)).toEqual(b);
  });
});

describe('clampFrame', () => {
  it('is a no-op at zoom 1 when already centred (full panel fits exactly)', () => {
    const f = fullFrame(WORLD);
    expect(clampFrame(f, WORLD)).toEqual(f);
  });

  it('recentres an out-of-range frame at zoom 1 (visible rect == world)', () => {
    // At zoom 1 the visible rect is the whole world, so any cx/cy must clamp to the centre.
    expect(clampFrame({ cx: 0, cy: 0, zoom: 1 }, WORLD)).toEqual({ cx: 30, cy: 15, zoom: 1 });
    expect(clampFrame({ cx: 1000, cy: -1000, zoom: 1 }, WORLD)).toEqual({ cx: 30, cy: 15, zoom: 1 });
  });

  it('clamps a zoomed-in frame pinned to the left/bottom edge', () => {
    const zoom = 2.2;
    const halfW = WORLD.worldW / zoom / 2; // ~13.636
    const halfH = WORLD.worldH / zoom / 2; // ~6.818
    const out = clampFrame({ cx: -100, cy: -100, zoom }, WORLD);
    expect(out.cx).toBeCloseTo(halfW, 9);
    expect(out.cy).toBeCloseTo(halfH, 9);
    expect(out.zoom).toBe(zoom);
  });

  it('clamps a zoomed-in frame pinned to the right/top edge', () => {
    const zoom = 2.2;
    const halfW = WORLD.worldW / zoom / 2;
    const halfH = WORLD.worldH / zoom / 2;
    const out = clampFrame({ cx: 1000, cy: 1000, zoom }, WORLD);
    expect(out.cx).toBeCloseTo(WORLD.worldW - halfW, 9);
    expect(out.cy).toBeCloseTo(WORLD.worldH - halfH, 9);
  });

  it('leaves an in-range zoomed frame untouched', () => {
    const zoom = 2.2;
    const f = { cx: 30, cy: 15, zoom };
    expect(clampFrame(f, WORLD)).toEqual(f);
  });
});

describe('clampFrame with groundDepth', () => {
  // worldH 18, zoom 3.6 => halfH 2.5: with D = 1.5 the visible band [-1.5, 16.5] lets cy = 1.5
  // (a machine standing on the ground) stay put; with D = 0 the same cy is below the reachable
  // minimum (halfH) and gets pushed up to it.
  const DEEP = { worldW: 36, worldH: 18, groundDepth: 1.5 };
  const SHALLOW = { worldW: 36, worldH: 18 };
  const zoom = 3.6;
  const halfH = DEEP.worldH / zoom / 2; // 2.5

  it('keeps a low centre in range when groundDepth covers it', () => {
    const out = clampFrame({ cx: 18, cy: 1.5, zoom }, DEEP);
    expect(out.cy).toBeCloseTo(1.5, 9);
  });

  it('pushes the same centre up to halfH with no groundDepth', () => {
    const out = clampFrame({ cx: 18, cy: 1.5, zoom }, SHALLOW);
    expect(out.cy).toBeCloseTo(halfH, 9);
  });

  it('clamps the top edge to worldH - groundDepth - halfH', () => {
    const out = clampFrame({ cx: 18, cy: 1000, zoom }, DEEP);
    expect(out.cy).toBeCloseTo(DEEP.worldH - DEEP.groundDepth - halfH, 9);
  });

  it('clamps the bottom edge to -groundDepth + halfH', () => {
    const out = clampFrame({ cx: 18, cy: -1000, zoom }, DEEP);
    expect(out.cy).toBeCloseTo(-DEEP.groundDepth + halfH, 9);
  });

  it('the x axis is unaffected by groundDepth', () => {
    const withDepth = clampFrame({ cx: 1000, cy: 1.5, zoom }, DEEP);
    const without = clampFrame({ cx: 1000, cy: 1.5, zoom }, SHALLOW);
    expect(withDepth.cx).toBeCloseTo(without.cx, 9);
  });
});

describe('approachFrame', () => {
  const cur = { cx: 0, cy: 0, zoom: 1 };
  const target = { cx: 100, cy: 200, zoom: 2 };

  it('does not move at dt = 0', () => {
    expect(approachFrame(cur, target, 0.1, 0)).toEqual(cur);
  });

  it('reaches (very close to) the target given enough elapsed time', () => {
    const out = approachFrame(cur, target, 0.1, 5000);
    expect(out.cx).toBeCloseTo(target.cx, 3);
    expect(out.cy).toBeCloseTo(target.cy, 3);
    expect(out.zoom).toBeCloseTo(target.zoom, 3);
  });

  it('is frame-rate independent: two half-steps ~= one full step', () => {
    const dtFull = 200;
    const oneStep = approachFrame(cur, target, 0.1, dtFull);
    const twoSteps = approachFrame(approachFrame(cur, target, 0.1, dtFull / 2), target, 0.1, dtFull / 2);
    expect(twoSteps.cx).toBeCloseTo(oneStep.cx, 6);
    expect(twoSteps.cy).toBeCloseTo(oneStep.cy, 6);
    expect(twoSteps.zoom).toBeCloseTo(oneStep.zoom, 6);
  });

  it('four quarter-steps still ~= one full step', () => {
    const dtFull = 400;
    const oneStep = approachFrame(cur, target, 0.2, dtFull);
    let acc = cur;
    for (let i = 0; i < 4; i++) acc = approachFrame(acc, target, 0.2, dtFull / 4);
    expect(acc.cx).toBeCloseTo(oneStep.cx, 6);
    expect(acc.cy).toBeCloseTo(oneStep.cy, 6);
  });
});

describe('panelPxToStagePx', () => {
  // A stand-in for BuilderScene's worldCam at RENDER_SCALE 2, camCur.zoom 1: viewport 928x460
  // canvas px at offset (64, 420) (panel origin * RS), zoom = RENDER_SCALE * camCur.zoom = 2,
  // showing a 464x230 (panel-px) slice of the world starting at worldView (32, 210).
  const RS = 2;
  const cam: CamLike = { worldView: { x: 32, y: 210 }, zoom: RS * 1, x: 64, y: 420 };

  it('maps the visible rect centre to the viewport centre, in stage px', () => {
    const displayW = (928 - 0) / cam.zoom; // width canvas px / zoom -> panel px
    const displayH = 460 / cam.zoom;
    const centreWorldPx = { x: cam.worldView.x + displayW / 2, y: cam.worldView.y + displayH / 2 };
    const out = panelPxToStagePx(centreWorldPx, cam, RS);
    expect(out.x).toBeCloseTo((cam.x + 928 / 2) / RS, 9);
    expect(out.y).toBeCloseTo((cam.y + 460 / 2) / RS, 9);
  });

  it('maps the visible rect top-left to the viewport top-left, in stage px', () => {
    const out = panelPxToStagePx(cam.worldView, cam, RS);
    expect(out).toEqual({ x: cam.x / RS, y: cam.y / RS });
  });

  it('scales panel-px deltas by zoom / renderScale', () => {
    const a = panelPxToStagePx({ x: cam.worldView.x, y: cam.worldView.y }, cam, RS);
    const b = panelPxToStagePx({ x: cam.worldView.x + 10, y: cam.worldView.y + 10 }, cam, RS);
    expect(b.x - a.x).toBeCloseTo((10 * cam.zoom) / RS, 9);
    expect(b.y - a.y).toBeCloseTo((10 * cam.zoom) / RS, 9);
  });

  it('zooming in doubles the stage-px distance between two fixed panel points', () => {
    const p1 = { x: cam.worldView.x + 5, y: cam.worldView.y + 5 };
    const p2 = { x: cam.worldView.x + 15, y: cam.worldView.y + 15 };
    const zoomedCam: CamLike = { ...cam, zoom: cam.zoom * 2 };
    const d1 = panelPxToStagePx(p2, cam, RS).x - panelPxToStagePx(p1, cam, RS).x;
    const d2 = panelPxToStagePx(p2, zoomedCam, RS).x - panelPxToStagePx(p1, zoomedCam, RS).x;
    expect(d2).toBeCloseTo(d1 * 2, 9);
  });
});

// ---- wide (scrolling) worlds: worldW wider than the 960 px view (960 / ppm meters) ----

const WIDE = { worldW: 90, worldH: 15, ppm: 32 }; // view 30 m: three screens of world
const SINGLE = { worldW: 30, worldH: 15, ppm: 32 }; // today's single-screen world

describe('viewWidth / isWideWorld', () => {
  it('is 960 / ppm for a world wider than the view', () => {
    expect(viewWidth(WIDE)).toBe(30);
    expect(isWideWorld(WIDE)).toBe(true);
  });

  it('is exactly worldW when the world fits the view (the single-screen case)', () => {
    expect(viewWidth(SINGLE)).toBe(30);
    expect(isWideWorld(SINGLE)).toBe(false);
    expect(viewWidth({ worldW: 24, ppm: 40 })).toBe(24);
  });

  it('treats a float-rounded single-screen world as fitting, returning worldW bit for bit', () => {
    const ppm = 960 / 36;
    expect(viewWidth({ worldW: 36, ppm })).toBe(36);
    expect(isWideWorld({ worldW: 36, ppm })).toBe(false);
  });

  it('is worldW without a ppm (frames clamped against bare world dimensions)', () => {
    expect(viewWidth({ worldW: 60 })).toBe(60);
    expect(isWideWorld({ worldW: 60 })).toBe(false);
  });
});

describe('fullFrame on a wide world', () => {
  it('is the LEFT view window at zoom 1', () => {
    expect(fullFrame(WIDE)).toEqual({ cx: 15, cy: 7.5, zoom: 1 });
  });

  it('is unchanged for a single-screen world given its ppm', () => {
    expect(fullFrame(SINGLE)).toEqual(fullFrame({ worldW: 30, worldH: 15 }));
  });
});

describe('clampFrame on a wide world', () => {
  it('zoom 1: the window stops at the world start', () => {
    expect(clampFrame({ cx: -100, cy: 7.5, zoom: 1 }, WIDE)).toEqual({ cx: 15, cy: 7.5, zoom: 1 });
  });

  it('zoom 1: the window stops at the world end', () => {
    expect(clampFrame({ cx: 1000, cy: 7.5, zoom: 1 }, WIDE)).toEqual({ cx: 75, cy: 7.5, zoom: 1 });
  });

  it('zoom 1: a window in between is left alone (and cy still centres at zoom 1)', () => {
    expect(clampFrame({ cx: 40, cy: 0, zoom: 1 }, WIDE)).toEqual({ cx: 40, cy: 7.5, zoom: 1 });
  });

  it('zoomed in: cx ranges over [viewW / (2 zoom), worldW - viewW / (2 zoom)]', () => {
    const zoom = 2;
    const half = 30 / zoom / 2; // 7.5
    expect(clampFrame({ cx: -5, cy: 7.5, zoom }, WIDE).cx).toBeCloseTo(half, 9);
    expect(clampFrame({ cx: 500, cy: 7.5, zoom }, WIDE).cx).toBeCloseTo(90 - half, 9);
    expect(clampFrame({ cx: 50, cy: 7.5, zoom }, WIDE).cx).toBeCloseTo(50, 9);
  });

  it('zoomed in: the y clamp is the same as on a single-screen world of the same height', () => {
    const f = { cx: 50, cy: -100, zoom: 2.5 };
    expect(clampFrame(f, WIDE).cy).toBeCloseTo(clampFrame(f, SINGLE).cy, 9);
  });

  it('centres when the window is wider than the world (zoomed out past it)', () => {
    // zoom 0.25: a 120 m window over a 90 m world.
    expect(clampFrame({ cx: 3, cy: 7.5, zoom: 0.25 }, WIDE).cx).toBeCloseTo(45, 9);
  });

  it('a single-screen world with its ppm clamps exactly as before (whole-world view)', () => {
    for (const f of [{ cx: 0, cy: 0, zoom: 1 }, { cx: 1000, cy: 1000, zoom: 2.2 }, { cx: 12, cy: 4, zoom: 3 }]) {
      expect(clampFrame(f, SINGLE)).toEqual(clampFrame(f, { worldW: 30, worldH: 15 }));
    }
  });
});

// ---- Level.extentW: the camera clamped to an EFFECTIVE world narrower than the drawn worldW ----
// (BuilderApp builds `{ ...spec.world, worldW: min(spec.world.worldW, level.extentW) }` and hands
// it to these same, unmodified functions — a short level in a wide course just passes a smaller
// `worldW` through. Drawing keeps using the full `spec.world`.)

describe('clampFrame / viewWidth / isWideWorld with an effective width smaller than the drawn worldW', () => {
  // The course draws a 90 m world (ppm 32, so the view is 30 m); this level's content only
  // reaches x 20, so its EFFECTIVE world is 20 m, narrower than the 30 m view.
  const EFF_SHORT = { worldW: 20, worldH: 15, ppm: 32 };

  it('a short level is not wide: the scrollbar never shows', () => {
    expect(viewWidth(EFF_SHORT)).toBe(20);
    expect(isWideWorld(EFF_SHORT)).toBe(false);
  });

  it('fullFrame centres the SHORT effective world, not the course worldW', () => {
    expect(fullFrame(EFF_SHORT)).toEqual({ cx: 10, cy: 7.5, zoom: 1 });
  });

  it('clampFrame at zoom 1 recentres to the short world regardless of how far the frame asks to go', () => {
    expect(clampFrame({ cx: 1000, cy: 7.5, zoom: 1 }, EFF_SHORT)).toEqual({ cx: 10, cy: 7.5, zoom: 1 });
  });

  // This level's content reaches x 50: still narrower than the course's 90 m worldW, but still
  // wider than the 30 m view, so it DOES scroll, just over its own 50 m rather than the full 90.
  const EFF_LONG = { worldW: 50, worldH: 15, ppm: 32 };

  it('a level still wider than the view scrolls, clamped to ITS OWN width', () => {
    expect(isWideWorld(EFF_LONG)).toBe(true);
    // zoom 1: cx clamps to worldW - viewW / 2 = 50 - 15 = 35, never the course's full 90 m tail
    // (90 - 15 = 75).
    expect(clampFrame({ cx: 1000, cy: 7.5, zoom: 1 }, EFF_LONG)).toEqual({ cx: 35, cy: 7.5, zoom: 1 });
  });

  it('scrollToCx / cxToScroll range over the effective width, not the course worldW', () => {
    const viewW = viewWidth(EFF_LONG); // 30
    expect(scrollToCx(1, viewW, EFF_LONG.worldW)).toBeCloseTo(35, 9); // 15 + 1 * (50 - 30), not 75
    expect(cxToScroll(35, viewW, EFF_LONG.worldW)).toBeCloseTo(1, 9);
  });
});

describe('scrollToCx / cxToScroll', () => {
  it('maps 0 and 1 to the window at the world start and end', () => {
    expect(scrollToCx(0, 30, 90)).toBe(15);
    expect(scrollToCx(1, 30, 90)).toBe(75);
    expect(scrollToCx(0.5, 30, 90)).toBe(45);
  });

  it('is restCx = viewW / 2 + t * (worldW - viewW) at zoom 1', () => {
    for (const t of [0, 0.1, 0.37, 0.8, 1]) expect(scrollToCx(t, 30, 90)).toBeCloseTo(15 + t * 60, 9);
  });

  it('round-trips t -> cx -> t', () => {
    for (const t of [0, 0.001, 0.25, 0.5, 0.999, 1]) {
      expect(cxToScroll(scrollToCx(t, 30, 90), 30, 90)).toBeCloseTo(t, 9);
      expect(cxToScroll(scrollToCx(t, 30, 90, 2), 30, 90, 2)).toBeCloseTo(t, 9);
    }
  });

  it('round-trips cx -> t -> cx inside the scrollable range', () => {
    for (const cx of [15, 20, 45.5, 75]) expect(scrollToCx(cxToScroll(cx, 30, 90), 30, 90)).toBeCloseTo(cx, 9);
  });

  it('clamps t and cx to the scrollable range', () => {
    expect(scrollToCx(-1, 30, 90)).toBe(15);
    expect(scrollToCx(7, 30, 90)).toBe(75);
    expect(scrollToCx(Number.NaN, 30, 90)).toBe(15);
    expect(cxToScroll(0, 30, 90)).toBe(0);
    expect(cxToScroll(1000, 30, 90)).toBe(1);
  });

  it('zoomed: the range is [viewW / (2 zoom), worldW - viewW / (2 zoom)]', () => {
    expect(scrollToCx(0, 30, 90, 2)).toBeCloseTo(7.5, 9);
    expect(scrollToCx(1, 30, 90, 2)).toBeCloseTo(82.5, 9);
  });

  it('a world that fits the view has nothing to scroll: the centre, scroll 0', () => {
    expect(scrollToCx(0.7, 30, 30)).toBe(15);
    expect(cxToScroll(15, 30, 30)).toBe(0);
  });

  it('agrees with clampFrame: every scroll position is a clamped frame', () => {
    for (const t of [0, 0.3, 1]) {
      const cx = scrollToCx(t, viewWidth(WIDE), WIDE.worldW);
      expect(clampFrame({ cx, cy: 7.5, zoom: 1 }, WIDE).cx).toBeCloseTo(cx, 9);
    }
  });
});
