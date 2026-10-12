// Bruno's dialog box, shared by the coaster HUD (src/ui/hud.ts) and the builder kit's HUD
// (src/kit/BuilderHud.ts). 2026-10-12, Gao: "i want him more front and center. so remove him and
// the dialog from the top ... whenever a new level is opened, i want the whole viewport to dim,
// then bruno animates in from left (ease out back). after that, a text box along the bottom of the
// screen appears when he talks, and i want the text to be animated in word by word ... a hint
// should have the same animation as the lesson intro".
//
// Two modes, one look (a plain navy rounded box with a soft drop shadow, words typing in one by
// one):
// - MODAL (the lesson intro on every level load, and a hint): the whole viewport dims, the big
//   canvas Bruno slides in from the left (src/ui/brunoStage.ts), the box rises along the bottom of
//   the screen right of him with the level title (or "Hint 2 of 3") as a small orange label, the
//   line types in, and a tap closes it. `BrunoDialogRunner` sequences the canvas side and this DOM
//   side; the controllers (BuilderApp, src/app.ts) run it and start the level's other start
//   effects (the goals intro, the rover's camera pan) once it closes.
// - QUICK (every other line: play, pass/fail, refused, the rover coach's prompts): the same box,
//   compact and non-modal, docked just above the bottom bar over the free part of the world panel
//   with a small Bruno face at its left. A line animates only when its text changes (both HUDs
//   pass the same line every frame); play/pass/fail lines hide after `quickLineMs`, coach prompts
//   stay while their step is active.
import { prefersReducedMotion } from './goalsIntro';

// ---- timings (ms) ------------------------------------------------------------------------------

/** One word starts this long after the previous one. */
export const WORD_MS = 90;
/** Each word fades/pops in over this long. */
export const WORD_FADE_MS = 150;
/** The modal box rises/fades in, and fades out. */
export const BOX_IN_MS = 200;
export const BOX_OUT_MS = 150;
/** The DOM HUD dims/undims over this long (the canvas dim, brunoStage.ts DIM_MS, matches it). */
export const HUD_DIM_MS = 250;
/** A quick line (not a coach prompt) stays `QUICK_BASE_MS + QUICK_PER_WORD_MS` per word. */
export const QUICK_BASE_MS = 3000;
export const QUICK_PER_WORD_MS = 250;
/** The quick box's widest size, and the narrowest span it will squeeze into to dodge a coach
 * target (stage px). */
export const QUICK_MAX_W = 560;
export const QUICK_MIN_W = 260;
/** Gap between the quick box and the edges it docks against (stage px). */
const QUICK_MARGIN = 12;

/** The face beside a quick line: Bruno's head and hard hat, cut from his Spine rig (public/ui). */
export const BRUNO_FACE_URL = 'ui/bruno_face.png';

// ---- pure helpers (unit-tested in brunoDialog.test.ts) -------------------------------------------

/** The words of a line, in order (runs of whitespace split; no empty words). */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** When each of `count` words starts to appear, ms after typing starts. */
export function wordDelays(count: number, perWord = WORD_MS): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => i * perWord);
}

/** How long typing `count` words takes, until the last word has fully appeared. 0 for none. */
export function typingMs(count: number, perWord = WORD_MS, fade = WORD_FADE_MS): number {
  return count <= 0 ? 0 : (count - 1) * perWord + fade;
}

/** How long a quick line (play/pass/fail/refused) stays up: 3 s plus 0.25 s per word. */
export function quickLineMs(text: string): number {
  return QUICK_BASE_MS + QUICK_PER_WORD_MS * splitWords(text).length;
}

/** The box label for hint `index` (0-based) of `count`: "Hint", or "Hint 2 of 3". */
export function hintLabel(index: number, count: number): string {
  return count > 1 ? `Hint ${index + 1} of ${count}` : 'Hint';
}

/**
 * Remembers the last line shown so a line passed every frame animates only when its text
 * changes. `changed(text)` answers whether `text` differs from the last one it was given (null =
 * no line) and records it; `reset()` forgets it, so the same line shows again.
 */
