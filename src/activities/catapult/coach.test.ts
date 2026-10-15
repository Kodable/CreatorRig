import { describe, expect, it } from 'vitest';
import { brunoVoiceProblems } from '../../core/brunoVoice';
import { gatedOptions, isKnown, isOptionKnown, knownConcepts } from '../../kit/concepts';
import type { Mode } from '../../kit/types';
import { ANGLE_DRAG_NOTCHES, ANGLE_WIDGET, catapultCoach, FIRE_TARGET, NEXT_TEXT, suggestedAngle, suggestedOption } from './coach';
import type { CatapultCoachContext, CatapultCoachStep } from './coach';
import { catapultSpec } from './spec';
import { LEVELS, findLevel } from './core/levels';

const INTRO = ['power', 'angle', 'weight', 'arm', 'move'];

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

/** The step's target is really there in that situation: the catapult part, the angle widget of
 * the selected catapult, a drawer row (and option) the child can see with the catapult selected,
 * a bar button. */
function expectTargetOnScreen(c: CatapultCoachContext, s: CatapultCoachStep): void {
  const sel = c.parts.find((p) => p.id === c.selectedId) ?? null;
  const known = knownConcepts(LEVELS, c.level.id);
  const t = s.target;
  if (t.type === 'part') {
    expect(c.parts.find((p) => p.id === t.partId)?.kind, s.id).toBe('catapult');
  } else if (t.type === 'widget' && !sel) {
    // Nothing selected: the BUILD pill over the catapult (spec.ts idleWidgets, 2026-10-15).
    expect(catapultSpec.idleWidgets!(c.parts, c.level).map((w) => w.id), s.id).toContain(t.id);
  } else if (t.type === 'widget') {
    expect(sel?.kind, s.id).toBe('catapult');
    const widgets = catapultSpec.widgets!(sel!, c.parts, c.level).filter((w) => !w.code || isKnown(known, w.code));
    expect(widgets.map((w) => w.id), s.id).toContain(t.id);
    if (s.gesture) {
      // A drag demonstration: the widget is a dial that has the target option, not already there.
      const w = widgets.find((ww) => ww.id === t.id)!;
      expect(w.kind, s.id).toBe('dial');
      if (w.kind === 'dial') {
        expect(w.options.map((o) => o.value), s.id).toContain(s.gesture.toValue);
        expect(s.gesture.toValue, s.id).not.toBe(w.value);
      }
    }
  } else if (t.type === 'drawer') {
    expect(sel?.kind, s.id).toBe('catapult');
    expect(isKnown(known, t.code), s.id).toBe(true);
    expect(sel!.lockedProps ?? [], s.id).not.toContain(t.code);
    if (t.value !== undefined) {
      expect(isOptionKnown(known, gatedOptions(LEVELS), t.code, t.value), s.id).toBe(true);
      expect(t.value, s.id).not.toBe(sel!.props[t.code]);
    }
  } else if (t.type === 'bar') {
    expect(['play', 'next'], s.id).toContain(t.button);
  } else {
    throw new Error(`unexpected target ${t.type}`);
  }
}

describe('catapultCoach: level 1 (power) walks every tap', () => {
  it('tap the catapult -> a power option (the next one up from Low) -> FIRE', () => {
    expect(coach('power')).toEqual({ id: 'tap', text: 'Tap BUILD to see the catapult parts.', target: { type: 'widget', id: 'build' } });
    expect(coach('power', { selected: true })).toEqual({
      id: 'power',
      text: 'More rubber bands means more power. Tap this one.',
      target: { type: 'drawer', code: 'power', value: 'Medium' },
    });
    expect(coach('power', { selected: true, changed: ['power'] })).toEqual({ id: 'fire', text: 'Now tap FIRE and watch it fly!', target: FIRE_TARGET });
    // FIRE is on the bar, so the step holds whether the drawer is still open or not.
    expect(coach('power', { changed: ['power'] })?.id).toBe('fire');
  });

  it('advances on the action and stays done: after a shot with the power picked, nothing until the pass, then Next level', () => {
    expect(coach('power', { changed: ['power'], runs: 1 })).toBeNull();
    expect(coach('power', { changed: ['power'], runs: 1, mode: 'done' })).toBeNull();
    expect(coach('power', { changed: ['power'], runs: 2, selected: true })).toBeNull();
    const next = { id: 'next', text: NEXT_TEXT, target: { type: 'bar', button: 'next' } };
    expect(coach('power', { changed: ['power'], runs: 1, mode: 'done', passed: true })).toEqual(next);
    expect(coach('power', { runs: 1, mode: 'done', passed: true })).toEqual(next);
  });

  it('a shot before picking a power: the power steps still show (the lesson); picked after that, no FIRE nag', () => {
    expect(coach('power', { runs: 1, mode: 'done' })?.id).toBe('tap');
    expect(coach('power', { runs: 1, mode: 'done', selected: true })?.id).toBe('power');
    expect(coach('power', { runs: 1, mode: 'done', changed: ['power'] })).toBeNull();
  });

  it('never during a shot', () => {
    expect(coach('power', { mode: 'play' })).toBeNull();
    expect(coach('power', { mode: 'play', changed: ['power'] })).toBeNull();
    expect(coach('power', { mode: 'play', passed: true, runs: 1 })).toBeNull();
  });
});

