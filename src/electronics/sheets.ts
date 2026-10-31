// The electronics drawings, as SVG: the circuit, the wiring between the panels and the hub module,
// the hub module round the hub, and the carrier board's layout. Each sheet is drawn in its own units
// (the hub and board sheets in mm, to scale) and fitted to the view by the viewer.
import { type BoardPart, CARRIER, carrierLayout, type Pkg } from './carrier';
import type { Electronics } from './design';

export type SheetId = 'circuit' | 'wiring' | 'hub' | 'board';
export const SHEETS: { id: SheetId; label: string; title: string }[] = [
  { id: 'circuit', label: 'Circuit', title: 'Circuit diagram' },
  { id: 'wiring', label: 'Wiring', title: 'Wiring between the panels and the hub module' },
  { id: 'hub', label: 'Hub module', title: 'Hub module round the hub shell (to scale)' },
  { id: 'board', label: 'Board', title: 'Carrier board layout (to scale, top)' },
];

export interface Sheet { svg: string; w: number; h: number }

const C = {
  ink: '#d8dde6', muted: '#8b93a3', faint: '#3a4152', box: '#141925', boxLine: '#4a5366',
  power: '#ff7b72', gnd: '#9aa4b5', data: '#4aa3ff', hall: '#c792ea', ctl: '#ffb547', ok: '#56d364',
  board: '#123524', copper: '#c9a227', silk: '#e8e8e8',
};
const WIRE: Record<string, string> = {
  red: '#ff5c5c', black: '#2b2b2b', yellow: '#ffd23f', blue: '#4aa3ff', green: '#3ccf6e', white: '#f0f0f0', grey: '#9aa0a6',
  orange: '#ff9f43', 'black/white': '#777', brown: '#a0522d', violet: '#a77bff', pink: '#ff8fc7', tan: '#d2b48c',
  'white/orange': '#ffcf9e', 'white/blue': '#a9d0ff', 'white/green': '#a8ebbd', 'white/brown': '#c9ab93',
};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function netColour(net: string): string {
  if (/^(GND|HALL_GND|CTRL_GND)$/.test(net)) return C.gnd;
  if (/^(\+5V|VSYS|VBAT|P\+|HALL_V|3V3)/.test(net)) return C.power;
  if (/^HALL\d/.test(net)) return C.hall;
  if (/^(CLK|L\d|R\d)/.test(net)) return C.data;
  return C.ctl;
}

/** Collects SVG elements. */
class Pen {
  out: string[] = [];
  text(x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; rot?: number } = {}) {
    const tr = o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : '';
    this.out.push(`<text x="${x}" y="${y}" font-size="${o.size ?? 12}" fill="${o.fill ?? C.ink}" `
      + `text-anchor="${o.anchor ?? 'start'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${tr}>${esc(s)}</text>`);
  }
  line(pts: number[][], o: { stroke?: string; w?: number; dash?: string } = {}) {
    this.out.push(`<polyline points="${pts.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${o.stroke ?? C.muted}" `
      + `stroke-width="${o.w ?? 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; w?: number; r?: number; dash?: string; rot?: [number, number, number] } = {}) {
    const tr = o.rot ? ` transform="rotate(${o.rot.join(' ')})"` : '';
    this.out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 0}" fill="${o.fill ?? 'none'}" `
      + `stroke="${o.stroke ?? 'none'}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${tr}/>`);
  }
  circle(x: number, y: number, r: number, o: { fill?: string; stroke?: string; w?: number; dash?: string } = {}) {
    this.out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`);
  }
  raw(s: string) { this.out.push(s); }
  dot(x: number, y: number, col = C.muted) { this.circle(x, y, 3, { fill: col }); }

  // ---- schematic symbols (horizontal unless noted; each spans its two terminals) ----
  /** A net label at (x, y), pointing away from the wire: anchor 'start' sits right of the point. */
  net(x: number, y: number, name: string, anchor: 'start' | 'end' = 'start') {
    const col = netColour(name);
    const dx = anchor === 'start' ? 6 : -6;
    this.text(x + dx, y + 4, name, { fill: col, anchor, size: 12, weight: 600 });
  }
  gnd(x: number, y: number) {
    this.line([[x, y], [x, y + 8]], { stroke: C.gnd });
    this.line([[x - 9, y + 8], [x + 9, y + 8]], { stroke: C.gnd, w: 2 });
    this.line([[x - 5, y + 12], [x + 5, y + 12]], { stroke: C.gnd, w: 2 });
    this.line([[x - 2, y + 16], [x + 2, y + 16]], { stroke: C.gnd, w: 2 });
  }
  /** Resistor from (x, y) to (x + 40, y), or down to (x, y + 40) when vertical. */
  res(x: number, y: number, label: string, vertical = false) {
    const z = [0, 8, 11, 17, 23, 29, 32, 40];
    const off = [0, 0, -5, 5, -5, 5, 0, 0];
    this.line(z.map((u, i) => (vertical ? [x + off[i], y + u] : [x + u, y + off[i]])), { stroke: C.ink });
    if (vertical) this.text(x + 9, y + 24, label, { size: 11, fill: C.muted }); else this.text(x + 20, y - 9, label, { size: 11, fill: C.muted, anchor: 'middle' });
  }
  /** Capacitor from (x, y) down to (x, y + 30). */
  cap(x: number, y: number, label: string) {
    this.line([[x, y], [x, y + 12]], { stroke: C.ink });
    this.line([[x - 9, y + 12], [x + 9, y + 12]], { stroke: C.ink, w: 2 });
    this.line([[x - 9, y + 18], [x + 9, y + 18]], { stroke: C.ink, w: 2 });
    this.line([[x, y + 18], [x, y + 30]], { stroke: C.ink });
    this.text(x + 13, y + 19, label, { size: 11, fill: C.muted });
  }
  /** Diode from (x, y) to (x + 30, y), anode at x (or pointing left with flip). */
  diode(x: number, y: number, label: string, flip = false) {
    const a = flip ? x + 30 : x, k = flip ? x : x + 30, m = (a + k) / 2, s = flip ? -1 : 1;
    this.line([[a, y], [m - 6 * s, y]], { stroke: C.ink });
    this.raw(`<polygon points="${m - 6 * s},${y - 6} ${m - 6 * s},${y + 6} ${m + 5 * s},${y}" fill="${C.ink}"/>`);
    this.line([[m + 5 * s, y - 6], [m + 5 * s, y + 6]], { stroke: C.ink, w: 2 });
    this.line([[m + 5 * s, y], [k, y]], { stroke: C.ink });
    this.text(m, y - 10, label, { size: 11, fill: C.muted, anchor: 'middle' });
  }
  /** MOSFET with its body centred at (x, y): gate on the left at (x - 24, y), drain up (x, y - 24), source down (x, y + 24). P-channel: drain/source swap and source up. */
  fet(x: number, y: number, kind: 'P' | 'N', label: string) {
    this.circle(x, y, 15, { stroke: C.ink, w: 1.5 });
    this.line([[x - 24, y], [x - 8, y]], { stroke: C.ink });
    this.line([[x - 8, y - 9], [x - 8, y + 9]], { stroke: C.ink, w: 2 });
    this.line([[x - 4, y - 10], [x - 4, y + 10]], { stroke: C.ink, w: 2 });
    this.line([[x - 4, y - 7], [x, y - 7], [x, y - 24]], { stroke: C.ink });
    this.line([[x - 4, y + 7], [x, y + 7], [x, y + 24]], { stroke: C.ink });
    const ay = kind === 'N' ? y + 7 : y - 7;
    this.raw(`<polygon points="${kind === 'N' ? x - 4 : x - 1},${ay} ${kind === 'N' ? x - 1 : x - 4},${ay - 3} ${kind === 'N' ? x - 1 : x - 4},${ay + 3}" fill="${C.ink}"/>`);
    this.text(x + 19, y - 2, label, { size: 11, fill: C.ink, weight: 600 });
    this.text(x + 19, y + 12, kind === 'P' ? 'P-ch' : 'N-ch', { size: 10, fill: C.muted });
  }
  /** Pushbutton from (x, y) down to (x, y + 34). */
  button(x: number, y: number, label: string) {
    this.line([[x, y], [x, y + 12]], { stroke: C.ink });
    this.line([[x, y + 22], [x, y + 34]], { stroke: C.ink });
    this.circle(x, y + 12, 2, { fill: C.ink });
    this.circle(x, y + 22, 2, { fill: C.ink });
    this.line([[x + 6, y + 8], [x + 6, y + 26]], { stroke: C.ink, w: 2 });
    this.line([[x + 6, y + 17], [x + 14, y + 17]], { stroke: C.ink, w: 2 });
    this.text(x - 8, y + 21, label, { size: 11, fill: C.muted, anchor: 'end' });
  }
  /** PNP transistor centred at (x, y): base on the left at (x - 24, y), emitter up (x, y - 24), collector down (x, y + 24). */
  pnp(x: number, y: number, label: string) {
    this.circle(x, y, 15, { stroke: C.ink, w: 1.5 });
    this.line([[x - 24, y], [x - 6, y]], { stroke: C.ink });
    this.line([[x - 6, y - 10], [x - 6, y + 10]], { stroke: C.ink, w: 2 });
    this.line([[x - 6, y - 5], [x, y - 12], [x, y - 24]], { stroke: C.ink });
    this.line([[x - 6, y + 5], [x, y + 12], [x, y + 24]], { stroke: C.ink });
    this.raw(`<polygon points="${x - 6},${y - 5} ${x - 1.5},${y - 10.5} ${x - 4.5},${y - 11.5}" fill="${C.ink}"/>`); // emitter arrow, into the base
    this.text(x + 19, y - 2, label, { size: 11, fill: C.ink, weight: 600 });
    this.text(x + 19, y + 12, 'PNP', { size: 10, fill: C.muted });
  }
  /** A labelled box with pins on its left and right edges: [name, net] pairs, one per row. */
  block(x: number, y: number, w: number, title: string, sub: string, left: [string, string][], right: [string, string][], o: { pitch?: number; stub?: number } = {}) {
    const pitch = o.pitch ?? 22, stub = o.stub ?? 26;
    const rows = Math.max(left.length, right.length);
    const h = 44 + rows * pitch;
    this.rect(x, y, w, h, { fill: C.box, stroke: C.boxLine, w: 1.5, r: 6 });
    this.text(x + w / 2, y + 18, title, { anchor: 'middle', weight: 700, size: 13 });
    if (sub) this.text(x + w / 2, y + 33, sub, { anchor: 'middle', size: 11, fill: C.muted });
    left.forEach(([pin, net], i) => {
      const py = y + 52 + i * pitch;
      this.line([[x - stub, py], [x, py]], { stroke: netColour(net) });
      this.text(x + 6, py + 4, pin, { size: 11 });
      if (net) this.net(x - stub, py, net, 'end');
    });
    right.forEach(([pin, net], i) => {
      const py = y + 52 + i * pitch;
      this.line([[x + w, py], [x + w + stub, py]], { stroke: netColour(net) });
      this.text(x + w - 6, py + 4, pin, { size: 11, anchor: 'end' });
      if (net) this.net(x + w + stub, py, net, 'start');
    });
    return { h, pinY: (i: number) => y + 52 + i * pitch };
  }
  heading(x: number, y: number, s: string) { this.text(x, y, s, { size: 14, weight: 700, fill: C.muted }); }
  svg(w: number, h: number) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${this.out.join('')}</svg>`;
  }
}

