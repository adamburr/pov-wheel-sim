import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { derive } from '../src/sim/timing';
import { designPanels, designReport, type PanelDesign } from '../src/panels/design';
import { cutDxf, cutFiles, referenceDxf } from '../src/panels/dxf';
import { applyToSim, panelInputs } from '../src/panels/fromParams';
import { cleanRing, filletRing, outlineOf, type Pt } from '../src/panels/geom';
import { packDesign, unpackDesign } from '../src/panels/transport';
import { Wheel } from '../src/panels/wheel';

// The reference: the original Python generator (shapely + ezdxf) on the same typical 700c wheel.
const WHEEL = { size: '700c', erd: 600, rimWallR: 296 };
const PYTHON = {
  2: { arms: [84.35, 264.35], holes: 122, perBlade: null, sizeIn: [3.26, 23.77], mass: 78.7, sigma: 31.7, hub: 31.7, net: 35.3, sideClear: 11.5, plateGrid: 42 },
  3: { arms: [56.25, 176.25, 296.25], holes: 168, perBlade: [56, 56, 56], sizeIn: [18.25, 21.04], mass: 114.5, sigma: 16.0, hub: 14.7, net: 76.2, sideClear: 3.4, plateGrid: 48 },
  4: { arms: [39.4, 129.4, 219.4, 309.4], holes: 216, perBlade: [54, 54, 54, 54], sizeIn: [17.48, 17.48], mass: 142.7, sigma: 25.5, hub: 25.5, net: 44.0, sideClear: 11.5, plateGrid: 56 },
} as const;

const designs = new Map<number, PanelDesign>();
const design = (n: 2 | 3 | 4) => {
  if (!designs.has(n)) designs.set(n, designPanels(WHEEL, { strips: n }));
  return designs.get(n)!;
};

describe('wheel model', () => {
  it('laces 32 spokes 3-cross: unique flange holes, three crossings each, lengths near the formula', () => {
    const c = new Wheel().check();
    expect(c.leftFlangeHolesUnique).toBe(true);
    expect(c.rightCrossingsPerSpoke).toEqual([3]);
    const [lo, hi] = c.leftSpokeLenModel as number[];
    expect(Math.abs((lo + hi) / 2 - (c.leftSpokeLenFormula as number))).toBeLessThan(2);
  });
});

