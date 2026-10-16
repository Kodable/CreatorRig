// Proves every scored level's `solution` (with `solutionShots` retunes where given) clears its
// goals within its shot budget, and that the preset alone (fired for every shot) does not.
import { describe, expect, it } from 'vitest';
import { allPass, evaluateGoals } from '../../../kit/goals';
import { createCatapultSim } from './sim';
import { LEVELS, SPACE_HINT, findLevel } from './levels';
import { ARM_LENGTHS, isSpaceShot } from './catalog';
import type { CatapultLevel } from './types';

const MAX_TICKS_PER_SHOT = 660;
const STACK_LEVEL_IDS = ['pyramid', 'towers', 'wall', 'dominoes'];
const LINE_LEVEL_IDS = ['line', 'chain', ...STACK_LEVEL_IDS];

async function fireAllShots(parts: CatapultLevel['parts'], level: CatapultLevel, solutionShots?: Record<string, string>[]) {
  const sim = await createCatapultSim(parts, level);
  const catapultPart = parts.find((part) => part.kind === 'catapult');
  if (!catapultPart) throw new Error(`level ${level.id} has no catapult part`);

  let passed = false;
  const shotBudget = level.shots > 0 ? level.shots : 1;
  for (let shot = 0; shot < shotBudget; shot++) {
    const override = solutionShots?.[shot];
    if (override && sim.updatePart) {
      sim.updatePart({ ...catapultPart, props: { ...catapultPart.props, ...override } });
    }
    sim.play();
    for (let tick = 0; tick < MAX_TICKS_PER_SHOT && sim.outcome === 'running'; tick++) {
      sim.step();
    }
    passed = allPass(evaluateGoals(level.goals, sim.metrics()));
    if (passed || sim.outcome === 'cleared' || sim.outcome === 'outOfShots' || !sim.canReplay()) break;
  }
  return { sim, passed };
}

describe('catapult levels: structure', () => {
  it('has 15 entries with unique ids, free play last (no move or Bullseye level, Long shot added, 2026-10-15)', () => {
    expect(LEVELS).toHaveLength(15);
    // Stakeholder direction 2026-09-22: intro levels (one new mechanic each) up front, then a run
    // of challenge levels that mix everything. 2026-10-15: the Bullseye level ('both') is gone and
    // Smash it introduces the breakable crates right before the challenge run.
    expect(LEVELS.map((level) => level.id)).toEqual([
      // 2026-10-15 (the energy rule): Long shot, where a light fuzz is the answer, follows Smash it.
      'power', 'angle', 'weight', 'arm', 'donut', 'smash', 'longshot', 'tower', 'line', 'chain',
      // Stakeholder request 2026-09-22: stack levels with a lenient line, before free play.
      'pyramid', 'towers', 'wall', 'dominoes',
      'free',
    ]);
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(LEVELS.length);
  });

  it('the first five levels each introduce at most one code, and together introduce exactly ' +
    'bands, angle, fuzz (the weight level), armLen and the Donut option (fuzz:Donut, its own level); ' +
    'Smash it and the challenge levels introduce nothing (crates are a target, not a drawer row)', () => {
    const introLevels = LEVELS.slice(0, 5);
    const challengeLevels = LEVELS.slice(5);

    for (const level of introLevels) {
      expect(level.introduces?.length ?? 0).toBeLessThanOrEqual(1);
    }
    const introducedTogether = introLevels.flatMap((level) => level.introduces ?? []);
    // 2026-10-16: the Power row is the band count ('bands'), the Arm row the arm length ('armLen').
    expect(new Set(introducedTogether)).toEqual(new Set(['bands', 'angle', 'fuzz', 'armLen', 'fuzz:Donut']));
    expect(findLevel('power')!.introduces).toEqual(['bands']);
    expect(findLevel('arm')!.introduces).toEqual(['armLen']);
    expect(findLevel('weight')!.introduces).toEqual(['fuzz']);
    expect(findLevel('donut')!.introduces).toEqual(['fuzz:Donut']);
    expect(introducedTogether).toHaveLength(5); // one per intro level, no duplicates

    for (const level of challengeLevels) {
      expect(level.introduces ?? []).toEqual([]);
    }
  });

  it('finds a level by id and returns undefined for an unknown one', () => {
    expect(findLevel('power')?.title).toBe('Fling it');
    expect(findLevel('nope')).toBeUndefined();
  });

  for (const level of LEVELS) {
    it(`${level.id}: unique part ids, exactly one catapult, valid lockedProps`, () => {
      const partIds = level.parts.map((part) => part.id);
      expect(new Set(partIds).size).toBe(partIds.length);

      const catapults = level.parts.filter((part) => part.kind === 'catapult');
      expect(catapults).toHaveLength(1);

      const catapult = catapults[0]!;
      expect(catapult.locked).toBe(true);
      for (const code of catapult.lockedProps ?? []) {
        expect(Object.keys(catapult.props)).toContain(code);
      }

      if (level.solution) {
        const solutionCatapults = level.solution.filter((part) => part.kind === 'catapult');
        expect(solutionCatapults).toHaveLength(1);
      }
      // 2026-10-16: level data uses the new codes everywhere (no legacy power / arm).
      const tunings = [
        catapult.props,
        ...(level.solution ?? []).filter((p) => p.kind === 'catapult').map((p) => p.props),
        ...(level.solutionShots ?? []),
        ...(level.altSolutions ?? []),
      ];
      for (const t of tunings) {
        expect(t.power, level.id).toBeUndefined();
        expect(t.arm, level.id).toBeUndefined();
      }
      expect(catapult.lockedProps ?? []).not.toContain('power');
      expect(catapult.lockedProps ?? []).not.toContain('arm');
      // A space shot (catalog.ts SPACE_SPEED) has its own line from Bruno on every level.
      expect(level.failHints.space, level.id).toBe(SPACE_HINT);
    });
  }
});

