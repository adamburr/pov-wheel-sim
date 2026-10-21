/**
 * Small 2D FLIP fluid simulation of water in a disc, as a POV wheel's firmware could run it.
 * Particles carry the water; a MAC grid enforces incompressibility each step. Coordinates are
 * in grid cells with y up; the container is a disc centred in an n × n grid.
 */

export interface WaterOptions {
  grid: number;        // cells across the disc diameter
  fill: number;        // fraction of the disc area filled with water (0..1)
  cellM: number;       // size of one cell in metres
  iterations?: number; // pressure-solve iterations
  substeps?: number;
  flip?: number;       // FLIP/PIC blend: 1 = pure FLIP (lively), 0 = PIC (damped)
  viscosity?: number;  // grid-velocity smoothing per substep (0 = water, ~0.4 = oil)
  separation?: number; // strength of the particle push-apart (1 = full)
  rimFriction?: number; // how strongly the moving rim drags water touching it (0 = free slip)
  seed?: number;
}

export class WaterSim {
  readonly n: number;
  readonly cellM: number;
  readonly radius: number;          // container radius in cells
  readonly count: number;           // particles
  readonly px: Float32Array; readonly py: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array;
  /** Water amount per cell relative to rest density (0 = air, ~1 = full). */
  readonly cellDensity: Float32Array;
  /** Mean particle speed per cell (m/s). */
  readonly cellSpeed: Float32Array;
  /** Finer map for drawing (2× the grid): water amount (~1 = full) and mean speed (m/s). */
  readonly renderN: number;
  readonly renderDensity: Float32Array;
  readonly renderSpeed: Float32Array;
  /** renderDensity averaged over 3×3 cells: the body of water. Low bulk with density is spray. */
  readonly renderBulk: Float32Array;
  iterations: number;
  substeps: number;
  flip: number;
  viscosity: number;
  separation: number;
  rimFriction: number;

  private readonly pr: number;      // particle radius (cells)
  private readonly u: Float32Array; private readonly v: Float32Array;
  private readonly du: Float32Array; private readonly dv: Float32Array;
  private readonly wu: Float32Array; private readonly wv: Float32Array;
  private readonly solid: Uint8Array;   // 1 outside the disc
  private readonly fluid: Uint8Array;
  private restDensity = 0;
  private readonly hashStart: Int32Array; private readonly hashIds: Int32Array;

  constructor(o: WaterOptions) {
    const n = (this.n = Math.max(8, Math.round(o.grid)));
    this.cellM = o.cellM;
    this.radius = n / 2 - 1;
    this.iterations = o.iterations ?? 20;
    this.substeps = o.substeps ?? 2;
    this.flip = o.flip ?? 0.97;
    this.viscosity = o.viscosity ?? 0;
    this.separation = o.separation ?? 1;
    this.rimFriction = o.rimFriction ?? 0;
    this.pr = 0.3;
    const faces = (n + 1) * (n + 1);
    this.u = new Float32Array(faces); this.v = new Float32Array(faces);
    this.du = new Float32Array(faces); this.dv = new Float32Array(faces);
    this.wu = new Float32Array(faces); this.wv = new Float32Array(faces);
    this.solid = new Uint8Array(n * n);
    this.fluid = new Uint8Array(n * n);
    this.cellDensity = new Float32Array(n * n);
    this.cellSpeed = new Float32Array(n * n);
    this.renderN = 2 * n;
    this.renderDensity = new Float32Array(this.renderN * this.renderN);
    this.renderSpeed = new Float32Array(this.renderN * this.renderN);
    this.renderBulk = new Float32Array(this.renderN * this.renderN);
    const c = n / 2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      this.solid[j * n + i] = Math.hypot(i + 0.5 - c, j + 0.5 - c) > this.radius ? 1 : 0;
    }

