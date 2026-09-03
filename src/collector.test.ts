import { describe, expect, it } from 'vitest';
import { saveReport } from '../scripts/collector';

const report = {
  rig: 'kodable-creator-rig',
  scenario: 'determinism',
  adapter: 'rapier',
  device: 'chromebook',
  params: { count: 200, duration: 15 },
  extra: { hash: '3f70d0ba' },
};

describe('saveReport', () => {
  it('writes a valid report under scenario-count-adapter-device.json', () => {
    const writes: Record<string, string> = {};
    const r = saveReport(JSON.stringify(report), '/results', (path, data) => (writes[path] = data));
    expect(r.status).toBe(200);
    expect(r.body.saved).toBe('determinism-200-rapier-chromebook.json');
    expect(JSON.parse(writes['/results/determinism-200-rapier-chromebook.json']!)).toEqual(report);
  });
  it('rejects bodies that are not JSON or not rig reports', () => {
    const write = (): void => {
      throw new Error('must not write');
    };
    expect(saveReport('nope', '/results', write).status).toBe(400);
    expect(saveReport(JSON.stringify({ hello: 1 }), '/results', write).status).toBe(400);
  });
});
