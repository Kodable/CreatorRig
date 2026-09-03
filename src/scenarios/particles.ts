import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import bodies from './bodies';
import type { Scenario, ScenarioHandle } from './types';

/** Frame time at the 30 fps target; the emitter plan sizes its flow so the cap is reached at this rate. */
const FRAME_MS_AT_30 = 33.4;

export interface EmitterPlan {
  emitters: number;
  /** Live particles each emitter is capped at. */
  perEmitter: number;
  /** Particles released per logic update, sized so the cap is reached even at 30 fps. */
  quantity: number;
  lifespanMs: number;
}

/**
 * Splits a target live count across emitters. Each emitter flows every update (frequency 0) and
 * is hard-capped with maxAliveParticles, so the live count equals the target on any device that
 * holds 30 fps, and the frame time measures that count and nothing else.
 */
export function emitterPlan(count: number, emitters: number, lifespanMs = 1500): EmitterPlan {
  const n = Math.max(1, Math.floor(emitters));
  const perEmitter = Math.ceil(count / n);
  const framesPerLife = lifespanMs / FRAME_MS_AT_30;
  return { emitters: n, perEmitter, quantity: Math.max(1, Math.ceil(perEmitter / framesPerLife)), lifespanMs };
}

/**
 * Particles: N live additive particles from one or more emitters over the 200-body bowl scene.
 * The largest count that holds 30 fps on a device, divided by 4, is the proposed per-effect cap.
 * ?emitters=5 splits the count across emitters (explosions, sparks, confetti).
 */
const particles: Scenario = {
  id: 'particles',
  defaultCount: 5000,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    const count = params.count > 0 ? params.count : this.defaultCount;
    const plan = emitterPlan(count, Number(params.extra['emitters'] ?? 1) || 1);
    const under = await bodies.create(scene, { ...params, count: 200 });

    // One 16x16 soft disc, shared by every emitter (single texture, single batch).
    const g = scene.add.graphics();
    for (let r = 8, a = 0.15; r >= 2; r -= 2, a += 0.25) {
      g.fillStyle(0xffffff, a);
      g.fillCircle(8, 8, r);
    }
    g.generateTexture('spark', 16, 16);
    g.destroy();

    const tints = [0xffb40f, 0x05aeed, 0xc32f96, 0x61bb46, 0xffffff];
    const emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
    for (let i = 0; i < plan.emitters; i++) {
      const x = plan.emitters === 1 ? 512 : 192 + (i * 640) / (plan.emitters - 1);
      const emitter = scene.add.particles(x, 260, 'spark', {
        blendMode: 'ADD',
        lifespan: plan.lifespanMs,
        frequency: 0,
        quantity: plan.quantity,
        maxAliveParticles: plan.perEmitter,
        speed: { min: 40, max: 260 },
        angle: { min: 0, max: 360 },
        gravityY: 300,
        scale: { start: 1.2, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: tints[i % tints.length]!,
      });
      emitters.push(emitter);
    }

    let aliveMax = 0;
    const alive = (): number => emitters.reduce((sum, e) => sum + e.getAliveParticleCount(), 0);

    return {
      update(deltaMs: number, timeMs: number): void {
        under.update?.(deltaMs, timeMs);
        const a = alive();
        if (a > aliveMax) aliveMax = a;
      },
      pass(stats: FrameStats): boolean {
        // The count is only meaningful if the emitters reached it.
        return stats.p95 <= 33.4 && aliveMax >= count * 0.9;
      },
      extra(): Record<string, unknown> {
        return {
          particlesTarget: count,
          emitters: plan.emitters,
          perEmitter: plan.perEmitter,
          quantityPerUpdate: plan.quantity,
          particlesAlive: alive(),
          particlesAliveMax: aliveMax,
          ...(under.extra?.() ?? {}),
        };
      },
      notes(): string[] {
        return aliveMax < count * 0.9 ? [`emitters reached ${aliveMax} of ${count} live particles`] : [];
      },
    };
  },
};

export default particles;
