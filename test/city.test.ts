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

  it('brakes just hard enough to stop at a light 3–40 m ahead, and varies pull-aways', () => {
    const p = { ...defaultParams(), speed: 12, citySpeed: 12, speedUnit: 'mph' as const, speedRampG: 0.3 };
    const c = new CityRide(5);
    c.start(0, p);
    const v = 12 * 0.44704;
    const brakes: number[] = [], pulls: number[] = [];
    let phaseStart = 0, last = c.phase, lastG = 0;
    for (let t = 0; t < 2000; t += 0.01) {
      if (!c.update(t, p)) continue;
      if (last === 'go') expect(t - phaseStart).toBeCloseTo(v / (lastG * 9.81) + 0.5, 1);
      if (last === 'brake') expect(t - phaseStart).toBeCloseTo(v / (lastG * 9.81) + 0.3, 1);
      if (c.phase === 'go') pulls.push(c.rampG);
      if (c.phase === 'brake') {
        brakes.push(c.rampG);
        expect(c.lightM).toBeGreaterThanOrEqual(3);
        expect(c.lightM).toBeLessThanOrEqual(40);
        const expected = Math.min(0.7, Math.max(0.03, (v * v) / (2 * c.lightM) / 9.81));
        expect(c.rampG).toBeCloseTo(expected, 9);
      }
      phaseStart = t; last = c.phase; lastG = c.rampG;
    }
    expect(brakes.length).toBeGreaterThan(30);
    expect(Math.min(...brakes)).toBeLessThan(0.08);   // some slow roll-downs
    expect(Math.max(...brakes)).toBeGreaterThan(0.3); // some sharp stops
    for (const g of pulls) { expect(g).toBeGreaterThanOrEqual(0.3 * 0.7 - 1e-9); expect(g).toBeLessThanOrEqual(0.3 * 1.3 + 1e-9); }
    expect(Math.max(...pulls) - Math.min(...pulls)).toBeGreaterThan(0.1);
  });
});
