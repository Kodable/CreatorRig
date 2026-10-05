import { describe, expect, it } from 'vitest';
import { ATTACHMENT_KINDS, buildCost, isAttachment, mountOf } from './catalog';
import { CONCEPT_KINDS, HOP_GAPS, LEVELS, ROVER_X, findLevel } from './levels';
import { TIMEOUT_S, createVehicleSim } from './sim';
import { VIEW_W, WORLD_W, flat, heightAt, withCobbles, withHill, withRampToLip, withStairs } from './terrain';
import type { Metrics, Outcome, PartKind, RoverPart, Vec2, VehicleLevel } from './types';
import { allPass, evaluateGoals } from '../../../kit/goals';
import { knownConcepts } from '../../../kit/concepts';
import { FIXED_DT } from '../../../physics';

async function play(level: VehicleLevel, parts: RoverPart[]): Promise<{ outcome: Outcome; metrics: Metrics; pass: boolean }> {
  const sim = await createVehicleSim(parts, level);
  sim.play();
  const limit = (level.timeout ?? TIMEOUT_S) + 1;
  for (let i = 0; i < Math.ceil(limit / FIXED_DT) && sim.outcome === 'running'; i++) sim.step();
  const metrics = sim.metrics();
  const outcome = sim.outcome;
  sim.destroy();
  return { outcome, metrics, pass: outcome !== 'running' && allPass(evaluateGoals(level.goals, metrics)) };
}

const OLD = ['wheels', 'shape', 'mount', 'weight', 'power', 'jump', 'rubble', 'race'];
const LONG = ['flip', 'canyon', 'ridge', 'hops', 'marathon'];
const ORDER = [...OLD, ...LONG, 'free'];
const INTROS = ['wheels', 'shape', 'mount', 'weight', 'power'];

