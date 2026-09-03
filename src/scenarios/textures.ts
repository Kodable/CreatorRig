import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { loadAll, rawTextureBytes } from './renderCommon';
import { ITEM_ATLAS } from './sprites';
import type { Scenario, ScenarioHandle } from './types';

interface TextureSpec {
  key: string;
  png: string;
  width: number;
  height: number;
  /** KTX files per GPU format, produced by a human with PVRTexTool from the same PNG. */
  ktx: { ASTC: string; ETC: string; S3TC: string };
}

const TEXTURES: TextureSpec[] = [
  {
    key: 'backdrop',
    png: 'textures/backdrop.png',
    width: 2048,
    height: 1536,
    ktx: { ASTC: 'textures/backdrop-astc.ktx', ETC: 'textures/backdrop-etc2.ktx', S3TC: 'textures/backdrop-s3tc.ktx' },
  },
  {
    key: 'items',
    png: ITEM_ATLAS.png,
    width: ITEM_ATLAS.size,
    height: ITEM_ATLAS.size,
    ktx: { ASTC: 'atlas/creator-items-astc.ktx', ETC: 'atlas/creator-items-etc2.ktx', S3TC: 'atlas/creator-items-s3tc.ktx' },
  },
];

interface Probe {
  format: keyof TextureSpec['ktx'];
  url: string;
  bytes: number;
}

/** Which KTX files exist on the server, with their payload size, without loading them. */
async function probeKtx(spec: TextureSpec): Promise<Probe[]> {
  const found: Probe[] = [];
  for (const format of Object.keys(spec.ktx) as (keyof TextureSpec['ktx'])[]) {
    const url = spec.ktx[format];
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && !type.includes('text/html')) found.push({ format, url, bytes: Number(res.headers.get('content-length') ?? 0) });
    } catch {
      // Not there.
    }
  }
  return found;
}

/**
 * Textures: the 2048x1536 backdrop and the 2048 item atlas, loaded raw and, where the KTX files
 * exist, compressed through Phaser's load.texture (the renderer picks the first format the GPU
 * supports). Both versions are drawn side by side so a human can confirm the compressed one
 * renders. The report gives the GPU bytes for each: width x height x 4 for raw, the KTX payload
 * for compressed. Course budget: under 128 MB of texture memory per scene.
 */
const textures: Scenario = {
  id: 'textures',
  defaultCount: 0,
  async create(scene: Phaser.Scene, _params: RigParams): Promise<ScenarioHandle> {
    const probes = new Map<string, Probe[]>();
    for (const t of TEXTURES) probes.set(t.key, await probeKtx(t));

    await loadAll(scene, (load) => {
      for (const t of TEXTURES) {
        load.image(`${t.key}-raw`, t.png);
        const found = probes.get(t.key) ?? [];
        if (found.length > 0) {
          const config: Record<string, { type?: string; textureURL: string }> = {};
          for (const p of found) config[p.format] = { type: 'KTX', textureURL: p.url };
          config['IMG'] = { textureURL: t.png };
          load.texture(`${t.key}-ktx`, config as never);
        }
      }
    });

    const gl = (scene.sys.game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer>).gl;
    const supported = gl
      ? {
          ASTC: gl.getExtension('WEBGL_compressed_texture_astc') !== null,
          ETC: gl.getExtension('WEBGL_compressed_texture_etc') !== null,
          S3TC: gl.getExtension('WEBGL_compressed_texture_s3tc') !== null,
        }
      : null;

    // Draw raw on the left half and compressed (or raw again) on the right half, stacked.
    const perTexture: Record<string, unknown>[] = [];
    let rawBytes = 0;
    let compressedBytes = 0;
    let compressedRendered = 0;
    TEXTURES.forEach((t, i) => {
      const y = 200 + i * 384;
      scene.add.image(256, y, `${t.key}-raw`).setDisplaySize(480, 340);
      const ktxKey = `${t.key}-ktx`;
      const hasKtx = scene.textures.exists(ktxKey);
      const source = hasKtx ? scene.textures.get(ktxKey).source[0] : undefined;
      const algorithm = source?.compressionAlgorithm ?? 0;
      if (hasKtx) scene.add.image(768, y, ktxKey).setDisplaySize(480, 340);
      const label = scene.add.text(16, y + 184, `${t.key} ${t.width}x${t.height}  raw ${(rawTextureBytes(t.width, t.height) / 1048576).toFixed(1)} MB`, { fontSize: '14px', color: '#ffffff' });
      label.setDepth(1);
      const found = probes.get(t.key) ?? [];
      const used = found.find((p) => supported?.[p.format]) ?? null;
      rawBytes += rawTextureBytes(t.width, t.height);
      if (used && algorithm !== 0) {
        compressedBytes += used.bytes;
        compressedRendered++;
        scene.add.text(528, y + 184, `${used.format} KTX ${(used.bytes / 1048576).toFixed(2)} MB`, { fontSize: '14px', color: '#ffb40f' }).setDepth(1);
      } else {
        scene.add.text(528, y + 184, found.length === 0 ? 'no KTX files on the server' : 'KTX present but not rendered', { fontSize: '14px', color: '#f08a8a' }).setDepth(1);
      }
      perTexture.push({
        key: t.key,
        size: `${t.width}x${t.height}`,
        rawBytes: rawTextureBytes(t.width, t.height),
        ktxFound: found.map((p) => `${p.format}:${p.bytes}`),
        ktxUsed: used?.format ?? null,
        compressedBytes: used?.bytes ?? null,
        compressionAlgorithm: algorithm,
      });
    });

    const anyKtx = [...probes.values()].some((p) => p.length > 0);
    return {
      pass(_stats: FrameStats): boolean | null {
        if (!anyKtx) return null;
        return compressedRendered === TEXTURES.length;
      },
      extra(): Record<string, unknown> {
        return {
          textures: perTexture,
          gpuSupports: supported,
          rawBytesTotal: rawBytes,
          compressedBytesTotal: anyKtx ? compressedBytes : null,
          compressedRendered,
          budgetBytes: 128 * 1048576,
        };
      },
      notes(): string[] {
        return anyKtx ? [] : ['no KTX files found; run the PVRTexTool commands in the README, then rerun'];
      },
    };
  },
};

export default textures;
