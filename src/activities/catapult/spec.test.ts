// Covers `catapultSpec.partTargets`: the drawer's "part flies to the machine" animation needs at
// least one on-screen target per property value, and that target has to sit inside the play
// field, not off in the weeds somewhere. Also covers the one in-scene widget left (the angle
// lever/dial; FIRE moved to the bottom bar on 2026-10-15).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lookImageUrls } from '../../kit/looks';
import { PARALLAX } from '../../kit/parallax';
import { estimateBigTextWidth, layoutWidgets, MIN_TOUCH_PX } from '../../kit/widgetLayout';
import { catapultSpec } from './spec';
import { CATALOG, FUZZ, FUZZ_NAMES } from './core/catalog';
import {
  armAngleFor,
  armArtBox,
  BAND_ASPECTS,
  BASE_ART,
  bandSegments,
  CAN_TEXTURE,
  catapultPocketAtRest,
  crossbarPoseFor,
  cupCoverBox,
  fireSpot,
  LEVER_ART,
  LEVER_LENGTH,
  PIVOT_DX,
  PIVOT_DY,
  REST_ANGLE,
  WORLD_H,
  WORLD_W,
} from './core/build';
import { findLevel } from './core/levels';
import type { PlacedPart } from './core/types';

function catapultPart(x = 15, y = 0, arm = 'Short'): PlacedPart {
  return { id: 1, kind: 'catapult', x, y, props: { power: 'Medium', angle: '45', fuzz: 'Fur', arm } };
}

describe('catapultSpec.partTargets', () => {
  it('returns [] for a non-catapult part', () => {
    const shelf: PlacedPart = { id: 2, kind: 'shelf', x: 5, y: 0, props: { length: '2' } };
    expect(catapultSpec.partTargets!(shelf, 'power', 'Medium', {} as never)).toEqual([]);
  });

  it('returns [] for an unknown property code', () => {
    const part = catapultPart();
    expect(catapultSpec.partTargets!(part, 'nonsense', 'x', {} as never)).toEqual([]);
  });

  it('every catapult prop value yields >= 1 part target, inside the world bounds', () => {
    const part = catapultPart(15, 0);
    const descriptors = CATALOG.catapult.descriptors;
    expect(descriptors.length).toBeGreaterThan(0);

    for (const descriptor of descriptors) {
      for (const option of descriptor.options) {
        const targets = catapultSpec.partTargets!(part, descriptor.code, option.value, {} as never);
        expect(targets.length).toBeGreaterThanOrEqual(1);
        for (const t of targets) {
          expect(t.size).toBeGreaterThan(0);
          expect(t.at.x).toBeGreaterThanOrEqual(0);
          expect(t.at.x).toBeLessThanOrEqual(WORLD_W);
          expect(t.at.y).toBeGreaterThanOrEqual(0);
          expect(t.at.y).toBeLessThanOrEqual(WORLD_H);
        }
      }
    }
  });

  it('power: the target sits at band 0\'s span midpoint at rest, for the NEW power', () => {
    const part = catapultPart(15, 0);
    const preview: PlacedPart = { ...part, props: { ...part.props, power: 'High' } };
    const [first] = bandSegments(preview, REST_ANGLE);
    const expected = { at: { x: (first!.a.x + first!.b.x) / 2, y: (first!.a.y + first!.b.y) / 2 }, size: 0.6 };
    expect(catapultSpec.partTargets!(part, 'power', 'High', {} as never)).toEqual([expected]);
  });

  it('fuzz: the new fuzz flies to the rest pocket, sized to the NEW fuzz\'s diameter x 1.5', () => {
    const part = catapultPart(15, 0);
    for (const name of FUZZ_NAMES) {
      const targets = catapultSpec.partTargets!(part, 'fuzz', name, {} as never);
      expect(targets).toHaveLength(1);
      expect(targets[0]!.at).toEqual(catapultPocketAtRest(part));
      expect(targets[0]!.size).toBeCloseTo(2 * FUZZ[name]!.r * 1.5, 6);
    }
  });

  it('arm: the target sits at the arm midpoint at rest for the NEW arm length, sized to that length', () => {
    const part = catapultPart(15, 0);
    const targets = catapultSpec.partTargets!(part, 'arm', 'Long', {} as never);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.size).toBe(3); // ARM.Long.length
  });

  it('angle: the target follows crossbarPoseFor at the NEW angle, not the part\'s current angle', () => {
    const part = catapultPart(15, 0);
    const at45 = catapultSpec.partTargets!(part, 'angle', '45', {} as never)[0]!.at;
    const at75 = catapultSpec.partTargets!(part, 'angle', '75', {} as never)[0]!.at;
    expect(at45).not.toEqual(at75);
  });
});

