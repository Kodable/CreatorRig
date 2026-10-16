// Deviation summary (see the final report for the full write-up):
// - Coordinator correction (2026-09-15): rolling resistance now only applies to a fuzz while its
//   contact set is non-empty (tracked per-fuzz from StepResult.contacts), so a freshly spawned
//   fuzz flies a pure ballistic arc - it only touches the ground, a shelf, a can, etc.
// - Rear-facing-arm rebuild (this wave): the release point moved from ~2.0 m up (old forward-
//   facing arm) to ~3.19 m up (rear-facing arm swinging up-and-over via the crossbar), which adds
//   real fall distance before the ground. That pushes the pure-ballistic range further than the
//   flat-ground formula range = v^2*sin(2*theta)/g suggests: at Medium/45deg/Short (v = 9.5 m/s)
//   that formula gives ~9.0 m, but solving with the actual ~3.19 m release height gives ~11.5 m -
//   very close to the ~11.3 m measured here. The "same range band as before" check below compares
//   against this height-corrected prediction, not the flat-ground ~9 m figure.
// - Measured ranges @45deg with the Short arm and the Fur (within ~10%): Low ~6.4 m, Medium
//   ~11.3 m, High ~16.6 m, Max ~22.8 m. Tests below assert these measured baselines. Since the
//   energy rule (2026-10-15, catalog.ts launchSpeed) the other fuzzes fly their own speeds: the
//   Fur is the reference and keeps these numbers.
// - Weight-vs-block (the weight level's geometry since the energy rule: High power, 45deg, a wood
//   1x2 block on the ground at x 14.5, catapult at x 5): only the Metal topples it, anywhere from
//   x 13.75 to 15.25; the Flower, Fur and Helmet fly over it or bounce off. (Until the energy rule
//   every fuzz flew the same arc, and the scene was a brick block 22.4 m out at Max.)
// - Collapse payoff + the split (huddle 2026-09-22; the Donut splits since 2026-10-01): the topple
//   scenes below reuse the `line` level's geometry (a 1-wide stack of three 1x1 wood blocks + a
//   2x1 plank, 12 m out from a catapult at x 5; Metal/Max/30/Short brings it all down in one
//   shot - Metal/High/30 until the energy rule). Split velocities are read through
//   `sim['world']` (TypeScript allows bracket access to a private member): the public snapshot
//   carries positions only, and the split rule is about velocities.
// - 2026-10-16: these tests build catapults with the legacy `power` / `arm` props (catalog.ts maps
//   Low..Max to 1..4 bands and Short/Long to 2/3 m, so every number here is unchanged); the bands /
//   arm length / space shot / knock-down rule / marker tests near the end use the new props.
import { describe, expect, it } from 'vitest';
import { armAngleFor, bandBundleAt, bandSegments, catapultRelease, crossbarPoseFor, fireSpot, stringAnchor, FUZZ_PART_ID, REST_ANGLE, STRING_HOOK_H, WORLD_H } from './build';
import { FUZZ, FUZZ_NAMES, SPLIT_ANGLE_DEG, SPLIT_OFFSET, fuzzMass, isSpaceShot, launchSpeed } from './catalog';
import {
  BAND_LABEL_OFFSET,
  createCatapultSim,
  CHECK_COLOR,
  CHECK_SIZE,
  CHECK_TIME,
  CRASH_SIZE,
  DUST_SIZE,
  IMPACT_PART_ID,
  MARKER_BOB,
  MARKER_COLOR,
  MARKER_GAP,
  outOfWorld,
  SPACE_MAX_TIME,
  spacePath,
  TIP_MIN,
} from './sim';
import type { CatapultLevel, OverlayItem, PlacedPart, RenderItem } from './types';

/** A payoff/effect sprite (hit burst, dust, CRASH!, snip) - as opposed to the machine's own
 * band, string and hook sprites, which are drawn every frame. */
function isFx(o: { kind: string; textureKey?: string }): boolean {
  return o.kind === 'sprite' && !!o.textureKey?.startsWith('fx-');
}

let nextId = 100;
function id(): number {
  return nextId++;
}

function makeLevel(parts: PlacedPart[], shots: number, goals: CatapultLevel['goals'] = []): CatapultLevel {
  return {
    id: 'test-level',
    title: 'Test',
    bruno: '',
    goals,
    parts,
    palette: [],
    hints: [],
    failHints: {},
    shots,
  };
}

function catapult(props: Partial<Record<string, string>> = {}, x = 5, y = 0): PlacedPart {
  return { id: id(), kind: 'catapult', x, y, props: { power: 'Medium', angle: '45', fuzz: 'Fur', arm: 'Short', ...props } };
}

async function runUntilNotRunning(sim: { step(): void; outcome: string }, maxTicks = 700): Promise<number> {
  let ticks = 0;
  while (sim.outcome === 'running' && ticks < maxTicks) {
    sim.step();
    ticks++;
  }
  return ticks;
}

/** How far a fuzz travels (from the release tip) before it first drops to ground level,
 * tracked via the public RenderItem/snapshot API only (no private sim access). */
async function measureRange(props: Partial<Record<string, string>>): Promise<number> {
  const part = catapult(props);
  const level = makeLevel([part], 1);
  const sim = await createCatapultSim([part], level);
  const { tip } = catapultRelease(part);

  sim.play();
  let range = 0;
  for (let i = 0; i < 700; i++) {
    sim.step();
    const fuzzItem = sim.renderItems().find((it) => it.role === 'fuzz' && it.partId !== part.id);
    if (fuzzItem) {
      const t = sim.snapshot().transforms.get(fuzzItem.body);
      const r = fuzzItem.shape.kind === 'circle' ? fuzzItem.shape.r : 0.3;
      if (t) {
        const dx = t.position.x - tip.x;
        if (dx > range) range = dx;
        if (t.position.y < r + 0.05) break; // first ground contact
      }
    }
    if (sim.outcome !== 'running') break;
  }
  sim.destroy();
  return range;
}

describe('CatapultSim: ranges at 45deg (measured baseline; see the deviation note at top of file)', () => {
  it('Low ~6.4 m, Medium ~11.3 m, High ~16.6 m, Max ~22.8 m, each within 10% and strictly increasing', async () => {
    const low = await measureRange({ power: 'Low' });
    const medium = await measureRange({ power: 'Medium' });
    const high = await measureRange({ power: 'High' });
    const max = await measureRange({ power: 'Max' });

    expect(low).toBeGreaterThan(6.4 * 0.9);
    expect(low).toBeLessThan(6.4 * 1.1);
    expect(medium).toBeGreaterThan(11.3 * 0.9);
    expect(medium).toBeLessThan(11.3 * 1.1);
    expect(high).toBeGreaterThan(16.6 * 0.9);
    expect(high).toBeLessThan(16.6 * 1.1);
    expect(max).toBeGreaterThan(22.8 * 0.9);
    expect(max).toBeLessThan(22.8 * 1.1);

    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
    expect(high).toBeLessThan(max);
  });

  it('a Medium/45deg shot lands in the same range band as before, once the elevated (rear-facing) ' +
    'release point is accounted for (height-corrected analytic prediction ~11.5 m; see the ' +
    'deviation note at the top of this file for why the flat-ground ~9 m figure no longer applies)', async () => {
    const range = await measureRange({});
    expect(range).toBeGreaterThan(11.5 * 0.85);
    expect(range).toBeLessThan(11.5 * 1.15);
  });
});

describe('CatapultSim: a can on a shelf', () => {
  it('the Fur fuzz at Medium power 45deg knocks a can placed in the arc; single target + single shot -> cleared', async () => {
    const cp = catapult();
    const { tip } = catapultRelease(cp);
    // Empirically-found point on the free-flight arc (pure ballistics, no in-flight drag): the
    // can's centre height when resting on a 2 m-tall shelf is 1.5 m, which the arc crosses here.
    const x = tip.x + 10.48;
    const shelf: PlacedPart = { id: id(), kind: 'shelf', x, y: 1, props: { length: '2' } };
    const can: PlacedPart = { id: id(), kind: 'can', x, y: 1.5, props: { color: 'Red' } };
    const level = makeLevel([cp, shelf, can], 1, [{ metric: 'knockedDown', op: '>=', value: 1, label: '' }]);
    const sim = await createCatapultSim([cp, shelf, can], level);

    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.metrics().knockedDown).toBeGreaterThanOrEqual(1);
    // Single target, single shot budget: the target going down (cleared) takes priority over
    // running out of shots in the same tick.
    expect(sim.outcome).toBe('cleared');
    sim.destroy();
  });
});

describe('CatapultSim: a heavier fuzz vs a standing block (the energy rule)', () => {
  it('at High power/45deg, a wood 1x2 block at x 14.5: the Metal lands on it and topples it; the Flower, Fur and Helmet do not', async () => {
    async function tryFuzz(fuzz: string): Promise<boolean> {
      const cp = catapult({ fuzz, power: 'High' });
      const block: PlacedPart = { id: id(), kind: 'block', x: 14.5, y: 1, props: { size: '1x2', material: 'wood' } };
      const level = makeLevel([cp, block], 1);
      const sim = await createCatapultSim([cp, block], level);
      sim.play();
      await runUntilNotRunning(sim);
      const knocked = sim.metrics().knockedDown >= 1;
      sim.destroy();
      return knocked;
    }

    expect(await tryFuzz('Flower')).toBe(false);
    expect(await tryFuzz('Fur')).toBe(false);
    expect(await tryFuzz('Helmet')).toBe(false);
    expect(await tryFuzz('Metal')).toBe(true);
  });
});

