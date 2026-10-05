// The rover course's coach (kit `CourseSpec.coach`, src/kit/types.ts): the one tap the child
// should do next on the five intro levels, as Bruno's words plus a pointing hand. Pure: no
// Phaser, no physics; the kit re-asks it every frame in edit mode (and in done mode for the win).
//
// Stakeholder direction (Jon, playtest review 2026-10-05; Gao agrees): "tap tutorials on the
// first levels: prompts pointing at the next action"; coins explained when they first matter;
// on the bumpy road "tap a wheel to change its mount". Level 1 walks every tap (BUILD, a Round
// wheel, another, DRIVE, Next); levels 2-5 stay quiet until the first run has shown the problem
// (Jon's tactile-variables rule: try first), then point at the one new thing that fixes it.
// Nothing after level 5: the challenges are the child's own.
import type { CoachContext, CoachStep, CoachTarget } from '../../kit/types';
import { LABELS, buildCost, isAttachment, isPower, isWeight, isWheel, mountOf } from './core/catalog';
import { thetaOf } from './core/geometry';
import type { PartKind, RoverPart, VehicleLevel } from './core/types';

/** The idle BUILD button's widget id (spec.ts `idleWidgets`). */
export const BUILD_WIDGET = 'build';
/** DRIVE lives in the bottom bar now (2026-10-05 playtest review, part 2: "Move the DRIVE button
 * back to the bottom, but center it"), not an in-scene widget; a coach step points at it via
 * `{ type: 'bar', button: 'play' }` (kit types.ts CoachTarget), same target whatever mode the
 * bar's Play button is showing ("▶ DRIVE" in edit mode, "▶ DRIVE again" in done mode). */
const DRIVE_TARGET: CoachTarget<PartKind> = { type: 'bar', button: 'play' };

export type RoverCoachContext = CoachContext<PartKind, VehicleLevel>;
export type RoverCoachStep = CoachStep<PartKind>;

const DEG = Math.PI / 180;

function step(id: string, text: string, target: CoachTarget<PartKind>): RoverCoachStep {
  return { id, text, target };
}

function selectedPart(ctx: RoverCoachContext): RoverPart | null {
  return ctx.selectedId === null ? null : (ctx.parts.find((p) => p.id === ctx.selectedId) ?? null);
}

/** A step whose target is a parts-shelf button. The shelf lives in the drawer, which is open
 * only while something is selected (BuilderHud: "it should hide until I click the rover"); with
 * nothing selected the same words point at BUILD first (id `<id>-build`), then the hand moves to
 * the shelf button once the drawer opens. */
function shelfStep(ctx: RoverCoachContext, id: string, text: string, kind: PartKind): RoverCoachStep {
  if (selectedPart(ctx)) return step(id, text, { type: 'shelf', kind });
  return step(`${id}-build`, text, { type: 'widget', id: BUILD_WIDGET });
}

// ---- level 1: wheels ------------------------------------------------------------------------

/** Every tap of the first build. Two Round wheels spend the whole 4-coin budget, so "out of
 * coins" lands exactly as the child finishes the coached build: the coins step is the DRIVE step
 * for that case (it still points at DRIVE), shown while the drawer is open because the coin counter
 * sits in the drawer header on shelf courses (BuilderHud hides the bottom-bar pill). */
function wheelsCoach(ctx: RoverCoachContext): RoverCoachStep | null {
  if (ctx.passed) return step('next', 'You did it! Tap Next level.', { type: 'bar', button: 'next' });
  if (ctx.mode !== 'edit') return null;
  const sel = selectedPart(ctx);
  const wheels = ctx.parts.filter((p) => isWheel(p.kind)).length;
  if (wheels < 2) {
    if (!sel) return step('build', 'Tap BUILD to open the parts!', { type: 'widget', id: BUILD_WIDGET });
    return wheels === 0
      ? step('wheel', 'Tap a Round wheel to add it.', { type: 'shelf', kind: 'wheelCircle' })
      : step('wheel2', 'One more wheel! Tap it again.', { type: 'shelf', kind: 'wheelCircle' });
  }
  if (ctx.runs > 0) return null;
  if (!sel) return step('drive', 'Tap DRIVE and watch it go!', DRIVE_TARGET);
  const budget = ctx.level.budget;
  if (budget !== undefined && buildCost(ctx.parts) >= budget) {
    return step('coins', 'Out of coins! Each part costs coins — see the coin counter. Now tap DRIVE!', DRIVE_TARGET);
  }
  return step('drive2', 'Now tap DRIVE!', DRIVE_TARGET);
}