export class LineGuard {
  private last: string | null = null;
  changed(text: string | null): boolean {
    if (text === this.last) return false;
    this.last = text;
    return true;
  }
  reset(): void {
    this.last = null;
  }
  get current(): string | null {
    return this.last;
  }
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Where a quick line may go, in stage px: the free span of the world panel (`left`..`right`:
 * the whole panel, or left of the open drawer), the y its bottom docks at (just above the bottom
 * bar, or above the world scrollbar), the y its top docks at (under the goals panel), and which of
 * the two it tries first (`prefer`, default the bottom; the kit prefers the top while the drawer is
 * open and the camera is zoomed in on the part being built, low in the panel). */
export interface QuickRegion { left: number; right: number; bottom: number; top: number; prefer?: 'bottom' | 'top' }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** How tall a band a dock row checks for blockers before measuring (a two-line quick box). */
const QUICK_BAND_H = 80;

/**
 * Places the quick box. `measure(maxW)` lays the box out no wider than `maxW` and returns its
 * size. For each dock row (the preferred one first, then the other): the free span minus the x
 * ranges of the `avoid` rects that reach into that row (the coach's hand and its target, the unlock
 * callout) leaves gaps; the gap holding the span's centre is tried first, then the wider ones, and
 * the box is centred in it. The first spot clear of every `avoid` rect wins; with none clear, the
 * preferred row's centred spot.
 */
export function placeQuick(region: QuickRegion, measure: (maxW: number) => { w: number; h: number }, avoid: Rect[]): Rect {
  const L = region.left + QUICK_MARGIN;
  const R = region.right - QUICK_MARGIN;
  const docks: ('bottom' | 'top')[] = region.prefer === 'top' ? ['top', 'bottom'] : ['bottom', 'top'];
  const spot = (l: number, r: number, dock: 'bottom' | 'top'): Rect => {
    const span = r - l;
    const size = measure(Math.min(QUICK_MAX_W, span));
    const x = Math.round(l + (span - size.w) / 2);
    const y = dock === 'bottom' ? region.bottom - size.h : region.top;
    return { x, y, w: size.w, h: size.h };
  };
  const first = spot(L, R, docks[0]!);
  if (!avoid.some((a) => overlaps(first, a))) return first;
  const mid = (L + R) / 2;
  for (const dock of docks) {
    const y0 = dock === 'bottom' ? region.bottom - QUICK_BAND_H : region.top;
    const y1 = y0 + QUICK_BAND_H;
    const blocks = avoid
      .filter((a) => a.y < y1 && a.y + a.h > y0)
      .map((a) => [a.x - QUICK_MARGIN, a.x + a.w + QUICK_MARGIN] as const)
      .sort((p, q) => p[0] - q[0]);
    const gaps: [number, number][] = [];
    let from = L;
    for (const [b0, b1] of blocks) {
      if (b0 > from) gaps.push([from, Math.min(b0, R)]);
      from = Math.max(from, b1);
    }
    if (from < R) gaps.push([from, R]);
    const usable = gaps
      .filter(([g0, g1]) => g1 - g0 >= QUICK_MIN_W)
      .sort((p, q) => {
        const pc = p[0] <= mid && mid <= p[1] ? 1 : 0;
        const qc = q[0] <= mid && mid <= q[1] ? 1 : 0;
        return qc - pc || q[1] - q[0] - (p[1] - p[0]);
      });
    for (const [g0, g1] of usable) {
      const r = spot(g0, g1, dock);
      if (!avoid.some((a) => overlaps(r, a))) return r;
    }
  }
  return first;
}

// ---- the modal sequence ------------------------------------------------------------------------

/** One modal line: the small orange label (the level title, or "Hint 2 of 3") and the words. */
export interface DialogLine { label: string; text: string }

/** The canvas side of the modal: the dim over the whole canvas and the big Bruno sliding in from
 * the left / back out (both scenes, via src/ui/brunoStage.ts). */
export interface BrunoStageApi {
  showBrunoStage(): Promise<void>;
  hideBrunoStage(): Promise<void>;
}

/** The DOM side of the modal (`BrunoDialog`). */
export interface BrunoBoxApi {
  /** Dims the HUD, hides the bottom bar / goals panel, and takes every tap and Space/Enter. */
  begin(): void;
  /** Shows the box, types the line, waits for the tap that closes it, fades the box out. */
  say(line: DialogLine): Promise<void>;
  /** Undims the HUD (the tap catcher stays until `end`). */
  undim(): void;
  /** Drops the tap catcher: the HUD takes taps again. */
  end(): void;
  /** Closes an open box at once (a newer dialog took over); a pending `say` resolves. */
  cancel(): void;
}

/**
 * Runs the modal sequence: the DOM dims and catches taps, Bruno slides in over the dimmed canvas,
 * the box types the line and waits for a tap, the box fades, Bruno slides out while everything
 * undims, and the catcher goes. `play` resolves true once it is all over, or false when a newer
 * `play` (or `cancel`) took over midway (that one owns the stage and the box from then on).
 */
export class BrunoDialogRunner {
  private gen = 0;
  private active = false;

