// Turns a PlacedPart into Rapier bodies/shapes plus the RenderItems the scene draws.
import { ARM, BAND_COLOR, BAND_COUNT, CAN_COLORS, FUZZ_TINT, LAUNCH_SPEED, MATERIALS, blockSize, fuzzName, fuzzSpec } from './catalog';
import type { BodyId, Bounds, Material, OverlayItem, PartHandle, PlacedPart, RenderItem, Shape, Vec2 } from './types';
import type { PhysicsWorld } from '../../../physics/types';

export const WORLD_W = 30;
export const WORLD_H = 15;

/** Pivot offset from the part anchor (x, y): the pivot sits above and slightly ahead of the
 * base, at the apex of the A-frame. */
export const PIVOT_DX = 0.2;
export const PIVOT_DY = 1.6;

/** The arm's rest pose: laid back over the REAR of the machine, 20 degrees below
 * rear-horizontal (180 + 20 = 200). The bucket hangs over the back at rest, not the front, so
 * the sweep throws the fuzz forward over the base rather than off the back of it. */
export const REST_ANGLE_DEG = 200;
export const REST_ANGLE = (REST_ANGLE_DEG * Math.PI) / 180;

/** How far below the arm's own tip the fuzz pocket sits (local -y in the arm's unrotated
 * frame), so the loaded fuzz and the release point both sit on the arm's leading face rather
 * than dead-center on its centerline. */
export const POCKET_DY = 0.25;

/** Length (m) of the angle lever stick, from the pivot out to its far end along the stop
 * direction (product direction 2026-09-22: the stop post becomes a lever the child drags). The
 * angle dial widget's `radiusM` matches this, so option i's handle sits exactly on the lever's
 * tip for that angle. */
export const LEVER_LENGTH = 1.5;

/** The arm's world-frame body angle (radians) when it releases at a given `angle` chip value
 * (degrees). Increasing release angle (a steeper shot) means a shorter backswing (closer to
 * REST); a flat shot (small angle) sweeps almost all the way down toward the crossbar before
 * releasing. This is now ALSO the arm's stop pose (variant A, product direction 2026-09-21): the
 * crossbar sits at this same angle, so the child sees the stop bar rotate when the angle chip
 * changes and the arm ends every shot resting exactly on it - the instant it releases the fuzz. */
export function armAngleFor(releaseDeg: number): number {
  return ((90 + releaseDeg) * Math.PI) / 180;
}

const BASE_COLOR = 0x8a6a3a;
const ARM_COLOR = 0xc98a4b;
const GEAR_COLOR = 0xffd84d;
const CUP_COLOR = 0x4a9eff;
const SOLID_COLOR = 0x8a6a3a;
const WALL_COLOR = 0x3a4470;
const BULLSEYE_COLOR = 0xffffff;
const POST_COLOR = 0x3a4470;

/** partId used for a fuzz projectile spawned mid-shot (not a placed part). */
export const FUZZ_PART_ID = -2;

/** The fuzz picture for a catapult's props: `fuzz-<fuzz>` (one of the five, see catalog.ts's
 * `FUZZ`), with `-excited` for the face it wears in flight (the same picture for now - there is no
 * excited art yet - but the key stays so one can drop in later). */
export function fuzzTextureKey(props: Record<string, string>, excited = false): string {
  const key = `fuzz-${fuzzName(props)}`;
  return excited ? `${key}-excited` : key;
}

// ---- the real art (public/parts/catapult/real-*.png, prepared from the art lead's exports) -----
// Scene textures are stretched to their RenderItem's box, so each box below is the picture's own
// pixel size over its pixels-per-metre, placed so the picture's landmarks land on the machine's
// geometry (pivot, pocket, lever knob). Pixel numbers are measured on the prepared PNGs.

/** Every machine picture except the base is drawn at 240 px per metre: the exports at their native
 * size relative to one another (the reference picture's proportions). */
export const ART_PPM = 240;

/** The base (real-base.png, 750 x 466 px: plank + A-frame + blue hub). The hub centre is 388.5 px
 * from the picture's left edge and 89.5 px below its top, and the plank's bottom edge is the
 * picture's bottom edge (466), so (466 - 89.5) px = PIVOT_DY puts the hub exactly on the pivot with
 * the plank on the ground: 376.5 / 1.6 = 235.31 px/m. The export's 6.9 m plank is cut down to the
 * whole A-frame plus a plank lip each side (spliced back onto the export's own bevelled ends):
 * 0.56 m left of the A-frame's foot (clear of the Short arm's string peg) and 0.40 m right of it,
 * so the picture is 750 / 235.31 = 3.187 m wide x 466 / 235.31 = 1.980 m tall. On the base body
 * (centred at (x, y + 0.3)): cx = PIVOT_DX + (750 / 2 - 388.5) / 235.31 = 0.1426 (the picture
 * spans x - 1.451 .. x + 1.736), cy = 1.980 / 2 - 0.3 = 0.6902 (it spans y .. y + 1.980). */
