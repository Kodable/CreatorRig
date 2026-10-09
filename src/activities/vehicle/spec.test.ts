import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILD_BLUE,
  BUILD_SIZE,
  DRIVE_GREEN,
  DRIVE_SIZE,
  FOCUS_ZOOM,
  IDLE_DRIVE_SIZE,
  INTRO_MS,
  bigPillPx,
  buildExtent,
  buildFrame,
  driveButtonAt,
  frameView,
  idleButtonsAt,
  introPan,
  PLANET_LOOKS,
  rimSnap,
  vehicleSpec,
  viewFrameAt,
} from './spec';
import { PLANETS, PLANET_IDS } from './core/planets';
import { resolveLook } from '../../kit/looks';
import { roverCoach } from './coach';
import { PICS, ROVER_R, groundPictures } from './core/art';
import { GROUND_DEPTH, WORLD_H } from './core/build';
import { VIEW_W, WORLD_W, heightAt } from './core/terrain';
import { ATTACHMENT_KINDS, BLURBS, CATALOG, MOUNT_DESCRIPTOR, partCost } from './core/catalog';
import { SPAWN, THETA_STEP, normalizeRoverParts, rimPoint } from './core/geometry';
import { LEVELS, findLevel } from './core/levels';
import type { AttachmentKind, Metrics, PartKind, RoverPart, VehicleLevel } from './core/types';
import type { CameraFrame, TapWidget, Vec2 } from '../../kit/types';

const PUBLIC = resolve(__dirname, '../../../public');
const DEG = Math.PI / 180;
const LEVEL = findLevel('wheels')!;

function domeOf(level: VehicleLevel): RoverPart {
  return level.parts.find((p) => p.kind === 'rover')!;
}

/** The level's parts plus `sticks`, normalized as the app does before every build. */
function buildOn(level: VehicleLevel, sticks: [AttachmentKind, number, string?][]): RoverPart[] {
  const dome = domeOf(level);
  const parts: RoverPart[] = [
    ...level.parts,
    ...sticks.map(([kind, deg, mount], i) => {
      const p = rimPoint(deg * DEG);
      return { id: 20 + i, kind, x: dome.x + p.x, y: dome.y + p.y, props: { mount: mount ?? 'cup' } };
    }),
  ];
  return normalizeRoverParts(parts, level.terrain);
}

/** The kit's camera clamp per the frozen contract (WorldSpec.worldW): the view is 960 / ppm m wide
 * at zoom 1 (30 m here, even though the world is 90 m) and stays inside x 0..worldW and the
 * panel's band y -groundDepth..worldH - groundDepth. Written out here so these tests do not
 * depend on the kit's camera code while it learns wide worlds. */
function clampToWorld(f: CameraFrame): CameraFrame {
  const w = vehicleSpec.world;
  const halfW = 960 / w.ppm / f.zoom / 2;
  const halfH = w.worldH / f.zoom / 2;
  const d = w.groundDepth ?? 0;
  return {
    cx: Math.max(halfW, Math.min(w.worldW - halfW, f.cx)),
    cy: Math.max(-d + halfH, Math.min(w.worldH - d - halfH, f.cy)),
    zoom: f.zoom,
  };
}

interface Box { x0: number; x1: number; y0: number; y1: number }

/** The world rectangle the camera shows at a frame, left of the open drawer (340 of 960 px). The
 * world panel is 960 x WORLD_H * 32 stage px (612 since 2026-10-06; kit view.ts panelTopY). */
function uncoveredView(frame: { cx: number; cy: number; zoom: number }): Box {
  const f = clampToWorld(frame);
  const viewW = 960 / (32 * f.zoom);
  const viewH = (WORLD_H * 32) / (32 * f.zoom);
  const x0 = f.cx - viewW / 2;
  return { x0, x1: x0 + (viewW * 620) / 960, y0: f.cy - viewH / 2, y1: f.cy + viewH / 2 };
}

const BIG_BUILD: [AttachmentKind, number, string?][] = [
  ['wheelCircle', -45, 'spring'],
  ['wheelCircle', -135, 'spring'],
  ['wheelSquare', -90, 'spring'],
  ['jet', 180, 'spring'],
  ['jet', 0, 'spring'],
  ['watermelon', 90, 'spring'],
  ['stove', 135, 'spring'],
];

