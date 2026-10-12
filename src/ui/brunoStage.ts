// The canvas half of Bruno's modal dialog (2026-10-12, Gao: "whenever a new level is opened, i
// want the whole viewport to dim, then bruno animates in from left (ease out back)"; then, the same
// day: "i want him and the darken to be on the visual game frame only"), shared by the coaster
// scene (src/game/CoasterScene.ts) and the builder kit's scene (src/kit/BuilderScene.ts) so the two
// never diverge. The DOM half (the text box, the tap catcher) is src/ui/brunoDialog.ts;
// `BrunoDialogRunner` there sequences both.
//
// Everything here lives on the scene's WORLD camera, whose viewport is clipped to the world panel
// (the game frame), so the dim and Bruno can never draw over the top row or the bottom bar; the
// panel's rounded corners come from the dim's own rounded rect (and, where a scene has them, the
// UI camera's corner caps drawn on top). The world camera zooms and pans (the coaster's ride
// camera, the kit's focus / follow / intro pan), so `sync()` (called by the scene every frame,
// after its camera moved) pins the dim and Bruno to fixed STAGE positions inside the panel by
// counter-transforming them against the camera's current view. Bruno is hidden between dialogs.
import type Phaser from 'phaser';
import type { SpineGameObject } from '@esotericsoftware/spine-phaser-v4';
import { wearBrunoSkins } from './brunoSkin';
import { prefersReducedMotion } from './goalsIntro';

/** The dim: black at this alpha over the world panel only. */
export const STAGE_DIM_ALPHA = 0.55;
/** The dim fades in / out over this long (ms). */
export const DIM_MS = 250;
/** Bruno slides in from the panel's left edge (Back.easeOut) / back out (Quad.easeIn). */
export const BRUNO_IN_MS = 550;
export const BRUNO_OUT_MS = 300;
/** Bruno's dialog spot, in stage px: his feet at the panel's bottom-left, and the Spine scale (the
 * rig is 782 units tall with the hat, so 0.36 is about 280 px; 2026-10-12, Gao: "make bruno even
 * bigger, have his feet cut off a little bit at the bottom"). The box (brunoDialog.ts, style.css)
 * starts right of him at x 300. */
export const BRUNO_STAGE_X = 150;
/** His feet sit this far above the panel's bottom edge; negative = below it, so the frame's clip
 * cuts his feet off a little (y 700 on the park courses -> feet at y 712). */
export const BRUNO_FEET_ABOVE_BOTTOM = -12;
export const BRUNO_STAGE_SCALE = 0.36;
/** Where he slides in from: his feet this far left of the panel's left edge (all of him outside
 * the panel, so the camera's clip hides him). */
export const BRUNO_OFF_DX = -170;
/** The panel's corner radius (both scenes draw the world panel with 12 px corners). */
const PANEL_RADIUS = 12;
/** Depths on the world camera: over everything the scene draws there (confetti is 4.5). */
const DEPTH_DIM = 100;
const DEPTH_SHADOW = 100.5;
const DEPTH_BRUNO = 101;

/** The world panel in stage px. */
export interface PanelRect { x0: number; y0: number; x1: number; y1: number }

export class BrunoStage {
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly bruno: SpineGameObject | null;
  private shown = false;
  /** Bruno's feet x in STAGE px (tweened); `sync` maps it into the camera's view. */
  private readonly pos = { x: 0 };
  private readonly feetY: number;
  private readonly offX: number;

  /**
   * `onWorld` assigns a game object to the scene's world camera only (`worldCam`, clipped to
   * `panel`). Bruno failing to load (a missing Spine file throws from `add.spine`) leaves the dim
   * working without him.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    onWorld: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    private readonly worldCam: Phaser.Cameras.Scene2D.Camera,
    private readonly panel: PanelRect,
    logName: string,
  ) {
    this.feetY = panel.y1 - BRUNO_FEET_ABOVE_BOTTOM;
    this.offX = panel.x0 + BRUNO_OFF_DX;
    this.pos.x = this.offX;

    // Drawn once in panel-local stage px (origin at the panel's top-left); `sync` positions and
    // scales it onto the camera's view.
    this.dim = onWorld(scene.add.graphics());
    this.dim.fillStyle(0x000000, 1);
    this.dim.fillRoundedRect(0, 0, panel.x1 - panel.x0, panel.y1 - panel.y0, PANEL_RADIUS);
    this.dim.setDepth(DEPTH_DIM);
    this.dim.setAlpha(0);
    this.dim.setVisible(false);

    this.shadow = onWorld(scene.add.ellipse(0, 0, 104, 18, 0x000000, 0.3));
    this.shadow.setDepth(DEPTH_SHADOW);
    this.shadow.setVisible(false);

    let bruno: SpineGameObject | null = null;
    try {
      bruno = onWorld(scene.add.spine(0, 0, 'engineer', 'floofs'));
      wearBrunoSkins(bruno); // the hard hat lives in its own skin (brunoSkin.ts)
      bruno.setScale(BRUNO_STAGE_SCALE);
      bruno.setDepth(DEPTH_BRUNO);
      bruno.animationState.setAnimation(0, 'engineer_idle', true);
      bruno.setVisible(false);
    } catch (err) {
      console.warn(`${logName}: Bruno (Spine) failed to load; continuing without Bruno.`, err);
      bruno = null;
    }
    this.bruno = bruno;
  }

  /** Bruno is on stage (from `show` until `hide` starts). */
  get visible(): boolean {
    return this.shown;
  }

