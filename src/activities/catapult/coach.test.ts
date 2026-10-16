import { describe, expect, it } from 'vitest';
import { brunoVoiceProblems } from '../../core/brunoVoice';
import { visibleBinItems } from '../../kit/bin';
import { gatedOptions, isKnown, isOptionKnown, knownConcepts } from '../../kit/concepts';
import type { Mode } from '../../kit/types';
import {
  ANGLE_DRAG_NOTCHES,
  ANGLE_WIDGET,
  ARM_WIDGET,
  BAND_WIDGET,
  catapultCoach,
  FIRE_TARGET,
  fuzzItem,
  NEXT_TEXT,
  suggestedAngle,
  suggestedOption,
} from './coach';
import type { CatapultCoachContext, CatapultCoachStep } from './coach';
import { catapultSpec } from './spec';
import { LEVELS, findLevel } from './core/levels';

const INTRO = ['power', 'angle', 'weight', 'arm'];

interface Opts {
  selected?: boolean;
  mode?: Mode;
  passed?: boolean;
  runs?: number;
  changed?: string[];
}

function ctxFor(levelId: string, opts: Opts = {}): CatapultCoachContext {
  const level = findLevel(levelId)!;
  const parts = level.parts.map((p) => ({ ...p, props: { ...p.props } }));
  const catapult = parts.find((p) => p.kind === 'catapult')!;
  return {
    level,
    parts,
    selectedId: opts.selected ? catapult.id : null,
    mode: opts.mode ?? 'edit',
    passed: opts.passed ?? false,
    runs: opts.runs ?? 0,
    changed: opts.changed ?? [],
  };
}

function coach(levelId: string, opts: Opts = {}): CatapultCoachStep | null {
  return catapultCoach(ctxFor(levelId, opts));
}

/** The step's target is really there in that situation: the catapult part, a widget of the selected
 * catapult the kit shows (a drag only to an option it has, not the current one), a bin tile the kit
 * shows for the selected catapult (not padlocked, not already in use), a bar button. */
function expectTargetOnScreen(c: CatapultCoachContext, s: CatapultCoachStep): void {
  const sel = c.parts.find((p) => p.id === c.selectedId) ?? null;
  const known = knownConcepts(LEVELS, c.level.id);
  const t = s.target;
  if (t.type === 'part') {
    expect(c.parts.find((p) => p.id === t.partId)?.kind, s.id).toBe('catapult');
    expect(s.gesture, s.id).toBeUndefined();
  } else if (t.type === 'widget') {
    expect(sel?.kind, s.id).toBe('catapult');
    const widgets = catapultSpec.widgets!(sel!, c.parts, c.level).filter((w) => !w.code || isKnown(known, w.code));
    expect(widgets.map((w) => w.id), s.id).toContain(t.id);
    const w = widgets.find((ww) => ww.id === t.id)!;
    expect(sel!.lockedProps ?? [], s.id).not.toContain(w.code);
    if (s.gesture) {
      // A drag demonstration: the widget is a dial or a slide that has the target option, not
      // already there, or a stretch whose value (the band it adds) is the target.
      expect(s.gesture.kind, s.id).toBe('drag');
      if (s.gesture.kind !== 'drag') return;
      expect(['dial', 'slide', 'stretch'], s.id).toContain(w.kind);
      if (w.kind === 'dial' || w.kind === 'slide') {
        expect(w.options.map((o) => o.value), s.id).toContain(s.gesture.toValue);
        expect(s.gesture.toValue, s.id).not.toBe(w.value);
      } else if (w.kind === 'stretch') {
        expect(s.gesture.toValue, s.id).toBe(w.value);
      }
    }
  } else if (t.type === 'bin') {
    expect(sel?.kind, s.id).toBe('catapult');
    const items = visibleBinItems(catapultSpec.bin!(sel!, c.parts, c.level) ?? [], sel!, known, gatedOptions(LEVELS), c.level.introduces ?? []);
    const item = items.find((it) => it.id === t.itemId);
    expect(item, `${s.id} ${t.itemId}`).toBeDefined();
    expect(item!.locked, s.id).toBe(false);
    expect(item!.active ?? false, s.id).toBe(false);
    expect(item!.drop, s.id).toBeDefined();
    expect(s.gesture, s.id).toEqual({ kind: 'drop' });
  } else if (t.type === 'bar') {
    expect(['play', 'next'], s.id).toContain(t.button);
    expect(s.gesture, s.id).toBeUndefined();
  } else {
    throw new Error(`unexpected target ${t.type}`);
  }
}

