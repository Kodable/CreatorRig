/**
 * Minimal typings for the parts of Phaser Box2D the adapter uses. The package ships no types.
 * Ids are opaque objects; defs are plain objects with the fields listed in src/include/types_h.js.
 */
declare module 'phaser-box2d/dist/PhaserBox2D.js' {
  export class b2Vec2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }
  export class b2Rot {
    c: number;
    s: number;
  }
  export class b2Circle {
    constructor(center?: b2Vec2 | null, radius?: number);
    center: b2Vec2;
    radius: number;
  }
  export const b2BodyType: { b2_staticBody: number; b2_kinematicBody: number; b2_dynamicBody: number };

  export type Opaque = { readonly __opaque: unique symbol } | object;
  export type AnyDef = Record<string, unknown> & { [key: string]: any };

  export function b2CreateWorldArray(): void;
  export function b2DefaultWorldDef(): AnyDef;
  export function b2CreateWorld(def: AnyDef): Opaque;
  export function b2DestroyWorld(worldId: Opaque): void;
  export function b2World_Step(worldId: Opaque, timeStep: number, subStepCount: number): void;
  export function b2World_SetGravity(worldId: Opaque, gravity: b2Vec2): void;
  export function b2World_EnableContinuous(worldId: Opaque, flag: boolean): void;
  export function b2World_GetContactEvents(worldId: Opaque): {
    beginEvents: Array<{ shapeIdA: Opaque; shapeIdB: Opaque }>;
    beginCount: number;
    endEvents: Array<{ shapeIdA: Opaque; shapeIdB: Opaque }>;
    endCount: number;
  };
  export function b2World_CastRayClosest(
    worldId: Opaque,
    origin: b2Vec2,
    translation: b2Vec2,
    filter: AnyDef,
  ): { shapeId: Opaque | null; point: b2Vec2; normal: b2Vec2; fraction: number; hit: boolean };
  export function b2DefaultQueryFilter(): AnyDef;
  export function b2World_CastRay(
    worldId: Opaque,
    origin: b2Vec2,
    translation: b2Vec2,
    filter: AnyDef,
    fcn: (shapeId: Opaque, point: b2Vec2, normal: b2Vec2, fraction: number, context: unknown) => number,
    context: unknown,
  ): void;

  export function b2DefaultBodyDef(): AnyDef;
  export function b2CreateBody(worldId: Opaque, def: AnyDef): Opaque;
  export function b2DestroyBody(bodyId: Opaque): void;
  export function b2Body_GetPosition(bodyId: Opaque): b2Vec2;
  export function b2Body_GetRotation(bodyId: Opaque): b2Rot;
  export function b2Body_GetLinearVelocity(bodyId: Opaque): b2Vec2;
  export function b2Body_SetLinearVelocity(bodyId: Opaque, v: b2Vec2): void;
  export function b2Body_GetAngularVelocity(bodyId: Opaque): number;
  export function b2Body_GetMass(bodyId: Opaque): number;
  export function b2Body_ApplyForceToCenter(bodyId: Opaque, force: b2Vec2, wake: boolean): void;
  export function b2Body_ApplyLinearImpulseToCenter(bodyId: Opaque, impulse: b2Vec2, wake: boolean): void;
  export function b2Body_GetWorldPoint(bodyId: Opaque, localPoint: b2Vec2): b2Vec2;
  export function b2Body_SetUserData(bodyId: Opaque, data: unknown): void;
  export function b2Body_GetUserData(bodyId: Opaque): unknown;
  export function b2MakeRot(angle: number): b2Rot;
  export function b2Rot_GetAngle(rot: b2Rot): number;

  export function b2DefaultShapeDef(): AnyDef;
  export function b2CreateCircleShape(bodyId: Opaque, def: AnyDef, circle: b2Circle): Opaque;
  export function b2CreatePolygonShape(bodyId: Opaque, def: AnyDef, polygon: unknown): Opaque;
  export function b2MakeBox(hx: number, hy: number): unknown;
  export function b2MakeOffsetBox(hx: number, hy: number, center: b2Vec2, angle?: number): unknown;
  export function b2ComputeHull(points: b2Vec2[], count: number): unknown;
  export function b2MakePolygon(hull: unknown, radius: number): unknown;
  export function b2DefaultChainDef(): AnyDef;
  export function b2CreateChain(bodyId: Opaque, def: AnyDef): Opaque;
  export function b2Shape_GetBody(shapeId: Opaque): Opaque;

  export function b2DefaultRevoluteJointDef(): AnyDef;
  export function b2CreateRevoluteJoint(worldId: Opaque, def: AnyDef): Opaque;
  export function b2DefaultWheelJointDef(): AnyDef;
  export function b2CreateWheelJoint(worldId: Opaque, def: AnyDef): Opaque;
  export function b2DefaultDistanceJointDef(): AnyDef;
  export function b2CreateDistanceJoint(worldId: Opaque, def: AnyDef): Opaque;
  export function b2DefaultWeldJointDef(): AnyDef;
  export function b2CreateWeldJoint(worldId: Opaque, def: AnyDef): Opaque;
  export function b2DestroyJoint(jointId: Opaque): void;
  export function b2RevoluteJoint_EnableMotor(jointId: Opaque, enable: boolean): void;
  export function b2RevoluteJoint_SetMotorSpeed(jointId: Opaque, speed: number): void;
  export function b2RevoluteJoint_SetMaxMotorTorque(jointId: Opaque, torque: number): void;
}
