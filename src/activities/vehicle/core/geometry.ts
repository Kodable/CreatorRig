// Where every attachment sits on the dome, what its colliders and pictures are, and the
// `normalizeParts` rule that snaps the child's parts onto the rim. Pure math: no physics world,
// no Phaser. build.ts turns an AttachmentGeometry into bodies and joints; the spec and the tests
// use the same functions, so the editor, the build and the tests agree on every number.
//
// Frames. "Rover-local": the dome's centre at the origin, the dome at angle 0 (as it is built).
// An attachment at rim angle theta (radians, CCW, 0 = the front, +x) has its rim point
// R (cos theta, sin theta) and its outward axis u = (cos theta, sin theta). Its "attachment
// frame" has its origin on the rim point and local +y along u (frame angle theta - pi/2), local
// +x along the rim (clockwise).
import {
  ART_DIR,
  BASE_PPM,
  COCKPIT,
  CUP_ART,
  KEVIN,
  PART_PPM,
  PICS,
  PLATE_ART,
  POWER_ART,
  ROVER_R,
  WEIGHT_ART,
  WHEEL_ART,
  anchorFromCentre,
  centreFromAnchor,
  flipAnchor,
} from './art';
import type { Picture } from './art';
import {
  COLLIDER_FRACTION,
  MOUNT_LEN,
  POWER_DENSITY,
  POWER_MOUNT_LEN,
  SQUARE_HALF,
  STAR_HUB,
  WEIGHT_MASS,
  WHEEL,
  isAttachment,
  isPower,
  isWeight,
  isWheel,
  mountOf,
} from './catalog';
import type { Mount } from './catalog';
import { heightAt } from './terrain';
import type { AttachmentKind, PowerKind, RoverPart, Shape, Vec2, WeightKind, WheelKind } from './types';
import type { Shape as PhysShape } from '../../../physics/types';

export { ROVER_R };

/** `CourseSpec.spawn`: where a palette part appears. A part still exactly here is fresh from
 * the palette, and `normalizeParts` gives it a sensible free spot by kind (see DEFAULT_SLOTS)
 * instead of the top of the dome, which is where this point would otherwise snap it. */
export const SPAWN: Vec2 = { x: 3, y: 9 };

/** Rim angles snap to this step (5 degrees): a drag slides the part along the rim in small
 * notches, and a symmetric build (wheels at -45 and -135) is easy to hit. */
export const THETA_STEP = (5 * Math.PI) / 180;

/** Gap (m) left between the lowest point of the build and the ground when the level places the
 * rover: it drops this far when Play starts. */
export const GROUND_CLEARANCE = 0.02;

/** The suction cup's face and the spring's end sink this far (m) into the dome's glass edge,
 * so they read as stuck on rather than floating. */
const MOUNT_SINK = 0.02;
/** The spring picture runs this far (m) under the part it holds. */
const SPRING_TUCK = 0.04;

const DEG = Math.PI / 180;

// ---- small vector helpers ---------------------------------------------------------------------

export function rotate(v: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k };
}

/** The outward unit vector at rim angle `theta`. */
export function outward(theta: number): Vec2 {
  return { x: Math.cos(theta), y: Math.sin(theta) };
}

/** The rim point at `theta`, rover-local. */
export function rimPoint(theta: number): Vec2 {
  return scale(outward(theta), ROVER_R);
}

/** Wraps an angle to (-pi, pi]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Snaps an angle to the THETA_STEP notches, wrapped to (-pi, pi]. */
export function snapTheta(a: number): number {
  return wrapAngle(Math.round(a / THETA_STEP) * THETA_STEP);
}

// ---- pictures on bodies -----------------------------------------------------------------------

/** One picture drawn on a body: a kit box shape in that body's frame plus its texture key. */
export interface PictureItem {
  key: string;
  shape: Extract<Shape, { kind: 'box' }>;
}

function picture(p: Picture, w: number, h: number, centre: Vec2): PictureItem {
  return { key: p.key, shape: { kind: 'box', w, h, cx: centre.x, cy: centre.y } };
}

