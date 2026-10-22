import type { Params } from '../params';
import type { Derived } from '../sim/timing';
import { type AnimSpec, magnetAccel, magnetOmega, type WheelMotion } from '../sim/firmware';
import { RibbonDryer } from '../sim/ribbons';
import { ledPositions, ledRadius, rowCount } from './polarize';

const GRAVITY = 9.81;
const FRAMES = 64;          // ring buffer layers, as for the water
const MAX_CATCH_UP = 10;    // steps per animation frame before skipping ahead
const IMAGE = 64;           // the bitmap the firmware draws each step into (pixels across)
const SHADES = 6;           // colour steps along each ribbon
const DRUM = 255;           // palette index for the drum and paddles

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

/**
 * The tumble dryer's live content: ribbons tumbling in the drum (see RibbonDryer). Like the
 * water, the firmware steps it at the physics rate from what the magnet tells it. Each step it
 * draws the drum, its paddles and the ribbons into a small palette bitmap, back to front in
 * their current depth order, and every LED shows the bitmap's pixel at its position.
 */
export class RibbonSource {
  dryer?: RibbonDryer;
  data = new Uint8Array(4) as Uint8Array<ArrayBuffer>;
  width = 1;
  height = 1;
  meanDuty = 0;
  aEstimate = 0;       // what the firmware believes (filtered), m/s²
  private pos?: Float32Array;
  private bitmap = new Uint8Array(IMAGE * IMAGE);
  private palette = new Float32Array(256 * 3);
  private ring?: Uint16Array;   // bitmap pixels on the drum's rim
  private dryerKey = '';
  private posKey = '';
  private lastStep = -1;

  spec(p: Params): AnimSpec {
    return { frames: FRAMES, fps: p.waterHz, timed: true, revsPerFrame: 1, rate: 1, live: true };
  }

  /** Bring the simulation up to time t. Returns the ring-buffer layers that changed. */
  sync(p: Params, d: Derived, motion: WheelMotion, t: number): number[] {
    let fresh = false;
    const ribbons = Math.round(Math.min(10, Math.max(3, p.dryerRibbons)));
    const dryerKey = [d.rEnd, ribbons].join('|');
    if (dryerKey !== this.dryerKey) {
      this.dryerKey = dryerKey;
      this.dryer = new RibbonDryer(d.rEnd, ribbons);
      this.ring = rimPixels(d.rEnd * 0.94);
      this.aEstimate = 0;
      fresh = true;
    }
    const posKey = [p.columnsPerRev, p.stripCount, d.ledsPerStrip, d.rStart, d.pitch, p.doubleSided, p.backData,
      p.radialStagger, p.imageRotationDeg].join('|');
    if (posKey !== this.posKey) {
      this.posKey = posKey;
      this.pos = ledPositions(p, d);
      this.width = p.columnsPerRev;
      this.height = rowCount(p, d);
      this.data = new Uint8Array(this.width * this.height * 4 * FRAMES);
      fresh = true;
    }
    const dryer = this.dryer!;
    dryer.grip = p.dryerGrip;
    dryer.shuffle = p.dryerShuffle;

    const hz = p.waterHz, dt = 1 / hz;
    const target = Math.floor(t * hz);
    if (fresh || this.lastStep < 0 || target - this.lastStep > MAX_CATCH_UP) this.lastStep = target - 1;
    const smooth = 1 - Math.exp(-dt / Math.max(1e-3, p.accelSmoothMs / 1000));
    const changed: number[] = [];
    for (let k = this.lastStep + 1; k <= target; k++) {
      this.aEstimate += (magnetAccel(p, motion, k * dt) - this.aEstimate) * smooth;
      // Braking throws the ribbons forward. The drum turns clockwise with the wheel, as the
      // firmware measures it, geared down so they tumble instead of pinning to the rim.
      dryer.step(dt, -this.aEstimate * p.dryerGain, -GRAVITY, magnetOmega(p, motion, k * dt) * p.dryerDrumTurn);
      const layer = ((k % FRAMES) + FRAMES) % FRAMES;
      this.draw(p);
      this.paint(p, d, layer);
      changed.push(layer);
    }
    this.lastStep = target;
    if (fresh) {
      const layer = ((target % FRAMES) + FRAMES) % FRAMES, size = this.width * this.height * 4;
      for (let l = 0; l < FRAMES; l++) if (l !== layer) this.data.copyWithin(l * size, layer * size, (layer + 1) * size);
      return Array.from({ length: FRAMES }, (_, l) => l);
    }
    return changed;
  }

  /** Firmware memory: the palette bitmap, the palette and the ribbons' points. */
  ramBytes(): number {
    const d = this.dryer;
    return IMAGE * IMAGE + 256 * 3 + (d ? d.pos.length * 8 + d.count * 4 : 0);
  }

