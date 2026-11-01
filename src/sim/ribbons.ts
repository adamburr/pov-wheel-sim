// Ribbons tumbling in a dryer drum: the firmware's third physics look, stepped like the water and
// the bouncing smiley from what the magnet tells it. No DOM here, so it can be tested.
//
// Frame: upright and centred on the hub, x forward, y up, metres. The drum is the circle the LEDs
// reach, with three paddles (fins) on its wall; it turns clockwise like the wheel, at whatever
// spin it is given. Each ribbon is a chain of points (Verlet integration with fixed segment
// lengths). Ribbons don't collide with each other; they're drawn layered in depth, and now and
// then two neighbouring layers swap, as the load shifts front to back in a real drum.

const POINTS = 12;          // points per ribbon
const SUBSTEPS = 4;
const ITERATIONS = 3;       // segment-length passes per substep
const BEND = 1.85;          // points two apart stay at least this many segments apart: cloth, not string

/** A small deterministic random generator, so the same seed gives the same ribbons. */
function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export class RibbonDryer {
  readonly points = POINTS;
  readonly pos: Float32Array;   // x, y per point, ribbon by ribbon
  readonly prev: Float32Array;  // previous positions (Verlet)
  readonly segment: Float32Array; // each ribbon's segment length (m)
  drumAngle = 0;                // the paddles' turn, anticlockwise (the drum turns clockwise)
  readonly paddles = 3;
  readonly paddleLength: number;  // how far the fins reach in from the wall (m)
  readonly finHalf: number;       // half the fins' thickness (m)
  readonly halfWidth: number;     // half a ribbon's width: how close its middle comes to the wall (m)
  grip = 0.4;        // share of the slip against the drum wall removed at each contact (0–1)
  damping = 0.3;     // per second: air drag
  shuffle = 0.5;     // depth swaps per second, on average (0 = a fixed order)
  /** The ribbons from back to front: the order they're drawn in. */
  readonly order: number[];
  private rnd: () => number;
  private finX = new Float32Array(3);   // the paddles' directions this substep
  private finY = new Float32Array(3);

  constructor(public R: number, public count = 6, seed = 1) {
    const n = count * POINTS, rnd = random(seed);
    this.rnd = rnd;
    this.order = Array.from({ length: count }, (_, r) => r);
    this.pos = new Float32Array(n * 2);
    this.prev = new Float32Array(n * 2);
    this.segment = new Float32Array(count);
    this.paddleLength = 0.3 * R;
    this.finHalf = 0.04 * R;
    this.halfWidth = 0.12 * R;
    // Lay the ribbons in arcs across the bottom of the drum, each a different length (about one and a half radii).
    for (let r = 0; r < count; r++) {
      const length = (1.2 + 0.45 * rnd()) * R, radius = (0.85 - 0.08 * (r % 4)) * R;
      this.segment[r] = length / (POINTS - 1);
      const span = length / radius, start = -Math.PI / 2 - span / 2 + (rnd() - 0.5) * 0.6;
      for (let k = 0; k < POINTS; k++) {
        const a = start + (span * k) / (POINTS - 1), i = (r * POINTS + k) * 2;
        this.pos[i] = this.prev[i] = radius * Math.cos(a);
        this.pos[i + 1] = this.prev[i + 1] = radius * Math.sin(a);
      }
    }
  }

  /**
   * Advance by dt. (ax, ay): acceleration from gravity and the bike's motion (m/s²). omega: the
   * drum's spin, clockwise positive as the wheel turns when riding forward (rad/s).
   */
  step(dt: number, ax: number, ay: number, omega: number) {
    const h = dt / SUBSTEPS, keep = Math.exp(-this.damping * h), n = this.count * POINTS;
    const { pos, prev } = this;
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      for (let i = 0; i < n * 2; i += 2) {
        const vx = (pos[i] - prev[i]) * keep, vy = (pos[i + 1] - prev[i + 1]) * keep;
        prev[i] = pos[i]; prev[i + 1] = pos[i + 1];
        pos[i] += vx + ax * h * h;
        pos[i + 1] += vy + ay * h * h;
      }
      this.drumAngle -= omega * h;
      for (let k = 0; k < this.paddles; k++) {
        const a = this.drumAngle + (k * 2 * Math.PI) / this.paddles;
        this.finX[k] = Math.cos(a); this.finY[k] = Math.sin(a);
      }
      // Segment lengths and collisions settle together: each pass fixes the lengths, then keeps
      // points inside the drum and off the paddles. Only the last pass sets their velocities, and
      // a final pass makes every segment exactly its length.
      for (let it = 0; it < ITERATIONS; it++) {
        this.lengths();
        const last = it === ITERATIONS - 1;
        for (let i = 0; i < n * 2; i += 2) this.collide(i, omega, h, last);
      }
      for (let r = 0; r < this.count; r++) this.exact(r);
    }
    // Now and then two neighbouring layers swap depth.
    if (this.count > 1 && this.rnd() < this.shuffle * dt) {
      const k = Math.floor(this.rnd() * (this.count - 1)), o = this.order;
      [o[k], o[k + 1]] = [o[k + 1], o[k]];
    }
  }

  /**
   * One pass pulling each ribbon's segments back to their lengths, and pushing apart points two
   * apart that come too close, so a ribbon curls and flaps but never folds flat on itself.
   */
  private lengths() {
    const { pos } = this;
    for (let r = 0; r < this.count; r++) {
      const L = this.segment[r], bend = BEND * L;
      for (let k = 0; k < POINTS - 1; k++) {
        const a = (r * POINTS + k) * 2, b = a + 2;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], d = Math.hypot(dx, dy) || 1e-9;
        const f = (0.5 * (d - L)) / d;
        pos[a] += dx * f; pos[a + 1] += dy * f;
        pos[b] -= dx * f; pos[b + 1] -= dy * f;
      }
      for (let k = 0; k < POINTS - 2; k++) {
        const a = (r * POINTS + k) * 2, b = a + 4;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], d = Math.hypot(dx, dy) || 1e-9;
        if (d >= bend) continue;
        const f = (0.5 * (d - bend)) / d;
        pos[a] += dx * f; pos[a + 1] += dy * f;
        pos[b] -= dx * f; pos[b + 1] -= dy * f;
      }
    }
  }

  /**
   * Make ribbon r's segments exactly their length (follow the leader): from its middle point
   * outward, each point moves along the line to its neighbour until it is one segment away. A
   * point that would end up outside the drum goes instead to where that circle meets the wall.
   */
  private exact(r: number) {
    const { pos } = this, L = this.segment[r], limit = this.R - this.halfWidth, mid = POINTS >> 1;
    const place = (from: number, to: number) => {
      const a = (r * POINTS + from) * 2, b = (r * POINTS + to) * 2;
      const ax = pos[a], ay = pos[a + 1];
      let dx = pos[b] - ax, dy = pos[b + 1] - ay;
      const d = Math.hypot(dx, dy) || 1e-9;
      let x = ax + (dx * L) / d, y = ay + (dy * L) / d;
      const dist = Math.hypot(x, y);
      if (dist > limit) {
        // The circle of radius L round the neighbour meets the wall at two points; take the nearer.
        const c = Math.hypot(ax, ay) || 1e-9, ux = ax / c, uy = ay / c;
        const along = (limit * limit - L * L + c * c) / (2 * c), off = Math.sqrt(Math.max(0, limit * limit - along * along));
        const side = dx * -uy + dy * ux >= 0 ? 1 : -1;
        x = ux * along - uy * off * side; y = uy * along + ux * off * side;
      }
      // Move its previous position too, so the correction doesn't turn into motion: it only
      // takes up the stretch the other passes left, and fed back as velocity it makes a resting
      // ribbon's end buzz against the wall.
      this.prev[b] += x - pos[b]; this.prev[b + 1] += y - pos[b + 1];
      pos[b] = x; pos[b + 1] = y;
    };
    for (let k = mid; k < POINTS - 1; k++) place(k, k + 1);
    for (let k = mid; k > 0; k--) place(k, k - 1);
  }

  /** Keep point i inside the drum and off the paddles; with `move`, it moves with them where it touches. */
  private collide(i: number, omega: number, h: number, move: boolean) {
    const { pos } = this;
    // Drum wall: stop outward motion and drag the point along the wall's surface.
    const limit = this.R - this.halfWidth, dist = Math.hypot(pos[i], pos[i + 1]);
    if (dist > limit) {
      const nx = pos[i] / dist, ny = pos[i + 1] / dist;
      pos[i] = nx * limit; pos[i + 1] = ny * limit;
      if (move) this.moveWith(i, omega, h, nx, ny, this.grip);
    }
    // Paddles: radial fins from the wall inward. A point touching one is pushed to its face and
    // carried along at the fin's speed (it can still slide along the fin).
    const reach = this.halfWidth + this.finHalf, inner = this.R - this.paddleLength;
    for (let k = 0; k < this.paddles; k++) {
      const ux = this.finX[k], uy = this.finY[k], mx = -uy, my = ux;
      const along = pos[i] * ux + pos[i + 1] * uy;
      if (along < inner - this.halfWidth) continue;
      const across = pos[i] * mx + pos[i + 1] * my;
      if (Math.abs(across) >= reach) continue;
      // Push it out on the side it came from, so a fin never passes between neighbouring points.
      const before = this.prev[i] * mx + this.prev[i + 1] * my;
      const side = before >= 0 ? 1 : -1, push = side * reach - across;
      pos[i] += mx * push; pos[i + 1] += my * push;
      if (move) this.moveWith(i, omega, h, mx * side, my * side, 1);
    }
  }

  /**
   * Set point i's velocity (through its previous position) to follow the drum's surface, which
   * moves at omega·(y, −x): no motion into the surface along n, and `grip` of the slip removed.
   */
  private moveWith(i: number, omega: number, h: number, nx: number, ny: number, grip: number) {
    const { pos, prev } = this;
    const vx = (pos[i] - prev[i]) / h, vy = (pos[i + 1] - prev[i + 1]) / h;
    const wx = omega * pos[i + 1], wy = -omega * pos[i];
    let rx = vx - wx, ry = vy - wy;
    const into = rx * nx + ry * ny;
    if (into > 0) { rx -= into * nx; ry -= into * ny; }
    const tx = -ny, ty = nx, slip = rx * tx + ry * ty;
    rx -= grip * slip * tx; ry -= grip * slip * ty;
    prev[i] = pos[i] - (wx + rx) * h;
    prev[i + 1] = pos[i + 1] - (wy + ry) * h;
  }

  /** Floating-point operations per step, for the Stats tab (counted roughly, like the water's). */
  flopsPerStep(): number {
    const pts = this.count * POINTS, segs = this.count * (POINTS - 1);
    return SUBSTEPS * (pts * 8 + ITERATIONS * segs * 28 + segs * 22 + ITERATIONS * pts * (8 + this.paddles * 4));
  }
}
