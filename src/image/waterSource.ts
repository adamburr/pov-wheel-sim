import type { Params } from '../params';
import type { Derived } from '../sim/timing';
import { type AnimSpec, magnetAccel, magnetOmega, type WheelMotion } from '../sim/firmware';
import { WaterSim } from '../sim/water';
import { renderWater, rowCount, waterCellM, waterLut } from './polarize';

const GRAVITY = 9.81;
const FRAMES = 64;          // ring buffer layers: 64 steps at 30 Hz cover the 2 s maximum shutter
const MAX_CATCH_UP = 10;    // steps per animation frame before skipping ahead

/**
 * Water mode's live content. The firmware steps a fluid simulation at waterHz and paints each
 * step through its LED lookup table. Here every step lands in one layer of a ring buffer, and
 * timed frame selection at waterHz replays exactly the step that was current when each LED
 * update was sent.
 */
export class WaterSource {
  sim?: WaterSim;
  data = new Uint8Array(4) as Uint8Array<ArrayBuffer>;
  width = 1;
  height = 1;
  meanDuty = 0;
  aEstimate = 0;       // what the firmware believes (filtered), m/s²
  aTrue = 0;
  wallSpeed = 0;       // rim speed the firmware applies (m/s)
  private lut?: Int32Array;
  private simKey = '';
  private lutKey = '';
  private lastStep = -1;

  spec(p: Params): AnimSpec {
    return { frames: FRAMES, fps: p.waterHz, timed: true, revsPerFrame: 1, rate: 1, live: true };
  }

  /** Bring the simulation up to time t. Returns the ring-buffer layers that changed. */
  sync(p: Params, d: Derived, motion: WheelMotion, t: number): number[] {
    const changed: number[] = [];
    const simKey = [p.waterGrid, p.waterFill, d.rEnd].join('|');
    const lutKey = [simKey, p.columnsPerRev, p.stripCount, d.ledsPerStrip, d.rStart, d.pitch, p.doubleSided,
      p.backData, p.radialStagger, p.imageRotationDeg].join('|');
    let fresh = false;
    if (simKey !== this.simKey) {
      this.simKey = simKey;
      this.sim = new WaterSim({ grid: p.waterGrid, fill: p.waterFill, cellM: waterCellM(d, p.waterGrid) });
      // Start with the water already settled at the bottom.
      for (let k = 0; k < 45; k++) this.sim.step(1 / 30, 0, -GRAVITY);
      this.aEstimate = 0;
      fresh = true;
    }
    if (lutKey !== this.lutKey) {
      this.lutKey = lutKey;
      // Draw from the 2× render map: each LED reads a cell half the size of a simulation cell.
      this.lut = waterLut(p, d, 2 * p.waterGrid, waterCellM(d, p.waterGrid) / 2);
      this.width = p.columnsPerRev;
      this.height = rowCount(p, d);
      this.data = new Uint8Array(this.width * this.height * 4 * FRAMES);
      fresh = true;
    }
    const sim = this.sim!;
    sim.iterations = p.waterIters;
    sim.flip = p.waterFlip;
    sim.viscosity = p.waterViscosity;
    sim.separation = p.waterSeparation;
    sim.rimFriction = p.rimFriction;

    const hz = p.waterHz, dt = 1 / hz;
    const target = Math.floor(t * hz);
    if (fresh || this.lastStep < 0 || target - this.lastStep > MAX_CATCH_UP) this.lastStep = target - 1;
    const smooth = 1 - Math.exp(-dt / Math.max(1e-3, p.accelSmoothMs / 1000));
    for (let k = this.lastStep + 1; k <= target; k++) {
      this.aEstimate += (magnetAccel(p, motion, k * dt) - this.aEstimate) * smooth;
      // Braking (negative acceleration) throws the water forward, +x on the drive side. The rim
      // turns clockwise at the firmware's measured spin rate and drags the water touching it.
      this.wallSpeed = magnetOmega(p, motion, k * dt) * d.rEnd;
      sim.step(dt, -this.aEstimate * p.waterGain, -GRAVITY, this.wallSpeed);
      const layer = ((k % FRAMES) + FRAMES) % FRAMES;
      this.paint(p, d, layer);
      changed.push(layer);
    }
    this.lastStep = target;
    this.aTrue = motion.accel(t);
    if (fresh) {
      // Fill the whole ring so exposures reaching back before the first step see water too.
      const layer = ((target % FRAMES) + FRAMES) % FRAMES, size = this.width * this.height * 4;
      for (let l = 0; l < FRAMES; l++) if (l !== layer) this.data.copyWithin(l * size, layer * size, (layer + 1) * size);
      return Array.from({ length: FRAMES }, (_, l) => l);
    }
    return changed;
  }

  /** Firmware memory: the LED lookup table plus the simulation's particles, grids and render map. */
  ramBytes(): number {
    if (!this.sim || !this.lut) return 0;
    const n = this.sim.n, m = this.sim.renderN;
    return this.lut.length * 2 + this.sim.count * 16 + (n + 1) * (n + 1) * 6 * 4 + n * n * 4 * 4 + m * m * 3 * 4;
  }

  private paint(p: Params, d: Derived, layer: number) {
    const size = this.width * this.height * 4;
    const out = this.data.subarray(layer * size, (layer + 1) * size);
    this.meanDuty = renderWater(this.sim!, this.lut!, p, d, out);
  }
}
