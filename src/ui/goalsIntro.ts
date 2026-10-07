// Level-start goals intro, shared by the coaster HUD (src/ui/hud.ts) and the builder kit's HUD
// (src/kit/BuilderHud.ts, `hud.goalsOverlay` courses). 2026-10-06, Gao: "show the goals more front
// and center, then animate it to the top left": the goal panel (`.goals-overlay`, over the world
// panel's top-left corner) pops up big in the middle of the world panel, holds so the child reads
// it, then glides and shrinks into its spot. 2026-10-07: extracted from BuilderHud so the coaster
// plays the very same animation.

/** Stage x of the world panel's left edge and its width (x 32..992 on every course). */
export const PANEL_LEFT = 32;
export const PANEL_W = 960;

/** The panel pops up `GOALS_INTRO_SCALE` times its size in the middle of the world panel
 * (`GOALS_INTRO_RAISE` px above centre), holds, then glides to its top-left spot; the offsets split
 * the run into pop / hold / glide. */
export const GOALS_INTRO_MS = 1900; // 2026-10-06: 2.6 s felt slow (Gao) — 0.25 s pop, 1.1 s hold, 0.55 s glide
export const GOALS_INTRO_SCALE = 1.7;
export const GOALS_INTRO_RAISE = 40;
export const GOALS_INTRO_POP_AT = 0.13;
export const GOALS_INTRO_GLIDE_AT = 0.71;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);
}

/**
 * Plays the intro on `el` (the goals panel, laid out at its resting spot) over the world panel
 * whose top/bottom edges are `panelTop`/`panelBottom` in stage px. Layout px inside the HUD root
 * are stage px (the root is scaled as a whole), so the offsets are plain differences of stage
 * coordinates. A Web Animations run with `fill: 'backwards'` and no lasting effect: once it ends
 * (or is cancelled) the panel sits where its CSS puts it.
 *
 * Returns the Animation, which the caller keeps so the next level load can `cancel()` it, or null
 * when nothing plays: prefers-reduced-motion, no Web Animations API, or a panel with no layout
 * box (hidden or detached).
 */
export function playGoalsIntro(el: HTMLElement, panelTop: number, panelBottom: number): Animation | null {
  if (prefersReducedMotion() || typeof el.animate !== 'function') return null;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (w === 0 || h === 0) return null;
  const dx = PANEL_LEFT + PANEL_W / 2 - (el.offsetLeft + w / 2);
  const dy = (panelTop + panelBottom) / 2 - GOALS_INTRO_RAISE - (el.offsetTop + h / 2);
  const big = `translate(${dx}px, ${dy}px) scale(${GOALS_INTRO_SCALE})`;
  const small = `translate(${dx}px, ${dy}px) scale(${GOALS_INTRO_SCALE * 0.8})`;
  return el.animate(
    [
      { opacity: 0, transform: small, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.3)' },
      { opacity: 1, transform: big, offset: GOALS_INTRO_POP_AT, easing: 'linear' },
      { opacity: 1, transform: big, offset: GOALS_INTRO_GLIDE_AT, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: GOALS_INTRO_MS, fill: 'backwards' },
  );
}
