import { CHIP, LED, type Params, speedMps } from '../params';
import { ledSpanOf } from '../panels/fromParams';

// Geometry and LED-bus timing derived from the parameters. All lengths in metres, times in seconds.
export interface Derived {
  tireRadius: number;      // rolling radius
  rimRadius: number;       // bead seat radius
  rimWallR: number;        // the rim's inner wall: the wheel's, or just outside a measured tip that wouldn't fit inside it
  rimNote: string;         // says so when it is
  rStart: number;          // inner end of the first pixel
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
}

export function clockedFrameBits(nLeds: number): number {
  // 32-bit start frame, 32 bits per LED, end frame of at least n/2 clocks rounded up to a byte.
  return 32 + 32 * nLeds + Math.max(32, Math.ceil(nLeds / 16) * 8);
}

export function derive(p: Params): Derived {
  // where the panels hold the LEDs: laid from the blade tip in, whole pixels. A measured tip that
  // doesn't fit inside this rim makes the panels assume a rim just outside it, and so does the simulator.
  const span = ledSpanOf(p);
  const rimWallR = span.rimWallR / 1000;
  const rimRadius = Math.max(p.bsdMm / 2000, rimWallR + p.rimDepthMm / 1000);
  const tireRadius = rimRadius + p.tireMm / 1000;
  const pitch = 1 / LED.perM;
  // at least one LED, inside the tip, however small the wheel
  const ledsPerStrip = Math.max(1, span.ledsPerStrip);
  const rStart = Math.max(0, span.ledStart / 1000 - (ledsPerStrip - span.ledsPerStrip) * pitch);
  const circumference = 2 * Math.PI * tireRadius;
  const revPerSec = speedMps(p) / circumference;

  const stripUnits = p.stripCount * (p.backData === 'independent' ? 2 : 1);
  const lanes = lanesFor(stripUnits);
  const ledsPerLane = Math.ceil(stripUnits / lanes) * ledsPerStrip;
  const clockHz = p.clockMHz * 1e6;
  const bitsPerLane = clockedFrameBits(ledsPerLane);
  const transferS = bitsPerLane / clockHz;
  const columnTimeS = transferS + CHIP.overheadUs * 1e-6;

  return {
    tireRadius, rimRadius, rimWallR, rimNote: span.rimNote, rStart, ledsPerStrip, pitch,
    rEnd: rStart + ledsPerStrip * pitch,
    halfWidth: (LED.dieMm / 2 + p.diffusionMm) / 1000,
    circumference, revPerSec, stripUnits, ledsPerLane, bitsPerLane, transferS, columnTimeS,
    maxColumnRate: 1 / columnTimeS,
    // The SK9822 shows new data as soon as its own 32 bits arrive, so the update ripples outward
    // along the chain.
    latchBaseS: 64 / clockHz,
    latchPerLedS: 32 / clockHz,
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
