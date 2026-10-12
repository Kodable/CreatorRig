// The canvas half of Bruno's modal dialog (2026-10-12, Gao: "whenever a new level is opened, i
// want the whole viewport to dim, then bruno animates in from left (ease out back)"), shared by
// the coaster scene (src/game/CoasterScene.ts) and the builder kit's scene
// (src/kit/BuilderScene.ts) so the two never diverge. The DOM half (the HUD dim, the text box,
// the tap catcher) is src/ui/brunoDialog.ts; `BrunoDialogRunner` there sequences both.
//
// Both scenes draw it with their UI camera (the unclipped one that shows the whole 1024x768 stage
// and never zooms with the ride / follow camera): a black rect over the whole canvas, and the big
// Spine Bruno above it, standing at the bottom-left with his hard hat on (brunoSkin.ts). Bruno is
// hidden between dialogs: he no longer lives in the top bar.
import type Phaser from 'phaser';
import type { SpineGameObject } from '@esotericsoftware/spine-phaser-v4';
import { wearBrunoSkins } from './brunoSkin';
import { prefersReducedMotion } from './goalsIntro';

/** The dim: black at this alpha over the whole canvas (the DOM HUD dims to match, style.css). */
export const STAGE_DIM_ALPHA = 0.55;
/** The dim fades in / out over this long (ms). */
export const DIM_MS = 250;
/** Bruno slides in from the left edge (Back.easeOut) / back out (Quad.easeIn) over this long. */
export const BRUNO_IN_MS = 550;
export const BRUNO_OUT_MS = 300;
/** Bruno's dialog spot: his feet in stage px, and the Spine scale (the rig is 782 units tall with
 * the hat, so 0.3 is about 235 px). The box (brunoDialog.ts) starts at x 240, right of him. */
export const BRUNO_STAGE_X = 122;
export const BRUNO_STAGE_Y = 750;
export const BRUNO_STAGE_SCALE = 0.3;
/** Where he slides in from: his feet this far left of the stage (all of him off screen). */
export const BRUNO_OFF_X = -130;
/** Depths on the UI camera: over everything else the UI camera draws (the corner caps). */
const DEPTH_DIM = 100;
const DEPTH_SHADOW = 100.5;
const DEPTH_BRUNO = 101;

const STAGE_W = 1024;
const STAGE_H = 768;

export class BrunoStage {
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly bruno: SpineGameObject | null;
  private shown = false;

  /**
   * `onUi` assigns a game object to the scene's UI camera only. Bruno failing to load (a missing
   * Spine file throws from `add.spine`) leaves the dim working without him.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    onUi: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    logName: string,
  ) {
    this.dim = onUi(scene.add.rectangle(STAGE_W / 2, STAGE_H / 2, STAGE_W + 40, STAGE_H + 40, 0x000000, 1));
    this.dim.setDepth(DEPTH_DIM);
    this.dim.setAlpha(0);
    this.dim.setVisible(false);

    this.shadow = onUi(scene.add.ellipse(BRUNO_OFF_X, BRUNO_STAGE_Y + 2, 130, 22, 0x000000, 0.3));
    this.shadow.setDepth(DEPTH_SHADOW);
    this.shadow.setVisible(false);

    let bruno: SpineGameObject | null = null;
    try {
      bruno = onUi(scene.add.spine(BRUNO_OFF_X, BRUNO_STAGE_Y, 'engineer', 'floofs'));
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

  /** The object the slide tweens: Bruno, or his shadow when he failed to load. */
  private mover(): { x: number } {
    return this.bruno ?? this.shadow;
  }

  private kill(): void {
    this.scene.tweens.killTweensOf(this.dim);
    this.scene.tweens.killTweensOf(this.shadow);
    if (this.bruno) this.scene.tweens.killTweensOf(this.bruno);
  }

  private setX(x: number): void {
    this.bruno?.setX(x);
    this.shadow.setX(x + (this.bruno ? 8 : 0));
  }

  /** Dims the canvas and slides Bruno in from the left; resolves once he has landed (he then
   * waves once). Under prefers-reduced-motion everything appears at once. */
  show(): Promise<void> {
    this.kill();
    const wasShown = this.shown;
    this.shown = true;
    this.dim.setVisible(true);
    this.bruno?.setVisible(true);
    this.shadow.setVisible(true);
    if (prefersReducedMotion() || wasShown) {
      this.dim.setAlpha(STAGE_DIM_ALPHA);
      this.setX(BRUNO_STAGE_X);
      if (!wasShown) this.wave();
      return Promise.resolve();
    }
    this.setX(BRUNO_OFF_X);
    this.dim.setAlpha(0);
    this.scene.tweens.add({ targets: this.dim, alpha: STAGE_DIM_ALPHA, duration: DIM_MS, ease: 'Linear' });
    return new Promise<void>((resolve) => {
      const proxy = this.mover();
      this.scene.tweens.add({
        targets: proxy,
        x: BRUNO_STAGE_X,
        duration: BRUNO_IN_MS,
        // The slide starts as the dim is half way in.
        delay: DIM_MS / 2,
        ease: 'Back.easeOut',
        onUpdate: () => this.setX(proxy.x),
        onComplete: () => {
          this.setX(BRUNO_STAGE_X);
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
      this.setX(BRUNO_OFF_X);
    };
    if (prefersReducedMotion()) {
      done();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const proxy = this.mover();
      this.scene.tweens.add({
        targets: proxy,
        x: BRUNO_OFF_X,
        duration: BRUNO_OUT_MS,
        ease: 'Quad.easeIn',
        onUpdate: () => this.setX(proxy.x),
      });
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
