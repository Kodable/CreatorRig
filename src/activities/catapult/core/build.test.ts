import { afterEach, describe, expect, it } from 'vitest';
import {
  armAngleFor,
  armArtBox,
  ART_PPM,
  BAND_ASPECTS,
  BAND_THICKNESS,
  BASE_ART,
  bandSegments,
  bandSprite,
  buildArm,
  buildGround,
  buildPart,
  catapultBaseBounds,
  catapultPocketAtRest,
  catapultRelease,
  crossbarPoseFor,
  cupCoverBox,
  fireSpot,
  fuzzTextureKey,
  FIRE_DX,
  FIRE_DY,
  GEAR_R,
  hookSprite,
  isTarget,
  LEVER_ART,
  LEVER_LENGTH,
  PIVOT_DX,
  PIVOT_DY,
  POCKET_DY,
  REST_ANGLE,
  REST_ANGLE_DEG,
  stringAnchor,
  WORLD_H,
  WORLD_W,
} from './build';
import { ARM, BAND_COLOR, BAND_COUNT, FUZZ, FUZZ_NAMES, FUZZ_TINT } from './catalog';
import type { PlacedPart } from './types';
import { createWorld } from '../../../physics';
import type { PhysicsWorld } from '../../../physics/types';
import { FIXED_DT, FIXED_SUBSTEPS } from '../../../physics/types';

function catapultPart(overrides: Partial<PlacedPart['props']> = {}, x = 5, y = 0): PlacedPart {
  return {
    id: 1,
    kind: 'catapult',
    x,
    y,
    props: { power: 'Medium', angle: '45', fuzz: 'Fur', arm: 'Short', ...overrides },
  };
}

/** Same formula as `build.ts`'s `armTipPoint`: a world point on the arm at body-angle
 * `armAngleRad`, offset POCKET_DY along the arm's local leading face. Used here purely to derive
 * the expected geometry independently of importing a private helper. */
function expectedArmPoint(part: PlacedPart, armAngleRad: number): { x: number; y: number } {
  const armSpec = ARM[part.props.arm ?? 'Short'] ?? ARM.Short!;
  const pivot = { x: part.x + PIVOT_DX, y: part.y + PIVOT_DY };
  const c = Math.cos(armAngleRad);
  const s = Math.sin(armAngleRad);
  return {
    x: pivot.x + armSpec.length * c + POCKET_DY * s,
    y: pivot.y + armSpec.length * s - POCKET_DY * c,
  };
}

