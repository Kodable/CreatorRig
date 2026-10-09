// Planets and surfaces (2026-10-09): the tables, the lookups, and what they do to a rover in the
// sim. Speeds below were measured with these numbers (two wheels at -45/-135 on flat ground,
// seconds 4-8 of the run): on Mars rock round 6.0 m/s, square 1.9, star 1.9; on Mars sand round
// 0.9, square 0.2, star 1.9; on Europa ice round 0.4, square 0.5, star 1.9.
import { afterEach, describe, expect, it } from 'vitest';
import { GROUND_COLORS, buildTerrain, levelGround } from './build';
import { DRIVE, WHEEL } from './catalog';
import { PLANETS, PLANET_IDS, gravityOf } from './planets';
import { rimPoint } from './geometry';
import { VehicleSim, createVehicleSim } from './sim';
import { SURFACES, SURFACE_KINDS, grip, ice, rockRanges, sand, sinkDepth, surfaceAt, surfaceRuns, tangentAt } from './surfaces';
import type { SurfaceRange } from './surfaces';
import { clipProfile, flat, heightAt, withRampToLip, withRocks, withSlope } from './terrain';
import type { PlanetId } from './planets';
import type { AttachmentKind, RoverPart, Vec2, VehicleLevel } from './types';
import { createWorld, FIXED_DT } from '../../../physics';

const DEG = Math.PI / 180;

function makeLevel(planet: PlanetId, terrain: Vec2[], surfaces?: SurfaceRange[], extra: Partial<VehicleLevel> = {}): VehicleLevel {
  return { id: 'test', planet, title: 'Test', bruno: '', goals: [], parts: [], palette: [], hints: [], failHints: {}, terrain, timeout: 60, ...(surfaces ? { surfaces } : {}), ...extra };
}

type Stick = [AttachmentKind, number, ('cup' | 'spring')?];
const two = (kind: AttachmentKind): Stick[] => [[kind, -45], [kind, -135]];

function rig(terrain: Vec2[], sticks: Stick[], more: RoverPart[] = []): RoverPart[] {
  const rover: RoverPart = { id: 1, kind: 'rover', x: 3, y: heightAt(terrain, 3) + 1, props: {}, locked: true, lockPosition: true };
  return [
    rover,
    ...sticks.map(([kind, deg, mount], i): RoverPart => {
      const p = rimPoint(deg * DEG);
      return { id: 10 + i, kind, x: rover.x + p.x, y: rover.y + p.y, props: { mount: mount ?? 'cup' } };
    }),
    ...more,
  ];
}

const sims: VehicleSim[] = [];
afterEach(() => {
  for (const s of sims.splice(0)) s.destroy();
});

async function drive(level: VehicleLevel, sticks: Stick[], seconds: number, more: RoverPart[] = []): Promise<{ sim: VehicleSim; x: number[] }> {
  const sim = await createVehicleSim(rig(level.terrain, sticks, more), level);
  sims.push(sim);
  sim.play();
  const x: number[] = [];
  for (let i = 1; i <= Math.round(seconds / FIXED_DT); i++) {
    sim.step();
    if (i % 60 === 0) x.push(sim.snapshot().transforms.get(sim.roverBody)!.position.x);
  }
  return { sim, x };
}

/** Mean speed (m/s) from second `a` to second `b` of a `drive` trace. */
const speed = (x: number[], a: number, b: number): number => (x[b - 1]! - x[a - 1]!) / (b - a);

describe('planets', () => {
  it('Flooftopia 10 (the old gravity, so the intros keep their solutions), Mars 3.7, Europa 1.3; grass, rock, ice; a look each', () => {
    expect(PLANET_IDS).toEqual(['flooftopia', 'mars', 'europa']);
    expect(PLANETS.flooftopia).toMatchObject({ name: 'Flooftopia', gravity: 10, ground: 'grass', look: 'flooftopia' });
    expect(PLANETS.mars).toMatchObject({ name: 'Mars', gravity: 3.7, ground: 'rock', look: 'mars' });
    expect(PLANETS.europa).toMatchObject({ name: 'Europa', gravity: 1.3, ground: 'ice', look: 'europa' });
    expect(gravityOf('mars')).toEqual({ x: 0, y: -3.7 });
  });

  it('the wheel motors pull in proportion to gravity: the old torque on Flooftopia exactly', () => {
    expect(PLANETS.flooftopia.driveTorque).toBe(DRIVE.torque);
    for (const id of PLANET_IDS) expect(PLANETS[id].driveTorque).toBeCloseTo((DRIVE.torque * PLANETS[id].gravity) / 10, 12);
  });
});

