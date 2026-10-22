// A rigid disc (the bouncing smiley) loose inside the wheel: the firmware's second physics look,
// stepped like the water from what the magnet tells it. No DOM here, so it can be tested.
//
// Frame: upright and centred on the hub, x forward, y up, metres. The wall is a regular polygon
// whose corners touch the circle the LEDs reach (or that circle itself, with fewer than 4 sides),
// turning with the wheel. The disc is pushed by gravity and by the opposite of the bike's
// acceleration, bounces off the wall, and is knocked by its moving facets and dragged along where
// they touch.

/** Contacts that close slower than this settle instead of bouncing (m/s), so a resting disc doesn't jitter. */
const REST_SPEED = 0.08;

export class SmileyBody {
  x = 0;
  y: number;
  vx = 0;
  vy = 0;
  angle = 0;   // radians, anticlockwise
  spin = 0;    // rad/s, anticlockwise
  wallAngle = 0;     // the polygon's turn, anticlockwise (the wheel turns clockwise riding forward)
  sides = 8;         // the wall polygon's sides; its facets knock the disc (a circle if the polygon has no room for it)
  bounce = 0.9;      // restitution against the wall (0 = dead, 1 = perfectly elastic)
  grip = 0.1;        // friction coefficient with the wall
  linearDamping = 0.05;   // per second: air drag
  // Per second. Without it the wall spins the disc up to its own speed (several turns a second at
  // riding speed) and the face blurs; with it, light grip settles at a readable turn or so a second.
  spinDamping = 3;

  /** r: the disc's radius; R: the radius the wall's corners reach (m). Starts resting at the bottom. */
  constructor(public r: number, public R: number) {
    this.y = -(R - r);
  }

  /**
   * Advance by dt. (ax, ay): acceleration from gravity and the bike's motion (m/s²). omega: the
   * wall's spin, clockwise positive as the wheel turns when riding forward (rad/s).
   */
  step(dt: number, ax: number, ay: number, omega: number, substeps = 8) {
    const h = dt / substeps;
    for (let k = 0; k < substeps; k++) {
      this.vx += ax * h;
      this.vy += ay * h;
      const lin = Math.exp(-this.linearDamping * h), ang = Math.exp(-this.spinDamping * h);
      this.vx *= lin; this.vy *= lin; this.spin *= ang;
      this.x += this.vx * h;
      this.y += this.vy * h;
      this.angle += this.spin * h;
      this.wallAngle -= omega * h;
      if (this.polygonFits()) {
        // Each side is a line at the polygon's inradius; the disc must stay r inside all of them.
        const inner = this.R * Math.cos(Math.PI / this.sides) - this.r;
        for (let s = 0; s < this.sides; s++) {
          const a = this.wallAngle + ((s + 0.5) * 2 * Math.PI) / this.sides;
          const nx = Math.cos(a), ny = Math.sin(a);
          const depth = this.x * nx + this.y * ny - inner;
          if (depth > 0) this.collide(nx, ny, depth, omega);
        }
      } else {
        const dist = Math.hypot(this.x, this.y), inner = this.R - this.r;
        if (dist > inner) this.collide(this.x / dist, this.y / dist, dist - inner, omega);
      }
    }
  }

  /** Whether the polygon leaves the disc room to move; with too few sides it doesn't, and the wall is round. */
  polygonFits(): boolean {
    return this.sides >= 3 && this.R * Math.cos(Math.PI / this.sides) - this.r > 0.02 * this.R;
  }

  /**
   * How far (x, y) lies outside the wall (m): negative inside, 0 on it. For the polygon this is the
   * distance past the nearest side's line, exact along the sides, which is what drawing them needs.
   */
  wallDistance(x: number, y: number): number {
    if (!this.polygonFits()) return Math.hypot(x, y) - this.R;
    let out = -Infinity;
    for (let s = 0; s < this.sides; s++) {
      const a = this.wallAngle + ((s + 0.5) * 2 * Math.PI) / this.sides;
      out = Math.max(out, x * Math.cos(a) + y * Math.sin(a));
    }
    return out - this.R * Math.cos(Math.PI / this.sides);
  }

  /** Resolve contact with the wall along outward normal n, the disc `depth` too far out. */
  private collide(nx: number, ny: number, depth: number, omega: number) {
    this.x -= nx * depth;
    this.y -= ny * depth;
    // The wall turns clockwise at omega, so its surface at the contact point c moves at
    // omega·(c_y, −c_x). Work with the disc's velocity relative to it.
    const cx = this.x + nx * this.r, cy = this.y + ny * this.r;
    const wx = omega * cy, wy = -omega * cx;
    const tx = -ny, ty = nx;
    const vn = (this.vx - wx) * nx + (this.vy - wy) * ny;
    if (vn <= 0) return;
    // Normal impulse (unit mass): bounce, or settle if it's barely moving into the wall.
    const jn = (1 + (vn > REST_SPEED ? this.bounce : 0)) * vn;
    this.vx -= jn * nx;
    this.vy -= jn * ny;
    // Friction: the disc's surface at the contact against the wall's. A solid disc has I = r²/2,
    // so a tangential impulse j changes the slip by 3j; Coulomb limits it to grip·jn.
    const slip = (this.vx - wx) * tx + (this.vy - wy) * ty + this.spin * this.r;
    const jt = Math.max(-this.grip * jn, Math.min(this.grip * jn, -slip / 3));
    this.vx += jt * tx;
    this.vy += jt * ty;
    this.spin += (2 * jt) / this.r;
  }
}
