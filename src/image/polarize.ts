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
  const backRows = p.backData === 'independent' ? 2 : 1;
  return backRows * p.stripCount * d.ledsPerStrip;
}

export function ledRadius(d: Derived, led: number): number {
  return d.rStart + (led + 0.5) * d.pitch;
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
  const rot = (p.imageRotationDeg * Math.PI) / 180;
  const dTheta = (Math.PI * 2) / C;
  const fitR = d.rEnd;
  let sum = 0;

  const backs = p.backData === 'independent' ? 2 : 1;
  const acc = [0, 0, 0];
  const SA = 4, SR = 3; // area-average sub-samples across each column arc and LED pitch

  for (let back = 0; back < backs; back++) {
    for (let s = 0; s < p.stripCount; s++) {
      for (let k = 0; k < n; k++) {
        const row = (back * p.stripCount + s) * n + k;
        const rk = ledRadius(d, k);
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
                if (back && p.backSide === 'reads') x = -x; // independent back strips get a mirrored image so it reads correctly
                sample(x / (2 * fitR) + 0.5, 0.5 - y / (2 * fitR), acc);
              }
            }
            acc[0] /= SA * SR; acc[1] /= SA * SR; acc[2] /= SA * SR;
          } else {
            // Adafruit layout: scale the bitmap to LED height, repeat it around the wheel.
            const w = Math.max(1, Math.round((img.width * n) / img.height));
            const col = back && p.backSide === 'reads' ? C - 1 - c : c;
            const u = ((col % w) + 0.5) / w;
            const v = (n - 1 - k + 0.5) / n; // top row of the bitmap sits at the rim
            sample(u, v, acc);
          }
          const o = (row * C + c) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const v = Math.round(Math.min(1, acc[ch] * comp) * 255);
            out[o + ch] = v;
            sum += v / 255;
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
        const v = Math.round(Math.min(1, acc[ch] / (S * S)) * 255);
        out[o + ch] = v;
        sum += v / 255;
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
 * as polarize(). Unlike a picture, the water is one physical body: back strips sample the same
 * cells as the front strips beside them, so the non-drive side sees it from behind and braking
 * still throws it forward.
 */
export function waterLut(p: Params, d: Derived, grid: number, cellM = waterCellM(d, grid)): Int32Array {
  const C = p.columnsPerRev, n = d.ledsPerStrip, rows = rowCount(p, d);
  const lut = new Int32Array(C * rows).fill(-1);
  const rot = (p.imageRotationDeg * Math.PI) / 180;
  const backs = p.backData === 'independent' ? 2 : 1;
  for (let back = 0; back < backs; back++) {
    for (let s = 0; s < p.stripCount; s++) {
      for (let k = 0; k < n; k++) {
        const row = (back * p.stripCount + s) * n + k;
        const r = ledRadius(d, k);
        for (let c = 0; c < C; c++) {
          const th = -((c + 0.5) * ((Math.PI * 2) / C) + rot);
          const x = r * Math.cos(th), y = r * Math.sin(th);
          const i = Math.floor(grid / 2 + x / cellM), j = Math.floor(grid / 2 + y / cellM);
          if (i >= 0 && j >= 0 && i < grid && j < grid) lut[row * C + c] = j * grid + i;
        }
      }
    }
  }
  return lut;
}

/**
 * Each LED's position for each column, in the same upright frame as the simulation. Same angle
 * convention as the water's lookup table: back strips see the same body from behind. Used by the
 * physics looks that draw from a bitmap (bouncing smiley, tumble dryer).
 */
export function ledPositions(p: Params, d: Derived): Float32Array {
  const C = p.columnsPerRev, n = d.ledsPerStrip, rows = rowCount(p, d);
  const pos = new Float32Array(C * rows * 2);
  const rot = (p.imageRotationDeg * Math.PI) / 180;
  const backs = p.backData === 'independent' ? 2 : 1;
  for (let back = 0; back < backs; back++) {
    for (let s = 0; s < p.stripCount; s++) {
      for (let k = 0; k < n; k++) {
        const row = (back * p.stripCount + s) * n + k;
        const r = ledRadius(d, k);
        for (let c = 0; c < C; c++) {
          const th = -((c + 0.5) * ((Math.PI * 2) / C) + rot);
          pos[(row * C + c) * 2] = r * Math.cos(th);
          pos[(row * C + c) * 2 + 1] = r * Math.sin(th);
        }
      }
    }
  }
  return pos;
}

/** Per-cell water maps the renderer reads (the simulation's 2× render map). */
export interface WaterMaps {
  renderDensity: Float32Array;  // local water amount (~1 = full)
  renderBulk: Float32Array;     // 3×3 average: the body of water
  renderSpeed: Float32Array;    // mean particle speed (m/s)
}

/**
 * Paint one firmware frame of water into `out` (RGBA PWM duty). The body of water is deep
 * blue; fast water near the surface foams, shifting through green and yellow to white as it gets
 * faster; water with no body around it is spray, drawn as bright white droplets; air is black.
 */
export function renderWater(maps: WaterMaps, lut: Int32Array, p: Params, d: Derived, out: Uint8Array): number {
  const C = p.columnsPerRev, n = d.ledsPerStrip;
  // Foam colour ramp from still water (f = 0) to the fastest foam and spray (f = 1): [f, r, g, b].
  // Yellow holds over a wide band, or the green-to-white blend (after gamma) would hide it.
  const ramp = [[0, 0.08, 0.35, 1.0], [0.25, 0.1, 0.9, 0.3], [0.45, 1.0, 0.9, 0.1], [0.75, 1.0, 0.9, 0.1], [1, 1.0, 1.0, 1.0]];
  const colour = (f: number, ch: number) => {
    let i = 0;
    while (i < ramp.length - 2 && f > ramp[i + 1][0]) i++;
    const [f0, f1] = [ramp[i][0], ramp[i + 1][0]];
    return ramp[i][ch + 1] + (ramp[i + 1][ch + 1] - ramp[i][ch + 1]) * Math.min(1, Math.max(0, (f - f0) / (f1 - f0)));
  };
  const g = (x: number) => Math.pow(x, p.gamma);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const { renderDensity: dens, renderBulk: bulk, renderSpeed: speed } = maps;
  let sum = 0;
  for (let idx = 0; idx < lut.length; idx++) {
    const cell = lut[idx], o = idx * 4;
    let a = 0, f = 0;
    if (cell >= 0) {
      const b = bulk[cell], local = dens[cell];
      a = clamp((0.5 * (local + b) - 0.2) / 0.4);
      const surface = 1 - clamp((b - 0.5) / 0.5);
      f = clamp((speed[cell] - 0.6) / 1.2) * surface;
      if (b < 0.3 && local > 0.2) { a = 1; f = 1; } // spray: small droplets still glint at full brightness
    }
    const k = Math.floor(idx / C) % n;
    const comp = p.radialCompensation ? ledRadius(d, k) / d.rEnd : 1;
    for (let ch = 0; ch < 3; ch++) {
      const v = g(colour(f, ch)) * a * comp;
      out[o + ch] = Math.round(v * 255);
      sum += v;
    }
    out[o + 3] = 255;
  }
  return sum / (lut.length * 3);
}