const BASE_ART_PPM = (466 - 89.5) / PIVOT_DY;
export const BASE_ART = {
  w: 750 / BASE_ART_PPM,
  h: 466 / BASE_ART_PPM,
  cx: PIVOT_DX + (750 / 2 - 388.5) / BASE_ART_PPM,
  cy: 466 / 2 / BASE_ART_PPM - 0.3,
};

/** The gear (real-gear.png, the star gear) on the arm body at the pivot: 241 px across at
 * ART_PPM, so r 0.5 m - its toothed ring (r 0.335 .. 0.5) covers the hub's rim (r 0.38) and both
 * sticks' pivot ends, which stop under it. The PNG is pre-turned -200 deg so the star stands
 * upright while the arm is loaded at REST_ANGLE; it turns with the arm during the swing. */
export const GEAR_R = 0.5;

/** The arm picture (real-arm-<arm>.png): the export turned 180 deg (cup at local +x, its opening
 * toward local -y, which faces UP at REST_ANGLE), 132 px tall. Its pivot-side edge sits 86 px
 * (0.358 m) out from the pivot, under the gear's ring; the stick's centreline (row 81.5) is local
 * y = 0; the cup centre is 721 px from the uncut export's stick end, so cutting the stick to 560 px
 * (Short) or 800 px (Long) puts the cup centre at local x = 0.358 + 394 / 240 = 2.0 = L (Short) or
 * 0.358 + 634 / 240 = 3.0 = L (Long). The pocket (L, -POCKET_DY) then sits just above the rim
 * (the picture's opening-side edge is local y -0.21), so the fuzz rides IN the cup. */
const ARM_ART_PX: Record<string, number> = { Short: 560, Long: 800 };
const ARM_ART_X0 = 86 / ART_PPM;
export function armArtBox(armKey: string): { w: number; h: number; cx: number; cy: number } {
  const w = (ARM_ART_PX[armKey] ?? ARM_ART_PX.Short!) / ART_PPM;
  return { w, h: 132 / ART_PPM, cx: ARM_ART_X0 + w / 2, cy: (81.5 - 132 / 2) / ART_PPM };
}

/** The cup's front half (real-cup.png, 333 x 120 px, turned 180 deg like the arm), drawn over the
 * loaded fuzz so the fuzz sits inside the cup. It covers the arm picture's cup exactly: in the
 * uncut export it sits at offset (-1, 13), i.e. centred 0.5 px past the cup centre along the arm and
 * 22.5 px from the stick's centreline toward the bowl: (L + 0.5 / 240, (81.5 - 59) / 240). */
export function cupCoverBox(L: number): { w: number; h: number; cx: number; cy: number } {
  return { w: 333 / ART_PPM, h: 120 / ART_PPM, cx: L + 0.5 / ART_PPM, cy: (81.5 - 59) / ART_PPM };
}

/** The angle lever (real-lever.png: the angle arm's pad + 352 px of its stick, flipped so the pad
 * is at the bottom = the knob end, crossbar-local -y). On the crossbar body the pivot is local
 * y +0.75; the pad's centre (export row 78) lands on the knob, LEVER_LENGTH out (local y -0.75), so
 * the pad's far end is at -0.75 - 78 / 240 = -1.075 and the stick's end at -0.75 + (352 - 78) / 240
 * = +0.392 (0.358 m from the pivot, under the gear's ring): h = 352 / 240, cy = -0.3417. */
const LEVER_PAD_END = 0.75 - LEVER_LENGTH - 78 / ART_PPM;
const LEVER_STICK_END = 0.75 - LEVER_LENGTH + (352 - 78) / ART_PPM;
export const LEVER_ART = {
  w: 131 / ART_PPM,
  h: LEVER_STICK_END - LEVER_PAD_END,
  cx: 0,
  cy: (LEVER_PAD_END + LEVER_STICK_END) / 2,
};

/** Local y (arm frame) of the cup's underside near the cup centre, where the trigger string ties
 * on: the bowl's lowest row is 0.335 m from the stick's centreline, so 0.31 puts the tie (and its
 * hook) just inside the bowl's edge. */
