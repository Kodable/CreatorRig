import type Phaser from 'phaser';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS, isAdapterId } from '../physics';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { COLORS, PhysicsView, round2 } from './physicsCommon';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

/**
 * Continuous collision: a small ball at pinball speed is fired at a wall about one pixel thick,
 * N times. Any launch that ends on the far side of the wall is a tunnel. Pinball and catapult
 * courses fail visibly if this fails. ?bullet=0 turns continuous collision off for comparison.
 */
const ccd: Scenario = {
  id: 'ccd',
  defaultCount: 1000,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    if (!isAdapterId(params.adapter)) throw new Error(`ccd needs ?adapter=box2d or rapier, got "${params.adapter}"`);
    const launches = params.count > 0 ? params.count : this.defaultCount;
    const speed = Number(params.extra['speed'] ?? 90);
    const bullet = (params.extra['bullet'] ?? '1') !== '0';
    const world = await createWorld(params.adapter, { gravity: { x: 0, y: 0 } });
    const view = new PhysicsView(scene, world, { ppm: 32, originX: 512, originY: 400 });

    // One pixel at 32 px/m is 0.031 m; the wall is 0.01 m thick (a third of a pixel) and 10 m tall.
    const wall = world.createBody({ type: 'static', position: { x: 0, y: 0 } });
    world.addShape(wall, { kind: 'box', halfWidth: 0.005, halfHeight: 5 });
    view.staticBox({ x: 0, y: 0 }, 0.05, 5, COLORS.pink);

    const radius = 0.06;
    const stepsPerLaunch = 30; // 0.5 s: at 90 m/s the ball would travel 45 m without a wall.
    const perFrame = 10;
    let done = 0;
    let tunnels = 0;
    let bounced = 0;
    let msTotal = 0;
    let lastBall: number | null = null;

    const random = makeRandom(params.seed);
    const launch = (): void => {
      // Vary the start phase within one sub-step of travel and the speed by 10 percent, so the
      // ball does not hit the wall at the same sub-step position every launch.
      const phase = random() * (speed / 240);
      const v = speed * (0.9 + random() * 0.2);
      const ball = world.createBody({ position: { x: -3 - phase, y: (done % 20) * 0.4 - 4 }, linearVelocity: { x: v, y: 0 }, bullet });
      world.addShape(ball, { kind: 'circle', radius }, { restitution: 0.5, density: 1 });
      for (let i = 0; i < stepsPerLaunch; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
      const x = world.getTransform(ball).position.x;
      if (x > radius) tunnels++;
      else bounced++;
      world.destroyBody(ball);
      done++;
    };

    // Keep one visible ball for the eye, launched slowly and left alone.
    const showBall = (): void => {
      if (lastBall !== null) {
        view.remove(lastBall);
        world.destroyBody(lastBall);
      }
      lastBall = world.createBody({ position: { x: -8, y: 0 }, linearVelocity: { x: speed, y: 0 }, bullet });
      world.addShape(lastBall, { kind: 'circle', radius }, { restitution: 0.5 });
      view.circle(lastBall, radius * 3, COLORS.orange);
    };
    showBall();

    return {
      update(deltaMs: number): void {
        const t0 = performance.now();
        for (let i = 0; i < perFrame && done < launches; i++) launch();
        msTotal += performance.now() - t0;
        // Advance the display ball a little each frame and relaunch it when it stops.
        world.step(FIXED_DT, FIXED_SUBSTEPS);
        if (lastBall !== null && Math.abs(world.getLinearVelocity(lastBall).x) < 1) showBall();
        void deltaMs;
        view.sync();
      },
      pass(stats: FrameStats): boolean | null {
        void stats;
        if (done < launches) return null;
        return tunnels === 0;
      },
      extra(): Record<string, unknown> {
        return {
          launches: done,
          target: launches,
          tunnels,
          bounced,
          speed,
          bullet,
          wallThickness: 0.01,
          ballRadius: radius,
          msPerLaunch: round2(done > 0 ? msTotal / done : 0),
        };
      },
      notes(): string[] {
        const notes: string[] = [];
        if (done < launches) notes.push(`only ${done} of ${launches} launches ran in the window; raise duration`);
        if (!bullet) notes.push('continuous collision off (bullet=0)');
        return notes;
      },
    };
  },
};

export default ccd;