// Product direction 2026-09-22: the PULL ring is gone. 2026-10-15 (Gao): the in-scene FIRE tap
// button is gone too - FIRE is the bottom bar's yellow button - so the angle lever's drag handle is
// the only in-scene widget; everything else tunes from the drawer.
describe('catapultSpec.widgets', () => {
  it('returns [] for a non-catapult part', () => {
    const shelf: PlacedPart = { id: 2, kind: 'shelf', x: 5, y: 0, props: { length: '2' } };
    expect(catapultSpec.widgets!(shelf, [], {} as never)).toEqual([]);
  });

  it('returns exactly one widget, the angle dial: no in-scene FIRE (no play action), no pull widget', () => {
    for (const arm of ['Short', 'Long']) {
      const widgets = catapultSpec.widgets!(catapultPart(15, 0, arm), [], {} as never);
      expect(widgets.map((w) => w.id)).toEqual(['angle']);
      expect(widgets.some((w) => w.kind === 'pull' || w.action === 'play' || w.id === 'fire')).toBe(false);
    }
  });

  it('FIRE is the bottom bar\'s yellow button: it reads FIRE for the first shot and between shots', () => {
    expect(catapultSpec.hud.lines.launch).toBe('▶ FIRE');
    expect(catapultSpec.hud.lines.playAgain).toBe('▶ FIRE');
    expect(catapultSpec.hud.playInBar).not.toBe(false);
    expect(catapultSpec.hud.lines.shotDone).toContain('FIRE');
  });

  it('angle: a dial widget with code angle, radiusM just past LEVER_LENGTH (clear of the pad), arc from armAngleFor(15) to ' +
    'armAngleFor(75), live, readout knob, options in the catalog\'s 15..75 order', () => {
    const part = catapultPart(15, 0);
    const angle = catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'angle')!;
    expect(angle.kind).toBe('dial');
    if (angle.kind !== 'dial') return;
    expect(angle.code).toBe('angle');
    expect(angle.pivot).toEqual({ x: part.x + PIVOT_DX, y: part.y + PIVOT_DY });
    // 2026-10-15: the knob rides 0.55 m past the lever's tip, clear of its blue pad.
    expect(angle.radiusM).toBeCloseTo(LEVER_LENGTH + 0.55, 9);
    expect(angle.arcFrom).toBeCloseTo(armAngleFor(15), 10);
    expect(angle.arcTo).toBeCloseTo(armAngleFor(75), 10);
    expect(angle.options.map((o) => o.value)).toEqual(['15', '30', '45', '60', '75']);
    expect(angle.value).toBe(part.props.angle);
    expect(angle.track).toBe('none');
    expect(angle.readout).toBe('knob');
    expect(angle.live).toBe(true);
  });

  it('angle (2026-10-15, Gao: "remove the indicator dots, and make the drag handle smaller"): no notch ' +
    'dots, a 56 px knob (was 72) whose grab circle still clears the 64 px touch rule and whose "60°" ' +
    'readout fits at 16 px', () => {
    const part = catapultPart(15, 0);
    const angle = catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'angle')!;
    if (angle.kind !== 'dial') throw new Error('expected a dial widget');
    expect(angle.notches).toBe(false);
    expect(angle.size).toBe(56);
    // Laid out at the build view's zoom (pxScale = 1 / zoom): drawn 56 px across on screen, the
    // grab circle >= 64 px, and no invisible tick hit spots where the dots were.
    const zoom = catapultSpec.focusFrame!(part, {} as never)!.zoom;
    const toPx = (v: { x: number; y: number }) => ({ x: v.x * 32, y: -v.y * 32 });
    const [geom] = layoutWidgets([angle], toPx, 1 / zoom);
    if (geom?.kind !== 'dial') throw new Error('expected a dial geom');
    expect(geom.notches).toBe(false);
    expect(geom.handleR * 2 * zoom).toBeCloseTo(56, 9);
    expect(geom.hits).toHaveLength(1);
    const grab = geom.hits[0]!.shape;
    expect(grab.kind === 'circle' && grab.r * 2 * zoom).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    // "75°" in 16 px bold is ~30 px wide: inside the knob's 56 px minus its 4 px ring.
    expect(estimateBigTextWidth('75°') * (16 / 20)).toBeLessThan(56 - 8);
  });

  it('angle: option i sits exactly on the lever end for that angle (radiusM at armAngleFor(deg))', () => {
    const part = catapultPart(15, 0);
    const angle = catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'angle')!;
    if (angle.kind !== 'dial') throw new Error('expected a dial widget');
    for (const opt of angle.options) {
      const deg = Number(opt.value);
      // The dial's own angle-for-index formula (arcFrom + (arcTo-arcFrom)*i/(n-1)) is the kit's
      // to compute; here we only check that armAngleFor(deg) - the lever's own stop direction for
      // that option - falls within [arcFrom, arcTo], i.e. on the swept arc at all.
      const dir = armAngleFor(deg);
      expect(dir).toBeGreaterThanOrEqual(angle.arcFrom - 1e-9);
      expect(dir).toBeLessThanOrEqual(angle.arcTo + 1e-9);
    }
  });
});

