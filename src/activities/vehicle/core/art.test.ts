import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ART_DIR,
  BASE_PPM,
  COCKPIT,
  CUP_ART,
  KEVIN,
  PART_PPM,
  PICS,
  PLATE_ART,
  POOF_ART,
  POWER_ART,
  ROVER_R,
  SPRING_ART,
  THRUST_ART,
  WEIGHT_ART,
  WHEEL_ART,
  anchorFromCentre,
  centreFromAnchor,
  flipAnchor,
} from './art';

const PUBLIC = resolve(__dirname, '../../../../public');
type Manifest = Record<string, { width: number; height: number; anchors: Record<string, unknown> }>;
const manifest = JSON.parse(readFileSync(resolve(PUBLIC, ART_DIR, 'manifest.json'), 'utf8')) as Manifest;

describe('rover art', () => {
  it('every picture exists on disk and matches the manifest size', () => {
    for (const p of Object.values(PICS)) {
      expect(existsSync(resolve(PUBLIC, ART_DIR, p.file)), p.file).toBe(true);
      const m = manifest[p.file];
      expect(m, p.file).toBeDefined();
      expect([p.w, p.h]).toEqual([m!.width, m!.height]);
    }
  });

  it('the anchors copied into art.ts match the manifest', () => {
    const a = (file: string): Record<string, unknown> => manifest[file]!.anchors;
    expect(a('cockpit.png').center).toEqual(COCKPIT.center);
    expect(a('cockpit.png').radius).toBe(COCKPIT.radius);
    expect(a('kevin.png').bodyBbox).toEqual(KEVIN.bodyBbox);
    expect(a('wheel-circle.png').radius).toBe(WHEEL_ART.wheelCircle.radius);
    expect(a('wheel-square.png').halfSide).toBe(WHEEL_ART.wheelSquare.halfSide);
    expect(a('wheel-star1.png').center).toEqual(WHEEL_ART.wheelStar.center);
    expect(a('power-fan.png').mount).toEqual(POWER_ART.fan.mount);
    expect(a('power-stove.png').axis).toEqual(POWER_ART.stove.axis);
    expect(a('power-stove.png').chimney).toEqual(POWER_ART.stove.chimney);
    expect(a('power-jet.png').thrustOrigin).toEqual(POWER_ART.jet.thrustOrigin);
    expect(a('weight-watermelon.png').bottom).toEqual(WEIGHT_ART.watermelon.bottom);
    expect(a('plate.png').top).toEqual(PLATE_ART.top);
    expect(a('spring.png').bottom).toEqual(SPRING_ART.bottom);
    expect(a('suctioncup.png').bottom).toEqual(CUP_ART.bottom);
    expect(a('fx-thrust.png').base).toEqual(THRUST_ART.base);
    expect(a('fx-poof.png').attach).toEqual(POOF_ART.attach);
  });

  it('the mirrored propulsion pictures are the plain ones flipped top to bottom (anchors y -> h - y)', () => {
    for (const name of ['fan', 'stove', 'jet'] as const) {
      const plain = PICS[name];
      const flipped = PICS[`${name}Flip`];
      expect([flipped.w, flipped.h]).toEqual([plain.w, plain.h]);
      const m = manifest[flipped.file]!.anchors.mount as { x: number; y: number };
      const expected = flipAnchor(plain, POWER_ART[name].mount);
      expect(m.x).toBeCloseTo(expected.x, 1);
      expect(m.y).toBeCloseTo(expected.y, 1);
    }
  });

  it('the scale rule: the dome picture radius is the collider radius; parts use the circle wheel scale', () => {
    expect(ROVER_R).toBe(0.75);
    expect(BASE_PPM).toBeCloseTo(323.5 / 0.75, 6);
    expect(PART_PPM).toBeCloseTo(200.6 / 0.3, 6);
    // The suction cup comes out ~0.14 m tall, the jet ~0.68 m long.
    expect(PICS.cup.h / PART_PPM).toBeCloseTo(0.138, 2);
    expect(PICS.jet.w / PART_PPM).toBeCloseTo(0.68, 2);
  });

  it('centreFromAnchor and anchorFromCentre are inverses (y up)', () => {
    const c = centreFromAnchor(PICS.plate, PLATE_ART.bottom, PART_PPM);
    const back = anchorFromCentre(PICS.plate, PLATE_ART.bottom, PART_PPM);
    expect(c.x).toBeCloseTo(-back.x, 9);
    expect(c.y).toBeCloseTo(-back.y, 9);
    // The plate's bottom anchor is near its bottom edge: its centre is above it.
    expect(c.y).toBeGreaterThan(0);
  });
});
