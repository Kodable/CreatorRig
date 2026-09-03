// Packs a folder of PNGs into one Phaser atlas (PNG + JSON hash).
//   node scripts/pack-atlas.mjs <srcDir> <outBase> [size]
// Example: node scripts/pack-atlas.mjs /tmp/items public/atlas/creator-items 2048
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PNG } from 'pngjs';
import { atlasJson, packShelves } from './packer.mjs';

const [srcDir, outBase, sizeArg] = process.argv.slice(2);
if (!srcDir || !outBase) {
  console.error('usage: node scripts/pack-atlas.mjs <srcDir> <outBase> [size]');
  process.exit(1);
}
const size = Number(sizeArg ?? 2048);

const files = readdirSync(srcDir).filter((f) => f.endsWith('.png')).sort();
const images = files.map((f) => ({ name: basename(f, '.png'), png: PNG.sync.read(readFileSync(join(srcDir, f))) }));
const placed = packShelves(images.map((i) => ({ name: i.name, w: i.png.width, h: i.png.height })), size, size, 2);

const page = new PNG({ width: size, height: size });
page.data.fill(0);
const byName = new Map(images.map((i) => [i.name, i.png]));
for (const p of placed) {
  const src = byName.get(p.name);
  PNG.bitblt(src, page, 0, 0, p.w, p.h, p.x, p.y);
}
const usedH = Math.max(...placed.map((p) => p.y + p.h)) + 2;
console.log(`${placed.length} sprites on a ${size}x${size} page, ${usedH} rows used (${Math.round((usedH / size) * 100)}%)`);

writeFileSync(`${outBase}.png`, PNG.sync.write(page));
writeFileSync(`${outBase}.json`, JSON.stringify(atlasJson(placed, `${basename(outBase)}.png`, size, size), null, 1));
console.log(`wrote ${outBase}.png and ${outBase}.json`);
