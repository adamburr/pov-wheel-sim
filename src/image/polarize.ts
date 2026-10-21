import type { Params } from '../params';
import type { Derived } from '../sim/timing';

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

export interface ColumnBuffer {
  data: Uint8Array<ArrayBuffer>;   // RGBA8, width = columns, height = rows; RGB holds PWM duty bytes
  columns: number;
  rows: number;
  meanDuty: number;   // average duty across channels, for current estimates
}

/** Row layout shared with the shader: row = (back * stripCount + strip) * ledsPerStrip + led. */
export function rowCount(p: Params, d: Derived): number {
  const backRows = p.doubleSided && p.backData === 'independent' ? 2 : 1;
  return backRows * p.stripCount * d.ledsPerStrip;
}

export function ledRadius(p: Params, d: Derived, strip: number, led: number): number {
  const stagger = p.radialStagger ? (strip / p.stripCount) * d.pitch : 0;
  return d.rStart + stagger + (led + 0.5) * d.pitch;
}

/**
 * Convert an image into what the firmware would hold: one PWM-duty triple per LED per column.
 * 'polar' resamples a picture so it appears undistorted on the wheel. 'columns' reproduces the
 * Adafruit format, where each bitmap column is one angular slice and rows map straight to LEDs.
 */
/** Bilinear sampler returning PWM duty (after LED gamma), accumulated into acc. */
function dutySampler(img: Pixels, gamma: number) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.pow(i / 255, gamma);
  return (u: number, v: number, acc: number[]) => {
    // Bilinear sample at normalised (u, v), converted to PWM duty. Outside the image is black;
    // taps just past the edge clamp so border pixels keep full weight.
    if (u < 0 || v < 0 || u > 1 || v > 1) return;
    const x = u * img.width - 0.5, y = v * img.height - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for (let j = 0; j < 4; j++) {
      const xi = Math.min(img.width - 1, Math.max(0, x0 + (j & 1)));
      const yi = Math.min(img.height - 1, Math.max(0, y0 + (j >> 1)));
      const w = ((j & 1) ? fx : 1 - fx) * ((j >> 1) ? fy : 1 - fy);
      const o = (yi * img.width + xi) * 4;
      const a = img.data[o + 3] / 255;
      acc[0] += w * a * lut[img.data[o]];
      acc[1] += w * a * lut[img.data[o + 1]];
      acc[2] += w * a * lut[img.data[o + 2]];
    }
  };
}

export function polarize(img: Pixels, p: Params, d: Derived): ColumnBuffer {
  const C = p.columnsPerRev;
  const n = d.ledsPerStrip;
  const rows = rowCount(p, d);
  const out = new Uint8Array(C * rows * 4);
  const sample = dutySampler(img, p.gamma);
  const levels = (1 << Math.max(1, Math.min(8, p.colorBits))) - 1;
  const rot = (p.imageRotationDeg * Math.PI) / 180;
  const dTheta = (Math.PI * 2) / C;
  const fitR = d.rEnd;
  let sum = 0;

  const backs = p.doubleSided && p.backData === 'independent' ? 2 : 1;
  const acc = [0, 0, 0];
  const SA = 4, SR = 3; // area-average sub-samples across each column arc and LED pitch

  for (let back = 0; back < backs; back++) {
    for (let s = 0; s < p.stripCount; s++) {
      for (let k = 0; k < n; k++) {
        const row = (back * p.stripCount + s) * n + k;
        const rk = ledRadius(p, d, s, k);
        const comp = p.radialCompensation ? rk / d.rEnd : 1;
        for (let c = 0; c < C; c++) {
          acc[0] = acc[1] = acc[2] = 0;
          if (p.mapping === 'polar') {
            for (let i = 0; i < SA; i++) {
              // Rotation-frame angle runs clockwise as seen from the drive side.
              const th = -((c + (i + 0.5) / SA) * dTheta + rot);
              for (let j = 0; j < SR; j++) {
                let r = rk + ((j + 0.5) / SR - 0.5) * d.pitch;
                if (p.fit === 'annulus') r = ((r - d.rStart) / (d.rEnd - d.rStart)) * fitR;
                let x = r * Math.cos(th);
                const y = r * Math.sin(th);
                if (back) x = -x; // independent back strips get a mirrored image so it reads correctly
                sample(x / (2 * fitR) + 0.5, 0.5 - y / (2 * fitR), acc);
              }
            }
            acc[0] /= SA * SR; acc[1] /= SA * SR; acc[2] /= SA * SR;
          } else {
            // Adafruit layout: scale the bitmap to LED height, repeat it around the wheel.
            const w = Math.max(1, Math.round((img.width * n) / img.height));
            const col = back ? C - 1 - c : c;
            const u = ((col % w) + 0.5) / w;
            const v = (n - 1 - k + 0.5) / n; // top row of the bitmap sits at the rim
            sample(u, v, acc);
          }
          const o = (row * C + c) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const q = Math.round(Math.min(1, acc[ch] * comp) * levels) / levels;
            out[o + ch] = Math.round(q * 255);
            sum += q;
          }
          out[o + 3] = 255;
        }
      }
    }
  }
  return { data: out, columns: C, rows, meanDuty: sum / (C * rows * 3) };
}

