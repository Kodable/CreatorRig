// The planets the rover drives on (2026-10-09, Gao: "i want to introduce more planets, so we cant
// call it mars rover specifically anymore ... the introduction levels to be on flooftopia, which
// is like earth but for the floofs ... the current challenge levels on mars, but adjust for the
// gravity ... new challenge levels on europa, where the surface is covered ice"). A level names
// its planet (`VehicleLevel.planet`); the planet sets the gravity the sim runs at, the ground the
// level has wherever its `surfaces` say nothing, and the sky look (spec.ts `world.looks`). Pure
// data: no physics or Phaser imports.
import { DRIVE } from './catalog';
import type { SurfaceKind } from './surfaces';

export type PlanetId = 'flooftopia' | 'mars' | 'europa';

export interface Planet {
  id: PlanetId;
  /** What Bruno and the HUD call it (the level picker's chapter, `Level.chapter`). */
  name: string;
  /** Gravity (m/s^2, positive; the world pulls toward -y). */
  gravity: number;
  /** The ground everywhere a level's `surfaces` do not cover. */
  ground: SurfaceKind;
  /** The `WorldSpec.looks` key its levels are drawn with (spec.ts). */
  look: string;
  /** Each wheel motor's torque cap (N.m): catalog.ts DRIVE.torque scaled with gravity (see
   * `PLANETS`). */
  driveTorque: number;
}

/** The gravity the course ran at for every level until 2026-10-09: Flooftopia's. */
export const HOME_GRAVITY = 10;

function planet(id: PlanetId, name: string, gravity: number, ground: SurfaceKind): Planet {
  return { id, name, gravity, ground, look: id, driveTorque: (DRIVE.torque * gravity) / HOME_GRAVITY };
}

/** Flooftopia's 10 is the course's old gravity exactly (the sim ran at -10 for every level until
 * 2026-10-09), so the five intro levels, now on Flooftopia, keep their proven solutions. Mars is
 * 3.7 (0.38 g) and Europa 1.3 (0.13 g), the real values.
 *
 * The wheel motors' torque scales with gravity (`driveTorque`: 4 N.m on Flooftopia, 1.48 on Mars,
 * 0.52 on Europa). At full torque under Mars gravity every plain build (two or three round
 * wheels, with or without springs) reared up at the start and flipped onto its back within 2 s on
 * flat ground: the wheels pull as hard as on Flooftopia while the rover weighs 0.38 as much. With
 * the torque scaled, the wheels pull the same in proportion to the rover's weight, so a build
 * drives, climbs and grips the way it does at home, and what changes on another planet is what
 * gravity itself changes: jumps fly farther and flatter, bumps throw the rover higher, landings
 * are softer, and fans, stoves and jets (which do not scale) push a lighter rover harder. Top
 * speed stays DRIVE.speed everywhere; the rover just takes longer to reach it. */
export const PLANETS: Record<PlanetId, Planet> = {
  flooftopia: planet('flooftopia', 'Flooftopia', HOME_GRAVITY, 'grass'),
  mars: planet('mars', 'Mars', 3.7, 'rock'),
  europa: planet('europa', 'Europa', 1.3, 'ice'),
};

export const PLANET_IDS: readonly PlanetId[] = ['flooftopia', 'mars', 'europa'];

/** The world gravity vector for a planet. */
export function gravityOf(planet: PlanetId): { x: number; y: number } {
  return { x: 0, y: -PLANETS[planet].gravity };
}