/** The biggest box any build reaches (probed over every kind, mount and rim angle): a square
 * wheel on a spring under the dome lifts it highest, a melon on a spring is the tallest part on
 * top and the widest at the front and the back. */
const HUGE_BUILD: [AttachmentKind, number, string?][] = [
  ['wheelCircle', -45, 'spring'],
  ['wheelCircle', -135, 'spring'],
  ['wheelSquare', -90, 'spring'],
  ['watermelon', 90, 'spring'],
  ['watermelon', 0, 'spring'],
  ['watermelon', 180, 'spring'],
];

/** Builds the layout tests try on every level: the bare dome, the level-1 solution, two big ones. */
const BUILDS: Record<string, [AttachmentKind, number, string?][]> = {
  bare: [],
  plain: [['wheelCircle', -45], ['wheelCircle', -135]],
  big: BIG_BUILD,
  huge: HUGE_BUILD,
};

/** A pill's box (world m) at centre `at` for a 'big' widget of `size` px at camera zoom `zoom`
 * (the course's own size budget, pulse included). */
function pillBox(at: Vec2, size: number, zoom: number): Box {
  const { w, h } = bigPillPx(size);
  const hw = w / (2 * 32 * zoom);
  const hh = h / (2 * 32 * zoom);
  return { x0: at.x - hw, x1: at.x + hw, y0: at.y - hh, y1: at.y + hh };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function inside(a: Box, b: Box): boolean {
  return a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
}

/** The highest ground under x0..x1 (sampled every 5 cm). */
function groundUnder(level: VehicleLevel, x0: number, x1: number): number {
  let top = -Infinity;
  for (let x = x0; x <= x1 + 1e-9; x += 0.05) top = Math.max(top, heightAt(level.terrain, x));
  return Math.max(top, heightAt(level.terrain, x1));
}

describe('vehicleSpec: wiring', () => {
  it('free building: drawer on, a part spawns at SPAWN, normalizeParts snaps it, no overlap resolve, no write-back', () => {
    expect(vehicleSpec.drawer).toBe(true);
    expect(vehicleSpec.spawn).toEqual(SPAWN);
    expect(vehicleSpec.resolveOverlaps).toBe(false);
    expect(vehicleSpec.writeBackSettled).toBe(false);
    expect(vehicleSpec.partCost).toBe(partCost);
    const parts = [...LEVEL.parts, { id: 9, kind: 'fan' as PartKind, x: 9, y: 1, props: { mount: 'cup' } }];
    expect(vehicleSpec.normalizeParts!(parts, LEVEL)).toEqual(normalizeRoverParts(parts, LEVEL.terrain));
    expect(vehicleSpec.levels).toBe(LEVELS);
    expect(vehicleSpec.catalog).toBe(CATALOG);
  });

  it('palette chips show each part with its cost (kit reads partCost on default props)', () => {
    for (const kind of ATTACHMENT_KINDS) {
      expect(vehicleSpec.partCost!({ id: 0, kind, x: 0, y: 0, props: vehicleSpec.defaultProps(kind) })).toBeGreaterThan(0);
    }
  });

  it('textures: every real rover picture, the ground pictures (rocks, sand and ice effects) and the boulder, all on disk', () => {
    const textures = vehicleSpec.textures!;
    for (const p of Object.values(PICS)) expect(textures[p.key]?.url).toBe(`parts/rover/real/${p.file}`);
    for (const p of groundPictures()) expect(textures[p.key]?.url).toBe(`parts/rover/${p.file}`);
    expect(textures['rv-boulder']).toBeDefined();
    for (const t of Object.values(textures)) expect(existsSync(resolve(PUBLIC, t.url)), t.url).toBe(true);
  });

  it('the ground pictures are the size art.ts says (the berm and rock geometry depend on it)', () => {
    for (const p of groundPictures()) {
      const png = readFileSync(resolve(PUBLIC, `parts/rover/${p.file}`));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], p.file).toEqual([p.w, p.h]);
    }
  });

  it('the world keeps the 2026-09-22 ground: 1.5 m of course-drawn ground', () => {
    expect(vehicleSpec.world.groundDepth).toBe(GROUND_DEPTH);
    expect(vehicleSpec.world.groundBand).toBe(false);
  });

  it('a wide world (2026-10-05): 90 m at ppm 32, so the panel shows a 30 m window and scrolls', () => {
    expect(vehicleSpec.world.worldW).toBe(WORLD_W);
    expect(WORLD_W).toBe(90);
    expect(vehicleSpec.world.ppm).toBe(32);
    expect(960 / vehicleSpec.world.ppm).toBe(VIEW_W);
    expect(vehicleSpec.world.worldH).toBe(WORLD_H);
  });

  it('2026-10-09: one sky look per planet, keyed by the planet look every level of that planet names; the world\'s own sky is Mars\'s', () => {
    const looks = vehicleSpec.world.looks!;
    expect(Object.keys(looks).sort()).toEqual(PLANET_IDS.map((id) => PLANETS[id].look).sort());
    for (const level of LEVELS) expect(looks[level.look!], level.id).toBeDefined();
    expect(vehicleSpec.world.sky).toEqual(PLANET_LOOKS.mars.sky);
    expect(vehicleSpec.world.backgrounds).toEqual(PLANET_LOOKS.mars.backgrounds);
    // Each look resolves (kit looks.ts) to its own sky and pictures.
    expect(resolveLook(vehicleSpec.world, 'europa').sky).toEqual(PLANET_LOOKS.europa.sky);
    expect(resolveLook(vehicleSpec.world, 'flooftopia').backgrounds).toEqual(PLANET_LOOKS.flooftopia.backgrounds);
  });

  it('every look picture is on disk; the repeated far strips cover the whole world, standing on the panel bottom; the pictures under 1.5 MB', () => {
    for (const id of PLANET_IDS) {
      const bgs = PLANET_LOOKS[id].backgrounds;
      for (const bg of bgs) {
        const file = resolve(PUBLIC, bg.url);
        expect(existsSync(file), bg.url).toBe(true);
        expect(statSync(file).size, bg.url).toBeLessThan(1.5e6);
      }
      const far = bgs.filter((b) => b.url.endsWith('-far.png') || b.url.endsWith('-hills.png'));
      expect(far.length, id).toBeGreaterThan(0);
      expect(Math.min(...far.map((b) => b.x - b.w / 2))).toBeCloseTo(0, 9);
      expect(Math.max(...far.map((b) => b.x + b.w / 2))).toBeGreaterThanOrEqual(WORLD_W);
      for (const b of far) expect(b.y - b.h / 2).toBeCloseTo(-GROUND_DEPTH, 9);
    }
  });

  it('Mars has its two little moons in the first view and no red planet in its sky; Europa has Jupiter low on the horizon', () => {
    const mars = PLANET_LOOKS.mars.backgrounds.map((b) => b.url);
    expect(mars).toContain('bg/mars-phobos.png');
    expect(mars).toContain('bg/mars-deimos.png');
    expect(mars.some((u) => u.includes('mars-sky') || u.includes('mars-planet'))).toBe(false);
    const jupiter = PLANET_LOOKS.europa.backgrounds.find((b) => b.url === 'bg/jupiter.png')!;
    expect(jupiter.x + jupiter.w / 2).toBeLessThan(VIEW_W);
    expect(jupiter.y - jupiter.h / 2).toBeLessThan(0); // its bottom sinks behind the ice
  });

  it('2026-10-05 playtest, part 2: DRIVE is back in the (centred) bottom bar, a win banner, the coach, a rim-snap preview', () => {
    // No course override any more: the kit's own bar Play button is DRIVE (its label comes from
    // hud.lines.launch/playAgain below).
    expect(vehicleSpec.hud.playInBar).toBeUndefined();
    expect(vehicleSpec.hud.winBanner).toBe(true);
    expect(vehicleSpec.coach).toBe(roverCoach);
    expect(vehicleSpec.idleWidgets).toBeTypeOf('function');
    expect(vehicleSpec.dragSnap).toBeTypeOf('function');
    expect(vehicleSpec.hud.lines.refused).toBe('Not enough coins for that part!');
    expect(vehicleSpec.hud.lines.launch).toBe('▶ DRIVE');
    expect(vehicleSpec.hud.lines.playAgain).toBe('▶ DRIVE again');
  });

  it('every palette kind has its blurb (shelf title and unlock callout); the level-placed kinds have none', () => {
    for (const level of LEVELS) {
      for (const kind of level.palette) {
        const blurb = vehicleSpec.hud.partInfo[kind].blurb;
        expect(blurb, kind).toBe(BLURBS[kind as AttachmentKind]);
        expect(blurb!.length, kind).toBeGreaterThan(0);
      }
    }
    for (const kind of ['rover', 'block', 'finish'] as PartKind[]) expect(vehicleSpec.hud.partInfo[kind].blurb).toBeUndefined();
  });

  it('the drawer shows the Mount options\' own labels (no chip-label override hides "Spring (bouncy, +1 coin)")', () => {
    const chip = vehicleSpec.hud.chipLabels ?? {};
    for (const o of MOUNT_DESCRIPTOR.options) expect(chip[o.label] ?? chip[o.value] ?? o.label).toBe(o.label);
  });

  it('hud: a label and an emoji icon for every kind; DRIVE launch; the refused line is about coins', () => {
    for (const kind of Object.keys(CATALOG) as PartKind[]) {
      expect(vehicleSpec.hud.partInfo[kind].label.length).toBeGreaterThan(0);
      expect(vehicleSpec.hud.partInfo[kind].icon.length).toBeGreaterThan(0);
    }
    expect(vehicleSpec.hud.lines.launch).toContain('DRIVE');
    expect(vehicleSpec.hud.lines.refused).toMatch(/coins/i);
    // Upside down is not a failure since 2026-10-05: a rover on its roof drives on, or ends stuck.
    expect(vehicleSpec.hud.failOutcomes).toEqual(['fell', 'stuck', 'timeout']);
    expect(vehicleSpec.hud.meters.map((m) => m.metric)).toContain('upsideDown');
    for (const level of LEVELS) expect(Object.keys(level.failHints)).not.toContain('flipped');
  });

  it('every palette kind (every attachment) has a parts-shelf picture and a group; the other kinds have neither', () => {
    const GROUPS = ['Wheels', 'Power', 'Weights'];
    for (const kind of ATTACHMENT_KINDS) {
      const info = vehicleSpec.hud.partInfo[kind];
      expect(info.image, kind).toBeTruthy();
      expect(GROUPS, kind).toContain(info.group);
      expect(existsSync(resolve(PUBLIC, info.image!)), info.image).toBe(true);
    }
    // Every level's palette is drawn only from the attachments, so this is every kind a child can
    // ever add; `rover`, `block` and `finish` are level-placed only and show nowhere.
    for (const level of LEVELS) for (const kind of level.palette) expect(ATTACHMENT_KINDS).toContain(kind);
    for (const kind of ['rover', 'block', 'finish'] as PartKind[]) {
      expect(vehicleSpec.hud.partInfo[kind].image).toBeUndefined();
      expect(vehicleSpec.hud.partInfo[kind].group).toBeUndefined();
    }
    // The three wheel and three power pictures are already near-square; only the two very
    // non-square weight pictures (feather 586x193, watermelon 627x398) get a padded icon.
    expect(vehicleSpec.hud.partInfo.feather.image).toContain('icon-feather.png');
    expect(vehicleSpec.hud.partInfo.watermelon.image).toContain('icon-watermelon.png');
    expect(vehicleSpec.hud.partInfo.beans.image).toContain('weight-beans.png');
  });

  it('play mode follows the dome', () => {
    expect(vehicleSpec.follow!(LEVEL, 'running', 0)?.roles).toEqual(['rover']);
    expect(vehicleSpec.follow!(LEVEL, 'finished', 3)).toBeNull();
  });
});

