/**
 * How hard the rider has to push. Pedal strokes deliver that push in two pulses per crank turn,
 * so the stronger the push, the stronger the surge: big when pulling away, gentle when
 * cruising (only air drag and rolling resistance to overcome), none when coasting or braking.
 */

/** Typical city bike plus rider. */
export const RIDER = { massKg: 85, cdA: 0.4, crr: 0.005, airDensity: 1.2 };
const G = 9.81;

/** Resistance to motion at speed v (m/s), in newtons: air drag plus rolling resistance. */
export function resistance(v: number): number {
  return v > 0 ? 0.5 * RIDER.airDensity * RIDER.cdA * v * v + RIDER.crr * RIDER.massKg * G : 0;
}

/** Force the rider must push with to accelerate at a (m/s²) at speed v; ≤ 0 means no pedalling. */
export function riderForce(v: number, a: number): number {
  return RIDER.massKg * a + resistance(v);
}

/** Estimated rider power (W). */
export function riderPower(v: number, a: number): number {
  return Math.max(0, riderForce(v, a)) * v;
}

/**
 * Turn one "pedal surge" setting (each stroke pulses the push by ±surge) into the two amounts
 * the motion model uses:
 * - cruise: speed swing while holding speed v, as a fraction of v;
 * - ramp: how deeply the acceleration a pulses while speeding up from vFrom to vTo (0..0.9).
 * omega is the pulse rate in rad/s (two strokes per crank turn).
 */
export function pedalSurge(surge: number, vFrom: number, vTo: number, a: number, omega: number) {
  const cruise = vTo > 0 ? (surge * resistance(vTo)) / (RIDER.massKg * omega * vTo) : 0;
  const ramp = a > 0 ? Math.min(0.9, (surge * riderForce(0.5 * (vFrom + vTo), a)) / (RIDER.massKg * a)) : 0;
  return { cruise, ramp };
}
