import * as B2 from 'phaser-box2d/dist/PhaserBox2D.js';
import { BaseWorld } from './base';
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

type Opaque = B2.Opaque;

// Phaser Box2D keeps a fixed pool of worlds that must be allocated once per page.
let worldArrayReady = false;
function ensureWorldArray(): void {
  if (worldArrayReady) return;
  B2.b2CreateWorldArray();
  worldArrayReady = true;
}

/**
 * Adapter A: Phaser Box2D, the JavaScript port of Box2D v3.
 * Plain JavaScript, so its arithmetic runs on the browser's own Math functions.
 */
export class Box2DWorld extends BaseWorld {
  readonly adapter: AdapterId = 'box2d';
  private world: Opaque;
  private bodyIds = new Map<BodyId, Opaque>();
  private jointIds = new Map<JointId, Opaque>();
  private jointKinds = new Map<JointId, JointDef['kind']>();

  constructor(options: WorldOptions = {}) {
    super();
    ensureWorldArray();
    const def = B2.b2DefaultWorldDef();
    const g = options.gravity ?? { x: 0, y: -10 };
    def.gravity = new B2.b2Vec2(g.x, g.y);
    this.world = B2.b2CreateWorld(def);
  }

  setGravity(gravity: Vec2): void {
    B2.b2World_SetGravity(this.world, new B2.b2Vec2(gravity.x, gravity.y));
  }

  createBody(def: BodyDef = {}): BodyId {
    const id = this.allocBody();
    const d = B2.b2DefaultBodyDef();
    const type = def.type ?? 'dynamic';
    d.type =
      type === 'static' ? B2.b2BodyType.b2_staticBody : type === 'kinematic' ? B2.b2BodyType.b2_kinematicBody : B2.b2BodyType.b2_dynamicBody;
    d.position = new B2.b2Vec2(def.position?.x ?? 0, def.position?.y ?? 0);
    d.rotation = B2.b2MakeRot(def.angle ?? 0);
    d.linearVelocity = new B2.b2Vec2(def.linearVelocity?.x ?? 0, def.linearVelocity?.y ?? 0);
    d.angularVelocity = def.angularVelocity ?? 0;
    d.fixedRotation = def.fixedRotation ?? false;
    d.isBullet = def.bullet ?? false;
    d.linearDamping = def.linearDamping ?? 0;
    d.angularDamping = def.angularDamping ?? 0;
    d.userData = id;
    const bodyId = B2.b2CreateBody(this.world, d);
    this.bodyIds.set(id, bodyId);
    return id;
  }

  addShape(body: BodyId, shape: Shape, options: ShapeOptions = {}): void {
    const bodyId = this.must(body);
    if (shape.kind === 'chain') {
      const d = B2.b2DefaultChainDef();
      // Box2D chains are one-sided, solid to the RIGHT of the walking direction, and need at
      // least 4 points. The interface promises solid to the LEFT (a left-to-right ground is
      // solid from above), so reverse the order and subdivide short chains.
      const verts = subdivide([...shape.vertices].reverse(), 4);
      d.points = verts.map((v) => new B2.b2Vec2(v.x, v.y));
      d.count = verts.length;
      d.isLoop = shape.loop ?? false;
      d.friction = options.friction ?? 0.6;
      d.restitution = options.restitution ?? 0;
      B2.b2CreateChain(bodyId, d);
      return;
    }
    const d = B2.b2DefaultShapeDef();
    d.density = options.density ?? 1;
    d.friction = options.friction ?? 0.6;
    d.restitution = options.restitution ?? 0;
    d.isSensor = options.sensor ?? false;
    d.enableContactEvents = options.events ?? true;
    d.enableSensorEvents = options.sensor ?? false;
    switch (shape.kind) {
      case 'circle': {
        const c = new B2.b2Circle(new B2.b2Vec2(shape.center?.x ?? 0, shape.center?.y ?? 0), shape.radius);
        B2.b2CreateCircleShape(bodyId, d, c);
        break;
      }
      case 'box': {
        const poly = shape.center || shape.angle
          ? B2.b2MakeOffsetBox(shape.halfWidth, shape.halfHeight, new B2.b2Vec2(shape.center?.x ?? 0, shape.center?.y ?? 0), shape.angle ?? 0)
          : B2.b2MakeBox(shape.halfWidth, shape.halfHeight);
        B2.b2CreatePolygonShape(bodyId, d, poly);
        break;
      }
      case 'polygon': {
        const pts = shape.vertices.map((v) => new B2.b2Vec2(v.x, v.y));
        const hull = B2.b2ComputeHull(pts, pts.length);
        B2.b2CreatePolygonShape(bodyId, d, B2.b2MakePolygon(hull, 0));
        break;
      }
    }
  }

