/**
 * The riding fuzz's juice (2026-10-15, Jon: "like when it jumps, the fuzz squishes a bit ... maybe
 * have it do a little backflip if it reaches a second in the air"). Pure helpers CoasterScene layers
 * on the drawn fuzz: a stretch with speed, a squish on hard landings, a backflip once one airborne
 * stretch lasts a second, and a happy bounce at the end of the track. Cosmetic only: the sim and the
 * metrics never see any of it.
 */

/** One airborne stretch this long (seconds) earns a backflip. */
export const FLIP_AIR_S = 1;
/** The backflip's length (ms): one full turn backwards with a little extra lift. */
export const FLIP_MS = 620;
/** Extra lift at the middle of the flip (stage px), over the float's own lift. */
export const FLIP_LIFT_PX = 8;

/**
 * Counts the current airborne stretch and fires once per stretch when it reaches FLIP_AIR_S. A
 * brief dip back on the rail (under GRACE_S, a crest that touches 0.3 g for a step) does not end
 * the stretch.
 */
export class FlipTrigger {
  static readonly GRACE_S = 0.05;
  private air = 0;
  private ground = 0;
  private fired = false;

  /** Feed one frame: airborne or not, and the frame's seconds. True on the frame the flip starts. */
  update(airborne: boolean, dt: number): boolean {
    if (airborne) {
      this.ground = 0;
      this.air += dt;
      if (!this.fired && this.air >= FLIP_AIR_S - 1e-9) {
        this.fired = true;
        return true;
      }
      return false;
    }
    this.ground += dt;
    if (this.ground >= FlipTrigger.GRACE_S) {
      this.air = 0;
      this.fired = false;
    }
    return false;
  }

  /** Seconds of the current stretch (0 on the rail). */
  get airSeconds(): number {
    return this.air;
  }

  reset(): void {
    this.air = 0;
    this.ground = 0;
    this.fired = false;
  }
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** The flip `t` ms in: turns done backwards (0..1, eased in and out) and the extra lift (px). */
export function flipPose(t: number): { turns: number; liftPx: number; active: boolean } {
  if (t < 0 || t >= FLIP_MS) return { turns: t >= FLIP_MS ? 1 : 0, liftPx: 0, active: false };
  const p = t / FLIP_MS;
  const turns = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
  return { turns, liftPx: FLIP_LIFT_PX * Math.sin(Math.PI * p), active: true };
}

/** Speed stretch along the rail: round below 6 m/s, up to 1.14 long (and thinner) at 26 m/s. */
export function speedStretch(speed: number): number {
  return 1 + 0.14 * clamp01((Math.abs(speed) - 6) / 20);
}

/**
 * A hard landing: the seat g jumped by at least LAND_G_JUMP within a frame while coming off a float,
 * or the fuzz lands from a float into more than 2 g. Returns how hard (0..1), 0 when it is not one.
 */
export const LAND_G_JUMP = 1.2;
export function landingHit(prevG: number, g: number, wasAirborne: boolean): number {
  const jump = g - prevG;
  if (wasAirborne && g > 0.3 && (jump >= LAND_G_JUMP || g >= 2)) return clamp01((Math.max(jump, g - 1)) / 3);
  if (jump >= LAND_G_JUMP * 2) return clamp01(jump / 5);
  return 0;
}

/** The landing squish `t` ms after a hit of strength `k`: squash along the fuzz's up, springing back. */
export const LAND_SQUISH_MS = 260;
export function landingSquish(t: number, k: number): number {
  if (t < 0 || t >= LAND_SQUISH_MS || k <= 0) return 1;
  const p = t / LAND_SQUISH_MS;
  return 1 - (0.12 + 0.18 * k) * Math.exp(-4 * p) * Math.cos(3 * Math.PI * p);
}

/** The happy bounce at the end of the track: two hops (14 px, then 7 px) with a squish between. */
export const HAPPY_MS = 760;
export function happyBounce(t: number): { liftPx: number; sy: number; active: boolean } {
  if (t < 0 || t >= HAPPY_MS) return { liftPx: 0, sy: 1, active: false };
  const hop = (p: number, h: number): number => h * 4 * p * (1 - p);
  // 0..80 ms crouch, 80..400 first hop, 400..470 squish, 470..700 second hop, 700..760 settle.
  if (t < 80) return { liftPx: 0, sy: 1 - 0.18 * (t / 80), active: true };
  if (t < 400) return { liftPx: hop((t - 80) / 320, 14), sy: 1.08, active: true };
  if (t < 470) return { liftPx: 0, sy: 0.84 + 0.16 * ((t - 400) / 70), active: true };
  if (t < 700) return { liftPx: hop((t - 470) / 230, 7), sy: 1.04, active: true };
  return { liftPx: 0, sy: 0.92 + 0.08 * ((t - 700) / 60), active: true };
}
