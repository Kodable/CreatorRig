// The SUPPLY BIN's pure rules (2026-10-16, Jon: "a classroom supply bin / toolbox you pull parts
// from instead of menu rows"; `CourseSpec.bin`, `BinItem` in types.ts): which tiles a level shows,
// what the controller stamps on them, what value a tile sets, and how the drawer groups them. No
// DOM, no Phaser: BuilderApp and BuilderHud call these, bin.test.ts proves them.
import { isKnown, isOptionKnown } from './concepts';
import type { BinItem, PlacedPart, PropertyDescriptor } from './types';

/** The tiles the child sees for `part`: items whose code (or `code:value`) is not introduced yet
 * are dropped (the drawer rows' rule, `Level.introduces`), the rest are copied and stamped:
 * `locked` when the code is in `part.lockedProps`, `isNew` when this level introduces the code or
 * that one `code:value`. Never mutates the course's own list. */
export function visibleBinItems(
  items: readonly BinItem[],
  part: Pick<PlacedPart, 'lockedProps'>,
  known: Set<string> | null,
  gated: Set<string>,
  introduced: readonly string[],
): BinItem[] {
  return items
    .filter((it) => isKnown(known, it.code) && (it.value === undefined || isOptionKnown(known, gated, it.code, it.value)))
    .map((it) => ({
      ...it,
      locked: !!part.lockedProps?.includes(it.code),
      isNew: introduced.includes(it.code) || (it.value !== undefined && introduced.includes(`${it.code}:${it.value}`)),
    }));
}

/** The value applying `item` would set on a part with `props`, or null when it would do nothing:
 * an `active` item (the machine has it already), a value equal to the current one, a `step` item
 * whose result is not a whole number or not one of the descriptor's options (61 bands on a 1..60
 * row), or an item with neither `value` nor `step`. `descriptor` is the catalog's row for
 * `item.code`, when there is one (its default stands in for a missing prop). */
export function binItemValue(
  item: Pick<BinItem, 'value' | 'step' | 'active' | 'code'>,
  props: Record<string, string>,
  descriptor?: Pick<PropertyDescriptor, 'options' | 'default'>,
): string | null {
  if (item.active) return null;
  const current = props[item.code] ?? descriptor?.default ?? descriptor?.options[0]?.value;
  let next: string;
  if (item.value !== undefined) {
    next = item.value;
  } else if (item.step !== undefined) {
    const n = Number.parseInt(current ?? '', 10);
    if (!Number.isFinite(n)) return null;
    const sum = n + item.step;
    if (!Number.isInteger(sum)) return null;
    next = String(sum);
  } else {
    return null;
  }
  if (next === current) return null;
  if (descriptor && !descriptor.options.some((o) => o.value === next)) return null;
  return next;
}

/** The bin's sections in first-seen group order (an item without a group goes in a '' section). */
export function binGroups(items: readonly BinItem[]): { group: string; items: BinItem[] }[] {
  const out: { group: string; items: BinItem[] }[] = [];
  for (const it of items) {
    const g = it.group ?? '';
    let sec = out.find((s) => s.group === g);
    if (!sec) {
      sec = { group: g, items: [] };
      out.push(sec);
    }
    sec.items.push(it);
  }
  return out;
}

/** A drop zone on screen (stage px) and a point: inside when within its radius (never under
 * `minR`, so a small part still takes a drop from a finger). */
export function insideDropZone(zone: { x: number; y: number; r: number }, p: { x: number; y: number }, minR = 40): boolean {
  const r = Math.max(zone.r, minR);
  return Math.hypot(p.x - zone.x, p.y - zone.y) <= r;
}

/** Whether the drawer has anything to show for the selected part (2026-10-16: once the catapult's
 * bands moved onto the machine, Fling it's bin was empty and every row was claimed by a widget, and
 * the drawer slid open with nothing in it): the course's parts shelf, a bin tile, or a property row.
 * Without any of them the drawer stays shut and the child builds in the zoomed view with the
 * widgets alone. */
export function drawerHasContent(o: { shelfOn: boolean; bin: readonly BinItem[] | null; rows: number }): boolean {
  return o.shelfOn || (o.bin?.length ?? 0) > 0 || o.rows > 0;
}
