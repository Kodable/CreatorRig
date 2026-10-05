import { afterEach, describe, expect, it } from 'vitest';
import { BridgeSim, createBridgeSim } from './sim';
import type { BridgeLevel, PlacedPart } from './types';
import { FIXED_DT } from '../../../physics';

function makeLevel(overrides: Partial<BridgeLevel> = {}): BridgeLevel {
  return {
    id: 'test',
    title: 'Test',
    bruno: '',
    goals: [],
    parts: [],
    palette: [],
    hints: [],
    failHints: {},
    banks: { leftX: 13, rightX: 17, y: 4 },
    load: { weight: 'Light' },
    budget: 999,
    ...overrides,
  };
}

function anchor(id: number, x: number, y: number): PlacedPart {
  return { id, kind: 'anchor', x, y, props: {}, locked: true, lockPosition: true };
}

function joint(id: number, x: number, y: number): PlacedPart {
  return { id, kind: 'joint', x, y, props: {} };
}

function rodPart(id: number, material: string, from: number, to: number): PlacedPart {
  return { id, kind: 'rod', x: 0, y: 0, props: { material, from: String(from), to: String(to) } };
}

const sims: BridgeSim[] = [];

async function build(level: BridgeLevel, parts: PlacedPart[]): Promise<BridgeSim> {
  const sim = await createBridgeSim(parts, level);
  sims.push(sim);
  return sim;
}

async function run(level: BridgeLevel, parts: PlacedPart[], maxSeconds = 31): Promise<BridgeSim> {
  const sim = await build(level, parts);
  sim.play();
  const maxTicks = Math.ceil(maxSeconds / FIXED_DT);
  for (let i = 0; i < maxTicks; i++) {
    sim.step();
    if (sim.outcome !== 'running') break;
  }
  return sim;
}

