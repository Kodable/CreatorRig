import * as RAPIER from '@dimforge/rapier2d-deterministic-compat';
import { BaseWorld, reducedMass, springCoefficients } from './base';
import type {
  AdapterId,
  BodyDef,
  BodyId,
  ContactEvent,
  JointDef,
  JointId,
  RayHit,
  Shape,
  ShapeOptions,
  Transform,
  Vec2,
  WorldOptions,
} from './types';

let ready: Promise<void> | null = null;

/** The compat build inlines the wasm; init once per page. */
export function initRapier(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

/**
 * Adapter B: Rapier 2D, the deterministic wasm build. Same arithmetic on every browser
 * and processor, at the cost of a larger payload and a different feel from Box2D.
 */
export class RapierWorld extends BaseWorld {
  readonly adapter: AdapterId = 'rapier';
  private world: RAPIER.World;
  private events: RAPIER.EventQueue;
  private bodyById = new Map<BodyId, RAPIER.RigidBody>();
  private idByBodyHandle = new Map<number, BodyId>();
  private idByColliderHandle = new Map<number, BodyId>();
  private jointById = new Map<JointId, RAPIER.ImpulseJoint>();
  private jointKinds = new Map<JointId, JointDef['kind']>();

  constructor(options: WorldOptions = {}) {
    super();
    const g = options.gravity ?? { x: 0, y: -10 };
    this.world = new RAPIER.World({ x: g.x, y: g.y });
    this.events = new RAPIER.EventQueue(true);
  }

  setGravity(gravity: Vec2): void {
    this.world.gravity = { x: gravity.x, y: gravity.y };
  }

  createBody(def: BodyDef = {}): BodyId {
    const id = this.allocBody();
    const type = def.type ?? 'dynamic';
    const desc =
      type === 'static'
        ? RAPIER.RigidBodyDesc.fixed()
        : type === 'kinematic'
          ? RAPIER.RigidBodyDesc.kinematicVelocityBased()
          : RAPIER.RigidBodyDesc.dynamic();
    desc.setTranslation(def.position?.x ?? 0, def.position?.y ?? 0);
    desc.setRotation(def.angle ?? 0);
    desc.setLinvel(def.linearVelocity?.x ?? 0, def.linearVelocity?.y ?? 0);
    desc.setAngvel(def.angularVelocity ?? 0);
    if (def.fixedRotation) desc.lockRotations();
    desc.setCcdEnabled(def.bullet ?? false);
    desc.setLinearDamping(def.linearDamping ?? 0);
    desc.setAngularDamping(def.angularDamping ?? 0);
    desc.setUserData(id);
    const body = this.world.createRigidBody(desc);
    this.bodyById.set(id, body);
    this.idByBodyHandle.set(body.handle, id);
    return id;
  }

  addShape(body: BodyId, shape: Shape, options: ShapeOptions = {}): void {
    const rb = this.must(body);
    let desc: RAPIER.ColliderDesc | null;
    switch (shape.kind) {
      case 'circle':
        desc = RAPIER.ColliderDesc.ball(shape.radius).setTranslation(shape.center?.x ?? 0, shape.center?.y ?? 0);
        break;
      case 'box':
        desc = RAPIER.ColliderDesc.cuboid(shape.halfWidth, shape.halfHeight)
          .setTranslation(shape.center?.x ?? 0, shape.center?.y ?? 0)
          .setRotation(shape.angle ?? 0);
        break;
      case 'polygon': {
        const pts = new Float32Array(shape.vertices.length * 2);
        shape.vertices.forEach((v, i) => {
          pts[i * 2] = v.x;
          pts[i * 2 + 1] = v.y;
        });
        desc = RAPIER.ColliderDesc.convexHull(pts);
        break;
      }
      case 'chain': {
        const verts = shape.loop ? [...shape.vertices, shape.vertices[0]!] : shape.vertices;
        const pts = new Float32Array(verts.length * 2);
        verts.forEach((v, i) => {
          pts[i * 2] = v.x;
          pts[i * 2 + 1] = v.y;
        });
        desc = RAPIER.ColliderDesc.polyline(pts);
        break;
      }
    }
    if (!desc) throw new Error(`rapier: could not build ${shape.kind} shape`);
    desc.setDensity(options.density ?? 1);
    desc.setFriction(options.friction ?? 0.6);
    desc.setRestitution(options.restitution ?? 0);
    desc.setSensor(options.sensor ?? false);
    if (options.events ?? true) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(desc, rb);
    this.idByColliderHandle.set(collider.handle, body);
  }

  destroyBody(body: BodyId): void {
    const rb = this.bodyById.get(body);
    if (!rb) return;
    for (let i = 0; i < rb.numColliders(); i++) this.idByColliderHandle.delete(rb.collider(i).handle);
    // Rapier removes joints attached to the body; drop our handles for them.
    for (const [jid, j] of [...this.jointById]) {
      if (j.body1().handle === rb.handle || j.body2().handle === rb.handle) {
        this.jointById.delete(jid);
        this.jointKinds.delete(jid);
        this.forgetJoint(jid);
      }
    }
    this.world.removeRigidBody(rb);
    this.idByBodyHandle.delete(rb.handle);
    this.bodyById.delete(body);
    this.forgetBody(body);
  }

  createJoint(def: JointDef): JointId {
    const a = this.must(def.bodyA);
    const b = this.must(def.bodyB);
    const id = this.allocJoint(def);
    let data: RAPIER.JointData;
    switch (def.kind) {
      case 'revolute':
      case 'wheel': {
        data = RAPIER.JointData.revolute(def.anchorA, def.anchorB);
        if (def.kind === 'revolute' && def.limits) {
          data.limitsEnabled = true;
          data.limits = [def.limits.lower, def.limits.upper];
        }
        break;
      }
      case 'distance': {
        // Rapier has no rigid distance joint; a stiff spring stands in for it (parity gap).
        const spring = def.spring ?? { hertz: 30, dampingRatio: 1 };
        const m = reducedMass(a.mass(), b.mass());
        const { stiffness, damping } = springCoefficients(spring.hertz, spring.dampingRatio, m);
        data = RAPIER.JointData.spring(def.length, stiffness, damping, def.anchorA, def.anchorB);
        break;
      }
      case 'weld': {
        // Preserve the bodies' current relative rotation.
        const frame2 = a.rotation() - b.rotation();
        data = RAPIER.JointData.fixed(def.anchorA, 0, def.anchorB, frame2);
        break;
      }
    }
    const joint = this.world.createImpulseJoint(data, a, b, true);
    this.jointById.set(id, joint);
    this.jointKinds.set(id, def.kind);
    if ((def.kind === 'revolute' || def.kind === 'wheel') && def.motor?.enabled) {
      this.setMotor(id, def.motor.speed, def.motor.maxTorque);
    }
    return id;
  }

  destroyJoint(joint: JointId): void {
    const j = this.jointById.get(joint);
    if (!j) return;
    this.world.removeImpulseJoint(j, true);
    this.jointById.delete(joint);
    this.jointKinds.delete(joint);
    this.forgetJoint(joint);
  }

  setMotor(joint: JointId, speed: number, maxTorque: number): void {
    const j = this.jointById.get(joint);
    const kind = this.jointKinds.get(joint);
    if (!j || (kind !== 'revolute' && kind !== 'wheel')) return;
    const rev = j as RAPIER.RevoluteImpulseJoint;
    rev.configureMotorModel(RAPIER.MotorModel.ForceBased);
    rev.configureMotorVelocity(speed, 1);
    const withMax = rev as unknown as { configureMotorMaxForce?: (f: number) => void };
    if (typeof withMax.configureMotorMaxForce === 'function') withMax.configureMotorMaxForce(maxTorque);
  }

  getTransform(body: BodyId): Transform {
    const rb = this.must(body);
    const t = rb.translation();
    return { position: { x: t.x, y: t.y }, angle: rb.rotation() };
  }

  getLinearVelocity(body: BodyId): Vec2 {
    const v = this.must(body).linvel();
    return { x: v.x, y: v.y };
  }

  setLinearVelocity(body: BodyId, velocity: Vec2): void {
    this.must(body).setLinvel({ x: velocity.x, y: velocity.y }, true);
  }

  getAngularVelocity(body: BodyId): number {
    return this.must(body).angvel();
  }

  getMass(body: BodyId): number {
    return this.must(body).mass();
  }

  applyForce(body: BodyId, force: Vec2): void {
    // Rapier accumulates forces until reset; match Box2D's per-step force by resetting after the step.
    this.must(body).addForce({ x: force.x, y: force.y }, true);
    this.pendingForceBodies.add(body);
  }

  applyImpulse(body: BodyId, impulse: Vec2): void {
    this.must(body).applyImpulse({ x: impulse.x, y: impulse.y }, true);
  }

  worldPoint(body: BodyId, local: Vec2): Vec2 {
    const rb = this.must(body);
    const t = rb.translation();
    const angle = rb.rotation();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: t.x + c * local.x - s * local.y, y: t.y + s * local.x + c * local.y };
  }

  private pendingForceBodies = new Set<BodyId>();

  protected stepEngine(dt: number, subSteps: number): ContactEvent[] {
    const out: ContactEvent[] = [];
    this.world.timestep = dt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this.world.step(this.events);
      this.events.drainCollisionEvents((h1, h2, started) => {
        const a = this.idByColliderHandle.get(h1);
        const b = this.idByColliderHandle.get(h2);
        if (a !== undefined && b !== undefined) out.push({ bodyA: a, bodyB: b, began: started });
      });
    }
    for (const id of this.pendingForceBodies) this.bodyById.get(id)?.resetForces(false);
    this.pendingForceBodies.clear();
    return out;
  }

  castRay(origin: Vec2, translation: Vec2): RayHit | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y }, { x: translation.x, y: translation.y });
    const hit = this.world.castRay(ray, 1, true);
    if (!hit) return null;
    const body = this.idByColliderHandle.get(hit.collider.handle);
    if (body === undefined) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return { body, point: { x: p.x, y: p.y }, fraction: hit.timeOfImpact };
  }

  destroy(): void {
    this.events.free();
    this.world.free();
    this.bodyById.clear();
    this.idByBodyHandle.clear();
    this.idByColliderHandle.clear();
    this.jointById.clear();
  }

  private must(body: BodyId): RAPIER.RigidBody {
    const rb = this.bodyById.get(body);
    if (!rb) throw new Error(`rapier: unknown body ${body}`);
    return rb;
  }
}

export async function createRapierWorld(options?: WorldOptions): Promise<RapierWorld> {
  await initRapier();
  return new RapierWorld(options);
}
