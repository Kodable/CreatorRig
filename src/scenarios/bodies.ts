import type Phaser from 'phaser';
import { createWorld, isAdapterId } from '../physics';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { bowlVertices, COLORS, FixedStepper, PhysicsView, subStepsFrom } from './physicsCommon';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

/**
 * Bodies: N dynamic circles and boxes rain into a bowl. The count where a device drops under
 * 30 fps is the live-object cap for that device.
 */
const bodies: Scenario = {
  id: 'bodies',
  defaultCount: 500,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    if (!isAdapterId(params.adapter)) throw new Error(`bodies needs ?adapter=box2d or rapier, got "${params.adapter}"`);
    const count = params.count > 0 ? params.count : this.defaultCount;
    const random = makeRandom(params.seed);
    const world = await createWorld(params.adapter);
    const view = new PhysicsView(scene, world, { ppm: 32, originX: 512, originY: 740 });

    const bowl = world.createBody({ type: 'static' });
    const verts = bowlVertices(15, 12, 20);
    world.addShape(bowl, { kind: 'chain', vertices: verts }, { friction: 0.5 });
    view.chain(verts);

    // Spread the spawn column upward so bodies rain in instead of exploding out of overlap.
    for (let i = 0; i < count; i++) {
      const x = (random() - 0.5) * 24;
      const y = 14 + random() * Math.max(6, count * 0.06);
      const body = world.createBody({ position: { x, y }, angle: random() * Math.PI });
      if (i % 2 === 0) {
        const r = 0.25 + random() * 0.25;
        world.addShape(body, { kind: 'circle', radius: r }, { restitution: 0.1 });
        view.circle(body, r, COLORS.orange);
      } else {
        const h = 0.25 + random() * 0.25;
        world.addShape(body, { kind: 'box', halfWidth: h, halfHeight: h });
        view.box(body, h, h, COLORS.green);
      }
    }

    const stepper = new FixedStepper(world, subStepsFrom(params));
    let hash = '';
    let contacts = 0;

    return {
      update(deltaMs: number): void {
        stepper.update(deltaMs, (r, step) => {
          contacts += r.contacts.length;
          if (step === 300) hash = world.hash();
        });
        view.sync();
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4;
      },
      extra(): Record<string, unknown> {
        return { bodies: count, contacts, hashStep: 300, hash, ...stepper.stats() };
      },
      hash(): string {
        return hash;
      },
    };
  },
};

export default bodies;