describe('bridge sim', () => {
  afterEach(() => {
    for (const s of sims.splice(0)) s.destroy();
  });

  it('(a) a 4 m gap with one road rod anchor-to-anchor: the Light buggy crosses', async () => {
    const level = makeLevel({ banks: { leftX: 13, rightX: 17, y: 4 }, load: { weight: 'Light' } });
    const parts = [anchor(1, 13, 4), anchor(2, 17, 4), rodPart(3, 'road', 1, 2)];
    const sim = await run(level, parts);
    expect(sim.outcome).toBe('crossed');
    expect(sim.metrics().crossed).toBe(1);
    expect(sim.metrics().rodsBroken).toBe(0);
  });

  it('(b) a flat 6 m two-rod road span with a middle joint: no stress in edit mode (joints are ' +
    'held), and it snaps under the Light buggy (fell)', async () => {
    const level = makeLevel({ banks: { leftX: 12, rightX: 18, y: 4 }, load: { weight: 'Light' } });
    const parts = [
      anchor(1, 12, 4),
      anchor(2, 18, 4),
      joint(3, 15, 4),
      rodPart(4, 'road', 1, 3),
      rodPart(5, 'road', 3, 2),
    ];
    const sim = await build(level, parts);
    for (const stress of sim.rodStress().values()) {
      expect(stress).toBeLessThan(0.05);
    }
    sim.play();
    const maxTicks = Math.ceil(31 / FIXED_DT);
    for (let i = 0; i < maxTicks; i++) {
      sim.step();
      if (sim.outcome !== 'running') break;
    }
    expect(sim.outcome).toBe('fell');
    expect(sim.metrics().rodsBroken).toBeGreaterThanOrEqual(1);
    expect(sim.metrics().maxStress).toBe(1);
  });

  function kingpostParts(strutMaterial: 'wood' | 'steel'): PlacedPart[] {
    return [
      anchor(1, 12, 4),
      anchor(2, 18, 4),
      joint(3, 15, 4), // mid, on the deck line
      joint(4, 15, 5.5), // apex, 1.5 m above the mid joint
      rodPart(5, 'road', 1, 3),
      rodPart(6, 'road', 3, 2),
      rodPart(7, strutMaterial, 4, 1), // strut: apex -> left anchor
      rodPart(8, strutMaterial, 4, 2), // strut: apex -> right anchor
      rodPart(9, strutMaterial, 4, 3), // tie: apex -> mid joint
    ];
  }

  it('(c) a 6 m wood kingpost: Light crosses with no broken rods; Heavy breaks the tie (or falls)', async () => {
    const lightLevel = makeLevel({ banks: { leftX: 12, rightX: 18, y: 4 }, load: { weight: 'Light' } });
    const lightSim = await run(lightLevel, kingpostParts('wood'));
    expect(lightSim.outcome).toBe('crossed');
    expect(lightSim.metrics().rodsBroken).toBe(0);

    const heavyLevel = makeLevel({ banks: { leftX: 12, rightX: 18, y: 4 }, load: { weight: 'Heavy' } });
    const heavySim = await run(heavyLevel, kingpostParts('wood'));
    expect(heavySim.metrics().rodsBroken >= 1 || heavySim.outcome === 'fell').toBe(true);
  });

  it('(d) the same 6 m kingpost with steel struts and tie: Heavy crosses', async () => {
    const heavyLevel = makeLevel({ banks: { leftX: 12, rightX: 18, y: 4 }, load: { weight: 'Heavy' } });
    const sim = await run(heavyLevel, kingpostParts('steel'));
    expect(sim.outcome).toBe('crossed');
    expect(sim.metrics().rodsBroken).toBe(0);
  });

  // Deviation: the plan's levels-table label calls this "two 4 m road panels" (a single mid-span
  // joint), but the geometry given for this test (joints at 1/3 and 2/3 of the span, plus two top
  // joints above them) needs THREE ~2.67 m bottom road panels divided by two bottom joints, not
  // two 4 m ones. Built literally per that geometry (bottom joints/panels take priority since
  // they're spelled out in detail); reported here with the actual panel length (8/3 m).
  function trussParts(chordMaterial: 'wood' | 'steel'): PlacedPart[] {
    const leftX = 11;
    const rightX = 19; // 8 m gap
    const bankY = 4;
    const topY = 6; // 2 m up
    const x1 = leftX + 8 / 3;
    const x2 = leftX + 16 / 3;
    return [
      anchor(1, leftX, bankY),
      anchor(2, rightX, bankY),
      joint(3, x1, bankY), // bottom joint 1 (1/3 of the span)
      joint(4, x2, bankY), // bottom joint 2 (2/3 of the span)
      joint(5, x1, topY), // top joint 1
      joint(6, x2, topY), // top joint 2
      rodPart(7, 'road', 1, 3),
      rodPart(8, 'road', 3, 4),
      rodPart(9, 'road', 4, 2),
      rodPart(10, chordMaterial, 5, 6), // top chord
      rodPart(11, chordMaterial, 1, 5), // diagonal: left anchor -> top 1
      rodPart(12, chordMaterial, 5, 3), // vertical: top 1 -> bottom 1
      rodPart(13, chordMaterial, 6, 4), // vertical: top 2 -> bottom 2
      rodPart(14, chordMaterial, 6, 2), // diagonal: top 2 -> right anchor
      rodPart(15, chordMaterial, 3, 6), // cross diagonal
      rodPart(16, chordMaterial, 5, 4), // cross diagonal
    ];
  }

  it('(e) an 8 m two-panel truss with a wood top chord: Light crosses; Heavy breaks a chord ' +
    '(rodsBroken >= 1 or falls)', async () => {
    const lightLevel = makeLevel({ banks: { leftX: 11, rightX: 19, y: 4 }, load: { weight: 'Light' } });
    const lightSim = await run(lightLevel, trussParts('wood'));
    expect(lightSim.outcome).toBe('crossed');
    expect(lightSim.metrics().rodsBroken).toBe(0);

    const heavyLevel = makeLevel({ banks: { leftX: 11, rightX: 19, y: 4 }, load: { weight: 'Heavy' } });
    const heavySim = await run(heavyLevel, trussParts('wood'));
    expect(heavySim.metrics().rodsBroken >= 1 || heavySim.outcome === 'fell').toBe(true);
  });

  it('(f) the stress readout rises once the buggy is on the deck vs. before Play (dead load only)', async () => {
    const level = makeLevel({ banks: { leftX: 12, rightX: 18, y: 4 }, load: { weight: 'Light' } });
    const sim = await build(level, kingpostParts('wood'));
    const before = Math.max(...sim.rodStress().values());

    sim.play();
    let peak = before;
    const maxTicks = Math.ceil(10 / FIXED_DT);
    for (let i = 0; i < maxTicks; i++) {
      sim.step();
      if (sim.outcome !== 'running') break;
      const cur = Math.max(...sim.rodStress().values());
      if (cur > peak) peak = cur;
    }
    expect(peak).toBeGreaterThan(before);
  });
});
