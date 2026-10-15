// The catapult course's coach (kit `CourseSpec.coach`, src/kit/types.ts): the one thing the child
// should do next on the five intro levels, as Bruno's words (the quick line) plus the pointing
// glove. Pure: no Phaser, no physics; the kit re-asks it every frame in edit/tune mode (and in done
// mode for the win), and only once Bruno's lesson intro has closed.
//
// Gao, 2026-10-15: "add a tutorial sequence to catapult", modelled on the rover's (vehicle/
// coach.ts). Each intro level walks its one new thing: tap the catapult (its drawer opens), use
// the new control (a power, the angle lever, a fuzz, an arm; on the move level, drag the
// catapult itself), then tap FIRE in the bottom bar. A step advances on the action
// (`CoachContext.changed`: the kit records each prop code the child sets and 'move' once a part
// was dragged) and stays done: once the new control was used and a shot has gone (`runs`), the
// child is on their own for the rest of that level load. A fresh load starts over. Level 1 also
// points at Next level after the pass, as the rover's level 1 does. Nothing on the Donut level
// (its new thing, the split, is locked in and needs no tap) or on the challenges.
import type { CoachContext, CoachStep, CoachTarget } from '../../kit/types';
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
/** The BUILD pill over the catapult while nothing is selected (spec.ts `idleWidgets`). */
export const BUILD_WIDGET = 'build';

/** What each intro level teaches: a drawer row (the hand on one of its options), the angle lever
 * (the hand on its knob), or dragging the catapult. */
type Lesson =
  | { kind: 'drawer'; code: 'power' | 'fuzz' | 'arm'; tap: string; pick: string }
  | { kind: 'lever'; tap: string; drag: string }
  | { kind: 'move'; drag: string };

const LESSONS: Record<string, Lesson> = {
  power: {
    kind: 'drawer',
    code: 'power',
    tap: 'Tap BUILD to see the catapult parts.',
    pick: 'More rubber bands means more power. Tap this one.',
  },
  angle: { kind: 'lever', tap: 'Tap BUILD. The catapult has a new lever.', drag: 'Drag the lever knob to aim higher.' },
  weight: {
    kind: 'drawer',
    code: 'fuzz',
    tap: 'Tap BUILD to pick a fuzz.',
    pick: "Let's try a heavier fuzz. Tap this one.",
  },
  arm: {
    kind: 'drawer',
    code: 'arm',
    tap: 'Tap BUILD to look at the arm.',
    pick: 'A longer arm flings farther. Tap it.',
  },
  move: { kind: 'move', drag: "Let's roll closer. Drag the catapult toward the wall." },
};

/** The FIRE step's words: the first level names what FIRE does, later ones just ask. */
const FIRE_TEXT: Record<string, string> = { power: 'Now tap FIRE and watch it fly!' };
const FIRE_AGAIN = 'Now tap FIRE.';
export const NEXT_TEXT = 'You did it! Tap Next level.';

const GATED = gatedOptions(LEVELS);

function step(id: string, text: string, target: CoachTarget<PartKind>): CatapultCoachStep {
  return { id, text, target };
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
  const action = lesson.kind === 'drawer' ? lesson.code : lesson.kind === 'lever' ? 'angle' : 'move';

  if (!changed.includes(action)) {
    if (lesson.kind === 'move') return step('move', lesson.drag, { type: 'part', partId: catapult.id });
    // 2026-10-15: the glove taps the BUILD pill over the catapult (spec.ts idleWidgets), as on the
    // rover; a tap on the machine itself still opens the drawer and moves the coach on.
    if (ctx.selectedId !== catapult.id) return step('tap', lesson.tap, { type: 'widget', id: BUILD_WIDGET });
    if (lesson.kind === 'lever') return step('angle', lesson.drag, { type: 'widget', id: ANGLE_WIDGET });
    const value = suggestedOption(ctx.level, catapult, lesson.code);
    return step(lesson.code, lesson.pick, value ? { type: 'drawer', code: lesson.code, value } : { type: 'drawer', code: lesson.code });
  }
  // The new control is used: FIRE, unless a shot already went (then the child knows FIRE).
  if (ctx.runs === 0) return step('fire', FIRE_TEXT[ctx.level.id] ?? FIRE_AGAIN, FIRE_TARGET);
  return null;
}