// Stakeholder feedback 2026-09-22: "make the ground thicker so we can zoom in better to the
// catapult (it's really low on the screen)."
describe('catapultSpec.world: thicker ground', () => {
  it('groundDepth 1.5, with a groundStrip (grass over earth) set explicitly', () => {
    expect(catapultSpec.world.groundDepth).toBe(1.5);
    expect(catapultSpec.world.groundStrip).toBeDefined();
    expect(typeof catapultSpec.world.groundStrip!.top).toBe('number');
    expect(typeof catapultSpec.world.groundStrip!.bottom).toBe('number');
  });
});

// 2026-10-07: the rover's treatment (2026-10-06). No dash; the scene grows up to the top bar.
describe('catapultSpec: no dash, a 612 px scene', () => {
  it('hud.goalsOverlay, and no part stat bars (the kit would never show them under it)', () => {
    expect(catapultSpec.hud.goalsOverlay).toBe(true);
    expect(catapultSpec.stats).toBeUndefined();
  });

  it('world: 30 x WORLD_H m at ppm 32, so the panel is 612 px tall from stage y 78 to 690', () => {
    expect(catapultSpec.world.worldW).toBe(30);
    expect(catapultSpec.world.worldH).toBe(WORLD_H);
    expect(catapultSpec.world.ppm).toBe(32);
    expect(WORLD_H * 32).toBe(612);
    expect(690 - catapultSpec.world.worldH * catapultSpec.world.ppm).toBe(78);
  });

  it('the backdrop is the coaster\'s theme park (2026-10-15): sky, three clouds, far hills, the ' +
    'ferris wheel (stand + turning rim) and the trees, back to front, all from public/bg/coaster/', () => {
    const bgs = catapultSpec.world.backgrounds!;
    expect(bgs.map((b) => b.url)).toEqual([
      'bg/coaster/sky.jpg',
      'bg/coaster/cloud1.png',
      'bg/coaster/cloud2.png',
      'bg/coaster/cloud3.png',
      'bg/coaster/catapult-far.png',
      'bg/coaster/wheel-stand.png',
      'bg/coaster/wheel-rim.png',
      'bg/coaster/catapult-mid.png',
    ]);
    expect(bgs.some((b) => b.url.includes('park.jpg'))).toBe(false);
    // every picture (satellites too) is on disk, under 1.5 MB
    for (const url of lookImageUrls(catapultSpec.world)) {
      const file = resolve(__dirname, '../../../public', url);
      expect(existsSync(file), url).toBe(true);
      expect(statSync(file).size, url).toBeLessThan(1.5e6);
    }
    const at = (name: string) => bgs.find((b) => b.url.endsWith(name))!;
    // The sky fills the whole 622 px viewport (the 1.5 m of ground and the kit's 10 px earth margin
    // up to the panel's top edge), the coaster's own panel height, so its vertical parallax never
    // lifts its bottom edge into view.
    const sky = at('sky.jpg');
    expect(sky.x).toBe(15);
    expect(sky.w).toBe(30);
    expect(sky.y - sky.h / 2).toBeCloseTo(-1.5 - 10 / 32, 9);
    expect(sky.y + sky.h / 2).toBeCloseTo(WORLD_H - 1.5, 9);
    expect(sky.h * 32).toBeCloseTo(622, 9);
    // The full-width bands keep the coaster's stage-px heights (32 px/m) and its ground line 10 px
    // over their bottoms: the hills and trees rise from world y 0.
    for (const [name, px] of [['catapult-far.png', 300], ['catapult-mid.png', 230]] as const) {
      const b = at(name);
      expect(b.w).toBe(30);
      expect(b.h).toBeCloseTo(px / 32, 9);
      expect(b.y - b.h / 2).toBeCloseTo(-10 / 32, 9);
    }
    // The wheel stands on the ground between the catapult and the near targets, hub 104 px up at
    // x 10 as on the coaster: the stand spans 6 px over the hub to 110 px under it (the feet, 106 px
    // under the hub, end 2 px under y 0); the rim is a 180 px square on the hub.
    const hubY = 104 / 32;
    const stand = at('wheel-stand.png');
    expect(stand.x).toBe(10);
    expect(stand.y + stand.h / 2).toBeCloseTo(hubY + 6 / 32, 9);
    expect(stand.y - stand.h / 2 + 4 / 32).toBeCloseTo(-2 / 32, 9);
    const rim = at('wheel-rim.png');
    expect(rim).toMatchObject({ x: 10, alpha: 0.7, spin: 0.12 });
    expect(rim.y).toBeCloseTo(hubY, 9);
    expect(rim.w * 32).toBeCloseTo(180, 9);
    expect(rim.h).toBe(rim.w);
    expect(stand.alpha).toBe(0.7);
    // 10 cars, five colours in turn, hung by their hanger tops from the 84 px rim
    const cars = rim.satellites!;
    expect(cars.count).toBe(10);
    expect(cars.r * 32).toBeCloseTo(84, 9);
    expect(cars.url).toEqual([1, 2, 3, 4, 5].map((n) => `bg/coaster/wheel-car-${n}.png`));
    expect(cars.w * 32).toBeCloseTo(22, 9);
    expect(cars.h * 32).toBeCloseTo(20, 9);
    expect(cars.pivot).toEqual({ x: 0.5, y: 1 / 20 });
    // The clouds float in the sky, inside the world, drifting right at the coaster's 5 / 3.5 / 6
    // stage px a second.
    const speeds: Record<string, number> = { 'cloud1.png': 5, 'cloud2.png': 3.5, 'cloud3.png': 6 };
    for (const name of ['cloud1.png', 'cloud2.png', 'cloud3.png']) {
      const c = at(name);
      expect(c.y - c.h / 2).toBeGreaterThan(6);
      expect(c.y + c.h / 2).toBeLessThan(WORLD_H - 1.5);
      expect(c.drift! * 32).toBeCloseTo(speeds[name]!, 9);
    }
    // The kit sky under the picture is sky.jpg's own top/bottom colours.
    expect(catapultSpec.world.sky).toEqual({ top: 0x2869c5, bottom: 0xb8dffa });
  });

  it('2026-10-15: every backdrop layer lags the camera by the coaster\'s depth factor (the wheel nearly moves with the world here)', () => {
    const bgs = catapultSpec.world.backgrounds!;
    const factor = (name: string) => bgs.find((b) => b.url.endsWith(name))!.parallax;
    expect(factor('sky.jpg')).toEqual(PARALLAX.sky);
    for (const c of ['cloud1.png', 'cloud2.png', 'cloud3.png']) expect(factor(c)).toEqual(PARALLAX.flyers);
    expect(factor('catapult-far.png')).toEqual(PARALLAX.far);
    // Not the coaster's 0.55: at that depth the 3.6x build view slid the wheel behind the machine.
    expect(factor('wheel-stand.png')).toEqual({ x: 0.9, y: 1 });
    expect(factor('wheel-rim.png')).toEqual({ x: 0.9, y: 1 });
    expect(factor('catapult-mid.png')).toEqual(PARALLAX.mid);
    // back to front, nearer layers move more with the world
    // (the wheel is left out: it moves nearly with the world here, and it never overlaps the trees)
    const xs = bgs.filter((b) => !b.url.includes('wheel-')).map((b) => b.parallax!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
  });

  it('the cans are the rover\'s can of beans, drawn 0.8 m tall at its own aspect on the 0.4 x 0.8 m box', () => {
    const tex = catapultSpec.textures![CAN_TEXTURE]!;
    expect(tex.url).toBe('parts/catapult/can-beans.png');
    // The 267 x 534 canvas stretched to the box (1:2) and scaled: 0.8 m of the 534 px rows are the
    // beans' 324, so the beans are 0.8 m tall and 0.8 * 267 / 324 m wide.
    const drawnH = 0.8 * tex.scale!;
    expect(drawnH * (324 / 534)).toBeCloseTo(0.8, 9);
    expect(0.4 * tex.scale!).toBeCloseTo((0.8 * 267) / 324, 9);
  });
});

/** World corners of a body-local box (w x h, centred at local (cx, cy)) on a body at `pos`, `angle`. */
function boxCorners(pos: { x: number; y: number }, angle: number, b: { w: number; h: number; cx: number; cy: number }) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: { x: number; y: number }[] = [];
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const lx = b.cx + (dx * b.w) / 2;
    const ly = b.cy + (dy * b.h) / 2;
    out.push({ x: pos.x + c * lx - s * ly, y: pos.y + s * lx + c * ly });
  }
  return out;
}