describe('surfaces: the tables and lookups', () => {
  it('grass and rock are the old ground: friction 0.8 under wheels of friction 1 (grip 0.9)', () => {
    for (const kind of ['grass', 'rock'] as const) {
      expect(SURFACES[kind].groundFriction).toBe(0.8);
      for (const w of ['wheelCircle', 'wheelSquare', 'wheelStar'] as const) {
        expect(SURFACES[kind].wheelFriction[w]).toBe(WHEEL[w].friction);
        expect(grip(kind, w)).toBeCloseTo(0.9, 12);
      }
      expect(SURFACES[kind].drag).toBeUndefined();
    }
  });

  it('sand: round and square wheels grip 0.55 as well (0.495) and plough; the star keeps full grip and barely drags', () => {
    expect(grip('sand', 'wheelCircle')).toBeCloseTo(0.495, 12);
    expect(grip('sand', 'wheelSquare')).toBeCloseTo(0.495, 12);
    expect(grip('sand', 'wheelStar')).toBeCloseTo(0.9, 12);
    const drag = SURFACES.sand.drag!;
    expect(drag.crr).toEqual({ wheelCircle: 0.22, wheelSquare: 0.3, wheelStar: 0.07 });
    expect(drag.perSpeed.wheelStar).toBeLessThan(drag.perSpeed.wheelCircle);
  });

  it('ice: round and square wheels grip 0.06-0.07, the star 0.5', () => {
    expect(SURFACES.ice.groundFriction).toBe(0);
    expect(grip('ice', 'wheelCircle')).toBeCloseTo(0.06, 12);
    expect(grip('ice', 'wheelSquare')).toBeCloseTo(0.07, 12);
    expect(grip('ice', 'wheelStar')).toBeCloseTo(0.5, 12);
    expect(SURFACES.ice.drag).toBeUndefined();
  });

  it('surfaceAt: the planet ground outside the ranges; later ranges paint over earlier ones', () => {
    const ranges = [sand(10, 30), ...rockRanges([{ x: 20, w: 1, h: 0.3 }]), ice(40, 50)];
    expect(surfaceAt(ranges, 'rock', 5)).toBe('rock');
    expect(surfaceAt(ranges, 'rock', 10)).toBe('sand');
    expect(surfaceAt(ranges, 'rock', 19.4)).toBe('sand');
    expect(surfaceAt(ranges, 'rock', 20)).toBe('rock');
    expect(surfaceAt(ranges, 'rock', 30)).toBe('rock'); // `to` is exclusive
    expect(surfaceAt(ranges, 'grass', 45)).toBe('ice');
    expect(surfaceAt(undefined, 'ice', 45)).toBe('ice');
  });

  it('surfaceRuns: contiguous runs covering the profile exactly, same-kind neighbours merged', () => {
    const runs = surfaceRuns([sand(10, 30), sand(30, 35), ...rockRanges([{ x: 20, w: 1, h: 0.3 }])], 'rock', -1, 91);
    expect(runs).toEqual([
      { from: -1, to: 10, kind: 'rock' },
      { from: 10, to: 19.5, kind: 'sand' },
      { from: 19.5, to: 20.5, kind: 'rock' },
      { from: 20.5, to: 35, kind: 'sand' },
      { from: 35, to: 91, kind: 'rock' },
    ]);
    expect(surfaceRuns(undefined, 'grass', -1, 91)).toEqual([{ from: -1, to: 91, kind: 'grass' }]);
  });

  it('a heavier load per wheel sinks deeper in sand; nothing sinks in rock or ice', () => {
    expect(sinkDepth('sand', 'wheelCircle', 15)).toBeGreaterThan(sinkDepth('sand', 'wheelCircle', 5));
    expect(sinkDepth('sand', 'wheelStar', 5)).toBeLessThan(sinkDepth('sand', 'wheelCircle', 5));
    for (const k of ['rock', 'grass', 'ice'] as const) expect(sinkDepth(k, 'wheelCircle', 20)).toBe(0);
  });

  it('tangentAt follows the slope', () => {
    const t = tangentAt(withSlope(flat(), 10, 20, 10 * Math.tan(15 * DEG)), 15);
    expect(Math.atan2(t.y, t.x) / DEG).toBeCloseTo(15, 6);
    expect(tangentAt(flat(), 5)).toEqual({ x: 1, y: 0 });
  });
});