describe('outline geometry', () => {
  it('unions blades that share an edge exactly (two collinear blades at the hub)', () => {
    const blade: Pt[] = [[0, 28], [300, 13.5], [300, -13.5], [0, -28]];
    const other = blade.map(([x, y]) => [-x, -y] as Pt);
    const ring = cleanRing(outlineOf([blade, other]));
    expect(ring).toHaveLength(6); // a single hexagon: the shared edge is gone
  });

  it('fillets every corner with a true arc of the asked radius', () => {
    const { bulge, sampled } = filletRing([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
    expect(bulge).toHaveLength(8);
    expect(bulge.filter((p) => p[2]).map((p) => p[2].toFixed(4))).toEqual(Array(4).fill(Math.tan(Math.PI / 8).toFixed(4)));
    expect(Math.min(...sampled.map(([x]) => x))).toBeCloseTo(0, 6);
  });
});

describe('panel design (matches the Python generator)', () => {
  for (const n of [2, 3, 4] as const) {
    it(`${n} strips`, () => {
      const d = design(n), ref = PYTHON[n];
      const s = d.sides.LEFT.summary;
      expect(d.arms.map((a) => Math.round(a * 100) / 100)).toEqual(ref.arms);
      expect(d.identical).toBe(true);
      expect(s.holesTotal).toBe(ref.holes);
      expect(s.holesPerBlade).toEqual(ref.perBlade);
      expect(s.plateGridHoles).toBe(ref.plateGrid);
      expect(s.partSizeIn).toEqual(ref.sizeIn);
      expect(s.massG).toBeCloseTo(ref.mass, 1);
      expect(s.sigmaMaxMPa).toBeCloseTo(ref.sigma, 1);
      expect(s.sigmaHubSectionMPa).toBeCloseTo(ref.hub, 1);
      expect(s.netWidthAtHubMm).toBeCloseTo(ref.net, 1);
      expect(s.spokeClearance.tipsSideClearMm).toBeCloseTo(ref.sideClear, 1);
      // the same for every layout
      expect(s.ledsPerStrip).toBe(39);
      expect(s.holesPerRow).toBe(20);
      expect(s.gridShiftOutMm).toBe(2.41);
      expect(s.ledStartR).toBe(23);
      expect(s.ledEndR).toBe(293.9);
      expect(s.wCenter).toBe(56.1);
      expect(s.wTip).toBe(27);
      expect(s.flatArmEndRho).toBe(301.8);
      expect(s.bentArmEndR).toBe(298.4);
      expect(s.tipForceN).toBe(1.76);
      expect(s.plateLenHalfwidthMm).toEqual([50.38, 41.3]);
      expect(s.plateTaperMm).toBe(71.12);
      expect(s.plateTaperEndMm).toBe(121.5);
      expect(s.spokeClearance).toMatchObject({ seatMinGapMm: 1.06, armsMinGapMm: 2.31, tipsMinGapMm: null, collisionPoints: 0 });
      expect(s.forkClearance).toMatchObject({ minMm: 0.8, panelFaceMm: 6, ledStripMm: 0.8, governedBy: 'LED strip + tie band' });
      expect(s.room[270].panelToSpokes).toBe(-0.1);
      expect(d.tipSlot).toMatchObject({ widthMm: 5, depthMm: 3.69 });
      expect(d.tipsMeetAtZMm).toBe(0);
    });
  }

  it('centres one tip on a spoke when three even tips cannot all sit between spokes', () => {
    const d = design(3);
    expect(d.sandwich).toEqual({ bladeDeg: 56.25, rimHole: 5 });
    expect(d.sides.LEFT.summary.spokeClearance.sandwichedSpoke).toMatchObject({ rimHole: 5, spokeSide: 'R', spokeOffsetAtTiesMm: 1.82 });
  });

  it('warns once for both panels about the tight (typical) fork', () => {
    const w = design(2).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^Both panels: LED strip \+ tie band clears the \(typical\) fork by only 0.8 mm/);
  });

  it('reports plain data', () => {
    const r = JSON.parse(JSON.stringify(designReport(design(2))));
    expect(r.sides.LEFT.holesTotal).toBe(122);
    expect(r.simSettings).toMatchObject({ stripCount: 2, ledDensity: 144, stripStartMm: 23, stripLengthMm: 271 });
  });
});

describe('cut files', () => {
  it('writes one R12 DXF in inches: the outline, one closed polyline per hole, and the bore', () => {
    const d = design(4);
    const files = cutFiles(d);
    expect(files.map((f) => f.name)).toEqual(['700c_32h3x_4strips_g10_063_panel_QTY2_cut_in.dxf']);
    const text = files[0].text;
    expect(text).toMatch(/\$ACADVER\n {2}1\nAC1009/);
    expect(text).toMatch(/\$INSUNITS\n 70\n1\n/);
    expect(text.match(/\nPOLYLINE\n/g)).toHaveLength(1 + 216);
    expect(text.match(/\nCIRCLE\n/g)).toHaveLength(1);
    expect(text.trimEnd().endsWith('EOF')).toBe(true);
    // every coordinate on the sheet is positive, and the part is the reported size
    const xs: number[] = [], ys: number[] = [];
    const lines = text.split('\n');
    for (let i = 0; i + 1 < lines.length; i += 2) {
      if (lines[i].trim() === '10' && lines[i + 1] !== '0.0') xs.push(Number(lines[i + 1]));
      if (lines[i].trim() === '20' && lines[i + 1] !== '0.0') ys.push(Number(lines[i + 1]));
    }
    expect(Math.min(...xs, ...ys)).toBeGreaterThan(0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(17.48 - 0.05, 0);
    expect(cutDxf(d.sides.RIGHT)).toBe(text);
  });

  it('writes the reference drawing in mm with its layers', () => {
    const text = referenceDxf(design(2));
    expect(text).toMatch(/\$INSUNITS\n 70\n4\n/);
    for (const layer of ['OUTLINE', 'LED_STRIP', 'SENSOR_UNDER', 'NOTES']) expect(text).toContain(`\n${layer}\n`);
  });
});

describe('worker transport', () => {
  it('survives structured clone and rebuilds the helpers', () => {
    const d = design(3);
    const back = unpackDesign(structuredClone(packDesign(d)));
    const [a, b] = [d.sides.LEFT, back.sides.LEFT];
    for (const rho of [10, 100, 250, 301, 320]) {
      expect(b.m.planR(rho)).toBe(a.m.planR(rho));
      expect(b.m.zAtRho(rho)).toBe(a.m.zAtRho(rho));
      expect(b.g.hw(rho)).toBe(a.g.hw(rho));
    }
    expect(b.g.outline.contains([100, 0])).toBe(a.g.outline.contains([100, 0]));
    expect(back.wheel.spokes[5].at(0.5)).toEqual(d.wheel.spokes[5].at(0.5));
    expect(cutFiles(back)[0].text).toBe(cutFiles(d)[0].text);
  });
});

describe('shared settings', () => {
  it('designs from the simulator\'s settings, and points its strips at the panels', () => {
    const p = { ...defaultParams(), stripCount: 2 };
    const { wheel, panel } = panelInputs(p);
    expect(wheel).toMatchObject({ size: '700c', spokes: 32, crosses: 3, rimWallR: 289, erd: 586 });
    expect(panel).toMatchObject({ strips: 2, tipEndR: 298.45, sensor: true, sensorAll: false });
    const d = designPanels(wheel, panel);
    expect(d.rimNote).toMatch(/Rim wall assumed/); // the default rim is deeper than the measured tips allow
    applyToSim(p, d);
    expect(p).toMatchObject({ stripStartMm: 23, stripLengthMm: 271, autoLength: false, rimDepthMm: 9 });
    expect(derive(p).ledsPerStrip).toBe(d.sides.LEFT.summary.ledsPerStrip);
  });
});