const CUP_UNDERSIDE_LY = 0.31;

/** The strength band pictures (real-band-<n>.png): the art lead's band, recoloured red, rebuilt
 * n times as long as it is wide. An overlay sprite keeps its picture's aspect (`size` is its width),
 * so each band picks the n that keeps it about BAND_THICKNESS thick at its current length. */
export const BAND_ASPECTS = [3, 4, 6, 8, 11, 15, 21, 29];
export const BAND_THICKNESS = 0.06;
/** Hook pictures (real-hook.png, 66 x 59 px, arch up): at each band end, and at both ends of the
 * trigger string. */
export const HOOK_SIZE = 0.1;
export const STRING_HOOK_SIZE = 0.13;
const HOOK_ASPECT = 59 / 66;

/** One band sprite stretched from `a` to `b`: the picture is vertical, so its angle is the
 * segment's angle minus 90 deg (the scene draws `angle` CCW, world axes). Null for a zero-length
 * segment. */
export function bandSprite(id: string, a: Vec2, b: Vec2): OverlayItem | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  let n = BAND_ASPECTS[0]!;
  for (const k of BAND_ASPECTS) {
    if (Math.abs(Math.log(len / k / BAND_THICKNESS)) < Math.abs(Math.log(len / n / BAND_THICKNESS))) n = k;
  }
  const theta = Math.atan2(b.y - a.y, b.x - a.x);
  return {
    kind: 'sprite',
    id,
    textureKey: `real-band-${n}`,
    p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    size: len / n,
    angle: theta - Math.PI / 2,
  };
}

/** A hook sprite centred at `p`, its arch pointing along `apexDir` (radians, world axes). */
export function hookSprite(id: string, p: Vec2, apexDir: number, size = HOOK_SIZE): OverlayItem {
  return { kind: 'sprite', id, textureKey: 'real-hook', p, size, angle: apexDir - Math.PI / 2 };
}

/** Height of a string hook (m), for standing the peg's hook on the ground. */
export const STRING_HOOK_H = STRING_HOOK_SIZE * HOOK_ASPECT;

