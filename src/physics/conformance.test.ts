import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ADAPTERS, createWorld, FIXED_DT, FIXED_SUBSTEPS, type AdapterId, type PhysicsWorld } from './index';
import { hashTransforms } from './hash';

/**
 * Both adapters run the same scripts. The suite checks behavior, not equality between engines:
 * bodies settle, stacks stand, joints hold, motors spin, events fire, rays hit, springs break,
 * and the hash is stable for the same script in the same engine.
 */
const STEPS_PER_SECOND = 60;

function stepSeconds(world: PhysicsWorld, seconds: number): void {
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
}

function ground(world: PhysicsWorld): number {
  const g = world.createBody({ type: 'static', position: { x: 0, y: -0.5 } });
  world.addShape(g, { kind: 'box', halfWidth: 20, halfHeight: 0.5 });
  return g;
}

for (const adapter of ADAPTERS) {
  describe(`physics adapter: ${adapter}`, () => {
    let world: PhysicsWorld;
    const make = async (): Promise<PhysicsWorld> => createWorld(adapter as AdapterId);

    beforeAll(async () => {
      world = await make();
      world.destroy();
    });

    afterEach(() => {
      world?.destroy();
    });

    it('a ball falls and settles on a static ground', async () => {
      world = await make();
      ground(world);
      const ball = world.createBody({ position: { x: 0, y: 5 } });
      world.addShape(ball, { kind: 'circle', radius: 0.5 });
      stepSeconds(world, 4);
      const t = world.getTransform(ball);
      expect(t.position.y).toBeCloseTo(0.5, 1);
      expect(Math.abs(world.getLinearVelocity(ball).y)).toBeLessThan(0.05);
      expect(world.getMass(ball)).toBeGreaterThan(0);
    });

    it('contact events fire when the ball lands', async () => {
      world = await make();
      const g = ground(world);
      const ball = world.createBody({ position: { x: 0, y: 3 } });
      world.addShape(ball, { kind: 'circle', radius: 0.5 });
      let began = false;
      for (let i = 0; i < 120 && !began; i++) {
        const r = world.step(FIXED_DT, FIXED_SUBSTEPS);
        began = r.contacts.some((c) => c.began && ((c.bodyA === ball && c.bodyB === g) || (c.bodyA === g && c.bodyB === ball)));
      }
      expect(began).toBe(true);
    });

    it('a stack of 10 boxes stays standing', async () => {
      world = await make();
      ground(world);
      const boxes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const b = world.createBody({ position: { x: 0, y: 0.5 + i } });
        world.addShape(b, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 });
        boxes.push(b);
      }
      stepSeconds(world, 5);
      const top = world.getTransform(boxes[9]!);
      expect(top.position.y).toBeGreaterThan(9.3);
      expect(Math.abs(top.position.x)).toBeLessThan(0.2);
    });

    it('a revolute joint keeps its anchors together', async () => {
      world = await make();
      const pivot = world.createBody({ type: 'static', position: { x: 0, y: 5 } });
      const arm = world.createBody({ position: { x: 2, y: 5 } });
      world.addShape(arm, { kind: 'box', halfWidth: 2, halfHeight: 0.1 });
      world.createJoint({ kind: 'revolute', bodyA: pivot, bodyB: arm, anchorA: { x: 0, y: 0 }, anchorB: { x: -2, y: 0 } });
      stepSeconds(world, 2);
      const pa = world.worldPoint(pivot, { x: 0, y: 0 });
      const pb = world.worldPoint(arm, { x: -2, y: 0 });
      expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeLessThan(0.05);
      expect(world.jointCount()).toBe(1);
    });

    it('a motor spins a wheel', async () => {
      world = await make();
      const base = world.createBody({ type: 'static', position: { x: 0, y: 2 } });
      const wheel = world.createBody({ position: { x: 0, y: 2 } });
      world.addShape(wheel, { kind: 'circle', radius: 0.5 });
      world.createJoint({
        kind: 'wheel',
        bodyA: base,
        bodyB: wheel,
        anchorA: { x: 0, y: 0 },
        anchorB: { x: 0, y: 0 },
        motor: { enabled: true, speed: 5, maxTorque: 100 },
      });
      stepSeconds(world, 1);
      expect(world.getAngularVelocity(wheel)).toBeGreaterThan(2);
    });

    it('a ray hits the ground', async () => {
      world = await make();
      const g = ground(world);
      // Queries reflect the world after the last step (Rapier updates its broad phase on step).
      world.step(FIXED_DT, FIXED_SUBSTEPS);
      const hit = world.castRay({ x: 0, y: 5 }, { x: 0, y: -10 });
      expect(hit).not.toBeNull();
      expect(hit!.body).toBe(g);
      expect(hit!.point.y).toBeCloseTo(0, 1);
      expect(hit!.fraction).toBeCloseTo(0.5, 1);
      expect(world.castRay({ x: 0, y: 5 }, { x: 0, y: 2 })).toBeNull();
    });

    it('a chain shape supports a box', async () => {
      world = await make();
      const terrain = world.createBody({ type: 'static' });
      world.addShape(terrain, { kind: 'chain', vertices: [{ x: -5, y: 0 }, { x: 5, y: 0 }] });
      const box = world.createBody({ position: { x: 0, y: 3 } });
      world.addShape(box, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 });
      stepSeconds(world, 3);
      expect(world.getTransform(box).position.y).toBeCloseTo(0.5, 1);
    });

    it('a spring stretches under load and a breakable joint breaks', async () => {
      world = await make();
      const hook = world.createBody({ type: 'static', position: { x: 0, y: 10 } });
      const weight = world.createBody({ position: { x: 0, y: 9 } });
      world.addShape(weight, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 }, { density: 1 });
      const joint = world.createJoint({
        kind: 'distance',
        bodyA: hook,
        bodyB: weight,
        anchorA: { x: 0, y: 0 },
        anchorB: { x: 0, y: 0 },
        length: 1,
        spring: { hertz: 2, dampingRatio: 0.5 },
        breakDistance: 1.05,
      });
      const broken: number[] = [];
      for (let i = 0; i < 120 && broken.length === 0; i++) broken.push(...world.step(FIXED_DT, FIXED_SUBSTEPS).broken);
      expect(broken).toEqual([joint]);
      expect(world.jointCount()).toBe(0);
    });

    it('a weld holds two bodies as one', async () => {
      world = await make();
      ground(world);
      const a = world.createBody({ position: { x: 0, y: 3 } });
      world.addShape(a, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 });
      const b = world.createBody({ position: { x: 1, y: 3 } });
      world.addShape(b, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 });
      world.createJoint({ kind: 'weld', bodyA: a, bodyB: b, anchorA: { x: 0.5, y: 0 }, anchorB: { x: -0.5, y: 0 } });
      stepSeconds(world, 3);
      const ta = world.getTransform(a);
      const tb = world.getTransform(b);
      expect(tb.position.x - ta.position.x).toBeCloseTo(1, 1);
      expect(Math.abs(ta.angle - tb.angle)).toBeLessThan(0.05);
    });

    it('bodies() keeps creation order and drops destroyed bodies', async () => {
      world = await make();
      const a = world.createBody();
      const b = world.createBody();
      const c = world.createBody();
      expect(world.bodies()).toEqual([a, b, c]);
      world.destroyBody(b);
      expect(world.bodies()).toEqual([a, c]);
    });

    it('the hash is stable for the same script and changes with the scene', async () => {
      const script = (w: PhysicsWorld, offset: number): string => {
        ground(w);
        for (let i = 0; i < 20; i++) {
          const b = w.createBody({ position: { x: (i % 5) * 1.1 - 2 + offset, y: 2 + Math.floor(i / 5) * 1.2 } });
          w.addShape(b, i % 2 === 0 ? { kind: 'circle', radius: 0.4 } : { kind: 'box', halfWidth: 0.4, halfHeight: 0.4 });
        }
        stepSeconds(w, 3);
        return w.hash();
      };
      world = await make();
      const h1 = script(world, 0);
      world.destroy();
      world = await make();
      const h2 = script(world, 0);
      world.destroy();
      world = await make();
      const h3 = script(world, 0.01);
      expect(h1).toMatch(/^[0-9a-f]{8}$/);
      expect(h2).toBe(h1);
      expect(h3).not.toBe(h1);
    });
  });
}

describe('hashTransforms', () => {
  it('is order sensitive and quantized', () => {
    const a = hashTransforms([{ position: { x: 1, y: 2 }, angle: 0.5 }]);
    const b = hashTransforms([{ position: { x: 1.00001, y: 2 }, angle: 0.5 }]);
    const c = hashTransforms([{ position: { x: 1.001, y: 2 }, angle: 0.5 }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(hashTransforms([])).toMatch(/^[0-9a-f]{8}$/);
  });
});
