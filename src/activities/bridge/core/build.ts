// Turns a PlacedPart into Rapier bodies/shapes plus the RenderItems the scene draws.
import { MATERIALS } from './catalog';
import type { BodyId, Bounds, BridgeLevel, JointId, Material, PartHandle, PlacedPart, RenderItem, RodHandle } from './types';
import type { PhysicsWorld } from '../../../physics/types';

export const WORLD_W = 30;
export const WORLD_H = 15;

/** partId used for the banks' synthetic RenderItems (no placed part owns them). */
export const BANK_PART_ID = -1;

const BANK_COLOR = 0x5a3d1e;
const ANCHOR_COLOR = 0x3a4470;
const JOINT_COLOR = 0xffb40f;
const DECK_COLOR = 0x8a6a3a;

/** Nodes (anchors and joints) touch nothing physically: the rods and the deck chain hold them
 * together, and letting a node collide with a deck it is jointed to would fight the joint. */
const NODE_FILTER = { group: 0x4, mask: 0 };
/** A road deck collides with the buggy (0x2) and the banks (0x1), never with nodes/sliders (0x4)
 * or another deck. */
const DECK_FILTER = { group: 0x4, mask: 0xfffb };
const SLIDER_FILTER = { group: 0x4, mask: 0 };

const NODE_R = 0.15;
const JOINT_VISUAL_R = 0.22;
const DECK_H = 0.25;
/** How much shorter than the rod's rest length the deck box is (0.15 m clearance at each end for
 * the revolute/prismatic hinge points). */
const DECK_SHRINK = 0.3;
const SLIDER_R = 0.05;

function boxBounds(x: number, y: number, w: number, h: number): Bounds {
  return { x, y, w, h };
}

// ---- banks --------------------------------------------------------------------------------

export interface Banks {
  leftBody: BodyId;
  rightBody: BodyId;
  items: RenderItem[];
}

/** Two static slabs (default filter: group 0x1, mask everything): x 0..leftX and rightX..30,
 * from y 0 to `banks.y` (top at banks.y, where anchors and the buggy sit). The water itself is
 * drawn by the sim as an overlay band, not a body. */
export function buildBanks(world: PhysicsWorld, level: BridgeLevel): Banks {
  const { leftX, rightX, y } = level.banks;

  const leftW = leftX;
  const leftBody = world.createBody({ type: 'static', position: { x: leftX / 2, y: y / 2 } });
  world.addShape(leftBody, { kind: 'box', halfWidth: leftW / 2, halfHeight: y / 2 }, { friction: 0.8 });

  const rightW = WORLD_W - rightX;
  const rightBody = world.createBody({ type: 'static', position: { x: rightX + rightW / 2, y: y / 2 } });
  world.addShape(rightBody, { kind: 'box', halfWidth: rightW / 2, halfHeight: y / 2 }, { friction: 0.8 });

  const items: RenderItem[] = [
    {
      partId: BANK_PART_ID,
      body: leftBody,
      shape: { kind: 'box', w: leftW, h: y },
      color: BANK_COLOR,
      role: 'bank',
      locked: true,
      lockPosition: true,
    },
    {
      partId: BANK_PART_ID,
      body: rightBody,
      shape: { kind: 'box', w: rightW, h: y },
      color: BANK_COLOR,
      role: 'bank',
      locked: true,
      lockPosition: true,
    },
  ];

  return { leftBody, rightBody, items };
}

// ---- nodes (anchors and joints) ------------------------------------------------------------

/** anchor = static circle (level-placed, `locked`/`lockPosition`); joint = dynamic circle
 * (density 3, ~0.21 kg, `canSleep: false`, child-placed). Both are filtered to touch nothing. */
export function buildNode(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const isAnchor = part.kind === 'anchor';
  const body = world.createBody({
    type: isAnchor ? 'static' : 'dynamic',
    position: { x: part.x, y: part.y },
    canSleep: isAnchor ? undefined : false,
  });
  world.addShape(
    body,
    { kind: 'circle', radius: NODE_R },
    isAnchor ? { friction: 0.8, filter: NODE_FILTER } : { density: 3, filter: NODE_FILTER },
  );

  const role = isAnchor ? 'anchor' : 'joint';
  const color = isAnchor ? ANCHOR_COLOR : JOINT_COLOR;
  const visualR = isAnchor ? NODE_R : JOINT_VISUAL_R;

  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id: body, role }],
    joints: [],
    visuals: [
      {
        partId: part.id,
        body,
        shape: { kind: 'circle', r: visualR },
        color,
        role,
        locked: !!part.locked,
        lockPosition: !!part.lockPosition,
      },
    ],
    bounds: boxBounds(part.x, part.y, NODE_R * 2, NODE_R * 2),
  };
}

// ---- rods -----------------------------------------------------------------------------------

export interface NodeRef {
  body: BodyId;
  static: boolean;
}

