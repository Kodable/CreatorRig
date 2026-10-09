import { describe, expect, it } from 'vitest';
import { HOP_GAPS, MARS_LEVELS } from './mars';
import { play, proveLevels, sticksOf } from './prove';
import { ROVER_X, stickOn } from './shared';
import type { Stick } from './shared';
import { ATTACHMENT_KINDS } from '../catalog';
import { PLANETS } from '../planets';
import { TIMEOUT_S } from '../sim';
import { surfaceAt } from '../surfaces';
import { VIEW_W, WORLD_W, findGaps, heightAt } from '../terrain';
import type { VehicleLevel } from '../types';

// 2026-10-09: the Mars chapter, retuned for Mars gravity (3.7 m/s^2, the wheel torque scaled with
// it, planets.ts) with four sand levels added. Every solution and altSolutions build is proven at
// the bottom (proveLevels); the lesson tests below prove what each level is FOR: the builds that
// must fail (plain wheels on the jump, round wheels in the sand, stiff wheels at the rocks, ...).

const find = (id: string) => MARS_LEVELS.find((l) => l.id === id)!;
/** The challenges that fit the first 30 m view (no intro pan; spec.test.ts expects only the five
 * long ones to pan). */
const SHORT = ['jump', 'rubble', 'race', 'sand', 'dunes', 'rocky', 'rockfield'];
const LONG = ['flip', 'canyon', 'ridge', 'hops', 'marathon'];

/** Runs `sticks` (the child's parts) on a level. */
const drive = (id: string, sticks: Stick[]) => {
  const level = find(id);
  return play(level, [...level.parts, ...stickOn(level.terrain, sticks)]);
};

const ROUND: Stick[] = [['wheelCircle', -45], ['wheelCircle', -135]];
const ROUND_SPRINGS: Stick[] = [['wheelCircle', -45, 'spring'], ['wheelCircle', -135, 'spring']];
const SQUARE: Stick[] = [['wheelSquare', -45], ['wheelSquare', -135]];
const STAR: Stick[] = [['wheelStar', -45], ['wheelStar', -135]];
const STAR_SPRINGS: Stick[] = [['wheelStar', -45, 'spring'], ['wheelStar', -135, 'spring']];

function words(level: VehicleLevel): string {
  return [level.title, level.bruno, ...level.hints, ...Object.values(level.failHints)].join(' ');
}

describe('Mars levels', () => {
  it('Mars: 3.7 m/s^2, rock ground; the welcome jump, the rock challenges, sand, rocky sand, the long challenges, free play last', () => {
    expect(PLANETS.mars.gravity).toBe(3.7);
    expect(PLANETS.mars.ground).toBe('rock');
    expect(MARS_LEVELS.map((l) => l.id)).toEqual([...SHORT, ...LONG, 'free']);
  });

  it('the first level welcomes the child to Mars and says the low-gravity rule in kid words', () => {
    const bruno = MARS_LEVELS[0]!.bruno;
    expect(bruno).toMatch(/Welcome to Mars/);
    expect(bruno).toMatch(/gravity/i);
    expect(bruno).toMatch(/slower/);
    expect(bruno).toMatch(/farther/);
  });

  it('the meet-sand and meet-rocky-sand levels say their rules in Bruno\'s line', () => {
    expect(find('sand').bruno).toMatch(/soft/);
    expect(find('sand').bruno).toMatch(/[Ss]tar wheels paddle/);
    expect(find('sand').bruno).toMatch(/[Hh]eavy rovers sink more/);
    expect(find('rocky').bruno).toMatch(/[Ss]and is soft and rocks are hard/);
  });

  it('"stay on your wheels" goals use upsideDown == 0 (flips counts only full turns, so a rover sliding in on its roof passed a flips == 0 goal)', () => {
    for (const level of MARS_LEVELS) expect(level.goals.some((g) => g.metric === 'flips'), level.id).toBe(false);
    for (const id of ['jump', 'rubble']) expect(find(id).goals).toContainEqual(expect.objectContaining({ metric: 'upsideDown', op: '==', value: 0 }));
  });

  it('no "Marstopia" left: the marathon and free play are Mars\'s', () => {
    for (const level of MARS_LEVELS) expect(words(level), level.id).not.toMatch(/marstopia/i);
    expect(find('marathon').title).toBe('Mars marathon');
    expect(find('free').title).toBe('Roam Mars');
  });

  for (const id of SHORT) {
    it(`${id}: a short challenge: the beacon in the first view (no intro pan), extentW 30, the default timeout`, () => {
      const level = find(id);
      expect(level.parts.find((p) => p.kind === 'finish')!.x).toBeLessThan(VIEW_W - 1);
      expect(level.extentW).toBe(30);
      expect(level.timeout).toBeUndefined();
      expect([...level.palette].sort()).toEqual([...ATTACHMENT_KINDS].sort());
    });
  }

  it('free play has extentW 90: a free build may roam the whole world, sand and rocks included', () => {
    const free = find('free');
    expect(free.extentW).toBe(90);
    expect(free.surfaces?.some((r) => r.kind === 'sand')).toBe(true);
    expect(free.rocks?.length).toBeGreaterThan(0);
  });
});

