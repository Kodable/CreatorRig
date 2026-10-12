// The pure parts of Bruno's dialog (src/ui/brunoDialog.ts): word splitting and the typing
// schedule, the quick line's auto-hide time, the hint label, the text-change guard, where a quick
// line goes, and the modal sequence (with fake stage/box halves; the tests run in node, no DOM).
import { describe, expect, it } from 'vitest';
import {
  BrunoDialogRunner,
  LineGuard,
  QUICK_MAX_W,
  hintLabel,
  makeDialogRunner,
  placeQuick,
  quickLineMs,
  splitWords,
  typingMs,
  wordDelays,
  type BrunoBoxApi,
  type DialogLine,
  type QuickRegion,
} from './brunoDialog';

describe('splitWords', () => {
  it('splits on any run of whitespace and drops empty words', () => {
    expect(splitWords("Let's drag the station up!")).toEqual(["Let's", 'drag', 'the', 'station', 'up!']);
    expect(splitWords('  two\n spaces\tand tabs  ')).toEqual(['two', 'spaces', 'and', 'tabs']);
    expect(splitWords('')).toEqual([]);
    expect(splitWords('   ')).toEqual([]);
  });
});

describe('the typing schedule', () => {
  it('starts each word 90 ms after the previous one', () => {
    expect(wordDelays(4)).toEqual([0, 90, 180, 270]);
    expect(wordDelays(0)).toEqual([]);
    expect(wordDelays(3, 100)).toEqual([0, 100, 200]);
  });

  it('lasts until the last word has faded in (150 ms after it starts)', () => {
    expect(typingMs(0)).toBe(0);
    expect(typingMs(1)).toBe(150);
    expect(typingMs(10)).toBe(9 * 90 + 150);
  });
});

describe('quickLineMs', () => {
  it('is 3 s plus 0.25 s per word', () => {
    expect(quickLineMs('Go fuzz, go.')).toBe(3000 + 3 * 250);
    expect(quickLineMs('')).toBe(3000);
  });
});

describe('hintLabel', () => {
  it('reads "Hint N of M", or plain "Hint" for a one-hint level', () => {
    expect(hintLabel(0, 3)).toBe('Hint 1 of 3');
    expect(hintLabel(2, 3)).toBe('Hint 3 of 3');
    expect(hintLabel(0, 1)).toBe('Hint');
  });
});

describe('LineGuard', () => {
  it('reports a change only when the text differs from the last one', () => {
    const g = new LineGuard();
    expect(g.changed('Go!')).toBe(true);
    expect(g.changed('Go!')).toBe(false); // the same line every frame
    expect(g.changed('Go!')).toBe(false);
    expect(g.changed(null)).toBe(true); // the line went away
    expect(g.changed(null)).toBe(false);
    expect(g.changed('Go!')).toBe(true); // and came back: animate again
    expect(g.current).toBe('Go!');
  });

  it('reset() lets the same line show again', () => {
    const g = new LineGuard();
    g.changed('Tap BUILD.');
    g.reset();
    expect(g.current).toBeNull();
    expect(g.changed('Tap BUILD.')).toBe(true);
  });
});