describe('catapultCoach: level 1 (power) walks every tap', () => {
  it('tap the catapult -> stretch a rubber band from one arm to the other (2026-10-16) -> FIRE', () => {
    expect(coach('power')).toEqual({ id: 'tap', text: 'Tap the catapult to build it.', target: { type: 'part', partId: 1 } });
    // 2026-10-16 (Gao: "drag the rubber band from one arm to the other to install it"): the glove
    // stretches a band across the hooks; Fling it starts on 1 band, so the band it adds is the 2nd.
    expect(coach('power', { selected: true })).toEqual({
      id: 'bands',
      text: 'Drag a rubber band from one arm to the other to hook it on.',
      target: { type: 'widget', id: BAND_WIDGET },
      gesture: { kind: 'drag', toValue: '2' },
    });
    // The demonstration follows the widget's value (the band it would add).
    const c = ctxFor('power', { selected: true });
    c.parts = c.parts.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, bands: '4' } } : p));
    expect(catapultCoach(c)?.gesture).toEqual({ kind: 'drag', toValue: '5' });
    const band = catapultSpec.widgets!(c.parts[0]!, c.parts, c.level).find((w) => w.id === BAND_WIDGET);
    expect(band).toMatchObject({ kind: 'stretch', value: '5' });
    expect(coach('power', { selected: true, changed: ['bands'] })).toEqual({ id: 'fire', text: 'Now tap FIRE and watch it fly!', target: FIRE_TARGET });
    // FIRE is on the bar, so the step holds whether the drawer is still open or not.
    expect(coach('power', { changed: ['bands'] })?.id).toBe('fire');
  });

  it('advances on the action and stays done: after a shot with the bands picked, nothing until the pass, then Next level', () => {
    expect(coach('power', { changed: ['bands'], runs: 1 })).toBeNull();
    expect(coach('power', { changed: ['bands'], runs: 1, mode: 'done' })).toBeNull();
    expect(coach('power', { changed: ['bands'], runs: 2, selected: true })).toBeNull();
    const next = { id: 'next', text: NEXT_TEXT, target: { type: 'bar', button: 'next' } };
    expect(coach('power', { changed: ['bands'], runs: 1, mode: 'done', passed: true })).toEqual(next);
    expect(coach('power', { runs: 1, mode: 'done', passed: true })).toEqual(next);
  });

  it('a shot before picking the bands: the band steps still show (the lesson); picked after that, no FIRE nag', () => {
    expect(coach('power', { runs: 1, mode: 'done' })?.id).toBe('tap');
    expect(coach('power', { runs: 1, mode: 'done', selected: true })?.id).toBe('bands');
    expect(coach('power', { runs: 1, mode: 'done', changed: ['bands'] })).toBeNull();
  });

  it('goes quiet once a failed level is out of shots (2026-10-16): only Reset helps then', () => {
    const shots = findLevel('arm')!.shots;
    expect(shots).toBeGreaterThan(0);
    expect(coach('arm', { runs: shots - 1, mode: 'done' })?.id).toBe('tap');
    expect(coach('arm', { runs: shots, mode: 'done' })).toBeNull();
    expect(coach('arm', { runs: shots, mode: 'done', selected: true })).toBeNull();
  });

  it('never during a shot', () => {
    expect(coach('power', { mode: 'play' })).toBeNull();
    expect(coach('power', { mode: 'play', changed: ['bands'] })).toBeNull();
    expect(coach('power', { mode: 'play', passed: true, runs: 1 })).toBeNull();
  });
});