/** The dome's two pictures on the rover body, back to front: Kevin, then the glass dome over
 * him (its dark base hides his feet; the glass is see-through). Both at BASE_PPM. Kevin stands
 * with his feet 0.5 m below the dome's centre, inside the dark base band (its top edge sits
 * 0.41 m below the centre in the picture). */
export function roverPictures(): { kevin: PictureItem; dome: PictureItem } {
  const kevinW = PICS.kevin.w / BASE_PPM;
  const kevinH = PICS.kevin.h / BASE_PPM;
  const feetY = -0.5;
  // Kevin's body bbox is centred on x 215 of 426: the picture's centre is within 2 px of it.
  const kevinCx = (PICS.kevin.w / 2 - (KEVIN.bodyBbox.x0 + KEVIN.bodyBbox.x1) / 2) / BASE_PPM;
  const kevin = picture(PICS.kevin, kevinW, kevinH, { x: kevinCx, y: feetY + kevinH / 2 });
  const dome = picture(
    PICS.cockpit,
    PICS.cockpit.w / BASE_PPM,
    PICS.cockpit.h / BASE_PPM,
    centreFromAnchor(PICS.cockpit, COCKPIT.center, BASE_PPM),
  );
  return { kevin, dome };
}

// ---- attachment geometry ----------------------------------------------------------------------

export interface AttachmentGeometry {
  kind: AttachmentKind;
  mount: Mount;
  theta: number;
  /** Outward unit vector, rover-local. */
  u: Vec2;
  /** The rim point, rover-local. */
  rim: Vec2;
  /** The main body's pose, rover-local: the wheel, the propulsion box, the plate + weight. */
  body: { pos: Vec2; angle: number };
  /** The main body's colliders, in its own frame. */
  shapes: PhysShape[];
  /** Collider density giving the part its mass. */
  density: number;
  friction: number;
  /** Pictures on the main body (its frame), back to front. */
  pictures: PictureItem[];
  /** The suction cup or spring, drawn on a small body welded to the dome at the rim point (its
   * frame = the attachment frame). null for a propulsion part on a suction cup: its picture
   * carries its own cup. */
  mountPicture: PictureItem | null;
  /** Rover-local points on the colliders' outline, for the ground clearance. */
  outline: Vec2[];
  /** Jet and stove: where the flame / smoke comes out, in the main body's frame, and the
   * direction the part points (away from the dome) as an angle in that frame. */
  fx?: { origin: Vec2; dir: number };
}

function boxOutline(halfW: number, halfH: number, centre: Vec2, angle: number, pos: Vec2): Vec2[] {
  const corners: Vec2[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
    { x: 0, y: -halfH },
    { x: 0, y: halfH },
    { x: -halfW, y: 0 },
    { x: halfW, y: 0 },
  ];
  return corners.map((c) => add(pos, rotate(add(centre, c), angle)));
}

function circleOutline(r: number, pos: Vec2, samples = 24): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * 2 * Math.PI;
    out.push({ x: pos.x + r * Math.cos(a), y: pos.y + r * Math.sin(a) });
  }
  return out;
}

/** One star tip: a 4-vertex convex polygon from 0.3 x reach to the reach, 0.35 x reach wide,
 * rotated by `angle` (the old buggy's star geometry). */
function starTip(reach: number, angle: number): Vec2[] {
  const halfW = (0.35 * reach) / 2;
  const inner = 0.3 * reach;
  const local: Vec2[] = [
    { x: inner, y: -halfW },
    { x: inner, y: halfW },
    { x: reach, y: halfW },
    { x: reach, y: -halfW },
  ];
  return local.map((p) => rotate(p, angle));
}

/** The five star tip angles in the wheel's frame: one tip straight up, like the picture. */
export const STAR_TIP_ANGLES = [0, 1, 2, 3, 4].map((k) => Math.PI / 2 + (k * 2 * Math.PI) / 5);