describe('catapult build', () => {
  let world: PhysicsWorld | null = null;
  afterEach(() => {
    world?.destroy();
    world = null;
  });

  it('WORLD_W/H match the plan (30 x 15 m)', () => {
    expect(WORLD_W).toBe(30);
    expect(WORLD_H).toBe(15);
  });

  it('rest geometry constants match the plan (rear-facing arm)', () => {
    expect(REST_ANGLE_DEG).toBe(200);
    expect(PIVOT_DX).toBe(0.2);
    expect(PIVOT_DY).toBe(1.6);
    expect(REST_ANGLE).toBeCloseTo((200 * Math.PI) / 180, 10);
  });

  it('crossbarPoseFor: the stop bar sits at armAngleFor(angle) - i.e. it rotates with the angle ' +
    'chip (variant A: the stop pose is the release pose itself)', () => {
    for (const deg of [15, 30, 45, 60, 75]) {
      const part = catapultPart({ angle: String(deg) }, 5, 0);
      const { pos, angle } = crossbarPoseFor(part);
      const pivot = { x: 5 + PIVOT_DX, y: 0 + PIVOT_DY };
      const stopDirRad = armAngleFor(deg);
      expect(pos.x).toBeCloseTo(pivot.x + 0.75 * Math.cos(stopDirRad), 6);
      expect(pos.y).toBeCloseTo(pivot.y + 0.75 * Math.sin(stopDirRad), 6);
      expect(angle).toBeCloseTo(stopDirRad + Math.PI / 2, 6);
    }
  });

  it('armAngleFor(releaseDeg) = 90 + releaseDeg, in radians, for every angle chip', () => {
    for (const deg of [15, 30, 45, 60, 75]) {
      expect(armAngleFor(deg)).toBeCloseTo(((90 + deg) * Math.PI) / 180, 10);
    }
  });

  it('catapultRelease: Medium power + 45deg + Short arm gives speed 9.5 at 45deg', () => {
    const part = catapultPart();
    const { v, releaseAngle } = catapultRelease(part);
    expect(releaseAngle).toBeCloseTo(Math.PI / 4, 5);
    const speed = Math.hypot(v.x, v.y);
    expect(speed).toBeCloseTo(9.5, 5); // 10 (Medium) * 0.95 (Short factor)
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeGreaterThan(0);
  });

  it('catapultRelease: velocity direction equals the angle prop, for every angle chip', () => {
    for (const deg of [15, 30, 45, 60, 75]) {
      const { v } = catapultRelease(catapultPart({ angle: String(deg) }));
      const measuredDeg = (Math.atan2(v.y, v.x) * 180) / Math.PI;
      expect(measuredDeg).toBeCloseTo(deg, 5);
    }
  });

  it('catapultRelease: tip is the pocket point at armAngleFor(angleDeg) - pivot + rotate((L, ' +
    '-POCKET_DY), armAngle) - not the bare pivot + L*(cos,sin) point', () => {
    const part = catapultPart({}, 5, 0);
    const { tip } = catapultRelease(part);
    const expected = expectedArmPoint(part, armAngleFor(45));
    expect(tip.x).toBeCloseTo(expected.x, 6);
    expect(tip.y).toBeCloseTo(expected.y, 6);
    // Measured: about (3.96, 3.19) for a Short arm from (5, 0).
    expect(tip.x).toBeCloseTo(3.9626, 3);
    expect(tip.y).toBeCloseTo(3.1910, 3);
  });

  it('catapultPocketAtRest: the loaded-fuzz pocket at REST_ANGLE, same formula as catapultRelease ' +
    'but evaluated at REST_ANGLE instead of the release angle', () => {
    const part = catapultPart({}, 5, 0);
    const pocket = catapultPocketAtRest(part);
    const expected = expectedArmPoint(part, REST_ANGLE);
    expect(pocket.x).toBeCloseTo(expected.x, 6);
    expect(pocket.y).toBeCloseTo(expected.y, 6);
  });

  it('a Long arm reaches farther from the pivot and its release speed factor is higher', () => {
    const short = catapultRelease(catapultPart({ arm: 'Short' }));
    const long = catapultRelease(catapultPart({ arm: 'Long' }));
    expect(Math.hypot(long.v.x, long.v.y)).toBeGreaterThan(Math.hypot(short.v.x, short.v.y));
    const pivot = { x: 5 + PIVOT_DX, y: 0 + PIVOT_DY };
    expect(Math.hypot(long.tip.x - pivot.x, long.tip.y - pivot.y)).toBeGreaterThan(
      Math.hypot(short.tip.x - pivot.x, short.tip.y - pivot.y),
    );
  });

  it('a Long arm at rest clears the ground (y=0) even with the Metal fuzz (r 0.4) in the pocket', () => {
    const part = catapultPart({ arm: 'Long' }, 5, 0);
    const pocket = catapultPocketAtRest(part);
    expect(pocket.y - FUZZ.Metal!.r).toBeGreaterThan(0);
  });

  it('the arm body has no collider (mass 0) and is kinematic (ignores gravity)', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const part = catapultPart();
    const handle = buildPart(world, part);
    const arm = handle.bodies.find((b) => b.role === 'arm')!;
    expect(arm).toBeTruthy();
    expect(world.getMass(arm.id)).toBe(0);

    // The adapter normalizes angle to (-pi, pi], so REST_ANGLE (200deg > pi) comes back
    // wrapped (-160deg); compare via cos/sin rather than the raw radian value.
    const before = world.getTransform(arm.id);
    expect(Math.cos(before.angle)).toBeCloseTo(Math.cos(REST_ANGLE), 5);
    expect(Math.sin(before.angle)).toBeCloseTo(Math.sin(REST_ANGLE), 5);
    for (let i = 0; i < 30; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    const after = world.getTransform(arm.id);
    // A dynamic body (even a nominally massless one) would fall under gravity; a kinematic
    // body with no velocity commanded stays exactly put.
    expect(after.position.y).toBeCloseTo(before.position.y, 5);
    expect(after.angle).toBeCloseTo(before.angle, 5);
  });

  it('setAngularVelocity sweeps the kinematic arm', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const part = catapultPart();
    const handle = buildPart(world, part);
    const arm = handle.bodies.find((b) => b.role === 'arm')!;
    const before = world.getTransform(arm.id).angle;
    world.setAngularVelocity(arm.id, 2); // rad/s
    world.step(FIXED_DT, FIXED_SUBSTEPS);
    const after = world.getTransform(arm.id).angle;
    expect(after).toBeGreaterThan(before);
  });

  it('the loaded fuzz visual rides the arm before Play, sized/tinted by the fuzz prop', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    for (const name of FUZZ_NAMES) {
      const handle = buildPart(world, catapultPart({ fuzz: name }));
      const fuzz = handle.visuals.find((v) => v.role === 'fuzz')!;
      expect(fuzz.shape).toEqual({ kind: 'circle', r: FUZZ[name]!.r, cx: ARM.Short!.length, cy: -POCKET_DY });
      expect(fuzz.color).toBe(FUZZ_TINT[name]);
      expect(fuzz.upright).toBe(true);
      // The loaded-fuzz visual rides the arm body, not its own body.
      const arm = handle.bodies.find((b) => b.role === 'arm')!;
      expect(fuzz.body).toBe(arm.id);
    }
  });

  it('the loaded fuzz visual carries a fuzz-<name> textureKey; a part saved before the merge ' +
    'maps its weight onto the matching fuzz', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    for (const name of FUZZ_NAMES) {
      const handle = buildPart(world, catapultPart({ fuzz: name }));
      expect(handle.visuals.find((v) => v.role === 'fuzz')!.textureKey).toBe(`fuzz-${name}`);
    }
    const legacy = buildPart(world, { id: 1, kind: 'catapult', x: 5, y: 0, props: { power: 'Medium', angle: '45', weight: 'Heavy', fuzz: 'Blue', arm: 'Short' } });
    expect(legacy.visuals.find((v) => v.role === 'fuzz')!.textureKey).toBe('fuzz-Metal');
  });

  it('fuzzTextureKey: fuzz-<name>, -excited for the flying face', () => {
    expect(fuzzTextureKey({ fuzz: 'Donut' })).toBe('fuzz-Donut');
    expect(fuzzTextureKey({ fuzz: 'Donut' }, true)).toBe('fuzz-Donut-excited');
    expect(fuzzTextureKey({})).toBe('fuzz-Fur');
  });

  it('the arm carries, in draw order: the arm picture, the star gear at the pivot (turning with ' +
    'the arm), the loaded fuzz, then the cup\'s front half over it - and no kettlebell gear', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    for (const arm of ['Short', 'Long']) {
      const L = ARM[arm]!.length;
      const handle = buildArm(world, catapultPart({ arm }, 5, 0));
      expect(handle.visuals.map((v) => v.textureKey)).toEqual([`real-arm-${arm}`, 'real-gear', 'fuzz-Fur', 'real-cup']);
      expect(handle.visuals.some((v) => v.role === 'fuzzGear' || v.textureKey?.startsWith('gear-'))).toBe(false);
      for (const v of handle.visuals) expect(v.body).toBe(handle.id);

      const gear = handle.visuals[1]!;
      expect(gear.shape).toEqual({ kind: 'circle', r: GEAR_R });
      expect(gear.upright).toBeFalsy();

      const cup = handle.visuals[3]!;
      expect(cup.shape).toEqual({ kind: 'box', ...cupCoverBox(L) });
      // Over the cup: centred on the pocket's x, between the rim (the pocket side) and the bowl.
      if (cup.shape.kind === 'box') {
        expect(cup.shape.cx).toBeCloseTo(L, 2);
        expect(cup.shape.w).toBeCloseTo(333 / ART_PPM, 9);
        expect(cup.shape.cy! - cup.shape.h / 2).toBeGreaterThan(-POCKET_DY); // the fuzz centre peeks over it
        expect(cup.shape.cy! - cup.shape.h / 2).toBeLessThan(0);
      }
    }
    // The stopped arm (fuzz already flying) keeps its gear and cup, minus the fuzz.
    const stopped = buildArm(world, catapultPart({}, 5, 0), armAngleFor(45), false);
    expect(stopped.visuals.map((v) => v.textureKey)).toEqual(['real-arm-Short', 'real-gear', 'real-cup']);
  });

  it('no power-pack visual rides the frame any more - power is drawn as rubber bands ' +
    '(sim.ts overlay, bandSegments), not a picture on the machine', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    for (const power of ['Low', 'Medium', 'High', 'Max']) {
      const handle = buildPart(world, catapultPart({ power }));
      expect(handle.visuals.some((v) => v.textureKey?.startsWith('power-'))).toBe(false);
    }
  });

  it('one base picture (real-base) on the base body: its hub centre lands exactly on the pivot and ' +
    'its plank\'s bottom edge on the ground; the wheel, A-frame and crossbar bodies draw nothing', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const handle = buildPart(world, catapultPart({}, 5, 0));
    const baseBody = handle.bodies.find((b) => b.role === 'base')!;
    const base = handle.visuals.find((v) => v.role === 'base')!;
    expect(base.textureKey).toBe('real-base');
    expect(base.body).toBe(baseBody.id);
    expect(base.shape).toEqual({ kind: 'box', ...BASE_ART });
    if (base.shape.kind !== 'box') throw new Error('expected a box');
    const t = world.getTransform(baseBody.id);
    const left = t.position.x + base.shape.cx! - base.shape.w / 2;
    const top = t.position.y + base.shape.cy! + base.shape.h / 2;
    const bottom = t.position.y + base.shape.cy! - base.shape.h / 2;
    // real-base.png is 750 x 466 px with the hub centred 388.5 px in and 89.5 px down.
    const pxPerM = 750 / base.shape.w;
    expect(466 / base.shape.h).toBeCloseTo(pxPerM, 9); // not stretched
    // (The body transform is single precision, hence 6 places.)
    expect(left + 388.5 / pxPerM).toBeCloseTo(5 + PIVOT_DX, 6);
    expect(top - 89.5 / pxPerM).toBeCloseTo(0 + PIVOT_DY, 6);
    expect(bottom).toBeCloseTo(0, 6);
    // About 3.19 x 1.98 m: the whole A-frame plus a plank lip each side.
    expect(base.shape.w).toBeCloseTo(3.187, 3);
    expect(base.shape.h).toBeCloseTo(1.980, 3);

    for (const role of ['wheel']) expect(handle.visuals.some((v) => v.role === role)).toBe(false);
    const frameBodies = handle.bodies.filter((b) => b.role === 'frame').map((b) => b.id);
    const frameVisuals = handle.visuals.filter((v) => frameBodies.includes(v.body));
    expect(frameVisuals.map((v) => v.textureKey)).toEqual(['real-lever']); // only the lever, on the crossbar
    expect(handle.visuals.some((v) => v.textureKey?.startsWith('tex-'))).toBe(false);
  });

  it('the lever (real-lever) rides the crossbar body: from just inside the gear\'s ring out past ' +
    'the knob, 131 x 352 px at ART_PPM', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const handle = buildPart(world, catapultPart({}, 5, 0));
    const crossbarBody = handle.bodies.filter((b) => b.role === 'frame')[1]!.id; // A-frame, then crossbar
    const lever = handle.visuals.find((v) => v.textureKey === 'real-lever')!;
    expect(lever.body).toBe(crossbarBody);
    expect(lever.shape).toEqual({ kind: 'box', ...LEVER_ART });
    expect(LEVER_ART.w).toBeCloseTo(131 / ART_PPM, 9);
    expect(LEVER_ART.h).toBeCloseTo(352 / ART_PPM, 9);
    // Crossbar-local y: the pivot is +0.75, the knob (LEVER_LENGTH out) is -0.75.
    const stickEnd = LEVER_ART.cy + LEVER_ART.h / 2;
    const padEnd = LEVER_ART.cy - LEVER_ART.h / 2;
    expect(0.75 - stickEnd).toBeGreaterThan(0.335); // the stick's end hides under the gear's ring
    expect(0.75 - stickEnd).toBeLessThan(GEAR_R);
    // The pad's centre (78 px from its far end) sits on the knob.
    expect(padEnd + 78 / ART_PPM).toBeCloseTo(0.75 - LEVER_LENGTH, 9);
  });

  it('the lever stick runs from the pivot to LEVER_LENGTH past it along the stop direction, ' +
    'for every angle option', () => {
    for (const deg of [15, 30, 45, 60, 75]) {
      const part = catapultPart({ angle: String(deg) }, 5, 0);
      const pivot = { x: 5 + PIVOT_DX, y: 0 + PIVOT_DY };
      const { pos: crossbarPos, angle: crossbarAngle } = crossbarPoseFor(part);
      const c = Math.cos(crossbarAngle);
      const s = Math.sin(crossbarAngle);
      // Local (0, ly) -> world crossbarPos + (-s*ly, c*ly); ly=+0.75 (half the lever's own
      // height) is the pivot (cross-checked against crossbarPoseFor's own geometry), ly=-0.75 is
      // the lever's far end.
      const pivotFromBox = { x: crossbarPos.x - s * 0.75, y: crossbarPos.y + c * 0.75 };
      expect(pivotFromBox.x).toBeCloseTo(pivot.x, 5);
      expect(pivotFromBox.y).toBeCloseTo(pivot.y, 5);

      const farEnd = { x: crossbarPos.x + s * 0.75, y: crossbarPos.y - c * 0.75 };
      const stopDir = armAngleFor(deg);
      expect(farEnd.x).toBeCloseTo(pivot.x + LEVER_LENGTH * Math.cos(stopDir), 5);
      expect(farEnd.y).toBeCloseTo(pivot.y + LEVER_LENGTH * Math.sin(stopDir), 5);
    }
  });

  it('the arm picture (real-arm-<arm>) is one box at ART_PPM whose cup centre lands on the pocket ' +
    '(local x = L), its stick centreline on local y 0 and its pivot end under the gear\'s ring', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    for (const arm of ['Short', 'Long']) {
      const L = ARM[arm]!.length;
      const handle = buildPart(world, catapultPart({ arm }));
      const armVisual = handle.visuals.find((v) => v.textureKey === `real-arm-${arm}`)!;
      expect(armVisual.role).toBe('arm');
      expect(armVisual.shape).toEqual({ kind: 'box', ...armArtBox(arm) });
      const box = armArtBox(arm);
      const pxW = arm === 'Short' ? 560 : 800;
      expect(box.w).toBeCloseTo(pxW / ART_PPM, 9);
      expect(box.h).toBeCloseTo(132 / ART_PPM, 9);
      const left = box.cx - box.w / 2;
      expect(left).toBeGreaterThan(0.335); // under the gear's ring (r 0.335 .. 0.5)
      expect(left).toBeLessThan(GEAR_R);
      // The cup centre is 721 px from the uncut export's stick end, which the cut moved to `left`.
      const uncutStickEnd = left - (887 - pxW) / ART_PPM;
      expect(uncutStickEnd + 721 / ART_PPM).toBeCloseTo(L, 9);
      // Stick centreline (row 81.5 of 132 from the bowl side, local +y) on local y = 0.
      expect(box.cy + box.h / 2 - 81.5 / ART_PPM).toBeCloseTo(0, 9);
      // The loaded fuzz is drawn after the arm picture.
      expect(handle.visuals.findIndex((v) => v.role === 'fuzz')).toBeGreaterThan(handle.visuals.indexOf(armVisual));
    }
  });

  it('the A-frame and crossbar are static bodies with role "frame", each carrying a collider', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const part = catapultPart();
    const handle = buildPart(world, part);
    const frameBodies = handle.bodies.filter((b) => b.role === 'frame');
    expect(frameBodies).toHaveLength(2); // the A-frame upright + the crossbar
    for (const b of frameBodies) {
      // Static, so gravity never moves it; unlike the arm, each carries a real collider
      // (getMass reports the collider's own mass, which a static body still has - it's just
      // never integrated), so it's a solid obstacle, same treatment as the base.
      const before = world.getTransform(b.id);
      world!.step(FIXED_DT, FIXED_SUBSTEPS);
      const after = world!.getTransform(b.id);
      expect(after.position).toEqual(before.position);
      expect(world.getMass(b.id)).toBeGreaterThan(0);
    }
  });

  it('base + wheels + frame + arm bounds cover the base picture, the A-frame apex, and the ' +
    'rest-pose arm', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const part = catapultPart({}, 5, 0);
    const handle = buildPart(world, part);
    // The base picture spans x in [3.55, 6.74], y in [0, 1.98]; the arm reaches out past its left.
    expect(handle.bounds.x - handle.bounds.w / 2).toBeLessThanOrEqual(3.55);
    expect(handle.bounds.x + handle.bounds.w / 2).toBeGreaterThanOrEqual(6.73);
    expect(handle.bounds.y + handle.bounds.h / 2).toBeGreaterThan(1.98);
  });

  it('catapultBaseBounds is a big tap target spanning the base up through the A-frame apex ' +
    '(taller than the plan\'s rough ~1.6 m once the crossbar - which now sits at ' +
    'armAngleFor(angle) from the pivot, past the apex for every angle option - is folded in; ' +
    'see the final report)', () => {
    const part = catapultPart({}, 5, 0);
    const bounds = catapultBaseBounds(part);
    // The whole base picture: x - 1.451 .. x + 1.736.
    expect(bounds.x - bounds.w / 2).toBeCloseTo(5 + BASE_ART.cx - BASE_ART.w / 2, 6);
    expect(bounds.x + bounds.w / 2).toBeCloseTo(5 + BASE_ART.cx + BASE_ART.w / 2, 6);
    // Bottom at the base's foot (y=0), top at least past the frame apex (pivot height, y=1.6).
    expect(bounds.y - bounds.h / 2).toBeLessThanOrEqual(0.05);
    expect(bounds.y + bounds.h / 2).toBeGreaterThanOrEqual(1.6);
  });

  it('can/block are targets; shelf/wall/bullseye/catapult are not', () => {
    const mk = (kind: PlacedPart['kind']): PlacedPart => ({ id: 1, kind, x: 0, y: 0, props: {} });
    expect(isTarget(mk('can'))).toBe(true);
    expect(isTarget(mk('block'))).toBe(true);
    expect(isTarget(mk('shelf'))).toBe(false);
    expect(isTarget(mk('wall'))).toBe(false);
    expect(isTarget(mk('bullseye'))).toBe(false);
    expect(isTarget(mk('catapult'))).toBe(false);
  });

  it('buildGround: static ground (top at y=0) and static walls at x=-0.5 and 30.5', async () => {
    const w = (world = await createWorld({ gravity: { x: 0, y: -10 } }));
    const { ground, walls } = buildGround(w);
    const groundT = w.getTransform(ground);
    expect(groundT.position.y).toBeLessThan(0); // body centre below y=0; collider top sits at 0
    expect(walls).toHaveLength(2);
    const xs = walls.map((wallId) => w.getTransform(wallId).position.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-0.5, 5);
    expect(xs[1]).toBeCloseTo(WORLD_W + 0.5, 5);
  });

  it('bullseye builds a sensor disc and a solid post as two distinct bodies', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const part: PlacedPart = { id: 2, kind: 'bullseye', x: 20, y: 5, props: { size: 'M' } };
    const handle = buildPart(world, part);
    expect(handle.bodies.map((b) => b.role).sort()).toEqual(['bullseye', 'post']);
    const disc = handle.bodies.find((b) => b.role === 'bullseye')!;
    const post = handle.bodies.find((b) => b.role === 'post')!;
    expect(disc.id).not.toBe(post.id);
    expect(world.getTransform(disc.id).position).toEqual({ x: 20, y: 5 });
  });

  it('can builds a dynamic box coloured by the color prop', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const part: PlacedPart = { id: 3, kind: 'can', x: 10, y: 3, props: { color: 'Blue' } };
    const handle = buildPart(world, part);
    expect(handle.visuals[0]!.color).toBe(0x05aeed);
    expect(handle.visuals[0]!.shape).toEqual({ kind: 'box', w: 0.4, h: 0.8 });
  });

  describe('stringAnchor: the trigger string (product direction 2026-09-22: tied off the arm\'s ' +
    'centreline, so the FIRE button fits beside it; since the real art, on the cup\'s underside)', () => {
    /** Arm-local point -> world at REST_ANGLE about the pivot. */
    function armLocal(part: PlacedPart, lx: number, ly: number): { x: number; y: number } {
      const pivot = { x: part.x + PIVOT_DX, y: part.y + PIVOT_DY };
      const c = Math.cos(REST_ANGLE);
      const s = Math.sin(REST_ANGLE);
      return { x: pivot.x + lx * c - ly * s, y: pivot.y + lx * s + ly * c };
    }
    /** World point -> arm-local at REST_ANGLE. */
    function toArmLocal(part: PlacedPart, w: { x: number; y: number }): { x: number; y: number } {
      const pivot = { x: part.x + PIVOT_DX, y: part.y + PIVOT_DY };
      const c = Math.cos(REST_ANGLE);
      const s = Math.sin(REST_ANGLE);
      const dx = w.x - pivot.x;
      const dy = w.y - pivot.y;
      return { x: dx * c + dy * s, y: -dx * s + dy * c };
    }

    it('the tied end (A) hangs straight below arm-local (L - 0.1, +0.1) - the x FIRE is laid out ' +
      'from - on the cup\'s underside (local y 0.31, inside the bowl\'s lowest row at 0.335); the peg ' +
      '(P) is straight below it, at the catapult\'s own ground-level y', () => {
        for (const arm of ['Short', 'Long']) {
          const part = catapultPart({ arm }, 5, 0);
          const L = ARM[arm]!.length;
          const above = armLocal(part, L - 0.1, 0.1);
          const { a, p } = stringAnchor(part);
          expect(a.x).toBeCloseTo(above.x, 9);
          expect(a.y).toBeLessThan(above.y);
          expect(toArmLocal(part, a).y).toBeCloseTo(0.31, 9);
          expect(p).toEqual({ x: a.x, y: 0 });
        }
    });

    it('measured: A is about (x - 1.55, y + 0.63) for the Short arm, (x - 2.49, y + 0.29) for ' +
      'the Long arm', () => {
      const short = stringAnchor(catapultPart({ arm: 'Short' }, 5, 0));
      const long = stringAnchor(catapultPart({ arm: 'Long' }, 5, 0));
      expect(short.a.x).toBeCloseTo(5 - 1.5512, 3);
      expect(short.a.y).toBeCloseTo(0 + 0.6327, 3);
      expect(long.a.x).toBeCloseTo(5 - 2.4909, 3);
      expect(long.a.y).toBeCloseTo(0 + 0.2907, 3);
      // The Long arm's tie point sits closer to the pivot vertically (a shorter string) - the
      // reason the limp cut piece (sim.ts) has to be capped relative to the actual string length.
      expect(long.a.y - long.p.y).toBeLessThan(short.a.y - short.p.y);
    });

    it('follows the part\'s own anchor (x, y), not just the pivot offset', () => {
      const low = stringAnchor(catapultPart({}, 5, 0));
      const moved = stringAnchor(catapultPart({}, 8, 2));
      expect(moved.a.x).toBeCloseTo(low.a.x + 3, 6);
      expect(moved.a.y).toBeCloseTo(low.a.y + 2, 6);
      expect(moved.p.y).toBeCloseTo(2, 6);
    });
  });

  describe('fireSpot: where the FIRE button (and the snip burst) sit', () => {
    it('is FIRE_DX right of the string\'s tied point A, and FIRE_DY above the part\'s own ' +
      'ground-level y - for both arms', () => {
      for (const arm of ['Short', 'Long']) {
        const part = catapultPart({ arm }, 5, 0);
        const { a } = stringAnchor(part);
        const spot = fireSpot(part);
        expect(spot.x).toBeCloseTo(a.x + FIRE_DX, 9);
        expect(spot.y).toBeCloseTo(part.y + FIRE_DY, 9);
      }
    });

    it('sits clear of the string (a small gap to its left) and of the cart\'s base (a small gap ' +
      'before its left edge, part.x - 0.8) at the spec\'d 72 px button size and zoom 3.6 focus, ' +
      'for both arms', () => {
        const size = 72;
        const zoom = 3.6;
        const ppm = 32;
        const halfW = size / (ppm * zoom) / 2;
        for (const arm of ['Short', 'Long']) {
          const part = catapultPart({ arm }, 5, 0);
          const { a } = stringAnchor(part);
          const spot = fireSpot(part);
          const stringGap = spot.x - halfW - a.x;
          const cartGap = part.x - 0.8 - (spot.x + halfW);
          expect(stringGap).toBeGreaterThan(0.02);
          expect(cartGap).toBeGreaterThan(0.02);
        }
    });

    it('follows the part\'s own anchor (x, y)', () => {
      const low = fireSpot(catapultPart({}, 5, 0));
      const moved = fireSpot(catapultPart({}, 8, 2));
      expect(moved.x).toBeCloseTo(low.x + 3, 6);
      expect(moved.y).toBeCloseTo(low.y + 2, 6);
    });
  });

  describe('bandSegments: the rubber bands', () => {
    it('band count follows BAND_COUNT[power]; every band is BAND_COLOR red', () => {
      for (const power of ['Low', 'Medium', 'High', 'Max']) {
        const part = catapultPart({ power }, 5, 0);
        const segs = bandSegments(part, REST_ANGLE);
        expect(segs).toHaveLength(BAND_COUNT[power]!);
        for (const seg of segs) expect(seg.color).toBe(BAND_COLOR);
      }
    });

    it('band i runs from 0.85 + 0.08*i m along the arm to 1.05 + 0.08*i m along the lever ' +
      '(stop direction), at rest', () => {
      const part = catapultPart({ power: 'Max', angle: '30' }, 5, 0);
      const pivot = { x: 5 + PIVOT_DX, y: 0 + PIVOT_DY };
      const stopDir = armAngleFor(30);
      const segs = bandSegments(part, REST_ANGLE);
      expect(segs).toHaveLength(4);
      segs.forEach((seg, i) => {
        const armDist = 0.85 + 0.08 * i;
        const leverDist = 1.05 + 0.08 * i;
        expect(seg.a.x).toBeCloseTo(pivot.x + armDist * Math.cos(REST_ANGLE), 6);
        expect(seg.a.y).toBeCloseTo(pivot.y + armDist * Math.sin(REST_ANGLE), 6);
        expect(seg.b.x).toBeCloseTo(pivot.x + leverDist * Math.cos(stopDir), 6);
        expect(seg.b.y).toBeCloseTo(pivot.y + leverDist * Math.sin(stopDir), 6);
      });
    });

    it('the arm side follows the passed-in armAngleRad (mid-swing), not REST_ANGLE', () => {
      const part = catapultPart({}, 5, 0);
      const atRest = bandSegments(part, REST_ANGLE)[0]!;
      const midSwing = bandSegments(part, REST_ANGLE - 0.3)[0]!;
      expect(midSwing.a).not.toEqual(atRest.a);
      // The lever side never moves with the arm angle - only with the part's own `angle` prop.
      expect(midSwing.b).toEqual(atRest.b);
    });
  });

  describe('bandSprite / hookSprite: the band and hook pictures', () => {
    it('a band sprite spans its segment exactly: centred on the midpoint, the vertical picture turned ' +
      'to the segment angle minus 90 deg, size (its width) = length / n so its height (n x width) is ' +
      'the length, with n picked so it stays about BAND_THICKNESS thick', () => {
      const cases = [
        { a: { x: 1, y: 1 }, b: { x: 1.2, y: 1.1 } },
        { a: { x: 0, y: 0 }, b: { x: -0.6, y: 0.8 } },
        { a: { x: 2, y: 3 }, b: { x: 3.4, y: 2.9 } },
      ];
      for (const { a, b } of cases) {
        const sprite = bandSprite('band-0', a, b)!;
        expect(sprite.kind).toBe('sprite');
        if (sprite.kind !== 'sprite') continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Number(sprite.textureKey.replace('real-band-', ''));
        expect(BAND_ASPECTS).toContain(n);
        expect(sprite.size * n).toBeCloseTo(len, 9);
        expect(sprite.size / BAND_THICKNESS).toBeGreaterThan(0.75);
        expect(sprite.size / BAND_THICKNESS).toBeLessThan(1.35);
        expect(sprite.p.x).toBeCloseTo((a.x + b.x) / 2, 9);
        expect(sprite.p.y).toBeCloseTo((a.y + b.y) / 2, 9);
        // The picture's long axis (local +y, i.e. angle + 90 deg) points along the segment.
        const axis = sprite.angle! + Math.PI / 2;
        expect(Math.cos(axis)).toBeCloseTo((b.x - a.x) / len, 9);
        expect(Math.sin(axis)).toBeCloseTo((b.y - a.y) / len, 9);
      }
      expect(bandSprite('band-0', { x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
    });

    it('a hook sprite is centred on its point with its arch (the picture\'s top) along apexDir', () => {
      const hook = hookSprite('h', { x: 2, y: 3 }, Math.PI);
      expect(hook).toEqual({ kind: 'sprite', id: 'h', textureKey: 'real-hook', p: { x: 2, y: 3 }, size: 0.1, angle: Math.PI / 2 });
    });
  });
});
