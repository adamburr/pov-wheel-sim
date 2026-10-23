import { type Params, playbackFps } from '../params';
import type { Derived } from './timing';

const TAU = Math.PI * 2;

/**
 * One stretch of riding from an anchor time: the base speed ramps from v0 to vT at constant
 * acceleration, then cruises at vT with pedal-stroke surging v(t) = vT (1 + a sin(2π f t)).
 */
interface MotionSeg {
  tA: number;     // anchor time
  sA: number;     // distance at the anchor
  phiA: number;   // wheel angle at the anchor
  v0: number;
  vT: number;
  acc: number;    // signed mean ramp acceleration (0 when the change was instant)
  k: number;      // pedal-stroke pulsing of a speed-up: acceleration acc·(1 + k sin ωt)
  tEnd: number;   // end of the ramp
  a: number;      // cruising surge amplitude (fraction of speed)
  f: number;      // surge frequency (Hz): two pedal strokes per crank turn
  R: number;      // rolling radius
}

/**
 * Wheel kinematics. Angle is measured in the direction of rotation (clockwise seen from the
 * drive side). Changing speed ramps at the requested acceleration (braking, speeding up);
 * every change starts a new segment so distance, angle and the history the hall-sensor model
 * looks back over all stay continuous. Speeding up pulses with each pedal stroke.
 */
export class WheelMotion {
  private segs: MotionSeg[] = [{ tA: 0, sA: 0, phiA: 0, v0: 0, vT: 0, acc: 0, k: 0, tEnd: 0, a: 0, f: 1, R: 0.34 }];