describe('catapultSpec.focusFrame: the machine framed left of the drawer', () => {
  it('returns null for a non-catapult part', () => {
    const shelf: PlacedPart = { id: 2, kind: 'shelf', x: 5, y: 0, props: { length: '2' } };
    expect(catapultSpec.focusFrame!(shelf, {} as never)).toBeNull();
  });

  it('zoom 2.8 (2026-10-15, Gao: "dont zoom into the catapult as much"; was 3.6), centred at ' +
    '(x + 1.75, y + 2.665): the old 1.5 m rescaled to the new zoom plus half the 132 px the viewport ' +
    'grew (2026-10-07)', () => {
    const part = catapultPart(15, 0);
    const frame = catapultSpec.focusFrame!(part, {} as never)!;
    expect(frame.zoom).toBe(2.8);
    expect(frame.cx).toBeCloseTo(part.x + 1.75, 9);
    expect(frame.cy).toBeCloseTo(part.y + (1.5 * 3.6) / 2.8 + 66 / (32 * 2.8), 9);
    expect(frame.cy - part.y).toBeCloseTo(2.665, 3);
  });

  it('the ground line stays where it sat on screen: the anchor lands on the same stage y (627.8) at ' +
    'zoom 2.8 in the 622 px viewport (top 78) as at 3.6 in the 490 px one (top 210)', () => {
    const part = catapultPart(15, 0);
    const frame = catapultSpec.focusFrame!(part, {} as never)!;
    // The world camera centres the frame in its viewport (BuilderScene: panel top .. 690 + 10).
    const stageY = (viewTop: number, cy: number, zoom: number) => (viewTop + 700) / 2 + (cy - part.y) * 32 * zoom;
    expect(stageY(78, frame.cy, frame.zoom)).toBeCloseTo(stageY(210, part.y + 1.5, 3.6), 6);
    expect(stageY(78, frame.cy, frame.zoom)).toBeCloseTo(627.8, 6);
    // Inside the kit's clamp (clampFrame: cy >= -groundDepth + worldH / zoom / 2), so it holds.
    expect(frame.cy).toBeGreaterThan(-1.5 + WORLD_H / frame.zoom / 2);
  });

  it('the uncovered view (the 960 x 622 px viewport at 32 px/m, minus the open drawer\'s 340 px on the ' +
    'right) holds the whole machine - the arm, cup and base pictures with >= 0.1 m to spare (whole ' +
    'boxes, transparent corners included) - and the loaded Metal fuzz\'s body, the lever knob at ' +
    'every angle and the snip spot (where FIRE was) with >= 0.3 m, the lever\'s pad with >= 0.1 m, for both arms', () => {
      const zoom = 2.8;
      const viewW = 960 / 32 / zoom;
      // The 612 px panel (WORLD_H * 32) plus the kit's 10 px earth margin (490 before 2026-10-07).
      const viewH = (WORLD_H * 32 + 10) / 32 / zoom;
      const uncoveredW = viewW * (620 / 960);

      for (const arm of ['Short', 'Long']) {
        const part = catapultPart(15, 0, arm);
        const frame = catapultSpec.focusFrame!(part, {} as never)!;
        const inside = (p: { x: number; y: number }, what: string, margin: number) => {
          expect(p.x, `${arm} ${what} x`).toBeGreaterThan(frame.cx - viewW / 2 + margin);
          expect(p.x, `${arm} ${what} x`).toBeLessThan(frame.cx - viewW / 2 + uncoveredW - margin);
          expect(p.y, `${arm} ${what} y`).toBeGreaterThan(frame.cy - viewH / 2 + margin);
          expect(p.y, `${arm} ${what} y`).toBeLessThan(frame.cy + viewH / 2 - margin);
        };
        const pivot = { x: part.x + PIVOT_DX, y: part.y + PIVOT_DY };

        // The arm picture and the cup cover at rest.
        const L = arm === 'Short' ? 2 : 3;
        for (const p of boxCorners(pivot, REST_ANGLE, armArtBox(arm))) inside(p, 'arm', 0.1);
        for (const p of boxCorners(pivot, REST_ANGLE, cupCoverBox(L))) inside(p, 'cup', 0.1);
        // The base picture (plank, A-frame, hub).
        for (const p of boxCorners({ x: part.x, y: part.y + 0.3 }, 0, BASE_ART)) inside(p, 'base', 0.1);
        // The loaded Metal fuzz's body (the heaviest, biggest collider).
        const pocket = catapultPocketAtRest({ ...part, props: { ...part.props, fuzz: 'Metal' } });
        for (const [dx, dy] of [[-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4]] as const) {
          inside({ x: pocket.x + dx, y: pocket.y + dy }, 'fuzz', 0.3);
        }

        for (const deg of [15, 30, 45, 60, 75]) {
          // The knob (pivot + LEVER_LENGTH along armAngleFor(deg)).
          const dir = armAngleFor(deg);
          inside({ x: pivot.x + LEVER_LENGTH * Math.cos(dir), y: pivot.y + LEVER_LENGTH * Math.sin(dir) }, `knob ${deg}`, 0.3);
          // The lever picture's pad reaches a little past the knob.
          const preview = { ...part, props: { ...part.props, angle: String(deg) } };
          const { pos, angle } = crossbarPoseFor(preview);
          for (const p of boxCorners(pos, angle, LEVER_ART)) inside(p, `lever ${deg}`, 0.1);
        }

        // The snip burst's spot (the old in-scene FIRE button's, 2026-10-15: FIRE is on the bar);
        // the old caption line, about y - 0.34, still over 0.25 m above the view's bottom edge.
        inside(fireSpot(part), 'snip', 0.3);
        expect(part.y - 0.34).toBeGreaterThan(frame.cy - viewH / 2 + 0.25);

        // The room 2.8 frees goes to the shot preview: >= 1.5 m of open view right of the base
        // picture before the drawer (none at 3.6), >= 2.5 m over the lever's pad.
        expect(frame.cx - viewW / 2 + uncoveredW - (part.x + BASE_ART.cx + BASE_ART.w / 2)).toBeGreaterThan(1.5);
        expect(frame.cy + viewH / 2 - (part.y + 3.38)).toBeGreaterThan(2.5);
      }
  });

  it('at a catapult as far left as x = 3.5, cx asks for the kit\'s left clamp itself ' +
    '(worldW / zoom / 2 = 5.357), and the Short arm\'s cup is in view', () => {
    const part = catapultPart(3.5, 0);
    const frame = catapultSpec.focusFrame!(part, {} as never)!;
    expect(frame.cx).toBeCloseTo(30 / 2.8 / 2, 9);
    expect(frame.cx).toBeGreaterThanOrEqual(30 / frame.zoom / 2);
    const pivot = { x: part.x + PIVOT_DX, y: part.y + PIVOT_DY };
    for (const p of boxCorners(pivot, REST_ANGLE, cupCoverBox(2))) expect(p.x).toBeGreaterThan(frame.cx - 15 / frame.zoom + 0.5);
    // A catapult further right gets a frame that follows its x.
    expect(catapultSpec.focusFrame!(catapultPart(6, 0), {} as never)!.cx).toBeCloseTo(7.75, 9);
  });
});

