import { describe, expect, it } from 'vitest';
import { CHIP } from '../src/params';
import { RibbonDryer } from '../src/sim/ribbons';

const G = 9.81, R = 0.28, HZ = 30;
const run = (d: RibbonDryer, seconds: number, ax: number, ay: number, omega = 0) => {
  for (let t = 0; t < seconds; t += 1 / HZ) d.step(1 / HZ, ax, ay, omega);
};
const points = (d: RibbonDryer) => Array.from({ length: d.pos.length / 2 }, (_, i) => [d.pos[i * 2], d.pos[i * 2 + 1]]);
const meanY = (d: RibbonDryer) => points(d).reduce((a, [, y]) => a + y, 0) / (d.pos.length / 2);

describe('tumble dryer ribbons', () => {
  it('settle at the bottom of a still drum and stay inside it', () => {
    const d = new RibbonDryer(R);
    run(d, 4, 0, -G);
    expect(meanY(d)).toBeLessThan(-0.5 * R);
    for (const [x, y] of points(d)) expect(Math.hypot(x, y)).toBeLessThanOrEqual(R - d.halfWidth + 0.001); // within 1 mm
  });

  it('never stretch or shrink: every segment keeps its length', () => {
    for (const omega of [13 * 0.25, 13]) {
      const d = new RibbonDryer(R);
      for (let t = 0; t < 5; t += 1 / HZ) {
        d.step(1 / HZ, t > 3 && t < 3.5 ? G : 0, -G, omega);
        for (let r = 0; r < d.count; r++) {
          for (let k = 0; k < d.points - 1; k++) {
            const a = (r * d.points + k) * 2;
            const len = Math.hypot(d.pos[a + 2] - d.pos[a], d.pos[a + 3] - d.pos[a + 1]);
            expect(Math.abs(len - d.segment[r]) / d.segment[r]).toBeLessThan(1e-4);
          }
        }
      }
    }
  });

  it('are lifted by the paddles when the drum turns', () => {
    const still = new RibbonDryer(R), turning = new RibbonDryer(R);
    run(still, 2, 0, -G);
    run(turning, 2, 0, -G, 13 * 0.25);
    let a = 0, b = 0;
    for (let t = 0; t < 6; t += 1 / HZ) {
      still.step(1 / HZ, 0, -G, 0); turning.step(1 / HZ, 0, -G, 13 * 0.25);
      a += meanY(still); b += meanY(turning);
    }
    expect(b).toBeGreaterThan(a + 0.03 * R * 6 * HZ); // higher on average by at least 3% of R
  });

  it('are pinned to the rim when the drum turns at the wheel\'s full speed (a spin cycle)', () => {
    const d = new RibbonDryer(R);
    run(d, 4, 0, -G, 13);
    const meanRadius = points(d).reduce((acc, [x, y]) => acc + Math.hypot(x, y), 0) / (d.pos.length / 2);
    expect(meanRadius).toBeGreaterThan(0.85 * (R - d.halfWidth));
  });

  it('are thrown forward when braking', () => {
    const d = new RibbonDryer(R);
    run(d, 2, 0, -G);
    const before = points(d).reduce((a, [x]) => a + x, 0);
    run(d, 0.5, 0.5 * G * 2, -G);
    expect(points(d).reduce((a, [x]) => a + x, 0)).toBeGreaterThan(before);
  });

  it('swap depth layers now and then, or never with no shuffle', () => {
    const d = new RibbonDryer(R);
    d.shuffle = 2;
    const start = d.order.join();
    run(d, 5, 0, -G);
    expect(d.order.join()).not.toBe(start);
    expect([...d.order].sort().join()).toBe(start); // still every ribbon once
    const fixed = new RibbonDryer(R);
    fixed.shuffle = 0;
    run(fixed, 5, 0, -G);
    expect(fixed.order.join()).toBe(start);
  });

  it('are cheap: under 3% of one RP2350 core at 30 Hz', () => {
    const mflops = (new RibbonDryer(R).flopsPerStep() * HZ) / 1e6;
    expect((100 * mflops) / CHIP.mflops).toBeLessThan(3);
  });
});
