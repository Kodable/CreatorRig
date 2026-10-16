// The catapult course's coach (kit `CourseSpec.coach`, src/kit/types.ts): the one thing the child
// should do next on the four intro levels, as Bruno's words (the quick line) plus the pointing
// glove. Pure: no Phaser, no physics; the kit re-asks it every frame in edit/tune mode (and in done
// mode for the win), and only once Bruno's lesson intro has closed.
//
// Gao, 2026-10-15: "add a tutorial sequence to catapult", modelled on the rover's (vehicle/
// coach.ts). Each intro level walks its one new thing: tap the catapult (its drawer opens), use
// the new control, then tap FIRE in the bottom bar. 2026-10-16 (Jon's huddle 2026-10-15: building
// the catapult must feel tactile): the new controls are built by hand, so the glove demonstrates
// them - it stretches a rubber band from the arm's hook to the lever's hook (power; later on
// 2026-10-16, Gao: "drag the rubber band from one arm to the other to install it"; it carried a band
// tile from the supply bin until then), drags the angle knob up the arc (angle), carries the Flower
// from the bin into the cup (weight) and slides the arm knob out to 3 m (arm). A step advances on
// the action (`CoachContext.changed`: the kit records each prop code the child sets, from a bin
// tile, a widget or the "−" badge) and stays
// done: once the new control was used and a shot has gone (`runs`), the child is on their own for
// the rest of that level load. A fresh load starts over. Level 1 also points at Next level after
// the pass, as the rover's level 1 does. Nothing on the Donut level (its new thing, the split, is
// locked in and needs no tap), on Smash it (the crates' level: Bruno's line and the hints teach it,
// and picking a fuzz is already known) or on the challenges.
import type { CoachContext, CoachGesture, CoachStep, CoachTarget } from '../../kit/types';
import { gatedOptions, isOptionKnown, knownConcepts } from '../../kit/concepts';
import { CATALOG, bandCount } from './core/catalog';
import { LEVELS } from './core/levels';
import type { CatapultLevel, PartKind, PlacedPart } from './core/types';

export type CatapultCoachContext = CoachContext<PartKind, CatapultLevel>;
export type CatapultCoachStep = CoachStep<PartKind>;

/** The bottom bar's yellow button: FIRE in edit mode and between shots (spec.ts `hud.lines`). */
export const FIRE_TARGET: CoachTarget<PartKind> = { type: 'bar', button: 'play' };
/** The angle lever's drag handle (spec.ts `catapultWidgets`). */
export const ANGLE_WIDGET = 'angle';
/** The arm's slide knob (spec.ts `catapultWidgets`). */
export const ARM_WIDGET = 'armLen';
/** The rubber band stretched from the arm's hook to the lever's hook (spec.ts `catapultWidgets`). */
export const BAND_WIDGET = 'band-on';
/** A fuzz's tile in the supply bin (spec.ts `catapultBin`). */
export function fuzzItem(name: string): string {
  return `fuzz-${name}`;
}

/** What each intro level teaches: a rubber band stretched on, a fuzz tile carried from the bin
 * into the cup, the angle lever's knob or the arm's slide knob dragged (to `option` when the lesson
 * names one, else the next notch up the child can see). */
type Lesson =
  | { kind: 'band'; tap: string; stretch: string }
  | { kind: 'fuzz'; tap: string; drop: string; option: string }
  | { kind: 'lever'; tap: string; drag: string }
  | { kind: 'slide'; tap: string; drag: string; option: string };

const LESSONS: Record<string, Lesson> = {
  // Fling it starts on 1 band and exactly 2 pass: one band stretched on is the whole lesson.
  power: {
    kind: 'band',
    tap: 'Tap the catapult to build it.',
    stretch: 'Drag a rubber band from one arm to the other to hook it on.',
  },
  angle: { kind: 'lever', tap: 'Tap the catapult. It has a new lever.', drag: 'Drag the lever knob to aim higher.' },
  // The energy rule (2026-10-15): the weight level is two targets, a near block for the heavy Metal
  // and a far can only the light Flower reaches. The glove carries the Flower, the new idea (a
  // light fuzz flies farther); the hints carry the heavy half.
  weight: {
    kind: 'fuzz',
    tap: 'Tap the catapult to see the fuzzes in the bin.',
    drop: 'A light fuzz flies farther. Drag the Flower from the bin into the cup.',
    option: 'Flower',
  },
  // 2026-10-16: the arm is a length (1.5 .. 4 m) on a slide knob; every length from 2.75 m reaches
  // the bullseye, so the glove slides it to 3 m (the old Long arm).
  arm: {
    kind: 'slide',
    tap: 'Tap the catapult to look at its arm.',
    drag: 'A longer arm flings farther. Slide the arm knob out.',
    option: '3',
  },
};