describe('Mars levels: the ground (sand and rocks)', () => {
  const sandAt = (level: VehicleLevel, x: number) => surfaceAt(level.surfaces, PLANETS.mars.ground, x) === 'sand';

  it('sand: the sand rise (x 12 to 15.7, 15 degrees) is all sand; the start and the beacon are on rock', () => {
    const level = find('sand');
    for (let x = 8.5; x < 20; x += 0.5) expect(sandAt(level, x), `x ${x}`).toBe(true);
    expect(heightAt(level.terrain, 15.8)).toBeCloseTo(1, 6);
    expect(sandAt(level, ROVER_X)).toBe(false);
    expect(sandAt(level, 26)).toBe(false);
  });

  it('dunes: both dunes are sand', () => {
    const level = find('dunes');
    for (let x = 7; x <= 25.8; x += 0.5) expect(sandAt(level, x), `x ${x}`).toBe(true);
    expect(Math.max(...level.terrain.map((p) => p.y))).toBeCloseTo(1.6, 6);
  });

  it('flip: sand covers the 4 m before each cliff edge', () => {
    const level = find('flip');
    for (const edge of [16, 40]) {
      expect(sandAt(level, edge - 3.9)).toBe(true);
      expect(sandAt(level, edge - 0.1)).toBe(true);
      expect(sandAt(level, edge - 4.5)).toBe(false);
    }
  });

  it('marathon: sand from x 46 to 74 with three rocks in it', () => {
    const level = find('marathon');
    expect(sandAt(level, 47)).toBe(true);
    expect(sandAt(level, 73)).toBe(true);
    expect(level.rocks).toHaveLength(3);
  });

  for (const level of MARS_LEVELS.filter((l) => l.rocks)) {
    it(`${level.id}: every rock stands in sand, apart from the others, clear of gaps, the dome and the beacon`, () => {
      const rocks = [...level.rocks!].sort((a, b) => a.x - b.x);
      const finish = level.parts.find((p) => p.kind === 'finish')!;
      for (const [i, r] of rocks.entries()) {
        expect(sandAt(level, r.x - r.w / 2 - 0.05), `${r.x}`).toBe(true);
        expect(sandAt(level, r.x + r.w / 2 + 0.05), `${r.x}`).toBe(true);
        expect(surfaceAt(level.surfaces, PLANETS.mars.ground, r.x)).toBe('rock');
        if (i > 0) expect(r.x - r.w / 2 - (rocks[i - 1]!.x + rocks[i - 1]!.w / 2), `${r.x}`).toBeGreaterThan(1.5);
        for (const g of findGaps(level.terrain)) expect(r.x + r.w / 2 < g.x0 - 1 || r.x - r.w / 2 > g.x1 + 1).toBe(true);
        expect(r.x - ROVER_X).toBeGreaterThan(4);
        expect(Math.abs(r.x - finish.x)).toBeGreaterThan(2);
      }
    });
  }
});

describe('Mars levels: the long challenges (2026-10-05)', () => {
  for (const id of LONG) {
    const level = find(id);
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
  }

  it('flip: a 9 m mesa with two cliffs; the solution and every alternative have wheels on top and drive 10+ m upside down', async () => {
    const level = find('flip');
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
    const level = find('flip');
    const bottomOnly = level.solution!.filter((p) => p.locked || p.y < level.parts.find((q) => q.kind === 'rover')!.y);
    expect(bottomOnly.filter((p) => !p.locked)).toHaveLength(2);
    const r = await play(level, bottomOnly);
    expect(r.outcome).toBe('stuck');
  });

  it('hops: four gaps, each wider than the last and at least 1.5x the old ones (Mars jumps farther); marathon: a time limit', () => {
    expect(HOP_GAPS).toHaveLength(4);
    for (let i = 1; i < HOP_GAPS.length; i++) expect(HOP_GAPS[i]!).toBeGreaterThan(HOP_GAPS[i - 1]!);
    [1.5, 2.5, 3.5, 5].forEach((old, i) => expect(HOP_GAPS[i]!).toBeGreaterThanOrEqual(1.5 * old));
    expect(findGaps(find('hops').terrain).map((g) => +(g.x1 - g.x0).toFixed(3))).toEqual(HOP_GAPS);
    expect(find('marathon').goals.some((g) => g.metric === 'time' && g.op === '<=')).toBe(true);
  });
});

