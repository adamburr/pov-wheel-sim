import type { Params } from '../params';
import type { Derived } from './timing';

const TAU = Math.PI * 2;

/**
 * Wheel kinematics with optional pedal-stroke surging: v(t) = v0 (1 + a sin(2π f t)).
 * Angle is measured in the direction of rotation (clockwise seen from the drive side).
 * Parameter changes re-anchor so angle and distance stay continuous.
 */
export class WheelMotion {
  private tA = 0;
  private sA = 0;
  private v = 0;
  private a = 0;
  private f = 1;
  private R = 0.34;

  configure(v: number, R: number, a: number, f: number, tNow: number) {
    if (v === this.v && R === this.R && a === this.a && f === this.f) return;
    this.sA = this.dist(tNow);
    this.tA = tNow;
    // Keep the angle continuous when the radius changes.
    const phiNow = this.sA / this.R;
    this.v = v; this.a = a; this.f = f; this.R = R;
    this.sA = phiNow * R;
  }

  dist(t: number): number {
    const w = TAU * this.f;
    const wobble = this.a ? (this.a / w) * (Math.cos(w * t) - Math.cos(w * this.tA)) : 0;
    return this.sA + this.v * (t - this.tA - wobble);
  }
  phi(t: number): number { return this.dist(t) / this.R; }
  speed(t: number): number { return this.v * (1 + this.a * Math.sin(TAU * this.f * t)); }
  get radius() { return this.R; }

  /** Smallest t in [lo, hi] with g(t) >= target, g monotonic non-decreasing. */
  static solve(g: (t: number) => number, target: number, lo: number, hi: number): number {
    for (let i = 0; i < 48; i++) {
      const mid = 0.5 * (lo + hi);
      if (g(mid) < target) lo = mid; else hi = mid;
    }
    return hi;
  }

  /** Times in [t0, t1] at which the angle crosses a multiple of 2π (strip 0 passes the magnet). */
  passes(t0: number, t1: number): number[] {
    if (this.v <= 0) return [];
    const out: number[] = [];
    const n0 = Math.ceil(this.phi(t0) / TAU);
    const n1 = Math.floor(this.phi(t1) / TAU);
    for (let n = n0; n <= n1 && out.length < 4096; n++) {
      out.push(WheelMotion.solve((t) => this.phi(t), n * TAU, t0, t1));
    }
    return out;
  }
}

/** One stretch of firmware behaviour: the column schedule it follows between sync events. */
export interface Segment {
  start: number;
  end: number;
  m: number;        // time column 0 starts (or magnet angle when angle-locked)
  P: number;        // column period; < 0 means columns are locked to true wheel angle
  enabled: boolean;
  // Dead reckoning (hall mode): the firmware believes the wheel is at angle
  // 2π(k + (t - start)/T), i.e. k whole turns at the sync, advancing at the last measured rate.
  T?: number;
  k?: number;
}

/**
 * Hall-sensor firmware, modelled on the Adafruit CircuitPython code: poll the sensor, reject
 * passes closer than the debounce, use the last revolution time to set the column period,
 * arm after two passes within 1.5 s, go dark after max(2 s, 2.5 revs) with no pass.
 */
export function hallSegments(p: Params, d: Derived, motion: WheelMotion, tA: number, tB: number): Segment[] {
  const lookBack = 5;
  const raw = motion.passes(tA - lookBack, tB);
  const poll = p.hallPollMs / 1000;
  const debounce = p.debounceMs / 1000;
  const valid: number[] = [];
  for (const m of raw) {
    const det = poll > 0 ? Math.ceil(m / poll) * poll : m;
    if (!valid.length || det - valid[valid.length - 1] >= debounce) valid.push(det);
  }
  const segs: Segment[] = [];
  const C = p.columnsPerRev;
  for (let i = 1; i < valid.length; i++) {
    const T = valid[i] - valid[i - 1];
    const start = valid[i];
    const timeout = Math.max(2, 2.5 * T);
    const end = Math.min(i + 1 < valid.length ? valid[i + 1] : Infinity, start + timeout);
    if (end < tA) continue;
    let P = T / C;
    if (p.minLinesPerSec > 0) P = Math.min(P, 1 / p.minLinesPerSec);
    P = Math.max(P, d.columnTimeS);
    segs.push({ start, end, m: start, P, enabled: T <= 1.5, T, k: Math.round(motion.phi(start) / TAU) });
  }
  return segs;
}