  constructor(
    private readonly stage: BrunoStageApi,
    private readonly box: BrunoBoxApi,
  ) {}

  /** A dialog is on screen (from `play` until it resolves). */
  get open(): boolean {
    return this.active;
  }

  async play(line: DialogLine): Promise<boolean> {
    const gen = ++this.gen;
    this.box.cancel();
    this.active = true;
    this.box.begin();
    await this.stage.showBrunoStage();
    if (gen !== this.gen) return false;
    await this.box.say(line);
    if (gen !== this.gen) return false;
    this.box.undim();
    await this.stage.hideBrunoStage();
    if (gen !== this.gen) return false;
    this.box.end();
    this.active = false;
    return true;
  }

  /** Ends any dialog at once (teardown): the box closes and the HUD undims and takes taps again.
   * The canvas stage is left alone (the scene is going away with the activity). */
  cancel(): void {
    if (!this.active) return;
    this.gen++;
    this.active = false;
    this.box.cancel();
    this.box.undim();
    this.box.end();
  }
}

/** A runner for a controller's scene and HUD, or null when either lacks its half (a test fake):
 * the controller then treats every dialog as closed at once. */
export function makeDialogRunner(
  stage: Partial<BrunoStageApi> | null | undefined,
  box: BrunoBoxApi | null | undefined,
): BrunoDialogRunner | null {
  if (!stage || typeof stage.showBrunoStage !== 'function' || typeof stage.hideBrunoStage !== 'function') return null;
  if (!box || typeof box.say !== 'function') return null;
  return new BrunoDialogRunner(stage as BrunoStageApi, box);
}

// ---- the DOM box -------------------------------------------------------------------------------

/** A quick line: its words, a tone (green after a pass, pink after a fail) and whether it stays
 * up (a coach prompt) instead of hiding after `quickLineMs`. */
export interface QuickLine { text: string; tone?: 'pass' | 'fail' | null; sticky?: boolean }

/** Where the quick line may sit this frame (see `placeQuick`). */
export interface QuickLayout { region: QuickRegion; avoid: Rect[] }

const NO_TIMER = undefined;

/**
 * The DOM half of Bruno's dialog: the modal box with its full-screen tap catcher, and the quick
 * box. Appended to the HUD root (#ui, laid out in 1024x768 stage px); every element carries
 * `.bd-layer` so the dim rules in style.css leave them alone. The canvas half (the dim and the big
 * Bruno) is src/ui/brunoStage.ts; `BrunoDialogRunner` ties the two together.
 */
export class BrunoDialog implements BrunoBoxApi {
  private readonly root: HTMLElement;
  private readonly catcherEl: HTMLDivElement;
  private readonly boxEl: HTMLDivElement;
  private readonly labelEl: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly cueEl: HTMLDivElement;
  private readonly quickEl: HTMLDivElement;
  private readonly quickTextEl: HTMLDivElement;

  // ---- modal state ----
  private modal = false;
  private typing = false;
  private closing = false;
  private resolveSay: (() => void) | null = null;
  private typeTimer: ReturnType<typeof setTimeout> | undefined = NO_TIMER;
  private boxTimer: ReturnType<typeof setTimeout> | undefined = NO_TIMER;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined = NO_TIMER;

