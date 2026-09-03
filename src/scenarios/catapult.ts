import type Phaser from 'phaser';
import { createWorld, isAdapterId, type BodyId, type JointId } from '../physics';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { COLORS, FixedStepper, PhysicsView, round2, subStepsFrom } from './physicsCommon';
import type { Scenario, ScenarioHandle } from './types';

/**
 * Catapult: a counterweight trebuchet. A heavy weight on the short arm falls when the latch is
 * released, the long arm swings up against a joint limit, and the ball on its tip flies into a
 * stack of boxes. A sanity check for feel, limits, gravity, joints and contacts together.
 *
 * Gravity-driven on purpose: motor torque models and hertz-defined springs differ between
 * engines (both were tried), mass and gravity do not.
 *
 * Geometry: pivot at world (-4, 2). The arm's long end points left with the ball on it, the
 * short end points right and carries the counterweight. Release rotates the arm clockwise; the
 * lower limit stops it, so the tip's velocity at release points up and to the right.
 */
const catapult: Scenario = {
  id: 'catapult',
  defaultCount: 30,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    if (!isAdapterId(params.adapter)) throw new Error(`catapult needs ?adapter=box2d or rapier, got "${params.adapter}"`);
    const boxes = params.count > 0 ? params.count : this.defaultCount;
    const world = await createWorld(params.adapter);
    const view = new PhysicsView(scene, world, { ppm: 40, originX: 420, originY: 740 });

    const ground = world.createBody({ type: 'static', position: { x: 2, y: -0.5 } });
    world.addShape(ground, { kind: 'box', halfWidth: 20, halfHeight: 0.5 }, { friction: 0.7 });
    view.staticBox({ x: 2, y: -0.5 }, 20, 0.5);

    // Arm: 5 m long, center at x = -5.5, pivot 1.5 m right of center (world x = -4).
    const base = world.createBody({ type: 'static', position: { x: -4, y: 0 } });
    view.staticBox({ x: -4, y: 1 }, 0.3, 1, COLORS.blue);
    const arm = world.createBody({ position: { x: -5.5, y: 2 } });
    world.addShape(arm, { kind: 'box', halfWidth: 2.5, halfHeight: 0.1 }, { density: 2 });
    view.box(arm, 2.5, 0.1, COLORS.blue);
    // Cup lip at the long tip so the ball rides the swing; counterweight on the short end.
    world.addShape(arm, { kind: 'box', halfWidth: 0.05, halfHeight: 0.3, center: { x: -2.45, y: 0.3 } }, { density: 1 });
    world.addShape(arm, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5, center: { x: 2.2, y: -0.6 } }, { density: 12 });
    world.createJoint({
      kind: 'revolute',
      bodyA: base,
      bodyB: arm,
      anchorA: { x: 0, y: 2 },
      anchorB: { x: 1.5, y: 0 },
      limits: { lower: -0.9, upper: 0.05 },
    });

    // A rigid latch holds the long tip down until release.
    const latchAnchor = world.createBody({ type: 'static', position: { x: -8, y: 0 } });
    const latch: JointId = world.createJoint({
      kind: 'distance',
      bodyA: latchAnchor,
      bodyB: arm,
      anchorA: { x: 0, y: 0 },
      anchorB: { x: -2.5, y: 0 },
      length: 2,
    });

    const ball = world.createBody({ position: { x: -7.7, y: 2.45 } });
    world.addShape(ball, { kind: 'circle', radius: 0.25 }, { density: 3, restitution: 0.2 });
    view.circle(ball, 0.25, COLORS.orange);

    // Target stack: columns of 6 boxes starting at x = 2.4, under the ball's descent.
    const stackBodies: BodyId[] = [];
    const starts: { x: number; y: number }[] = [];
    const cols = Math.ceil(boxes / 6);
    for (let i = 0; i < boxes; i++) {
      const x = 2.4 + (i % cols) * 0.85;
      const y = 0.4 + Math.floor(i / cols) * 0.8;
      const b = world.createBody({ position: { x, y } });
      world.addShape(b, { kind: 'box', halfWidth: 0.4, halfHeight: 0.4 }, { density: 0.5 });
      view.box(b, 0.4, 0.4, i % 2 === 0 ? COLORS.green : COLORS.pink);
      stackBodies.push(b);
      starts.push({ x, y });
    }

    const stepper = new FixedStepper(world, subStepsFrom(params));
    let contacts = 0;
    let maxX = -10;
    let maxY = 0;
    let released = false;

    return {
      update(deltaMs: number): void {
        stepper.update(deltaMs, (r, step) => {
          contacts += r.contacts.length;
          // Settle for a second, then release the latch.
          if (step === 60) {
            world.destroyJoint(latch);
            released = true;
          }
          const p = world.getTransform(ball).position;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
        view.sync();
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4 && released && maxX > 1.5 && contacts > 0;
      },
      extra(): Record<string, unknown> {
        let moved = 0;
        stackBodies.forEach((b, i) => {
          const p = world.getTransform(b).position;
          const s = starts[i]!;
          if (Math.hypot(p.x - s.x, p.y - s.y) > 0.2) moved++;
        });
        return {
          boxes,
          boxesMoved: moved,
          projectileMaxX: round2(maxX),
          projectileMaxY: round2(maxY),
          armAngle: round2(world.getTransform(arm).angle),
          contacts,
          hash: world.hash(),
          ...stepper.stats(),
        };
      },
    };
  },
};

export default catapult;