// Gao, 2026-10-15: "theres no gameplay reason to use a lighter fuzz right now". The bands store a
// fixed energy per power (catalog.ts launchSpeed): a heavier fuzz leaves slower and flies shorter.
describe('CatapultSim: the energy rule', () => {
  it('each fuzz body has the mass fuzzMass gives it and leaves at launchSpeed (the flying fuzz\'s own velocity)', async () => {
    type World = { getLinearVelocity(b: number): { x: number; y: number }; getMass(b: number): number };
    for (const fuzz of FUZZ_NAMES) {
      const cp = catapult({ fuzz, power: 'High' });
      const sim = await createCatapultSim([cp], makeLevel([cp], 1));
      sim.play();
      let body: number | undefined;
      for (let i = 0; i < 120 && body === undefined; i++) {
        sim.step();
        body = sim.renderItems().find((it) => it.role === 'fuzz' && it.partId === FUZZ_PART_ID)?.body;
      }
      expect(body, fuzz).toBeDefined();
      const world = sim['world'] as unknown as World;
      expect(world.getMass(body!), fuzz).toBeCloseTo(fuzzMass(FUZZ[fuzz]!), 5);
      // Gravity has had at most a step at it: the horizontal part is the release speed's exactly.
      const v = world.getLinearVelocity(body!);
      expect(v.x, fuzz).toBeCloseTo(launchSpeed(cp.props as Record<string, string>) * Math.cos(Math.PI / 4), 3);
      sim.destroy();
    }
  });

  it('at 45 degrees a lighter fuzz flies farther at every power (the real flight, to its first landing)', async () => {
    for (const power of ['Low', 'Medium', 'High', 'Max']) {
      const ranges: number[] = [];
      for (const fuzz of FUZZ_NAMES) ranges.push(await measureRange({ power, fuzz }));
      // Light to heavy. At Max the Flower and the Donut both reach the right wall (x 30), so only
      // "not shorter" holds between those two there.
      for (let i = 1; i < ranges.length; i++) {
        if (power === 'Max' && i === 1) expect(ranges[1]!, `${power}`).toBeLessThanOrEqual(ranges[0]! + 1e-9);
        else expect(ranges[i]!, `${power} ${FUZZ_NAMES[i]}`).toBeLessThan(ranges[i - 1]!);
      }
      // Fur keeps its pre-rule range; the Metal reaches a little under 60% as far, the Flower over
      // 1.4x (where the wall does not stop it).
      expect(ranges[4]! / ranges[2]!).toBeGreaterThan(0.5);
      expect(ranges[4]! / ranges[2]!).toBeLessThan(0.7);
      if (power !== 'Max') expect(ranges[0]! / ranges[2]!).toBeGreaterThan(1.4);
    }
  });
});

describe('CatapultSim: bullseye hits', () => {
  it('counts one hit per shot even with multiple contacts', async () => {
    const cp = catapult();
    const { tip } = catapultRelease(cp);
    const x = tip.x + 10.48;
    const bullseye: PlacedPart = { id: id(), kind: 'bullseye', x, y: 1.5, props: { size: 'M' } };
    const level = makeLevel([cp, bullseye], 1, [{ metric: 'hits', op: '>=', value: 1, label: '' }]);
    const sim = await createCatapultSim([cp, bullseye], level);
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.metrics().hits).toBe(1);
    sim.destroy();
  });

  it('a shot that misses everything counts 0 hits', async () => {
    const cp = catapult({ power: 'Low', angle: '75' });
    const bullseye: PlacedPart = { id: id(), kind: 'bullseye', x: 27, y: 4, props: { size: 'M' } };
    const level = makeLevel([cp, bullseye], 1);
    const sim = await createCatapultSim([cp, bullseye], level);
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.metrics().hits).toBe(0);
    sim.destroy();
  });

  it('a miss on a bullseye-only level leaves shots to fire (no targets is not "cleared")', async () => {
    const cp = catapult({ power: 'Low', angle: '75' });
    const bullseye: PlacedPart = { id: id(), kind: 'bullseye', x: 27, y: 4, props: { size: 'M' } };
    const level = makeLevel([cp, bullseye], 3, [{ metric: 'hits', op: '>=', value: 1, label: '' }]);
    const sim = await createCatapultSim([cp, bullseye], level);
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('shot');
    expect(sim.canReplay()).toBe(true);
    sim.play();
    await runUntilNotRunning(sim);
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('outOfShots');
    sim.destroy();
  });
});

describe('CatapultSim: updatePart', () => {
  it('recreates the arm (new body id), refreshes the loaded fuzz, and leaves targets alone', async () => {
    const cp = catapult({ fuzz: 'Fur' });
    const can: PlacedPart = { id: id(), kind: 'can', x: 12, y: 2, props: { color: 'Red' } };
    const level = makeLevel([cp, can], 3);
    const sim = await createCatapultSim([cp, can], level);

    const before = sim.handles().find((h) => h.kind === 'catapult')!;
    const armBefore = before.bodies.find((b) => b.role === 'arm')!.id;

    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('shot');

    // Angle alone doesn't move the loaded-fuzz label (the pocket sits at REST regardless of the
    // release angle); change the fuzz too so the refreshed loaded-fuzz visual actually differs.
    const changed: PlacedPart = { ...cp, props: { ...cp.props, angle: '60', fuzz: 'Metal' } };
    const accepted = sim.updatePart!(changed);
    expect(accepted).toBe(true);

    const after = sim.handles().find((h) => h.kind === 'catapult')!;
    const armAfter = after.bodies.find((b) => b.role === 'arm')!.id;
    expect(armAfter).not.toBe(armBefore);


    // The refreshed loaded fuzz picks up the new fuzz's radius and picture.
    const fuzzVisual = after.visuals.find((v) => v.role === 'fuzz')!;
    expect(fuzzVisual.shape.kind).toBe('circle');
    if (fuzzVisual.shape.kind === 'circle') expect(fuzzVisual.shape.r).toBeCloseTo(0.4, 5); // FUZZ.Metal.r
    expect(fuzzVisual.textureKey).toBe('fuzz-Metal');

    // Targets keep their state (can still exists, still counted, not re-created).
    expect(sim.metrics().targetsLeft).toBe(1);
    sim.destroy();
  });

  it('returns false for non-catapult kinds', async () => {
    const cp = catapult();
    const can: PlacedPart = { id: id(), kind: 'can', x: 12, y: 2, props: { color: 'Red' } };
    const level = makeLevel([cp, can], 3);
    const sim = await createCatapultSim([cp, can], level);
    expect(sim.updatePart!({ ...can, x: 13 })).toBe(false);
    sim.destroy();
  });
});

describe('CatapultSim: canReplay and the shots budget', () => {
  it('canReplay is true after "shot" with shots + targets left, false after "outOfShots"; play() no-ops out of shots', async () => {
    const cp = catapult({ angle: '75', power: 'Low' }); // deliberately short: never reaches the can
    const can: PlacedPart = { id: id(), kind: 'can', x: 25, y: 2, props: {} };
    const level = makeLevel([cp, can], 1);
    const sim = await createCatapultSim([cp, can], level);

    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('outOfShots');
    expect(sim.canReplay!()).toBe(false);

    const usedBefore = sim.metrics().shotsUsed;
    sim.play(); // no-op: out of shots
    expect(sim.metrics().shotsUsed).toBe(usedBefore);
    expect(sim.outcome).toBe('outOfShots');
    sim.destroy();
  });

  it('canReplay is true after a "shot" outcome when shots and targets remain', async () => {
    const cp = catapult({ angle: '75', power: 'Low' });
    const can: PlacedPart = { id: id(), kind: 'can', x: 25, y: 2, props: {} }; // out of reach
    const level = makeLevel([cp, can], 3);
    const sim = await createCatapultSim([cp, can], level);
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('shot');
    expect(sim.canReplay!()).toBe(true);
    sim.destroy();
  });

  it('unlimited shots (level.shots === 0) report shotsLeft 0 and never block play()', async () => {
    const cp = catapult({ angle: '75', power: 'Low' });
    const level = makeLevel([cp], 0);
    const sim = await createCatapultSim([cp], level);
    for (let i = 0; i < 3; i++) {
      sim.play();
      await runUntilNotRunning(sim);
    }
    expect(sim.metrics().shotsUsed).toBe(3);
    expect(sim.metrics().shotsLeft).toBe(0);
    sim.destroy();
  });
});

describe('CatapultSim: shot timing', () => {
  it('a shot always ends well within the 10 s cap (+ swing overhead)', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 1);
    const sim = await createCatapultSim([cp], level);
    sim.play();
    const ticks = await runUntilNotRunning(sim, 700);
    expect(ticks).toBeLessThan(700);
    sim.destroy();
  });
});

