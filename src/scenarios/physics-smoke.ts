import type Phaser from 'phaser';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS, isAdapterId, type PhysicsWorld } from '../physics';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

/** Pixels per meter and the world origin on the 1024x768 stage. */
const PPM = 32;
const ORIGIN_X = 512;
const ORIGIN_Y = 740;

interface View {
  body: number;
  obj: Phaser.GameObjects.Shape;
}

/**
 * Physics smoke: N circles and boxes dropped into a bowl made of a chain shape.
 * Proves each adapter loads in the browser, renders through the interface, and shows the
 * transform hash so two devices can be compared by eye before the full determinism scenario.
 */
const physicsSmoke: Scenario = {
  id: 'physics-smoke',
  defaultCount: 100,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    if (!isAdapterId(params.adapter)) throw new Error(`physics-smoke needs ?adapter=box2d or rapier, got "${params.adapter}"`);
    const count = params.count > 0 ? params.count : this.defaultCount;
    const random = makeRandom(params.seed);
    const world: PhysicsWorld = await createWorld(params.adapter);

    // Bowl: a chain from (-14,10) down to (0,0) and up to (14,10), 16 segments.
    const bowl = world.createBody({ type: 'static' });
    const verts = [];
    for (let i = 0; i <= 16; i++) {
      const x = -14 + (28 * i) / 16;
      verts.push({ x, y: (x * x) / 19.6 });
    }
    world.addShape(bowl, { kind: 'chain', vertices: verts }, { friction: 0.5 });

    const views: View[] = [];
    for (let i = 0; i < count; i++) {
      const isBall = i % 2 === 0;
      const x = (random() - 0.5) * 16;
      const y = 12 + random() * 20;
      const body = world.createBody({ position: { x, y }, angle: random() * Math.PI });
      let obj: Phaser.GameObjects.Shape;
      if (isBall) {
        const r = 0.3 + random() * 0.3;
        world.addShape(body, { kind: 'circle', radius: r }, { restitution: 0.2 });
        obj = scene.add.circle(0, 0, r * PPM, 0xffb40f);
      } else {
        const h = 0.3 + random() * 0.3;
        world.addShape(body, { kind: 'box', halfWidth: h, halfHeight: h });
        obj = scene.add.rectangle(0, 0, h * 2 * PPM, h * 2 * PPM, 0x61bb46);
      }
      views.push({ body, obj });
    }

    // Draw the bowl once.
    const g = scene.add.graphics();
    g.lineStyle(3, 0xffffff, 0.8);
    g.beginPath();
    verts.forEach((v, i) => {
      const px = ORIGIN_X + v.x * PPM;
      const py = ORIGIN_Y - v.y * PPM;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.strokePath();

    /** Hash at a fixed step count, so two devices can be compared regardless of frame timing. */
    const HASH_STEP = 120;
    let hash = '';
    let steps = 0;
    let contacts = 0;
    let accumulator = 0;

    return {
      update(deltaMs: number): void {
        // Fixed-step physics regardless of frame rate; cap catch-up to avoid spirals.
        accumulator = Math.min(accumulator + deltaMs / 1000, FIXED_DT * 5);
        while (accumulator >= FIXED_DT) {
          const r = world.step(FIXED_DT, FIXED_SUBSTEPS);
          contacts += r.contacts.length;
          accumulator -= FIXED_DT;
          steps++;
          if (steps === HASH_STEP) hash = world.hash();
        }
        for (const v of views) {
          const t = world.getTransform(v.body);
          v.obj.setPosition(ORIGIN_X + t.position.x * PPM, ORIGIN_Y - t.position.y * PPM);
          v.obj.setRotation(-t.angle);
        }
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4;
      },
      extra(): Record<string, unknown> {
        return { bodies: count, steps, contacts, hashStep: HASH_STEP, hash, hashFinal: world.hash() };
      },
      hash(): string {
        return hash;
      },
    };
  },
};

export default physicsSmoke;
