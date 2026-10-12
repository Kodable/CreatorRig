import { describe, expect, it } from 'vitest';
import { interpolateCart } from './interpolateCart';
import type { CartSnapshot } from './types';

const snap = (s: number, x: number, theta: number, outcome: CartSnapshot['outcome'] = 'running'): CartSnapshot => ({
  s, v: s * 2, pos: { x, y: 1 }, theta, up: { x: -Math.sin(theta), y: Math.cos(theta) },
  gNormal: 1, airborne: false, time: s / 10, sMax: s, outcome,
});

describe('interpolateCart', () => {
  it('draws halfway between two ticks at alpha 0.5', () => {
    const r = interpolateCart(snap(0, 0, 0), snap(1, 2, 0.2), 0.5);
    expect(r.s).toBeCloseTo(0.5, 9);
    expect(r.pos.x).toBeCloseTo(1, 9);
    expect(r.theta).toBeCloseTo(0.1, 9);
    expect(Math.hypot(r.up.x, r.up.y)).toBeCloseTo(1, 9);
  });
  it('alpha 0 draws the previous pose, alpha 1 the current one', () => {
    const prev = snap(0, 0, 0);
    const cur = snap(1, 2, 0.2);
    expect(interpolateCart(prev, cur, 0).pos.x).toBe(0);
    expect(interpolateCart(prev, cur, 1)).toBe(cur);
  });
  it('takes the short way round an angle wrap', () => {
    const r = interpolateCart(snap(0, 0, Math.PI - 0.1), snap(1, 1, -Math.PI + 0.1), 0.5);
    expect(Math.abs(Math.abs(r.theta) - Math.PI)).toBeLessThan(1e-9);
  });
  it('uses the current snapshot with no previous one or once the run has ended', () => {
    const cur = snap(1, 2, 0.2);
    expect(interpolateCart(null, cur, 0.5)).toBe(cur);
    const ended = snap(1, 2, 0.2, 'fell');
    expect(interpolateCart(snap(0, 0, 0), ended, 0.5)).toBe(ended);
  });
});
