import { describe, expect, it } from 'vitest';
import { MATERIALS } from './catalog';
import { applyTest, type TestCtx } from './tests';
import { buildGlue, checkGlueSpeed, markBroken } from './glue';
import type { PartHandle, TestSpec } from './types';
import { createWorld, FIXED_DT, FIXED_SUBSTEPS } from '../../../physics';
import type { BodyId, PhysicsWorld, Transform } from '../../../physics/types';

/** Two 1x1 boxes stacked and touching, glued. `groundType` lets the shake test use a kinematic
 * ground (the real course's ground) while the kick tests use a plain static one. */
function stackedBlocks(world: PhysicsWorld, material: 'wood' | 'brick' | 'steel', groundType: 'static' | 'kinematic' = 'static') {
  const spec = MATERIALS[material];

  const ground = world.createBody({ type: groundType, position: { x: 0, y: -0.5 } });
  world.addShape(ground, { kind: 'box', halfWidth: 10, halfHeight: 0.5 }, { friction: 0.8 });

  const lower = world.createBody({ type: 'dynamic', position: { x: 0, y: 0.5 } });
  world.addShape(lower, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 }, { density: spec.density, friction: spec.friction });

  const upper = world.createBody({ type: 'dynamic', position: { x: 0, y: 1.5 } });
  world.addShape(upper, { kind: 'box', halfWidth: 0.5, halfHeight: 0.5 }, { density: spec.density, friction: spec.friction });

  const handles: PartHandle[] = [
    {
      partId: 1,
      kind: 'block',
      bodies: [{ id: lower, role: 'block' }],
      joints: [],
      visuals: [{ partId: 1, body: lower, shape: { kind: 'box', w: 1, h: 1 }, color: spec.color, role: 'block', locked: false, lockPosition: false }],
      bounds: { x: 0, y: 0.5, w: 1, h: 1 },
    },
    {
      partId: 2,
      kind: 'block',
      bodies: [{ id: upper, role: 'block' }],
      joints: [],
      visuals: [{ partId: 2, body: upper, shape: { kind: 'box', w: 1, h: 1 }, color: spec.color, role: 'block', locked: false, lockPosition: false }],
      bounds: { x: 0, y: 1.5, w: 1, h: 1 },
    },
  ];

  const transforms = new Map<BodyId, Transform>([
    [lower, { position: { x: 0, y: 0.5 }, angle: 0 }],
    [upper, { position: { x: 0, y: 1.5 }, angle: 0 }],
  ]);

  const links = buildGlue(world, handles, () => material, transforms);
  return { ground, lower, upper, links };
}

/** Mirrors sim.ts's step() order: the primary relative-speed check runs right after the test
 * applies its velocity/impulse change and BEFORE world.step() (see glue.ts's checkGlueSpeed
 * docstring for why); markBroken from StepResult.broken is the (rarely-firing) distance fallback. */
function tick(world: PhysicsWorld, links: ReturnType<typeof buildGlue>): void {
  checkGlueSpeed(world, links);
  const result = world.step(FIXED_DT, FIXED_SUBSTEPS);
  markBroken(links, result.broken);
}

describe('glue (relative-speed break rule)', () => {
  it('creates one link with two joints; breakSpeed is the weaker material, breakDistance is the large fallback', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const { links } = stackedBlocks(world, 'wood');
    expect(links.length).toBe(1);
    expect(links[0]!.joints.length).toBe(2);
    expect(links[0]!.breakSpeed).toBe(MATERIALS.wood.breakSpeed);
    expect(links[0]!.breakDistance).toBeGreaterThanOrEqual(0.3);
    world.destroy();
  });

  it('a 4 m/s kick snaps both wood rods within 30 ticks', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const { upper, links } = stackedBlocks(world, 'wood');
    for (let i = 0; i < 120; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);

    world.setLinearVelocity(upper, { x: 4, y: 0 });
    for (let i = 0; i < 30 && !links[0]!.broken; i++) tick(world, links);

    expect(links[0]!.broken).toBe(true);
    world.destroy();
  });

  it('the same 4 m/s kick does not break a glued steel stack', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const { upper, links } = stackedBlocks(world, 'steel');
    for (let i = 0; i < 120; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);

    world.setLinearVelocity(upper, { x: 4, y: 0 });
    for (let i = 0; i < 30; i++) tick(world, links);

    expect(links[0]!.broken).toBe(false);
    world.destroy();
  });

  it('a wood-on-wood glue link never breaks under a gentle shake (8 s)', async () => {
    const world = await createWorld({ gravity: { x: 0, y: -10 } });
    const { ground, links } = stackedBlocks(world, 'wood', 'kinematic');
    for (let i = 0; i < 120; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);

    const test: TestSpec = { kind: 'shake', duration: 8, amplitude: 0.12, frequency: 1 };
    const ctx: TestCtx = { elapsed: 0, ground, bodies: [], blastDone: false };
    const ticks = Math.round(8 / FIXED_DT);
    for (let i = 0; i < ticks; i++) {
      ctx.elapsed = i * FIXED_DT;
      applyTest(world, test, ctx);
      tick(world, links);
    }

    expect(links[0]!.broken).toBe(false);
    world.destroy();
  });

  // DEVIATION, measured (see sim.ts / glue.ts for the full note): checking relative speed AFTER
  // world.step (as first specified) doesn't work — the two hertz-12/dampingRatio-1 spring joints
  // absorb ~94% of any instantaneous relative velocity within that same step (a 4 m/s kick reads
  // back at ~0.23 m/s one step later, never climbing past ~0.09 m/s over the following 29 ticks —
  // far short of any of the 3-9 m/s thresholds). Checking right after the kick/impulse and before
  // world.step reads the true imparted speed instead (confirmed: a manual 4 m/s kick and an
  // applyImpulse of the same magnitude both read back as exactly 4 m/s pre-step).
  it('checking relative speed after world.step (as originally specified) never detects a kick — checking before it does', async () => {
    async function relSpeedRightAfterKick(checkAfterStep: boolean): Promise<boolean> {
      const world = await createWorld({ gravity: { x: 0, y: -10 } });
      const { upper, links } = stackedBlocks(world, 'wood');
      for (let i = 0; i < 120; i++) world.step(FIXED_DT, FIXED_SUBSTEPS);
      world.setLinearVelocity(upper, { x: 4, y: 0 });
      if (!checkAfterStep) checkGlueSpeed(world, links);
      world.step(FIXED_DT, FIXED_SUBSTEPS);
      if (checkAfterStep) checkGlueSpeed(world, links);
      world.destroy();
      return links[0]!.broken;
    }

    expect(await relSpeedRightAfterKick(true)).toBe(false); // after world.step: misses it
    expect(await relSpeedRightAfterKick(false)).toBe(true); // before world.step: catches it
  });
});
