import type Phaser from 'phaser';
import { FIXED_DT, FIXED_SUBSTEPS, type BodyId, type PhysicsWorld, type StepResult, type Vec2 } from '../physics';
import { percentile } from '../report';

/** Kodable palette for scenario visuals. */
export const COLORS = { orange: 0xffb40f, green: 0x61bb46, blue: 0x05aeed, pink: 0xc32f96, white: 0xffffff, navy: 0x192661 };

export interface ViewOptions {
  /** Pixels per meter. */
  ppm: number;
  /** Stage pixel position of world (0, 0). */
  originX: number;
  originY: number;
}

interface Item {
  body: BodyId;
  obj: Phaser.GameObjects.Shape;
}

/**
 * Draws bodies as Phaser shapes and keeps them in sync with the physics world.
 * World is meters with y up; the stage is pixels with y down.
 */
export class PhysicsView {
  private items: Item[] = [];
  private gfx: Phaser.GameObjects.Graphics;

  constructor(
    private scene: Phaser.Scene,
    private world: PhysicsWorld,
    private opts: ViewOptions,
  ) {
    this.gfx = scene.add.graphics();
  }

  toPx(v: Vec2): { x: number; y: number } {
    return { x: this.opts.originX + v.x * this.opts.ppm, y: this.opts.originY - v.y * this.opts.ppm };
  }

  circle(body: BodyId, radius: number, color: number): void {
    this.items.push({ body, obj: this.scene.add.circle(0, 0, radius * this.opts.ppm, color) });
  }

  box(body: BodyId, halfWidth: number, halfHeight: number, color: number): void {
    this.items.push({ body, obj: this.scene.add.rectangle(0, 0, halfWidth * 2 * this.opts.ppm, halfHeight * 2 * this.opts.ppm, color) });
  }

  /** Static polyline drawn once. */
  chain(vertices: Vec2[], color = COLORS.white, loop = false): void {
    this.gfx.lineStyle(3, color, 0.85);
    this.gfx.beginPath();
    vertices.forEach((v, i) => {
      const p = this.toPx(v);
      if (i === 0) this.gfx.moveTo(p.x, p.y);
      else this.gfx.lineTo(p.x, p.y);
    });
    if (loop) this.gfx.closePath();
    this.gfx.strokePath();
  }

  /** Static box drawn once (grounds, walls). */
  staticBox(center: Vec2, halfWidth: number, halfHeight: number, color = COLORS.white): void {
    const p = this.toPx(center);
    this.gfx.fillStyle(color, 0.6);
    this.gfx.fillRect(p.x - halfWidth * this.opts.ppm, p.y - halfHeight * this.opts.ppm, halfWidth * 2 * this.opts.ppm, halfHeight * 2 * this.opts.ppm);
  }

  /** Removes every drawn object; used when a scenario rebuilds its world. */
  destroy(): void {
    for (const it of this.items) it.obj.destroy();
    this.items = [];
    this.gfx.destroy();
  }

  remove(body: BodyId): void {
    const i = this.items.findIndex((it) => it.body === body);
    if (i < 0) return;
    this.items[i]!.obj.destroy();
    this.items.splice(i, 1);
  }

  sync(): void {
    for (const it of this.items) {
      const t = this.world.getTransform(it.body);
      const p = this.toPx(t.position);
      it.obj.setPosition(p.x, p.y);
      it.obj.setRotation(-t.angle);
    }
  }
}

/**
 * Fixed-step accumulator. Physics never sees a wall-clock delta; a slow frame runs more
 * steps, capped so a stall cannot spiral. Records the physics time per frame.
 */
export class FixedStepper {
  steps = 0;
  private accumulator = 0;
  private samples: number[] = [];

  constructor(
    private world: PhysicsWorld,
    private subSteps = FIXED_SUBSTEPS,
    private maxStepsPerFrame = 5,
  ) {}

  /** Returns the number of steps taken this frame. */
  update(deltaMs: number, onStep?: (result: StepResult, step: number) => void): number {
    const t0 = performance.now();
    this.accumulator = Math.min(this.accumulator + deltaMs / 1000, FIXED_DT * this.maxStepsPerFrame);
    let n = 0;
    while (this.accumulator >= FIXED_DT) {
      const r = this.world.step(FIXED_DT, this.subSteps);
      this.accumulator -= FIXED_DT;
      this.steps++;
      n++;
      onStep?.(r, this.steps);
    }
    this.samples.push(performance.now() - t0);
    return n;
  }

  /** Physics ms per frame: the part of the frame budget the simulation used. */
  stats(): { subSteps: number; physicsMsP50: number; physicsMsP95: number; physicsMsMax: number; stepsTotal: number } {
    const sorted = [...this.samples].sort((a, b) => a - b);
    return {
      subSteps: this.subSteps,
      physicsMsP50: round2(percentile(sorted, 50)),
      physicsMsP95: round2(percentile(sorted, 95)),
      physicsMsMax: round2(sorted[sorted.length - 1] ?? 0),
      stepsTotal: this.steps,
    };
  }
}

/** ?substeps=8 overrides the fixed 4 sub-steps; Box2D joints stiffen with more sub-steps. */
export function subStepsFrom(params: { extra: Record<string, string> }): number {
  const n = Number(params.extra['substeps'] ?? FIXED_SUBSTEPS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : FIXED_SUBSTEPS;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Distance between two joint anchors in world space; 0 means the joint holds exactly. */
export function anchorGap(world: PhysicsWorld, bodyA: BodyId, anchorA: Vec2, bodyB: BodyId, anchorB: Vec2): number {
  const a = world.worldPoint(bodyA, anchorA);
  const b = world.worldPoint(bodyB, anchorB);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Parabolic bowl as a chain from (-halfWidth, depth) down to (0, 0) and back up. */
export function bowlVertices(halfWidth: number, depth: number, segments = 16): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const x = -halfWidth + (2 * halfWidth * i) / segments;
    verts.push({ x, y: (depth * x * x) / (halfWidth * halfWidth) });
  }
  return verts;
}
