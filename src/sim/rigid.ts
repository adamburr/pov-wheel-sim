// A rigid disc (the bouncing smiley) loose inside the wheel: the firmware's second physics look,
// stepped like the water from what the magnet tells it. No DOM here, so it can be tested.
//
// Frame: upright and centred on the hub, x forward, y up, metres. The wall is the circle the LEDs
// reach, turning with the wheel. The disc is pushed by gravity and by the opposite of the bike's
// acceleration, bounces off the wall, and is dragged along by the wall's moving surface where they
// touch. Its centre of mass sits below its middle, near the mouth, so it is bottom-heavy: contacts
// that don't pass through the centre of mass turn it, and it rocks back upright like a weeble.

/** Contacts that close slower than this settle instead of bouncing (m/s), so a resting disc doesn't jitter. */
const REST_SPEED = 0.08;

export class SmileyBody {
  // The centre of mass and its motion (unit mass).
  x = 0;
  y: number;
  vx = 0;
  vy = 0;
  angle = 0;   // radians, anticlockwise; 0 = upright, mouth down
  spin = 0;    // rad/s, anticlockwise
  bounce = 0.9;      // restitution against the wall (0 = dead, 1 = perfectly elastic)
  grip = 0.45;       // friction coefficient with the wall: just short of flipping the bottom-heavy disc
  linearDamping = 0.05;   // per second: air drag
  // Per second. Without it the wall spins the disc up to its own speed (several turns a second at
  // riding speed) and the face blurs; with it, light grip settles at a readable turn or so a second.
  spinDamping = 3;
  /** How far below the disc's middle its centre of mass sits, as a fraction of its radius (near the mouth). */
  readonly massOffset = 0.45;

  /** r: the disc's radius; R: the wall's (m). Starts resting upright at the bottom. */
  constructor(public r: number, public R: number) {
    this.y = -(R - r) - this.massOffset * r;
  }

  /** The disc's middle, where the face and its outline are centred. */
  centre(): { x: number; y: number } {
    const d = this.massOffset * this.r;
    // The middle is d "up" from the centre of mass in the disc's own frame.
    return { x: this.x - Math.sin(this.angle) * d, y: this.y + Math.cos(this.angle) * d };
  }

  /** Place the disc's middle at (cx, cy), turned by angle, at rest. */
  place(cx: number, cy: number, angle = 0) {
    const d = this.massOffset * this.r;
    this.angle = angle;
    this.x = cx + Math.sin(angle) * d;
    this.y = cy - Math.cos(angle) * d;
    this.vx = this.vy = this.spin = 0;
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
      const c = this.centre(), dist = Math.hypot(c.x, c.y), inner = this.R - this.r;
      if (dist > inner) this.collide(c.x / dist, c.y / dist, dist - inner, omega);
    }
  }

  /** How far (x, y) lies outside the wall (m): negative inside, 0 on it. Used to draw the wall. */
  wallDistance(x: number, y: number): number {
    return Math.hypot(x, y) - this.R;
  }

  /** Resolve contact with the wall along outward normal n, the disc's edge `depth` too far out. */
  private collide(nx: number, ny: number, depth: number, omega: number) {
    this.x -= nx * depth;
    this.y -= ny * depth;
    const c = this.centre();
    // The contact point, and its lever arm from the centre of mass.
    const px = c.x + nx * this.r, py = c.y + ny * this.r;
    const rx = px - this.x, ry = py - this.y;
    // Moment of inertia about the centre of mass: a solid disc's r²/2 about its middle, plus the offset².
    const d = this.massOffset * this.r, inertia = this.r * this.r / 2 + d * d;
    // The wall turns clockwise at omega, so its surface at the contact moves at omega·(p_y, −p_x).
    const wx = omega * py, wy = -omega * px;
    const relative = () => ({ x: this.vx - this.spin * ry - wx, y: this.vy + this.spin * rx - wy });
    const apply = (j: number, ex: number, ey: number) => {
      this.vx += j * ex;
      this.vy += j * ey;
      this.spin += (j * (rx * ey - ry * ex)) / inertia;
    };
    const before = relative(), vn = before.x * nx + before.y * ny;
    if (vn <= 0) return;
    // Normal impulse: bounce, or settle if it's barely moving into the wall. An off-centre contact
    // also turns the disc, so the impulse is shared with the extra rotational inertia.
    const armN = rx * ny - ry * nx;
    const jn = ((1 + (vn > REST_SPEED ? this.bounce : 0)) * vn) / (1 + (armN * armN) / inertia);
    apply(-jn, nx, ny);
    // Friction against the wall's moving surface, limited by Coulomb to grip·jn.
    const tx = -ny, ty = nx, armT = rx * ty - ry * tx;
    const rel = relative(), slip = rel.x * tx + rel.y * ty;
    const jt = Math.max(-this.grip * jn, Math.min(this.grip * jn, -slip / (1 + (armT * armT) / inertia)));
    apply(jt, tx, ty);
  }
}