describe('catapult levels: solutions', () => {
  for (const level of LEVELS) {
    if (level.goals.length === 0) continue;

    it(`${level.id}: solution passes within the shot budget`, async () => {
      const solutionParts = level.solution ?? level.parts;
      const { sim, passed } = await fireAllShots(solutionParts, level, level.solutionShots);
      expect(passed).toBe(true);
      sim.destroy();
    });

    it(`${level.id}: the preset alone does not pass`, async () => {
      const { sim, passed } = await fireAllShots(level.parts, level);
      expect(passed).toBe(false);
      sim.destroy();
    });
  }
});

// The three levels from the 2026-09-22 huddle: a line goal, a chain reaction, the split (Prism's
// then, the Donut's since 2026-10-01).
describe('catapult levels: line, chain, donut', () => {
  it('line levels draw their line: an hline marker at level.line, goal aboveLine == 0', () => {
    for (const id of LINE_LEVEL_IDS) {
      const level = findLevel(id)!;
      expect(level.line).toBeDefined();
      expect(level.markers).toContainEqual(expect.objectContaining({ kind: 'hline', y: level.line }));
      expect(level.goals).toEqual([expect.objectContaining({ metric: 'aboveLine', op: '==', value: 0 })]);
    }
  });

  it('the old levels have no line (aboveLine stays 0 there)', () => {
    for (const level of LEVELS) {
      if (LINE_LEVEL_IDS.includes(level.id)) continue;
      expect(level.line).toBeUndefined();
    }
  });

  it('chain: the solution tips the dominoes in order, left to right, and CRASH! fires', async () => {
    const level = findLevel('chain')!;
    const parts = level.solution!;
    const sim = await createCatapultSim(parts, level);
    // Body ids up front: the last domino is a crate (2026-10-15), and a broken crate's handle
    // gives up its body.
    const dominoes = sim
      .handles()
      .filter((h) => h.kind === 'block')
      .sort((a, b) => a.bounds.x - b.bounds.x)
      .map((h) => ({ partId: h.partId, body: h.bodies[0]!.id }));
    const tippedAt = new Map<number, number>();
    let crash = false;
    sim.play();
    for (let tick = 0; tick < MAX_TICKS_PER_SHOT && sim.outcome === 'running'; tick++) {
      sim.step();
      const snap = sim.snapshot();
      for (const d of dominoes) {
        const t = snap.transforms.get(d.body);
        // Gone = smashed: the crate domino only breaks when it slams down, so it tipped first.
        if (!tippedAt.has(d.partId) && (!t || Math.abs(t.angle) > Math.PI / 4)) tippedAt.set(d.partId, tick);
      }
      if ((snap.overlay ?? []).some((o) => o.kind === 'sprite' && o.textureKey === 'fx-crash')) crash = true;
    }
    const order = dominoes.map((d) => tippedAt.get(d.partId));
    expect(order.every((t) => t !== undefined)).toBe(true);
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    expect(crash).toBe(true);
    expect(sim.metrics().aboveLine).toBe(0);
    expect(sim.metrics().smashed).toBe(1); // the crate at the end of the row
    sim.destroy();
  });

  it('donut: the Donut is locked in the preset and the solution', () => {
    const level = findLevel('donut')!;
    for (const parts of [level.parts, level.solution!]) {
      const cp = parts.find((p) => p.kind === 'catapult')!;
      expect(cp.props.fuzz).toBe('Donut');
      expect(cp.lockedProps).toContain('fuzz');
    }
  });

  it('donut: over the old tunings (1..4 bands, the 2 and 3 m arms) a fuzz that doesn\'t split hardly ever takes two cans; the locked Donut often does', async () => {
    // Until 2026-10-16 no non-splitting fuzz passed at all. Without the old 15.75 m/s cap the Flower
    // flies faster, and in 2 of these 160 tunings (3 bands, 15 degrees, 3 m) one shot takes two; the
    // Donut is locked in on this level, so the child never fires one of those anyway.
    const level = findLevel('donut')!;
    const cp = level.solution!.find((p) => p.kind === 'catapult')!;
    let single = 0;
    let donut = 0;
    for (const bands of ['1', '2', '3', '4']) {
      for (const angle of ['15', '30', '45', '60', '75']) {
        for (const armLen of ['2', '3']) {
          for (const fuzz of ['Flower', 'Fur', 'Helmet', 'Metal', 'Donut']) {
            const props = { ...cp.props, fuzz, bands, angle, armLen };
            const parts = level.solution!.map((p) => (p.kind === 'catapult' ? { ...cp, props } : p));
            const { sim, passed } = await fireAllShots(parts, level);
            if (passed && fuzz === 'Donut') donut++;
            else if (passed) single++;
            sim.destroy();
          }
        }
      }
    }
    expect(single).toBeLessThanOrEqual(2);
    expect(donut).toBeGreaterThanOrEqual(6);
  });

  // 2026-10-16: the old neighbours, in the new codes (Max = 4 bands, Short = 2 m, Long = 3 m).
  const NEIGHBOURS_LINE: Record<string, string>[] = [
    { bands: '4', angle: '45', fuzz: 'Metal', armLen: '2' },
    { bands: '4', angle: '15', fuzz: 'Helmet', armLen: '2' },
    { bands: '4', angle: '15', fuzz: 'Metal', armLen: '3' },
  ];
  const NEIGHBOURS_CHAIN: Record<string, string>[] = [
    { bands: '2', angle: '15' },
    { bands: '2', angle: '45' },
    { bands: '2', angle: '30', fuzz: 'Helmet' },
  ];
  const NEIGHBOURS_DONUT: Record<string, string>[] = [
    { bands: '3', angle: '30' },
    { bands: '4', angle: '30' },
    { bands: '3', angle: '15', armLen: '3' },
  ];

  it('solutions have neighbours that also pass (not a knife edge)', async () => {
    const neighbours: Record<string, Record<string, string>[]> = {
      line: NEIGHBOURS_LINE,
      chain: NEIGHBOURS_CHAIN,
      donut: NEIGHBOURS_DONUT,
    };
    for (const [id, tunings] of Object.entries(neighbours)) {
      const level = findLevel(id)!;
      for (const tuning of tunings) {
        const parts = level.solution!.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, ...tuning } } : p));
        const { sim, passed } = await fireAllShots(parts, level);
        expect(passed, `${id} ${JSON.stringify(tuning)}`).toBe(true);
        sim.destroy();
      }
    }
  });
});

