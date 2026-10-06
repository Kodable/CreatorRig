import { afterEach, describe, expect, it } from 'vitest';
import { PICS, ROVER_R } from './art';
import { DRIVE, POWER_FORCE, WHEEL } from './catalog';
import { rimPoint } from './geometry';
import {
  ABOVE_DEG,
  DRIVE_SIGN,
  FALL_Y,
  PRE_ROLL_TICKS,
  ROOF_ANGLE,
  STUCK_MIN_TIME,
  TIMEOUT_S,
  VehicleSim,
  createVehicleSim,
  driveSign,
  stoveOn,
} from './sim';
import { flat, heightAt, withGap } from './terrain';
import type { AttachmentKind, Outcome, RoverPart, Vec2, VehicleLevel } from './types';
import { createWorld, FIXED_DT } from '../../../physics';
import type { BodyDef, PhysicsWorld } from '../../../physics/types';

const DEG = Math.PI / 180;

function makeLevel(terrain: Vec2[]): VehicleLevel {
  return { id: 'test', title: 'Test', bruno: '', goals: [], parts: [], palette: [], hints: [], failHints: {}, terrain };
}

type Stick = [AttachmentKind, number, ('cup' | 'spring')?];

/** The dome at x 3 (y fixed up by normalizeParts), the sticks on its rim, a beacon at x 27. */
function rig(terrain: Vec2[], sticks: Stick[], finish = true): RoverPart[] {
  const rover: RoverPart = { id: 1, kind: 'rover', x: 3, y: 1, props: {}, locked: true, lockPosition: true };
  const parts: RoverPart[] = [rover];
  sticks.forEach(([kind, deg, mount], i) => {
    const p = rimPoint(deg * DEG);
    parts.push({ id: 10 + i, kind, x: rover.x + p.x, y: rover.y + p.y, props: { mount: mount ?? 'cup' } });
  });
  if (finish) parts.push({ id: 2, kind: 'finish', x: 27, y: heightAt(terrain, 27), props: {}, locked: true, lockPosition: true });
  return parts;
}

const TWO: Stick[] = [
  ['wheelCircle', -45],
  ['wheelCircle', -135],
];

const sims: VehicleSim[] = [];

async function make(terrain: Vec2[], sticks: Stick[], finish = true): Promise<VehicleSim> {
  const sim = await createVehicleSim(rig(terrain, sticks, finish), makeLevel(terrain));
  sims.push(sim);
  return sim;
}

/** The same build, but built upside down: a test world that turns every dynamic body 180 degrees
 * about the first one created (the dome) as it is made, so the rover starts on its roof. */
async function makeUpsideDown(terrain: Vec2[], sticks: Stick[]): Promise<VehicleSim> {
  const world = await createWorld({ gravity: { x: 0, y: -10 } });
  let pivot: Vec2 | null = null;
  const turned = new Proxy(world, {
    get(target, prop, receiver) {
      if (prop === 'createBody') {
        return (def: BodyDef = {}) => {
          if (def.type === 'dynamic' && def.position) {
            pivot ??= { ...def.position };
            const p = def.position;
            def = { ...def, position: { x: 2 * pivot.x - p.x, y: 2 * pivot.y - p.y }, angle: (def.angle ?? 0) + Math.PI };
          }
          return target.createBody(def);
        };
      }
      const v = Reflect.get(target, prop, receiver) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  }) as PhysicsWorld;
  const sim = new VehicleSim(turned, makeLevel(terrain), rig(terrain, sticks));
  sims.push(sim);
  return sim;
}

/** Wheels on the bottom AND on top: a sandwich that drives whichever way up it lands. */
const SANDWICH: Stick[] = [...TWO, ['wheelCircle', 45], ['wheelCircle', 135]];

function runFor(sim: VehicleSim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) sim.step();
}

function runOut(sim: VehicleSim, maxSeconds = 31): Outcome {
  sim.play();
  for (let i = 0; i < Math.ceil(maxSeconds / FIXED_DT) && sim.outcome === 'running'; i++) sim.step();
  return sim.outcome;
}

function pos(sim: VehicleSim, body: number): Vec2 {
  return sim.snapshot().transforms.get(body)!.position;
}

