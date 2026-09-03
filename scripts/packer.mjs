// Shelf packer: rows of decreasing height, left to right. Simple, deterministic, good enough for
// a few hundred similar-sized sprites. Returns placements or throws when a page overflows.

/**
 * @param {{name: string, w: number, h: number}[]} items
 * @param {number} maxW
 * @param {number} maxH
 * @param {number} pad pixels between sprites
 * @returns {{name: string, x: number, y: number, w: number, h: number}[]}
 */
export function packShelves(items, maxW, maxH, pad = 2) {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
  const placed = [];
  let x = pad;
  let y = pad;
  let shelfH = 0;
  for (const it of sorted) {
    if (it.w + pad * 2 > maxW || it.h + pad * 2 > maxH) throw new Error(`${it.name} (${it.w}x${it.h}) does not fit a ${maxW}x${maxH} page`);
    if (x + it.w + pad > maxW) {
      x = pad;
      y += shelfH + pad;
      shelfH = 0;
    }
    if (y + it.h + pad > maxH) throw new Error(`page ${maxW}x${maxH} overflows at ${it.name} (${placed.length} of ${items.length} placed)`);
    placed.push({ name: it.name, x, y, w: it.w, h: it.h });
    x += it.w + pad;
    if (it.h > shelfH) shelfH = it.h;
  }
  return placed;
}

/** Phaser "JSON hash" atlas format, as TexturePacker writes it. */
export function atlasJson(placed, image, w, h) {
  const frames = {};
  for (const p of placed) {
    frames[p.name] = {
      frame: { x: p.x, y: p.y, w: p.w, h: p.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
      sourceSize: { w: p.w, h: p.h },
    };
  }
  return { frames, meta: { app: 'creator-rig pack-atlas', version: '1.0', image, format: 'RGBA8888', size: { w, h }, scale: '1' } };
}
