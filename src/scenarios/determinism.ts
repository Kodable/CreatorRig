import type Phaser from 'phaser';
import { createWorld, FIXED_DT, isAdapterId, type BodyId, type JointId, type PhysicsWorld, type StepResult, type Vec2 } from '../physics';
import type { RigParams } from '../params';
import { percentile, type FrameStats } from '../report';
import { COLORS, PhysicsView, round2, subStepsFrom } from './physicsCommon';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

/** Fixed numbers from the CW-01.4 scope: 200 bodies, 30 joints, one motor, 3,000 fixed steps. */
export const DETERMINISM = {
  bodies: 200,
  cars: 10,
  steps: 3000,
  /** Steps where the hash is recorded, so a divergence can be placed in time. */
  checkpoints: [300, 1000, 3000],
  /** The loose bodies rain in one at a time, every N steps, so the scene stays in motion. */
  spawnEvery: 12,
  /** Wall-clock budget per frame for stepping. It changes only how many steps a frame takes. */
  frameBudgetMs: 12,
};

/** Track as a chain, listed left to right so it is solid from above; both ends rise into walls. */
const TRACK: Vec2[] = [
  { x: -15, y: 20 },
  { x: -15, y: 11 },
  { x: -6, y: 10 },
  { x: -4.5, y: 8 },
  { x: -3, y: 5.5 },
  { x: -1.5, y: 3.5 },
  { x: 0, y: 2.5 },
  { x: 2, y: 2 },
  { x: 4, y: 2 },
  { x: 6, y: 2.3 },
  { x: 8, y: 3 },
  { x: 10, y: 4.5 },
  { x: 12, y: 6 },
  { x: 15, y: 7 },
  { x: 15, y: 20 },
];

const CAR = { halfWidth: 0.45, halfHeight: 0.12, wheelRadius: 0.18, wheelX: 0.28, wheelY: -0.34, spacing: 1.0 };
const PADDLE = { center: { x: 3, y: 4.8 }, halfLength: 1.2, halfThickness: 0.08, speed: 2.5, maxTorque: 3000 };

export interface Car {
  chassis: BodyId;
  wheels: [BodyId, BodyId];
}

export interface LooseShape {
  id: BodyId;
  kind: 'circle' | 'box';
  size: number;
}

export interface DeterminismScene {
  track: BodyId;
  trackVertices: Vec2[];
  /** Cars from the back of the train to the front (rightmost). */
  train: Car[];
  paddle: BodyId;
  motorJoint: JointId;
  /** Loose circles and boxes created so far, in creation order. */
  loose: LooseShape[];
  joints: JointId[];
  /** Fixed steps taken so far. */
  steps: number;
  /** Spawns any body scheduled for the next step, then steps the world once. */
  step(subSteps: number): StepResult;
}

/**
 * Coaster-like seeded scene. A 10-car train with 20 wheel hinges and 9 couplers rolls off a
 * tilted plateau into a valley and runs the hills to the far wall, while loose bodies rain in on
 * a fixed step schedule and a motorized paddle above the pile flings the ones that hit it.
 * Everything else is mass and gravity. `count` is the total body count once the rain is over,
 * static bodies included, so the report's body number is the scope's number.
 */
