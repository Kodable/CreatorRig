import { describe, expect, it } from 'vitest';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from './index';

describe('physics smoke', () => {
  it('a ball falls onto the ground and settles; setBodyType and isSleeping work', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const g = world.createBody({ type: 'static', position: { x: 0, y: -0.5 } });
    world.addShape(g, { kind: 'box', halfWidth: 20, halfHeight: 0.5 });
    const ball = world.createBody({ type: 'static', position: { x: 0, y: 3 } });
    world.addShape(ball, { kind: 'circle', radius: 0.4 });
    for (let i = 0; i < 30; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    expect(world.getTransform(ball).position.y).toBeCloseTo(3, 3);
    world.setBodyType(ball, 'dynamic');
    for (let i = 0; i < 180; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    expect(world.getTransform(ball).position.y).toBeCloseTo(0.4, 1);
    expect(world.isSleeping(ball)).toBe(true);
    world.destroy();
  });
});

describe('physics: vehicle primitives', () => {
  it('a prismatic spring sags by g/omega^2 and a filter group skips intra-group contacts', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const anchor = world.createBody({ type: 'static', position: { x: 0, y: 5 } });
    const box = world.createBody({ position: { x: 0, y: 5 }, canSleep: false });
    world.addShape(box, { kind: 'box', halfWidth: 0.2, halfHeight: 0.2 }, { density: 1 / 0.16 }); // 1 kg
    world.createJoint({
      kind: 'prismatic', bodyA: anchor, bodyB: box, anchorA: { x: 0, y: 0 }, anchorB: { x: 0, y: 0 },
      axis: { x: 0, y: 1 }, limits: { lower: -1, upper: 1 }, spring: { hertz: 2.5, dampingRatio: 0.7, mass: 1 },
    });
    for (let i = 0; i < 180; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    const sag = 5 - world.getTransform(box).position.y;
    const omega = 2 * Math.PI * 2.5;
    expect(sag).toBeGreaterThan(0.02);
    expect(sag).toBeCloseTo(10 / (omega * omega), 1);

    // Two overlapping boxes in group 0x2 (mask excludes 0x2) fall through each other onto the ground.
    const g = world.createBody({ type: 'static', position: { x: 10, y: -0.5 } });
    world.addShape(g, { kind: 'box', halfWidth: 5, halfHeight: 0.5 });
    const lower = world.createBody({ position: { x: 10, y: 0.5 } });
    world.addShape(lower, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 }, { filter: { group: 0x2, mask: 0xfffd } });
    const upper = world.createBody({ position: { x: 10, y: 1.2 } });
    world.addShape(upper, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 }, { filter: { group: 0x2, mask: 0xfffd } });
    for (let i = 0; i < 120; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    expect(world.getTransform(upper).position.y).toBeLessThan(0.6); // sits on the ground, inside the lower box
    world.destroy();
  });

  it('a wheel motor at factor 10 holds its target speed under load', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const g = world.createBody({ type: 'static', position: { x: 0, y: -0.5 } });
    world.addShape(g, { kind: 'box', halfWidth: 20, halfHeight: 0.5 }, { friction: 0.8 });
    const chassis = world.createBody({ position: { x: 0, y: 0.7 }, canSleep: false });
    world.addShape(chassis, { kind: 'box', halfWidth: 1, halfHeight: 0.25 }, { density: 1.5, filter: { group: 0x2, mask: 0xfffd } });
    const wheels: number[] = [];
    for (const wx of [-0.8, 0.8]) {
      const w = world.createBody({ position: { x: wx, y: 0.45 }, canSleep: false });
      world.addShape(w, { kind: 'circle', radius: 0.45 }, { density: 1, friction: 1, filter: { group: 0x2, mask: 0xfffd } });
      wheels.push(world.createJoint({ kind: 'wheel', bodyA: chassis, bodyB: w, anchorA: { x: wx, y: -0.25 }, anchorB: { x: 0, y: 0 } }));
    }
    for (let i = 0; i < 30; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    for (const j of wheels) world.setMotor(j, -13.3, 4);
    for (let i = 0; i < 180; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    const v = world.getLinearVelocity(chassis);
    expect(Math.abs(v.x)).toBeGreaterThan(4); // about 6 m/s target at r 0.45
    world.destroy();
  });
});

describe('physics: spring stiffness override', () => {
  it('a stiffness-1000 spring stretches 1 cm under 10 N', async () => {
    const world = await createWorld({ gravity: { x: 0, y: 0 } });
    const wall = world.createBody({ type: 'static', position: { x: 0, y: 0 } });
    const box = world.createBody({ position: { x: 1, y: 0 }, canSleep: false });
    world.addShape(box, { kind: 'box', halfWidth: 0.1, halfHeight: 0.1 }, { density: 25 }); // 1 kg
    world.createJoint({
      kind: 'distance', bodyA: wall, bodyB: box, anchorA: { x: 0, y: 0 }, anchorB: { x: 0, y: 0 },
      length: 1, spring: { hertz: 1, dampingRatio: 1, stiffness: 1000 },
    });
    for (let i = 0; i < 240; i++) {
      world.applyForce(box, { x: 10, y: 0 });
      world.step(FIXED_DT, FIXED_SUBSTEPS);
    }
    expect(world.getTransform(box).position.x - 1).toBeCloseTo(0.01, 2);
    world.destroy();
  });
});

describe('physics: setFriction (2026-10-09)', () => {
  it('a box sliding on a slippery floor: friction set after it starts touching takes effect on the next step', async () => {
    const slide = async (boxFriction: number | null): Promise<number> => {
      const world = await createWorld({ gravity: { x: 0, y: -10 } });
      const floor = world.createBody({ type: 'static', position: { x: 0, y: -0.5 } });
      world.addShape(floor, { kind: 'box', halfWidth: 50, halfHeight: 0.5 }, { friction: 0 });
      const box = world.createBody({ position: { x: 0, y: 0.25 }, canSleep: false });
      world.addShape(box, { kind: 'box', halfWidth: 0.25, halfHeight: 0.25 }, { friction: 1 });
      for (let i = 0; i < 30; i++) world.step(FIXED_DT, FIXED_SUBSTEPS); // settled and touching
      if (boxFriction !== null) world.setFriction(box, boxFriction);
      world.setLinearVelocity(box, { x: 4, y: 0 });
      for (let i = 0; i < 60; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
      const x = world.getTransform(box).position.x;
      world.destroy();
      return x;
    };
    const grippy = await slide(null); // average(1, 0) = 0.5: stops within ~1.6 m
    const icy = await slide(0); // average(0, 0) = 0: slides on at 4 m/s
    expect(grippy).toBeLessThan(2);
    expect(icy).toBeGreaterThan(3.8);
  });
});

describe('physics: impact reports (ShapeOptions.impactForce, 2026-10-15)', () => {
  async function drop(impactForce?: number) {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const g = world.createBody({ type: 'static', position: { x: 0, y: -0.5 } });
    world.addShape(g, { kind: 'box', halfWidth: 20, halfHeight: 0.5 });
    // A 1 kg box dropped from 1.25 m lands at 5 m/s: about 5 N s to stop it (no bounce).
    const box = world.createBody({ position: { x: 0, y: 1.25 + 0.5 } });
    world.addShape(box, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 }, { density: 1, ...(impactForce !== undefined ? { impactForce } : {}) });
    const impacts: { impulse: number; pair: number[] }[] = [];
    for (let i = 0; i < 120; i++) {
      for (const e of world.step(FIXED_DT, FIXED_SUBSTEPS).impacts) impacts.push({ impulse: e.impulse, pair: [e.bodyA, e.bodyB].sort() });
    }
    world.destroy();
    return { impacts, g, box };
  }

  it('reports the landing as one pair with about m * v of impulse, and the resting weight not at all', async () => {
    const { impacts, g, box } = await drop(30);
    expect(impacts.length).toBeGreaterThan(0);
    for (const e of impacts) expect(e.pair).toEqual([g, box].sort());
    const peak = Math.max(...impacts.map((e) => e.impulse));
    expect(peak).toBeGreaterThan(3.5);
    expect(peak).toBeLessThan(7);
    // Resting, the box pushes 10 N on the ground, under the 30 N floor: the reports stop.
    expect(impacts.length).toBeLessThan(10);
  });

  it('reports nothing for a shape that did not ask, and the same numbers on every run', async () => {
    expect((await drop()).impacts).toEqual([]);
    expect((await drop(30)).impacts).toEqual((await drop(30)).impacts);
  });
});
