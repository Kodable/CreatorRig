// Generic builder-kit HUD: Bruno's dialog box, level picker, goals, meters, property panel and
// palette, driven by a HudSpec instead of Goldberg's hardcoded part/meter/line tables. Moved from
// activities/goldberg/ui/goldbergHud.ts. 2026-10-12: Bruno and his bubble left the top bar (only the
// level picker and Park stay there); he talks through src/ui/brunoDialog.ts (the modal lesson
// intro / hint inside the world panel, and the quick lines in the top row left of the picker), and the Hint button moved to the
// bottom bar's left end.
import type {
  BinItem,
  CoachTarget,
  Goal,
  GoalResult,
  HudCallbacks,
  HudSpec,
  HudState,
  Level,
  PropertyDescriptor,
  PropertyOption,
  ResultCard,
  StatBar,
  ToolSpec,
} from './types';
import { levelPickerLabel } from './chapters';
import { hasShelfKinds, nonShelfKinds, shelfGroups } from './shelf';
import { kitGoalCardLive, levelOver, type KitGoalCardState } from './goalCards';
import { binGroups, drawerHasContent, insideDropZone } from './bin';
import { dropPose } from './coachGesture';
import { playGoalsIntro as animateGoalsIntro, prefersReducedMotion } from '../ui/goalsIntro';
import { BrunoDialog, type QuickLine } from '../ui/brunoDialog';
import './builder.css';

const STAGE_W = 1024;

/** The world scrollbar (wide worlds): stage-px geometry along the bottom edge of the world panel
 * (x 32..992, bottom y 700). It ends left of the properties drawer (x 652) while that is open. */
const SCROLL_LEFT = 48;
const SCROLL_RIGHT = 976;
const SCROLL_RIGHT_DRAWER = 640;
/** The thumb is never narrower than this (stage px), whatever the view/world ratio. */
const SCROLL_THUMB_MIN = 88;

/** The world panel's top/bottom edges in stage px (the drawer and the win banner cover it). The
 * top is per course (`panelTop` constructor argument, view.ts `panelTopY`): 210 for the default
 * 480 px panel, higher for a taller world (2026-10-06: the rover's, under `hud.goalsOverlay`). */
const DEFAULT_PANEL_TOP = 210;
const PANEL_BOTTOM = 690;
/* The level-start goals intro's geometry and timing live in src/ui/goalsIntro.ts (2026-10-07: shared
   with the coaster HUD). */

/** Win banner confetti: pieces per burst, their colours, and how long until they are removed. */
const CONFETTI_COUNT = 40;
const CONFETTI_COLORS = ['#61bb46', '#ffb40f', '#05aeed', '#c32f96', '#ffffff', '#ff7a45'];
const CONFETTI_CLEAR_MS = 1900;

/** The shelf unlock callout stays this long (or until the next tap anywhere). */
const CALLOUT_MS = 4000;
const CALLOUT_W = 260;
/** Stagger between the unlocked shelf buttons' pop-ins. */
const UNLOCK_STAGGER_MS = 120;

/** The coach's pointer hand (2026-10-05): the game's 3-frame glove, `public/ui/hand_0N.png`
 * (310x360, white glove + black outline, index finger pointing up-left) — see `.coach-hand` in
 * builder.css for its displayed size. Frame 1 is the finger fully extended, frame 3 the most
 * curled. `fx`/`fy` is the anchor placed on the target, the SAME point for every frame (frame
 * 1's extended fingertip, measured with Pillow): the glove holds still and only the finger
 * bends, which reads as a tap (Gao, 2026-10-05: a hand that jumps around does not). */
const COACH_HAND_W = 55;
const COACH_HAND_H = 64;
const COACH_FRAME_MS = 1000 / 8; // ~8 fps
const COACH_HAND_FRAMES: { src: string; fx: number; fy: number }[] = [
  { src: 'ui/hand_01.png', fx: 108 / 310, fy: 2 / 360 },
  { src: 'ui/hand_02.png', fx: 108 / 310, fy: 2 / 360 },
  { src: 'ui/hand_03.png', fx: 108 / 310, fy: 2 / 360 },
];
/** Index into `COACH_HAND_FRAMES` for each step of the 1 -> 2 -> 3 -> 2 loop. */
const COACH_FRAME_SEQUENCE = [0, 1, 2, 1];

function fmt1(v: number): string {
  return v.toFixed(1);
}
// Whole-number goal targets ("15", "18") print without a decimal; anything else keeps one.
function fmtTarget(v: number): string {
  return Number.isInteger(v) ? String(v) : fmt1(v);
}

function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

interface GoalBar {
  pct: number;
  color: 'green' | 'orange' | 'pink';
}

interface GoalItem {
  row: HTMLLIElement;
  mark: HTMLSpanElement;
  label: HTMLSpanElement;
  value: HTMLSpanElement;
  barWrap: HTMLDivElement;
  fill: HTMLDivElement;
}

interface MeterEntry<M> {
  id: string;
  metric: keyof M & string;
  root: HTMLDivElement;
  main: HTMLSpanElement;
}

/** One flying copy of an option's picture, from the drawer button to one `flyTargets` result. */
interface Flyer {
  el: HTMLImageElement;
  anim: Animation;
  /** Stage-px translation and final scale reached at the end of the flight (offset 1 of
   * `anim`'s keyframes) — replayed as the base transform of the landing pop. */
  dx: number;
  dy: number;
  targetScale: number;
}

/** A picture-option tap flying to the machine, not yet committed. */
/** A flight lasts 520 ms; if it has not landed 400 ms after that, commit anyway. */
const FLIGHT_FALLBACK_MS = 920;

/** A kit goal card (`HudSpec.goalCards`, 2026-10-16): the card, its bar's fill and the look it
 * last drew (a state change re-pops the card through its CSS class, like the coaster's). */
interface GoalCardItem {
  card: HTMLLIElement;
  fill: HTMLDivElement | null;
  check: boolean;
  editLive: boolean;
  state: KitGoalCardState | null;
  fillPct: number;
}

/** The SUPPLY BIN (2026-10-16): a finger moving this far (stage px) from where it pressed a tile
 * turns the press into a drag; less is a tap. */
const BIN_DRAG_PX = 8;
/** The dragged tile's ghost picture, stage px across. */
const BIN_GHOST_PX = 72;
/** A drop zone's radius for the drop test is never under this (stage px): a small part still
 * takes a drop from a finger. */
const BIN_DROP_MIN_R = 40;
/** The coach's 'drop' demonstration carries a ghost this big (stage px). */
const COACH_GHOST_PX = 56;

/** A bin tile pressed (and maybe dragged) by one pointer. */
interface BinPress {
  itemId: string;
  pointerId: number;
  tile: HTMLElement;
  img: HTMLImageElement;
  /** Where it pressed, stage px. */
  start: { x: number; y: number };
  dragging: boolean;
  ghost: HTMLImageElement | null;
  hot: boolean;
}

interface PendingFlight {
  code: string;
  value: string;
  partId: number;
  flyers: Flyer[];
  committed: boolean;
  /** 2026-10-16: how the flight commits when it is not a plain `setProp(code, value)` (a bin tile:
   * `applyBin`, which recomputes a `step` item's value at landing). */
  apply?: () => void;
  /** Safety net: commits the change even if the animation clock stalls (a background tab pauses
   * animations, so `onfinish` may never fire there). */
  fallback?: ReturnType<typeof setTimeout>;
}

export class BuilderHud<
  K extends string,
  M extends Record<string, number>,
  O extends string,
  L extends Level<K, M, O>,
