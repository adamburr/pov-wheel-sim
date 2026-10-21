import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { CityRide } from '../src/sim/city';

const MPH = 0.44704;

describe('city stop-and-go', () => {
  it('cycles pull away → cruise → brake → wait, topping out at 50–150% of the cruise speed', () => {
    const p = { ...defaultParams(), speed: 12, citySpeed: 12, speedRampG: 0.2, brakeG: 0.5 };
    const c = new CityRide(3);
    c.start(0, p);
    const seen: string[] = [], tops: number[] = [];
    let trip = 0;
    for (let t = 0; t < 400; t += 0.05) {
      if (!c.update(t, p)) continue;
      seen.push(c.phase);
      if (c.phase === 'go') {
        trip = p.speed;
        tops.push(trip);
        expect(trip).toBeGreaterThanOrEqual(6 - 1e-9);
        expect(trip).toBeLessThanOrEqual(18 + 1e-9);
        expect(p.braking).toBe(false);
      }
      if (c.phase === 'cruise') expect(p.speed).toBe(trip); // same target for the whole trip
      if (c.phase === 'brake' || c.phase === 'stopped') { expect(p.speed).toBe(0); expect(p.braking).toBe(true); }
    }
    expect(seen.slice(0, 8)).toEqual(['go', 'cruise', 'brake', 'stopped', 'go', 'cruise', 'brake', 'stopped']);
    expect(tops.length).toBeGreaterThan(10);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(6); // trips really differ
    expect(Math.max(...tops)).toBeGreaterThan(12);                  // some trips beat the cruise speed
  });

  it('times pull-aways and stops from each trip’s own top speed', () => {
    const p = { ...defaultParams(), speed: 12, citySpeed: 12, speedUnit: 'mph' as const, speedRampG: 0.3 };
    const c = new CityRide(5);
    c.start(0, p);
    const brakes: number[] = [], pulls: number[] = [];
    let phaseStart = 0, last = c.phase, lastG = 0, v = 0;
    for (let t = 0; t < 2000; t += 0.01) {
      const before = p.speed;
      if (!c.update(t, p)) continue;
      if (last === 'go') expect(t - phaseStart).toBeCloseTo(v / (lastG * 9.81) + 0.5, 1);
      if (last === 'brake') expect(t - phaseStart).toBeCloseTo(v / (lastG * 9.81) + 0.3, 1);
      if (c.phase === 'go') { v = p.speed * MPH; pulls.push(c.rampG); }
      if (c.phase === 'brake') {
        v = before * MPH; // braking from this trip's top speed
        brakes.push(c.rampG);
        expect(c.lightM).toBeGreaterThanOrEqual(3);
        expect(c.lightM).toBeLessThanOrEqual(40);
        expect(c.rampG).toBeCloseTo(Math.min(0.7, Math.max(0.03, (v * v) / (2 * c.lightM) / 9.81)), 9);
      }
      phaseStart = t; last = c.phase; lastG = c.rampG;
    }
    expect(brakes.length).toBeGreaterThan(30);
    expect(Math.min(...brakes)).toBeLessThan(0.08);   // some slow roll-downs
    expect(Math.max(...brakes)).toBeGreaterThan(0.2); // some sharp stops
    for (const g of pulls) { expect(g).toBeGreaterThanOrEqual(0.3 * 0.7 - 1e-9); expect(g).toBeLessThanOrEqual(0.3 * 1.3 + 1e-9); }
    expect(Math.max(...pulls) - Math.min(...pulls)).toBeGreaterThan(0.1);
  });
});
