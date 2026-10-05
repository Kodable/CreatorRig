import { describe, expect, it } from 'vitest';
import { buildGround, buildPart } from './build';
import { MAX_PREROLL_SPEED, PRE_ROLL_TICKS, StructuresSim, createStructuresSim } from './sim';
import type { PlacedPart, StructuresLevel, TestSpec, Vec2 } from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';

function level(overrides: Partial<StructuresLevel> & Pick<StructuresLevel, 'test' | 'keepAbove'>): StructuresLevel {
  return {
    id: 'test-level',
    title: 'Test',
    bruno: '',
    goals: [],
    parts: [],
    palette: [],
    hints: [],
    failHints: {},
    ...overrides,
  };
}

const NONE = (duration: number): TestSpec => ({ kind: 'none', duration });

async function runToOutcome(sim: StructuresSim, maxTicks: number): Promise<number> {
  sim.play();
  let ticks = 0;
  while (sim.outcome === 'running' && ticks < maxTicks) {
    sim.step();
    ticks++;
  }
  return ticks;
}

describe('StructuresSim: shake — base width', () => {
  // DEVIATION (retuned after the glue-rule and rolling-resistance changes, 2026-09-15): the
  // plan's "gentle" shake (A 0.12, f 1, 8 s) no longer topples a narrow glued column. Since glue
  // now never breaks under shake (by design — see glue.test.ts), an internally-glued column
  // rocks as ONE rigid body, so toppling now needs the shake to actually drive its rocking
  // motion past the column's critical tip angle (classic "rocking block" dynamics) rather than
  // letting individual seams slip and cascade. That takes a near-resonant frequency (measured
  // ~0.9-1.5 Hz for a 1x4 wood column at A 0.15) and a longer run (collapse happens around
  // t ~ 25-27 s, not within 8 s). Both the frequency and duration below reflect that measurement.
  const SHAKE: TestSpec = { kind: 'shake', duration: 30, amplitude: 0.15, frequency: 1 };

  it('a narrow 1-wide 4-tall wood column topples in a (resonant) shake (collapsed)', async () => {
    const parts: PlacedPart[] = [];
    for (let i = 0; i < 4; i++) parts.push({ id: i + 1, kind: 'block', x: 5, y: 0.5 + i, props: { size: '1x1', material: 'wood' } });
    parts.push({ id: 5, kind: 'fuzz', x: 5, y: 4.4, props: { size: 'M' } });

    const sim = await createStructuresSim(parts, level({ test: SHAKE, keepAbove: 3 }));
    await runToOutcome(sim, 2000);

    expect(sim.outcome).toBe('collapsed');
    sim.destroy();
  });

  it('the same height on a 2-wide base survives the same shake', async () => {
    // Two 1x1 blocks side by side, a 2x1 block bridging them, then a 1x2 tower — 2 m base.
    const parts: PlacedPart[] = [
      { id: 1, kind: 'block', x: 4.5, y: 0.5, props: { size: '1x1', material: 'wood' } },
      { id: 2, kind: 'block', x: 5.5, y: 0.5, props: { size: '1x1', material: 'wood' } },
      { id: 3, kind: 'block', x: 5, y: 1.5, props: { size: '2x1', material: 'wood' } },
      { id: 4, kind: 'block', x: 5, y: 3, props: { size: '1x2', material: 'wood' } },
      { id: 5, kind: 'fuzz', x: 5, y: 4.4, props: { size: 'M' } },
    ];

    const sim = await createStructuresSim(parts, level({ test: SHAKE, keepAbove: 3 }));
    await runToOutcome(sim, 2000);

    expect(sim.outcome).toBe('survived');
    expect(sim.metrics().fuzzHeight).toBeGreaterThan(3);
    sim.destroy();
  });
});