export function buildDeterminismScene(world: PhysicsWorld, seed: number, count: number, onSpawn?: (shape: LooseShape) => void): DeterminismScene {
  const random = makeRandom(seed);
  const joints: JointId[] = [];

  const track = world.createBody({ type: 'static' });
  world.addShape(track, { kind: 'chain', vertices: TRACK }, { friction: 0.6 });

  // Train on the tilted plateau from (-15, 11) to (-6, 10). Each car is rotated to the slope and
  // spaced along it, so the couplers coincide and every wheel touches the track.
  const slope = Math.atan2(-1, 9);
  const t: Vec2 = { x: Math.cos(slope), y: Math.sin(slope) };
  const n: Vec2 = { x: -t.y, y: t.x };
  const lift = CAR.wheelRadius + 0.02 - CAR.wheelY;
  const start: Vec2 = { x: -14.6, y: 11 - (-14.6 + 15) / 9 };
  const rotate = (p: Vec2): Vec2 => ({ x: p.x * t.x - p.y * t.y, y: p.x * t.y + p.y * t.x });
  const train: Car[] = [];
  for (let i = 0; i < DETERMINISM.cars; i++) {
    const along = i * CAR.spacing;
    const c: Vec2 = { x: start.x + t.x * along + n.x * lift, y: start.y + t.y * along + n.y * lift };
    const chassis = world.createBody({ position: c, angle: slope });
    world.addShape(chassis, { kind: 'box', halfWidth: CAR.halfWidth, halfHeight: CAR.halfHeight }, { density: 2, friction: 0.4 });
    const wheels: BodyId[] = [];
    for (const side of [-1, 1]) {
      const local: Vec2 = { x: side * CAR.wheelX, y: CAR.wheelY };
      const w = rotate(local);
      const wheel = world.createBody({ position: { x: c.x + w.x, y: c.y + w.y } });
      world.addShape(wheel, { kind: 'circle', radius: CAR.wheelRadius }, { density: 1, friction: 0.9 });
      joints.push(world.createJoint({ kind: 'revolute', bodyA: chassis, bodyB: wheel, anchorA: local, anchorB: { x: 0, y: 0 } }));
      wheels.push(wheel);
    }
    const car: Car = { chassis, wheels: [wheels[0]!, wheels[1]!] };
    if (i > 0) {
      const prev = train[i - 1]!;
      joints.push(
        world.createJoint({
          kind: 'revolute',
          bodyA: prev.chassis,
          bodyB: chassis,
          anchorA: { x: CAR.spacing / 2, y: 0 },
          anchorB: { x: -CAR.spacing / 2, y: 0 },
        }),
      );
    }
    train.push(car);
  }

  // The one motor: a cross-shaped paddle hinged to the track above the first valley.
  const paddle = world.createBody({ position: PADDLE.center });
  world.addShape(paddle, { kind: 'box', halfWidth: PADDLE.halfLength, halfHeight: PADDLE.halfThickness }, { density: 3 });
  world.addShape(paddle, { kind: 'box', halfWidth: PADDLE.halfThickness, halfHeight: PADDLE.halfLength }, { density: 3 });
  const motorJoint = world.createJoint({
    kind: 'revolute',
    bodyA: track,
    bodyB: paddle,
    anchorA: PADDLE.center,
    anchorB: { x: 0, y: 0 },
    motor: { enabled: true, speed: PADDLE.speed, maxTorque: PADDLE.maxTorque },
  });
  joints.push(motorJoint);

  // Loose bodies rain in from above the valley, one every spawnEvery steps, in seeded order.
  const loose: LooseShape[] = [];
  const total = count - world.bodies().length;
  const spawnOne = (): void => {
    const i = loose.length;
    const x = -3 + random() * 16;
    const id = world.createBody({ position: { x, y: 16 }, angle: random() * Math.PI });
    const size = 0.08 + random() * 0.08;
    let shape: LooseShape;
    if (i % 2 === 0) {
      world.addShape(id, { kind: 'circle', radius: size }, { restitution: 0.2, friction: 0.5 });
      shape = { id, kind: 'circle', size };
    } else {
      world.addShape(id, { kind: 'box', halfWidth: size, halfHeight: size }, { friction: 0.5 });
      shape = { id, kind: 'box', size };
    }
    loose.push(shape);
    onSpawn?.(shape);
  };

  const scene: DeterminismScene = {
    track,
    trackVertices: TRACK,
    train,
    paddle,
    motorJoint,
    loose,
    joints,
    steps: 0,
    step(subSteps: number): StepResult {
      const next = scene.steps + 1;
      if (loose.length < total && (next - 1) % DETERMINISM.spawnEvery === 0) spawnOne();
      const r = world.step(FIXED_DT, subSteps);
      scene.steps = next;
      return r;
    },
  };
  return scene;
}

/** Draws one built scene. */
function drawScene(view: PhysicsView, scene: DeterminismScene): void {
  view.chain(scene.trackVertices);
  for (const car of scene.train) {
    view.box(car.chassis, CAR.halfWidth, CAR.halfHeight, COLORS.blue);
    for (const w of car.wheels) view.circle(w, CAR.wheelRadius, COLORS.white);
  }
  view.box(scene.paddle, PADDLE.halfLength, PADDLE.halfThickness, COLORS.pink);
}

function drawLoose(view: PhysicsView, s: LooseShape): void {
  if (s.kind === 'circle') view.circle(s.id, s.size, COLORS.orange);
  else view.box(s.id, s.size, s.size, COLORS.green);
}

interface Run {
  world: PhysicsWorld;
  view: PhysicsView;
  scene: DeterminismScene;
  hashes: Record<number, string>;
}