describe('CatapultSim: the swing (rear-facing arm, forward release, crossbar stop)', () => {
  it('every angle option (15..75) releases a fuzz within the clamped swing window, for both arms ' +
    'and a slow/fast power - i.e. the arm always sweeps forward (never away from the release ' +
    'angle) no matter the tuning', async () => {
    for (const arm of ['Short', 'Long']) {
      for (const power of ['Low', 'Max']) {
        for (const angle of ['15', '30', '45', '60', '75']) {
          const cp = catapult({ arm, power, angle });
          const level = makeLevel([cp], 1);
          const sim = await createCatapultSim([cp], level);
          sim.play();
          let releasedWithin = false;
          for (let i = 0; i < 60; i++) {
            sim.step();
            if (sim.renderItems().some((it) => it.role === 'fuzz' && it.partId !== cp.id)) {
              releasedWithin = true;
              break;
            }
          }
          expect(releasedWithin).toBe(true);
          sim.destroy();
        }
      }
    }
  });

  it('the loaded fuzz visual rides the arm before Play and is gone once a dynamic fuzz exists', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 1);
    const sim = await createCatapultSim([cp], level);

    const loadedBefore = sim.renderItems().filter((it) => it.role === 'fuzz' && it.partId === cp.id);
    const flyingBefore = sim.renderItems().filter((it) => it.role === 'fuzz' && it.partId !== cp.id);
    expect(loadedBefore).toHaveLength(1);
    expect(flyingBefore).toHaveLength(0);

    sim.play();
    for (let i = 0; i < 60; i++) {
      sim.step();
      if (sim.renderItems().some((it) => it.role === 'fuzz' && it.partId !== cp.id)) break;
    }

    const loadedAfter = sim.renderItems().filter((it) => it.role === 'fuzz' && it.partId === cp.id);
    const flyingAfter = sim.renderItems().filter((it) => it.role === 'fuzz' && it.partId !== cp.id);
    expect(loadedAfter).toHaveLength(0);
    expect(flyingAfter.length).toBeGreaterThanOrEqual(1);
    sim.destroy();
  });

  it('the flying fuzz shows the excited face of the same fuzz it had while loaded (textureKey ' +
    'carries through release), with that fuzz\'s radius', async () => {
    for (const fuzz of FUZZ_NAMES) {
      const cp = catapult({ fuzz });
      const level = makeLevel([cp], 1);
      const sim = await createCatapultSim([cp], level);

      const loaded = sim.renderItems().find((it) => it.role === 'fuzz' && it.partId === cp.id)!;
      expect(loaded.textureKey).toBe(`fuzz-${fuzz}`);

      sim.play();
      let flying: RenderItem | undefined;
      for (let i = 0; i < 60 && !flying; i++) {
        sim.step();
        flying = sim.renderItems().find((it) => it.role === 'fuzz' && it.partId !== cp.id);
      }
      expect(flying?.textureKey).toBe(`fuzz-${fuzz}-excited`);
      expect(flying?.shape).toEqual({ kind: 'circle', r: FUZZ[fuzz]!.r });
      sim.destroy();
    }
  });

  it('no kettlebell gear rides the fuzz any more, loaded or flying; the arm\'s own gear and cup ' +
    'cover stay on the arm through the swing and the stop', async () => {
    const cp = catapult({ fuzz: 'Metal' });
    const level = makeLevel([cp], 1);
    const sim = await createCatapultSim([cp], level);
    const armKeys = () => sim.renderItems().filter((it) => it.partId === cp.id && it.role === 'arm').map((it) => it.textureKey);
    expect(sim.renderItems().some((it) => it.role === 'fuzzGear')).toBe(false);
    expect(armKeys()).toEqual(['real-arm-2', 'real-gear', 'real-cup']);
    sim.play();
    for (let i = 0; i < 60; i++) {
      sim.step();
      expect(sim.renderItems().some((it) => it.role === 'fuzzGear' || it.textureKey?.startsWith('gear-'))).toBe(false);
    }
    expect(armKeys()).toEqual(['real-arm-2', 'real-gear', 'real-cup']);
    sim.destroy();
  });

  it('every release angle sits strictly below REST_ANGLE, so the arm always has room to sweep ' +
    'down to it', () => {
    for (const deg of [15, 30, 45, 60, 75]) {
      expect(armAngleFor(deg)).toBeLessThan(REST_ANGLE);
    }
  });

  it('the arm halts exactly on the crossbar the instant it releases the fuzz (variant A: the ' +
    'stop pose IS the release pose, armAngleFor(angle), so the bar visibly rotates with the ' +
    'angle chip)', async () => {
    for (const angle of ['15', '30', '45', '60', '75']) {
      const cp = catapult({ angle });
      const level = makeLevel([cp], 1);
      const sim = await createCatapultSim([cp], level);
      sim.play();
      await runUntilNotRunning(sim);
      const arm = sim.handles().find((h) => h.kind === 'catapult')!.bodies.find((b) => b.role === 'arm')!;
      const t = sim.snapshot().transforms.get(arm.id)!;
      const expected = armAngleFor(Number(angle));
      expect(Math.abs(t.angle - expected)).toBeLessThanOrEqual(0.05);

      // The crossbar itself sits at the same pose (crossbarPoseFor), so the visible bar and the
      // arm resting on it agree.
      const { angle: crossbarAngle } = crossbarPoseFor(cp);
      expect(crossbarAngle).toBeCloseTo(expected + Math.PI / 2, 6);
      sim.destroy();
    }
  });
});

describe('CatapultSim: overlay', () => {
  it('draws no label before any shot is fired (the widget shelf names the loaded fuzz)', async () => {
    const cp = catapult({ fuzz: 'Metal' });
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);
    expect(sim.outcome).not.toBe('running');
    const overlay = sim.snapshot().overlay;
    // The fuzz shelf widget names the loaded fuzz; the sim draws no label of its own in edit mode.
    expect(overlay?.some((o) => o.kind === 'label')).toBe(false);
    sim.destroy();
  });

  it('no "range" label over the flying fuzz (2026-10-15); the fuzz tumbles in flight in the drawing only, ' +
    'and the physics body never spins', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);
    sim.play();
    let drawnTurn = 0;
    let bodyTurn = 0;
    for (let i = 0; i < 40; i++) {
      sim.step();
      const snap = sim.snapshot();
      expect(snap.overlay?.some((o) => o.kind === 'label' && o.id === 'range')).toBe(false);
      const fuzz = (sim as unknown as { fuzzBodies: { id: number }[] }).fuzzBodies[0];
      if (!fuzz) continue;
      drawnTurn = snap.transforms.get(fuzz.id)!.angle;
      bodyTurn = (sim as unknown as { world: { getTransform(id: number): { angle: number } } }).world.getTransform(fuzz.id).angle;
    }
    expect(Math.abs(drawnTurn)).toBeGreaterThan(0.3); // drawn: tumbling
    expect(bodyTurn).toBe(0); // physics: no spin before it touches anything
    sim.destroy();
  });

  it('the shot preview (2026-10-15): no dots when the sim is built (the kit shows it after Bruno\'s ' +
    'intro), the dotted arc on showPreview() and on every change (updatePart), shown until FIRE ' +
    '(no fade over time since 2026-10-15; it fades along its length)', async () => {
    let now = 100;
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level, () => now);
    const cores = () => (sim.snapshot().overlay ?? []).filter((o): o is Extract<OverlayItem, { kind: 'dot' }> => o.kind === 'dot' && o.color === 0xffffff);
    expect(cores()).toEqual([]);
    sim.showPreview();
    const shown = cores();
    expect(shown.length).toBeGreaterThan(5);
    // Full strength near the cup; the far end fades out along the arc (distanceFade).
    expect(shown[0]!.alpha).toBe(0.95);
    expect(shown.at(-1)!.alpha).toBeLessThan(0.95);
    // It starts at the release point the shot itself uses.
    const { tip } = catapultRelease(cp);
    expect(shown[0]!.p.x).toBeCloseTo(tip.x, 9);
    expect(shown[0]!.p.y).toBeCloseTo(tip.y, 9);
    now += 0.8;
    expect(cores()[0]!.alpha).toBeCloseTo(0.95, 9);
    now += 60;
    expect(cores()[0]!.alpha).toBeCloseTo(0.95, 9); // still there a minute later: it waits for FIRE
    // A change shows it again, for the new settings: more power flies farther.
    sim.updatePart({ ...cp, props: { ...cp.props, power: 'Max' } });
    const far = cores();
    expect(far.at(-1)!.p.x).toBeGreaterThan(shown.at(-1)!.p.x + 2);
    sim.destroy();
  });

  it('the shot preview ends where the shot really first lands, and at the first thing in the way', async () => {
    const cp = catapult({ power: 'Medium' });
    const sim = await createCatapultSim([cp], makeLevel([cp], 3), () => 0);
    sim.showPreview();
    const arc = (sim.snapshot().overlay ?? []).filter((o): o is Extract<OverlayItem, { kind: 'dot' }> => o.kind === 'dot' && o.color === 0xffffff);
    const end = arc.at(-1)!.p;
    // The real shot's fuzz first reaches the ground within a dot's spacing of the arc's end.
    const range = await measureRange({ power: 'Medium' });
    const { tip } = catapultRelease(cp);
    expect(Math.abs(end.x - (tip.x + range))).toBeLessThan(0.6);
    expect(end.y).toBeLessThan(0.6);
    sim.destroy();

    // The energy rule (2026-10-15): the preview flies each fuzz at its own speed, so it still ends
    // where the real shot lands for a light and a heavy fuzz - and the two arcs differ.
    const ends: Record<string, number> = {};
    for (const fuzz of ['Flower', 'Metal']) {
      const c = catapult({ power: 'Medium', fuzz });
      const s = await createCatapultSim([c], makeLevel([c], 3), () => 0);
      s.showPreview();
      const dots = (s.snapshot().overlay ?? []).filter((o): o is Extract<OverlayItem, { kind: 'dot' }> => o.kind === 'dot' && o.color === 0xffffff);
      const e = dots.at(-1)!.p;
      const r = await measureRange({ power: 'Medium', fuzz });
      expect(Math.abs(e.x - (catapultRelease(c).tip.x + r)), fuzz).toBeLessThan(0.6);
      expect(e.y, fuzz).toBeLessThan(0.6);
      ends[fuzz] = e.x;
      s.destroy();
    }
    expect(ends.Flower! - ends.Metal!).toBeGreaterThan(6);

    // A 6 m wall in front: a Medium shot's arc stops at its face, high off the ground.
    const cp2 = catapult({ power: 'Medium' });
    const wall: PlacedPart = { id: id(), kind: 'wall', x: 10, y: 3, props: { height: '6' } };
    const sim2 = await createCatapultSim([cp2, wall], makeLevel([cp2, wall], 3), () => 0);
    sim2.showPreview();
    const arc2 = (sim2.snapshot().overlay ?? []).filter((o): o is Extract<OverlayItem, { kind: 'dot' }> => o.kind === 'dot' && o.color === 0xffffff);
    expect(arc2.length).toBeGreaterThan(3);
    const end2 = arc2.at(-1)!.p;
    expect(end2.x).toBeLessThan(10);
    expect(end2.x).toBeGreaterThan(9 - 0.6);
    expect(end2.y).toBeGreaterThan(1);
    sim2.destroy();
  });

  it('the shot preview never shows during a shot; between shots it is back for the next shot (2026-10-15) and follows a change', async () => {
    let now = 0;
    const cp = catapult();
    const sim = await createCatapultSim([cp], makeLevel([cp], 3), () => now);
    sim.showPreview();
    sim.play();
    for (let i = 0; i < 30; i++) {
      sim.step();
      expect(sim.snapshot().overlay?.some((o) => o.kind === 'dot')).toBe(false);
    }
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('shot');
    expect(sim.snapshot().overlay?.some((o) => o.kind === 'dot')).toBe(true);
    now += 0.1;
    sim.updatePart({ ...cp, props: { ...cp.props, angle: '60' } });
    expect(sim.snapshot().overlay?.some((o) => o.kind === 'dot')).toBe(true);
    sim.destroy();
  });

  it('hides the label overlay mid-flight before release (swing in progress, no fuzz yet)', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);
    sim.play();
    sim.step();
    expect(sim.outcome).toBe('running');
    // Right after play(), the arm has barely started its swing: 'fuzzName' only shows while
    // outcome !== 'running' (it's gated off the moment a shot starts), and 'range' only shows
    // once a fuzz has actually been released - neither applies yet.
    const overlay = sim.snapshot().overlay;
    expect(overlay?.some((o) => o.kind === 'label')).toBe(false);
  });
});

