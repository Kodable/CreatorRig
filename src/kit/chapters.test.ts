import { describe, expect, it } from 'vitest';
import { levelPickerLabel } from './chapters';

interface TestLevel {
  id: string;
  chapter?: string;
}

describe('levelPickerLabel', () => {
  it('no chapters: "Level N of M"', () => {
    const all: TestLevel[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(levelPickerLabel(all[0]!, all)).toBe('Level 1 of 3');
    expect(levelPickerLabel(all[1]!, all)).toBe('Level 2 of 3');
    expect(levelPickerLabel(all[2]!, all)).toBe('Level 3 of 3');
  });

  it('three chapters of different sizes: first and last of each', () => {
    const all: TestLevel[] = [
      { id: 'mars-1', chapter: 'Mars' },
      { id: 'mars-2', chapter: 'Mars' },
      { id: 'mars-3', chapter: 'Mars' },
      { id: 'moon-1', chapter: 'Moon' },
      { id: 'io-1', chapter: 'Io' },
      { id: 'io-2', chapter: 'Io' },
    ];
    expect(levelPickerLabel(all[0]!, all)).toBe('Mars · 1 of 3');
    expect(levelPickerLabel(all[2]!, all)).toBe('Mars · 3 of 3');
    expect(levelPickerLabel(all[3]!, all)).toBe('Moon · 1 of 1');
    expect(levelPickerLabel(all[4]!, all)).toBe('Io · 1 of 2');
    expect(levelPickerLabel(all[5]!, all)).toBe('Io · 2 of 2');
  });

  it('a chapter appearing non-contiguously is still counted by membership, in course order', () => {
    const all: TestLevel[] = [
      { id: 'mars-1', chapter: 'Mars' },
      { id: 'moon-1', chapter: 'Moon' },
      { id: 'mars-2', chapter: 'Mars' },
      { id: 'moon-2', chapter: 'Moon' },
      { id: 'mars-3', chapter: 'Mars' },
    ];
    expect(levelPickerLabel(all[0]!, all)).toBe('Mars · 1 of 3');
    expect(levelPickerLabel(all[2]!, all)).toBe('Mars · 2 of 3');
    expect(levelPickerLabel(all[4]!, all)).toBe('Mars · 3 of 3');
    expect(levelPickerLabel(all[1]!, all)).toBe('Moon · 1 of 2');
    expect(levelPickerLabel(all[3]!, all)).toBe('Moon · 2 of 2');
  });

  it('a level not in `all` (no chapter): falls back to index 0', () => {
    const all: TestLevel[] = [{ id: 'a' }, { id: 'b' }];
    expect(levelPickerLabel({ id: 'missing' }, all)).toBe('Level 1 of 2');
  });

  it('a level not in `all` (with a chapter): position 0 among its chapter siblings', () => {
    const all: TestLevel[] = [
      { id: 'mars-1', chapter: 'Mars' },
      { id: 'mars-2', chapter: 'Mars' },
    ];
    expect(levelPickerLabel({ id: 'mars-missing', chapter: 'Mars' }, all)).toBe('Mars · 0 of 2');
  });
});
