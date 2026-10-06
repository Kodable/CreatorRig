import { afterEach, describe, expect, it } from 'vitest';
import { PICS, ROVER_R } from './art';
import {
  BLOCK_DENSITY,
  GROUND_DEPTH,
  ROVER_DENSITY,
  SHADOW_LIFT,
  SHADOW_W,
  VEHICLE_FILTER,
  WORLD_H,
  WORLD_W,
  blockSize,
  buildPart,
  buildRover,
  buildTerrain,
  buildWalls,
} from './build';
import type { RoverBuild } from './build';
import { MOUNT_LEN, ROVER_MASS, WEIGHT_MASS } from './catalog';
import { rimPoint } from './geometry';
import { crustPolygons, flat, withGap, withRampToLip } from './terrain';
import type { AttachmentKind, PlacedPart, RoverPart } from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { PhysicsWorld } from '../../../physics/types';

const DEG = Math.PI / 180;

function rover(x = 5, y = 1.2): RoverPart {
  return { id: 1, kind: 'rover', x, y, props: {}, locked: true, lockPosition: true };
}

/** A part stuck on the dome `r` at rim angle `deg`. */
function stick(id: number, kind: AttachmentKind, deg: number, mount = 'cup', r = rover()): RoverPart {
  const p = rimPoint(deg * DEG);
  return { id, kind, x: r.x + p.x, y: r.y + p.y, props: { mount } };
}