function boxBounds(x: number, y: number, w: number, h: number): Bounds {
  return { x, y, w, h };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  const minX = Math.min(a.x - a.w / 2, b.x - b.w / 2);
  const maxX = Math.max(a.x + a.w / 2, b.x + b.w / 2);
  const minY = Math.min(a.y - a.h / 2, b.y - b.h / 2);
  const maxY = Math.max(a.y + a.h / 2, b.y + b.h / 2);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/** AABB of a box rotated by `angle`, centered at `pos`, with an optional local offset (cx, cy). */
function rotatedBoxBounds(pos: Vec2, angle: number, w: number, h: number, cx = 0, cy = 0): Bounds {
  const hw = w / 2;
  const hh = h / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ]) {
    const lx = corner.x + cx;
    const ly = corner.y + cy;
    const wx = pos.x + c * lx - s * ly;
    const wy = pos.y + s * lx + c * ly;
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

export interface GroundAndWalls {
  ground: BodyId;
  walls: BodyId[];
}

/** Static ground (top at y = 0) + two static walls just past the play field. */
export function buildGround(world: PhysicsWorld): GroundAndWalls {
  const groundHalfH = 0.5;
  const ground = world.createBody({ type: 'static', position: { x: WORLD_W / 2, y: -groundHalfH } });
  world.addShape(ground, { kind: 'box', halfWidth: WORLD_W / 2, halfHeight: groundHalfH }, { friction: 0.8 });

  const walls: BodyId[] = [];
  for (const x of [-0.5, WORLD_W + 0.5]) {
    const wall = world.createBody({ type: 'static', position: { x, y: WORLD_H / 2 } });
    world.addShape(wall, { kind: 'box', halfWidth: 0.5, halfHeight: WORLD_H / 2 });
    walls.push(wall); // role 'wall'; no RenderItem (no visuals, per the plan).
  }

  return { ground, walls };
}

interface ArmBuild {
  id: BodyId;
  visuals: RenderItem[];
  bounds: Bounds;
}

/** Pivot world position for a placed catapult part. */
function pivotOf(part: PlacedPart): Vec2 {
  return { x: part.x + PIVOT_DX, y: part.y + PIVOT_DY };
}

/** World point on the arm at body-angle `armAngleRad`: the tip (local (L, 0) in the arm's own
 * frame) offset by POCKET_DY along the arm's local -y (its leading face), i.e. local point
 * (L, -POCKET_DY) rotated by armAngleRad about the pivot. Shared by `catapultRelease` (release
 * angle) and `catapultPocketAtRest` (REST_ANGLE) so both agree on one formula. */
function armTipPoint(part: PlacedPart, armAngleRad: number): Vec2 {
  const armSpec = ARM[part.props.arm ?? 'Short'] ?? ARM.Short!;
  const pivot = pivotOf(part);
  const c = Math.cos(armAngleRad);
  const s = Math.sin(armAngleRad);
  return {
    x: pivot.x + armSpec.length * c + POCKET_DY * s,
    y: pivot.y + armSpec.length * s - POCKET_DY * c,
  };
}

/** Where the fuzz pocket sits while the arm is at rest (loaded, pre-launch). Also the anchor
 * C2's widgets/labels should use for anything that points at "the loaded fuzz". */
export function catapultPocketAtRest(part: PlacedPart): Vec2 {
  return armTipPoint(part, REST_ANGLE);
}

/** A point `dist` meters from the pivot along `angleRad` (world axes, CCW from +x) - the plain
 * centreline of the arm or the lever stick, with no POCKET_DY offset (unlike `armTipPoint`, which
 * is specifically the fuzz pocket/release point on the arm's leading face). Shared by the trigger
 * string, the rubber bands and the angle dial widget so every visual agrees with one geometry. */
function centrelinePoint(part: PlacedPart, angleRad: number, dist: number): Vec2 {
  const pivot = pivotOf(part);
  return { x: pivot.x + dist * Math.cos(angleRad), y: pivot.y + dist * Math.sin(angleRad) };
}

/** The cup's UNDERSIDE, near the cup centre - where the trigger string ties down, as in the
 * reference picture (stakeholder feedback 2026-09-22: "the fire button should be next to the string
 * to be cut", which needs the string off the arm's centreline so a button fits beside it). The
 * string hangs straight down through arm-local (L - 0.1, +0.1) at REST_ANGLE (L = arm length) - the
 * x the FIRE button is laid out from (`fireSpot`), about x - 1.55 (Short) / x - 2.49 (Long) - and
 * ties on where that vertical meets the cup's underside (local y CUP_UNDERSIDE_LY): world down is
 * arm-local (-sin, -cos)(REST_ANGLE) = (+0.34, +0.94), so the tie sits (0.31 - 0.1) / 0.94 =
 * 0.22 m below that point: about y + 0.63 (Short) / y + 0.29 (Long). */
function cupUndersidePoint(part: PlacedPart): Vec2 {
  const armSpec = ARM[part.props.arm ?? 'Short'] ?? ARM.Short!;
  const pivot = pivotOf(part);
  const c = Math.cos(REST_ANGLE);
  const s = Math.sin(REST_ANGLE);
  const lx = armSpec.length - 0.1;
  const ly = 0.1;
  const drop = (CUP_UNDERSIDE_LY - ly) / -c;
  return { x: pivot.x + lx * c - ly * s, y: pivot.y + lx * s + ly * c - drop };
}

/** The trigger string's tied-off end (the cup's underside - `cupUndersidePoint`) and the ground
 * peg it ties to (same x, the catapult's own ground-level y). Drawn by the sim as an overlay:
 * intact at rest, cut the instant `play()` fires (product direction 2026-09-22 - PULL ring
 * replaced by a FIRE button that snips this string). */
export function stringAnchor(part: PlacedPart): { a: Vec2; p: Vec2 } {
  const a = cupUndersidePoint(part);
  return { a, p: { x: a.x, y: part.y } };
}

/** Horizontal offset (m) from the string's tied point to the FIRE button/snip-burst centre: just
 * right of the string, with a small gap on both sides, clear of the string itself and of the
 * cart's base (left edge `part.x - 0.8`) for both arms - see the final report for the fit check
 * (a 0.4 offset - the stakeholder's own suggestion - just barely clips the base for the Short arm
 * at the spec's 72 px button size, so this nudges in slightly instead of shrinking the button). */
export const FIRE_DX = 0.375;

/** FIRE/snip vertical offset (m) above the part's own ground-level y - near where a real trigger
 * peg sits, under the cup. With the real art the Short arm's cup clears the button by 0.30 m; the
 * Long arm's cup hangs lower (its bowl's bottom reaches `part.y + 0.19`, left of the button) and
 * its bowl's edge dips about 0.04 m behind the button's top-left rim (the button draws on top). */
export const FIRE_DY = 0.15;

/** Where the FIRE button sits, and - once a shot fires - where the snip burst appears in its
 * place (stakeholder feedback 2026-09-22: "the fire button should be next to the string to be
 * cut"). Depends on the arm prop via `stringAnchor`, so spec.ts's widget and sim.ts's cut effect
 * always agree on one geometry. */
export function fireSpot(part: PlacedPart): Vec2 {
  const { a } = stringAnchor(part);
  return { x: a.x + FIRE_DX, y: part.y + FIRE_DY };
}

/** The rubber bands' endpoints (arm side -> lever side), `BAND_COUNT[power]` of them, all
 * `BAND_COLOR` red (band 0 closest to the arm/lever roots). `armAngleRad` is the arm's
 * CURRENT drawn angle (REST at rest, the tracked swing angle mid-shot, the release/stop angle
 * once it lands) - the lever side always sits at the stop direction for the part's own `angle`
 * prop, since the lever itself never moves. Shared by the sim's per-frame overlay and
 * `partTargets` so every band-related visual agrees on one geometry. */
export function bandSegments(part: PlacedPart, armAngleRad: number): { a: Vec2; b: Vec2; color: number }[] {
  const angleDeg = Number(part.props.angle ?? '45') || 45;
  const stopDir = armAngleFor(angleDeg);
  const count = BAND_COUNT[part.props.power ?? 'Medium'] ?? BAND_COUNT.Medium!;
  const segs: { a: Vec2; b: Vec2; color: number }[] = [];
  for (let i = 0; i < count; i++) {
    segs.push({
      a: centrelinePoint(part, armAngleRad, 0.85 + 0.08 * i),
      b: centrelinePoint(part, stopDir, 1.05 + 0.08 * i),
      color: BAND_COLOR,
    });
  }
  return segs;
}

/** Builds the kinematic arm body (no collider) at `armAngleRad` (default the part's rest pose)
 * with its visuals: the arm picture, the star gear at the pivot, and - when `withFuzz` (default
 * true) - the loaded fuzz (a RenderItem tagged role 'fuzz' riding the arm body, textured by the
 * fuzz prop), then the cup's front half drawn over it so the fuzz sits inside the cup. Factored out
 * so the sim can recreate just the arm (on `play()`, `updatePart()`, and to snap it exactly onto
 * the crossbar the instant a shot releases) without touching the base/frame. `withFuzz: false` is
 * used for that last case: the fuzz has already been dropped/spawned, so the stopped arm carries
 * no fuzz visual (the cup cover stays - it is part of the cup). */
export function buildArm(
  world: PhysicsWorld,
  part: PlacedPart,
  armAngleRad: number = REST_ANGLE,
  withFuzz = true,
): ArmBuild {
  const armKey = part.props.arm ?? 'Short';
  const armSpec = ARM[armKey] ?? ARM.Short!;
  const L = armSpec.length;
  const pivot = pivotOf(part);

  // No collider: the arm is kinematic and purely visual/rotational. Its body origin IS the
  // pivot, so `setAngularVelocity` sweeps the drawn arm, cup, gear and loaded fuzz about that point.
  const id = world.createBody({ type: 'kinematic', position: pivot, angle: armAngleRad });

  const common = { partId: part.id, body: id, locked: !!part.locked, lockPosition: !!part.lockPosition };
  const armBox = armArtBox(armKey);
  const armShape: Shape = { kind: 'box', ...armBox };
  const visuals: RenderItem[] = [
    { ...common, shape: armShape, color: ARM_COLOR, role: 'arm', textureKey: `real-arm-${armKey}` },
    // Drawn after the arm so it covers the stick's pivot end; not upright, so it turns with the arm.
    { ...common, shape: { kind: 'circle', r: GEAR_R }, color: GEAR_COLOR, role: 'arm', textureKey: 'real-gear' },
  ];
  if (withFuzz) {
    const name = fuzzName(part.props);
    visuals.push({
      ...common,
      shape: { kind: 'circle', r: fuzzSpec(part.props).r, cx: L, cy: -POCKET_DY },
      color: FUZZ_TINT[name] ?? FUZZ_TINT.Fur!,
      role: 'fuzz',
      upright: true, // stays right-side-up while the arm swings
      textureKey: fuzzTextureKey(part.props),
    });
  }
  // After the fuzz (the scene draws texture items in order), so the fuzz sits inside the cup.
  visuals.push({ ...common, shape: { kind: 'box', ...cupCoverBox(L) }, color: CUP_COLOR, role: 'arm', textureKey: 'real-cup' });

  const armBounds = rotatedBoxBounds(pivot, armAngleRad, armBox.w, armBox.h, armBox.cx, armBox.cy);
  return { id, visuals, bounds: armBounds };
}

/** Bounds of the A-frame's polygon upright plus its crossbar, in world space (frame body sits
 * unrotated at (x, y+0.6); the crossbar sits at its own angled pose past the pivot). */
function frameBounds(part: PlacedPart): Bounds {
  const fx = part.x;
  const fy = part.y + 0.6;
  const verts = [
    { x: -0.5, y: 0 },
    { x: 0.5, y: 0 },
    { x: PIVOT_DX + 0.12, y: 1.0 },
    { x: PIVOT_DX - 0.12, y: 1.0 },
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of verts) {
    const wx = fx + v.x;
    const wy = fy + v.y;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  const uprights = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };

  const { pos: crossbarPos, angle: crossbarAngle } = crossbarPose(part);
  const crossbar = rotatedBoxBounds(crossbarPos, crossbarAngle, 0.5, 0.12);
  return unionBounds(uprights, crossbar);
}

/** World position + angle of the crossbar the arm swings down onto and halts on, the instant it
 * releases the fuzz (variant A, product direction 2026-09-21): the stop pose is the release pose
 * itself - `armAngleFor(angleDeg)` - so the bar visibly rotates with the angle chip instead of
 * sitting fixed. */
function crossbarPose(part: PlacedPart): { pos: Vec2; angle: number } {
  const pivot = pivotOf(part);
  const angleDeg = Number(part.props.angle ?? '45') || 45;
  const stopDirRad = armAngleFor(angleDeg);
  const pos = {
    x: pivot.x + 0.75 * Math.cos(stopDirRad),
    y: pivot.y + 0.75 * Math.sin(stopDirRad),
  };
  const angle = stopDirRad + Math.PI / 2;
  return { pos, angle };
}

/** Same pose `crossbarPose` computes, exported so the sim can snap the arm body onto it (and so
 * tests can assert the crossbar visibly follows the angle prop) without re-deriving the formula. */
export function crossbarPoseFor(part: PlacedPart): { pos: Vec2; angle: number } {
  return crossbarPose(part);
}

/** Bounds of the base picture (plank + A-frame + hub) + the base box + the two decorative wheels
 * + the A-frame/crossbar (everything except the arm), so the sim can recombine them with a freshly
 * rebuilt arm's bounds without rebuilding the base/frame too. A big tap target: the whole drawn
 * base, x - 1.45 .. x + 1.74, y .. y + 1.98, plus the crossbar past the apex. */
export function catapultBaseBounds(part: PlacedPart): Bounds {
  const picture = boxBounds(part.x + BASE_ART.cx, part.y + 0.3 + BASE_ART.cy, BASE_ART.w, BASE_ART.h);
  const baseBounds = unionBounds(boxBounds(part.x, part.y + 0.3, 1.6, 0.6), picture);
  const wheelBounds = unionBounds(
    boxBounds(part.x - 0.5, part.y + 0.25, 0.5, 0.5),
    boxBounds(part.x + 0.5, part.y + 0.25, 0.5, 0.5),
  );
  return unionBounds(unionBounds(baseBounds, wheelBounds), frameBounds(part));
}

function buildCatapult(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const x = part.x;
  const y = part.y;

  // Base: a static body carrying the base box (and the base picture). The two wheel bodies are
  // left over from the old cart art: tiny static bodies with no collider and, since the real art
  // (a plank, no wheels), no visual either - kept so the world's bodies, and so the shipped levels'
  // physics, stay exactly as they were.
  const base = world.createBody({ type: 'static', position: { x, y: y + 0.3 } });
  world.addShape(base, { kind: 'box', halfWidth: 0.8, halfHeight: 0.3 });

  const wheelL = world.createBody({ type: 'static', position: { x: x - 0.5, y: y + 0.25 } });
  const wheelR = world.createBody({ type: 'static', position: { x: x + 0.5, y: y + 0.25 } });

  // A-frame: the static uprights the arm pivots between. Same collider treatment as the base
  // (a plain static box/polygon, default friction) - the fuzz releases up-left of the pivot and
  // flies up-right, well clear of the frame's apex, so a solid collider here is safe.
  const frameVerts = [
    { x: -0.5, y: 0 },
    { x: 0.5, y: 0 },
    { x: PIVOT_DX + 0.12, y: 1.0 },
    { x: PIVOT_DX - 0.12, y: 1.0 },
  ];
  const frame = world.createBody({ type: 'static', position: { x, y: y + 0.6 } });
  world.addShape(frame, { kind: 'polygon', vertices: frameVerts });

  // Crossbar: the stop the arm swings down onto and halts on the instant it releases the fuzz,
  // at the release pose itself so it visibly rotates with the angle prop.
  const { pos: crossbarPos, angle: crossbarAngle } = crossbarPose(part);
  const crossbar = world.createBody({ type: 'static', position: crossbarPos, angle: crossbarAngle });
  world.addShape(crossbar, { kind: 'box', halfWidth: 0.25, halfHeight: 0.06 });

  const { id: arm, visuals: armVisuals, bounds: armBounds } = buildArm(world, part);

  const bounds = unionBounds(catapultBaseBounds(part), armBounds);

  // The wheel, A-frame and crossbar bodies keep their colliders (or none, for the wheels) but no
  // longer draw anything of their own: the one base picture shows plank, A-frame and hub.
  const common = { partId: part.id, locked: !!part.locked, lockPosition: !!part.lockPosition };
  const visuals: RenderItem[] = [
    // The base picture (BASE_ART): hub centre exactly on the pivot, plank bottom on the ground.
    { ...common, body: base, shape: { kind: 'box', ...BASE_ART }, color: BASE_COLOR, role: 'base', textureKey: 'real-base' },
    // Angle lever (visual only, no collider - the crossbar collider above stays as is): in the
    // crossbar's local frame (rotated STOP + 90 deg) the pivot lies along local +y at distance
    // 0.75, so LEVER_ART runs from just inside the gear's ring (local y +0.39) out past the knob,
    // its pad centred on the knob LEVER_LENGTH from the pivot (local y -0.75) - where the angle
    // dial widget's handle rides (see spec.ts's `angle` DialWidget).
    { ...common, body: crossbar, shape: { kind: 'box', ...LEVER_ART }, color: BASE_COLOR, role: 'frame', textureKey: 'real-lever' },
    ...armVisuals,
  ];

  return {
    partId: part.id,
    kind: part.kind,
    bodies: [
      { id: base, role: 'base' },
      { id: wheelL, role: 'wheel' },
      { id: wheelR, role: 'wheel' },
      { id: frame, role: 'frame' },
      { id: crossbar, role: 'frame' },
      { id: arm, role: 'arm' },
    ],
    joints: [],
    visuals,
    bounds,
  };
}

function buildCan(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const w = 0.4;
  const h = 0.8;
  const id = world.createBody({ type: 'dynamic', position: { x: part.x, y: part.y } });
  world.addShape(id, { kind: 'box', halfWidth: w / 2, halfHeight: h / 2 }, { density: 0.3, friction: 0.5, restitution: 0.1 });
  const color = CAN_COLORS[part.props.color ?? 'Red'] ?? CAN_COLORS.Red!;
  const shape: Shape = { kind: 'box', w, h };
  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id, role: 'can' }],
    joints: [],
    visuals: [{ partId: part.id, body: id, shape, color, role: 'can', locked: !!part.locked, lockPosition: !!part.lockPosition }],
    bounds: boxBounds(part.x, part.y, w, h),
  };
}

