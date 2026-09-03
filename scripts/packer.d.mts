export interface PackItem { name: string; w: number; h: number }
export interface Placed extends PackItem { x: number; y: number }
export function packShelves(items: PackItem[], maxW: number, maxH: number, pad?: number): Placed[];
export function atlasJson(placed: Placed[], image: string, w: number, h: number): { frames: Record<string, unknown>; meta: { image: string } };