describe('CatapultSim: hit bursts', () => {
  // Same can-on-a-shelf geometry as the "CatapultSim: a can on a shelf" describe block above:
  // the empirically-found point on the Medium/45deg free-flight arc that lands on a can resting
  // on a 2 m shelf.
  function canOnShelf(cp: PlacedPart): { shelf: PlacedPart; can: PlacedPart } {
    const { tip } = catapultRelease(cp);
    const x = tip.x + 10.48;
    const shelf: PlacedPart = { id: id(), kind: 'shelf', x, y: 1, props: { length: '2' } };
    const can: PlacedPart = { id: id(), kind: 'can', x, y: 1.5, props: { color: 'Red' } };
    return { shelf, can };
  }

  it('a Medium/45deg shot at a can produces a sprite overlay with textureKey fx-pow within the shot', async () => {
    const cp = catapult();
    const { shelf, can } = canOnShelf(cp);
    const level = makeLevel([cp, shelf, can], 1);
    const sim = await createCatapultSim([cp, shelf, can], level);
    sim.play();

    let sawBurst = false;
    for (let i = 0; i < 700 && sim.outcome === 'running'; i++) {
      sim.step();
      const overlay = sim.snapshot().overlay ?? [];
      if (overlay.some((o) => o.kind === 'sprite' && o.textureKey === 'fx-pow')) {
        sawBurst = true;
        break;
      }
    }
    expect(sawBurst).toBe(true);
    sim.destroy();
  });

  it('the burst sprite is gone again well before the shot itself ends (it fully fades by 0.7 s ' +
    'of sim time, long before the shot is allowed to finish quieting down)', async () => {
    const cp = catapult();
    const { shelf, can } = canOnShelf(cp);
    const level = makeLevel([cp, shelf, can], 1);
    const sim = await createCatapultSim([cp, shelf, can], level);
    sim.play();
    const ticks = await runUntilNotRunning(sim);
    expect(ticks).toBeLessThan(700);

    const overlay = sim.snapshot().overlay ?? [];
    expect(overlay.some(isFx)).toBe(false);
    sim.destroy();
  });

  it('edit mode (no shot ever fired) shows no burst sprites', async () => {
    const cp = catapult();
    const { shelf, can } = canOnShelf(cp);
    const level = makeLevel([cp, shelf, can], 1);
    const sim = await createCatapultSim([cp, shelf, can], level);
    expect(sim.outcome).not.toBe('running');
    const overlay = sim.snapshot().overlay ?? [];
    expect(overlay.some(isFx)).toBe(false);
    sim.destroy();
  });
});

describe('CatapultSim: the trigger string and rubber bands', () => {
  type Sprite = Extract<OverlayItem, { kind: 'sprite' }>;
  const sprites = (sim: Awaited<ReturnType<typeof createCatapultSim>>): Sprite[] =>
    (sim.snapshot().overlay ?? []).filter((o): o is Sprite => o.kind === 'sprite');
  const byId = (sim: Awaited<ReturnType<typeof createCatapultSim>>, spriteId: string) => sprites(sim).find((o) => o.id === spriteId);
  /** A band sprite's two ends (its picture runs along local +y, `size` wide and n x `size` long). */
  function bandEnds(o: Sprite): { a: { x: number; y: number }; b: { x: number; y: number } } {
    const n = Number(o.textureKey.replace('real-band-', ''));
    const half = (o.size * n) / 2;
    const axis = o.angle! + Math.PI / 2;
    return {
      a: { x: o.p.x - half * Math.cos(axis), y: o.p.y - half * Math.sin(axis) },
      b: { x: o.p.x + half * Math.cos(axis), y: o.p.y + half * Math.sin(axis) },
    };
  }

  it('the string is intact before any shot: a red band from the cup\'s underside down to the peg\'s ' +
    'hook (arch up, standing on the ground), a hook at the cup end - and no fx-snip sprite', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);
    const { a, p } = stringAnchor(cp);

    const band = byId(sim, 'string')!;
    expect(band.textureKey).toMatch(/^real-band-\d+$/);
    const ends = bandEnds(band);
    const [top, bottom] = ends.a.y > ends.b.y ? [ends.a, ends.b] : [ends.b, ends.a];
    expect(top.x).toBeCloseTo(a.x, 6);
    expect(top.y).toBeCloseTo(a.y, 6);
    expect(bottom.x).toBeCloseTo(p.x, 6);
    expect(bottom.y).toBeGreaterThan(p.y);
    expect(bottom.y).toBeLessThan(p.y + STRING_HOOK_H);
    const cupHook = byId(sim, 'string-hook-a')!;
    expect(cupHook.textureKey).toBe('real-hook');
    expect(cupHook.p).toEqual(a);
    const pegHook = byId(sim, 'string-hook-p')!;
    expect(pegHook.p.x).toBeCloseTo(p.x, 9);
    expect(pegHook.p.y).toBeCloseTo(p.y + STRING_HOOK_H / 2, 9); // its legs on the ground
    expect(pegHook.angle).toBeCloseTo(0, 9); // arch up
    expect(byId(sim, 'string-limp')).toBeUndefined();
    expect(sprites(sim).some((o) => o.textureKey === 'fx-snip')).toBe(false);
    sim.destroy();
  });

  it('play() cuts the string: the tied band is gone, a limp piece stays on the peg and a brief ' +
    'fx-snip sprite appears', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);

    sim.play();
    expect(byId(sim, 'string')).toBeUndefined();
    expect(byId(sim, 'string-hook-a')).toBeUndefined();
    expect(byId(sim, 'string-limp')).toBeTruthy();
    expect(byId(sim, 'string-hook-p')).toBeTruthy();
    expect(sprites(sim).some((o) => o.textureKey === 'fx-snip')).toBe(true);
    sim.destroy();
  });

  it('the snip burst appears at fireSpot (right where the FIRE button just was), not the old ' +
    'string-midpoint spot, for both arms', async () => {
    for (const arm of ['Short', 'Long']) {
      const cp = catapult({ arm });
      const level = makeLevel([cp], 3);
      const sim = await createCatapultSim([cp], level);
      const spot = fireSpot(cp);

      sim.play();
      sim.step(); // past age 0, so the pop-in animation has a nonzero size to check
      const snip = sprites(sim).find((o) => o.textureKey === 'fx-snip');
      expect(snip).toBeTruthy();
      if (snip) {
        expect(snip.p.x).toBeCloseTo(spot.x, 6);
        expect(snip.p.y).toBeCloseTo(spot.y, 6);
        expect(snip.size).toBeGreaterThan(0);
        expect(snip.size).toBeLessThanOrEqual(1.15 + 1e-6); // base size 1.0 m, pop overshoots to 1.15x
      }
      sim.destroy();
    }
  });

  it('the cut limp piece never overshoots 0.35 m nor 0.6x the actual string length - the Long ' +
    'arm\'s shorter string (see stringAnchor) caps it tighter than the Short arm\'s', async () => {
    const lengths: Record<string, number> = {};
    for (const arm of ['Short', 'Long']) {
      const cp = catapult({ arm });
      const level = makeLevel([cp], 3);
      const sim = await createCatapultSim([cp], level);
      const { a, p } = stringAnchor(cp);
      const stringLen = a.y - p.y;

      sim.play();
      const limp = byId(sim, 'string-limp')!;
      const { a: e0, b: e1 } = bandEnds(limp);
      const limpLen = Math.hypot(e1.x - e0.x, e1.y - e0.y);
      expect(limpLen).toBeLessThanOrEqual(0.35 + 1e-6);
      expect(limpLen).toBeLessThanOrEqual(0.6 * stringLen + 1e-6);
      // It hangs off the peg's hook.
      const low = e0.y < e1.y ? e0 : e1;
      expect(low.x).toBeCloseTo(p.x, 6);
      lengths[arm] = limpLen;
      sim.destroy();
    }
    expect(lengths.Long!).toBeLessThan(lengths.Short!);
  });

  it('a shot that ends in "shot" (a miss with shots remaining) re-ties the string; ' +
    '"cleared"/"outOfShots" leave it cut', async () => {
    // Deliberately short: never reaches a can placed far out of range, so the level neither
    // clears nor (with shots left) runs out.
    const cp = catapult({ angle: '75', power: 'Low' });
    const can: PlacedPart = { id: id(), kind: 'can', x: 27, y: 4, props: {} };
    const level = makeLevel([cp, can], 3);
    const sim = await createCatapultSim([cp, can], level);

    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('shot');
    expect(byId(sim, 'string')).toBeTruthy(); // re-tied, ready for the next shot
    expect(byId(sim, 'string-limp')).toBeUndefined();
    sim.destroy();
  });

  it('"cleared" (single target, single shot) leaves the string cut', async () => {
    const cp = catapult();
    const { tip } = catapultRelease(cp);
    const x = tip.x + 10.48;
    const shelf: PlacedPart = { id: id(), kind: 'shelf', x, y: 1, props: { length: '2' } };
    const can: PlacedPart = { id: id(), kind: 'can', x, y: 1.5, props: { color: 'Red' } };
    const level = makeLevel([cp, shelf, can], 1);
    const sim = await createCatapultSim([cp, shelf, can], level);

    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('cleared');
    expect(byId(sim, 'string')).toBeUndefined();
    expect(byId(sim, 'string-limp')).toBeTruthy();
    sim.destroy();
  });

  it('draws BAND_COUNT[power] red band sprites, each with a hook at both ends, every frame - edit, ' +
    'mid-swing and done - each spanning its bandSegments segment at the arm\'s current angle', async () => {
    const cp = catapult({ power: 'Max' });
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);

    const bands = () => sprites(sim).filter((o) => /^band-\d+$/.test(o.id));
    const hooks = () => sprites(sim).filter((o) => /^band-\d+-hook-[ab]$/.test(o.id));
    expect(bands()).toHaveLength(4); // Max -> BAND_COUNT.Max
    expect(hooks()).toHaveLength(8);
    for (const b of bands()) expect(b.textureKey).toMatch(/^real-band-\d+$/);
    for (const h of hooks()) expect(h.textureKey).toBe('real-hook');
    // Bands first, then their hooks, so every hook sits on top of its band.
    const ids = sprites(sim).map((o) => o.id);
    expect(Math.max(...bands().map((b) => ids.indexOf(b.id)))).toBeLessThan(Math.min(...hooks().map((h) => ids.indexOf(h.id))));

    // At rest each band runs from its arm point to its lever point (bandSegments), hooks on both ends.
    const segs = bandSegments(cp, REST_ANGLE);
    segs.forEach((seg, i) => {
      const ends = bandEnds(byId(sim, `band-${i}`)!);
      expect(ends.a.x).toBeCloseTo(seg.a.x, 6);
      expect(ends.a.y).toBeCloseTo(seg.a.y, 6);
      expect(ends.b.x).toBeCloseTo(seg.b.x, 6);
      expect(ends.b.y).toBeCloseTo(seg.b.y, 6);
      expect(byId(sim, `band-${i}-hook-a`)!.p).toEqual(seg.a);
      expect(byId(sim, `band-${i}-hook-b`)!.p).toEqual(seg.b);
    });

    sim.play();
    sim.step();
    expect(sim.outcome).toBe('running');
    expect(bands()).toHaveLength(4);

    await runUntilNotRunning(sim);
    expect(bands()).toHaveLength(4);
    expect(hooks()).toHaveLength(8);
    sim.destroy();
  });
});

