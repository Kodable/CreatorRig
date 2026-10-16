// Covers the catapult course spec's wiring: `partTargets` (the bin tap's "part flies to the machine"
// animation), the in-scene widgets (the angle lever, the arm's slide knob, the "−" band badge), the
// SUPPLY BIN (2026-10-16), the goal cards (2026-10-16), the backyard backdrop (2026-10-16), the
// build view's frame and the result card.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { visibleBinItems } from '../../kit/bin';
import { gatedOptions, isKnown, knownConcepts } from '../../kit/concepts';
import { lookImageUrls } from '../../kit/looks';
import { PARALLAX } from '../../kit/parallax';
import { estimateBigTextWidth, layoutWidgets, MIN_TOUCH_PX } from '../../kit/widgetLayout';
import type { Goal, Widget } from '../../kit/types';
import {
  armSlideTrack,
  BAND_DROP_R,
  bandOffAt,
  catapultBin,
  catapultGoalCard,
  catapultSpec,
  CUP_DROP_R,
  FOCUS_ZOOM,
  SLIDE_UNDER_M,
} from './spec';
import { CATAPULT_BACKDROP, CATAPULT_EARTH, CATAPULT_GRASS, CATAPULT_SKY } from './backdrop';
import { ARM_LENGTHS, CATALOG, FUZZ, FUZZ_NAMES } from './core/catalog';
import {
  armAngleFor,
  armArtBox,
  armSlide,
  BAND_ASPECTS,
  BASE_ART,
  bandBundleAt,
  CAN_TEXTURE,
  cupAtRest,
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
import { findLevel, LEVELS } from './core/levels';
import type { Metrics, PlacedPart } from './core/types';

function catapultPart(x = 15, y = 0, armLen = '2'): PlacedPart {
  return { id: 1, kind: 'catapult', x, y, props: { bands: '2', angle: '45', fuzz: 'Fur', armLen } };
}

describe('catapultSpec.partTargets (a bin tile tapped flies to the machine)', () => {
  it('returns [] for a non-catapult part', () => {
    const shelf: PlacedPart = { id: 2, kind: 'shelf', x: 5, y: 0, props: { length: '2' } };
    expect(catapultSpec.partTargets!(shelf, 'bands', '2', {} as never)).toEqual([]);
  });

  it('returns [] for a code no bin tile sets (the angle and the arm are dragged on the machine)', () => {
    const part = catapultPart();
    for (const code of ['nonsense', 'angle', 'armLen']) expect(catapultSpec.partTargets!(part, code, '3', {} as never)).toEqual([]);
  });

  it('bands: one target on the band bundle for the NEW band count, inside the world', () => {
    const part = catapultPart(15, 0);
    for (const n of ['1', '2', '6', '30', '60']) {
      const preview: PlacedPart = { ...part, props: { ...part.props, bands: n } };
      const targets = catapultSpec.partTargets!(part, 'bands', n, {} as never);
      expect(targets).toEqual([{ at: bandBundleAt(preview), size: 0.6 }]);
      expect(targets[0]!.at.x).toBeGreaterThan(0);
      expect(targets[0]!.at.x).toBeLessThan(WORLD_W);
      expect(targets[0]!.at.y).toBeGreaterThan(0);
      expect(targets[0]!.at.y).toBeLessThan(WORLD_H);
    }
  });

  it('fuzz: the new fuzz flies into the cup, sized to the NEW fuzz\'s diameter x 1.5', () => {
    const part = catapultPart(15, 0);
    for (const name of FUZZ_NAMES) {
      const targets = catapultSpec.partTargets!(part, 'fuzz', name, {} as never);
      expect(targets).toHaveLength(1);
      expect(targets[0]!.at).toEqual(cupAtRest(part));
      expect(targets[0]!.size).toBeCloseTo(2 * FUZZ[name]!.r * 1.5, 6);
    }
  });
});

// 2026-10-16 (Jon's huddle 2026-10-15: "a classroom supply bin / toolbox you pull parts from instead
// of menu rows", "rubber bands unlimited like rover wheels"): the catapult's drawer is a supply bin.
describe('catapultSpec.bin: the supply bin', () => {
  /** The tiles the kit shows on a level: gated by `introduces`, stamped locked / NEW. */
  function shown(levelId: string): string[] {
    const level = findLevel(levelId)!;
    const part = level.parts.find((p) => p.kind === 'catapult')!;
    const items = visibleBinItems(catapultSpec.bin!(part, level.parts, level) ?? [], part, knownConcepts(LEVELS, level.id), gatedOptions(LEVELS), level.introduces ?? []);
    return items.map((it) => `${it.id}${it.locked ? '#' : ''}${it.active ? '*' : ''}`);
  }

  it('only the catapult has a bin: the targets and free-play parts keep their drawer rows (null)', () => {
    for (const kind of ['can', 'block', 'shelf', 'wall', 'bullseye'] as const) {
      expect(catapultSpec.bin!({ id: 2, kind, x: 5, y: 0, props: {} }, [], {} as never)).toBeNull();
    }
    expect(catapultSpec.bin).toBe(catapultBin);
  });

  it('a "Rubber bands" pile (one tile, +1 band, endless) and a "Fuzzes" group of the five, in that order', () => {
    const part = catapultPart(5.5, 0);
    const bin = catapultBin(part)!;
    expect(bin.map((it) => it.id)).toEqual(['band', ...FUZZ_NAMES.map((n) => `fuzz-${n}`)]);
    expect(bin[0]).toMatchObject({ image: 'ui/bin/band.svg', label: 'Rubber band', group: 'Rubber bands', code: 'bands', step: 1, badge: '∞' });
    expect(bin[0]!.value).toBeUndefined();
    expect(existsSync(resolve('public', bin[0]!.image))).toBe(true);
    for (const [i, name] of FUZZ_NAMES.entries()) {
      expect(bin[i + 1]).toMatchObject({ image: FUZZ[name]!.image, label: FUZZ[name]!.label, group: 'Fuzzes', code: 'fuzz', value: name });
    }
  });

  it('the loaded fuzz is the active tile ("in use"), exactly one', () => {
    for (const fuzz of FUZZ_NAMES) {
      const bin = catapultBin({ ...catapultPart(), props: { ...catapultPart().props, fuzz } })!;
      expect(bin.filter((it) => it.active).map((it) => it.id)).toEqual([`fuzz-${fuzz}`]);
    }
  });

  it('drop zones: a band on the band bundle, a fuzz in the cup, each finger-sized at the build zoom ' +
    '(>= 48 px across the radius) and apart from each other', () => {
    for (const armLen of ARM_LENGTHS) {
      const part = catapultPart(5.5, 0, armLen);
      const bin = catapultBin(part)!;
      expect(bin[0]!.drop).toEqual({ at: bandBundleAt(part), r: BAND_DROP_R });
      for (const it of bin.slice(1)) expect(it.drop).toEqual({ at: cupAtRest(part), r: CUP_DROP_R });
      for (const r of [BAND_DROP_R, CUP_DROP_R]) expect(r * 32 * FOCUS_ZOOM).toBeGreaterThanOrEqual(48);
      // The two zones' centres are farther apart than the bigger radius: a drop on one never lands
      // in the other's middle.
      const d = Math.hypot(bin[0]!.drop!.at.x - bin[1]!.drop!.at.x, bin[0]!.drop!.at.y - bin[1]!.drop!.at.y);
      expect(d, armLen).toBeGreaterThan(Math.max(BAND_DROP_R, CUP_DROP_R));
    }
  });

  it('each intro level shows what its lesson needs and nothing more (introduces + lockedProps)', () => {
    // Fling it: the band pile alone (no fuzzes before the weight level).
    expect(shown('power')).toEqual(['band']);
    // Over the wall: bands locked at 3 (the lesson is the lever), still no fuzzes.
    expect(shown('angle')).toEqual(['band#']);
    // Heavy or light: the four fuzzes (the Donut waits for its own level), bands locked.
    expect(shown('weight')).toEqual(['band#', 'fuzz-Flower', 'fuzz-Fur*', 'fuzz-Helmet', 'fuzz-Metal']);
    // Long arm: bands and fuzz locked (the lesson is the slide knob).
    expect(shown('arm')).toEqual(['band#', 'fuzz-Flower#', 'fuzz-Fur#*', 'fuzz-Helmet#', 'fuzz-Metal#']);
    // Three at once: the Donut joins, locked in.
    expect(shown('donut')).toContain('fuzz-Donut#*');
    // Free play: everything, nothing locked.
    expect(shown('free')).toEqual(['band', 'fuzz-Flower', 'fuzz-Donut', 'fuzz-Fur*', 'fuzz-Helmet', 'fuzz-Metal']);
  });
});

// Product direction 2026-09-22: the PULL ring is gone. 2026-10-15 (Gao): the in-scene FIRE tap
// button is gone too - FIRE is the bottom bar's yellow button. 2026-10-16: the arm's slide knob and
// the "−" band badge join the angle lever.
describe('catapultSpec.widgets', () => {
  const ids = (ws: Widget[]) => ws.map((w) => w.id);

  it('returns [] for a non-catapult part', () => {
    const shelf: PlacedPart = { id: 2, kind: 'shelf', x: 5, y: 0, props: { length: '2' } };
    expect(catapultSpec.widgets!(shelf, [], {} as never)).toEqual([]);
  });

  it('the angle dial, the arm slide and the "−" badge: no in-scene FIRE (no play action), no pull widget', () => {
    for (const arm of ARM_LENGTHS) {
      const widgets = catapultSpec.widgets!(catapultPart(15, 0, arm), [], {} as never);
      expect(ids(widgets)).toEqual(['angle', 'armLen', 'band-off']);
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
      const dir = armAngleFor(Number(opt.value));
      expect(dir).toBeGreaterThanOrEqual(angle.arcFrom - 1e-9);
      expect(dir).toBeLessThanOrEqual(angle.arcTo + 1e-9);
    }
  });

  it('arm (2026-10-16, Jon: "arm length fully customizable"): a live slide with code armLen over the ' +
    'catalog\'s 1.5 .. 4 m options, reading the length in its knob, its value the arm\'s length', () => {
    for (const arm of ARM_LENGTHS) {
      const slide = catapultSpec.widgets!(catapultPart(15, 0, arm), [], {} as never).find((w) => w.id === 'armLen')!;
      if (slide.kind !== 'slide') throw new Error('expected a slide widget');
      expect(slide.code).toBe('armLen');
      expect(slide.options).toEqual(CATALOG.catapult.descriptors.find((d) => d.code === 'armLen')!.options);
      expect(slide.options.map((o) => o.value)).toEqual([...ARM_LENGTHS]);
      expect(slide.value).toBe(arm);
      expect(slide.live).toBe(true);
      expect(slide.readout).toBe('knob');
    }
    // A legacy part (arm: 'Long', no armLen) reads 3 m.
    const legacy = catapultSpec.widgets!({ id: 1, kind: 'catapult', x: 5, y: 0, props: { arm: 'Long' } }, [], {} as never);
    expect(legacy.find((w) => w.id === 'armLen')).toMatchObject({ value: '3' });
  });

  it('arm: the slide\'s track is armSlide (the cup at 1.5 m and 4 m) moved SLIDE_UNDER_M square to the ' +
    'arm, downward: every option sits just under its own cup, the track parallel to the arm', () => {
    const part = catapultPart(5.5, 0);
    const track = armSlideTrack(part);
    const cups = armSlide(part);
    const slide = catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'armLen')!;
    if (slide.kind !== 'slide') throw new Error('expected a slide widget');
    expect(slide.from).toEqual(track.from);
    expect(slide.to).toEqual(track.to);
    for (const [end, cup] of [[track.from, cups.from], [track.to, cups.to]] as const) {
      expect(Math.hypot(end.x - cup.x, end.y - cup.y)).toBeCloseTo(SLIDE_UNDER_M, 9);
      expect(end.y).toBeLessThan(cup.y); // under the cup
      // square to the arm at rest
      expect((end.x - cup.x) * Math.cos(REST_ANGLE) + (end.y - cup.y) * Math.sin(REST_ANGLE)).toBeCloseTo(0, 9);
    }
    // option i under ARM_LENGTHS[i]'s cup
    const n = ARM_LENGTHS.length;
    ARM_LENGTHS.forEach((len, i) => {
      const at = { x: track.from.x + ((track.to.x - track.from.x) * i) / (n - 1), y: track.from.y + ((track.to.y - track.from.y) * i) / (n - 1) };
      const cup = cupAtRest({ ...part, props: { ...part.props, armLen: len } });
      expect(Math.hypot(at.x - cup.x, at.y - cup.y), len).toBeCloseTo(SLIDE_UNDER_M, 6);
    });
    // The knob (56 px at the build zoom) clears the ground band's bottom edge even at 4 m.
    expect(track.to.y - 28 / (32 * FOCUS_ZOOM)).toBeGreaterThan(-1.5);
  });

  it('the slide knob never sits on the angle knob, at any angle and arm length (drawn knobs apart)', () => {
    const knobR = 28 / (32 * FOCUS_ZOOM);
    for (const angle of ['15', '30', '45', '60', '75']) {
      for (const [i, len] of ARM_LENGTHS.entries()) {
        const part = { ...catapultPart(5.5, 0, len), props: { ...catapultPart().props, armLen: len, angle } };
        const t = armSlideTrack(part);
        const k = i / (ARM_LENGTHS.length - 1);
        const slideAt = { x: t.from.x + (t.to.x - t.from.x) * k, y: t.from.y + (t.to.y - t.from.y) * k };
        const dir = armAngleFor(Number(angle));
        const r = LEVER_LENGTH + 0.55;
        const angleAt = { x: part.x + PIVOT_DX + r * Math.cos(dir), y: part.y + PIVOT_DY + r * Math.sin(dir) };
        expect(Math.hypot(slideAt.x - angleAt.x, slideAt.y - angleAt.y), `${angle} ${len}`).toBeGreaterThan(2 * knobR);
      }
    }
  });

  it('"−" badge (2026-10-16): a mini tap under the band bundle that sets one band fewer through the ' +
    'normal prop path; hidden at 1 band and while the bands are locked', () => {
    const at = (bands: string, lockedProps?: string[]) => {
      const part: PlacedPart = { ...catapultPart(5.5, 0), props: { ...catapultPart().props, bands }, ...(lockedProps ? { lockedProps } : {}) };
      return { part, minus: catapultSpec.widgets!(part, [], {} as never).find((w) => w.id === 'band-off') };
    };
    for (const n of [2, 3, 12, 60]) {
      const { part, minus } = at(String(n));
      if (minus?.kind !== 'tap') throw new Error('expected a tap widget');
      expect(minus).toMatchObject({ code: 'bands', style: 'mini', icon: '−', values: [String(n - 1)] });
      expect(minus.action).toBeUndefined(); // 'setProp' (undo, locks, CoachContext.changed)
      expect(minus.at).toEqual(bandOffAt(part));
      // under the bundle, off the bands: below every band's lower end
      expect(minus.at.y).toBeLessThan(bandBundleAt(part).y - 0.6);
    }
    expect(at('1').minus).toBeUndefined();
    expect(at('4', ['bands']).minus).toBeUndefined();
    expect(at('4', ['angle']).minus).toBeDefined();
  });

  it('the kit drops every widget whose code is not introduced yet: Fling it shows none, the angle level ' +
    'only the lever, the arm level the lever and the slide', () => {
    const shownOn = (levelId: string) => {
      const level = findLevel(levelId)!;
      const part = level.parts.find((p) => p.kind === 'catapult')!;
      const known = knownConcepts(LEVELS, level.id);
      // The same filter BuilderApp.updateWidgets applies.
      return ids(catapultSpec.widgets!(part, level.parts, level).filter((w) => !w.code || isKnown(known, w.code)));
    };
    expect(shownOn('power')).toEqual([]); // 1 band: no "−" either
    expect(shownOn('angle')).toEqual(['angle']); // bands locked: no "−"
    expect(shownOn('weight')).toEqual(['angle']);
    expect(shownOn('arm')).toEqual(['angle', 'armLen']);
    expect(shownOn('free')).toEqual(['angle', 'armLen', 'band-off']);
    // Every widget carries a code, so none slips past the gate.
    for (const w of catapultSpec.widgets!(catapultPart(), [], {} as never)) expect(w.code).toBeDefined();
  });
});

