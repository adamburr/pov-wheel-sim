import { describe, expect, it } from 'vitest';
import {
  ADAFRUIT_FIRMWARE, applyFirmware, applyHub, applyWheelSize, CUSTOM_HUB, defaultParams, HUBS, hubPresetOf, maxCrosses, WHEELS,
} from '../src/params';
import { parseSetup } from '../src/setupFile';
import { derive } from '../src/sim/timing';
import { designPanels } from '../src/panels/design';
import { panelInputs } from '../src/panels/fromParams';

describe('wheel size', () => {
  it('sets the whole wheel, and fits the panels inside the new rim', () => {
    const p = defaultParams();
    applyWheelSize(p, '20" (406)');
    expect(p).toMatchObject({ wheelPreset: '20" (406)', bsdMm: 406, tireMm: 50, spokes: 28, spokeCrosses: 3, panelTipRadiusMm: 0 });
    expect(p.forkCrownRadiusMm).toBe(254); // just over the tire
    const { wheel, panel } = panelInputs(p);
    const d = designPanels(wheel, panel);
    expect(d.rimNote).toBe(''); // the rim is the 20" one, not one moved out to a 700c tip
    expect(d.sides.LEFT.summary.tipR).toBeLessThan(406 / 2 - p.rimDepthMm);
    expect(derive(p).ledsPerStrip).toBe(d.sides.LEFT.summary.ledsPerStrip);
  });

  it('gives every size lacing its spokes can take, and keeps 700c as the defaults have it', () => {
    for (const w of Object.values(WHEELS)) expect(w.crosses).toBeLessThanOrEqual(maxCrosses(w.spokes));
    const p = defaultParams();
    applyWheelSize(p, '700c (622)');
    expect(p).toMatchObject({ spokeCrosses: defaultParams().spokeCrosses, forkCrownRadiusMm: defaultParams().forkCrownRadiusMm });
  });

  it('limits the crosses to N/8, and the design says when a setup asks for more', () => {
    expect([16, 28, 32, 36].map(maxCrosses)).toEqual([2, 3, 4, 4]);
    const p = { ...defaultParams(), spokes: 16, spokeCrosses: 3, stripCount: 2 };
    const d = designPanels(panelInputs(p).wheel, panelInputs(p).panel);
    expect(d.warnings.join(' ')).toMatch(/3 crosses on 16 spokes can't be laced/);
  });
});

describe('hub type', () => {
  it('sets a hub\'s typical width and flanges, and turns Custom once one is changed', () => {
    const p = defaultParams();
    expect(hubPresetOf(p)).toBe(p.hubPreset);
    applyHub(p, 'Boost front, 110 mm');
    expect(p).toMatchObject({ hubPreset: 'Boost front, 110 mm', hubOldMm: 110, hubFlangePcdMm: HUBS['Boost front, 110 mm'].pcdMm });
    p.hubOldMm = 108;
    expect(hubPresetOf(p)).toBe(CUSTOM_HUB);
  });
});

describe('compare with Adafruit\'s firmware', () => {
  it('switches all of its differences on together, and back to the standard build', () => {
    const p = defaultParams();
    p.compareAdafruit = true;
    applyFirmware(p);
    expect(p).toMatchObject(ADAFRUIT_FIRMWARE);
    expect(derive(p).stripUnits).toBe(p.stripCount); // back strips share the front's data
    p.compareAdafruit = false;
    applyFirmware(p);
    const d = defaultParams();
    for (const k of Object.keys(ADAFRUIT_FIRMWARE) as (keyof typeof ADAFRUIT_FIRMWARE)[]) expect(p[k]).toBe(d[k]);
  });
});

describe('old setup files', () => {
  it('load without the settings the standard build fixes', () => {
    const old = {
      format: 'pov-wheel-setup', version: 1, name: 'Old wheel', activePreset: 0, media: {},
      device: { stripCount: 3, ledDensity: 60, dieMm: 2, doubleSided: false, backData: 'same', clockMHz: 30, hallPerStrip: false, syncMode: 'free', batteryMah: 1 },
      presets: [{ id: 'a', name: 'Columns', settings: { pattern: 'Smiley', mapping: 'columns' } }],
    };
    const s = parseSetup(JSON.stringify(old));
    expect(s.device).toEqual({ stripCount: 3, setupName: 'Old wheel' }); // 'free' is no longer a sync choice
    expect(s.presets[0].settings).not.toHaveProperty('mapping');
  });
});
