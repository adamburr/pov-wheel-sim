import { CHIP, LED, type Params, speedMps } from '../params';

// Geometry and LED-bus timing derived from the parameters. All lengths in metres, times in seconds.
export interface Derived {
  tireRadius: number;      // rolling radius
  rimRadius: number;       // bead seat radius
  maxLedRadius: number;    // inner edge of the rim minus clearance
  rStart: number;
  stripLength: number;
  ledsPerStrip: number;
  pitch: number;
  rEnd: number;
  halfWidth: number;       // half of the emitter footprint incl. diffusion
  circumference: number;
  revPerSec: number;
  stripUnits: number;      // strips that carry their own data (back strips count when independent)
  ledsPerLane: number;
  bitsPerLane: number;
  transferS: number;
  columnTimeS: number;
  maxColumnRate: number;
  latchBaseS: number;      // delay from column start until LED 0 of a chain shows new data
  latchPerLedS: number;    // additional delay per LED further down the chain
  clocked: boolean;
}

/** The simulator keeps the LEDs this far inside the rim wall: the panels' tip clearance and strip end. */
export const LED_RIM_CLEAR_MM = 5;

export function clockedFrameBits(nLeds: number): number {
  // 32-bit start frame, 32 bits per LED, end frame of at least n/2 clocks rounded up to a byte.
  return 32 + 32 * nLeds + Math.max(32, Math.ceil(nLeds / 16) * 8);
}

export function derive(p: Params): Derived {
  const led = LED;
  const rimRadius = p.bsdMm / 2000;
  const tireRadius = rimRadius + p.tireMm / 1000;
  const maxLedRadius = rimRadius - p.rimDepthMm / 1000 - LED_RIM_CLEAR_MM / 1000;
  const rStart = p.stripStartMm / 1000;
  const pitch = 1 / p.ledDensity;
  const maxLength = Math.max(0, maxLedRadius - rStart);
  const stripLength = p.autoLength ? maxLength : Math.min(p.stripLengthMm / 1000, maxLength);
  const ledsPerStrip = Math.max(1, Math.floor(stripLength / pitch + 1e-6));
  const circumference = 2 * Math.PI * tireRadius;
  const revPerSec = speedMps(p) / circumference;

  const stripUnits = p.stripCount * (p.doubleSided && p.backData === 'independent' ? 2 : 1);
  const lanes = lanesFor(stripUnits);
  const ledsPerLane = Math.ceil(stripUnits / lanes) * ledsPerStrip;
  const clocked = led.protocol === 'clocked';
  const clockHz = (clocked ? p.clockMHz : led.maxClockMHz) * 1e6;
  const bitsPerLane = clocked ? clockedFrameBits(ledsPerLane) : led.bitsPerLed * ledsPerLane;
  const transferS = bitsPerLane / clockHz + (clocked ? 0 : led.resetUs * 1e-6);
  const columnTimeS = transferS + p.overheadUs * 1e-6;

  return {
    tireRadius, rimRadius, maxLedRadius, rStart, stripLength, ledsPerStrip, pitch,
    rEnd: rStart + ledsPerStrip * pitch,
    halfWidth: (p.dieMm / 2 + p.diffusionMm) / 1000,
    circumference, revPerSec, stripUnits, ledsPerLane, bitsPerLane, transferS, columnTimeS,
    maxColumnRate: 1 / columnTimeS,
    // Clocked parts (APA102 family) show new data as soon as their own 32 bits arrive, so the
    // update ripples outward along the chain. Single-wire parts all latch after the reset gap.
    latchBaseS: clocked ? 64 / clockHz : transferS,
    latchPerLedS: clocked ? 32 / clockHz : 0,
    clocked,
  };
}

/** Integral over [a, b] of a square wave (on for the first `duty` of each `period`, offset by `phase`). */
export function squareIntegral(a: number, b: number, duty: number, period: number, phase: number): number {
  if (period <= 0 || duty >= 1) return (b - a) * Math.min(duty, 1);
  const F = (t: number) => {
    const x = t + phase;
    const m = x - Math.floor(x / period) * period;
    return Math.floor(x / period) * duty * period + Math.min(m, duty * period);
  };
  return F(b) - F(a);
}

/** Parallel data lanes: PIO gives every strip its own (up to the chip's limit); more strips chain. */
export function lanesFor(stripUnits: number): number {
  return Math.max(1, Math.min(CHIP.maxLanes, stripUnits));
}