// ---- levels 2-5: after the first run --------------------------------------------------------

/** Rock steps: round wheels trip; the star is the new part. */
function shapeCoach(ctx: RoverCoachContext): RoverCoachStep | null {
  if (ctx.parts.some((p) => p.kind === 'wheelStar')) return null;
  return shelfStep(ctx, 'star', 'Round wheels trip here. Try the NEW Star wheel!', 'wheelStar');
}

/** Bumpy road: stiff wheels bounce; a spring soaks it up. Done once any part is on a spring. */
function mountCoach(ctx: RoverCoachContext): RoverCoachStep | null {
  const wheels = ctx.parts.filter((p) => isWheel(p.kind));
  if (wheels.length === 0) return null;
  if (ctx.parts.some((p) => isAttachment(p.kind) && mountOf(p.props) === 'spring')) return null;
  const sel = selectedPart(ctx);
  if (sel && isWheel(sel.kind)) {
    return step('spring', 'Pick the Spring. It is bouncy (+1 coin).', { type: 'drawer', code: 'mount', value: 'spring' });
  }
  return step('tapwheel', 'Bumpy! Tap a wheel to change its mount.', { type: 'part', partId: wheels[0]!.id });
}

/** Boulder push: no weight yet -> the melon; a weight on top of the dome (45..135 degrees) ->
 * drag it to the front, where it rams. */
function weightCoach(ctx: RoverCoachContext): RoverCoachStep | null {
  const weights = ctx.parts.filter((p) => isWeight(p.kind));
  if (weights.length === 0) {
    return shelfStep(ctx, 'melon', 'The boulder is heavy. Add a Melon on the FRONT to ram it!', 'watermelon');
  }
  const rover = ctx.parts.find((p) => p.kind === 'rover');
  if (!rover) return null;
  const onTop = weights.find((w) => {
    const deg = thetaOf(w, rover) / DEG;
    return deg >= 45 - 1e-6 && deg <= 135 + 1e-6;
  });
  if (!onTop) return null;
  return step('front', `Drag the ${LABELS[onTop.kind].toLowerCase()} to the FRONT of the rover.`, { type: 'part', partId: onTop.id });
}

/** Crater rim: wheels slip; a fan on the back pushes. */
function powerCoach(ctx: RoverCoachContext): RoverCoachStep | null {
  if (ctx.parts.some((p) => isPower(p.kind))) return null;
  return shelfStep(ctx, 'fan', 'Too steep! Add a Fan on the BACK for a push.', 'fan');
}

const AFTER_FIRST_RUN: Record<string, (ctx: RoverCoachContext) => RoverCoachStep | null> = {
  shape: shapeCoach,
  mount: mountCoach,
  weight: weightCoach,
  power: powerCoach,
};

/** `CourseSpec.coach`: the next tap on levels 1-5, null everywhere else and once the child is
 * past the step. Play mode never coaches. */
export function roverCoach(ctx: RoverCoachContext): RoverCoachStep | null {
  if (ctx.mode === 'play') return null;
  if (ctx.level.id === 'wheels') return wheelsCoach(ctx);
  const after = AFTER_FIRST_RUN[ctx.level.id];
  if (!after || ctx.passed || ctx.mode !== 'edit' || ctx.runs < 1) return null;
  return after(ctx);
}