// ---------------------------------------------------------------- circuit
function circuit(e: Electronics): Sheet {
  const g = new Pen();
  const W = 1860;

  // ---- Power (left column) ----
  g.heading(20, 30, 'POWER');
  // cells → protection → fuse
  g.rect(70, 50, 120, 54, { fill: C.box, stroke: C.boxLine, r: 6 });
  g.text(130, 72, 'BT1', { anchor: 'middle', weight: 700 });
  g.text(130, 90, `18650 × ${e.cells} (1S${e.cells}P)`, { anchor: 'middle', size: 11, fill: C.muted });
  g.line([[190, 77], [220, 77]], { stroke: C.power });
  g.rect(220, 50, 110, 54, { fill: C.box, stroke: C.boxLine, r: 6 });
  g.text(275, 72, 'BMS', { anchor: 'middle', weight: 700 });
  g.text(275, 90, '1S, ≥ 10 A', { anchor: 'middle', size: 11, fill: C.muted });
  g.line([[330, 77], [380, 77]], { stroke: C.power });
  g.dot(355, 77, C.power);
  g.line([[355, 77], [355, 120]], { stroke: C.power });
  g.net(355, 126, 'P+', 'start');
  g.rect(380, 66, 46, 22, { stroke: C.ink, r: 3 });
  g.text(403, 81, 'F1', { anchor: 'middle', size: 11 });
  g.text(403, 60, '10 A', { anchor: 'middle', size: 10, fill: C.muted });
  g.line([[426, 77], [460, 77]], { stroke: C.power });
  g.net(460, 77, 'VBAT');
  g.line([[130, 104], [130, 118]], { stroke: C.gnd });
  g.gnd(130, 118);

  // boost: EN held low by 4.7k while the logic is off
  const ub = g.block(120, 160, 150, 'U4  5 V boost', 'Pololu U3V70F5', [['VIN', 'VBAT'], ['GND', 'GND'], ['EN', 'LED_EN']], [['VOUT', '+5V_L']], { stub: 30 });
  const enY = ub.pinY(2);
  g.dot(102, enY, C.ctl);
  g.line([[102, enY], [102, enY + 10]], { stroke: C.ctl });
  g.res(102, enY + 10, '4.7k', true);
  g.gnd(102, enY + 50);
  // charger: CE pulled up by the logic's supply stops it charging while running
  const uc = g.block(470, 160, 150, 'U5  charger', 'bq24074 (4755)', [['IN', '+5V_R'], ['BAT', 'P+'], ['GND', 'GND'], ['CE', '']], [], { stub: 30 });
  const ceY = uc.pinY(3);
  g.dot(452, ceY, C.ctl);
  g.line([[452, ceY], [400, ceY]], { stroke: C.ctl });
  g.res(400, ceY, '10k', true);
  g.line([[400, ceY + 40], [400, ceY + 46]], { stroke: C.power });
  g.net(400, ceY + 50, 'VSYS', 'end');
  g.line([[452, ceY], [452, ceY + 8]], { stroke: C.ctl });
  g.res(452, ceY + 8, '100k', true);
  g.gnd(452, ceY + 48);
  g.text(500, 160 + uc.h + 18, 'CE high (logic on): not charging', { size: 11, fill: C.muted });

  // soft latch
  const ly = 430;
  g.heading(20, ly - 22, 'ON/OFF LATCH (brightness button + HOLD)');
  const gn = 120, qx = 200, qy = ly + 90;
  g.line([[qx, qy - 24], [qx, ly + 10]], { stroke: C.power });
  g.net(qx, ly + 6, 'VBAT', 'start');
  g.pnp(qx, qy, 'Q1  BC327');
  g.line([[qx, qy + 24], [qx, qy + 50]], { stroke: C.power });
  g.net(qx, qy + 58, 'VSYS', 'start');
  // the latch node: 10k up to VBAT (Q1 off), 1k to Q1's base, Q2 down to ground
  g.line([[qx - 24, qy], [qx - 34, qy]], { stroke: C.ctl });
  g.res(qx - 74, qy, '1k');
  g.line([[qx - 74, qy], [gn, qy]], { stroke: C.ctl });
  g.dot(gn, qy, C.ctl);
  g.line([[gn, qy], [gn, qy - 30]], { stroke: C.ctl });
  g.res(gn, qy - 70, '10k', true);
  g.line([[gn, qy - 70], [gn, ly + 10], [qx, ly + 10]], { stroke: C.power });
  g.dot(qx, ly + 10, C.power);
  g.line([[gn, qy], [gn, qy + 40]], { stroke: C.ctl });
  g.fet(gn, qy + 64, 'N', 'Q2');
  g.line([[gn, qy + 88], [gn, qy + 96]], { stroke: C.gnd });
  g.gnd(gn, qy + 96);
  g.line([[gn - 24, qy + 64], [gn - 40, qy + 64]], { stroke: C.ctl });
  g.net(gn - 40, qy + 64, 'HOLD', 'end');
  // on/off: gate → D1 → button node → brightness button → ground; node pulled up to VBAT; SW reads it through D2
  const sx = 310, ry0 = qy + 130;
  g.dot(gn, qy + 40, C.ctl);
  g.line([[gn, qy + 40], [gn + 66, qy + 40], [gn + 66, ry0], [250, ry0]], { stroke: C.ctl });
  g.diode(250, ry0, 'D1');
  g.line([[280, ry0], [sx, ry0]], { stroke: C.ctl });
  g.dot(sx, ry0, C.ctl);
  g.button(sx, ry0, '');
  g.text(sx + 18, ry0 + 21, 'S1 brightness button (lid)', { size: 11, fill: C.muted });
  g.gnd(sx, ry0 + 34);
  g.line([[sx, ry0], [sx, ry0 - 20]], { stroke: C.ctl });
  g.res(sx, ry0 - 60, '100k', true);
  g.line([[sx, ry0 - 60], [sx, ry0 - 68]], { stroke: C.power });
  g.net(sx, ry0 - 72, 'VBAT', 'start');
  g.line([[sx, ry0], [sx + 40, ry0]], { stroke: C.ctl });
  g.diode(sx + 40, ry0, 'D2', true);
  g.line([[sx + 70, ry0], [sx + 90, ry0]], { stroke: C.ctl });
  g.net(sx + 90, ry0, 'SW', 'start');
  g.text(20, ry0 + 76, 'Off: a press powers the Feather (Q1); it sets HOLD only if a second press follows.', { size: 11, fill: C.muted });
  g.text(20, ry0 + 92, 'On: one press steps brightness; a double press, and the firmware drops HOLD.', { size: 11, fill: C.muted });

  // right side's 5 V: through a Schottky, so the charging lead's 5 V can't reach the left strips
  const ry = ry0 + 150;
  g.heading(20, ry - 22, 'RIGHT SIDE\'S 5 V');
  const q3y = ry + 20;
  g.net(100, q3y, '+5V_L', 'end');
  g.line([[100, q3y], [140, q3y]], { stroke: C.power });
  g.diode(140, q3y, 'D3  SB540');
  g.line([[170, q3y], [210, q3y]], { stroke: C.power });
  g.net(210, q3y, '+5V_R');
  g.text(20, q3y + 40, 'The right strips run about 0.4 V lower (fine for SK9822s); charging, the lead\'s 5 V can\'t reach the left strips.', { size: 11, fill: C.muted });
  g.text(20, q3y + 56, 'With the logic off, the boost is off and nothing drives +5V_L.', { size: 11, fill: C.muted });

  // divider and hall supply
  const dy = q3y + 110;
  g.heading(20, dy - 22, 'SENSING');
  g.net(60, dy, 'VSYS', 'end');
  g.res(60, dy, '100k');
  g.line([[100, dy], [215, dy]], { stroke: C.ctl });
  g.dot(120, dy, C.ctl);
  g.net(215, dy, 'VBAT/2');
  g.res(120, dy, '100k', true);
  g.gnd(120, dy + 40);
  g.dot(175, dy, C.ctl);
  g.cap(175, dy, '100nF');
  g.gnd(175, dy + 30);
  g.net(330, dy, 'VSYS', 'end');
  g.res(330, dy, '100Ω');
  g.line([[370, dy], [420, dy]], { stroke: C.power });
  g.dot(390, dy, C.power);
  g.cap(390, dy, '10µF');
  g.gnd(390, dy + 30);
  g.net(420, dy, 'HALL_V');
  const powerBottom = dy + 70;

  // ---- Feather (centre) ----
  const fx = 780;
  g.heading(fx - 60, 30, 'CONTROLLER');
  const leftPins = e.pins.filter((q) => ['BAT', '3V', 'GND', 'A0', 'A1', 'A2', 'A3', 'D24', 'D25'].includes(q.pin));
  const rightPins = e.pins.filter((q) => !leftPins.includes(q));
  g.block(fx, 50, 200, 'U6  Feather RP2350', '8 MB PSRAM (6130)',
    leftPins.map((q) => [q.gpio !== undefined ? `${q.pin} GP${q.gpio}` : q.pin, q.net]),
    rightPins.map((q) => [q.gpio !== undefined ? `${q.pin} GP${q.gpio}` : q.pin, q.net]), { stub: 34 });
  const fpcY = 50 + 44 + Math.max(leftPins.length, rightPins.length) * 22 + 30;
  g.text(fx + 100, fpcY, 'GP0–7: eight data lanes, one PIO program; GP10/11 its two', { size: 11, fill: C.muted, anchor: 'middle' });
  g.text(fx + 100, fpcY + 16, 'side-set clocks. All from the headers (UART, I2C given up)', { size: 11, fill: C.muted, anchor: 'middle' });
  // hall pull-ups
  const hy = fpcY + 60;
  g.heading(fx - 60, hy - 14, 'HALL INPUTS (on the carrier)');
  for (let i = 0; i < e.halls; i++) {
    const x = fx - 40 + i * 80;
    g.net(x, hy + 4, '3V3', 'start');
    g.line([[x, hy + 10], [x, hy + 16]], { stroke: C.power });
    g.res(x, hy + 16, '10k', true);
    g.line([[x, hy + 56], [x, hy + 76]], { stroke: C.hall });
    g.dot(x, hy + 66, C.hall);
    g.net(x, hy + 88, `HALL${i + 1}`, 'start');
  }
  // the preset button: pull-up, 1k in series, 100 nF at the pin; the button to ground
  const by = hy + 130;
  g.heading(fx - 60, by - 14, 'PRESET BUTTON (lid; brightness is S1 on the latch)');
  [['BTN_PRESET', 'preset']].forEach(([net, label], i) => {
    const x = fx - 40 + i * 170;
    g.net(x, by + 4, '3V3', 'start');
    g.line([[x, by + 10], [x, by + 16]], { stroke: C.power });
    g.res(x, by + 16, '10k', true);
    g.line([[x, by + 56], [x, by + 66]], { stroke: C.ctl });
    g.dot(x, by + 66, C.ctl);
    g.line([[x, by + 66], [x + 10, by + 66]], { stroke: C.ctl });
    g.res(x + 10, by + 66, '1k');
    g.line([[x + 50, by + 66], [x + 70, by + 66]], { stroke: C.ctl });
    g.dot(x + 60, by + 66, C.ctl);
    g.net(x + 70, by + 66, net);
    g.cap(x + 60, by + 66, '100nF');
    g.gnd(x + 60, by + 96);
    g.line([[x, by + 66], [x, by + 80]], { stroke: C.ctl });
    g.button(x, by + 80, label);
    g.gnd(x, by + 114);
  });

  // ---- Level shifters ----
  const sx0 = 1110;
  g.heading(sx0, 30, 'LEVEL SHIFTERS (5 V)');
  let y = 50;
  for (const u of e.shifters) {
    const b = g.block(sx0 + 40, y, 150, `${u.ref}  74AHCT125`, 'VCC +5V_L · /OE → GND',
      u.ch.map((c, i) => [`${i + 1}A`, c.a]), u.ch.map((_, i) => [`${i + 1}Y`, '']), { stub: 34 });
    u.ch.forEach((c, i) => {
      const py = b.pinY(i);
      g.res(sx0 + 40 + 150 + 34, py, i === 0 ? '33Ω' : '');
      g.net(sx0 + 40 + 150 + 74, py, c.y);
    });
    y += b.h + 26;
  }

  // ---- Connectors and panels (right column) ----
  const cx = 1530;
  g.heading(cx, 30, 'LEFT PANEL (J2, wired)');
  g.block(cx + 40, 50, 150, 'J2  harness', `${e.leftHarness.length} wires`, e.leftHarness.map((w) => [w.net.replace('_5', ''), w.net]), [], { stub: 30, pitch: 20 });
  y = 50 + 44 + e.leftHarness.length * 20 + 20;
  g.text(cx, y, `Strips 1–${e.n}: 5V ← +5V_L, GND, CI ← CLK_L5, DI ← L#_5`, { size: 11, fill: C.muted });
  g.text(cx, y + 16, `Hall H1–H${e.halls}: VDD ← HALL_V, GND ← HALL_GND, OUT → HALL#`, { size: 11, fill: C.muted });
  g.text(cx, y + 32, '100 nF across each sensor; 470 µF at the 5 V star', { size: 11, fill: C.muted });
  y += 66;
  // the right panel
  g.heading(cx, y, 'RIGHT PANEL (J1, Weipu SP13 9-pin)');
  g.block(cx + 40, y + 20, 150, 'J1  socket', 'module side, female', e.connector.map((q) => [`pin ${q.n}`, q.net]), [], { stub: 30, pitch: 20 });
  y += 20 + 44 + e.connector.length * 20 + 20;
  g.text(cx, y, `Strips 1–${e.n}: 5V ← +5V_R, GND, CI ← CLK_R5, DI ← R#_5`, { size: 11, fill: C.muted });
  g.text(cx, y + 16, 'Charging lead: USB-C VBUS → pins 1–2, GND → pins 3–4', { size: 11, fill: C.muted });
  y += 40;
  const H = Math.max(powerBottom, y + 40, by + 150);
  return { svg: g.svg(W, H), w: W, h: H };
}