describe('CatapultSim: renderItems draws no ground RenderItem any more', () => {
  it('the kit\'s own ground strip (world.groundDepth/groundStrip in spec.ts) draws the ground ' +
    'band now; renderItems() carries no role \'ground\' item, in edit mode or while running', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);

    expect(sim.renderItems().some((it) => it.role === 'ground')).toBe(false);

    sim.play();
    for (let i = 0; i < 10; i++) {
      sim.step();
      expect(sim.renderItems().some((it) => it.role === 'ground')).toBe(false);
    }
    sim.destroy();
  });
});

// ---- the collapse payoff (huddle 2026-09-22) ------------------------------------------------

/** The `line` level's stack: three 1x1 wood blocks and a 2x1 plank at x 17, line 1.5. */
function stack(): PlacedPart[] {
  return [
    { id: id(), kind: 'block', x: 17, y: 0.5, props: { size: '1x1', material: 'wood' } },
    { id: id(), kind: 'block', x: 17, y: 1.5, props: { size: '1x1', material: 'wood' } },
    { id: id(), kind: 'block', x: 17, y: 2.5, props: { size: '1x1', material: 'wood' } },
    { id: id(), kind: 'block', x: 17, y: 3.5, props: { size: '2x1', material: 'wood' } },
  ];
}
const TOPPLE = { power: 'Max', angle: '30', fuzz: 'Metal', arm: 'Short' };

/** Every sprite overlay id seen per textureKey across the rest of the running shot. */
async function spritesDuringShot(sim: Awaited<ReturnType<typeof createCatapultSim>>) {
  const seen = new Map<string, Map<string, { x: number; y: number; size: number }>>();
  for (let i = 0; i < 700 && sim.outcome === 'running'; i++) {
    sim.step();
    for (const o of sim.snapshot().overlay ?? []) {
      if (o.kind !== 'sprite') continue;
      let byId = seen.get(o.textureKey);
      if (!byId) seen.set(o.textureKey, (byId = new Map()));
      const prev = byId.get(o.id);
      byId.set(o.id, { x: o.p.x, y: o.p.y, size: Math.max(prev?.size ?? 0, o.size) });
    }
  }
  return seen;
}

describe('CatapultSim: aboveLine', () => {
  it('counts targets whose box top is above the line at rest, and 0 once the stack is toppled', async () => {
    const cp = catapult(TOPPLE);
    const parts = [cp, ...stack()];
    const level = { ...makeLevel(parts, 1), line: 1.5 };
    const sim = await createCatapultSim(parts, level);
    // Tops at 1.0 (below), 2.0, 3.0 and 4.0 (above).
    expect(sim.metrics().aboveLine).toBe(3);
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.metrics().aboveLine).toBe(0);
    sim.destroy();
  });

  it('is 0 on a level with no line, however tall the targets', async () => {
    const cp = catapult();
    const parts = [cp, ...stack()];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1));
    expect(sim.metrics().aboveLine).toBe(0);
    sim.destroy();
  });

  it('uses the rotated box: a 1x2 block tipped onto its side no longer reaches a 1.2 m line', async () => {
    const standing: PlacedPart = { id: id(), kind: 'block', x: 20, y: 1, props: { size: '1x2', material: 'wood' } };
    const cp = catapult({ power: 'Low', angle: '75' }); // never reaches it
    const parts = [cp, standing];
    const sim = await createCatapultSim(parts, { ...makeLevel(parts, 1), line: 1.2 });
    expect(sim.metrics().aboveLine).toBe(1);
    const lying: PlacedPart = { ...standing, id: id(), props: { size: '2x1', material: 'wood' }, y: 0.5 };
    const sim2 = await createCatapultSim([cp, lying], { ...makeLevel([cp, lying], 1), line: 1.2 });
    expect(sim2.metrics().aboveLine).toBe(0);
    sim.destroy();
    sim2.destroy();
  });
});

describe('CatapultSim: the camera stays on the collapse', () => {
  it('adds an invisible role "impact" item on the first target the fuzz hits, and drops it at the next play()', async () => {
    const cp = catapult();
    const { tip } = catapultRelease(cp);
    const x = tip.x + 10.48; // the can-on-a-shelf point on the Medium/45 arc (see above)
    const shelf: PlacedPart = { id: id(), kind: 'shelf', x, y: 1, props: { length: '2' } };
    const can: PlacedPart = { id: id(), kind: 'can', x, y: 1.5, props: { color: 'Red' } };
    const farCan: PlacedPart = { id: id(), kind: 'can', x: 28, y: 0.4, props: { color: 'Blue' } }; // keeps the level from clearing
    const parts = [cp, shelf, can, farCan];
    const sim = await createCatapultSim(parts, makeLevel(parts, 3));
    const canBody = sim.handles().find((h) => h.partId === can.id)!.bodies[0]!.id;

    expect(sim.renderItems().some((it) => it.role === 'impact')).toBe(false);
    sim.play();
    let sawFuzzBeforeImpact = false;
    let impact: RenderItem | undefined;
    for (let i = 0; i < 700 && sim.outcome === 'running' && !impact; i++) {
      sim.step();
      const items = sim.renderItems();
      impact = items.find((it) => it.role === 'impact');
      if (!impact && items.some((it) => it.role === 'fuzz' && it.partId === FUZZ_PART_ID)) sawFuzzBeforeImpact = true;
    }
    expect(sawFuzzBeforeImpact).toBe(true);
    expect(impact).toBeTruthy();
    expect(impact!.body).toBe(canBody);
    expect(impact!.alpha).toBe(0);
    expect(impact!.partId).toBe(IMPACT_PART_ID);
    expect(impact!.shape).toEqual({ kind: 'box', w: 0.4, h: 0.8 });

    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('shot');
    expect(sim.renderItems().filter((it) => it.role === 'impact')).toHaveLength(1); // still there between shots
    sim.play();
    expect(sim.renderItems().some((it) => it.role === 'impact')).toBe(false);
    sim.destroy();
  });

  it('the fuzz flying this shot is the first "fuzz" item, ahead of one resting from an earlier shot', async () => {
    const cp = catapult({ power: 'Low', angle: '75' });
    const sim = await createCatapultSim([cp], makeLevel([cp], 3));
    sim.play();
    await runUntilNotRunning(sim);
    const firstFuzz = sim.renderItems().find((it) => it.role === 'fuzz' && it.partId === FUZZ_PART_ID)!.body;
    sim.play();
    for (let i = 0; i < 60; i++) sim.step();
    const flying = sim.renderItems().filter((it) => it.role === 'fuzz' && it.partId === FUZZ_PART_ID);
    expect(flying).toHaveLength(2);
    expect(flying[0]!.body).not.toBe(firstFuzz);
    sim.destroy();
  });
});

describe('CatapultSim: dust and CRASH!', () => {
  it('a toppled stack kicks up fx-dust, at most one puff per target, each about DUST_SIZE', async () => {
    const cp = catapult(TOPPLE);
    const parts = [cp, ...stack()];
    const sim = await createCatapultSim(parts, { ...makeLevel(parts, 1), line: 1.5 });
    sim.play();
    const seen = await spritesDuringShot(sim);
    const dust = seen.get('fx-dust');
    expect(dust && dust.size).toBeGreaterThanOrEqual(1);
    expect(dust!.size).toBeLessThanOrEqual(4); // four targets, one puff each at most
    for (const d of dust!.values()) {
      expect(d.size).toBeLessThanOrEqual(DUST_SIZE * 1.15 + 1e-6);
      expect(d.y).toBeLessThan(2); // just above where the block came down
    }
    sim.destroy();
  });

  it('no dust in edit mode or from a shot that touches nothing', async () => {
    const cp = catapult({ power: 'Low', angle: '75' });
    const parts = [cp, ...stack()];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1));
    expect((sim.snapshot().overlay ?? []).some(isFx)).toBe(false);
    sim.play();
    const seen = await spritesDuringShot(sim);
    expect(seen.has('fx-dust')).toBe(false);
    sim.destroy();
  });

  it('three targets down in ONE shot shows exactly one fx-crash, about CRASH_SIZE, above the wreck', async () => {
    const cp = catapult(TOPPLE);
    const parts = [cp, ...stack()];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1));
    sim.play();
    const seen = await spritesDuringShot(sim);
    expect(sim.metrics().knockedDown).toBeGreaterThanOrEqual(3);
    const crash = seen.get('fx-crash');
    expect(crash?.size).toBe(1);
    const c = [...crash!.values()][0]!;
    expect(c.size).toBeGreaterThan(CRASH_SIZE);
    expect(c.size).toBeLessThanOrEqual(CRASH_SIZE * 1.15 + 1e-6);
    expect(c.x).toBeGreaterThan(15);
    expect(c.y).toBeGreaterThan(2);
    sim.destroy();
  });

  it('one can down is no CRASH!', async () => {
    const cp = catapult();
    const { tip } = catapultRelease(cp);
    const x = tip.x + 10.48;
    const parts: PlacedPart[] = [cp, { id: id(), kind: 'shelf', x, y: 1, props: { length: '2' } }, { id: id(), kind: 'can', x, y: 1.5, props: { color: 'Red' } }];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1));
    sim.play();
    const seen = await spritesDuringShot(sim);
    expect(sim.metrics().knockedDown).toBe(1);
    expect(seen.has('fx-crash')).toBe(false);
    sim.destroy();
  });
});