// 2026-10-16 (Gao: "change to use goal cards like in roller coaster").
describe('catapultSpec.hud.goalCards', () => {
  const goal = (metric: string, op: Goal<Metrics>['op'], value: number, label = ''): Goal<Metrics> => ({ metric, op, value, label });

  it('the goals overlay is the row of cards; no card fills while building', () => {
    expect(catapultSpec.hud.goalsOverlay).toBe(true);
    expect(catapultSpec.hud.goalCards).toBe(catapultGoalCard);
    expect(catapultSpec.hud.goalCardEditMetrics).toEqual([]);
  });

  it('maps every goal metric to its picture, target number, unit and a short Title Case caption', () => {
    expect(catapultGoalCard(goal('knockedDown', '>=', 2))).toEqual({ icon: 'ui/goals/catapult-knocked.svg', number: '2', unit: '', caption: 'Knock Down', under: false });
    expect(catapultGoalCard(goal('hits', '>=', 1))).toEqual({ icon: 'ui/goals/catapult-hits.svg', number: '1', unit: '', caption: 'Bullseye', under: false });
    expect(catapultGoalCard(goal('hits', '>=', 2)).caption).toBe('Bullseyes');
    expect(catapultGoalCard(goal('smashed', '>=', 1))).toEqual({ icon: 'ui/goals/catapult-smash.svg', number: '1', unit: '', caption: 'Smash Crate', under: false });
    expect(catapultGoalCard(goal('smashed', '>=', 2)).caption).toBe('Smash Crates');
    expect(catapultGoalCard(goal('maxRange', '>=', 12.5))).toEqual({ icon: 'ui/goals/catapult-range.svg', number: '12.5', unit: 'm', caption: 'Distance', under: false });
    expect(catapultGoalCard(goal('maxRange', '>=', 20)).number).toBe('20');
    // "Use at most N shots": an under card.
    expect(catapultGoalCard(goal('shotsUsed', '<=', 2))).toEqual({ icon: 'ui/goals/catapult-shots.svg', number: '2', unit: '', caption: 'Shots', under: true });
    // "Nothing left above the line": a yes/no card, the picture alone.
    expect(catapultGoalCard(goal('aboveLine', '==', 0))).toEqual({ icon: 'ui/goals/catapult-line.svg', number: '', unit: '', caption: 'Clear the Line', check: true });
    expect(catapultGoalCard(goal('aboveLine', '<=', 1))).toMatchObject({ number: '1', under: true, caption: 'Above the Line' });
  });

  it('every real level goal has a card: its icon on disk, a Title Case caption short enough for the ' +
    '104 px card (<= 14 letters), no "×" unit (the Kodable font has no glyph for it)', () => {
    let n = 0;
    for (const level of LEVELS) {
      for (const g of level.goals) {
        const card = catapultGoalCard(g);
        n++;
        expect(existsSync(resolve('public', card.icon)), card.icon).toBe(true);
        expect(card.caption.length, card.caption).toBeLessThanOrEqual(14);
        for (const word of card.caption.split(' ')) if (!['the', 'a', 'and'].includes(word)) expect(word[0], card.caption).toBe(word[0]!.toUpperCase());
        expect(card.unit).not.toContain('×');
        if (!card.check) expect(card.number).toBe(String(g.value));
      }
    }
    expect(n).toBeGreaterThanOrEqual(14);
    expect(catapultGoalCard(findLevel('weight')!.goals[0]!)).toMatchObject({ number: '2', caption: 'Knock Down' });
    expect(catapultGoalCard(findLevel('line')!.goals[0]!)).toMatchObject({ check: true, caption: 'Clear the Line' });
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

  it('2026-10-16 (Jon\'s huddle 2026-10-15: "each game needs its own environment"): the backdrop is the ' +
    'catapult\'s own backyard (backdrop.ts), sky to fence, no coaster theme park and no ferris wheel', () => {
    const world = catapultSpec.world;
    expect(world.backgrounds).toBe(CATAPULT_BACKDROP);
    expect(world.sky).toEqual(CATAPULT_SKY);
    expect(world.groundStrip).toEqual({ top: CATAPULT_GRASS, bottom: CATAPULT_EARTH });
    const urls = world.backgrounds!.map((b) => b.url);
    expect(urls.every((u) => u.startsWith('bg/catapult/'))).toBe(true);
    expect(urls.some((u) => u.includes('coaster') || u.includes('wheel') || u.includes('park.jpg'))).toBe(false);
    expect(world.backgrounds!.some((b) => b.spin !== undefined || b.satellites !== undefined)).toBe(false);
    // every picture is on disk, under 1.5 MB
    for (const url of lookImageUrls(world)) {
      const file = resolve(__dirname, '../../../public', url);
      expect(existsSync(file), url).toBe(true);
      expect(statSync(file).size, url).toBeLessThan(1.5e6);
    }
    // The sky fills the whole 622 px viewport, so its vertical parallax never lifts its bottom edge
    // into view; back to front, nearer layers move more with the world.
    const sky = world.backgrounds![0]!;
    expect(sky.url).toBe('bg/catapult/sky.jpg');
    expect(sky.y - sky.h / 2).toBeCloseTo(-1.5 - 10 / 32, 9);
    expect(sky.y + sky.h / 2).toBeCloseTo(WORLD_H - 1.5, 9);
    expect(sky.parallax).toEqual(PARALLAX.sky);
    const xs = world.backgrounds!.map((b) => b.parallax?.x ?? 1);
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
  const zoom = FOCUS_ZOOM;
  const viewW = 960 / 32 / zoom;
  // The 612 px panel (WORLD_H * 32) plus the kit's 10 px earth margin.
  const viewH = (WORLD_H * 32 + 10) / 32 / zoom;
  // The open drawer covers the right 340 of the 960 px.
  const uncoveredW = viewW * (620 / 960);

  it('returns null for a non-catapult part', () => {
    const shelf: PlacedPart = { id: 2, kind: 'shelf', x: 5, y: 0, props: { length: '2' } };
    expect(catapultSpec.focusFrame!(shelf, {} as never)).toBeNull();
  });

  it('zoom 2.5 (2026-10-16: 3.6 until 2026-10-15, then 2.8; arms up to 4 m), the view\'s left edge 4.6 m ' +
    'left of the anchor', () => {
    const part = catapultPart(15, 0);
    const frame = catapultSpec.focusFrame!(part, {} as never)!;
    expect(frame.zoom).toBe(2.5);
    expect(frame.cx - viewW / 2).toBeCloseTo(part.x - 4.6, 9);
  });

  it('the ground line stays where it sat on screen: the anchor lands on stage y 627.8 (as at 3.6 in the ' +
    '490 px viewport and at 2.8), inside the kit\'s vertical clamp', () => {
    const part = catapultPart(15, 0);
    const frame = catapultSpec.focusFrame!(part, {} as never)!;
    const stageY = (viewTop: number, cy: number, z: number) => (viewTop + 700) / 2 + (cy - part.y) * 32 * z;
    expect(stageY(78, frame.cy, frame.zoom)).toBeCloseTo(stageY(210, part.y + 1.5, 3.6), 6);
    expect(stageY(78, frame.cy, frame.zoom)).toBeCloseTo(627.8, 6);
    expect(frame.cy).toBeGreaterThan(-1.5 + WORLD_H / frame.zoom / 2);
  });

  it('every catapult x a level uses, every arm length: the uncovered view (minus the open drawer) holds ' +
    'the whole machine (arm, cup and base pictures, whole boxes), the loaded Metal fuzz, the slide knob ' +
    'at every notch, the band drop zone, the "−" badge, the lever knob and pad at every angle and the ' +
    'snip spot; the view never leaves the world (the kit\'s clamp)', () => {
    const xs = [...new Set(LEVELS.map((l) => l.parts.find((p) => p.kind === 'catapult')!.x))];
    expect(xs).toContain(4.5);
    const knobR = 28 / (32 * zoom);
    const miniR = 17 / (32 * zoom);
    for (const x of xs) {
      for (const arm of ARM_LENGTHS) {
        const part = catapultPart(x, 0, arm);
        const frame = catapultSpec.focusFrame!(part, {} as never)!;
        const left = frame.cx - viewW / 2;
        expect(left, `${x}`).toBeGreaterThanOrEqual(-1e-9); // the kit's left clamp never moves it
        const inside = (p: { x: number; y: number }, what: string, margin: number) => {
          const tag = `${x} ${arm} ${what}`;
          expect(p.x, `${tag} x`).toBeGreaterThan(left + margin);
          expect(p.x, `${tag} x`).toBeLessThan(left + uncoveredW - margin);
          expect(p.y, `${tag} y`).toBeGreaterThan(frame.cy - viewH / 2 + margin);
          expect(p.y, `${tag} y`).toBeLessThan(frame.cy + viewH / 2 - margin);
        };
        const pivot = { x: part.x + PIVOT_DX, y: part.y + PIVOT_DY };
        const L = Number(arm);
        for (const p of boxCorners(pivot, REST_ANGLE, armArtBox(L))) inside(p, 'arm', 0);
        for (const p of boxCorners(pivot, REST_ANGLE, cupCoverBox(L))) inside(p, 'cup', 0);
        for (const p of boxCorners({ x: part.x, y: part.y + 0.3 }, 0, BASE_ART)) inside(p, 'base', 0.1);
        const pocket = cupAtRest({ ...part, props: { ...part.props, fuzz: 'Metal' } });
        for (const [dx, dy] of [[-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4]] as const) inside({ x: pocket.x + dx, y: pocket.y + dy }, 'fuzz', 0.1);
        // The slide knob at this length (and so at every notch: the track is straight).
        const track = armSlideTrack(part);
        for (const end of [track.from, track.to]) inside(end, 'slide', knobR);
        inside(bandBundleAt(part), 'band zone', 0.3);
        inside(bandOffAt(part), 'minus', miniR);
        for (const deg of [15, 30, 45, 60, 75]) {
          const dir = armAngleFor(deg);
          const r = LEVER_LENGTH + 0.55;
          inside({ x: pivot.x + r * Math.cos(dir), y: pivot.y + r * Math.sin(dir) }, `knob ${deg}`, knobR);
          const { pos, angle } = crossbarPoseFor({ ...part, props: { ...part.props, angle: String(deg) } });
          for (const p of boxCorners(pos, angle, LEVER_ART)) inside(p, `lever ${deg}`, 0.1);
        }
        inside(fireSpot(part), 'snip', 0.3);
        // The shot preview keeps its room: >= 1.4 m of open view right of the base before the
        // drawer, >= 3 m over the lever's pad.
        expect(left + uncoveredW - (part.x + BASE_ART.cx + BASE_ART.w / 2)).toBeGreaterThan(1.4);
        expect(frame.cy + viewH / 2 - (part.y + 3.38)).toBeGreaterThan(3);
      }
    }
  });

  it('the frame asks for the kit\'s left clamp itself (worldW / zoom / 2 = 6) for a catapult near the ' +
    'left wall, and follows the catapult\'s x elsewhere', () => {
    const near = catapultSpec.focusFrame!(catapultPart(3.5, 0), {} as never)!;
    expect(near.cx).toBeCloseTo(30 / 2.5 / 2, 9);
    expect(catapultSpec.focusFrame!(catapultPart(8, 0), {} as never)!.cx).toBeCloseTo(8 - 4.6 + 6, 9);
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

  it('textures: the machine\'s real-art pictures, an arm per length and every band length bandSprite can pick', () => {
    const tex = catapultSpec.textures!;
    for (const key of ['real-base', 'real-gear', 'real-cup', 'real-lever', 'real-hook']) {
      expect(tex[key]).toEqual({ url: `parts/catapult/${key}.png` });
    }
    // 2026-10-16: one arm picture per arm length; the old Short/Long arms (SVG and real) are gone.
    for (const len of ARM_LENGTHS) {
      expect(tex[`real-arm-${len}`]).toEqual({ url: `parts/catapult/real-arm-${len}.png` });
      expect(existsSync(resolve('public', tex[`real-arm-${len}`]!.url))).toBe(true);
    }
    for (const key of ['arm-Short', 'arm-Long', 'real-arm-Short', 'real-arm-Long']) expect(tex[key], key).toBeUndefined();
    expect(Object.keys(tex).some((k) => k.startsWith('power-'))).toBe(false);
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
    expect(card(donut.parts).rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm length']);
    const metal = donut.parts.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, fuzz: 'Metal' } } : p));
    expect(card(metal).rows).toContainEqual({ label: 'Fuzz', value: 'Metal' });
  });

  it('result card (2026-10-16): the band count and the arm length as set ("Rubber bands 14", "Arm length 2.5 m"), ' +
    'and a space shot says so in the fail tone', () => {
    const free = findLevel('free')!;
    const parts = free.parts.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, bands: '14', armLen: '2.5', angle: '60', fuzz: 'Helmet' } } : p));
    const m = catapultSpec.editMetrics(parts, free, null);
    const card = catapultSpec.resultCard!(parts, free, m, 'space', false)!;
    expect(card.rows).toEqual([
      { label: 'Rubber bands', value: '14' },
      { label: 'Angle', value: '60°' },
      { label: 'Fuzz', value: 'Helmet' },
      { label: 'Arm length', value: '2.5 m' },
    ]);
    expect(card.outcome).toBe('Into space! Too many bands.');
    expect(card.tone).toBe('fail');
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
    expect(cardFor('arm').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm length']);
    expect(cardFor('donut').rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm length']);
    // Every challenge level comes after all four mechanics are known, so all four rows show.
    for (const id of ['smash', 'tower', 'line', 'chain', 'free']) {
      expect(cardFor(id).rows.map((r) => r.label)).toEqual(['Rubber bands', 'Angle', 'Fuzz', 'Arm length']);
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
