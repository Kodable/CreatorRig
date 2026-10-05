// The one playable activity today: wraps the existing Phaser roller coaster
// game (previously booted directly from src/main.ts) behind the ActivityDef
// contract. See src/activities/types.ts for the frozen contract.
import Phaser from 'phaser';
import { SpinePlugin } from '@esotericsoftware/spine-phaser-v4';
import { CoasterScene } from '../../game/CoasterScene';
import { STAGE_W, STAGE_H, COLORS, RENDER_SCALE } from '../../game/view';
import { App } from '../../app';
import { Hud } from '../../ui/hud';
import type { EditTool } from '../../core/types';
import type { ActivityDef, ActivityHandle, ActivityHost } from '../types';

export const coaster: ActivityDef = {
  id: 'coaster',
  title: 'Fuzz Rollercoaster',
  icon: '🎢',
  bruno: 'Build a coaster for the fuzzes: big drops, loops and floaty hills!',
  status: 'ready',
  plan: {
    objects: 'One track with a point list; each point is a curve point or a fixed loop. A start station and, on some levels, a finish flag.',
    child: 'Tap the track or the sky to add points, drag to move, tap a point to delete. Launch and watch the fuzz roll.',
    signals: 'Vertical drop, hang time, speed, loops, track length and g-force (the Intense-o-meter). Level rule: complete a partly built track.',
  },
  start(host: ActivityHost): ActivityHandle {
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: host.game,
      width: STAGE_W * RENDER_SCALE,
      height: STAGE_H * RENDER_SCALE,
      backgroundColor: COLORS.navy,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [CoasterScene],
      plugins: { scene: [{ key: 'spine.SpinePlugin', plugin: SpinePlugin, mapping: 'spine' }] },
    });
    game.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.error('webglcontextlost');
    });

    const startLevelId = host.params.get('level') ?? undefined;
    // Dev only: lets automated checks drive the game loop by hand (window.__game).
    if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;

    // The App is created once the scene has finished create(); the HUD callbacks
    // close over `app`, which is assigned at that point.
    let app: App | undefined;

    const hud = new Hud(host.ui, game.canvas, {
      play: () => app?.play(),
      stop: () => app?.stop(),
      clear: () => app?.clear(),
      undo: () => app?.undo(),
      next: () => app?.next(),
      selectLevel: (id: string) => app?.selectLevel(id),
      setTool: (tool: EditTool) => app?.setTool(tool),
      exit: () => host.exit(),
    });

    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene<CoasterScene>('coaster');
      const start = (): void => {
        app = new App(scene, hud, startLevelId);
        // Dev only: lets the console and automated checks drive the app (window.__app).
        if (import.meta.env.DEV) (window as unknown as { __app?: App }).__app = app;
      };
      if (scene.scene.isActive()) start();
      else scene.events.once(Phaser.Scenes.Events.CREATE, start);
    });

    return {
      destroy(): void {
        app?.destroy();
        hud.destroy();
        game.destroy(true);
        host.game.innerHTML = '';
        host.ui.innerHTML = '';
        delete (window as unknown as { __game?: Phaser.Game }).__game;
        delete (window as unknown as { __app?: App }).__app;
      },
    };
  },
};
