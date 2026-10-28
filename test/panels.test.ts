import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { derive } from '../src/sim/timing';
import { designPanels, designReport, holeSize, mirrorAxis, type PanelDesign, type SideResult, toPlan } from '../src/panels/design';
import { cutDxf, cutFiles, referenceDxf } from '../src/panels/dxf';
import { applyToSim, panelInputs } from '../src/panels/fromParams';
import { arcMerge, circlePts, cleanRing, filletRing, mirrorPt, outlineOf, pointSegDist, type Pt, rot } from '../src/panels/geom';
import { packDesign, unpackDesign } from '../src/panels/transport';
import { Wheel } from '../src/panels/wheel';

// The app's own settings (0.8 mm polypropylene), with the strip count changed.
const designs = new Map<string, PanelDesign>();
const design = (strips: number, more: Partial<ReturnType<typeof defaultParams>> = {}) => {
  const key = JSON.stringify([strips, more]);
  if (!designs.has(key)) {
    const { wheel, panel } = panelInputs({ ...defaultParams(), stripCount: strips, ...more });
    designs.set(key, designPanels(wheel, panel));
  }
  return designs.get(key)!;
};

/** Which side of the spoke's line (in plan) a point is on. */
const sideOf = (d: PanelDesign, spoke: number, p: Pt) => {
  const s = d.wheel.spokes[spoke];
  return Math.sign((s.b[0] - s.a[0]) * (p[1] - s.a[1]) - (s.b[1] - s.a[1]) * (p[0] - s.a[0]));
};
/** Distance from a hole's edge (in plan) to a spoke's surface. */
const holeToSpoke = (d: PanelDesign, s: SideResult, c: Pt, spoke: number) => {
  const sp = d.wheel.spokes[spoke], h = s.g.holes.find((x) => Math.hypot(x.c[0] - c[0], x.c[1] - c[1]) < 1e-9)!;
  return Math.min(...h.ring.pts.map((q) => pointSegDist(toPlan(s.sf, q), sp.a, sp.b))) - d.wheel.p.spokeD / 2;
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

  it('turns a disc drawn as chords back into true arcs of at most 90°', () => {
    const ring = cleanRing(outlineOf([circlePts(40), [[0, -5], [100, -5], [100, 5], [0, 5]]]));
    const merged = arcMerge(filletRing(ring, 2).bulge, 40);
    expect(merged.length).toBeLessThan(20);
    const arcs = merged.filter((p) => Math.abs(Math.hypot(p[0], p[1]) - 40) < 0.01 && p[2] > 0.01);
    expect(arcs.length).toBeGreaterThanOrEqual(4);
    for (const p of arcs) expect(p[2]).toBeLessThanOrEqual(Math.tan(Math.PI / 8) + 1e-9);
  });

  it('mirrors across an axis', () => {
    const [x, y] = mirrorPt([10, 0], 45);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(10, 9);
  });
});

describe('the surface the panel lies on', () => {
  it('dishes from the spoke heads at the hub to the rim, so the flat part is a little longer than its plan', () => {
    const s = design(2).sides.LEFT;
    expect(s.sf.zAt(20)).toBeCloseTo(35 + 1.4 + 2, 6); // the spoke heads on the flange's outer face
    expect(s.sf.zAt(150)).toBeLessThan(s.sf.zAt(60));
    expect(s.sf.zAt(290)).toBeLessThan(5);
    for (const r of [30, 100, 250]) {
      expect(s.sf.rhoOf(r)).toBeGreaterThan(r);
      expect(s.sf.rOf(s.sf.rhoOf(r))).toBeCloseTo(r, 6);
    }
    expect(s.summary.lengthOnSlopeMm).toBeGreaterThan(2);
    expect(s.summary.lengthOnSlopeMm).toBeLessThan(3);
  });
});

