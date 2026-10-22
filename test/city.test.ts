import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { CityRide } from '../src/sim/city';
import { WheelMotion } from '../src/sim/firmware';

const MPH = 0.44704;

/** Ride stop-and-go for a while, recording each leg: the phase, its target speed and ramp (g). */
function ride(seed: number, seconds: number, p = { ...defaultParams(), speed: 12, citySpeed: 12, speedRampG: 0.2 }) {
  const c = new CityRide(seed);
  c.start(0, p);
  const legs: { phase: string; speed: number; g: number; top: number; braking: boolean }[] = [];
  let speed = NaN, g = NaN;
  for (let t = 0; t < seconds; t += 0.01) {
    const changed = c.update(t, p);
    if (changed || p.speed !== speed || c.rampG !== g) {
      legs.push({ phase: c.phase, speed: p.speed, g: c.rampG, top: p.citySpeed * c.fraction, braking: p.braking });
      speed = p.speed; g = c.rampG;
    }
  }
  return legs;
}

describe('city stop-and-go', () => {
  it('cycles pull away → cruise → brake → wait, topping out at 50–150% of the cruise speed', () => {
    const legs = ride(3, 600);
    const phases = legs.map((l) => l.phase).filter((ph, i, a) => ph !== a[i - 1]);
    expect(phases.slice(0, 8)).toEqual(['go', 'cruise', 'brake', 'stopped', 'go', 'cruise', 'brake', 'stopped']);
    const tops = legs.filter((l) => l.phase === 'go').map((l) => l.top);
    for (const top of tops) { expect(top).toBeGreaterThanOrEqual(6 - 1e-9); expect(top).toBeLessThanOrEqual(18 + 1e-9); }
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(6); // trips really differ
    expect(Math.max(...tops)).toBeGreaterThan(12);                  // some trips beat the cruise speed
    for (const l of legs) {
      if (l.phase === 'go' || l.phase === 'cruise') expect(l.braking).toBe(false);
      if (l.phase === 'stopped') { expect(l.speed).toBe(0); expect(l.braking).toBe(true); }
    }
  });

  it('pulls away hard at first, easing off as the speed builds', () => {
    const legs = ride(5, 300);
    let pulls = 0;
    for (let i = 0; i < legs.length; i++) {
      if (legs[i].phase !== 'go' || legs[i - 1]?.phase === 'go' || i + 3 > legs.length) continue;
      const go = legs.slice(i, i + 3);
      expect(go.every((l) => l.phase === 'go')).toBe(true);
      expect(go.map((l) => l.speed / l.top)).toEqual([0.4, 0.75, 1].map((x) => expect.closeTo(x, 9)));
      expect(go[0].g).toBeGreaterThan(go[1].g);
      expect(go[1].g).toBeGreaterThan(go[2].g);
      pulls++;
    }
    expect(pulls).toBeGreaterThan(5);
  });

  it('lets the speed wander along the block instead of holding it', () => {
    const legs = ride(7, 600);
    const cruise = legs.filter((l) => l.phase === 'cruise');
    for (const l of cruise) {
      expect(l.speed / l.top).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(l.speed / l.top).toBeLessThanOrEqual(1.1 + 1e-9);
      expect(l.g).toBeLessThanOrEqual(0.08 + 1e-9); // gentle changes, no lurches
    }
    const shares = cruise.map((l) => l.speed / l.top);
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThan(0.3);
    expect(shares.some((s) => s < 0.8)).toBe(true); // the odd slowdown
  });

  it('stops at the light that turned red, sharply or slowly, easing off at the end', () => {
    const p = { ...defaultParams(), speed: 12, citySpeed: 12, speedUnit: 'mph' as const, speedRampG: 0.3 };
    const c = new CityRide(9), m = new WheelMotion();
    c.start(0, p);
    const misses: number[] = [], decels: number[] = [];
    let from = 0, light = 0, hardest = 0, last = c.phase;
    for (let t = 0; t < 1500; t += 1 / 60) {
      c.update(t, p);
      if (c.phase === 'brake' && last !== 'brake') { from = m.dist(t); light = c.lightM; hardest = 0; }
      if (c.phase === 'brake') { decels.push(c.rampG); hardest = Math.max(hardest, c.rampG); }
      // A light too close to stop for even at the hardest braking (0.7 g) is overrun a little.
      if (c.phase === 'stopped' && last === 'brake' && hardest < 0.7) misses.push(m.dist(t) - from - light);
      m.configure(p.speed * MPH, 0.34, 0, 2, t, c.rampG * 9.81, 0);
      expect(c.lightM === 0 || (c.lightM >= 3 && c.lightM <= 40)).toBe(true);
      last = c.phase;
    }
    expect(misses.length).toBeGreaterThan(10);
    for (const miss of misses) expect(Math.abs(miss)).toBeLessThan(1.5); // stops within a bike length
    expect(Math.min(...decels)).toBeLessThan(0.08);  // some slow roll-downs
    expect(Math.max(...decels)).toBeGreaterThan(0.2); // some sharp stops
    expect(Math.max(...decels)).toBeLessThanOrEqual(0.7);
  });
});