// Stakeholder request 2026-09-22: stack levels with a lenient line, so many settings pass. The
// one-shot 120-tuning sweep that set each line lives in levels.ts's comments; here every recorded
// alternate is proven on its own.
describe('catapult levels: lenient stack levels', () => {
  it('nothing is locked, 3 shots each, and the alternates spread over bands and angle', () => {
    for (const id of STACK_LEVEL_IDS) {
      const level = findLevel(id)!;
      expect(level.shots).toBe(3);
      const cp = level.parts.find((p) => p.kind === 'catapult')!;
      expect(cp.lockedProps ?? []).toEqual([]);

      const alts = level.altSolutions ?? [];
      expect(alts.length, id).toBeGreaterThanOrEqual(4);
      const solutionProps = level.solution!.find((p) => p.kind === 'catapult')!.props;
      const tunings = [solutionProps, ...alts.map((alt) => ({ ...solutionProps, ...alt }))];
      // Each alternate differs from the solution and from each other in bands or angle.
      const bandsAngle = new Set(tunings.map((t) => `${t.bands}/${t.angle}`));
      expect(bandsAngle.size, id).toBe(tunings.length);
      expect(new Set(tunings.map((t) => t.bands)).size, id).toBeGreaterThanOrEqual(3);
    }
  });

  for (const id of STACK_LEVEL_IDS) {
    it(`${id}: the solution and every altSolutions tuning pass on their own, in one shot`, async () => {
      // One fuzz, not the level's three: the sweep's leniency is measured per single shot.
      const level = { ...findLevel(id)!, shots: 1 };
      const single = await fireAllShots(level.solution!, level);
      expect(single.passed, `${id} solution`).toBe(true);
      single.sim.destroy();
      for (const alt of level.altSolutions ?? []) {
        const parts = level.solution!.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, ...alt } } : p));
        const { sim, passed } = await fireAllShots(parts, level);
        expect(passed, `${id} ${JSON.stringify(alt)}`).toBe(true);
        sim.destroy();
      }
    });
  }
});

