import type Phaser from 'phaser';
import type { RigParams } from '../params';
import { readHeapMB, type FrameStats } from '../report';
import bodies from './bodies';
import { emitterPlan, sparkTexture } from './particles';
import { round2 } from './physicsCommon';
import { loadAll } from './renderCommon';
import { FLOOFS } from './spine';
import type { Scenario, ScenarioHandle } from './types';

const RUNNING_KEY = 'rig-soak-running';
const DIED_KEY = 'rig-soak-died';

/**
 * Soak: the 200-body play scene with 1,000 additive particles from 5 emitters and 10 Floof
 * skeletons, left running. Samples the JS heap where the browser exposes it (Chromium) and
 * notices when a previous run died before it could report (a tab reload or a memory kill on
 * iOS): a flag in sessionStorage is set at the start and cleared at the end.
 */
const soak: Scenario = {
  id: 'soak',
  defaultCount: 200,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    const count = params.count > 0 ? params.count : this.defaultCount;
    const sampleEverySec = Number(params.extra['sampleEvery'] ?? 30) || 30;
    const skeletons = Number(params.extra['skeletons'] ?? 10) || 10;
    const particleTarget = Number(params.extra['particles'] ?? 1000) || 1000;

    let previousDied = false;
    try {
      previousDied = sessionStorage.getItem(RUNNING_KEY) === '1';
      if (previousDied) sessionStorage.setItem(DIED_KEY, String(Number(sessionStorage.getItem(DIED_KEY) ?? 0) + 1));
      sessionStorage.setItem(RUNNING_KEY, '1');
    } catch {
      // Storage blocked; fine.
    }

    const under = await bodies.create(scene, { ...params, adapter: params.adapter === 'none' ? 'box2d' : params.adapter, count });

    const plan = emitterPlan(particleTarget, 5);
    const spark = sparkTexture(scene);
    for (let i = 0; i < plan.emitters; i++) {
      scene.add.particles(192 + (i * 640) / (plan.emitters - 1), 260, spark, {
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
        tint: [0xffb40f, 0x05aeed, 0xc32f96, 0x61bb46, 0xffffff][i % 5]!,
      });
    }

    const { SpinePlugin } = await import('@esotericsoftware/spine-phaser-v4');
    if (!scene.plugins.get('spine.SpinePlugin', false)) scene.plugins.installScenePlugin('spine.SpinePlugin', SpinePlugin, 'spine', scene);
    await loadAll(scene, (load) => {
      load.spineAtlas(FLOOFS.atlasKey, FLOOFS.atlas, true);
      for (const s of FLOOFS.skeletons) load.spineJson(s.key, s.json);
    });
    for (let i = 0; i < skeletons; i++) {
      const s = FLOOFS.skeletons[i % FLOOFS.skeletons.length]!;
      const obj = scene.add.spine(60 + (i * 900) / Math.max(1, skeletons - 1), 150, s.key, FLOOFS.atlasKey);
      obj.setScale(0.12);
      obj.animationState.setAnimation(0, s.idle, true);
    }

    const heapStart = readHeapMB();
    const samples: { t: number; heapMB: number | null }[] = [];
    let elapsed = 0;
    let nextSample = 0;
    return {
      update(deltaMs: number, timeMs: number): void {
        under.update?.(deltaMs, timeMs);
        elapsed += deltaMs;
        if (elapsed >= nextSample) {
          samples.push({ t: Math.round(elapsed / 1000), heapMB: readHeapMB() });
          nextSample += sampleEverySec * 1000;
        }
      },
      pass(_stats: FrameStats): boolean | null {
        try {
          sessionStorage.removeItem(RUNNING_KEY);
        } catch {
          // ignore
        }
        const heaps = samples.map((s) => s.heapMB).filter((h): h is number => h !== null);
        if (heaps.length === 0) return previousDied ? false : null;
        return !previousDied && Math.max(...heaps) < 200;
      },
      extra(): Record<string, unknown> {
        const heaps = samples.map((s) => s.heapMB).filter((h): h is number => h !== null);
        return {
          bodies: count,
          particles: particleTarget,
          skeletons,
          minutes: round2(elapsed / 60000),
          heapStartMB: heapStart,
          heapPeakMB: heaps.length > 0 ? Math.max(...heaps) : null,
          heapFinalMB: heaps.length > 0 ? heaps[heaps.length - 1] : null,
          heapSamples: samples,
          textures: scene.textures.getTextureKeys().length,
          gameObjects: scene.children.length,
          previousRunDied: previousDied,
          ...(under.extra?.() ?? {}),
        };
      },
      notes(): string[] {
        const notes: string[] = [];
        if (readHeapMB() === null) notes.push('this browser does not expose the JS heap; on iPhone or iPad read Safari Web Inspector > Timelines > Memory from the Mac while the soak runs');
        if (previousDied) notes.push('the previous soak run in this tab ended without a report: the tab was reloaded or killed');
        return notes;
      },
    };
  },
};

export default soak;
