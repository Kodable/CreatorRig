import type { Vec2 } from '../core/types';
export const STAGE_W = 1024, STAGE_H = 768, PPM = 16, WORLD_W = 60, WORLD_H = 30;
export const ORIGIN_X = 32;      // stage x of world x = 0
export const GROUND_Y = 690;     // stage y of world y = 0 ; world top (y = 30) is stage y 210
export const COLORS = { orange: 0xffb40f, green: 0x61bb46, blue: 0x05aeed, pink: 0xc32f96, white: 0xffffff, navy: 0x192661, sky: 0x2f4fa8 };
export function toPx(v: Vec2): Vec2 { return { x: ORIGIN_X + v.x * PPM, y: GROUND_Y - v.y * PPM }; }
export function toWorld(p: Vec2): Vec2 { return { x: (p.x - ORIGIN_X) / PPM, y: (GROUND_Y - p.y) / PPM }; }

/**
 * Render scale: the canvas is STAGE_W*RENDER_SCALE by STAGE_H*RENDER_SCALE device pixels and the
 * camera zooms by the same factor, so every stage coordinate stays in 1024x768 space but the
 * picture is crisp on a high-DPI screen. Capped at 2 to keep the fill rate sane on tablets.
 */
export const RENDER_SCALE = typeof window !== 'undefined' ? Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1))) : 1;
