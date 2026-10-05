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
// - Measured ranges @45deg with the Short arm (within ~10%): Low ~6.4 m, Medium ~11.3 m,
//   High ~16.6 m, Max ~22.8 m. Tests below assert these measured baselines.
// - Weight-vs-block sweep (Max power, 45deg, 1x2 brick block on the ground): a wide, reliable
//   window (~22.0-22.75 m out) where the Metal fuzz (old Heavy) topples it and Flower/Fur (old
//   Light/Medium) do not (they never topple it at any of the offsets swept). offset 22.4 sits
//   mid-window.
// - Collapse payoff + the split (huddle 2026-09-22; the Donut splits since 2026-10-01): the topple
//   scenes below reuse the `line` level's geometry (a 1-wide stack of three 1x1 wood blocks + a
//   2x1 plank, 12 m out from a catapult at x 5; Metal/High/30/Short brings it all down in one
//   shot). Split velocities are read through
//   `sim['world']` (TypeScript allows bracket access to a private member): the public snapshot
//   carries positions only, and the split rule is about velocities.
import { describe, expect, it } from 'vitest';
import { armAngleFor, bandSegments, catapultRelease, crossbarPoseFor, fireSpot, stringAnchor, FUZZ_PART_ID, REST_ANGLE, STRING_HOOK_H } from './build';
import { FUZZ, FUZZ_NAMES, SPLIT_ANGLE_DEG, SPLIT_OFFSET } from './catalog';
import { createCatapultSim, CRASH_SIZE, DUST_SIZE, IMPACT_PART_ID } from './sim';
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

describe('CatapultSim: a heavier fuzz vs a standing brick block', () => {
  it('at Max power/45deg, ~22.4 m out, the Flower and Fur fuzzes do not knock a brick 1x2 block; Metal does', async () => {
    async function tryFuzz(fuzz: string): Promise<boolean> {
      const cp = catapult({ fuzz, power: 'Max' });
      const { tip } = catapultRelease(cp);
      // Empirically-found offset (see the deviation note): Max power gives a wide, reliable
      // topple window for brick + Metal here.
      const x = tip.x + 22.4;
      const block: PlacedPart = { id: id(), kind: 'block', x, y: 1, props: { size: '1x2', material: 'brick' } };
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
    expect(await tryFuzz('Metal')).toBe(true);
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
    expect(armKeys()).toEqual(['real-arm-Short', 'real-gear', 'real-cup']);
    sim.play();
    for (let i = 0; i < 60; i++) {
      sim.step();
      expect(sim.renderItems().some((it) => it.role === 'fuzzGear' || it.textureKey?.startsWith('gear-'))).toBe(false);
    }
    expect(armKeys()).toEqual(['real-arm-Short', 'real-gear', 'real-cup']);
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

  it('shows a live "range" label once the fuzz is released, while running', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);
    sim.play();
    let sawRangeLabel = false;
    for (let i = 0; i < 60; i++) {
      sim.step();
      const overlay = sim.snapshot().overlay;
      if (overlay?.some((o) => o.kind === 'label' && o.id === 'range')) {
        sawRangeLabel = true;
        break;
      }
    }
    expect(sawRangeLabel).toBe(true);
    sim.destroy();
  });

  it('never emits the old dotted trajectory preview by default (showPreview unset)', async () => {
    const cp = catapult();
    const level = makeLevel([cp], 3);
    const sim = await createCatapultSim([cp], level);
    expect(sim.snapshot().overlay?.some((o) => o.kind === 'dot')).toBe(false);
    sim.play();
    for (let i = 0; i < 60; i++) {
      sim.step();
      expect(sim.snapshot().overlay?.some((o) => o.kind === 'dot')).toBe(false);
    }
    sim.destroy();
  });

  it('emits the dotted preview when the level opts in via showPreview', async () => {
    const cp = catapult();
    const level = { ...makeLevel([cp], 3), showPreview: true };
    const sim = await createCatapultSim([cp], level);
    const overlay = sim.snapshot().overlay;
    expect(overlay?.some((o) => o.kind === 'dot')).toBe(true);
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
const TOPPLE = { power: 'High', angle: '30', fuzz: 'Metal', arm: 'Short' };

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
      const cp = catapult({ fuzz, power: 'High', angle: '30' });
      // The `donut` level's near can: on the lower child's path, under the original's.
      const parts: PlacedPart[] = [
        cp,
        { id: id(), kind: 'shelf', x: 17.8, y: 0.5, props: { length: '2' } },
        { id: id(), kind: 'can', x: 17.8, y: 1, props: { color: 'Red' } },
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