describe('StructuresSim: wind — material', () => {
  // NOTE (deviation): the plan's outcome-level check ("a wood 1x2 column with the fuzz on top
  // collapses; the same in brick survives") is confounded on a bare, flat-topped column: the
  // fuzz is a circle with no rolling resistance, so ANY sustained lateral force — including the
  // 20% the wind gives it directly — eventually rolls it off any finite ledge, regardless of
  // material. Measured: on a 1-wide top (0.1 m of clearance either side of the 0.4 m fuzz) it
  // rolls off in ~2.3-2.7 s for wood AND brick alike, so both hit 'collapsed' near the same time
  // for unrelated reasons (wood: the column itself topples; brick: the fuzz rolls off a column
  // that never moves). That timing/clearance interaction is a level-design concern (give the
  // fuzz a wide perch or side rails), not a sim bug — outcome is correctly and exclusively driven
  // by the fuzz height per the plan. So this test asserts the thing wind is actually supposed to
  // prove — does the material change whether the BLOCK topples — directly on the structural
  // metrics (topHeight, partsFell), which are unaffected by the fuzz confound.
  it('wind 6 N/m topples a wood 1x2 block but not the same block in brick', async () => {
    const wind: TestSpec = { kind: 'wind', duration: 6, strength: 6, from: 'left', ramp: 2 };

    const woodSim = await createStructuresSim(
      [{ id: 1, kind: 'block', x: 5, y: 1, props: { size: '1x2', material: 'wood' } }],
      level({ test: wind, keepAbove: -10 }),
    );
    await runToOutcome(woodSim, 400);
    const woodMetrics = woodSim.metrics();
    woodSim.destroy();

    const brickSim = await createStructuresSim(
      [{ id: 1, kind: 'block', x: 5, y: 1, props: { size: '1x2', material: 'brick' } }],
      level({ test: wind, keepAbove: -10 }),
    );
    await runToOutcome(brickSim, 400);
    const brickMetrics = brickSim.metrics();
    brickSim.destroy();

    expect(woodMetrics.partsFell).toBe(1);
    expect(woodMetrics.topHeight).toBe(0);
    expect(brickMetrics.partsFell).toBe(0);
    expect(brickMetrics.topHeight).toBeGreaterThan(1.9);
  });

  it('partsFell latches at 1 for a single fallen part (does not keep counting)', async () => {
    const wind: TestSpec = { kind: 'wind', duration: 6, strength: 6, from: 'left', ramp: 2 };
    const sim = await createStructuresSim(
      [{ id: 1, kind: 'block', x: 5, y: 1, props: { size: '1x2', material: 'wood' } }],
      level({ test: wind, keepAbove: -10 }),
    );
    sim.play();
    const seen = new Set<number>();
    for (let i = 0; i < 400 && sim.outcome === 'running'; i++) {
      sim.step();
      seen.add(sim.metrics().partsFell);
    }
    expect(seen.has(1)).toBe(true);
    expect(Math.max(...seen)).toBe(1); // never exceeds partCount for one fallen block
    sim.destroy();
  });
});

describe('StructuresSim: blast — speed and shielding', () => {
  function speed(a: { x: number; y: number }, b: { x: number; y: number }, dt: number): number {
    return Math.hypot(b.x - a.x, b.y - a.y) / dt;
  }

  it('6 N·s at 2 m gives a wood 1x1 block > 3 m/s and a steel one < 1 m/s', async () => {
    for (const [material, check] of [
      ['wood', (v: number) => expect(v).toBeGreaterThan(3)],
      ['steel', (v: number) => expect(v).toBeLessThan(1)],
    ] as const) {
      const sim = await createStructuresSim(
        [{ id: 1, kind: 'block', x: 5, y: 0.5, props: { size: '1x1', material } }],
        level({ test: { kind: 'blast', duration: 3, at: { x: 3, y: 0.5 }, impulse: 6, delay: 0 }, keepAbove: -10, glue: false }),
      );
      sim.play();
      sim.step(); // the blast fires on this tick
      const before = sim.snapshot().transforms;
      sim.step();
      const after = sim.snapshot().transforms;
      const blockId = [...before.keys()].find((id) => before.get(id)!.position.x === 5 || after.get(id)!.position.x !== before.get(id)!.position.x)!;
      const v = speed(before.get(blockId)!.position, after.get(blockId)!.position, FIXED_DT);
      check(v);
      sim.destroy();
    }
  });

  it('a block shielded by another gets at most 30% of the unshielded speed', async () => {
    const sim = await createStructuresSim(
      [
        { id: 1, kind: 'block', x: 5, y: 0.5, props: { size: '1x1', material: 'wood' } }, // hit directly
        { id: 2, kind: 'block', x: 7, y: 0.5, props: { size: '1x1', material: 'wood' } }, // shielded by part 1
      ],
      level({ test: { kind: 'blast', duration: 3, at: { x: 3, y: 0.5 }, impulse: 6, delay: 0 }, keepAbove: -10, glue: false }),
    );
    sim.play();
    sim.step();
    const before = sim.snapshot().transforms;
    sim.step();
    const after = sim.snapshot().transforms;

    const anchors = sim.settledPositions();
    const frontId = [...before.keys()].find((id) => Math.abs(before.get(id)!.position.x - (anchors.get(1)?.x ?? 5)) < 0.2)!;
    const backId = [...before.keys()].find((id) => Math.abs(before.get(id)!.position.x - (anchors.get(2)?.x ?? 7)) < 0.2)!;

    const frontSpeed = speed(before.get(frontId)!.position, after.get(frontId)!.position, FIXED_DT);
    const backSpeed = speed(before.get(backId)!.position, after.get(backId)!.position, FIXED_DT);

    expect(backSpeed).toBeLessThanOrEqual(frontSpeed * 0.3);
    sim.destroy();
  });
});