/** The mount picture in the attachment frame (origin on the rim, +y outward), reaching `len`. */
function mountPictureFor(mount: Mount, len: number): PictureItem {
  if (mount === 'spring') {
    const w = PICS.spring.w / PART_PPM;
    const h = len + MOUNT_SINK + SPRING_TUCK;
    return picture(PICS.spring, w, h, { x: 0, y: -MOUNT_SINK + h / 2 });
  }
  const centre = add({ x: 0, y: -MOUNT_SINK }, centreFromAnchor(PICS.cup, CUP_ART.bottom, PART_PPM));
  return picture(PICS.cup, PICS.cup.w / PART_PPM, PICS.cup.h / PART_PPM, centre);
}

function wheelGeometry(kind: WheelKind, mount: Mount, theta: number): AttachmentGeometry {
  const spec = WHEEL[kind];
  const u = outward(theta);
  const rim = rimPoint(theta);
  const len = MOUNT_LEN[mount];
  const pos = add(rim, scale(u, len + spec.reach));
  // Built level, like its picture: a square wheel sits flat, a star has a tip straight up.
  const angle = 0;

  let shapes: PhysShape[];
  if (kind === 'wheelSquare') {
    shapes = [{ kind: 'box', halfWidth: SQUARE_HALF, halfHeight: SQUARE_HALF }];
  } else if (kind === 'wheelStar') {
    shapes = [
      { kind: 'circle', radius: STAR_HUB },
      ...STAR_TIP_ANGLES.map((a): PhysShape => ({ kind: 'polygon', vertices: starTip(spec.reach, a) })),
    ];
  } else {
    shapes = [{ kind: 'circle', radius: spec.r }];
  }

  // The picture's manifest radius (the square: its half side) maps onto the collider's own.
  const art = WHEEL_ART[kind];
  const pic = PICS[kind];
  const artRadius = kind === 'wheelSquare' ? WHEEL_ART.wheelSquare.halfSide : art.radius;
  const colliderRadius = kind === 'wheelSquare' ? SQUARE_HALF : spec.reach;
  const ppm = artRadius / colliderRadius;
  const wheelPicture = picture(pic, pic.w / ppm, pic.h / ppm, centreFromAnchor(pic, art.center, ppm));

  return {
    kind,
    mount,
    theta,
    u,
    rim,
    body: { pos, angle },
    shapes,
    density: spec.density,
    friction: spec.friction,
    pictures: [wheelPicture],
    mountPicture: mountPictureFor(mount, len),
    outline: circleOutline(spec.reach, pos),
  };
}

/** Whether a propulsion part at `theta` is drawn with its vertically mirrored picture: on the
 * front half of the dome, so it stands the right way up there too. */
export function powerFlipped(theta: number): boolean {
  return Math.cos(theta) > 1e-9;
}

function powerGeometry(kind: PowerKind, mount: Mount, theta: number): AttachmentGeometry {
  const u = outward(theta);
  const rim = rimPoint(theta);
  const flip = powerFlipped(theta);
  const art = POWER_ART[kind];
  const basePic = PICS[kind];
  const pic = flip ? PICS[`${kind}Flip`] : basePic;
  const anchor = (p: Vec2): Vec2 => (flip ? flipAnchor(basePic, p) : p);
  // The picture's axis in a y-up frame (the mirrored copy's axis has its y negated).
  const axisAngle = flip ? Math.atan2(art.axis.y, art.axis.x) : Math.atan2(-art.axis.y, art.axis.x);
  // Turn the picture so its axis points along u.
  const angle = theta - axisAngle;
  const mountLocal = anchorFromCentre(pic, anchor(art.mount), PART_PPM);
  const mountPoint = add(rim, scale(u, POWER_MOUNT_LEN[mount]));
  const pos = add(mountPoint, scale(rotate(mountLocal, angle), -1));

  const w = pic.w / PART_PPM;
  const h = pic.h / PART_PPM;
  const halfW = (COLLIDER_FRACTION * w) / 2;
  const halfH = (COLLIDER_FRACTION * h) / 2;

  // The jet's flame comes out of its nozzle, the stove's smoke out of its chimney; the fan has
  // no effect picture.
  let fx: AttachmentGeometry['fx'];
  if (kind === 'jet') fx = { origin: anchorFromCentre(pic, anchor(POWER_ART.jet.thrustOrigin), PART_PPM), dir: axisAngle };
  else if (kind === 'stove') fx = { origin: anchorFromCentre(pic, anchor(POWER_ART.stove.chimney), PART_PPM), dir: axisAngle };

  return {
    kind,
    mount,
    theta,
    u,
    rim,
    body: { pos, angle },
    shapes: [{ kind: 'box', halfWidth: halfW, halfHeight: halfH }],
    density: POWER_DENSITY,
    friction: 0.6,
    pictures: [picture(pic, w, h, { x: 0, y: 0 })],
    mountPicture: mount === 'spring' ? mountPictureFor('spring', POWER_MOUNT_LEN.spring) : null,
    outline: boxOutline(halfW, halfH, { x: 0, y: 0 }, angle, pos),
    ...(fx ? { fx } : {}),
  };
}