describe('vehicleSpec.focusFrame', () => {
  it('one frame for the dome and every attachment (stable while the child builds), zoom 2.8', () => {
    const parts = buildOn(LEVEL, [['wheelCircle', -45], ['fan', 180]]);
    const frames = parts.filter((p) => p.kind !== 'finish').map((p) => vehicleSpec.focusFrame!(p, LEVEL));
    for (const f of frames) expect(f).toEqual(frames[0]);
    expect(frames[0]!.zoom).toBe(FOCUS_ZOOM);
    expect(FOCUS_ZOOM).toBe(2.8);
    expect(buildFrame(LEVEL)).toEqual(frames[0]);
  });

  it('kept near 2.8, not below the 2.4 tactile-size floor (the fit arithmetic comment\'s numbers)', () => {
    expect(FOCUS_ZOOM).toBeGreaterThanOrEqual(2.4);
    expect(FOCUS_ZOOM).toBeCloseTo(2.8, 9);
    // Every level places the dome at x 3 (levels.ts ROVER_X): the kit's left clamp always wins,
    // so the uncovered strip's left edge sits on the world wall (x0 = 0) and cx lands on the
    // clamp (15 / zoom), not on the "dome mid-way across the strip" raw formula.
    const frame = buildFrame(LEVEL)!;
    expect(frame.cx).toBeLessThan(15 / FOCUS_ZOOM); // the raw "dome mid-strip" cx, before the kit clamps it
    expect(clampToWorld(frame).cx).toBeCloseTo(15 / FOCUS_ZOOM, 9);
    const view = uncoveredView(frame);
    expect(view.x0).toBeCloseTo(0, 9);
    expect(view.x1).toBeCloseTo((960 / (32 * FOCUS_ZOOM)) * (620 / 960), 9);
  });

  it('frameView matches the kit clamp written out here (with and without the drawer)', () => {
    for (const level of LEVELS) {
      const frame = buildFrame(level)!;
      const view = frameView(frame, true);
      const want = uncoveredView(frame);
      for (const k of ['x0', 'x1', 'y0', 'y1'] as const) expect(view[k]).toBeCloseTo(want[k], 9);
      const full = frameView(viewFrameAt(3), false);
      expect(full).toEqual({ x0: 0, x1: VIEW_W, y0: -GROUND_DEPTH, y1: WORLD_H - GROUND_DEPTH });
    }
  });

  for (const level of LEVELS) {
    it(`${level.id}: the biggest build and its DRIVE pill fit in the view left of the drawer, the pill over the dome`, () => {
      for (const sticks of [BIG_BUILD, HUGE_BUILD]) {
        const parts = buildOn(level, sticks);
        const ext = buildExtent(parts, level)!;
        const view = uncoveredView(buildFrame(level)!);
        expect(ext.x0).toBeGreaterThan(view.x0);
        expect(ext.x1).toBeLessThan(view.x1);
        expect(ext.y1).toBeLessThan(view.y1);
        expect(view.y0).toBeLessThan(ext.y0); // the wheels and the ground under them show
        const drive = driveButtonAt(parts, level)!;
        const pill = pillBox(drive, DRIVE_SIZE, FOCUS_ZOOM);
        expect(inside(pill, view)).toBe(true);
        expect(overlaps(pill, ext)).toBe(false);
        expect(drive.x).toBeCloseTo(domeOf(level).x, 9); // centred over the dome, not beside
        expect(pill.y0).toBeGreaterThan(ext.y1);
      }
    });
  }
});