describe('CatapultSim: the Donut, the split shot', () => {
  type World = { getLinearVelocity(b: number): { x: number; y: number }; getTransform(b: number): { position: { x: number; y: number } } };
  const flyingFuzz = (sim: { renderItems(): RenderItem[] }) =>
    sim.renderItems().filter((it) => it.role === 'fuzz' && it.partId === FUZZ_PART_ID);

  it('splits exactly once, at the top of the arc, into three fuzzes: same speed, turned +/-14 degrees, ' +
    '0.1 m apart sideways, with a small puff at the split point', async () => {
    const cp = catapult({ fuzz: 'Donut', power: 'High', angle: '30' });
    const sim = await createCatapultSim([cp], makeLevel([cp], 1));
    const world = sim['world'] as unknown as World;
    sim.play();

    let prevVy = Infinity;
    let split = false;
    for (let i = 0; i < 700 && sim.outcome === 'running' && !split; i++) {
      const before = flyingFuzz(sim);
      if (before.length === 1) prevVy = world.getLinearVelocity(before[0]!.body).y;
      sim.step();
      const now = flyingFuzz(sim);
      if (now.length <= 1) continue;
      split = true;
      expect(now).toHaveLength(3);
      const [parent, up, down] = now.map((it) => ({ v: world.getLinearVelocity(it.body), p: world.getTransform(it.body).position }));
      // The apex: rising the step before, not rising now.
      expect(prevVy).toBeGreaterThan(0);
      expect(parent!.v.y).toBeLessThanOrEqual(0);
      const speed = Math.hypot(parent!.v.x, parent!.v.y);
      const dir = Math.atan2(parent!.v.y, parent!.v.x);
      const turn = (SPLIT_ANGLE_DEG * Math.PI) / 180;
      for (const [child, sign] of [[up!, 1], [down!, -1]] as const) {
        expect(Math.hypot(child.v.x, child.v.y)).toBeCloseTo(speed, 6);
        expect(Math.atan2(child.v.y, child.v.x)).toBeCloseTo(dir + sign * turn, 6);
        const off = { x: child.p.x - parent!.p.x, y: child.p.y - parent!.p.y };
        expect(Math.hypot(off.x, off.y)).toBeCloseTo(SPLIT_OFFSET, 6);
        expect(off.x * Math.cos(dir) + off.y * Math.sin(dir)).toBeCloseTo(0, 6); // sideways, not along the flight
      }
      // Same fuzz, same look: the children wear the Donut picture and keep its radius.
      for (const it of now) {
        expect(it.textureKey).toBe('fuzz-Donut-excited');
        expect(it.shape).toEqual({ kind: 'circle', r: FUZZ.Donut!.r });
        expect(it.shape).toEqual(now[0]!.shape);
      }
      const puff = (sim.snapshot().overlay ?? []).find((o) => o.kind === 'sprite' && o.textureKey === 'fx-dust');
      expect(puff).toBeTruthy();
    }
    expect(split).toBe(true);

    await runUntilNotRunning(sim);
    expect(flyingFuzz(sim)).toHaveLength(3); // never splits again
    sim.destroy();
  });

  it('no other fuzz ever splits, at any angle', async () => {
    for (const fuzz of FUZZ_NAMES.filter((name) => name !== 'Donut')) {
      for (const angle of ['15', '45', '75']) {
        const cp = catapult({ fuzz, angle, power: 'High' });
        const sim = await createCatapultSim([cp], makeLevel([cp], 1));
        sim.play();
        for (let i = 0; i < 700 && sim.outcome === 'running'; i++) {
          sim.step();
          expect(flyingFuzz(sim).length).toBeLessThanOrEqual(1);
        }
        expect(flyingFuzz(sim)).toHaveLength(1);
        sim.destroy();
      }
    }
  });

  it('a split fuzz counts for knockedDown: a can only the low little donut reaches goes down for ' +
    'the Donut, stays up for every other fuzz', async () => {
    async function tryFuzz(fuzz: string): Promise<number> {
      const cp = catapult({ fuzz, power: 'High', angle: '45' });
      // The `donut` level's near can (since the energy rule): on the lower child's path, under the
      // original's.
      const parts: PlacedPart[] = [
        cp,
        { id: id(), kind: 'shelf', x: 21.2, y: 0.625, props: { length: '2' } },
        { id: id(), kind: 'can', x: 21.2, y: 1.125, props: { color: 'Red' } },
      ];
      const sim = await createCatapultSim(parts, makeLevel(parts, 1));
      sim.play();
      await runUntilNotRunning(sim);
      const knocked = sim.metrics().knockedDown;
      sim.destroy();
      return knocked;
    }
    expect(await tryFuzz('Donut')).toBe(1);
    for (const fuzz of FUZZ_NAMES.filter((name) => name !== 'Donut')) expect(await tryFuzz(fuzz), fuzz).toBe(0);
  });
});

// Gao, 2026-10-15: "breakable boxes, if hit with enough force, they just get destroyed". A crate is
// a block with `material: 'crate'`; the rule is catalog.ts CRATE_BREAK (an impulse over 1.8 N s in
// one step from a body closing on it at 4 m/s or more). The scenes use the Smash it level's
// geometry (since the energy rule): a tall 1x2 crate on the ground at x 22.5, in the path of a fast,
// flat Max / 15 degree shot that every fuzz reaches.
describe('CatapultSim: breakable crates', () => {
  function crate(x = 15, y = 0.5, size = '1x1'): PlacedPart {
    return { id: id(), kind: 'block', x, y, props: { size, material: 'crate' } };
  }

  async function shoot(fuzz: string, extra: PlacedPart[] = [], line?: number, over: Record<string, string> = {}) {
    const parts = [catapult({ fuzz, power: 'Max', angle: '15', ...over }), crate(22.5, 1, '1x2'), ...extra];
    const level = { ...makeLevel(parts, 2), ...(line !== undefined ? { line } : {}) };
    const sim = await createCatapultSim(parts, level);
    const crateBody = sim.handles().find((h) => h.partId === parts[1]!.id)!.bodies[0]!.id;
    const before = sim.metrics();
    sim.play();
    const seen = new Set<string>();
    let brokeAt = -1;
    for (let tick = 0; tick < 700 && sim.outcome === 'running'; tick++) {
      sim.step();
      for (const o of sim.snapshot().overlay ?? []) if (o.kind === 'sprite') seen.add(o.textureKey);
      if (brokeAt < 0 && !sim['world'].bodies().includes(crateBody)) brokeAt = tick;
    }
    return { sim, parts, crateBody, before, seen, brokeAt };
  }

  it('a crate hit hard (the Fur fuzz, Max / 15) breaks: SMASH!, tumbling planks, its body and picture gone, counted as knocked down', async () => {
    const { sim, parts, crateBody, seen, brokeAt } = await shoot('Fur');
    expect(brokeAt).toBeGreaterThan(0);
    const m = sim.metrics();
    expect(m.smashed).toBe(1);
    expect(m.knockedDown).toBe(1);
    expect(m.targetsLeft).toBe(0);
    expect(sim.outcome).toBe('cleared'); // the only target is gone
    expect(sim['world'].bodies()).not.toContain(crateBody);
    expect(sim.snapshot().transforms.has(crateBody)).toBe(false);
    const handle = sim.handles().find((h) => h.partId === parts[1]!.id)!;
    expect(handle.bodies).toEqual([]);
    expect(handle.visuals).toEqual([]);
    expect(sim.renderItems().some((it) => it.body === crateBody)).toBe(false);
    expect(seen.has('fx-smash')).toBe(true);
    expect([...seen].filter((k) => k.startsWith('crate-debris-')).length).toBeGreaterThanOrEqual(2);
    // The smash replaces the BOOM on the crate it breaks.
    expect(seen.has('fx-boom')).toBe(false);
    sim.destroy();
  });

  it('the shot does not end while the planks are still tumbling, and they are gone (faded) by the end', async () => {
    const { sim } = await shoot('Metal');
    const overlay = sim.snapshot().overlay ?? [];
    expect(overlay.some((o) => o.kind === 'sprite' && o.textureKey.startsWith('crate-debris-'))).toBe(false);
    sim.destroy();
  });

  it('a gentle hit (the light Flower) only bumps it: a BOOM, no smash, the crate stays', async () => {
    // On the 1.5 m arm: since the speed cap went (2026-10-16) the Flower on the 2 m arm skims over.
    const { sim, crateBody, seen, brokeAt } = await shoot('Flower', [], undefined, { armLen: '1.5' });
    expect(seen.has('fx-boom')).toBe(true); // it did hit the crate
    expect(brokeAt).toBe(-1);
    expect(seen.has('fx-smash')).toBe(false);
    expect(sim.metrics().smashed).toBe(0);
    expect(sim['world'].bodies()).toContain(crateBody);
    sim.destroy();
  });

  it('crates resting in a stack never break on their own, and a shot that misses leaves them all', async () => {
    const stack = [crate(17, 0.5), crate(17, 1.5), crate(17, 2.5), crate(17, 3.5)];
    const parts = [catapult({ power: 'Low', fuzz: 'Metal' }), ...stack];
    const sim = await createCatapultSim(parts, makeLevel(parts, 3));
    for (let shot = 0; shot < 3; shot++) {
      sim.play();
      await runUntilNotRunning(sim);
    }
    expect(sim.metrics().smashed).toBe(0);
    expect(sim.metrics().knockedDown).toBe(0);
    expect(sim.handles().filter((h) => h.kind === 'block').every((h) => h.bodies.length === 1)).toBe(true);
    sim.destroy();
  });

  it('a hard hit on the block on top of a crate stack does not break the crates under it (they were resting)', async () => {
    // Max / 30 / Metal / Long strikes the top of a 4-high stack 12 m out (High / 30 / Short until
    // the energy rule; the Short arm now clips the top crate too); the push runs down through
    // every crate under it into the ground in that same step, far over 1.8 N s - but nothing under
    // the top was moving, so the speed gate keeps them whole.
    const top: PlacedPart = { id: id(), kind: 'block', x: 17, y: 3.5, props: { size: '1x1', material: 'wood' } };
    const stack = [crate(17, 0.5), crate(17, 1.5), crate(17, 2.5), top];
    const parts = [catapult({ power: 'Max', angle: '30', fuzz: 'Metal', arm: 'Long' }), ...stack];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1));
    sim.play();
    let hitTick = -1;
    for (let tick = 0; tick < 700 && sim.outcome === 'running' && hitTick < 0; tick++) {
      sim.step();
      if ((sim.snapshot().overlay ?? []).some((o) => o.kind === 'sprite' && o.textureKey === 'fx-boom')) hitTick = tick;
    }
    expect(hitTick).toBeGreaterThan(0); // the fuzz hit the top block
    expect(sim.metrics().smashed).toBe(0);
    sim.destroy();
  });

  it('breaks the same way every time: same tick, same count, same world (fixed step)', async () => {
    const a = await shoot('Fur');
    const b = await shoot('Fur');
    expect(a.brokeAt).toBe(b.brokeAt);
    expect(a.sim.metrics()).toEqual(b.sim.metrics());
    expect(a.sim['world'].hash()).toBe(b.sim['world'].hash());
    a.sim.destroy();
    b.sim.destroy();
  });

  it('a broken crate is never above the line', async () => {
    const { sim, before } = await shoot('Fur', [], 0.5);
    expect(before.aboveLine).toBe(1);
    expect(sim.metrics().aboveLine).toBe(0);
    sim.destroy();
  });

  it('a level with no crates steps exactly as before (the crate code reports nothing)', async () => {
    const block: PlacedPart = { id: id(), kind: 'block', x: 15, y: 0.5, props: { size: '1x1', material: 'wood' } };
    const parts = [catapult({ fuzz: 'Metal' }), block];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1));
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.metrics().smashed).toBe(0);
    expect(sim.handles().find((h) => h.partId === block.id)!.bodies).toHaveLength(1);
    sim.destroy();
  });
});

