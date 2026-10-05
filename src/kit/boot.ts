// Generic builder-kit boot/teardown: creates the Phaser game (with the scene instance built from
// the course's WorldSpec/roles), the HUD and the app, and wires the READY/CREATE handshake.
// Moved from activities/goldberg/index.ts.
import Phaser from 'phaser';
import { SpinePlugin } from '@esotericsoftware/spine-phaser-v4';
import { BuilderScene } from './BuilderScene';
import { BuilderHud } from './BuilderHud';
import { BuilderApp } from './BuilderApp';
import { STAGE_W, STAGE_H, COLORS, RENDER_SCALE } from './view';
import { viewWidth } from './camera';
import type { ActivityHost, BootOptions, CourseSpec, Level } from './types';
import type { ActivityHandle } from '../activities/types';

export function bootBuilderActivity<
  K extends string,
  M extends Record<string, number>,
  O extends string,
  L extends Level<K, M, O>,
>(host: ActivityHost, spec: CourseSpec<K, M, O, L>, opts: BootOptions): ActivityHandle {
  const scene = new BuilderScene(opts.sceneKey, spec.world, spec.roles, spec.textures);
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: host.game,
    width: STAGE_W * RENDER_SCALE,
    height: STAGE_H * RENDER_SCALE,
    backgroundColor: COLORS.navy,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Mipmaps: the 256 px part pictures are drawn at 40-120 device px and shimmer without them.
    // roundPixels: texture-backed objects (part pictures, labels) land on whole device pixels under
    // a zoomed, moving camera instead of resampling at a new sub-pixel offset every frame.
    render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR', roundPixels: true },
    scene: [scene],
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
  let app: BuilderApp<K, M, O, L> | undefined;

  const hud = new BuilderHud<K, M, O, L>(
    host.ui,
    game.canvas,
    {
      play: () => app?.play(),
      stop: () => app?.stop(),
      undo: () => app?.undo(),
      clear: () => app?.clear(),
      next: () => app?.next(),
      selectLevel: (id: string) => app?.selectLevel(id),
      addPart: (kind) => app?.addPart(kind),
      setProp: (code: string, value: string) => app?.setProp(code, value),
      flyTargets: (code: string, value: string) => app?.flyTargets(code, value) ?? [],
      removeSelected: () => app?.removeSelected(),
      hint: () => app?.hint(),
      exit: () => host.exit(),
      setTool: (id: string) => app?.setTool(id),
      scrollTo: (t: number) => app?.scrollTo(t),
    },
    spec.hud,
    spec.drawer,
    spec.tools,
    // The world scrollbar's thumb share: the view window over the whole world (1 = it fits).
    viewWidth(spec.world) / spec.world.worldW,
  );

  game.events.once(Phaser.Core.Events.READY, () => {
    const s = game.scene.getScene<BuilderScene>(opts.sceneKey);
    const start = (): void => {
      app = new BuilderApp<K, M, O, L>(s, hud, spec, startLevelId);
      // Dev only: lets the console and automated checks drive the app (window[opts.devGlobal]).
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>)[opts.devGlobal] = app;
    };
    if (s.scene.isActive()) start();
    else s.events.once(Phaser.Scenes.Events.CREATE, start);
  });

  return {
    destroy(): void {
      app?.destroy();
      hud.destroy();
      game.destroy(true);
      host.game.innerHTML = '';
      host.ui.innerHTML = '';
      delete (window as unknown as { __game?: Phaser.Game }).__game;
      delete (window as unknown as Record<string, unknown>)[opts.devGlobal];
    },
  };
}