describe('vehicle sim', () => {
  afterEach(() => {
    for (const s of sims.splice(0)) s.destroy();
  });

  it('DRIVE_SIGN is -1 (a clockwise wheel rolls the rover toward +x); no pre-roll', () => {
    expect(DRIVE_SIGN).toBe(-1);
    expect(PRE_ROLL_TICKS).toBe(0);
  });

  it('edit mode shows the build exactly as placed: nothing moves and nothing pushes before Play', async () => {
    const sim = await make(flat(), [...TWO, ['jet', 180]]);
    const before = pos(sim, sim.roverBody);
    runFor(sim, 1);
    expect(pos(sim, sim.roverBody)).toEqual(before);
    expect(sim.thrustForce()).toEqual({ x: 0, y: 0 });
    expect(sim.snapshot().overlay).toBeUndefined();
  });

  it('two round wheels on flat ground drive to the beacon at ~6 m/s, toward +x', async () => {
    const sim = await make(flat(), TWO);
    expect(runOut(sim)).toBe('finished');
    const m = sim.metrics();
    expect(m.reachedFinish).toBe(1);
    expect(m.time).toBeLessThan(5);
    expect(m.topSpeed).toBeGreaterThan(5.5);
    expect(m.topSpeed).toBeLessThan(6.5);
    expect(m.flips).toBe(0);
  });

  it('the motor turns EVERY wheel while driving: a wheel on the roof spins the other way, at the motor target', async () => {
    const sim = await make(flat(), [...TWO, ['wheelCircle', 90], ['wheelStar', 0]]);
    sim.play();
    runFor(sim, 1.5);
    const snapAngle = (b: number): number => sim.snapshot().transforms.get(b)!.angle;
    const wheels = sim.attachmentHandles();
    const before = wheels.map((w) => snapAngle(w.main) - snapAngle(sim.roverBody));
    sim.step();
    const spin = wheels.map((w, i) => {
      let d = snapAngle(w.main) - snapAngle(sim.roverBody) - before[i]!;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d / FIXED_DT;
    });
    // The two ground wheels turn clockwise at about their motor target (rad/s relative to the
    // dome); the roof wheel is above the dome, so it spins the other way (counter-clockwise); the
    // star on the nose is level with the dome's centre, so it keeps the normal spin. The two that
    // touch nothing spin at exactly their target.
    expect(spin[0]).toBeCloseTo((DRIVE_SIGN * DRIVE.speed) / WHEEL.wheelCircle.r, -1);
    expect(spin[1]).toBeCloseTo((DRIVE_SIGN * DRIVE.speed) / WHEEL.wheelCircle.r, -1);
    expect(spin[2]).toBeCloseTo((-DRIVE_SIGN * DRIVE.speed) / WHEEL.wheelCircle.r, 0);
    expect(spin[3]).toBeCloseTo((DRIVE_SIGN * DRIVE.speed) / WHEEL.wheelStar.r, 0);
    expect(sim.motorTargets()[2]).toBeCloseTo((-DRIVE_SIGN * DRIVE.speed) / WHEEL.wheelCircle.r, 9);
  });

  it('propulsion pushes the dome away from the part, only while driving', async () => {
    const sim = await make(flat(), [...TWO, ['jet', 180], ['fan', -90]]);
    expect(sim.thrustForce()).toEqual({ x: 0, y: 0 });
    sim.play();
    const f = sim.thrustForce();
    // The jet on the back pushes forward (+x), the fan under the dome lifts (+y).
    expect(f.x).toBeCloseTo(POWER_FORCE.jet, 6);
    expect(f.y).toBeCloseTo(POWER_FORCE.fan, 6);
  });

  it('the stove pushes constantly; stoveOn only times its smoke puff', async () => {
    expect([0, 0.3, 0.59, 1.0, 1.5].map(stoveOn)).toEqual([true, true, true, true, true]);
    expect([0.6, 0.8, 0.99, 1.7].map(stoveOn)).toEqual([false, false, false, false]);
    const sim = await make(flat(), [...TWO, ['stove', 180]]);
    sim.play();
    expect(sim.thrustForce().x).toBeCloseTo(POWER_FORCE.stove, 6);
    runFor(sim, 0.7); // past STOVE_ON: the puff would be off, but the push does not let up
    expect(sim.thrustForce().x).toBeCloseTo(POWER_FORCE.stove, 6);
  });

  it('pushes stop when the run ends', async () => {
    const sim = await make(flat(), [...TWO, ['jet', 180]]);
    expect(runOut(sim)).toBe('finished');
    expect(sim.thrustForce()).toEqual({ x: 0, y: 0 });
  });

  it('a jet pushes the rover past its wheel speed (the wheels freewheel instead of braking)', async () => {
    const sim = await make(flat(), [...TWO, ['jet', 180]]);
    expect(runOut(sim)).toBe('finished');
    expect(sim.metrics().topSpeed).toBeGreaterThan(10);
    expect(sim.metrics().time).toBeLessThan(3.5);
  });

  it('the dome alone does not move: stuck', async () => {
    const sim = await make(flat(), []);
    expect(runOut(sim)).toBe('stuck');
    expect(sim.metrics().time).toBeCloseTo(STUCK_MIN_TIME, 1);
  });

  it('driving into a pit: fell (a rover standing on its wheels at the bottom of a pit has fallen too)', async () => {
    const sim = await make(withGap(flat(), 8, 16), TWO);
    expect(runOut(sim)).toBe('fell');
    expect(FALL_Y).toBeGreaterThan(-3 + ROVER_R + 0.4); // the pit floor + the dome + a wheel's height
    expect(FALL_Y).toBeLessThan(-1.2 + ROVER_R); // the lowest real ground (the Canyon dip) + a dome on its side
  });

  it('no `flipped` outcome: a jet and no wheels rolls the dome over, and the run just goes on until it is stuck', async () => {
    const sim = await make(flat(), [['jet', 180]]);
    expect(runOut(sim)).toBe('stuck');
    expect(sim.metrics().time).toBeGreaterThan(STUCK_MIN_TIME - 0.1);
  });
});

