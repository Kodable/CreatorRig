import type Phaser from 'phaser';
import { createWorld, isAdapterId, type BodyId, type JointId, type Vec2 } from '../physics';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { anchorGap, COLORS, FixedStepper, PhysicsView, round2 } from './physicsCommon';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

interface Cart {
  chassis: BodyId;
  wheel: BodyId;
  joint: JointId;
}

/**
 * Joints: N motorized carts (chassis + wheel on a revolute motor) drive around inside a closed
 * chain arena, while a plank bridge of breakable revolute joints takes heavy balls from above.
 * Vehicle, Goldberg and bridge courses all live here.
 */
const joints: Scenario = {
  id: 'joints',
  defaultCount: 100,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    if (!isAdapterId(params.adapter)) throw new Error(`joints needs ?adapter=box2d or rapier, got "${params.adapter}"`);
    const count = params.count > 0 ? params.count : this.defaultCount;
    const random = makeRandom(params.seed);
    const stiff = (params.extra['stiff'] ?? '0') === '1';
    const world = await createWorld(params.adapter, { stiffJoints: stiff });
    const view = new PhysicsView(scene, world, { ppm: 32, originX: 512, originY: 740 });

    // Arena: counter-clockwise loop, solid inside.
    const arena = world.createBody({ type: 'static' });
    const walls: Vec2[] = [
      { x: -15, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 20 },
      { x: -15, y: 20 },
    ];
    world.addShape(arena, { kind: 'chain', vertices: walls, loop: true }, { friction: 0.8 });
    view.chain(walls, COLORS.white, true);

    // Carts in a grid; motors alternate direction so they meet in the middle.
    const carts: Cart[] = [];
    const cols = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const cx = -12 + (i % cols) * (24 / Math.max(1, cols - 1));
      const cy = 3 + Math.floor(i / cols) * 1.6 + random() * 0.3;
      const chassis = world.createBody({ position: { x: cx, y: cy } });
      world.addShape(chassis, { kind: 'box', halfWidth: 0.5, halfHeight: 0.15 }, { density: 1 });
      view.box(chassis, 0.5, 0.15, COLORS.blue);
      const wheel = world.createBody({ position: { x: cx, y: cy - 0.45 } });
      world.addShape(wheel, { kind: 'circle', radius: 0.3 }, { friction: 1.2, density: 0.8 });
      view.circle(wheel, 0.3, COLORS.orange);
      const joint = world.createJoint({
        kind: 'wheel',
        bodyA: chassis,
        bodyB: wheel,
        anchorA: { x: 0, y: -0.45 },
        anchorB: { x: 0, y: 0 },
        motor: { enabled: true, speed: i % 2 === 0 ? 12 : -12, maxTorque: 40 },
      });
      carts.push({ chassis, wheel, joint });
    }

    // Bridge: 21 planks linked by short breakable spring rods (distance joints) between two
    // static anchors at y = 15. Rods stretch measurably on every engine, unlike hinges.
    const planks = 21;
    const span = 24;
    const rod = 0.1;
    const plankHalf = (span - rod * (planks + 1)) / planks / 2;
    const left = world.createBody({ type: 'static', position: { x: -span / 2, y: 15 } });
    const right = world.createBody({ type: 'static', position: { x: span / 2, y: 15 } });
    const bridgeJoints: JointId[] = [];
    let prev = left;
    let prevAnchor: Vec2 = { x: 0, y: 0 };
    const link = (a: BodyId, anchorA: Vec2, b: BodyId, anchorB: Vec2): JointId =>
      world.createJoint({
        kind: 'distance',
        bodyA: a,
        bodyB: b,
        anchorA,
        anchorB,
        length: rod,
        spring: { hertz: 12, dampingRatio: 1 },
        breakDistance: rod + 0.15,
      });
    for (let i = 0; i < planks; i++) {
      const x = -span / 2 + rod + plankHalf + i * (plankHalf * 2 + rod);
      const plank = world.createBody({ position: { x, y: 15 } });
      world.addShape(plank, { kind: 'box', halfWidth: plankHalf, halfHeight: 0.1 }, { density: 2 });
      view.box(plank, plankHalf, 0.1, COLORS.pink);
      bridgeJoints.push(link(prev, prevAnchor, plank, { x: -plankHalf, y: 0 }));
      prev = plank;
      prevAnchor = { x: plankHalf, y: 0 };
    }
    bridgeJoints.push(link(prev, prevAnchor, right, { x: 0, y: 0 }));

    // Heavy balls fall onto the bridge, one every second.
    let ballsDropped = 0;
    const dropBall = (): void => {
      const b = world.createBody({ position: { x: -6 + ballsDropped * 3, y: 19 } });
      world.addShape(b, { kind: 'circle', radius: 0.6 }, { density: 15 });
      view.circle(b, 0.6, COLORS.white);
      ballsDropped++;
    };

    const stepper = new FixedStepper(world);
    let broken = 0;
    let maxWheelGap = 0;
    let maxBridgeGap = 0;
    let hash = '';
    const plankBodies: BodyId[] = [];
    for (const id of world.bodies()) if (id > right) plankBodies.push(id);

    return {
      update(deltaMs: number): void {
        stepper.update(deltaMs, (r, step) => {
          broken += r.broken.length;
          if (step % 60 === 0 && ballsDropped < 5) dropBall();
          if (step === 300) hash = world.hash();
        });
        for (const c of carts) {
          const gap = anchorGap(world, c.chassis, { x: 0, y: -0.45 }, c.wheel, { x: 0, y: 0 });
          if (gap > maxWheelGap) maxWheelGap = gap;
        }
        for (let i = 1; i < plankBodies.length; i++) {
          const gap = anchorGap(world, plankBodies[i - 1]!, { x: plankHalf, y: 0 }, plankBodies[i]!, { x: -plankHalf, y: 0 }) - rod;
          if (gap > maxBridgeGap && gap < 1) maxBridgeGap = gap;
        }
        view.sync();
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4 && maxWheelGap < 0.1;
      },
      extra(): Record<string, unknown> {
        return {
          carts: count,
          stiffJoints: stiff,
          motorJoints: count,
          bridgeJoints: bridgeJoints.length,
          brokenBridgeJoints: broken,
          ballsDropped,
          maxWheelGap: round2(maxWheelGap),
          maxBridgeGap: round2(maxBridgeGap),
          jointsLive: world.jointCount(),
          hashStep: 300,
          hash,
          ...stepper.stats(),
        };
      },
      hash(): string {
        return hash;
      },
    };
  },
};

export default joints;
