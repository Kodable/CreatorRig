import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_KINDS,
  BLURBS,
  CATALOG,
  COST,
  DRIVE,
  MOUNT_DESCRIPTOR,
  MOUNT_LEN,
  PART_LIMIT,
  POWER,
  POWER_FORCE,
  POWER_KINDS,
  ROVER_MASS,
  SPRING_EXTRA,
  STOVE_ON,
  STOVE_PERIOD,
  WEIGHT_KINDS,
  WEIGHT_MASS,
  WHEEL,
  WHEEL_KINDS,
  WHEEL_R,
  buildCost,
  defaultProps,
  isAttachment,
  mountOf,
  partCost,
} from './catalog';
import type { PartKind } from './types';

const PUBLIC = resolve(__dirname, '../../../../public');

describe('vehicle catalog', () => {
  it('has the dome, nine attachments (one kind each) and the level scenery', () => {
    expect(Object.keys(CATALOG).sort()).toEqual(
      ['rover', 'wheelCircle', 'wheelSquare', 'wheelStar', 'fan', 'stove', 'jet', 'feather', 'beans', 'watermelon', 'block', 'finish'].sort(),
    );
    expect(WHEEL_KINDS).toEqual(['wheelCircle', 'wheelSquare', 'wheelStar']);
    expect(POWER_KINDS).toEqual(['fan', 'stove', 'jet']);
    expect(WEIGHT_KINDS).toEqual(['feather', 'beans', 'watermelon']);
    expect(ATTACHMENT_KINDS).toHaveLength(9);
  });

  it('every attachment has exactly one property, the mount (suction cup or spring, default cup)', () => {
    for (const kind of ATTACHMENT_KINDS) {
      expect(CATALOG[kind].descriptors).toEqual([MOUNT_DESCRIPTOR]);
      expect(defaultProps(kind)).toEqual({ mount: 'cup' });
    }
    expect(MOUNT_DESCRIPTOR.code).toBe('mount');
    expect(MOUNT_DESCRIPTOR.default).toBe('cup');
    expect(MOUNT_DESCRIPTOR.options.map((o) => o.value)).toEqual(['cup', 'spring']);
    for (const kind of ['rover', 'block', 'finish'] as PartKind[]) expect(CATALOG[kind].descriptors).toEqual([]);
  });

  it('the mount options show the real suction cup and spring pictures', () => {
    expect(MOUNT_DESCRIPTOR.options.map((o) => o.image)).toEqual([
      'parts/rover/real/suctioncup.png',
      'parts/rover/real/spring.png',
    ]);
    for (const o of MOUNT_DESCRIPTOR.options) expect(existsSync(resolve(PUBLIC, o.image!))).toBe(true);
  });

  it('the mount labels say what each does; the spring names its bouncy behaviour and its extra coin', () => {
    expect(MOUNT_DESCRIPTOR.options.map((o) => o.label)).toEqual(['Suction cup', 'Spring (bouncy, +1 coin)']);
    expect(MOUNT_DESCRIPTOR.options[1]!.label).toContain(`+${SPRING_EXTRA} coin`);
  });

  it('blurbs (2026-10-05): one short kid-friendly sentence per attachment; the star grips sand and ice (2026-10-09)', () => {
    expect(BLURBS).toEqual({
      wheelCircle: 'Fast and smooth on flat ground.',
      wheelSquare: 'Cheap and bumpy. Slow!',
      wheelStar: 'Climbs almost anything. Grips sand and ice!',
      fan: 'A gentle push. Stick it on the back.',
      stove: 'Puffs of push! Stick it on the back.',
      jet: 'A huge push. Watch out, it can lift you!',
      feather: 'Almost no weight.',
      beans: 'Adds some weight to hold you down.',
      watermelon: 'Heavy! Great for ramming.',
    });
    for (const kind of ATTACHMENT_KINDS) expect(BLURBS[kind].length, kind).toBeLessThanOrEqual(45);
  });

  it('costs: square 1, circle 2, star 3, fan 2, stove 3, jet 5, feather 1, beans 2, watermelon 3', () => {
    expect(COST).toEqual({ wheelSquare: 1, wheelCircle: 2, wheelStar: 3, fan: 2, stove: 3, jet: 5, feather: 1, beans: 2, watermelon: 3 });
  });

  it('partCost: kind cost, +1 on a spring; the dome and scenery are free', () => {
    expect(SPRING_EXTRA).toBe(1);
    expect(partCost({ kind: 'jet', props: { mount: 'cup' } })).toBe(5);
    expect(partCost({ kind: 'jet', props: { mount: 'spring' } })).toBe(6);
    expect(partCost({ kind: 'wheelSquare', props: {} })).toBe(1);
    expect(partCost({ kind: 'rover', props: {} })).toBe(0);
    expect(partCost({ kind: 'block', props: {} })).toBe(0);
    expect(partCost({ kind: 'finish', props: {} })).toBe(0);
  });

  it('buildCost sums the child parts only (locked parts are free, as in the kit budget)', () => {
    expect(
      buildCost([
        { kind: 'rover', props: {}, locked: true },
        { kind: 'wheelCircle', props: { mount: 'spring' } },
        { kind: 'wheelCircle', props: { mount: 'cup' } },
        { kind: 'jet', props: { mount: 'cup' }, locked: true },
      ]),
    ).toBe(5);
  });

  it('mountOf defaults to cup', () => {
    expect(mountOf({})).toBe('cup');
    expect(mountOf({ mount: 'spring' })).toBe('spring');
    expect(mountOf({ mount: 'nonsense' })).toBe('cup');
  });

  it('isAttachment', () => {
    expect(isAttachment('fan')).toBe(true);
    expect(isAttachment('rover')).toBe(false);
    expect(isAttachment('vehicle')).toBe(false);
  });

  it('physical numbers from the design brief', () => {
    expect(ROVER_MASS).toBe(2.5);
    expect(DRIVE).toEqual({ speed: 6, torque: 4 });
    expect(WHEEL.wheelCircle.r).toBe(0.3);
    expect(WHEEL.wheelSquare.r).toBe(0.27);
    expect(WHEEL.wheelStar.reach).toBe(0.33);
    for (const k of WHEEL_KINDS) expect(WHEEL[k].density).toBe(1);
    expect(POWER_FORCE).toEqual({ fan: 4, stove: 7, jet: 12 });
    expect([STOVE_ON, STOVE_PERIOD]).toEqual([0.6, 1.0]);
    expect(WEIGHT_MASS).toEqual({ feather: 0.05, beans: 1.5, watermelon: 4 });
    expect(MOUNT_LEN.spring).toBeGreaterThan(MOUNT_LEN.cup);
  });

  it('PART_LIMIT leaves room for 15 wheels all around', () => {
    expect(PART_LIMIT).toBeGreaterThanOrEqual(16);
  });

  it('still exports the legacy buggy tables the Bridge course imports', () => {
    expect(WHEEL_R.M).toBe(0.45);
    expect(POWER.Medium).toEqual({ speed: 6, torque: 4 });
  });
});
