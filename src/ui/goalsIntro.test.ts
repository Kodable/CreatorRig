import { afterEach, describe, expect, it, vi } from 'vitest';
import { GOALS_INTRO_MS, GOALS_INTRO_RAISE, GOALS_INTRO_SCALE, playGoalsIntro } from './goalsIntro';

// A stand-in for the goals panel: just the layout box and `animate` the intro reads (the tests run
// in node, no DOM).
function fakePanel(box: { left: number; top: number; w: number; h: number }, animate: unknown = vi.fn(() => ({ id: 'anim' }))) {
  return {
    offsetLeft: box.left,
    offsetTop: box.top,
    offsetWidth: box.w,
    offsetHeight: box.h,
    animate,
  } as unknown as HTMLElement;
}

function stubMotion(reduce: boolean): void {
  vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: reduce && q.includes('reduce') }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playGoalsIntro', () => {
  it('starts centred over the world panel, raised a little, scaled up, and ends at rest', () => {
    stubMotion(false);
    const el = fakePanel({ left: 44, top: 90, w: 260, h: 80 });
    const anim = playGoalsIntro(el, 78, 690);
    expect(anim).toEqual({ id: 'anim' });
    const [frames, opts] = (el.animate as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // panel centre x 512 (x 32..992), y (78 + 690) / 2 - raise; the element's centre is (174, 130)
    const dx = 512 - (44 + 130);
    const dy = (78 + 690) / 2 - GOALS_INTRO_RAISE - (90 + 40);
    expect(frames[1].transform).toBe(`translate(${dx}px, ${dy}px) scale(${GOALS_INTRO_SCALE})`);
    expect(frames[0].opacity).toBe(0);
    expect(frames[frames.length - 1].transform).toBe('none');
    expect(opts).toEqual({ duration: GOALS_INTRO_MS, fill: 'backwards' });
    expect(GOALS_INTRO_MS).toBe(1900);
  });

  it('plays nothing under prefers-reduced-motion', () => {
    stubMotion(true);
    const el = fakePanel({ left: 44, top: 90, w: 260, h: 80 });
    expect(playGoalsIntro(el, 78, 690)).toBeNull();
    expect(el.animate).not.toHaveBeenCalled();
  });

  it('plays nothing for a panel with no layout box or without the Web Animations API', () => {
    stubMotion(false);
    const hidden = fakePanel({ left: 0, top: 0, w: 0, h: 0 });
    expect(playGoalsIntro(hidden, 210, 690)).toBeNull();
    expect(hidden.animate).not.toHaveBeenCalled();
    expect(playGoalsIntro(fakePanel({ left: 44, top: 90, w: 260, h: 80 }, null), 210, 690)).toBeNull();
  });
});
