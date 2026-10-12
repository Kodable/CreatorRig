// Every line Bruno says in the three park courses (coaster, catapult, rover) keeps his voice:
// fits the 2-line bubble, at most one "!", no all-caps emphasis (src/core/brunoVoice.ts). The
// rover coach's steps are checked in vehicle/coach.test.ts, where the coach contexts live.
import { describe, expect, it } from 'vitest';
import { brunoVoiceProblems } from '../core/brunoVoice';
import { COASTER_LINES, LEVELS as COASTER_LEVELS } from '../core/levels';
import { LEVELS as CATAPULT_LEVELS } from './catapult/core/levels';
import { catapultSpec } from './catapult/spec';
import { LEVELS as ROVER_LEVELS } from './vehicle/core/levels';
import { vehicleSpec } from './vehicle/spec';

/** Course `hud.lines` keys that are button labels, not Bruno talking. */
const BUTTON_KEYS = new Set(['launch', 'playAgain', 'reset']);

function hudLines(lines: Record<string, string | undefined>): string[] {
  return Object.entries(lines)
    .filter(([key, text]) => !BUTTON_KEYS.has(key) && text !== undefined)
    .map(([, text]) => text!);
}

const COURSES: Record<string, string[]> = {
  coaster: [
    ...COASTER_LEVELS.flatMap((l) => [l.bruno, l.hints.rolledBack, l.hints.stuck, l.hints.fell]),
    ...Object.values(COASTER_LINES),
  ],
  catapult: [
    ...CATAPULT_LEVELS.flatMap((l) => [l.bruno, ...l.hints, ...Object.values(l.failHints)]),
    ...hudLines(catapultSpec.hud.lines),
  ],
  rover: [
    ...ROVER_LEVELS.flatMap((l) => [l.bruno, ...l.hints, ...Object.values(l.failHints)]),
    ...hudLines(vehicleSpec.hud.lines),
  ],
};

describe("Bruno's voice in the park courses", () => {
  for (const [course, lines] of Object.entries(COURSES)) {
    it(`${course}: every line fits the bubble, has at most one "!" and no all-caps emphasis`, () => {
      expect(lines.length).toBeGreaterThan(10);
      const bad = lines
        .filter((line): line is string => typeof line === 'string')
        .map((line) => ({ line, problems: brunoVoiceProblems(line) }))
        .filter((r) => r.problems.length > 0);
      expect(bad).toEqual([]);
    });
  }

  it('the checker catches each rule', () => {
    expect(brunoVoiceProblems('Tap DRIVE and watch it go!')).toEqual([]);
    expect(brunoVoiceProblems('Reach 15 m/s, but stay under 4 g.')).toEqual([]);
    expect(brunoVoiceProblems('Wheee! Go fuzz, go!')).toHaveLength(1);
    expect(brunoVoiceProblems('This hill is SO steep.')).toHaveLength(1);
    expect(brunoVoiceProblems('x'.repeat(129))).toHaveLength(1);
  });
});
