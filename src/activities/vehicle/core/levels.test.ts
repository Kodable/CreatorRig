// Course-wide level checks over every level of every planet. Each planet's own checks and its
// simulation proofs live with its levels (2026-10-09): levels/flooftopia.test.ts,
// levels/mars.test.ts (incl. the PENDING_RETUNE list), levels/europa.test.ts.
import { describe, expect, it } from 'vitest';
import { ATTACHMENT_KINDS, isAttachment } from './catalog';
import { CONCEPT_KINDS, EUROPA_LEVELS, FLOOFTOPIA_LEVELS, LEVELS, MARS_LEVELS, ROVER_X, findLevel } from './levels';
import { PLANETS } from './planets';
import { WORLD_W } from './terrain';
import type { PartKind } from './types';
import { knownConcepts } from '../../../kit/concepts';
import { levelPickerLabel } from '../../../kit/chapters';

const INTROS = ['wheels', 'shape', 'mount', 'weight', 'power'];

describe('vehicle levels: structure', () => {
  it('LEVELS is the five Flooftopia intros (one new thing each, in order), then the Mars levels ending in free play, then Europa', () => {
    expect(LEVELS).toEqual([...FLOOFTOPIA_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS]);
    expect(FLOOFTOPIA_LEVELS.map((l) => l.id)).toEqual(INTROS);
    expect(MARS_LEVELS[MARS_LEVELS.length - 1]!.id).toBe('free');
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Each intro names its concept first, then a `part:<kind>` entry per kind it unlocks.
    for (const [i, id] of INTROS.entries()) {
      expect(LEVELS[i]!.introduces).toEqual([id, ...CONCEPT_KINDS[id]!.map((kind) => `part:${kind}`)]);
    }
    for (const level of LEVELS.slice(INTROS.length)) expect(level.introduces ?? []).toEqual([]);
    expect(findLevel('jump')?.title).toBe('Crevasse jump');
    expect(findLevel('nope')).toBeUndefined();
  });

  it('2026-10-09: every level is on its file\'s planet, drawn with that planet\'s look, in that planet\'s chapter', () => {
    for (const [levels, planet] of [[FLOOFTOPIA_LEVELS, 'flooftopia'], [MARS_LEVELS, 'mars'], [EUROPA_LEVELS, 'europa']] as const) {
      for (const level of levels) {
        expect(level.planet, level.id).toBe(planet);
        expect(level.look, level.id).toBe(PLANETS[planet].look);
        expect(level.chapter, level.id).toBe(PLANETS[planet].name);
      }
    }
  });

  it('the level picker reads "<planet> · n of <chapter size>" (kit chapters.ts)', () => {
    expect(levelPickerLabel(findLevel('wheels')!, LEVELS)).toBe('Flooftopia · 1 of 5');
    expect(levelPickerLabel(findLevel('power')!, LEVELS)).toBe('Flooftopia · 5 of 5');
    expect(levelPickerLabel(findLevel('jump')!, LEVELS)).toBe(`Mars · 1 of ${MARS_LEVELS.length}`);
    expect(levelPickerLabel(findLevel('free')!, LEVELS)).toBe(`Mars · ${MARS_LEVELS.length} of ${MARS_LEVELS.length}`);
  });

  it('the Mount row (prop code "mount") is introduced by the mount level', () => {
    expect(findLevel('mount')!.introduces).toContain('mount');
  });

  it('part:<kind> unlocks (shelf callout, 2026-10-05): each kind is announced on the level that first offers it, and is in that palette', () => {
    const offered = new Set<PartKind>();
    const announced: Record<string, string[]> = {};
    for (const level of LEVELS) {
      const parts = (level.introduces ?? []).filter((e) => e.startsWith('part:')).map((e) => e.slice('part:'.length));
      for (const kind of parts) expect(level.palette, `${level.id}: ${kind}`).toContain(kind);
      const firsts = level.palette.filter((k) => !offered.has(k));
      expect([...parts].sort(), level.id).toEqual([...firsts].sort());
      for (const k of level.palette) offered.add(k);
      if (parts.length > 0) announced[level.id] = parts;
    }
    expect(announced).toEqual({
      wheels: ['wheelCircle', 'wheelSquare'],
      shape: ['wheelStar'],
      weight: ['feather', 'beans', 'watermelon'],
      power: ['fan', 'stove', 'jet'],
    });
    expect(offered).toEqual(new Set(ATTACHMENT_KINDS));
  });

  for (const level of LEVELS) {
    it(`${level.id}: one locked dome at x ${ROVER_X}, one beacon, unique ids, a budget, a valid terrain`, () => {
      const ids = level.parts.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      const domes = level.parts.filter((p) => p.kind === 'rover');
      expect(domes).toHaveLength(1);
      expect(domes[0]!.locked).toBe(true);
      expect(domes[0]!.lockPosition).toBe(true);
      expect(domes[0]!.x).toBe(ROVER_X);
      expect(level.parts.filter((p) => p.kind === 'finish')).toHaveLength(1);
      for (const p of level.parts) expect(p.locked).toBe(true); // the child adds everything else
      expect(level.parts.some((p) => isAttachment(p.kind))).toBe(false); // the preset is the dome alone
      expect(level.budget).toBeGreaterThan(0);
      // Every profile spans the whole (wide) world.
      expect(level.terrain[0]!.x).toBe(-1);
      expect(level.terrain[level.terrain.length - 1]!.x).toBe(WORLD_W + 1);
      for (let i = 1; i < level.terrain.length; i++) expect(level.terrain[i]!.x).toBeGreaterThan(level.terrain[i - 1]!.x);
      expect(level.bruno.length).toBeGreaterThan(0);
      expect(level.hints.length).toBeGreaterThanOrEqual(3);
      // `Level.extentW` (kit/types.ts): the camera/scrollbar's effective world. Wide enough that
      // the beacon is always inside it, with a little room to spare, but never past WORLD_W.
      const finishX = level.parts.find((p) => p.kind === 'finish')!.x;
      expect(level.extentW).toBeGreaterThanOrEqual(finishX + 2);
      expect(level.extentW).toBeLessThanOrEqual(WORLD_W);
      // Surface ranges (2026-10-09) are well formed and inside the world.
      for (const r of level.surfaces ?? []) {
        expect(r.to, `${level.id} surface`).toBeGreaterThan(r.from);
        expect(r.from).toBeGreaterThanOrEqual(-1);
        expect(r.to).toBeLessThanOrEqual(WORLD_W + 1);
      }
    });

    it(`${level.id}: the palette offers only attachments whose concept is known by this level`, () => {
      const known = knownConcepts(LEVELS, level.id) ?? new Set<string>();
      const allowed = new Set<PartKind>([...known].flatMap((c) => CONCEPT_KINDS[c] ?? []));
      expect(level.palette.length).toBeGreaterThan(0);
      for (const kind of level.palette) {
        expect(isAttachment(kind)).toBe(true);
        expect(allowed.has(kind), `${kind} before its concept`).toBe(true);
      }
    });
  }

  it('free play: no goals, a big budget, every attachment', () => {
    expect(findLevel('free')!.timeout).toBeUndefined();
    const free = findLevel('free')!;
    expect(free.goals).toEqual([]);
    expect(free.budget).toBeGreaterThanOrEqual(30);
    expect([...free.palette].sort()).toEqual([...ATTACHMENT_KINDS].sort());
    expect(free.solution).toBeUndefined();
  });
});
