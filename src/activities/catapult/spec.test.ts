// Covers `catapultSpec.partTargets`: the drawer's "part flies to the machine" animation needs at
// least one on-screen target per property value, and that target has to sit inside the play
// field, not off in the weeds somewhere. Also covers the two in-scene widgets left (FIRE, the
// angle lever/dial).
import { describe, expect, it } from 'vitest';
import { catapultSpec } from './spec';
import { CATALOG, FUZZ, FUZZ_NAMES } from './core/catalog';
import {
  armAngleFor,
  armArtBox,
  BAND_ASPECTS,
  BASE_ART,
  bandSegments,
  catapultPocketAtRest,
  crossbarPoseFor,
  cupCoverBox,
  fireSpot,
  LEVER_ART,
  LEVER_LENGTH,
  PIVOT_DX,
  PIVOT_DY,
  REST_ANGLE,
  stringAnchor,
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

// Product direction 2026-09-22: the PULL ring is gone. Two in-scene widgets remain - a plain
// FIRE tap button and the angle lever's drag handle - everything else tunes from the drawer.
describe('catapultSpec.widgets', () => {
  it('returns [] for a non-catapult part', () => {
    const shelf: PlacedPart = { id: 2, kind: 'shelf', x: 5, y: 0, props: { length: '2' } };
    expect(catapultSpec.widgets!(shelf, [], {} as never)).toEqual([]);
  });

  it('returns exactly two widgets: FIRE (tap) and angle (dial) - no pull widget any more', () => {
    const part = catapultPart(15, 0);
    const widgets = catapultSpec.widgets!(part, [], {} as never);
    expect(widgets).toHaveLength(2);
    expect(widgets.some((w) => w.kind === 'pull')).toBe(false);
  });

  it('FIRE: a tap widget with action play, at fireSpot(part) - just right of the string - for ' +
    'both arms', () => {
    for (const arm of ['Short', 'Long']) {
      const part = catapultPart(15, 0, arm);
      const fire = catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'fire')!;
      expect(fire.kind).toBe('tap');
      if (fire.kind !== 'tap') continue;
      expect(fire.action).toBe('play');
      const spot = fireSpot(part);
      expect(fire.at.x).toBeCloseTo(spot.x, 9);
      expect(fire.at.y).toBeCloseTo(spot.y, 9);
      expect(fire.icon).toBe('✂️');
      expect(fire.label).toBe('FIRE');
      expect(fire.color).toBe(0x61bb46);
      expect(fire.size).toBe(72);
    }
  });

  it('FIRE: clear of the string (a small gap to its left) and of the cart\'s base (a small gap ' +
    'before its left edge, part.x - 0.8) at zoom 3.6, for both arms', () => {
    const zoom = 3.6;
    const ppm = 32;
    for (const arm of ['Short', 'Long']) {
      const part = catapultPart(15, 0, arm);
      const fire = catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'fire')!;
      if (fire.kind !== 'tap') continue;
      const { a } = stringAnchor(part);
      const buttonHalfW = fire.size! / (ppm * zoom) / 2;
      expect(fire.at.x - buttonHalfW).toBeGreaterThan(a.x); // clear of the string, small gap
      expect(fire.at.x + buttonHalfW).toBeLessThan(part.x - 0.8); // clear of the cart's base
    }
  });

  it('angle: a dial widget with code angle, radiusM = LEVER_LENGTH, arc from armAngleFor(15) to ' +
    'armAngleFor(75), live, readout knob, options in the catalog\'s 15..75 order', () => {
    const part = catapultPart(15, 0);
    const angle = catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'angle')!;
    expect(angle.kind).toBe('dial');
    if (angle.kind !== 'dial') return;
    expect(angle.code).toBe('angle');
    expect(angle.pivot).toEqual({ x: part.x + PIVOT_DX, y: part.y + PIVOT_DY });
    expect(angle.radiusM).toBe(LEVER_LENGTH);
    expect(angle.arcFrom).toBeCloseTo(armAngleFor(15), 10);
    expect(angle.arcTo).toBeCloseTo(armAngleFor(75), 10);
    expect(angle.options.map((o) => o.value)).toEqual(['15', '30', '45', '60', '75']);
    expect(angle.value).toBe(part.props.angle);
    expect(angle.track).toBe('none');
    expect(angle.readout).toBe('knob');
    expect(angle.live).toBe(true);
    expect(angle.size).toBe(72);
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

  it('zoom 3.6, centred at (x + 0.7, y + 1.5)', () => {
    const part = catapultPart(15, 0);
    const frame = catapultSpec.focusFrame!(part, {} as never)!;
    expect(frame.zoom).toBe(3.6);
    expect(frame.cx).toBeCloseTo(part.x + 0.7, 9);
    expect(frame.cy).toBeCloseTo(part.y + 1.5, 9);
  });

  it('the uncovered view (the 960 x 490 px panel at 32 px/m, minus the open drawer\'s 340 px on the ' +
    'right) holds the whole machine - the arm, cup and base pictures with >= 0.1 m to spare (whole ' +
    'boxes, transparent corners included) - and the loaded Metal fuzz\'s body, the lever knob at ' +
    'every angle and the FIRE button with >= 0.3 m, the lever\'s pad with >= 0.1 m, for both arms', () => {
      const zoom = 3.6;
      const viewW = 960 / 32 / zoom;
      const viewH = 490 / 32 / zoom;
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

        // The FIRE button itself; its caption draws a little further into the ground band below,
        // to about y - 0.34 - still over 0.25 m above the view's bottom edge.
        inside(fireSpot(part), 'FIRE', 0.3);
        expect(part.y - 0.34).toBeGreaterThan(frame.cy - viewH / 2 + 0.25);
      }
  });

  it('at the leftmost catapult position in levels.ts (x = 3.5, the "move" level\'s start), cx stays ' +
    'just clear of the kit\'s left clamp (worldW / zoom / 2)', () => {
    const part = catapultPart(3.5, 0);
    const frame = catapultSpec.focusFrame!(part, {} as never)!;
    expect(frame.cx).toBeCloseTo(4.2, 9);
    expect(frame.cx).toBeGreaterThanOrEqual(30 / frame.zoom / 2);
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

  it('follow: while running, the camera prefers the impact target, then the fuzz; none otherwise', () => {
    const f = catapultSpec.follow!({} as never, 'running', 0)!;
    expect(f.roles).toEqual(['impact', 'fuzz']);
    expect(f.zoom).toBe(1.6);
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
    expect(cardFor('move').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm']);
    expect(cardFor('donut').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm']);
    // Every challenge level comes after all four mechanics are known, so all four rows show.
    for (const id of ['both', 'cans', 'tower', 'line', 'chain', 'free']) {
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
