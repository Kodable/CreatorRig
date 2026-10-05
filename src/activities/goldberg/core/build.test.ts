import { afterEach, describe, expect, it } from 'vitest';
import { buildPart } from './build';
import { defaultProps } from './catalog';
import type { PhysicsWorld } from '../../../physics/types';
import { createWorld } from '../../../physics';
import type { PlacedPart } from './types';

let world: PhysicsWorld | null = null;

afterEach(() => {
  world?.destroy();
  world = null;
});

function part(kind: PlacedPart['kind'], x: number, y: number, props: Record<string, string> = {}, id = 1): PlacedPart {
  return { id, kind, x, y, props: { ...defaultProps(kind), ...props } };
}

describe('build', () => {
  it('a ramp with flip=No has its apex on the left', async () => {
    world = await createWorld();
    const p = part('ramp', 5, 0, { angle: '30', flip: 'No', size: 'Medium' });
    const handle = buildPart(world, p);
    const visual = handle.visuals[0]!;
    expect(visual.shape.kind).toBe('polygon');
    if (visual.shape.kind !== 'polygon') throw new Error('expected polygon');
    const xs = visual.shape.vertices.map(v => v.x);
    const minX = Math.min(...xs);
    // The apex (highest point) should sit at the leftmost x when flip is No.
    const apex = visual.shape.vertices.reduce((a, b) => (b.y > a.y ? b : a));
    expect(apex.x).toBeCloseTo(minX, 6);
  });

  it('a ramp with flip=Yes has its apex on the right', async () => {
    world = await createWorld();
    const p = part('ramp', 5, 0, { angle: '30', flip: 'Yes', size: 'Medium' });
    const handle = buildPart(world, p);
    const visual = handle.visuals[0]!;
    if (visual.shape.kind !== 'polygon') throw new Error('expected polygon');
    const xs = visual.shape.vertices.map(v => v.x);
    const maxX = Math.max(...xs);
    const apex = visual.shape.vertices.reduce((a, b) => (b.y > a.y ? b : a));
    expect(apex.x).toBeCloseTo(maxX, 6);
  });

  it('the fuzz body is static before play', async () => {
    world = await createWorld();
    const p = part('fuzz', 3, 3, { size: 'M' });
    const handle = buildPart(world, p);
    const bodyId = handle.bodies[0]!.id;
    // A static body should not move under gravity.
    const before = world.getTransform(bodyId);
    for (let i = 0; i < 30; i++) world.step(1 / 60, 4);
    const after = world.getTransform(bodyId);
    expect(after.position.y).toBeCloseTo(before.position.y, 6);
  });

  it('a gate with openTime 0 has no door body', async () => {
    world = await createWorld();
    const p = part('gate', 10, 0, { openTime: '0' });
    const handle = buildPart(world, p);
    expect(handle.bodies.some(b => b.role === 'door')).toBe(false);
    expect(handle.bodies.some(b => b.role === 'sensor')).toBe(true);
  });

  it('a gate with openTime 5 has one door body', async () => {
    world = await createWorld();
    const p = part('gate', 10, 0, { openTime: '5' });
    const handle = buildPart(world, p);
    const doors = handle.bodies.filter(b => b.role === 'door');
    expect(doors.length).toBe(1);
    expect(handle.bodies.some(b => b.role === 'sensor')).toBe(true);
  });
});