describe('vehicleSpec.widgets: no in-scene DRIVE any more (2026-10-05 playtest, part 2: the bar handles it)', () => {
  it('every part (and the scenery) gets no widgets; driveButtonAt stays as tested geometry for the fit arithmetic below', () => {
    const parts = buildOn(LEVEL, [['wheelCircle', -45], ['fan', 180]]);
    for (const part of parts) expect(vehicleSpec.widgets!(part, parts, LEVEL), part.kind).toEqual([]);
    expect(DRIVE_SIZE).toBeLessThan(IDLE_DRIVE_SIZE);
    expect(DRIVE_SIZE).toBeGreaterThanOrEqual(64); // the kit's finger floor
    expect(driveButtonAt(parts, LEVEL)).not.toBeNull();
  });

  it('no rocket: the idle BUILD pill uses 🔧, not a rocket', () => {
    const parts = buildOn(LEVEL, BUILDS.plain!);
    const all = vehicleSpec.idleWidgets!(parts, LEVEL) as TapWidget[];
    for (const w of all) expect(w.icon).not.toContain('🚀');
  });

  // `driveButtonAt`'s geometry (where the bar's DRIVE *would* sit over the build) is kept exactly
  // as tuned, even though nothing renders it now, since catapult/future courses may still want an
  // in-scene fallback and the fit arithmetic comment above depends on these numbers.
  for (const level of LEVELS) {
    it(`${level.id}: driveButtonAt stays inside the strip left of the drawer and clear of every build`, () => {
      const view = uncoveredView(buildFrame(level)!);
      for (const [name, sticks] of Object.entries(BUILDS)) {
        const parts = buildOn(level, sticks);
        const pill = pillBox(driveButtonAt(parts, level)!, DRIVE_SIZE, FOCUS_ZOOM);
        expect(inside(pill, view), name).toBe(true);
        expect(overlaps(pill, buildExtent(parts, level)!), name).toBe(false);
      }
    });
  }
});

