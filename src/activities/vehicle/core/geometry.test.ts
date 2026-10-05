import { describe, expect, it } from 'vitest';
import { PART_PPM, PICS, POWER_ART, ROVER_R, anchorFromCentre, flipAnchor } from './art';
import { MOUNT_LEN, POWER_MOUNT_LEN, WHEEL } from './catalog';
import {
  GROUND_CLEARANCE,
  SPAWN,
  THETA_STEP,
  attachmentGeometry,
  defaultSlot,
  layoutRover,
  normalizeRoverParts,
  powerFlipped,
  restHeight,
  rimPoint,
  rotate,
  roverPictures,
  snapTheta,
  thetaOf,
} from './geometry';
import { flat, heightAt, withStairs } from './terrain';
import type { AttachmentKind, RoverPart } from './types';

const DEG = Math.PI / 180;

function rover(x = 3, y = 1): RoverPart {
  return { id: 1, kind: 'rover', x, y, props: {}, locked: true, lockPosition: true };
}

function part(id: number, kind: AttachmentKind, x: number, y: number, mount = 'cup'): RoverPart {
  return { id, kind, x, y, props: { mount } };
}

/** A part left at rim angle `deg` around a dome at (x, y). */
function at(id: number, kind: AttachmentKind, deg: number, r: RoverPart, mount = 'cup', dist = ROVER_R): RoverPart {
  return part(id, kind, r.x + dist * Math.cos(deg * DEG), r.y + dist * Math.sin(deg * DEG), mount);
}

function find(parts: RoverPart[], id: number): RoverPart {
  return parts.find((p) => p.id === id)!;
}

