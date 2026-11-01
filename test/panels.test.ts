import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/params';
import { derive } from '../src/sim/timing';
import { designPanels, designReport, holeSize, mirrorAxes, type PanelDesign, shapeContains, type SideResult } from '../src/panels/design';
import { cutDxf, cutFiles, referenceDxf } from '../src/panels/dxf';
import { ledSpanOf, panelInputs } from '../src/panels/fromParams';
import { adiff, arcMerge, boreContour, circlePts, cleanRing, dist, filletRing, mirrorPt, outlineOf, pmod, pointSegDist, pol, type Pt, rot, sampleBulge } from '../src/panels/geom';
import { packDesign, unpackDesign } from '../src/panels/transport';
import { design } from './panelDesign';
import { Wheel } from '../src/panels/wheel';


/** Which side of the spoke's line (in plan) a point is on. */
const sideOf = (d: PanelDesign, spoke: number, p: Pt) => {
  const s = d.wheel.spokes[spoke];
  return Math.sign((s.b[0] - s.a[0]) * (p[1] - s.a[1]) - (s.b[1] - s.a[1]) * (p[0] - s.a[0]));
};
/** Distance from a hole's edge to a spoke's surface. */
const holeToSpoke = (d: PanelDesign, s: SideResult, c: Pt, spoke: number) => {
  const sp = d.wheel.spokes[spoke], h = s.g.holes.find((x) => Math.hypot(x.c[0] - c[0], x.c[1] - c[1]) < 1e-9)!;
  return Math.min(...h.ring.pts.map((q) => pointSegDist(q, sp.a, sp.b))) - d.wheel.p.spokeD / 2;
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
  it('dishes from the spoke heads at the hub to the rim (for the clearances; the part is laid out as on the wheel)', () => {
    const s = design(2).sides.LEFT;
    expect(s.sf.zAt(20)).toBeCloseTo(35 + 1.4 + 2, 6); // the spoke heads on the flange's outer face
    expect(s.sf.zAt(150)).toBeLessThan(s.sf.zAt(60));
    expect(s.sf.zAt(290)).toBeLessThan(5);
    expect(s.g.rhoEnd).toBeCloseTo(298.45, 6); // the tip radius on the wheel
  });
});