describe('catapult levels: the catapult never moves (2026-10-15)', () => {
  it('every level bolts the catapult in place (no drag region)', () => {
    for (const level of LEVELS) {
      const cp = level.parts.find((p) => p.kind === 'catapult')!;
      expect(cp.lockPosition, level.id).toBe(true);
      expect(cp.region, level.id).toBeUndefined();
    }
  });
});

// Gao, 2026-10-15: "from level 7 and on, we want to introduce breakable boxes, if hit with enough
// force, they just get destroyed". Smash it introduces the crates gently; every challenge level
// after it mixes some in; nothing before it shows one (a concept not yet introduced stays hidden).
describe('catapult levels: crates', () => {
  const crates = (level: CatapultLevel) =>
    level.parts.filter((p) => p.kind === 'block' && p.props.material === 'crate').length;

  it('no crate before Smash it; one on Smash it; some in every challenge level from Timber! on', () => {
    const smash = LEVELS.findIndex((l) => l.id === 'smash');
    expect(smash).toBe(5);
    for (const level of LEVELS.slice(0, smash)) expect(crates(level), level.id).toBe(0);
    expect(crates(findLevel('smash')!)).toBe(1);
    for (const level of LEVELS.slice(smash + 1)) {
      if (level.id === 'free') continue;
      expect(crates(level), level.id).toBeGreaterThan(0);
    }
    // The solution keeps the preset's crates exactly (only the catapult's tuning differs).
    for (const level of LEVELS) {
      if (!level.solution) continue;
      expect(level.solution.filter((p) => p.kind !== 'catapult')).toEqual(level.parts.filter((p) => p.kind !== 'catapult'));
    }
  });

  it('smash: bands and angle are locked (fast and flat, so every fuzz reaches the crate), and the goal is a smashed crate (shoving it over is not enough)', () => {
    const level = findLevel('smash')!;
    for (const parts of [level.parts, level.solution!]) {
      const cp = parts.find((p) => p.kind === 'catapult')!;
      expect(cp.lockedProps).toEqual(['bands', 'angle']);
      expect(cp.props).toMatchObject({ bands: '4', angle: '15' });
    }
    expect(level.goals).toEqual([expect.objectContaining({ metric: 'smashed', op: '>=', value: 1 })]);
  });

  it('smash: the lesson - the light Flower never breaks the crate, a heavier fuzz on the same arc smashes it', async () => {
    const level = findLevel('smash')!;
    const cp = level.parts.find((p) => p.kind === 'catapult')!;
    const run = async (fuzz: string, armLen = '2') => {
      const parts = level.parts.map((p) => (p.kind === 'catapult' ? { ...cp, props: { ...cp.props, fuzz, armLen } } : p));
      const sim = await createCatapultSim(parts, { ...level, shots: 1 });
      const crate = sim.handles().find((h) => h.kind === 'block')!.bodies[0]!.id;
      let touched = false;
      sim.play();
      for (let tick = 0; tick < MAX_TICKS_PER_SHOT && sim.outcome === 'running'; tick++) {
        sim.step();
        // The BOOM burst marks the fuzz's first touch on a block that did not break.
        if ((sim.snapshot().overlay ?? []).some((o) => o.kind === 'sprite' && (o.textureKey === 'fx-boom' || o.textureKey === 'fx-smash'))) touched = true;
      }
      const m = sim.metrics();
      const alive = sim.snapshot().transforms.has(crate);
      sim.destroy();
      return { touched, smashed: m.smashed, alive };
    };
    // Since 2026-10-16 (no speed cap) the Flower skims just over the crate on the 2 m arm; on the
    // 1.5 m arm it bumps it. Either way it never breaks it.
    const weak = await run('Flower');
    expect(weak).toEqual({ touched: false, smashed: 0, alive: true });
    expect(await run('Flower', '1.5')).toEqual({ touched: true, smashed: 0, alive: true });
    for (const fuzz of ['Fur', 'Helmet', 'Metal', 'Donut']) {
      expect(await run(fuzz), fuzz).toEqual({ touched: true, smashed: 1, alive: false });
    }
  });
});

