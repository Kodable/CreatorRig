import { describe, expect, it } from 'vitest';
import { EUROPA_LEVELS } from './europa';
import { play, proveLevels } from './prove';
import { LONG_TIMEOUT, stickOn } from './shared';
import type { Stick } from './shared';
import { ATTACHMENT_KINDS, buildCost } from '../catalog';
import { PLANETS } from '../planets';
import { surfaceAt } from '../surfaces';
import { TIMEOUT_S } from '../sim';
import { VIEW_W, WORLD_W, findGaps, heightAt } from '../terrain';
import type { RoverPart } from '../types';

const find = (id: string) => EUROPA_LEVELS.find((l) => l.id === id)!;
/** The level's own parts plus `sticks` on the dome's rim, as the child would build it. */
const build = (id: string, sticks: Stick[]): RoverPart[] => [...find(id).parts, ...stickOn(find(id).terrain, sticks)];
const run = (id: string, sticks: Stick[]) => play(find(id), build(id, sticks));

const ROUND2: Stick[] = [['wheelCircle', -45], ['wheelCircle', -135]];
const SQUARE2: Stick[] = [['wheelSquare', -45], ['wheelSquare', -135]];
const STAR2: Stick[] = [['wheelStar', -45], ['wheelStar', -135]];
const springs = (sticks: Stick[]): Stick[] => sticks.map(([kind, deg]) => [kind, deg, 'spring']);

describe('Europa levels', () => {
  it('Europa: 1.3 m/s^2, ice wherever a level says nothing else', () => {
    expect(PLANETS.europa.gravity).toBe(1.3);
    expect(PLANETS.europa.ground).toBe('ice');
  });

  it('every Europa level is on Europa', () => {
    for (const level of EUROPA_LEVELS) expect(level.planet, level.id).toBe('europa');
  });

  it('meet the ice first, then the challenges, the long trek last', () => {
    expect(EUROPA_LEVELS.map((l) => l.id)).toEqual(['ice', 'crack', 'frozen', 'runway', 'trek']);
  });

  it('the child knows every part by Europa: every level offers them all and introduces nothing', () => {
    for (const level of EUROPA_LEVELS) {
      expect([...level.palette].sort(), level.id).toEqual([...ATTACHMENT_KINDS].sort());
      expect(level.introduces, level.id).toBeUndefined();
    }
  });

  it("the first level welcomes the child to Europa (Jupiter's moon, ice over an ocean, tiny gravity) and its hints name both ways up the ice", () => {
    const welcome = find('ice');
    expect(welcome.bruno).toMatch(/Europa/);
    expect(welcome.bruno).toMatch(/Jupiter/);
    expect(welcome.bruno).toMatch(/ice/);
    expect(welcome.bruno).toMatch(/ocean/);
    expect(welcome.bruno).toMatch(/gravity/i);
    const hints = welcome.hints.join(' ');
    expect(hints).toMatch(/star/i);
    expect(hints).toMatch(/fan/i);
    expect(welcome.goals).toHaveLength(1); // the gentle level: just reach the beacon
  });

  it("the words are Europa's, not another planet's", () => {
    for (const level of EUROPA_LEVELS) {
      const words = [level.title, level.bruno, ...level.hints, ...Object.values(level.failHints)].join(' ');
      expect(words, level.id).not.toMatch(/mars|marstopia|flooftopia|crater|sand|grass/i);
    }
  });

  it('the short levels fit one view (extentW 30); the trek runs to x 80, scrolls, and has the long timeout', () => {
    for (const level of EUROPA_LEVELS.filter((l) => l.id !== 'trek')) {
      expect(level.extentW, level.id).toBe(30);
      expect(level.parts.find((p) => p.kind === 'finish')!.x, level.id).toBeLessThanOrEqual(27);
      expect(level.timeout, level.id).toBeUndefined();
    }
    const trek = find('trek');
    const finish = trek.parts.find((p) => p.kind === 'finish')!;
    expect(finish.x).toBe(80);
    expect(finish.x).toBeGreaterThan(VIEW_W * 2);
    expect(trek.extentW).toBe(Math.min(WORLD_W, Math.ceil(finish.x + 4)));
    expect(trek.timeout).toBe(LONG_TIMEOUT);
    expect(trek.timeout).toBeGreaterThan(TIMEOUT_S);
    expect(trek.failHints.stuck).toBeTruthy();
    // varied ground well past the first view: the crack, the climbs, the rocks
    const heights = [];
    for (let x = VIEW_W; x <= finish.x; x += 0.5) heights.push(heightAt(trek.terrain, x));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.5);
    expect(findGaps(trek.terrain).length).toBe(1);
  });

  it('the ground is ice but for the rock runway, the trek\'s rock road and the rocks standing in the ice', () => {
    const ground = (id: string, x: number) => surfaceAt(find(id).surfaces, PLANETS.europa.ground, x);
    for (const x of [4, 12, 20, 26]) {
      expect(ground('ice', x)).toBe('ice');
      expect(ground('crack', x)).toBe('ice');
    }
    expect(ground('runway', 4)).toBe('rock');
    expect(ground('runway', 16)).toBe('rock'); // the ramp, up to its lip
    expect(ground('runway', 24)).toBe('ice'); // the landing
    expect(ground('trek', 15)).toBe('ice');
    expect(ground('trek', 27)).toBe('rock');
    expect(ground('trek', 34)).toBe('ice');
    expect(find('frozen').rocks).toHaveLength(3);
    for (const r of find('frozen').rocks!) expect(ground('frozen', r.x)).toBe('rock');
    expect(ground('frozen', 12)).toBe('ice');
  });
});