describe('vehicle sim: upside down (2026-10-05)', () => {
  afterEach(() => {
    for (const s of sims.splice(0)) s.destroy();
  });

  it('the motor sign rule: below the dome spins the normal way, above it the other way', () => {
    const dome = { x: 3, y: 1 };
    const d = 1.15; // a cup wheel's axle from the dome's centre
    const at = (deg: number): Vec2 => ({ x: dome.x + d * Math.cos(deg * DEG), y: dome.y + d * Math.sin(deg * DEG) });
    expect(driveSign(at(-45), dome, false)).toBe(DRIVE_SIGN);
    expect(driveSign(at(-135), dome, false)).toBe(DRIVE_SIGN);
    expect(driveSign(at(90), dome, false)).toBe(-DRIVE_SIGN);
    expect(driveSign(at(45), dome, false)).toBe(-DRIVE_SIGN);
    expect(driveSign(at(135), dome, false)).toBe(-DRIVE_SIGN);
    // Side wheels: the same rule, with ABOVE_DEG of slack, so a nose wheel near the level keeps
    // the normal (climbing) spin.
    expect(ABOVE_DEG).toBeCloseTo((20 * Math.PI) / 180, 9);
    expect(driveSign(at(0), dome, false)).toBe(DRIVE_SIGN);
    expect(driveSign(at(180), dome, false)).toBe(DRIVE_SIGN);
    expect(driveSign(at(15), dome, false)).toBe(DRIVE_SIGN);
    expect(driveSign(at(25), dome, false)).toBe(-DRIVE_SIGN);
    // A wheel resting on the ground always spins the normal way, even above the dome's centre
    // (the front wheel of a rover tipped nose-up on a steep hill).
    expect(driveSign(at(25), dome, true)).toBe(DRIVE_SIGN);
    expect(driveSign(at(90), dome, true)).toBe(DRIVE_SIGN);
  });

  it('started upside down, a rover with wheels on top AND bottom still drives forward (+x) to the beacon', async () => {
    const sim = await makeUpsideDown(flat(), SANDWICH);
    const angle0 = sim.snapshot().transforms.get(sim.roverBody)!.angle;
    expect(Math.cos(angle0)).toBeLessThan(-0.99); // on its roof
    sim.play();
    runFor(sim, 1);
    // The wheels stuck on top are underneath now: they spin the normal way and drive; the ones
    // stuck on the bottom are on top and spin the other way in the air.
    const targets = sim.motorTargets();
    expect(Math.sign(targets[0]!)).toBe(-DRIVE_SIGN); // stuck on at -45, now on top
    expect(Math.sign(targets[1]!)).toBe(-DRIVE_SIGN); // -135
    expect(Math.sign(targets[2]!)).toBe(DRIVE_SIGN); // stuck on at 45, now underneath
    expect(Math.sign(targets[3]!)).toBe(DRIVE_SIGN); // 135
    for (let i = 0; i < Math.ceil(30 / FIXED_DT) && sim.outcome === 'running'; i++) sim.step();
    expect(sim.outcome).toBe('finished');
    const m = sim.metrics();
    expect(m.time).toBeLessThan(5); // as fast as right way up
    expect(m.upsideDown).toBeGreaterThan(20); // all the way on its roof
    expect(Math.cos(sim.snapshot().transforms.get(sim.roverBody)!.angle)).toBeLessThan(-0.9);
  });

  it('started upside down with wheels only on the bottom, the wheels spin in the air: stuck (not flipped)', async () => {
    const sim = await makeUpsideDown(flat(), TWO);
    expect(runOut(sim)).toBe('stuck');
    expect(sim.metrics().distance).toBeLessThan(2);
  });

  it('the upsideDown metric: meters gained on the roof (past ROOF_ANGLE); 0 for a rover that stays upright', async () => {
    expect(ROOF_ANGLE).toBeCloseTo(1.745, 3);
    const upright = await make(flat(), SANDWICH);
    expect(runOut(upright)).toBe('finished');
    expect(upright.metrics().upsideDown).toBe(0);
  });

  it('a level may allow more time than TIMEOUT_S (the long challenges)', async () => {
    const level = { ...makeLevel(flat()), timeout: 40 };
    const sim = await createVehicleSim(rig(flat(), [['wheelSquare', -90, 'spring']]), level);
    sims.push(sim);
    expect(runOut(sim, 45)).toBe('timeout');
    expect(sim.metrics().time).toBeCloseTo(40, 1);
    expect(TIMEOUT_S).toBe(30);
  });

  it('one square wheel on a spring under the dome crawls but never arrives: timeout', async () => {
    const sim = await make(flat(), [['wheelSquare', -90, 'spring']]);
    expect(runOut(sim)).toBe('timeout');
    expect(sim.metrics().time).toBeCloseTo(TIMEOUT_S, 1);
  });

  it('effects while driving: the jet flame points out of the nozzle, the stove puffs smoke, the speed shows', async () => {
    const sim = await make(flat(), [...TWO, ['jet', 180], ['stove', 155]]);
    sim.play();
    sim.step();
    const overlay = sim.snapshot().overlay ?? [];
    const flame = overlay.find((o) => o.kind === 'sprite' && o.textureKey === PICS.thrust.key);
    expect(flame).toBeDefined();
    if (flame?.kind === 'sprite') {
      // Behind the dome, pointing back (-x): the picture's base faces the jet.
      expect(flame.p.x).toBeLessThan(pos(sim, sim.roverBody).x - 1);
      expect(Math.cos(flame.angle! + Math.PI)).toBeLessThan(-0.9);
    }
    expect(overlay.some((o) => o.kind === 'sprite' && o.textureKey === PICS.poof.key)).toBe(true);
    expect(overlay.some((o) => o.kind === 'label' && o.id === 'speed')).toBe(true);
    runFor(sim, 0.7); // the stove's off phase
    const later = sim.snapshot().overlay ?? [];
    expect(later.some((o) => o.kind === 'sprite' && o.textureKey === PICS.poof.key)).toBe(false);
    expect(later.some((o) => o.kind === 'sprite' && o.textureKey === PICS.thrust.key)).toBe(true);
  });

  it('the shadow keeps to the ground under the dome while it drives', async () => {
    const sim = await make(flat(), TWO);
    sim.play();
    runFor(sim, 2);
    const items = sim.renderItems();
    const shadow = items.find((i) => i.role === 'shadow')!;
    const s = pos(sim, shadow.body);
    expect(s.x).toBeCloseTo(pos(sim, sim.roverBody).x, 0);
    expect(s.y).toBeCloseTo(0.02, 2);
  });

  it('a spring wheel sags under the dome when the run starts (soft), a cup wheel does not', async () => {
    const soft = await make(flat(), [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']], false);
    const hard = await make(flat(), TWO, false);
    const y0 = [pos(soft, soft.roverBody).y, pos(hard, hard.roverBody).y];
    soft.play();
    hard.play();
    runFor(soft, 1);
    runFor(hard, 1);
    expect(y0[0]! - pos(soft, soft.roverBody).y).toBeGreaterThan(0.03);
    expect(Math.abs(y0[1]! - pos(hard, hard.roverBody).y)).toBeLessThan(0.03);
  });

  it('draw order: terrain, shadow, scenery, every attachment, then Kevin and the dome on top', async () => {
    const sim = await make(flat(), [...TWO, ['beans', 0]]);
    const items = sim.renderItems();
    const roles = items.map((i) => i.role);
    expect(roles[0]).toBe('terrain');
    expect(roles.indexOf('shadow')).toBeLessThan(roles.indexOf('wheel'));
    expect(roles.slice(-2)).toEqual(['kevin', 'rover']);
    expect(sim.handles()[0]!.kind).toBe('rover');
  });

  it('is deterministic: the same build drives the same way', async () => {
    const a = await make(flat(), [...TWO, ['stove', 180], ['watermelon', 90, 'spring']]);
    const b = await make(flat(), [...TWO, ['stove', 180], ['watermelon', 90, 'spring']]);
    a.play();
    b.play();
    runFor(a, 3);
    runFor(b, 3);
    expect(pos(a, a.roverBody)).toEqual(pos(b, b.roverBody));
    expect(a.metrics()).toEqual(b.metrics());
  });
});