describe('catapultCoach: levels 2-5, one new thing each, then FIRE', () => {
  it('angle: tap the catapult -> drag the lever knob (the angle widget) -> FIRE', () => {
    expect(coach('angle')).toEqual({ id: 'tap', text: 'Tap BUILD. The catapult has a new lever.', target: { type: 'widget', id: 'build' } });
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
    expect(coach('angle', { selected: true, changed: ['power'] })?.id).toBe('angle');
    expect(coach('angle', { changed: ['angle'], runs: 1, mode: 'done', passed: true })).toBeNull();
  });

  it('weight: tap -> a heavier fuzz (Fur after Flower: the Donut is still locked) -> FIRE', () => {
    expect(coach('weight')?.text).toBe('Tap BUILD to pick a fuzz.');
    expect(coach('weight', { selected: true })).toEqual({
      id: 'fuzz',
      text: "Let's try a heavier fuzz. Tap this one.",
      target: { type: 'drawer', code: 'fuzz', value: 'Fur' },
    });
    expect(coach('weight', { selected: true, changed: ['fuzz'] })?.id).toBe('fire');
    expect(coach('weight', { changed: ['fuzz'], runs: 1 })).toBeNull();
  });

  it('arm: tap -> the Long arm -> FIRE', () => {
    expect(coach('arm')?.text).toBe('Tap BUILD to look at the arm.');
    expect(coach('arm', { selected: true })).toEqual({
      id: 'arm',
      text: 'A longer arm flings farther. Tap it.',
      target: { type: 'drawer', code: 'arm', value: 'Long' },
    });
    expect(coach('arm', { changed: ['arm'] })?.id).toBe('fire');
  });

  it('move: drag the catapult (the hand on it, selected or not) -> FIRE', () => {
    const drag = { id: 'move', text: "Let's roll closer. Drag the catapult toward the wall.", target: { type: 'part', partId: 1 } };
    expect(coach('move')).toEqual(drag);
    expect(coach('move', { selected: true })).toEqual(drag);
    expect(coach('move', { selected: true, changed: ['angle'] })).toEqual(drag);
    expect(coach('move', { changed: ['move'] })).toEqual({ id: 'fire', text: 'Now tap FIRE.', target: FIRE_TARGET });
    expect(coach('move', { changed: ['move', 'angle'], runs: 1 })).toBeNull();
  });

  it('the suggested option is the next one up, or the one below at the top', () => {
    const level = findLevel('power')!;
    const part = { ...level.parts[0]!, props: { ...level.parts[0]!.props } };
    expect(suggestedOption(level, { ...part, props: { ...part.props, power: 'High' } }, 'power')).toBe('Max');
    expect(suggestedOption(level, { ...part, props: { ...part.props, power: 'Max' } }, 'power')).toBe('High');
    const weight = findLevel('weight')!;
    const wp = weight.parts[0]!;
    expect(suggestedOption(weight, { ...wp, props: { ...wp.props, fuzz: 'Metal' } }, 'fuzz')).toBe('Helmet');
    expect(suggestedOption(weight, { ...wp, props: { ...wp.props, fuzz: 'Fur' } }, 'fuzz')).toBe('Helmet');
  });
});

describe('catapultCoach: the angle step drags, every other step taps', () => {
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

  it('no other step on any intro level carries a gesture (the plain tap)', () => {
    for (const id of INTRO) {
      for (const changed of [[], ['power'], ['fuzz'], ['arm'], ['move'], ['angle']]) {
        for (const selected of [false, true]) {
          const s = coach(id, { selected, changed });
          if (s && s.id !== 'angle') expect(s.gesture, `${id} ${s.id}`).toBeUndefined();
        }
      }
    }
  });
});

describe('catapultCoach: scope', () => {
  function situations(levelId: string): CatapultCoachContext[] {
    const out: CatapultCoachContext[] = [];
    for (const changed of [[], ['power'], ['angle'], ['fuzz'], ['arm'], ['move'], ['power', 'angle', 'fuzz', 'arm', 'move']]) {
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
    expect(LEVELS.slice(0, 5).map((l) => l.id)).toEqual(INTRO);
    for (const level of LEVELS.slice(5)) {
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
    expect([...ids].sort()).toEqual(['angle', 'arm', 'fire', 'fuzz', 'move', 'next', 'power', 'tap'].sort());
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
    expect(walk('power')).toEqual(['tap', 'power', 'fire']);
    expect(walk('angle')).toEqual(['tap', 'angle', 'fire']);
    expect(walk('weight')).toEqual(['tap', 'fuzz', 'fire']);
    expect(walk('arm')).toEqual(['tap', 'arm', 'fire']);
    expect(walk('move')).toEqual(['move', 'fire']);
  });
});