function buildBlock(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const material = (part.props.material as Material) ?? 'wood';
  const spec = MATERIALS[material] ?? MATERIALS.wood;
  const { w, h } = blockSize(part.props.size ?? '1x1');
  const id = world.createBody({ type: 'dynamic', position: { x: part.x, y: part.y } });
  world.addShape(id, { kind: 'box', halfWidth: w / 2, halfHeight: h / 2 }, { density: spec.density, friction: spec.friction });
  const shape: Shape = { kind: 'box', w, h };
  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id, role: 'block' }],
    joints: [],
    visuals: [{ partId: part.id, body: id, shape, color: spec.color, role: 'block', locked: !!part.locked, lockPosition: !!part.lockPosition }],
    bounds: boxBounds(part.x, part.y, w, h),
  };
}

function buildShelf(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const length = Number(part.props.length ?? '2') || 2;
  const h = 0.2;
  const id = world.createBody({ type: 'static', position: { x: part.x, y: part.y } });
  world.addShape(id, { kind: 'box', halfWidth: length / 2, halfHeight: h / 2 }, { friction: 0.6 });
  const shape: Shape = { kind: 'box', w: length, h };
  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id, role: 'solid' }],
    joints: [],
    visuals: [{ partId: part.id, body: id, shape, color: SOLID_COLOR, role: 'solid', locked: !!part.locked, lockPosition: !!part.lockPosition }],
    bounds: boxBounds(part.x, part.y, length, h),
  };
}

