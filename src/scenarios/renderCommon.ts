import type Phaser from 'phaser';
import { percentile } from '../report';
import { round2 } from './physicsCommon';

/**
 * Counts WebGL draw calls per frame by wrapping drawElements and drawArrays on the renderer's
 * context. Phaser 4's WebGL renderer exposes no counter of its own. Call frame() once per update.
 */
export class DrawCallCounter {
  private calls = 0;
  private samples: number[] = [];
  readonly available: boolean;

  constructor(scene: Phaser.Scene) {
    const renderer = scene.sys.game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer>;
    const gl = renderer.gl as (WebGLRenderingContext & { __rigCounted?: boolean }) | undefined;
    this.available = gl !== undefined;
    if (!gl || gl.__rigCounted) return;
    gl.__rigCounted = true;
    const wrap = <K extends 'drawElements' | 'drawArrays'>(name: K): void => {
      const original = gl[name] as (...args: unknown[]) => void;
      (gl as unknown as Record<string, unknown>)[name] = (...args: unknown[]): void => {
        this.calls++;
        original.apply(gl, args);
      };
    };
    wrap('drawElements');
    wrap('drawArrays');
  }

  /** Records the calls since the last frame and resets the counter. */
  frame(): void {
    this.samples.push(this.calls);
    this.calls = 0;
  }

  stats(): { drawCallsP50: number; drawCallsP95: number } {
    // The first sample counts warm-up compiles; drop it.
    const sorted = this.samples.slice(1).sort((a, b) => a - b);
    return { drawCallsP50: round2(percentile(sorted, 50)), drawCallsP95: round2(percentile(sorted, 95)) };
  }
}

/** Runs the scene loader once and resolves when it completes (rejects on the first failed file). */
export function loadAll(scene: Phaser.Scene, queue: (load: Phaser.Loader.LoaderPlugin) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const load = scene.load;
    const failed: string[] = [];
    load.on('loaderror', (file: { key: string; src: string }) => failed.push(`${file.key} (${file.src})`));
    load.once('complete', () => {
      load.off('loaderror');
      if (failed.length > 0) reject(new Error(`failed to load ${failed.join(', ')}`));
      else resolve();
    });
    queue(load);
    load.start();
  });
}

/** Bytes an uncompressed RGBA8 texture of this size takes on the GPU, without mipmaps. */
export function rawTextureBytes(width: number, height: number): number {
  return width * height * 4;
}