describe('spoke-tied panels', () => {
  for (const n of [1, 2, 3, 4]) {
    it(`${n} strips: evenly spaced blades, both edges tied, ties straddle their spokes, the strip ties apart`, () => {
      const d = design(n), pp = d.spec, h = holeSize(pp);
      expect(d.warnings).toEqual([]);
      expect(d.armSpacing).toBeCloseTo(360 / n, 9);
      // the panels are mirror images: blades a quarter of a spoke gap off the spokes on both sides (with 3
      // strips, one blade there and the other two either side of it)
      expect(d.identical).toBe(true);
      const quarter = d.arms.filter((a) => Math.abs(pmod(a - 360 / 64 + 0.01, 360 / 32) - 0.01) < 1e-6);
      expect(quarter).toHaveLength(n === 3 ? 1 : n);
      expect(d.sides.RIGHT.summary.maxEarMm).toBe(d.sides.LEFT.summary.maxEarMm);
      expect([...d.sides.RIGHT.summary.spokeTiesPerBlade].sort()).toEqual([...d.sides.LEFT.summary.spokeTiesPerBlade].sort());
      for (const s of [d.sides.LEFT, d.sides.RIGHT]) {
        const sm = s.summary;
        expect(sm.tieGaps).toBe(0);
        expect(sm.longestSpanMm).toBeLessThanOrEqual(pp.tieSpan);
        expect(sm.tipOverhangMm).toBeLessThanOrEqual((n === 3 ? 1.5 : 1) * pp.tipTieZone); // 3 strips: a tab a little farther in, not a tie over the strip
        expect(sm.maxEarMm).toBeLessThanOrEqual(pp.earMax);
        expect(sm.closeTies).toEqual([]);
        expect(sm.nippleHits).toEqual([]);
        expect(sm.valveClearMm).toBeGreaterThan(pp.valveClear);
        expect(sm.forkOk).toBe(true);
        // each edge of each blade has tabs of its own, one near the tip
        s.g.arms.forEach((_, bi) => {
          for (const sg of [1, -1]) {
            const own = s.spokeTies.filter((t) => t.blade === bi && !t.over && t.sg === sg).map((t) => t.r);
            const held = s.spokeTies.filter((t) => t.blade === bi && (t.over || t.sg === sg)).map((t) => t.r);
            expect(own.length).toBeGreaterThanOrEqual(2);
            expect(held).toEqual(own);
            expect(Math.max(...own)).toBeGreaterThanOrEqual(sm.tipR - (n === 3 ? 1.5 : 1) * pp.tipTieZone);
          }
        });
        expect(s.spokeTies.filter((t) => t.over)).toEqual([]);
        // the disc reaches the outermost (interlaced) cross and is tied round its 8 crossings, but those under a strip
        expect(sm.discCross).toBe(3);
        expect(sm.discTies + sm.discTiesUnderStrips).toBe(8);
        expect(sm.discTies).toBeGreaterThanOrEqual(4);
        expect(sm.discTieR).toBeCloseTo(79.7, 1);
        for (const t of s.discTies) {
          const [a, b] = t.holes.map((q) => q);
          for (const sp of t.spokes) {
            expect(sideOf(d, sp, a)).toBe(-sideOf(d, sp, b));
            for (const q of t.holes) expect(holeToSpoke(d, s, q, sp)).toBeGreaterThanOrEqual(pp.spokeGap - 0.05);
          }
        }
        // spoke ties: a hole each side of the spoke, clear of it, and every hole clear of the strip's ties (so
        // the strips go on first); a tie over the strip has a hole on each edge
        for (const t of s.spokeTies) {
          const [a, b] = t.holes.map((q) => q);
          expect(sideOf(d, t.spoke, a)).toBe(-sideOf(d, t.spoke, b));
          for (const q of t.holes) expect(holeToSpoke(d, s, q, t.spoke)).toBeGreaterThanOrEqual(pp.spokeGap - 0.05);
          const e = t.holes.map((q) => rot(q, -s.g.arms[t.blade])[1]);
          expect(Math.min(...e.map(Math.abs))).toBeGreaterThan(pp.stripW / 2 + h + pp.gridEdge);
          if (t.over) expect(Math.sign(e[0])).toBe(-Math.sign(e[1]));
        }
        // every hole a gridEdge inside the outline, and none under the strip
        for (const hole of s.g.holes) {
          expect(s.g.outline.boundaryDist(hole.ring, pp.gridEdge)).toBeGreaterThanOrEqual(pp.gridEdge - 0.06);
          const lane = s.g.arms.some((a) => { const [x, y] = rot(hole.c, -a); return x > s.g.rhoLed0 && x < s.g.rhoLed1 && Math.abs(y) < pp.stripW / 2 - 1e-6; });
          expect(lane).toBe(false);
        }
        // the strip is laid from the tip in, whole pixels, stopping outside the panels' limit (30 mm),
        // one half metre at most: its outermost LED is as far out as it goes
        expect(sm.ledEndR - sm.ledStartR).toBeCloseTo(sm.ledsPerStrip * pp.ledPitch, 0);
        expect(sm.ledStartR).toBeGreaterThanOrEqual(30);
        expect(sm.ledStartR).toBeLessThan(30 + pp.ledPitch);
        expect(sm.ledsPerStrip).toBeLessThanOrEqual(72);
        expect(sm.ledEndR).toBeGreaterThan(290);
        // a hall switch per strip on the disc, midway between strips, all at one radius, on two ties of its own
        expect(s.g.sensors.map((b) => b.blade)).toEqual(s.g.arms.map((_, i) => i));
        expect(sm.sensorsOnDisc).toBe(n);
        expect(new Set(s.g.sensors.map((b) => b.rho)).size).toBe(1);
        for (const b of s.g.sensors) {
          expect(adiff(b.a, s.g.arms[b.blade] + 180 / n)).toBeLessThan(1e-6);
          const ties = s.g.holes.filter((x) => x.kind === 'sensor' && dist(x.c, pol(b.rho, b.a)) < 15);
          expect(ties).toHaveLength(4);
          expect(new Set(ties.map((x) => x.tie)).size).toBe(2);
          // near the disc's edge: nothing but disc ties between it and the edge
          expect(b.rho).toBeGreaterThan(s.g.rhoDisc - 30);
        }
        expect(sm.sensorFieldUT!).toBeLessThan(pp.sensorReleaseMT * 10); // under 1% of the switch's release point
        // a wire slot in the disc from just inside each hall sensor's leads, on its centre line, in to the bore
        const wires = s.g.holes.filter((x) => x.kind === 'wire');
        expect(wires).toHaveLength(n);
        expect(pp.wireHoleD).toBe(10);
        for (const b of s.g.sensors) {
          const w = wires.find((x) => dist(x.c, pol(b.rho, b.a)) < 35)!;
          expect(w.d).toBe(pp.wireHoleD);
          expect(w.slot).toBe(true);
          expect(s.g.bore.ring.contains(pol(pp.boreD / 2 + 1, Math.atan2(w.c[1], w.c[0]) * 180 / Math.PI))).toBe(true); // open into the bore
          expect(shapeContains(s.g, pol(Math.hypot(...w.c) - 5, Math.atan2(w.c[1], w.c[0]) * 180 / Math.PI))).toBe(false);
          expect(Math.hypot(...w.c) + pp.wireHoleD / 2 + pp.gridEdge).toBeLessThanOrEqual(s.g.rhoDisc + 1e-6);
          const [x, e] = rot(w.c, -b.a);
          expect(Math.abs(e)).toBeLessThan(1e-6);
          expect(x + pp.wireHoleD / 2).toBeLessThan(b.rho - pp.sensorBody[1] / 2 - pp.sensorLeads);
          expect(x + pp.wireHoleD / 2).toBeGreaterThan(b.rho - pp.sensorBody[1] / 2 - pp.sensorLeads - 5);
        }
        expect(sm.forkClearance.sensorFaceToForkMm).toBeGreaterThan(5);
        expect(sm.massG).toBeLessThan(12 * n + 15); // the disc is about 15 g, a blade with its tabs about 10 g
      }
    });
  }

  it('turns the blades so the two panels are mirror images when that costs no bigger tabs (3 strips on 36 spokes)', () => {
    const d = design(3, { spokes: 36 });
    expect(d.identical).toBe(true);
    const L = d.sides.LEFT.g, R = d.sides.RIGHT.g;
    expect(R.holes).toHaveLength(L.holes.length);
    // every right hole is a left hole mirrored (across the axis that swaps the two sides' spokes)
    const near = (axis: number) => R.holes.every((hole) => {
      const m = mirrorPt(hole.c, axis);
      return Math.min(...L.holes.map((x) => Math.hypot(x.c[0] - m[0], x.c[1] - m[1]))) < 1e-6;
    });
    expect(mirrorAxes(d.wheel).some(near)).toBe(true);
  });

  it('ties over the strip only where a spoke runs under it and no tab reaches another, and keeps every strip tie', () => {
    const d = design(3, { spokes: 28 });
    const s = [d.sides.LEFT, d.sides.RIGHT].find((x) => x.spokeTies.some((t) => t.over))!;
    const over = s.spokeTies.filter((t) => t.over);
    expect(over).toHaveLength(1);
    // it sits at a pixel gap between strip ties, and the strip tie next to it stays
    const near = s.g.stripTieRhos[over[0].blade].map((r) => Math.abs(r - over[0].r));
    expect(Math.min(...near)).toBeCloseTo(d.spec.ledPitch, 0);
  });

  it('ties a radially laced disc straight to its spokes', () => {
    const s = design(2, { spokeCrosses: 0 }).sides.LEFT;
    expect(s.discTies.length).toBeGreaterThan(0);
    for (const t of s.discTies) {
      expect(t.spokes[0]).toBe(t.spokes[1]);
      const [a, b] = t.holes.map((q) => q);
      expect(sideOf(design(2, { spokeCrosses: 0 }), t.spokes[0], a)).toBe(-sideOf(design(2, { spokeCrosses: 0 }), t.spokes[0], b));
    }
  });

  it('designs every strip count the simulator has, and names the ones that suit the wheel when a blade can\'t be tied', () => {
    for (const n of [1, 2, 3, 4]) expect(design(n).arms).toHaveLength(n);
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
  });
});

