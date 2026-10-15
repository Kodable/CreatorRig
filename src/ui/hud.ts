import type { CoachStep, EditTool, Goal, GoalResult, HudState, Level, Metric } from '../core/types';
import { goalCardLive, goalCardSpec, type GoalCardState } from '../core/goalCards';
import { levelTools } from '../core/editRules';
import { tapHandFrame } from '../core/coach';
import { GROUND_Y, PANEL_TOP_Y } from '../game/view';
import { COASTER_LINES } from '../core/levels';
import { playGoalsIntro, prefersReducedMotion } from './goalsIntro';
import { BrunoDialog, type QuickLine } from './brunoDialog';
import { FUZZ_SKINS, findSkin, type SkinId } from '../game/skins';

export interface HudCallbacks {
  play(): void;
  stop(): void;
  clear(): void;
  undo(): void;
  next(): void;
  selectLevel(id: string): void;
  setTool(tool: EditTool): void;
  /** 2026-10-12: the child picked a fuzz in the skin tray. */
  setSkin(id: string): void;
  /** 2026-10-15: the child opened the skin tray (the tutorial hand's 'skin' step is done). */
  skinTrayOpened?(): void;
  exit(): void;
}

const STAGE_W = 1024;
const G_MAX = 6; // g value that maps to a full (100%) intense-o-meter gauge

/* 2026-10-07 (Gao: "put the same treatment of the goal, the stats, and the bottom for the coaster"):
   the rover's layout. No dash any more: the goals sit over the world panel's top-left corner
   (`.goals-overlay`, which pops up big in the middle at every level start: goalsIntro.ts; since
   2026-10-15 a row of goal cards, src/core/goalCards.ts), the meters in its twin over the top-right corner (`.meters-col.overlay`, play and
   done mode only), and the scene grows up into the dash's old room (view.ts PANEL_TOP_Y, 78). The
   bar: Point/Loop on the left, the big Play / Stop / Next level buttons centred (side by side when
   two show), Undo and Clear on the right. */

/** The tutorial hand over a bar button (2026-10-15, src/core/coach.ts): the builder kit's glove
 * (public/ui/hand_0N.png, `.coach-hand` in style.css, 55x64 like the kit's), placed by the measured
 * fingertip (108/310, 2/360) so the glove holds still and only the finger bends. */
const COACH_HAND_W = 55;
const COACH_HAND_H = 64;
const COACH_HAND_SRC = ['ui/hand_01.png', 'ui/hand_02.png', 'ui/hand_03.png'] as const;
const COACH_HAND_FX = 108 / 310;
const COACH_HAND_FY = 2 / 360;

function fmt1(v: number): string {
  return v.toFixed(1);
}
function fmt2(v: number): string {
  return v.toFixed(2);
}
// Which meter a goal's metric "belongs" to, for focus/dim styling.
// reachedEnd has no meter of its own.
const METER_FOR_METRIC: Partial<Record<Metric, string>> = {
  maxDrop: 'meter-drop',
  maxSpeed: 'meter-speed',
  length: 'meter-length',
  hangTime: 'meter-hang',
  loops: 'meter-loops',
  loopsCompleted: 'meter-loops',
  maxG: 'meter-intense',
};

/** A goal card (2026-10-15, src/core/goalCards.ts; `.gcard` in style.css): the card, its bar's
 * fill and the look it last drew (a state change re-pops the card through its CSS class). */
interface GoalItem {
  card: HTMLLIElement;
  fill: HTMLDivElement | null;
  state: GoalCardState | null;
  fillPct: number;
}

interface MeterEntry {
  id: string;
  root: HTMLDivElement;
  main: HTMLSpanElement;
  sub?: HTMLSpanElement;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly cb: HudCallbacks;

  private readonly textCache = new Map<Element, string>();
  private readonly boolCache = new Map<Element, boolean>();

  private level: Level | null = null;
  private allLevels: Level[] = [];
  private levelIndex = 0;
  private hasLoopsGoal = false;
  private goalItems: GoalItem[] = [];

  /** Bruno's dialog box: the modal lesson intro (run by App) and the quick lines (`update`). */
  brunoDialog!: BrunoDialog;
  /** The top row (level picker + Park); Bruno's quick line sits left of it. */
  private topbarEl!: HTMLDivElement;
  /** `topbarEl`'s left edge in stage px, or -1 to measure it again (once per level load). */
  private pickerLeft = -1;
  private goalsOverlayEl!: HTMLDivElement;
  private goalsColEl!: HTMLDivElement;
  private goalListEl!: HTMLUListElement;
  /** The level-start goals intro in flight (goalsIntro.ts), cancelled by the next level. */
  private goalsIntroAnim: Animation | null = null;

