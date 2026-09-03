/**
 * The one engine-specific seam the runtime will keep. Scenarios call this interface and
 * never import an engine. Units are meters and radians, y up, gravity negative y.
 * Rendering (pixels, y down) is the scenario's job.
 */
export type AdapterId = 'box2d' | 'rapier';

export interface Vec2 {
  x: number;
  y: number;
}

export type BodyType = 'static' | 'kinematic' | 'dynamic';

export interface BodyDef {
  type?: BodyType;
  position?: Vec2;
  angle?: number;
  linearVelocity?: Vec2;
  angularVelocity?: number;
  fixedRotation?: boolean;
  /** Continuous collision for fast bodies (pinball ball, projectiles). */
  bullet?: boolean;
  linearDamping?: number;
  angularDamping?: number;
}

export interface ShapeOptions {
  density?: number;
  friction?: number;
  restitution?: number;
  /** Sensor shapes report contacts but do not collide. */
  sensor?: boolean;
  /** Emit contact events for this shape. Default true. */
  events?: boolean;
}

export type Shape =
  | { kind: 'circle'; radius: number; center?: Vec2 }
  | { kind: 'box'; halfWidth: number; halfHeight: number; center?: Vec2; angle?: number }
  | { kind: 'polygon'; vertices: Vec2[] }
  /**
   * Open or closed line of segments for terrain. Attach to a static body.
   * Solid on the LEFT of the walking direction: a ground listed left to right is solid from
   * above, and a counter-clockwise loop is solid inside. (Rapier is two-sided; Box2D is adapted.)
   */
  | { kind: 'chain'; vertices: Vec2[]; loop?: boolean };

export type BodyId = number;
export type JointId = number;

export interface MotorOptions {
  enabled: boolean;
  /** Target angular speed in rad/s. */
  speed: number;
  /** Maximum torque the motor may apply. */
  maxTorque: number;
}

export interface AngleLimits {
  lower: number;
  upper: number;
}

export interface SpringOptions {
  /** Spring frequency in Hz. */
  hertz: number;
  /** Damping ratio, 1 = critically damped. */
  dampingRatio: number;
}

interface JointBase {
  bodyA: BodyId;
  bodyB: BodyId;
  /** Anchor in body A's local frame. */
  anchorA: Vec2;
  /** Anchor in body B's local frame. */
  anchorB: Vec2;
  /**
   * World distance between the two anchor points above which the joint is destroyed.
   * Measured after every step by the interface layer, so it behaves the same on every engine.
   */
  breakDistance?: number;
}

export type JointDef =
  | ({ kind: 'revolute'; motor?: MotorOptions; limits?: AngleLimits } & JointBase)
  /** A wheel is a revolute joint with a motor. Suspension is not in v1. */
  | ({ kind: 'wheel'; motor?: MotorOptions } & JointBase)
  /**
   * Keeps the anchors at `length` apart. With `spring` it stretches like a spring.
   * Without `spring` it is rigid on Box2D and a stiff spring on Rapier (parity gap, documented).
   */
  | ({ kind: 'distance'; length: number; spring?: SpringOptions } & JointBase)
  | ({ kind: 'weld' } & JointBase);

export interface ContactEvent {
  bodyA: BodyId;
  bodyB: BodyId;
  /** true when the shapes started touching, false when they stopped. */
  began: boolean;
}

export interface RayHit {
  body: BodyId;
  point: Vec2;
  /** 0..1 along the translation vector. */
  fraction: number;
}

export interface Transform {
  position: Vec2;
  angle: number;
}

export interface StepResult {
  contacts: ContactEvent[];
  /** Joints destroyed this step because their anchors exceeded breakDistance. */
  broken: JointId[];
}

export interface PhysicsWorld {
  readonly adapter: AdapterId;
  setGravity(gravity: Vec2): void;

  createBody(def?: BodyDef): BodyId;
  addShape(body: BodyId, shape: Shape, options?: ShapeOptions): void;
  destroyBody(body: BodyId): void;

  createJoint(def: JointDef): JointId;
  destroyJoint(joint: JointId): void;
  setMotor(joint: JointId, speed: number, maxTorque: number): void;

  getTransform(body: BodyId): Transform;
  getLinearVelocity(body: BodyId): Vec2;
  setLinearVelocity(body: BodyId, velocity: Vec2): void;
  getAngularVelocity(body: BodyId): number;
  getMass(body: BodyId): number;
  applyForce(body: BodyId, force: Vec2): void;
  applyImpulse(body: BodyId, impulse: Vec2): void;
  /** Local point on a body to world coordinates. */
  worldPoint(body: BodyId, local: Vec2): Vec2;

  /** Advance by dt seconds using subSteps fixed sub-steps. Never pass a wall-clock delta. */
  step(dt: number, subSteps: number): StepResult;

  /** Closest hit along the translation. Reflects the world after the last step(). */
  castRay(origin: Vec2, translation: Vec2): RayHit | null;

  /** Live bodies in creation order. */
  bodies(): BodyId[];
  jointCount(): number;

  /** FNV-1a hash of every live body's position and angle, quantized to 4 decimals. */
  hash(): string;

  destroy(): void;
}

export interface WorldOptions {
  gravity?: Vec2;
}

/** The fixed step every scenario uses. 1/60 s with 4 sub-steps. */
export const FIXED_DT = 1 / 60;
export const FIXED_SUBSTEPS = 4;