describe('vehicleSpec.idleWidgets: just the BUILD pill now (nothing selected)', () => {
  it('one big pill: BUILD (select the dome, blue); idleButtonsAt still computes a drive slot, unused', () => {
    const parts = buildOn(LEVEL, BUILDS.plain!);
    const widgets = vehicleSpec.idleWidgets!(parts, LEVEL) as TapWidget[];
    expect(widgets.map((w) => w.id)).toEqual(['build']);
    const [build] = widgets as [TapWidget];
    expect(build).toMatchObject({ kind: 'tap', style: 'big', action: 'select', partId: domeOf(LEVEL).id, size: BUILD_SIZE, icon: '🔧', label: 'BUILD', color: BUILD_BLUE });
    expect(BUILD_BLUE).toBe(0x05aeed);
    expect(DRIVE_GREEN).toBe(0x61bb46);
    expect(IDLE_DRIVE_SIZE).toBeGreaterThan(BUILD_SIZE);
    const at = idleButtonsAt(parts, LEVEL)!;
    expect(build.at).toEqual(at.build);
    expect(at.drive).toBeDefined(); // kept as geometry only, see idleWidgets' doc comment
    expect(vehicleSpec.idleWidgets!(parts.filter((p) => p.kind !== 'rover'), LEVEL)).toEqual([]);
  });

  for (const level of LEVELS) {
    it(`${level.id}: both pills inside the zoom-1 view, clear of each other, every build and the ground`, () => {
      const view = frameView(viewFrameAt(domeOf(level).x), false);
      for (const [name, sticks] of Object.entries(BUILDS)) {
        const parts = buildOn(level, sticks);
        const ext = buildExtent(parts, level)!;
        const at = idleButtonsAt(parts, level)!;
        const build = pillBox(at.build, BUILD_SIZE, 1);
        const drive = pillBox(at.drive, IDLE_DRIVE_SIZE, 1);
        expect(inside(build, view), name).toBe(true);
        expect(inside(drive, view), name).toBe(true);
        expect(overlaps(build, drive), name).toBe(false);
        expect(overlaps(build, ext), name).toBe(false);
        expect(overlaps(drive, ext), name).toBe(false);
        expect(build.y0, name).toBeGreaterThan(groundUnder(level, build.x0, build.x1));
        expect(drive.y0, name).toBeGreaterThan(groundUnder(level, drive.x0, drive.x1));
        expect(at.drive.x, name).toBeGreaterThan(at.build.x); // DRIVE toward the beacon
      }
    });
  }

  it('BUILD sits right over the dome on every level (the flip mesa too, since the 2026-10-06 taller view)', () => {
    for (const level of LEVELS) {
      const parts = buildOn(level, HUGE_BUILD);
      const ext = buildExtent(parts, level)!;
      const at = idleButtonsAt(parts, level)!;
      const build = pillBox(at.build, BUILD_SIZE, 1);
      expect(build.x0, level.id).toBeLessThan(domeOf(level).x);
      expect(build.x1, level.id).toBeGreaterThan(domeOf(level).x);
      expect(build.y0, level.id).toBeGreaterThan(ext.y1);
    }
  });

  it('a row that does not fit over the build moves both pills beside it, at the top of the view', () => {
    // A mesa so high (13 m) that even the bare dome leaves no room for the row above it.
    const flip = findLevel('flip')!;
    const high: VehicleLevel = { ...flip, terrain: flip.terrain.map((p) => ({ x: p.x, y: p.y > 0 ? 13 : p.y })) };
    const parts = buildOn(high, BUILDS.bare!);
    const ext = buildExtent(parts, high)!;
    const at = idleButtonsAt(parts, high)!;
    const view = frameView(viewFrameAt(domeOf(high).x), false);
    const build = pillBox(at.build, BUILD_SIZE, 1);
    const drive = pillBox(at.drive, IDLE_DRIVE_SIZE, 1);
    expect(build.x0).toBeGreaterThan(ext.x1);
    expect(inside(build, view)).toBe(true);
    expect(inside(drive, view)).toBe(true);
  });

  it('the fit comment\'s numbers: HUGE_BUILD on level 1', () => {
    const at = idleButtonsAt(buildOn(LEVEL, HUGE_BUILD), LEVEL)!;
    const ext = buildExtent(buildOn(LEVEL, HUGE_BUILD), LEVEL)!;
    expect(ext.y1).toBeCloseTo(3.525, 3);
    expect(at.build.x).toBeCloseTo(3.656, 3);
    expect(at.drive.x).toBeCloseTo(11.625, 3);
    expect(at.build.y).toBeCloseTo(5.575, 3);
  });
});

