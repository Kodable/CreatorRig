import type { AdapterId, PhysicsWorld, WorldOptions } from './types';

export * from './types';
export { hashTransforms } from './hash';

export const ADAPTERS: AdapterId[] = ['box2d', 'rapier'];

export function isAdapterId(id: string): id is AdapterId {
  return (ADAPTERS as string[]).includes(id);
}

/**
 * Lazy factory: each engine loads only when a scenario asks for it, so the build keeps one
 * chunk per adapter and the payload of each stays measurable.
 */
export async function createWorld(adapter: AdapterId, options?: WorldOptions): Promise<PhysicsWorld> {
  switch (adapter) {
    case 'box2d': {
      const mod = await import('./box2d');
      return mod.createBox2DWorld(options);
    }
    case 'rapier': {
      const mod = await import('./rapier');
      return mod.createRapierWorld(options);
    }
  }
}
