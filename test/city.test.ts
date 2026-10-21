import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { CityRide } from '../src/sim/city';

describe('city stop-and-go', () => {
  it('cycles pull away → cruise → brake → wait with the right targets', () => {
    const p = { ...defaultParams(), speed: 12, citySpeed: 12, speedRampG: 0.2, brakeG: 0.5 };
    const c = new CityRide(3);
    c.start(0, p);
    const seen: string[] = [];
    let t = 0;
    for (; t < 120; t += 0.05) {
      if (c.update(t, p)) {
        seen.push(c.phase);
        if (c.phase === 'go' || c.phase === 'cruise') { expect(p.speed).toBe(12); expect(p.braking).toBe(false); }
        if (c.phase === 'brake' || c.phase === 'stopped') { expect(p.speed).toBe(0); expect(p.braking).toBe(true); }
      }
    }
    expect(seen.slice(0, 8)).toEqual(['go', 'cruise', 'brake', 'stopped', 'go', 'cruise', 'brake', 'stopped']);
  });

  it('times the ramps from the configured accelerations', () => {
    const p = { ...defaultParams(), speed: 12, citySpeed: 12, speedUnit: 'mph' as const, speedRampG: 0.2, brakeG: 0.5 };
    const c = new CityRide(3);
    c.start(0, p);
    const changes: [string, number][] = [];
    for (let t = 0; t < 60; t += 0.01) if (c.update(t, p)) changes.push([c.phase, t]);
    const at = (ph: string) => changes.find(([x]) => x === ph)![1];
    const v = 12 * 0.44704;
    expect(at('cruise') - at('go')).toBeCloseTo(v / (0.2 * 9.81), 1);
    expect(at('stopped') - at('brake')).toBeCloseTo(v / (0.5 * 9.81) + 0.3, 1);
    const cruise = at('brake') - at('cruise'), wait = changes.filter(([x]) => x === 'go')[1][1] - at('stopped');
    expect(cruise).toBeGreaterThanOrEqual(4); expect(cruise).toBeLessThanOrEqual(12.01);
    expect(wait).toBeGreaterThanOrEqual(2); expect(wait).toBeLessThanOrEqual(6.01);
  });
});
