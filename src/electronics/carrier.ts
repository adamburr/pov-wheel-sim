// The carrier board: every part on it with its reference, value, package and job, placed on an
// etched 90 × 32 mm board with the Feather plugged in at one end, and the Feather's header pins
// with what each one carries. Every part is through-hole, for a DIY build: the low ones (the DIP
// shifters, the resistor packs) sit under the Feather, the rest beside it. Placement only: the
// routing is for KiCad. Lengths in mm, origin at the board's top-left corner.
import type { Electronics } from './design';

/** The carrier board, and where the Feather (50.8 × 22.9 mm) sits on it. */
export const CARRIER = { w: 90, h: 32, feather: 50.8, featherH: 22.86, featherX: 2 };

export type Pkg = 'DIP-14' | 'SIP-8' | 'SIP-6' | 'axial' | 'DO-35' | 'DO-201' | 'TO-92' | 'disc' | 'radial-5' | 'radial-6.3';
export interface BoardPart {
  ref: string; value: string; pkg: Pkg; fn: string; at: [number, number]; vertical?: boolean;
  group: 'shift' | 'power' | 'input' | 'filter'; part: string;
}
export interface HeaderPin { label: string; x: number; y: number; net?: string }

/** The Feather's header rows (Adafruit's Feather layout): the long row at the top, the short one at the bottom, the USB end on the left. */
const LONG_ROW = ['RST', '3V', '3V', 'GND', 'A0', 'A1', 'A2', 'A3', 'D24', 'D25', 'SCK', 'MO', 'MI', 'RX', 'TX', '—'];
const SHORT_ROW = ['BAT', 'EN', 'USB', 'D13', 'D12', 'D11', 'D10', 'D9', 'D6', 'D5', 'SCL', 'SDA'];
export const PITCH = 2.54;

