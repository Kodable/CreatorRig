import { describe, expect, it } from 'vitest';
import { LEVELS, findLevel } from './levels';
import { OPEN_RULES, canGrab, clearedPoints, dragTarget, editRules, levelTools, samePoints, startTool, toolAllowed } from './editRules';
import type { TrackPoint } from './types';

const c = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve' });
const lock = (x: number, y: number): TrackPoint => ({ x, y, kind: 'curve', locked: true });

describe('editor rules (2026-10-15)', () => {
  describe('level 1 (drop): drag the station, nothing else', () => {
    const drop = LEVELS[0]!;
    const rules = editRules(drop);

    it('is the drop lesson', () => expect(drop.id).toBe('drop'));

    it('shows no tool buttons and cannot add or delete', () => {
      expect(levelTools(drop)).toEqual([]);
      expect(rules.canAdd).toBe(false);
      expect(rules.canDelete).toBe(false);
      expect(toolAllowed(drop, 'point')).toBe(false);
      expect(toolAllowed(drop, 'loop')).toBe(false);
    });

    it('locks the final node (on the flag) and leaves the station free', () => {
      const preset = drop.preset!;
      expect(preset).toHaveLength(2);
      expect(preset[preset.length - 1]!.locked).toBe(true);
      expect(preset[preset.length - 1]).toMatchObject({ x: drop.finish!.x, y: drop.finish!.y });
      expect(preset[0]!.locked).toBeFalsy();
    });

    it('only the station can be grabbed, and it only slides up and down', () => {
      const pts = drop.preset!;
      expect(pts.map((_, i) => canGrab(pts, i))).toEqual([true, false]);
      expect(rules.stationVertical).toBe(true);
      expect(dragTarget(rules, pts, 0, { x: 30, y: 22 })).toEqual({ x: pts[0]!.x, y: 22 });
    });

    it('Clear resets to the preset (the locked end never becomes the station)', () => {
      const dragged = [c(8, 23), lock(52, 4)];
      expect(clearedPoints(rules, dragged)).toEqual(drop.preset);
      expect(samePoints(clearedPoints(rules, drop.preset!), drop.preset!)).toBe(true);
    });
  });

  it('Clear keeps every locked point, in order, on a level that can add', () => {
    const rules = editRules(findLevel('hang')!);
    const pts = [lock(2, 16), lock(10, 12), c(18, 3), c(28, 9), c(56, 3)];
    expect(clearedPoints(rules, pts)).toEqual([lock(2, 16), lock(10, 12)]);
    expect(clearedPoints(OPEN_RULES, [lock(2, 20), c(5, 5), lock(9, 9)])).toEqual([lock(2, 20), lock(9, 9)]);
  });

  it('Clear and Undo snapshots are copies: clearing never mutates the points it was given', () => {
    const pts = [lock(2, 16), c(18, 3)];
    const before = JSON.stringify(pts);
    const out = clearedPoints(editRules(findLevel('hang')!), pts);
    out[0]!.y = 99;
    expect(JSON.stringify(pts)).toBe(before);
  });

  it('locked points can never be grabbed (so a drag or a tap never moves or deletes them)', () => {
    for (const level of LEVELS) {
      const pts = level.preset ?? [];
      pts.forEach((p, i) => expect(canGrab(pts, i), `${level.id} #${i}`).toBe(!p.locked));
    }
  });

  it('a free station drags anywhere on a level without the vertical rule', () => {
    expect(dragTarget(OPEN_RULES, [c(8, 14)], 0, { x: 20, y: 22 })).toEqual({ x: 20, y: 22 });
  });

  it('loops stay hidden before the loop lesson and show from it on', () => {
    const loopAt = LEVELS.findIndex((l) => l.id === 'loop');
    expect(loopAt).toBeGreaterThan(0);
    LEVELS.forEach((level, i) => {
      expect(levelTools(level).includes('loop'), level.id).toBe(i >= loopAt);
    });
    expect(LEVELS[loopAt]!.newTool).toBe('loop');
    expect(LEVELS.filter((l) => l.newTool)).toHaveLength(1);
  });

  it('every level from 2 on can add points with the Point tool; untouched levels keep both tools', () => {
    for (const level of LEVELS.slice(1)) {
      expect(levelTools(level).includes('point'), level.id).toBe(true);
      expect(editRules(level).canAdd, level.id).toBe(true);
      expect(startTool(level), level.id).toBe('point');
    }
    expect(levelTools(findLevel('free')!)).toEqual(['point', 'loop']);
  });
});
