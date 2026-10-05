import { describe, expect, it } from 'vitest';
import { BUILD_WIDGET, roverCoach } from './coach';
import type { RoverCoachContext, RoverCoachStep } from './coach';
import { vehicleSpec } from './spec';
import { buildCost } from './core/catalog';
import { normalizeRoverParts, rimPoint } from './core/geometry';
import { LEVELS, findLevel } from './core/levels';
import type { AttachmentKind, RoverPart, VehicleLevel } from './core/types';
import type { Mode } from '../../kit/types';

const DEG = Math.PI / 180;
type Stick = [AttachmentKind, number, ('cup' | 'spring')?];

/** The level's parts plus `sticks` (ids 20, 21, ...), normalized as the app does. */
function partsOn(level: VehicleLevel, sticks: Stick[]): RoverPart[] {
  const dome = level.parts.find((p) => p.kind === 'rover')!;
  return normalizeRoverParts(
    [
      ...level.parts,
      ...sticks.map(([kind, deg, mount], i) => {
        const p = rimPoint(deg * DEG);
        return { id: 20 + i, kind, x: dome.x + p.x, y: dome.y + p.y, props: { mount: mount ?? 'cup' } };
      }),
    ],
    level.terrain,
  );
}

interface Opts {
  /** 'rover', a stick index, or null (nothing selected, the default). */
  selected?: 'rover' | number | null;
  mode?: Mode;
  passed?: boolean;
  runs?: number;
}

function ctxFor(levelId: string, sticks: Stick[], opts: Opts = {}): RoverCoachContext {
  const level = findLevel(levelId)!;
  const parts = partsOn(level, sticks);
  const sel = opts.selected ?? null;
  const selectedId = sel === null ? null : sel === 'rover' ? parts.find((p) => p.kind === 'rover')!.id : 20 + sel;
  return { level, parts, selectedId, mode: opts.mode ?? 'edit', passed: opts.passed ?? false, runs: opts.runs ?? 0 };
}

function coach(levelId: string, sticks: Stick[], opts: Opts = {}): RoverCoachStep | null {
  return roverCoach(ctxFor(levelId, sticks, opts));
}

/** The step's target is really on screen in that situation: a widget id among the widgets the
 * kit shows (idle ones with nothing selected, else the selected part's), a shelf kind in the
 * palette with the drawer open (something selected), a part that exists. */
function expectTargetOnScreen(c: RoverCoachContext, s: RoverCoachStep): void {
  const sel = c.parts.find((p) => p.id === c.selectedId) ?? null;
  const t = s.target;
  if (t.type === 'widget') {
    const widgets = sel ? vehicleSpec.widgets!(sel, c.parts, c.level) : vehicleSpec.idleWidgets!(c.parts, c.level);
    expect(widgets.map((w) => w.id), s.id).toContain(t.id);
  } else if (t.type === 'shelf') {
    expect(sel, s.id).not.toBeNull();
    expect(c.level.palette, s.id).toContain(t.kind);
  } else if (t.type === 'part') {
    expect(c.parts.some((p) => p.id === t.partId), s.id).toBe(true);
  } else if (t.type === 'drawer') {
    expect(sel, s.id).not.toBeNull();
    expect(vehicleSpec.catalog[sel!.kind].descriptors.map((d) => d.code), s.id).toContain(t.code);
  }
}

const ROUND2: Stick[] = [['wheelCircle', -45], ['wheelCircle', -135]];
const SQUARE2: Stick[] = [['wheelSquare', -45], ['wheelSquare', -135]];