describe('vehicle build: terrain (kept from 2026-09-22)', () => {
  let world: PhysicsWorld | null = null;
  afterEach(() => {
    world?.destroy();
    world = null;
  });

  it('WORLD_W/H: 90 m wide since 2026-10-05 (the panel shows 30 m and scrolls), 19.125 m tall since 2026-10-06', () => {
    expect(WORLD_W).toBe(90);
    // No dash (spec.ts hud.goalsOverlay): at ppm 32 the 612 px panel starts at stage y 78,
    // 6 px under the 72 px top bar, where the dash used to start (kit view.ts panelTopY).
    expect(WORLD_H).toBe(19.125);
    expect(690 - WORLD_H * 32).toBe(78);
  });

  it('buildWalls creates two static bodies just past the play field', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const walls = buildWalls(world);
    expect(walls).toHaveLength(2);
    expect(world.getTransform(walls[0]!).position.x).toBeCloseTo(-0.5, 6);
    expect(world.getTransform(walls[1]!).position.x).toBeCloseTo(WORLD_W + 0.5, 6);
  });

  it('buildTerrain builds a static chain body and a terrain RenderItem closed at the panel bottom', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const profile = flat();
    const { body, items } = buildTerrain(world, profile);
    expect(world.getMass(body)).toBe(0); // static
    expect(items).toHaveLength(2); // darker "under" layer, then the rust top layer
    for (const item of items) expect(item.role).toBe('terrain');
    const top = items[items.length - 1]!;
    expect(top.shape.kind).toBe('polygon');
    if (top.shape.kind === 'polygon') {
      const last = top.shape.vertices[top.shape.vertices.length - 1]!;
      expect(last).toEqual({ x: 0, y: -0.3 });
    }
  });

  it("buildTerrain's under layer follows the same silhouette as the rust top layer but closes " +
    'at GROUND_DEPTH instead of the top layer\'s 0.3 m crust, so it fills the kit\'s whole ' +
    'ground band; it is darker and drawn first (under the rust top)', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const { items } = buildTerrain(world, flat());
    const [under, top] = items;
    expect(under!.color).not.toBe(top!.color);
    expect(top!.color).toBe(0xb5532e); // rust
    expect(under!.color).toBe(0x8a3c1f); // darker rock
    if (under!.shape.kind === 'polygon' && top!.shape.kind === 'polygon') {
      // Flat ground never dips below either closing depth, so both layers share the same
      // (unclipped) surface vertices; only the two closing corners differ.
      const topSurface = top!.shape.vertices.slice(0, -2);
      const underSurface = under!.shape.vertices.slice(0, -2);
      expect(underSurface).toEqual(topSurface);
      expect(top!.shape.vertices.slice(-2)).toEqual([
        { x: WORLD_W, y: -0.3 },
        { x: 0, y: -0.3 },
      ]);
      expect(under!.shape.vertices.slice(-2)).toEqual([
        { x: WORLD_W, y: -GROUND_DEPTH },
        { x: 0, y: -GROUND_DEPTH },
      ]);
    }
  });

  it('over a pit, the under layer clips to its own closing depth (degenerates to zero height ' +
    'there), and the crust draws no polygon at all across the gap (there is no real surface for ' +
    'it to follow; the chasm shows through instead)', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const profile = withGap(flat(), 10, 12);
    const { items } = buildTerrain(world, profile);
    const under = items[0]!;
    if (under.shape.kind === 'polygon') {
      const midGapUnder = under.shape.vertices.find((v) => v.x > 10 && v.x < 12);
      expect(midGapUnder?.y).toBeCloseTo(-GROUND_DEPTH, 6); // clipped up to the under layer's own closing depth
    }
    const crustItems = items.filter((it) => it.color === 0xb5532e);
    expect(crustItems).toHaveLength(2); // one segment before the pit, one after
    for (const item of crustItems) {
      if (item.shape.kind === 'polygon') {
        for (const v of item.shape.vertices) expect(v.x <= 10 || v.x >= 12).toBe(true);
      }
    }
  });

  it("buildTerrain's rust crust follows the real surface even below y = 0 (a jump's lower " +
    'landing), matching `crustPolygons` directly: one 0.3 m-thick RenderItem polygon per ' +
    'contiguous run of real terrain, none of them across the gap', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const profile = withRampToLip(flat(), 10, 15, 1, 2.5, -0.5);
    const { items } = buildTerrain(world, profile);
    const crustItems = items.filter((it) => it.color === 0xb5532e);
    const expectedPolys = crustPolygons(profile);
    expect(crustItems).toHaveLength(expectedPolys.length);
    expect(crustItems).toHaveLength(2);
    for (const item of crustItems) {
      expect(item.role).toBe('terrain');
      expect(item.locked).toBe(true);
      expect(item.lockPosition).toBe(true);
    }
    const landing = crustItems.find(
      (item) => item.shape.kind === 'polygon' && item.shape.vertices.some((v) => v.y === -0.5),
    );
    expect(landing).toBeDefined();
    if (landing && landing.shape.kind === 'polygon') {
      const ys = landing.shape.vertices.map((v) => v.y);
      expect(Math.max(...ys)).toBeCloseTo(-0.5, 6); // the surface at the landing
      expect(Math.min(...ys)).toBeCloseTo(-0.8, 6); // 0.3 m of crust under it
    }
  });

  it('buildTerrain emits one dark chasm visual per gap, spanning exactly the gap\'s x-range from ' +
    'its lip(s) down to -GROUND_DEPTH, with no collider (it reuses the terrain\'s own static ' +
    'body and adds no shape)', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const profile = withGap(flat(), 10, 12);
    const { body, items } = buildTerrain(world, profile);
    const chasms = items.filter((it) => it.color === 0x1a0d14);
    expect(chasms).toHaveLength(1);
    const chasm = chasms[0]!;
    expect(chasm.role).toBe('terrain');
    expect(chasm.locked).toBe(true);
    expect(chasm.lockPosition).toBe(true);
    expect(chasm.body).toBe(body); // no new/separate body - no new collider
    expect(world.getMass(body)).toBe(0); // still static, unaffected
    expect(chasm.shape.kind).toBe('polygon');
    if (chasm.shape.kind === 'polygon') {
      const xs = chasm.shape.vertices.map((v) => v.x);
      const ys = chasm.shape.vertices.map((v) => v.y);
      expect(Math.min(...xs)).toBeCloseTo(10, 6); // exactly the gap's x-range, no more
      expect(Math.max(...xs)).toBeCloseTo(12, 6);
      expect(Math.max(...ys)).toBeCloseTo(0, 6); // the lip
      expect(Math.min(...ys)).toBeCloseTo(-GROUND_DEPTH, 6); // the panel bottom
    }
  });

  it("buildTerrain's chasm top is flat at the LOWER lip when the lips differ (a ramp's takeoff " +
    'lip vs. a lower landing): the space above it is open air', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const profile = withRampToLip(flat(), 10, 15, 1, 2.5, -0.5);
    const { items } = buildTerrain(world, profile);
    const chasm = items.find((it) => it.color === 0x1a0d14)!;
    expect(chasm).toBeDefined();
    if (chasm.shape.kind === 'polygon') {
      const rampLength = 1 / Math.tan((15 * Math.PI) / 180);
      const lipX = 10 + rampLength;
      const left = chasm.shape.vertices.find((v) => Math.abs(v.x - lipX) < 1e-6 && v.y > -GROUND_DEPTH);
      const right = chasm.shape.vertices.find(
        (v) => Math.abs(v.x - (lipX + 2.5)) < 1e-6 && v.y > -GROUND_DEPTH,
      );
      expect(left?.y).toBeCloseTo(-0.5, 6); // not the 1 m takeoff lip: air above the landing
      expect(right?.y).toBeCloseTo(-0.5, 6); // the lower landing
      for (const v of chasm.shape.vertices) expect(v.y).toBeGreaterThanOrEqual(-GROUND_DEPTH - 1e-9);
    }
  });

  it('buildTerrain emits no chasm visual for a gap-free profile (flat ground: still just the two ' +
    'terrain layers)', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const { items } = buildTerrain(world, flat());
    expect(items).toHaveLength(2);
    expect(items.some((it) => it.color === 0x1a0d14)).toBe(false);
  });

});

