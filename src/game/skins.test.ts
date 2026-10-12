import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_SKIN,
  FUZZ_SKINS,
  SKIN_STORAGE_KEY,
  excitedPose,
  findSkin,
  isSkinId,
  loadSkin,
  resetSkinSession,
  saveSkin,
  type SkinStorage,
} from './skins';

function memStorage(init: Record<string, string> = {}): SkinStorage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const throwing: SkinStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

afterEach(() => resetSkinSession());

describe('FUZZ_SKINS', () => {
  it('has 5 to 8 fuzzes with unique ids, Blue first as the default', () => {
    expect(FUZZ_SKINS.length).toBeGreaterThanOrEqual(5);
    expect(FUZZ_SKINS.length).toBeLessThanOrEqual(8);
    expect(new Set(FUZZ_SKINS.map((s) => s.id)).size).toBe(FUZZ_SKINS.length);
    expect(FUZZ_SKINS[0]!.id).toBe(DEFAULT_SKIN);
  });

  it('every skin has both pose pictures in public/', () => {
    for (const s of FUZZ_SKINS) {
      expect(existsSync(resolve(__dirname, '../../public', s.normal)), s.normal).toBe(true);
      expect(existsSync(resolve(__dirname, '../../public', s.excited)), s.excited).toBe(true);
    }
  });

  it('isSkinId / findSkin', () => {
    expect(isSkinId('cole')).toBe(true);
    expect(isSkinId('nope')).toBe(false);
    expect(isSkinId(null)).toBe(false);
    expect(findSkin('violet').label).toBe('Violet');
  });
});

describe('loadSkin / saveSkin', () => {
  it('defaults to Blue with nothing stored, no storage, or storage that throws', () => {
    expect(loadSkin(memStorage())).toBe('blue');
    expect(loadSkin(null)).toBe('blue');
    expect(loadSkin(throwing)).toBe('blue');
  });

  it('reads a stored pick and ignores junk', () => {
    expect(loadSkin(memStorage({ [SKIN_STORAGE_KEY]: 'gracie' }))).toBe('gracie');
    expect(loadSkin(memStorage({ [SKIN_STORAGE_KEY]: 'godzilla' }))).toBe('blue');
  });

  it('saves to storage and keeps the session pick when storage is missing or throws', () => {
    const st = memStorage();
    saveSkin('spike', st);
    expect(st.data[SKIN_STORAGE_KEY]).toBe('spike');
    expect(loadSkin(memStorage())).toBe('spike'); // the session wins over (empty) storage

    resetSkinSession();
    expect(() => saveSkin('prism', throwing)).not.toThrow();
    expect(loadSkin(throwing)).toBe('prism');
    resetSkinSession();
    saveSkin('cole', null);
    expect(loadSkin(null)).toBe('cole');
  });
});

describe('excitedPose', () => {
  it('excited when fast or airborne, calm when slow, keeps the pose in between', () => {
    expect(excitedPose(false, 0, false)).toBe(false);
    expect(excitedPose(false, 8, false)).toBe(true);
    expect(excitedPose(false, -8, false)).toBe(true); // rolling back fast
    expect(excitedPose(false, 1, true)).toBe(true);
    expect(excitedPose(true, 5.5, false)).toBe(true);
    expect(excitedPose(false, 5.5, false)).toBe(false);
    expect(excitedPose(true, 3, false)).toBe(false);
  });
});
