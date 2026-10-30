// The wheel's electronics, worked out from the hardware settings. One platform: an Adafruit Feather
// RP2350 (HSTX port, 8 MB PSRAM) drives Adafruit DotStar strips (SK9822) through 74AHCT125 level
// shifters. The hub module is one stack on one side of the hub shell, between the flanges, held by a
// few zip ties so it goes on and comes off in one piece: a battery pack (18650 cells) on a saddle that
// sits on the shell, and an electronics box on top (power board, then the Feather on its carrier). A
// weight on the rim opposite balances it. The left panel is wired straight to it; the right panel
// plugs in through a waterproof 9-pin connector, which also takes the charging lead when the right
// panel is off.
//
// The data: one PIO program shifts eight lanes out on GPIO0–7, a run of eight pins that all reach the
// Feather's headers (TX, RX, SDA, SCL, D12, D5, D6, D13), and side-sets the two clocks on GPIO10/11.
// Everything is wired from the headers, so no ribbon cable to the HSTX port (whose pins, GPIO12–19,
// stay unused). It costs the UART and I2C (STEMMA QT) pins: debug goes over USB.
import { LED, type Params } from '../params';
import { CARRIER, carrierLayout } from './carrier';
import { hallSensors } from '../sim/firmware';
import { derive } from '../sim/timing';

export type SideId = 'L' | 'R';

/** A Feather pin and what it carries. */
export interface PinUse { pin: string; gpio?: number; net: string; use: string }
/** One 74AHCT125: four 3.3 V → 5 V buffers. */
export interface Shifter { ref: string; ch: { a: string; y: string }[] }
export interface ConnPin { n: number; net: string; use: string }
export interface Wire { net: string; colour: string; awg: number; use: string }
export interface BomLine {
  group: 'Wheel' | 'Carrier board' | 'Sealing and wiring' | 'Bench prototype (optional)';
  qty: number; item: string; part: string; source: string; url?: string; each?: number; note?: string;
}
/** One layer of the hub stack, outward from the shell. Sizes in mm: r0 is its inner face's distance from the axle. */
export interface Layer { id: 'pack' | 'power' | 'logic'; name: string; contents: string; r0: number; radial: number; tangential: number; axial: number; massG: number }
/** A mass that sets the wheel's balance: angle in the wheel plane, 0 = towards the module. */
export interface Mass { name: string; massG: number; r: number; angleDeg: number }

export interface Electronics {
  n: number;               // strips per side
  sides: number;           // 1 or 2 panels lit
  cells: number;
  shared: boolean;         // right strips mirror the left's data
  leds: number;            // LEDs per strip
  totalLeds: number;
  lanes: { net: string; gpio: number; side: SideId; strip: number }[];
  halls: number;
  pins: PinUse[];
  shifters: Shifter[];
  connector: ConnPin[];
  leftHarness: Wire[];
  rightHarness: Wire[];
  power: {
    peakA: number; capA: number; boostMaxA: number; battA: number; perCellA: number; ah: number;
    runtimeAtCapH: number; perSideA: number; perPinA: number; chargeA: number; chargeH: number; idleMa: number;
  };
  hub: {
    shellR: number; flangeR: number; flangeZ: number; oldHalf: number; rimR: number;
    /** The stack, inner layer first; the pack is one piece, power and logic share the electronics box. */
    layers: Layer[]; freeAxialAt: (r: number) => number;
    bracket: { axial: number; tangential: number; base: number; railTo: number; massG: number };
    moduleG: number; moduleR: number;   // the module's mass and the radius of its centre of mass
    masses: Mass[];                     // the module and what else is off-centre (connector, valve)
    counterweight: Mass;                // on the rim's inner face, opposite what it balances
    pieces: { name: string; opening: [number, number] }[]; // the smallest gap between the spokes each piece passes through
  };
  bom: BomLine[];
  knownCost: number;
  notes: string[];
  warnings: string[];
}