function weightGeometry(kind: WeightKind, mount: Mount, theta: number): AttachmentGeometry {
  const u = outward(theta);
  const rim = rimPoint(theta);
  const len = MOUNT_LEN[mount];
  // The body's origin is the plate's bottom centre; its frame is the attachment frame.
  const pos = add(rim, scale(u, len));
  const angle = theta - Math.PI / 2;

  const plateW = PICS.plate.w / PART_PPM;
  const plateH = PICS.plate.h / PART_PPM;
  const plateCentre = centreFromAnchor(PICS.plate, PLATE_ART.bottom, PART_PPM);
  const plateTop = add(plateCentre, anchorFromCentre(PICS.plate, PLATE_ART.top, PART_PPM));
  const pic = PICS[kind];
  const w = pic.w / PART_PPM;
  const h = pic.h / PART_PPM;
  const weightCentre = add(plateTop, centreFromAnchor(pic, WEIGHT_ART[kind].bottom, PART_PPM));
  const halfW = (COLLIDER_FRACTION * w) / 2;
  const halfH = (COLLIDER_FRACTION * h) / 2;
  const area = plateW * plateH + 4 * halfW * halfH;

  return {
    kind,
    mount,
    theta,
    u,
    rim,
    body: { pos, angle },
    shapes: [
      { kind: 'box', halfWidth: plateW / 2, halfHeight: plateH / 2, center: plateCentre },
      { kind: 'box', halfWidth: halfW, halfHeight: halfH, center: weightCentre },
    ],
    density: WEIGHT_MASS[kind] / area,
    friction: 0.6,
    pictures: [picture(PICS.plate, plateW, plateH, plateCentre), picture(pic, w, h, weightCentre)],
    mountPicture: mountPictureFor(mount, len),
    outline: [
      ...boxOutline(plateW / 2, plateH / 2, plateCentre, angle, pos),
      ...boxOutline(halfW, halfH, weightCentre, angle, pos),
    ],
  };
}

/** Everything about one attachment at rim angle `theta`, rover-local. */
export function attachmentGeometry(kind: AttachmentKind, mount: Mount, theta: number): AttachmentGeometry {
  if (isWheel(kind)) return wheelGeometry(kind, mount, theta);
  if (isPower(kind)) return powerGeometry(kind, mount, theta);
  if (isWeight(kind)) return weightGeometry(kind, mount, theta);
  throw new Error(`vehicle: ${kind as string} is not an attachment`);
}

// ---- normalizeParts -----------------------------------------------------------------------------

/** Free spots a fresh palette part tries, in order (degrees): wheels at the bottom corners
 * first, propulsion on the back (it pushes forward), weights on the front (a heavy front rams
 * what is in the way), then on top. The first spot at least SLOT_GAP from every other
 * attachment wins; when all are taken, the first one. */
const DEFAULT_SLOTS: Record<'wheel' | 'power' | 'weight', number[]> = {
  wheel: [-45, -135, -90, -20, -160, 0, 180, 20, 160, 45, 135, 90],
  power: [180, 155, -155, 130, -130, 90],
  weight: [0, 90, 60, 120, 30, 150],
};
const SLOT_GAP = 20 * DEG;

