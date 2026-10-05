import { afterEach, describe, expect, it } from 'vitest';
import { WORLD_H, WORLD_W, buildBanks, buildNode, buildRod } from './build';
import type { NodeRef } from './build';
import type { BridgeLevel, PlacedPart } from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { PhysicsWorld } from '../../../physics/types';

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

describe('bridge build', () => {
  let world: PhysicsWorld | null = null;
  afterEach(() => {
    world?.destroy();
    world = null;
  });

  it('WORLD_W/H match the plan (30 x 15 m)', () => {
    expect(WORLD_W).toBe(30);
    expect(WORLD_H).toBe(15);
  });

  it("buildBanks builds two static slabs from the level's banks spec (they do not move under gravity)", async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const level = makeLevel({ banks: { leftX: 10, rightX: 20, y: 4 } });
    const banks = buildBanks(world, level);
    expect(world.getTransform(banks.leftBody).position).toEqual({ x: 5, y: 2 });
    expect(world.getTransform(banks.rightBody).position).toEqual({ x: 25, y: 2 });
    expect(banks.items).toHaveLength(2);
    expect(banks.items[0]!.role).toBe('bank');

    for (let i = 0; i < 30; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    // Static: Rapier's getMass() reports the collider's own density x area regardless of body
    // type, so a static slab is confirmed static by never falling, not by a zero mass readout.
    expect(world.getTransform(banks.leftBody).position.y).toBeCloseTo(2, 6);
  });

  it('buildNode: an anchor is static (never falls); a joint is dynamic with density-3 mass and falls', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const a = buildNode(world, anchor(1, 5, 4));
    expect(a.bodies).toHaveLength(1);

    const j = buildNode(world, joint(2, 6, 4));
    const mass = world.getMass(j.bodies[0]!.id);
    expect(mass).toBeCloseTo(3 * Math.PI * 0.15 * 0.15, 3);

    for (let i = 0; i < 30; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    expect(world.getTransform(a.bodies[0]!.id).position.y).toBeCloseTo(4, 6); // anchor: static, unmoved
    expect(world.getTransform(j.bodies[0]!.id).position.y).toBeLessThan(4); // joint: dynamic, fell
  });

  it('a rod between two static anchors has no spring joint', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const a1 = buildNode(world, anchor(1, 13, 4));
    const a2 = buildNode(world, anchor(2, 17, 4));
    const nodes = new Map<number, NodeRef>([
      [1, { body: a1.bodies[0]!.id, static: true }],
      [2, { body: a2.bodies[0]!.id, static: true }],
    ]);
    const rod = buildRod(world, rodPart(3, 'road', 1, 2), nodes);
    expect(rod.joint).toBeNull();
  });

  it('a rod with at least one dynamic node (a joint) has a spring joint', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const j1 = buildNode(world, joint(1, 13, 4));
    const j2 = buildNode(world, joint(2, 17, 4));
    const nodes = new Map<number, NodeRef>([
      [1, { body: j1.bodies[0]!.id, static: false }],
      [2, { body: j2.bodies[0]!.id, static: false }],
    ]);
    const rod = buildRod(world, rodPart(3, 'wood', 1, 2), nodes);
    expect(rod.joint).not.toBeNull();
  });

  it('a road rod builds a deck flush with the bank top (deck top within 2 cm of banks.y)', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const bankY = 4;
    const a1 = buildNode(world, anchor(1, 13, bankY));
    const a2 = buildNode(world, anchor(2, 17, bankY));
    const nodes = new Map<number, NodeRef>([
      [1, { body: a1.bodies[0]!.id, static: true }],
      [2, { body: a2.bodies[0]!.id, static: true }],
    ]);
    const rod = buildRod(world, rodPart(3, 'road', 1, 2), nodes);
    expect(rod.bodies).toHaveLength(2); // deck + slider
    const deckId = rod.bodies[0]!;
    // Shape centre (0, -0.125) with half-height 0.125 puts the deck's own TOP edge at local y 0,
    // i.e. exactly at the deck body's own y (angle 0 here, both nodes level).
    const deckTopY = world.getTransform(deckId).position.y;
    expect(Math.abs(deckTopY - bankY)).toBeLessThan(0.02);
  });

  it('a non-road rod builds no deck/slider bodies or visuals', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const j1 = buildNode(world, joint(1, 13, 4));
    const j2 = buildNode(world, joint(2, 17, 4));
    const nodes = new Map<number, NodeRef>([
      [1, { body: j1.bodies[0]!.id, static: false }],
      [2, { body: j2.bodies[0]!.id, static: false }],
    ]);
    const rod = buildRod(world, rodPart(3, 'wood', 1, 2), nodes);
    expect(rod.bodies).toHaveLength(0);
    expect(rod.handle.visuals).toHaveLength(0);
  });

  it("a rod handle's hitSegment spans its two node positions with r 0.15", async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const a1 = buildNode(world, anchor(1, 13, 4));
    const a2 = buildNode(world, anchor(2, 17, 4));
    const nodes = new Map<number, NodeRef>([
      [1, { body: a1.bodies[0]!.id, static: true }],
      [2, { body: a2.bodies[0]!.id, static: true }],
    ]);
    const rod = buildRod(world, rodPart(3, 'road', 1, 2), nodes);
    expect(rod.handle.hitSegment).toEqual({ a: { x: 13, y: 4 }, b: { x: 17, y: 4 }, r: 0.15 });
    expect(rod.restLength).toBeCloseTo(4, 6);
  });
});
