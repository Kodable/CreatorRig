import type { EditTool, Level, TrackPoint, Vec2 } from './types';
import { clonePoints } from './trackPoints';

/**
 * Per-level editor rules (2026-10-15, Gao: "for the first level, lock the final node, hide adding
 * points and loops ... for the next lessons, hide the loops until we teach them"). Pure: the scene
 * (src/game/CoasterScene.ts) asks these helpers what a tap, a drag and Clear may do, and the HUD
 * asks which tool buttons show. A level that sets none of the fields behaves as before.
 */
export interface EditRules {
  /** A tap on the track or the sky adds a point. */
  canAdd: boolean;
  /** A tap (no drag) on an unlocked point deletes it. */
  canDelete: boolean;
  /** The station only slides up and down. */
  stationVertical: boolean;
  /** What Clear goes back to when nothing may be added (the level's preset), else null: Clear
   * keeps the locked points only. */
  resetTo: TrackPoint[] | null;
}

export const ALL_TOOLS: readonly EditTool[] = ['point', 'loop'];

/** The open editor (a level without rules, and the scene before the first level loads). */
export const OPEN_RULES: EditRules = { canAdd: true, canDelete: true, stationVertical: false, resetTo: null };

/** The tool buttons a level shows, in order (default: Point and Loop). */
export function levelTools(level: Level): EditTool[] {
  return level.tools ? [...level.tools] : [...ALL_TOOLS];
}

export function editRules(level: Level): EditRules {
  const canAdd = level.canAdd ?? true;
  return {
    canAdd,
    // Nothing may be added, so nothing may be taken away either (the lesson's track stays whole).
    canDelete: canAdd,
    stationVertical: level.stationVertical ?? false,
    resetTo: canAdd ? null : clonePoints(level.preset ?? []),
  };
}

/** The tool a level starts with: Point when it shows, else its first tool, else Point (a level
 * with no tool buttons cannot add anything anyway). */
export function startTool(level: Level): EditTool {
  const tools = levelTools(level);
  return tools.includes('point') ? 'point' : (tools[0] ?? 'point');
}

/** May the child pick `tool` on this level? */
export function toolAllowed(level: Level, tool: EditTool): boolean {
  return levelTools(level).includes(tool);
}

/** May point `i` be grabbed (dragged, or tapped to delete)? Locked points never. */
export function canGrab(points: readonly TrackPoint[], i: number): boolean {
  const p = points[i];
  return !!p && !p.locked;
}

/** Where a drag of point `i` to world point `to` puts it (before the scene's edge clamp): the
 * station keeps its x under `stationVertical`, and so does any point flagged `vertical` (the air
 * time lesson's hump top). */
export function dragTarget(rules: EditRules, points: readonly TrackPoint[], i: number, to: Vec2): Vec2 {
  const p = points[i];
  if (p && (p.vertical || (rules.stationVertical && i === 0))) return { x: p.x, y: to.y };
  return { x: to.x, y: to.y };
}

/** The points after Clear: the preset again when nothing may be added, else the locked points. */
export function clearedPoints(rules: EditRules, points: readonly TrackPoint[]): TrackPoint[] {
  if (rules.resetTo) return clonePoints(rules.resetTo);
  return clonePoints(points.filter((p) => p.locked));
}

/** Same points, same order (Clear and a no-op gesture push no undo step). */
export function samePoints(a: readonly TrackPoint[], b: readonly TrackPoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    if (p.x !== q.x || p.y !== q.y || p.kind !== q.kind || !!p.locked !== !!q.locked || !!p.vertical !== !!q.vertical) return false;
  }
  return true;
}
