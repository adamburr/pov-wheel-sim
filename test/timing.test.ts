import { describe, expect, it } from 'vitest';
import { defaultParams, MPH } from '../src/params';
import { clockedFrameBits, derive, squareIntegral } from '../src/sim/timing';
import { buildSlices, hallSegments, magnetAccel, magnetOmega, WheelMotion } from '../src/sim/firmware';
import { bannerBitmap, bannerTileM, polarize, renderWater, stackFrames, waterLut } from '../src/image/polarize';

describe('LED bus timing', () => {
  it('matches the Adafruit guide: 36 LEDs per lane at ~4 MHz is ~300 µs per column', () => {
    expect(clockedFrameBits(36)).toBe(1216);
    // The guide wires each back strip in parallel with its front strip (shared data).
    const p = { ...defaultParams(), backData: 'same' as const, autoLength: false, stripLengthMm: 250, clockMHz: 4, lanes: 3, overheadUs: 0 };
    const d = derive(p);
    expect(d.ledsPerStrip).toBe(36);
    expect(d.ledsPerLane).toBe(36);
    expect(d.transferS * 1e6).toBeCloseTo(304, 0);
  });

  it('chains strips when there are fewer lanes than strips', () => {
    const p = { ...defaultParams(), backData: 'same' as const, autoLength: false, stripLengthMm: 250, lanes: 1 };
    expect(derive(p).ledsPerLane).toBe(3 * 36);
  });

  it('sends each side its own data by default, doubling the chain', () => {
    const p = { ...defaultParams(), autoLength: false, stripLengthMm: 250, lanes: 3 };
    expect(p.backData).toBe('independent');
    expect(derive(p).stripUnits).toBe(6);
    expect(derive(p).ledsPerLane).toBe(2 * 36);
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

describe('banner mode dead reckoning', () => {
  const d = derive(defaultParams());
  const motion = new WheelMotion();
  motion.configure(10 * MPH, d.tireRadius, 0, 1, 0);
  const banner = { ...defaultParams(), displayMode: 'banner' as const };

  it('has no position error with an instant sensor at constant speed', () => {
    const q = { ...banner, hallPollMs: 0 };
    for (const s of buildSlices(q, d, motion, 10, 10.5, Math.PI, 2)) {
      expect(Math.abs(s.delta0)).toBeLessThan(1e-6);
      expect(Math.abs(s.deltaRate)).toBeLessThan(1e-6);
      expect(s.hubWorld0).toBeGreaterThanOrEqual(0);
      expect(s.hubWorld0).toBeLessThan(2);
    }
  });

  it('lags behind the true angle by up to one poll interval', () => {
    const q = { ...banner, hallPollMs: 4 };
    const w = (10 * MPH) / d.tireRadius;
    for (const s of buildSlices(q, d, motion, 10, 10.5, Math.PI, 2)) {
      expect(s.delta0).toBeLessThanOrEqual(1e-9);
      expect(s.delta0).toBeGreaterThanOrEqual(-w * 0.004 - 1e-9);
    }
  });

  it('pins the banner to the road in chase view', () => {
    const slices = buildSlices(banner, d, motion, 10, 10.5, Math.PI, 2);
    const a = slices[0], b = slices[1];
    const travelled = d.tireRadius * a.omega * (b.t0 - a.t0);
    expect((b.hubWorld0 - a.hubWorld0 - travelled + 4) % 2).toBeCloseTo(0, 6);
  });
});

describe('banner bitmap', () => {
  it('stores about one pixel per LED pitch, as tall as the LED reach', () => {
    const p = defaultParams();
    const d = derive(p);
    const img = { width: 400, height: 100, data: new Uint8ClampedArray(400 * 100 * 4).fill(255) };
    const b = bannerBitmap(img, p, d);
    expect(b.height).toBe(Math.round((2 * d.rEnd) / d.pitch));
    expect(b.width).toBe(Math.round(b.height * 4));
    expect(b.meanDuty).toBeCloseTo(1, 6);
    expect(bannerTileM(b, 0.5)).toBeCloseTo(b.width * b.pixelM + 0.5, 9);
  });
});

describe('animation frame selection', () => {
  const d = derive(defaultParams());
  const motion = new WheelMotion();
  motion.configure(10 * MPH, d.tireRadius, 0, 1, 0);

  it('advances timed frames at animFps', () => {
    const p = { ...defaultParams(), frameAdvance: 'timed' as const, animFps: 12 };
    for (const s of buildSlices(p, d, motion, 10, 10.5, Math.PI, 0, 8)) {
      expect(s.frame0).toBeCloseTo(((s.t0 * 12) % 8 + 8) % 8, 9);
    }
  });

  it('steps revolution-synced frames once per magnet detection', () => {
    const p = { ...defaultParams(), frameAdvance: 'revolution' as const, revsPerFrame: 1, hallPollMs: 0 };
    const slices = buildSlices(p, d, motion, 10, 12, Math.PI * 2, 0, 5).filter((s) => s.enabled);
    const distinct = [...new Set(slices.map((s) => s.frame0))];
    const revs = motion.passes(10, 12).length;
    expect(distinct.length).toBe(Math.min(5, revs + 1));
    for (const s of slices) expect(Number.isInteger(s.frame0)).toBe(true);
  });

  it('holds frames for revsPerFrame turns', () => {
    const p = { ...defaultParams(), frameAdvance: 'revolution' as const, revsPerFrame: 4, hallPollMs: 0 };
    const slices = buildSlices(p, d, motion, 10, 11, Math.PI * 2, 0, 50).filter((s) => s.enabled);
    const distinct = new Set(slices.map((s) => s.frame0));
    expect(distinct.size).toBeLessThanOrEqual(2);
  });

  // Frames over [10, 14] s: they only ever step forward by one, and step about turns/revsPerFrame times.
  const steps = (revsPerFrame: number) => {
    const p = { ...defaultParams(), frameAdvance: 'revolution' as const, revsPerFrame, hallPollMs: 0 };
    const f = buildSlices(p, d, motion, 10, 14, Math.PI * 2, 0, 1000).filter((s) => s.enabled).map((s) => s.frame0);
    for (let i = 1; i < f.length; i++) expect([0, 1]).toContain(f[i] - f[i - 1]);
    return f[f.length - 1] - f[0];
  };

  it('steps fractional revsPerFrame partway round', () => {
    const turns = motion.passes(10, 14).length;
    expect(Math.abs(steps(1.5) - turns / 1.5)).toBeLessThanOrEqual(1);
  });

  it('steps several frames per turn below one turn per frame', () => {
    const turns = motion.passes(10, 14).length;
    expect(Math.abs(steps(0.25) - turns * 4)).toBeLessThanOrEqual(4);
  });

  it('changes frames between columns, not mid-column', () => {
    const p = { ...defaultParams(), frameAdvance: 'revolution' as const, revsPerFrame: 0.25, hallPollMs: 0 };
    const slices = buildSlices(p, d, motion, 10, 12, Math.PI * 2, 0, 1000);
    for (let i = 1; i < slices.length; i++) {
      const s = slices[i];
      if (!s.enabled || s.frame0 === slices[i - 1].frame0 || s.P < 0) continue;
      const cols = (s.t0 - s.m) / s.P;
      expect(Math.abs(cols - Math.round(cols))).toBeLessThan(1e-3);
    }
  });
});

describe('frame stacking', () => {
  it('stacks layers in order and averages duty', () => {
    const a = { data: new Uint8Array([1, 2, 3, 4]), meanDuty: 0.2 };
    const b = { data: new Uint8Array([5, 6, 7, 8]), meanDuty: 0.4 };
    const s = stackFrames([a, b], 1, 1);
    expect([...s.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.frames).toBe(2);
    expect(s.meanDuty).toBeCloseTo(0.3, 9);
  });
});

describe('animation playback rate', () => {
  const d = derive(defaultParams());
  const motion = new WheelMotion();
  motion.configure(10 * MPH, d.tireRadius, 0, 1, 0);

  it('scales timed playback', () => {
    const p = { ...defaultParams(), frameAdvance: 'timed' as const, animFps: 12, playbackRate: 0.5 };
    for (const s of buildSlices(p, d, motion, 10, 10.5, Math.PI, 0, 8)) {
      expect(s.frame0).toBeCloseTo(((s.t0 * 6) % 8 + 8) % 8, 9);
    }
  });

  it('steps several frames per revolution when synced and sped up', () => {
    const base = { ...defaultParams(), frameAdvance: 'revolution' as const, revsPerFrame: 1, hallPollMs: 0 };
    const at = (rate: number) => buildSlices({ ...base, playbackRate: rate }, d, motion, 10, 12, Math.PI * 2, 0, 1000)
      .filter((s) => s.enabled).map((s) => s.frame0);
    const one = at(1), two = at(2);
    expect(two.length).toBe(one.length);
    two.forEach((f, i) => expect(f).toBe((one[i] * 2) % 1000));
  });
});

describe('speed ramps', () => {
  const R = 0.339;
  it('ramps speed linearly and keeps distance and angle continuous', () => {
    const m = new WheelMotion();
    m.configure(4.47, R, 0, 1, 0);
    const before = m.dist(10), phiBefore = m.phi(10);
    m.configure(0, R, 0, 1, 10, 4.9); // brake at 0.5 g
    expect(m.dist(10)).toBeCloseTo(before, 9);
    expect(m.phi(10)).toBeCloseTo(phiBefore, 9);
    expect(m.speed(10.5)).toBeCloseTo(4.47 - 4.9 * 0.5, 9);
    expect(m.accel(10.5)).toBeCloseTo(-4.9, 9);
    expect(m.speed(12)).toBe(0);
    let last = -Infinity;
    for (let t = 9; t < 13; t += 0.01) { const ph = m.phi(t); expect(ph).toBeGreaterThanOrEqual(last - 1e-12); last = ph; }
    expect(m.passes(13, 15)).toEqual([]);
    expect(m.passes(9, 10.5).length).toBeGreaterThan(0);
  });
});

describe('pedal surge while speeding up', () => {
  it('pulses the acceleration but keeps speed rising to the target', () => {
    const m = new WheelMotion();
    const R = 0.339, f = (80 / 60) * 2, acc = 0.3 * 9.81, k = 0.6;
    m.configure(0, R, 0, f, 0);
    m.configure(5.4, R, 0, f, 10, acc, k);
    let lastV = 0, minA = Infinity, maxA = -Infinity, tEnd = 0;
    for (let t = 10; t < 14; t += 0.001) {
      const v = m.speed(t);
      expect(v).toBeGreaterThanOrEqual(lastV - 1e-9);
      lastV = v;
      if (v < 5.4 - 1e-6) { minA = Math.min(minA, m.accel(t)); maxA = Math.max(maxA, m.accel(t)); tEnd = t; }
    }
    expect(m.speed(14)).toBeCloseTo(5.4, 9);
    expect(minA).toBeCloseTo(acc * (1 - k), 1);
    expect(maxA).toBeCloseTo(acc * (1 + k), 1);
    expect(tEnd - 10).toBeCloseTo(5.4 / acc, 0); // pulses average out
    // Distance stays continuous across the end of the ramp.
    expect(m.dist(tEnd + 0.002) - m.dist(tEnd)).toBeCloseTo(5.4 * 0.002, 3);
  });

  it('does not pulse when braking', () => {
    const m = new WheelMotion();
    m.configure(5.4, 0.339, 0, 2.67, 0);
    m.configure(0, 0.339, 0, 2.67, 10, 2, 0.6);
    for (let t = 10; t < 12.6; t += 0.05) expect(m.accel(t)).toBeCloseTo(-2, 9);
  });
});

describe('magnet acceleration estimate', () => {
  it('converges on the braking rate about a revolution late', () => {
    const p = { ...defaultParams(), hallPollMs: 0, debounceMs: 20 };
    const m = new WheelMotion();
    m.configure(8.94, 0.339, 0, 1, 0);           // 20 mph
    m.configure(0, 0.339, 0, 1, 10, 0.5 * 9.81); // brake at 0.5 g from t = 10
    expect(magnetAccel(p, m, 9.9)).toBeCloseTo(0, 6);
    const passes = m.passes(10, 11.5);
    expect(magnetAccel(p, m, passes[0] + 1e-6)).toBeGreaterThan(-1);    // still mostly pre-brake
    expect(magnetAccel(p, m, passes[2] + 1e-6)).toBeCloseTo(-4.9, 0);  // two revolutions in
  });
  it('reads the true acceleration in ideal mode and nothing when free-running', () => {
    const m = new WheelMotion();
    m.configure(8.94, 0.339, 0, 1, 0);
    m.configure(0, 0.339, 0, 1, 10, 4.9);
    expect(magnetAccel({ ...defaultParams(), syncMode: 'ideal' }, m, 10.2)).toBeCloseTo(-4.9, 9);
    expect(magnetAccel({ ...defaultParams(), syncMode: 'free' }, m, 10.2)).toBe(0);
  });
});

describe('water frames and lookup table', () => {
  it('selects the simulation step current at each time', () => {
    const p = defaultParams();
    const d = derive(p);
    const m = new WheelMotion();
    m.configure(10 * MPH, d.tireRadius, 0, 1, 0);
    const spec = { frames: 64, fps: 30, timed: true, revsPerFrame: 1, rate: 1, live: true };
    for (const s of buildSlices(p, d, m, 100, 100.5, Math.PI, 0, spec)) {
      expect(Math.floor(s.frame0)).toBe(Math.floor(s.t0 * 30) % 64);
    }
  });

  it('maps the bottom of the wheel to the bottom of the grid', () => {
    const p = { ...defaultParams(), columnsPerRev: 360 };
    const d = derive(p);
    const grid = 24;
    const lut = waterLut(p, d, grid);
    // Column c is centred at clockwise angle (c + 0.5)°: 90° clockwise from +x points straight down.
    const outer = d.ledsPerStrip - 1;
    const down = lut[outer * 360 + 89], up = lut[outer * 360 + 269];
    expect(Math.floor(down / grid)).toBeLessThan(2);
    expect(Math.floor(up / grid)).toBeGreaterThan(grid - 3);
    expect([...lut].every((c) => c >= 0)).toBe(true);
  });
});

describe('non-drive side', () => {
  const p = defaultParams();
  const d = derive(p);
  const front = (row: number, C: number, data: ArrayLike<number>, c: number) => data[(row * C + c) * 4];

  it('mirrors pictures for the back strips so they read correctly from that side', () => {
    // Left half bright, right half dark: mirrored, the back strips see the opposite halves.
    const w = 64, h = 64, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; px[o] = x < w / 2 ? 255 : 0; px[o + 3] = 255; }
    const buf = polarize({ width: w, height: h, data: px }, p, d);
    const C = buf.columns, outer = d.ledsPerStrip - 1, backRow = p.stripCount * d.ledsPerStrip + outer;
    let differ = 0;
    for (let c = 0; c < C; c++) if (front(outer, C, buf.data, c) !== front(backRow, C, buf.data, c)) differ++;
    expect(differ).toBeGreaterThan(C * 0.8);
  });

  it('shows the same physical water on both sides', () => {
    const C = p.columnsPerRev, lut = waterLut(p, d, 24), half = p.stripCount * d.ledsPerStrip;
    for (let row = 0; row < half; row++) for (let c = 0; c < C; c++) {
      expect(lut[(half + row) * C + c]).toBe(lut[row * C + c]);
    }
  });
});

describe('water rendering and spin estimate', () => {
  it('draws spray white and the body of water deep blue', () => {
    const p = defaultParams(), d = derive(p);
    const maps = {
      renderDensity: new Float32Array([0.8, 1.0, 0]),
      renderBulk: new Float32Array([0.1, 1.0, 0]),
      renderSpeed: new Float32Array([2, 0, 0]),
    };
    const out = new Uint8Array(3 * 4);
    renderWater(maps, new Int32Array([0, 1, 2]), p, d, out);
    const [sr, sg, sb] = out.slice(0, 3), [br, bg, bb] = out.slice(4, 7), [ar, ag, ab] = out.slice(8, 11);
    expect(Math.min(sr, sg, sb)).toBeGreaterThan(150);  // spray: bright white
    expect(bb).toBeGreaterThan(200); expect(br).toBeLessThan(10); // bulk: deep blue
    expect(ar + ag + ab).toBe(0);                        // air: dark
    expect(sg).toBeGreaterThan(bg);
  });

  it('estimates spin from the magnet, and nothing once stopped', () => {
    const p = { ...defaultParams(), hallPollMs: 0 };
    const m = new WheelMotion();
    m.configure(10 * MPH, 0.339, 0, 1, 0);
    expect(magnetOmega(p, m, 20)).toBeCloseTo((10 * MPH) / 0.339, 3);
    m.configure(0, 0.339, 0, 1, 30, 4);
    expect(magnetOmega(p, m, 40)).toBe(0);
    expect(magnetOmega({ ...p, syncMode: 'free' }, m, 20)).toBe(0);
  });
});