// The lessons: on each level, the builds a child tries first that must NOT pass (and why).
describe('Mars levels: lessons (proven by simulation)', () => {
  it('jump: the crevasse is 8 m (5.5 m before Mars) and wheels alone drop into it, even on Mars', async () => {
    const [gap] = findGaps(find('jump').terrain);
    expect(gap!.x1 - gap!.x0).toBeCloseTo(8, 6);
    for (const wheels of [ROUND, ROUND_SPRINGS, STAR, [['wheelCircle', -30], ['wheelCircle', -90], ['wheelCircle', -150]] as Stick[]]) {
      const r = await drive('jump', wheels);
      expect(r.outcome, JSON.stringify(wheels)).toBe('fell');
    }
  });

  it('rubble: stiff round wheels stall at the rubble; squares and springy stars climb it but miss the clock', async () => {
    expect((await drive('rubble', ROUND)).outcome).toBe('stuck');
    for (const build of [SQUARE, STAR_SPRINGS]) {
      const r = await drive('rubble', build);
      expect(r.outcome, JSON.stringify(build)).toBe('finished');
      expect(r.metrics.time, JSON.stringify(build)).toBeGreaterThan(12);
    }
  });

  it('race: wheels alone (5.2 s) and a fan (4.3 s) miss the 4 s clock', async () => {
    for (const build of [ROUND, [...ROUND, ['fan', 180]] as Stick[]]) {
      const r = await drive('race', build);
      expect(r.outcome).toBe('finished');
      expect(r.metrics.time).toBeGreaterThan(4);
      expect(r.pass).toBe(false);
    }
  });

  it('sand: round and square wheels get stuck in the sand; two stars with a heavy melon sink and stall', async () => {
    for (const build of [ROUND, ROUND_SPRINGS, SQUARE, [...STAR, ['watermelon', 90]] as Stick[]]) {
      const r = await drive('sand', build);
      expect(r.outcome, JSON.stringify(build)).toBe('stuck');
    }
  });

  it('dunes: round and square wheels alone stall on the first dune; stars alone make it, too slowly', async () => {
    for (const build of [ROUND, ROUND_SPRINGS, SQUARE]) expect((await drive('dunes', build)).outcome).toBe('stuck');
    for (const build of [STAR, STAR_SPRINGS]) {
      const r = await drive('dunes', build);
      expect(r.outcome).toBe('finished');
      expect(r.pass).toBe(false);
    }
  });

  it('rocky: stiff wheels stop at a rock (round or star, with or without a fan); on springs both get through', async () => {
    for (const build of [ROUND, STAR, [...ROUND, ['fan', 180]] as Stick[]]) {
      expect((await drive('rocky', build)).outcome, JSON.stringify(build)).toBe('stuck');
    }
    for (const build of [ROUND_SPRINGS, STAR_SPRINGS]) expect((await drive('rocky', build)).pass, JSON.stringify(build)).toBe(true);
  });

  it('rockfield: stiff wheels with no push stop at a rock', async () => {
    for (const build of [ROUND, STAR, SQUARE, [['wheelStar', -30], ['wheelStar', -90], ['wheelStar', -150]] as Stick[]]) {
      expect((await drive('rockfield', build)).outcome, JSON.stringify(build)).toBe('stuck');
    }
  });

  it('flip: no plain build without wheels on top gets past the cliffs', async () => {
    for (const build of [ROUND, ROUND_SPRINGS, STAR_SPRINGS, [['wheelCircle', -30], ['wheelCircle', -90], ['wheelCircle', -150]] as Stick[]]) {
      expect((await drive('flip', build)).pass, JSON.stringify(build)).toBe(false);
    }
  });

  it('canyon: wheels alone get stuck on the wall (two round wheels stiff or on springs, two stars on springs)', async () => {
    for (const build of [ROUND, ROUND_SPRINGS, STAR_SPRINGS]) {
      const r = await drive('canyon', build);
      expect(r.outcome, JSON.stringify(build)).toBe('stuck');
      expect(r.metrics.distance, JSON.stringify(build)).toBeGreaterThan(55 - ROVER_X);
    }
  });

  it('ridge: stiff round wheels do not ride the ridge', async () => {
    expect((await drive('ridge', ROUND)).pass).toBe(false);
    expect((await drive('ridge', [['wheelCircle', -30], ['wheelCircle', -90], ['wheelCircle', -150]])).pass).toBe(false);
  });

  it('hops: plain round wheels hop the first three gaps and drop into the last', async () => {
    const gaps = findGaps(find('hops').terrain);
    for (const build of [ROUND, ROUND_SPRINGS]) {
      const r = await drive('hops', build);
      expect(r.outcome, JSON.stringify(build)).toBe('fell');
      expect(r.metrics.distance, JSON.stringify(build)).toBeGreaterThan(gaps[2]!.x1 - ROVER_X);
    }
  });

  it('marathon: without a push, square wheels drop into the gap and round wheels on springs stall in the sand', async () => {
    expect((await drive('marathon', SQUARE)).outcome).toBe('fell');
    const r = await drive('marathon', ROUND_SPRINGS);
    expect(r.outcome).toBe('stuck');
    expect(r.metrics.distance).toBeGreaterThan(46 - ROVER_X);
    expect(r.metrics.distance).toBeLessThan(74 - ROVER_X);
  });
});

proveLevels('Mars', MARS_LEVELS);
