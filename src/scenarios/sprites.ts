import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { COLORS } from './physicsCommon';
import { DrawCallCounter, loadAll, rawTextureBytes } from './renderCommon';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

export const ITEM_ATLAS = { key: 'items', png: 'atlas/creator-items.png', json: 'atlas/creator-items.json', size: 2048 };

const PALETTE = [COLORS.orange, COLORS.green, COLORS.blue, COLORS.pink, 0xff5a5a, 0xa66bff, 0x2ee6c5, 0xffe14d];

interface Mover {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

/**
 * Sprites: N images from the real Creator item atlas (one 2048 page), moving and
 * rotating. One texture, so the renderer should batch them into a few draw calls; the report
 * says how many.
 */
const sprites: Scenario = {
  id: 'sprites',
  defaultCount: 500,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    const count = params.count > 0 ? params.count : this.defaultCount;
    const random = makeRandom(params.seed);
    const width = scene.scale.width;
    const height = scene.scale.height;
    await loadAll(scene, (load) => load.atlas(ITEM_ATLAS.key, ITEM_ATLAS.png, ITEM_ATLAS.json));
    const frames = scene.textures.get(ITEM_ATLAS.key).getFrameNames();
    const draws = new DrawCallCounter(scene);

    const movers: Mover[] = [];
    for (let i = 0; i < count; i++) {
      const frame = frames[Math.floor(random() * frames.length)]!;
      const sprite = scene.add.image(random() * width, random() * height, ITEM_ATLAS.key, frame);
      sprite.setScale(0.5 + random() * 0.5);
      // The editor tints the white `_color` layer with the kid's chosen color; do the same here.
      if (frame.endsWith('_color')) sprite.setTint(PALETTE[Math.floor(random() * PALETTE.length)]!);
      const speed = 40 + random() * 160;
      const angle = random() * Math.PI * 2;
      movers.push({ sprite, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (random() - 0.5) * 4 });
    }

    return {
      update(deltaMs: number): void {
        const dt = deltaMs / 1000;
        for (const m of movers) {
          const s = m.sprite;
          let x = s.x + m.vx * dt;
          let y = s.y + m.vy * dt;
          if (x < 0 || x > width) {
            m.vx = -m.vx;
            x = Math.min(width, Math.max(0, x));
          }
          if (y < 0 || y > height) {
            m.vy = -m.vy;
            y = Math.min(height, Math.max(0, y));
          }
          s.setPosition(x, y);
          s.rotation += m.spin * dt;
        }
        draws.frame();
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4;
      },
      extra(): Record<string, unknown> {
        return { sprites: count, atlasFrames: frames.length, atlasBytesRaw: rawTextureBytes(ITEM_ATLAS.size, ITEM_ATLAS.size), ...draws.stats() };
      },
    };
  },
};

export default sprites;
