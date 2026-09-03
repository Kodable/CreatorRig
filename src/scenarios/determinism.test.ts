import { describe, expect, it } from 'vitest';
import { ADAPTERS, createWorld, FIXED_SUBSTEPS, type AdapterId, type PhysicsWorld } from '../physics';
import { buildDeterminismScene, DETERMINISM, type DeterminismScene } from './determinism';

/**
 * The determinism scene is built and stepped here in Node, on both adapters, the same way the
 * browser scenario does it. The browser adds only rendering and the second run.
 */
async function build(adapter: AdapterId, seed: number): Promise<{ world: PhysicsWorld; scene: DeterminismScene }> {
  const world = await createWorld(adapter);
  const scene = buildDeterminismScene(world, seed, DETERMINISM.bodies);
  return { world, scene };
}

function step(scene: DeterminismScene, steps: number): void {
  for (let i = 0; i < steps; i++) scene.step(FIXED_SUBSTEPS);
}

for (const adapter of ADAPTERS) {
  describe(`determinism scene: ${adapter}`, () => {
    it('has 30 joints and one motor, and 200 bodies once the rain is over; none escape the track', async () => {
      const { world, scene } = await build(adapter, 1);
      expect(world.jointCount()).toBe(30);
      expect(scene.motorJoint).toBeGreaterThan(0);
      step(scene, DETERMINISM.steps);
      expect(world.bodies().length).toBe(200);
      expect(scene.loose.length).toBe(200 - 32); // track, paddle, 10 chassis, 20 wheels
      for (const s of scene.loose) {
        const p = world.getTransform(s.id).position;
        expect(p.y).toBeGreaterThan(0);
        expect(Math.abs(p.x)).toBeLessThan(15);
      }
      world.destroy();
    });

    it('the train rolls off the plateau into the valley', async () => {
      const { world, scene } = await build(adapter, 1);
      const front = scene.train[scene.train.length - 1]!;
      const startX = world.getTransform(front.chassis).position.x;
      step(scene, 600);
      expect(world.getTransform(front.chassis).position.x).toBeGreaterThan(startX + 3);
      world.destroy();
    });

    it('two builds with the same seed hash equal after 300 steps', async () => {
      const a = await build(adapter, 1);
      const b = await build(adapter, 1);
      step(a.scene, 300);
      step(b.scene, 300);
      expect(a.world.hash()).toBe(b.world.hash());
      a.world.destroy();
      b.world.destroy();
    });

    it('a different seed hashes differently', async () => {
      const a = await build(adapter, 1);
      const b = await build(adapter, 2);
      step(a.scene, 300);
      step(b.scene, 300);
      expect(a.world.hash()).not.toBe(b.world.hash());
      a.world.destroy();
      b.world.destroy();
    });
  });
}