describe('placeQuick', () => {
  const REGION: QuickRegion = { left: 32, right: 992, bottom: 684, top: 200 };
  /** A box whose natural width is `natural` px, one line (48 px tall) when it fits, two otherwise. */
  const measure = (natural: number) => (maxW: number) => ({ w: Math.min(natural, maxW), h: natural > maxW ? 76 : 48 });

  it('centres the box along the bottom of the free span, never wider than 560 px', () => {
    expect(placeQuick(REGION, measure(300), [])).toEqual({ x: 362, y: 636, w: 300, h: 48 });
    const wide = placeQuick(REGION, measure(900), []);
    expect(wide.w).toBe(QUICK_MAX_W);
    expect(wide.x + wide.w / 2).toBe(512);
    expect(wide.y + wide.h).toBe(684);
  });

  it('stays left of the open drawer', () => {
    const r = placeQuick({ ...REGION, right: 652 }, measure(900), []);
    expect(r.x).toBeGreaterThanOrEqual(44);
    expect(r.x + r.w).toBeLessThanOrEqual(640);
  });

  it("moves right of the coach's hand when the centred spot would cover it", () => {
    const avoid = { x: 300, y: 600, w: 150, h: 100 };
    const r = placeQuick(REGION, measure(300), [avoid]);
    expect(r.x).toBeGreaterThanOrEqual(462);
    expect(r.y + r.h).toBe(684);
  });

  it('moves left of it when the right side is too narrow', () => {
    const avoid = { x: 700, y: 600, w: 260, h: 100 };
    const r = placeQuick({ ...REGION, left: 300 }, measure(300), [avoid]);
    expect(r.x + r.w).toBeLessThanOrEqual(688);
    expect(r.y + r.h).toBe(684);
  });

  it('goes to the top spot when neither bottom side is clear', () => {
    const avoid = { x: 200, y: 560, w: 600, h: 140 };
    expect(placeQuick(REGION, measure(300), [avoid]).y).toBe(200);
  });

  it('keeps the centred spot when the hand is elsewhere', () => {
    const avoid = { x: 100, y: 300, w: 80, h: 80 };
    expect(placeQuick(REGION, measure(300), [avoid])).toEqual(placeQuick(REGION, measure(300), []));
  });

  it('prefer top: centred under the goals panel, and dodges a callout there', () => {
    const top: QuickRegion = { ...REGION, right: 652, prefer: 'top' };
    const r = placeQuick(top, measure(300), []);
    expect(r).toEqual({ x: 192, y: 200, w: 300, h: 48 });
    const callout = { x: 386, y: 170, w: 260, h: 100 };
    const moved = placeQuick(top, measure(300), [callout]);
    expect(moved.y).toBe(200);
    expect(moved.x + moved.w).toBeLessThanOrEqual(374);
  });

  it('keeps clear of every avoid rect at once', () => {
    const rects = [
      { x: 300, y: 600, w: 120, h: 100 },
      { x: 600, y: 600, w: 120, h: 100 },
    ];
    const r = placeQuick(REGION, measure(250), rects);
    for (const a of rects) expect(r.x + r.w <= a.x || r.x >= a.x + a.w || r.y + r.h <= a.y).toBe(true);
  });
});

/** A box whose `say` waits for `tap()`; every call lands in `log`. */
function fakeBox(log: string[]) {
  let close: (() => void) | null = null;
  const box: BrunoBoxApi & { tap(): void } = {
    begin: () => void log.push('begin'),
    say: (line: DialogLine) => {
      log.push(`say:${line.label}`);
      return new Promise<void>((r) => {
        close = r;
      });
    },
    undim: () => void log.push('undim'),
    end: () => void log.push('end'),
    cancel: () => {
      log.push('cancel');
      const c = close;
      close = null;
      c?.();
    },
    tap: () => {
      const c = close;
      close = null;
      c?.();
    },
  };
  return box;
}

function fakeStage(log: string[]) {
  return {
    showBrunoStage: async () => void log.push('stage-in'),
    hideBrunoStage: async () => void log.push('stage-out'),
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('BrunoDialogRunner', () => {
  it('dims, brings Bruno in, types, waits for the tap, then undims while he leaves', async () => {
    const log: string[] = [];
    const box = fakeBox(log);
    const runner = new BrunoDialogRunner(fakeStage(log), box);
    const done = runner.play({ label: 'Vertical drop', text: 'Drag the station up.' });
    await tick();
    expect(runner.open).toBe(true);
    expect(log).toEqual(['cancel', 'begin', 'stage-in', 'say:Vertical drop']);
    box.tap();
    expect(await done).toBe(true);
    expect(log.slice(4)).toEqual(['undim', 'stage-out', 'end']);
    expect(runner.open).toBe(false);
  });

  it('a newer dialog takes over: the old one resolves false and never undims', async () => {
    const log: string[] = [];
    const box = fakeBox(log);
    const runner = new BrunoDialogRunner(fakeStage(log), box);
    const first = runner.play({ label: 'One', text: 'a' });
    await tick();
    const second = runner.play({ label: 'Two', text: 'b' });
    expect(await first).toBe(false);
    await tick();
    expect(log.filter((e) => e === 'undim')).toHaveLength(0);
    box.tap();
    expect(await second).toBe(true);
    expect(log.filter((e) => e === 'end')).toHaveLength(1);
  });

  it('cancel() closes the box and gives the HUD its taps back', async () => {
    const log: string[] = [];
    const runner = new BrunoDialogRunner(fakeStage(log), fakeBox(log));
    const p = runner.play({ label: 'One', text: 'a' });
    await tick();
    runner.cancel();
    expect(await p).toBe(false);
    expect(log.slice(-3)).toEqual(['cancel', 'undim', 'end']);
    expect(runner.open).toBe(false);
  });

  it('makeDialogRunner needs both halves', () => {
    const log: string[] = [];
    expect(makeDialogRunner(fakeStage(log), fakeBox(log))).toBeInstanceOf(BrunoDialogRunner);
    expect(makeDialogRunner({}, fakeBox(log))).toBeNull();
    expect(makeDialogRunner(fakeStage(log), undefined)).toBeNull();
  });
});