export function segmentsFor(p: Params, d: Derived, motion: WheelMotion, tA: number, tB: number): Segment[] {
  // Banner mode needs a position estimate, which a free-running clock doesn't have.
  if (p.syncMode === 'hall' || (p.syncMode === 'free' && p.displayMode === 'banner')) {
    return hallSegments(p, d, motion, tA, tB);
  }
  if (p.syncMode === 'ideal') {
    return [{ start: -Infinity, end: Infinity, m: 0, P: -1, enabled: motion.speed(tB) > 0.05 }];
  }
  // Free-running: fixed column rate with no sensor. Anchor m at a multiple of a full image so
  // the shader only ever sees small relative times.
  const P = Math.max(1 / Math.max(1, p.freeRunColsPerSec), d.columnTimeS);
  const frame = P * p.columnsPerRev;
  return [{ start: -Infinity, end: Infinity, m: Math.floor(tA / frame) * frame, P, enabled: true }];
}

export interface Slice {
  t0: number; t1: number; phi0: number; omega: number;
  m: number; P: number; enabled: boolean; hubX0: number;
  delta0: number;     // firmware's angle estimate minus the true angle at t0 (rad)
  deltaRate: number;  // d(delta)/dt within the slice
  hubWorld0: number;  // hub position along the road at t0, in the banner's frame (m)
}

export const MAX_SLICES = 128;

/**
 * Cut the exposure window into slices with constant angular velocity and a single firmware
 * schedule, so the shader can solve LED pass times in closed form inside each slice.
 */
export function buildSlices(
  p: Params, d: Derived, motion: WheelMotion, tA: number, tB: number, maxAngle: number, tileM = 0,
): Slice[] {
  const segs = segmentsFor(p, d, motion, tA, tB);
  const cuts = new Set<number>([tA, tB]);
  for (const t of motion.passes(tA, tB)) cuts.add(t);
  for (const s of segs) {
    if (s.start > tA && s.start < tB) cuts.add(s.start);
    if (s.end > tA && s.end < tB) cuts.add(s.end);
  }
  const L = p.trackLengthM;
  const rideBy = p.view === 'ride-by';
  if (rideBy) {
    const s0 = motion.dist(tA), s1 = motion.dist(tB);
    for (let k = Math.ceil((s0 + L / 2) / L); k * L - L / 2 <= s1 && cuts.size < MAX_SLICES; k++) {
      cuts.add(WheelMotion.solve((t) => motion.dist(t), k * L - L / 2, tA, tB));
    }
  }
  const base = [...cuts].sort((a, b) => a - b);

  // Subdivide long slices so the secant angular velocity stays accurate.
  let budget = Math.max(0, Math.min(p.quality, MAX_SLICES) - (base.length - 1));
  const times: number[] = [base[0]];
  const totalAngle = motion.phi(tB) - motion.phi(tA);
  const angleCap = Math.max(maxAngle, budget > 0 ? totalAngle / budget : Infinity);
  for (let i = 1; i < base.length; i++) {
    const a = base[i - 1], b = base[i];
    const n = Math.min(Math.max(1, Math.ceil((motion.phi(b) - motion.phi(a)) / angleCap)), budget + 1);
    budget -= n - 1;
    for (let k = 1; k <= n; k++) times.push(a + ((b - a) * k) / n);
  }
  // Keep the most recent slices if a very long exposure still overflows the texture.
  const start = Math.max(0, times.length - 1 - MAX_SLICES);

  const slices: Slice[] = [];
  for (let i = start + 1; i < times.length; i++) {
    const t0 = times[i - 1], t1 = times[i];
    if (t1 - t0 < 1e-9) continue;
    const mid = 0.5 * (t0 + t1);
    const seg = segs.find((s) => mid >= s.start && mid < s.end);
    const p0 = motion.phi(t0);
    let hubX0 = 0;
    if (rideBy) {
      const s = motion.dist(t0) + L / 2;
      hubX0 = s - Math.floor(s / L + 1e-9) * L - L / 2;
    }
    const omega = (motion.phi(t1) - p0) / (t1 - t0);
    let delta0 = 0, deltaRate = 0;
    if (seg?.T && seg.k !== undefined) {
      delta0 = TAU * seg.k + (TAU * (t0 - seg.start)) / seg.T - p0;
      deltaRate = TAU / seg.T - omega;
    }
    // Ride-by pins the banner to the visible track; chase pins it to distance travelled.
    let hubWorld0 = hubX0;
    if (!rideBy && tileM > 0) {
      const s = motion.dist(t0);
      hubWorld0 = s - Math.floor(s / tileM) * tileM;
    }
    slices.push({
      t0, t1,
      phi0: p0 - Math.floor(p0 / TAU) * TAU,
      omega,
      m: seg ? seg.m : 0,
      P: seg ? seg.P : 1,
      enabled: !!seg && seg.enabled,
      hubX0, delta0, deltaRate, hubWorld0,
    });
  }
  return slices;
}
