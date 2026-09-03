import { describe, expect, it } from 'vitest';
import { atlasJson, packShelves } from '../scripts/packer.mjs';

describe('packShelves', () => {
  it('places every sprite inside the page with no overlap', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ name: `s${i}`, w: 100 + (i % 5) * 10, h: 80 + (i % 3) * 20 }));
    const placed = packShelves(items, 1024, 1024, 2);
    expect(placed).toHaveLength(40);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(1024);
      expect(p.y + p.h).toBeLessThanOrEqual(1024);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.name} overlaps ${b.name}`).toBe(true);
      }
    }
  });
  it('throws when the page overflows', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ name: `s${i}`, w: 100, h: 100 }));
    expect(() => packShelves(items, 256, 256, 2)).toThrow(/overflows/);
  });
  it('writes Phaser JSON hash frames', () => {
    const json = atlasJson([{ name: 'a', x: 2, y: 2, w: 10, h: 20 }], 'p.png', 64, 64);
    expect(json.frames['a']).toEqual({
      frame: { x: 2, y: 2, w: 10, h: 20 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 10, h: 20 },
      sourceSize: { w: 10, h: 20 },
    });
    expect(json.meta.image).toBe('p.png');
  });
});