describe('bore', () => {
  it('reaches out to just inside the strips\' inner ends, never smaller than the hub needs', () => {
    const d = design(4);
    const sm = d.sides.LEFT.summary;
    expect(d.spec.boreD / 2).toBeCloseTo(sm.ledStartR - d.spec.boreToStrip, 0);
    expect(d.spec.boreD).toBeGreaterThan(d.spec.boreMinD);
    expect(d.sides.LEFT.g.rBore).toBeCloseTo(d.spec.boreD / 2, 6);
    // a bigger hub: the strips start outside it, and the bore again reaches to just inside them
    const big = design(4, { panelBoreMm: 80 });
    expect(big.sides.LEFT.summary.ledStartR).toBeGreaterThanOrEqual(40 + big.spec.stripStartGap);
    expect(big.spec.boreD).toBeGreaterThanOrEqual(80);
    expect(big.spec.boreD / 2).toBeCloseTo(big.sides.LEFT.summary.ledStartR - big.spec.boreToStrip, 0);
  });
});

describe('bore with slots', () => {
  it('is one closed outline: the bore, each slot round at its outer end, filleted where it meets the bore', () => {
    const R = 19.05, w = 10, f = 2;
    const slots = [45, 135, 225, 315].map((a) => ({ c: pol(54, a), d: w }));
    const pts = sampleBulge(boreContour(R, slots, f), 2);
    const area = Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2);
    // the bore plus four slots (rectangle out to the end's centre plus a half disc), less the bore's
    // part of each slot, plus the fillets' small corners
    const inBore = R * R * Math.asin(w / 2 / R) + (w / 2) * Math.sqrt(R * R - (w / 2) ** 2);
    const slot = w * (54 - Math.sqrt(R * R - (w / 2) ** 2)) + (Math.PI * (w / 2) ** 2) / 2;
    expect(area).toBeGreaterThan(Math.PI * R * R + 4 * slot - 4 * (inBore - w * Math.sqrt(R * R - (w / 2) ** 2)) - 1);
    expect(area).toBeLessThan(Math.PI * R * R + 4 * slot + 4 * 2 * f * f);
    // the outer ends reach r 59 (54 + half the width), every point at least the bore's radius out
    expect(Math.max(...pts.map((p) => Math.hypot(...p)))).toBeCloseTo(59, 1);
    expect(Math.min(...pts.map((p) => Math.hypot(...p)))).toBeGreaterThan(R - 1e-6);
    // no slots: the plain circle
    expect(boreContour(R, [], f)).toEqual([[R, 0, 1], [-R, 0, 1]]);
  });
});