describe('vehicle levels: structure', () => {
  it('has 14 levels: five intros (one new thing each, in order), three challenges, five long challenges, then free play', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(ORDER);
    // Each intro names its concept first, then a `part:<kind>` entry per kind it unlocks.
    for (const [i, id] of INTROS.entries()) {
      expect(LEVELS[i]!.introduces).toEqual([id, ...CONCEPT_KINDS[id]!.map((kind) => `part:${kind}`)]);
    }
    for (const level of LEVELS.slice(INTROS.length)) expect(level.introduces ?? []).toEqual([]);
    expect(findLevel('jump')?.title).toBe('Crevasse jump');
    expect(findLevel('nope')).toBeUndefined();
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

  it('the intro Bruno lines are short (the coach carries the steps) and coins are not on them', () => {
    for (const id of INTROS) {
      const bruno = findLevel(id)!.bruno;
      expect(bruno.length, id).toBeLessThanOrEqual(70);
      expect(bruno, id).not.toMatch(/coin/i);
    }
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

/** The first nine levels as they were on 2026-10-02 (their terrain on x 0..30, beacon, budget,
 * palette size and solution), rebuilt here with the same helpers: the 2026-10-05 wide world must
 * not move any of it. Beyond x 30 each profile just continues at its last height. */
const OLD_LEVELS: Record<string, { terrain: Vec2[]; finishX: number; budget: number; palette: number; solution: [string, number, string][] }> = {
  wheels: { terrain: withHill(flat(), 11, 17, 1.2), finishX: 27, budget: 4, palette: 2, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup']] },
  shape: { terrain: withStairs(flat(), 12, 4, 0.15, 0.6), finishX: 27, budget: 6, palette: 2, solution: [['wheelStar', -45, 'cup'], ['wheelStar', -135, 'cup']] },
  mount: { terrain: withCobbles(flat(), 8, 18, 0.15, 0.6), finishX: 27, budget: 6, palette: 1, solution: [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']] },
  weight: { terrain: flat(), finishX: 17, budget: 7, palette: 6, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup'], ['watermelon', 0, 'cup']] },
  power: { terrain: withHill(flat(), 10, 16, 2.5), finishX: 27, budget: 8, palette: 9, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup'], ['fan', 180, 'cup']] },
  jump: { terrain: withRampToLip(flat(), 9, 15, 1, 5.5, -0.5), finishX: 27, budget: 9, palette: 9, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup'], ['jet', 180, 'cup']] },
  rubble: { terrain: withStairs(withCobbles(flat(), 6, 12, 0.2, 0.6), 14, 4, 0.2, 0.6), finishX: 27, budget: 10, palette: 9, solution: [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']] },
  race: { terrain: flat(), finishX: 27, budget: 9, palette: 9, solution: [['wheelCircle', -45, 'cup'], ['wheelCircle', -135, 'cup'], ['jet', 180, 'cup']] },
  free: { terrain: withHill(withHill(flat(), 8, 12, 0.8), 18, 22, 0.6), finishX: 27, budget: 40, palette: 9, solution: [] },
};

/** A solution part's kind, rim angle (degrees, from the dome's centre) and mount. */
function sticksOf(parts: RoverPart[]): [string, number, string][] {
  const dome = parts.find((p) => p.kind === 'rover')!;
  return parts
    .filter((p) => !p.locked)
    .map((p) => [p.kind, Math.round((Math.atan2(p.y - dome.y, p.x - dome.x) * 180) / Math.PI), mountOf(p.props)]);
}

describe('vehicle levels: the first nine are unchanged by the wide world', () => {
  for (const id of [...OLD, 'free']) {
    it(`${id}: same terrain on 0..30 (flat beyond), beacon, budget, palette and solution`, () => {
      const level = findLevel(id)!;
      const old = OLD_LEVELS[id]!;
      expect(level.terrain).toEqual(old.terrain);
      expect(heightAt(level.terrain, 60)).toBeCloseTo(heightAt(level.terrain, 31), 9);
      expect(heightAt(level.terrain, WORLD_W)).toBeCloseTo(heightAt(level.terrain, 31), 9);
      expect(level.parts.find((p) => p.kind === 'finish')!.x).toBe(old.finishX);
      expect(level.budget).toBe(old.budget);
      expect(level.palette).toHaveLength(old.palette);
      expect(level.timeout).toBeUndefined();
      expect(level.altSolutions).toBeUndefined();
      if (old.solution.length) expect(sticksOf(level.solution!)).toEqual(old.solution);
    });
  }

  it('each of the eight original challenge levels has extentW 30: their content ends well before x 30, so the course-wide 90 m world never shows a scrollbar or scrolls into their empty tail', () => {
    for (const id of OLD) expect(findLevel(id)!.extentW).toBe(30);
  });

  it('free play has extentW 90 (not 30): a free build may roam the whole world, not just the old 0..30 content', () => {
    expect(findLevel('free')!.extentW).toBe(90);
  });
});

describe('vehicle levels: the long challenges (2026-10-05)', () => {
  for (const id of LONG) {
    const level = findLevel(id)!;
    it(`${id}: the beacon is far to the right (out of the first view), 60-90 m of course, every part, a generous budget`, () => {
      const finish = level.parts.find((p) => p.kind === 'finish')!;
      expect(finish.x).toBeGreaterThan(VIEW_W * 2);
      expect(finish.x).toBeLessThanOrEqual(WORLD_W - 2);
      expect(finish.x - ROVER_X).toBeGreaterThanOrEqual(60);
      expect([...level.palette].sort()).toEqual([...ATTACHMENT_KINDS].sort());
      expect(level.budget).toBeGreaterThanOrEqual(12);
      expect(level.budget).toBeLessThanOrEqual(20);
      expect(level.timeout).toBeGreaterThan(TIMEOUT_S);
      expect(level.altSolutions!.length).toBeGreaterThanOrEqual(3);
      expect(level.failHints.stuck).toBeTruthy();
    });

    it(`${id}: extentW is the beacon x + 4 m, rounded up, capped at WORLD_W`, () => {
      const finish = level.parts.find((p) => p.kind === 'finish')!;
      expect(level.extentW).toBe(Math.min(WORLD_W, Math.ceil(finish.x + 4)));
    });

    it(`${id}: varied terrain: the ground changes height well past the first view`, () => {
      const heights = [];
      for (let x = VIEW_W; x <= WORLD_W - 5; x += 0.5) heights.push(heightAt(level.terrain, x));
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.5);
    });

    it(`${id}: every altSolutions build keeps the level's parts, fits the budget and passes`, async () => {
      for (const alt of level.altSolutions!) {
        for (const p of level.parts) expect(alt.find((s) => s.id === p.id)).toEqual(p);
        expect(buildCost(alt)).toBeLessThanOrEqual(level.budget!);
        for (const p of alt.filter((q) => !q.locked)) expect(level.palette).toContain(p.kind);
        const r = await play(level, alt);
        expect(r.outcome, JSON.stringify(sticksOf(alt))).toBe('finished');
        expect(r.pass, JSON.stringify(sticksOf(alt))).toBe(true);
      }
    });
  }

  it('flip: a 9 m mesa with two cliffs; the solution and every alternative have wheels on top and drive 10+ m upside down', async () => {
    const level = findLevel('flip')!;
    expect(heightAt(level.terrain, ROVER_X)).toBe(9);
    expect(heightAt(level.terrain, 80)).toBe(0);
    for (const build of [level.solution!, ...level.altSolutions!]) {
      expect(sticksOf(build).some(([kind, deg]) => kind.startsWith('wheel') && deg > 20 && deg < 160)).toBe(true);
      const r = await play(level, build);
      expect(r.outcome).toBe('finished');
      expect(r.metrics.upsideDown, JSON.stringify(sticksOf(build))).toBeGreaterThan(10);
    }
  });

  it('flip: the same rover without its top wheels lands on its roof and gets stuck', async () => {
    const level = findLevel('flip')!;
    const bottomOnly = level.solution!.filter((p) => p.locked || p.y < level.parts.find((q) => q.kind === 'rover')!.y);
    expect(bottomOnly.filter((p) => !p.locked)).toHaveLength(2);
    const r = await play(level, bottomOnly);
    expect(r.outcome).toBe('stuck');
  });

  it('hops: four gaps, each wider than the last; marathon: a time limit', () => {
    expect(HOP_GAPS).toHaveLength(4);
    for (let i = 1; i < HOP_GAPS.length; i++) expect(HOP_GAPS[i]!).toBeGreaterThan(HOP_GAPS[i - 1]!);
    expect(findLevel('marathon')!.goals.some((g) => g.metric === 'time' && g.op === '<=')).toBe(true);
  });
});

describe('vehicle levels: solutions (proven by simulation)', () => {
  const withSolutions = LEVELS.filter((l) => l.solution);

  it('every level but free play has a solution', () => {
    expect(withSolutions.map((l) => l.id)).toEqual(ORDER.slice(0, -1));
  });

  for (const level of withSolutions) {
    const solution = level.solution!;
    const added = solution.filter((p) => !p.locked);

    it(`${level.id}: the solution keeps the level's own parts and adds only palette parts`, () => {
      for (const p of level.parts) expect(solution.find((s) => s.id === p.id)).toEqual(p);
      expect(added.length).toBeGreaterThan(0);
      for (const p of added) expect(level.palette).toContain(p.kind);
    });

    it(`${level.id}: the solution fits the budget (${level.budget} coins)`, () => {
      expect(buildCost(solution)).toBeLessThanOrEqual(level.budget!);
    });

    it(`${level.id}: the solution uses springs only once the mount is introduced`, () => {
      const known = knownConcepts(LEVELS, level.id) ?? new Set<string>();
      if (!known.has('mount')) for (const p of added) expect(mountOf(p.props)).toBe('cup');
    });

    it(`${level.id}: the solution passes its goals`, async () => {
      const r = await play(level, solution);
      expect(r.outcome).toBe('finished');
      expect(r.pass).toBe(true);
    });

    it(`${level.id}: the preset (the dome alone) does not pass`, async () => {
      const r = await play(level, level.parts);
      expect(r.pass).toBe(false);
    });
  }
});