// ---- 2026-10-16: unlimited bands, the space shot, the knock-down rule, the target markers --------

/** A catapult with the new props (bands / armLen), defaults 2 bands, 45 degrees, the Fur, 2 m. */
function newCatapult(props: Record<string, string> = {}, x = 5): PlacedPart {
  return { id: id(), kind: 'catapult', x, y: 0, props: { bands: '2', angle: '45', fuzz: 'Fur', armLen: '2', ...props } };
}

type Sim = Awaited<ReturnType<typeof createCatapultSim>>;
const labels = (sim: Sim) => (sim.snapshot().overlay ?? []).filter((o): o is Extract<OverlayItem, { kind: 'label' }> => o.kind === 'label');
const label = (sim: Sim, lid: string) => labels(sim).find((o) => o.id === lid);

describe('CatapultSim: rubber bands past six (2026-10-16)', () => {
  it('draws at most six bands; past six the bundle carries a "×n" label riding the bands', async () => {
    for (const [n, drawn] of [[1, 1], [6, 6], [7, 6], [20, 6]] as const) {
      const cp = newCatapult({ bands: String(n) });
      const sim = await createCatapultSim([cp], makeLevel([cp], 1));
      const overlay = sim.snapshot().overlay ?? [];
      expect(overlay.filter((o) => o.kind === 'sprite' && /^band-\d+$/.test(o.id))).toHaveLength(drawn);
      const count = label(sim, 'band-count');
      if (n > 6) {
        expect(count?.text).toBe(`×${n}`);
        const mid = bandBundleAt(cp);
        expect(count?.p).toEqual({ x: mid.x + BAND_LABEL_OFFSET.x, y: mid.y + BAND_LABEL_OFFSET.y });
      } else {
        expect(count).toBeUndefined();
      }
      sim.destroy();
    }
  });

  it('the arm, the swing and the release all follow armLen: a 4 m arm releases farther out and faster than a 1.5 m arm', async () => {
    const short = catapultRelease(newCatapult({ armLen: '1.5' }));
    const long = catapultRelease(newCatapult({ armLen: '4' }));
    expect(Math.hypot(long.v.x, long.v.y) / Math.hypot(short.v.x, short.v.y)).toBeCloseTo(1.15 / 0.9, 9);
    for (const armLen of ['1.5', '3', '4']) {
      const cp = newCatapult({ armLen });
      const sim = await createCatapultSim([cp], makeLevel([cp], 1));
      expect(sim.renderItems().find((it) => it.role === 'arm')!.textureKey).toBe(`real-arm-${armLen}`);
      sim.play();
      await runUntilNotRunning(sim);
      sim.destroy();
    }
  });
});

describe('CatapultSim: the space shot (2026-10-16)', () => {
  it('over SPACE_SPEED the fuzz rockets out of the top of the world: no collisions, a sparkle trail, outcome "space", FIRE again while shots are left', async () => {
    const cp = newCatapult({ bands: '45' });
    expect(isSpaceShot(cp.props)).toBe(true);
    // A can on a tall shelf right in the normal flight path, and one on the ground ahead.
    const shelf: PlacedPart = { id: id(), kind: 'shelf', x: 8, y: 6, props: { length: '4' } };
    const can: PlacedPart = { id: id(), kind: 'can', x: 8, y: 6.5, props: { color: 'Red' } };
    const can2: PlacedPart = { id: id(), kind: 'can', x: 12, y: 0.4, props: { color: 'Blue' } };
    const parts = [cp, shelf, can, can2];
    const level = makeLevel(parts, 2, [{ metric: 'knockedDown', op: '>=', value: 1, label: '' }]);
    const sim = await createCatapultSim(parts, level);
    const dynamicBefore = sim['world'].bodies().length;
    sim.play();
    let sparkles = 0;
    let maxY = -Infinity;
    let fuzzFirst = false;
    for (let t = 0; t < 700 && sim.outcome === 'running'; t++) {
      sim.step();
      const items = sim.renderItems();
      const fuzz = items.find((it) => it.role === 'fuzz');
      if (fuzz && fuzz.partId === FUZZ_PART_ID) {
        fuzzFirst = true;
        const tr = sim.snapshot().transforms.get(fuzz.body);
        if (tr) maxY = Math.max(maxY, tr.position.y);
      }
      sparkles = Math.max(sparkles, (sim.snapshot().overlay ?? []).filter((o) => o.kind === 'dot' && o.screen).length);
    }
    expect(fuzzFirst).toBe(true);
    expect(maxY).toBeGreaterThan(WORLD_H - 2); // it reached the top of the world
    expect(sparkles).toBeGreaterThan(4);
    expect(sim.outcome).toBe('space');
    const m = sim.metrics();
    expect(m.shotsUsed).toBe(1);
    expect(m.knockedDown).toBe(0);
    expect(m.maxRange).toBe(0);
    expect(sim['world'].bodies().length).toBe(dynamicBefore); // the space fuzz is gone again
    // Shots left: FIRE works again, the arm is reloaded and the string tied.
    expect(sim.canReplay()).toBe(true);
    expect(sim.renderItems().some((it) => it.role === 'fuzz' && it.partId === cp.id)).toBe(true);
    expect((sim.snapshot().overlay ?? []).some((o) => o.kind === 'sprite' && o.id === 'string')).toBe(true);
    // The last shot into space ends the level (no replay), still 'space'.
    sim.play();
    await runUntilNotRunning(sim);
    expect(sim.outcome).toBe('space');
    expect(sim.canReplay()).toBe(false);
    expect(sim.metrics().shotsUsed).toBe(2);
    sim.destroy();
  });

  it('the threshold: 11 bands on the Fur with the 2 m arm is a normal shot, 12 is a space shot', async () => {
    for (const [bands, space] of [['11', false], ['12', true]] as const) {
      const cp = newCatapult({ bands, angle: '75' });
      const sim = await createCatapultSim([cp], makeLevel([cp], 2));
      sim.play();
      await runUntilNotRunning(sim);
      expect(sim.outcome, bands).toBe(space ? 'space' : 'shot');
      sim.destroy();
    }
  });

  it('the space shot is quick: it ends within SPACE_MAX_TIME, even fired flat', async () => {
    for (const angle of ['15', '45', '75']) {
      const cp = newCatapult({ bands: '60', angle, fuzz: 'Metal', armLen: '1.5' });
      const sim = await createCatapultSim([cp], makeLevel([cp], 1));
      sim.play();
      const ticks = await runUntilNotRunning(sim);
      expect(sim.outcome).toBe('space');
      expect(ticks * (1 / 60)).toBeLessThanOrEqual(SPACE_MAX_TIME + 0.7);
      sim.destroy();
    }
  });

  it('spacePath leaves the world through the top; the preview of a space shot follows it (through everything)', async () => {
    const cp = newCatapult({ bands: '45', angle: '30' });
    const { tip, v } = catapultRelease(cp);
    const path = spacePath(tip, v);
    expect(outOfWorld(path[path.length - 1]!)).toBe(true);
    expect(path[path.length - 1]!.y).toBeGreaterThan(WORLD_H);
    const wall: PlacedPart = { id: id(), kind: 'wall', x: 9, y: 3, props: { height: '6' } };
    const sim = await createCatapultSim([cp, wall], makeLevel([cp, wall], 1), () => 0);
    sim.showPreview();
    const dots = (sim.snapshot().overlay ?? []).filter((o): o is Extract<OverlayItem, { kind: 'dot' }> => o.kind === 'dot');
    expect(Math.max(...dots.map((d) => d.p.y))).toBeGreaterThan(WORLD_H - 1);
    sim.destroy();
  });
});