describe('roverCoach: level 1 (wheels) walks every tap', () => {
  it('no wheel: BUILD with nothing selected, then a Round wheel on the shelf once the drawer is open', () => {
    expect(coach('wheels', [])).toEqual({ id: 'build', text: 'Tap BUILD to open the parts!', target: { type: 'widget', id: BUILD_WIDGET } });
    expect(coach('wheels', [], { selected: 'rover' })).toEqual({ id: 'wheel', text: 'Tap a Round wheel to add it.', target: { type: 'shelf', kind: 'wheelCircle' } });
  });

  it('one wheel: one more from the shelf (the drawer open), or BUILD again if the child closed it', () => {
    const one: Stick[] = [['wheelCircle', -45]];
    const wheel2 = { id: 'wheel2', text: 'One more wheel! Tap it again.', target: { type: 'shelf', kind: 'wheelCircle' } };
    expect(coach('wheels', one, { selected: 0 })).toEqual(wheel2);
    expect(coach('wheels', one, { selected: 'rover' })).toEqual(wheel2);
    expect(coach('wheels', one)?.id).toBe('build');
  });

  it('two wheels, before the first run: DRIVE (the idle one, or the selected part\'s "Now tap DRIVE!")', () => {
    expect(coach('wheels', SQUARE2)).toEqual({ id: 'drive', text: 'Tap DRIVE and watch it go!', target: { type: 'bar', button: 'play' } });
    expect(coach('wheels', SQUARE2, { selected: 1 })).toEqual({ id: 'drive2', text: 'Now tap DRIVE!', target: { type: 'bar', button: 'play' } });
    expect(coach('wheels', SQUARE2, { selected: 'rover' })?.id).toBe('drive2');
    expect(coach('wheels', ROUND2)?.id).toBe('drive');
  });

  it('coins: two Round wheels spend the whole budget; with the drawer (and its 🪙 counter) open the step says so and still points at DRIVE', () => {
    const level = findLevel('wheels')!;
    expect(buildCost(partsOn(level, ROUND2))).toBe(level.budget);
    const s = coach('wheels', ROUND2, { selected: 1 })!;
    expect(s.id).toBe('coins');
    expect(s.text).toContain('Out of coins! Each part costs coins — see the 🪙 counter.');
    expect(s.target).toEqual({ type: 'bar', button: 'play' });
    // Four square wheels spend it too.
    const four: Stick[] = [['wheelSquare', -45], ['wheelSquare', -135], ['wheelSquare', -90], ['wheelSquare', -20]];
    expect(coach('wheels', four, { selected: 'rover' })?.id).toBe('coins');
    expect(coach('wheels', four)?.id).toBe('drive');
  });

  it('after a run the child is on their own until the pass; then Next level', () => {
    expect(coach('wheels', ROUND2, { runs: 1 })).toBeNull();
    expect(coach('wheels', ROUND2, { runs: 1, mode: 'done' })).toBeNull();
    const next = { id: 'next', text: 'You did it! Tap Next level.', target: { type: 'bar', button: 'next' } };
    expect(coach('wheels', ROUND2, { runs: 1, mode: 'done', passed: true })).toEqual(next);
    expect(coach('wheels', ROUND2, { runs: 1, mode: 'edit', passed: true })).toEqual(next);
  });

  it('never in play mode', () => {
    for (const sticks of [[], ROUND2]) expect(coach('wheels', sticks, { mode: 'play' })).toBeNull();
    expect(coach('wheels', ROUND2, { mode: 'play', passed: true, runs: 1 })).toBeNull();
  });
});

