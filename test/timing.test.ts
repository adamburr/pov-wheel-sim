import { describe, expect, it } from 'vitest';
import { defaultParams, MPH } from '../src/params';
import { clockedFrameBits, derive, squareIntegral } from '../src/sim/timing';
import { buildSlices, hallSegments, WheelMotion } from '../src/sim/firmware';

describe('LED bus timing', () => {
  it('matches the Adafruit guide: 36 LEDs per lane at ~4 MHz is ~300 µs per column', () => {
    expect(clockedFrameBits(36)).toBe(1216);
    const p = { ...defaultParams(), autoLength: false, stripLengthMm: 250, clockMHz: 4, lanes: 3, overheadUs: 0 };
    const d = derive(p);
    expect(d.ledsPerStrip).toBe(36);
    expect(d.ledsPerLane).toBe(36);
    expect(d.transferS * 1e6).toBeCloseTo(304, 0);
  });

  it('chains strips when there are fewer lanes than strips', () => {
    const p = { ...defaultParams(), autoLength: false, stripLengthMm: 250, lanes: 1 };
    expect(derive(p).ledsPerLane).toBe(3 * 36);
  });

  it('puts the 400 lines/s floor at ~167 rpm for 144 columns', () => {
    expect((400 / 144) * 60).toBeCloseTo(166.7, 1);
  });

  it('computes 700c rolling speed at 10 mph', () => {
    const d = derive(defaultParams());
    expect(d.circumference).toBeCloseTo(2.13, 2);
    expect(d.revPerSec).toBeCloseTo((10 * MPH) / d.circumference, 6);
  });
});

describe('square-wave integral', () => {
  it('integrates whole periods to duty × length', () => {
    expect(squareIntegral(0, 1, 0.25, 0.01, 0)).toBeCloseTo(0.25, 9);
  });
  it('handles partial periods and phase', () => {
    expect(squareIntegral(0, 0.005, 0.5, 0.01, 0)).toBeCloseTo(0.005, 9);
    expect(squareIntegral(0, 0.005, 0.5, 0.01, 0.005)).toBeCloseTo(0, 9);
    expect(squareIntegral(0.0025, 0.0075, 0.5, 0.01, 0)).toBeCloseTo(0.0025, 9);
  });
  it('treats duty 0 and 1 as off and on', () => {
    expect(squareIntegral(0, 0.3, 0, 0.01, 0.2)).toBe(0);
    expect(squareIntegral(0, 0.3, 1, 0.01, 0.2)).toBeCloseTo(0.3, 9);
  });
});

describe('firmware model', () => {
  const p = defaultParams();
  const d = derive(p);
  const motion = new WheelMotion();
  motion.configure(10 * MPH, d.tireRadius, 0, 1, 0);
  const T = d.circumference / (10 * MPH);

  it('finds one magnet pass per revolution', () => {
    expect(motion.passes(10, 10 + 10 * T).length).toBeGreaterThanOrEqual(10);
  });

  it('sets the hall column period from the last revolution', () => {
    const segs = hallSegments(p, d, motion, 10, 10.5);
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      expect(s.enabled).toBe(true);
      expect(s.P).toBeCloseTo(T / p.columnsPerRev, 6);
    }
  });

  it('applies the Adafruit lines/s floor at low speed', () => {
    const q = { ...p, minLinesPerSec: 400, columnsPerRev: 144 };
    for (const s of hallSegments(q, d, motion, 10, 10.5)) expect(s.P).toBeCloseTo(1 / 400, 9);
  });

  it('slices the exposure with continuous angle', () => {
    const slices = buildSlices(p, d, motion, 10, 10.25, Math.PI);
    expect(slices[0].t0).toBe(10);
    expect(slices[slices.length - 1].t1).toBe(10.25);
    for (let i = 1; i < slices.length; i++) expect(slices[i].t0).toBeCloseTo(slices[i - 1].t1, 12);
    for (const s of slices) expect(s.omega).toBeCloseTo((2 * Math.PI) / T, 6);
  });
});