function angularDistance(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

export function defaultSlot(kind: AttachmentKind, taken: number[]): number {
  const group = isWheel(kind) ? 'wheel' : isPower(kind) ? 'power' : 'weight';
  const slots = DEFAULT_SLOTS[group].map((d) => snapTheta(d * DEG));
  for (const s of slots) {
    if (taken.every((t) => angularDistance(s, t) >= SLOT_GAP - 1e-9)) return s;
  }
  return slots[0]!;
}

/** The rim angle an attachment's stored point stands for, around the rover centre `c`. */
export function thetaOf(part: { x: number; y: number }, c: Vec2): number {
  const dx = part.x - c.x;
  const dy = part.y - c.y;
  if (Math.hypot(dx, dy) < 1e-9) return Math.PI / 2;
  return snapTheta(Math.atan2(dy, dx));
}

/** Rover-local points of the dome's outline. */
function domeOutline(): Vec2[] {
  return circleOutline(ROVER_R, { x: 0, y: 0 }, 36);
}

/** The height of the dome's centre that puts the lowest point of the build GROUND_CLEARANCE
 * above the terrain (every collider outline point is checked against the ground under it). */
export function restHeight(roverX: number, geometries: AttachmentGeometry[], terrain: Vec2[]): number {
  let y = -Infinity;
  for (const p of [...domeOutline(), ...geometries.flatMap((g) => g.outline)]) {
    y = Math.max(y, heightAt(terrain, roverX + p.x) - p.y + GROUND_CLEARANCE);
  }
  return y;
}

export interface RoverLayout {
  rover: RoverPart;
  attachments: { part: RoverPart; geometry: AttachmentGeometry }[];
}

/** `CourseSpec.normalizeParts`: every attachment snaps onto the dome's rim (its rim angle is the
 * direction from the dome's centre to where the child left it, in 5 degree notches; a part
 * fresh from the palette takes a free default spot), and the dome is lifted or lowered so the
 * whole build stands on the ground. Attachments without a dome are dropped. Idempotent. */
export function normalizeRoverParts(parts: RoverPart[], terrain: Vec2[]): RoverPart[] {
  const layout = layoutRover(parts, terrain);
  if (!layout) return parts.filter((p) => !isAttachment(p.kind));
  const byId = new Map<number, RoverPart>([[layout.rover.id, layout.rover]]);
  for (const a of layout.attachments) byId.set(a.part.id, a.part);
  return parts.map((p) => byId.get(p.id) ?? p);
}

/** The snapped layout behind `normalizeRoverParts`: the dome at its rest height and every
 * attachment with its rim angle and geometry. null when there is no dome. */
export function layoutRover(parts: RoverPart[], terrain: Vec2[]): RoverLayout | null {
  const rover = parts.find((p) => p.kind === 'rover');
  if (!rover) return null;
  const centre = { x: rover.x, y: rover.y };

  const thetas = new Map<number, number>();
  const fresh: RoverPart[] = [];
  for (const p of parts) {
    if (!isAttachment(p.kind)) continue;
    if (p.x === SPAWN.x && p.y === SPAWN.y) fresh.push(p);
    else thetas.set(p.id, thetaOf(p, centre));
  }
  for (const p of fresh) {
    thetas.set(p.id, defaultSlot(p.kind as AttachmentKind, [...thetas.values()]));
  }

  const placed = parts
    .filter((p) => isAttachment(p.kind))
    .map((p) => {
      const theta = thetas.get(p.id)!;
      return { part: p, theta, geometry: attachmentGeometry(p.kind as AttachmentKind, mountOf(p.props), theta) };
    });
  const y = restHeight(rover.x, placed.map((a) => a.geometry), terrain);
  const snappedRover: RoverPart = { ...rover, y };
  return {
    rover: snappedRover,
    attachments: placed.map(({ part, theta, geometry }) => ({
      part: { ...part, x: rover.x + ROVER_R * Math.cos(theta), y: y + ROVER_R * Math.sin(theta) },
      geometry,
    })),
  };
}

/** Texture keys for `CourseSpec.textures`: every picture of the real rover art. */
export function roverTextures(): Record<string, { url: string }> {
  const out: Record<string, { url: string }> = {};
  for (const p of Object.values(PICS)) out[p.key] = { url: `${ART_DIR}${p.file}` };
  return out;
}
