import { describe, expect, it } from 'vitest';
import { CROUCH_MS, ENTRANCE_MS, HOP_ARC_PX, HOP_MS, LAND_MS, SETTLE_MS, entrancePhase, entrancePose } from './entrance';

const from = { x: 40, y: 300 };
const to = { x: 64, y: 290 };
const R = 14;

describe('the entrance hop (2026-10-15)', () => {
  it('lasts about a second: crouch, hop, land, settle', () => {
    expect(ENTRANCE_MS).toBe(CROUCH_MS + HOP_MS + LAND_MS + SETTLE_MS);
    expect(ENTRANCE_MS).toBeGreaterThanOrEqual(900);
    expect(ENTRANCE_MS).toBeLessThanOrEqual(1200);
    expect(entrancePhase(0)).toBe('crouch');
    expect(entrancePhase(CROUCH_MS + 1)).toBe('hop');
    expect(entrancePhase(CROUCH_MS + HOP_MS + 1)).toBe('land');
    expect(entrancePhase(CROUCH_MS + HOP_MS + LAND_MS + 1)).toBe('settle');
    expect(entrancePhase(ENTRANCE_MS)).toBe('done');
  });

  it('starts round on the deck and ends round on the rail start, lined up with the rail', () => {
    const a = entrancePose(0, from, to, R);
    expect([a.x, a.y, a.sx, a.sy, a.spin, a.tilt]).toEqual([from.x, from.y, 1, 1, 0, 0]);
    const z = entrancePose(ENTRANCE_MS, from, to, R);
    expect([z.x, z.y, z.sx, z.sy, z.spin, z.tilt]).toEqual([to.x, to.y, 1, 1, 1, 1]);
    // The settle beat already sits exactly where the ride's first frame draws it.
    const settle = entrancePose(ENTRANCE_MS - 1, from, to, R);
    expect(settle.x).toBeCloseTo(to.x, 9);
    expect(settle.y).toBeCloseTo(to.y, 9);
  });

  it('crouches with its feet planted: squashed, wider, the centre lower by the squash', () => {
    const c = entrancePose(CROUCH_MS - 1, from, to, R);
    expect(c.sy).toBeLessThan(0.75);
    expect(c.sx).toBeGreaterThan(1.15);
    expect(c.y).toBeCloseTo(from.y + (1 - c.sy) * R, 9);
    expect(c.excited).toBe(false);
  });

  it('hops in an arc above both ends, stretched at take-off, round at the top, spinning once', () => {
    const top = entrancePose(CROUCH_MS + HOP_MS / 2, from, to, R);
    // The apex: HOP_ARC_PX over the midpoint of the straight line, well above both ends.
    expect(top.y).toBeCloseTo((from.y + to.y) / 2 - HOP_ARC_PX, 6);
    expect(top.y).toBeLessThan(Math.min(from.y, to.y) - 30);
    expect(top.sy).toBeCloseTo(1, 6);
    expect(top.spin).toBeCloseTo(0.5, 6);
    expect(top.excited).toBe(true);
    const takeoff = entrancePose(CROUCH_MS + 1, from, to, R);
    expect(takeoff.sy).toBeGreaterThan(1.15);
    expect(takeoff.sx).toBeLessThan(0.9);
    // The spin only ever goes forward.
    let last = -1;
    for (let t = CROUCH_MS; t <= CROUCH_MS + HOP_MS; t += 10) {
      const s = entrancePose(t, from, to, R).spin;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it('lands with a squish on the rail that springs back, feet on the rail along its normal', () => {
    const up = { x: 0.6, y: -0.8 };
    const hit = entrancePose(CROUCH_MS + HOP_MS + 1, from, to, R, up);
    expect(hit.phase).toBe('land');
    expect(hit.sy).toBeLessThan(0.75);
    const drop = (1 - hit.sy) * R;
    expect(hit.x).toBeCloseTo(to.x - up.x * drop, 9);
    expect(hit.y).toBeCloseTo(to.y - up.y * drop, 9);
    const end = entrancePose(CROUCH_MS + HOP_MS + LAND_MS - 1, from, to, R, up);
    expect(Math.abs(end.sy - 1)).toBeLessThan(0.03);
  });
});