    // Fill the bottom of the disc: find the water level that gives the requested area.
    const fill = Math.min(0.95, Math.max(0.02, o.fill));
    const R = this.radius - this.pr;
    const segArea = (h: number) => R * R * Math.acos(1 - h / R) - (R - h) * Math.sqrt(Math.max(0, 2 * R * h - h * h));
    let lo = 0, hi = 2 * R;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (segArea(mid) < fill * Math.PI * R * R) lo = mid; else hi = mid; }
    const level = c - R + lo;
    const spacing = 0.5;
    const pts: number[] = [];
    let seed = o.seed ?? 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.1;
    for (let y = c - R + spacing / 2; y < level; y += spacing) {
      for (let x = c - R + spacing / 2; x < c + R; x += spacing) {
        if (Math.hypot(x - c, y - c) < R) pts.push(x + rand(), y + rand());
      }
    }
    this.count = pts.length / 2;
    this.px = new Float32Array(this.count); this.py = new Float32Array(this.count);
    this.vx = new Float32Array(this.count); this.vy = new Float32Array(this.count);
    for (let k = 0; k < this.count; k++) { this.px[k] = pts[2 * k]; this.py[k] = pts[2 * k + 1]; }
    this.hashStart = new Int32Array(n * n + 1);
    this.hashIds = new Int32Array(this.count);
  }

  /**
   * Advance by dt seconds under an apparent acceleration (ax, ay) in m/s², display coordinates
   * with y up. Include gravity: e.g. (−a_bike, −9.81) so braking throws the water forward.
   * wallSpeed is the rim's speed in m/s, positive clockwise as seen from the drive side.
   */
  step(dt: number, ax: number, ay: number, wallSpeed = 0) {
    const sub = Math.max(1, this.substeps);
    const h = dt / sub;
    const gx = ax / this.cellM, gy = ay / this.cellM;
    for (let s = 0; s < sub; s++) {
      this.integrate(h, gx, gy);
      this.separate();
      this.collide(wallSpeed / this.cellM);
      this.toGrid();
      this.smoothVelocity();
      this.solvePressure();
      this.fromGrid();
    }
    this.measure();
  }

  /** Rough floating-point operations per step, for the firmware CPU budget. */
  flopsPerStep(): number {
    const perParticle = 8 /* integrate */ + 120 /* separation */ + 20 /* walls + rim drag */ + 48 /* to grid */ + 64 /* from grid */;
    const perCellIter = 15;
    const faces = (this.n + 1) * (this.n + 1);
    const viscosity = this.viscosity > 0 ? 2 * 2 * faces * 8 : 0;
    return Math.max(1, this.substeps) * (this.count * perParticle + this.n * this.n * this.iterations * perCellIter + viscosity)
      + this.count * 60 /* measure + render map */;
  }

  private integrate(h: number, gx: number, gy: number) {
    for (let k = 0; k < this.count; k++) {
      this.vx[k] += gx * h; this.vy[k] += gy * h;
      this.px[k] += this.vx[k] * h; this.py[k] += this.vy[k] * h;
    }
  }

  /** Push overlapping particles apart so the water keeps its volume (one pass, cell hash). */
  private separate() {
    const n = this.n, { px, py } = this;
    const cellOf = (k: number) => {
      const i = Math.min(n - 1, Math.max(0, Math.floor(px[k]))), j = Math.min(n - 1, Math.max(0, Math.floor(py[k])));
      return j * n + i;
    };
    const start = this.hashStart; start.fill(0);
    for (let k = 0; k < this.count; k++) start[cellOf(k)]++;
    let acc = 0;
    for (let c = 0; c <= n * n; c++) { acc += start[c] ?? 0; start[c] = acc; }
    for (let k = 0; k < this.count; k++) this.hashIds[--start[cellOf(k)]] = k;
    const minD = 2 * this.pr, minD2 = minD * minD;
    for (let k = 0; k < this.count; k++) {
      const ci = Math.floor(px[k]), cj = Math.floor(py[k]);
      for (let j = Math.max(0, cj - 1); j <= Math.min(n - 1, cj + 1); j++) {
        for (let i = Math.max(0, ci - 1); i <= Math.min(n - 1, ci + 1); i++) {
          const c = j * n + i;
          for (let q = start[c]; q < start[c + 1]; q++) {
            const o = this.hashIds[q];
            if (o <= k) continue;
            const dx = px[o] - px[k], dy = py[o] - py[k], d2 = dx * dx + dy * dy;
            if (d2 >= minD2 || d2 === 0) continue;
            const d = Math.sqrt(d2), push = (0.5 * this.separation * (minD - d)) / d;
            px[k] -= dx * push; py[k] -= dy * push; px[o] += dx * push; py[o] += dy * push;
          }
        }
      }
    }
  }

  /**
   * Keep particles inside the disc and remove the velocity component into the wall. Particles
   * touching the rim are dragged toward its speed (cells/s, clockwise), which is what churns
   * the water while the wheel turns.
   */
  private collide(wallSpeed: number) {
    const c = this.n / 2, R = this.radius - this.pr, contact = R - 0.3;
    const mu = this.rimFriction;
    for (let k = 0; k < this.count; k++) {
      const dx = this.px[k] - c, dy = this.py[k] - c, d = Math.hypot(dx, dy);
      if (d <= contact) continue;
      const nx = dx / d, ny = dy / d;
      if (d > R) {
        this.px[k] = c + nx * R; this.py[k] = c + ny * R;
        const vn = this.vx[k] * nx + this.vy[k] * ny;
        if (vn > 0) { this.vx[k] -= vn * nx; this.vy[k] -= vn * ny; }
      }
      if (mu > 0) {
        // Clockwise tangent: at the bottom (n = (0, −1)) the rim moves backward, (−1, 0).
        const tx = ny, ty = -nx;
        const dv = mu * (wallSpeed - (this.vx[k] * tx + this.vy[k] * ty));
        this.vx[k] += dv * tx; this.vy[k] += dv * ty;
      }
    }
  }

  /** Viscosity: blend each grid face velocity toward the mean of its valid neighbours. */
  private smoothVelocity() {
    if (this.viscosity <= 0) return;
    const N = this.n + 1, nu = Math.min(1, this.viscosity);
    for (const [f, w] of [[this.u, this.wu], [this.v, this.wv]] as const) {
      for (let pass = 0; pass < 2; pass++) {
        const src = f.slice();
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
          const id = j * N + i;
          if (w[id] === 0) continue;
          let sum = 0, cnt = 0;
          for (const o of [id - 1, id + 1, id - N, id + N]) if (w[o] > 0) { sum += src[o]; cnt++; }
          if (cnt) f[id] = src[id] + nu * (sum / cnt - src[id]);
        }
      }
    }
  }

  /** Bilinear splat of particle velocities onto the staggered grid. */
  private toGrid() {
    const n = this.n, N = n + 1;
    this.u.fill(0); this.v.fill(0); this.wu.fill(0); this.wv.fill(0); this.fluid.fill(0);
    for (let k = 0; k < this.count; k++) {
      const i = Math.floor(this.px[k]), j = Math.floor(this.py[k]);
      if (i >= 0 && j >= 0 && i < n && j < n && !this.solid[j * n + i]) this.fluid[j * n + i] = 1;
      this.splat(this.u, this.wu, this.px[k], this.py[k] - 0.5, this.vx[k], N);
      this.splat(this.v, this.wv, this.px[k] - 0.5, this.py[k], this.vy[k], N);
    }
    for (let f = 0; f < N * N; f++) {
      if (this.wu[f] > 0) this.u[f] /= this.wu[f];
      if (this.wv[f] > 0) this.v[f] /= this.wv[f];
    }
    // Faces touching a solid cell carry no flow.
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (!this.solid[j * n + i]) continue;
      this.u[j * N + i] = 0; this.u[j * N + i + 1] = 0;
      this.v[j * N + i] = 0; this.v[(j + 1) * N + i] = 0;
    }
    this.du.set(this.u); this.dv.set(this.v);

    // Particle density at cell centres, for volume-drift compensation and rendering.
    this.cellDensity.fill(0);
    for (let k = 0; k < this.count; k++) this.splatScalar(this.cellDensity, this.px[k] - 0.5, this.py[k] - 0.5, n);
    if (this.restDensity === 0) {
      let sum = 0, cells = 0;
      for (let c = 0; c < n * n; c++) if (this.fluid[c]) { sum += this.cellDensity[c]; cells++; }
      this.restDensity = cells ? sum / cells : 1;
    }
  }

  private splat(f: Float32Array, w: Float32Array, x: number, y: number, val: number, N: number) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    for (let q = 0; q < 4; q++) {
      const ii = i + (q & 1), jj = j + (q >> 1);
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const wt = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
      f[jj * N + ii] += wt * val; w[jj * N + ii] += wt;
    }
  }

  private splatScalar(f: Float32Array, x: number, y: number, n: number) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    for (let q = 0; q < 4; q++) {
      const ii = i + (q & 1), jj = j + (q >> 1);
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      f[jj * n + ii] += ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
    }
  }

  /** Gauss-Seidel projection with over-relaxation; air neighbours act as zero pressure. */
  private solvePressure() {
    const n = this.n, N = n + 1, omega = 1.9, drift = 1;
    const open = (i: number, j: number) => (i < 0 || j < 0 || i >= n || j >= n || this.solid[j * n + i] ? 0 : 1);
    for (let it = 0; it < this.iterations; it++) {
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = j * n + i;
        if (!this.fluid[c]) continue;
        const sx0 = open(i - 1, j), sx1 = open(i + 1, j), sy0 = open(i, j - 1), sy1 = open(i, j + 1);
        const s = sx0 + sx1 + sy0 + sy1;
        if (!s) continue;
        let div = this.u[j * N + i + 1] - this.u[j * N + i] + this.v[(j + 1) * N + i] - this.v[j * N + i];
        const excess = this.cellDensity[c] - this.restDensity;
        if (excess > 0) div -= drift * excess;
        const pr = (-div / s) * omega;
        this.u[j * N + i] -= sx0 * pr; this.u[j * N + i + 1] += sx1 * pr;
        this.v[j * N + i] -= sy0 * pr; this.v[(j + 1) * N + i] += sy1 * pr;
      }
    }
  }

  /** Bilinear gather back to particles, blending PIC (grid velocity) and FLIP (grid change). */
  private fromGrid() {
    const n = this.n, N = n + 1;
    for (let f = 0; f < N * N; f++) { this.du[f] = this.u[f] - this.du[f]; this.dv[f] = this.v[f] - this.dv[f]; }
    for (let k = 0; k < this.count; k++) {
      const [pu, fu] = this.gather(this.u, this.du, this.wu, this.px[k], this.py[k] - 0.5, N);
      const [pv, fv] = this.gather(this.v, this.dv, this.wv, this.px[k] - 0.5, this.py[k], N);
      if (pu !== null) this.vx[k] = (1 - this.flip) * pu + this.flip * (this.vx[k] + fu);
      if (pv !== null) this.vy[k] = (1 - this.flip) * pv + this.flip * (this.vy[k] + fv);
    }
  }

  private gather(f: Float32Array, df: Float32Array, w: Float32Array, x: number, y: number, N: number): [number | null, number] {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    let sum = 0, dsum = 0, wsum = 0;
    for (let q = 0; q < 4; q++) {
      const ii = i + (q & 1), jj = j + (q >> 1);
      if (ii < 0 || jj < 0 || ii >= N || jj >= N || w[jj * N + ii] === 0) continue;
      const wt = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
      sum += wt * f[jj * N + ii]; dsum += wt * df[jj * N + ii]; wsum += wt;
    }
    return wsum > 0 ? [sum / wsum, dsum / wsum] : [null, 0];
  }

  private measure() {
    const n = this.n;
    for (let c = 0; c < n * n; c++) this.cellDensity[c] /= this.restDensity || 1;
    this.measureRender();
    this.cellSpeed.fill(0);
    const counts = new Uint16Array(n * n);
    for (let k = 0; k < this.count; k++) {
      const i = Math.floor(this.px[k]), j = Math.floor(this.py[k]);
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      this.cellSpeed[j * n + i] += Math.hypot(this.vx[k], this.vy[k]) * this.cellM;
      counts[j * n + i]++;
    }
    for (let c = 0; c < n * n; c++) if (counts[c]) this.cellSpeed[c] /= counts[c];
  }

  /**
   * Splat particles onto the 2× render map. Each render cell is a quarter of a grid cell, so
   * a quarter of the rest density counts as full; speed is the weighted mean particle speed.
   */
  private measureRender() {
    const m = this.renderN, dens = this.renderDensity, spd = this.renderSpeed;
    dens.fill(0); spd.fill(0);
    for (let k = 0; k < this.count; k++) {
      const x = this.px[k] * 2 - 0.5, y = this.py[k] * 2 - 0.5;
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const speed = Math.hypot(this.vx[k], this.vy[k]) * this.cellM;
      for (let q = 0; q < 4; q++) {
        const ii = i + (q & 1), jj = j + (q >> 1);
        if (ii < 0 || jj < 0 || ii >= m || jj >= m) continue;
        const wt = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
        dens[jj * m + ii] += wt; spd[jj * m + ii] += wt * speed;
      }
    }
    const full = (this.restDensity || 1) / 4;
    for (let c = 0; c < m * m; c++) {
      if (dens[c] > 0) spd[c] /= dens[c];
      dens[c] /= full;
    }
    const bulk = this.renderBulk;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < m && jj < m) sum += dens[jj * m + ii];
      }
      bulk[j * m + i] = sum / 9;
    }
  }
}