describe('Europa levels: the lessons (simulated)', () => {
  it('Icy hill: two round wheels, two square wheels (on cups or springs) and three round wheels spin at the foot of the hill and never get over it', async () => {
    const plain: Stick[][] = [ROUND2, SQUARE2, springs(ROUND2), springs(SQUARE2), [['wheelCircle', -30], ['wheelCircle', -90], ['wheelCircle', -150]]];
    for (const sticks of plain) {
      const r = await run('ice', sticks);
      expect(r.outcome, JSON.stringify(sticks)).toBe('stuck');
      // the hill's top is at x 16, 13 m from the start
      expect(r.metrics.distance, JSON.stringify(sticks)).toBeLessThan(13);
    }
  });

  it('Floaty jump: plain round wheels spin at the foot of the icy ramp; star wheels climb it but drop into the crack', async () => {
    expect((await run('crack', ROUND2)).outcome).toBe('stuck');
    expect((await run('crack', STAR2)).outcome).toBe('fell');
    expect((await run('crack', springs(STAR2))).outcome).toBe('fell');
  });

  it('Frozen rocks: the same two star wheels fail on suction cups and pass on springs', async () => {
    expect((await run('frozen', STAR2)).pass).toBe(false);
    expect((await run('frozen', springs(STAR2))).pass).toBe(true);
  });

  it('Frozen rocks: the dome alone with a stove tilted down at the back (a hovering sled in tiny gravity) does not get past the rocks', async () => {
    const r = await run('frozen', [['stove', -150]]);
    expect(r.pass).toBe(false);
  });

  it('Rock runway: two round wheels speed up on the rock and float over; star and square wheels drop into the crack', async () => {
    expect((await run('runway', ROUND2)).pass).toBe(true);
    expect((await run('runway', STAR2)).outcome).toBe('fell');
    expect((await run('runway', SQUARE2)).outcome).toBe('fell');
  });

  it('Europa trek: two round wheels spin at the first icy climb; star wheels on cups drop into the crack', async () => {
    const round = await run('trek', ROUND2);
    expect(round.outcome).toBe('stuck');
    expect(round.metrics.distance).toBeLessThan(17); // the climb tops out at x 20
    expect((await run('trek', STAR2)).outcome).toBe('fell');
  });

  it('two plain round wheels pass only the Rock runway (the level where the runway is rock)', async () => {
    const passed: string[] = [];
    for (const level of EUROPA_LEVELS) if ((await run(level.id, ROUND2)).pass) passed.push(level.id);
    expect(passed).toEqual(['runway']);
  });

  it('a jet is no shortcut: two round or two square wheels and a jet on the back pass at most one Europa level (coins aside), the round ones none within budget', async () => {
    for (const wheels of [ROUND2, SQUARE2]) {
      const sticks: Stick[] = [...wheels, ['jet', 180]];
      const passed: string[] = [];
      for (const level of EUROPA_LEVELS) if ((await run(level.id, sticks)).pass) passed.push(level.id);
      expect(passed.length, `${JSON.stringify(sticks)}: ${passed.join(', ')}`).toBeLessThanOrEqual(1);
      if (wheels === ROUND2) {
        const affordable = passed.filter((id) => buildCost(build(id, sticks)) <= find(id).budget!);
        expect(affordable).toEqual([]);
      }
    }
  });
});

proveLevels('Europa', EUROPA_LEVELS);