describe('roverCoach: levels 2-5 wait for the first run, then point at the one new thing', () => {
  it('shape: round wheels tripped -> the NEW Star wheel (BUILD first while the drawer is closed)', () => {
    expect(coach('shape', ROUND2)).toBeNull();
    const text = 'Round wheels trip here. Try the NEW Star wheel!';
    expect(coach('shape', ROUND2, { runs: 1 })).toEqual({ id: 'star-build', text, target: { type: 'widget', id: BUILD_WIDGET } });
    expect(coach('shape', ROUND2, { runs: 1, selected: 'rover' })).toEqual({ id: 'star', text, target: { type: 'shelf', kind: 'wheelStar' } });
    expect(coach('shape', ROUND2, { runs: 1, selected: 0 })?.id).toBe('star');
    expect(coach('shape', [['wheelStar', -45], ['wheelCircle', -135]], { runs: 1 })).toBeNull();
    expect(coach('shape', ROUND2, { runs: 1, passed: true })).toBeNull();
    expect(coach('shape', ROUND2, { runs: 1, mode: 'done' })).toBeNull();
  });

  it('mount: bumpy -> tap a wheel (the hand on the first wheel), then the Spring in the drawer', () => {
    expect(coach('mount', ROUND2)).toBeNull();
    const tap = { id: 'tapwheel', text: 'Bumpy! Tap a wheel to change its mount.', target: { type: 'part', partId: 20 } };
    expect(coach('mount', ROUND2, { runs: 1 })).toEqual(tap);
    expect(coach('mount', ROUND2, { runs: 1, selected: 'rover' })).toEqual(tap);
    expect(coach('mount', ROUND2, { runs: 1, selected: 1 })).toEqual({
      id: 'spring',
      text: 'Pick the Spring. It is bouncy (+1 coin).',
      target: { type: 'drawer', code: 'mount', value: 'spring' },
    });
    expect(coach('mount', [['wheelCircle', -45, 'spring'], ['wheelCircle', -135]], { runs: 1, selected: 1 })).toBeNull();
    expect(coach('mount', [], { runs: 1 })).toBeNull();
  });

  it('weight: no weight -> a Melon on the FRONT; a weight on top (45..135 degrees) -> drag it to the front', () => {
    expect(coach('weight', ROUND2)).toBeNull();
    const text = 'The boulder is heavy. Add a Melon on the FRONT to ram it!';
    expect(coach('weight', ROUND2, { runs: 1 })).toEqual({ id: 'melon-build', text, target: { type: 'widget', id: BUILD_WIDGET } });
    expect(coach('weight', ROUND2, { runs: 1, selected: 'rover' })).toEqual({ id: 'melon', text, target: { type: 'shelf', kind: 'watermelon' } });
    expect(coach('weight', [...ROUND2, ['watermelon', 90]], { runs: 1 })).toEqual({
      id: 'front',
      text: 'Drag the melon to the FRONT of the rover.',
      target: { type: 'part', partId: 22 },
    });
    expect(coach('weight', [...ROUND2, ['beans', 45]], { runs: 1 })?.text).toBe('Drag the beans to the FRONT of the rover.');
    expect(coach('weight', [...ROUND2, ['feather', 135]], { runs: 1 })?.id).toBe('front');
    for (const deg of [0, 40, 140, 180]) expect(coach('weight', [...ROUND2, ['watermelon', deg]], { runs: 1 }), `${deg}`).toBeNull();
    expect(coach('weight', [...ROUND2, ['watermelon', 90]], { runs: 1, passed: true })).toBeNull();
  });

  it('power: too steep -> a Fan on the BACK', () => {
    expect(coach('power', ROUND2)).toBeNull();
    const text = 'Too steep! Add a Fan on the BACK for a push.';
    expect(coach('power', ROUND2, { runs: 2 })).toEqual({ id: 'fan-build', text, target: { type: 'widget', id: BUILD_WIDGET } });
    expect(coach('power', ROUND2, { runs: 2, selected: 0 })).toEqual({ id: 'fan', text, target: { type: 'shelf', kind: 'fan' } });
    expect(coach('power', [...ROUND2, ['stove', 180]], { runs: 1 })).toBeNull();
    expect(coach('power', [...ROUND2, ['jet', 90]], { runs: 1 })).toBeNull();
  });
});

describe('roverCoach: scope', () => {
  /** A spread of situations on every level: builds, selections, modes, runs, passes. */
  function situations(levelId: string): RoverCoachContext[] {
    const out: RoverCoachContext[] = [];
    const builds: Stick[][] = [[], [['wheelCircle', -45]], ROUND2, SQUARE2, [...ROUND2, ['watermelon', 90]], [...ROUND2, ['fan', 180]]];
    for (const sticks of builds) {
      for (const selected of [null, 'rover', ...sticks.map((_, i) => i)] as Opts['selected'][]) {
        for (const mode of ['edit', 'done', 'play'] as Mode[]) {
          for (const runs of [0, 1, 3]) {
            for (const passed of [false, true]) {
              if (passed && runs === 0) continue;
              out.push(ctxFor(levelId, sticks, { selected, mode, runs, passed }));
            }
          }
        }
      }
    }
    return out;
  }

  it('no step after the fifth level', () => {
    for (const level of LEVELS.slice(5)) {
      for (const c of situations(level.id)) expect(roverCoach(c), level.id).toBeNull();
    }
  });

  it('every step on levels 1-5 points at something on screen; coin talk only in the coins step (and the spring +1 price)', () => {
    const ids = new Set<string>();
    for (const level of LEVELS.slice(0, 5)) {
      for (const c of situations(level.id)) {
        const s = roverCoach(c);
        if (!s) continue;
        ids.add(s.id);
        expectTargetOnScreen(c, s);
        if (/coin/i.test(s.text)) expect(['coins', 'spring'], s.text).toContain(s.id);
      }
    }
    expect([...ids].sort()).toEqual(
      ['build', 'wheel', 'wheel2', 'drive', 'drive2', 'coins', 'next', 'star', 'star-build', 'tapwheel', 'spring', 'melon', 'melon-build', 'front', 'fan', 'fan-build'].sort(),
    );
  });
});
