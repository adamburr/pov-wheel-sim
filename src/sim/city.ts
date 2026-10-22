import type { Params } from '../params';

export type CityPhase = 'go' | 'cruise' | 'brake' | 'stopped';

const G = 9.81;
const NEAREST_LIGHT_M = 3;   // light turns red just ahead: a hard stop
const FARTHEST_LIGHT_M = 40; // spotted far off: a long, gentle roll-down
const MAX_BRAKE_G = 0.7;
const MIN_BRAKE_G = 0.03;
const COAST_G = 0.04;        // slowing with the pedals still, before braking
const EASE_MPS = 1.2;        // below this the rider eases off the brakes to stop smoothly

/** One stretch of a trip: ramp at g towards `share` of the trip's top speed, and stay at least `hold` s. */
interface Leg { share: number; g: number; hold: number }

/**
 * Stop-and-go city riding: pull away, ride a block, brake for a light, wait, repeat. Each trip
 * tops out at a different speed (half to one and a half times the cruise speed). Pulling away is
 * strong at first and eases off as the speed builds, the way pedal power does; along the block
 * the speed wanders, with the odd slowdown; each light turns red at a random distance ahead,
 * and the rider coasts a moment if it's far, brakes just hard enough to stop there (v²/2d) and
 * eases off at the very end. So some stops are sharp and others slow.
 * It only sets the target speed and the ramp rate, so the bike, the magnet firmware and the
 * water all respond exactly as they do to a rider.
 */
export class CityRide {
  phase: CityPhase = 'stopped';
  /** Acceleration (g) the current leg ramps at; the main loop uses it while city mode is on. */
  rampG = 0.2;
  /** Distance to the light that just turned red (m), while braking. */
  lightM = 0;
  /** This trip's top speed as a multiple of the cruise speed (0.5–1.5), drawn at each pull-away. */
  fraction = 1;
  /** The current leg's target as a share of this trip's top speed. */
  share = 0;
  private legs: Leg[] = [];
  private until = -Infinity;
  private seed: number;

  constructor(seed = 7) { this.seed = seed; }

  /** Start from the current state: ride off if moving, otherwise wait at the light briefly. */
  start(t: number, p: Params) {
    this.phase = 'stopped';
    this.legs = [];
    this.until = p.speed > 0 ? t : t + 1;
  }

  /** Advance at sim time t. Returns true when the phase changed. */
  update(t: number, p: Params): boolean {
    if (t < this.until) return false;
    const toMps = p.speedUnit === 'mph' ? 0.44704 : 1 / 3.6;
    let changed = false;
    if (!this.legs.length) { this.nextPhase(p, toMps); changed = true; }
    const leg = this.legs.shift()!;
    const from = p.speed;
    this.share = leg.share;
    p.speed = p.citySpeed * this.fraction * leg.share;
    this.rampG = leg.g;
    this.until = t + Math.max(leg.hold, (Math.abs(p.speed - from) * toMps) / (leg.g * G));
    return changed;
  }

  /** Move on to the next phase and plan its legs. */
  private nextPhase(p: Params, toMps: number) {
    const topMps = Math.max(0.1, p.citySpeed * this.fraction * toMps); // this trip's top speed
    switch (this.phase) {
      case 'stopped': {
        this.phase = 'go';
        this.fraction = this.between(0.5, 1.5);
        p.braking = false;
        // Pedal power is roughly constant, so the push weakens as the speed builds.
        const g = Math.max(0.02, p.speedRampG) * this.between(0.7, 1.3);
        this.legs = [{ share: 0.4, g: g * 1.4, hold: 0 }, { share: 0.75, g, hold: 0 }, { share: 1, g: g * 0.55, hold: 0.3 }];
        break;
      }
      case 'go': {
        this.phase = 'cruise';
        // A block of 4–12 s: the speed drifts around the trip's top speed, now and then easing
        // off (a turn, a pothole, traffic) and picking up again.
        this.legs = [];
        for (let left = this.between(4, 12); left > 0;) {
          const hold = this.between(1.5, 4);
          const share = this.between(0, 1) < 0.2 ? this.between(0.6, 0.8) : this.between(0.88, 1.1);
          this.legs.push({ share, g: this.between(0.03, 0.08), hold });
          left -= hold;
        }
        break;
      }
      case 'cruise': {
        this.phase = 'brake';
        p.braking = true;
        const v = p.speed * toMps;
        // Equally likely to be near or far (log-uniform). A far light gets a moment of coasting
        // first; then the rider brakes to stop right there, easing off at the very end.
        this.lightM = Math.exp(this.between(Math.log(NEAREST_LIGHT_M), Math.log(FARTHEST_LIGHT_M)));
        const coastS = this.lightM > 12 ? this.between(0.4, 1.2) : 0;
        const v1 = Math.max(0, v - COAST_G * G * coastS);
        const left = Math.max(1, this.lightM - 0.5 * (v + v1) * coastS);
        // Brake at decel down to `ease`, then at half of it (but no gentler than MIN_BRAKE_G).
        const ease = Math.min(v1, EASE_MPS), min = MIN_BRAKE_G * G;
        const easeDecel = (d: number) => Math.max(min, d / 2);
        const stopping = (d: number) => (v1 * v1 - ease * ease) / (2 * d) + (ease * ease) / (2 * easeDecel(d));
        let decel = (v1 * v1 + ease * ease) / (2 * left); // with the ease at half: (v1² − e²)/2d + e²/d
        if (decel < 2 * min) decel = (v1 * v1 - ease * ease) / (2 * Math.max(0.5, left - (ease * ease) / (2 * min)));
        decel = Math.min(MAX_BRAKE_G * G, Math.max(min, decel));
        // Slow, with the light far off: even the gentlest braking would stop short, so ride on first.
        const rollS = v1 > 0.1 ? Math.max(0, left - stopping(decel)) / v1 : 0;
        this.legs = [
          ...(coastS ? [{ share: v1 / topMps, g: COAST_G, hold: 0 }] : []),
          ...(rollS > 0.05 ? [{ share: v1 / topMps, g: COAST_G, hold: rollS }] : []),
          { share: ease / topMps, g: decel / G, hold: 0 },
          { share: 0, g: easeDecel(decel) / G, hold: 0.3 },
        ];
        break;
      }
      case 'brake':
        this.phase = 'stopped';
        this.legs = [{ share: 0, g: this.rampG, hold: this.between(1, 3) }]; // a short wait at the light
        break;
    }
  }

  private between(lo: number, hi: number): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return lo + ((this.seed - 1) / 2147483646) * (hi - lo);
  }
}