export interface BannerBitmap {
  data: Uint8Array<ArrayBuffer>; // RGBA8 PWM duty, row 0 = top of the banner
  width: number;
  height: number;
  pixelM: number;                // size of one bitmap pixel in metres (square, one LED pitch)
  meanDuty: number;
}

/**
 * Banner mode: the firmware stores a plain bitmap the height of the wheel's LED reach
 * (rEnd above the hub to rEnd below) at about one pixel per LED pitch, and paints whatever
 * part of it each LED is passing through.
 */
export function bannerBitmap(img: Pixels, p: Params, d: Derived): BannerBitmap {
  const height = Math.max(2, Math.round((2 * d.rEnd) / d.pitch));
  const width = Math.max(1, Math.round((height * img.width) / img.height));
  const out = new Uint8Array(width * height * 4);
  const sample = dutySampler(img, p.gamma);
  const levels = (1 << Math.max(1, Math.min(8, p.colorBits))) - 1;
  const S = 3; // area-average sub-samples per axis
  const acc = [0, 0, 0];
  let sum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      acc[0] = acc[1] = acc[2] = 0;
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
        sample((x + (i + 0.5) / S) / width, (y + (j + 0.5) / S) / height, acc);
      }
      const o = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const q = Math.round(Math.min(1, acc[ch] / (S * S)) * levels) / levels;
        out[o + ch] = Math.round(q * 255);
        sum += q;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height, pixelM: (2 * d.rEnd) / height, meanDuty: sum / (width * height * 3) };
}

/** Distance along the road between the starts of consecutive banner tiles. */
export function bannerTileM(b: { width: number; pixelM: number }, gapM: number): number {
  return b.width * b.pixelM + Math.max(0, gapM);
}

export interface FrameStack {
  data: Uint8Array<ArrayBuffer>; // frames stacked as array-texture layers
  width: number;
  height: number;
  frames: number;
  meanDuty: number;
}

/** Stack equally sized per-frame buffers into one layered buffer. */
export function stackFrames(list: { data: Uint8Array; meanDuty: number }[], width: number, height: number): FrameStack {
  const layer = width * height * 4;
  const data = new Uint8Array(layer * list.length);
  list.forEach((f, i) => data.set(f.data, i * layer));
  const meanDuty = list.reduce((a, f) => a + f.meanDuty, 0) / Math.max(1, list.length);
  return { data, width, height, frames: list.length, meanDuty };
}

/** Water grid size in metres per cell: the container disc fills the LEDs' reach. */
export function waterCellM(d: Derived, grid: number): number {
  return d.rEnd / (grid / 2 - 1);
}

/**
 * Water mode's firmware lookup table: for every column and LED row, the simulation grid cell
 * nearest the centre of the arc that LED paints (-1 outside the grid). Same angle convention
 * as polarize(), so the water is upright and the right way round on the drive side.
 */
export function waterLut(p: Params, d: Derived, grid: number): Int32Array {
  const C = p.columnsPerRev, n = d.ledsPerStrip, rows = rowCount(p, d);
  const lut = new Int32Array(C * rows).fill(-1);
  const cellM = waterCellM(d, grid);
  const rot = (p.imageRotationDeg * Math.PI) / 180;
  const backs = p.doubleSided && p.backData === 'independent' ? 2 : 1;
  for (let back = 0; back < backs; back++) {
    for (let s = 0; s < p.stripCount; s++) {
      for (let k = 0; k < n; k++) {
        const row = (back * p.stripCount + s) * n + k;
        const r = ledRadius(p, d, s, k);
        for (let c = 0; c < C; c++) {
          const th = -((c + 0.5) * ((Math.PI * 2) / C) + rot);
          const x = (back ? -1 : 1) * r * Math.cos(th), y = r * Math.sin(th);
          const i = Math.floor(grid / 2 + x / cellM), j = Math.floor(grid / 2 + y / cellM);
          if (i >= 0 && j >= 0 && i < grid && j < grid) lut[row * C + c] = j * grid + i;
        }
      }
    }
  }
  return lut;
}

/**
 * Paint one firmware frame of water into `out` (RGBA PWM duty): blue scaled by how full each
 * cell is, whitening where the water moves fast (spray and foam), black for air.
 */
export function renderWater(
  density: Float32Array, speed: Float32Array, lut: Int32Array, p: Params, d: Derived, out: Uint8Array,
): number {
  const C = p.columnsPerRev, n = d.ledsPerStrip;
  const deep = [0.08, 0.35, 1.0], foam = [0.85, 0.95, 1.0];
  const g = (x: number) => Math.pow(x, p.gamma);
  let sum = 0;
  for (let idx = 0; idx < lut.length; idx++) {
    const cell = lut[idx], o = idx * 4;
    let a = 0, f = 0;
    if (cell >= 0) {
      a = Math.min(1, Math.max(0, (density[cell] - 0.15) / 0.45));
      f = Math.min(1, Math.max(0, (speed[cell] - 0.5) / 1.5));
    }
    const k = Math.floor(idx / C) % n;
    const comp = p.radialCompensation ? ledRadius(p, d, 0, k) / d.rEnd : 1;
    for (let ch = 0; ch < 3; ch++) {
      const v = g(deep[ch] + (foam[ch] - deep[ch]) * f) * a * comp;
      out[o + ch] = Math.round(v * 255);
      sum += v;
    }
    out[o + 3] = 255;
  }
  return sum / (lut.length * 3);
}
