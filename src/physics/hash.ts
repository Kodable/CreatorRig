import type { Transform } from './types';

/** Quantize to 4 decimals so tiny float noise below the grammar's precision does not change the hash. */
export function quantize(n: number): number {
  return Math.round(n * 10000);
}

/**
 * FNV-1a over the quantized transforms in the order given. Same transforms in the same order
 * give the same 8-hex string on every engine and every browser.
 */
export function hashTransforms(transforms: Iterable<Transform>): string {
  let h = 0x811c9dc5;
  const mix = (n: number): void => {
    // Fold the 32-bit int byte by byte.
    let v = n | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      v >>= 8;
    }
  };
  let count = 0;
  for (const t of transforms) {
    mix(quantize(t.position.x));
    mix(quantize(t.position.y));
    mix(quantize(t.angle));
    count++;
  }
  mix(count);
  return (h >>> 0).toString(16).padStart(8, '0');
}