export function carrierLayout(e: Pick<Electronics, 'shifters' | 'halls' | 'pins'>) {
  const fx0 = CARRIER.featherX, fy0 = (CARRIER.h - CARRIER.featherH) / 2;
  const longX0 = fx0 + (CARRIER.feather - (LONG_ROW.length - 1) * PITCH) / 2;
  const shortX0 = longX0 + (LONG_ROW.length - SHORT_ROW.length) * PITCH; // the rows line up at the far end
  const rowY = [fy0 + 1.27, fy0 + CARRIER.featherH - 1.27];
  const netOf = new Map(e.pins.map((q) => [q.pin, q.net]));
  const headers: HeaderPin[] = [
    ...LONG_ROW.map((label, i) => ({ label, x: longX0 + i * PITCH, y: rowY[0], net: netOf.get(label) })),
    ...SHORT_ROW.map((label, i) => ({ label, x: shortX0 + i * PITCH, y: rowY[1], net: netOf.get(label) })),
  ];

  const parts: BoardPart[] = [];
  const add = (q: BoardPart) => parts.push(q);
  // under the Feather, all low: two shifters, the series-resistor packs and the pull-up pack
  const shiftAt: [number, number, boolean][] = [[13.5, 12.4, false], [35.5, 12.4, false], [59.5, 16, true]];
  e.shifters.forEach((u, i) => add({
    ref: u.ref, value: '74AHCT125', pkg: 'DIP-14', fn: `level shifter: ${u.ch.map((k) => k.a).join(', ')}`,
    at: [shiftAt[i][0], shiftAt[i][1]], vertical: shiftAt[i][2], group: 'shift', part: 'SN74AHCT125N (Adafruit 1787)',
  }));
  const decAt: [number, number, boolean][] = [[24.5, 19, true], [47, 12.4, true], [59.5, 27.2, false]];
  e.shifters.forEach((u, i) => add({ ref: `C${i + 1}`, value: '100nF', pkg: 'disc', fn: `${u.ref} decoupling`, at: [decAt[i][0], decAt[i][1]], vertical: decAt[i][2], group: 'shift', part: 'ceramic, 2.54 mm leads' }));
  const chans = e.shifters.flatMap((u) => u.ch);
  const packs = Math.ceil(chans.length / 4);
  const packAt: [number, number][] = [[13.5, 19], [35.5, 19], [13.5, 22.8]];
  for (let i = 0; i < packs; i++) {
    add({ ref: `RN${i + 1}`, value: '4 × 33Ω', pkg: 'SIP-8', fn: `series: ${chans.slice(4 * i, 4 * i + 4).map((k) => k.y).join(', ')}`, at: packAt[i], group: 'shift', part: 'Bourns 4608X-102-330LF (isolated)' });
  }
  add({ ref: `RN${packs + 1}`, value: '5 × 10k', pkg: 'SIP-6', fn: `pull-ups to 3V3: ${[...Array.from({ length: e.halls }, (_, i) => `HALL${i + 1}`), 'BTN_PRESET'].join(', ')}`, at: [33.8, 22.8], group: 'input', part: 'Bourns 4606X-101-103LF (bussed)' });

  // beside the Feather: the third shifter (above), then the resistors standing up, the latch and the capacitors
  const resistors: [string, string, BoardPart['group']][] = [
    ['10k', 'latch node pull-up (Q1 off)', 'power'],
    ['1k', 'Q1 base', 'power'],
    ['100k', 'on/off button node pull-up (to VBAT)', 'power'],
    ['100k', 'Q2 gate pull-down', 'power'],
    ['1k', 'BTN_PRESET series', 'input'],
    ['100k', 'battery divider, top', 'filter'],
    ['100k', 'battery divider, bottom', 'filter'],
    ['10k', 'charger CE from VSYS', 'power'],
    ['100k', 'charger CE pull-down', 'power'],
    ['4.7k', 'boost EN pull-down', 'power'],
    ['100Ω', 'hall supply filter', 'filter'],
  ];
  const cols = [67.5, 71, 74.5, 78, 81.5, 85];
  resistors.forEach(([value, fn, group], i) => add({
    ref: `R${i + 1}`, value, pkg: 'axial', fn, at: [cols[i % cols.length], i < cols.length ? 4.6 : 10.6], vertical: true, group, part: '1/4 W metal film, standing',
  }));
  add({ ref: 'Q1', value: 'BC327', pkg: 'TO-92', fn: 'logic power latch (PNP)', at: [69.5, 18], group: 'power', part: 'BC327-25' });
  add({ ref: 'Q2', value: '2N7000', pkg: 'TO-92', fn: 'latch hold (HOLD)', at: [76.5, 18], group: 'power', part: '2N7000' });
  add({ ref: 'D1', value: '1N4148', pkg: 'DO-35', fn: 'on/off button to the latch node', at: [81.2, 18], vertical: true, group: 'power', part: '1N4148, standing' });
  add({ ref: 'D2', value: '1N4148', pkg: 'DO-35', fn: 'on/off button sense (SW)', at: [84.2, 18], vertical: true, group: 'power', part: '1N4148, standing' });
  add({ ref: 'D3', value: 'SB540', pkg: 'DO-201', fn: '+5V_L to +5V_R (keeps the charging lead off the left strips)', at: [87.6, 19.2], vertical: true, group: 'power', part: 'SB540 (5 A Schottky), standing' });
  const n = e.shifters.length;
  add({ ref: `C${n + 1}`, value: '100µF', pkg: 'radial-6.3', fn: '+5V_L bulk', at: [68.5, 26.2], group: 'power', part: '100 µF 10 V electrolytic, 6.3 mm' });
  add({ ref: `C${n + 2}`, value: '10µF', pkg: 'radial-5', fn: 'hall supply filter', at: [75, 26.2], group: 'filter', part: '10 µF 16 V electrolytic, 5 mm' });
  add({ ref: `C${n + 3}`, value: '100nF', pkg: 'disc', fn: 'battery divider', at: [80.3, 26.2], group: 'filter', part: 'ceramic, 2.54 mm leads' });
  add({ ref: `C${n + 4}`, value: '100nF', pkg: 'disc', fn: 'BTN_PRESET filter', at: [85, 26.2], group: 'input', part: 'ceramic, 2.54 mm leads' });
  return { parts, headers, fx0, fy0, rowY };
}