describe('vehicleSpec.dragSnap: the ghost lands on the rim', () => {
  const parts = buildOn(LEVEL, BUILDS.plain!);
  const dome = parts.find((p) => p.kind === 'rover')!;
  const wheel = parts.find((p) => p.kind === 'wheelCircle')!;

  it('an attachment snaps to the rim point on the 5-degree grid that normalizeParts would give it', () => {
    for (let i = 0; i < 200; i++) {
      const a = (i * 137.5 * Math.PI) / 180;
      const r = 0.2 + (i % 7) * 0.6;
      const at = { x: dome.x + r * Math.cos(a), y: dome.y + r * Math.sin(a) };
      const p = vehicleSpec.dragSnap!(wheel, at, parts, LEVEL);
      expect(p).toEqual(rimSnap(wheel, at, parts));
      expect(Math.hypot(p.x - dome.x, p.y - dome.y)).toBeCloseTo(ROVER_R, 9);
      const theta = Math.atan2(p.y - dome.y, p.x - dome.x);
      const steps = theta / THETA_STEP;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6);
      // Dropped there, normalizeParts keeps that rim angle.
      const moved = normalizeRoverParts(parts.map((q) => (q.id === wheel.id ? { ...q, x: at.x, y: at.y } : q)), LEVEL.terrain);
      const domeAfter = moved.find((q) => q.kind === 'rover')!;
      const after = moved.find((q) => q.id === wheel.id)!;
      const thetaAfter = Math.atan2(after.y - domeAfter.y, after.x - domeAfter.x);
      expect(Math.abs(Math.atan2(Math.sin(thetaAfter - theta), Math.cos(thetaAfter - theta)))).toBeLessThan(1e-6);
    }
  });

  it('the dome and the scenery follow the pointer', () => {
    const at = { x: 7.3, y: 4.1 };
    expect(vehicleSpec.dragSnap!(dome, at, parts, LEVEL)).toEqual(at);
    expect(vehicleSpec.dragSnap!(parts.find((p) => p.kind === 'finish')!, at, parts, LEVEL)).toEqual(at);
  });
});