  /**
   * Pins the dim and Bruno to their stage spots inside the panel, whatever the world camera's
   * zoom and scroll. The view is computed from the camera's scroll/zoom the way Phaser's
   * `preRender` does, so it is this frame's view even before Phaser updates `worldView`. Call
   * every frame after the scene moved its camera; cheap, and a no-op while nothing shows.
   */
  sync(): void {
    if (!this.dim.visible) return;
    const cam = this.worldCam;
    const sx = cam.useBounds ? cam.clampX(cam.scrollX) : cam.scrollX;
    const sy = cam.useBounds ? cam.clampY(cam.scrollY) : cam.scrollY;
    const viewW = cam.width / cam.zoomX;
    const viewH = cam.height / cam.zoomY;
    const vx = sx + cam.width * cam.originX - viewW / 2;
    const vy = sy + cam.height * cam.originY - viewH / 2;
    const p = this.panel;
    // World units per stage px: the panel's stage size spans the camera's whole view.
    const k = viewW / (p.x1 - p.x0);
    const kY = viewH / (p.y1 - p.y0);
    this.dim.setPosition(vx, vy);
    this.dim.setScale(k, kY);
    const bx = vx + (this.pos.x - p.x0) * k;
    const by = vy + (this.feetY - p.y0) * kY;
    this.bruno?.setPosition(bx, by);
    this.bruno?.setScale(BRUNO_STAGE_SCALE * k);
    this.shadow.setPosition(bx + (this.bruno ? 6 * k : 0), by + 2 * k);
    this.shadow.setScale(k);
  }

  private kill(): void {
    this.scene.tweens.killTweensOf(this.dim);
    this.scene.tweens.killTweensOf(this.pos);
  }

  /** Dims the panel and slides Bruno in from its left edge; resolves once he has landed (he then
   * waves once). Called again while he is up (a newer level's intro), he slides in afresh over the
   * dim that is already there. Under prefers-reduced-motion everything appears at once. */
  show(): Promise<void> {
    this.kill();
    this.shown = true;
    this.dim.setVisible(true);
    this.bruno?.setVisible(true);
    this.shadow.setVisible(true);
    if (prefersReducedMotion()) {
      this.dim.setAlpha(STAGE_DIM_ALPHA);
      this.pos.x = BRUNO_STAGE_X;
      this.sync();
      this.wave();
      return Promise.resolve();
    }
    const dimmed = this.dim.alpha >= STAGE_DIM_ALPHA - 1e-3;
    this.pos.x = this.offX;
    this.sync();
    if (!dimmed) this.scene.tweens.add({ targets: this.dim, alpha: STAGE_DIM_ALPHA, duration: DIM_MS, ease: 'Linear' });
    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this.pos,
        x: BRUNO_STAGE_X,
        duration: BRUNO_IN_MS,
        // The slide starts as the dim is half way in.
        delay: dimmed ? 0 : DIM_MS / 2,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.wave();
          resolve();
        },
        onStop: () => resolve(),
      });
    });
  }

  /** Slides Bruno back out to the left while the dim fades; resolves once both are done. */
  hide(): Promise<void> {
    this.kill();
    if (!this.shown && !this.dim.visible) return Promise.resolve();
    this.shown = false;
    const done = (): void => {
      this.dim.setVisible(false);
      this.dim.setAlpha(0);
      this.bruno?.setVisible(false);
      this.shadow.setVisible(false);
      this.pos.x = this.offX;
    };
    if (prefersReducedMotion()) {
      done();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.scene.tweens.add({ targets: this.pos, x: this.offX, duration: BRUNO_OUT_MS, ease: 'Quad.easeIn' });
      // The dim starts fading as Bruno is half way out, so the whole close takes ~400 ms.
      this.scene.tweens.add({
        targets: this.dim,
        alpha: 0,
        duration: DIM_MS,
        delay: BRUNO_OUT_MS / 2,
        ease: 'Linear',
        onComplete: () => {
          done();
          resolve();
        },
        onStop: () => resolve(),
      });
    });
  }

  /** Bruno waves once, then idles. No-op while he is off stage or failed to load. */
  wave(): void {
    const bruno = this.bruno;
    if (!bruno || !this.shown) return;
    bruno.animationState.setAnimation(0, 'engineer_wave', false);
    bruno.animationState.addAnimation(0, 'engineer_idle', true, 0);
  }
}
