// The catapult course's coach (kit `CourseSpec.coach`, src/kit/types.ts): the one thing the child
// should do next on the four intro levels, as Bruno's words (the quick line) plus the pointing
// glove. Pure: no Phaser, no physics; the kit re-asks it every frame in edit/tune mode (and in done
// mode for the win), and only once Bruno's lesson intro has closed.
//
// Gao, 2026-10-15: "add a tutorial sequence to catapult", modelled on the rover's (vehicle/
// coach.ts). Each intro level walks its one new thing: tap the catapult (its drawer opens), use
// the new control (a power, the angle lever, a fuzz, an arm), then tap FIRE in the bottom bar. (The
// move level, dragging the catapult, was removed the same day.) A step advances on the action
// (`CoachContext.changed`: the kit records each prop code the child sets and 'move' once a part
// was dragged) and stays done: once the new control was used and a shot has gone (`runs`), the
// child is on their own for the rest of that level load. A fresh load starts over. Level 1 also
// points at Next level after the pass, as the rover's level 1 does. Nothing on the Donut level
// (its new thing, the split, is locked in and needs no tap) or on the challenges.
import type { CoachContext, CoachGesture, CoachStep, CoachTarget } from '../../kit/types';
import { gatedOptions, isOptionKnown, knownConcepts } from '../../kit/concepts';
import { CATALOG } from './core/catalog';
import { LEVELS } from './core/levels';
import type { CatapultLevel, PartKind, PlacedPart } from './core/types';

export type CatapultCoachContext = CoachContext<PartKind, CatapultLevel>;
export type CatapultCoachStep = CoachStep<PartKind>;

/** The bottom bar's yellow button: FIRE in edit mode and between shots (spec.ts `hud.lines`). */
export const FIRE_TARGET: CoachTarget<PartKind> = { type: 'bar', button: 'play' };
/** The angle lever's drag handle (spec.ts `catapultWidgets`). */
export const ANGLE_WIDGET = 'angle';

/** What each intro level teaches: a drawer row (the hand on one of its options), the angle lever
 * (the hand drags its knob up the arc, 2026-10-15). */
type Lesson =
  | { kind: 'drawer'; code: 'power' | 'fuzz' | 'arm'; tap: string; pick: string }
  | { kind: 'lever'; tap: string; drag: string };

const LESSONS: Record<string, Lesson> = {
  power: {
    kind: 'drawer',
    code: 'power',
    tap: 'Tap the catapult to see its parts.',
    pick: 'More rubber bands means more power. Tap this one.',
  },
  angle: { kind: 'lever', tap: 'Tap the catapult. It has a new lever.', drag: 'Drag the lever knob to aim higher.' },
  weight: {
    kind: 'drawer',
    code: 'fuzz',
    tap: 'Tap the catapult to pick a fuzz.',
    pick: "Let's try a heavier fuzz. Tap this one.",
  },
  arm: {
    kind: 'drawer',
    code: 'arm',
    tap: 'Tap the catapult to look at its arm.',
    pick: 'A longer arm flings farther. Tap it.',
  },
};

/** The FIRE step's words: the first level names what FIRE does, later ones just ask. */
const FIRE_TEXT: Record<string, string> = { power: 'Now tap FIRE and watch it fly!' };
const FIRE_AGAIN = 'Now tap FIRE.';
export const NEXT_TEXT = 'You did it! Tap Next level.';

const GATED = gatedOptions(LEVELS);

function step(id: string, text: string, target: CoachTarget<PartKind>, gesture?: CoachGesture): CatapultCoachStep {
  return gesture ? { id, text, target, gesture } : { id, text, target };
}

/** How many notches up the angle step's drag demonstration goes: two (30 degrees, 30 -> 60 on the
 * angle level). */
export const ANGLE_DRAG_NOTCHES = 2;

/** Where the angle step's glove drags the lever knob to (2026-10-15, Gao: "add a drag tutorial on
 * level 2"): ANGLE_DRAG_NOTCHES options up from the current angle (aim higher), stopping at the
 * top; from the top itself, that many down so the glove still shows a drag. */
export function suggestedAngle(part: PlacedPart): string | null {
  const options = (CATALOG.catapult.descriptors.find((d) => d.code === 'angle')?.options ?? []).map((o) => o.value);
  const i = options.indexOf(part.props.angle ?? '');
  if (i === -1 || options.length < 2) return null;
  const up = Math.min(options.length - 1, i + ANGLE_DRAG_NOTCHES);
  return options[up !== i ? up : Math.max(0, i - ANGLE_DRAG_NOTCHES)] ?? null;
}

function catapultOf(ctx: CatapultCoachContext): PlacedPart | undefined {
  return ctx.parts.find((p) => p.kind === 'catapult');
}

/** The option the glove suggests for `code`: the next one up from the current value among those
 * the child can see on this level (more bands, a heavier fuzz, the long arm; options a later level
 * unlocks are skipped), or the one below when the current is already the last. */
export function suggestedOption(level: CatapultLevel, part: PlacedPart, code: string): string | null {
  const known = knownConcepts(LEVELS, level.id);
  const options = (CATALOG.catapult.descriptors.find((d) => d.code === code)?.options ?? [])
    .map((o) => o.value)
    .filter((v) => isOptionKnown(known, GATED, code, v));
  const i = options.indexOf(part.props[code] ?? '');
  return options[i + 1] ?? options[i - 1] ?? null;
}

/** `CourseSpec.coach`: the next step on the five intro levels, null everywhere else, during a
 * shot, and once the level's lesson is done. */
export function catapultCoach(ctx: CatapultCoachContext): CatapultCoachStep | null {
  if (ctx.mode === 'play') return null;
  const lesson = LESSONS[ctx.level.id];
  if (!lesson) return null;
  if (ctx.passed) return ctx.level.id === 'power' ? step('next', NEXT_TEXT, { type: 'bar', button: 'next' }) : null;
  const catapult = catapultOf(ctx);
  if (!catapult) return null;
  const changed = ctx.changed ?? [];
  const action = lesson.kind === 'drawer' ? lesson.code : 'angle';

  if (!changed.includes(action)) {
    // The glove taps the catapult itself (the BUILD pill tried on 2026-10-15 is gone).
    if (ctx.selectedId !== catapult.id) return step('tap', lesson.tap, { type: 'part', partId: catapult.id });
    if (lesson.kind === 'lever') {
      // The glove drags the knob along the lever's arc (kit `CoachGesture`), not a tap.
      const to = suggestedAngle(catapult);
      return step('angle', lesson.drag, { type: 'widget', id: ANGLE_WIDGET }, to ? { kind: 'drag', toValue: to } : undefined);
    }
    const value = suggestedOption(ctx.level, catapult, lesson.code);
    return step(lesson.code, lesson.pick, value ? { type: 'drawer', code: lesson.code, value } : { type: 'drawer', code: lesson.code });
  }
  // The new control is used: FIRE, unless a shot already went (then the child knows FIRE).
  if (ctx.runs === 0) return step('fire', FIRE_TEXT[ctx.level.id] ?? FIRE_AGAIN, FIRE_TARGET);
  return null;
}