  private pickerLabelEl!: HTMLSpanElement;
  private pickerPrevBtn!: HTMLButtonElement;
  private pickerNextBtn!: HTMLButtonElement;
  private parkBtn!: HTMLButtonElement;

  private meterDrop!: MeterEntry;
  private meterSpeed!: MeterEntry;
  private meterLength!: MeterEntry;
  private meterHang!: MeterEntry;
  private meterLoops!: MeterEntry;
  private meterIntense!: MeterEntry;
  private allMeters: MeterEntry[] = [];
  private metersColEl!: HTMLDivElement;
  private gaugeFillEl!: HTMLDivElement;
  private gaugeNeedleEl!: HTMLDivElement;

  private toolGroupEl!: HTMLDivElement;
  private toolPointBtn!: HTMLButtonElement;
  private toolLoopBtn!: HTMLButtonElement;
  /** 2026-10-15: the NEW badges on the tool buttons (a level's `newTool`), and whether the child
   * has picked that tool on this level load (the badge then goes). */
  private toolBadges = new Map<EditTool, HTMLSpanElement>();
  private newToolPicked = false;
  /** The tutorial hand over a bar button, the step it shows and when it appeared. */
  private coachHandEl!: HTMLDivElement;
  private coachHandImg!: HTMLImageElement;
  private coachHandStep: CoachStep | null = null;
  private coachHandStart = 0;
  private playBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private undoBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  // 2026-10-12: the fuzz picker. A round button showing the riding fuzz sits right of Point/Loop in
  // edit mode; a tap opens a tray of fuzz faces above it; a tap on a face swaps the fuzz (both pop).
  private skinBtn!: HTMLButtonElement;
  private skinBtnImg!: HTMLImageElement;
  private skinTray!: HTMLDivElement;
  private skinBackdrop!: HTMLDivElement;
  private skinFaces = new Map<SkinId, HTMLButtonElement>();
  private skin: SkinId | null = null;

  private readonly syncHandler = (): void => this.syncTransform();
  private intervalId: ReturnType<typeof setInterval> | undefined;

  constructor(root: HTMLElement, canvas: HTMLCanvasElement, cb: HudCallbacks) {
    this.root = root;
    this.canvas = canvas;
    this.cb = cb;
    // The world panel's top edge for every style.css rule anchored to it (the goals and meters
    // overlays); the builder kit sets the same variable for its courses (BuilderHud).
    root.style.setProperty('--panel-top', `${PANEL_TOP_Y}px`);

    this.build();

    this.syncHandler();
    window.addEventListener('resize', this.syncHandler);
    window.addEventListener('orientationchange', this.syncHandler);
    window.visualViewport?.addEventListener('resize', this.syncHandler);
    this.intervalId = setInterval(this.syncHandler, 1000);
  }

  destroy(): void {
    if (this.intervalId !== undefined) clearInterval(this.intervalId);
    this.goalsIntroAnim?.cancel();
    this.goalsIntroAnim = null;
    this.brunoDialog.destroy();
    window.removeEventListener('resize', this.syncHandler);
    window.removeEventListener('orientationchange', this.syncHandler);
    window.visualViewport?.removeEventListener('resize', this.syncHandler);
    this.root.innerHTML = '';
    // The root (#ui) is shared with the next activity.
    this.root.style.removeProperty('--panel-top');
  }

