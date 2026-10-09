// Pure helper for the HUD's level picker label (2026-10-09: `Level.chapter` groups levels into
// named chapters, e.g. a rover course's planets). No Phaser/DOM imports.

/** The level picker's label for `level`, given every level of the course in `CourseSpec.levels`
 * order (`all`). With a `chapter`: "`chapter` · `pos` of `count`" — `pos` is this level's 1-based
 * position among the levels sharing that chapter (in `all` order, even when they are not
 * contiguous), `count` is how many levels share it. Without a chapter: "Level `i + 1` of
 * `all.length`" (`i` = `level`'s index in `all`, 0 when it isn't found) — today's behaviour. */
export function levelPickerLabel<T extends { id: string; chapter?: string }>(level: T, all: T[]): string {
  if (level.chapter !== undefined) {
    const siblings = all.filter((l) => l.chapter === level.chapter);
    const pos = siblings.findIndex((l) => l.id === level.id);
    return `${level.chapter} · ${pos + 1} of ${siblings.length}`;
  }
  const idx = all.indexOf(level);
  return `Level ${(idx >= 0 ? idx : 0) + 1} of ${all.length}`;
}
