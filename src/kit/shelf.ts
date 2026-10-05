// The parts shelf: pure helpers that turn a level's palette into the drawer's picture-button
// shelf (see `HudSpec.partInfo` doc comment in types.ts). Kept separate from BuilderHud.ts so the
// grouping logic is unit-testable without any DOM.

/** The bits of `HudSpec.partInfo[kind]` the shelf cares about. */
export interface ShelfPartInfo {
  image?: string;
  group?: string;
}

export interface ShelfGroup<K extends string> {
  group: string;
  kinds: K[];
}

/** Fallback section title for a shelf kind whose `partInfo` sets `image` but no `group`. */
const DEFAULT_GROUP = 'Parts';

/** True when at least one `palette` kind has a shelf picture: the drawer should show the parts
 * shelf (and the bottom-bar palette should hide that kind's chip) for this course/level. */
export function hasShelfKinds<K extends string>(palette: K[], partInfo: Record<K, ShelfPartInfo>): boolean {
  return palette.some((kind) => !!partInfo[kind]?.image);
}

/** `palette` kinds that have NO shelf picture: what the bottom-bar chip palette shows. */
export function nonShelfKinds<K extends string>(palette: K[], partInfo: Record<K, ShelfPartInfo>): K[] {
  return palette.filter((kind) => !partInfo[kind]?.image);
}

/** Groups the `palette` kinds that have a shelf picture by `partInfo[kind].group`, in first-seen
 * order (both across groups and across kinds within a group); a kind without a picture is left
 * off the shelf entirely (it stays in the bottom-bar palette instead). A kind with a picture but
 * no `group` falls into one shared `DEFAULT_GROUP` section. Duplicate kinds in `palette` appear
 * once. */
export function shelfGroups<K extends string>(palette: K[], partInfo: Record<K, ShelfPartInfo>): ShelfGroup<K>[] {
  const groups: ShelfGroup<K>[] = [];
  const byName = new Map<string, ShelfGroup<K>>();
  for (const kind of palette) {
    const info = partInfo[kind];
    if (!info?.image) continue;
    const name = info.group ?? DEFAULT_GROUP;
    let group = byName.get(name);
    if (!group) {
      group = { group: name, kinds: [] };
      byName.set(name, group);
      groups.push(group);
    }
    if (!group.kinds.includes(kind)) group.kinds.push(kind);
  }
  return groups;
}