describe('vehicleSpec.partTargets and resultCard', () => {
  it('a new mount flies to the rim point the part is stuck on', () => {
    const parts = buildOn(LEVEL, [['wheelCircle', -45]]);
    const wheel = parts.find((p) => p.kind === 'wheelCircle')!;
    expect(vehicleSpec.partTargets!(wheel, 'mount', 'spring', LEVEL)).toEqual([{ at: { x: wheel.x, y: wheel.y }, size: 0.35 }]);
    expect(vehicleSpec.partTargets!(domeOf(LEVEL), 'mount', 'spring', LEVEL)).toEqual([]);
  });

  it('the result card lists the build (counts per kind, springs) and the coins against the budget', () => {
    const parts = buildOn(LEVEL, [['wheelCircle', -45, 'spring'], ['wheelCircle', -135]]);
    const m: Metrics = { reachedFinish: 1, time: 4.2, flips: 0, distance: 22, upsideDown: 0, topSpeed: 6 };
    const card = vehicleSpec.resultCard!(parts, LEVEL, m, 'finished', true)!;
    expect(card.tone).toBe('pass');
    expect(card.outcome).toContain('4.2');
    expect(card.rows).toContainEqual({ label: `${CATALOG.wheelCircle.icon} Round`, value: '× 2' });
    expect(card.rows).toContainEqual({ label: 'On springs', value: '× 1' });
    expect(card.rows).toContainEqual({ label: 'Coins', value: `5 of ${LEVEL.budget}` });
    const stuck = vehicleSpec.resultCard!(LEVEL.parts, LEVEL, { ...m, reachedFinish: 0, distance: 0.3 }, 'stuck', false)!;
    expect(stuck.tone).toBe('fail');
    expect(stuck.rows[0]).toEqual({ label: 'Parts', value: 'none yet' });
  });

  it('canPlay with the dome', () => {
    expect(vehicleSpec.canPlay(LEVEL.parts, LEVEL, null)).toBe(true);
  });

  it('edit metrics start at zero, upside-down meters included', () => {
    expect(vehicleSpec.editMetrics(LEVEL.parts, LEVEL, null)).toEqual({ reachedFinish: 0, time: 0, flips: 0, distance: 0, upsideDown: 0, topSpeed: 0 });
  });
});