  destroyBody(body: BodyId): void {
    const bodyId = this.bodyIds.get(body);
    if (!bodyId) return;
    B2.b2DestroyBody(bodyId);
    this.bodyIds.delete(body);
    // Box2D destroys attached joints with the body; drop our handles for them.
    for (const [jid, kind] of [...this.jointKinds]) {
      void kind;
      if (!this.jointIds.has(jid)) continue;
    }
    this.forgetBody(body);
  }

  createJoint(def: JointDef): JointId {
    const a = this.must(def.bodyA);
    const b = this.must(def.bodyB);
    const id = this.allocJoint(def);
    let jointId: Opaque;
    switch (def.kind) {
      case 'revolute':
      case 'wheel': {
        const d = B2.b2DefaultRevoluteJointDef();
        d.bodyIdA = a;
        d.bodyIdB = b;
        d.localAnchorA = new B2.b2Vec2(def.anchorA.x, def.anchorA.y);
        d.localAnchorB = new B2.b2Vec2(def.anchorB.x, def.anchorB.y);
        if (def.motor) {
          d.enableMotor = def.motor.enabled;
          d.motorSpeed = def.motor.speed;
          d.maxMotorTorque = def.motor.maxTorque;
        }
        if (def.kind === 'revolute' && def.limits) {
          d.enableLimit = true;
          d.lowerAngle = def.limits.lower;
          d.upperAngle = def.limits.upper;
        }
        jointId = B2.b2CreateRevoluteJoint(this.world, d);
        break;
      }
      case 'distance': {
        const d = B2.b2DefaultDistanceJointDef();
        d.bodyIdA = a;
        d.bodyIdB = b;
        d.localAnchorA = new B2.b2Vec2(def.anchorA.x, def.anchorA.y);
        d.localAnchorB = new B2.b2Vec2(def.anchorB.x, def.anchorB.y);
        d.length = def.length;
        if (def.spring) {
          d.enableSpring = true;
          d.hertz = def.spring.hertz;
          d.dampingRatio = def.spring.dampingRatio;
        }
        jointId = B2.b2CreateDistanceJoint(this.world, d);
        break;
      }
      case 'weld': {
        const d = B2.b2DefaultWeldJointDef();
        d.bodyIdA = a;
        d.bodyIdB = b;
        d.localAnchorA = new B2.b2Vec2(def.anchorA.x, def.anchorA.y);
        d.localAnchorB = new B2.b2Vec2(def.anchorB.x, def.anchorB.y);
        d.referenceAngle = this.getTransform(def.bodyB).angle - this.getTransform(def.bodyA).angle;
        jointId = B2.b2CreateWeldJoint(this.world, d);
        break;
      }
    }
    this.jointIds.set(id, jointId);
    this.jointKinds.set(id, def.kind);
    return id;
  }

  destroyJoint(joint: JointId): void {
    const jointId = this.jointIds.get(joint);
    if (!jointId) return;
    B2.b2DestroyJoint(jointId);
    this.jointIds.delete(joint);
    this.jointKinds.delete(joint);
    this.forgetJoint(joint);
  }

  setMotor(joint: JointId, speed: number, maxTorque: number): void {
    const jointId = this.jointIds.get(joint);
    const kind = this.jointKinds.get(joint);
    if (!jointId || (kind !== 'revolute' && kind !== 'wheel')) return;
    B2.b2RevoluteJoint_EnableMotor(jointId, true);
    B2.b2RevoluteJoint_SetMotorSpeed(jointId, speed);
    B2.b2RevoluteJoint_SetMaxMotorTorque(jointId, maxTorque);
  }

