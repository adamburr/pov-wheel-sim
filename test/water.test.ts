import { describe, expect, it } from 'vitest';
import { WaterSim } from '../src/sim/water';

const make = (fill = 0.4) => new WaterSim({ grid: 24, fill, cellM: 0.56 / 24, seed: 3 });

/** Centre of mass relative to the disc centre, in cells. */
function com(w: WaterSim): [number, number] {
  let x = 0, y = 0;
  for (let k = 0; k < w.count; k++) { x += w.px[k]; y += w.py[k]; }
  return [x / w.count - w.n / 2, y / w.count - w.n / 2];
}

describe('water simulation', () => {
  it('fills about the requested fraction of the disc', () => {
    const w = make(0.4);
    const expected = 0.4 * Math.PI * (w.radius - 0.3) ** 2 * 4; // ~4 particles per cell
    expect(w.count).toBeGreaterThan(expected * 0.8);
    expect(w.count).toBeLessThan(expected * 1.2);
  });

  it('keeps every particle inside the disc and pools at the bottom', () => {
    const w = make();
    for (let s = 0; s < 90; s++) w.step(1 / 30, 0, -9.81);
    for (let k = 0; k < w.count; k++) {
      expect(Math.hypot(w.px[k] - w.n / 2, w.py[k] - w.n / 2)).toBeLessThanOrEqual(w.radius + 1e-4);
    }
    const [x, y] = com(w);
    expect(y).toBeLessThan(-w.radius * 0.4);
    expect(Math.abs(x)).toBeLessThan(1);
  });

  it('settles along the effective gravity when braking', () => {
    const w = make();
    const a = 4.9; // 0.5 g of braking pushes the water forward (+x)
    for (let s = 0; s < 60; s++) w.step(1 / 30, 0, -9.81);
    let sx = 0, sy = 0;
    for (let s = 0; s < 150; s++) {
      w.step(1 / 30, a, -9.81);
      if (s >= 90) { const [x, y] = com(w); sx += x; sy += y; }
    }
    expect(sx).toBeGreaterThan(0);
    const tilt = Math.atan2(sx, -sy) * 180 / Math.PI;
    expect(tilt).toBeGreaterThan(26.6 - 10);
    expect(tilt).toBeLessThan(26.6 + 10);
  });

  it('reports density and speed per cell for rendering', () => {
    const w = make();
    w.step(1 / 30, 0, -9.81);
    const bottom = (2) * w.n + w.n / 2, top = (w.n - 3) * w.n + w.n / 2;
    expect(w.cellDensity[bottom]).toBeGreaterThan(0.5);
    expect(w.cellDensity[top]).toBe(0);
    expect(w.flopsPerStep()).toBeGreaterThan(1e5);
  });
});