/** The prop code each lesson's action sets. */
const ACTION: Record<Lesson['kind'], string> = { band: 'bands', fuzz: 'fuzz', lever: 'angle', slide: 'armLen' };

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
 * the child can see on this level (a heavier fuzz, a longer arm; options a later level unlocks are
 * skipped), or the one below when the current is already the last. */
export function suggestedOption(level: CatapultLevel, part: PlacedPart, code: string): string | null {
  const known = knownConcepts(LEVELS, level.id);
  const options = (CATALOG.catapult.descriptors.find((d) => d.code === code)?.options ?? [])
    .map((o) => o.value)
    .filter((v) => isOptionKnown(known, GATED, code, v));
  const i = options.indexOf(part.props[code] ?? '');
  return options[i + 1] ?? options[i - 1] ?? null;
}

/** The lesson's named option, unless the catapult has it already (then the next one over). */
function lessonOption(level: CatapultLevel, part: PlacedPart, code: string, option: string): string | null {
  return option !== part.props[code] ? option : suggestedOption(level, part, code);
}

/** `CourseSpec.coach`: the next step on the four intro levels, null everywhere else, during a
 * shot, once the level's lesson is done, and once a failed level is out of shots. */
export function catapultCoach(ctx: CatapultCoachContext): CatapultCoachStep | null {
  if (ctx.mode === 'play') return null;
  const lesson = LESSONS[ctx.level.id];
  if (!lesson) return null;
  if (ctx.passed) return ctx.level.id === 'power' ? step('next', NEXT_TEXT, { type: 'bar', button: 'next' }) : null;
  // Out of shots and not passed (2026-10-16): the level is over, the red goal card and Bruno's line
  // say so, and only Reset helps; the glove asking for the lesson's control again would be noise.
  if (ctx.mode === 'done' && ctx.level.shots > 0 && ctx.runs >= ctx.level.shots) return null;
  const catapult = catapultOf(ctx);
  if (!catapult) return null;
  const changed = ctx.changed ?? [];
  const action = ACTION[lesson.kind];

  if (!changed.includes(action)) {
    // The glove taps the catapult itself (the BUILD pill tried on 2026-10-15 is gone).
    if (ctx.selectedId !== catapult.id) return step('tap', lesson.tap, { type: 'part', partId: catapult.id });
    switch (lesson.kind) {
      case 'band':
        // The glove stretches a band from the arm's hook to the lever's hook (kit `CoachGesture`
        // 'drag' on a stretch widget: `toValue` is the band it adds, the widget's own value).
        return step('bands', lesson.stretch, { type: 'widget', id: BAND_WIDGET }, { kind: 'drag', toValue: String(bandCount(catapult.props) + 1) });
      case 'fuzz': {
        const value = lessonOption(ctx.level, catapult, 'fuzz', lesson.option);
        if (!value) return null;
        return step('fuzz', lesson.drop, { type: 'bin', itemId: fuzzItem(value) }, { kind: 'drop' });
      }
      case 'lever': {
        // The glove drags the knob along the lever's arc, not a tap.
        const to = suggestedAngle(catapult);
        return step('angle', lesson.drag, { type: 'widget', id: ANGLE_WIDGET }, to ? { kind: 'drag', toValue: to } : undefined);
      }
      case 'slide': {
        // The glove slides the arm's knob out along its track.
        const to = lessonOption(ctx.level, catapult, 'armLen', lesson.option);
        return step('armLen', lesson.drag, { type: 'widget', id: ARM_WIDGET }, to ? { kind: 'drag', toValue: to } : undefined);
      }
    }
  }
  // The new control is used: FIRE, unless a shot already went (then the child knows FIRE).
  if (ctx.runs === 0) return step('fire', FIRE_TEXT[ctx.level.id] ?? FIRE_AGAIN, FIRE_TARGET);
  return null;
}