describe('cut files', () => {
  it('writes one R12 DXF in inches for mirror-image panels: the outline (the disc as true arcs), one closed polyline per hole, and the bore with its wire slots', () => {
    const d = design(3, { spokes: 36 });
    const files = cutFiles(d);
    expect(files.map((f) => f.name)).toEqual(['700c_36h3x_3strips_pp_08_panel_QTY2_cut_in.dxf']);
    const text = files[0].text;
    expect(text).toMatch(/\$ACADVER\n {2}1\nAC1009/);
    expect(text).toMatch(/\$INSUNITS\n 70\n1\n/);
    const g = d.sides.LEFT.g, slots = g.holes.filter((h) => h.slot).length;
    expect(slots).toBe(3);
    // the slots are cut with the bore, as one outline: no circle for it
    expect(text.match(/\nPOLYLINE\n/g)).toHaveLength(1 + g.holes.length - slots + 1);
    expect(text.match(/\nCIRCLE\n/g)).toBeNull();
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
    const d = design(2, { spokes: 20, spokeCrosses: 2 });
    expect(d.identical).toBe(false);
    expect(cutFiles(d).map((f) => f.name)).toEqual(['700c_20h2x_2strips_pp_08_LEFT_cut_in.dxf', '700c_20h2x_2strips_pp_08_RIGHT_cut_in.dxf']);
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
    }
    expect(b.g.outline.contains([100, 0])).toBe(a.g.outline.contains([100, 0]));
    expect(back.wheel.spokes[5].at(0.5)).toEqual(d.wheel.spokes[5].at(0.5));
    expect(cutFiles(back)[0].text).toBe(cutFiles(d)[0].text);
  });
});

describe('shared settings', () => {
  it('designs from the simulator\'s settings, and puts the LEDs where the simulator draws them', () => {
    const p = { ...defaultParams(), stripCount: 2 };
    const { wheel, panel } = panelInputs(p);
    expect(wheel).toMatchObject({ size: '700c', spokes: 32, crosses: 3, rimWallR: 302, erd: 612 });
    expect(panel).toMatchObject({ strips: 2, material: 'pp_08', tipEndR: 298.45, discCross: 0, stripStartR: 30 });
    const d = designPanels(wheel, panel);
    expect(d.rimNote).toBe(''); // the default rim is the one the measured tips imply
    // one rule places the LEDs for both: 38 a strip, from just outside 30 mm to 2 mm inside the tip
    const sd = derive(p), L = d.sides.LEFT.summary;
    expect(sd.ledsPerStrip).toBe(38);
    expect(L.ledsPerStrip).toBe(38);
    expect(sd.rStart * 1000).toBeCloseTo(L.ledStartR, 0);
    expect(sd.rEnd * 1000).toBeCloseTo(L.ledEndR, 0);
    // a deeper rim: the panels assume one just outside the measured tips, and say so
    const q = { ...p, rimDepthMm: 22 };
    const e = designPanels(panelInputs(q).wheel, panelInputs(q).panel);
    expect(e.rimNote).toMatch(/Rim wall assumed/);
    expect(ledSpanOf(q).rimNote).toBe(e.rimNote);
    expect(derive(q).ledsPerStrip).toBe(e.sides.LEFT.summary.ledsPerStrip);
  });
});
