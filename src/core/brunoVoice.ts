// Bruno's voice rules that a test can check (Bruno voice audit, 2026-10-12). Bruno is calm, steady
// and "not a floof of many words", so every line he says must:
//  - stay short: about 128 characters, two lines of his dialog box (src/ui/brunoDialog.ts; until
//    2026-10-12 the top-bar bubble, which clamped at 2 lines of 15 px text);
//  - use at most one "!" (steady delight, not hype);
//  - use no ALL-CAPS emphasis words. Button names the child taps (DRIVE, BUILD, FIRE) are fine.
// Units like m/s and g are lowercase, so they never trip the caps rule.

export const BRUNO_MAX_CHARS = 128;

/** Words in capitals that name an on-screen button, not emphasis. */
const BUTTON_WORDS = new Set(['DRIVE', 'BUILD', 'FIRE']);

/** The rules this line breaks, in words (empty when the line is fine). */
export function brunoVoiceProblems(line: string): string[] {
  const problems: string[] = [];
  if (line.length > BRUNO_MAX_CHARS) problems.push(`${line.length} characters (max ${BRUNO_MAX_CHARS})`);
  const bangs = (line.match(/!/g) ?? []).length;
  if (bangs > 1) problems.push(`${bangs} exclamation marks (max 1)`);
  const caps = (line.match(/\b[A-Z]{2,}\b/g) ?? []).filter((w) => !BUTTON_WORDS.has(w));
  if (caps.length > 0) problems.push(`all-caps emphasis: ${caps.join(', ')}`);
  return problems;
}