describe('catapultCoach: levels 2-5, one new thing each, then FIRE', () => {
  it('angle: tap the catapult -> drag the lever knob (the angle widget) -> FIRE', () => {
    expect(coach('angle')).toEqual({ id: 'tap', text: 'Tap the catapult. It has a new lever.', target: { type: 'part', partId: 1 } });
    // 2026-10-15 (Gao: "add a drag tutorial on level 2"): the glove DRAGS the knob from 30 to 60.
    expect(coach('angle', { selected: true })).toEqual({
      id: 'angle',
      text: 'Drag the lever knob to aim higher.',
      target: { type: 'widget', id: ANGLE_WIDGET },
      gesture: { kind: 'drag', toValue: '60' },
    });
    expect(coach('angle', { selected: true, changed: ['angle'] })).toEqual({ id: 'fire', text: 'Now tap FIRE.', target: FIRE_TARGET });
    expect(coach('angle', { changed: ['angle'], runs: 1 })).toBeNull();
    // Another prop does not count as the lesson.
    expect(coach('angle', { selected: true, changed: ['bands'] })?.id).toBe('angle');
    expect(coach('angle', { changed: ['angle'], runs: 1, mode: 'done', passed: true })).toBeNull();
  });

  it('weight: tap -> carry the light Flower from the bin into the cup (the energy rule: a light fuzz flies ' +
    'farther, to the far can) -> FIRE', () => {
    expect(coach('weight')?.text).toBe('Tap the catapult to see the fuzzes in the bin.');
    expect(coach('weight', { selected: true })).toEqual({
      id: 'fuzz',
      text: 'A light fuzz flies farther. Drag the Flower from the bin into the cup.',
      target: { type: 'bin', itemId: fuzzItem('Flower') },
      gesture: { kind: 'drop' },
    });
    expect(coach('weight', { selected: true, changed: ['fuzz'] })?.id).toBe('fire');
    expect(coach('weight', { changed: ['fuzz'], runs: 1 })).toBeNull();
    // Already on the Flower without the lesson done (a reload mid-level): the next fuzz up.
    const c = ctxFor('weight', { selected: true });
    c.parts = c.parts.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, fuzz: 'Flower' } } : p));
    expect(catapultCoach(c)?.target).toEqual({ type: 'bin', itemId: fuzzItem('Fur') });
  });

  it('arm: tap -> slide the arm knob out to 3 m (the old Long; 2026-10-16 the arm is a length on a slide) -> FIRE', () => {
    expect(coach('arm')?.text).toBe('Tap the catapult to look at its arm.');
    expect(coach('arm', { selected: true })).toEqual({
      id: 'armLen',
      text: 'A longer arm flings farther. Slide the arm knob out.',
      target: { type: 'widget', id: ARM_WIDGET },
      gesture: { kind: 'drag', toValue: '3' },
    });
    expect(coach('arm', { changed: ['armLen'] })?.id).toBe('fire');
    // 3 m passes the level (every length from 2.75 m reaches the bullseye, core/levels.ts).
    const arm = findLevel('arm')!;
    expect(arm.parts.find((p) => p.kind === 'catapult')!.props.armLen).toBe('2');
    expect(arm.solution?.find((p) => p.kind === 'catapult')!.props.armLen).toBe('3');
  });


  it('the suggested option is the next one up, or the one below at the top', () => {
    const level = findLevel('power')!;
    const part = { ...level.parts[0]!, props: { ...level.parts[0]!.props } };
    expect(suggestedOption(level, { ...part, props: { ...part.props, bands: '3' } }, 'bands')).toBe('4');
    expect(suggestedOption(level, { ...part, props: { ...part.props, bands: '60' } }, 'bands')).toBe('59');
    const weight = findLevel('weight')!;
    const wp = weight.parts[0]!;
    expect(suggestedOption(weight, { ...wp, props: { ...wp.props, fuzz: 'Metal' } }, 'fuzz')).toBe('Helmet');
    expect(suggestedOption(weight, { ...wp, props: { ...wp.props, fuzz: 'Fur' } }, 'fuzz')).toBe('Helmet');
  });
});