describe('vehicleSpec.intro: the pan from the beacon back to the start', () => {
  it('viewFrameAt: a zoom-1 frame on x, kept inside the world like the kit keeps it', () => {
    expect(viewFrameAt(3)).toEqual({ cx: VIEW_W / 2, cy: WORLD_H / 2 - GROUND_DEPTH, zoom: 1 });
    expect(viewFrameAt(50).cx).toBe(50);
    expect(viewFrameAt(88).cx).toBe(WORLD_W - VIEW_W / 2);
    for (const x of [3, 50, 88]) expect(clampToWorld(viewFrameAt(x))).toEqual(viewFrameAt(x));
  });

  for (const level of LEVELS) {
    const finish = level.parts.find((p) => p.kind === 'finish')!;
    const dome = level.parts.find((p) => p.kind === 'rover')!;
    if (finish.x < VIEW_W) {
      it(`${level.id}: the beacon is in the first view, so no pan`, () => {
        expect(introPan(level)).toBeNull();
        expect(vehicleSpec.intro!(level)).toBeNull();
      });
    } else {
      it(`${level.id}: pans ~2.8 s from a zoom-1 frame on the beacon (x ${finish.x}) to one on the start`, () => {
        const pan = vehicleSpec.intro!(level)!;
        expect(pan).toEqual(introPan(level));
        expect(pan.ms).toBe(INTRO_MS);
        expect(INTRO_MS).toBe(2800);
        expect(pan.from.zoom).toBe(1);
        expect(pan.to.zoom).toBe(1);
        expect(pan.from).toEqual(viewFrameAt(finish.x));
        expect(Math.abs(pan.from.cx - finish.x)).toBeLessThan(VIEW_W / 2 - 1); // the beacon in view
        expect(pan.to).toEqual(viewFrameAt(dome.x));
        expect(pan.to.cx - VIEW_W / 2).toBeLessThanOrEqual(dome.x - 1); // the dome in view
        expect(pan.from.cx).toBeGreaterThan(pan.to.cx);
      });
    }
  }

  // 2026-10-09: no fixed id list any more (Mars and Europa add long levels): a level with goals
  // pans exactly when it is wider than one view (free roam is wide but has no goal to show), and
  // every Flooftopia intro is short.
  it('the long goal levels (wider than one view) pan, the short ones do not', () => {
    const pans = (l: (typeof LEVELS)[number]): boolean => l.goals.length > 0 && l.extentW! > VIEW_W;
    const wrong = LEVELS.filter((l) => (vehicleSpec.intro!(l) !== null) !== pans(l)).map((l) => `${l.id} ${l.extentW}`);
    expect(wrong).toEqual([]);
    expect(LEVELS.filter((l) => l.chapter === 'Flooftopia' && vehicleSpec.intro!(l))).toEqual([]);
    expect(LEVELS.some((l) => vehicleSpec.intro!(l))).toBe(true);
  });
});