/** One shot of `level`'s solution world with the catapult's props overridden; knockedDown and pass. */
async function oneShot(level: CatapultLevel, props: Record<string, string>) {
  const parts = level.solution!.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, ...props } } : p));
  const { sim, passed } = await fireAllShots(parts, { ...level, shots: 1 });
  const knocked = sim.metrics().knockedDown;
  sim.destroy();
  return { passed, knocked };
}

// Gao, 2026-10-15: "theres no gameplay reason to use a lighter fuzz right now". With the energy rule
// (catalog.ts launchSpeed) a heavier fuzz lands shorter and a lighter one hits softer; these levels
// teach it.
describe('catapult levels: the energy rule (heavy hits harder, light flies farther)', () => {
  const FUZZES = ['Flower', 'Fur', 'Helmet', 'Metal']; // the weight level's drawer (no Donut yet)

  it('weight: bands and angle are locked, two targets, the preset Fur (in the gap) and every single fuzz fail', async () => {
    const level = findLevel('weight')!;
    for (const parts of [level.parts, level.solution!]) {
      const cp = parts.find((p) => p.kind === 'catapult')!;
      expect(cp.lockedProps).toEqual(['bands', 'angle']);
    }
    expect(level.parts.find((p) => p.kind === 'catapult')!.props.fuzz).toBe('Fur');
    expect(level.goals).toEqual([expect.objectContaining({ metric: 'knockedDown', op: '>=', value: 2 })]);
    // No one fuzz takes both targets, even with every shot.
    for (const fuzz of FUZZES) {
      const parts = level.parts.map((p) => (p.kind === 'catapult' ? { ...p, props: { ...p.props, fuzz } } : p));
      const { sim, passed } = await fireAllShots(parts, level);
      expect(passed, fuzz).toBe(false);
      sim.destroy();
    }
  });

  it('weight: the lesson - only the heavy Metal topples the near block, only the light Flower reaches the far can', async () => {
    const level = findLevel('weight')!;
    const only = (keep: 'block' | 'can'): CatapultLevel => {
      const parts = level.solution!.filter((p) => p.kind === 'catapult' || (keep === 'block' ? p.kind === 'block' : p.kind !== 'block'));
      return { ...level, parts, solution: parts, goals: [{ metric: 'knockedDown', op: '>=', value: 1, label: '' }] };
    };
    const block = only('block');
    const can = only('can');
    for (const fuzz of FUZZES) {
      expect((await oneShot(block, { fuzz })).passed, `block ${fuzz}`).toBe(fuzz === 'Metal');
      expect((await oneShot(can, { fuzz })).passed, `can ${fuzz}`).toBe(fuzz === 'Flower');
    }
  });

  it('longshot: the bands are locked at 2 and the arm at 2 m (2026-10-16); the Fur, Helmet and Metal never reach at any angle, the light fuzzes do', async () => {
    const level = findLevel('longshot')!;
    for (const parts of [level.parts, level.solution!]) {
      const cp = parts.find((p) => p.kind === 'catapult')!;
      expect(cp.lockedProps).toEqual(['bands', 'armLen']);
      expect(cp.props.bands).toBe('2');
      expect(cp.props.armLen).toBe('2');
    }
    expect(level.parts.find((p) => p.kind === 'catapult')!.props.fuzz).toBe('Metal');
    const passing: string[] = [];
    for (const angle of ['15', '30', '45', '60', '75']) {
      for (const fuzz of ['Flower', 'Donut', 'Fur', 'Helmet', 'Metal']) {
        const { passed, knocked } = await oneShot(level, { angle, fuzz });
        if (fuzz === 'Fur' || fuzz === 'Helmet' || fuzz === 'Metal') {
          expect(knocked, `${angle}/${fuzz}`).toBe(0);
        } else if (passed) {
          passing.push(`${angle}/${fuzz}`);
        }
      }
    }
    // A few light tunings, both fuzzes.
    expect(passing.length).toBeGreaterThanOrEqual(3);
    expect(passing.some((t) => t.includes('Flower'))).toBe(true);
    expect(passing.some((t) => t.includes('Donut'))).toBe(true);
  });

  it('arm: the fuzz is locked (the Fur), so a longer arm is the answer - every length from 2.75 m up hits, 2.5 m and shorter fall short; the light Flower on the 2 m arm would reach the bullseye', async () => {
    const level = findLevel('arm')!;
    for (const parts of [level.parts, level.solution!]) {
      const cp = parts.find((p) => p.kind === 'catapult')!;
      expect(cp.lockedProps).toEqual(['bands', 'angle', 'fuzz']);
      expect(cp.props.fuzz).toBe('Fur');
    }
    for (const armLen of ARM_LENGTHS) {
      expect((await oneShot(level, { armLen })).passed, armLen).toBe(Number(armLen) >= 2.75);
    }
    expect((await oneShot(level, { armLen: '2', fuzz: 'Flower' })).passed).toBe(true); // why it is locked
  });

  it('longshot: the solution and every altSolutions tuning pass on their own, in one shot', async () => {
    const level = findLevel('longshot')!;
    expect((await oneShot(level, {})).passed).toBe(true);
    for (const alt of level.altSolutions ?? []) expect((await oneShot(level, alt)).passed, JSON.stringify(alt)).toBe(true);
  });
});

