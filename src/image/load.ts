import type { PatternName } from '../params';

export type ImageSource = HTMLCanvasElement | ImageBitmap;

const SIZE = 512;

function canvas(w = SIZE, h = SIZE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

/** Built-in test images, drawn on a black background like a night-time display. */
export function makePattern(name: PatternName, text: string): HTMLCanvasElement {
  if (name === 'Wide text') return wideText(text);
  const { c, g } = canvas();
  const cx = SIZE / 2, cy = SIZE / 2, R = SIZE / 2;
  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  g.lineCap = 'round';

  switch (name) {
    case 'Smiley': {
      g.fillStyle = '#ffd21f';
      g.beginPath(); g.arc(cx, cy, R * 0.92, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000';
      for (const dx of [-1, 1]) {
        g.beginPath(); g.ellipse(cx + dx * R * 0.34, cy - R * 0.28, R * 0.1, R * 0.17, 0, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#000'; g.lineWidth = R * 0.11;
      g.beginPath(); g.arc(cx, cy + R * 0.02, R * 0.56, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
      g.strokeStyle = '#ff2a6d'; g.lineWidth = R * 0.05;
      g.beginPath(); g.arc(cx, cy, R * 0.96, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 'Polar test grid': {
      for (let i = 10; i >= 1; i--) {
        g.strokeStyle = `hsl(${i * 36}, 100%, 55%)`; g.lineWidth = R * 0.035;
        g.beginPath(); g.arc(cx, cy, (R * i) / 10.5, 0, Math.PI * 2); g.stroke();
      }
      g.strokeStyle = '#fff'; g.lineWidth = 4;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
      }
      g.fillStyle = '#fff'; g.font = `bold ${R * 0.22}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('▲', cx, cy - R * 0.62);
      g.fillText('R', cx + R * 0.62, cy);
      break;
    }
    case 'Clock face': {
      g.strokeStyle = '#7fd7ff'; g.lineWidth = R * 0.05;
      g.beginPath(); g.arc(cx, cy, R * 0.94, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.font = `bold ${R * 0.17}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let h = 1; h <= 12; h++) {
        const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
        g.fillText(String(h), cx + Math.cos(a) * R * 0.74, cy + Math.sin(a) * R * 0.74);
      }
      const hand = (a: number, len: number, w: number, col: string) => {
        g.strokeStyle = col; g.lineWidth = w;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - Math.PI / 2) * len, cy + Math.sin(a - Math.PI / 2) * len); g.stroke();
      };
      hand((10.2 / 12) * Math.PI * 2, R * 0.45, R * 0.07, '#ffb000');
      hand((2 / 12) * Math.PI * 2, R * 0.62, R * 0.045, '#ffffff');
      break;
    }
    case 'Color wheel': {
      const grad = g.createConicGradient(0, cx, cy);
      for (let i = 0; i <= 12; i++) grad.addColorStop(i / 12, `hsl(${i * 30}, 100%, 50%)`);
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      const fade = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(0.35, 'rgba(255,255,255,0)');
      g.fillStyle = fade; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'Rainbow spiral': {
      g.lineWidth = R * 0.07;
      for (let arm = 0; arm < 4; arm++) {
        g.strokeStyle = `hsl(${arm * 90 + 20}, 100%, 55%)`;
        g.beginPath();
        for (let i = 0; i <= 200; i++) {
          const t = i / 200, a = t * Math.PI * 3 + (arm * Math.PI) / 2, r = t * R * 0.95;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
      break;
    }
    case 'Checkerboard': {
      const n = 10, s = SIZE / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? '#000' : `hsl(${(i * 7 + j * 13) * 9}, 90%, 55%)`;
        g.fillRect(i * s, j * s, s, s);
      }
      break;
    }
    case 'Text': {
      g.fillStyle = '#00e5ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const label = text || ' ';
      let size = R * 0.6;
      g.font = `900 ${size}px sans-serif`;
      while (g.measureText(label).width > R * 1.5 && size > 10) { size *= 0.9; g.font = `900 ${size}px sans-serif`; }
      g.fillText(label, cx, cy);
      // Repeat the text around the rim, where POV resolution is best.
      g.fillStyle = '#ff3df2'; g.font = `bold ${R * 0.13}px sans-serif`;
      const ring = `${label} • `.repeat(Math.max(1, Math.floor(40 / (label.length + 3))));
      const step = (Math.PI * 2) / ring.length;
      for (let i = 0; i < ring.length; i++) {
        const a = i * step - Math.PI / 2;
        g.save(); g.translate(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86); g.rotate(a + Math.PI / 2);
        g.fillText(ring[i], 0, 0); g.restore();
      }
      break;
    }
  }
  return c;
}

/** A 4:1 banner with a rainbow stripe, made for banner mode where the image tiles along the road. */
function wideText(text: string): HTMLCanvasElement {
  const { c, g } = canvas(SIZE * 4, SIZE);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const stripe = g.createLinearGradient(0, 0, c.width, 0);
  for (let i = 0; i <= 6; i++) stripe.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`);
  g.fillStyle = stripe;
  g.fillRect(0, 0, c.width, SIZE * 0.08);
  g.fillRect(0, SIZE * 0.92, c.width, SIZE * 0.08);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const label = text || ' ';
  let size = SIZE * 0.66;
  g.font = `900 ${size}px sans-serif`;
  while (g.measureText(label).width > c.width * 0.92 && size > 10) { size *= 0.9; g.font = `900 ${size}px sans-serif`; }
  g.fillText(label, c.width / 2, SIZE * 0.53);
  return c;
}

export async function loadImageFile(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/** Square, centred, letterboxed copy for polar mapping. */
export function squareImageData(src: ImageSource): ImageData {
  const { g } = canvas();
  g.fillStyle = '#000';
  g.fillRect(0, 0, SIZE, SIZE);
  const s = Math.min(SIZE / src.width, SIZE / src.height);
  const w = src.width * s, h = src.height * s;
  g.drawImage(src, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  return g.getImageData(0, 0, SIZE, SIZE);
}

/** Native-resolution copy (capped) for the Adafruit columns-as-angles mapping. */
export function rawImageData(src: ImageSource): ImageData {
  const s = Math.min(1, 1024 / src.width, 1024 / src.height);
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  const { g } = canvas(w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}
