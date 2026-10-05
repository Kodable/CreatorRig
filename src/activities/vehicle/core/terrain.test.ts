import { describe, expect, it } from 'vitest';
import {
  CREST_RUN,
  VIEW_W,
  WORLD_W,
  crustPolygons,
  distanceToGround,
  findGaps,
  flat,
  heightAt,
  jumpEnd,
  terrainPolygon,
  withCobbles,
  withCrest,
  withGap,
  withHill,
  withJump,
  withKerb,
  withRampToLip,
  withSlope,
  withStairs,
} from './terrain';

function assertAscendingNoDup(profile: { x: number; y: number }[]): void {
  for (let i = 1; i < profile.length; i++) {
    expect(profile[i]!.x).toBeGreaterThan(profile[i - 1]!.x);
  }
}

describe('vehicle terrain', () => {
  it('the world is 90 m wide, the view 30 m (2026-10-05 wide worlds)', () => {
    expect(WORLD_W).toBe(90);
    expect(VIEW_W).toBe(30);
  });

  it('flat() spans -1..WORLD_W + 1 (91) at y 0; flat(y) at another height', () => {
    const p = flat();
    expect(p[0]).toEqual({ x: -1, y: 0 });
    expect(p[p.length - 1]).toEqual({ x: WORLD_W + 1, y: 0 });
    assertAscendingNoDup(p);
    expect(flat(9)).toEqual([
      { x: -1, y: 9 },
      { x: WORLD_W + 1, y: 9 },
    ]);
  });

  it('heightAt interpolates linearly and clamps at the ends', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 10, y: 2 },
    ];
    expect(heightAt(p, 5)).toBeCloseTo(1, 6);
    expect(heightAt(p, -5)).toBe(0);
    expect(heightAt(p, 15)).toBe(2);
  });

  it('withHill: steepest grade matches atan(pi*height/(x1-x0)); a 20deg/1.5m hill needs ~13 m', () => {
    const height = 1.5;
    const targetAngle = (20 * Math.PI) / 180;
    const span = (Math.PI * height) / Math.tan(targetAngle);
    expect(span).toBeCloseTo(12.95, 1);

    const p = withHill(flat(), 12, 12 + span, height);
    assertAscendingNoDup(p);
    // peak height at the midpoint
    expect(heightAt(p, 12 + span / 2)).toBeCloseTo(height, 1);
    // returns to baseline at both ends
    expect(heightAt(p, 12)).toBeCloseTo(0, 6);
    expect(heightAt(p, 12 + span)).toBeCloseTo(0, 6);
    // measure the steepest grade numerically (at the quarter point) and compare to the formula
    const x0 = 12;
    const quarter = x0 + span / 4;
    const dx = 0.01;
    const slope = (heightAt(p, quarter + dx) - heightAt(p, quarter - dx)) / (2 * dx);
    expect(Math.atan(slope)).toBeCloseTo(targetAngle, 1);
  });

  it('withGap drops to y -3 and resumes the original height', () => {
    const p = withGap(flat(), 10, 12);
    assertAscendingNoDup(p);
    expect(heightAt(p, 11)).toBeCloseTo(-3, 6);
    expect(heightAt(p, 9.5)).toBeCloseTo(0, 6);
    expect(heightAt(p, 12.5)).toBeCloseTo(0, 6);
  });

  it('withStairs builds `steps` risers of `rise` each and stays up after', () => {
    const p = withStairs(flat(), 12, 4, 0.3, 0.6);
    assertAscendingNoDup(p);
    expect(heightAt(p, 12 - 0.5)).toBeCloseTo(0, 6);
    expect(heightAt(p, 12 + 0.3)).toBeCloseTo(0.3, 6); // top of tread 1
    expect(heightAt(p, 12 + 0.6 + 0.3)).toBeCloseTo(0.6, 6); // top of tread 2
    expect(heightAt(p, 12 + 4 * 0.6 + 1)).toBeCloseTo(4 * 0.3, 6); // flat beyond the stairs
  });

  it('withKerb raises everything beyond x by height and stays there', () => {
    const p = withKerb(flat(), 14, 0.3);
    assertAscendingNoDup(p);
    expect(heightAt(p, 13)).toBeCloseTo(0, 6);
    expect(heightAt(p, 15)).toBeCloseTo(0.3, 6);
    expect(heightAt(p, 31)).toBeCloseTo(0.3, 6);
    expect(heightAt(p, WORLD_W)).toBeCloseTo(0.3, 6);
    // A negative height is a cliff down that stays down.
    const drop = withKerb(flat(9), 16, -4.5);
    expect(heightAt(drop, 15)).toBeCloseTo(9, 6);
    expect(heightAt(drop, 17)).toBeCloseTo(4.5, 6);
    expect(heightAt(drop, WORLD_W)).toBeCloseTo(4.5, 6);
  });

  it('withSlope: a straight grade that stays at its new height (up or down)', () => {
    const p = withSlope(withSlope(flat(), 28, 32, -1.2), 38, 42, 1.2);
    assertAscendingNoDup(p);
    expect(heightAt(p, 30)).toBeCloseTo(-0.6, 6);
    expect(heightAt(p, 35)).toBeCloseTo(-1.2, 6);
    expect(heightAt(p, 40)).toBeCloseTo(-0.6, 6);
    expect(heightAt(p, 60)).toBeCloseTo(0, 6);
  });

  it('withJump: a ramp to a lip, a pit, and the terrain after it kept (moved by landingDy)', () => {
    const later = withHill(flat(), 30, 34, 1);
    const p = withJump(later, 10, 15, 0.6, 2.5);
    assertAscendingNoDup(p);
    const lipX = 10 + 0.6 / Math.tan((15 * Math.PI) / 180);
    expect(heightAt(p, lipX)).toBeCloseTo(0.6, 6);
    expect(heightAt(p, lipX + 1.25)).toBeCloseTo(-3, 6); // the pit
    expect(jumpEnd(10, 15, 0.6, 2.5)).toBeCloseTo(lipX + 2.5, 9);
    expect(heightAt(p, jumpEnd(10, 15, 0.6, 2.5) + 1)).toBeCloseTo(0, 6);
    expect(heightAt(p, 32)).toBeCloseTo(1, 6); // the hill after the jump survives
    expect(findGaps(p)).toHaveLength(1);
    const lower = withJump(flat(), 10, 15, 0.6, 2.5, -0.5);
    expect(heightAt(lower, 20)).toBeCloseTo(-0.5, 6);
    expect(heightAt(lower, WORLD_W)).toBeCloseTo(-0.5, 6);
  });

  it('distanceToGround: the shortest distance to the polyline, Infinity beyond the reach', () => {
    const p = withKerb(flat(), 10, 1);
    expect(distanceToGround(p, { x: 5, y: 0.3 }, 0.5)).toBeCloseTo(0.3, 6);
    expect(distanceToGround(p, { x: 9.8, y: 0.5 }, 0.5)).toBeCloseTo(0.2, 2); // the kerb's face
    expect(distanceToGround(p, { x: 20, y: 1.2 }, 0.5)).toBeCloseTo(0.2, 6);
    expect(distanceToGround(p, { x: 5, y: 3 }, 0.5)).toBeGreaterThan(0.5);
    // A slope: the perpendicular distance, not the vertical one.
    const s = withSlope(flat(), 0, 10, 10); // 45 degrees
    expect(distanceToGround(s, { x: 5, y: 6 }, 2)).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('withCobbles alternates 0/edge every pitch/2 and resumes the baseline at x1', () => {
    const p = withCobbles(flat(), 8, 16, 0.06, 0.4);
    assertAscendingNoDup(p);
    expect(heightAt(p, 8)).toBeCloseTo(0, 6);
    expect(heightAt(p, 8.3)).toBeCloseTo(0.06, 2); // inside the second tread (0.2 .. 0.4)
    expect(heightAt(p, 8.5)).toBeCloseTo(0, 2); // inside the third tread (0.4 .. 0.6)
    expect(heightAt(p, 16)).toBeCloseTo(0, 6);
  });

  it('withCrest rises to tan(angle)*CREST_RUN and stays up', () => {
    const p = withCrest(flat(), 12, 20);
    assertAscendingNoDup(p);
    const expectedHeight = CREST_RUN * Math.tan((20 * Math.PI) / 180);
    expect(heightAt(p, 12 + CREST_RUN)).toBeCloseTo(expectedHeight, 6);
    expect(heightAt(p, 12 + CREST_RUN + 5)).toBeCloseTo(expectedHeight, 6);
  });

  it('withRampToLip climbs to a lip, gaps, then lands at landingY', () => {
    const p = withRampToLip(flat(), 10, 15, 1, 2, -0.5);
    assertAscendingNoDup(p);
    const rampLength = 1 / Math.tan((15 * Math.PI) / 180);
    expect(heightAt(p, 10 + rampLength)).toBeCloseTo(1, 6);
    expect(heightAt(p, 10 + rampLength + 1)).toBeCloseTo(-3, 6); // mid-gap: a pit
    expect(heightAt(p, 10 + rampLength + 2 + 0.5)).toBeCloseTo(-0.5, 6); // landing
  });

  it('terrainPolygon clips the profile to the world (0..WORLD_W) and closes it at the panel ' +
    'bottom (default depth 0.3)', () => {
    const poly = terrainPolygon(flat());
    expect(poly[poly.length - 2]).toEqual({ x: WORLD_W, y: -0.3 });
    expect(poly[poly.length - 1]).toEqual({ x: 0, y: -0.3 });
    for (const p of poly) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WORLD_W);
      expect(p.y).toBeGreaterThanOrEqual(-0.3);
    }
    // Terrain far to the right (x 60..80) is drawn too, not cut at the old 30 m edge.
    const far = terrainPolygon(withHill(flat(), 60, 80, 2));
    expect(Math.max(...far.map((v) => v.y))).toBeCloseTo(2, 1);
  });

  it('terrainPolygon(profile, depth) closes deeper when a bigger depth is passed (build.ts uses ' +
    'this for the "under" layer, at the course\'s full groundDepth)', () => {
    const poly = terrainPolygon(flat(), 1.5);
    expect(poly[poly.length - 2]).toEqual({ x: WORLD_W, y: -1.5 });
    expect(poly[poly.length - 1]).toEqual({ x: 0, y: -1.5 });
    for (const p of poly) expect(p.y).toBeGreaterThanOrEqual(-1.5);
  });

  it('terrainPolygon degenerates to zero height across a pit at whatever depth it is closed at ' +
    '(a deeper close still reads as a hole, not a floor)', () => {
    const p = withGap(flat(), 10, 12);
    const shallow = terrainPolygon(p, 0.3);
    const deep = terrainPolygon(p, 1.5);
    const midShallow = shallow.find((v) => v.x > 10 && v.x < 12);
    const midDeep = deep.find((v) => v.x > 10 && v.x < 12);
    expect(midShallow?.y).toBeCloseTo(-0.3, 6);
    expect(midDeep?.y).toBeCloseTo(-1.5, 6);
  });

  it('findGaps finds a withGap pit as one gap with the same height on both lips', () => {
    const p = withGap(flat(), 10, 12);
    const gaps = findGaps(p);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ x0: 10, y0: 0, x1: 12, y1: 0 });
  });

  it('findGaps finds a withRampToLip jump as one gap, lip height on the left and landing height ' +
    'on the right', () => {
    const p = withRampToLip(flat(), 10, 15, 1, 2.5, -0.5);
    const gaps = findGaps(p);
    expect(gaps).toHaveLength(1);
    const rampLength = 1 / Math.tan((15 * Math.PI) / 180);
    const lipX = 10 + rampLength;
    expect(gaps[0]!.x0).toBeCloseTo(lipX, 6);
    expect(gaps[0]!.y0).toBeCloseTo(1, 6); // the takeoff lip
    expect(gaps[0]!.x1).toBeCloseTo(lipX + 2.5, 6);
    expect(gaps[0]!.y1).toBeCloseTo(-0.5, 6); // the (lower) landing
  });

  it('findGaps finds a pit far to the right, and clips to the world (0..WORLD_W)', () => {
    expect(findGaps(withGap(flat(), 70, 75))).toEqual([{ x0: 70, y0: 0, x1: 75, y1: 0 }]);
    const edge = findGaps(withGap(flat(), 88, 95));
    expect(edge).toHaveLength(1);
    expect(edge[0]!.x1).toBe(WORLD_W);
  });

  it('findGaps returns none for a profile with no pit', () => {
    expect(findGaps(flat())).toEqual([]);
    expect(findGaps(withStairs(flat(), 12, 4))).toEqual([]);
    expect(findGaps(withHill(flat(), 10, 15, 2))).toEqual([]);
  });

  it('helpers compose left to right without breaking ascending-x / no-dup-x', () => {
    let p = flat();
    p = withCrest(p, 12, 20);
    p = withStairs(p, 12 + CREST_RUN, 4, 0.3, 0.6);
    assertAscendingNoDup(p);
  });

  describe('crustPolygons', () => {
    it('flat ground: one ribbon polygon hugging y 0, closed at y -0.3, matching terrainPolygon\'s ' +
      'default-depth shape', () => {
      const polys = crustPolygons(flat());
      expect(polys).toHaveLength(1);
      expect(polys[0]).toEqual([
        { x: 0, y: 0 },
        { x: WORLD_W, y: 0 },
        { x: WORLD_W, y: -0.3 },
        { x: 0, y: -0.3 },
      ]);
    });

    it('follows a surface that dips below y = 0 (a lower landing): the crust spans surface..' +
      'surface - 0.3 there, not a fixed absolute depth', () => {
      const p = withRampToLip(flat(), 10, 15, 1, 2.5, -0.5);
      const polys = crustPolygons(p);
      // One ribbon on each side of the gap: the ramp (ending at the takeoff lip) and the landing.
      expect(polys).toHaveLength(2);
      const landing = polys.find((poly) => poly.some((v) => v.y === -0.5))!;
      expect(landing).toBeDefined();
      for (const v of landing) expect([-0.5, -0.8]).toContain(v.y);
      expect(landing.some((v) => v.y === -0.5)).toBe(true);
      expect(landing.some((v) => v.y === -0.8)).toBe(true);
    });

    it('draws no crust across a gap: no polygon has any vertex inside the gap\'s x-range', () => {
      const p = withGap(flat(), 10, 12);
      const polys = crustPolygons(p);
      expect(polys).toHaveLength(2); // before the pit, after the pit
      for (const poly of polys) {
        for (const v of poly) {
          expect(v.x <= 10 || v.x >= 12).toBe(true);
        }
      }
    });

    it('follows a rising surface (a ramp), not just a flat one: the top edge climbs with the ' +
      'terrain and the bottom edge stays a constant 0.3 m under it', () => {
      const p = withRampToLip(flat(), 10, 15, 1, 2.5, -0.5);
      const polys = crustPolygons(p);
      const rampSide = polys.find((poly) => poly.some((v) => v.y === 1))!;
      expect(rampSide).toBeDefined();
      const top = rampSide.find((v) => v.x > 10 && v.x < 14 && v.y > 0);
      expect(top).toBeDefined();
      const bottomMatch = rampSide.find((v) => v.x === top!.x && v.y < 0);
      expect(bottomMatch).toBeUndefined(); // the bottom edge only repeats the TOP's own x's
      // Instead, the ribbon's bottom vertex directly under the lip sits exactly 0.3 m below it.
      const lipTop = rampSide.find((v) => v.y === 1)!;
      const lipBottom = rampSide.find((v) => Math.abs(v.x - lipTop.x) < 1e-9 && v.y < 1);
      expect(lipBottom?.y).toBeCloseTo(0.7, 6);
    });

    it('a profile with no gaps yields exactly one polygon (no split)', () => {
      expect(crustPolygons(withHill(flat(), 10, 15, 2))).toHaveLength(1);
      expect(crustPolygons(withStairs(flat(), 12, 4))).toHaveLength(1);
    });
  });
});
