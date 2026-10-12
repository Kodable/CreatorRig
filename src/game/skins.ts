// 2026-10-12 (Gao: "make an option to swap fuzz skins"): the fuzzes a child can pick to ride the
// coaster. Purely cosmetic: the sim rides a point along the rail, so a skin changes the picture and
// nothing else (every level solution in src/core/levels.test.ts is untouched). No Phaser import, so
// the list, the persistence and the pose rule are unit-tested (skins.test.ts).
//
// The pictures are the Marketing Library's Fuzz Family PNGs (GSA/Basics/Characters/Fuzz Family/
// <Name>/), normalised into public/skins/coaster/: the fur body centred on a 288 px square canvas,
// body diameter = canvas / SKIN_CANVAS_K, the baked grey ground shadow cut out (the catapult's
// fuzz-*.png were prepared the same way, at 1.44; the coaster's 1.6 leaves room for Cole's hard hat,
// Princess's tiara and Spike's flame hair). Each fuzz has a normal and an excited pose. The set
// overlaps the catapult's old Fuzz Family picks (Blue, Princess, Cole, Prism) and its Fur fuzz
// (Spike), plus three more that read well small and round.

export type SkinId = 'blue' | 'princess' | 'cole' | 'prism' | 'spike' | 'gracie' | 'violet' | 'checkers';

export interface FuzzSkin {
  id: SkinId;
  /** The fuzz's name, for the picker's tooltip / aria-label. */
  label: string;
  /** Public URLs (relative to the site root, like every other asset path here). */
  normal: string;
  excited: string;
}

/** Canvas side / body diameter of every skin picture (see the header). */
export const SKIN_CANVAS_K = 1.6;

function skin(id: SkinId, label: string): FuzzSkin {
  return { id, label, normal: `skins/coaster/${id}.png`, excited: `skins/coaster/${id}-excited.png` };
}

/** Picker order: Blue first (the coaster's fuzz until now, and the default). */
export const FUZZ_SKINS: readonly FuzzSkin[] = [
  skin('blue', 'Blue'),
  skin('princess', 'Princess'),
  skin('cole', 'Cole'),
  skin('prism', 'Prism'),
  skin('spike', 'Spike'),
  skin('gracie', 'Gracie'),
  skin('violet', 'Violet'),
  skin('checkers', 'Checkers'),
];

export const DEFAULT_SKIN: SkinId = 'blue';

/** localStorage key of the picked fuzz. */
export const SKIN_STORAGE_KEY = 'themePark.coaster.fuzzSkin';

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && FUZZ_SKINS.some((s) => s.id === v);
}

export function findSkin(id: SkinId): FuzzSkin {
  return FUZZ_SKINS.find((s) => s.id === id) ?? FUZZ_SKINS[0]!;
}

/** The slice of the Web Storage API the picker uses (tests pass a fake). */
export interface SkinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** window.localStorage, or null where it is missing or throws on access (a private window, blocked
 * site data, no window at all under the tests). */
export function defaultSkinStorage(): SkinStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The pick for this page session: survives leaving to the park map and coming back even when
 * localStorage is unavailable. */
let sessionSkin: SkinId | null = null;

/** The fuzz to ride: this session's pick, else the stored one, else Blue. Never throws. */
export function loadSkin(storage: SkinStorage | null = defaultSkinStorage()): SkinId {
  if (sessionSkin) return sessionSkin;
  try {
    const v = storage?.getItem(SKIN_STORAGE_KEY);
    if (isSkinId(v)) return v;
  } catch {
    // unreadable storage: the default below
  }
  return DEFAULT_SKIN;
}

/** Remembers the pick for the session and, when it can, in storage. Never throws. */
export function saveSkin(id: SkinId, storage: SkinStorage | null = defaultSkinStorage()): void {
  sessionSkin = id;
  try {
    storage?.setItem(SKIN_STORAGE_KEY, id);
  } catch {
    // quota / blocked storage: the session pick still holds
  }
}

/** Tests only: forgets the session pick. */
export function resetSkinSession(): void {
  sessionSkin = null;
}

/** Speed (m/s) above which the riding fuzz switches to its excited face, and below which it calms
 * down again. The gap stops the face flickering at the threshold (a hill crest hovers there). */
export const EXCITED_ON_SPEED = 7;
export const EXCITED_OFF_SPEED = 4.5;

/**
 * The riding fuzz's pose for this frame: excited while it rides fast or flies (airborne), back to
 * normal once it is slow and on the rail again. `wasExcited` is last frame's pose (hysteresis).
 */
export function excitedPose(wasExcited: boolean, speed: number, airborne: boolean): boolean {
  const v = Math.abs(speed);
  if (airborne || v >= EXCITED_ON_SPEED) return true;
  if (v <= EXCITED_OFF_SPEED) return false;
  return wasExcited;
}
