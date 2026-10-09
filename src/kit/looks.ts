// Pure helpers for `WorldSpec.looks` / `Level.look` (2026-10-09: several rover levels, several
// planets, one sky each). No Phaser/DOM imports so these are plain-function-testable; BuilderScene
// calls them to decide what to draw and what to preload.
import type { WorldSpec } from './types';

/** Resolves what a level drawn with `look` should show: the named look's `sky`/`backgrounds` when
 * it exists (each field falling back to the world's own when the look omits it), or the world's
 * own sky/backgrounds when `look` is absent or names a key `world.looks` doesn't have. */
export function resolveLook(
  world: WorldSpec,
  look: string | undefined,
): { sky: WorldSpec['sky']; backgrounds: NonNullable<WorldSpec['backgrounds']> } {
  const named = look !== undefined ? world.looks?.[look] : undefined;
  return {
    sky: named?.sky ?? world.sky,
    backgrounds: named?.backgrounds ?? world.backgrounds ?? [],
  };
}

/** Every picture URL `BuilderScene.preload` must load for `world`: the world's own backgrounds
 * plus every named look's backgrounds, deduplicated (first-seen order) so a picture reused across
 * looks (or reused from the world's own backgrounds) loads once. */
export function lookImageUrls(world: WorldSpec): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const addAll = (bgs: WorldSpec['backgrounds']): void => {
    for (const bg of bgs ?? []) {
      if (!seen.has(bg.url)) {
        seen.add(bg.url);
        urls.push(bg.url);
      }
    }
  };
  addAll(world.backgrounds);
  for (const look of Object.values(world.looks ?? {})) {
    addAll(look.backgrounds);
  }
  return urls;
}
