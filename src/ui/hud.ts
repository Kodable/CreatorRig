import type { EditTool, Goal, GoalResult, HudState, Level, Metric } from '../core/types';
import { GROUND_Y, PANEL_TOP_Y } from '../game/view';
import { playGoalsIntro } from './goalsIntro';

export interface HudCallbacks {
  play(): void;
  stop(): void;
  clear(): void;
  undo(): void;
  next(): void;
  selectLevel(id: string): void;
  setTool(tool: EditTool): void;
  exit(): void;
}

const STAGE_W = 1024;
const G_MAX = 6; // g value that maps to a full (100%) intense-o-meter gauge

/* 2026-10-07 (Gao: "put the same treatment of the goal, the stats, and the bottom for the coaster"):
   the rover's layout. No dash any more: the goals sit in a translucent panel over the world panel's
   top-left corner (`.goals-overlay`, which pops up big in the middle at every level start:
   goalsIntro.ts), the meters in its twin over the top-right corner (`.meters-col.overlay`, play and
   done mode only), and the scene grows up into the dash's old room (view.ts PANEL_TOP_Y, 78). The
   bar: Point/Loop on the left, the big Play / Stop / Next level buttons centred (side by side when
   two show), Undo and Clear on the right. */

function fmt1(v: number): string {
  return v.toFixed(1);
}
function fmt2(v: number): string {
  return v.toFixed(2);
}
// Whole-number goal targets ("15", "18") print without a decimal; anything else keeps one.
function fmtTarget(v: number): string {
  return Number.isInteger(v) ? String(v) : fmt1(v);
}

const GOAL_UNIT: Partial<Record<Metric, string>> = {
  maxDrop: 'm',
  maxSpeed: 'm/s',
  length: 'm',
  hangTime: 's',
  loops: 'loops',
  loopsCompleted: 'loops',
  maxG: 'g',
};

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

function goalValueText(goal: Goal, current: number): string {
  if (goal.metric === 'reachedEnd' || goal.metric === 'atFinish') return current >= 1 ? 'yes' : 'not yet';
  const unit = GOAL_UNIT[goal.metric] ?? '';
  if (goal.metric === 'loops' || goal.metric === 'loopsCompleted') {
    return `${Math.round(current)} of ${Math.round(goal.value)} ${unit}`;
  }
  return `${fmt1(current)} of ${fmtTarget(goal.value)} ${unit}`;
}

interface GoalBar {
  pct: number;
  color: 'green' | 'orange' | 'pink';
}

function goalBar(goal: Goal, current: number, pass: boolean): GoalBar | null {
  if (goal.metric === 'reachedEnd' || goal.metric === 'atFinish') return null;
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

interface GoalItem {
  row: HTMLLIElement;
  mark: HTMLSpanElement;
  label: HTMLSpanElement;
  value: HTMLSpanElement;
  barWrap: HTMLDivElement;
  fill: HTMLDivElement;
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

  private titleEl!: HTMLDivElement;
  private brunoTextEl!: HTMLDivElement;
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
  private playBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private undoBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

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

    // ---- bruno slot + topbar (speech bubble) ----
    const slot = document.createElement('div');
    slot.className = 'bruno-slot';
    this.root.appendChild(slot);

    const topbar = document.createElement('div');
    topbar.id = 'topbar';

    const topbarMain = document.createElement('div');
    topbarMain.className = 'topbar-main';

    const title = document.createElement('div');
    title.className = 'title';
    const brunoText = document.createElement('div');
    brunoText.className = 'bruno-text';
    topbarMain.append(title, brunoText);
    this.titleEl = title;
    this.brunoTextEl = brunoText;

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

    topbar.append(topbarMain, picker, parkBtn);
    this.root.appendChild(topbar);

    // ---- goals overlay (over the world panel's top-left corner, every mode) ----
    // The outcome of a run needs no result card here: Bruno's bubble says it (update()).
    const goalsOverlay = document.createElement('div');
    goalsOverlay.className = 'goals-overlay';
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
    this.meterHang = makeMeter('meter-hang', 'Hang time');
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
    bottombar.appendChild(toolGroup);
    this.toolGroupEl = toolGroup;
    this.toolPointBtn = toolPointBtn;
    this.toolLoopBtn = toolLoopBtn;

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

    this.setText(this.titleEl, level.title);

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
      this.goalItems = level.goals.map((goal: Goal) => {
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

    // ---- goals intro: the panel pops up big in the middle of the scene, then glides home ----
    this.goalsIntroAnim?.cancel();
    const anim = playGoalsIntro(this.goalsOverlayEl, PANEL_TOP_Y, GROUND_Y);
    this.goalsIntroAnim = anim;
    if (anim) {
      anim.onfinish = (): void => {
        if (this.goalsIntroAnim === anim) this.goalsIntroAnim = null;
      };
    }

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

    // ---- level picker ----
    this.setText(this.pickerLabelEl, `Level ${this.levelIndex + 1} of ${all.length}`);
    this.setDisabled(this.pickerPrevBtn, this.levelIndex <= 0);
    this.setDisabled(this.pickerNextBtn, this.levelIndex >= all.length - 1);
  }

  update(state: HudState): void {
    if (!this.level) return;
    const level = this.level;
    const m = state.metrics;
    const editMode = state.mode === 'edit';
    const playMode = state.mode === 'play';
    const doneMode = state.mode === 'done';

    // ---- Bruno's speech bubble ----
    let brunoLine: string;
    if (editMode) {
      brunoLine = level.bruno;
    } else if (playMode) {
      brunoLine = 'Wheee! Go fuzz, go!';
    } else if (state.passed) {
      brunoLine = 'Level complete! Great coaster!';
    } else if (state.outcome === 'reachedEnd') {
      const atFinishGoal = state.goals.find((gr) => gr.goal.metric === 'atFinish');
      brunoLine = atFinishGoal && !atFinishGoal.pass
        ? 'The fuzz got to the end, but the track does not reach the flag yet.'
        : 'The fuzz made it! Now check the goals.';
    } else if (state.outcome === 'rolledBack') {
      brunoLine = level.hints.rolledBack;
    } else if (state.outcome === 'stuck') {
      brunoLine = level.hints.stuck;
    } else if (state.outcome === 'fell') {
      brunoLine = level.hints.fell;
    } else {
      brunoLine = level.bruno;
    }
    this.setText(this.brunoTextEl, brunoLine);
    const isPass = doneMode && state.passed;
    const isFail = doneMode && !state.passed &&
      (state.outcome === 'rolledBack' || state.outcome === 'stuck' || state.outcome === 'fell');
    this.brunoTextEl.classList.toggle('pass', isPass);
    this.brunoTextEl.classList.toggle('fail', isFail);

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

    // ---- goals ----
    state.goals.forEach((gr: GoalResult, i: number) => {
      const item = this.goalItems[i];
      if (!item) return;
      item.mark.classList.toggle('met', gr.pass);
      this.setText(item.value, goalValueText(gr.goal, gr.current));
      const bar = goalBar(gr.goal, gr.current, gr.pass);
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

    // ---- bottom bar buttons ----
    this.setHidden(this.toolGroupEl, !editMode);
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
  }
}