// ---------------------------------------------------------------- wiring
function wiring(e: Electronics): Sheet {
  const g = new Pen();
  const W = 1500, H = 820;
  const wireRun = (x0: number, x1: number, y0: number, wires: { colour: string; awg: number }[], gap = 7) => {
    wires.forEach((w, i) => {
      const yy = y0 + i * gap;
      g.line([[x0, yy], [x1, yy]], { stroke: WIRE[w.colour] ?? C.muted, w: w.awg <= 22 ? 4 : 2.5 });
    });
  };
  // left panel
  g.heading(20, 30, 'LEFT PANEL');
  g.rect(20, 50, 300, 360, { fill: C.box, stroke: C.boxLine, r: 8 });
  for (let i = 0; i < e.n; i++) {
    const y = 80 + i * 74;
    g.rect(40, y, 230, 22, { fill: '#202838', stroke: C.faint, r: 4 });
    for (let k = 0; k < 14; k++) g.rect(48 + k * 16, y + 6, 10, 10, { fill: '#3a4152' });
    g.text(44, y - 6, `strip ${i + 1}: ${e.leds} LEDs, inner end ← DI/CI/5V/GND`, { size: 11, fill: C.muted });
    if (i < e.halls) {
      g.rect(275, y + 28, 22, 16, { fill: '#2b2140', stroke: C.hall, r: 3 });
      g.text(286, y + 40, `H${i + 1}`, { size: 10, anchor: 'middle', fill: C.hall });
    }
  }
  g.text(40, 395, '5 V star + 470 µF at the wire slot; hall leads 100 nF', { size: 11, fill: C.muted });
  // left harness
  wireRun(320, 560, 120, e.leftHarness);
  g.text(440, 108, `J2 harness, ${e.leftHarness.length} wires, hard-wired`, { size: 12, anchor: 'middle', weight: 600 });
  g.text(440, 128 + e.leftHarness.length * 7 + 14, 'out through the wire slot, between the left spokes', { size: 11, anchor: 'middle', fill: C.muted });

  // hub module
  g.heading(560, 30, 'HUB MODULE (one stack, in a printed bracket)');
  g.rect(560, 50, 380, 470, { fill: '#10141d', stroke: C.boxLine, r: 10, dash: '6 4' });
  // the stack, outermost first: logic, power, battery pack, then the bracket on the shell
  g.rect(580, 80, 160, 170, { fill: C.box, stroke: C.data, r: 6 });
  g.text(660, 102, 'Logic (top of the box)', { anchor: 'middle', weight: 700 });
  for (const [i, s] of ['Feather RP2350', 'on the carrier board:', `${e.shifters.length} × 74AHCT125`, 'latch, D3, pull-ups', 'all from the '
    + 'headers'].entries()) g.text(660, 124 + i * 18, s, { anchor: 'middle', size: 11, fill: C.muted });
  // the box's lid, its outer face: the two buttons
  g.circle(752, 92, 7, { stroke: C.ink, w: 1.5 }); g.circle(752, 114, 7, { stroke: C.ink, w: 1.5 });
  g.text(764, 96, 'preset', { size: 10, fill: C.muted }); g.text(764, 118, 'brightness', { size: 10, fill: C.muted });
  g.text(746, 140, 'in the lid', { size: 10, fill: C.ctl });
  g.rect(580, 300, 160, 110, { fill: C.box, stroke: C.power, r: 6 });
  g.text(660, 322, 'Power board', { anchor: 'middle', weight: 700 });
  for (const [i, s] of ['5 V boost (U3V70F5)', 'charger (bq24074)', 'fuse 10 A'].entries()) g.text(660, 344 + i * 18, s, { anchor: 'middle', size: 11, fill: C.muted });
  g.rect(580, 440, 160, 60, { fill: C.box, stroke: C.ctl, r: 6 });
  g.text(660, 462, 'Battery pack', { anchor: 'middle', weight: 700 });
  g.text(660, 480, `${e.cells} × 18650 + protection`, { anchor: 'middle', size: 11, fill: C.muted });
  g.line([[572, 300], [572, 508], [748, 508], [748, 300]], { stroke: C.silk, w: 2.5 });
  g.text(756, 500, 'bracket, tied to the shell', { size: 10, fill: C.silk });
  // pack to power: XT30
  g.line([[650, 440], [650, 410]], { stroke: WIRE.red, w: 4 });
  g.line([[662, 440], [662, 410]], { stroke: WIRE.black, w: 4 });
  g.rect(640, 419, 32, 12, { fill: '#2a2f3b', stroke: C.ink, r: 2 });
  g.text(680, 429, 'XT30', { size: 10, fill: C.muted });
  // power to logic, inside the box
  const boxLink = [['+5V_L', 'red', 18], ['GND', 'black', 18], ['VBAT', 'orange', 26], ['LED_EN', 'yellow', 26], ['CE (VSYS)', 'green', 26], ['+5V_R → IN', 'red', 22]] as const;
  boxLink.forEach(([, col, awg], i) => g.line([[620 + i * 12, 250], [620 + i * 12, 300]], { stroke: WIRE[col], w: awg <= 22 ? 4 : 2.5 }));
  g.text(708, 266, '+5V_L, GND (18 AWG), VBAT,', { size: 10, fill: C.muted });
  g.text(708, 279, 'LED_EN, CE, +5V_R → IN:', { size: 10, fill: C.muted });
  g.text(708, 292, 'inside the box', { size: 10, fill: C.muted });
  g.text(760, 340, 'hook-and-loop strap', { size: 10, fill: C.hall });
  g.text(760, 354, 'over the box and pack', { size: 10, fill: C.hall });
  // left harness enters the logic layer
  g.line([[560, 120], [580, 120]], { stroke: C.muted });

  // J1 pigtail
  // the right panel
  const pig = [{ colour: 'red', awg: 22 }, { colour: 'black', awg: 22 }, { colour: 'yellow', awg: 26 },
    ...Array.from({ length: e.n }, (_, i) => ({ colour: ['blue', 'green', 'white', 'grey'][i], awg: 26 }))];
  wireRun(740, 1010, 200, pig);
  g.text(875, 190, 'pigtail out between the right spokes', { size: 11, anchor: 'middle', fill: C.muted });
  // the connector pair
  g.rect(1010, 186, 60, 64, { fill: '#2a2f3b', stroke: C.ink, r: 10 });
  g.text(1040, 214, 'J1', { anchor: 'middle', weight: 700 });
  g.text(1040, 232, 'socket ♀', { anchor: 'middle', size: 10, fill: C.muted });
  g.rect(1074, 186, 60, 64, { fill: '#2a2f3b', stroke: C.ink, r: 10 });
  g.text(1104, 214, 'P1', { anchor: 'middle', weight: 700 });
  g.text(1104, 232, 'plug ♂', { anchor: 'middle', size: 10, fill: C.muted });
  g.text(1072, 272, 'Weipu SP13 9-pin, IP68', { size: 11, anchor: 'middle', fill: C.muted });
  g.text(1072, 288, 'tied to a right spoke', { size: 11, anchor: 'middle', fill: C.muted });
  wireRun(1134, 1180, 200, pig);
  // right panel
  g.heading(1180, 30, 'RIGHT PANEL');
  g.rect(1180, 50, 300, 360, { fill: C.box, stroke: C.boxLine, r: 8 });
  for (let i = 0; i < e.n; i++) {
    const y = 80 + i * 74;
    g.rect(1230, y, 230, 22, { fill: '#202838', stroke: C.faint, r: 4 });
    for (let k = 0; k < 14; k++) g.rect(1238 + k * 16, y + 6, 10, 10, { fill: '#3a4152' });
    g.text(1234, y - 6, `strip ${i + 1}: ${e.leds} LEDs`, { size: 11, fill: C.muted });
  }
  g.text(1200, 395, 'hall sensor ties left empty (the left panel times both)', { size: 11, fill: C.muted });
  // charging lead
  g.heading(1010, 470, 'CHARGING LEAD (right panel off)');
  g.rect(1010, 490, 110, 50, { fill: C.box, stroke: C.boxLine, r: 6 });
  g.text(1065, 512, 'USB-C sink', { anchor: 'middle', weight: 700, size: 12 });
  g.text(1065, 528, '5.1k on CC1/CC2', { anchor: 'middle', size: 10, fill: C.muted });
  g.line([[1120, 505], [1240, 505]], { stroke: WIRE.red, w: 4 });
  g.line([[1120, 520], [1240, 520]], { stroke: WIRE.black, w: 4 });
  g.rect(1240, 482, 60, 64, { fill: '#2a2f3b', stroke: C.ink, r: 10 });
  g.text(1270, 512, 'P2', { anchor: 'middle', weight: 700 });
  g.text(1270, 528, 'plug ♂', { anchor: 'middle', size: 10, fill: C.muted });
  g.text(1010, 566, 'VBUS → pins 1 + 2, GND → pins 3 + 4. Charge with the wheel switched off: ~1 A.', { size: 11, fill: C.muted });

  // wire table
  const ty = 580;
  g.heading(20, ty, 'J2 LEFT HARNESS');
  e.leftHarness.forEach((w, i) => {
    const y = ty + 22 + i * 17;
    g.line([[20, y - 4], [44, y - 4]], { stroke: WIRE[w.colour] ?? C.muted, w: 5 });
    g.text(52, y, `${w.net}`, { size: 11, fill: netColour(w.net), weight: 600 });
    g.text(130, y, `${w.awg} AWG ${w.colour} · ${w.use}`, { size: 11, fill: C.muted });
  });
  // the right panel
  g.heading(560, ty, 'J1 PINS');
  e.connector.forEach((q, i) => {
    const y = ty + 22 + i * 17;
    g.text(560, y, `${q.n}`, { size: 11, weight: 700 });
    g.text(580, y, q.net, { size: 11, fill: netColour(q.net), weight: 600 });
    g.text(650, y, q.use, { size: 11, fill: C.muted });
  });
  return { svg: g.svg(W, Math.max(H, ty + 30 + e.leftHarness.length * 17)), w: W, h: Math.max(H, ty + 30 + e.leftHarness.length * 17) };
}

