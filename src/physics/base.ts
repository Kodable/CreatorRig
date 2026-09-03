import { hashTransforms } from './hash';
import type {
  AdapterId,
  BodyId,
  ContactEvent,
  JointDef,
  JointId,
  PhysicsWorld,
  StepResult,
  Transform,
  Vec2,
} from './types';

interface Breakable {
  joint: JointId;
  bodyA: BodyId;
  bodyB: BodyId;
  anchorA: Vec2;
  anchorB: Vec2;
  breakDistance: number;
}

/**
 * Engine-agnostic parts shared by every adapter: id bookkeeping in creation order,
 * breakable-joint checks after each step, and the transform hash.
 */
export abstract class BaseWorld implements PhysicsWorld {
  abstract readonly adapter: AdapterId;
  protected nextBodyId = 1;
  protected nextJointId = 1;
  protected liveBodies: BodyId[] = [];
  protected liveJoints = new Set<JointId>();
  private breakables: Breakable[] = [];

  protected allocBody(): BodyId {
    const id = this.nextBodyId++;
    this.liveBodies.push(id);
    return id;
  }

  protected allocJoint(def: JointDef): JointId {
    const id = this.nextJointId++;
    this.liveJoints.add(id);
    if (def.breakDistance !== undefined) {
      this.breakables.push({
        joint: id,
        bodyA: def.bodyA,
        bodyB: def.bodyB,
        anchorA: def.anchorA,
        anchorB: def.anchorB,
        breakDistance: def.breakDistance,
      });
    }
    return id;
  }

  protected forgetBody(id: BodyId): void {
    const i = this.liveBodies.indexOf(id);
    if (i >= 0) this.liveBodies.splice(i, 1);
    // Engines destroy joints attached to a destroyed body; mirror that here.
    for (const b of [...this.breakables]) {
      if (b.bodyA === id || b.bodyB === id) this.forgetJoint(b.joint);
    }
  }

  protected forgetJoint(id: JointId): void {
    this.liveJoints.delete(id);
    this.breakables = this.breakables.filter((b) => b.joint !== id);
  }

  /** Adapters call this after stepping to turn strain into destroyed joints. */
  protected checkBreakables(): JointId[] {
    const broken: JointId[] = [];
    for (const b of [...this.breakables]) {
      const pa = this.worldPoint(b.bodyA, b.anchorA);
      const pb = this.worldPoint(b.bodyB, b.anchorB);
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      if (Math.sqrt(dx * dx + dy * dy) > b.breakDistance) {
        this.destroyJoint(b.joint);
        broken.push(b.joint);
      }
    }
    return broken;
  }

  bodies(): BodyId[] {
    return [...this.liveBodies];
  }

  jointCount(): number {
    return this.liveJoints.size;
  }

  hash(): string {
    const self = this;
    return hashTransforms({
      *[Symbol.iterator](): Iterator<Transform> {
        for (const id of self.liveBodies) yield self.getTransform(id);
      },
    });
  }

  step(dt: number, subSteps: number): StepResult {
    const contacts = this.stepEngine(dt, subSteps);
    const broken = this.checkBreakables();
    return { contacts, broken };
  }

  /** Engine step; returns the contact events collected during it. */
  protected abstract stepEngine(dt: number, subSteps: number): ContactEvent[];

  abstract setGravity(gravity: Vec2): void;
  abstract createBody(def?: import('./types').BodyDef): BodyId;
  abstract addShape(body: BodyId, shape: import('./types').Shape, options?: import('./types').ShapeOptions): void;
  abstract destroyBody(body: BodyId): void;
  abstract createJoint(def: JointDef): JointId;
  abstract destroyJoint(joint: JointId): void;
  abstract setMotor(joint: JointId, speed: number, maxTorque: number): void;
  abstract getTransform(body: BodyId): Transform;
  abstract getLinearVelocity(body: BodyId): Vec2;
  abstract setLinearVelocity(body: BodyId, velocity: Vec2): void;
  abstract getAngularVelocity(body: BodyId): number;
  abstract getMass(body: BodyId): number;
  abstract applyForce(body: BodyId, force: Vec2): void;
  abstract applyImpulse(body: BodyId, impulse: Vec2): void;
  abstract worldPoint(body: BodyId, local: Vec2): Vec2;
  abstract castRay(origin: Vec2, translation: Vec2): import('./types').RayHit | null;
  abstract destroy(): void;
}

/** Reduced mass of two bodies; a static body (mass 0) leaves the other body's mass. */
export function reducedMass(massA: number, massB: number): number {
  if (massA <= 0) return massB;
  if (massB <= 0) return massA;
  return (massA * massB) / (massA + massB);
}

/** Box2D-style spring (hertz, damping ratio) to stiffness and damping coefficients. */
export function springCoefficients(hertz: number, dampingRatio: number, mass: number): { stiffness: number; damping: number } {
  const omega = 2 * Math.PI * hertz;
  const stiffness = mass * omega * omega;
  const damping = 2 * mass * dampingRatio * omega;
  return { stiffness, damping };
}