function buildWall(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const height = Number(part.props.height ?? '2') || 2;
  const w = 0.4;
  const id = world.createBody({ type: 'static', position: { x: part.x, y: part.y } });
  world.addShape(id, { kind: 'box', halfWidth: w / 2, halfHeight: height / 2 }, { friction: 0.6 });
  const shape: Shape = { kind: 'box', w, h: height };
  return {
    partId: part.id,
    kind: part.kind,
    bodies: [{ id, role: 'solid' }],
    joints: [],
    visuals: [{ partId: part.id, body: id, shape, color: WALL_COLOR, role: 'solid', locked: !!part.locked, lockPosition: !!part.lockPosition }],
    bounds: boxBounds(part.x, part.y, w, height),
  };
}

function buildBullseye(world: PhysicsWorld, part: PlacedPart): PartHandle {
  const r = 0.6;
  // Two bodies (not one with two shapes) so contact events can tell the sensor apart from the
  // post: `StepResult.contacts` carries only a BodyId per side, not a collider/shape id, so a
  // shared body would make a solid hit on the post indistinguishable from a sensor hit.
  const disc = world.createBody({ type: 'static', position: { x: part.x, y: part.y } });
  world.addShape(disc, { kind: 'circle', radius: r }, { sensor: true });

  const postH = Math.max(part.y, 0);
  const post = world.createBody({ type: 'static', position: { x: part.x, y: postH / 2 } });
  world.addShape(post, { kind: 'box', halfWidth: 0.05, halfHeight: postH / 2 }, { friction: 0.6 });

  const bounds = unionBounds(
    boxBounds(part.x, part.y, r * 2, r * 2),
    boxBounds(part.x, postH / 2, 0.1, postH),
  );

  return {
    partId: part.id,
    kind: part.kind,
    bodies: [
      { id: disc, role: 'bullseye' },
      { id: post, role: 'post' },
    ],
    joints: [],
    visuals: [
      { partId: part.id, body: disc, shape: { kind: 'circle', r }, color: BULLSEYE_COLOR, role: 'bullseye', locked: !!part.locked, lockPosition: !!part.lockPosition },
      { partId: part.id, body: post, shape: { kind: 'box', w: 0.1, h: postH }, color: POST_COLOR, role: 'post', locked: !!part.locked, lockPosition: !!part.lockPosition },
    ],
    bounds,
  };
}

