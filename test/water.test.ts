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

describe('water character', () => {
  const settle = (o: object = {}) => {
    const w = new WaterSim({ grid: 24, fill: 0.4, cellM: 0.281 / 11, seed: 3, ...o });
    for (let k = 0; k < 45; k++) w.step(1 / 30, 0, -9.81);
    return w;
  };

  it('is dragged back and up the rear wall by the spinning rim', () => {
    const still = settle({ rimFriction: 0 }), dragged = settle({ rimFriction: 0.05 });
    const [x0, y0] = com(still);
    for (let k = 0; k < 150; k++) { still.step(1 / 30, 0, -9.81, 4); dragged.step(1 / 30, 0, -9.81, 4); }
    const [xs, ys] = com(still), [xd, yd] = com(dragged);
    expect(Math.abs(xs - x0)).toBeLessThan(0.5);       // frictionless rim: nothing happens
    expect(Math.abs(ys - y0)).toBeLessThan(0.5);
    expect(xd).toBeLessThan(x0 - 1);                    // clockwise rim drags it backward (−x)
    expect(yd).toBeGreaterThan(y0 + 0.5);               // and up the rear wall
  });

  it('damps sloshing faster when thick', () => {
    const swing = (o: object) => {
      const w = settle(o);
      for (let k = 0; k < 9; k++) w.step(1 / 30, 6, -9.81);
      let late = 0;
      for (let k = 0; k < 120; k++) { w.step(1 / 30, 0, -9.81); if (k >= 60) late = Math.max(late, Math.abs(com(w)[0])); }
      return late;
    };
    expect(swing({ flip: 0.7, viscosity: 0.4 })).toBeLessThan(swing({ flip: 0.97, viscosity: 0 }) * 0.6);
  });

  it('accounts for every particle in the finer render map', () => {
    const w = settle();
    const sum = (a: Float32Array) => a.reduce((s, x) => s + x, 0);
    expect(sum(w.renderDensity)).toBeCloseTo(4 * sum(w.cellDensity), 0);
    expect(w.renderN).toBe(2 * w.n);
  });
});