  getTransform(body: BodyId): Transform {
    const bodyId = this.must(body);
    const p = B2.b2Body_GetPosition(bodyId);
    return { position: { x: p.x, y: p.y }, angle: B2.b2Rot_GetAngle(B2.b2Body_GetRotation(bodyId)) };
  }

  getLinearVelocity(body: BodyId): Vec2 {
    const v = B2.b2Body_GetLinearVelocity(this.must(body));
    return { x: v.x, y: v.y };
  }

  setLinearVelocity(body: BodyId, velocity: Vec2): void {
    B2.b2Body_SetLinearVelocity(this.must(body), new B2.b2Vec2(velocity.x, velocity.y));
  }

  getAngularVelocity(body: BodyId): number {
    return B2.b2Body_GetAngularVelocity(this.must(body));
  }

  getMass(body: BodyId): number {
    return B2.b2Body_GetMass(this.must(body));
  }

  applyForce(body: BodyId, force: Vec2): void {
    B2.b2Body_ApplyForceToCenter(this.must(body), new B2.b2Vec2(force.x, force.y), true);
  }

  applyImpulse(body: BodyId, impulse: Vec2): void {
    B2.b2Body_ApplyLinearImpulseToCenter(this.must(body), new B2.b2Vec2(impulse.x, impulse.y), true);
  }

  worldPoint(body: BodyId, local: Vec2): Vec2 {
    const p = B2.b2Body_GetWorldPoint(this.must(body), new B2.b2Vec2(local.x, local.y));
    return { x: p.x, y: p.y };
  }

  protected stepEngine(dt: number, subSteps: number): ContactEvent[] {
    B2.b2World_Step(this.world, dt, subSteps);
    const ev = B2.b2World_GetContactEvents(this.world);
    const out: ContactEvent[] = [];
    for (let i = 0; i < ev.beginCount; i++) {
      const e = ev.beginEvents[i];
      if (e) out.push({ bodyA: this.bodyOfShape(e.shapeIdA), bodyB: this.bodyOfShape(e.shapeIdB), began: true });
    }
    for (let i = 0; i < ev.endCount; i++) {
      const e = ev.endEvents[i];
      if (e) out.push({ bodyA: this.bodyOfShape(e.shapeIdA), bodyB: this.bodyOfShape(e.shapeIdB), began: false });
    }
    return out;
  }

  castRay(origin: Vec2, translation: Vec2): RayHit | null {
    // b2World_CastRayClosest in this port never sets the context filter (crashes); use the
    // general cast with a closest-hit callback that clips the ray to each hit's fraction.
    const result: { shapeId: Opaque | null; point: Vec2; fraction: number } = { shapeId: null, point: { x: 0, y: 0 }, fraction: 1 };
    B2.b2World_CastRay(
      this.world,
      new B2.b2Vec2(origin.x, origin.y),
      new B2.b2Vec2(translation.x, translation.y),
      B2.b2DefaultQueryFilter(),
      (shapeId: Opaque, point: B2.b2Vec2, _normal: B2.b2Vec2, fraction: number) => {
        result.shapeId = shapeId;
        result.point = { x: point.x, y: point.y };
        result.fraction = fraction;
        return fraction;
      },
      result,
    );
    if (!result.shapeId) return null;
    return { body: this.bodyOfShape(result.shapeId), point: result.point, fraction: result.fraction };
  }

  destroy(): void {
    B2.b2DestroyWorld(this.world);
    this.bodyIds.clear();
    this.jointIds.clear();
  }

  private bodyOfShape(shapeId: Opaque): BodyId {
    return B2.b2Body_GetUserData(B2.b2Shape_GetBody(shapeId)) as BodyId;
  }

  private must(body: BodyId): Opaque {
    const bodyId = this.bodyIds.get(body);
    if (!bodyId) throw new Error(`box2d: unknown body ${body}`);
    return bodyId;
  }
}

/** Insert midpoints until the polyline has at least `min` points. */
function subdivide(vertices: Vec2[], min: number): Vec2[] {
  let pts = vertices;
  while (pts.length < min && pts.length >= 2) {
    const next: Vec2[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      next.push(a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts;
}

export function createBox2DWorld(options?: WorldOptions): Box2DWorld {
  return new Box2DWorld(options);
}