describe('spoke-tied panels', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} strips: evenly spaced blades, both edges tied, ties straddle their spokes, the strip ties apart`, () => {
      const d = design(n), pp = d.spec, h = holeSize(pp);
      expect(d.warnings).toEqual([]);
      expect(d.armSpacing).toBeCloseTo(360 / n, 9);
      for (const s of [d.sides.LEFT, d.sides.RIGHT]) {
        const sm = s.summary;
        expect(sm.tieGaps).toBe(0);
        expect(sm.longestSpanMm).toBeLessThanOrEqual(pp.tieSpan);
        expect(sm.tipOverhangMm).toBeLessThanOrEqual(pp.tipTieZone);
        expect(sm.maxEarMm).toBeLessThanOrEqual(pp.earMax);
        expect(sm.closeTies).toEqual([]);
        expect(sm.nippleHits).toEqual([]);
        expect(sm.valveClearMm).toBeGreaterThan(pp.valveClear);
        expect(sm.forkOk).toBe(true);
        // each edge of each blade is tied near the tip: a tab on that edge, or a tie across the whole blade
        s.g.arms.forEach((_, bi) => {
          for (const sg of [1, -1]) {
            const rs = s.spokeTies.filter((t) => t.blade === bi && (t.across || t.sg === sg)).map((t) => t.r);
            expect(Math.max(...rs)).toBeGreaterThanOrEqual(sm.tipR - pp.tipTieZone);
          }
        });
        // the disc reaches the outermost (interlaced) cross and is tied round its 8 crossings, but those under a strip
        expect(sm.discCross).toBe(3);
        expect(sm.discTies + sm.discTiesUnderStrips).toBe(8);
        expect(sm.discTies).toBeGreaterThanOrEqual(4);
        expect(sm.discTieR).toBeCloseTo(79.7, 1);
        for (const t of s.discTies) {
          const [a, b] = t.holes.map((q) => toPlan(s.sf, q));
          for (const sp of t.spokes) {
            expect(sideOf(d, sp, a)).toBe(-sideOf(d, sp, b));
            for (const q of t.holes) expect(holeToSpoke(d, s, q, sp)).toBeGreaterThanOrEqual(pp.spokeGap - 0.05);
          }
        }
        // spoke ties: a hole each side of the spoke, clear of it; beside the strip ties, or across the strip between LEDs
        for (const t of s.spokeTies) {
          const [a, b] = t.holes.map((q) => toPlan(s.sf, q));
          expect(sideOf(d, t.spoke, a)).toBe(-sideOf(d, t.spoke, b));
          for (const q of t.holes) expect(holeToSpoke(d, s, q, t.spoke)).toBeGreaterThanOrEqual(pp.spokeGap - 0.05);
          const e = t.holes.map((q) => rot(q, -s.g.arms[t.blade])[1]);
          if (t.across) {
            expect(Math.min(...e)).toBeLessThanOrEqual(-pp.stripW / 2 + 1e-6);
            expect(Math.max(...e)).toBeGreaterThanOrEqual(pp.stripW / 2 - 1e-6);
          } else expect(Math.min(...e.map(Math.abs))).toBeGreaterThan(pp.stripW / 2 + h + pp.gridEdge);
        }
        // every hole a gridEdge inside the outline, and none under the strip
        for (const hole of s.g.holes) {
          expect(s.g.outline.boundaryDist(hole.ring, pp.gridEdge)).toBeGreaterThanOrEqual(pp.gridEdge - 0.06);
          const lane = s.g.arms.some((a) => { const [x, y] = rot(hole.c, -a); return x > s.g.rhoLed0 && x < s.g.rhoLed1 && Math.abs(y) < pp.stripW / 2 - 1e-6; });
          expect(lane).toBe(false);
        }
        // the strip runs from just outside the bore to the tip
        expect(sm.ledStartR).toBeCloseTo(pp.boreD / 2 + pp.stripStartGap, 0);
        expect(sm.ledEndR).toBeGreaterThan(290);
        // a hall switch on the disc beside each strip, sensorGap clear of it, on two ties of its own
        expect(s.g.sensors.map((b) => b.blade)).toEqual(s.g.arms.map((_, i) => i));
        expect(sm.sensorsOnDisc).toBe(n);
        for (const b of s.g.sensors) {
          expect(Math.abs(b.e) - pp.sensorBody[0] / 2).toBeCloseTo(pp.stripW / 2 + pp.sensorGap, 6);
          const ties = s.g.holes.filter((x) => x.kind === 'sensor' && Math.hypot(...rot(x.c, -s.g.arms[b.blade]).map((v, k) => v - [b.rho, b.e][k])) < 15);
          expect(ties).toHaveLength(4);
          expect(new Set(ties.map((x) => x.tie)).size).toBe(2);
        }
        expect(sm.sensorFieldUT!).toBeLessThan(pp.sensorReleaseMT * 10); // under 1% of the switch's release point
        // a round wire hole in the disc by each strip's inner end, beside the strip
        const wires = s.g.holes.filter((x) => x.kind === 'wire');
        expect(wires).toHaveLength(n);
        for (const w of wires) {
          expect(w.d).toBe(pp.wireHoleD);
          expect(Math.hypot(...w.c) + pp.wireHoleD / 2 + pp.gridEdge).toBeLessThanOrEqual(s.g.rhoDisc + 1e-6);
          expect(Math.hypot(...w.c)).toBeLessThan(s.g.rhoLed0 + 20);
        }
        expect(sm.forkClearance.sensorFaceToForkMm).toBeGreaterThan(5);
        expect(sm.massG).toBeLessThan(12 * n + 15); // the disc is about 10 g
      }
    });
  }

  it('turns the blades so the two panels are mirror images when that costs no bigger tabs (3 strips on 36 spokes)', () => {
    const d = design(3, { spokes: 36 });
    expect(d.identical).toBe(true);
    const L = d.sides.LEFT.g, R = d.sides.RIGHT.g, axis = mirrorAxis(d.wheel)!;
    expect(R.holes).toHaveLength(L.holes.length);
    // every right hole is a left hole mirrored (across the axis that swaps the two sides' spokes)
    for (const hole of R.holes) {
      const m = mirrorPt(hole.c, axis);
      expect(Math.min(...L.holes.map((x) => Math.hypot(x.c[0] - m[0], x.c[1] - m[1])))).toBeLessThan(1e-6);
    }
  });

  it('ties across the strip where no tab of its own reaches a spoke, holding both edges, and leaves out the strip ties beside it', () => {
    const d = design(2);
    const s = [d.sides.LEFT, d.sides.RIGHT].find((x) => x.spokeTies.some((t) => t.across))!;
    const across = s.spokeTies.filter((t) => t.across);
    expect(across.length).toBeGreaterThan(0);
    const full = Math.max(...d.sides.LEFT.summary.stripTiesPerBlade, ...d.sides.RIGHT.summary.stripTiesPerBlade);
    expect(s.summary.stripTiesPerBlade[across[0].blade]).toBeLessThan(full);
  });

  it('designs every common lacing, every edge tied', () => {
    for (const [spokes, crosses] of [[24, 3], [28, 3], [32, 0], [32, 1], [32, 2], [32, 4], [36, 0], [36, 2], [36, 3], [36, 4]]) {
      const d = design(2, { spokes, spokeCrosses: crosses });
      expect(d.sides.LEFT.summary.tieGaps + d.sides.RIGHT.summary.tieGaps, `${spokes} spokes ${crosses}-cross`).toBe(0);
      expect(d.sides.LEFT.summary.discCross).toBe(crosses); // the outermost cross
      expect(d.sides.LEFT.summary.discTies, `${spokes} spokes ${crosses}-cross`).toBeGreaterThan(0);
    }
  });

  it('ties a radially laced disc straight to its spokes', () => {
    const s = design(2, { spokeCrosses: 0 }).sides.LEFT;
    expect(s.discTies.length).toBeGreaterThan(0);
    for (const t of s.discTies) {
      expect(t.spokes[0]).toBe(t.spokes[1]);
      const [a, b] = t.holes.map((q) => toPlan(s.sf, q));
      expect(sideOf(design(2, { spokeCrosses: 0 }), t.spokes[0], a)).toBe(-sideOf(design(2, { spokeCrosses: 0 }), t.spokes[0], b));
    }
  });

  it('designs every strip count the simulator has, and names the ones that suit the wheel when a blade can\'t be tied', () => {
    for (const n of [5, 6]) expect(design(n).arms).toHaveLength(n);
    const d = design(3, { panelTabMaxMm: 20 });
    expect(d.warnings.some((w) => /can't be tied to a spoke within 20 mm.*2, 4 strips on 32 spokes/.test(w))).toBe(true);
  });

  it('stops the blades short of the nipples instead of slotting them', () => {
    const slotted = design(3), short = design(3, { panelTipSlot: 'none' });
    expect(slotted.sides.LEFT.summary.nippleSlots).toBeGreaterThan(0);
    expect(short.sides.LEFT.summary.nippleSlots).toBe(0);
    expect(short.sides.LEFT.summary.tipR).toBeLessThan(short.wheel.nippleTipR());
    expect(short.sides.LEFT.summary.nippleHits).toEqual([]);
  });

  it('reports plain data', () => {
    const r = JSON.parse(JSON.stringify(designReport(design(2))));
    expect(r.sides.LEFT.spokeTies[0]).toHaveProperty('bladeDeg');
    expect(r.simSettings).toMatchObject({ stripCount: 2, ledDensity: 144, stripStartMm: 22, stripLengthMm: 272 });
  });
});

describe('cut files', () => {
  it('writes one R12 DXF in inches for mirror-image panels: the outline (the disc as true arcs), one closed polyline per hole, and the bore', () => {
    const d = design(3, { spokes: 36 });
    const files = cutFiles(d);
    expect(files.map((f) => f.name)).toEqual(['700c_36h3x_3strips_pp_08_panel_QTY2_cut_in.dxf']);
    const text = files[0].text;
    expect(text).toMatch(/\$ACADVER\n {2}1\nAC1009/);
    expect(text).toMatch(/\$INSUNITS\n 70\n1\n/);
    expect(text.match(/\nPOLYLINE\n/g)).toHaveLength(1 + d.sides.LEFT.g.holes.length);
    expect(text.match(/\nCIRCLE\n/g)).toHaveLength(1);
    expect(d.sides.LEFT.g.outlineBulge.length).toBeLessThan(400); // not hundreds of chords round the disc
    expect(text.trimEnd().endsWith('EOF')).toBe(true);
    // every coordinate on the sheet is positive, and the part is the reported size
    const xs: number[] = [], ys: number[] = [];
    const lines = text.split('\n');
    for (let i = 0; i + 1 < lines.length; i += 2) {
      if (lines[i].trim() === '10' && lines[i + 1] !== '0.0') xs.push(Number(lines[i + 1]));
      if (lines[i].trim() === '20' && lines[i + 1] !== '0.0') ys.push(Number(lines[i + 1]));
    }
    expect(Math.min(...xs, ...ys)).toBeGreaterThan(0);
    const [w, l] = d.sides.LEFT.summary.partSizeIn;
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(w, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(l, 0);
  });

  it('writes a LEFT and a RIGHT file when the panels differ', () => {
    const d = design(2);
    expect(d.identical).toBe(false);
    expect(cutFiles(d).map((f) => f.name)).toEqual(['700c_32h3x_2strips_pp_08_LEFT_cut_in.dxf', '700c_32h3x_2strips_pp_08_RIGHT_cut_in.dxf']);
    expect(cutDxf(d.sides.RIGHT)).not.toBe(cutDxf(d.sides.LEFT));
  });

  it('writes the reference drawing in mm with its layers', () => {
    const text = referenceDxf(design(2));
    expect(text).toMatch(/\$INSUNITS\n 70\n4\n/);
    for (const layer of ['OUTLINE', 'LED_STRIP', 'SENSOR_UNDER', 'SPOKES', 'NOTES']) expect(text).toContain(`\n${layer}\n`);
  });
});

describe('worker transport', () => {
  it('survives structured clone and rebuilds the helpers', () => {
    const d = design(3);
    const back = unpackDesign(structuredClone(packDesign(d)));
    const [a, b] = [d.sides.LEFT, back.sides.LEFT];
    for (const r of [10, 100, 250, 301, 320]) {
      expect(b.sf.zAt(r)).toBe(a.sf.zAt(r));
      expect(b.sf.rhoOf(r)).toBe(a.sf.rhoOf(r));
      expect(b.sf.rOf(r)).toBe(a.sf.rOf(r));
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
    expect(panel).toMatchObject({ strips: 2, material: 'pp_08', tipEndR: 298.45, discCross: 0, sensorGap: 12 });
    const d = designPanels(wheel, panel);
    expect(d.rimNote).toMatch(/Rim wall assumed/); // the default rim is deeper than the measured tips allow
    applyToSim(p, d);
    expect(p).toMatchObject({ stripStartMm: 22, stripLengthMm: 272, autoLength: false, rimDepthMm: 9 });
    expect(derive(p).ledsPerStrip).toBe(d.sides.LEFT.summary.ledsPerStrip);
  });
});
