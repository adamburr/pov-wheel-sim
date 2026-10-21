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
export function polarize(img: Pixels, p: Params, d: Derived): ColumnBuffer {
  const C = p.columnsPerRev;
  const n = d.ledsPerStrip;
  const rows = rowCount(p, d);
  const out = new Uint8Array(C * rows * 4);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.pow(i / 255, p.gamma);
  const levels = (1 << Math.max(1, Math.min(8, p.colorBits))) - 1;
  const rot = (p.imageRotationDeg * Math.PI) / 180;
  const dTheta = (Math.PI * 2) / C;
  const fitR = d.rEnd;
  let sum = 0;

  const sample = (u: number, v: number, acc: number[]) => {
    // Bilinear sample at normalised (u, v), converted to PWM duty.
    const x = u * img.width - 0.5, y = v * img.height - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for (let j = 0; j < 4; j++) {
      const xi = x0 + (j & 1), yi = y0 + (j >> 1);
      if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) continue;
      const w = ((j & 1) ? fx : 1 - fx) * ((j >> 1) ? fy : 1 - fy);
      const o = (yi * img.width + xi) * 4;
      const a = img.data[o + 3] / 255;
      acc[0] += w * a * lut[img.data[o]];
      acc[1] += w * a * lut[img.data[o + 1]];
      acc[2] += w * a * lut[img.data[o + 2]];
    }
  };

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