/** A `distance` spring joint between the two node bodies (rest length = distance at build time,
 * `spring { hertz: 1, dampingRatio: 1, stiffness: K1 / length }`, no `breakDistance`: the sim
 * checks strain itself every tick, symmetric for tension and compression). Skipped (no spring,
 * `joint: null`) when both nodes are static anchors - a spring between two immovable points does
 * nothing but waste a solver constraint, and the deck's own revolute/prismatic/revolute chain
 * already pins the span rigidly enough between two fixed points.
 *
 * Road rods additionally add a deck: a dynamic box (length - 0.3) x 0.25 at the rod's midpoint
 * and angle, shape centered at local (0, -0.125) so the deck TOP lies on the node line (flush
 * with the bank tops); hinged to node A by a revolute at the deck's left end, and to node B via a
 * small slider body (a prismatic from the deck's right end to the slider, then a revolute from
 * the slider to node B) so the deck's own rotation is never locked. */
export function buildRod(world: PhysicsWorld, rod: PlacedPart, nodes: Map<number, NodeRef>): RodHandle {
  const material = (rod.props.material as Material) ?? 'wood';
  const spec = MATERIALS[material] ?? MATERIALS.wood;
  const fromId = Number(rod.props.from);
  const toId = Number(rod.props.to);
  const nodeA = nodes.get(fromId);
  const nodeB = nodes.get(toId);
  if (!nodeA || !nodeB) throw new Error(`bridge: rod ${rod.id} references a missing node`);

  const pa = world.getTransform(nodeA.body).position;
  const pb = world.getTransform(nodeB.body).position;
  const length = Math.hypot(pb.x - pa.x, pb.y - pa.y);

  let joint: JointId | null = null;
  if (!(nodeA.static && nodeB.static)) {
    joint = world.createJoint({
      kind: 'distance',
      bodyA: nodeA.body,
      bodyB: nodeB.body,
      anchorA: { x: 0, y: 0 },
      anchorB: { x: 0, y: 0 },
      length,
      spring: { hertz: 1, dampingRatio: 1, stiffness: spec.k1 / length },
    });
  }

  const bodies: BodyId[] = [];
  const visuals: RenderItem[] = [];
  const midx = (pa.x + pb.x) / 2;
  const midy = (pa.y + pb.y) / 2;
  const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);

  if (material === 'road') {
    const deckLen = length - DECK_SHRINK;
    const halfLen = deckLen / 2;
    // The joints anchor at the FULL half-span (not halfLen, the box's own shorter half-width):
    // that puts each hinge exactly at its node's own position at build time (zero initial
    // constraint violation - a quiet build), 0.15 m beyond the visibly-drawn plank's own edge.
    const halfSpan = length / 2;

    const deck = world.createBody({ type: 'dynamic', position: { x: midx, y: midy }, angle, canSleep: false });
    world.addShape(
      deck,
      { kind: 'box', halfWidth: halfLen, halfHeight: DECK_H / 2, center: { x: 0, y: -DECK_H / 2 } },
      { density: 0.5, friction: 0.8, filter: DECK_FILTER },
    );
    bodies.push(deck);
    visuals.push({
      partId: rod.id,
      body: deck,
      shape: { kind: 'box', w: deckLen, h: DECK_H, cx: 0, cy: -DECK_H / 2 },
      color: DECK_COLOR,
      role: 'deck',
      locked: !!rod.locked,
      lockPosition: true,
      alpha: 0.9,
    });

    // Revolute: deck's left end <-> node A, anchored at the FULL half-span so it sits exactly at
    // node A's own position (zero initial constraint violation).
    world.createJoint({
      kind: 'revolute',
      bodyA: deck,
      bodyB: nodeA.body,
      anchorA: { x: -halfSpan, y: 0 },
      anchorB: { x: 0, y: 0 },
    });

    // Slider at node B's position: a tiny dense body a prismatic can slide against without
    // locking the deck's rotation (a prismatic straight to node B would turn the bridge rigid).
    const slider = world.createBody({ type: 'dynamic', position: { x: pb.x, y: pb.y }, canSleep: false });
    world.addShape(slider, { kind: 'circle', radius: SLIDER_R }, { density: 13, filter: SLIDER_FILTER });
    bodies.push(slider);

    world.createJoint({
      kind: 'prismatic',
      bodyA: deck,
      bodyB: slider,
      anchorA: { x: halfSpan, y: 0 },
      anchorB: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      limits: { lower: -0.4, upper: 0.4 },
    });

    world.createJoint({
      kind: 'revolute',
      bodyA: slider,
      bodyB: nodeB.body,
      anchorA: { x: 0, y: 0 },
      anchorB: { x: 0, y: 0 },
    });
  }

  const margin = NODE_R;
  const bounds = boxBounds(
    (Math.min(pa.x, pb.x) + Math.max(pa.x, pb.x)) / 2,
    (Math.min(pa.y, pb.y) + Math.max(pa.y, pb.y)) / 2,
    Math.abs(pb.x - pa.x) + margin * 2,
    Math.abs(pb.y - pa.y) + margin * 2,
  );

  const handle: PartHandle = {
    partId: rod.id,
    kind: rod.kind,
    bodies: bodies.map((id, i) => ({ id, role: i === 0 ? 'deck' : 'slider' })),
    joints: joint !== null ? [joint] : [],
    visuals,
    bounds,
    hitSegment: { a: pa, b: pb, r: NODE_R },
  };

  return { part: rod, joint, bodies, restLength: length, material, nodeA: nodeA.body, nodeB: nodeB.body, handle };
}
