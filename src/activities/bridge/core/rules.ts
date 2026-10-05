// Rules for adding a part (length caps, budgets, spacing) and for keeping the part list
// consistent after an edit (dropping orphan rods, deriving a rod's midpoint). No physics or
// Phaser imports here.
import { MATERIALS, rodCost, rodLength, totalCost } from './catalog';
import { WORLD_H, WORLD_W } from './build';
import type { BridgeLevel, Material, PlacedPart, Vec2 } from './types';

/** A new joint must land at least this far from every existing anchor/joint. */
export const MIN_NODE_SPACING = 0.3;

function isNode(p: PlacedPart): boolean {
  return p.kind === 'anchor' || p.kind === 'joint';
}

function findNode(id: number, parts: PlacedPart[]): PlacedPart | undefined {
  return parts.find((p) => p.id === id && isNode(p));
}

/** Coarse road/non-road bucket: a road rod and a reinforcing wood/steel/cable rod may share a
 * pair of nodes (the plan: "a wood or steel rod under a road reinforces it"), but two rods of the
 * same bucket between the same pair may not. */
function bucket(material: Material): 'road' | 'other' {
  return material === 'road' ? 'road' : 'other';
}

/** `part` is the candidate to add (not yet in `parts`). */
export function canAddPart(part: PlacedPart, parts: PlacedPart[], level: BridgeLevel): boolean {
  if (part.kind === 'anchor') return true;

  if (part.kind === 'joint') {
    if (part.x < 0 || part.x > WORLD_W || part.y < 0 || part.y > WORLD_H) return false;
    for (const p of parts) {
      if (!isNode(p)) continue;
      const d = Math.hypot(p.x - part.x, p.y - part.y);
      if (d < MIN_NODE_SPACING) return false;
    }
    return true;
  }

  // rod
  const fromId = Number(part.props.from);
  const toId = Number(part.props.to);
  if (!Number.isFinite(fromId) || !Number.isFinite(toId) || fromId === toId) return false;

  const nodeA = findNode(fromId, parts);
  const nodeB = findNode(toId, parts);
  if (!nodeA || !nodeB) return false;

  const material = (part.props.material as Material) ?? 'wood';
  const spec = MATERIALS[material] ?? MATERIALS.wood;
  const length = rodLength(part, parts);
  if (length <= 0 || length > spec.maxLength) return false;

  const wantBucket = bucket(material);
  for (const p of parts) {
    if (p.kind !== 'rod') continue;
    const pFrom = Number(p.props.from);
    const pTo = Number(p.props.to);
    const samePair = (pFrom === fromId && pTo === toId) || (pFrom === toId && pTo === fromId);
    if (!samePair) continue;
    const pMaterial = (p.props.material as Material) ?? 'wood';
    if (bucket(pMaterial) === wantBucket) return false;
  }

  const cost = totalCost(parts) + rodCost(part, parts);
  if (cost > level.budget) return false;

  return true;
}

/** Drops rods whose `from`/`to` node no longer exists, then sets every remaining rod's x/y to the
 * midpoint of its two nodes (so it renders/hit-tests where it actually spans). */
export function normalizeParts(parts: PlacedPart[], _level: BridgeLevel): PlacedPart[] {
  const kept = parts.filter((p) => {
    if (p.kind !== 'rod') return true;
    const fromId = Number(p.props.from);
    const toId = Number(p.props.to);
    return !!findNode(fromId, parts) && !!findNode(toId, parts);
  });

  return kept.map((p) => {
    if (p.kind !== 'rod') return p;
    const a = findNode(Number(p.props.from), kept)!;
    const b = findNode(Number(p.props.to), kept)!;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    if (p.x === x && p.y === y) return p;
    return { ...p, x, y };
  });
}

/** A joint the child places with the Joint tool. The app assigns the real id (0 is a placeholder,
 * per the kit's `PlacedPart.id` contract - "the controller allocates new ids"). */
/** Joints snap to a half-meter grid so a child can hit exact shapes (a peak 2.5 m up, the deck line). */
export const JOINT_GRID = 0.5;
export function makeJoint(at: Vec2): PlacedPart {
  const snap = (v: number): number => Math.round(v / JOINT_GRID) * JOINT_GRID;
  return { id: 0, kind: 'joint', x: snap(at.x), y: snap(at.y), props: {} };
}

/** A rod the child draws with a material tool, between two existing node ids. */
export function makeRod(material: Material, fromId: number, toId: number): PlacedPart {
  return { id: 0, kind: 'rod', x: 0, y: 0, props: { material, from: String(fromId), to: String(toId) } };
}
