import { describe, expect, it } from 'vitest';
import { pedalSurge, resistance, RIDER, riderPower } from '../src/sim/rider';

const MPH = 0.44704;
const omega = 2 * Math.PI * (80 / 60) * 2; // two strokes per crank turn at 80 rpm

describe('rider power and pedal surge', () => {
  it('estimates drag and rolling resistance', () => {
    // 12 mph: drag ½·1.2·0.4·v² ≈ 7.0 N plus rolling 0.005·85·9.81 ≈ 4.2 N.
    expect(resistance(12 * MPH)).toBeCloseTo(11.1, 0);
    expect(resistance(0)).toBe(0);
    expect(riderPower(12 * MPH, 0)).toBeCloseTo(60, -1); // ~60 W cruising
    expect(riderPower(5, -2)).toBe(0);                   // braking: no pedalling
  });

  it('surges gently when cruising and harder at speed', () => {
    const slow = pedalSurge(0.6, 10 * MPH, 10 * MPH, 0, omega).cruise;
    const fast = pedalSurge(0.6, 25 * MPH, 25 * MPH, 0, omega).cruise;
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(0.002);                    // well under 1% of speed
    // Peak surge acceleration equals the pulsed share of the push: surge · resistance / mass.
    expect(slow * 10 * MPH * omega).toBeCloseTo((0.6 * resistance(10 * MPH)) / RIDER.massKg, 6);
    expect(fast * 25 * MPH * omega).toBeGreaterThan(slow * 10 * MPH * omega * 3);
  });

  it('pulses the acceleration in proportion to the push, and not at all when braking', () => {
    const hard = pedalSurge(0.6, 0, 5, 0.3 * 9.81, omega).ramp;
    expect(hard).toBeGreaterThan(0.6);                   // drag adds to the push
    expect(hard).toBeLessThan(0.65);
    expect(pedalSurge(0.6, 0, 5, 0.02 * 9.81, omega).ramp).toBeCloseTo(0.8, 1);  // resistance is a big share
    expect(pedalSurge(0.6, 0, 5, 0.005 * 9.81, omega).ramp).toBe(0.9);          // capped so speed keeps rising
    expect(pedalSurge(0.6, 5, 0, -3, omega).ramp).toBe(0);
    expect(pedalSurge(0, 0, 5, 3, omega)).toEqual({ cruise: 0, ramp: 0 });
  });
});
