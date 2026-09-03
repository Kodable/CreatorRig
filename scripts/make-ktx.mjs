// Makes the KTX files the textures scenario looks for, from the PNGs in public/, on this Mac:
//   ASTC 6x6 with astcenc (ARM, via @gpu-tex-enc/astc), ETC2 RGBA8 with EtcTool (etc2comp, via
//   @gpu-tex-enc/etc), S3TC BC3/DXT5 with dxt-js (pure JavaScript) wrapped in a KTX 1 header.
//   node scripts/make-ktx.mjs
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import dxt from 'dxt-js';

const require = createRequire(import.meta.url);
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const ASTCENC = join(dirname(require.resolve('@gpu-tex-enc/astc/package.json')), 'bin/darwin/astcenc');
const ETCTOOL = join(dirname(require.resolve('@gpu-tex-enc/etc/package.json')), `bin/darwin-${arch}/EtcTool`);
for (const bin of [ASTCENC, ETCTOOL]) chmodSync(bin, 0o755);

const TEXTURES = [
  { png: 'public/textures/backdrop.png', out: 'public/textures/backdrop' },
  { png: 'public/atlas/creator-items.png', out: 'public/atlas/creator-items' },
];

/** KTX 1 container around one compressed 2D image, no mipmaps. */
export function ktx1(width, height, glInternalFormat, glBaseInternalFormat, payload) {
  const header = Buffer.alloc(64);
  Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  const fields = [0x04030201, 0, 1, 0, glInternalFormat, glBaseInternalFormat, width, height, 0, 0, 1, 1, 0];
  fields.forEach((v, i) => header.writeUInt32LE(v, 12 + i * 4));
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length, 0);
  const pad = Buffer.alloc((4 - (payload.length % 4)) % 4);
  return Buffer.concat([header, size, Buffer.from(payload), pad]);
}

const GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83f3;
const GL_RGBA = 0x1908;

function mb(path) {
  return `${(statSync(path).size / 1048576).toFixed(2)} MB`;
}

/** Rows reversed: Phaser uploads KTX 1 data bottom row first (OpenGL order), and the encoders write top-down. */
function flipRows(png) {
  const stride = png.width * 4;
  const flipped = Buffer.alloc(png.data.length);
  for (let y = 0; y < png.height; y++) png.data.copy(flipped, (png.height - 1 - y) * stride, y * stride, (y + 1) * stride);
  return flipped;
}

const tmp = mkdtempSync(join(tmpdir(), 'rig-ktx-'));
try {
  for (const t of TEXTURES) {
    const png = PNG.sync.read(readFileSync(t.png));
    console.log(`${t.png} ${png.width}x${png.height}, raw on the GPU ${((png.width * png.height * 4) / 1048576).toFixed(1)} MB`);
    const flipped = flipRows(png);

    // astcenc and EtcTool read a PNG, so give them a row-flipped copy.
    const flippedPng = new PNG({ width: png.width, height: png.height });
    flipped.copy(flippedPng.data);
    const flippedPath = join(tmp, 'flipped.png');
    writeFileSync(flippedPath, PNG.sync.write(flippedPng));

    execFileSync(ASTCENC, ['-cl', flippedPath, `${t.out}-astc.ktx`, '6x6', '-medium', '-silent']);
    console.log(`  ${t.out}-astc.ktx ${mb(`${t.out}-astc.ktx`)} (ASTC 6x6, iPad and iPhone)`);

    execFileSync(ETCTOOL, [flippedPath, '-format', 'RGBA8', '-effort', '40', '-output', `${t.out}-etc2.ktx`], { stdio: 'ignore' });
    console.log(`  ${t.out}-etc2.ktx ${mb(`${t.out}-etc2.ktx`)} (ETC2 RGBA8, Chromebook)`);

    // Range fit is the fast libsquish mode; quality is enough for a memory and rendering check.
    const blocks = dxt.compress(flipped, png.width, png.height, dxt.flags.DXT5 | dxt.flags.ColourRangeFit);
    writeFileSync(`${t.out}-s3tc.ktx`, ktx1(png.width, png.height, GL_COMPRESSED_RGBA_S3TC_DXT5_EXT, GL_RGBA, blocks));
    console.log(`  ${t.out}-s3tc.ktx ${mb(`${t.out}-s3tc.ktx`)} (S3TC BC3, desktop)`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
