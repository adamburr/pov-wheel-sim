import type { Params } from '../params';

export type CityPhase = 'go' | 'cruise' | 'brake' | 'stopped';

/**
 * Stop-and-go city riding: speed up to the cruise speed, ride a block, brake for a light,
 * wait, repeat. It only changes the target speed and braking flag, so the bike, the magnet
 * firmware and the water all respond exactly as they do to a rider.
 */
export class CityRide {
  phase: CityPhase = 'stopped';
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
    const cruise = Math.max(0.1, p.citySpeed) * toMps;
    switch (this.phase) {
      case 'stopped':
        this.phase = 'go';
        p.speed = p.citySpeed; p.braking = false;
        this.until = t + cruise / (Math.max(0.02, p.speedRampG) * 9.81);
        break;
      case 'go':
        this.phase = 'cruise';
        this.until = t + this.between(4, 12);
        break;
      case 'cruise':
        this.phase = 'brake';
        p.speed = 0; p.braking = true;
        this.until = t + cruise / (Math.max(0.02, p.brakeG) * 9.81) + 0.3;
        break;
      case 'brake':
        this.phase = 'stopped';
        this.until = t + this.between(2, 6);
        break;
    }
    return true;
  }

  private between(lo: number, hi: number): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return lo + ((this.seed - 1) / 2147483646) * (hi - lo);
  }
}