  /**
   * rampAcc: mean |acceleration| used to reach the new speed (m/s²); 0 jumps instantly.
   * rampSurge: how strongly pedal strokes pulse the acceleration when speeding up (0..0.9).
   */
  configure(v: number, R: number, a: number, f: number, tNow: number, rampAcc = 0, rampSurge = 0) {
    const cur = this.segs[this.segs.length - 1];
    if (v === cur.vT && R === cur.R && a === cur.a && f === cur.f && rampAcc === this.lastRamp) return;
    this.lastRamp = rampAcc;
    const v0 = rampAcc > 0 ? this.baseSpeed(cur, tNow) : v;
    const acc = rampAcc > 0 && v !== v0 ? Math.sign(v - v0) * rampAcc : 0;
    const g: MotionSeg = {
      tA: tNow, sA: this.dist(tNow), phiA: this.phi(tNow), v0, vT: v, acc,
      k: acc > 0 ? Math.min(0.9, Math.max(0, rampSurge)) : 0, tEnd: tNow, a, f, R,
    };
    if (acc) {
      // Speed is monotonic through the ramp, so find where it reaches the target.
      let lo = tNow, hi = tNow + (v - v0) / (acc * (1 - g.k)) + 1e-6;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        if ((this.rampSpeed(g, mid) - v) * Math.sign(acc) < 0) lo = mid; else hi = mid;
      }
      g.tEnd = hi;
    }
    this.segs.push(g);
    // Keep enough history for the hall model's look-back.
    while (this.segs.length > 2 && this.segs[1].tA < tNow - 30) this.segs.shift();
  }
  private lastRamp = 0;

  private seg(t: number): MotionSeg {
    for (let i = this.segs.length - 1; i > 0; i--) if (t >= this.segs[i].tA) return this.segs[i];
    return this.segs[0];
  }

  private rampSpeed(g: MotionSeg, t: number): number {
    const dt = t - g.tA, w = TAU * g.f;
    return g.v0 + g.acc * dt - (g.k ? ((g.acc * g.k) / w) * (Math.cos(w * t) - Math.cos(w * g.tA)) : 0);
  }

  private rampDist(g: MotionSeg, t: number): number {
    const dt = t - g.tA, w = TAU * g.f;
    let s = g.v0 * dt + 0.5 * g.acc * dt * dt;
    if (g.k) s -= ((g.acc * g.k) / w) * ((Math.sin(w * t) - Math.sin(w * g.tA)) / w - Math.cos(w * g.tA) * dt);
    return s;
  }

  private baseSpeed(g: MotionSeg, t: number): number {
    return t < g.tEnd ? this.rampSpeed(g, Math.max(t, g.tA)) : g.vT;
  }

  /** Distance travelled since the segment's anchor. */
  private travelled(g: MotionSeg, t: number): number {
    if (t <= g.tA) return g.v0 * (t - g.tA);
    if (t <= g.tEnd) return this.rampDist(g, t);
    const w = TAU * g.f;
    const surge = g.a ? (g.a / w) * (Math.cos(w * t) - Math.cos(w * g.tEnd)) : 0;
    return this.rampDist(g, g.tEnd) + g.vT * (t - g.tEnd - surge);
  }

  dist(t: number): number { const g = this.seg(t); return g.sA + this.travelled(g, t); }
  phi(t: number): number { const g = this.seg(t); return g.phiA + this.travelled(g, t) / g.R; }
  speed(t: number): number {
    const g = this.seg(t);
    return t < g.tEnd ? this.baseSpeed(g, t) : g.vT * (1 + g.a * Math.sin(TAU * g.f * t));
  }
  /** True road acceleration (m/s²), forward positive. */
  accel(t: number): number {
    const g = this.seg(t);
    const w = TAU * g.f;
    if (t >= g.tA && t < g.tEnd) return g.acc * (1 + g.k * Math.sin(w * t));
    return t < g.tA ? 0 : g.vT * g.a * w * Math.cos(w * t);
  }
  /** Mean acceleration of the current ramp (m/s²), without the pedal-stroke pulses; 0 when holding speed. */
  rampAccel(t: number): number {
    const g = this.seg(t);
    return t >= g.tA && t < g.tEnd ? g.acc : 0;
  }
  get radius() { return this.segs[this.segs.length - 1].R; }

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
    const p0 = this.phi(t0), p1 = this.phi(t1);
    if (p1 - p0 < 1e-9) return [];
    const out: number[] = [];
    for (let n = Math.ceil(p0 / TAU); n <= Math.floor(p1 / TAU) && out.length < 4096; n++) {
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
  const valid = hallDetections(p, motion, tA - 5, tB);
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

/** Magnet passes as the firmware registers them: delayed to the next poll, debounced. */
export function hallDetections(p: Params, motion: WheelMotion, t0: number, t1: number): number[] {
  const poll = p.hallPollMs / 1000;
  const debounce = p.debounceMs / 1000;
  const valid: number[] = [];
  for (const m of motion.passes(t0, t1)) {
    const det = poll > 0 ? Math.ceil(m / poll) * poll : m;
    if (det > t1) break;
    if (!valid.length || det - valid[valid.length - 1] >= debounce) valid.push(det);
  }
  return valid;
}

/**
 * Road acceleration as the firmware can estimate it at time t (m/s², forward positive).
 * Hall mode only sees whole revolutions: the change between the last two revolution rates,
 * held until the next pass, so it lags by about a revolution. Ideal mode reads the truth;
 * free-running firmware has no sensor at all.
 */
export function magnetAccel(p: Params, motion: WheelMotion, t: number): number {
  if (p.syncMode === 'ideal') return motion.accel(t);
  if (p.syncMode === 'free') return 0;
  const det = hallDetections(p, motion, t - 5, t);
  if (det.length < 3) return 0;
  const [a, b, c] = det.slice(-3);
  const T1 = b - a, T2 = c - b;
  if (T1 > 1.5 || T2 > 1.5 || t - c > Math.max(2, 2.5 * T2)) return 0; // not armed / timed out
  const R = motion.radius;
  return (R * (TAU / T2 - TAU / T1)) / (0.5 * (T1 + T2));
}

/**
 * Wheel spin rate as the firmware knows it at time t (rad/s): one revolution per magnet pass
 * in hall mode (0 until armed or after the timeout), the truth when encoder-locked, nothing
 * when free-running.
 */
export function magnetOmega(p: Params, motion: WheelMotion, t: number): number {
  if (p.syncMode === 'ideal') return motion.speed(t) / motion.radius;
  if (p.syncMode === 'free') return 0;
  const det = hallDetections(p, motion, t - 5, t);
  if (det.length < 2) return 0;
  const T = det[det.length - 1] - det[det.length - 2];
  if (T > 1.5 || t - det[det.length - 1] > Math.max(2, 2.5 * T)) return 0;
  return TAU / T;
}

/**
 * Whether the firmware has the LEDs lit at time t: armed and not timed out (hall), the wheel
 * turning (ideal), or always (free-running, which has no sensor to tell it the wheel stopped).
 */
export function lightsOn(p: Params, d: Derived, motion: WheelMotion, t: number): boolean {
  const seg = segmentsFor(p, d, motion, t, t).find((s) => t >= s.start && t < s.end);
  return !!seg && seg.enabled;
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
  frame0: number;     // animation frame position at t0 (timed: fractional, advances at playback fps)
}

export const MAX_SLICES = 128;

/** How animation frames advance: from the image settings, or a live source such as water. */
export interface AnimSpec {
  frames: number;
  fps: number;          // timed playback rate
  timed: boolean;       // false: step at the firmware's sync point every revsPerFrame turns
  revsPerFrame: number;
  rate: number;         // frames per step when revolution-synced
  live?: boolean;       // generated on the fly (water); always shown wheel-locked
}

export function animSpecFor(p: Params, frames: number): AnimSpec {
  return { frames, fps: playbackFps(p), timed: p.frameAdvance === 'timed', revsPerFrame: p.revsPerFrame, rate: p.playbackRate };
}

/**
 * Cut the exposure window into slices with constant angular velocity and a single firmware
 * schedule, so the shader can solve LED pass times in closed form inside each slice.
 */
export function buildSlices(
  p: Params, d: Derived, motion: WheelMotion, tA: number, tB: number, maxAngle: number, tileM = 0,
  animation: AnimSpec | number = 1,
): Slice[] {
  const anim = typeof animation === 'number' ? animSpecFor(p, animation) : animation;
  const segs = segmentsFor(p, d, motion, tA, tB);
  const cuts = new Set<number>([tA, tB]);
  for (const t of motion.passes(tA, tB)) cuts.add(t);
  for (const s of segs) {
    if (s.start > tA && s.start < tB) cuts.add(s.start);
    if (s.end > tA && s.end < tB) cuts.add(s.end);
  }
  // Revolution-synced frames can also step partway through a turn (under one turn per frame).
  if (!anim.timed && anim.frames > 1) {
    for (const s of segs) {
      const w0 = Math.max(tA, s.start), w1 = Math.min(tB, s.end);
      if (w1 <= w0) continue;
      const g = (t: number) => frameStep(p, anim, motion, s, t);
      for (let n = g(w0) + 1; n <= g(w1) && cuts.size < MAX_SLICES; n++) cuts.add(WheelMotion.solve(g, n, w0, w1));
    }
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
      frame0: frameAt(p, anim, motion, seg, t0, mid),
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

/**
 * Animation frame at the start of a slice. Timed playback advances at the playback fps (and may change
 * mid-revolution); revolution-synced playback steps playbackRate frames every revsPerFrame turns.
 */
function frameAt(p: Params, anim: AnimSpec, motion: WheelMotion, seg: Segment | undefined, t0: number, mid: number): number {
  const frames = anim.frames;
  if (frames <= 1) return 0;
  const wrap = (x: number) => ((x % frames) + frames) % frames;
  if (anim.timed) return wrap(t0 * anim.fps);
  return wrap(Math.floor(frameStep(p, anim, motion, seg, mid) * anim.rate));
}

/**
 * How many revsPerFrame steps the firmware has counted by time t. Whole turns count at its sync point:
 * the magnet detection, the true pass (ideal), or a full image cycle (free-running). Between them it
 * counts columns sent (or true angle when encoder-locked), so under one turn per frame the frame
 * changes between two columns, partway round.
 */
function frameStep(p: Params, anim: AnimSpec, motion: WheelMotion, seg: Segment | undefined, t: number): number {
  const C = p.columnsPerRev;
  let turns = 0;
  if (seg && seg.P < 0) turns = motion.phi(t) / TAU;
  else if (seg?.k !== undefined) turns = seg.k + Math.min(Math.floor((t - seg.m) / seg.P), C - 1) / C;
  else if (seg) turns = Math.round(seg.m / (seg.P * C)) + Math.floor((t - seg.m) / seg.P) / C;
  return Math.floor(turns / Math.max(0.01, anim.revsPerFrame) + 1e-9);
}