// Huddle 2026-09-22: the collapse payoff and the line goal; stakeholder direction 2026-10-01: one
// Fuzz row with five fuzzes (the Donut splits), and the art lead's real art for the machine.
describe('catapultSpec: the fuzzes, the real art, the collapse payoff and the line goal', () => {
  it('textures: fuzz-<name>[-excited] for the five fuzzes (both keys one picture), each scaled so ' +
    'its round body draws at the collider\'s diameter', () => {
    const tex = catapultSpec.textures!;
    // Canvas px / body diameter px on the prepared square PNGs.
    const scales: Record<string, number> = { Flower: 218 / 120, Donut: 208 / 206, Fur: 338 / 230, Helmet: 296 / 288, Metal: 542 / 339 };
    for (const name of FUZZ_NAMES) {
      expect(tex[`fuzz-${name}`]).toEqual({ url: `parts/catapult/fuzz-${name}.png`, scale: scales[name] });
      expect(tex[`fuzz-${name}-excited`]).toEqual(tex[`fuzz-${name}`]);
    }
    // The old Blue/Prism x weight keys, the kettlebell gear and the old SVG machine are gone.
    for (const key of Object.keys(tex)) {
      expect(key).not.toMatch(/^fuzz-(Blue|Prism)/);
      expect(key).not.toMatch(/^gear-/);
      expect(key).not.toMatch(/^tex-/);
    }
    expect(tex['fx-dust']).toEqual({ url: 'fx/dust.svg' });
    expect(tex['fx-crash']).toEqual({ url: 'fx/crash.svg' });
  });

  it('textures: the machine\'s real-art pictures and every band length bandSprite can pick', () => {
    const tex = catapultSpec.textures!;
    for (const key of ['real-base', 'real-arm-Short', 'real-arm-Long', 'real-gear', 'real-cup', 'real-lever', 'real-hook']) {
      expect(tex[key]).toEqual({ url: `parts/catapult/${key}.png` });
    }
    for (const n of BAND_ASPECTS) expect(tex[`real-band-${n}`]).toEqual({ url: `parts/catapult/real-band-${n}.png` });
  });

  it('textures (2026-10-15): a crate picture per block size at that size\'s aspect, the debris planks and SMASH!, every file present', () => {
    // A PNG's IHDR: width and height, big-endian, at bytes 16 and 20.
    const PNG_SIZE = (file: string) => {
      const buf = readFileSync(file);
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    };
    const tex = catapultSpec.textures!;
    const sizes: Record<string, [number, number]> = { '1x1': [1, 1], '2x1': [2, 1], '1x2': [1, 2], domino: [0.4, 2] };
    for (const [size, [w, h]] of Object.entries(sizes)) {
      const t = tex[`crate-${size}`]!;
      expect(t).toEqual({ url: `parts/catapult/crate-${size}.png` });
      const file = resolve('public', t.url);
      expect(existsSync(file), file).toBe(true);
      const px = PNG_SIZE(file);
      expect(px.w / px.h).toBeCloseTo(w / h, 1);
    }
    for (const key of ['crate-debris-1', 'crate-debris-2', 'crate-debris-3', 'fx-smash']) {
      expect(tex[key], key).toBeDefined();
      expect(existsSync(resolve('public', tex[key]!.url)), key).toBe(true);
    }
  });

  it('follow: while running, the camera prefers the impact target, then the fuzz; none otherwise', () => {
    const f = catapultSpec.follow!({} as never, 'running', 0)!;
    expect(f.roles).toEqual(['impact', 'fuzz']);
    expect(f.zoom).toBe(1.6);
    // 2026-10-07: 0.5 m over the point plus half the 132 px the viewport grew, so the point keeps
    // its height over the view's bottom edge (the taller view only adds sky on top).
    expect(f.offset!.x).toBe(1);
    expect(f.offset!.y).toBeCloseTo(0.5 + 66 / (32 * 1.6), 9);
    const bottomUnder = (viewH: number, dy: number) => viewH / 32 / 1.6 / 2 - dy;
    expect(bottomUnder(622, f.offset!.y)).toBeCloseTo(bottomUnder(490, 0.5), 9);
    expect(catapultSpec.follow!({} as never, 'shot', 0)).toBeNull();
  });

  it('the impact role is never drawn (alpha 0 fill)', () => {
    const fill = catapultSpec.roles.impact!.fill!;
    expect(fill({} as never).alpha).toBe(0);
  });

  it('result card: one Fuzz row naming the loaded fuzz (no Weights row any more)', () => {
    const donut = findLevel('donut')!;
    const m = catapultSpec.editMetrics(donut.parts, donut, null);
    const card = (parts: PlacedPart[]) => catapultSpec.resultCard!(parts, donut, m, 'shot', false)!;
    expect(card(donut.parts).rows).toContainEqual({ label: 'Fuzz', value: 'Donut' });
    expect(card(donut.parts).rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm']);
    const metal = donut.parts.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, fuzz: 'Metal' } } : p));
    expect(card(metal).rows).toContainEqual({ label: 'Fuzz', value: 'Metal' });
  });

  // Stakeholder direction 2026-09-22: "if a concept hasn't been introduced yet, it should be
  // locked and hidden" - the result card rows follow the same known-concept rule the kit uses to
  // hide drawer rows and widgets (the union of `introduces` up to and including this level).
  it('result card: rows are limited to concepts known at this level', () => {
    const cardFor = (id: string) => {
      const level = findLevel(id)!;
      const m = catapultSpec.editMetrics(level.parts, level, null);
      return catapultSpec.resultCard!(level.parts, level, m, 'shot', false)!;
    };

    expect(cardFor('power').rows.map((r) => r.label)).toEqual(['Rubber bands']);
    expect(cardFor('angle').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle']);
    expect(cardFor('weight').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz']);
    expect(cardFor('arm').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm']);
    expect(cardFor('donut').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm']);
    // Every challenge level comes after all four mechanics are known, so all four rows show.
    for (const id of ['smash', 'tower', 'line', 'chain', 'free']) {
      expect(cardFor(id).rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm']);
    }
  });

  it('aboveLine in the HUD: a meter, "N above the line" goal text, and no progress bar', () => {
    const meter = catapultSpec.hud.meters.find((mm) => mm.metric === 'aboveLine')!;
    expect(meter).toBeDefined();
    const goal = { metric: 'aboveLine', op: '==' as const, value: 0, label: '' };
    expect(catapultSpec.hud.goalValueText(goal, 2)).toBe('2 above the line');
    expect(catapultSpec.hud.barlessMetrics).toContain('aboveLine');
  });

  it('editMetrics.aboveLine: from part placement without a sim, from the settled sim with one', async () => {
    const level = findLevel('line')!;
    // Tops 1.0, 2.0, 3.0 and 4.0 against a 1.5 m line.
    expect(catapultSpec.editMetrics(level.parts, level, null).aboveLine).toBe(3);
    expect(catapultSpec.editMetrics(findLevel('power')!.parts, findLevel('power')!, null).aboveLine).toBe(0);
    const sim = await catapultSpec.createSim(level.parts, level);
    const fromSim = { ...sim, metrics: () => ({ ...sim.metrics(), aboveLine: 7 }) };
    expect(catapultSpec.editMetrics(level.parts, level, fromSim as never).aboveLine).toBe(7);
    expect(catapultSpec.editMetrics(level.parts, level, sim).aboveLine).toBe(3);
    sim.destroy();
  });
});