describe('catapultCoach: the band, angle and arm steps drag, the fuzz step drops from the bin, the rest tap', () => {
  it('suggestedAngle: two notches (30 degrees) up, capped at 75; from 75 two down', () => {
    expect(ANGLE_DRAG_NOTCHES).toBe(2);
    const part = findLevel('angle')!.parts.find((p) => p.kind === 'catapult')!;
    const at = (angle: string) => suggestedAngle({ ...part, props: { ...part.props, angle } });
    expect(at('15')).toBe('45');
    expect(at('30')).toBe('60');
    expect(at('45')).toBe('75');
    expect(at('60')).toBe('75');
    expect(at('75')).toBe('45');
    expect(at('nope')).toBeNull();
  });

  it('the angle step follows the knob: a drag to two notches over the current angle', () => {
    const c = ctxFor('angle', { selected: true });
    c.parts = c.parts.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, angle: '45' } } : p));
    expect(catapultCoach(c)?.gesture).toEqual({ kind: 'drag', toValue: '75' });
  });

  it('each step\'s gesture: drag on the band, angle and arm steps, drop on the fuzz step, none on tap / FIRE / Next', () => {
    const want: Record<string, string | undefined> = { angle: 'drag', armLen: 'drag', bands: 'drag', fuzz: 'drop', tap: undefined, fire: undefined, next: undefined };
    for (const id of INTRO) {
      for (const changed of [[], ['bands'], ['fuzz'], ['armLen'], ['move'], ['angle']]) {
        for (const selected of [false, true]) {
          const s = coach(id, { selected, changed });
          if (s) expect(s.gesture?.kind, `${id} ${s.id}`).toBe(want[s.id]);
        }
      }
    }
  });

  it('the band line says to stretch it from arm to arm, the fuzz line names the bin; no line sends kids to the ' +
    'bin for a band', () => {
    expect(coach('power', { selected: true })!.text).toContain('from one arm to the other');
    expect(coach('weight', { selected: true })!.text).toContain('from the bin');
    expect(coach('power')!.text).not.toContain('bin');
  });
});

describe('catapultCoach: scope', () => {
  function situations(levelId: string): CatapultCoachContext[] {
    const out: CatapultCoachContext[] = [];
    for (const changed of [[], ['bands'], ['angle'], ['fuzz'], ['armLen'], ['move'], ['bands', 'angle', 'fuzz', 'armLen', 'move']]) {
      for (const selected of [false, true]) {
        for (const mode of ['edit', 'done', 'play'] as Mode[]) {
          for (const runs of [0, 1, 3]) {
            for (const passed of [false, true]) {
              if ((passed || mode === 'done') && runs === 0) continue;
              out.push(ctxFor(levelId, { changed, selected, mode, runs, passed }));
            }
          }
        }
      }
    }
    return out;
  }

  it('no step on the Donut level or any challenge level', () => {
    expect(LEVELS.slice(0, 4).map((l) => l.id)).toEqual(INTRO);
    for (const level of LEVELS.slice(4)) {
      for (const c of situations(level.id)) expect(catapultCoach(c), level.id).toBeNull();
    }
  });

  it('every step on the intro levels points at something on screen and keeps Bruno voice rules', () => {
    const ids = new Set<string>();
    for (const id of INTRO) {
      for (const c of situations(id)) {
        const s = catapultCoach(c);
        if (!s) continue;
        ids.add(s.id);
        expectTargetOnScreen(c, s);
        expect(brunoVoiceProblems(s.text), s.text).toEqual([]);
        expect(s.text.length, s.text).toBeLessThanOrEqual(100);
      }
    }
    expect([...ids].sort()).toEqual(['angle', 'armLen', 'fire', 'fuzz', 'next', 'bands', 'tap'].sort());
  });

  it('a step sequence per level, driven by the child doing each step', () => {
    /** Plays the level's tutorial: does what each step asks until the coach goes quiet. */
    function walk(levelId: string): string[] {
      const seen: string[] = [];
      const o: Required<Opts> = { selected: false, mode: 'edit', passed: false, runs: 0, changed: [] };
      for (let i = 0; i < 10; i++) {
        const s = coach(levelId, o);
        if (!s) break;
        seen.push(s.id);
        if (s.id === 'tap') o.selected = true;
        else if (s.id === 'fire') {
          o.runs++;
          o.mode = 'done';
        } else if (s.id === 'next') break;
        else o.changed = [...o.changed, s.id];
      }
      return seen;
    }
    expect(walk('power')).toEqual(['tap', 'bands', 'fire']);
    expect(walk('angle')).toEqual(['tap', 'angle', 'fire']);
    expect(walk('weight')).toEqual(['tap', 'fuzz', 'fire']);
    expect(walk('arm')).toEqual(['tap', 'armLen', 'fire']);
  });
});
