import type Phaser from 'phaser';
import { createWorld, isAdapterId } from '../physics';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { COLORS, FixedStepper, PhysicsView, subStepsFrom, round2 } from './physicsCommon';
import type { Scenario, ScenarioHandle } from './types';

/**
 * Stack: a tower of N unit boxes at rest. Structural-stability courses need towers that do not
 * creep or topple on their own. Reports the drift of the top box over the run.
 */
const stack: Scenario = {
  id: 'stack',
  defaultCount: 50,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    if (!isAdapterId(params.adapter)) throw new Error(`stack needs ?adapter=box2d or rapier, got "${params.adapter}"`);
    const count = params.count > 0 ? params.count : this.defaultCount;
    const world = await createWorld(params.adapter);
    const ppm = Math.min(32, Math.floor(700 / (count + 2)));
    const view = new PhysicsView(scene, world, { ppm, originX: 512, originY: 740 });

    const ground = world.createBody({ type: 'static', position: { x: 0, y: -0.5 } });
    world.addShape(ground, { kind: 'box', halfWidth: 20, halfHeight: 0.5 });
    view.staticBox({ x: 0, y: -0.5 }, 20, 0.5);

    let top = 0;
    for (let i = 0; i < count; i++) {
      const b = world.createBody({ position: { x: 0, y: 0.5 + i } });
      world.addShape(b, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 }, { friction: 0.6 });
      view.box(b, 0.5, 0.5, i % 2 === 0 ? COLORS.orange : COLORS.green);
      top = b;
    }
    const start = world.getTransform(top).position;
    let maxDrift = 0;
    let toppled = false;

    const stepper = new FixedStepper(world, subStepsFrom(params));

    return {
      update(deltaMs: number): void {
        stepper.update(deltaMs, () => {
          const p = world.getTransform(top).position;
          const drift = Math.hypot(p.x - start.x, p.y - start.y);
          if (drift > maxDrift) maxDrift = drift;
          if (p.y < start.y - 1) toppled = true;
        });
        view.sync();
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4 && maxDrift < 0.5 && !toppled;
      },
      extra(): Record<string, unknown> {
        const p = world.getTransform(top).position;
        return {
          boxes: count,
          topDrift: round2(Math.hypot(p.x - start.x, p.y - start.y)),
          maxDrift: round2(maxDrift),
          toppled,
          hash: world.hash(),
          ...stepper.stats(),
        };
      },
      notes(): string[] {
        return toppled ? ['stack toppled'] : [];
      },
    };
  },
};

export default stack;
