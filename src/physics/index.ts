import type { PhysicsWorld, WorldOptions } from './types';

export * from './types';
export { hashTransforms } from './hash';

/** Lazy factory: Rapier loads (and its wasm initialises) only when an activity asks for a world. */
export async function createWorld(options?: WorldOptions): Promise<PhysicsWorld> {
  const mod = await import('./rapier');
  return mod.createRapierWorld(options);
}
