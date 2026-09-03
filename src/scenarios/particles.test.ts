import { describe, expect, it } from 'vitest';
import { emitterPlan } from './particles';

describe('emitterPlan', () => {
  it('caps one emitter at the target and flows enough to fill it at 30 fps', () => {
    const p = emitterPlan(1000, 1, 1500);
    expect(p.emitters).toBe(1);
    expect(p.perEmitter).toBe(1000);
    // 1500 ms / 33.4 ms = 44.9 frames alive; 1000 / 44.9 = 22.3 -> 23 per update.
    expect(p.quantity).toBe(23);
    // At 30 fps the steady state reaches the cap.
    expect(p.quantity * (1500 / 33.4)).toBeGreaterThanOrEqual(1000);
  });
  it('splits the target across emitters', () => {
    const p = emitterPlan(2500, 5, 1500);
    expect(p.perEmitter).toBe(500);
    expect(p.quantity).toBe(12);
  });
  it('never plans zero emitters or zero flow', () => {
    expect(emitterPlan(10, 0).emitters).toBe(1);
    expect(emitterPlan(1, 1).quantity).toBe(1);
  });
});
