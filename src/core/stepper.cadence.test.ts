import { describe, it, expect } from 'vitest';
import { FixedStepper } from '/Users/gao/Documents/Projects/RollercoasterTest/src/core/stepper';
describe('cadence', () => {
  it('60 Hz frames step exactly once each', () => {
    const s = new FixedStepper(); const counts: number[] = [];
    for (let i = 0; i < 20; i++) counts.push(s.update(i % 2 ? 16.6 : 16.8, () => {}));
    expect(counts.every((c) => c === 1)).toBe(true);
  });
  it('a 33 ms frame steps twice and 120 Hz frames alternate 0/1', () => {
    const s = new FixedStepper();
    expect(s.update(33.4, () => {})).toBe(2);
    const t = new FixedStepper(); const c: number[] = [];
    for (let i = 0; i < 8; i++) c.push(t.update(8.34, () => {}));
    expect(c.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
