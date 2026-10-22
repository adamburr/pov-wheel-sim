import type { Params } from '../params';

export type CityPhase = 'go' | 'cruise' | 'brake' | 'stopped';

const G = 9.81;
const NEAREST_LIGHT_M = 3;   // light turns red just ahead: a hard stop
const FARTHEST_LIGHT_M = 40; // spotted far off: a long, gentle roll-down
const MAX_BRAKE_G = 0.7;
const MIN_BRAKE_G = 0.03;

/**
 * Stop-and-go city riding: pull away, ride a block, brake for a light, wait, repeat. Each trip
 * tops out at a different speed (half to one and a half times the cruise speed) and pulls away
 * a little differently; each light turns red at a random distance ahead, and the rider brakes
 * just hard enough to stop there (v²/2d), so some stops are sharp and others slow.
 * It only sets the target speed and the ramp rate, so the bike, the magnet firmware and the
 * water all respond exactly as they do to a rider.
 */
export class CityRide {
  phase: CityPhase = 'stopped';
  /** Acceleration (g) the current phase ramps at; the main loop uses it while city mode is on. */
  rampG = 0.2;
  /** Distance to the light that just turned red (m), while braking. */
  lightM = 0;
  /** This trip's top speed as a multiple of the cruise speed (0.5–1.5), drawn at each pull-away. */
  fraction = 1;
  private until = -Infinity;
  private seed: number;

  constructor(seed = 7) { this.seed = seed; }

  /** Start from the current state: ride off if moving, otherwise wait at the light briefly. */
  start(t: number, p: Params) {
    this.phase = 'stopped';
    this.until = p.speed > 0 ? t : t + 1;
  }

  /** Advance at sim time t. Returns true when the phase changed (so the UI can refresh). */
  update(t: number, p: Params): boolean {
    if (t < this.until) return false;
    const toMps = p.speedUnit === 'mph' ? 0.44704 : 1 / 3.6;
    switch (this.phase) {
      case 'stopped': {
        this.phase = 'go';
        // Each trip tops out somewhere between half and one and a half times the cruise speed.
        this.fraction = this.between(0.5, 1.5);
        p.speed = p.citySpeed * this.fraction; p.braking = false;
        this.rampG = Math.max(0.02, p.speedRampG) * this.between(0.7, 1.3);
        // Pedal strokes pulse the acceleration but average out, plus a little to settle.
        this.until = t + (Math.max(0.1, p.speed) * toMps) / (this.rampG * G) + 0.5;
        break;
      }
      case 'go':
        this.phase = 'cruise';
        this.until = t + this.between(4, 12);
        break;
      case 'cruise': {
        this.phase = 'brake';
        const cruise = Math.max(0.1, p.speed) * toMps; // this trip's top speed
        // Equally likely to be near or far (log-uniform), then brake to stop right there.
        this.lightM = Math.exp(this.between(Math.log(NEAREST_LIGHT_M), Math.log(FARTHEST_LIGHT_M)));
        const decel = Math.min(MAX_BRAKE_G * G, Math.max(MIN_BRAKE_G * G, (cruise * cruise) / (2 * this.lightM)));
        this.rampG = decel / G;
        p.speed = 0; p.braking = true;
        this.until = t + cruise / decel + 0.3;
        break;
      }
      case 'brake':
        this.phase = 'stopped';
        this.until = t + this.between(1, 3); // a short wait at the light
        break;
    }
    return true;
  }

  private between(lo: number, hi: number): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return lo + ((this.seed - 1) / 2147483646) * (hi - lo);
  }
}
