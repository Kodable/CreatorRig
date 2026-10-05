// Pure helpers for `Level.introduces` (no Phaser, no BuilderApp): which property codes a child
// has met by a given level, in `CourseSpec.levels` order. See types.ts for the full rule.

/** The minimal shape `knownConcepts` needs; every `Level<K, M, O>` satisfies it structurally. */
export interface ConceptLevel {
  id: string;
  introduces?: string[];
}

/** The concept codes known by (and including) the level `levelId`, in `levels` order: the union
 * of every earlier level's `introduces` plus its own. `null` when no level in the list sets
 * `introduces` at all (a course that never uses the feature: everything is known, today's
 * behaviour). A `levelId` not found in `levels` accumulates the whole list (nothing to stop at). */
export function knownConcepts(levels: ConceptLevel[], levelId: string): Set<string> | null {
  if (!levels.some((l) => (l.introduces?.length ?? 0) > 0)) return null;
  const known = new Set<string>();
  for (const level of levels) {
    for (const code of level.introduces ?? []) known.add(code);
    if (level.id === levelId) break;
  }
  return known;
}

/** `code` is known: always true when `known` is null (no course-wide gating). */
export function isKnown(known: Set<string> | null, code: string): boolean {
  return known === null || known.has(code);
}

/** Every `code:value` entry anywhere in the course's `introduces` lists: the complete set of
 * options gated at the option level, regardless of which level introduces each one. A plain
 * `code` entry (no colon) unlocks a whole row and is not an option gate, so it is not in this
 * set. */
export function gatedOptions(levels: ConceptLevel[]): Set<string> {
  const gated = new Set<string>();
  for (const level of levels) {
    for (const entry of level.introduces ?? []) {
      if (entry.includes(':')) gated.add(entry);
    }
  }
  return gated;
}

/** The option `code = value` is known: true when that option is not gated anywhere in the course
 * (`gated` lacks `code:value`), or when `code:value` is itself known (`known` null = everything
 * known, same convention as `isKnown`). */
export function isOptionKnown(known: Set<string> | null, gated: Set<string>, code: string, value: string): boolean {
  const key = `${code}:${value}`;
  return !gated.has(key) || isKnown(known, key);
}