> {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly cb: HudCallbacks<K>;
  private readonly hud: HudSpec<K, M, O>;
  private readonly tools: ToolSpec[];
  /** `spec.drawer`: properties show in a slide-out drawer instead of the dash chip panel. */
  private readonly drawerMode: boolean;

  private readonly textCache = new Map<Element, string>();
  private readonly boolCache = new Map<Element, boolean>();

  private level: L | null = null;
  private allLevels: L[] = [];
  private levelIndex = 0;
  private goalItems: GoalItem[] = [];
  /** `HudSpec.goalCards` with `goalsOverlay`: the goals are the coaster's row of cards. */
  private readonly goalCardsMode: boolean;
  private goalCardItems: GoalCardItem[] = [];

  // ---- the SUPPLY BIN (2026-10-16, `CourseSpec.bin` / `HudState.bin`; drawer courses only) ----
  private drawerBinEl!: HTMLDivElement;
  private drawerBinBodyEl!: HTMLDivElement;
  private binKey: string | null = null;
  /** The tiles drawn now, by item id (the coach's 'bin' target, the drag's way home). */
  private binTiles = new Map<string, { tile: HTMLElement; img: HTMLImageElement }>();
  /** This frame's items by id (locked/active read at event time). */
  private binItemsById = new Map<string, BinItem>();
  private binPress: BinPress | null = null;
  /** The selected part's id as of the last `update` (a bin tap's flight is started for it). */
  private lastSelectedPartId: number | null = null;
  /** The coach's 'drop' demonstration: the ghost it carries, and when its stroke started. */
  private coachGhostEl!: HTMLImageElement;
  private coachStrokeStart = 0;

  /** Bruno's dialog box: the modal lesson intro / hint, and the quick lines (src/ui/brunoDialog.ts).
   * The controller (BuilderApp) runs the modal; `update` feeds the quick line every frame. */
  brunoDialog!: BrunoDialog;
  /** The top row (level picker + Park); Bruno's quick line sits left of it. */
  private topbarEl!: HTMLDivElement;
  /** `topbarEl`'s left edge in stage px, or -1 to measure it again (see `pickerLeftNow`). */
  private pickerLeft = -1;
  private goalsColEl!: HTMLDivElement;
  private goalListEl!: HTMLUListElement;

  private hintBtn!: HTMLButtonElement;

  private pickerLabelEl!: HTMLSpanElement;
  private pickerPrevBtn!: HTMLButtonElement;
  private pickerNextBtn!: HTMLButtonElement;
  private parkBtn!: HTMLButtonElement;

  private metersColEl!: HTMLDivElement;
  /** The dash, or null with `hud.goalsOverlay` (no dash: the goals and the result card sit in
   * `.goals-overlay` over the world panel instead). */
  private dashEl: HTMLDivElement | null = null;
  /** `.goals-overlay` with `hud.goalsOverlay`, else null. */
  private goalsOverlayEl: HTMLDivElement | null = null;
  /** The level-start goals intro in flight (see `playGoalsIntro`), cancelled by the next level. */
  private goalsIntroAnim: Animation | null = null;
  /** `hud.metersOverlay`, or implied by `hud.goalsOverlay` (the dash is gone, so are its meters). */
  private readonly metersOverlay: boolean;
  /** Stage y of the world panel's top edge (see DEFAULT_PANEL_TOP). */
  private readonly panelTop: number;
  private allMeters: MeterEntry<M>[] = [];

  private propPanelEl!: HTMLDivElement;
  private propTitleIconEl!: HTMLSpanElement;
  private propTitleLabelEl!: HTMLSpanElement;
  private propRowsEl!: HTMLDivElement;
  private propPanelKey: string | null = null;
  private propChipsByCode = new Map<string, Map<string, HTMLButtonElement>>();

  private statBarsEl!: HTMLDivElement;
  /** Shared rebuild/update state for every stat-bar container (prop panel + dash), keyed by
   * container element so the row DOM is only rebuilt when that container's label list changes. */
  private readonly statBarState = new Map<HTMLDivElement, { key: string; rows: { fill: HTMLDivElement }[] }>();

  // ---- dash stat bars (dash right column, .meters-col slot; drawer courses only, shown while
  // the drawer is open — the drawer itself has no room to spare for a 5th section) ----
  private dashStatsEl!: HTMLDivElement;

  // ---- properties drawer (spec.drawer courses only) ----
  private drawerEl!: HTMLDivElement;
  private drawerHeaderIconEl!: HTMLSpanElement;
  private drawerHeaderLabelEl!: HTMLSpanElement;
  private drawerHeaderRightEl!: HTMLDivElement;
  /** "[koin] used / total", shown in the drawer header (right side) for shelf courses instead of
   * the bottom-bar pill (see `budgetPillEl`). */
  private drawerBudgetPillEl!: HTMLDivElement;
  private drawerBudgetPillTextEl!: HTMLSpanElement;
  private drawerRowsEl!: HTMLDivElement;
  private drawerPanelKey: string | null = null;
  // ---- pinned selected-part panel (shelf courses only; outside the scrollable body, see
  // BuilderHud.update()'s `shelfOn` rule and builder.css's `.drawer-pinned-panel`). Holds the same
  // kind of descriptor rows as `drawerRowsEl`, just in a different container so the shelf above it
  // never moves when the selection changes. ----
  private drawerPinnedEl!: HTMLDivElement;
  private drawerPinnedRowsEl!: HTMLDivElement;
  // ---- parts shelf (bottom of the drawer body; shelf courses only — see shelf.ts) ----
  private drawerSeparatorEl!: HTMLDivElement;
  private drawerShelfEl!: HTMLDivElement;
  private shelfKey: string | null = null;
  private shelfButtons = new Map<K, HTMLButtonElement>();
  private drawerOptionsByCode = new Map<string, Map<string, HTMLButtonElement>>();
  /** `el` is the label's text span, not the whole label div: it holds only the descriptor's
   * text ("Power" / "Power · Medium"), updated by `syncDrawerActive`, so a sibling NEW badge
   * (see `rebuildDrawerPanel`) never gets clobbered by that update. */
  private drawerSectionLabelByCode = new Map<string, { el: HTMLSpanElement; base: string; hasImages: boolean }>();
  private drawerOpen = false;
  private drawerHideTimer: ReturnType<typeof setTimeout> | undefined;
  /** "The part flies to the machine": a picture-option tap in progress, flying copies of the
   * button's picture from the drawer to where that part sits on the machine. `partId` is the
   * part the flight was started for (setProp must land on THAT part, not whatever is selected
   * once the flight finishes: the child may have reselected something else by then). */
  private flight: PendingFlight | null = null;

  // ---- coach (HudState.coach): Bruno's line and the pointer hand over a DOM target ----
  private coachHandEl!: HTMLDivElement;
  private coachHandImgEl!: HTMLImageElement;
  /** Step id + resolved target: the hand pops in again when it changes. */
  private coachHandKey = '';
  /** Property rows in the dash chip panel, by code (a coach 'drawer' target on a no-drawer course). */
  private propRowByCode = new Map<string, HTMLDivElement>();
  /** Drawer property sections, by code (a coach 'drawer' target without a value). */
  private drawerSectionByCode = new Map<string, HTMLDivElement>();

  // ---- win banner (HudSpec.winBanner only) ----
  private winEl: HTMLDivElement | null = null;
  private winCardEl: HTMLDivElement | null = null;
  private winConfettiEl: HTMLDivElement | null = null;
  private winOutcomeEl: HTMLDivElement | null = null;
  private winNextBtn: HTMLButtonElement | null = null;
  private winOpen = false;
  /** The current pass already opened the banner: it shows once per pass, and a dismissed banner
   * stays hidden until the next pass. */
  private winShownThisPass = false;
  private confettiTimer: ReturnType<typeof setTimeout> | undefined;

  // ---- shelf unlock callout (HudState.unlocked) ----
  private calloutEl!: HTMLDivElement;
  private calloutImgEl!: HTMLImageElement;
  private calloutIconEl!: HTMLSpanElement;
  private calloutTitleEl!: HTMLDivElement;
  private calloutTextEl!: HTMLDivElement;
  /** The kind the callout explains, or null while it is hidden. */
  private calloutKind: K | null = null;
  private calloutTimer: ReturnType<typeof setTimeout> | undefined;
  /** This level load's unlock pop + callout already played (or there was nothing to play). */
  private unlockPlayed = true;
  private readonly onCalloutPointerDown = (): void => this.hideCallout();

  private resultCardEl!: HTMLDivElement;
  private resultTitleEl!: HTMLDivElement;
  private resultRowsEl!: HTMLDivElement;
  private resultOutcomeEl!: HTMLDivElement;
  private resultCardKey: string | null = null;

  private paletteEl!: HTMLDivElement;
  private paletteKey: string | null = null;
  private paletteButtons = new Map<K, HTMLButtonElement>();

  /** "[koin] used / total" pill (bottom bar, next to the palette); hidden on courses without a
   * `Level.budget`. Its text is set per frame without rebuilding the pill itself. */
  private budgetPillEl!: HTMLDivElement;
  private budgetPillTextEl!: HTMLSpanElement;

  /** The spend animation (2026-10-05 round 2): `state.budget.used` from the PREVIOUS `update()`
   * call, so an increase (a part/option was added or upgraded) can be told apart from a decrease
   * (Remove/Undo) — null while there is no budget, or right after a level load (no previous frame
   * to compare against). */
  private lastBudgetUsed: number | null = null;
  /** The button the child last tapped to add a part or change an option (a shelf/palette button,
   * a prop-panel chip, or a drawer option button) — the flying coins' start point. Remembered by
   * each of those click handlers, not cleared afterwards (a stale element just fails the
   * `getBoundingClientRect` check in `playSpendAnimation` and the coins are skipped). */
  private lastSpendButton: HTMLElement | null = null;

  private toolGroupEl!: HTMLDivElement;
  private toolButtons = new Map<string, HTMLButtonElement>();

  private playBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private undoBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  // ---- world scrollbar (wide worlds only; shown while HudState.scroll is a number) ----
  private scrollEl!: HTMLDivElement;
  private scrollThumbEl!: HTMLDivElement;
  /** viewW / worldW: the thumb's share of the track. 1 = the world fits (the bar never shows). */
  private readonly scrollView: number;
  /** The thumb position, 0..1: `HudState.scroll`, or the finger's while dragging. */
  private scrollT = 0;
  /** A thumb/track drag in progress: the pointer, and where on the thumb it grabbed (stage px). */
  private scrollDrag: { pointerId: number; grab: number } | null = null;
  private scrollLayoutKey = '';

  private readonly syncHandler = (): void => this.syncTransform();
  private intervalId: ReturnType<typeof setInterval> | undefined;

  constructor(
    root: HTMLElement,
    canvas: HTMLCanvasElement,
    cb: HudCallbacks<K>,
    hud: HudSpec<K, M, O>,
    drawer = false,
    tools: ToolSpec[] = [],
    /** viewW / worldW (`WorldSpec`): the share of the world the panel shows, sizing the world
     * scrollbar's thumb. 1 (default) for a world that fits the view. */
    scrollView = 1,
    /** Stage y of the world panel's top edge (view.ts `panelTopY`): 210 (default) for the 480 px
     * panel; less for a taller world. */
    panelTop = DEFAULT_PANEL_TOP,
  ) {
    this.root = root;
    this.canvas = canvas;
    this.cb = cb;
    this.hud = hud;
    this.drawerMode = drawer;
    this.tools = tools;
    this.scrollView = Math.max(0, Math.min(1, scrollView));
    this.metersOverlay = !!hud.metersOverlay || !!hud.goalsOverlay;
    this.goalCardsMode = !!hud.goalsOverlay && !!hud.goalCards;
    this.panelTop = panelTop;
    // Every rule anchored to the world panel's top (builder.css: the drawer, the win banner;
    // style.css: the meters/goals overlays) reads it from here; their fallback is the default 210px.
    root.style.setProperty('--panel-top', `${panelTop}px`);

    this.build();

    this.syncHandler();
    window.addEventListener('resize', this.syncHandler);
    window.addEventListener('orientationchange', this.syncHandler);
    window.visualViewport?.addEventListener('resize', this.syncHandler);
    this.intervalId = setInterval(this.syncHandler, 1000);
  }

  destroy(): void {
    if (this.intervalId !== undefined) clearInterval(this.intervalId);
    clearTimeout(this.confettiTimer);
    this.goalsIntroAnim?.cancel();
    this.goalsIntroAnim = null;
    this.hideCallout();
    this.brunoDialog.destroy();
    window.removeEventListener('resize', this.syncHandler);
    window.removeEventListener('orientationchange', this.syncHandler);
    window.visualViewport?.removeEventListener('resize', this.syncHandler);
    // Cancel (don't commit) any in-flight flyers so a stray `onfinish` can't fire after teardown.
    if (this.flight) {
      clearTimeout(this.flight.fallback);
      for (const f of this.flight.flyers) {
        f.anim.onfinish = null;
        f.anim.cancel();
      }
      this.flight = null;
    }
    this.cancelBinPress(false);
    this.root.innerHTML = '';
    // The root (#ui) is shared with the next activity (the coaster HUD among them).
    this.root.style.removeProperty('--panel-top');
  }

  private syncTransform(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = rect.width / STAGE_W;
    this.root.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(${scale})`;
  }

  private chipDisplayLabel(opt: PropertyOption): string {
    return this.hud.chipLabels?.[opt.label] ?? this.hud.chipLabels?.[opt.value] ?? opt.label;
  }

  /** A tiny "NEW" pill for a drawer row / chip panel label whose code this level just introduced
   * (`HudState.introduced`). Subtle: 12px, the accent colour, next to the label text. */
  private makeNewBadge(): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = 'new-badge';
    badge.textContent = 'NEW';
    badge.style.cssText =
      'display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;' +
      'background:#05aeed;color:#0b1030;font-size:12px;font-weight:800;line-height:1.5;vertical-align:middle;';
    return badge;
  }

  /** The same NEW badge, pinned to a picture option button's top-left corner (the lock badge owns
   * top-right — see `syncDrawerActive`) for a `code:value` entry in `HudState.introduced`: marks
   * that ONE option, not the whole row (the row keeps `makeNewBadge` for a plain `code` entry). */
  private makeOptionNewBadge(): HTMLSpanElement {
    const badge = this.makeNewBadge();
    badge.style.position = 'absolute';
    badge.style.top = '-6px';
    badge.style.left = '-6px';
    badge.style.margin = '0';
    badge.style.padding = '0 5px';
    badge.style.fontSize = '10px';
    badge.style.pointerEvents = 'none';
    return badge;
  }

  /** The coin picture (`public/ui/koin.png`, a gold "K" coin), replacing every 🪙 glyph in the HUD
   * (Gao, 2026-10-05 round 2). `heightPx` is a CSS height (14-16px, vertically centred with its
   * sibling text via the shared `.koin` rule in builder.css); callers that need a different flight
   * size for the spend animation pass a bigger one. */
  private makeKoinImg(heightPx = 15): HTMLImageElement {
    const img = document.createElement('img');
    img.className = 'koin';
    img.src = 'ui/koin.png';
    img.alt = '';
    img.draggable = false;
    img.style.height = `${heightPx}px`;
    return img;
  }

  /** A small gold "+N" badge (with the koin picture) for an option that costs more than the
   * cheapest option in its row (`HudState.selected.optionCosts`), same style family as the
   * shelf/palette coin pill. Inline, next to the chip's label text. */
  private makeCostBadge(extra: number): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = 'cost-badge';
    const text = document.createElement('span');
    text.textContent = `+${extra}`;
    badge.append(text, this.makeKoinImg(11));
    badge.style.cssText =
      'display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:0 6px;border-radius:999px;' +
      'background:#ffb40f;color:#1a2142;font-size:11px;font-weight:800;line-height:1.5;vertical-align:middle;';
    return badge;
  }

  /** The same cost badge, pinned to a picture option button's top-right corner (the NEW badge owns
   * top-left — see `makeOptionNewBadge`). Sits INSIDE the button's box (`.option-btn` clips
   * overflow, unlike `.shelf-btn`), so it never gets cropped. */
  private makeOptionCostBadge(extra: number): HTMLSpanElement {
    const badge = this.makeCostBadge(extra);
    badge.style.position = 'absolute';
    badge.style.top = '2px';
    badge.style.right = '2px';
    badge.style.margin = '0';
    badge.style.padding = '0 4px';
    badge.style.fontSize = '9px';
    badge.style.pointerEvents = 'none';
    return badge;
  }

  private goalValueText(goal: Goal<M>, current: number): string {
    return this.hud.goalValueText(goal, current);
  }

  private goalBar(goal: Goal<M>, current: number, pass: boolean): GoalBar | null {
    if (this.hud.barlessMetrics.includes(goal.metric)) return null;
    if (goal.op === '==') {
      return { pct: pass ? 100 : 0, color: pass ? 'green' : 'orange' };
    }
    const ratio = goal.value !== 0 ? current / goal.value : pass ? 1 : 0;
    const pct = Math.max(0, Math.min(100, ratio * 100));
    if (goal.op === '>=') {
      return { pct, color: pass ? 'green' : 'orange' };
    }
    // '<=' : under the limit is green, over is pink.
    return { pct, color: pass ? 'green' : 'pink' };
  }

  private build(): void {
    this.root.innerHTML = '';

    // ---- topbar: only the level picker and Park, at the top right (2026-10-12) ----
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

    // ---- dashboard ----
    // `hud.goalsOverlay` (2026-10-06, the rover): no dash on screen. The goals column (same
    // DOM, same `setLevel`/`update` code) and the result card go into a small translucent panel
    // over the world panel's top-left corner (builder.css .goals-overlay) instead; the dash is
    // still built, detached, so its other refs (chip panel, stat bars) stay valid but never show.
    const dash = document.createElement('div');
    dash.id = 'dash';
    const goalsOverlay = this.hud.goalsOverlay ? document.createElement('div') : null;
    // 2026-10-16: `hud.goalCards` turns the overlay into the coaster's row of goal cards (the
    // global style.css `.goals-overlay.goal-cards` drops the navy panel).
    if (goalsOverlay) goalsOverlay.className = this.goalCardsMode ? 'goals-overlay goal-cards' : 'goals-overlay';

    const goalsCol = document.createElement('div');
    goalsCol.className = 'goals-col';
    const goalList = document.createElement('ul');
    goalList.id = 'goalList';
    goalsCol.appendChild(goalList);
    (goalsOverlay ?? dash).appendChild(goalsCol);
    this.goalsColEl = goalsCol;
    this.goalListEl = goalList;

    const metersCol = document.createElement('div');
    metersCol.className = 'meters-col';
    for (const spec of this.hud.meters) {
      const meter = document.createElement('div');
      meter.className = 'meter';
      meter.id = spec.id;
      const lbl = document.createElement('div');
      lbl.className = 'meter-label';
      lbl.textContent = spec.label;
      const val = document.createElement('div');
      val.className = 'meter-value';
      const main = document.createElement('span');
      main.className = 'main';
      val.appendChild(main);
      meter.append(lbl, val);
      metersCol.appendChild(meter);
      this.allMeters.push({ id: spec.id, metric: spec.metric, root: meter, main });
    }
    this.metersColEl = metersCol;
    if (this.metersOverlay) {
      // Over the world panel's top-right corner (builder.css .meters-col.overlay); appended
      // after the dash so it sits above it in DOM order.
      metersCol.classList.add('overlay');
      metersCol.hidden = true;
    } else {
      dash.appendChild(metersCol);
    }

    // ---- dash stat bars (shown instead of .meters-col while the drawer is open and the
    // selected part has stat bars; see the three-way rule in update()) ----
    const dashStats = document.createElement('div');
    dashStats.className = 'dash-stats';
    dashStats.hidden = true;
    dash.appendChild(dashStats);
    this.dashStatsEl = dashStats;

    // ---- property panel (shown instead of .meters-col when a part is selected) ----
    const propPanel = document.createElement('div');
    propPanel.className = 'prop-panel';
    propPanel.hidden = true;
    const propHeader = document.createElement('div');
    propHeader.className = 'prop-panel-header';
    const propTitle = document.createElement('div');
    propTitle.className = 'prop-panel-title';
    const propIcon = document.createElement('span');
    propIcon.className = 'icon';
    const propLabel = document.createElement('span');
    propLabel.className = 'label';
    propTitle.append(propIcon, propLabel);
    // No Remove button here: the delete badge on the part's selection box does that (scene).
    propHeader.append(propTitle);
    const statBars = document.createElement('div');
    statBars.className = 'stat-bars';
    statBars.hidden = true;
    const propRows = document.createElement('div');
    propRows.className = 'prop-rows';
    propPanel.append(propHeader, statBars, propRows);
    dash.appendChild(propPanel);
    this.propPanelEl = propPanel;
    this.propTitleIconEl = propIcon;
    this.propTitleLabelEl = propLabel;
    this.propRowsEl = propRows;
    this.statBarsEl = statBars;

    // ---- result card (shown instead of .meters-col / .prop-panel in done mode; under the goals
    // in the goals overlay with `hud.goalsOverlay`) ----
    const resultCard = document.createElement('div');
    resultCard.className = 'result-card';
    resultCard.hidden = true;
    const resultTitle = document.createElement('div');
    resultTitle.className = 'result-card-title';
    const resultRows = document.createElement('div');
    resultRows.className = 'result-rows';
    const resultOutcome = document.createElement('div');
    resultOutcome.className = 'result-outcome';
    resultCard.append(resultTitle, resultRows, resultOutcome);
    (goalsOverlay ?? dash).appendChild(resultCard);
    this.resultCardEl = resultCard;
    this.resultTitleEl = resultTitle;
    this.resultRowsEl = resultRows;
    this.resultOutcomeEl = resultOutcome;

    if (goalsOverlay) {
      this.root.appendChild(goalsOverlay);
      this.goalsOverlayEl = goalsOverlay;
    } else {
      this.root.appendChild(dash);
      this.dashEl = dash;
    }
    if (this.metersOverlay) this.root.appendChild(metersCol);

    // ---- bottom bar ----
    const bottombar = document.createElement('div');
    bottombar.id = 'bottombar';

    // The Hint button at the bar's left end (2026-10-12: moved from the top bar). A tap plays the
    // level's next hint in Bruno's modal dialog (BuilderApp.hint).
    const hintBtn = document.createElement('button');
    hintBtn.id = 'hint';
    hintBtn.type = 'button';
    hintBtn.className = 'secondary';
    hintBtn.textContent = '💡 Hint';
    hintBtn.addEventListener('click', () => this.cb.hint());
    bottombar.appendChild(hintBtn);
    this.hintBtn = hintBtn;

    const toolGroup = document.createElement('div');
    toolGroup.className = 'tool-group';
    for (const tool of this.tools) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tool';
      btn.textContent = `${tool.icon} ${tool.label}`;
      btn.addEventListener('click', () => this.cb.setTool(tool.id));
      toolGroup.appendChild(btn);
      this.toolButtons.set(tool.id, btn);
    }
    bottombar.appendChild(toolGroup);
    this.toolGroupEl = toolGroup;

    const budgetPill = document.createElement('div');
    budgetPill.className = 'budget-pill';
    budgetPill.hidden = true;
    const budgetPillText = document.createElement('span');
    budgetPill.append(this.makeKoinImg(), budgetPillText);
    bottombar.appendChild(budgetPill);
    this.budgetPillEl = budgetPill;
    this.budgetPillTextEl = budgetPillText;

    const palette = document.createElement('div');
    palette.className = 'palette';
    bottombar.appendChild(palette);
    this.paletteEl = palette;

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

    // Play/Run it again, Stop/Reset and Next level share one box centred over the bar (style.css
    // .bar-centre), side by side whichever of them show (2026-10-07: each was centred on its own
    // and they stacked in done mode, e.g. the catapult's passed shot with shots left).
    const barCentre = document.createElement('div');
    barCentre.className = 'bar-centre';
    bottombar.appendChild(barCentre);
    this.playBtn = makeBtn('play', '▶ Play', 'primary', () => this.cb.play(), barCentre);
    this.stopBtn = makeBtn('stop', '■ Stop', 'stop', () => this.cb.stop(), barCentre);
    this.undoBtn = makeBtn('undo', '↶ Undo', 'secondary', () => this.cb.undo());
    this.clearBtn = makeBtn('clear', 'Clear', 'secondary', () => this.cb.clear());
    this.nextBtn = makeBtn('next', 'Next level ▶', 'primary', () => this.cb.next(), barCentre);

    this.root.appendChild(bottombar);

    // ---- world scrollbar (bottom edge of the world panel; before the drawer, which covers it) ----
    this.buildScrollbar();

    // ---- properties drawer (right edge of the world panel; spec.drawer courses only) ----
    if (this.drawerMode) this.buildDrawer();

    // ---- over everything in the panel: the win banner, the unlock callout, the coach's hand ----
    if (this.hud.winBanner) this.buildWinBanner();
    this.buildCallout();
    this.buildCoachHand();

    // ---- Bruno's dialog box, over everything (src/ui/brunoDialog.ts) ----
    this.brunoDialog = new BrunoDialog(this.root);
  }

  /** "Level complete!" over the world panel (`HudSpec.winBanner` only): confetti, the result
   * card's outcome line, a big green Next button, Try again, and a close ✕. Hidden until a pass. */
  private buildWinBanner(): void {
    const wrap = document.createElement('div');
    wrap.className = 'win-banner';
    wrap.hidden = true;
    this.boolCache.set(wrap, true);
    const confetti = document.createElement('div');
    confetti.className = 'win-confetti';
    const card = document.createElement('div');
    card.className = 'win-card';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'win-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => {
      this.dismissWin();
      this.cb.dismissWin();
    });
    const title = document.createElement('div');
    title.className = 'win-title';
    title.textContent = 'Level complete!';
    const outcome = document.createElement('div');
    outcome.className = 'win-outcome';
    const actions = document.createElement('div');
    actions.className = 'win-actions';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'win-next';
    next.textContent = 'Next level ▶';
    next.addEventListener('click', () => this.cb.next());
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'win-retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => this.cb.stop());
    actions.append(next, retry);
    card.append(close, title, outcome, actions);
    wrap.append(confetti, card);
    this.root.appendChild(wrap);
    this.winEl = wrap;
    this.winCardEl = card;
    this.winConfettiEl = confetti;
    this.winOutcomeEl = outcome;
    this.winNextBtn = next;
  }

  /** The shelf unlock callout: the new part's picture, its label and `partInfo[kind].blurb`, in a
   * card beside its shelf button. Hidden until a level that unlocks a kind opens its shelf.
   *
   * The speech-bubble arrow (`.unlock-callout-arrow`) is a real sibling element of the card, not
   * the card's own `::after` (it sits at e.g. `right: -11px`, outside the card's own box) — both
   * live in `.unlock-callout-wrap`, which `calloutEl` refers to (position/hide/animate the pair
   * together), the same box the card alone used to occupy (so `placeCallout`'s math is
   * unchanged). This split was written for a CSS mask-border skin that was later reverted (see
   * builder.css's 2026-10-05 "box_curved skin" note) but is harmless and kept as-is. */
  private buildCallout(): void {
    const wrap = document.createElement('div');
    wrap.className = 'unlock-callout-wrap';
    wrap.hidden = true;
    this.boolCache.set(wrap, true);

    const card = document.createElement('div');
    card.className = 'unlock-callout';
    const img = document.createElement('img');
    img.className = 'unlock-callout-img';
    img.alt = '';
    img.draggable = false;
    const icon = document.createElement('span');
    icon.className = 'unlock-callout-icon';
    const body = document.createElement('div');
    body.className = 'unlock-callout-body';
    const kicker = document.createElement('div');
    kicker.className = 'unlock-callout-kicker';
    kicker.textContent = 'NEW PART!';
    const title = document.createElement('div');
    title.className = 'unlock-callout-title';
    const text = document.createElement('div');
    text.className = 'unlock-callout-text';
    body.append(kicker, title, text);
    card.append(img, icon, body);

    const arrow = document.createElement('div');
    arrow.className = 'unlock-callout-arrow';

    wrap.append(card, arrow);
    this.root.appendChild(wrap);
    this.calloutEl = wrap;
    this.calloutImgEl = img;
    this.calloutIconEl = icon;
    this.calloutTitleEl = title;
    this.calloutTextEl = text;
  }

  /** The coach's pointer hand for DOM targets (shelf buttons, drawer rows/options, bottom-bar
   * buttons): the game's 3-frame glove (see COACH_HAND_FRAMES), its `src` cycled by
   * `syncCoachHand` every frame. Hidden while there is none. */
  private buildCoachHand(): void {
    const hand = document.createElement('div');
    hand.className = 'coach-hand';
    hand.hidden = true;
    this.boolCache.set(hand, true);
    const img = document.createElement('img');
    img.src = COACH_HAND_FRAMES[0]!.src;
    img.alt = '';
    hand.appendChild(img);
    // 2026-10-16: the 'drop' demonstration's ghost tile (under the glove, `syncCoachHand`).
    const ghost = document.createElement('img');
    ghost.className = 'coach-drop-ghost';
    ghost.alt = '';
    ghost.draggable = false;
    ghost.hidden = true;
    this.boolCache.set(ghost, true);
    this.root.append(ghost, hand);
    this.coachHandEl = hand;
    this.coachHandImgEl = img;
    this.coachGhostEl = ghost;
  }

  /** Restarts a one-shot CSS animation class on `el` (even mid-animation). */
  private restartAnim(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth; // a reflow, so re-adding the class restarts the animation
    el.classList.add(cls);
  }

  /** Hides the win banner until the next pass (the close ✕; `HudCallbacks.dismissWin`). */
  dismissWin(): void {
    if (!this.winEl || !this.winOpen) return;
    this.winOpen = false;
    this.setHidden(this.winEl, true);
    clearTimeout(this.confettiTimer);
    if (this.winConfettiEl) this.winConfettiEl.innerHTML = '';
  }

  private showWin(): void {
    if (!this.winEl || !this.winCardEl) return;
    this.winOpen = true;
    this.setHidden(this.winEl, false);
    if (!prefersReducedMotion()) this.restartAnim(this.winCardEl, 'enter');
    this.burstConfetti();
  }

  /** ~40 DOM confetti pieces bursting from the card's middle (CSS keyframes, ~1.5 s), removed
   * shortly after. None when the child's system asks for reduced motion. */
  private burstConfetti(): void {
    const host = this.winConfettiEl;
    if (!host) return;
    host.innerHTML = '';
    clearTimeout(this.confettiTimer);
    if (prefersReducedMotion()) return;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const piece = document.createElement('span');
      piece.className = i % 3 === 0 ? 'confetti-piece round' : 'confetti-piece';
      const dx = (Math.random() * 2 - 1) * 440;
      piece.style.setProperty('--dx', `${dx.toFixed(0)}px`);
      piece.style.setProperty('--up', `${(-(120 + Math.random() * 170)).toFixed(0)}px`);
      piece.style.setProperty('--dy', `${(170 + Math.random() * 190).toFixed(0)}px`);
      piece.style.setProperty('--rot', `${((Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720)).toFixed(0)}deg`);
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
      piece.style.animationDelay = `${(Math.random() * 160).toFixed(0)}ms`;
      piece.style.animationDuration = `${(1250 + Math.random() * 300).toFixed(0)}ms`;
      host.appendChild(piece);
    }
    this.confettiTimer = setTimeout(() => {
      host.innerHTML = '';
    }, CONFETTI_CLEAR_MS);
  }

  /** The win banner per frame: opens once when a pass lands in done mode, closes on leaving it
   * (Try again / `stop`, a new run, a level change). */
  private syncWin(state: HudState<K, M, O, L>): void {
    if (!this.winEl) return;
    const passNow = state.mode === 'done' && state.passed;
    if (!passNow) {
      this.winShownThisPass = false;
      if (this.winOpen) this.dismissWin();
      return;
    }
    if (!this.winShownThisPass) {
      this.winShownThisPass = true;
      this.showWin();
    }
    if (!this.winOpen) return;
    if (this.winOutcomeEl) this.setText(this.winOutcomeEl, state.result?.outcome || this.hud.lines.pass);
    if (this.winNextBtn) this.setHidden(this.winNextBtn, this.levelIndex >= this.allLevels.length - 1);
  }

  /** A DOM element's box in stage px, or null when it is not on screen: hidden, inside the closed
   * drawer, scrolled out of its drawer column, or outside the stage. */
  private visibleStageRect(el: HTMLElement): { x: number; y: number; w: number; h: number } | null {
    if (el.closest('[hidden]')) return null;
    if (el.closest('.prop-drawer') && !this.drawerOpen) return null;
    const rootRect = this.root.getBoundingClientRect();
    if (rootRect.width <= 0 || rootRect.height <= 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const midY = r.top + r.height / 2;
    const clip = el.closest('.prop-drawer-body, .drawer-pinned-panel');
    if (clip) {
      const c = clip.getBoundingClientRect();
      if (midY < c.top || midY > c.bottom) return null;
    }
    const k = STAGE_W / rootRect.width;
    const rect = { x: (r.left - rootRect.left) * k, y: (r.top - rootRect.top) * k, w: r.width * k, h: r.height * k };
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    if (cx < 0 || cx > STAGE_W || cy < 0 || cy > 768) return null;
    return rect;
  }

  /** The DOM element a coach target points at (null for in-scene 'widget'/'part' targets, which
   * the scene draws, and for 'none'). */
  private coachTargetEl(t: CoachTarget<K>): HTMLElement | null {
    switch (t.type) {
      case 'shelf':
        return this.shelfButtons.get(t.kind) ?? this.paletteButtons.get(t.kind) ?? null;
      case 'drawer':
        if (t.value !== undefined) {
          return this.drawerOptionsByCode.get(t.code)?.get(t.value) ?? this.propChipsByCode.get(t.code)?.get(t.value) ?? null;
        }
        return this.drawerSectionByCode.get(t.code) ?? this.propRowByCode.get(t.code) ?? null;
      case 'bin':
        return this.binTiles.get(t.itemId)?.tile ?? null;
      case 'bar':
        switch (t.button) {
          case 'play':
            return this.playBtn;
          case 'next':
            return this.winOpen && this.winNextBtn ? this.winNextBtn : this.nextBtn;
          case 'undo':
            return this.undoBtn;
          case 'clear':
            return this.clearBtn;
        }
        return null;
      default:
        return null;
    }
  }

  /** Places the coach's hand on its DOM target (the current frame's measured fingertip exactly on
   * the target point), popping it in when the step or target changes; hidden when there is no DOM
   * target on screen. Cycles the glove's `src` through the 1 -> 2 -> 3 -> 2 loop every call (this
   * runs once per app frame — see `App.frame` -> `hud.update`); reduced motion holds frame 1. */
  private syncCoachHand(state: HudState<K, M, O, L>): void {
    const step = state.coach;
    const el = step ? this.coachTargetEl(step.target) : null;
    const rect = el ? this.visibleStageRect(el) : null;
    // The hand steps aside while the child has a bin tile in hand.
    if (!step || !rect || this.binPress?.dragging) {
      this.setHidden(this.coachHandEl, true);
      this.setHidden(this.coachGhostEl, true);
      this.coachHandKey = '';
      return;
    }
    if (step.target.type === 'bin' && step.gesture?.kind === 'drop' && this.syncCoachDrop(step.id, step.target.itemId, rect)) return;
    this.setHidden(this.coachGhostEl, true);
    this.coachHandEl.style.opacity = '';
    const frameIdx = prefersReducedMotion()
      ? 0
      : COACH_FRAME_SEQUENCE[Math.floor(performance.now() / COACH_FRAME_MS) % COACH_FRAME_SEQUENCE.length]!;
    const frame = COACH_HAND_FRAMES[frameIdx]!;
    if (this.coachHandImgEl.getAttribute('src') !== frame.src) this.coachHandImgEl.src = frame.src;
    // Fingertip near the button's bottom-right corner, not its middle: the glove hangs below and
    // to the right of the tip, so the button's picture and label stay visible (Gao, 2026-10-05).
    // A 'bar' target (e.g. the centred DRIVE pill) is wide and the label sits in its middle, so the
    // glove instead hangs off the button's right end: 92%/60% instead of 82%/78% (Gao, 2026-10-05
    // round 2 — "move the hand on the DRIVE button up and to the right a bit").
    // 2026-10-15 (Gao: "put the side ways hand on the rover course too"): on a bar button the glove
    // lies on its side, finger pointing left (`.coach-hand.side` in src/style.css, turned about the
    // fingertip), as on the coaster: the bar sits on the stage's bottom edge, where the upright glove
    // was cut off. The fingertip is on the button's right end at mid-height, the glove in the bar
    // to its right.
    const isBar = step.target.type === 'bar';
    this.coachHandEl.classList.toggle('side', isBar);
    const fx = rect.x + rect.w * (isBar ? 0.92 : 0.82);
    const fy = rect.y + rect.h * (isBar ? 0.55 : 0.78);
    // The glove box is COACH_HAND_W x COACH_HAND_H; this frame's fingertip sits at
    // (frame.fx, frame.fy) as a fraction of that box — place that exact point at the target.
    this.coachHandEl.style.left = `${(fx - frame.fx * COACH_HAND_W).toFixed(1)}px`;
    this.coachHandEl.style.top = `${(fy - frame.fy * COACH_HAND_H).toFixed(1)}px`;
    this.setHidden(this.coachHandEl, false);
    const key = `${step.id}|${JSON.stringify(step.target)}`;
    if (key !== this.coachHandKey) {
      this.coachHandKey = key;
      this.restartAnim(this.coachHandEl, 'enter');
    }
  }

  /** The coach's 'drop' demonstration on a bin tile (`CoachGesture` 'drop', 2026-10-16): the glove
   * presses the tile, carries a ghost of its picture along `dropPose` to the item's drop zone,
   * lets go, fades and repeats. False (the caller draws the plain tap) when the item has no drop
   * zone on screen. */
  private syncCoachDrop(stepId: string, itemId: string, rect: { x: number; y: number; w: number; h: number }): boolean {
    const zone = this.cb.binDropZone(itemId);
    const tile = this.binTiles.get(itemId);
    if (!zone || !tile) return false;
    const key = `${stepId}|bin:${itemId}|drop`;
    if (key !== this.coachHandKey) {
      this.coachHandKey = key;
      this.coachStrokeStart = performance.now();
      this.coachHandEl.classList.remove('enter');
    }
    const imgRect = this.visibleStageRect(tile.img) ?? rect;
    const from = { x: imgRect.x + imgRect.w / 2, y: imgRect.y + imgRect.h / 2 };
    const pose = dropPose(from, { x: zone.x, y: zone.y }, performance.now() - this.coachStrokeStart);
    const frame = COACH_HAND_FRAMES[prefersReducedMotion() ? 0 : pose.frame]!;
    if (this.coachHandImgEl.getAttribute('src') !== frame.src) this.coachHandImgEl.src = frame.src;
    this.coachHandEl.classList.remove('side');
    this.coachHandEl.style.left = `${(pose.tip.x - frame.fx * COACH_HAND_W).toFixed(1)}px`;
    this.coachHandEl.style.top = `${(pose.tip.y - frame.fy * COACH_HAND_H).toFixed(1)}px`;
    this.coachHandEl.style.opacity = pose.alpha.toFixed(3);
    this.setHidden(this.coachHandEl, pose.alpha <= 0);
    if (pose.ghost && pose.alpha > 0) {
      if (this.coachGhostEl.getAttribute('src') !== tile.img.src) this.coachGhostEl.src = tile.img.src;
      this.coachGhostEl.style.left = `${(pose.ghost.x - COACH_GHOST_PX / 2).toFixed(1)}px`;
      this.coachGhostEl.style.top = `${(pose.ghost.y - COACH_GHOST_PX / 2).toFixed(1)}px`;
      this.coachGhostEl.style.opacity = (0.65 * pose.alpha).toFixed(3);
      this.setHidden(this.coachGhostEl, false);
    } else {
      this.setHidden(this.coachGhostEl, true);
    }
    return true;
  }

  /** The button an unlocked kind lives on right now: its shelf button while the drawer is open,
   * else its bottom-bar palette chip (a kind without a shelf picture). */
  private unlockButton(kind: K): HTMLButtonElement | undefined {
    return (this.drawerOpen ? this.shelfButtons.get(kind) : undefined) ?? this.paletteButtons.get(kind);
  }

  /** A small NEW badge for an unlocked kind's shelf button / palette chip; tapping it (not the
   * button) shows that kind's callout again. */
  private makeUnlockBadge(kind: K): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = 'unlock-badge';
    badge.textContent = 'NEW';
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.showCallout(kind);
    });
    return badge;
  }

  private showCallout(kind: K): void {
    const info = this.hud.partInfo[kind];
    if (!info) return;
    this.calloutKind = kind;
    if (info.image) {
      if (this.calloutImgEl.getAttribute('src') !== info.image) this.calloutImgEl.src = info.image;
      this.calloutImgEl.hidden = false;
      this.calloutIconEl.hidden = true;
    } else {
      this.calloutImgEl.hidden = true;
      this.calloutIconEl.hidden = false;
      this.calloutIconEl.textContent = info.icon;
    }
    this.calloutTitleEl.textContent = info.label;
    this.calloutTextEl.textContent = info.blurb ?? '';
    this.calloutTextEl.hidden = !info.blurb;
    this.setHidden(this.calloutEl, false);
    const btn = this.unlockButton(kind);
    const rect = btn ? this.visibleStageRect(btn) : null;
    if (rect) this.placeCallout(rect);
    if (!prefersReducedMotion()) this.restartAnim(this.calloutEl, 'enter');
    clearTimeout(this.calloutTimer);
    this.calloutTimer = setTimeout(() => this.hideCallout(), CALLOUT_MS);
    // The next tap anywhere closes it (a tap on the NEW badge then re-opens it on click).
    window.addEventListener('pointerdown', this.onCalloutPointerDown, true);
  }

  private hideCallout(): void {
    clearTimeout(this.calloutTimer);
    this.calloutTimer = undefined;
    window.removeEventListener('pointerdown', this.onCalloutPointerDown, true);
    if (this.calloutKind === null) return;
    this.calloutKind = null;
    if (this.calloutEl) this.setHidden(this.calloutEl, true);
  }

  /** Puts the callout card left of its button (the shelf sits at the panel's right edge), its
   * arrow pointing at the button; above the button when there is no room on the left. */
  private placeCallout(rect: { x: number; y: number; w: number; h: number }): void {
    const el = this.calloutEl;
    const h = el.offsetHeight || 96;
    const midY = rect.y + rect.h / 2;
    let left = rect.x - 16 - CALLOUT_W;
    let top: number;
    const above = left < 40;
    if (above) {
      left = Math.max(40, Math.min(STAGE_W - 36 - CALLOUT_W, rect.x + rect.w / 2 - CALLOUT_W / 2));
      top = rect.y - 16 - h;
      el.style.setProperty('--arrow-x', `${(rect.x + rect.w / 2 - left).toFixed(1)}px`);
    } else {
      top = Math.max(this.panelTop + 4, Math.min(PANEL_BOTTOM - 4 - h, midY - h / 2));
      el.style.setProperty('--arrow-y', `${(midY - top).toFixed(1)}px`);
    }
    el.classList.toggle('above', above);
    el.style.left = `${left.toFixed(1)}px`;
    el.style.top = `${top.toFixed(1)}px`;
  }

  /** The unlock callout per frame: keeps it beside its button (the drawer slides) and closes it
   * when the button leaves the screen; on a level that unlocks kinds, plays the NEW pop-in and the
   * callout once, the first time one of those buttons is on screen in edit mode. */
  private syncUnlock(state: HudState<K, M, O, L>): void {
    if (this.calloutKind !== null) {
      const btn = state.mode === 'edit' ? this.unlockButton(this.calloutKind) : undefined;
      const rect = btn ? this.visibleStageRect(btn) : null;
      if (rect) this.placeCallout(rect);
      else this.hideCallout();
    }
    if (this.unlockPlayed) return;
    if (state.unlocked.length === 0) {
      this.unlockPlayed = true;
      return;
    }
    if (state.mode !== 'edit') return;
    const shown: { kind: K; btn: HTMLButtonElement }[] = [];
    for (const kind of state.unlocked) {
      const btn = this.unlockButton(kind);
      if (btn && this.visibleStageRect(btn)) shown.push({ kind, btn });
    }
    if (shown.length === 0) return;
    this.unlockPlayed = true;
    if (!prefersReducedMotion()) {
      shown.forEach(({ btn }, i) => {
        btn.style.animationDelay = `${i * UNLOCK_STAGGER_MS}ms`;
        const done = (): void => {
          btn.removeEventListener('animationend', done);
          btn.classList.remove('unlock-pop');
          btn.style.animationDelay = '';
        };
        btn.addEventListener('animationend', done);
        this.restartAnim(btn, 'unlock-pop');
      });
    }
    this.showCallout(shown[0]!.kind);
  }

  /** The world scrollbar: a thin track along the bottom edge of the world panel and a wide thumb
   * (44 px tall hit area) showing which part of a wide world the view shows. Dragging the thumb
   * (or tapping/dragging the track, which centres the thumb on the finger) calls
   * `callbacks.scrollTo(t)`. Hidden until `HudState.scroll` is a number. */
  private buildScrollbar(): void {
    const wrap = document.createElement('div');
    wrap.className = 'world-scroll';
    wrap.hidden = true;
    this.boolCache.set(wrap, true);
    const track = document.createElement('div');
    track.className = 'world-scroll-track';
    const thumb = document.createElement('div');
    thumb.className = 'world-scroll-thumb';
    const grip = document.createElement('div');
    grip.className = 'world-scroll-grip';
    thumb.appendChild(grip);
    wrap.append(track, thumb);
    this.root.appendChild(wrap);
    this.scrollEl = wrap;
    this.scrollThumbEl = thumb;

    const down = (onThumb: boolean) => (e: PointerEvent): void => {
      if (wrap.hidden || this.scrollDrag) return;
      e.preventDefault();
      e.stopPropagation();
      const trackW = this.scrollTrackW();
      const thumbW = this.scrollThumbW(trackW);
      const x = this.scrollPointerX(e, trackW);
      const left = this.scrollT * (trackW - thumbW);
      this.scrollDrag = { pointerId: e.pointerId, grab: onThumb ? x - left : thumbW / 2 };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety (the drag keeps going off the bar); moves over the bar still work.
      }
      thumb.classList.add('dragging');
      if (!onThumb) this.scrollFromPointer(e);
    };
    const move = (e: PointerEvent): void => {
      if (this.scrollDrag?.pointerId !== e.pointerId) return;
      e.preventDefault();
      this.scrollFromPointer(e);
    };
    const up = (e: PointerEvent): void => {
      if (this.scrollDrag?.pointerId !== e.pointerId) return;
      this.scrollDrag = null;
      thumb.classList.remove('dragging');
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Already released (pointercancel, element hidden).
      }
    };
    thumb.addEventListener('pointerdown', down(true));
    track.addEventListener('pointerdown', down(false));
    for (const el of [thumb, track]) {
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }
  }

  /** The scrollbar's track width in stage px: shorter while the drawer covers the panel's right. */
  private scrollTrackW(): number {
    return (this.drawerOpen ? SCROLL_RIGHT_DRAWER : SCROLL_RIGHT) - SCROLL_LEFT;
  }

  private scrollThumbW(trackW: number): number {
    return Math.min(trackW, Math.max(SCROLL_THUMB_MIN, this.scrollView * trackW));
  }

  /** The pointer's x along the track, in stage px (the HUD root is CSS-scaled onto the canvas). */
  private scrollPointerX(e: PointerEvent, trackW: number): number {
    const rect = this.scrollEl.getBoundingClientRect();
    return rect.width > 0 ? ((e.clientX - rect.left) * trackW) / rect.width : 0;
  }

  private scrollFromPointer(e: PointerEvent): void {
    const drag = this.scrollDrag;
    if (!drag) return;
    const trackW = this.scrollTrackW();
    const span = trackW - this.scrollThumbW(trackW);
    if (span <= 0) return;
    const t = Math.max(0, Math.min(1, (this.scrollPointerX(e, trackW) - drag.grab) / span));
    this.scrollT = t;
    this.layoutScrollbar();
    this.cb.scrollTo(t);
  }

  /** Writes the bar's width and the thumb's size/offset from `scrollT` (only when they change). */
  private layoutScrollbar(): void {
    const trackW = this.scrollTrackW();
    const thumbW = this.scrollThumbW(trackW);
    const left = this.scrollT * (trackW - thumbW);
    const key = `${trackW}:${thumbW.toFixed(1)}:${left.toFixed(2)}`;
    if (key === this.scrollLayoutKey) return;
    this.scrollLayoutKey = key;
    this.scrollEl.style.width = `${trackW}px`;
    this.scrollThumbEl.style.width = `${thumbW}px`;
    this.scrollThumbEl.style.transform = `translateX(${left}px)`;
  }

  /** The slide-in properties drawer, docked to the right edge of the world panel. Built only
   * when `spec.drawer` is true, so courses without it get no extra DOM/behaviour. */
  private buildDrawer(): void {
    const drawer = document.createElement('div');
    drawer.className = 'prop-drawer';
    drawer.style.visibility = 'hidden';

    const header = document.createElement('div');
    header.className = 'prop-drawer-header';
    const title = document.createElement('div');
    title.className = 'prop-drawer-title';
    const icon = document.createElement('span');
    icon.className = 'icon';
    const label = document.createElement('span');
    label.className = 'label';
    title.append(icon, label);

    // Right side: the coin pill (shelf courses only). Removing a part is the delete badge on its
    // selection box in the scene (2026-10-06), not a button here.
    const headerRight = document.createElement('div');
    headerRight.className = 'prop-drawer-header-right';
    const budgetPill = document.createElement('div');
    budgetPill.className = 'budget-pill drawer-budget-pill';
    budgetPill.hidden = true;
    const budgetPillText = document.createElement('span');
    budgetPill.append(this.makeKoinImg(), budgetPillText);
    headerRight.append(budgetPill);
    header.append(title, headerRight);

    const body = document.createElement('div');
    body.className = 'prop-drawer-body';
    // 2026-10-16: the SUPPLY BIN (`HudState.bin`), over any rows left: a blue classroom tub titled
    // "Supply Bin" holding the tiles (builder.css `.supply-bin`). Hidden without a bin.
    const bin = document.createElement('div');
    bin.className = 'supply-bin';
    bin.hidden = true;
    const binRim = document.createElement('div');
    binRim.className = 'supply-bin-rim';
    const binTub = document.createElement('div');
    binTub.className = 'supply-bin-tub';
    const binPlate = document.createElement('div');
    binPlate.className = 'supply-bin-plate';
    binPlate.textContent = 'Supply Bin';
    const binBody = document.createElement('div');
    binBody.className = 'supply-bin-body';
    binTub.append(binPlate, binBody);
    bin.append(binRim, binTub);
    const rows = document.createElement('div');
    rows.className = 'drawer-rows';
    // The shelf lives below the selected part's rows, separated by a thin rule; both scroll as
    // one column inside `body` (see builder.css). Hidden entirely on courses/levels with no shelf
    // kinds, so a drawer like the catapult's (properties only) is unaffected.
    const separator = document.createElement('div');
    separator.className = 'drawer-separator';
    separator.hidden = true;
    const shelf = document.createElement('div');
    shelf.className = 'drawer-shelf';
    shelf.hidden = true;
    body.append(bin, rows, separator, shelf);

    // Pinned selected-part panel (shelf courses only): a sibling of `body`, so it sits OUTSIDE the
    // scrollable area and the shelf inside `body` never moves when this slides open/closed. Reuses
    // `.drawer-rows` for its row layout (same section/label/options markup as `rows` above).
    const pinned = document.createElement('div');
    pinned.className = 'drawer-pinned-panel';
    const pinnedRows = document.createElement('div');
    pinnedRows.className = 'drawer-rows';
    pinned.appendChild(pinnedRows);

    drawer.append(header, body, pinned);
    this.root.appendChild(drawer);

    this.drawerEl = drawer;
    this.drawerHeaderIconEl = icon;
    this.drawerHeaderLabelEl = label;
    this.drawerHeaderRightEl = headerRight;
    this.drawerBudgetPillEl = budgetPill;
    this.drawerBudgetPillTextEl = budgetPillText;
    this.drawerRowsEl = rows;
    this.drawerBinEl = bin;
    this.drawerBinBodyEl = binBody;
    this.drawerSeparatorEl = separator;
    this.drawerShelfEl = shelf;
    this.drawerPinnedEl = pinned;
    this.drawerPinnedRowsEl = pinnedRows;
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

  setLevel(level: L, all: L[]): void {
    this.level = level;
    this.allLevels = all;
    const idx = all.indexOf(level);
    this.levelIndex = idx >= 0 ? idx : 0;

    // A new level load: no banner, no callout; this level's unlock pop-in may play again.
    this.dismissWin();
    this.winShownThisPass = false;
    this.hideCallout();
    this.unlockPlayed = false;
    // A fresh budget (or none at all) to compare against — the coin spend animation never fires
    // for the jump from "no previous frame" to this level's starting `used`.
    this.lastBudgetUsed = null;
    this.lastSpendButton = null;

    // ---- goals column ----
    this.goalListEl.innerHTML = '';
    this.goalItems = [];
    this.goalCardItems = [];
    if (level.goals.length === 0) {
      this.goalsColEl.classList.add('empty');
      const li = document.createElement('li');
      li.className = 'goals-empty';
      li.textContent = this.hud.lines.freePlay;
      this.goalListEl.appendChild(li);
    } else if (this.goalCardsMode) {
      this.goalsColEl.classList.remove('empty');
      this.goalCardItems = level.goals.map((goal: Goal<M>) => this.makeGoalCard(goal));
    } else {
      this.goalsColEl.classList.remove('empty');
      this.goalItems = level.goals.map((goal: Goal<M>) => {
        const row = document.createElement('li');
        row.className = 'goal';
        const top = document.createElement('div');
        top.className = 'goal-top';
        const mark = document.createElement('span');
        mark.className = 'mark';
        const dot = document.createElement('span');
        dot.className = 'dot';
        mark.appendChild(dot);
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = goal.label;
        const value = document.createElement('span');
        value.className = 'value';
        top.append(mark, label, value);
        const barWrap = document.createElement('div');
        barWrap.className = 'goal-bar';
        const fill = document.createElement('div');
        fill.className = 'fill';
        barWrap.appendChild(fill);
        row.append(top, barWrap);
        this.goalListEl.appendChild(row);
        return { row, mark, label, value, barWrap, fill };
      });
    }

    // The goals intro waits for Bruno's lesson intro: the controller calls `playGoalsIntro` once
    // the dialog closes. A previous level's run in flight stops here.
    this.goalsIntroAnim?.cancel();
    this.goalsIntroAnim = null;

    // ---- meter focus/dim styling (depends only on the level's goals) ----
    const freePlay = level.goals.length === 0;
    const focused = new Set<string>(level.goals.map((g) => g.metric));
    for (const meter of this.allMeters) {
      meter.root.classList.remove('focused', 'dim', 'free');
      meter.root.classList.add(freePlay ? 'free' : focused.has(meter.metric) ? 'focused' : 'dim');
    }

    // ---- level picker ----
    // 2026-10-09: `Level.chapter` (e.g. several rover planets) reads "Mars · 3 of 12" instead of
    // "Level N of M" — see `levelPickerLabel`.
    this.setText(this.pickerLabelEl, levelPickerLabel(level, all));
    this.pickerLeft = -1; // the label's width moves the picker: measure again for the quick line
    this.setDisabled(this.pickerPrevBtn, this.levelIndex <= 0);
    this.setDisabled(this.pickerNextBtn, this.levelIndex >= all.length - 1);
  }

  /** One kit goal card (`HudSpec.goalCards`; the coaster's `makeGoalCard` in src/ui/hud.ts, same
   * DOM and global `.gcard*` classes): the big target number and unit over the course's picture,
   * an UNDER tab on a "stay under" goal, a tiny caption and a bar; a yes/no card is a bigger
   * picture with no number and no bar. The corner check / "!" is CSS, shown by the state class. */
  private makeGoalCard(goal: Goal<M>): GoalCardItem {
    const spec = this.hud.goalCards!(goal);
    const check = !!spec.check;
    const under = !!spec.under && !check;
    const card = document.createElement('li');
    card.className = `gcard ${check ? 'gcard-check' : 'gcard-number'}`;
    card.classList.toggle('under', under);
    card.setAttribute('aria-label', goal.label);
    card.title = goal.label;
    if (under) {
      const badge = document.createElement('span');
      badge.className = 'gcard-badge';
      badge.textContent = 'under';
      card.appendChild(badge);
    }
    if (!check) {
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
    icon.src = spec.icon;
    icon.alt = '';
    icon.draggable = false;
    const caption = document.createElement('span');
    caption.className = 'gcard-caption';
    caption.textContent = spec.caption;
    card.append(icon, caption);
    let fill: HTMLDivElement | null = null;
    if (!check) {
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
    const editLive = (this.hud.goalCardEditMetrics ?? []).includes(goal.metric);
    return { card, fill, check, editLive, state: null, fillPct: -1 };
  }

  private rebuildPropPanel(state: HudState<K, M, O, L>): void {
    const sel = state.selected;
    const key = sel
      ? `${sel.part.id}:${JSON.stringify(sel.part.props)}:${sel.descriptors.map((d) => d.code).join(',')}:${(sel.part.lockedProps ?? []).join(',')}:${state.introduced.join(',')}`
      : null;
    if (key === this.propPanelKey) return;
    this.propPanelKey = key;
    this.propChipsByCode.clear();
    this.propRowByCode.clear();
    this.propRowsEl.innerHTML = '';
    if (!sel) return;

    const info = this.hud.partInfo[sel.part.kind];
    this.propTitleIconEl.textContent = info.icon;
    this.propTitleLabelEl.textContent = info.label;
    this.textCache.delete(this.propTitleLabelEl);
    this.textCache.delete(this.propTitleIconEl);


    const lockedProps = sel.part.lockedProps ?? [];
    for (const descriptor of sel.descriptors) {
      const locked = lockedProps.includes(descriptor.code);
      const row = document.createElement('div');
      row.className = 'prop-row';
      const label = document.createElement('div');
      label.className = 'prop-row-label';
      // Locked rows read as dimmed chips only; no padlock glyph (too distracting, 2026-10-01).
      label.textContent = `${descriptor.label}:`;
      const chips = document.createElement('div');
      chips.className = 'prop-row-chips';
      const chipMap = new Map<string, HTMLButtonElement>();
      for (const opt of descriptor.options) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = locked ? 'chip locked' : 'chip';
        chip.disabled = locked;
        const chipText = document.createElement('span');
        chipText.textContent = this.chipDisplayLabel(opt);
        chip.appendChild(chipText);
        if (state.introduced.includes(`${descriptor.code}:${opt.value}`)) chip.appendChild(this.makeNewBadge());
        const extra = sel.optionCosts[descriptor.code]?.[opt.value];
        if (extra !== undefined && extra > 0) chip.appendChild(this.makeCostBadge(extra));
        chip.addEventListener('click', () => {
          this.lastSpendButton = chip;
          this.cb.setProp(descriptor.code, opt.value);
        });
        chips.appendChild(chip);
        chipMap.set(opt.value, chip);
      }
      row.append(label);
      if (state.introduced.includes(descriptor.code)) row.append(this.makeNewBadge());
      row.append(chips);
      this.propRowsEl.appendChild(row);
      this.propChipsByCode.set(descriptor.code, chipMap);
      this.propRowByCode.set(descriptor.code, row);
    }
    this.syncPropChipActive(sel.part.props, sel.descriptors, sel.optionCosts, state.budget ? state.budget.total - state.budget.used : null);
  }

  private syncPropChipActive(
    props: Record<string, string>,
    descriptors: PropertyDescriptor[],
    optionCosts: Record<string, Record<string, number>>,
    remaining: number | null,
  ): void {
    for (const descriptor of descriptors) {
      const chipMap = this.propChipsByCode.get(descriptor.code);
      if (!chipMap) continue;
      const current = props[descriptor.code] ?? descriptor.default ?? descriptor.options[0]?.value;
      const costRow = optionCosts[descriptor.code];
      for (const [value, chip] of chipMap) {
        chip.classList.toggle('active', value === current);
        const extra = costRow?.[value];
        const unaffordable = remaining !== null && extra !== undefined && extra > remaining;
        chip.classList.toggle('unaffordable', unaffordable);
      }
    }
  }

  /** Level start with `hud.goalsOverlay` (2026-10-06, Gao: "show the goals more front and
   * center, then animate it to the top left"): the goal panel pops up big in the middle of the
   * world panel, holds so the child reads it, then glides and shrinks into its top-left spot
   * (src/ui/goalsIntro.ts, shared with the coaster HUD). Skipped under prefers-reduced-motion.
   * 2026-10-12: called by the controller once Bruno's lesson intro closes, not on level load. */
  playGoalsIntro(): void {
    const el = this.goalsOverlayEl;
    if (!el) return;
    this.goalsIntroAnim?.cancel();
    this.goalsIntroAnim = null;
    const anim = animateGoalsIntro(el, this.panelTop, PANEL_BOTTOM);
    if (!anim) return;
    anim.onfinish = (): void => {
      if (this.goalsIntroAnim === anim) this.goalsIntroAnim = null;
    };
    this.goalsIntroAnim = anim;
  }

  /** Stat bars (Speed, Grip, ...) rendered into `container` — either the prop panel's `.stat-bars`
   * (non-drawer courses) or the dash's `.dash-stats` (drawer courses, while the drawer is open).
   * Rebuilds the rows only when that container's label list changes; otherwise just updates the
   * fill widths/colours. */
  private rebuildStatBars(container: HTMLDivElement, stats: StatBar[]): void {
    const key = stats.map((s) => s.label).join(',');
    let state = this.statBarState.get(container);
    if (!state || state.key !== key) {
      container.innerHTML = '';
      const rows = stats.map((s) => {
        const row = document.createElement('div');
        row.className = 'stat-bar';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = s.label;
        const track = document.createElement('div');
        track.className = 'track';
        const fill = document.createElement('div');
        fill.className = 'fill';
        track.appendChild(fill);
        row.append(label, track);
        container.appendChild(row);
        return { fill };
      });
      state = { key, rows };
      this.statBarState.set(container, state);
    }
    this.setHidden(container, stats.length === 0);
    stats.forEach((s, i) => {
      const row = state!.rows[i];
      if (!row) return;
      row.fill.style.width = `${Math.max(0, Math.min(1, s.value)) * 100}%`;
      row.fill.style.background = s.color !== undefined ? colorHex(s.color) : '';
    });
  }

  /** Slides the properties drawer in/out. `visibility` flips to hidden only once the slide-out
   * transition finishes (transitionend, or a 300 ms timeout as a fallback), so the drawer stays
   * interactive-free and out of the way once closed without cutting the animation short. */
  private setDrawerOpen(open: boolean): void {
    if (open === this.drawerOpen) return;
    this.drawerOpen = open;
    if (open) {
      if (this.drawerHideTimer !== undefined) {
        clearTimeout(this.drawerHideTimer);
        this.drawerHideTimer = undefined;
      }
      this.drawerEl.style.visibility = 'visible';
      this.drawerEl.classList.add('open');
    } else {
      this.drawerEl.classList.remove('open');
      const onEnd = (): void => {
        this.drawerEl.removeEventListener('transitionend', onEnd);
        if (this.drawerHideTimer !== undefined) {
          clearTimeout(this.drawerHideTimer);
          this.drawerHideTimer = undefined;
        }
        this.drawerEl.style.visibility = 'hidden';
      };
      this.drawerEl.addEventListener('transitionend', onEnd);
      this.drawerHideTimer = setTimeout(onEnd, 300);
    }
  }

  /** 120 ms squash/pop feedback on an option button tap; restarts cleanly even mid-animation. */
  private popOptionButton(btn: HTMLButtonElement): void {
    btn.classList.remove('pop');
    void btn.offsetWidth; // force a reflow so re-adding the class restarts the animation
    btn.classList.add('pop');
  }

  /** Rebuilds the drawer's header + descriptor sections (into `container`: `drawerRowsEl` for a
   * no-shelf course's drawer, `drawerPinnedRowsEl` for a shelf course's pinned panel — see
   * `update()`'s `shelfOn` rule) only when the structural key changes (part id, descriptor codes,
   * option images, lockedProps, which container) — a plain prop-value change is handled by
   * `syncDrawerActive` instead, without touching the DOM tree. */
  private rebuildDrawerPanel(sel: NonNullable<HudState<K, M, O, L>['selected']>, introduced: string[], container: HTMLDivElement): void {
    const lockedProps = sel.part.lockedProps ?? [];
    const key =
      `${container === this.drawerPinnedRowsEl ? 'pinned' : 'rows'}:${sel.part.id}:` +
      sel.descriptors.map((d) => `${d.code}:${d.options.map((o) => o.image ?? '').join('|')}`).join(';') +
      `:${lockedProps.join(',')}:${introduced.join(',')}`;
    if (key === this.drawerPanelKey) return;
    this.drawerPanelKey = key;
    this.drawerOptionsByCode.clear();
    this.drawerSectionLabelByCode.clear();
    this.drawerSectionByCode.clear();
    container.innerHTML = '';

    const info = this.hud.partInfo[sel.part.kind];
    this.setHidden(this.drawerHeaderIconEl, false);
    this.setText(this.drawerHeaderIconEl, info.icon);
    this.setText(this.drawerHeaderLabelEl, info.label);

    for (const descriptor of sel.descriptors) {
      const locked = lockedProps.includes(descriptor.code);
      const hasImages = descriptor.options.some((o) => !!o.image);
      const section = document.createElement('div');
      section.className = 'drawer-section';
      const label = document.createElement('div');
      label.className = 'drawer-section-label';
      const text = document.createElement('span');
      // A locked row shows only its dimmed buttons; no padlock glyph (too distracting).
      const base = descriptor.label;
      text.textContent = base;
      label.appendChild(text);
      if (introduced.includes(descriptor.code)) label.appendChild(this.makeNewBadge());
      this.drawerSectionLabelByCode.set(descriptor.code, { el: text, base, hasImages });
      const options = document.createElement('div');
      options.className = locked ? 'drawer-options locked' : 'drawer-options';
      const btnMap = new Map<string, HTMLButtonElement>();
      for (const opt of descriptor.options) {
        // The cost badge sits fully INSIDE the button (top/right 2px) and stays a child of `btn`;
        // the NEW badge sits just OUTSIDE it (top/left -6px, see builder.css's `.option-btn-wrap`)
        // so it goes on a `.option-btn-wrap` sibling instead, positioned relative to that wrap.
        const wrap = document.createElement('div');
        wrap.className = 'option-btn-wrap';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-btn';
        btn.disabled = locked;
        if (opt.image) {
          // Section label shows the active option's name instead, so no caption here.
          const img = document.createElement('img');
          img.src = opt.image;
          img.alt = opt.label;
          img.draggable = false;
          btn.appendChild(img);
        } else {
          const caption = document.createElement('span');
          caption.className = 'caption solo';
          caption.textContent = this.chipDisplayLabel(opt);
          btn.appendChild(caption);
        }
        wrap.appendChild(btn);
        if (introduced.includes(`${descriptor.code}:${opt.value}`)) wrap.appendChild(this.makeOptionNewBadge());
        const extra = sel.optionCosts[descriptor.code]?.[opt.value];
        if (extra !== undefined && extra > 0) btn.appendChild(this.makeOptionCostBadge(extra));
        btn.addEventListener('click', () => {
          this.popOptionButton(btn);
          this.lastSpendButton = btn;
          // Another option tapped mid-flight (same row or a different one): the pending change
          // lands right now (no pop), then this tap gets its own chance to fly.
          this.finishFlightInstant();
          const img = btn.querySelector('img');
          const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
          const targets = img && !reducedMotion ? this.cb.flyTargets(descriptor.code, opt.value) : [];
          if (!img || targets.length === 0) {
            this.cb.setProp(descriptor.code, opt.value);
            return;
          }
          this.startFlight(descriptor.code, opt.value, sel.part.id, img, btnMap, targets);
        });
        options.appendChild(wrap);
        btnMap.set(opt.value, btn);
      }
      section.append(label, options);
      container.appendChild(section);
      this.drawerOptionsByCode.set(descriptor.code, btnMap);
      this.drawerSectionByCode.set(descriptor.code, section);
    }
  }

  // ---- the SUPPLY BIN (2026-10-16, Jon: "a classroom supply bin / toolbox you pull parts from
  // instead of menu rows"; `CourseSpec.bin`) ----

  /** Shows `items` (`HudState.bin`, already gated and stamped by the controller) in the drawer's
   * tub, grouped (`binGroups`). Rebuilds the tiles only when what they show changes; a press in
   * progress on a tile that is gone is cancelled (its ghost flies home). Hidden with no bin. */
  private syncBin(items: BinItem[] | null): void {
    this.setHidden(this.drawerBinEl, !items);
    this.binItemsById = new Map((items ?? []).map((it) => [it.id, it]));
    if (!items) {
      this.binKey = null;
      if (this.binPress) this.cancelBinPress(true);
      return;
    }
    const key = items
      .map((it) => `${it.id}|${it.group ?? ''}|${it.image}|${it.label}|${it.badge ?? ''}|${it.active ? 1 : 0}|${it.locked ? 1 : 0}|${it.isNew ? 1 : 0}`)
      .join(';');
    if (key === this.binKey) return;
    this.binKey = key;
    if (this.binPress && !this.binItemsById.has(this.binPress.itemId)) this.cancelBinPress(true);
    this.drawerBinBodyEl.innerHTML = '';
    this.binTiles.clear();
    for (const section of binGroups(items)) {
      const sec = document.createElement('div');
      sec.className = 'supply-bin-section';
      if (section.group) {
        const label = document.createElement('div');
        label.className = 'supply-bin-group';
        label.textContent = section.group;
        sec.appendChild(label);
      }
      const grid = document.createElement('div');
      grid.className = 'supply-bin-grid';
      for (const item of section.items) grid.appendChild(this.makeBinTile(item));
      sec.appendChild(grid);
      this.drawerBinBodyEl.appendChild(sec);
    }
  }

  /** One bin tile: a white card with the item's big picture and caption, a corner badge ('∞' or a
   * count), NEW (top-left), a padlock when locked, an "In use" ribbon when active. Press and drag
   * it onto the machine, or tap it (pointer events: mouse and touch alike; `touch-action: none`,
   * so a drag never scrolls the page). */
  private makeBinTile(item: BinItem): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'bin-tile-wrap';
    const tile = document.createElement('div');
    tile.className = 'bin-tile';
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', item.label);
    tile.classList.toggle('active', !!item.active);
    tile.classList.toggle('locked', !!item.locked);
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.draggable = false;
    const caption = document.createElement('span');
    caption.className = 'bin-tile-label';
    caption.textContent = item.label;
    tile.append(img, caption);
    if (item.active) {
      const ribbon = document.createElement('span');
      ribbon.className = 'bin-tile-inuse';
      ribbon.textContent = 'In use';
      tile.appendChild(ribbon);
    }
    if (item.locked) {
      const lock = document.createElement('span');
      lock.className = 'bin-tile-lock';
      lock.textContent = '\u{1F512}';
      tile.appendChild(lock);
    }
    wrap.appendChild(tile);
    if (item.badge) {
      const badge = document.createElement('span');
      badge.className = 'bin-tile-badge';
      badge.textContent = item.badge;
      wrap.appendChild(badge);
    }
    if (item.isNew) wrap.appendChild(this.makeOptionNewBadge());

    const id = item.id;
    tile.addEventListener('pointerdown', (e) => this.onBinDown(e, id, tile, img));
    tile.addEventListener('pointermove', (e) => this.onBinMove(e));
    tile.addEventListener('pointerup', (e) => this.onBinUp(e));
    tile.addEventListener('pointercancel', (e) => {
      if (this.binPress?.pointerId === e.pointerId) this.cancelBinPress(true);
    });
    tile.addEventListener('lostpointercapture', (e) => {
      // Capture lost without a pointerup (the tile left the DOM, the browser took the gesture).
      if (this.binPress?.pointerId === e.pointerId) this.cancelBinPress(true);
    });
    this.binTiles.set(id, { tile, img });
    return wrap;
  }

  /** A client-px pointer position in stage px (the HUD root is CSS-scaled onto the canvas). */
  private clientToStage(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.root.getBoundingClientRect();
    if (r.width <= 0) return null;
    const k = STAGE_W / r.width;
    return { x: (clientX - r.left) * k, y: (clientY - r.top) * k };
  }

  private onBinDown(e: PointerEvent, itemId: string, tile: HTMLElement, img: HTMLImageElement): void {
    if (this.binPress || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const start = this.clientToStage(e.clientX, e.clientY);
    if (!start) return;
    e.preventDefault(); // no text selection, no native image drag, no emulated mouse events
    try {
      tile.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety: moves over the tile still arrive without it.
    }
    tile.classList.add('pressed');
    this.binPress = { itemId, pointerId: e.pointerId, tile, img, start, dragging: false, ghost: null, hot: false };
  }

  private onBinMove(e: PointerEvent): void {
    const press = this.binPress;
    if (!press || press.pointerId !== e.pointerId) return;
    e.preventDefault();
    const p = this.clientToStage(e.clientX, e.clientY);
    if (!p) return;
    if (!press.dragging) {
      if (Math.hypot(p.x - press.start.x, p.y - press.start.y) < BIN_DRAG_PX) return;
      const item = this.binItemsById.get(press.itemId);
      // A locked or in-use tile does not come out of the bin; the release still counts as a tap
      // (a locked one then flashes Bruno's "locked" line).
      if (!item || item.locked || item.active) return;
    }
    const started = !press.dragging;
    if (started) {
      press.dragging = true;
      press.ghost = this.makeBinGhost(press.img.src);
      press.tile.classList.add('lifted');
    }
    this.placeBinGhost(press.ghost!, p);
    const zone = this.cb.binDropZone(press.itemId);
    const hot = !!zone && insideDropZone(zone, p, BIN_DROP_MIN_R);
    // The scene rings the zone from the drag's first move, brighter while the finger is inside.
    if (started || hot !== press.hot) this.cb.binDrag(press.itemId, hot);
    press.ghost!.classList.toggle('hot', hot);
    press.hot = hot;
  }

  private onBinUp(e: PointerEvent): void {
    const press = this.binPress;
    if (!press || press.pointerId !== e.pointerId) return;
    this.binPress = null;
    press.tile.classList.remove('pressed', 'lifted');
    try {
      press.tile.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    if (!press.dragging) {
      this.tapBinItem(press.itemId, press.tile, press.img);
      return;
    }
    this.cb.binDrag(null, false);
    const p = this.clientToStage(e.clientX, e.clientY);
    const zone = this.cb.binDropZone(press.itemId);
    if (p && zone && insideDropZone(zone, p, BIN_DROP_MIN_R)) {
      // Dropped on the machine: the ghost pops where it landed and the change goes in.
      this.popBinGhost(press.ghost!);
      this.lastSpendButton = press.tile;
      this.cb.applyBin(press.itemId);
    } else {
      this.flyBinGhostHome(press.ghost!, press.img);
    }
  }

  /** Ends a press without applying anything (the bin went away, the pointer was cancelled): a
   * dragged ghost flies back to its tile (`animate`) or just goes. */
  private cancelBinPress(animate: boolean): void {
    const press = this.binPress;
    if (!press) return;
    this.binPress = null;
    press.tile.classList.remove('pressed', 'lifted');
    if (!press.dragging) return;
    this.cb.binDrag(null, false);
    if (press.ghost) {
      if (animate && press.img.isConnected) this.flyBinGhostHome(press.ghost, press.img);
      else press.ghost.remove();
    }
  }

  /** A plain tap on a tile: the change flies to the machine like a drawer option (`flyTargets`),
   * then commits through `applyBin`; with nothing to fly (no targets, reduced motion, a locked or
   * in-use tile) it commits (or refuses) at once. */
  private tapBinItem(itemId: string, tile: HTMLElement, img: HTMLImageElement): void {
    this.restartAnim(tile, 'pop');
    this.lastSpendButton = tile;
    this.finishFlightInstant();
    const next = this.cb.binValue(itemId);
    const targets = next && !prefersReducedMotion() ? this.cb.flyTargets(next.code, next.value) : [];
    if (!next || targets.length === 0) {
      this.cb.applyBin(itemId);
      return;
    }
    const partId = this.flightPartId();
    this.startFlight('', '', partId, img, new Map(), targets, () => this.cb.applyBin(itemId));
  }

  /** The selected part's id for a bin flight (a flight that outlives its selection commits early). */
  private flightPartId(): number {
    return this.lastSelectedPartId ?? -1;
  }

  private makeBinGhost(src: string): HTMLImageElement {
    const ghost = document.createElement('img');
    ghost.className = 'bin-ghost';
    ghost.src = src;
    ghost.alt = '';
    ghost.draggable = false;
    ghost.style.width = `${BIN_GHOST_PX}px`;
    ghost.style.height = `${BIN_GHOST_PX}px`;
    this.root.appendChild(ghost);
    return ghost;
  }

  private placeBinGhost(ghost: HTMLImageElement, p: { x: number; y: number }): void {
    ghost.style.left = `${(p.x - BIN_GHOST_PX / 2).toFixed(1)}px`;
    ghost.style.top = `${(p.y - BIN_GHOST_PX / 2).toFixed(1)}px`;
  }

  /** The drop's landing: the ghost swells and fades where the finger let go (220 ms). */
  private popBinGhost(ghost: HTMLImageElement): void {
    if (prefersReducedMotion() || typeof ghost.animate !== 'function') {
      ghost.remove();
      return;
    }
    const anim = ghost.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.35)', opacity: 0.9, offset: 0.4 },
        { transform: 'scale(0.6)', opacity: 0 },
      ],
      { duration: 220, easing: 'ease-out', fill: 'forwards' },
    );
    anim.onfinish = () => ghost.remove();
  }

  /** A drop outside the zone: the ghost flies back into its tile (260 ms) and goes. */
  private flyBinGhostHome(ghost: HTMLImageElement, img: HTMLImageElement): void {
    const home = this.visibleStageRect(img);
    if (!home || prefersReducedMotion() || typeof ghost.animate !== 'function') {
      ghost.remove();
      return;
    }
    const left = Number.parseFloat(ghost.style.left) || 0;
    const top = Number.parseFloat(ghost.style.top) || 0;
    const dx = home.x + home.w / 2 - (left + BIN_GHOST_PX / 2);
    const dy = home.y + home.h / 2 - (top + BIN_GHOST_PX / 2);
    const k = Math.max(0.3, home.w / BIN_GHOST_PX);
    const anim = ghost.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.6 },
      ],
      { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' },
    );
    anim.onfinish = () => ghost.remove();
  }

  /** The parts shelf at the bottom of the drawer body: one section per `shelfGroups` group, each
   * a wrap-grid of picture buttons (`state.palette` kinds with a `partInfo` image). A tap adds the
   * part. Hidden entirely when the course/level has no shelf kinds. Rebuilds the button grid only
   * when the kind list, its images/groups or its coin costs change; affordability/paletteFull are
   * cheap per-frame class toggles on the existing buttons (same pattern as `rebuildPalette`). */
  private syncShelf(state: HudState<K, M, O, L>, shelfOn: boolean): void {
    this.setHidden(this.drawerSeparatorEl, !shelfOn);
    this.setHidden(this.drawerShelfEl, !shelfOn);
    if (!shelfOn) {
      this.shelfKey = null;
      return;
    }

    const groups = shelfGroups(state.palette, this.hud.partInfo);
    const key =
      groups
        .map((g) => `${g.group}:${g.kinds.map((k) => `${k}=${this.hud.partInfo[k].image}@${state.paletteCosts[k] ?? ''}`).join(',')}`)
        .join(';') + `|new:${state.unlocked.join(',')}`;
    if (key !== this.shelfKey) {
      this.shelfKey = key;
      this.drawerShelfEl.innerHTML = '';
      this.shelfButtons.clear();
      for (const group of groups) {
        const section = document.createElement('div');
        section.className = 'drawer-shelf-section';
        const label = document.createElement('div');
        label.className = 'drawer-section-label';
        label.textContent = group.group;
        const grid = document.createElement('div');
        grid.className = 'shelf-grid';
        for (const kind of group.kinds) {
          const info = this.hud.partInfo[kind];
          // The cost/NEW badges sit just OUTSIDE the button's own box on purpose (top/right -6px,
          // top/left -8px — a coin peeking over the corner), so they go on a `.shelf-btn-wrap`
          // sibling instead of on the button, positioned relative to that wrap.
          const wrap = document.createElement('div');
          wrap.className = 'shelf-btn-wrap';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'shelf-btn';
          if (info.blurb) btn.title = info.blurb;
          const img = document.createElement('img');
          img.src = info.image!;
          img.alt = info.label;
          img.draggable = false;
          const caption = document.createElement('span');
          caption.className = 'label';
          caption.textContent = info.label;
          btn.append(img, caption);
          wrap.appendChild(btn);
          const cost = state.paletteCosts[kind];
          if (cost !== undefined) {
            const costEl = document.createElement('span');
            costEl.className = 'cost';
            const costText = document.createElement('span');
            costText.textContent = `${cost}`;
            costEl.append(this.makeKoinImg(11), costText);
            wrap.appendChild(costEl);
          }
          if (state.unlocked.includes(kind)) wrap.appendChild(this.makeUnlockBadge(kind));
          btn.addEventListener('click', () => {
            this.popOptionButton(btn);
            this.lastSpendButton = btn;
            this.cb.addPart(kind);
          });
          grid.appendChild(wrap);
          this.shelfButtons.set(kind, btn);
        }
        section.append(label, grid);
        this.drawerShelfEl.appendChild(section);
      }
    }

    const editMode = state.mode === 'edit';
    const remaining = state.budget ? state.budget.total - state.budget.used : null;
    for (const [kind, btn] of this.shelfButtons) {
      const cost = state.paletteCosts[kind];
      const unaffordable = remaining !== null && cost !== undefined && cost > remaining;
      btn.classList.toggle('unaffordable', unaffordable);
      this.setDisabled(btn, !editMode || state.paletteFull || unaffordable);
    }
  }

  /** "The part flies to the machine": starts flying copies of `img` (already resolved: the
   * clicked option has a picture, targets exist, and the child hasn't asked for reduced motion)
   * from the drawer button to each `flyTargets` result, in stage px. Any flight already in
   * progress is finished first (by the caller). */
  private startFlight(
    code: string,
    value: string,
    partId: number,
    img: HTMLImageElement,
    btnMap: Map<string, HTMLButtonElement>,
    targets: { x: number; y: number; size: number }[],
    /** Commits the change instead of `setProp(code, value)` (a bin tile: `applyBin`). */
    apply?: () => void,
  ): void {
    // Visual only, right away: the real props haven't changed yet (that lands with the flight),
    // but the tap should feel instant. `syncDrawerActive` keeps this correct on every later frame
    // via `this.flight` until the flight actually commits.
    for (const [v, b] of btnMap) b.classList.toggle('active', v === value);

    const rootRect = this.root.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    if (rootRect.width <= 0 || rootRect.height <= 0) {
      // The HUD isn't laid out (e.g. mid-teardown): skip the flight, commit at once.
      if (apply) apply();
      else this.cb.setProp(code, value);
      return;
    }
    // `syncTransform` lays the HUD root out as `translate(rect.left, rect.top) scale(rect.width /
    // STAGE_W)`: client px -> stage px is the inverse of that scale.
    const stagePerClientPx = STAGE_W / rootRect.width;
    const START_SIZE = 44;
    const startX = (imgRect.left + imgRect.width / 2 - rootRect.left) * stagePerClientPx;
    const startY = (imgRect.top + imgRect.height / 2 - rootRect.top) * stagePerClientPx;

    const flyers: Flyer[] = targets.map((t) => {
      const el = document.createElement('img');
      el.className = 'part-flyer';
      el.src = img.src;
      // The element's own box (fixed 44x44, see builder.css) is centred on the START point;
      // every keyframe below is then a translate/scale RELATIVE to that box, so a `scale()`
      // (transform-origin 50% 50%) never moves the point the flyer is centred on.
      el.style.left = `${startX - START_SIZE / 2}px`;
      el.style.top = `${startY - START_SIZE / 2}px`;
      this.root.appendChild(el);

      const dx = t.x - startX;
      const dy = t.y - startY;
      const targetScale = t.size / START_SIZE;
      const midScale = (START_SIZE + t.size) / 2 / START_SIZE;

      const anim = el.animate(
        [
          { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', offset: 0 },
          { transform: `translate(${dx / 2}px, ${dy / 2 - 90}px) scale(${midScale}) rotate(-12deg)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(${targetScale}) rotate(0deg)`, offset: 1 },
        ],
        { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' },
      );
      return { el, anim, dx, dy, targetScale };
    });

    const flight: PendingFlight = { code, value, partId, flyers, committed: false, apply };
    this.flight = flight;
    // "When the FIRST flyer finishes": every target shares the same duration/easing and starts
    // together, so they land within the same frame; flyers[0] stands in for "the flight".
    const first = flyers[0];
    if (first) first.anim.onfinish = () => this.landFlight(flight);
    flight.fallback = setTimeout(() => this.finishFlightInstant(), FLIGHT_FALLBACK_MS);
  }

  /** The lead flyer's flight finished naturally: commit the prop change, then every flyer plays
   * its own landing pop before being removed. No-op if this flight was already superseded. */
  private landFlight(flight: PendingFlight): void {
    if (this.flight !== flight || flight.committed) return;
    flight.committed = true;
    clearTimeout(flight.fallback);
    this.flight = null;
    this.commitFlight(flight);
    for (const f of flight.flyers) this.playLandingPop(f);
  }

  private commitFlight(flight: PendingFlight): void {
    if (flight.apply) flight.apply();
    else this.cb.setProp(flight.code, flight.value);
  }

  /** 160 ms landing pop (scale 1 -> 1.18 -> 1, opacity 1 -> 0) on one flyer, then removes it. */
  private playLandingPop(f: Flyer): void {
    const landed = `translate(${f.dx}px, ${f.dy}px) rotate(0deg)`;
    const anim = f.el.animate(
      [
        { transform: `${landed} scale(${f.targetScale})`, opacity: 1, offset: 0 },
        { transform: `${landed} scale(${f.targetScale * 1.18})`, opacity: 1, offset: 0.5 },
        { transform: `${landed} scale(${f.targetScale})`, opacity: 0, offset: 1 },
      ],
      { duration: 160, easing: 'ease-out', fill: 'forwards' },
    );
    anim.onfinish = () => f.el.remove();
  }

  /** Ends any in-progress flight right now: commits its prop change (unless already committed)
   * and removes its flyers with no landing pop. Used when another option is tapped mid-flight,
   * the drawer closes, the mode leaves edit, or the selection moves to a different part — all
   * cases where waiting for the flight to land naturally would be wrong or unsafe (`setProp`
   * always applies to whatever is selected AT THAT MOMENT, so a flight left dangling past a
   * reselect would land on the wrong part). */
  private finishFlightInstant(): void {
    const flight = this.flight;
    if (!flight) return;
    this.flight = null;
    clearTimeout(flight.fallback);
    if (!flight.committed) {
      flight.committed = true;
      this.commitFlight(flight);
    }
    for (const f of flight.flyers) {
      f.anim.onfinish = null;
      f.anim.cancel();
      f.el.remove();
    }
  }

  /** Toggles `.active` on the drawer's option buttons; never rebuilds the
   * row DOM (that's `rebuildDrawerPanel`'s job, gated on a coarser key). While a flight is
   * pending for `partId`, its target value previews as active instead of the (not yet committed)
   * real prop, so the flight's own `startFlight` marking isn't clobbered by the next frame. */
  private syncDrawerActive(
    props: Record<string, string>,
    descriptors: PropertyDescriptor[],
    lockedProps: string[],
    partId: number,
    optionCosts: Record<string, Record<string, number>>,
    remaining: number | null,
  ): void {
    for (const descriptor of descriptors) {
      const btnMap = this.drawerOptionsByCode.get(descriptor.code);
      if (!btnMap) continue;
      const flying = this.flight && this.flight.partId === partId && this.flight.code === descriptor.code ? this.flight.value : undefined;
      const current = flying ?? props[descriptor.code] ?? descriptor.default ?? descriptor.options[0]?.value;
      // No padlock badge on the active button of a locked row (too distracting); the dimmed,
      // disabled buttons are the only cue, plus Bruno's "bolted down" line on a tap.
      const costRow = optionCosts[descriptor.code];
      for (const [value, btn] of btnMap) {
        btn.classList.toggle('active', value === current);
        const extra = costRow?.[value];
        const unaffordable = remaining !== null && extra !== undefined && extra > remaining;
        btn.classList.toggle('unaffordable', unaffordable);
      }

      // Options with images drop their caption; the section label shows the active
      // option's name instead ("Power · Medium"), refreshed here without a rebuild.
      const labelInfo = this.drawerSectionLabelByCode.get(descriptor.code);
      if (labelInfo?.hasImages) {
        const activeOpt = descriptor.options.find((o) => o.value === current);
        const activeLabel = activeOpt ? this.chipDisplayLabel(activeOpt) : '';
        this.setText(labelInfo.el, activeLabel ? `${labelInfo.base} · ${activeLabel}` : labelInfo.base);
      }
    }
  }

  /** The end-of-run result card. Rebuilt only when its title/rows/outcome/tone change. */
  private rebuildResultCard(card: ResultCard): void {
    const key = `${card.title}|${card.outcome}|${card.tone}|${card.rows.map((r) => `${r.label}:${r.value}`).join(',')}`;
    if (key === this.resultCardKey) return;
    this.resultCardKey = key;
    this.setText(this.resultTitleEl, card.title);
    this.resultRowsEl.innerHTML = '';
    for (const row of card.rows) {
      const el = document.createElement('div');
      el.className = 'result-row';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = row.label;
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = row.value;
      el.append(label, value);
      this.resultRowsEl.appendChild(el);
    }
    this.setText(this.resultOutcomeEl, card.outcome);
    this.resultOutcomeEl.classList.remove('pass', 'fail', 'neutral');
    this.resultOutcomeEl.classList.add(card.tone);
  }

  private rebuildPalette(state: HudState<K, M, O, L>): void {
    // Kinds with a shelf picture live on the drawer's parts shelf instead (see shelf.ts); the
    // bottom-bar chip palette shows only the rest, so it never needs to fit nine chips in 62px.
    const visible = nonShelfKinds(state.palette, this.hud.partInfo);
    // An empty palette stays in the flex row as an invisible spacer (`flex: 1 1 auto`), so the
    // Drive/Undo/Clear group keeps its place on the right (Gao, 2026-10-02).
    this.paletteEl.style.visibility = visible.length === 0 ? 'hidden' : '';
    // Costs are folded into the key (not just the kind list): a course with `partCost` reports
    // the same number for a kind on every call, but the key stays honest if that ever changes.
    const key = visible.map((kind) => `${kind}:${state.paletteCosts[kind] ?? ''}`).join(',') + `|new:${state.unlocked.join(',')}`;
    if (key !== this.paletteKey) {
      this.paletteKey = key;
      this.paletteEl.innerHTML = '';
      this.paletteButtons.clear();
      for (const kind of visible) {
        const info = this.hud.partInfo[kind];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'palette-chip';
        if (info.blurb) btn.title = info.blurb;
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = info.icon;
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = info.label;
        btn.append(icon, label);
        const cost = state.paletteCosts[kind];
        if (cost !== undefined) {
          const costEl = document.createElement('span');
          costEl.className = 'cost';
          const costText = document.createElement('span');
          costText.textContent = `${cost}`;
          costEl.append(this.makeKoinImg(11), costText);
          btn.appendChild(costEl);
        }
        if (state.unlocked.includes(kind)) {
          btn.classList.add('has-new');
          btn.appendChild(this.makeUnlockBadge(kind));
        }
        btn.addEventListener('click', () => {
          this.lastSpendButton = btn;
          this.cb.addPart(kind);
        });
        this.paletteEl.appendChild(btn);
        this.paletteButtons.set(kind, btn);
      }
    }
    const editMode = state.mode === 'edit';
    const remaining = state.budget ? state.budget.total - state.budget.used : null;
    for (const [kind, btn] of this.paletteButtons) {
      const cost = state.paletteCosts[kind];
      const unaffordable = remaining !== null && cost !== undefined && cost > remaining;
      btn.classList.toggle('unaffordable', unaffordable);
      this.setDisabled(btn, !editMode || state.paletteFull || unaffordable);
    }
  }

  /** Scale-bump (1.25 -> 1, 250ms) on the pill's text and a short gold flash on the pill itself —
   * the landing cue for one flying koin, or (with no flight) the whole feedback for a budget drop
   * (Remove/Undo). Both are one-shot CSS animations (`restartAnim` replays them even back to back,
   * which `playSpendAnimation` relies on for the per-coin bump). */
  private bumpPill(pillEl: HTMLElement, textEl: HTMLElement): void {
    if (prefersReducedMotion()) return;
    this.restartAnim(textEl, 'pill-bump');
    this.restartAnim(pillEl, 'pill-flash');
  }

  /** "The coins fly to the budget pill" (2026-10-05 round 2, stakeholder direction #3): when
   * `state.budget.used` jumps up by `diff` (a part/option was just added or upgraded), up to 5
   * small koin pictures fly from `sourceEl` (the button the child just tapped) to `pillEl` along a
   * slight arc over ~600ms, staggered 60ms apart, fading out as they land; each landing bumps the
   * pill (see `bumpPill`). Falls back to a plain bump (no flight) under reduced motion, or when
   * `sourceEl` is missing/off-screen (a stale reference, or the HUD mid-teardown) — the coin count
   * is a nice-to-have, the budget pill updating is not. */
  private playSpendAnimation(diff: number, sourceEl: HTMLElement | null, pillEl: HTMLElement, textEl: HTMLElement): void {
    if (prefersReducedMotion() || !sourceEl) {
      this.bumpPill(pillEl, textEl);
      return;
    }
    const rootRect = this.root.getBoundingClientRect();
    const srcRect = sourceEl.getBoundingClientRect();
    const dstRect = pillEl.getBoundingClientRect();
    if (rootRect.width <= 0 || srcRect.width <= 0 || dstRect.width <= 0) {
      this.bumpPill(pillEl, textEl);
      return;
    }
    const stagePerClientPx = STAGE_W / rootRect.width;
    const startX = (srcRect.left + srcRect.width / 2 - rootRect.left) * stagePerClientPx;
    const startY = (srcRect.top + srcRect.height / 2 - rootRect.top) * stagePerClientPx;
    const endX = (dstRect.left + dstRect.width / 2 - rootRect.left) * stagePerClientPx;
    const endY = (dstRect.top + dstRect.height / 2 - rootRect.top) * stagePerClientPx;
    const dx = endX - startX;
    const dy = endY - startY;
    const SIZE = 18;
    const count = Math.min(diff, 5);
    for (let i = 0; i < count; i++) {
      const el = document.createElement('img');
      el.className = 'spend-koin';
      el.src = 'ui/koin.png';
      el.alt = '';
      el.style.left = `${startX - SIZE / 2}px`;
      el.style.top = `${startY - SIZE / 2}px`;
      this.root.appendChild(el);
      const anim = el.animate(
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
          { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 50}px) scale(0.9)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.4)`, opacity: 0, offset: 1 },
        ],
        { duration: 600, delay: i * 60, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' },
      );
      anim.onfinish = () => {
        el.remove();
        this.bumpPill(pillEl, textEl);
      };
    }
  }

  update(state: HudState<K, M, O, L>, flags?: { refused?: boolean; locked?: boolean }): void {
    if (!this.level) return;
    const level = this.level;
    const m = state.metrics;
    const editMode = state.mode === 'edit';
    const playMode = state.mode === 'play';
    const doneMode = state.mode === 'done';

    // ---- Bruno's quick line (src/ui/brunoDialog.ts) ----
    // The level's line and its hints play in the modal dialog (BuilderApp); everything else Bruno
    // says shows in the small box in the top row, left of the level picker: the play/done lines,
    // the 2 s refused/locked feedback, and the coach's prompts (which stay while their step is
    // active).
    this.brunoDialog.setQuick(this.quickLine(state, flags), this.pickerLeftNow());

    // ---- tool row ----
    this.setHidden(this.toolGroupEl, this.tools.length === 0 || !state.canTune);
    for (const [id, btn] of this.toolButtons) btn.classList.toggle('active', state.tool === id);

    // ---- hint button (bottom bar, left end) ----
    this.setHidden(this.hintBtn, state.hintCount === 0);
    this.setDisabled(this.hintBtn, state.hintCount === 0 || playMode);

    // ---- meters ----
    const live = playMode;
    for (const meter of this.allMeters) {
      const spec = this.hud.meters.find((s) => s.id === meter.id)!;
      this.setText(meter.main, spec.format(m[meter.metric] as number, m, live));
    }

    // ---- goal cards (2026-10-16, `hud.goalCards`): fill toward the target, green with a check
    // once met, red once an "under" limit breaks or the level is over and failed (goalCards.ts) ----
    if (this.goalCardsMode) {
      const over = levelOver(state.mode, state.passed, state.canPlay);
      state.goals.forEach((gr: GoalResult<M>, i: number) => {
        const item = this.goalCardItems[i];
        if (!item) return;
        const live = kitGoalCardLive(gr, { mode: state.mode, check: item.check, editLive: item.editLive, levelOver: over, passed: state.passed });
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
    }

    // ---- goals ----
    state.goals.forEach((gr: GoalResult<M>, i: number) => {
      const item = this.goalItems[i];
      if (!item) return;
      item.mark.classList.toggle('met', gr.pass);
      this.setText(item.value, this.goalValueText(gr.goal, gr.current));
      const bar = this.goalBar(gr.goal, gr.current, gr.pass);
      if (bar === null) {
        this.setHidden(item.barWrap, true);
      } else {
        this.setHidden(item.barWrap, false);
        item.fill.style.width = `${bar.pct}%`;
        item.fill.classList.toggle('fill-green', bar.color === 'green');
        item.fill.classList.toggle('fill-orange', bar.color === 'orange');
        item.fill.classList.toggle('fill-pink', bar.color === 'pink');
      }
    });

    // ---- dash right column: prop panel, else dash stats, else result card, else meters ----
    // With the drawer on, the dash never shows the chip panel (showPropPanel requires
    // !drawerMode). Instead, while the drawer is open with a stat-bar-bearing part selected,
    // the dash shows those stat bars in the .meters-col slot — freeing a whole section's worth
    // of room in the drawer itself. Otherwise (drawer closed, or open with nothing/no stats
    // selected) the rule collapses to result-card/meters as before.
    // No dash (`hud.goalsOverlay`): no chip panel and no stat bars anywhere, so the result card
    // (in the goals overlay) shows whenever there is one.
    const dashOn = this.dashEl !== null;
    const showPropPanel = dashOn && !this.drawerMode && state.canTune && state.selected !== null;
    const showDashStats = dashOn && this.drawerMode && state.canTune && state.selected !== null && state.stats.length > 0;
    const showResultCard = !showPropPanel && !showDashStats && state.result !== null;
    this.setHidden(this.propPanelEl, !showPropPanel);
    this.setHidden(this.dashStatsEl, !showDashStats);
    this.setHidden(this.resultCardEl, !showResultCard);
    if (this.metersOverlay) {
      // The overlay meters show only once the machine runs (play) and stay for the final numbers
      // (done); the dash's right column is then often empty, so the goals column fills it.
      this.setHidden(this.metersColEl, editMode);
      this.dashEl?.classList.toggle('goals-only', !showPropPanel && !showDashStats && !showResultCard);
    } else {
      this.setHidden(this.metersColEl, showPropPanel || showDashStats || showResultCard);
    }
    // Coins left for the child's own parts (null without a budget): drives the `.unaffordable`
    // dimming on option chips/buttons below (the app already refuses the change; this is cosmetic).
    const remaining = state.budget ? state.budget.total - state.budget.used : null;
    if (showPropPanel && state.selected) {
      this.rebuildPropPanel(state);
      this.syncPropChipActive(state.selected.part.props, state.selected.descriptors, state.selected.optionCosts, remaining);
      this.rebuildStatBars(this.statBarsEl, state.stats);
    } else {
      this.propPanelKey = null;
    }
    if (showDashStats) {
      this.rebuildStatBars(this.dashStatsEl, state.stats);
    }
    if (showResultCard && state.result) {
      this.rebuildResultCard(state.result);
    } else {
      this.resultCardKey = null;
    }

    // ---- properties drawer (spec.drawer courses only) ----
    // `shelfOn`: the course has `drawer` AND at least one palette kind with a shelf picture
    // (see shelf.ts). The drawer opens only with a selection on every course (Gao, 2026-10-05:
    // "it should hide until I click the rover"): tapping the base shows the shelf alone (the base
    // has no rows), tapping an attachment shows its rows in the pinned panel above the shelf. A
    // drawer course with no shelf kinds (the catapult) renders its rows straight into the
    // scrollable `drawerRowsEl` (no pinned panel involved).
    const shelfOn = this.drawerMode && hasShelfKinds(state.palette, this.hud.partInfo);
    if (this.drawerMode) {
      // 2026-10-16: a selection with nothing to show (no shelf, no bin tile, no row: every control
      // is on the machine) keeps the drawer shut (`drawerHasContent`).
      const showDrawer = state.canTune && state.selected !== null &&
        drawerHasContent({ shelfOn, bin: state.bin, rows: state.selected.descriptors.length });
      // The drawer closed, the mode left edit (both collapse to !showDrawer, since `selected` is
      // null whenever `!canTune`), the selection was cleared (shelf courses only — `selected` can
      // be null while the drawer stays open), or the selection moved to a different part: a flight
      // left dangling here would either never land or land on the wrong part (`setProp` always
      // targets whatever is selected when it's called) — commit it now instead.
      if (this.flight && (!showDrawer || !state.selected || this.flight.partId !== state.selected.part.id)) {
        this.finishFlightInstant();
      }
      this.setDrawerOpen(showDrawer);
      // Shelf courses: the selected part's rows go in the PINNED panel, outside the scrollable
      // body, so the shelf above never moves when the selection changes. No-shelf courses (the
      // catapult): rows go straight into the scrollable body, exactly as before.
      const rowsContainer = shelfOn ? this.drawerPinnedRowsEl : this.drawerRowsEl;
      if (state.selected) {
        this.rebuildDrawerPanel(state.selected, state.introduced, rowsContainer);
        this.syncDrawerActive(
          state.selected.part.props,
          state.selected.descriptors,
          state.selected.part.lockedProps ?? [],
          state.selected.part.id,
          state.selected.optionCosts,
          remaining,
        );
      } else if (this.drawerPanelKey !== null) {
        // Nothing selected (shelf courses: the drawer can still be open) — clear any stale
        // property rows (either container, in case the course ever switches) and fall back to
        // the shelf-only header.
        this.drawerPanelKey = null;
        this.drawerOptionsByCode.clear();
        this.drawerSectionLabelByCode.clear();
        this.drawerSectionByCode.clear();
        this.drawerRowsEl.innerHTML = '';
        this.drawerPinnedRowsEl.innerHTML = '';
      }
      if (!state.selected) {
        this.setHidden(this.drawerHeaderIconEl, true);
        this.setText(this.drawerHeaderLabelEl, 'Parts');
      }
      this.lastSelectedPartId = state.selected?.part.id ?? null;
      this.syncBin(showDrawer ? state.bin : null);
      this.syncShelf(state, shelfOn);
      // The pinned panel only exists for shelf courses, slid up while a part WITH rows is selected
      // (the base has none: shelf only); a no-shelf course's drawer never opens it.
      const hasRows = !!state.selected && state.selected.descriptors.length > 0;
      this.drawerPinnedEl.classList.toggle('open', shelfOn && state.canTune && hasRows);
    }

    // ---- world scrollbar (wide worlds; after the drawer, whose open state sets its length) ----
    const showScroll = state.scroll !== null;
    this.setHidden(this.scrollEl, !showScroll);
    if (!showScroll) {
      if (this.scrollDrag) {
        this.scrollDrag = null;
        this.scrollThumbEl.classList.remove('dragging');
      }
    } else {
      // While the finger drags, the thumb follows the finger, not the (one-frame-late) state.
      if (!this.scrollDrag && state.scroll !== null) this.scrollT = state.scroll;
      this.layoutScrollbar();
    }

    // ---- budget pill: bottom bar for ordinary courses, the drawer header for shelf courses ----
    this.setHidden(this.budgetPillEl, state.budget === null || shelfOn);
    if (state.budget) this.setText(this.budgetPillTextEl, `${state.budget.used} / ${state.budget.total}`);
    if (this.drawerMode) {
      this.setHidden(this.drawerBudgetPillEl, state.budget === null || !shelfOn);
      if (state.budget) this.setText(this.drawerBudgetPillTextEl, `${state.budget.used} / ${state.budget.total}`);
    }

    // ---- coin spend animation (2026-10-05 round 2): a jump in `state.budget.used` since the
    // previous frame means a part/option was just added or upgraded — fly `diff` koins (capped at
    // 5) from the last tapped button to whichever pill is visible right now; a DROP (Remove/Undo)
    // just bumps the pill, no coins fly backwards. No previous frame to compare against (a level
    // just loaded, or the course has no budget) plays nothing.
    if (state.budget) {
      const used = state.budget.used;
      const activePillEl = shelfOn ? this.drawerBudgetPillEl : this.budgetPillEl;
      const activePillTextEl = shelfOn ? this.drawerBudgetPillTextEl : this.budgetPillTextEl;
      if (this.lastBudgetUsed !== null && used !== this.lastBudgetUsed) {
        const diff = used - this.lastBudgetUsed;
        if (diff > 0) this.playSpendAnimation(diff, this.lastSpendButton, activePillEl, activePillTextEl);
        else this.bumpPill(activePillEl, activePillTextEl);
      }
      this.lastBudgetUsed = used;
    } else {
      this.lastBudgetUsed = null;
    }

    // ---- palette ----
    this.rebuildPalette(state);

    // ---- bottom bar buttons ----
    // `playInBar: false`: the course's own in-scene start control is the only one (no bar
    // Play/Start in edit mode, no "Run it again" in done mode); Stop/Reset, Undo, Clear stay.
    const playInBar = this.hud.playInBar !== false;
    this.setHidden(this.playBtn, !playInBar || !(editMode || (doneMode && state.canPlay)));
    this.setHidden(this.stopBtn, editMode);
    this.setDisabled(this.playBtn, !state.canPlay);
    this.setText(this.playBtn, editMode
      ? this.hud.lines.launch ?? '▶ Play'
      : this.hud.lines.playAgain ?? this.hud.lines.launch ?? '▶ Play');
    this.setText(this.stopBtn, this.hud.lines.reset ?? '■ Stop');

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

    // ---- overlays, last (they measure the buttons laid out above) ----
    this.syncWin(state);
    // The shelf unlock pop-in and its callout wait for Bruno's lesson intro to close.
    if (!this.brunoDialog.modalOpen) this.syncUnlock(state);
    this.syncCoachHand(state);
  }

  /** This frame's quick line (see `update`), or null for none. */
  private quickLine(state: HudState<K, M, O, L>, flags?: { refused?: boolean; locked?: boolean }): QuickLine | null {
    const level = state.level;
    const lines = this.hud.lines;
    // The 2 s refused/locked feedback wins over the coach, which wins over the run's lines.
    if (state.mode === 'edit' && flags?.refused) return { text: lines.refused ?? 'You cannot add that here.', tone: 'fail' };
    if (flags?.locked) return { text: lines.locked ?? 'That one is locked for this puzzle.', tone: 'fail' };
    if (state.coach?.text) return { text: state.coach.text, sticky: true };
    if (state.mode === 'play') return { text: lines.play };
    if (state.mode !== 'done' || state.outcome === null) return null;
    if (state.passed) return { text: lines.pass, tone: 'pass' };
    if (this.hud.failOutcomes.includes(state.outcome)) {
      return { text: level.failHints[state.outcome] ?? lines.doneNotPassed, tone: 'fail' };
    }
    if (state.canPlay) return { text: lines.shotDone ?? lines.doneNotPassed };
    return { text: lines.doneNotPassed };
  }

  /** The top row's level picker's left edge in stage px (the quick line stops short of it),
   * measured once per level load (the picker's label sets its width). */
  private pickerLeftNow(): number {
    if (this.pickerLeft < 0) this.pickerLeft = this.topbarEl.offsetLeft;
    return this.pickerLeft;
  }
}
