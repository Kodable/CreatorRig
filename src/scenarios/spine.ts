import type Phaser from 'phaser';
import type { SpineGameObject } from '@esotericsoftware/spine-phaser-v4';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import { DrawCallCounter, loadAll } from './renderCommon';
import { type Scenario, type ScenarioHandle } from './types';

/** The Floof family, exported from Spine 4.2.43 with one shared 2-page atlas (2048 + 1024). */
export const FLOOFS = {
  atlasKey: 'floofs',
  atlas: 'spine/floofs/FloofFamily01.atlas',
  skeletons: [
    { key: 'arcade', json: 'spine/floofs/Arcade_skeleton.json', idle: 'arcade_idle' },
    { key: 'coder', json: 'spine/floofs/Coder_skeleton.json', idle: 'coder_idle' },
    { key: 'create', json: 'spine/floofs/Create_skeleton.json', idle: 'create_idle' },
    { key: 'digcit', json: 'spine/floofs/Digcit_skeleton.json', idle: 'digcit_idle' },
    { key: 'engineer', json: 'spine/floofs/Engineer_skeleton.json', idle: 'engineer_idle' },
    { key: 'kevin', json: 'spine/floofs/Kevin_skeleton.json', idle: 'kevin_idle' },
  ],
};

/**
 * Spine: N skeletons in a grid, cycling through the 6 Floofs, each looping its idle animation
 * through spine-phaser-v4 (4.2 runtime for the 4.2 export). The count that holds 30 fps on a
 * device is its skeleton budget. The plugin installs at run time so other scenarios do not pay
 * for the Spine runtime in their bundle.
 */
const spine: Scenario = {
  id: 'spine',
  defaultCount: 30,
  async create(scene: Phaser.Scene, params: RigParams): Promise<ScenarioHandle> {
    const count = params.count > 0 ? params.count : this.defaultCount;
    const { SpinePlugin } = await import('@esotericsoftware/spine-phaser-v4');
    if (!scene.plugins.get('spine.SpinePlugin', false)) scene.plugins.installScenePlugin('spine.SpinePlugin', SpinePlugin, 'spine', scene);

    await loadAll(scene, (load) => {
      load.spineAtlas(FLOOFS.atlasKey, FLOOFS.atlas, true);
      for (const s of FLOOFS.skeletons) load.spineJson(s.key, s.json);
    });
    const draws = new DrawCallCounter(scene);

    // Grid sized so every skeleton is visible; skeletons are about 600 x 900 px at scale 1.
    const cols = Math.ceil(Math.sqrt(count * (scene.scale.width / scene.scale.height)));
    const rows = Math.ceil(count / cols);
    const cellW = scene.scale.width / cols;
    const cellH = scene.scale.height / rows;
    const scale = Math.min(cellW / 650, cellH / 1000);
    const objects: SpineGameObject[] = [];
    let bones = 0;
    for (let i = 0; i < count; i++) {
      const s = FLOOFS.skeletons[i % FLOOFS.skeletons.length]!;
      const x = (i % cols) * cellW + cellW / 2;
      const y = Math.floor(i / cols) * cellH + cellH * 0.95;
      const obj = scene.add.spine(x, y, s.key, FLOOFS.atlasKey);
      obj.setScale(scale);
      obj.animationState.setAnimation(0, s.idle, true);
      // Offset each loop so the skeletons are not in sync (more varied vertex work per frame).
      obj.animationState.update((i * 0.37) % 2);
      objects.push(obj);
      bones += obj.skeleton.bones.length;
    }

    return {
      update(): void {
        draws.frame();
      },
      pass(stats: FrameStats): boolean {
        return stats.p95 <= 33.4;
      },
      extra(): Record<string, unknown> {
        return { skeletons: count, bones, scale: Math.round(scale * 1000) / 1000, spineRuntime: '4.2.120', export: '4.2.43', ...draws.stats() };
      },
    };
  },
};

export default spine;