/** The Feather RP2350's header names for GPIO0–7, the data lanes (from Adafruit's CircuitPython board pins). */
export const LANE_PIN: Record<number, string> = { 0: 'TX', 1: 'RX', 2: 'SDA', 3: 'SCL', 4: 'D12', 5: 'D5', 6: 'D6', 7: 'D13' };
const HALL_PINS: [string, number][] = [['D9', 9], ['MI', 20], ['SCK', 22], ['MO', 23]];
const LED_MA = 60;           // full white, per LED (Adafruit)
const IDLE_MA = 1;           // SK9822 quiescent, per LED (approximate)
const BOOST_IN_A = 7;        // Pololu U3V70F5: input current it sustains
const BOOST_EFF = 0.85;
const CELL_V = 3.6;          // a working cell voltage under load
const PIN_A = 3;             // Weipu SP13 9-pin, per contact
const CELL = { d: 18.4, len: 65.2, g: 46.5 };
const STRIP_G_PER_MM = 0.06;  // DotStar 144/m in its sleeve, about 60 g a metre (estimate: weigh yours)
const BLADE_G_PER_MM = 0.04;  // a 27 mm polypropylene blade with its tabs, per mm of length (estimate)
export { CARRIER };
const WIRE_COLOURS = ['blue', 'green', 'white', 'grey'];
const HALL_COLOURS = ['brown', 'violet', 'pink', 'tan'];

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function designElectronics(p: Params): Electronics {
  const d = derive(p);
  const n = p.stripCount;
  const sides = p.doubleSided ? 2 : 1;
  const shared = sides === 2 && p.backData === 'same';
  const L = d.ledsPerStrip;
  const totalLeds = n * sides * L;
  const halls = hallSensors(p);
  const warnings: string[] = [];
  const notes: string[] = [];

  // ---- Lanes: left strips on GPIO0.., right on GPIO4.. (one PIO program, eight pins in a row) ----
  const lanes: Electronics['lanes'] = [];
  for (let i = 0; i < n; i++) lanes.push({ net: `L${i + 1}`, gpio: i, side: 'L', strip: i + 1 });
  if (sides === 2 && !shared) for (let i = 0; i < n; i++) lanes.push({ net: `R${i + 1}`, gpio: 4 + i, side: 'R', strip: i + 1 });
  const rightNet = (i: number) => (shared ? `L${i + 1}` : `R${i + 1}`);

  const pins: PinUse[] = [
    { pin: 'D10', gpio: 10, net: 'CLK_L', use: 'left strips\' clock (PIO side-set)' },
    ...(sides === 2 ? [{ pin: 'D11', gpio: 11, net: 'CLK_R', use: 'right strips\' clock (PIO side-set)' }] : []),
    ...lanes.map((l) => ({ pin: LANE_PIN[l.gpio], gpio: l.gpio, net: l.net, use: `${l.side === 'L' ? 'left' : 'right'} strip ${l.strip} data (PIO)` })),
    ...HALL_PINS.slice(0, halls).map(([pin, gpio], i) => ({ pin, gpio, net: `HALL${i + 1}`, use: `hall sensor ${i + 1} (falling edge interrupt)` })),
    { pin: 'A0', gpio: 26, net: 'VBAT/2', use: 'battery voltage through a 100k/100k divider' },
    { pin: 'A2', gpio: 28, net: 'LED_EN', use: 'turns the 5 V boost and the right side\'s 5 V on' },
    { pin: 'D24', gpio: 24, net: 'HOLD', use: 'keeps the power on once running (soft latch)' },
    { pin: 'D25', gpio: 25, net: 'SW', use: 'reads the brightness button, which is also the on/off switch' },
    { pin: 'A1', gpio: 27, net: 'BTN_PRESET', use: 'preset button: next preset; double-click: Auto on or off' },
    { pin: 'BAT', net: 'VSYS', use: 'switched battery in (powers the Feather\'s 3.3 V regulator); cut the Feather\'s CHG jumper' },
    { pin: '3V', net: '3V3', use: 'pull-ups for the hall sensors' },
    { pin: 'GND', net: 'GND', use: '' },
  ];
  notes.push('Controls on the hub package: two sealed buttons in the electronics box\'s lid, its outer face. The panels\' discs cover the box from the sides, so reach them through the spokes beyond the discs\' edge (raised caps help). Preset: a click for the next preset, a double click to turn Auto on or off (the next preset each time the lights go out). Brightness: cycles 100, 50, 25, 12 % (the firmware scales its LED current limit), and keeps the level when switched off; a double click turns the wheel on or off. It is wired into the power latch: off, a press powers the Feather, which stays on only if a second press follows. The preset button has a 10k pull-up, 1k in series and 100 nF; the brightness button sits on the latch\'s 100k pull-up.');
  notes.push('Power: the boost runs straight off the cells (through the protection board and fuse) and LED_EN turns it on; a 4.7 kΩ pull-down holds it off while the logic is off. The brightness button and HOLD latch only the logic\'s supply, so the off drain is a few tens of µA.');
  notes.push('Charging: with the right panel unplugged, a lead from a USB-C charger into J1 feeds 5 V back up +5V_R to the charger. The SB540 diode (D3) between the two sides keeps it off the left strips, and the charger only runs while the logic is off.');
  notes.push('Data on GPIO0–7, all on the headers: the UART (TX/RX) and I2C (SDA/SCL, the STEMMA QT socket) go to the strips, so debug over USB. GPIO7 is also the red LED: it flickers with right strip 4\'s data. GPIO8 is the PSRAM\'s chip select: leave it alone. A1 and A3 are spare.');

  // ---- Level shifters: every lane and clock through a 74AHCT125 at 5 V (3.3 V in reads as high) ----
  const chans: { a: string; y: string }[] = [];
  chans.push({ a: 'CLK_L', y: 'CLK_L5' });
  for (let i = 0; i < n; i++) chans.push({ a: `L${i + 1}`, y: `L${i + 1}_5` });
  if (sides === 2) {
    chans.push({ a: 'CLK_R', y: 'CLK_R5' });
    for (let i = 0; i < n; i++) chans.push({ a: rightNet(i), y: `R${i + 1}_5` });
  }
  const shifters: Shifter[] = [];
  for (let i = 0; i < chans.length; i += 4) shifters.push({ ref: `U${shifters.length + 1}`, ch: chans.slice(i, i + 4) });

  // ---- Connector J1 (right panel, Weipu SP13 9-pin) ----
  const connector: ConnPin[] = [
    { n: 1, net: '+5V_R', use: '5 V to the right strips (charging: 5 V in)' },
    { n: 2, net: '+5V_R', use: '5 V, second contact' },
    { n: 3, net: 'GND', use: 'ground' },
    { n: 4, net: 'GND', use: 'ground, second contact' },
    { n: 5, net: 'CLK_R5', use: 'clock to every right strip' },
  ];
  for (let i = 0; i < 4; i++) {
    connector.push(sides === 2 && i < n
      ? { n: 6 + i, net: `R${i + 1}_5`, use: `right strip ${i + 1} data` }
      : { n: 6 + i, net: 'GND', use: 'spare (ground)' });
  }

  // ---- Harnesses ----
  const leftHarness: Wire[] = [
    { net: '+5V_L', colour: 'red', awg: 22, use: '5 V to the left strips' },
    { net: 'GND', colour: 'black', awg: 22, use: 'strip ground' },
    { net: 'CLK_L5', colour: 'yellow', awg: 26, use: 'clock to every left strip' },
    ...Array.from({ length: n }, (_, i) => ({ net: `L${i + 1}_5`, colour: WIRE_COLOURS[i], awg: 26, use: `strip ${i + 1} data` })),
    { net: 'HALL_V', colour: 'orange', awg: 26, use: 'hall sensors\' supply (filtered battery)' },
    { net: 'HALL_GND', colour: 'black/white', awg: 26, use: 'hall sensors\' ground (kept off the strip ground)' },
    ...Array.from({ length: halls }, (_, i) => ({ net: `HALL${i + 1}`, colour: HALL_COLOURS[i], awg: 26, use: `hall sensor ${i + 1} output` })),
  ];
  const rightHarness: Wire[] = sides === 2 ? [
    { net: '+5V_R', colour: 'red', awg: 22, use: '5 V (J1 pins 1–2)' },
    { net: 'GND', colour: 'black', awg: 22, use: 'ground (J1 pins 3–4)' },
    { net: 'CLK_R5', colour: 'yellow', awg: 26, use: 'clock (J1 pin 5)' },
    ...Array.from({ length: n }, (_, i) => ({ net: `R${i + 1}_5`, colour: WIRE_COLOURS[i], awg: 26, use: `strip ${i + 1} data (J1 pin ${6 + i})` })),
  ] : [];

  // ---- Power ----
  const peakA = (totalLeds * LED_MA) / 1000;
  const capA = Math.min(p.ledCapA, peakA);
  const boostMaxA = (BOOST_IN_A * BOOST_EFF * CELL_V) / 5;
  const logicA = 0.06 + 0.004 * halls;
  const battA = (capA * 5) / (BOOST_EFF * CELL_V) + logicA;
  const ah = (p.cells * p.cellMah) / 1000;
  const perSideA = capA / sides;
  const chargeA = 1;
  const power = {
    peakA: r1(peakA), capA: r2(capA), boostMaxA: r1(boostMaxA), battA: r1(battA), perCellA: r1(battA / p.cells), ah: r1(ah),
    runtimeAtCapH: r1((ah * 0.9) / battA), perSideA: r2(perSideA), perPinA: r2(perSideA / 2),
    chargeA, chargeH: r1((ah / chargeA) * 1.15), idleMa: Math.round(totalLeds * IDLE_MA),
  };
  if (capA > boostMaxA) warnings.push(`The ${capA} A LED limit is more than the boost gives from a ${CELL_V} V cell (about ${power.boostMaxA} A): lower it, or use a second boost per side.`);
  if (battA / p.cells > 10) warnings.push(`Each cell gives ${power.perCellA} A at the LED limit: add a cell or lower the limit (keep high-drain cells under ~10 A).`);
  if (sides === 2 && perSideA / 2 > PIN_A) warnings.push(`The right side draws ${power.perSideA} A over two 5 V contacts, more than the connector's ${PIN_A} A each.`);
  notes.push(`Full white on every LED would need ${power.peakA} A. The firmware scales each column so the strips never draw more than ${power.capA} A in all (most pictures need far less: see Stats).`);
  if (shared) notes.push('Back strips share the front\'s data (Hardware → LEDs → Back strips), so the right side gets copies of the left lanes through its own buffers.');

  // ---- Hub module: one stack on one side of the shell, balanced by a weight on the rim ----
  const shellR = p.hubShellMm / 2;
  const flangeR = p.hubFlangePcdMm / 2;
  const flangeZ = p.hubFlangeOffsetMm;
  const rimR = p.bsdMm / 2;
  // The spokes leave each flange for the rim's centre line: between the flanges there is room out to
  // where the two cones close in (flange thickness ~3 mm, spoke heads on the inside).
  const freeAxialAt = (r: number) => 2 * flangeZ * (1 - Math.max(0, r - flangeR) / (rimR - flangeR)) - 6;
  // Cells lie across the axle (a 65 mm cell along it wouldn't clear the spoke cones), two side by side
  // along the axle per row; the pack's shell has a saddle curved to the hub shell.
  const perRow = Math.min(2, p.cells), rows = Math.ceil(p.cells / 2);
  const BASE = 3, WALL = 2;
  const pack: Layer = {
    id: 'pack', name: 'Battery pack', contents: `${p.cells} × 18650 (1S${p.cells}P), protection board`,
    r0: shellR + BASE, radial: rows * CELL.d + 2 * WALL, tangential: CELL.len + 2 * WALL + 2, axial: perRow * CELL.d + 2 * WALL,
    massG: p.cells * CELL.g + 6 + 8,
  };
  const pwrL: Layer = {
    id: 'power', name: 'Power board', contents: '5 V boost, charger, fuse; the two buttons in the lid', r0: pack.r0 + pack.radial,
    radial: 15, tangential: CARRIER.w + 2 * WALL + 2, axial: CARRIER.h + 2 * WALL + 2, massG: 19 + 6,
  };
  const logic: Layer = {
    id: 'logic', name: 'Logic', contents: 'Feather RP2350 on the carrier board', r0: pwrL.r0 + pwrL.radial,
    radial: 19 + WALL, tangential: pwrL.tangential, axial: pwrL.axial, massG: 17 + 4,
  };
  const layers = [pack, pwrL, logic];
  // A printed bracket stays tied to the shell: a saddle curved to it, between the flanges, with side
  // rails up past the pack. The pack and the box sit in it under a hook-and-loop strap, so taking the
  // electronics off is the strap and two plugs; the bracket stays on the hub.
  const bracket = {
    axial: Math.max(pack.axial, pwrL.axial) + 2 * 2.5, tangential: Math.max(pack.tangential, pwrL.tangential) + 2 * 2.5,
    base: BASE, railTo: pack.r0 + pack.radial + 6, massG: 16,
  };
  const extraG = bracket.massG + 6; // + strap, ties and the plug between pack and box
  const moduleG = layers.reduce((m, l) => m + l.massG, 0) + extraG;
  const moduleR = (layers.reduce((m, l) => m + l.massG * (l.r0 + l.radial / 2), 0) + extraG * (shellR + bracket.railTo) / 2) / moduleG;
  if (2 * flangeZ - 6 < bracket.axial) warnings.push(`The bracket (${Math.round(bracket.axial)} mm) is wider than the gap between the flanges (about ${Math.round(2 * flangeZ - 6)} mm): check the flange spacing.`);
  for (const l of layers) {
    const outer = Math.hypot(l.r0 + l.radial, l.tangential / 2);
    if (l.axial > freeAxialAt(outer)) warnings.push(`The ${l.name.toLowerCase()} (${l.axial} mm along the axle) doesn't fit between the spoke cones at r ${Math.round(outer)} mm (${Math.round(freeAxialAt(outer))} mm free). Check the hub and flange settings.`);
  }
  // Balance: put the module opposite the valve and the connector on the far side too; the weight
  // makes up the rest, on the rim's inner face (spoke bed), in the wheel's mid-plane like the module.
  // With one blade per side, both blades and their strips sit at the same angle (the panels turn
  // alike): the module goes opposite them and helps balance them.
  const rIn = d.rStart * 1000, rOut = d.rEnd * 1000, lenMm = rOut - rIn;
  const oneBlade = n === 1 ? [{
    name: `Blades and strips (one a side)`, massG: Math.round(2 * lenMm * (STRIP_G_PER_MM + BLADE_G_PER_MM)), r: (rIn + rOut) / 2, angleDeg: 180,
  }] : [];
  const masses: Mass[] = [
    { name: 'Hub module', massG: moduleG, r: moduleR, angleDeg: 0 },
    ...oneBlade,
    { name: 'Valve (Presta)', massG: 6, r: rimR, angleDeg: 180 },
  ];
  const sum = (ms: Mass[]) => ms.reduce((m, q) => m + q.massG * q.r * Math.cos((q.angleDeg * Math.PI) / 180), 0);
  // J1 goes on whichever side is light, so it takes the place of some of the rim weight
  if (sides === 2) masses.splice(masses.length - 1, 0, { name: 'J1 connector pair', massG: 20, r: 70, angleDeg: sum(masses) >= 0 ? 180 : 0 });
  const net = sum(masses);
  const cwR = rimR - p.rimDepthMm;
  const counterweight: Mass = { name: 'Rim weight', massG: Math.ceil((Math.abs(net) / cwR) * 2) / 2, r: cwR, angleDeg: net >= 0 ? 180 : 0 };
  const pieces: Electronics['hub']['pieces'] = [
    { name: 'Bracket', opening: [Math.round(bracket.axial), Math.round(bracket.railTo - shellR)] },
    { name: 'Battery pack', opening: [Math.round(pack.axial), Math.round(pack.radial)] },
    { name: 'Electronics box', opening: [Math.round(pwrL.axial), Math.round(pwrL.radial + logic.radial)] },
  ];
  notes.push(`The hub module is one stack on one side of the shell. A 3D-printed bracket stays tied to the shell (three zip ties, or through the flange windows on a cut-out track hub); the battery pack and the electronics box sit in it, joined by an XT30, under a hook-and-loop strap. To take the electronics off: undo the strap, unplug J1 (the left panel comes with them).`);
  const cwSide = counterweight.angleDeg === 180 ? 'opposite the module' : 'on the module\'s side';
  if (n === 1) {
    const j1 = masses.find((q) => q.name.startsWith('J1'));
    notes.push(`Balance: one blade a side puts both blades and strips (about ${oneBlade[0].massG} g) on one side of the wheel. Fit the module opposite them, the valve on their side${j1 ? `, J1 ${j1.angleDeg ? 'on their side' : 'on the module\'s side'}` : ''}, and stick ${counterweight.massG} g on the rim's inner face ${cwSide}. The blade and strip masses are estimates: weigh them, and check by spinning the wheel in the stand.`);
  } else {
    notes.push(`Balance: ${Math.round(moduleG)} g with its centre ${Math.round(moduleR)} mm out. Fit it opposite the valve, tie J1 on the far side too, and stick ${counterweight.massG} g on the rim's inner face ${cwSide}. Take the weight off with the module.`);
  }
  notes.push(`Each piece goes in through the spokes on its own, end first: the bracket needs a gap of about ${pieces[0].opening.join(' × ')} mm, the battery pack ${pieces[1].opening.join(' × ')} mm, the electronics box ${pieces[2].opening.join(' × ')} mm. Check your wheel's gaps.`);

  // ---- Shopping list ----
  const stripsNeeded = n * sides;
  // One half-metre strip (72 LEDs) per blade, cut to length from its input end; the rest is spare.
  const HALF = 72;
  if (L > HALF) warnings.push(`${L} LEDs per strip is more than a half-metre strip holds (${HALF}): shorten the strips (Hardware → LEDs → Details).`);
  notes.push(`One half-metre strip per blade (${stripsNeeded} in all): each is cut to ${Math.min(L, HALF)} of its ${HALF} LEDs, from the tip in, stopping short of the hub flange; the offcuts are spares.`);
  notes.push('Buy half metres, not 1 m strips: a 1 m strip is two halves soldered together, with a 2–3 mm pitch error at the joint.');
  // the carrier's parts, counted from its layout: all through-hole, soldered by hand
  const KIND: Record<string, string> = {
    'DIP-14': '74AHCT125 quad buffer (3.3 V → 5 V), DIP-14', 'SIP-8': 'resistor pack, 8-pin SIP', 'SIP-6': 'resistor pack, 6-pin SIP',
    axial: 'resistor, 1/4 W', 'DO-35': 'diode', 'DO-201': 'Schottky diode, 5 A', 'TO-92': 'transistor, TO-92', disc: 'ceramic capacitor',
    'radial-5': 'electrolytic capacitor', 'radial-6.3': 'electrolytic capacitor',
  };
  const byValue = new Map<string, { refs: string[]; pkg: string; value: string; part: string }>();
  for (const q of carrierLayout({ shifters, halls, pins }).parts) {
    const k = `${q.value}|${q.pkg}`;
    const v = byValue.get(k) ?? { refs: [], pkg: q.pkg, value: q.value, part: q.part };
    v.refs.push(q.ref);
    byValue.set(k, v);
  }
  const carrierBom: BomLine[] = [...byValue.values()].map(({ refs, pkg, value, part }) => ({
    group: 'Carrier board' as const, qty: refs.length,
    item: `${pkg === 'DIP-14' ? KIND[pkg] : `${value} ${KIND[pkg]}`} (${refs.join(', ')})`,
    part, source: pkg === 'DIP-14' ? 'Adafruit 1787, Digi-Key, Mouser' : 'Digi-Key, Mouser',
    ...(pkg === 'DIP-14' ? { url: 'https://www.adafruit.com/product/1787', each: 1.5 } : {}),
  }));
  const bom: BomLine[] = [
    { group: 'Wheel', qty: stripsNeeded, item: 'DotStar LED strip, 144/m, black, 0.5 m (SK9822)', part: '2328', source: 'Adafruit', url: 'https://www.adafruit.com/product/2328', each: 24.95, note: `one per blade, cut to ${Math.min(L, HALF)} LEDs` },
    { group: 'Wheel', qty: 1, item: 'Feather RP2350 with HSTX port and 8 MB PSRAM', part: '6130', source: 'Adafruit', url: 'https://www.adafruit.com/product/6130', each: 15.5 },
    { group: 'Wheel', qty: halls, item: 'Hall effect sensor US5881LUA (unipolar switch)', part: '158', source: 'Adafruit', url: 'https://www.adafruit.com/product/158', each: 2, note: 'left panel, one per strip' },
    { group: 'Wheel', qty: 1, item: 'Rare-earth magnet, 12 mm (fork magnet for the hall sensors)', part: '9', source: 'Adafruit', url: 'https://www.adafruit.com/product/9', each: 2.5, note: 'south pole toward the sensors\' marked faces' },
    { group: 'Wheel', qty: 2, item: 'Momentary pushbutton, 12 mm, IP67, normally open, raised cap (preset, brightness)', part: 'e.g. 12 mm IP67 metal pushbutton', source: 'any', note: 'in the electronics box\'s lid' },
    { group: 'Wheel', qty: 1, item: '5 V step-up regulator U3V70F5 (true shutdown on EN)', part: '2891', source: 'Pololu', url: 'https://www.pololu.com/product/2891', each: 25.95 },
    { group: 'Wheel', qty: 1, item: 'bq24074 Li-ion charger breakout (1 A, 1.5 A by jumper)', part: '4755', source: 'Adafruit', url: 'https://www.adafruit.com/product/4755', each: 14.95, note: 'its CE pin turns charging off while running' },
    { group: 'Wheel', qty: p.cells, item: `18650 Li-ion cell, high-drain (≥ 10 A), ${p.cellMah} mAh, tabbed`, part: 'e.g. Samsung 30Q, Molicel P28A', source: 'battery supplier', note: 'tabbed, so nothing is soldered to the cell' },
    { group: 'Wheel', qty: 1, item: '1S Li-ion protection board, ≥ 10 A continuous', part: '1S BMS', source: 'any' },
    { group: 'Wheel', qty: 1, item: '10 A fuse in a sealed inline holder (mini blade)', part: 'ATM 10 A', source: 'any' },
    { group: 'Wheel', qty: 1, item: 'XT30 plug and socket (battery pack to electronics box)', part: 'XT30', source: 'any' },
    { group: 'Wheel', qty: 1, item: `Adhesive balancing weight, ${counterweight.massG} g (5 g segments, trimmed)`, part: 'stick-on wheel weights', source: 'any', note: `on the rim's inner face, ${counterweight.angleDeg === 180 ? 'opposite the module' : 'on the module\'s side'}` },
    { group: 'Wheel', qty: 1, item: `Hub bracket, 3D-printed: saddle for a Ø${p.hubShellMm} mm shell, ${Math.round(bracket.axial)} × ${Math.round(bracket.tangential)} mm, tie slots`, part: 'PETG or ASA', source: 'print', note: 'stays on the hub' },
    { group: 'Wheel', qty: 2, item: 'Shells for the battery pack and the electronics box, 3D-printed, sizes on the Hub module sheet', part: 'PETG or ASA', source: 'print', note: 'O-ring or silicone gasket on each lid' },
    { group: 'Wheel', qty: 1, item: 'Hook-and-loop strap, 20 mm, with buckle (holds the pack and box in the bracket)', part: '—', source: 'any' },
    { group: 'Wheel', qty: 1, item: 'Waterproof circular connector, 9-pin, IP68, inline socket (female)', part: 'Weipu SP1311/S9', source: 'Digi-Key, Mouser', note: 'module side: live pins stay shrouded' },
    { group: 'Wheel', qty: 2, item: 'Waterproof circular connector, 9-pin, IP68, cable plug (male)', part: 'Weipu SP1310/P9', source: 'Digi-Key, Mouser', note: 'right panel + charging lead' },
    { group: 'Wheel', qty: 1, item: 'SP13 dust cap for the socket (riding without the right panel)', part: 'Weipu SP13 cap', source: 'Digi-Key, Mouser' },
    { group: 'Wheel', qty: 1, item: 'USB-C sink breakout with 5.1 kΩ CC resistors (charging lead)', part: 'any USB-C breakout', source: 'any' },
    { group: 'Carrier board', qty: 1, item: `Carrier PCB, ${CARRIER.w} × ${CARRIER.h} mm, 2-layer, through-hole (from the Board sheet)`, part: '—', source: 'PCB fab (OSH Park, JLCPCB, PCBWay)', note: 'bare board: every part below is through-hole, soldered by hand' },
    ...carrierBom,
    { group: 'Carrier board', qty: 1, item: 'Feather female headers, 16 + 12 pin', part: '2886', source: 'Adafruit', url: 'https://www.adafruit.com/product/2886', each: 0.95 },
    { group: 'Sealing and wiring', qty: halls, item: '100 nF capacitor across each hall sensor\'s leads', part: '—', source: 'any' },
    { group: 'Sealing and wiring', qty: sides, item: '470 µF 6.3 V low-ESR capacitor at each panel\'s 5 V star', part: '—', source: 'any' },
    { group: 'Sealing and wiring', qty: 1, item: 'Silicone wire, 22 AWG, red and black (power)', part: '—', source: 'any', note: '~2 m each' },
    { group: 'Sealing and wiring', qty: 1, item: 'Silicone wire, 26 AWG, 10 colours (signals)', part: '—', source: 'any', note: '~1 m each' },
    { group: 'Sealing and wiring', qty: 1, item: 'Silicone wire, 18 AWG, red and black (cells, pack to box)', part: '—', source: 'any', note: '~0.5 m each' },
    { group: 'Sealing and wiring', qty: 1, item: 'Adhesive-lined heat-shrink, 3:1, assorted (joints, cable exits)', part: '—', source: 'any' },
    { group: 'Sealing and wiring', qty: 1, item: 'Conformal coating (carrier, Feather, power boards)', part: 'e.g. MG Chemicals 422', source: 'any' },
    { group: 'Sealing and wiring', qty: 1, item: 'Neutral-cure silicone RTV (strip ends, cable exits)', part: '—', source: 'any', note: 'not acetic-cure: it corrodes copper' },
    { group: 'Sealing and wiring', qty: stripsNeeded * 2, item: 'Silicone end caps for the strips\' sleeves', part: '—', source: 'any' },
    { group: 'Sealing and wiring', qty: 1, item: 'UV-resistant zip ties, 2.5 and 3.6 mm', part: '—', source: 'any' },
    { group: 'Bench prototype (optional)', qty: 1, item: 'FeatherWing Doubler (50.9 × 47 mm): the Feather beside a prototyping area for the shifters and latch', part: '2890', source: 'Adafruit', url: 'https://www.adafruit.com/product/2890', each: 7.5 },
  ];
  const knownCost = Math.round(bom.filter((b) => b.group !== 'Bench prototype (optional)' && b.each).reduce((s, b) => s + b.qty * b.each!, 0) * 100) / 100;
  notes.push('Carrier board: every part is through-hole for a DIY build (DIP shifters, resistor packs, TO-92 transistors, standing resistors and diodes), on an etched 90 × 32 mm board with the Feather plugged in at one end. To try the circuit first, the same parts fit a breadboard or a FeatherWing Doubler.');
  notes.push('Firmware updates: the Feather\'s USB-C is inside the logic box. Leave a removable boot over it in the box\'s end, or plan to reopen the box.');

  if (LED.protocol !== 'clocked') warnings.push('The level shifters and lanes assume clocked LEDs (DotStar).');
  if (p.clockMHz > 15) warnings.push(`A ${p.clockMHz} MHz LED clock is past what the SK9822 and ~30 cm of wire and connector carry reliably: 12 MHz keeps a margin.`);

  return {
    n, sides, cells: p.cells, shared, leds: L, totalLeds, lanes, halls, pins, shifters, connector, leftHarness, rightHarness, power,
    hub: { shellR, flangeR, flangeZ, oldHalf: p.hubOldMm / 2, rimR, layers, bracket, freeAxialAt, moduleG: Math.round(moduleG), moduleR: r1(moduleR), masses, counterweight, pieces },
    bom, knownCost, notes, warnings,
  };
}

/** The shopping list as CSV (one row per line, quantities for one wheel). */
export function bomCsv(e: Electronics): string {
  const q = (s: string | number | undefined) => {
    const t = s === undefined ? '' : String(s);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = [['Group', 'Qty', 'Item', 'Part', 'Source', 'Each (USD)', 'Line (USD)', 'Link', 'Note']];
  for (const b of e.bom) rows.push([b.group, String(b.qty), b.item, b.part, b.source, b.each?.toFixed(2) ?? '', b.each ? (b.qty * b.each).toFixed(2) : '', b.url ?? '', b.note ?? '']);
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
}