  /** Draw this step into the bitmap: drum and paddles, then the ribbons back to front. */
  private draw(p: Params) {
    const dr = this.dryer!, R = dr.R, bmp = this.bitmap, scale = IMAGE / (2 * R);
    bmp.fill(0);
    for (const i of this.ring!) bmp[i] = DRUM;
    const stamp = (x: number, y: number, radius: number, index: number) => {
      const cx = (x + R) * scale, cy = (R - y) * scale, rr = radius * radius;
      for (let py = Math.max(0, Math.floor(cy - radius)); py <= Math.min(IMAGE - 1, Math.ceil(cy + radius)); py++) {
        for (let px = Math.max(0, Math.floor(cx - radius)); px <= Math.min(IMAGE - 1, Math.ceil(cx + radius)); px++) {
          const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
          if (dx * dx + dy * dy <= rr) bmp[py * IMAGE + px] = index;
        }
      }
    };
    const line = (x0: number, y0: number, x1: number, y1: number, radius: number, index: number) => {
      const steps = Math.max(1, Math.ceil((Math.hypot(x1 - x0, y1 - y0) * scale) / 0.7));
      for (let s = 0; s <= steps; s++) stamp(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, radius, index);
    };
    // Paddles: short bars from the rim inward, turning with the drum.
    for (let k = 0; k < dr.paddles; k++) {
      const a = dr.drumAngle + (k * 2 * Math.PI) / dr.paddles, ux = Math.cos(a), uy = Math.sin(a);
      const r0 = R - dr.paddleLength;
      line(ux * r0, uy * r0, ux * R, uy * R, dr.finHalf * scale * 1.25, DRUM);
    }
    // Ribbons: back to front, opaque, so a nearer ribbon covers the ones behind. The palette is
    // rebuilt each step so each ribbon's brightness follows its current depth.
    const width = 1.25 * dr.halfWidth * scale; // a little over the collision half-width, so they reach the rim
    dr.order.forEach((r, depth) => {
      const shade = 0.65 + (0.35 * depth) / Math.max(1, dr.count - 1);
      for (let g = 0; g < SHADES; g++) {
        const rgb = hsl((r / dr.count + (0.15 * g) / SHADES) % 1, 1, 0.55);
        for (let ch = 0; ch < 3; ch++) this.palette[(1 + r * SHADES + g) * 3 + ch] = Math.pow(rgb[ch] * shade, p.gamma);
      }
      for (let k = 0; k < dr.points - 1; k++) {
        const i = (r * dr.points + k) * 2;
        const g = Math.min(SHADES - 1, Math.floor((k / (dr.points - 1)) * SHADES));
        line(dr.pos[i], dr.pos[i + 1], dr.pos[i + 2], dr.pos[i + 3], width, 1 + r * SHADES + g);
      }
    });
    const enamel = [0.85, 0.92, 1.0]; // the drum and paddles: white, a little cool
    for (let ch = 0; ch < 3; ch++) this.palette[DRUM * 3 + ch] = Math.pow(enamel[ch], p.gamma);
  }

  private paint(p: Params, d: Derived, layer: number) {
    const size = this.width * this.height * 4;
    const out = this.data.subarray(layer * size, (layer + 1) * size);
    const pos = this.pos!, R = this.dryer!.R, scale = IMAGE / (2 * R), C = p.columnsPerRev, n = d.ledsPerStrip;
    let sum = 0;
    for (let idx = 0; idx < pos.length / 2; idx++) {
      const o = idx * 4;
      const px = Math.floor((pos[idx * 2] + R) * scale), py = Math.floor((R - pos[idx * 2 + 1]) * scale);
      const index = px >= 0 && py >= 0 && px < IMAGE && py < IMAGE ? this.bitmap[py * IMAGE + px] : 0;
      const comp = index && p.radialCompensation ? ledRadius(p, d, 0, Math.floor(idx / C) % n) / d.rEnd : 1;
      for (let ch = 0; ch < 3; ch++) {
        const val = index ? this.palette[index * 3 + ch] * comp : 0;
        out[o + ch] = Math.round(val * 255);
        sum += val;
      }
      out[o + 3] = 255;
    }
    this.meanDuty = sum / ((pos.length / 2) * 3);
  }
}

/** The bitmap's pixels whose centres lie in the rim band, from radius `inner` to the edge. */
function rimPixels(inner: number): Uint16Array {
  const out: number[] = [], R = inner / 0.94, scale = IMAGE / (2 * R);
  for (let py = 0; py < IMAGE; py++) {
    for (let px = 0; px < IMAGE; px++) {
      const r = Math.hypot((px + 0.5) / scale - R, R - (py + 0.5) / scale);
      if (r >= inner && r <= R) out.push(py * IMAGE + px);
    }
  }
  return Uint16Array.from(out);
}