/** Turns a placed part into bodies + visuals. Targets = parts of kind `can` or `block`. */
export function buildPart(world: PhysicsWorld, part: PlacedPart): PartHandle {
  switch (part.kind) {
    case 'catapult':
      return buildCatapult(world, part);
    case 'can':
      return buildCan(world, part);
    case 'block':
      return buildBlock(world, part);
    case 'shelf':
      return buildShelf(world, part);
    case 'wall':
      return buildWall(world, part);
    case 'bullseye':
      return buildBullseye(world, part);
    default: {
      const exhaustive: never = part.kind;
      throw new Error(`catapult: unknown part kind ${exhaustive as string}`);
    }
  }
}

/** `true` for parts the level treats as knock-down targets. */
export function isTarget(part: PlacedPart): boolean {
  return part.kind === 'can' || part.kind === 'block';
}

/** The pocket position and launch velocity a catapult fires at the release instant for its
 * current `angle` chip (used by `spawnFuzz()`, and by the range/label overlays). The release
 * point is `armTipPoint(part, armAngleFor(angleDeg))` - the same pocket-on-the-arm formula
 * `catapultPocketAtRest` uses, just evaluated at the release arm-angle instead of REST_ANGLE.
 * The velocity is tangential to the arm at that instant (perpendicular to the arm's own
 * direction): armAngleFor(angleDeg) = 90 + angleDeg, so rotating the arm's direction by -90
 * degrees (the tangent direction for a clockwise sweep) lands exactly on `angleDeg` - one
 * consistent model, not two independent numbers that happen to agree. */
export function catapultRelease(part: PlacedPart): { tip: Vec2; v: Vec2; releaseAngle: number } {
  const armSpec = ARM[part.props.arm ?? 'Short'] ?? ARM.Short!;
  const angleDeg = Number(part.props.angle ?? '45') || 45;
  const releaseAngle = (angleDeg * Math.PI) / 180;
  const tip = armTipPoint(part, armAngleFor(angleDeg));
  const speedBase = LAUNCH_SPEED[part.props.power ?? 'Medium'] ?? LAUNCH_SPEED.Medium!;
  const speed = speedBase * armSpec.factor;
  const v: Vec2 = { x: speed * Math.cos(releaseAngle), y: speed * Math.sin(releaseAngle) };
  return { tip, v, releaseAngle };
}