describe('normalizeParts: snapping onto the rim', () => {
  it('an attachment left anywhere snaps to the rim point in the direction of the dome centre', () => {
    const r = rover();
    // Left 2 m out, up-right at 30 degrees: it lands on the rim at 30 degrees.
    const out = normalizeRoverParts([r, at(2, 'fan', 30, r, 'cup', 2)], flat());
    const dome = find(out, 1);
    const fan = find(out, 2);
    expect(Math.hypot(fan.x - dome.x, fan.y - dome.y)).toBeCloseTo(ROVER_R, 9);
    expect(Math.atan2(fan.y - dome.y, fan.x - dome.x)).toBeCloseTo(30 * DEG, 9);
    expect(fan.x).toBeCloseTo(dome.x + ROVER_R * Math.cos(30 * DEG), 9);
    expect(fan.y).toBeCloseTo(dome.y + ROVER_R * Math.sin(30 * DEG), 9);
  });

  it('rim angles snap to 5 degree notches', () => {
    expect(THETA_STEP).toBeCloseTo(5 * DEG, 12);
    expect(snapTheta(32 * DEG)).toBeCloseTo(30 * DEG, 12);
    expect(snapTheta(33 * DEG)).toBeCloseTo(35 * DEG, 12);
    expect(snapTheta(-179 * DEG)).toBeCloseTo(180 * DEG, 12); // wrapped to (-pi, pi]
    const r = rover();
    expect(thetaOf(at(2, 'fan', 47, r, 'cup', 3), r)).toBeCloseTo(45 * DEG, 9);
    expect(thetaOf({ x: r.x, y: r.y }, r)).toBeCloseTo(90 * DEG, 9); // exactly on the centre: the top
  });

  it('dragging slides the part along the rim (the drag delta turns into a new rim angle)', () => {
    const r = rover();
    let parts = normalizeRoverParts([r, at(2, 'wheelCircle', -45, r)], flat());
    const before = find(parts, 2);
    const dome = find(parts, 1);
    // The kit adds the drag delta to the stored point: drag the front wheel back under the dome.
    parts = parts.map((p) => (p.id === 2 ? { ...p, x: p.x - 1.2, y: p.y - 0.2 } : p));
    parts = normalizeRoverParts(parts, flat());
    const after = find(parts, 2);
    const theta = Math.atan2(after.y - find(parts, 1).y, after.x - find(parts, 1).x);
    expect(theta).toBeCloseTo(snapTheta(Math.atan2(before.y - 0.2 - dome.y, before.x - 1.2 - dome.x)), 9);
    expect(theta).toBeLessThan(-90 * DEG); // now behind the bottom
    expect(Math.hypot(after.x - find(parts, 1).x, after.y - find(parts, 1).y)).toBeCloseTo(ROVER_R, 9);
  });

  it('is idempotent (a second pass changes nothing)', () => {
    const r = rover(3, 4);
    const once = normalizeRoverParts(
      [r, at(2, 'wheelStar', -40, r, 'spring', 1.3), at(3, 'jet', 175, r), at(4, 'watermelon', 92, r, 'spring')],
      withStairs(flat(), 2, 2, 0.2, 0.6),
    );
    const twice = normalizeRoverParts(once, withStairs(flat(), 2, 2, 0.2, 0.6));
    for (const p of once) {
      const q = find(twice, p.id);
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
  });

  it('several parts may share one spot (no overlap resolve)', () => {
    const r = rover();
    const out = normalizeRoverParts([r, at(2, 'wheelCircle', -90, r), at(3, 'wheelSquare', -90, r)], flat());
    expect(find(out, 2).x).toBeCloseTo(find(out, 3).x, 9);
    expect(find(out, 2).y).toBeCloseTo(find(out, 3).y, 9);
  });

  it('the dome stands on its build: lifted so the lowest collider is GROUND_CLEARANCE above the ground', () => {
    const r = rover(3, 0.2); // stored too low
    const out = normalizeRoverParts([r, at(2, 'wheelCircle', -90, r)], flat());
    const dome = find(out, 1);
    // A circle wheel straight below: centre R + cup gap + 0.3 below the dome centre.
    const wheelBottom = dome.y - (ROVER_R + MOUNT_LEN.cup + 2 * WHEEL.wheelCircle.r);
    expect(wheelBottom).toBeCloseTo(GROUND_CLEARANCE, 2);
    // The bare dome sits on its own rim.
    const bare = find(normalizeRoverParts([rover(3, 5)], flat()), 1);
    expect(bare.y).toBeCloseTo(ROVER_R + GROUND_CLEARANCE, 6);
  });

  it('the dome height follows the ground under the build (a raised step)', () => {
    const terrain = withStairs(flat(), 2.5, 1, 0.5, 2);
    const out = normalizeRoverParts([rover(3, 0)], terrain);
    expect(find(out, 1).y).toBeCloseTo(heightAt(terrain, 3) + ROVER_R + GROUND_CLEARANCE, 6);
  });

  it('the dome keeps its x; scenery is untouched; attachments without a dome are dropped', () => {
    const finish: RoverPart = { id: 9, kind: 'finish', x: 27, y: 0, props: {}, locked: true };
    const out = normalizeRoverParts([rover(4.5, 2), finish], flat());
    expect(find(out, 1).x).toBe(4.5);
    expect(find(out, 9)).toEqual(finish);
    expect(normalizeRoverParts([part(2, 'fan', 1, 1), finish], flat())).toEqual([finish]);
  });

  it('a part fresh from the palette (still on SPAWN) takes a free default spot by kind', () => {
    const r = rover();
    const fresh = (id: number, kind: AttachmentKind): RoverPart => part(id, kind, SPAWN.x, SPAWN.y);
    let parts: RoverPart[] = [r, fresh(2, 'wheelCircle')];
    parts = normalizeRoverParts(parts, flat());
    parts = normalizeRoverParts([...parts, fresh(3, 'wheelCircle')], flat());
    parts = normalizeRoverParts([...parts, fresh(4, 'jet')], flat());
    parts = normalizeRoverParts([...parts, fresh(5, 'watermelon')], flat());
    const dome = find(parts, 1);
    const angle = (id: number): number => Math.atan2(find(parts, id).y - dome.y, find(parts, id).x - dome.x) / DEG;
    expect(angle(2)).toBeCloseTo(-45, 6); // first wheel: front bottom
    expect(angle(3)).toBeCloseTo(-135, 6); // second wheel: back bottom
    expect(Math.abs(angle(4))).toBeCloseTo(180, 6); // propulsion: the back
    expect(angle(5)).toBeCloseTo(0, 6); // weight: the front
  });

  it('defaultSlot skips spots within 20 degrees of a taken one and falls back to the first', () => {
    expect(defaultSlot('wheelCircle', []) / DEG).toBeCloseTo(-45, 6);
    expect(defaultSlot('wheelCircle', [-50 * DEG]) / DEG).toBeCloseTo(-135, 6);
    expect(defaultSlot('fan', [180 * DEG]) / DEG).toBeCloseTo(155, 6);
    const everywhere = Array.from({ length: 72 }, (_, i) => i * 5 * DEG);
    expect(defaultSlot('beans', everywhere) / DEG).toBeCloseTo(0, 6);
  });
});

describe('attachment geometry', () => {
  it('wheels: centre on the outward axis at R + mount gap + reach; the cup or spring sits on the rim', () => {
    for (const kind of ['wheelCircle', 'wheelSquare', 'wheelStar'] as const) {
      for (const mount of ['cup', 'spring'] as const) {
        const g = attachmentGeometry(kind, mount, -60 * DEG);
        const d = Math.hypot(g.body.pos.x, g.body.pos.y);
        expect(d).toBeCloseTo(ROVER_R + MOUNT_LEN[mount] + WHEEL[kind].reach, 9);
        expect(Math.atan2(g.body.pos.y, g.body.pos.x)).toBeCloseTo(-60 * DEG, 9);
        expect(g.mountPicture?.key).toBe(mount === 'cup' ? PICS.cup.key : PICS.spring.key);
        expect(g.rim.x).toBeCloseTo(rimPoint(-60 * DEG).x, 12);
      }
    }
  });

  it('wheel colliders: circle r 0.3, square half-side 0.27, star = hub 0.12 + five tips reaching 0.33', () => {
    expect(attachmentGeometry('wheelCircle', 'cup', 0).shapes).toEqual([{ kind: 'circle', radius: 0.3 }]);
    expect(attachmentGeometry('wheelSquare', 'cup', 0).shapes).toEqual([{ kind: 'box', halfWidth: 0.27, halfHeight: 0.27 }]);
    const star = attachmentGeometry('wheelStar', 'cup', 0).shapes;
    expect(star).toHaveLength(6);
    expect(star[0]).toEqual({ kind: 'circle', radius: 0.12 });
    for (const tip of star.slice(1)) {
      if (tip.kind !== 'polygon') throw new Error('tip');
      expect(Math.max(...tip.vertices.map((v) => Math.hypot(v.x, v.y)))).toBeCloseTo(Math.hypot(0.33, 0.35 * 0.33 / 2), 6);
    }
  });

  it('wheel pictures are sized by the collider: the circle picture spans 2 x 0.3 m across its radius', () => {
    const pic = attachmentGeometry('wheelCircle', 'cup', 0).pictures[0]!;
    expect(pic.key).toBe(PICS.wheelCircle.key);
    expect(pic.shape.w).toBeCloseTo((PICS.wheelCircle.w * 0.3) / 200.6, 6);
    const sq = attachmentGeometry('wheelSquare', 'cup', 0).pictures[0]!;
    expect(sq.shape.w).toBeCloseTo((PICS.wheelSquare.w * 0.27) / 198.5, 6); // ~ twice the half side
  });

  it("propulsion: the picture's mount anchor sits on the rim (cup) or a spring's length out, its axis along u", () => {
    for (const kind of ['fan', 'stove', 'jet'] as const) {
      for (const deg of [180, 135, -90, 30]) {
        for (const mount of ['cup', 'spring'] as const) {
          const theta = deg * DEG;
          const g = attachmentGeometry(kind, mount, theta);
          const flip = powerFlipped(theta);
          const pic = flip ? PICS[`${kind}Flip`] : PICS[kind];
          const anchor = flip ? flipAnchor(PICS[kind], POWER_ART[kind].mount) : POWER_ART[kind].mount;
          const m = rotate(anchorFromCentre(pic, anchor, PART_PPM), g.body.angle);
          const mountWorld = { x: g.body.pos.x + m.x, y: g.body.pos.y + m.y };
          const expectedDist = ROVER_R + POWER_MOUNT_LEN[mount];
          expect(Math.hypot(mountWorld.x, mountWorld.y)).toBeCloseTo(expectedDist, 6);
          expect(Math.atan2(mountWorld.y, mountWorld.x)).toBeCloseTo(Math.atan2(Math.sin(theta), Math.cos(theta)), 6);
          // The body sticks out of the dome: its centre is further out than the mount point.
          expect(Math.hypot(g.body.pos.x, g.body.pos.y)).toBeGreaterThan(expectedDist);
          // A suction cup is drawn in the picture itself; a spring gets its own picture.
          expect(g.mountPicture?.key ?? null).toBe(mount === 'spring' ? PICS.spring.key : null);
        }
      }
    }
  });

  it('propulsion pictures turn by theta - pi (the manifest axis points left), mirrored on the front half', () => {
    const back = attachmentGeometry('jet', 'cup', 180 * DEG);
    expect(powerFlipped(180 * DEG)).toBe(false);
    expect(back.pictures[0]!.key).toBe(PICS.jet.key);
    expect(back.body.angle).toBeCloseTo(180 * DEG - Math.atan2(0.031, -1), 9); // ~0: upright on the back
    const front = attachmentGeometry('stove', 'cup', 0);
    expect(powerFlipped(0)).toBe(true);
    expect(front.pictures[0]!.key).toBe(PICS.stoveFlip.key);
    // The jet's flame direction (body angle + fx.dir) points straight out along u.
    for (const deg of [180, 30, -100]) {
      const g = attachmentGeometry('jet', 'cup', deg * DEG);
      const dir = g.body.angle + g.fx!.dir;
      expect(Math.cos(dir)).toBeCloseTo(Math.cos(deg * DEG), 9);
      expect(Math.sin(dir)).toBeCloseTo(Math.sin(deg * DEG), 9);
    }
    expect(attachmentGeometry('fan', 'cup', 0).fx).toBeUndefined();
  });

  it("weights: the plate's bottom is at the rim + u * mount length, the weight on top of the plate", () => {
    for (const mount of ['cup', 'spring'] as const) {
      const g = attachmentGeometry('watermelon', mount, 90 * DEG);
      expect(g.body.pos.x).toBeCloseTo(0, 9);
      expect(g.body.pos.y).toBeCloseTo(ROVER_R + MOUNT_LEN[mount], 9);
      expect(g.body.angle).toBeCloseTo(0, 9); // on top, the attachment frame is the world frame
      expect(g.pictures.map((p) => p.key)).toEqual([PICS.plate.key, PICS.watermelon.key]);
      const [plate, melon] = g.pictures;
      const plateTop = plate!.shape.cy! + plate!.shape.h / 2;
      expect(plateTop).toBeCloseTo(PICS.plate.h / PART_PPM, 2);
      expect(melon!.shape.cy! - melon!.shape.h / 2).toBeGreaterThan(plateTop - 0.02); // sits on the plate
      expect(g.shapes).toHaveLength(2); // plate + weight colliders
    }
  });

  it('the suction cup picture sits on the rim (its face sunk 2 cm into the glass), the spring spans the gap', () => {
    const cup = attachmentGeometry('beans', 'cup', 0).mountPicture!;
    expect(cup.shape.cy! - cup.shape.h / 2).toBeCloseTo(-0.02, 2);
    const spring = attachmentGeometry('beans', 'spring', 0).mountPicture!;
    expect(spring.shape.cy! + spring.shape.h / 2).toBeGreaterThan(MOUNT_LEN.spring);
  });

  it('Kevin stands inside the dome, his feet in its dark base; the glass picture is centred on the collider', () => {
    const { kevin, dome } = roverPictures();
    expect(kevin.key).toBe(PICS.kevin.key);
    expect(dome.key).toBe(PICS.cockpit.key);
    expect(kevin.shape.cy! - kevin.shape.h / 2).toBeCloseTo(-0.5, 6);
    expect(kevin.shape.cy! + kevin.shape.h / 2).toBeLessThan(ROVER_R);
    expect(dome.shape.w).toBeCloseTo(654 / (323.5 / 0.75), 6);
    expect(Math.abs(dome.shape.cx!)).toBeLessThan(0.01);
  });

  it('restHeight checks every collider against the ground under it', () => {
    const g = attachmentGeometry('wheelCircle', 'cup', -90 * DEG);
    const y = restHeight(3, [g], flat());
    expect(y).toBeCloseTo(ROVER_R + MOUNT_LEN.cup + 0.6 + GROUND_CLEARANCE, 2);
  });

  it('layoutRover returns null without a dome', () => {
    expect(layoutRover([], flat())).toBeNull();
  });
});