describe('surfaces: the ground as built', () => {
  it('withRocks raises a lump h tall over w, the ground beside it untouched', () => {
    const t = withRocks(flat(), [{ x: 20, w: 1, h: 0.3 }]);
    expect(heightAt(t, 20)).toBeCloseTo(0.3, 6);
    expect(heightAt(t, 19.45)).toBe(0);
    expect(heightAt(t, 20.55)).toBe(0);
    expect(heightAt(t, 19.6)).toBeGreaterThan(0.2); // steep sides
  });

  it('clipProfile cuts a stretch with exact end points', () => {
    const t = withSlope(flat(), 10, 20, 2);
    expect(clipProfile(t, 12, 30)).toEqual([{ x: 12, y: 0.4 }, { x: 20, y: 2 }, { x: 30, y: 2 }]);
  });

  it('buildTerrain: one chain per surface run with its ground friction (a box slides on the ice stretch, stops on the sand); per-surface colours; a picture per rock', async () => {
    const world = await createWorld({ gravity: gravityOf('mars') });
    const rocks = [{ x: 60, w: 1, h: 0.3 }];
    const profile = withRocks(flat(), rocks);
    const { items } = buildTerrain(world, profile, levelGround(profile, [ice(10, 40), sand(40, 80), ...rockRanges(rocks)], 'rock', rocks));
    const colors = new Set(items.map((i) => i.color));
    for (const kind of ['rock', 'ice', 'sand'] as const) expect(colors.has(GROUND_COLORS[kind].crust), kind).toBe(true);
    expect(items.filter((i) => i.textureKey?.startsWith('rv-rock-'))).toHaveLength(1);
    const slide = (x: number): number => {
      const box = world.createBody({ position: { x, y: 0.25 }, linearVelocity: { x: 3, y: 0 }, canSleep: false });
      world.addShape(box, { kind: 'box', halfWidth: 0.25, halfHeight: 0.25 }, { friction: 0.6 });
      return box;
    };
    const onIce = slide(15);
    const onSand = slide(45);
    // Grip (0.6 + 0) / 2 on ice and (0.6 + 0.8) / 2 on sand: from 3 m/s at 3.7 m/s^2 they stop
    // after ~4.1 m and ~1.7 m.
    for (let i = 0; i < 150; i++) world.step(FIXED_DT, 4);
    expect(world.getTransform(onIce).position.x - 15).toBeGreaterThan(3.5);
    expect(world.getTransform(onSand).position.x - 45).toBeLessThan(2);
    world.destroy();
    for (const kind of SURFACE_KINDS) expect(GROUND_COLORS[kind].crust).not.toBe(GROUND_COLORS[kind].under);
  });
});