describe('vehicle build: the rover', () => {
  let world: PhysicsWorld | null = null;
  afterEach(() => {
    world?.destroy();
    world = null;
  });

  async function build(parts: RoverPart[], terrain = flat()): Promise<RoverBuild> {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const b = buildRover(world, parts, terrain);
    if (!b) throw new Error('no rover');
    return b;
  }

  it('no dome: buildRover returns null', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    expect(buildRover(world, [stick(2, 'fan', 180)], flat())).toBeNull();
  });

  it('the dome: one dynamic circle r 0.75, ~2.5 kg, in the vehicle collision group, standing on the ground', async () => {
    const b = await build([rover(5, 3)]);
    expect(world!.getMass(b.roverBody)).toBeCloseTo(ROVER_MASS, 3);
    expect(ROVER_DENSITY).toBeCloseTo(ROVER_MASS / (Math.PI * ROVER_R * ROVER_R), 9);
    const t = world!.getTransform(b.roverBody);
    expect(t.position.x).toBeCloseTo(5, 6);
    expect(t.position.y).toBeCloseTo(ROVER_R + 0.02, 3); // normalized onto the ground
    expect(b.rover.bodies).toEqual([{ id: b.roverBody, role: 'rover' }]);
    expect(VEHICLE_FILTER).toEqual({ group: 0x2, mask: 0xfffd });
  });

  it('the dome draws Kevin first, then the glass over him; both ride the dome body', async () => {
    const b = await build([rover()]);
    expect(b.rover.visuals.map((v) => v.textureKey)).toEqual([PICS.kevin.key, PICS.cockpit.key]);
    expect(b.rover.visuals.map((v) => v.role)).toEqual(['kevin', 'rover']);
    for (const v of b.rover.visuals) expect(v.body).toBe(b.roverBody);
    expect(b.rover.visuals[1]!.alpha).toBe(0.9);
  });

  it('the shadow: a kinematic body on the ground under the dome, carrying the shadow picture ~2 m wide', async () => {
    const b = await build([rover(5, 3)]);
    const t = world!.getTransform(b.shadowBody);
    expect(t.position.x).toBeCloseTo(5, 6);
    expect(t.position.y).toBeCloseTo(SHADOW_LIFT, 6);
    expect(b.shadowItem.textureKey).toBe(PICS.shadow.key);
    expect(b.shadowItem.shape).toEqual({ kind: 'box', w: SHADOW_W, h: (SHADOW_W * 111) / 539 });
    expect(SHADOW_W).toBe(2);
  });

  it('wheel on a suction cup: the wheel body + a mount body; a revolute (motor) joint to the dome, a weld for the cup picture', async () => {
    const b = await build([rover(), stick(2, 'wheelCircle', -45)]);
    const a = b.attachments[0]!;
    expect(a.bodies.map((x) => x.role)).toEqual(['mount', 'wheel']);
    expect(a.wheelJoint).toBeDefined();
    expect(a.wheelParent).toBe(b.roverBody);
    expect(a.spring).toBeUndefined();
    expect(a.joints).toEqual([a.wheelJoint]);
    expect(world!.jointCount()).toBe(2); // the wheel's revolute + the mount picture's weld
    expect(world!.getMass(a.main)).toBeCloseTo(Math.PI * 0.09, 2); // density 1, r 0.3
  });

  it('wheel on a spring: an axle on a prismatic spring along the outward axis, the wheel revolute on the axle', async () => {
    const b = await build([rover(), stick(2, 'wheelStar', -135, 'spring')]);
    const a = b.attachments[0]!;
    expect(a.bodies.map((x) => x.role)).toEqual(['mount', 'wheel', 'axle']);
    const axle = a.bodies.find((x) => x.role === 'axle')!.id;
    expect(a.wheelParent).toBe(axle);
    expect(a.spring).toBeDefined();
    expect(a.joints).toEqual([a.spring, a.wheelJoint]);
    expect(world!.jointCount()).toBe(3);
  });

  it('propulsion / weight on a suction cup: welded to the dome', async () => {
    const b = await build([rover(), stick(2, 'jet', 180), stick(3, 'beans', 90)]);
    const [jet, beans] = b.attachments;
    expect(jet!.bodies.map((x) => x.role)).toEqual(['power']); // the jet picture carries its own cup
    expect(jet!.joints).toHaveLength(1);
    expect(beans!.bodies.map((x) => x.role)).toEqual(['mount', 'weight']);
    expect(beans!.joints).toHaveLength(1);
    expect(world!.jointCount()).toBe(3); // jet weld, beans weld, beans' cup-picture weld
  });

  it('propulsion / weight on a spring: a slider on a prismatic spring, the part welded to the slider', async () => {
    const b = await build([rover(), stick(2, 'fan', 180, 'spring'), stick(3, 'watermelon', 90, 'spring')]);
    for (const a of b.attachments) {
      expect(a.bodies.map((x) => x.role)).toContain('slider');
      expect(a.bodies.map((x) => x.role)).toContain('mount'); // the spring picture
      expect(a.spring).toBeDefined();
      expect(a.joints).toHaveLength(2); // prismatic + weld
    }
  });

  it('weights weigh 0.05 / 1.5 / 4 kg (plate included); propulsion bodies are light', async () => {
    const b = await build([rover(), stick(2, 'feather', 90), stick(3, 'beans', 0), stick(4, 'watermelon', 180), stick(5, 'stove', -90)]);
    const mass = (i: number): number => world!.getMass(b.attachments[i]!.main);
    expect(mass(0)).toBeCloseTo(WEIGHT_MASS.feather, 3);
    expect(mass(1)).toBeCloseTo(WEIGHT_MASS.beans, 3);
    expect(mass(2)).toBeCloseTo(WEIGHT_MASS.watermelon, 3);
    expect(mass(3)).toBeLessThan(0.3);
  });

  it('the cup / spring picture rides a body welded to the dome AT the rim point, turned to face out', async () => {
    const r = rover();
    const b = await build([r, stick(2, 'wheelCircle', -60), stick(3, 'beans', 30, 'spring')]);
    const dome = world!.getTransform(b.roverBody).position;
    for (const [i, deg] of [[0, -60], [1, 30]] as const) {
      const a = b.attachments[i]!;
      const mountBody = a.bodies.find((x) => x.role === 'mount')!.id;
      const t = world!.getTransform(mountBody);
      expect(t.position.x - dome.x).toBeCloseTo(ROVER_R * Math.cos(deg * DEG), 6);
      expect(t.position.y - dome.y).toBeCloseTo(ROVER_R * Math.sin(deg * DEG), 6);
      expect(t.angle).toBeCloseTo(deg * DEG - Math.PI / 2, 6);
      const item = a.visuals.find((v) => v.body === mountBody)!;
      expect(item.textureKey).toBe(i === 0 ? PICS.cup.key : PICS.spring.key);
    }
  });

  it("every attachment's pictures follow it: a wheel draws its wheel picture on the wheel body", async () => {
    const b = await build([rover(), stick(2, 'wheelSquare', -45), stick(3, 'stove', 150)]);
    const [wheel, stove] = b.attachments;
    expect(wheel!.visuals.find((v) => v.body === wheel!.main)!.textureKey).toBe(PICS.wheelSquare.key);
    expect(stove!.visuals.find((v) => v.body === stove!.main)!.textureKey).toBe(PICS.stove.key); // back half: not mirrored
    for (const a of b.attachments) for (const v of a.visuals) expect(v.partId).toBe(a.partId);
  });

  it("the rover's own parts never collide: a wheel built overlapping the dome leaves it where it is", async () => {
    world = await createWorld({ gravity: { x: 0, y: 0 } });
    const b = buildRover(world, [rover(5, 5), stick(2, 'wheelCircle', 0), stick(3, 'wheelCircle', 0), stick(4, 'watermelon', 0)], flat())!;
    const before = world.getTransform(b.roverBody).position;
    for (let i = 0; i < 30; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    const after = world.getTransform(b.roverBody).position;
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  it('a wheel straight below on a cup holds the dome up: dome centre = R + gap + 2r above the ground', async () => {
    const b = await build([rover(), stick(2, 'wheelCircle', -90)]);
    expect(world!.getTransform(b.roverBody).position.y).toBeCloseTo(ROVER_R + MOUNT_LEN.cup + 0.6 + 0.02, 3);
  });

  it('hit boxes: the dome box is the glass picture; each attachment box covers its pictures', async () => {
    const b = await build([rover(), stick(2, 'jet', 180)]);
    expect(b.rover.bounds.w).toBeCloseTo(654 / (323.5 / 0.75), 3);
    const jet = b.attachments[0]!;
    expect(jet.bounds.x).toBeLessThan(b.rover.bounds.x - ROVER_R); // out behind the dome
    expect(jet.bounds.w).toBeGreaterThan(0.5);
  });
});

describe('vehicle build: scenery and the legacy buggy', () => {
  let world: PhysicsWorld | null = null;
  afterEach(() => {
    world?.destroy();
    world = null;
  });

  it('blockSize parses "<w>x<h>"', () => {
    expect(blockSize('1x1')).toEqual({ w: 1, h: 1 });
    expect(blockSize('1.6x1.2')).toEqual({ w: 1.6, h: 1.2 });
    expect(blockSize('nonsense')).toEqual({ w: 1, h: 1 });
  });

  it('the boulder is a dynamic box drawn with the boulder picture; the beacon is a static sensor', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const boulder = buildPart(world, { id: 3, kind: 'block', x: 14, y: 0.6, props: { size: '1.6x1.2', material: 'rock' } }, flat());
    expect(world.getMass(boulder.bodies[0]!.id)).toBeCloseTo(1.6 * 1.2 * BLOCK_DENSITY.rock!, 3);
    expect(boulder.visuals[0]!.textureKey).toBe('rv-boulder');
    const finish = buildPart(world, { id: 2, kind: 'finish', x: 27, y: 0, props: {} }, flat());
    expect(finish.bodies[0]!.role).toBe('finish');
    expect(finish.bounds.h).toBe(2);
    for (let i = 0; i < 10; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
    expect(world.getTransform(finish.bodies[0]!.id).position.y).toBeCloseTo(1, 6); // static: never falls
  });

  it('buildPart still builds the old two-wheel buggy for the Bridge course (kind "vehicle")', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    const buggy: PlacedPart = {
      id: -2,
      kind: 'vehicle',
      x: 3,
      y: 0.65,
      props: { wheelShape: 'round', wheelSize: 'M', power: 'Medium', suspension: 'None', weight: 'Medium' },
    };
    const h = buildPart(world, buggy, flat());
    expect(h.bodies.map((b) => b.role)).toEqual(['chassis', 'rider', 'wheel', 'wheel']);
    expect(h.joints).toHaveLength(2);
  });

  it('buildPart refuses the rover and its attachments (buildRover builds them together)', async () => {
    world = await createWorld({ gravity: { x: 0, y: -10 } });
    expect(() => buildPart(world!, rover(), flat())).toThrow();
  });
});
