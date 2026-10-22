import { describe, expect, it } from 'vitest';
import { SmileyBody } from '../src/sim/rigid';

const G = 9.81, R = 0.28, r = 0.14;
const body = (sides: number) => { const b = new SmileyBody(r, R); b.sides = sides; return b; };
const run = (b: SmileyBody, seconds: number, ax: number, ay: number, omega = 0) => {
  for (let t = 0; t < seconds; t += 1 / 30) b.step(1 / 30, ax, ay, omega);
};

describe('bouncing smiley, round wall', () => {
  it('rests at the bottom under gravity and stays inside the rim', () => {
    const b = body(0);
    run(b, 3, 0, -G);
    expect(b.y).toBeCloseTo(-(R - r), 3);
    expect(Math.abs(b.x)).toBeLessThan(1e-3);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.05);
  });

  it('is thrown forward when braking and swings back when cruising again', () => {
    const b = body(0);
    run(b, 1, 0, -G);
    run(b, 0.6, 0.5 * G * 2, -G); // braking at 0.5 g with 2x gain pushes it forward (+x)
    const pushed = b.x;
    expect(pushed).toBeGreaterThan(0.05);
    // Then it swings back and forth across the bottom like a ball in a bowl, dying away.
    run(b, 4, 0, -G);
    let swing = 0;
    for (let t = 0; t < 2; t += 1 / 30) { b.step(1 / 30, 0, -G, 0); swing = Math.max(swing, Math.abs(b.x)); }
    expect(swing).toBeLessThan(pushed / 2);
  });

  it('bounces when dropped from the middle', () => {
    const b = body(0);
    b.y = 0;
    let wentDown = false, bounced = false;
    for (let t = 0; t < 2; t += 1 / 120) {
      b.step(1 / 120, 0, -G, 0, 4);
      if (b.vy < -0.5) wentDown = true;
      if (wentDown && b.vy > 0.3) bounced = true;
      expect(Math.hypot(b.x, b.y)).toBeLessThanOrEqual(R - r + 1e-9);
    }
    expect(bounced).toBe(true);
  });

  it('is dragged by the spinning rim: it turns clockwise and rides up the rear wall', () => {
    const b = body(0);
    run(b, 1, 0, -G);
    run(b, 2, 0, -G, 13); // riding at ~10 mph: the wheel turns clockwise
    expect(b.spin).toBeLessThan(-1);  // clockwise, like the wheel
    expect(b.x).toBeLessThan(0);      // carried back (-x) up the rear wall
  });

  it('a bouncier disc keeps more speed off the rim', () => {
    const height = (bounce: number) => {
      const b = body(0);
      b.bounce = bounce; b.y = 0;
      let top = -1, hit = false;
      for (let t = 0; t < 1.5; t += 1 / 240) {
        b.step(1 / 240, 0, -G, 0, 2);
        if (b.vy > 0) hit = true;
        if (hit) top = Math.max(top, b.y);
      }
      return top;
    };
    expect(height(0.8)).toBeGreaterThan(height(0.3));
  });
});

describe('bouncing smiley, polygon wall', () => {
  const inside = (b: SmileyBody) => {
    const inner = R * Math.cos(Math.PI / b.sides) - r;
    for (let s = 0; s < b.sides; s++) {
      const a = b.wallAngle + ((s + 0.5) * 2 * Math.PI) / b.sides;
      expect(b.x * Math.cos(a) + b.y * Math.sin(a)).toBeLessThanOrEqual(inner + 1e-9);
    }
  };

  it('settles at the bottom, on the wall, when the wheel is still', () => {
    const b = body(20);
    run(b, 3, 0, -G);
    // With 20 sides the bottom is a corner, so it rests in the V of two sides.
    expect(Math.abs(b.x)).toBeLessThan(1e-3);
    expect(b.y).toBeLessThan(-(R * Math.cos(Math.PI / 20) - r) + 1e-6);
    expect(b.y).toBeGreaterThan(-(R - r));
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.05);
    inside(b);
  });

  it('stays inside every side while the wheel turns', () => {
    for (const sides of [16, 20, 32]) {
      const b = body(sides);
      for (let t = 0; t < 3; t += 1 / 30) { b.step(1 / 30, 0, -G, 13); inside(b); }
    }
  });

  it('measures the distance to the wall for drawing it, turning with the wall', () => {
    const b = body(6);
    const inner = R * Math.cos(Math.PI / 6);
    expect(b.wallDistance(0, 0)).toBeCloseTo(-inner, 9);
    expect(b.wallDistance(0, inner)).toBeCloseTo(0, 9);      // middle of the top side
    expect(b.wallDistance(R, 0)).toBeCloseTo(0, 9);          // a corner is on the wall too
    expect(b.wallDistance(1.1 * R, 0)).toBeGreaterThan(0);   // and beyond it is outside
    b.wallAngle = Math.PI / 6;                               // turned half a side: a corner is now at the top
    expect(b.wallDistance(0, R)).toBeCloseTo(0, 9);
    expect(b.wallDistance(0, inner)).toBeLessThan(0);
  });

  it('a turning polygon knocks the disc about more than a round rim, more with fewer sides', () => {
    const motion = (sides: number) => {
      const b = body(sides);
      run(b, 1, 0, -G, 13);
      let travel = 0, px = b.x, py = b.y;
      for (let t = 0; t < 3; t += 1 / 60) {
        b.step(1 / 60, 0, -G, 13);
        travel += Math.hypot(b.x - px, b.y - py);
        px = b.x; py = b.y;
      }
      return travel;
    };
    expect(motion(20)).toBeGreaterThan(2 * motion(0));
    expect(motion(16)).toBeGreaterThan(motion(32));
  });
});