// ---------------------------------------------------------------- hub module
function hub(e: Electronics, spokes: number): Sheet {
  const g = new Pen();
  const h = e.hub;
  const S = 3; // px per mm
  const R = 90; // drawn radius (mm)
  const fill: Record<string, string> = { pack: '#3b2f1a', power: '#4a1f1f', logic: '#14304d' };
  const edge: Record<string, string> = { pack: C.ctl, power: C.power, logic: C.data };
  const top = h.layers[h.layers.length - 1];
  const outerR = top.r0 + top.radial;

  // ---- end view, from the left: the module straight up ----
  const ox = 40 + R * S, oy = 70 + R * S;
  const P = (x: number, y: number) => [ox + x * S, oy - y * S];
  g.heading(20, 30, 'END VIEW, from the left (mm, to scale)');
  const perSide = Math.max(2, spokes / 2);
  for (let i = 0; i < perSide; i++) {
    const a = (2 * Math.PI * i) / perSide;
    const fx = h.flangeR * Math.cos(a), fy = h.flangeR * Math.sin(a);
    const dir = a + (i % 2 ? 1 : -1) * 1.15;
    const tx = fx + R * Math.cos(dir) * 1.2, ty = fy + R * Math.sin(dir) * 1.2;
    const k = Math.min(1, R / Math.hypot(tx, ty));
    g.line([P(fx, fy), P(fx + (tx - fx) * k, fy + (ty - fy) * k)], { stroke: '#2c3342', w: 1.5 });
  }
  g.circle(ox, oy, h.flangeR * S + 6, { stroke: C.faint, w: 8 });
  g.circle(ox, oy, h.shellR * S, { fill: '#1e2430', stroke: C.muted, w: 1.5 });
  g.circle(ox, oy, 4.5 * S, { fill: '#0b0e15', stroke: C.muted });
  g.circle(ox, oy, R * S, { stroke: C.faint, dash: '4 6' });
  for (const l of h.layers) {
    const [x0, y0] = P(-l.tangential / 2, l.r0 + l.radial);
    g.rect(x0, y0, l.tangential * S, l.radial * S, { fill: fill[l.id], stroke: edge[l.id], w: 1.5, r: l.id === 'pack' ? 4 : 6 });
    g.text(ox, y0 + (l.radial * S) / 2 + 1, l.name, { anchor: 'middle', size: 12, weight: 700 });
    g.text(ox, y0 + (l.radial * S) / 2 + 15, `${Math.round(l.massG)} g`, { anchor: 'middle', size: 10, fill: C.muted });
  }
  // the bracket: a saddle on the shell with rails up past the pack
  const pack = h.layers[0], br = h.bracket, bh = br.tangential / 2;
  const sad: number[][] = [P(-bh, br.railTo), P(-bh, h.shellR * 0.5)];
  for (let a = 180 - 30; a >= 30; a -= 5) sad.push(P((h.shellR + 0.2) * Math.cos((a * Math.PI) / 180), (h.shellR + 0.2) * Math.sin((a * Math.PI) / 180)));
  sad.push(P(bh, h.shellR * 0.5), P(bh, br.railTo));
  g.line(sad, { stroke: C.silk, w: 2.5 });
  g.text(ox - (bh + 4) * S, oy - (br.railTo - 4) * S, 'bracket (printed)', { size: 11, fill: C.silk, anchor: 'end' });
  // zip ties hold the bracket to the shell (seen end on: one loop under the shell)
  const ties: number[][] = [P(-bh + 2, h.shellR * 0.6)];
  for (let a = 200; a <= 340; a += 10) ties.push(P((h.shellR + 1.5) * Math.cos((a * Math.PI) / 180), (h.shellR + 1.5) * Math.sin((a * Math.PI) / 180)));
  ties.push(P(bh - 2, h.shellR * 0.6));
  g.line(ties, { stroke: C.ok, w: 2, dash: '6 4' });
  g.text(ox, oy + (h.shellR + 8) * S, 'zip ties: bracket to shell', { size: 11, fill: C.ok, anchor: 'middle' });
  // the strap over the stack, through the bracket's rails
  g.line([P(-bh, br.railTo - 3), P(-top.tangential / 2 - 1, outerR + 1.5), P(top.tangential / 2 + 1, outerR + 1.5), P(bh, br.railTo - 3)], { stroke: C.hall, w: 3 });
  g.text(ox, oy - (outerR + 5) * S, 'hook-and-loop strap', { size: 11, fill: C.hall, anchor: 'middle' });
  // the lid's controls, on the outer face: the two buttons, clear of the strap
  for (const dx of [-22, -12]) {
    const [bx0, by0] = P(dx, outerR);
    g.rect(bx0 - 3.5 * S / 2, by0 - 2 * S, 3.5 * S, 2 * S, { fill: C.ink, r: 2 });
  }
  g.text(ox + (top.tangential / 2 + 6) * S, oy - (outerR + 1) * S, 'lid: preset and brightness (on/off) buttons', { size: 11, fill: C.ink });
  // XT30 between pack and box
  const [xx, xy] = P(pack.tangential / 2 - 2, pack.r0 + pack.radial);
  g.rect(xx, xy - 7, 26, 14, { fill: '#2a2f3b', stroke: C.ink, r: 3 });
  g.text(xx + 30, xy + 4, 'XT30', { size: 10, fill: C.muted });
  g.text(20, oy + R * S + 30, `One stack on one side of the shell: ${h.moduleG} g, its centre ${h.moduleR} mm out. The bracket stays tied `
    + `on; the strap holds the pack and box.`, { size: 11, fill: C.muted });
  g.text(20, oy + R * S + 46, `Each goes in through the spokes end first: ${h.pieces.map((q) => `${q.name.toLowerCase()} ${q.opening.join(' × ')} mm`).join(', ')}.`, { size: 11, fill: C.muted });

  // ---- section through the axle and the stack ----
  const sx = ox + R * S + 120;
  const Q = (z: number, r: number) => [sx + (z + h.oldHalf + 10) * S, oy - r * S];
  g.heading(sx, 30, 'SECTION through the axle (mm, to scale)');
  const zMax = h.oldHalf;
  g.rect(Q(-zMax, 4.5)[0], Q(0, 4.5)[1], 2 * zMax * S, 9 * S, { fill: '#1e2430', stroke: C.muted });
  for (const sgn of [-1, 1]) {
    g.rect(Q(sgn * zMax - (sgn > 0 ? 4 : 0), 10)[0], Q(0, 10)[1], 4 * S, 20 * S, { fill: '#2a2f3b', stroke: C.muted });
    const fz = sgn * h.flangeZ;
    g.rect(Q(fz - 1.5, h.flangeR + 4)[0], Q(0, h.flangeR + 4)[1], 3 * S, 2 * (h.flangeR + 4) * S, { fill: '#2a2f3b', stroke: C.muted });
    for (const up of [1, -1]) {
      const z1 = fz * (1 - (R - h.flangeR) / (h.rimR - h.flangeR));
      g.line([Q(fz, up * h.flangeR), Q(z1, up * R)], { stroke: '#5a6375', w: 2 });
      const pz = (r: number) => fz * (1 - (r - h.flangeR) / (h.rimR - h.flangeR)) + sgn * 3;
      g.line([Q(pz(25), up * 25), Q(pz(R), up * R)], { stroke: C.ok, w: 2 });
    }
  }
  g.rect(Q(-h.flangeZ, h.shellR)[0], Q(0, h.shellR)[1], 2 * h.flangeZ * S, 2 * h.shellR * S, { fill: '#1e2430', stroke: C.muted });
  const env: number[][] = [], envB: number[][] = [];
  for (let r = h.flangeR; r <= R; r += 2) { const half = h.freeAxialAt(r) / 2; env.push(Q(-half, r)); envB.push(Q(half, r)); }
  g.line(env, { stroke: C.ok, dash: '3 4', w: 1 });
  g.line(envB, { stroke: C.ok, dash: '3 4', w: 1 });
  for (const l of h.layers) {
    const [x0, y0] = Q(-l.axial / 2, l.r0 + l.radial);
    g.rect(x0, y0, l.axial * S, l.radial * S, { fill: fill[l.id], stroke: edge[l.id], w: 1.5, r: 4 });
  }
  {
    const ba = h.bracket.axial / 2;
    g.line([Q(-ba, h.bracket.railTo), Q(-ba, h.shellR), Q(ba, h.shellR), Q(ba, h.bracket.railTo)], { stroke: C.silk, w: 2.5 });
  }
  const tz = top.axial / 2;
  g.line([Q(-tz, outerR - 6), Q(-h.flangeZ * 0.8, outerR + 2), Q(-h.flangeZ - 8, outerR + 8)], { stroke: C.data, w: 2.5 });
  g.text(Q(-h.flangeZ - 10, 0)[0], Q(0, outerR + 12)[1], 'J2 → left panel', { size: 11, fill: C.data, anchor: 'end' });
  // the right panel
  const j = Q(h.flangeZ + 10, -70);
  g.line([Q(tz, outerR - 6), Q(h.flangeZ * 0.7, outerR - 6), Q(h.flangeZ * 0.7, -40), [j[0], j[1]]], { stroke: C.data, w: 2.5, dash: '6 4' });
  g.rect(j[0] - 10, j[1] - 14, 34, 28, { fill: '#2a2f3b', stroke: C.ink, r: 6 });
  g.text(j[0] + 7, j[1] + 4, 'J1', { size: 11, anchor: 'middle', weight: 700 });
  g.text(j[0] + 30, j[1] + 4, 'on a right spoke', { size: 11, fill: C.muted });
  g.text(Q(h.flangeZ * 0.7, 0)[0] + 6, Q(0, -h.shellR - 10)[1], 'pigtail tied round the shell', { size: 11, fill: C.muted });
  const outer = Math.hypot(outerR, top.tangential / 2);
  g.text(sx, oy + R * S + 30, `Green dashes: room between the spoke cones; at the stack's outer corner (r ${Math.round(outer)} mm) there `
    + `are ${Math.round(h.freeAxialAt(outer))} mm, it needs ${Math.round(top.axial)}.`, { size: 11, fill: C.muted });
  g.text(sx, oy + R * S + 46, `Hub shell Ø${2 * h.shellR} mm, flanges ±${h.flangeZ} mm, flange holes Ø${2 * h.flangeR} mm. Measure your `
    + `hub: Hardware → Wheel → Hub.`, { size: 11, fill: C.muted });

  // ---- balance: the whole wheel, small ----
  const bx = sx + (2 * h.oldHalf + 20) * S + 120, k = 0.42;
  const bcx = bx + h.rimR * k, bcy = oy;
  g.heading(bx, 30, 'BALANCE (whole wheel)');
  g.circle(bcx, bcy, h.rimR * k, { stroke: C.muted, w: 3 });
  g.circle(bcx, bcy, e.hub.counterweight.r * k, { stroke: C.faint, dash: '3 5' });
  const at = (r: number, deg: number) => [bcx + r * k * Math.cos(((90 + deg) * Math.PI) / 180), bcy - r * k * Math.sin(((90 + deg) * Math.PI) / 180)];
  const mark = (r: number, deg: number, col: string, label: string, size: number, anchor: 'start' | 'end' | 'middle' = 'start') => {
    const [x, y] = at(r, deg);
    g.circle(x, y, size, { fill: col });
    g.text(x + (anchor === 'end' ? -size - 6 : anchor === 'start' ? size + 6 : 0), y + (anchor === 'middle' ? size + 16 : 4), label, { size: 11, fill: col, anchor });
  };
  const [mod, ...rest] = h.masses;
  mark(mod.r, mod.angleDeg, C.data, `module ${mod.massG} g`, 6);
  for (const q of rest) mark(q.r, q.angleDeg, C.muted, `${q.name} ${q.massG} g`, 4, q.r > 200 ? 'middle' : 'start');
  const cw = h.counterweight;
  const [cwx, cwy] = at(cw.r, cw.angleDeg + 10);
  g.circle(cwx, cwy, 7, { fill: C.ok });
  g.line([[cwx + 6, cwy - 6], [cwx + 40, cwy - 40]], { stroke: C.ok, w: 1 });
  g.text(cwx + 44, cwy - 44, `rim weight ${cw.massG} g`, { size: 11, fill: C.ok, weight: 600 });
  const lines = [...h.masses, cw].map((q) => `${q.name}: ${q.massG} g at r ${Math.round(q.r)} mm, ${q.angleDeg ? 'opposite' : 'module side'} → ${Math.round(q.massG * q.r)} g·mm`);
  lines.forEach((t, i) => g.text(bx, bcy + h.rimR * k + 50 + i * 16, t, { size: 11, fill: i === lines.length - 1 ? C.ok : C.muted }));
  g.text(bx, bcy + h.rimR * k + 50 + lines.length * 16 + 6, `Stick the weight on the rim's inner face, centred, `
    + `${cw.angleDeg === 180 ? 'opposite the module' : 'on the module\'s side'}.`, { size: 11, fill: C.muted });

  const W = bx + 2 * h.rimR * k + 140;
  const H = Math.max(oy + R * S + 70, bcy + h.rimR * k + 60 + lines.length * 16);
  return { svg: g.svg(W, H), w: W, h: H };
}

