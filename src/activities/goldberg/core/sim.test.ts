import { describe, expect, it } from 'vitest';
import { createGoldbergSim } from './sim';
import { defaultProps } from './catalog';
import type { PlacedPart } from './types';

function part(kind: PlacedPart['kind'], x: number, y: number, props: Record<string, string> = {}, id: number): PlacedPart {
  return { id, kind, x, y, props: { ...defaultProps(kind), ...props } };
}

/** Runs the sim, ticking until `pred` is true or `maxSeconds` elapses. */
function runUntil(sim: { step(): void; outcome: string }, maxSeconds: number, pred?: () => boolean): void {
  const maxTicks = Math.ceil(maxSeconds * 60);
  for (let i = 0; i < maxTicks; i++) {
    sim.step();
    if (pred?.()) return;
    if (sim.outcome !== 'running') return;
  }
}

describe('GoldbergSim', () => {
  it('a fuzz rolls down a ramp into an open gate: reachedGate', async () => {
    const parts: PlacedPart[] = [
      part('ramp', 3, 0, { angle: '30', flip: 'No', size: 'Medium' }, 1),
      part('fuzz', 3, 3, {}, 2),
      part('gate', 10, 0, { openTime: '0' }, 3),
    ];
    const sim = await createGoldbergSim(parts);
    sim.play();
    runUntil(sim, 10);
    expect(sim.outcome).toBe('reachedGate');
    expect(sim.metrics().elapsed).toBeGreaterThan(0);
    expect(sim.metrics().partsMoved).toBeGreaterThanOrEqual(1);
    sim.destroy();
  });

  it('same course but the gate is closed: tooEarly', async () => {
    const parts: PlacedPart[] = [
      part('ramp', 3, 0, { angle: '30', flip: 'No', size: 'Medium' }, 1),
      part('fuzz', 3, 3, {}, 2),
      part('gate', 10, 0, { openTime: '5' }, 3),
    ];
    const sim = await createGoldbergSim(parts);
    sim.play();
    runUntil(sim, 10);
    expect(sim.outcome).toBe('tooEarly');
    sim.destroy();
  });

  it('gate door opens exactly at openTime', async () => {
    const parts: PlacedPart[] = [part('gate', 20, 0, { openTime: '3' }, 1)];
    const sim = await createGoldbergSim(parts);
    sim.play();
    for (let i = 0; i < 170; i++) sim.step(); // ~2.83s
    expect(sim.snapshot().doorOpen).toBe(false);
    for (let i = 0; i < 20; i++) sim.step(); // ~3.17s
    expect(sim.snapshot().doorOpen).toBe(true);
    sim.destroy();
  });

  it('6 dominoes fall from a fuzz rolling off a ramp', async () => {
    const parts: PlacedPart[] = [
      part('ramp', 2, 0, { angle: '30', flip: 'No', size: 'Medium' }, 1),
      part('fuzz', 2, 3, {}, 2),
      part('domino', 4, 0, { count: '6' }, 3),
    ];
    const sim = await createGoldbergSim(parts);
    sim.play();
    runUntil(sim, 10, () => sim.metrics().partsMoved >= 2);
    // Let things finish settling.
    for (let i = 0; i < 240; i++) sim.step();

    const handle = sim.handles().find(h => h.kind === 'domino')!;
    const snap = sim.snapshot();

    // All six toppled (each rotated well away from its upright 0 rad rest pose).
    for (const b of handle.bodies) {
      const t = snap.transforms.get(b.id)!;
      expect(Math.abs(t.angle)).toBeGreaterThan(0.3);
    }

    // The last domino has nothing beyond it to lean on, so it falls all the way flat:
    // ~pi/2 rotated, resting at roughly half its own thickness (0.125 m) above the ground.
    const lastBody = handle.bodies[handle.bodies.length - 1]!.id;
    const last = snap.transforms.get(lastBody)!;
    expect(Math.abs(Math.abs(last.angle) - Math.PI / 2)).toBeLessThan(0.3);
    expect(last.position.y).toBeGreaterThan(0);
    expect(last.position.y).toBeLessThan(0.35);

    expect(sim.metrics().partsMoved).toBeGreaterThanOrEqual(2); // domino part (once) + fuzz
    sim.destroy();
  });

  it('a lone fuzz on the ground settles', async () => {
    const parts: PlacedPart[] = [part('fuzz', 5, 0.4, {}, 1)];
    const sim = await createGoldbergSim(parts);
    sim.play();
    runUntil(sim, 4);
    expect(sim.outcome).toBe('settled');
    sim.destroy();
  });

  it('seesaw fulcrumPos Left: a fuzz dropped on the left end stays RightDown', async () => {
    // length Medium = 4, fulcrumPos Left => k = -0.4, so the plank's left end sits at
    // pivot.x - L/2 - k*L = 10 - 2 + 1.6 = 9.6; drop just inboard of that tip.
    const parts: PlacedPart[] = [
      part('seesaw', 10, 1, { fulcrumPos: 'Left' }, 1),
      part('fuzz', 9.8, 2.5, {}, 2),
    ];
    const sim = await createGoldbergSim(parts);
    sim.play();
    for (let i = 0; i < 180; i++) sim.step(); // 3s
    const handle = sim.handles().find(h => h.kind === 'seesaw')!;
    const plankId = handle.bodies.find(b => b.role === 'plank')!.id;
    const angle = sim.snapshot().transforms.get(plankId)!.angle;
    expect(angle).toBeLessThan(-0.2);
    sim.destroy();
  });

  it('seesaw fulcrumPos Middle: a fuzz dropped on the left end tips to LeftDown', async () => {
    // length Medium = 4, fulcrumPos Middle => k = 0, so the plank's left end sits at
    // pivot.x - L/2 = 8; drop just inboard of that tip.
    const parts: PlacedPart[] = [
      part('seesaw', 10, 1, { fulcrumPos: 'Middle' }, 1),
      part('fuzz', 8.2, 2.5, {}, 2),
    ];
    const sim = await createGoldbergSim(parts);
    sim.play();
    for (let i = 0; i < 180; i++) sim.step(); // 3s
    const handle = sim.handles().find(h => h.kind === 'seesaw')!;
    const plankId = handle.bodies.find(b => b.role === 'plank')!.id;
    const angle = sim.snapshot().transforms.get(plankId)!.angle;
    expect(angle).toBeGreaterThan(0.2);
    sim.destroy();
  });
});