// 2026-10-16 (Jon: "rubber bands unlimited like rover wheels ... 45 bands launches into space and
// fails"): more bands is never a shortcut.
describe('catapult levels: unlimited bands', () => {
  it('Fling it: exactly 2 bands knock the can down - 1 drops short, 3 and up fly over the shelf', async () => {
    const level = findLevel('power')!;
    const passing: number[] = [];
    for (let n = 1; n <= 14; n++) if ((await oneShot(level, { bands: String(n) })).passed) passing.push(n);
    expect(passing).toEqual([2]);
  });

  it('every level\'s solution with 45 bands is a space shot and fails (every level whose bands are free)', async () => {
    for (const level of LEVELS) {
      if (level.goals.length === 0) continue;
      const cp = level.solution!.find((p) => p.kind === 'catapult')!;
      if ((cp.lockedProps ?? []).includes('bands')) continue; // the bands are locked here
      const props = { ...cp.props, bands: '45' };
      expect(isSpaceShot(props), level.id).toBe(true);
      const parts = level.solution!.map((p) => (p.kind === 'catapult' ? { ...p, props } : p));
      const { sim, passed } = await fireAllShots(parts, level);
      expect(passed, level.id).toBe(false);
      const m = sim.metrics();
      expect(m.knockedDown + m.hits + m.smashed, level.id).toBe(0);
      sim.destroy();
    }
  });

  it('no level that locks the bands can reach space with any fuzz or arm the child can pick', () => {
    for (const level of LEVELS) {
      const cp = level.parts.find((p) => p.kind === 'catapult')!;
      if (!(cp.lockedProps ?? []).includes('bands')) continue;
      for (const fuzz of ['Flower', 'Donut', 'Fur', 'Helmet', 'Metal']) {
        for (const armLen of ARM_LENGTHS) {
          expect(isSpaceShot({ ...cp.props, fuzz, armLen }), `${level.id} ${fuzz} ${armLen}`).toBe(false);
        }
      }
    }
  });
});
