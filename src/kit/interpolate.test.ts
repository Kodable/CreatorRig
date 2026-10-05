import { describe, expect, it } from 'vitest';
import { interpolateSnapshot } from './interpolate';
import type { SimSnapshot } from './types';

const snap = (x: number, angle: number, extra: Record<number, number> = {}): SimSnapshot<'running'> => {
  const transforms = new Map([[1, { position: { x, y: 0 }, angle }]]);
  for (const [id, ex] of Object.entries(extra)) transforms.set(Number(id), { position: { x: ex, y: 0 }, angle: 0 });
  return { elapsed: 0, outcome: 'running', transforms };
};

describe('interpolateSnapshot', () => {
  it('lerps positions and takes the short way round for angles', () => {
    const out = interpolateSnapshot(snap(0, 3.0), snap(2, -3.0), 0.5);
    const t = out.transforms.get(1)!;
    expect(t.position.x).toBeCloseTo(1);
    expect(Math.abs(Math.abs(t.angle) - Math.PI)).toBeLessThan(0.15);
  });
  it('alpha 0 draws the previous pose, alpha 1 the current, no prev -> current', () => {
    expect(interpolateSnapshot(snap(0, 0), snap(2, 0), 0).transforms.get(1)!.position.x).toBe(0);
    expect(interpolateSnapshot(snap(0, 0), snap(2, 0), 1).transforms.get(1)!.position.x).toBe(2);
    expect(interpolateSnapshot(null, snap(2, 0), 0.5).transforms.get(1)!.position.x).toBe(2);
  });
  it('spawned bodies draw at their current pose; destroyed bodies are dropped', () => {
    const out = interpolateSnapshot(snap(0, 0, { 7: 5 }), snap(2, 0, { 9: 4 }), 0.5);
    expect(out.transforms.has(7)).toBe(false);
    expect(out.transforms.get(9)!.position.x).toBe(4);
  });
});
