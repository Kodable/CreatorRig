import { describe, expect, it } from 'vitest';
import { lookImageUrls, resolveLook } from './looks';
import type { WorldSpec } from './types';

const WORLD: WorldSpec = {
  worldW: 30,
  worldH: 15,
  ppm: 32,
  sky: { top: 0x111111, bottom: 0x222222, stars: true },
  backgrounds: [{ url: 'park.png', x: 15, y: 7.5, w: 30, h: 15 }],
};

describe('resolveLook', () => {
  it('no looks: falls back to the world own sky/backgrounds', () => {
    expect(resolveLook(WORLD, undefined)).toEqual({ sky: WORLD.sky, backgrounds: WORLD.backgrounds });
  });

  it('a look overriding both sky and backgrounds replaces the world', () => {
    const mars: WorldSpec = {
      ...WORLD,
      looks: {
        mars: {
          sky: { top: 0xaa0000, bottom: 0x330000 },
          backgrounds: [{ url: 'mars.png', x: 15, y: 7.5, w: 30, h: 15 }],
        },
      },
    };
    expect(resolveLook(mars, 'mars')).toEqual({
      sky: { top: 0xaa0000, bottom: 0x330000 },
      backgrounds: [{ url: 'mars.png', x: 15, y: 7.5, w: 30, h: 15 }],
    });
  });

  it('a look overriding only sky falls back to the world backgrounds', () => {
    const moon: WorldSpec = { ...WORLD, looks: { moon: { sky: { top: 0x000011, bottom: 0x000022 } } } };
    expect(resolveLook(moon, 'moon')).toEqual({
      sky: { top: 0x000011, bottom: 0x000022 },
      backgrounds: WORLD.backgrounds,
    });
  });

  it('a look overriding only backgrounds falls back to the world sky', () => {
    const asteroid: WorldSpec = {
      ...WORLD,
      looks: { asteroid: { backgrounds: [{ url: 'asteroid.png', x: 15, y: 7.5, w: 10, h: 10 }] } },
    };
    expect(resolveLook(asteroid, 'asteroid')).toEqual({
      sky: WORLD.sky,
      backgrounds: [{ url: 'asteroid.png', x: 15, y: 7.5, w: 10, h: 10 }],
    });
  });

  it('an unknown look falls back to the world own sky/backgrounds', () => {
    const withLooks: WorldSpec = { ...WORLD, looks: { mars: { sky: { top: 1, bottom: 2 } } } };
    expect(resolveLook(withLooks, 'venus')).toEqual({ sky: WORLD.sky, backgrounds: WORLD.backgrounds });
  });

  it('a world with no backgrounds and a look naming none resolves to an empty array', () => {
    const bare: WorldSpec = { worldW: 30, worldH: 15, ppm: 32 };
    expect(resolveLook(bare, undefined)).toEqual({ sky: undefined, backgrounds: [] });
  });
});

describe('lookImageUrls', () => {
  it('no looks: just the world backgrounds', () => {
    expect(lookImageUrls(WORLD)).toEqual(['park.png']);
  });

  it('collects every look background, de-duplicated, first-seen order', () => {
    const world: WorldSpec = {
      ...WORLD,
      looks: {
        mars: { backgrounds: [{ url: 'mars.png', x: 0, y: 0, w: 1, h: 1 }, { url: 'park.png', x: 0, y: 0, w: 1, h: 1 }] },
        moon: { backgrounds: [{ url: 'moon.png', x: 0, y: 0, w: 1, h: 1 }, { url: 'mars.png', x: 0, y: 0, w: 1, h: 1 }] },
      },
    };
    expect(lookImageUrls(world)).toEqual(['park.png', 'mars.png', 'moon.png']);
  });

  it('a look with no backgrounds contributes nothing', () => {
    const world: WorldSpec = { ...WORLD, looks: { moon: { sky: { top: 1, bottom: 2 } } } };
    expect(lookImageUrls(world)).toEqual(['park.png']);
  });
});