// ---------------------------------------------------------------- carrier board
/** Through-hole footprints, lying along x (a vertical part turns them a quarter): pad centres, the pad and hole sizes, and the body. */
const TH = (pins: [number, number][], body: { w: number; h: number; round?: boolean; at?: [number, number] }, pad = 1.7, hole = 0.8) => ({ pins, body, pad, hole });
const PKG: Record<Pkg, ReturnType<typeof TH>> = {
  // pins 1–7 along the bottom left to right, 8–14 along the top right to left; rows 0.3" apart
  'DIP-14': TH(Array.from({ length: 14 }, (_, i) => (i < 7 ? [-7.62 + 2.54 * i, 3.81] : [7.62 - 2.54 * (i - 7), -3.81]) as [number, number]), { w: 18.6, h: 6.3 }),
  'SIP-8': TH(Array.from({ length: 8 }, (_, i) => [-8.89 + 2.54 * i, 0] as [number, number]), { w: 20.2, h: 2.4 }),
  'SIP-6': TH(Array.from({ length: 6 }, (_, i) => [-6.35 + 2.54 * i, 0] as [number, number]), { w: 15.1, h: 2.4 }),
  axial: TH([[-1.27, 0], [1.27, 0]], { w: 2.5, h: 2.5, round: true, at: [-1.27, 0] }), // standing: the body over pin 1
  'DO-35': TH([[-1.27, 0], [1.27, 0]], { w: 2.0, h: 2.0, round: true, at: [-1.27, 0] }),
  'DO-201': TH([[-2.54, 0], [2.54, 0]], { w: 5.3, h: 5.3, round: true, at: [-2.54, 0] }, 2.4, 1.3),
  'TO-92': TH([[-2.54, 0], [0, 0], [2.54, 0]], { w: 4.8, h: 3.8 }),
  disc: TH([[-1.27, 0], [1.27, 0]], { w: 4.0, h: 2.5 }),
  'radial-5': TH([[-1.0, 0], [1.0, 0]], { w: 5.0, h: 5.0, round: true }),
  'radial-6.3': TH([[-1.25, 0], [1.25, 0]], { w: 6.3, h: 6.3, round: true }),
};
const GROUP: Record<BoardPart['group'], string> = { shift: C.data, power: C.power, input: C.hall, filter: C.ctl };