  // ---- quick state ----
  private readonly guard = new LineGuard();
  private quickSticky = false;
  private quickTimer: ReturnType<typeof setTimeout> | undefined = NO_TIMER;
  private quickKey = '';

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.modal) return;
    const isAdvance = e.key === ' ' || e.key === 'Enter' || e.code === 'Space';
    // Nothing behind the dialog reacts to the keyboard (a focused bar button would click on
    // Space/Enter); Space/Enter advance on keydown only.
    e.preventDefault();
    e.stopPropagation();
    if (isAdvance && e.type === 'keydown' && !e.repeat) this.advance();
  };

  constructor(root: HTMLElement) {
    this.root = root;

    const catcher = document.createElement('div');
    catcher.className = 'bd-layer bd-catcher';
    catcher.hidden = true;
    catcher.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.advance();
    });
    root.appendChild(catcher);
    this.catcherEl = catcher;

    const box = document.createElement('div');
    box.className = 'bd-layer bd-box';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-live', 'polite');
    const label = document.createElement('div');
    label.className = 'bd-label';
    const text = document.createElement('div');
    text.className = 'bd-text';
    const cue = document.createElement('div');
    cue.className = 'bd-cue';
    cue.textContent = '▼';
    cue.setAttribute('aria-hidden', 'true');
    box.append(label, text, cue);
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.advance();
    });
    root.appendChild(box);
    this.boxEl = box;
    this.labelEl = label;
    this.textEl = text;
    this.cueEl = cue;

    const quick = document.createElement('div');
    quick.className = 'bd-layer bd-quick';
    quick.hidden = true;
    quick.setAttribute('aria-live', 'polite');
    const face = document.createElement('img');
    face.className = 'bd-face';
    face.src = BRUNO_FACE_URL;
    face.alt = '';
    face.draggable = false;
    const qtext = document.createElement('div');
    qtext.className = 'bd-text';
    quick.append(face, qtext);
    // A tap on the quick box hides it early (and never reaches the scene under it).
    quick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.quickSticky) this.hideQuick();
    });
    root.appendChild(quick);
    this.quickEl = quick;
    this.quickTextEl = qtext;
  }

  /** The modal is up (from `begin` until `end`). */
  get modalOpen(): boolean {
    return this.modal;
  }

  // ---- modal -------------------------------------------------------------------------------

  begin(): void {
    if (!this.modal) {
      this.modal = true;
      window.addEventListener('keydown', this.onKey, true);
      window.addEventListener('keyup', this.onKey, true);
    }
    // A focused button (the Next level / Hint the child just tapped) must not click on Space.
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.root.contains(active)) active.blur();
    // A visible prompt waits for the dialog; a coach prompt comes back after it.
    if (this.quickSticky) this.guard.reset();
    this.hideQuick();
    clearTimeout(this.fadeTimer);
    this.catcherEl.hidden = false;
    // style.css: `bd-dim` darkens the HUD, `bd-open` hides the DOM that would sit over the big
    // Bruno (the bottom bar, the goals panel, ...), `bd-fade` animates the darkening.
    this.root.classList.add('bd-fade', 'bd-dim', 'bd-open');
  }

  say(line: DialogLine): Promise<void> {
    this.finishSay();
    this.labelEl.textContent = line.label;
    this.labelEl.hidden = line.label === '';
    const words = this.fillWords(this.textEl, line.text);
    this.boxEl.hidden = false;
    this.closing = false;
    const reduce = prefersReducedMotion();
    this.boxEl.classList.remove('bd-out', 'bd-in');
    this.cueEl.classList.remove('bd-show');
    if (reduce) {
      this.showAllWords(this.textEl);
      this.typing = false;
      this.cueEl.classList.add('bd-show');
    } else {
      void this.boxEl.offsetWidth; // restart the rise
      this.boxEl.classList.add('bd-in');
      this.typing = true;
      // Words start typing as the box finishes rising.
      this.startTyping(this.textEl, words, BOX_IN_MS);
      clearTimeout(this.typeTimer);
      this.typeTimer = setTimeout(() => this.finishTyping(), BOX_IN_MS + typingMs(words));
    }
    return new Promise<void>((resolve) => {
      this.resolveSay = resolve;
    });
  }

  undim(): void {
    this.root.classList.remove('bd-dim');
  }

  end(): void {
    this.catcherEl.hidden = true;
    this.root.classList.remove('bd-dim', 'bd-open');
    if (this.modal) {
      this.modal = false;
      window.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('keyup', this.onKey, true);
    }
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => this.root.classList.remove('bd-fade'), HUD_DIM_MS);
  }

  cancel(): void {
    clearTimeout(this.typeTimer);
    clearTimeout(this.boxTimer);
    this.typing = false;
    this.closing = false;
    this.boxEl.hidden = true;
    this.boxEl.classList.remove('bd-in', 'bd-out');
    this.finishSay();
  }

  /** A tap or Space/Enter: while typing, show the whole line; once shown, close the box. */
  private advance(): void {
    if (this.boxEl.hidden || this.closing || !this.resolveSay) return;
    if (this.typing) {
      this.finishTyping();
      return;
    }
    this.closing = true;
    this.cueEl.classList.remove('bd-show');
    if (prefersReducedMotion()) {
      this.boxEl.hidden = true;
      this.finishSay();
      return;
    }
    this.boxEl.classList.remove('bd-in');
    this.boxEl.classList.add('bd-out');
    clearTimeout(this.boxTimer);
    this.boxTimer = setTimeout(() => {
      this.boxEl.hidden = true;
      this.boxEl.classList.remove('bd-out');
      this.finishSay();
    }, BOX_OUT_MS);
  }

  private finishTyping(): void {
    clearTimeout(this.typeTimer);
    this.typing = false;
    this.showAllWords(this.textEl);
    this.cueEl.classList.add('bd-show');
  }

  private finishSay(): void {
    const resolve = this.resolveSay;
    this.resolveSay = null;
    resolve?.();
  }

  // ---- words -------------------------------------------------------------------------------

  /** Lays the whole line out as invisible word spans (the box never reflows while typing) and
   * returns the word count. */
  private fillWords(el: HTMLElement, text: string): number {
    el.textContent = '';
    el.classList.remove('bd-typing', 'bd-all');
    const words = splitWords(text);
    words.forEach((w, i) => {
      if (i > 0) el.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = 'bd-w';
      span.textContent = w;
      el.appendChild(span);
    });
    return words.length;
  }

  /** Each word pops in `WORD_MS` after the previous one (a CSS animation with a per-word delay),
   * the first one `startMs` from now. */
  private startTyping(el: HTMLElement, count: number, startMs: number): void {
    const delays = wordDelays(count);
    const spans = el.querySelectorAll<HTMLSpanElement>('.bd-w');
    spans.forEach((s, i) => s.style.setProperty('--d', `${startMs + (delays[i] ?? 0)}ms`));
    void el.offsetWidth;
    el.classList.add('bd-typing');
  }

  private showAllWords(el: HTMLElement): void {
    el.classList.remove('bd-typing');
    el.classList.add('bd-all');
  }

  // ---- quick lines -----------------------------------------------------------------------------

  /**
   * This frame's quick line (null = none). Called every frame: the line animates in only when its
   * text changes, and is re-placed only when the text or the layout changes. Waits while the modal
   * is up (a coach prompt then shows once it closes).
   */
  setQuick(line: QuickLine | null, layout: QuickLayout): void {
    if (this.modal) return;
    const text = line && line.text.trim() !== '' ? line.text : null;
    if (this.guard.changed(text)) {
      clearTimeout(this.quickTimer);
      if (text === null || !line) {
        this.hideQuick();
        return;
      }
      this.quickSticky = !!line.sticky;
      this.quickEl.classList.toggle('pass', line.tone === 'pass');
      this.quickEl.classList.toggle('fail', line.tone === 'fail');
      const words = this.fillWords(this.quickTextEl, text);
      this.quickEl.hidden = false;
      this.quickKey = '';
      this.layoutQuick(layout);
      if (prefersReducedMotion()) {
        this.showAllWords(this.quickTextEl);
      } else {
        this.quickEl.classList.remove('bd-in');
        void this.quickEl.offsetWidth;
        this.quickEl.classList.add('bd-in');
        this.startTyping(this.quickTextEl, words, 60);
      }
      if (!this.quickSticky) this.quickTimer = setTimeout(() => this.hideQuick(), quickLineMs(text));
      return;
    }
    if (!this.quickEl.hidden) this.layoutQuick(layout);
  }

  /** Moves the quick box when the free span or the spot to avoid changed (rounded, so a bobbing
   * hand does not re-lay it out every frame). */
  private layoutQuick(layout: QuickLayout): void {
    const r = layout.region;
    const a = layout.avoid;
    const key = `${r.left}|${r.right}|${r.bottom}|${Math.round(r.top / 8)}|${r.prefer ?? ''}|${a.map((q) => [q.x, q.y, q.w, q.h].map((v) => Math.round(v / 8)).join(',')).join(';')}`;
    if (key === this.quickKey) return;
    this.quickKey = key;
    const el = this.quickEl;
    const measure = (maxW: number): { w: number; h: number } => {
      el.style.maxWidth = `${maxW}px`;
      return { w: el.offsetWidth, h: el.offsetHeight };
    };
    const spot = placeQuick(r, measure, a);
    // +2: offsetWidth rounds, and a max-width a fraction under the text's width would wrap it.
    el.style.maxWidth = `${spot.w + 2}px`;
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
  }

  private hideQuick(): void {
    clearTimeout(this.quickTimer);
    this.quickEl.hidden = true;
    this.quickEl.classList.remove('bd-in');
    this.quickSticky = false;
  }

  destroy(): void {
    this.cancel();
    this.end();
    clearTimeout(this.fadeTimer);
    clearTimeout(this.quickTimer);
    this.root.classList.remove('bd-fade', 'bd-dim', 'bd-open');
    this.catcherEl.remove();
    this.boxEl.remove();
    this.quickEl.remove();
  }
}