describe('surfaces: in the sim', () => {
  it("a level's planet gravity reaches the world: a boulder dropped from 6 m falls g t^2 / 2 in 0.5 s", async () => {
    for (const planet of PLANET_IDS) {
      const boulder: RoverPart = { id: 3, kind: 'block', x: 20, y: 6, props: { size: '1x1', material: 'rock' }, locked: true, lockPosition: true };
      const { sim } = await drive(makeLevel(planet, flat()), [], 0.5, [boulder]);
      const body = sim.handles().find((h) => h.kind === 'block')!.bodies[0]!.id;
      const fell = 6 - sim.snapshot().transforms.get(body)!.position.y;
      expect(fell, planet).toBeCloseTo((PLANETS[planet].gravity * 0.25) / 2, 1);
    }
  });

  it('every wheel gets the grip of the ground under it: catalog friction on rock, low on ice, back again', async () => {
    const level = makeLevel('mars', flat(), [ice(3.5, 6)]);
    const sim = await createVehicleSim(rig(level.terrain, two('wheelCircle')), level);
    sims.push(sim);
    sim.play();
    sim.step();
    // The front wheel (x ~3.8) starts on the ice, the back one (x ~2.2) on rock.
    const first = sim.wheelGround();
    expect(first.map((w) => w.surface)).toEqual(['ice', 'rock']);
    expect(first[0]!.friction).toBe(SURFACES.ice.wheelFriction.wheelCircle);
    expect(first[1]!.friction).toBe(WHEEL.wheelCircle.friction);
    for (let i = 0; i < 600 && sim.snapshot().transforms.get(sim.roverBody)!.position.x < 8; i++) sim.step();
    expect(sim.wheelGround()).toEqual([
      { surface: 'rock', friction: WHEEL.wheelCircle.friction, sink: 0 },
      { surface: 'rock', friction: WHEEL.wheelCircle.friction, sink: 0 },
    ]);
  });

  it('on flat Europa ice two round wheels barely move while two star wheels drive', async () => {
    const round = await drive(makeLevel('europa', flat()), two('wheelCircle'), 6);
    const star = await drive(makeLevel('europa', flat()), two('wheelStar'), 6);
    expect(round.x[5]! - 3).toBeLessThan(1.5);
    expect(star.x[5]! - 3).toBeGreaterThan(5);
  });

  it('a fan pushes on ice no matter what: two round wheels and a fan cross Europa ice', async () => {
    const r = await drive(makeLevel('europa', flat()), [...two('wheelCircle'), ['fan', 180]], 4);
    expect(r.x[3]! - 3).toBeGreaterThan(5);
  });

  it('on flat Mars sand round wheels are much slower than on rock and slower than stars, but still move; the wheels are drawn sunk', async () => {
    const sandLevel = makeLevel('mars', flat(), [sand(-1, 91)]);
    const rock = await drive(makeLevel('mars', flat()), two('wheelCircle'), 8);
    const round = await drive(sandLevel, two('wheelCircle'), 8);
    const star = await drive(sandLevel, two('wheelStar'), 8);
    const vRock = speed(rock.x, 4, 8);
    const vRound = speed(round.x, 4, 8);
    const vStar = speed(star.x, 4, 8);
    expect(vRock).toBeGreaterThan(5.5);
    expect(vRound).toBeGreaterThan(0.5);
    expect(vRound).toBeLessThan(1.2);
    expect(vStar).toBeGreaterThan(1.5 * vRound);
    const sunk = round.sim.wheelGround();
    expect(sunk.every((w) => w.surface === 'sand' && w.sink > 0.04)).toBe(true);
    expect(star.sim.wheelGround().every((w) => w.sink < sunk[0]!.sink)).toBe(true);
  });

  it('a 15 degree sand slope stops round wheels; star wheels climb it', async () => {
    const terrain = withSlope(flat(), 8, 18, 10 * Math.tan(15 * DEG));
    const level = makeLevel('mars', terrain, [sand(-1, 91)]);
    const round = await drive(level, two('wheelCircle'), 12);
    const star = await drive(level, two('wheelStar'), 12);
    expect(round.sim.outcome).toBe('stuck');
    expect(Math.max(...round.x)).toBeLessThan(9.5);
    expect(star.sim.outcome).toBe('running');
    expect(star.x[11]!).toBeGreaterThan(15);
  });

  it('heavy rovers sink more: pushed by a fan on Mars sand, a watermelon build is slower than a feather build', async () => {
    const level = makeLevel('mars', flat(), [sand(-1, 91)]);
    const feather = await drive(level, [...two('wheelCircle'), ['feather', 90], ['fan', 180]], 8);
    const melon = await drive(level, [...two('wheelCircle'), ['watermelon', 90], ['fan', 180]], 8);
    expect(speed(melon.x, 4, 8)).toBeLessThan(0.75 * speed(feather.x, 4, 8));
  });

  it('lower gravity, longer jumps: the same rover off the same ramp flies farther on Mars than on Flooftopia', async () => {
    const terrain = withRampToLip(flat(), 9, 15, 1, 60, -0.5);
    const lip = 9 + 1 / Math.tan(15 * DEG);
    const flight = async (planet: PlanetId): Promise<number> => {
      const level = makeLevel(planet, terrain);
      const sim = await createVehicleSim(rig(terrain, two('wheelCircle')), level);
      sims.push(sim);
      sim.play();
      for (let i = 0; i < 1200; i++) {
        sim.step();
        const p = sim.snapshot().transforms.get(sim.roverBody)!.position;
        if (p.x > lip + 0.5 && p.y < 1.5) return p.x - lip;
      }
      return Infinity;
    };
    const home = await flight('flooftopia');
    const mars = await flight('mars');
    expect(mars).toBeGreaterThan(home * 1.25);
  });

  it('grass and rock levels run exactly as before: same trace on a grass level as on a level with no planet ground at all', async () => {
    // The old sim had one chain at friction 0.8 and wheel friction 1; a grass level must reproduce
    // it step for step (the Flooftopia intros' proven solutions depend on it).
    const a = await drive(makeLevel('flooftopia', flat()), two('wheelCircle'), 3);
    const b = await drive(makeLevel('flooftopia', flat(), [{ from: -1, to: 91, kind: 'rock' }]), two('wheelCircle'), 3);
    expect(a.x).toEqual(b.x);
  });
});
