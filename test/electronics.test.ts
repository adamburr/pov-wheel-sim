import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { bomCsv, designElectronics } from '../src/electronics/design';
import { drawSheet, SHEETS } from '../src/electronics/sheets';

describe('electronics', () => {
  const p = { ...defaultParams(), stripCount: 4 }; // the full build: four strips a side, every lane in use
  const e = designElectronics(p);

  it('gives every strip its own lane on GP0–7 (header pins), and each side a clock', () => {
    expect(e.n).toBe(4);
    expect(e.lanes.map((l) => l.gpio)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(e.pins.filter((q) => /^[LR]\d$/.test(q.net)).map((q) => q.pin)).toEqual(['TX', 'RX', 'SDA', 'SCL', 'D12', 'D5', 'D6', 'D13']);
    expect(e.bom.some((b) => /FPC/.test(b.item))).toBe(false); // no ribbon to the HSTX port
    const nets = e.pins.map((q) => q.net);
    expect(nets).toContain('CLK_L');
    expect(nets).toContain('CLK_R');
    const gpios = e.pins.filter((q) => q.gpio !== undefined).map((q) => q.gpio);
    expect(new Set(gpios).size).toBe(gpios.length); // no pin used twice
    expect(gpios).not.toContain(8); // the PSRAM's chip select
  });

  it('level-shifts every lane and clock, four to a 74AHCT125', () => {
    const ch = e.shifters.flatMap((u) => u.ch);
    expect(ch).toHaveLength(10);
    expect(e.shifters).toHaveLength(3);
    expect(ch.map((c) => c.a)).toEqual(expect.arrayContaining(['CLK_L', 'CLK_R', 'L1', 'R4']));
  });

  it('puts the preset and brightness buttons on the hub package, on spare header pins', () => {
    expect(e.pins.find((q) => q.net === 'BTN_PRESET')!.pin).toBe('A1');
    expect(e.pins.find((q) => q.net === 'SW')!.use).toMatch(/brightness/); // the brightness button is the on/off switch
    expect(e.bom.some((b) => /reed/i.test(b.item))).toBe(false);
    expect(e.leftHarness.some((w) => w.net.startsWith('BTN'))).toBe(false); // in the box's lid, not on a panel
    expect(e.bom.find((b) => /pushbutton/.test(b.item))!.qty).toBe(2);
  });

  it('puts the hall sensors on the left panel, one per strip', () => {
    expect(e.halls).toBe(4);
    expect(e.pins.filter((q) => q.net.startsWith('HALL')).map((q) => q.gpio)).toEqual([9, 20, 22, 23]);
    expect(e.leftHarness.filter((w) => /^HALL\d/.test(w.net))).toHaveLength(4);
    expect(e.rightHarness.some((w) => w.net.startsWith('HALL'))).toBe(false);
  });

  it('carries the right side on nine pins: 5 V and ground doubled, clock, four lanes', () => {
    expect(e.connector.map((c) => c.net)).toEqual(['+5V_R', '+5V_R', 'GND', 'GND', 'CLK_R5', 'R1_5', 'R2_5', 'R3_5', 'R4_5']);
    expect(e.power.perPinA).toBeLessThanOrEqual(3);
  });

  it('fills spare connector pins with ground and fewer lanes with fewer strips', () => {
    const f = designElectronics({ ...p, stripCount: 3 });
    expect(f.lanes.map((l) => l.gpio)).toEqual([0, 1, 2, 4, 5, 6]);
    expect(f.shifters).toHaveLength(2);
    expect(f.connector[8].net).toBe('GND');
  });

  it('wires the standard build even while the simulator compares it with shared back data', () => {
    const f = designElectronics({ ...p, backData: 'same' });
    expect(f.lanes).toHaveLength(8);
    expect(f.shifters.flatMap((u) => u.ch).find((c) => c.y === 'R1_5')!.a).toBe('R1');
  });

  it('stacks the module on one side of the shell, between the spoke cones', () => {
    expect(e.warnings).toEqual([]);
    const [pack, power, logic] = e.hub.layers;
    expect(pack.r0).toBeGreaterThan(e.hub.shellR);
    expect(power.r0).toBeCloseTo(pack.r0 + pack.radial);
    expect(logic.r0).toBeCloseTo(power.r0 + power.radial);
    for (const l of e.hub.layers) expect(l.axial).toBeLessThan(e.hub.freeAxialAt(Math.hypot(l.r0 + l.radial, l.tangential / 2)));
    expect(e.hub.bracket.axial).toBeLessThan(2 * e.hub.flangeZ);
  });

  it('balances the module with a weight on the rim opposite it', () => {
    const h = e.hub;
    const sum = [...h.masses, h.counterweight].reduce((m, q) => m + q.massG * q.r * Math.cos((q.angleDeg * Math.PI) / 180), 0);
    expect(Math.abs(sum)).toBeLessThan(0.5 * h.counterweight.r); // within half a gram at the rim
    expect(h.counterweight.angleDeg).toBe(180);
    expect(h.counterweight.r).toBe(p.bsdMm / 2 - p.rimDepthMm);
    expect(h.counterweight.massG).toBeGreaterThan(5);
    // more cells, more weight
    expect(designElectronics({ ...p, cells: 4 }).hub.counterweight.massG).toBeGreaterThan(h.counterweight.massG);
  });

  it('runs one strip a side, and balances its blades and strips with the module and a rim weight', () => {
    const f = designElectronics({ ...p, stripCount: 1 });
    expect(f.lanes.map((l) => l.gpio)).toEqual([0, 4]);
    expect(f.shifters).toHaveLength(1);
    expect(f.halls).toBe(1);
    expect(f.connector.slice(5).map((c) => c.net)).toEqual(['R1_5', 'GND', 'GND', 'GND']);
    const blades = f.hub.masses.find((q) => q.name.startsWith('Blades'))!;
    expect(blades.angleDeg).toBe(180); // the module goes opposite them
    const sum = [...f.hub.masses, f.hub.counterweight].reduce((m, q) => m + q.massG * q.r * Math.cos((q.angleDeg * Math.PI) / 180), 0);
    expect(Math.abs(sum)).toBeLessThan(0.5 * f.hub.counterweight.r);
    expect(f.warnings).toEqual([]);
  });

  it('warns when the LED limit is more than the boost gives', () => {
    expect(designElectronics({ ...p, ledCapA: 7 }).warnings.join(' ')).toMatch(/boost/);
  });

  it('buys a half-metre strip per blade, which even the largest wheel never outgrows', () => {
    const strips = (q: typeof p) => designElectronics(q).bom.find((b) => b.part === '2328')!.qty;
    expect(e.leds).toBe(38);
    expect(strips(p)).toBe(8);
    expect(strips({ ...p, stripCount: 3 })).toBe(6);
    expect(designElectronics({ ...p, bsdMm: 1300, panelTipRadiusMm: 0, panelStripMinMm: 15 }).leds).toBe(72);
  });

  it('lists the carrier board\'s parts from its own layout, every one through-hole', () => {
    const lines = e.bom.filter((b) => b.group === 'Carrier board');
    expect(lines.find((b) => /74AHCT125/.test(b.item))!.qty).toBe(e.shifters.length);
    // the 33 Ω series resistors come in packs of four, enough for every lane and clock
    const packs = lines.find((b) => /4 × 33Ω/.test(b.item))!.qty;
    expect(packs * 4).toBeGreaterThanOrEqual(e.shifters.flatMap((u) => u.ch).length);
    // every part counted once; no surface-mount packages
    const refs = lines.flatMap((b) => b.item.match(/\(([^)]*)\)$/)?.[1].split(', ') ?? []);
    expect(new Set(refs).size).toBe(refs.length);
    expect(lines.some((b) => /SOIC|SOT-23|0603|0805/.test(b.item + b.part))).toBe(false);
  });

  it('writes the shopping list as CSV with a row per line', () => {
    const csv = bomCsv(e).trim().split('\n');
    expect(csv[0]).toBe('Group,Qty,Item,Part,Source,Each (USD),Line (USD),Link,Note');
    expect(csv).toHaveLength(e.bom.length + 1);
    expect(e.knownCost).toBeGreaterThan(100);
  });

  it('draws every sheet', () => {
    for (const s of SHEETS) {
      const d = drawSheet(s.id, e, p.spokes);
      expect(d.svg.startsWith('<svg')).toBe(true);
      expect(d.w).toBeGreaterThan(0);
      expect(d.svg).not.toMatch(/NaN|undefined/);
    }
  });
});
