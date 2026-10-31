import type { Params } from '../params';
import type { Derived } from '../sim/timing';
import { type AnimSpec, magnetAccel, magnetOmega, type WheelMotion } from '../sim/firmware';
import { SmileyBody } from '../sim/rigid';
import { makePattern } from './load';
import { ledPositions, ledRadius, rowCount } from './polarize';

const GRAVITY = 9.81;
const FRAMES = 64;          // ring buffer layers, as for the water
const MAX_CATCH_UP = 10;    // steps per animation frame before skipping ahead
const IMAGE = 64;           // the smiley bitmap the firmware keeps (pixels across)
const SIZE = 0.75;          // the smiley's radius as a fraction of the LEDs' reach

/**
 * The bouncing smiley's live content: a rigid disc three quarters the size of the LEDs' reach, loose inside
 * the wheel (see SmileyBody). Like the water, the firmware steps it at the physics rate from what
 * the magnet tells it and paints each step: every LED shows the smiley's pixel at its position.
 */
export class SmileySource {
  body?: SmileyBody;
  data = new Uint8Array(4) as Uint8Array<ArrayBuffer>;
  width = 1;
  height = 1;
  meanDuty = 0;
  aEstimate = 0;       // what the firmware believes (filtered), m/s²
  private pos?: Float32Array;   // each LED's position (x, y) per column, upright and hub-centred
  private image?: Uint8ClampedArray;
  private bodyKey = '';
  private posKey = '';
  private lastStep = -1;
  private wallWidth = 0.01;     // thickness the walls are drawn at (m)

  spec(p: Params): AnimSpec {
    return { frames: FRAMES, fps: p.waterHz, timed: true, revsPerFrame: 1, rate: 1, live: true };
  }

  /** Bring the simulation up to time t. Returns the ring-buffer layers that changed. */
  sync(p: Params, d: Derived, motion: WheelMotion, t: number): number[] {
    let fresh = false;
    const bodyKey = String(d.rEnd);
    if (bodyKey !== this.bodyKey) {
      this.bodyKey = bodyKey;
      this.body = new SmileyBody(d.rEnd * SIZE, d.rEnd);
      this.aEstimate = 0;
      fresh = true;
    }
    const posKey = [p.columnsPerRev, p.stripCount, d.ledsPerStrip, d.rStart, d.pitch, p.backData, p.imageRotationDeg].join('|');
    if (posKey !== this.posKey) {
      this.posKey = posKey;
      this.pos = ledPositions(p, d);
      this.width = p.columnsPerRev;
      this.height = rowCount(p, d);
      this.data = new Uint8Array(this.width * this.height * 4 * FRAMES);
      fresh = true;
    }
    this.image ??= smileyImage();
    const body = this.body!;
    body.bounce = p.smileyBounce;
    body.grip = p.smileyGrip;
    this.wallWidth = d.pitch * 1.5;

    const hz = p.waterHz, dt = 1 / hz;
    const target = Math.floor(t * hz);
    if (fresh || this.lastStep < 0 || target - this.lastStep > MAX_CATCH_UP) this.lastStep = target - 1;
    const smooth = 1 - Math.exp(-dt / Math.max(1e-3, p.accelSmoothMs / 1000));
    const changed: number[] = [];
    for (let k = this.lastStep + 1; k <= target; k++) {
      this.aEstimate += (magnetAccel(p, motion, k * dt) - this.aEstimate) * smooth;
      // Braking (negative acceleration) throws the smiley forward. The round wall turns clockwise
      // with the wheel, as the firmware measures it, and drags the smiley where they touch.
      body.step(dt, -this.aEstimate * p.smileyGain, -GRAVITY, magnetOmega(p, motion, k * dt));
      const layer = ((k % FRAMES) + FRAMES) % FRAMES;
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

  /** Firmware memory: the smiley bitmap and the body's state (LED positions come from the angle). */
  ramBytes(): number {
    return IMAGE * IMAGE * 3 + 64;
  }

  private paint(p: Params, d: Derived, layer: number) {
    const size = this.width * this.height * 4;
    const out = this.data.subarray(layer * size, (layer + 1) * size);
    const b = this.body!, pos = this.pos!, img = this.image!;
    const cos = Math.cos(b.angle), sin = Math.sin(b.angle), inv = 1 / b.r;
    // The face is centred on the disc's middle (its centre of mass sits lower, near the mouth).
    const mid = b.centre();
    // The wall, drawn as a light blue ring under the smiley.
    const wall = [0.35, 0.7, 1.0].map((c) => Math.pow(c, p.gamma)), half = this.wallWidth / 2;
    const C = p.columnsPerRev, n = d.ledsPerStrip;
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.pow(i / 255, p.gamma);
    let sum = 0;
    for (let idx = 0; idx < pos.length / 2; idx++) {
      const o = idx * 4;
      // Into the smiley's own frame: relative to its centre, turned back by its angle.
      const dx = pos[idx * 2] - mid.x, dy = pos[idx * 2 + 1] - mid.y;
      const u = (cos * dx + sin * dy) * inv, v = (-sin * dx + cos * dy) * inv;
      if (u * u + v * v > 1) {
        const onWall = Math.abs(b.wallDistance(pos[idx * 2], pos[idx * 2 + 1]) + half) < half;
        for (let ch = 0; ch < 3; ch++) {
          const val = onWall ? wall[ch] : 0;
          out[o + ch] = Math.round(val * 255);
          sum += val;
        }
        out[o + 3] = 255;
        continue;
      }
      const px = Math.min(IMAGE - 1, Math.floor(((u + 1) / 2) * IMAGE));
      const py = Math.min(IMAGE - 1, Math.floor(((1 - v) / 2) * IMAGE));
      const k = Math.floor(idx / C) % n;
      const comp = p.radialCompensation ? ledRadius(d, k) / d.rEnd : 1;
      const src = (py * IMAGE + px) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const val = lut[img[src + ch]] * comp;
        out[o + ch] = Math.round(val * 255);
        sum += val;
      }
      out[o + 3] = 255;
    }
    this.meanDuty = sum / ((pos.length / 2) * 3);
  }
}

/** The smiley face, scaled down to the bitmap the firmware keeps. */
function smileyImage(): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = c.height = IMAGE;
  const g = c.getContext('2d')!;
  g.drawImage(makePattern('Smiley', ''), 0, 0, IMAGE, IMAGE);
  return g.getImageData(0, 0, IMAGE, IMAGE).data;
}