describe('StructuresSim: fuzz retention (rolling resistance)', () => {
  // The fuzz is a circle with no rolling resistance of its own; ROLL_DECEL in sim.ts gives it a
  // constant deceleration so it doesn't roll off a stable perch under wind (which now applies no
  // force to it at all) or drift away after a blast (20% of the impulse).
  it('a fuzz on a 2-wide brick block stays on it under wind 12 for 8 s', async () => {
    const parts: PlacedPart[] = [
      { id: 1, kind: 'block', x: 5, y: 0.5, props: { size: '2x1', material: 'brick' } },
      { id: 2, kind: 'fuzz', x: 5, y: 1.4, props: { size: 'M' } },
    ];
    const sim = await createStructuresSim(parts, level({ test: { kind: 'wind', duration: 8, strength: 12, from: 'left', ramp: 2 }, keepAbove: 0.5 }));
    const startHeight = sim.metrics().fuzzHeight;
    const ticks = await runToOutcome(sim, 600);

    expect(sim.outcome).toBe('survived');
    expect(ticks).toBeLessThanOrEqual(600);
    expect(Math.abs(sim.metrics().fuzzHeight - startHeight)).toBeLessThan(0.05);
    sim.destroy();
  });

  it('a fuzz on a 2-wide steel block stays on it after a blast of 9 N·s 3 m away', async () => {
    const parts: PlacedPart[] = [
      { id: 1, kind: 'block', x: 8, y: 0.5, props: { size: '2x1', material: 'steel' } },
      { id: 2, kind: 'fuzz', x: 8, y: 1.4, props: { size: 'M' } },
    ];
    const sim = await createStructuresSim(
      parts,
      level({ test: { kind: 'blast', duration: 3, at: { x: 5, y: 0.5 }, impulse: 9, delay: 0 }, keepAbove: 0.5 }),
    );
    const startHeight = sim.metrics().fuzzHeight;
    await runToOutcome(sim, 300);

    expect(sim.outcome).toBe('survived');
    expect(Math.abs(sim.metrics().fuzzHeight - startHeight)).toBeLessThan(0.05);
    sim.destroy();
  });
});

describe('StructuresSim: latches and settle', () => {
  it('survivalTime latches once the fuzz drops below the line and does not change afterward', async () => {
    const parts: PlacedPart[] = [
      { id: 1, kind: 'block', x: 5, y: 0.5, props: { size: '1x1', material: 'wood' } },
      { id: 2, kind: 'fuzz', x: 5, y: 5, props: { size: 'M' } }, // dropped, lands on the block well below keepAbove
    ];
    const sim = await createStructuresSim(parts, level({ test: NONE(5), keepAbove: 4 }));
    sim.play();

    const seen: number[] = [];
    for (let i = 0; i < 300; i++) {
      sim.step();
      seen.push(sim.metrics().survivalTime);
    }
    sim.destroy();

    // Once latched, survivalTime never changes again for the rest of the run.
    const latched = seen[seen.length - 1]!;
    const firstLatchIndex = seen.findIndex((v) => v === latched);
    expect(seen.slice(firstLatchIndex).every((v) => v === latched)).toBe(true);
    expect(sim.outcome).toBe('collapsed');
  });

  it('settledPositions returns the dropped position of a block placed 1 m in the air', async () => {
    const parts: PlacedPart[] = [{ id: 1, kind: 'block', x: 5, y: 1.5, props: { size: '1x1', material: 'wood' } }];
    const sim = await createStructuresSim(parts, level({ test: NONE(3), keepAbove: -10 }));

    const anchor = sim.settledPositions().get(1);
    expect(anchor).toBeDefined();
    expect(anchor!.x).toBeCloseTo(5, 1);
    expect(anchor!.y).toBeCloseTo(0.5, 1); // 1x1 block resting on the ground (top at y = 0)
    sim.destroy();
  });

  it('the pre-roll does not fling a block placed 0.2 m inside another', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    buildGround(world);
    const partA: PlacedPart = { id: 1, kind: 'block', x: 5, y: 0.5, props: { size: '1x1', material: 'wood' } };
    const partB: PlacedPart = { id: 2, kind: 'block', x: 5, y: 1.3, props: { size: '1x1', material: 'wood' } }; // 0.2 m overlap
    const handleA = buildPart(world, partA);
    const handleB = buildPart(world, partB);
    const ids = [handleA.bodies[0]!.id, handleB.bodies[0]!.id];
    const starts = new Map(ids.map((id) => [id, world.getTransform(id).position]));

    let maxSpeed = 0;
    for (let i = 0; i < PRE_ROLL_TICKS; i++) {
      world.step(FIXED_DT, FIXED_SUBSTEPS);
      for (const id of ids) {
        const v = world.getLinearVelocity(id);
        const s = Math.hypot(v.x, v.y);
        if (s > maxSpeed) maxSpeed = s;
        if (s > MAX_PREROLL_SPEED) {
          const scale = MAX_PREROLL_SPEED / s;
          world.setLinearVelocity(id, { x: v.x * scale, y: v.y * scale });
        }
      }
    }

    expect(maxSpeed).toBeLessThanOrEqual(2.1);
    for (const id of ids) {
      const start = starts.get(id)!;
      const end = world.getTransform(id).position;
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      expect(dist).toBeLessThan(1);
    }
    world.destroy();
  });
});