/**
 * Determinism: build the seeded scene, step it 3,000 fixed steps as fast as the frame budget
 * allows (wall-clock decides only how many steps a frame takes, never the step size), hash, then
 * build it again and repeat. Equal hashes on two devices at the same step mean identical replay.
 */
const determinism: Scenario = {
  id: 'determinism',
  defaultCount: DETERMINISM.bodies,
  async create(phaserScene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    if (!isAdapterId(params.adapter)) throw new Error(`determinism needs ?adapter=box2d or rapier, got "${params.adapter}"`);
    const adapter = params.adapter;
    const count = params.count > 0 ? params.count : this.defaultCount;
    const subSteps = subStepsFrom(params);
    const targetSteps = Number(params.extra['steps'] ?? DETERMINISM.steps) || DETERMINISM.steps;
    const checkpoints = [...new Set([...DETERMINISM.checkpoints.filter((c) => c < targetSteps), targetSteps])];
    const viewOpts = { ppm: 32, originX: 512, originY: 740 };

    const runs: Run[] = [];
    const physicsMs: number[] = [];
    let building = false;
    let bodies = 0;
    let joints = 0;

    const startRun = async (): Promise<void> => {
      building = true;
      const world = await createWorld(adapter);
      const view = new PhysicsView(phaserScene, world, viewOpts);
      const scene = buildDeterminismScene(world, params.seed, count, (shape) => drawLoose(view, shape));
      drawScene(view, scene);
      runs.push({ world, view, scene, hashes: {} });
      building = false;
    };
    await startRun();

    const current = (): Run | undefined => runs[runs.length - 1];
    const complete = (r: Run): boolean => r.scene.steps >= targetSteps;

    return {
      update(): void {
        const run = current();
        if (!run || building) return;
        if (complete(run)) {
          if (runs.length < 2) {
            run.view.destroy();
            run.world.destroy();
            void startRun();
          }
          return;
        }
        const t0 = performance.now();
        while (!complete(run) && performance.now() - t0 < DETERMINISM.frameBudgetMs) {
          run.scene.step(subSteps);
          if (checkpoints.includes(run.scene.steps)) run.hashes[run.scene.steps] = run.world.hash();
        }
        bodies = run.world.bodies().length;
        joints = run.world.jointCount();
        physicsMs.push(performance.now() - t0);
        run.view.sync();
      },
      pass(_stats: FrameStats): boolean | null {
        const [a, b] = runs;
        if (!a || !b || !complete(a) || !complete(b)) return null;
        return a.hashes[targetSteps] === b.hashes[targetSteps];
      },
      extra(): Record<string, unknown> {
        const [a, b] = runs;
        const sorted = [...physicsMs].sort((x, y) => x - y);
        return {
          bodies,
          joints,
          motors: 1,
          subSteps,
          hashStep: targetSteps,
          hash: a?.hashes[targetSteps] ?? '',
          hashRerun: b?.hashes[targetSteps] ?? '',
          stable: a && b && complete(a) && complete(b) ? a.hashes[targetSteps] === b.hashes[targetSteps] : null,
          checkpoints: a?.hashes ?? {},
          checkpointsRerun: b?.hashes ?? {},
          stepsDone: runs.map((r) => r.scene.steps),
          physicsMsP50: round2(percentile(sorted, 50)),
          physicsMsP95: round2(percentile(sorted, 95)),
        };
      },
      notes(): string[] {
        const [a, b] = runs;
        const notes: string[] = [];
        if (!a || !complete(a)) notes.push(`run 1 reached ${a?.scene.steps ?? 0} of ${targetSteps} steps`);
        else if (!b || !complete(b)) notes.push(`run 2 reached ${b?.scene.steps ?? 0} of ${targetSteps} steps`);
        else if (a.hashes[targetSteps] !== b.hashes[targetSteps]) notes.push('same browser, same seed, different hash: the adapter is not stable');
        return notes;
      },
      busy(): boolean {
        const b = runs[1];
        return !b || !complete(b);
      },
      hash(): string | null {
        const [a, b] = runs;
        const h = a?.hashes[targetSteps];
        if (!h) return null;
        if (!b || !complete(b)) return h;
        return b.hashes[targetSteps] === h ? `${h} ✓` : `${h} ✗ ${b.hashes[targetSteps]}`;
      },
    };
  },
};

export default determinism;