  private syncTransform(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = rect.width / STAGE_W;
    this.root.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(${scale})`;
  }

  private build(): void {
    this.root.innerHTML = '';

    // ---- topbar: only the level picker and Park, at the top right (2026-10-12: Bruno and his
    // bubble left; he talks through src/ui/brunoDialog.ts) ----
    const topbar = document.createElement('div');
    topbar.id = 'topbar';

    const picker = document.createElement('div');
    picker.className = 'level-picker';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'picker-btn';
    prevBtn.textContent = '‹';
    prevBtn.addEventListener('click', () => {
      const prev = this.allLevels[this.levelIndex - 1];
      if (prev) this.cb.selectLevel(prev.id);
    });
    const pickerLabel = document.createElement('span');
    pickerLabel.className = 'picker-label';
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'picker-btn';
    nextBtn.textContent = '›';
    nextBtn.addEventListener('click', () => {
      const next = this.allLevels[this.levelIndex + 1];
      if (next) this.cb.selectLevel(next.id);
    });
    picker.append(prevBtn, pickerLabel, nextBtn);
    this.pickerPrevBtn = prevBtn;
    this.pickerNextBtn = nextBtn;
    this.pickerLabelEl = pickerLabel;

    const parkBtn = document.createElement('button');
    parkBtn.id = 'park';
    parkBtn.type = 'button';
    parkBtn.className = 'park-btn';
    parkBtn.textContent = '🎡 Park';
    parkBtn.addEventListener('click', () => this.cb.exit());
    this.parkBtn = parkBtn;

    topbar.append(picker, parkBtn);
    this.root.appendChild(topbar);
    this.topbarEl = topbar;

    // ---- goals overlay (over the world panel's top-left corner, every mode) ----
    // The outcome of a run needs no result card here: Bruno's quick line says it (update()).
    // 2026-10-15 (Jon: "much better job of communicating the goals"): a row of goal cards, a big
    // target number over a picture of the metric (`goal-cards`, style.css `.gcard`).
    const goalsOverlay = document.createElement('div');
    goalsOverlay.className = 'goals-overlay goal-cards';
    const goalsCol = document.createElement('div');
    goalsCol.className = 'goals-col';
    const goalList = document.createElement('ul');
    goalList.id = 'goalList';
    goalsCol.appendChild(goalList);
    goalsOverlay.appendChild(goalsCol);
    this.root.appendChild(goalsOverlay);
    this.goalsOverlayEl = goalsOverlay;
    this.goalsColEl = goalsCol;
    this.goalListEl = goalList;

    // ---- meters overlay (over the world panel's top-right corner, play and done mode) ----
    // `with-gauge`: the intense-o-meter's gauge needs a wider panel than the kit's six plain meters.
    const metersCol = document.createElement('div');
    metersCol.className = 'meters-col overlay with-gauge';

    const makeMeter = (id: string, label: string): MeterEntry => {
      const meter = document.createElement('div');
      meter.className = 'meter';
      meter.id = id;
      const lbl = document.createElement('div');
      lbl.className = 'meter-label';
      lbl.textContent = label;
      const val = document.createElement('div');
      val.className = 'meter-value';
      const main = document.createElement('span');
      main.className = 'main';
      val.appendChild(main);
      meter.append(lbl, val);
      metersCol.appendChild(meter);
      return { id, root: meter, main };
    };

    this.meterDrop = makeMeter('meter-drop', 'Drop');
    this.meterSpeed = makeMeter('meter-speed', 'Speed');
    const speedKm = document.createElement('span');
    speedKm.className = 'km';
    this.meterSpeed.root.querySelector('.meter-value')!.appendChild(speedKm);
    this.meterSpeed.sub = speedKm;

    this.meterLength = makeMeter('meter-length', 'Length');
    this.meterHang = makeMeter('meter-hang', 'Air time');
    this.meterLoops = makeMeter('meter-loops', 'Loops');

    this.meterIntense = makeMeter('meter-intense', 'Intense-o-meter');
    this.meterIntense.root.classList.add('meter-intense');
    const intenseKm = document.createElement('span');
    intenseKm.className = 'km';
    this.meterIntense.root.querySelector('.meter-value')!.appendChild(intenseKm);
    this.meterIntense.sub = intenseKm;

    const gaugeBar = document.createElement('div');
    gaugeBar.className = 'gauge-bar';
    const gaugeBands = document.createElement('div');
    gaugeBands.className = 'gauge-bands';
    const gaugeFill = document.createElement('div');
    gaugeFill.className = 'gauge-fill';
    const gaugeNeedle = document.createElement('div');
    gaugeNeedle.className = 'gauge-needle';
    gaugeBar.append(gaugeBands, gaugeFill, gaugeNeedle);
    this.gaugeFillEl = gaugeFill;
    this.gaugeNeedleEl = gaugeNeedle;

    const gaugeLabels = document.createElement('div');
    gaugeLabels.className = 'gauge-labels';
    for (const t of ['0', '2 g', '4 g', '6 g']) {
      const s = document.createElement('span');
      s.textContent = t;
      gaugeLabels.appendChild(s);
    }
    this.meterIntense.root.append(gaugeBar, gaugeLabels);

    this.allMeters = [
      this.meterDrop,
      this.meterSpeed,
      this.meterLength,
      this.meterHang,
      this.meterLoops,
      this.meterIntense,
    ];

    this.root.appendChild(metersCol);
    this.metersColEl = metersCol;

    // ---- bottom bar ----
    // Point/Loop on the left; Play, Stop and Next level in `.bar-centre`, centred over the row
    // (style.css, the same rules as the builder kit's bar); Undo and Clear in `.bar-end`, pushed
    // to the right edge.
    const bottombar = document.createElement('div');
    bottombar.id = 'bottombar';

    const makeBtn = (
      id: string,
      text: string,
      kind: string,
      onClick: () => void,
      parent: HTMLElement = bottombar,
    ): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.id = id;
      btn.type = 'button';
      btn.className = kind;
      btn.textContent = text;
      btn.addEventListener('click', onClick);
      parent.appendChild(btn);
      return btn;
    };

    const toolGroup = document.createElement('div');
    // `rounded`: a pill-ended segmented control, matching Undo/Clear's 23px corners (style.css).
    toolGroup.className = 'tool-group rounded';
    const toolPointBtn = document.createElement('button');
    toolPointBtn.id = 'tool-point';
    toolPointBtn.type = 'button';
    toolPointBtn.className = 'tool';
    toolPointBtn.textContent = '● Point';
    toolPointBtn.addEventListener('click', () => this.cb.setTool('point'));
    const toolLoopBtn = document.createElement('button');
    toolLoopBtn.id = 'tool-loop';
    toolLoopBtn.type = 'button';
    toolLoopBtn.className = 'tool';
    toolLoopBtn.textContent = '➰ Loop';
    toolLoopBtn.addEventListener('click', () => this.cb.setTool('loop'));
    toolGroup.append(toolPointBtn, toolLoopBtn);
    for (const [tool, btn] of [['point', toolPointBtn], ['loop', toolLoopBtn]] as const) {
      const badge = document.createElement('span');
      badge.className = 'tool-new-badge';
      badge.textContent = 'NEW';
      badge.hidden = true;
      btn.appendChild(badge);
      this.toolBadges.set(tool, badge);
    }
    bottombar.appendChild(toolGroup);
    this.toolGroupEl = toolGroup;
    this.toolPointBtn = toolPointBtn;
    this.toolLoopBtn = toolLoopBtn;

    this.buildSkinPicker(bottombar);

    // Play, Stop and Next level share one centred box, side by side whichever of them show (after
    // a passed run: Stop and Next level).
    const barCentre = document.createElement('div');
    barCentre.className = 'bar-centre';
    bottombar.appendChild(barCentre);
    const barEnd = document.createElement('div');
    barEnd.className = 'bar-end';
    bottombar.appendChild(barEnd);
    this.playBtn = makeBtn('play', '▶ Play', 'primary', () => this.cb.play(), barCentre);
    this.stopBtn = makeBtn('stop', '■ Stop', 'stop', () => this.cb.stop(), barCentre);
    this.undoBtn = makeBtn('undo', '↶ Undo', 'secondary', () => this.cb.undo(), barEnd);
    this.clearBtn = makeBtn('clear', 'Clear', 'secondary', () => this.cb.clear(), barEnd);
    this.nextBtn = makeBtn('next', 'Next level ▶', 'primary', () => this.cb.next(), barCentre);

    this.root.appendChild(bottombar);

    // ---- the tutorial hand over the bar buttons (under Bruno's dialog) ----
    const hand = document.createElement('div');
    hand.className = 'coach-hand side';
    hand.hidden = true;
    const handImg = document.createElement('img');
    handImg.src = COACH_HAND_SRC[0];
    handImg.alt = '';
    handImg.draggable = false;
    hand.appendChild(handImg);
    this.root.appendChild(hand);
    this.coachHandEl = hand;
    this.coachHandImg = handImg;

    // ---- Bruno's dialog box, over everything (src/ui/brunoDialog.ts) ----
    this.brunoDialog = new BrunoDialog(this.root);
  }

  /** `el`'s box in stage px (the HUD root's layout px), or null when it has no box. */
  private stageRect(el: HTMLElement): { x: number; y: number; w: number; h: number } | null {
    if (el.closest('[hidden]')) return null;
    const rootRect = this.root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (rootRect.width <= 0 || r.width <= 0 || r.height <= 0) return null;
    const k = STAGE_W / rootRect.width;
    return { x: (r.left - rootRect.left) * k, y: (r.top - rootRect.top) * k, w: r.width * k, h: r.height * k };
  }

  /**
   * The tutorial hand on its bar button (2026-10-15): the kit's glove turned a quarter turn (finger
   * pointing left, `.coach-hand.side`, turned about the fingertip), because the bar sits on the
   * stage's bottom edge and the upright glove, which hangs below its fingertip, was cut off there
   * (a first try flipped it upside down; Gao asked for 90 degrees instead). The fingertip sits on
   * the button's right part at mid-height (82%/55%; the wide Play button 92%/55%), so the glove lies
   * in the bar to the button's right and the label stays visible; one tap
   * per TAP_PERIOD_MS (tapHandFrame), a pop-in when the step changes. Hidden while the skin tray is
   * open. Never interactive (pointer-events: none).
   */
  private syncCoachHand(step: CoachStep | null): void {
    const el = step === 'skin' ? this.skinBtn : step === 'play' ? this.playBtn : step === 'loop-tool' ? this.toolLoopBtn : null;
    const rect = el && this.skinTray.hidden ? this.stageRect(el) : null;
    if (!step || !rect) {
      this.setHidden(this.coachHandEl, true);
      this.coachHandStep = null;
      return;
    }
    const now = performance.now();
    if (step !== this.coachHandStep) {
      this.coachHandStep = step;
      this.coachHandStart = now;
      this.coachHandEl.classList.remove('enter');
      void this.coachHandEl.offsetWidth; // restart the pop-in
      this.coachHandEl.classList.add('enter');
    }
    const frame = prefersReducedMotion() ? 0 : tapHandFrame(now - this.coachHandStart);
    const src = COACH_HAND_SRC[frame];
    if (this.coachHandImg.getAttribute('src') !== src) this.coachHandImg.src = src;
    const wide = step === 'play';
    const fx = rect.x + rect.w * (wide ? 0.92 : 0.82);
    const fy = rect.y + rect.h * 0.55;
    // The picture turns about its fingertip (style.css), so the fingertip is (FX, FY) of the box.
    this.coachHandEl.style.left = `${(fx - COACH_HAND_FX * COACH_HAND_W).toFixed(1)}px`;
    this.coachHandEl.style.top = `${(fy - COACH_HAND_FY * COACH_HAND_H).toFixed(1)}px`;
    this.setHidden(this.coachHandEl, false);
  }

  /**
   * The fuzz picker: the round button in the bar (after Point/Loop, well clear of the centred Play
   * button), the tray of faces that opens above it over the scene's bottom-left, and a see-through
   * backdrop that closes the tray on a tap anywhere else (and keeps that tap off the track).
   */
  private buildSkinPicker(bottombar: HTMLElement): void {
    const btn = document.createElement('button');
    btn.id = 'skin';
    btn.type = 'button';
    btn.className = 'skin-btn';
    btn.setAttribute('aria-label', 'Pick your fuzz');
    btn.title = 'Pick your fuzz';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    const badge = document.createElement('span');
    badge.className = 'skin-badge';
    badge.textContent = '⇄';
    btn.append(img, badge);
    btn.addEventListener('click', () => this.toggleSkinTray());
    bottombar.appendChild(btn);
    this.skinBtn = btn;
    this.skinBtnImg = img;

    const backdrop = document.createElement('div');
    backdrop.className = 'skin-backdrop';
    backdrop.hidden = true;
    backdrop.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggleSkinTray(false);
    });
    this.root.appendChild(backdrop);
    this.skinBackdrop = backdrop;

    const tray = document.createElement('div');
    tray.className = 'skin-tray';
    tray.hidden = true;
    const title = document.createElement('div');
    title.className = 'skin-tray-title';
    title.textContent = 'Who rides?';
    const row = document.createElement('div');
    row.className = 'skin-row';
    for (const s of FUZZ_SKINS) {
      const face = document.createElement('button');
      face.type = 'button';
      face.className = 'skin-face';
      face.dataset.skin = s.id;
      face.title = s.label;
      face.setAttribute('aria-label', s.label);
      const fimg = document.createElement('img');
      fimg.src = s.normal;
      fimg.alt = '';
      fimg.draggable = false;
      face.appendChild(fimg);
      face.addEventListener('click', () => {
        this.cb.setSkin(s.id);
        this.toggleSkinTray(false);
      });
      row.appendChild(face);
      this.skinFaces.set(s.id, face);
    }
    tray.append(title, row);
    this.root.appendChild(tray);
    this.skinTray = tray;
  }

  private toggleSkinTray(open = this.skinTray.hidden): void {
    if (open) {
      // The tray's arrow (33 px in) points at the button's centre wherever the button sits: it
      // moves left on levels that hide the tool buttons (2026-10-15).
      const btn = this.stageRect(this.skinBtn);
      if (btn) this.skinTray.style.left = `${Math.round(btn.x + btn.w / 2 - 33)}px`;
      this.cb.skinTrayOpened?.();
    }
    this.skinTray.hidden = !open;
    this.skinBackdrop.hidden = !open;
    this.skinBtn.classList.toggle('open', open);
  }

  /** Shows `id` as the riding fuzz (button face, ring in the tray); pops the button on a change. */
  setSkin(id: SkinId): void {
    const changed = this.skin !== null && this.skin !== id;
    this.skin = id;
    this.skinBtnImg.src = findSkin(id).normal;
    for (const [sid, face] of this.skinFaces) face.classList.toggle('current', sid === id);
    if (changed) {
      // restart the CSS pop: drop the class, force a reflow, add it back
      this.skinBtn.classList.remove('pop');
      void this.skinBtn.offsetWidth;
      this.skinBtn.classList.add('pop');
    }
  }

  private setText(el: Element, text: string): void {
    if (this.textCache.get(el) !== text) {
      el.textContent = text;
      this.textCache.set(el, text);
    }
  }

  private setHidden(el: HTMLElement, hidden: boolean): void {
    if (this.boolCache.get(el) !== hidden) {
      el.hidden = hidden;
      this.boolCache.set(el, hidden);
    }
  }

  private setDisabled(btn: HTMLButtonElement, disabled: boolean): void {
    if (btn.disabled !== disabled) btn.disabled = disabled;
  }

  setLevel(level: Level, all: Level[]): void {
    this.level = level;
    this.allLevels = all;
    const idx = all.indexOf(level);
    this.levelIndex = idx >= 0 ? idx : 0;
    this.hasLoopsGoal = level.goals.some((g) => g.metric === 'loops' || g.metric === 'loopsCompleted');

    // ---- goals column ----
    this.goalListEl.innerHTML = '';
    this.goalItems = [];
    if (level.goals.length === 0) {
      this.goalsColEl.classList.add('empty');
      const li = document.createElement('li');
      li.className = 'goals-empty';
      li.textContent = 'Build anything you like!';
      this.goalListEl.appendChild(li);
    } else {
      this.goalsColEl.classList.remove('empty');
      this.goalItems = level.goals.map((goal: Goal) => this.makeGoalCard(goal));
    }

    // The goals intro waits for Bruno's lesson intro: App calls `playGoalsIntro` once the dialog
    // closes. A previous level's run in flight stops here.
    this.goalsIntroAnim?.cancel();
    this.goalsIntroAnim = null;

    // ---- meter focus/dim styling (depends only on the level's goals) ----
    const freePlay = level.goals.length === 0;
    const focused = new Set<string>();
    for (const g of level.goals) {
      const id = METER_FOR_METRIC[g.metric];
      if (id) focused.add(id);
    }
    for (const meter of this.allMeters) {
      meter.root.classList.remove('focused', 'dim', 'free');
      meter.root.classList.add(freePlay ? 'free' : focused.has(meter.id) ? 'focused' : 'dim');
    }

    // ---- tool buttons (2026-10-15, the level's editor rules: src/core/editRules.ts) ----
    const tools = levelTools(level);
    this.setHidden(this.toolPointBtn, !tools.includes('point'));
    this.setHidden(this.toolLoopBtn, !tools.includes('loop'));
    // A lone button gets both pill ends (style.css `.tool-group.single`).
    this.toolGroupEl.classList.toggle('single', tools.length === 1);
    this.newToolPicked = false;
    for (const [tool, badge] of this.toolBadges) this.setHidden(badge, level.newTool !== tool || !tools.includes(tool));

    // ---- level picker ----
    this.setText(this.pickerLabelEl, `Level ${this.levelIndex + 1} of ${all.length}`);
    this.pickerLeft = -1; // the label's width moves the picker: measure again for the quick line
    this.setDisabled(this.pickerPrevBtn, this.levelIndex <= 0);
    this.setDisabled(this.pickerNextBtn, this.levelIndex >= all.length - 1);
  }

  /** One goal card: the big target number and its unit over the metric's picture
   * (public/ui/goals/<icon>.svg), an UNDER badge on a "stay under" goal, a tiny caption and a
   * progress bar; a yes/no goal (the flag, the end) shows a bigger picture and no bar. The check
   * (or the pink "!") in the corner is CSS, shown by the card's state class (`update`). */
  private makeGoalCard(goal: Goal): GoalItem {
    const spec = goalCardSpec(goal);
    const card = document.createElement('li');
    card.className = `gcard gcard-${spec.kind} gcard-${spec.icon}`;
    card.classList.toggle('under', spec.under);
    card.setAttribute('aria-label', goal.label);
    card.title = goal.label;
    if (spec.under) {
      const badge = document.createElement('span');
      badge.className = 'gcard-badge';
      badge.textContent = 'under';
      card.appendChild(badge);
    }
    if (spec.kind === 'number') {
      const target = document.createElement('div');
      target.className = 'gcard-target';
      const num = document.createElement('span');
      num.className = 'gcard-num';
      num.textContent = spec.number;
      const unit = document.createElement('span');
      unit.className = 'gcard-unit';
      unit.textContent = spec.unit;
      target.append(num, unit);
      card.appendChild(target);
    }
    const icon = document.createElement('img');
    icon.className = 'gcard-icon';
    icon.src = `ui/goals/${spec.icon}.svg`;
    icon.alt = '';
    icon.draggable = false;
    const caption = document.createElement('span');
    caption.className = 'gcard-caption';
    caption.textContent = spec.caption;
    card.append(icon, caption);
    let fill: HTMLDivElement | null = null;
    if (spec.kind === 'number') {
      const bar = document.createElement('div');
      bar.className = 'gcard-bar';
      fill = document.createElement('div');
      fill.className = 'gcard-fill';
      bar.appendChild(fill);
      card.appendChild(bar);
    }
    const tick = document.createElement('span');
    tick.className = 'gcard-tick';
    tick.setAttribute('aria-hidden', 'true');
    card.appendChild(tick);
    this.goalListEl.appendChild(card);
    return { card, fill, state: null, fillPct: -1 };
  }

  /** The level-start goals intro: the panel pops up big in the middle of the scene, then glides
   * home (goalsIntro.ts). 2026-10-12: App calls it once Bruno's lesson intro closes. */
  /** Resolves once the panel is home (or the run was cancelled, or nothing played): App then lets
   * the tutorial hand in (2026-10-15). */
  playGoalsIntro(): Promise<void> {
    this.goalsIntroAnim?.cancel();
    const anim = playGoalsIntro(this.goalsOverlayEl, PANEL_TOP_Y, GROUND_Y);
    this.goalsIntroAnim = anim;
    if (!anim) return Promise.resolve();
    return new Promise((resolve) => {
      anim.onfinish = (): void => {
        if (this.goalsIntroAnim === anim) this.goalsIntroAnim = null;
        resolve();
      };
      anim.oncancel = (): void => resolve();
    });
  }

  /** This frame's quick line: the play line, then the outcome (none while the child builds: the
   * level's line plays in the modal lesson intro). */
  private quickLine(state: HudState): QuickLine | null {
    const level = state.level;
    if (state.mode === 'play') return { text: COASTER_LINES.play };
    if (state.mode !== 'done') return null;
    if (state.passed) return { text: COASTER_LINES.pass, tone: 'pass' };
    if (state.outcome === 'reachedEnd') {
      const atFinishGoal = state.goals.find((gr) => gr.goal.metric === 'atFinish');
      return { text: atFinishGoal && !atFinishGoal.pass ? COASTER_LINES.endShortOfFlag : COASTER_LINES.end };
    }
    if (state.outcome === 'rolledBack') return { text: level.hints.rolledBack, tone: 'fail' };
    if (state.outcome === 'stuck') return { text: level.hints.stuck, tone: 'fail' };
    if (state.outcome === 'fell') return { text: level.hints.fell, tone: 'fail' };
    return null;
  }

  update(state: HudState): void {
    if (!this.level) return;
    const level = this.level;
    const m = state.metrics;
    const editMode = state.mode === 'edit';
    const playMode = state.mode === 'play';
    const doneMode = state.mode === 'done';

    // ---- Bruno's quick line (src/ui/brunoDialog.ts): the top row, left of the level picker;
    // animates only when the text changes ----
    if (this.pickerLeft < 0) this.pickerLeft = this.topbarEl.offsetLeft;
    this.brunoDialog.setQuick(this.quickLine(state), this.pickerLeft);

    // ---- meters (the overlay shows once the fuzz rolls and keeps the final numbers) ----
    this.setHidden(this.metersColEl, editMode);
    this.setText(this.meterDrop.main, `${fmt1(m.maxDrop)} m`);

    const speedVal = playMode ? state.live.speed : m.maxSpeed;
    this.setText(this.meterSpeed.main, `${fmt1(speedVal)} m/s`);
    this.setText(this.meterSpeed.sub!, `(${Math.round(speedVal * 3.6)} km/h)`);

    this.setText(this.meterLength.main, `${fmt1(m.length)} m`);
    this.setText(this.meterHang.main, `${fmt2(m.hangTime)} s`);

    const loopsText = editMode
      ? `${Math.round(m.loops)}`
      : `${Math.round(m.loopsCompleted)}/${Math.round(m.loops)}`;
    this.setText(this.meterLoops.main, loopsText);
    this.setHidden(this.meterLoops.root, !(this.hasLoopsGoal || m.loops > 0));

    const gVal = playMode ? state.live.g : m.maxG;
    if (playMode) {
      this.setText(this.meterIntense.main, `${fmt1(gVal)} g`);
      this.setText(this.meterIntense.sub!, `max ${fmt1(m.maxG)}`);
    } else {
      this.setText(this.meterIntense.main, `max ${fmt1(m.maxG)} g`);
      this.setText(this.meterIntense.sub!, '');
    }
    const pct = Math.max(0, Math.min(100, (gVal / G_MAX) * 100));
    this.gaugeFillEl.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    this.gaugeNeedleEl.style.left = `${pct}%`;

    // ---- goal cards: fill toward the target, green with a check once met, pink once a "stay
    // under" limit breaks (src/core/goalCards.ts goalCardLive) ----
    state.goals.forEach((gr: GoalResult, i: number) => {
      const item = this.goalItems[i];
      if (!item) return;
      const live = goalCardLive(gr, state.mode);
      if (item.state !== live.state) {
        if (item.state) item.card.classList.remove(item.state);
        item.card.classList.add(live.state);
        item.state = live.state;
      }
      item.card.classList.toggle('warn', live.warn);
      const pct = Math.round(live.fill * 1000) / 10;
      if (item.fill && item.fillPct !== pct) {
        item.fill.style.width = `${pct}%`;
        item.fillPct = pct;
      }
    });

    // ---- bottom bar buttons ----
    this.setHidden(this.toolGroupEl, !editMode || !levelTools(level).length);
    if (level.newTool && state.tool === level.newTool && !this.newToolPicked) {
      this.newToolPicked = true;
      const badge = this.toolBadges.get(level.newTool);
      if (badge) this.setHidden(badge, true);
    }
    this.setHidden(this.skinBtn, !editMode);
    if (!editMode && !this.skinTray.hidden) this.toggleSkinTray(false);
    this.toolPointBtn.classList.toggle('active', state.tool === 'point');
    this.toolLoopBtn.classList.toggle('active', state.tool === 'loop');

    this.setHidden(this.playBtn, !editMode);
    this.setHidden(this.stopBtn, editMode);
    this.setDisabled(this.playBtn, !(editMode && state.canPlay));

    this.setHidden(this.undoBtn, !editMode);
    this.setHidden(this.clearBtn, !editMode);
    this.setDisabled(this.undoBtn, !(editMode && state.canUndo));
    this.setDisabled(this.clearBtn, !editMode);

    const isLastLevel = this.levelIndex >= this.allLevels.length - 1;
    this.setHidden(this.nextBtn, !(state.passed && !isLastLevel));

    // ---- level picker ----
    this.setDisabled(this.pickerPrevBtn, playMode || this.levelIndex <= 0);
    this.setDisabled(this.pickerNextBtn, playMode || this.levelIndex >= this.allLevels.length - 1);

    // ---- park button ----
    this.setDisabled(this.parkBtn, playMode);

    // ---- the tutorial hand over a bar button (after the buttons' visibility is set) ----
    this.syncCoachHand(editMode ? state.coach : null);
  }
}