describe('CatapultSim: the knock-down rule (2026-10-16: tipped or dropped, never slid)', () => {
  /** A level whose catapult fires a harmless short lob, so the sim steps while the test pushes. */
  async function pushed(target: PlacedPart, push: (sim: Sim, body: number) => void, extra: PlacedPart[] = []) {
    const cp = newCatapult({ bands: '1', angle: '75' });
    const parts = [cp, ...extra, target];
    const sim = await createCatapultSim(parts, makeLevel(parts, 3));
    const body = sim.handles().find((h) => h.partId === target.id)!.bodies[0]!.id;
    sim.play();
    push(sim, body);
    for (let t = 0; t < 30; t++) sim.step();
    // Keep pushing for a moment (a slide needs a steady shove; a tip one kick).
    await runUntilNotRunning(sim);
    return { sim, body };
  }

  it('a block slid 2 m along the ground (no turn, no drop) is NOT knocked down', async () => {
    const block: PlacedPart = { id: id(), kind: 'block', x: 20, y: 0.5, props: { size: '2x1', material: 'steel' } };
    const { sim, body } = await pushed(block, (s, b) => s['world'].setLinearVelocity(b, { x: 4, y: 0 }));
    const t = sim.snapshot().transforms.get(body)!;
    expect(Math.abs(t.position.x - 20)).toBeGreaterThan(0.5); // it really moved
    expect(sim.metrics().knockedDown).toBe(0);
    sim.destroy();
  });

  it('a standing domino tipped over is knocked down (turned past 45 degrees)', async () => {
    const domino: PlacedPart = { id: id(), kind: 'block', x: 20, y: 1, props: { size: 'domino', material: 'wood' } };
    const { sim } = await pushed(domino, (s, b) => s['world'].setAngularVelocity(b, -3));
    expect(sim.metrics().knockedDown).toBe(1);
    sim.destroy();
  });

  it('a can pushed off its shelf drops (more than half its height) and is knocked down, even landing upright', async () => {
    const shelf: PlacedPart = { id: id(), kind: 'shelf', x: 20, y: 1.5, props: { length: '2' } };
    const can: PlacedPart = { id: id(), kind: 'can', x: 20.6, y: 2, props: { color: 'Red' } };
    const { sim, body } = await pushed(can, (s, b) => s['world'].setLinearVelocity(b, { x: 3, y: 0 }), [shelf]);
    expect(sim.snapshot().transforms.get(body)!.position.y).toBeLessThan(1.5);
    expect(sim.metrics().knockedDown).toBe(1);
    sim.destroy();
  });

  it('a cube that tumbles onto its next face counts (its turn is tracked in total, not modulo 90 degrees)', async () => {
    const cube: PlacedPart = { id: id(), kind: 'block', x: 20, y: 0.5, props: { size: '1x1', material: 'wood' } };
    const { sim, body } = await pushed(cube, (s, b) => {
      s['world'].setAngularVelocity(b, -6);
      s['world'].setLinearVelocity(b, { x: 2, y: 2 });
    });
    const t = sim.snapshot().transforms.get(body)!;
    expect(t.position.y).toBeCloseTo(0.5, 1); // back on the ground on a face
    expect(sim.metrics().knockedDown).toBe(1);
    sim.destroy();
  });

  it('the tip limit is the balance point plus 3 degrees, never under 45: can/domino 45, cube 48, a 2x1 plank lying flat 66', async () => {
    const cp = newCatapult();
    const mk = (size: string, y: number): PlacedPart => ({ id: id(), kind: 'block', x: 20 + nextId, y, props: { size, material: 'wood' } });
    const can: PlacedPart = { id: id(), kind: 'can', x: 14, y: 0.4, props: { color: 'Red' } };
    const parts = [cp, can, mk('domino', 1), mk('1x1', 0.5), mk('2x1', 0.5)];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1));
    const limits = parts.slice(1).map((p) => (sim['tipLimit'].get(sim.handles().find((h) => h.partId === p.id)!.bodies[0]!.id)! * 180) / Math.PI);
    expect(limits[0]).toBeCloseTo(45, 6);
    expect(limits[1]).toBeCloseTo(45, 6);
    expect(limits[2]).toBeCloseTo(48, 6);
    expect(limits[3]).toBeCloseTo(Math.atan2(1, 0.5) * (180 / Math.PI) + 3, 0); // its settled pose is a hair off level
    expect(TIP_MIN).toBeCloseTo(Math.PI / 4, 12);
    sim.destroy();
  });
});

describe('CatapultSim: target markers and check pops (2026-10-16)', () => {
  const two = () => {
    const cp = newCatapult({ bands: '1', angle: '75' });
    const a: PlacedPart = { id: id(), kind: 'can', x: 14, y: 0.4, props: { color: 'Red' } };
    const b: PlacedPart = { id: id(), kind: 'block', x: 18, y: 1, props: { size: '1x2', material: 'wood' } };
    return { cp, a, b, parts: [cp, a, b] };
  };

  it('every target a knock-down goal needs wears a numbered marker over it (left to right); none without goals', async () => {
    const { a, b, parts } = two();
    const sim = await createCatapultSim(parts, makeLevel(parts, 2, [{ metric: 'knockedDown', op: '>=', value: 2, label: '' }]), () => 0);
    expect(sim.markedTargets()).toEqual([
      { partId: a.id, kind: 'knock', n: 1, done: false },
      { partId: b.id, kind: 'knock', n: 2, done: false },
    ]);
    const ma = label(sim, `mark-${a.id}`)!;
    const mb = label(sim, `mark-${b.id}`)!;
    expect([ma.text, mb.text]).toEqual(['1', '2']);
    expect(ma.bg).toBe(MARKER_COLOR);
    // Over each target's top (the can 0.8 m tall, the block 2 m), by MARKER_GAP plus the bob.
    expect(ma.p.y).toBeGreaterThan(0.8 + MARKER_GAP - MARKER_BOB - 0.05);
    expect(mb.p.y).toBeGreaterThan(2 + MARKER_GAP - MARKER_BOB - 0.05);
    expect(ma.p.x).toBeCloseTo(14, 1);
    sim.destroy();

    const free = await createCatapultSim(parts, makeLevel(parts, 2), () => 0);
    expect(free.markedTargets()).toEqual([]);
    expect(labels(free).filter((o) => o.id.startsWith('mark-'))).toEqual([]);
    free.destroy();
  });

  it('the marker bobs on the page clock', async () => {
    const { parts, a } = two();
    let now = 0;
    const sim = await createCatapultSim(parts, makeLevel(parts, 2, [{ metric: 'knockedDown', op: '>=', value: 2, label: '' }]), () => now);
    const ys = [0, 0.3, 0.6, 0.9].map((t) => {
      now = t;
      return label(sim, `mark-${a.id}`)!.p.y;
    });
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(MARKER_BOB);
    sim.destroy();
  });

  it('once a target is down its marker becomes a green check that pops, then is gone after CHECK_TIME', async () => {
    const { parts, b } = two();
    let now = 10;
    const sim = await createCatapultSim(parts, makeLevel(parts, 2, [{ metric: 'knockedDown', op: '>=', value: 2, label: '' }]), () => now);
    const body = sim.handles().find((h) => h.partId === b.id)!.bodies[0]!.id;
    sim.play();
    sim['world'].setAngularVelocity(body, -5);
    sim['world'].setLinearVelocity(body, { x: 2, y: 1 });
    await runUntilNotRunning(sim);
    expect(sim.metrics().knockedDown).toBe(1);
    expect(sim.markedTargets().find((m) => m.partId === b.id)!.done).toBe(true);
    // The check was stamped at now = 10 (the clock did not move during the shot).
    now = 10 + 0.5;
    const check = label(sim, `mark-${b.id}`)!;
    expect(check.text).toBe('✓');
    expect(check.bg).toBe(CHECK_COLOR);
    expect(check.size).toBe(CHECK_SIZE);
    now = 10 + 0.1;
    expect(label(sim, `mark-${b.id}`)!.size!).toBeGreaterThan(CHECK_SIZE * 0.5); // popping in
    now = 10 + CHECK_TIME + 0.01;
    expect(label(sim, `mark-${b.id}`)).toBeUndefined();
    sim.destroy();
  });

  it('a line goal marks only the pieces over the line; a smash goal the crates; a hits goal the bullseye (done once hit)', async () => {
    const cp = newCatapult({ bands: '2', angle: '45' });
    const low: PlacedPart = { id: id(), kind: 'block', x: 20, y: 0.5, props: { size: '1x1', material: 'wood' } };
    const high: PlacedPart = { id: id(), kind: 'block', x: 20, y: 1.5, props: { size: '1x1', material: 'wood' } };
    const lineParts = [cp, low, high];
    const lineSim = await createCatapultSim(lineParts, { ...makeLevel(lineParts, 1, [{ metric: 'aboveLine', op: '==', value: 0, label: '' }]), line: 1.5 }, () => 0);
    expect(lineSim.markedTargets().map((m) => [m.partId, m.kind])).toEqual([[high.id, 'line']]);
    lineSim.destroy();

    const crate: PlacedPart = { id: id(), kind: 'block', x: 22, y: 0.5, props: { size: '1x1', material: 'crate' } };
    const smashParts = [cp, low, crate];
    const smashSim = await createCatapultSim(smashParts, makeLevel(smashParts, 1, [{ metric: 'smashed', op: '>=', value: 1, label: '' }]), () => 0);
    expect(smashSim.markedTargets().map((m) => [m.partId, m.kind, m.n])).toEqual([[crate.id, 'smash', 0]]);
    expect(label(smashSim, `mark-${crate.id}`)!.text).toBe('▼');
    smashSim.destroy();

    // The measured Medium / 45 / Fur shot lands ~11.3 m past the tip: put the bullseye there, low.
    const { tip } = catapultRelease(cp);
    const bull: PlacedPart = { id: id(), kind: 'bullseye', x: tip.x + 10.6, y: 0.9, props: { size: 'M' } };
    const hitParts = [cp, bull];
    const hitSim = await createCatapultSim(hitParts, makeLevel(hitParts, 1, [{ metric: 'hits', op: '>=', value: 1, label: '' }]), () => 0);
    expect(hitSim.markedTargets()).toEqual([{ partId: bull.id, kind: 'bullseye', n: 0, done: false }]);
    hitSim.play();
    await runUntilNotRunning(hitSim);
    expect(hitSim.metrics().hits).toBe(1);
    expect(hitSim.markedTargets()[0]!.done).toBe(true);
    hitSim.destroy();
  });

  it('in a tower, a piece with another marked piece on it wears its marker on itself, not over the top', async () => {
    const cp = newCatapult();
    const parts: PlacedPart[] = [cp, ...[0.5, 1.5, 2.5].map((y) => ({ id: id(), kind: 'block' as const, x: 20, y, props: { size: '1x1', material: 'wood' } }))];
    const sim = await createCatapultSim(parts, makeLevel(parts, 1, [{ metric: 'knockedDown', op: '>=', value: 3, label: '' }]), () => 0);
    const marks = parts.slice(1).map((p) => label(sim, `mark-${p.id}`)!);
    // Numbered 1..3 (bottom first, same x), the bottom two on their own block, the top one above it.
    expect(marks.map((m) => m.text)).toEqual(['1', '2', '3']);
    expect(marks[0]!.p.y).toBeCloseTo(0.5, 0);
    expect(marks[1]!.p.y).toBeCloseTo(1.5, 0);
    expect(marks[2]!.p.y).toBeGreaterThan(3 + MARKER_GAP - MARKER_BOB - 0.05);
    sim.destroy();
  });
});