function board(e: Electronics): Sheet {
  const g = new Pen();
  const S = 18; // px per mm
  const Wmm = CARRIER.w, Hmm = CARRIER.h;
  const ox = 240, oy = 110;
  const B = (x: number, y: number) => [ox + x * S, oy + y * S];
  const { parts, headers, fx0, fy0 } = carrierLayout(e);
  g.heading(20, 30, `CARRIER BOARD, ${Wmm} × ${Hmm} mm, top side, to scale: an etched 2-layer PCB with through-hole parts only, for soldering by hand`);
  g.rect(ox, oy, Wmm * S, Hmm * S, { fill: C.board, stroke: C.copper, w: 2, r: 2.5 * S });
  // the Feather above, on one end, and its two header rows with every pin named
  const [fxp, fyp] = B(fx0, fy0);
  g.rect(fxp, fyp, CARRIER.feather * S, CARRIER.featherH * S, { stroke: C.silk, dash: '6 5', w: 1.2, r: 2 * S });
  g.text(fxp + 6, fyp + CARRIER.featherH * S / 2 + 4, 'USB', { size: 10, fill: C.silk });
  const pad = (x: number, y: number, d: number, hole: number) => {
    const [cx, cy] = B(x, y);
    g.circle(cx, cy, (d / 2) * S, { fill: C.copper });
    g.circle(cx, cy, (hole / 2) * S, { fill: '#0b0e15' });
    return [cx, cy];
  };
  for (const h of headers) {
    const [cx, cy] = pad(h.x, h.y, 1.7, 1.0);
    const top = h.y < Hmm / 2;
    g.text(cx, cy + (top ? -1.2 : 1.75) * S, h.label, { size: 9, fill: h.net ? (h.net === 'GND' ? C.silk : netColour(h.net)) : '#6f7d6f', anchor: 'middle', weight: h.net ? 700 : 400 });
  }
  // every part: through-hole pads, its body, and its reference
  for (const p of parts) {
    const k = PKG[p.pkg], v = !!p.vertical;
    const T = ([x, y]: [number, number]): [number, number] => (v ? [p.at[0] + y, p.at[1] + x] : [p.at[0] + x, p.at[1] + y]);
    const [bw, bh] = v ? [k.body.h, k.body.w] : [k.body.w, k.body.h];
    const [bx, by] = B(...T(k.body.at ?? [0, 0]));
    if (k.body.round) g.circle(bx, by, (bw / 2) * S, { fill: '#2a2f2a', stroke: GROUP[p.group], w: 1.4 });
    else {
      const fill = p.pkg === 'DIP-14' || p.pkg.startsWith('SIP') ? '#1b1b1b' : '#2a2f2a';
      g.rect(bx - (bw * S) / 2, by - (bh * S) / 2, bw * S, bh * S, { fill, stroke: GROUP[p.group], w: 1.4, r: p.pkg === 'TO-92' ? 8 : 2 });
    }
    k.pins.forEach((q, i) => {
      const [x, y] = T(q);
      if (i === 0) {
        const [cx, cy] = B(x, y);
        g.rect(cx - (k.pad / 2) * S, cy - (k.pad / 2) * S, k.pad * S, k.pad * S, { fill: C.copper, r: 1 });
        g.circle(cx, cy, (k.hole / 2) * S, { fill: '#0b0e15' });
      } else pad(x, y, k.pad, k.hole);
    });
    const [cx, cy] = B(...p.at);
    if (p.pkg === 'DIP-14') {
      g.text(cx, cy - 1, p.ref, { size: 14, weight: 700, fill: C.silk, anchor: 'middle', rot: v ? -90 : 0 });
      g.text(cx + (v ? 14 : 0), cy + (v ? 0 : 14), p.value, { size: 10, fill: '#b9c2b0', anchor: 'middle', rot: v ? -90 : 0 });
    } else if (p.pkg.startsWith('SIP')) {
      g.text(cx, cy - 1.8 * S, `${p.ref}  ${p.value}`, { size: 10, fill: C.silk, anchor: 'middle' });
    } else {
      const side = p.pkg === 'axial' || p.pkg === 'DO-35' || p.pkg === 'DO-201' ? (v ? [1.6, 0] : [0, 1.8]) : [0, 0];
      const [lx, ly] = B(p.at[0] + side[0], p.at[1] + side[1]);
      g.text(lx + (side[0] ? 2 : 0), ly + 4, p.ref, { size: 9, weight: 700, fill: C.silk, anchor: side[0] ? 'start' : 'middle' });
    }
  }
  // wire holes along the top (the left harness) and bottom (the right connector and the power board), numbered
  const leftPads = e.leftHarness.map((w) => w.net);
  const rightPads = ['+5V_R', 'GND', 'CLK_R5', ...Array.from({ length: e.n }, (_, i) => `R${i + 1}_5`)];
  const powerPads = ['+5V_L', 'GND', 'VBAT', 'LED_EN', 'CE', 'BTN_P', 'S1', 'GND'];
  const wireRow = (pads: string[], y: number, title: string, legendX: number, anchor: 'start' | 'end') => {
    pads.forEach((net, i) => {
      const [cx, cy] = pad(4 + i * 2.54, y, 2.0, 1.0); // 2 mm pad, 1 mm hole: 22–26 AWG
      g.text(cx, cy + 3.5, String(i + 1), { size: 8, fill: C.silk, anchor: 'middle', weight: 700 });
      g.text(legendX, oy + 14 + i * 16, `${i + 1}  ${net}`, { size: 11, fill: netColour(net), anchor });
    });
    g.text(legendX, oy - 10, title, { size: 11, fill: C.muted, anchor, weight: 600 });
  };
  wireRow(leftPads, 1.9, `top row: J2 left harness (${leftPads.length})`, ox - 24, 'end');
  wireRow([...rightPads, ...powerPads], Hmm - 1.9, `bottom row: J1 pigtail, power board (${rightPads.length + powerPads.length})`, ox + Wmm * S + 24, 'start');
  g.text(B(Wmm / 2, 0)[0], oy + Hmm * S + 24, 'Box wires: power board (GND, +5V_L in 18 AWG) and the lid\'s two buttons; the charger\'s IN '
    + 'shares +5V_R.', { size: 11, fill: C.muted, anchor: 'middle' });
  const [sbx, sby] = [ox + Wmm * S - 10 * S, oy + Hmm * S + 48];
  g.line([[sbx, sby], [sbx + 10 * S, sby]], { stroke: C.muted, w: 2 });
  g.text(sbx + 5 * S, sby - 5, '10 mm', { size: 10, fill: C.muted, anchor: 'middle' });

  // the parts list, then the Feather's pins
  const ty = Math.max(oy + Hmm * S + 90, oy + 30 + 16 * Math.max(leftPads.length, rightPads.length + powerPads.length));
  g.heading(20, ty, 'PARTS (all through-hole)');
  const legend: [BoardPart['group'], string][] = [['shift', 'level shifting'], ['power', 'power and latch'], ['input', 'hall and button inputs'], ['filter', 'sensing and filters']];
  legend.forEach(([grp, label], i) => { g.rect(230 + i * 170, ty - 10, 12, 12, { stroke: GROUP[grp], w: 2, r: 2 }); g.text(248 + i * 170, ty, label, { size: 11, fill: C.muted }); });
  const half = Math.ceil(parts.length / 2);
  parts.forEach((p, i) => {
    const col = Math.floor(i / half), row = i % half;
    const x = 20 + col * 700, y = ty + 26 + row * 17;
    g.text(x, y, p.ref, { size: 11, weight: 700, fill: GROUP[p.group] });
    g.text(x + 44, y, p.value, { size: 11 });
    g.text(x + 120, y, p.pkg, { size: 11, fill: C.muted });
    g.text(x + 205, y, p.fn, { size: 11, fill: C.muted });
  });
  const px0 = 1440;
  g.heading(px0, ty, 'FEATHER PINS');
  headers.filter((h) => h.net).forEach((h, i) => {
    const y = ty + 26 + i * 17;
    g.text(px0, y, h.label, { size: 11, weight: 700 });
    g.text(px0 + 50, y, h.net!, { size: 11, fill: netColour(h.net!) });
  });
  const y0 = ty + 26 + Math.max(half, headers.filter((h) => h.net).length) * 17 + 20;
  const notes = [
    'Through-hole only, for a DIY build: DIP shifters (Adafruit 1787), resistor packs, 1/4 W resistors standing up, TO-92 transistors, standing diodes and radial capacitors.',
    'The low parts (DIPs, resistor packs) sit under the Feather on its 8.5 mm female headers; everything taller sits beside it. Solder the low parts first, the headers last.',
    'Etched: about $5–15 for a few bare boards (OSH Park, JLCPCB, PCBWay); no assembly needed. Or build it on a perfboard cut to 90 × 32 mm, following this placement.',
    'Placement only, for routing in KiCad. Header pins follow Adafruit\'s Feather layout: check the long row\'s 3rd and last pins on the RP2350.',
    'Keep each lane\'s 33 Ω pack by its shifter and every lane over unbroken ground. D3 carries the right side\'s 5 V (≤ 2 A): wide copper, '
      + 'and it gets warm. The cells\' current never comes onto this board.',
  ];
  notes.forEach((t, i) => g.text(20, y0 + i * 18, t, { size: 12, fill: C.muted }));
  const W = Math.max(ox + Wmm * S + 260, 1700);
  const H = y0 + notes.length * 18 + 20;
  return { svg: g.svg(W, H), w: W, h: H };
}

export function drawSheet(id: SheetId, e: Electronics, spokes: number): Sheet {
  switch (id) {
    case 'circuit': return circuit(e);
    case 'wiring': return wiring(e);
    case 'hub': return hub(e, spokes);
    case 'board': return board(e);
  }
}
