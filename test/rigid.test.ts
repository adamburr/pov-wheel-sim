import { describe, expect, it } from 'vitest';
import { SmileyBody } from '../src/sim/rigid';

const G = 9.81, R = 0.28, r = 0.21;
const body = () => new SmileyBody(r, R);
const run = (b: SmileyBody, seconds: number, ax: number, ay: number, omega = 0) => {
  for (let t = 0; t < seconds; t += 1 / 30) b.step(1 / 30, ax, ay, omega);
};

describe('bouncing smiley', () => {
  it('rests upright at the bottom under gravity and stays inside the rim', () => {
    const b = body();
    run(b, 3, 0, -G);
    const c = b.centre();
    expect(c.y).toBeCloseTo(-(R - r), 3);
    expect(Math.abs(c.x)).toBeLessThan(1e-3);
    expect(Math.cos(b.angle)).toBeGreaterThan(0.999); // mouth down
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.05);
  });

  it('is thrown forward when braking and swings back when cruising again', () => {
    const b = body();
    run(b, 1, 0, -G);
    run(b, 0.6, 0.5 * G * 2, -G); // braking at 0.5 g with 2x gain pushes it forward (+x)
    const pushed = b.centre().x;
    expect(pushed).toBeGreaterThan(0.02);
    run(b, 4, 0, -G);
    let swing = 0;
    for (let t = 0; t < 2; t += 1 / 30) { b.step(1 / 30, 0, -G, 0); swing = Math.max(swing, Math.abs(b.centre().x)); }
    expect(swing).toBeLessThan(pushed / 2);
  });

  it('bounces when dropped from the middle', () => {
    const b = body();
    b.place(0, 0);
    let wentDown = false, bounced = false;
    for (let t = 0; t < 2; t += 1 / 120) {
      b.step(1 / 120, 0, -G, 0, 4);
      if (b.vy < -0.3) wentDown = true;
      if (wentDown && b.vy > 0.2) bounced = true;
      const c = b.centre();
      expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(R - r + 1e-9);
    }
    expect(bounced).toBe(true);
  });

  it('rights itself like a weeble: its centre of mass is near the mouth', () => {
    const b = body();
    b.grip = 0.1; // light grip lets it slide round; with more it has to roll, which is slower
    b.place(0, -(R - r), Math.PI - 0.2); // nearly upside down
    run(b, 5, 0, -G);
    expect(Math.cos(b.angle)).toBeGreaterThan(0.9);
  });

  it('with light grip, the spinning rim tilts it clockwise up the rear wall and its weight holds it', () => {
    const b = body();
    b.grip = 0.3;
    run(b, 1, 0, -G);
    run(b, 2, 0, -G, 13); // riding at ~10 mph: the wheel turns clockwise
    expect(b.centre().x).toBeLessThan(0);      // carried back (-x) up the rear wall
    expect(Math.sin(b.angle)).toBeLessThan(0); // turned clockwise, like the wheel
    expect(Math.abs(b.spin)).toBeLessThan(0.5); // held, not tumbling
  });

  it('with more grip, the spinning rim flips it over and over', () => {
    const b = body();
    b.grip = 0.5;
    run(b, 1, 0, -G);
    let turned = 0, last = b.angle;
    for (let t = 0; t < 4; t += 1 / 60) { b.step(1 / 60, 0, -G, 13); turned += Math.abs(b.angle - last); last = b.angle; }
    expect(turned).toBeGreaterThan(4 * Math.PI); // at least two full turns in 4 s
  });

  it('a bouncier disc keeps more speed off the rim', () => {
    const height = (bounce: number) => {
      const b = body();
      b.bounce = bounce; b.place(0, 0);
      let top = -1, hit = false;
      for (let t = 0; t < 1.5; t += 1 / 240) {
        b.step(1 / 240, 0, -G, 0, 2);
        if (b.vy > 0) hit = true;
        if (hit) top = Math.max(top, b.centre().y);
      }
      return top;
    };
    expect(height(0.9)).toBeGreaterThan(height(0.3));
  });

  it('measures the distance to the round wall, for drawing it', () => {
    const b = body();
    expect(b.wallDistance(0, 0)).toBeCloseTo(-R, 9);
    expect(b.wallDistance(R, 0)).toBeCloseTo(0, 9);
    expect(b.wallDistance(0, -1.1 * R)).toBeGreaterThan(0);
  });
});
