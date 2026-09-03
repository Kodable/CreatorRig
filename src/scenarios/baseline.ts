import Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { makeRandom, type Scenario, type ScenarioHandle } from './types';

/**
 * Baseline: N sprites from one generated texture, moving and rotating, bouncing off the
 * canvas edges. No physics engine. This is the renderer floor for a device.
 */
interface Mover {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

const baseline: Scenario = {
  id: 'baseline',
  defaultCount: 1000,
  create(scene: Phaser.Scene, params: RigParams): ScenarioHandle {
    const count = params.count > 0 ? params.count : this.defaultCount;
    const random = makeRandom(params.seed);
    const width = scene.scale.width;
    const height = scene.scale.height;

    // One 32x32 texture with a colored disc, shared by every sprite (single batch).
    const g = scene.add.graphics();
    g.fillStyle(0xffb40f, 1);
    g.fillCircle(16, 16, 15);
    g.fillStyle(0x192661, 1);
    g.fillCircle(11, 12, 3);
    g.fillCircle(21, 12, 3);
    g.generateTexture('fuzz', 32, 32);
    g.destroy();

    const movers: Mover[] = [];
    for (let i = 0; i < count; i++) {
      const sprite = scene.add.image(random() * width, random() * height, 'fuzz');
      sprite.setTint(Phaser.Display.Color.GetColor(150 + random() * 105, 150 + random() * 105, 150 + random() * 105));
      const speed = 40 + random() * 160;
      const angle = random() * Math.PI * 2;
      movers.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: (random() - 0.5) * 4,
      });
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
      },
      pass(stats: FrameStats): boolean {
        // Renderer floor: the device must hold 30 fps at p95 with this many sprites.
        return stats.p95 <= 33.4;
      },
      extra(): Record<string, unknown> {
        return { sprites: count };
      },
    };
  },
};

export default baseline;
