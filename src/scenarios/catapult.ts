import type Phaser from 'phaser';
import { createWorld, isAdapterId, type BodyId } from '../physics';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { COLORS, FixedStepper, PhysicsView, round2 } from './physicsCommon';
import type { Scenario, ScenarioHandle } from './types';

/**
 * Catapult: a hinged arm with a spring launches a ball into a stack of boxes.
 * A sanity check for feel, joint limits, motors, springs and contact events together.
 *
 * Geometry: the pivot is at the arm's RIGHT end. The arm rests pointing left with the ball on
 * its left tip. The motor swings it clockwise; the lower limit stops it after 45 degrees, so
 * the tip's velocity at release points up and to the right at 45 degrees.
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

    // Base with the pivot 2 m up; the arm spans x = -8..-4 and pivots at its right end.
    const base = world.createBody({ type: 'static', position: { x: -4, y: 0 } });
    view.staticBox({ x: -4, y: 1 }, 0.3, 1, COLORS.blue);
    const arm = world.createBody({ position: { x: -6, y: 2 } });
    world.addShape(arm, { kind: 'box', halfWidth: 2, halfHeight: 0.1 }, { density: 2 });
    view.box(arm, 2, 0.1, COLORS.blue);
    // Cup lip at the left tip so the ball rides the swing.
    world.addShape(arm, { kind: 'box', halfWidth: 0.05, halfHeight: 0.3, center: { x: -1.95, y: 0.3 } }, { density: 1 });
    const hinge = world.createJoint({
      kind: 'revolute',
      bodyA: base,
      bodyB: arm,
      anchorA: { x: 0, y: 2 },
      anchorB: { x: 2, y: 0 },
      limits: { lower: -Math.PI / 4, upper: 0.15 },
    });
    // A spring from the tip to a post above pulls the arm into the swing.
    const post = world.createBody({ type: 'static', position: { x: -7, y: 7 } });
    view.staticBox({ x: -7, y: 7 }, 0.2, 0.2, COLORS.blue);
    world.createJoint({
      kind: 'distance',
      bodyA: post,
      bodyB: arm,
      anchorA: { x: 0, y: 0 },
      anchorB: { x: -2, y: 0 },
      length: 3,
      spring: { hertz: 1.5, dampingRatio: 0.3 },
    });

    const ball = world.createBody({ position: { x: -7.6, y: 2.45 } });
    world.addShape(ball, { kind: 'circle', radius: 0.25 }, { density: 3, restitution: 0.2 });
    view.circle(ball, 0.25, COLORS.orange);

    // Target stack: columns of 6 boxes starting at x = 4.3, inside the ball's range.
    const stackBodies: BodyId[] = [];
    const starts: { x: number; y: number }[] = [];
    const cols = Math.ceil(boxes / 6);
    for (let i = 0; i < boxes; i++) {
      const x = 4.3 + (i % cols) * 0.85;
      const y = 0.4 + Math.floor(i / cols) * 0.8;
      const b = world.createBody({ position: { x, y } });
      world.addShape(b, { kind: 'box', halfWidth: 0.4, halfHeight: 0.4 }, { density: 0.5 });
      view.box(b, 0.4, 0.4, i % 2 === 0 ? COLORS.green : COLORS.pink);
      stackBodies.push(b);
      starts.push({ x, y });
    }

    const stepper = new FixedStepper(world);
    let contacts = 0;
    let maxX = -10;
    let maxY = 0;
    let launched = false;

    return {
      update(deltaMs: number): void {
        stepper.update(deltaMs, (r, step) => {
          contacts += r.contacts.length;
          // Settle for half a second, then drive the arm clockwise; the lower limit stops it.
          if (step === 30) {
            world.setMotor(hinge, -25, 20000);
            launched = true;
          }
          if (step === 50) world.setMotor(hinge, 0, 0);
          const p = world.getTransform(ball).position;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
        view.sync();
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4 && launched && maxX > 4 && contacts > 0;
      },
      extra(): Record<string, unknown> {
        let moved = 0;
        stackBodies.forEach((b, i) => {
          const p = world.getTransform(b).position;
          const s = starts[i]!;
          if (Math.hypot(p.x - s.x, p.y - s.y) > 0.5) moved++;
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
